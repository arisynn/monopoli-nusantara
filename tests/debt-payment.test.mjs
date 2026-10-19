import test from "node:test";
import assert from "node:assert/strict";
import { command, publicState, GROUPS, stock } from "../lib/game.mjs";
import { debtAdvice } from "../frontend/debt-advisor.mjs";
import { GameSession } from "../frontend/session.mjs";
import { renderPopup } from "../frontend/popups.mjs";
import { debtFixture } from "./helpers/gameplay-update-fixtures.mjs";
async function run(instance) {
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (instance.assetFeedback) instance.complete(instance.head.id);
    if (instance.assetPlan?.status !== "running") return;
  }
  assert.fail("Debt plan did not finish");
}
function session(t, state = debtFixture()) {
  const s = new GameSession({
    persist: async () => {},
    archive: async () => {},
    load: async () => null,
    mind: { decide: async () => null, dispose() {} },
    random: () => 0.2,
  });
  s.screen = "gameplay";
  s.hidden = false;
  s.ingest(state, { reset: true });
  s.setCovered(true, { assets: true });
  t.after(() => s.dispose());
  return s;
}
test("automatic rent payment protects full sets, raises only necessary funds and pays exactly once", async (t) => {
  const s = session(t),
    before = JSON.stringify(s.state),
    advice = debtAdvice(s.state, 0);
  assert(advice.available);
  assert.equal(JSON.stringify(s.state), before);
  assert.deepEqual(debtAdvice(publicState(s.state), 0).actions, advice.actions);
  assert(s.startDebtPayment());
  assert(!s.startDebtPayment());
  await run(s);
  assert.equal(s.assetPlan.status, "complete");
  assert.notEqual(s.state.phase, "debt");
  assert.equal(s.state.players[0].cash, 200);
  assert.equal(s.state.players[1].cash, 15800);
  assert(s.state.assets[6].mortgaged && s.state.assets[8].mortgaged);
  assert(!s.state.assets[1].mortgaged && !s.state.assets[3].mortgaged);
  assert.equal(s.state.version, 3);
});
test("automatic payment handles hotel shortage with legal set liquidation", () => {
  const s = debtFixture();
  for (const id of [6, 8]) s.assets[id].owner = 1;
  for (const id of GROUPS[0].ids) s.assets[id].level = 5;
  for (const group of [GROUPS[1], GROUPS[2]])
    for (const id of group.ids)
      s.assets[id] = { owner: 1, level: 4, mortgaged: false };
  for (const id of GROUPS[3].ids)
    s.assets[id] = { owner: 1, level: 2, mortgaged: false };
  s.debt.amount = 1500;
  s.bank = stock(s);
  assert.equal(s.bank.houses, 2);
  const plan = debtAdvice(s, 0);
  assert(plan.available);
  assert(plan.actions.some((a) => a.type === "SELL_SET"));
  let next = s;
  for (const a of plan.actions) next = command(next, 0, a, () => 0.2);
  next = command(next, 0, { type: "PAY" }, () => 0.2);
  assert.notEqual(next.phase, "debt");
});
test("unfundable bills do not liquidate partially or declare bankruptcy automatically", () => {
  const s = debtFixture();
  s.debt.amount = 1000000;
  const before = JSON.stringify(s);
  assert(!debtAdvice(s, 0).available);
  assert.equal(JSON.stringify(s), before);
  const popup = renderPopup(
    { state: s, view: s, seat: 0, pending: false, paused: false },
    {},
    { kind: "debt" },
  );
  assert(popup.footer.includes("autoPayDebt"));
  assert(!popup.footer.includes('data-type="PAY"'));
  assert(!popup.html.includes("Gadai otomatis"));
});
test("close, hidden page and changed revision stop automatic funding before new commands", async (t) => {
  for (const mode of ["close", "hidden", "version"]) {
    const s = session(t);
    assert(s.startDebtPayment());
    if (mode === "close") s.setCovered(false);
    if (mode === "hidden") s.setVisible(false);
    if (mode === "version")
      s.state = { ...s.state, version: s.state.version + 1 };
    await run(s);
    assert.equal(s.assetPlan.status, "stopped");
    assert.equal(s.state.players[0].cash, 0);
    assert(!s.state.assets[6].mortgaged);
  }
});
test("online auto-payment sends legal individual commands, fresh versions and unique IDs", async (t) => {
  const s = session(t);
  let authoritative = structuredClone(s.state);
  const actions = [];
  const room = {
    code: "ABCDEFGH",
    seat: 0,
    userId: "human",
    state: publicState(authoritative),
    seats: authoritative.players,
    status: "playing",
    host: 0,
    capacity: 2,
    roomRevision: 0,
  };
  s.room = { code: "ABCDEFGH", seat: 0, userId: "human" };
  s.online = room;
  s.connected = true;
  s.auth = {
    session: () => ({ user: { id: "human" } }),
    request: async (_path, body) => {
      actions.push(body.action);
      authoritative = command(authoritative, 0, body.action, () => 0.2);
      return {
        ...room,
        state: publicState(authoritative),
        roomRevision: actions.length,
      };
    },
  };
  assert(s.startDebtPayment());
  await run(s);
  assert.equal(s.assetPlan.status, "complete");
  assert.deepEqual(
    actions.map((a) => a.type),
    ["MORTGAGE", "MORTGAGE", "PAY"],
  );
  assert.deepEqual(
    actions.map((a) => a.expectedVersion),
    [0, 1, 2],
  );
  assert.equal(new Set(actions.map((a) => a.id)).size, 3);
});
test("Assets exposes only owned portfolio, development and manual mortgage controls", () => {
  const s = debtFixture(),
    popup = renderPopup(
      { state: s, view: s, seat: 0, pending: false, paused: false },
      { assetTab: "mortgage" },
      { kind: "assets", id: 0 },
    );
  assert(!popup.html.includes("Gadai otomatis"));
  assert(!popup.html.includes("mortgageTarget"));
  assert(!popup.html.includes("autoMortgage"));
  assert(popup.html.includes('data-type="MORTGAGE"'));
  assert(popup.html.includes('data-value="build"'));
});
