import test from "node:test";
import assert from "node:assert/strict";
import { createGame, command, publicState, BOARD } from "../lib/game.mjs";
import { createGame as legacyGame } from "../lib/game-v1.mjs";
import {
  commandWithTradeResult,
  tradeResults,
  eventTradeResult,
} from "../lib/trade-result.mjs";
import { TradeResults } from "../frontend/trade-results.mjs";
import {
  tradeResultContent,
  latestTradeResult,
} from "../frontend/trade-result-view.mjs";
import { createOnlineService, digest } from "../lib/server/online-service.mjs";
import { createTermuxService } from "../lib/server/termux-worker.mjs";
import { runBotWorker } from "../lib/server/bot-worker.mjs";
import {
  MODEL_MANIFEST_ID,
  WORKER_PROTOCOL,
} from "../lib/bot/model-manifest.mjs";
import { MemoryOnlineStore } from "./helpers/online-store.mjs";
import { TermuxStore } from "./helpers/termux-store.mjs";
import { BotJobStore } from "./helpers/bot-job-store.mjs";
import { tradeFixture } from "./helpers/trade-result.mjs";
import { GameSession } from "../frontend/session.mjs";

const settle = (s, type = "TRADE_ACCEPT", actor = s.trade.to) =>
  commandWithTradeResult(
    s,
    actor,
    { type, id: "trade-result-request", expectedVersion: s.version },
    () => 0.2,
  );

test("receipt preserves the exact official command result, finance, cards, memory and ledger", () => {
  const s = tradeFixture(),
    before = structuredClone(s),
    action = {
      type: "TRADE_ACCEPT",
      id: "receipt-private-user:public-id",
      expectedVersion: s.version,
    };
  const official = command(s, 1, action, () => 0.2),
    next = commandWithTradeResult(s, 1, action, () => 0.2);
  assert.deepEqual(s, before);
  const clean = structuredClone(next);
  for (const e of clean.log) delete e.tradeResult;
  assert.deepEqual(clean, official);
  const r = tradeResults(next)[0];
  assert.equal(r.outcome, "accepted");
  assert.deepEqual(r.give, {
    cash: 300,
    cards: 1,
    properties: [{ tile: 1, mortgaged: false }],
  });
  assert.deepEqual(r.take, {
    cash: 150,
    cards: 1,
    properties: [{ tile: 6, mortgaged: false }],
  });
  const raw = JSON.stringify(publicState(next));
  assert(!raw.includes("receipt-private-user"));
  assert(!JSON.stringify(r).includes('"deck"'));
  assert.equal(next.log.filter((e) => e.tradeResult).length, 1);
  const html0 = tradeResultContent(next, 0, r.eventId).html,
    html1 = tradeResultContent(next, 1, r.eventId).html;
  assert(html0.indexOf(BOARD[6].name) < html0.indexOf(BOARD[1].name));
  assert(html1.indexOf(BOARD[1].name) < html1.indexOf(BOARD[6].name));
});

for (const [type, actor, outcome] of [
  ["TRADE_REJECT", 1, "rejected"],
  ["TRADE_REJECT", 0, "cancelled"],
])
  test(`${outcome} identifies the actual actor and changes no assets/cash/cards`, () => {
    const s = tradeFixture(),
      next = settle(s, type, actor),
      r = tradeResults(next)[0];
    assert.equal(r.outcome, outcome);
    assert.equal(r.actor, actor);
    assert.deepEqual(
      next.players.map(({ cash, cards }) => ({ cash, cards })),
      s.players.map(({ cash, cards }) => ({ cash, cards })),
    );
    assert.deepEqual(next.assets, s.assets);
    assert(
      !tradeResultContent(next, 0, r.eventId).html.includes(
        "trade-result-sides",
      ),
    );
  });

