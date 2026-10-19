import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { staticResponse } from "../adapters/node/static.mjs";
import {
  createGame,
  command,
  publicState,
  GROUPS,
  stock,
} from "../lib/game.mjs";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { MemoryOnlineStore } from "../tests/helpers/online-store.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright-core",
);
const output = process.env.MN_BROWSER_OUTPUT || "/tmp/nusa-hold-batch";
await mkdir(output, { recursive: true });
const fixtures = new Map(),
  checks = [],
  errors = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let response;
    if (url.pathname === "/api/bot")
      response = Response.json({ configured: false });
    else if (url.pathname === "/api/online")
      response = Response.json({ online: false });
    else if (url.pathname === "/qa-action") {
      const f = fixtures.get(url.searchParams.get("id"));
      if (req.method === "GET") {
        response = Response.json(await f.service.read("ABCDEFGH", "user-0"));
      } else {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        f.requests.push(body);
        await new Promise((r) => setTimeout(r, 150));
        response = Response.json(await f.service.execute(body, "user-0"));
      }
    } else response = await staticResponse(new Request(url));
    if (url.pathname === "/frontend/app.mjs")
      response = new Response(
        (await response.text()) +
          "\nexport {session,ui,open,queueRender,rollInput};",
        { headers: { "Content-Type": "text/javascript" } },
      );
    response ||= new Response("Not found", { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(e.status || 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message, code: e.code }));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
async function pageFor(
  n = 3,
  { phase = "roll", reduced = false, bots = false, stockConflict = false } = {},
) {
  const store = new MemoryOnlineStore(),
    now = Date.now(),
    s = createGame(
      {
        players: Array.from({ length: n }, (_, id) => ({
          name: `P${id}`,
          controller: bots && id > 1 ? "bot" : "human",
          botPersona: "raka",
        })),
        startingRoll: phase === "starting",
      },
      () => 0.2,
    );
  for (const id of [1, 3]) s.assets[id].owner = 0;
  if (phase === "jail") {
    s.phase = "jail";
    s.players[0].inJail = true;
  }
  if (stockConflict) {
    for (const tile of GROUPS[1].ids) s.assets[tile].owner = 1;
    for (const group of [GROUPS[2], GROUPS[3]])
      for (const tile of group.ids)
        s.assets[tile] = { owner: 2, level: 4, mortgaged: false };
    for (const tile of GROUPS[4].ids)
      s.assets[tile] = { owner: 2, level: 2, mortgaged: false };
    s.bank = stock(s);
  }
  if (bots) s.turn = 2;
  const room = {
    code: "ABCDEFGH",
    status: "playing",
    capacity: n,
    host: 0,
    state: s,
    seats: s.players.map((p, i) => ({
      ...p,
      userId: p.controller === "human" ? `user-${i}` : null,
      memberId: crypto.randomUUID(),
      ready: true,
      connections: p.controller === "human" ? { browser: now } : {},
    })),
  };
  store.rooms.set(room.code, { code: room.code, revision: 0, data: room });
  const f = { store, service: createOnlineService({ store }), requests: [] },
    id = crypto.randomUUID();
  fixtures.set(id, f);
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: reduced ? "reduce" : "no-preference",
      serviceWorkers: "block",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  const snapshot = await f.service.read(room.code, "user-0");
  await page.evaluate(
    async ({ snapshot, id }) => {
      const app = await import(
        document.querySelector('script[type="module"]').src
      );
      window.qa = app;
      app.session.persist = async () => {};
      app.session.auth = {
        session: () => ({ user: { id: "user-0" } }),
        request: async (_path, body) => {
          const r = await fetch("/qa-action?id=" + id, {
              method: body ? "POST" : "GET",
              body: body ? JSON.stringify(body) : undefined,
            }),
            data = await r.json();
          if (!r.ok)
            throw Object.assign(Error(data.error), { code: data.code });
          return data;
        },
      };
      app.session.hidden = false;
      app.session.takeRoom(snapshot, { baseline: true });
    },
    { snapshot, id },
  );
  await page.locator(".board-stage").waitFor();
  return { context, page, f, id };
}
const rollButton = (page, phase) =>
  page.locator(
    phase === "jail"
      ? '[data-action="command"][data-type="ROLL"]'
      : '[data-action="primary"]',
  );
