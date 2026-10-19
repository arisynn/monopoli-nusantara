import test from "node:test";
import assert from "node:assert/strict";
import { createGame, command } from "../lib/game.mjs";
import { GameSession } from "../frontend/session.mjs";
import { GameNotices, CardReader, readingTime } from "../frontend/feedback.mjs";
import {
  decisionFooter,
  passivePopup,
  readingCard,
} from "../frontend/popup-controls.mjs";
import { copyRoomCode } from "../frontend/clipboard.mjs";
import {
  buildOrderSelection,
  renderBuildOrder,
} from "../frontend/asset-panel.mjs";
import { btn, lead } from "../frontend/popups.mjs";
import { renderPopup } from "../frontend/popups.mjs";

const make = () =>
  createGame(
    {
      players: [{ name: "Ayu" }, { name: "Bima" }],
      startingRoll: false,
      matchId: "ui-4114",
    },
    () => 0.2,
  );
const received = (s, id, from = 1, to = 0) => ({
  ...s,
  version: s.version + 1,
  eventId: id,
  log: [
    {
      id,
      type: "money",
      text: "Sewa lunas",
      finance: [{ kind: "rent", from, to, amount: 100, tile: 1 }],
    },
    ...s.log,
  ],
});

test("receipts deduplicate snapshots and aggregate bursts, without inventing a rent claim", () => {
  const notices = new GameNotices(),
    state = make();
  notices.ingest(state, 0, true);
  const claim = {
    ...state,
    version: 1,
    rentClaims: [{ id: "claim", from: 1, to: 0, tile: 1, amount: 100 }],
  };
  notices.ingest(claim, 0);
  assert.equal(notices.current, null);
  let next = received(claim, state.eventId + 1);
  notices.ingest(next, 0);
  notices.ingest(next, 0);
  assert.equal(notices.current.amount, 100);
  assert.equal(notices.queue.length, 1);
  for (let i = 0; i < 30; i++) {
    next = received(next, next.eventId + 1);
    notices.ingest(next, 0);
  }
  assert.equal(notices.current.count, 31);
  assert.equal(notices.current.amount, 3100);
  assert.equal(notices.queue.length, 1);
  assert.equal(state.players[0].cash, 15000);
  notices.ingest(next, 0, true);
  assert.equal(notices.current, null);
  notices.ingest(received(next, next.eventId + 1), 1);
  assert.equal(notices.current.kind, "payment");
  notices.dispose();
});
test("baseline, old revision, match changes and observers cannot replay received rent", () => {
  const n = new GameNotices(),
    a = make(),
    b = received(a, a.eventId + 1);
  n.ingest(b, 0, true);
  n.ingest(a, 0);
  n.ingest(b, 0);
  assert.equal(n.queue.length, 0);
  n.ingest({ ...received(b, b.eventId + 1), matchId: "another" }, 0);
  assert.equal(n.current, null);
  const bot = {
    ...b,
    players: b.players.map((p) => ({ ...p, controller: "bot" })),
  };
  n.ingest(bot, 0, true);
  n.ingest(received(bot, bot.eventId + 1), 0);
  assert.equal(n.current, null);
  n.dispose();
});
test("notice time pauses while hidden or a decision covers it and remains bounded", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const n = new GameNotices();
  n.push({ id: "rent", kind: "rent", duration: 2800, amount: 100, count: 1 });
  n.sync(true);
  t.mock.timers.tick(1000);
  n.sync(false);
  t.mock.timers.tick(20000);
  assert.equal(n.current.remaining, 1800);
  n.sync(true);
  t.mock.timers.tick(1799);
  assert(n.current);
  t.mock.timers.tick(1);
  assert.equal(n.current, null);
  for (let i = 0; i < 50; i++) n.push({ id: i, kind: "event", duration: 2300 });
  assert.equal(n.queue.length, 4);
  n.dispose();
});
test("card reading time scales with text and a revealed card gets only one auto attempt", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  assert.equal(readingTime("singkat"), 2300);
  assert.equal(readingTime("kata ".repeat(200)), 6500);
  const s = make();
  s.phase = "card";
  s.card = {
    deck: "community",
    idx: 0,
    player: 0,
    title: "Hadiah",
    text: "Terima Nusa.",
  };
  const reader = new CardReader();
  let calls = 0;
  const ack = async () => {
    calls++;
    return true;
  };
  reader.sync(s, 0, true, ack);
  t.mock.timers.tick(1000);
  reader.sync(s, 0, false, ack);
  t.mock.timers.tick(20000);
  assert.equal(calls, 0);
  reader.sync(s, 0, true, ack);
  t.mock.timers.tick(1300);
  await Promise.resolve();
  assert.equal(calls, 1);
  reader.sync({ ...s, version: 20 }, 0, true, ack);
  t.mock.timers.tick(9000);
  assert.equal(calls, 1);
  reader.dispose();
});
test("failed card acknowledgement does not retry in a loop, or decide debt/buy/auction/trade", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const s = make(),
    r = new CardReader();
  let calls = 0;
  s.phase = "card";
  s.card = { deck: "chance", idx: 1, player: 0, title: "Kartu", text: "Baca." };
  const fail = async () => {
    calls++;
    return false;
  };
  r.sync(s, 0, true, fail);
  t.mock.timers.tick(2300);
  await Promise.resolve();
  assert(r.failed);
  for (const phase of [
    "card",
    "buy",
    "debt",
    "auction",
    "trade",
    "mortgage",
    "jail",
  ]) {
    r.sync({ ...s, phase }, 0, true, fail);
    t.mock.timers.tick(10000);
  }
  assert.equal(calls, 1);
  r.dispose();
});
test("online auto ACK uses the original action/version/controller protection; concurrent tap sends once", async (t) => {
  const session = new GameSession({
    persist: async () => {},
    load: async () => null,
    mind: { dispose() {} },
  });
  t.after(() => session.dispose());
  session.hidden = true;
  session.screen = "gameplay";
  session.room = { code: "ABCDEFGH", seat: 0, userId: "user" };
  session.connected = true;
  session.online = { status: "playing", held: false, roomRevision: 0 };
  const card = command(make(), 0, { type: "ROLL" }, () => 0);
  assert.equal(card.phase, "card");
  session.ingest(card, { reset: true });
  let calls = 0,
    resolve,
    body;
  session.auth = {
    session: () => ({ user: { id: "user" } }),
    request: (_path, b) => {
      calls++;
      body = b;
      return new Promise((r) => (resolve = r));
    },
  };
  session.hidden = false;
  session.cardReader.remaining = 0;
  session.notify();
  // sync() initializes a card's reading duration once, then the controlled timer is shortened.
  session.cardReader.dispose();
  session.cardReader.remaining = 0;
  session.notify();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 1);
  assert.equal(body.action.type, "ACK");
  assert.equal(body.action.expectedVersion, card.version);
  assert(body.action.id);
  assert.equal(await session.act("ACK"), false);
  const done = command(card, 0, body.action, () => 0.2);
  resolve({
    code: "ABCDEFGH",
    seat: 0,
    status: "playing",
    held: false,
    roomRevision: 1,
    state: done,
    seats: done.players,
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(session.state.version, card.version + 1);
  assert.equal(calls, 1);
});
test("observer and worker-offline/paused card sessions cannot send an automatic ACK", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const r = new CardReader(),
    s = make();
  let calls = 0;
  s.phase = "card";
  s.card = { deck: "chance", idx: 1, player: 1, title: "Card", text: "Read" };
  r.sync(s, 0, true, async () => {
    calls++;
    return true;
  });
  t.mock.timers.tick(9000);
  r.sync(s, 1, false, async () => {
    calls++;
    return true;
  });
  t.mock.timers.tick(9000);
  assert.equal(calls, 0);
  r.dispose();
});
test("footer cleanup removes only dismissal, preserves every real decision, and cards have no close", () => {
  const html =
    '<button data-action="close">Tutup</button><button data-action="command" data-type="PASS">Pass</button><button data-action="saveTradeDraft">Simpan draft</button><button data-action="command" data-type="TRADE_REJECT">Tolak</button>';
  const result = decisionFooter(html);
  assert(!result.includes('data-action="close"'));
  assert(!result.includes("saveTradeDraft"));
  assert(result.includes("PASS"));
  assert(result.includes("TRADE_REJECT"));
  assert(passivePopup({ kind: "settlement" }));
  assert(!passivePopup({ kind: "event", interactive: true }));
  assert(readingCard({ kind: "card" }));
  assert(!readingCard({ kind: "won" }));
});
test("assets separate property inspection, one build control per group and all mortgage actions", () => {
  const s = make();
  for (const id of [1, 3, 5]) s.assets[id].owner = 0;
  s.assets[5].mortgaged = true;
  const context = { state: s, view: s, seat: 0, busy: false };
  const render = (ui) =>
    renderPopup(context, ui, { kind: "assets", id: 0 }).html;
  const all = render({ assetTab: "all" }),
    build = render({ assetTab: "build" }),
    available = render({ assetTab: "mortgage" }),
    held = render({ assetTab: "mortgage", mortgageFilter: "held" });
  assert(!all.includes('data-type="MORTGAGE"'));
  assert(!all.includes('data-type="REDEEM"'));
  assert(!all.includes("Bangun di kelompok"));
  assert(all.includes("Pegadaian"));
  assert.equal((build.match(/data-action="buildOrder"/g) || []).length, 1);
  assert(!build.includes('data-type="BUILD"'));
  assert(!build.includes('name="buildTarget-0"'));
  assert(!build.includes('name="buildCount-0"'));
  assert(available.includes('data-type="MORTGAGE"'));
  assert(!available.includes('data-type="REDEEM"'));
  assert(held.includes('data-type="REDEEM"'));
  assert(held.includes("bunga"));
  const observer = renderPopup(
    { ...context, seat: 1 },
    { assetTab: "mortgage" },
    { kind: "assets", id: 0 },
  ).html;
  assert(!observer.includes('data-type="MORTGAGE"'));
  assert(!observer.includes('data-type="REDEEM"'));
});
test("clipboard copies a pure code, falls back on denial, and never reports false success", async () => {
  const copies = [];
  const nav = { clipboard: { writeText: async (text) => copies.push(text) } };
  assert(await copyRoomCode("xkl5by56", { doc: {}, nav }));
  assert.deepEqual(copies, ["XKL5BY56"]);
  let selected = false,
    removed = false,
    restored = false;
  const field = {
    style: {},
    focus() {},
    select() {
      selected = true;
    },
    remove() {
      removed = true;
    },
  };
  const doc = {
    activeElement: {
      focus() {
        restored = true;
      },
    },
    createElement: () => field,
    querySelector: () => null,
    body: { append() {} },
    execCommand: () => true,
  };
  assert(
    await copyRoomCode("XKL5BY56", {
      doc,
      nav: {
        clipboard: {
          writeText: async () => {
            throw Error("denied");
          },
        },
      },
    }),
  );
  assert(selected && removed && restored);
  assert.equal(field.value, "XKL5BY56");
  doc.execCommand = () => false;
  assert.equal(await copyRoomCode("XKL5BY56", { doc, nav: {} }), false);
  assert.equal(
    await copyRoomCode("https://example.com/?room=XKL5BY56", { doc, nav }),
    false,
  );
});

