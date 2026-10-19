import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticResponse } from "../adapters/node/static.mjs";
import { createGame } from "../lib/game.mjs";
import { commandWithTradeResult as command } from "../lib/trade-command.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright-core",
);
const output =
  process.env.MN_BROWSER_OUTPUT || join(tmpdir(), "nusa-trade-4116");
await mkdir(output, { recursive: true });
const checks = [],
  errors = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let response =
    url.pathname === "/api/bot"
      ? Response.json({ configured: false })
      : url.pathname === "/api/online"
        ? Response.json({ online: false })
        : await staticResponse(new Request(url));
  response ||= new Response("Not found", { status: 404 });
  if (url.pathname === "/frontend/app.mjs")
    response = new Response(
      (await response.text()) + "\nexport { session, ui, open, queueRender };",
      { headers: { "Content-Type": "text/javascript" } },
    );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const fixture = () => {
  const s = createGame(
    {
      startingRoll: false,
      matchId: crypto.randomUUID(),
      players: ["Ayu", "Bima", "Sari"].map((name) => ({
        name,
        controller: "human",
      })),
    },
    () => 0.2,
  );
  s.assets[1].owner = 0;
  s.assets[31].owner = 1;
  return s;
};
const deal = {
  to: 1,
  give: [1],
  take: [31],
  giveCash: 200,
  takeCash: 500,
  giveCards: 0,
  takeCards: 0,
};
const act = (s, actor, type, extra = {}) =>
  command(
    s,
    actor,
    {
      type,
      ...extra,
      id: crypto.randomUUID(),
      expectedVersion: s.version,
    },
    () => 0.2,
  );
async function mount(page, state, { seat = 0, online = false } = {}) {
  await page.evaluate(
    async ({ state, seat, online }) => {
      const app = await import(
        document.querySelector('script[type="module"]').src
      );
      window.qa = app;
      app.session.persist = async () => {};
      app.session.screen = "gameplay";
      app.session.hidden = false;
      app.session.reduced = true;
      app.session.room = online
        ? { code: "TRADE123", seat, userId: "qa" }
        : null;
      app.session.online = online
        ? {
            code: "TRADE123",
            seat,
            host: 0,
            status: "playing",
            held: false,
            roomRevision: 0,
            seats: state.players.map((p) => ({
              ...p,
              connected: true,
              ready: true,
            })),
          }
        : null;
      app.session.connected = online;
      app.session.auth = { session: () => ({ user: { id: "qa" } }) };
      app.session.ingest(state, { reset: true });
      app.session.notify();
    },
    { state, seat, online },
  );
  await page.locator(".board-stage").waitFor();
}
async function bounds(page, width, height) {
  const box = await page.locator("dialog[open]").boundingBox();
  assert(
    box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= width + 1 &&
      box.y + box.height <= height + 1,
    JSON.stringify(box),
  );
  await page.locator(".popup-dismiss").scrollIntoViewIfNeeded();
  assert(await page.locator(".popup-dismiss").isVisible());
  assert.equal(
    await page.locator("dialog").getAttribute("data-density"),
    "compact",
  );
  assert.equal(await page.locator(".popup-dismiss").innerText(), "Tutup");
}
try {
  browser = await chromium.launch({
    executablePath: process.env.MN_CHROMIUM_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  for (const [width, height, online] of [
    [320, 568, false],
    [390, 844, true],
    [844, 390, true],
    [1280, 800, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    const s = fixture(),
      done = act(act(s, 0, "OFFER", { trade: deal }), 1, "TRADE_ACCEPT");
    await mount(page, s, { online });
    await page.evaluate((done) => {
      qa.session.ingest(done);
      qa.session.notify();
    }, done);
    await page.locator('dialog[data-kind="tradeResult"][open]').waitFor();
    await bounds(page, width, height);
    const sides = page.locator(".trade-result-side");
    assert((await sides.nth(0).innerText()).includes("Makassar"));
    assert((await sides.nth(1).innerText()).includes("Bogor"));
    assert.equal(await page.locator("dialog button[data-type]").count(), 0);
    // A result remains until the same shared Tutup control is used.
    await page.waitForTimeout(3400);
    assert(
      await page.locator('dialog[data-kind="tradeResult"][open]').isVisible(),
    );
    const stateBefore = await page.evaluate(() =>
      JSON.stringify(qa.session.state),
    );
    await page.screenshot({
      path: join(output, `accepted-${width}x${height}.png`),
    });
    await page.reload({ waitUntil: "networkidle" });
    await mount(page, done, { online });
    await page.locator('dialog[data-kind="tradeResult"][open]').waitFor();
    await page.locator(".popup-dismiss").click();
    assert.equal(
      await page.evaluate(() => JSON.stringify(qa.session.state)),
      stateBefore,
    );
    await page.reload({ waitUntil: "networkidle" });
    await mount(page, done, { online });
    assert.equal(
      await page.locator('dialog[data-kind="tradeResult"][open]').count(),
      0,
    );
    checks.push({
      name: `${width}x${height}: confirmed details, no timer, refresh/read-once, existing shell, read-only close`,
      passed: true,
    });
    await context.close();
  }
  for (const [actor, type, title] of [
    [1, "TRADE_ACCEPT", "Barter berhasil"],
    [1, "TRADE_REJECT", "Tawaran barter ditolak"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    const s = fixture(),
      offered = act(s, 0, "OFFER", { trade: deal }),
      done = act(offered, actor, type);
    await mount(page, offered, { seat: 1, online: true });
    await page.evaluate((done) => {
      qa.open({ kind: "tradeIncoming" });
      qa.session.auth.request = async () => ({
        ...qa.session.online,
        state: done,
        roomRevision: 1,
      });
    }, done);
    await page.locator(`[data-type="${type}"]`).click();
    await page.locator('dialog[data-kind="tradeResult"][open]').waitFor();
    assert((await page.locator(".popup-header").innerText()).includes(title));
    if (type === "TRADE_ACCEPT")
      assert(
        (await page.locator(".trade-result-side").nth(0).innerText()).includes(
          "Bogor",
        ),
      );
    assert.equal(
      await page.evaluate(() => qa.session.tradeResults.queue.length),
      1,
      "closing the offer must not silently dismiss the result",
    );
    await page.locator(".popup-dismiss").click();
    assert.equal(
      await page.evaluate(() => qa.session.tradeResults.queue.length),
      0,
    );
    checks.push({
      name: `actual manual incoming ${type}: result survives action handler and uses recipient perspective`,
      passed: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      {
        checks,
        errors,
        limits: [
          "Online HTTP/state transport is a test double; no live project or database was contacted.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  JSON.stringify({
    checks: checks.length,
    passed: checks.every((c) => c.passed),
    output,
  }),
);