test("counter is a new pending proposal; only accepting its final terms yields a receipt", () => {
  const s = tradeFixture();
  const counter = commandWithTradeResult(s, 1, {
    type: "COUNTER",
    trade: {
      to: 0,
      give: [8],
      take: [3],
      giveCash: 500,
      takeCash: 0,
      giveCards: 0,
      takeCards: 0,
    },
  });
  assert.equal(tradeResults(counter).length, 0);
  assert.equal(counter.phase, "trade");
  const r = tradeResults(settle(counter))[0];
  assert.equal(r.from, 1);
  assert.equal(r.to, 0);
  assert.equal(r.give.properties[0].tile, 8);
  assert.equal(r.give.cash, 500);
});

test("mortgaged asset receipt records its transfer-time status without settling or charging it", () => {
  const s = tradeFixture({ mortgaged: true }),
    next = settle(s),
    r = tradeResults(next)[0];
  assert.equal(next.phase, "mortgage");
  assert.equal(next.mortgageDecision.player, 0);
  assert.equal(r.take.properties[0].mortgaged, true);
  const completed = command(next, 0, { type: "MORTGAGE_KEEP" });
  assert.equal(tradeResults(completed)[0].take.properties[0].mortgaged, true);
  assert(
    tradeResultContent(completed, 0, r.eventId).html.includes("saat transaksi"),
  );
});

for (const [label, trade] of [
  [
    "cash only",
    {
      give: [],
      take: [],
      giveCash: 300,
      takeCash: 150,
      giveCards: 0,
      takeCards: 0,
    },
  ],
  [
    "cards only",
    {
      give: [],
      take: [],
      giveCash: 0,
      takeCash: 0,
      giveCards: 1,
      takeCards: 1,
    },
  ],
])
  test(`${label} receipt does not invent a property, cash flow or profit estimate`, () => {
    const next = settle(tradeFixture({ trade })),
      r = tradeResults(next)[0];
    assert.equal(r.give.properties.length, 0);
    assert.equal(r.take.properties.length, 0);
    assert.equal(r.give.cash, trade.giveCash);
    assert.equal(r.give.cards, trade.giveCards);
    const html = tradeResultContent(next, 0, r.eventId).html;
    assert(!html.includes("trade-result-property"));
    assert(!html.includes("laba"));
  });

test("failed, unauthorized and duplicate engine actions cannot fabricate successful receipts", () => {
  const s = tradeFixture();
  assert.throws(() => settle(s, "TRADE_ACCEPT", 2));
  assert.equal(tradeResults(s).length, 0);
  const next = settle(s),
    again = settle(next, "TRADE_ACCEPT", 1);
  assert.deepEqual(again, next);
  assert.equal(tradeResults(again).length, 1);
  const poor = structuredClone(s);
  poor.players[0].cash = 0;
  assert.throws(() => settle(poor));
  assert.equal(tradeResults(poor).length, 0);
});

test("queue filters by participant, deduplicates snapshots and never replays baseline/reconnect history", () => {
  const s = tradeFixture(),
    next = settle(s),
    q = new TradeResults();
  q.ingest(s, 0, true);
  q.ingest(next, 0);
  q.ingest(next, 0);
  q.ingest(s, 0);
  assert.equal(q.queue.length, 1);
  q.dismiss();
  q.ingest(next, 0);
  assert.equal(q.current, null);
  q.ingest(next, 0, true);
  assert.equal(q.current, null);
  assert(latestTradeResult(next, 0));
  q.ingest(s, 2, true);
  q.ingest(next, 2);
  assert.equal(q.current, null);
  q.dispose();
});

test("rejection timer only consumes visible time; accepted receipts require dismissal", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const s = tradeFixture(),
    q = new TradeResults();
  q.ingest(s, 0, true);
  q.ingest(settle(s, "TRADE_REJECT", 1), 0);
  q.sync(true);
  t.mock.timers.tick(1000);
  q.sync(false);
  t.mock.timers.tick(60000);
  assert.equal(q.current.remaining, 2600);
  q.sync(true);
  t.mock.timers.tick(2599);
  assert(q.current);
  t.mock.timers.tick(1);
  assert.equal(q.current, null);
  q.ingest(s, 0, true);
  q.ingest(settle(s), 0);
  q.sync(true);
  t.mock.timers.tick(120000);
  assert(q.current);
  q.dismiss();
  q.dispose();
});

