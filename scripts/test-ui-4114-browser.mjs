import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { staticResponse } from "../adapters/node/static.mjs";
import { createGame, command, stock } from "../lib/game.mjs";
import {
  stockFixture,
  debtFixture,
} from "../tests/helpers/gameplay-update-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright-core",
);
const output = process.env.MN_BROWSER_OUTPUT || join(tmpdir(), "nusa-ui-4114");
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
  if (!response) response = new Response("Not found", { status: 404 });
  // Test-only access to the real application module. Never exported by the deployed app.
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
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const fixture = (n = 3) => {
  const s = createGame(
    {
      players: Array.from({ length: n }, (_, id) => ({
        name: id ? `Pemain ${id + 1}` : "Ayu",
        controller: "human",
      })),
      startingRoll: false,
      matchId: `ui-${n}`,
    },
    () => 0.2,
  );
  for (const id of [1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16])
    s.assets[id].owner = 0;
  s.assets[5].mortgaged = true;
  s.bank = stock(s);
  return s;
};
async function pageFor(
  s,
  {
    width = 390,
    height = 844,
    reduced = false,
    online = false,
    lobby = false,
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(
    async ({ s, online, lobby }) => {
      const app = await import(
        document.querySelector('script[type="module"]').src
      );
      window.qa = app;
      app.session.persist = async () => {};
      app.session.hidden = false;
      app.session.screen = lobby ? "lobby" : "gameplay";
      if (online) {
        const r = {
          code: "XKL5BY56",
          seat: 0,
          host: 0,
          capacity: 6,
          status: lobby ? "waiting" : "playing",
          held: false,
          roomRevision: 0,
          seats: s.players.map((p) => ({
            ...p,
            connected: true,
            ready: p.id % 2 === 0,
          })),
          state: lobby ? null : s,
        };
        app.session.config = { online: true, onlineBots: true };
        app.session.configStatus = "ready";
        app.session.auth = { session: () => ({ user: { id: "qa-user" } }) };
        app.session.room = { code: r.code, seat: 0, userId: "qa-user" };
        app.session.online = r;
        app.session.connected = true;
      }
      if (!lobby) app.session.ingest(s, { reset: true });
      app.session.notify();
    },
    { s, online, lobby },
  );
  await page.locator(lobby ? ".room-code" : ".board-stage").waitFor();
  return { context, page };
}
const close = (page) => page.locator(".popup-dismiss").click();
async function select(page, name, value) {
  const trigger = page.locator(`[data-selection-name="${name}"]`);
  await trigger.click();
  await trigger
    .locator("..")
    .locator(`[role="option"][data-value="${value}"]`)
    .click();
}
const version = (page) => page.evaluate(() => qa.session.state.version);
try {
  // Real DOM, bounds, keyboard focus, input editing, and pure-code system clipboard.
  for (const n of [2, 3, 4, 5, 6]) {
    const { context, page } = await pageFor(fixture(n), {
      width: 320,
      height: 568,
      online: true,
      lobby: true,
    });
    assert.equal(
      await page.locator(".lobby-player:not(.empty-seat)").count(),
      n,
    );
    assert(
      (await page.locator(".lobby-connection").innerText()).includes(
        "Terhubung",
      ),
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    await page.locator(".room-code").click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "XKL5BY56",
    );
    assert(
      (await page.locator("#page-status").innerText()).includes(
        "Kode room disalin",
      ),
    );
    assert.equal(
      await page
        .locator(".lobby-heading")
        .evaluate((n) => getComputedStyle(n).userSelect),
      "none",
    );
    assert.equal(
      await page.evaluate(() => {
        const e = new Event("copy", { bubbles: true, cancelable: true });
        document.querySelector(".room-code").dispatchEvent(e);
        return e.defaultPrevented;
      }),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const geometry = await page.evaluate(() => {
      const buttons = [
        ...document.querySelectorAll(".online-lobby button"),
      ].map((n) => ({
        action: n.dataset.action,
        rect: n.getBoundingClientRect(),
      }));
      const overlaps = [];
      for (let i = 0; i < buttons.length; i++)
        for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i].rect,
            b = buttons[j].rect;
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          )
            overlaps.push([buttons[i].action, buttons[j].action]);
        }
      return {
        overlaps,
        bottom: document.querySelector(".online-lobby").getBoundingClientRect()
          .bottom,
        height: innerHeight,
      };
    });
    assert.deepEqual(geometry.overlaps, []);
    assert(geometry.bottom <= geometry.height, JSON.stringify(geometry));
    if (n === 6)
      await page.screenshot({
        path: `${output}/lobby-6-mobile.png`,
        fullPage: true,
      });
    checks.push({
      name: `${n} players: small-screen lobby, no text selection, actual pure-code clipboard`,
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor(fixture(), {
      online: true,
      lobby: true,
    });
    // Denied async API exercises the real synchronous copy fallback and its selection guard.
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw Error("denied");
        },
      }),
    );
    await page.locator(".room-code").click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "XKL5BY56",
    );
    await page.evaluate(() => {
      document.execCommand = () => false;
    });
    await page.locator(".room-code").click();
    assert(
      (await page.locator("#page-status").innerText()).includes(
        "Clipboard belum tersedia",
      ),
    );
    await page.locator('[data-action="pawn"]').click();
    await close(page);
    checks.push({
      name: "clipboard permission denial, real fallback, honest failure and modal dismissal",
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor(fixture(6), {
      width: 320,
      height: 568,
    });
    await page.locator('[data-action="menu"]').click();
    await page.locator('dialog[data-kind="menu"][open]').waitFor();
    assert.equal(
      await page.locator('.popup-footer [data-action="lobby"]').count(),
      1,
    );
    await close(page);
    await page.locator('[data-action="ownAssets"]').click();
    assert.equal(await page.locator(".popup-close").count(), 0);
    assert.equal(
      await page.locator('.popup-footer [data-action="close"]').count(),
      0,
    );
    assert.equal(await page.locator(".popup-dismiss").innerText(), "Tutup");
    assert.equal(
      await page
        .locator(".popup-dismiss")
        .evaluate((n) => getComputedStyle(n).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    const openItem = async (key) => {
      await page.locator(`[data-asset-key="${key}"] summary`).click();
      await page.waitForTimeout(30);
    };
    await openItem("tile-1");
    await openItem("tile-3");
    assert.equal(await page.locator("[data-asset-key][open]").count(), 1);
    const search = page.locator('[name="assetSearch"]');
    await search.fill("a");
    await search.focus();
    await page.keyboard.press("Control+A");
    assert.equal(
      await search.evaluate((n) => getComputedStyle(n).userSelect),
      "text",
    );
    await page.locator(".popup-body").evaluate((n) => (n.scrollTop = 120));
    const saved = await page
      .locator(".popup-body")
      .evaluate((n) => n.scrollTop);
    await page
      .locator('[data-action="assetTab"][data-value="mortgage"]')
      .click();
    assert.equal(await page.locator('[data-type="REDEEM"]').count(), 0);
    await page
      .locator('[data-action="mortgageFilter"][data-value="held"]')
      .click();
    await openItem("tile-5");
    assert.equal(await page.locator('[data-type="MORTGAGE"]').count(), 0);
    await page.locator('[data-action="assetTab"][data-value="all"]').click();
    assert.equal(await search.inputValue(), "a");
    assert(
      Math.abs(
        (await page.locator(".popup-body").evaluate((n) => n.scrollTop)) -
          saved,
      ) < 3,
    );
    await close(page);
    await page.locator('[data-action="ownAssets"]').click();
    assert.equal(await search.inputValue(), "a");
    await search.fill("");
    await page
      .locator('[data-action="assetTab"][data-value="mortgage"]')
      .click();
    assert.equal(
      await page
        .locator('[data-action="mortgageFilter"][data-value="held"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.locator('[data-type="REDEEM"]').click();
    await page.waitForFunction(() => qa.session.state.version === 1);
    await page.waitForFunction(() => !qa.session.head);
    await page
      .locator('[data-action="mortgageFilter"][data-value="available"]')
      .click();
    await openItem("tile-1");
    await page
      .locator('[data-asset-key="tile-1"] [data-action="confirmAsset"]')
      .click();
    await page
      .locator('.asset-confirm [data-type="MORTGAGE"]')
      .evaluate((n) => {
        n.click();
        n.click();
      });
    await page.waitForFunction(() => qa.session.state.version === 2);
    assert.equal(await version(page), 2);
    await page.waitForFunction(() => !qa.session.head);
    await page.locator('[data-action="assetTab"][data-value="build"]').click();
    // Pick a complete, unencumbered group; single/multiple use one action area.
    if (
      !(await page
        .locator('[data-asset-key="group-1"]')
        .evaluate((n) => n.open))
    )
      await page.locator('[data-asset-key="group-1"] summary').click();
    assert.equal(await page.locator('[name="buildCount-1"]').count(), 0);
    await page.locator('[data-action="buildOrder"][data-group="1"]').click();
    assert.equal(await page.locator(".popup-dismiss").innerText(), "Kembali");
    await page.keyboard.press("Escape");
    assert.equal(await version(page), 2);
    assert.equal(await page.evaluate(() => qa.session.assetPanel), true);
    await page.locator('[data-action="buildOrder"][data-group="1"]').click();
    await select(page, "buildTarget-1", "8");
    await page.locator('[data-action="submitBuildOrder"]').evaluate((n) => {
      n.click();
      n.click();
    });
    await page.waitForFunction(() => qa.session.state.version === 3);
    assert.equal(
      await page.evaluate(() => qa.session.state.assets[8].level),
      1,
    );
    assert.equal(
      await page.evaluate(() => qa.session.state.assets[6].level),
      0,
    );
    await page.waitForFunction(() => !qa.session.head);
    await page.locator('[data-action="buildOrder"][data-group="1"]').click();
    await select(page, "buildCount-1", "2");
    await page.screenshot({ path: `${output}/build-quantity-mobile.png` });
    await page.locator('[data-action="submitBuildOrder"]').evaluate((n) => {
      n.click();
      n.click();
    });
    await page.waitForFunction(
      () => qa.session.state.version === 5 && !qa.session.pending,
    );
    assert.equal(await version(page), 5);
    assert.equal(
      await page.locator("dialog[open]").getAttribute("data-kind"),
      "assets",
    );
    const box = await page.locator("dialog[open]").boundingBox();
    assert(box.y >= 0 && box.y + box.height <= 569);
    await page.waitForFunction(() => !qa.session.head);
    await page.locator(".popup-body").evaluate((n) => (n.scrollTop = 0));
    await page.screenshot({ path: `${output}/assets-mobile.png` });
    checks.push({
      name: "assets: one accordion, per-tab search/scroll, Pegadaian-only transactions, single/multiple builds, double-tap guards",
      pass: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor(fixture(), { online: true });
    const received = structuredClone(fixture());
    received.version = 1;
    received.eventId += 1;
    received.log.unshift({
      id: received.eventId,
      turn: 1,
      type: "money",
      text: "Sewa lunas",
      finance: [{ kind: "rent", from: 1, to: 0, amount: 100, tile: 1 }],
    });
    await page.locator('[data-action="primary"]').focus();
    await page.evaluate((s) => {
      qa.session.ingest(s);
      qa.session.notify();
    }, received);
    await page.locator("#game-notice:not([hidden])").waitFor();
    assert(
      (await page.locator("#game-notice").innerText()).includes("Terima sewa"),
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.action),
      "primary",
    );
    assert.equal(
      await page
        .locator("#game-notice")
        .evaluate((n) => getComputedStyle(n).pointerEvents),
      "none",
    );
    await page.evaluate((s) => {
      for (let i = 0; i < 20; i++) qa.session.ingest(s);
      qa.session.notify();
    }, received);
    assert.equal(
      await page.evaluate(() => qa.session.notices.current.count),
      1,
    );
    const burst = structuredClone(received);
    burst.version = 2;
    for (let i = 0; i < 8; i++) {
      burst.eventId++;
      burst.log.unshift({
        id: burst.eventId,
        turn: 1,
        type: "money",
        text: "Sewa lunas",
        finance: [{ kind: "rent", from: 2, to: 0, amount: 100, tile: 3 }],
      });
    }
    await page.evaluate((s) => {
      qa.session.ingest(s);
      qa.session.notify();
    }, burst);
    assert.equal(
      await page.evaluate(() => qa.session.notices.current.amount),
      900,
    );
    await page.screenshot({ path: `${output}/rent-received-mobile.png` });
    await page.evaluate((s) => {
      qa.session.ingest(s, { reset: true });
      qa.session.notify();
    }, burst);
    assert.equal(await page.evaluate(() => qa.session.notices.current), null);
    checks.push({
      name: "committed rent only, duplicate snapshots, burst aggregation, no focus/input interception, reconnect without replay",
      pass: true,
    });
    await context.close();
  }
  {
    const s = command(fixture(2), 0, { type: "ROLL" }, () => 0);
    const { context, page } = await pageFor(s, {
      online: true,
      reduced: true,
      width: 320,
      height: 568,
    });
    await page.locator(".retro-card").waitFor();
    assert(await page.locator(".popup-dismiss").isHidden());
    assert.equal(await page.locator(".popup-footer button").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 1);
    await page.evaluate(() => {
      window.ackCalls = [];
      qa.session.auth.request = async (_path, body) => {
        ackCalls.push(body.action);
        const { command } = await import("/lib/game.mjs");
        const state = command(qa.session.state, 0, body.action, () => 0.2);
        return {
          code: "XKL5BY56",
          seat: 0,
          host: 0,
          status: "playing",
          held: false,
          roomRevision: 1,
          state,
          seats: state.players,
        };
      };
      qa.session.setCovered(true);
    });
    await page.waitForTimeout(2500);
    assert.equal(await page.evaluate(() => ackCalls.length), 0);
    await page.evaluate(() => qa.session.setCovered(false));
    await page.waitForFunction(() => ackCalls.length === 1);
    assert.equal(await page.evaluate(() => ackCalls[0].type), "ACK");
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => ackCalls.length), 1);
    checks.push({
      name: "card has no close, Escape cannot skip effect, menu pauses read timer, one confirmed ACK, reduced motion",
      pass: true,
    });
    await context.close();
  }
  // Exercise every modal producer and keep true decisions in its action footer.
  const modalKinds = [
    "assets",
    "development",
    "buildOrder",
    "property",
    "history",
    "profile",
    "trade",
    "picker",
    "buy",
    "debt",
    "auction",
    "jail",
    "mortgage",
    "buildOffer",
    "won",
    "confirmAsset",
    "bankrupt",
    "menu",
    "settings",
    "rules",
    "saves",
    "room",
    "pawn",
    "setup",
    "botChoice",
    "onlineEntry",
    "auth",
    "myProfile",
    "bank",
    "savedRooms",
    "addBotPopup",
    "leaveRoomConfirm",
  ];
  for (const kind of modalKinds) {
    let s = fixture();
    const popup = { kind, id: 0 };
    if (kind === "property") popup.id = 1;
    if (kind === "buildOrder")
      Object.assign(popup, { group: 0, owner: 0, matchId: s.matchId });
    if (kind === "buy") {
      s.phase = "buy";
      s.buy = 18;
    }
    if (kind === "debt") s = debtFixture();
    if (kind === "auction") {
      s.phase = "buy";
      s.buy = 18;
      s = command(s, 0, { type: "AUCTION" });
    }
    if (kind === "jail") {
      s.phase = "jail";
      s.players[0].inJail = true;
    }
    if (kind === "mortgage") {
      s.phase = "mortgage";
      s.mortgageDecision = { player: 0, tile: 5 };
    }
    if (kind === "buildOffer") s = stockFixture();
    if (kind === "won") {
      s.phase = "won";
      s.winner = 0;
    }
    if (kind === "confirmAsset") {
      popup.id = 1;
      popup.type = "MORTGAGE";
    }
    if (kind === "picker") {
      // The picker is reachable from an initialized trade draft.
      popup.owner = 0;
      popup.side = "give";
    }
    if (kind === "botChoice") popup.slot = 0;
    const { context, page } = await pageFor(s, { width: 320, height: 568 });
    await page.evaluate((p) => {
      if (p.kind === "picker" || p.kind === "trade") {
        qa.ui.trade = {
          to: 1,
          give: [],
          take: [],
          giveCash: 0,
          takeCash: 0,
          giveCards: 0,
          takeCards: 0,
        };
      }
      qa.open(p);
    }, popup);
    const present = await page.locator("dialog[open]").count();
    if (present) {
      await page
        .locator("dialog")
        .evaluate(async (n) =>
          Promise.all(n.getAnimations().map((a) => a.finished.catch(() => {}))),
        );
      const exits = page.locator(".popup-dismiss:not([hidden])");
      assert.equal(await exits.count(), 1, kind);
      assert.equal(
        await page.locator('.popup-footer [data-action="close"]').count(),
        0,
        kind,
      );
      assert(
        await exits.evaluate((n) => n.getBoundingClientRect().height >= 44),
        kind,
      );
      const box = await page.locator("dialog[open]").boundingBox();
      assert(
        box.y >= 0 && box.y + box.height <= 569,
        kind + JSON.stringify(box),
      );
    } else throw Error(`Missing modal: ${kind}`);
    checks.push({
      name: `${kind}: one bottom text dismissal, no duplicate boxed close, bounded 320px dialog`,
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
    "docs/audits/UI_4114_BROWSER_RESULTS.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment:
          "Real Chromium and actual application DOM; controlled authoritative state and transport",
        checks,
        errors,
        limits: [
          "Mobile emulation, not physical Android.",
          "No hosted Supabase/Auth/Realtime/Vercel or Termux device.",
          "Test server exports application handles for controlled fixtures; deployed source does not.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.pass).length} UI 4.11.4 browser checks passed.`,
);
