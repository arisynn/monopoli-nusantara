import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { staticResponse } from "../adapters/node/static.mjs";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { command, publicState, BOARD } from "../lib/game.mjs";
import { commandWithTradeResult, tradeResults } from "../lib/trade-result.mjs";
import { MemoryOnlineStore } from "../tests/helpers/online-store.mjs";
import { tradeFixture } from "../tests/helpers/trade-result.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright-core",
);
const output = process.env.MN_BROWSER_OUTPUT || "/tmp/nusa-trade-results";
await mkdir(output, { recursive: true });
const fixtures = new Map(),
  checks = [],
  errors = [],
  contexts = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let response;
    if (url.pathname === "/api/bot")
      response = Response.json({ configured: false });
    else if (url.pathname === "/api/online")
      response = Response.json({ online: false });
    else if (url.pathname === "/qa-trade") {
      const f = fixtures.get(url.searchParams.get("id")),
        seat = Number(url.searchParams.get("seat"));
      if (req.method === "GET")
        response = Response.json(
          await f.service.read("ABCDEFGH", `user-${seat}`),
        );
      else {
        let raw = "";
        for await (const c of req) raw += c;
        const body = JSON.parse(raw);
        f.requests.push({ seat, body });
        if (f.beforeCommit) await f.beforeCommit;
        await new Promise((r) => setTimeout(r, 150));
        response = Response.json(await f.service.execute(body, `user-${seat}`));
      }
    } else response = await staticResponse(new Request(url));
    if (url.pathname === "/frontend/app.mjs")
      response = new Response(
        (await response.text()) + "\nexport {session,ui,open,queueRender};",
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
async function fixture(options = {}) {
  const store = new MemoryOnlineStore(),
    now = Date.now(),
    id = crypto.randomUUID();
  const s = tradeFixture(options),
    code = "ABCDEFGH";
  store.rooms.set(code, {
    code,
    revision: 0,
    data: {
      code,
      schemaVersion: 1,
      mode: "online",
      status: "playing",
      capacity: s.players.length,
      host: 0,
      created: now,
      rules: "digital",
      state: s,
      seats: s.players.map((p, i) => ({
        ...p,
        userId: p.controller === "human" ? `user-${i}` : null,
        memberId: crypto.randomUUID(),
        connections:
          p.controller === "human" ? { [`connection-${i}`]: now } : {},
        ready: true,
      })),
      pause: null,
      vote: null,
      lastVoteAt: null,
    },
  });
  const f = {
    store,
    service: createOnlineService({ store, rng: () => 0.2 }),
    requests: [],
    id,
  };
  fixtures.set(id, f);
  return f;
}
async function pageFor(f, seat = 0, width = 390, reduced = false) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: width < 500,
    isMobile: width < 500,
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  const snapshot = await f.service.read("ABCDEFGH", `user-${seat}`);
  await page.evaluate(
    async ({ snapshot, id, seat }) => {
      const app = await import(
        document.querySelector('script[type="module"]').src
      );
      window.qa = app;
      app.session.persist = async () => {};
      app.session.clientId = `connection-${seat}`;
      app.session.auth = {
        session: () => ({ user: { id: `user-${seat}` } }),
        request: async (_path, body) => {
          const r = await fetch(`/qa-trade?id=${id}&seat=${seat}`, {
            method: body ? "POST" : "GET",
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await r.json();
          if (!r.ok)
            throw Object.assign(Error(data.error), { code: data.code });
          return data;
        },
      };
      app.session.takeRoom(snapshot, { baseline: true });
    },
    { snapshot, id: f.id, seat },
  );
  await page.locator(".board-stage").waitFor();
  return page;
}
async function sync(f, page, seat = 0, baseline = false) {
  const snapshot = await f.service.read("ABCDEFGH", `user-${seat}`);
  await page.evaluate(
    ({ s, baseline }) => qa.session.takeRoom(s, { baseline }),
    { s: snapshot, baseline },
  );
}
async function fits(page) {
  const bounds = await page.locator("dialog[open]").evaluate((el) => {
    const r = el.getBoundingClientRect(),
      body = el.querySelector(".popup-body");
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      w: innerWidth,
      h: innerHeight,
      overflow: body.scrollWidth > body.clientWidth + 1,
    };
  });
  assert(
    bounds.left >= 0 &&
      bounds.right <= bounds.w + 1 &&
      bounds.top >= 0 &&
      bounds.bottom <= bounds.h + 1 &&
      !bounds.overflow,
    JSON.stringify(bounds),
  );
}
async function close(page) {
  await page.locator("dialog[open] > .popup-dismiss").click();
}
const pass = (name) => {
  checks.push({ name, pass: true });
  console.log(`PASS ${name}`);
};
try {
  for (const width of [320, 390, 430, 900]) {
    const f = await fixture({ n: 2 }),
      sender = await pageFor(f, 0, width),
      receiver = await pageFor(f, 1, width, width === 430);
    // Explicitly reopen the proposal too: this used to swallow the new receipt in close().
    await receiver.evaluate(() => qa.open({ kind: "tradeIncoming" }));
    f.beforeCommit = new Promise((resolve) => {
      f.release = resolve;
    });
    await receiver.locator('[data-type="TRADE_ACCEPT"]').click();
    assert.equal(
      await receiver.locator('dialog[data-kind="tradeResult"]').count(),
      0,
    );
    f.release();
    f.beforeCommit = null;
    await receiver.locator('dialog[open][data-kind="tradeResult"]').waitFor();
    await sync(f, sender);
    await sender.locator('dialog[open][data-kind="tradeResult"]').waitFor();
    for (const page of [sender, receiver]) {
      await fits(page);
      assert.equal(
        await page.locator("dialog .popup-footer button").count(),
        0,
      );
      assert.equal(
        await page.locator("dialog > .popup-dismiss").textContent(),
        "Tutup",
      );
      assert.equal(await page.evaluate(() => qa.session.covered), false);
    }
    const from = await sender
      .locator('.trade-result-side[data-direction="in"]')
      .textContent();
    const to = await receiver
      .locator('.trade-result-side[data-direction="in"]')
      .textContent();
    assert(from.includes(BOARD[6].name));
    assert(!from.includes(BOARD[1].name));
    assert(to.includes(BOARD[1].name));
    assert(!to.includes(BOARD[6].name));
    assert.equal(f.requests.length, 1);
    assert.equal(f.store.notifications.length, 1);
    await receiver.screenshot({
      path: `${output}/receipt-${width}.png`,
      animations: "disabled",
    });
    if (width === 430)
      assert.equal(
        await receiver
          .locator("dialog")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
    pass(
      `${width}px: both participants get confirmed, correctly oriented compact receipts; manual proposal close cannot swallow them`,
    );
    if (width === 390) {
      const id = await sender.evaluate(
        () => qa.session.tradeResults.current.id,
      );
      await sync(f, sender);
      await sync(f, sender);
      assert.equal(
        await sender.evaluate(() => qa.session.tradeResults.queue.length),
        1,
      );
      const row = await f.store.get("ABCDEFGH");
      row.data.state = commandWithTradeResult(row.data.state, 0, {
        type: "END",
      });
      await f.store.commit(row, row.data);
      await sync(f, sender);
      assert.equal(
        await sender.evaluate(() => qa.session.tradeResults.current.id),
        id,
      );
      assert.equal(
        await sender.locator('dialog[open][data-kind="tradeResult"]').count(),
        1,
      );
      pass(
        "duplicate state delivery does not duplicate a receipt; authoritative play continues while receipt is open",
      );
      await sync(f, sender, 0, true);
      await sender.waitForFunction(() => !qa.session.tradeResults.current);
      assert.equal(
        await sender.locator('dialog[open][data-kind="tradeResult"]').count(),
        0,
      );
      pass("reconnect baseline does not replay completed transaction popups");
    } else await close(sender);
    await close(receiver);
    if (width === 320) {
      await sender.locator('[data-action="trade"]').click();
      const draft = await sender.evaluate(() => JSON.stringify(qa.ui.trade));
      await sender.locator('[data-action="tradeLatest"]').click();
      await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
      await fits(sender);
      await close(sender);
      await sender.locator('dialog[data-kind="trade"]').waitFor();
      assert.equal(
        await sender.evaluate(() => JSON.stringify(qa.ui.trade)),
        draft,
      );
      await close(sender);
      await sender.locator('[data-action="history"]').click();
      await sender
        .locator('[data-action="historyFilter"][data-value="trade"]')
        .click();
      await sender.locator('[data-action="tradeReceipt"]').first().click();
      await fits(sender);
      await close(sender);
      await sender.locator('dialog[data-kind="history"]').waitFor();
      pass(
        "latest receipt opens from Barter and History and returns to the unchanged draft/filter",
      );
    }
    await sender.screenshot({
      path: `${output}/trade-${width}.png`,
      animations: "disabled",
    });
    await Promise.all([sender.context().close(), receiver.context().close()]);
  }
  {
    const f = await fixture({ n: 3, mortgaged: true }),
      sender = await pageFor(f, 0),
      receiver = await pageFor(f, 1);
    await receiver.locator('[data-type="TRADE_ACCEPT"]').click();
    await receiver.locator('dialog[data-kind="tradeResult"]').waitFor();
    await sync(f, sender);
    await sender.locator('dialog[data-kind="mortgage"]').waitFor();
    assert.equal(
      await sender.evaluate(() => qa.session.tradeResults.queue.length),
      1,
    );
    assert.equal(
      await sender.locator('dialog[data-kind="tradeResult"]').count(),
      0,
    );
    await sender.locator('[data-type="MORTGAGE_REDEEM"]').click();
    await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
    assert(
      (await sender.locator(".trade-result-mortgage").textContent()).includes(
        "saat transaksi",
      ),
    );
    assert.equal(
      await sender.evaluate(() => qa.session.state.assets[6].mortgaged),
      false,
    );
    pass(
      "mortgage decision has priority; queued receipt retains transfer-time status after redeeming",
    );
    await Promise.all([sender.context().close(), receiver.context().close()]);
  }
  {
    const f = await fixture({ n: 3 }),
      sender = await pageFor(f, 0),
      receiver = await pageFor(f, 1);
    await receiver.locator('[data-type="TRADE_REJECT"]').click();
    await receiver.locator('dialog[data-kind="tradeResult"]').waitFor();
    await sync(f, sender);
    await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
    assert(
      (await sender.locator(".trade-result-status").textContent()).includes(
        "P1 menolak",
      ),
    );
    assert(await sender.locator(".popup-dismiss").isHidden());
    assert.equal(await sender.locator(".popup-footer button").count(), 0);
    assert.equal(
      await sender.locator("dialog").evaluate((el) => el.matches(":modal")),
      false,
    );
    const oldVersion = await sender.evaluate(() => qa.session.state.version);
    await sender.locator('[data-action="primary"]').click();
    await sender.waitForFunction(
      (v) => qa.session.state.version > v && !qa.session.pending,
      oldVersion,
    );
    await sender.evaluate(() => qa.open({ kind: "history" }));
    await sender.waitForTimeout(3900);
    assert(
      await sender.evaluate(
        () => qa.session.tradeResults.current.remaining > 2000,
      ),
    );
    await close(sender);
    await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
    await sender.waitForFunction(() => !qa.session.tradeResults.current);
    assert.equal(
      await sender.locator('dialog[open][data-kind="tradeResult"]').count(),
      0,
    );
    pass(
      "rejection never locks legal input, identifies the actor, pauses behind another modal and auto-closes after visible time",
    );
    await Promise.all([sender.context().close(), receiver.context().close()]);
  }
  {
    const f = await fixture({ n: 3 }),
      sender = await pageFor(f, 0),
      receiver = await pageFor(f, 1),
      observer = await pageFor(f, 2);
    assert(await sender.evaluate(() => qa.session.act("TRADE_REJECT")));
    await sync(f, receiver, 1);
    await sync(f, observer, 2);
    await receiver.locator('dialog[data-kind="tradeResult"]').waitFor();
    assert(
      (await receiver.locator(".trade-result-status").textContent()).includes(
        "P0 membatalkan",
      ),
    );
    assert.equal(
      await observer.evaluate(() => qa.session.tradeResults.current),
      null,
    );
    pass(
      "sender cancellation is distinct from refusal; uninvolved humans receive history only",
    );
    await Promise.all([
      sender.context().close(),
      receiver.context().close(),
      observer.context().close(),
    ]);
  }
  {
    const f = await fixture({ n: 2 }),
      sender = await pageFor(f, 0),
      receiver = await pageFor(f, 1);
    await receiver.locator('[data-action="counter"]').click();
    await receiver.evaluate(() => {
      qa.ui.trade = {
        to: 0,
        give: [8],
        take: [3],
        giveCash: 500,
        takeCash: 0,
        giveCards: 0,
        takeCards: 0,
      };
      qa.queueRender();
    });
    await receiver.locator('[data-action="submitTrade"]').click();
    await receiver.waitForFunction(
      () => qa.session.state.trade?.from === 1 && !qa.session.pending,
    );
    assert.equal(
      await receiver.evaluate(() => qa.session.tradeResults.queue.length),
      0,
    );
    await sync(f, sender);
    await sender.locator('[data-type="TRADE_ACCEPT"]').click();
    await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
    assert(
      (
        await sender
          .locator('.trade-result-side[data-direction="in"]')
          .textContent()
      ).includes(BOARD[8].name),
    );
    assert(
      !(await sender.locator(".trade-result-sides").textContent()).includes(
        BOARD[1].name,
      ),
    );
    pass(
      "counter-offer remains pending and acceptance displays only its final terms",
    );
    await Promise.all([sender.context().close(), receiver.context().close()]);
  }
  {
    const f = await fixture({ n: 6, to: 2, bot: true }),
      sender = await pageFor(f, 0, 430);
    const row = await f.store.get("ABCDEFGH");
    row.data.state = commandWithTradeResult(row.data.state, 2, {
      type: "TRADE_ACCEPT",
    });
    await f.store.commit(row, row.data);
    await sync(f, sender);
    await sender.locator('dialog[data-kind="tradeResult"]').waitFor();
    await fits(sender);
    assert.equal(f.requests.length, 0);
    pass(
      "six-player fixture: confirmed bot response gets a receipt without frontend commands or extra polling",
    );
    await sender.context().close();
  }
  {
    const f = await fixture({ n: 2 });
    const row = await f.store.get("ABCDEFGH");
    row.data.state = command(row.data.state, 1, { type: "TRADE_ACCEPT" });
    await f.store.commit(row, row.data);
    const page = await pageFor(f, 0, 320);
    await page.locator('[data-action="history"]').click();
    await page.locator('[data-action="tradeReceipt"]').first().click();
    assert(
      (await page.locator(".popup-body").textContent()).includes(
        "belum tersedia",
      ),
    );
    assert.equal(await page.locator(".trade-result-sides").count(), 0);
    pass(
      "old incomplete logs show an escaped confirmed note without invented details",
    );
    await page.context().close();
  }
  {
    const f = await fixture({ n: 2 });
    f.store.edit("ABCDEFGH", (room) => {
      const ids = Object.keys(room.state.assets).map(Number);
      ids.forEach((tile, i) => {
        room.state.assets[tile].owner = i % 2;
      });
      room.state.trade.give = ids.filter((_, i) => i % 2 === 0);
      room.state.trade.take = ids.filter((_, i) => i % 2 === 1);
    });
    const page = await pageFor(f, 1, 320);
    await page.locator('[data-type="TRADE_ACCEPT"]').click();
    await page.locator('dialog[data-kind="tradeResult"]').waitFor();
    await fits(page);
    assert.equal(await page.locator(".trade-result-property").count(), 28);
    assert(
      await page
        .locator(".popup-body")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    );
    assert(await page.locator(".popup-dismiss").isVisible());
    await page.screenshot({
      path: `${output}/trade-many-properties-320.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !qa.session.tradeResults.current);
    assert.equal(
      await page.locator('dialog[open][data-kind="tradeResult"]').count(),
      0,
    );
    pass(
      "28 properties fit a 320px screen with body-only scrolling, accessible dismissal and a single bottom close text",
    );
    await page.context().close();
  }
  {
    const f = await fixture({ n: 2 }),
      page = await pageFor(f, 1);
    f.store.edit("ABCDEFGH", (room) => {
      room.seats[0].connections = {};
    });
    await page.locator('[data-type="TRADE_ACCEPT"]').click();
    await page.waitForFunction(() => !qa.session.pending && !!qa.session.error);
    assert.equal(
      await page.evaluate(() => qa.session.tradeResults.queue.length),
      0,
    );
    assert.equal(
      tradeResults(f.store.rooms.get("ABCDEFGH").data.state).length,
      0,
    );
    assert.equal(
      await page.locator('dialog[open][data-kind="tradeResult"]').count(),
      0,
    );
    pass(
      "offline participant prevents acceptance; a failed server request cannot show a success receipt",
    );
    await page.context().close();
  }
  {
    const f = await fixture({ n: 3, to: 1, bot: true }),
      page = await pageFor(f, 0, 390);
    const state = structuredClone(f.store.rooms.get("ABCDEFGH").data.state);
    await page.evaluate((s) => {
      qa.session.disconnect();
      qa.session.room = null;
      qa.session.online = null;
      qa.session.mind = {
        decide: async () => ({
          action: { type: "TRADE_ACCEPT" },
          shouldConsult: false,
        }),
        dispose() {},
      };
      qa.session.ingest(s, { reset: true });
      qa.session.notify();
    }, state);
    await page.locator('dialog[data-kind="tradeResult"]').waitFor();
    assert.equal(
      await page.evaluate(() => qa.session.state.assets[1].owner),
      1,
    );
    assert.equal(await page.evaluate(() => qa.session.covered), false);
    pass(
      "offline bot decision uses the same confirmed receipt without pausing local bot computation",
    );
    await page.context().close();
  }
  {
    const f = await fixture({ n: 2 });
    f.store.edit("ABCDEFGH", (room) => {
      room.state.trade.context.phase = "roll";
      room.state.trade.returnPhase = "roll";
    });
    const page = await pageFor(f, 0);
    const row = await f.store.get("ABCDEFGH");
    row.data.state = commandWithTradeResult(row.data.state, 1, {
      type: "TRADE_REJECT",
    });
    await f.store.commit(row, row.data);
    await sync(f, page);
    await page.locator('dialog[data-mode="notice"]').waitFor();
    await page.locator(".board-view").focus();
    await page.keyboard.down("Space");
    assert.equal(f.requests.length, 0);
    assert.equal(await page.evaluate(() => qa.session.pending), false);
    await page.keyboard.up("Space");
    await page.waitForFunction(
      () => qa.session.state.version > 2 && !qa.session.pending,
    );
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].body.action.type, "ROLL");
    pass(
      "global Space hold/release remains usable during a passive rejection without choosing or revealing dice locally",
    );
    await page.context().close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ name: "browser failure", pass: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ path: `${output}/failure-${i}.png` })
      .catch(() => {});
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    "docs/audits/TRADE_RESULT_BROWSER_RESULTS.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Real Chromium and touch/mobile emulation, local authoritative engine/service; Auth and Realtime delivery use isolated doubles.",
          "Actual Termux fenced-submit and optional Edge adapters are tested separately in trade-result.test.mjs; no production database or physical Android was used.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.pass).length} trade result browser checks passed.`,
);