test("malformed imported metadata and legacy incomplete logs render only an honest escaped note", () => {
  const next = settle(tradeFixture()),
    event = next.log.find((e) => e.tradeResult);
  for (const mutate of [
    (r) => (r.to = 999),
    (r) => (r.give.cash = -1),
    (r) => (r.take.properties[0].tile = 999),
    (r) => (r.outcome = "countered"),
    (r) => (r.id = "forged"),
    (r) => (r.actor = 0),
    (r) => (r.give.cards = 3),
  ]) {
    const bad = structuredClone(next),
      e = bad.log.find((e) => e.tradeResult);
    mutate(e.tradeResult);
    assert.equal(eventTradeResult(bad, e), null);
  }
  const old = structuredClone(next);
  delete old.log.find((e) => e.tradeResult).tradeResult;
  old.log.find((e) => e.id === event.id).text =
    '<img src=x onerror="alert(1)">';
  const html = tradeResultContent(old, 0, event.id).html;
  assert(html.includes("belum tersedia"));
  assert(!html.includes("<img"));
  next.players[1].name = "<script>bad()</script>";
  assert(!tradeResultContent(next, 0, event.id).html.includes("<script>"));
});

test("legacy engine receives the same presentation adapter without changing its official fee rules", () => {
  const s = legacyGame(
    {
      players: [
        { name: "A", controller: "human" },
        { name: "B", controller: "human" },
      ],
    },
    () => 0.2,
  );
  s.assets[1].owner = 0;
  s.assets[3].owner = 1;
  s.phase = "end";
  const offered = command(s, 0, {
    type: "OFFER",
    trade: {
      to: 1,
      give: [1],
      take: [3],
      giveCash: 0,
      takeCash: 0,
      giveCards: 0,
      takeCards: 0,
    },
  });
  const next = settle(offered),
    control = command(offered, 1, {
      type: "TRADE_ACCEPT",
      id: "trade-result-request",
      expectedVersion: offered.version,
    });
  assert.deepEqual(next.players, control.players);
  assert.deepEqual(next.assets, control.assets);
  assert.equal(tradeResults(next).length, 1);
});

async function roomFixture(
  n = 3,
  store = new MemoryOnlineStore(),
  bot = false,
) {
  const now = 1000000,
    service = createOnlineService({
      store,
      clock: () => now,
      rng: () => 0.2,
      generateCode: () => "ABCDEFGH",
    });
  const call = (i, type, data = {}) =>
    service.execute(
      {
        type,
        clientId: `connection-${i}`,
        requestId: data.action?.id || crypto.randomUUID(),
        code: "ABCDEFGH",
        ...data,
      },
      `user-${i}`,
    );
  await call(0, "CREATE", { name: "P0", capacity: n });
  for (let i = 1; i < n; i++) await call(i, "JOIN", { name: `P${i}` });
  store.edit("ABCDEFGH", (r) => {
    r.status = "playing";
    r.state = tradeFixture({ n, to: bot ? 2 : 1, bot });
    if (bot) {
      r.seats[2] = {
        ...r.seats[2],
        controller: "bot",
        userId: null,
        botPersona: "raka",
        connections: {},
      };
    }
  });
  store.notifications = [];
  return { store, service, call, now };
}

for (const n of [2, 3, 4, 5, 6])
  test(`${n} players: simultaneous retries commit one receipt with the state and one notification`, async () => {
    const f = await roomFixture(n),
      s = f.store.rooms.get("ABCDEFGH").data.state,
      id = crypto.randomUUID();
    const data = {
      action: { type: "TRADE_ACCEPT", id, expectedVersion: s.version },
    };
    const results = await Promise.all([
      f.call(1, "ACTION", data),
      f.call(1, "ACTION", data),
    ]);
    assert(results.every((r) => tradeResults(r.state).length === 1));
    assert.equal(f.store.notifications.length, 1);
    assert.equal(f.store.receipts.size, n + 1);
    const recovered = await f.service.read("ABCDEFGH", "user-0");
    assert.equal(tradeResults(recovered.state).length, 1);
  });

