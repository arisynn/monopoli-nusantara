import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { staticResponse } from "../adapters/node/static.mjs";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { MemoryOnlineStore } from "../tests/helpers/online-store.mjs";
import { stockFixture } from "../tests/helpers/gameplay-update-fixtures.mjs";
import { createGame, command } from "../lib/game.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const folder =
  process.env.MN_BROWSER_OUTPUT || "docs/qa/online-flow/evidence/browser";
await mkdir(folder, { recursive: true });
const store = new MemoryOnlineStore(),
  service = createOnlineService({ store, botsEnabled: true, rng: () => 0.2 }),
  tokens = new Map(),
  sockets = new Set();
let onlineBots = false,
  origin;
const actions = [];
function notify() {
  for (const s of sockets) {
    const row = store.rooms.get(s.code);
    if (row?.data.seats.some((m) => m.userId === s.user))
      s.socket.send(
        JSON.stringify({
          topic: "realtime:mn-room:" + s.code,
          event: "postgres_changes",
          payload: { data: { revision: row.revision } },
        }),
      );
  }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    let response;
    if (url.pathname === "/api/bot")
      response = Response.json({ configured: false });
    else if (url.pathname === "/api/auth") {
      const id = crypto.randomUUID(),
        access_token = "qa-session-" + crypto.randomUUID();
      tokens.set(access_token, id);
      response = Response.json({
        access_token,
        refresh_token: "qa-refresh",
        expires_in: 3600,
        user: { id, is_anonymous: true },
      });
    } else if (url.pathname === "/api/online") {
      if (url.searchParams.has("config"))
        response = Response.json({
          online: true,
          onlineBots,
          url: origin,
          key: "public-qa-key",
        });
      else {
        const user = tokens.get(req.headers.authorization?.slice(7));
        assert(user, "Issued test identity required");
        if (url.searchParams.has("diagnostics"))
          response = Response.json({
            onlineBots,
            capabilities: {
              schemaVersion: 6,
              lobbyManagement: true,
              workerConfigured: true,
              schedulerConfigured: true,
            },
          });
        else if (req.method === "POST") {
          let b = "";
          for await (const part of req) b += part;
          const input = JSON.parse(b);
          if (input.type === "ACTION")
            actions.push({
              at: Date.now(),
              code: input.code,
              action: input.action.type,
            });
          response = Response.json(await service.execute(input, user));
          notify();
        } else
          response = Response.json(
            await service.read(url.searchParams.get("code"), user),
          );
      }
    } else response = await staticResponse(new Request(url));
    response ||= new Response("Not found", { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(error.status || 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message, code: error.code }));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [],
  contexts = [];
async function client(name, width, reduced = false) {
  const context = await browser.newContext({
    viewport: { width, height: width === 320 ? 568 : 844 },
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  contexts.push(context);
  await context.addInitScript(
    (name) => localStorage.setItem("nusantara-player-name", name),
    name,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket("**/realtime/v1/websocket*", (socket) => {
    let entry;
    socket.onMessage((message) => {
      const m = JSON.parse(message);
      if (m.event === "phx_join") {
        entry = {
          socket,
          code: m.topic.split(":").at(-1),
          user: tokens.get(m.payload.access_token),
        };
        sockets.add(entry);
        socket.send(
          JSON.stringify({
            topic: m.topic,
            event: "phx_reply",
            ref: m.ref,
            payload: { status: "ok" },
          }),
        );
      }
    });
    socket.onClose(() => sockets.delete(entry));
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-action=onlineEntry]").click();
  await page.locator("[data-action=auth]").click();
  await page.locator("[data-action=guest]").click();
  await page.locator("dialog[data-kind=onlineEntry]").waitFor();
  return page;
}
async function close(page) {
  await page
    .locator("dialog[open] [data-action=close]:visible")
    .first()
    .click();
}
async function join(page, code) {
  await page.locator("[data-action=onlineTab][data-value=join]").click();
  await page.locator("[name=joinCode]").fill(code);
  await page.locator("[data-action=enterRoom]").click();
  await page.locator(".room-code").waitFor();
}
async function account(page) {
  return page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("nusantara-save-v1"));
    return (
      c?.room?.userId ||
      JSON.parse(localStorage.getItem("nusantara-auth:" + location.origin)).user
        .id
    );
  });
}

const results = [];
async function room({ salary = false, rent = false, reduced = false } = {}) {
  const host = await client("Flow Host", 360, reduced),
    guest = await client("Flow Guest", 393, reduced);
  await host.locator("[data-action=enterRoom]").click();
  const code = await host.locator(".room-code b").textContent();
  await join(guest, code);
  await host.locator("[data-action=ready]").click();
  await guest.locator("[data-action=ready]").click();
  await host.locator("[data-action=startRoom]:enabled").click();
  await guest.locator(".board-stage").waitFor();
  const row = await store.get(code);
  row.data.state = createGame(
    { players: row.data.seats, startingRoll: false },
    () => 0.2,
  );
  row.data.state.players[0].pos = salary || rent ? 39 : 2;
  if (rent) row.data.state.assets[3].owner = 1;
  await store.commit(row, row.data);
  notify();
  // Installing a fixture replaces the match ID outside normal gameplay. Resume
  // both clients from that committed baseline so old START reads cannot race it.
  for (const page of [host, guest]) {
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("[data-action=resume]").click();
    await page.locator(".board-stage").waitFor();
  }
  await host.waitForFunction(() =>
    document
      .querySelector("[data-action=primary]")
      ?.textContent.includes("Lempar dadu"),
  );
  await guest.waitForFunction(() => document.querySelector('[data-pawn="0"]'));
  // Both clients must ingest the fixture baseline before the roll. Otherwise
  // a slow first read legitimately restores the latest snapshot without replay.
  await Promise.all(
    [host, guest].map((p) =>
      p.waitForFunction(async (state) => {
        const { pawnPlacement } = await import("/lib/pawn-layout.mjs");
        const { pawnDisplayPoint } = await import("/frontend/board.mjs");
        const expected = pawnDisplayPoint(pawnPlacement(state, 0));
        const raw =
          document
            .querySelector('[data-pawn="0"]')
            ?.getAttribute("transform") || "";
        const actual = raw.match(/translate\(([-.0-9]+)[ ,]+([-.0-9]+)\)/);
        return (
          actual &&
          Math.hypot(+actual[1] - expected.x, +actual[2] - expected.y) < 0.8
        );
      }, row.data.state),
    ),
  );
  await Promise.all(
    [host, guest].map((p) =>
      p.evaluate(async (state) => {
        const { pawnPlacement } = await import("/lib/pawn-layout.mjs");
        const { pawnDisplayPoint } = await import("/frontend/board.mjs");
        window.flowTargets = {};
        for (const pos of [3, 6, 10])
          window.flowTargets[pos] = pawnDisplayPoint(
            pawnPlacement(
              {
                ...state,
                players: state.players.map((p, i) =>
                  i === 0 ? { ...p, pos } : p,
                ),
              },
              0,
            ),
          );
        window.flowSamples = [];
        window.flowStop = false;
        const record = () => {
          const n = document.querySelector('[data-pawn="0"]'),
            transform = n?.getAttribute("transform") || "",
            v = transform.match(/translate\(([-.0-9]+)[ ,]+([-.0-9]+)\)/);
          const dialog = document.querySelector("dialog[open]"),
            primary = document.querySelector("[data-action=primary]");
          window.flowSamples.push({
            at: performance.now(),
            x: v ? +v[1] : null,
            y: v ? +v[2] : null,
            kind: dialog?.dataset.kind || null,
            title: dialog?.getAttribute("aria-label") || null,
            disabled: primary?.disabled,
            label: primary?.textContent,
            activity: document.querySelector("#activity-text")?.textContent,
          });
          if (!window.flowStop) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      }, row.data.state),
    ),
  );
  return { host, guest, code };
}
async function moving(page) {
  await page.waitForFunction(
    () => window.flowSamples?.some((s) => s.label?.includes("bergerak")),
    {},
    { timeout: 10000 },
  );
}
async function sample(page) {
  return page.evaluate(() => ({
    samples: window.flowSamples,
    targets: window.flowTargets,
  }));
}
function targetReached(sample, target) {
  return Math.hypot(sample.x - target.x, sample.y - target.y) < 0.8;
}
async function capture(pages, name) {
  for (let i = 0; i < pages.length; i++)
    await pages[i].screenshot({ path: `${folder}/${name}-${i}.png` });
}
try {
  // Normal UI: neither purchase nor another command can interrupt walking.
  {
    const { host, guest, code } = await room();
    await Promise.all(
      contexts.map((c) =>
        c.tracing.start({ screenshots: true, snapshots: true }),
      ),
    );
    await host.locator("[data-action=primary]:enabled").click();
    await moving(host);
    assert.equal(await host.locator("dialog[open]").count(), 0);
    assert(await host.locator("[data-action=primary]").isDisabled());
    const version = (await store.get(code)).data.state.version,
      count = actions.length;
    await host
      .locator("[data-action=primary]")
      .evaluate((el) =>
        el.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    await host.keyboard.press("Space");
    assert.equal(actions.length, count);
    assert.equal((await store.get(code)).data.state.version, version);
    await host.locator("[data-action=menu]").click();
    await host.waitForTimeout(80);
    const paused = await host
      .locator('[data-pawn="0"]')
      .getAttribute("transform");
    await host.waitForTimeout(850);
    assert.equal(
      await host.locator('[data-pawn="0"]').getAttribute("transform"),
      paused,
    );
    await capture([host, guest], "menu-during-walk");
    await close(host);
    await host.locator("dialog[open][data-kind=buy]").waitFor();
    await capture([host, guest], "purchase-after-arrival");
    const records = await Promise.all([host, guest].map(sample));
    for (const [i, r] of records.entries()) {
      const decision = r.samples.find((s) => s.kind === "buy");
      const arrived = r.samples.find((s) => targetReached(s, r.targets[6]));
      assert(arrived, `Client ${i} did not finish its route`);
      if (decision)
        assert(decision.at >= arrived.at, "Purchase appeared before arrival");
      const movingFrames = r.samples.filter((s) =>
        s.label?.includes("bergerak"),
      );
      assert(new Set(movingFrames.map((s) => `${s.x}:${s.y}`)).size > 3);
      assert(
        movingFrames.every((s) => s.disabled),
        "An action enabled during walking",
      );
    }
    results.push({
      name: "two independent clients: full walk before purchase; click/Space blocked; menu pauses actual walk",
      passed: true,
      records,
    });
    await Promise.all(
      contexts.map((c, i) =>
        c.tracing.stop({ path: `${folder}/flow-${i}-trace.zip` }),
      ),
    );
    for (const c of contexts.splice(0)) await c.close();
  }
  // New authoritative versions must queue behind the current walk, never fold it.
  {
    const { host, guest, code } = await room();
    await host.locator("[data-action=primary]:enabled").click();
    await moving(host);
    const row = await store.get(code),
      before = structuredClone(row.data.state);
    row.data.state = command(row.data.state, 0, { type: "BUY" }, () => 0.2);
    row.data.state = command(row.data.state, 0, { type: "ROLL" }, () => 0.2);
    const final = structuredClone(row.data.state);
    await store.commit(row, row.data);
    notify();
    notify();
    await host.waitForFunction(
      () =>
        !document.querySelector("[data-action=primary]")?.disabled &&
        document
          .querySelector("[data-action=primary]")
          ?.textContent.includes("Lempar lagi"),
    );
    await guest.waitForFunction(
      () =>
        window.flowSamples.some((s) => s.label?.includes("bergerak")) &&
        window.flowSamples.at(-1)?.label?.includes("bergerak") === false,
    );
    const records = await Promise.all([host, guest].map(sample));
    for (const r of records) {
      const first = r.samples.findIndex((s) => targetReached(s, r.targets[6]));
      const second = r.samples.findIndex(
        (s, i) => i > first && targetReached(s, r.targets[10]),
      );
      assert(
        first >= 0 && second > first,
        "Burst skipped/reordered a pawn route",
      );
      assert(
        !r.samples.some((s) => s.kind === "buy"),
        "Stale purchase opened during catch-up",
      );
    }
    assert.deepEqual((await store.get(code)).data.state, final);
    await capture([host, guest], "burst-completed");
    results.push({
      name: "duplicate realtime burst preserves both routes and final canonical state",
      passed: true,
      beforeVersion: before.version,
      finalVersion: final.version,
      records,
    });
    for (const c of contexts.splice(0)) await c.close();
  }
  for (const reduced of [false, true]) {
    const { host, guest, code } = await room({
      salary: true,
      rent: true,
      reduced,
    });
    await host.locator("[data-action=primary]:enabled").click();
    await host.locator("dialog[open][data-kind=notice]").waitFor();
    assert.equal(await host.locator("dialog[open] button:visible").count(), 0);
    await guest.locator("dialog[open][data-kind=notice]").waitFor();
    const records = await Promise.all([host, guest].map(sample));
    for (const r of records) {
      const firstNotice = r.samples.find((s) => s.kind === "notice");
      const arrived = r.samples.find((s) => targetReached(s, r.targets[3]));
      assert(arrived, "Salary/rent appeared without arrival");
      if (firstNotice) assert(firstNotice.at >= arrived.at);
    }
    const committed = structuredClone((await store.get(code)).data.state);
    await capture(
      [host, guest],
      reduced ? "reduced-salary-rent" : "salary-rent-after-arrival",
    );
    await host.waitForFunction(
      () => !document.querySelector("dialog[open][data-kind=notice]"),
      {},
      { timeout: 14000 },
    );
    await guest.waitForFunction(
      () => !document.querySelector("dialog[open][data-kind=notice]"),
      {},
      { timeout: 14000 },
    );
    assert.deepEqual((await store.get(code)).data.state, committed);
    results.push({
      name: `${reduced ? "reduced motion" : "normal motion"}: salary and rent notifications follow arrival, auto-close without another transaction`,
      passed: true,
      records,
    });
    for (const c of contexts.splice(0)) await c.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  const records = [];
  for (const c of contexts)
    for (const p of c.pages()) records.push(await sample(p).catch(() => null));
  results.push({ passed: false, error: error.stack, records });
  process.exitCode = 1;
  console.error(error);
  for (const [i, c] of contexts.entries())
    for (const page of c.pages())
      await page
        .screenshot({ path: `${folder}/failure-${i}.png` })
        .catch(() => {});
} finally {
  await writeFile(
    `${folder}/results.json`,
    JSON.stringify(
      {
        environment:
          "Chromium, two isolated browser contexts, real UI and authoritative online service; MemoryOnlineStore and websocket transport controlled locally",
        results,
        errors,
        actions,
        pass:
          results.length === 4 &&
          results.every((r) => r.passed) &&
          errors.length === 0,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
if (!process.exitCode)
  console.log(
    "PASS: 4 online flow scenarios, two independent sessions each; actual pawn frames and ordering verified.",
  );