test("build quantity lives in its own popup; one targeted build and multiple even builds use the same validator", () => {
  const s = make();
  for (const id of [1, 3]) s.assets[id].owner = 0;
  const before = JSON.stringify(s),
    session = { state: s, view: s, seat: 0, busy: false };
  const popup = { group: 0 },
    ui = { buildCounts: { 0: 1 }, buildTargets: { 0: 3 } };
  const one = buildOrderSelection(s, 0, 0, 1, 3);
  assert(one.valid);
  assert.deepEqual(one.tiles, [3]);
  const rendered = renderBuildOrder(session, ui, popup, { btn, lead });
  assert(rendered.html.includes('name="buildCount-0"'));
  assert(rendered.html.includes('name="buildTarget-0"'));
  assert(rendered.footer.includes('data-action="submitBuildOrder"'));
  const many = buildOrderSelection(s, 0, 0, 3, 3);
  assert(many.valid);
  assert.deepEqual(many.tiles, [1, 3, 1]);
  assert.equal(JSON.stringify(s), before);
});
test("changing stock, ownership or cash invalidates a build selection without silently reducing the requested count", () => {
  const s = make();
  for (const id of [1, 3]) s.assets[id].owner = 0;
  s.players[0].cash = 500;
  assert(!buildOrderSelection(s, 0, 0, 2, 1).valid);
  const rendered = renderBuildOrder(
    { state: s, view: s, seat: 0, busy: false },
    { buildCounts: { 0: 2 } },
    { group: 0 },
    { btn, lead },
  );
  assert(rendered.html.includes('value="2" selected disabled'));
  assert(rendered.footer.includes("disabled"));
  assert(!buildOrderSelection(s, 0, 0, 1, 5).valid);
  assert(!buildOrderSelection(s, 0, 0, 1.5, 1).valid);
});
test("manual rent is silent until a real CLAIM_RENT commits the transfer", () => {
  let s = createGame(
    {
      players: [{ name: "Ayu" }, { name: "Raka" }],
      rules: "classic",
      startingRoll: false,
    },
    () => 0.2,
  );
  s.turn = 1;
  s.players[1].pos = 39;
  s.assets[1].owner = 0;
  const notices = new GameNotices();
  notices.ingest(s, 0, true);
  s = command(s, 1, { type: "ROLL" }, () => 0);
  assert.equal(s.rentClaims.length, 1);
  notices.ingest(s, 0);
  assert.equal(notices.queue.filter((n) => n.kind === "rent").length, 0);
  const before = s.players[0].cash;
  s = command(s, 0, { type: "CLAIM_RENT", claimId: s.rentClaims[0].id });
  notices.ingest(s, 0);
  assert.equal(
    notices.queue.find((n) => n.kind === "rent").amount,
    s.players[0].cash - before,
  );
  notices.dispose();
});
test("log truncation cannot re-arm automatic ACK for the same revealed card", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const s = make(),
    reader = new CardReader();
  let attempts = 0;
  s.phase = "card";
  s.card = {
    deck: "chance",
    idx: 1,
    player: 0,
    revealId: 100,
    title: "Kartu",
    text: "Baca.",
  };
  s.log = [{ id: 100, type: "card", card: s.card }];
  const ack = async () => {
    attempts++;
    return false;
  };
  reader.sync(s, 0, true, ack);
  t.mock.timers.tick(2300);
  await Promise.resolve();
  reader.sync({ ...s, version: 100, log: [] }, 0, true, ack);
  t.mock.timers.tick(10000);
  assert.equal(attempts, 1);
  reader.dispose();
});