test("server rejects injected result metadata, stale acceptance and offline membership without adding a receipt", async () => {
  const f = await roomFixture(),
    state = f.store.rooms.get("ABCDEFGH").data.state;
  for (const extra of [
    { tradeResult: { outcome: "accepted" } },
    { expectedVersion: 0 },
  ]) {
    const id = crypto.randomUUID();
    await assert.rejects(
      f.call(1, "ACTION", {
        action: {
          type: "TRADE_ACCEPT",
          expectedVersion: state.version,
          id,
          ...extra,
        },
      }),
    );
  }
  f.store.edit("ABCDEFGH", (r) => {
    r.seats[0].connections = {};
  });
  const id = crypto.randomUUID();
  await assert.rejects(
    f.call(1, "ACTION", {
      action: { type: "TRADE_ACCEPT", expectedVersion: state.version, id },
    }),
  );
  assert.equal(
    tradeResults(f.store.rooms.get("ABCDEFGH").data.state).length,
    0,
  );
});

test("Termux bot acceptance is enriched server-side in its fenced commit; lost ACK returns the same result", async () => {
  const store = new TermuxStore(() => 1000000),
    f = await roomFixture(3, store, true),
    token = "a".repeat(64),
    workerId = crypto.randomUUID();
  store.workers.set(workerId, {
    id: workerId,
    hash: await digest(token),
    max_slots: 1,
    slots: 1,
    heartbeat: f.now,
  });
  store.jobs.set("ABCDEFGH", {
    code: "ABCDEFGH",
    version: 1,
    status: "scheduled",
    due: f.now,
    owner: null,
    until: 0,
    attempts: 0,
  });
  const service = createTermuxService({
    store,
    clock: () => f.now,
    rng: () => 0.2,
  });
  const call = (op, data = {}) =>
    service.execute(
      { op, protocol: WORKER_PROTOCOL, manifest: MODEL_MANIFEST_ID, ...data },
      token,
    );
  const { job } = await call("claim");
  assert(job);
  const payload = {
    job,
    commandId: crypto.randomUUID(),
    action: { type: "TRADE_ACCEPT" },
  };
  const first = await call("submit", payload),
    second = await call("submit", payload);
  assert(first.events.some((e) => e.tradeResult?.outcome === "accepted"));
  assert(second.duplicate);
  assert.equal(store.botActions.size, 1);
  assert.equal(tradeResults(store.rooms.get("ABCDEFGH").data.state).length, 1);
});

test("optional Edge bot adapter also preserves an exact result without changing its planner", async () => {
  const store = new BotJobStore(() => 1000000),
    f = await roomFixture(3, store, true);
  store.jobs.set("ABCDEFGH", {
    code: "ABCDEFGH",
    version: 1,
    status: "scheduled",
    due: f.now,
    owner: null,
    until: 0,
    attempts: 0,
  });
  const result = await runBotWorker({
    store,
    clock: () => f.now,
    rng: () => 0.2,
    maxSteps: 1,
    decide: async () => ({ action: { type: "TRADE_REJECT" }, status: "local" }),
  });
  assert.equal(result.committed, 1);
  assert.equal(
    tradeResults(store.rooms.get("ABCDEFGH").data.state)[0].outcome,
    "rejected",
  );
});

test("offline GameSession records the confirmed receipt and rejection does not duplicate it", async () => {
  const session = new GameSession({
    persist: async () => {},
    load: async () => null,
    mind: { dispose() {} },
  });
  session.screen = "gameplay";
  session.fast = true;
  session.ingest(tradeFixture(), { reset: true });
  // Hot-seat resolves recipient 1, then follows the returning turn; result remains in history for both.
  assert(await session.act("TRADE_ACCEPT"));
  assert.equal(tradeResults(session.state).length, 1);
  assert.equal(session.tradeResults.current.outcome, "accepted");
  assert.equal(session.tradeResults.current.seat, session.seat);
  session.dispose();
});