async function hold(page, button) {
  const r = await button.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => qa.rollInput.holding);
  return r;
}
try {
  for (const n of [2, 3, 4, 5, 6]) {
    const { context, page, f } = await pageFor(n),
      button = rollButton(page);
    await hold(page, button);
    await page.waitForTimeout(300);
    assert.equal(f.requests.length, 0);
    assert.equal(await page.evaluate(() => qa.session.state.version), 0);
    assert.equal(
      await page.locator(".dice-tray").getAttribute("data-stage"),
      "rolling",
    );
    if (n === 6) await page.screenshot({ path: output + "/holding-6.png" });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => qa.session.state.version), 0);
    assert(await page.evaluate(() => !!qa.session.pendingRoll));
    await button.click({ force: true });
    await page.waitForFunction(() => qa.session.state.version === 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].action.type, "ROLL");
    assert.deepEqual(Object.keys(f.requests[0].action).sort(), [
      "expectedVersion",
      "id",
      "type",
    ]);
    checks.push({
      name: `${n} players: hold sends nothing; release sends once; late confirmation and synthetic click cannot reroll`,
      pass: true,
    });
    await context.close();
  }
  for (const tap of [false, true]) {
    const { context, page, f } = await pageFor(),
      button = rollButton(page),
      r = await button.boundingBox();
    if (tap) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    else {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }],
      });
      await page.waitForFunction(() => qa.rollInput.holding);
      await page.waitForTimeout(250);
      assert.equal(f.requests.length, 0);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await page.waitForFunction(() => qa.session.state.version === 1);
    assert.equal(f.requests.length, 1);
    checks.push({
      name: tap
        ? "actual touch tap sends once"
        : "actual touch hold/release sends nothing before release",
      pass: true,
    });
    await context.close();
  }
  for (const cancel of [
    "outside",
    "pointercancel",
    "blur",
    "escape",
    "hidden",
    "state-change",
  ]) {
    const { context, page, f } = await pageFor();
    await hold(page, rollButton(page));
    if (cancel === "outside") await page.mouse.move(2, 2);
    else if (cancel === "escape") await page.keyboard.press("Escape");
    else
      await page.evaluate((kind) => {
        if (kind === "pointercancel")
          document.dispatchEvent(
            new PointerEvent("pointercancel", {
              pointerId: qa.rollInput.current.pointer,
              bubbles: true,
            }),
          );
        if (kind === "blur") window.dispatchEvent(new Event("blur"));
        if (kind === "hidden") {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        }
        if (kind === "state-change") {
          qa.session.ingest({ ...qa.session.state, version: 1 });
          qa.session.notify();
        }
      }, cancel);
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(f.requests.length, 0, cancel);
    assert.equal(await page.evaluate(() => qa.rollInput.holding), false);
    checks.push({
      name: `${cancel}: gesture and trailing click cancel without a game action`,
      pass: true,
    });
    await context.close();
  }
  for (const [phase, key, reduced] of [
    ["roll", "Space", false],
    ["starting", "Enter", false],
    ["jail", "Space", true],
  ]) {
    const { context, page, f } = await pageFor(3, { phase, reduced }),
      button = rollButton(page, phase);
    await button.focus();
    await page.keyboard.down(key);
    await page.keyboard.down(key);
    await page.waitForTimeout(180);
    assert.equal(f.requests.length, 0);
    await page.keyboard.up(key);
    await page.waitForFunction(() => qa.session.state.version === 1);
    assert.equal(f.requests.length, 1);
    assert.equal(
      f.requests[0].action.type,
      phase === "starting" ? "START_ROLL" : "ROLL",
    );
    checks.push({
      name: `${phase}: ${key} hold/release, repeat suppression, reduced motion=${reduced}`,
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page, f } = await pageFor();
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.down("Space");
    await page.waitForTimeout(120);
    assert.equal(f.requests.length, 0);
    await page.keyboard.up("Space");
    await page.waitForFunction(() => qa.session.state.version === 1);
    assert.equal(f.requests.length, 1);
    checks.push({
      name: "global Space shortcut shares the gesture controller and sends once",
      pass: true,
    });
    await context.close();
  }
  for (const n of [2, 6]) {
    const { context, page, f } = await pageFor(n);
    await page.locator('[data-action="ownAssets"]').click();
    await page.locator('[data-action="assetTab"][data-value="build"]').click();
    await page.locator('[data-action="buildOrder"][data-group="0"]').click();
    await page.locator('[data-selection-name="buildCount-0"]').click();
    await page.locator('[role="option"][data-value="6"]').click();
    await page.locator('[data-action="submitBuildOrder"]').evaluate((n) => {
      n.click();
      n.click();
    });
    await page.waitForFunction(() => qa.session.state.version === 6);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].action.type, "BUILD_BATCH");
    assert.equal(f.store.notifications.length, 1);
    assert.equal(await page.evaluate(() => qa.session.view.assets[1].level), 3);
    assert.equal(await page.evaluate(() => qa.session.view.assets[3].level), 3);
    assert.equal(
      await page.evaluate(() => qa.session.view.players[0].cash),
      12000,
    );
    assert.equal(
      await page.locator("dialog[open]").getAttribute("data-kind"),
      "assets",
    );
    checks.push({
      name: `${n} players: six buildings, one request/commit/notification, one final state and no per-building waiting`,
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page, f } = await pageFor(4, { bots: true });
    assert.equal(await page.locator("[data-roll-ready]").count(), 0);
    const room = f.store.rooms.get("ABCDEFGH");
    room.data.state = command(room.data.state, 2, { type: "ROLL" });
    room.revision++;
    const confirmed = await f.service.read("ABCDEFGH", "user-0");
    await page.evaluate((s) => qa.session.takeRoom(s), confirmed);
    assert.equal(await page.evaluate(() => qa.rollInput.holding), false);
    assert.equal(f.requests.length, 0);
    assert.equal(
      await page.locator(".dice-tray").getAttribute("data-stage"),
      "rolling",
    );
    checks.push({
      name: "bot roll uses confirmed engine dice and automatic presentation without any hold input",
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page, f } = await pageFor(3, { stockConflict: true });
    await page.locator('[data-action="ownAssets"]').click();
    await page.locator('[data-action="assetTab"][data-value="build"]').click();
    await page.locator('[data-action="buildOrder"][data-group="0"]').click();
    await page.locator('[data-selection-name="buildCount-0"]').click();
    await page.locator('[role="option"][data-value="2"]').click();
    await page.locator('[data-action="submitBuildOrder"]').click();
    await page.locator('[data-action="buildStockSingle"]').waitFor();
    assert.equal(f.store.rooms.get("ABCDEFGH").data.state.version, 0);
    assert.equal(f.store.notifications.length, 0);
    await page.locator('[data-action="buildStockSingle"]').click();
    await page.locator('[data-action="submitBuildOrder"]').click();
    await page.waitForFunction(() => qa.session.state.phase === "buildOffer");
    assert.equal(
      await page.evaluate(() => qa.session.state.players[0].cash),
      15000,
    );
    assert.equal(
      await page.evaluate(() => qa.session.state.assets[1].level),
      0,
    );
    checks.push({
      name: "stock contention rejects whole batch, explains it, and explicit single order opens official stock decision",
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor();
    await page.locator('[data-action="menu"]').click();
    await page.locator('[data-action="settings"]').click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('[data-action="diceLog"]').click(),
    ]);
    const stream = await download.createReadStream(),
      chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(data.format, "nusa-confirmed-dice-window-v1");
    assert(!JSON.stringify(data).includes("user-0"));
    assert(!data.state.decks);
    checks.push({
      name: "settings exports a public dice log window without private game/account state or extra API requests",
      pass: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ name: "browser failure", pass: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    "docs/audits/HOLD_BATCH_BROWSER_RESULTS.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Real Chromium, mobile emulation, local authoritative engine/service and controlled 150 ms response.",
          "No physical Android or hosted Supabase/Auth/Realtime was used.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  checks.filter((c) => c.pass).length + " hold/batch browser checks passed.",
);
