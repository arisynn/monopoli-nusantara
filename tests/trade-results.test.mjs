import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  command as engine,
  publicState,
  DECKS,
} from "../lib/game.mjs";
import { commandWithTradeResult as command } from "../lib/trade-command.mjs";
import { TradeResults, renderTradeResult } from "../frontend/trade-results.mjs";
import { lead } from "../frontend/popups.mjs";
import { GameSession } from "../frontend/session.mjs";
import { advanceTimeline } from "../lib/presentation-timeline.mjs";
import { applyOperation } from "../lib/server/online-room.mjs";

const make = () => {
  const s = createGame(
    {
      matchId: crypto.randomUUID(),
      startingRoll: false,
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
const act = (s, actor, type, data = {}) =>
  command(
    s,
    actor,
    { type, ...data, id: crypto.randomUUID(), expectedVersion: s.version },
    () => 0.2,
  );
const storage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
  };
};
const result = (s) => s.log.find((e) => e.tradeResult).tradeResult;
const plain = (s) => ({
  ...s,
  log: s.log.map(({ tradeResult, tradeOffer, ...e }) => e),
});

test("trade wrapper adds metadata only; official economy, memory, RNG and versions are unchanged", () => {
  const s = make(),
    before = structuredClone(s);
  const offer = {
    type: "OFFER",
    trade: deal,
    id: "offer",
    expectedVersion: s.version,
  };
  const offered = command(s, 0, offer, () => 0.2);
  assert.deepEqual(plain(offered), plain(engine(s, 0, offer, () => 0.2)));
  assert.deepEqual(s, before);
  for (const [actor, type] of [
    [1, "TRADE_ACCEPT"],
    [1, "TRADE_REJECT"],
    [0, "TRADE_REJECT"],
  ]) {
    const action = {
      type,
      id: `resolve-${actor}-${type}`,
      expectedVersion: offered.version,
    };
    const done = command(offered, actor, action, () => 0.2);
    assert.deepEqual(
      plain(done),
      plain(engine(offered, actor, action, () => 0.2)),
    );
    assert.equal(result(done).offerId, offered.log[0].tradeOffer.id);
    assert.deepEqual(
      publicState(done).log.find((e) => e.tradeResult).tradeResult,
      result(done),
    );
    assert.strictEqual(
      command(done, actor, action, () => {
        throw Error("duplicate RNG");
      }),
      done,
    );
  }
});

test("accepted receipt includes both directions, cash, jail cards and the original mortgage status", () => {
  const s = make();
  s.assets[31].mortgaged = true;
  const idx = DECKS.chance.findIndex((c) => c.jailCard);
  s.players[1].cards = [{ deck: "chance", idx }];
  s.decks.chance = s.decks.chance.filter((i) => i !== idx);
  const offered = act(s, 0, "OFFER", { trade: { ...deal, takeCards: 1 } });
  const done = act(offered, 1, "TRADE_ACCEPT");
  const r = result(done);
  assert.equal(done.trade, null);
  assert.equal(done.phase, "mortgage");
  assert.deepEqual(r.take, [{ tile: 31, mortgaged: true }]);
  assert.equal(r.takeCards, 1);
  assert.equal(done.players[0].cash, 15300);
  assert.equal(done.assets[31].owner, 0);
  const a = renderTradeResult({ ...r, fromName: "Ayu", toName: "Bima" }, 0, {
    lead,
  }).html;
  const b = renderTradeResult({ ...r, fromName: "Ayu", toName: "Bima" }, 1, {
    lead,
  }).html;
  assert(a.indexOf("Makassar") < a.indexOf("Anda memberi"));
  assert(b.indexOf("Bogor") < b.indexOf("Anda memberi"));
  assert(
    a.includes("1 kartu bebas penjara") && a.includes("Digadai saat transaksi"),
  );
  const copy = structuredClone(r);
  done.assets[31].mortgaged = false;
  assert.deepEqual(r, copy);
});

test("counteroffers resolve from the new sender perspective, not as rejected original offers", () => {
  const s = make(),
    n = new TradeResults({ storage: null });
  n.ingest(s, 0);
  const offered = act(s, 0, "OFFER", { trade: deal });
  const counter = act(offered, 1, "COUNTER", {
    trade: {
      ...deal,
      to: 0,
      give: [31],
      take: [1],
      giveCash: 100,
      takeCash: 300,
    },
  });
  n.ingest(counter, 0);
  assert.equal(n.current, null);
  const done = act(counter, 0, "TRADE_ACCEPT");
  n.ingest(done, 0);
  assert.equal(n.current.from, 1);
  assert.equal(n.current.status, "accepted");
  assert.equal(result(done).offerId, counter.log[0].tradeOffer.id);
});

test("reject and sender cancellation are distinct, with no invented transfer or bot explanation", () => {
  const s = make(),
    offered = act(s, 0, "OFFER", { trade: deal });
  for (const [actor, status, word] of [
    [1, "rejected", "ditolak"],
    [0, "cancelled", "dibatalkan"],
  ]) {
    const done = act(offered, actor, "TRADE_REJECT"),
      r = result(done);
    assert.equal(r.status, status);
    assert.deepEqual(
      done.players.map((p) => p.cash),
      s.players.map((p) => p.cash),
    );
    assert.deepEqual(done.assets, s.assets);
    const markup = renderTradeResult(
      { ...r, fromName: "Ayu", toName: "Bima" },
      0,
      { lead },
    );
    assert(markup.title.includes(word));
    assert(!markup.html.includes("Anda menerima"));
    assert(markup.html.includes("Tidak ada uang, properti, atau kartu"));
  }
});

test("both humans receive one result; spectators, bots, offers, stale polls and private entries do not", () => {
  const s = make(),
    offered = act(s, 0, "OFFER", { trade: deal }),
    done = act(offered, 1, "TRADE_ACCEPT");
  for (const seat of [0, 1, 2]) {
    const n = new TradeResults({ storage: null });
    n.ingest(s, seat);
    n.ingest(offered, seat);
    assert.equal(n.current, null);
    n.ingest(done, seat);
    n.ingest(done, seat);
    n.ingest(s, seat);
    assert.equal(n.queue.length, seat === 2 ? 0 : 1);
  }
  const n = new TradeResults({ storage: null });
  n.ingest(done, 0);
  assert.equal(n.current, null, "first join cannot replay old results");
  const bot = structuredClone(done);
  bot.players[0].controller = "bot";
  n.ingest(bot, 0);
  assert.equal(n.current, null);
  const privateOnly = structuredClone(done);
  privateOnly.log.find((e) => e.tradeResult).audience = "private";
  const hidden = new TradeResults({ storage: null });
  hidden.ingest(s, 0);
  hidden.ingest(privateOnly, 0);
  assert.equal(hidden.current, null);
});

test("unread results survive refresh/reset, are read once, and never replay future receipts on a save rewind", () => {
  const store = storage(),
    s = make(),
    n = new TradeResults({ storage: store });
  n.ingest(s, 0);
  const done = act(act(s, 0, "OFFER", { trade: deal }), 1, "TRADE_ACCEPT");
  n.ingest(done, 0);
  const restored = new TradeResults({ storage: store });
  restored.ingest(done, 0, { reset: true });
  assert.equal(restored.current.id, n.current.id);
  assert(!restored.dismiss("stale-callback"));
  assert(restored.dismiss(restored.current.id));
  const refreshed = new TradeResults({ storage: store });
  refreshed.ingest(done, 0);
  assert.equal(refreshed.current, null);
  n.ingest(s, 0, { reset: true });
  assert.equal(n.current, null);
  const another = make();
  n.ingest(another, 0);
  assert.equal(n.current, null);
});

test("a batched online poll can skip the active offer and still deliver its exact receipt", () => {
  const s = make(),
    n = new TradeResults({ storage: null });
  n.ingest(s, 0);
  const done = act(act(s, 0, "OFFER", { trade: deal }), 1, "TRADE_ACCEPT");
  n.ingest(publicState(done), 0);
  assert.deepEqual(n.current.take, [{ tile: 31, mortgaged: false }]);
  assert.equal(n.current.takeCash, 500);
  for (let i = 0; i < 8; i++) {
    const offered = act(done, 0, "OFFER", {
      trade: { ...deal, give: [31], take: [1] },
    });
    const rejected = act(offered, 1, "TRADE_REJECT");
    // Independent events, same participants, monotonically advancing versions.
    done.version = rejected.version;
    done.eventId = rejected.eventId;
    done.log = rejected.log;
    n.ingest(done, 0);
  }
  assert.equal(
    n.queue.length,
    9,
    "must not use the four-item toast truncation",
  );
});

test("missing storage, denied writes, corrupt entries and player name markup cannot break a result", () => {
  const broken = {
    getItem: () => "not-json",
    setItem: () => {
      throw Error("denied");
    },
  };
  const s = make(),
    n = new TradeResults({ storage: broken });
  n.ingest(s, 0);
  const done = act(act(s, 0, "OFFER", { trade: deal }), 1, "TRADE_ACCEPT");
  done.players[1].name = '<img src=x onerror="boom">';
  n.ingest(done, 0);
  const markup = renderTradeResult(n.current, 0, { lead }).html;
  assert(!markup.includes("<img"));
  assert(markup.includes("&lt;img"));
  assert(n.dismiss(n.current.id));
});

test("local session waits for confirmed presentation, then holds bots without an auto-dismiss timer", () => {
  const s = make(),
    session = new GameSession({
      mind: { dispose() {} },
      persist: async () => {},
    });
  session.screen = "gameplay";
  session.ingest(s, { reset: true });
  const done = act(act(s, 0, "OFFER", { trade: deal }), 1, "TRADE_ACCEPT");
  session.ingest(done);
  assert.equal(session.tradeResultReady, null);
  while (session.head)
    session.model = advanceTimeline(session.model, session.head.id);
  assert.equal(session.tradeResultReady.status, "accepted");
  session.schedule();
  assert.equal(session.botTimer, null);
  assert.equal(session.timer, null);
  const snapshot = structuredClone(session.state);
  assert(session.dismissTradeResult(session.tradeResultReady.id));
  assert.deepEqual(
    session.state,
    snapshot,
    "reading a result cannot execute any game action",
  );
  session.dispose();
});

test("online ACTION wraps the same engine and returns structured results through public state", () => {
  const s = make(),
    now = Date.now();
  const room = {
    state: s,
    status: "playing",
    vote: null,
    seats: s.players.map((p) => ({
      ...p,
      userId: `user-${p.id}`,
      connections: { tab: now },
    })),
  };
  const run = (seat, type, extra = {}) =>
    applyOperation(
      room,
      seat,
      {
        type: "ACTION",
        action: {
          type,
          id: crypto.randomUUID(),
          expectedVersion: room.state.version,
          ...extra,
        },
      },
      now,
      () => 0.2,
    );
  run(0, "OFFER", { trade: deal });
  run(1, "TRADE_ACCEPT");
  assert.equal(result(publicState(room.state)).status, "accepted");
  assert.equal(room.state.assets[31].owner, 0);
});
