import test from "node:test";
import assert from "node:assert/strict";
import { createGame, command, BOARD } from "../lib/game.mjs";
import { planDecision } from "../lib/bot/strategy.mjs";
import { decidePersona } from "../lib/bot/persona-router.mjs";
import {
  situationOf,
  STRATEGY_EXPERTS,
  NUSA_MODEL_VERSION,
  expandNusaCandidates,
  decideNusa,
} from "../lib/bot/nusa-v7/index.mjs";
const setup = () =>
  createGame(
    {
      players: [
        { name: "NUSA", controller: "bot", botPersona: "nusa" },
        { name: "BIMA", controller: "bot", botPersona: "bima" },
        { name: "RAKA", controller: "bot", botPersona: "raka" },
      ],
      startingRoll: false,
      matchId: "nusa18-test",
    },
    () => 0.2,
  );
const own = (s, id, player = 0) => {
  s.assets[id].owner = player;
};
test("NUSA V18 exposes 38 experts and is selected by the real persona router", () => {
  assert.equal(NUSA_MODEL_VERSION, "18.0.0");
  assert.equal(STRATEGY_EXPERTS.length, 38);
  for (const id of [
    "crossPhaseTrade",
    "collusionInterdictor",
    "counterHijacker",
    "psychProfiler",
  ])
    assert(STRATEGY_EXPERTS.some((e) => e.id === id));
  const s = setup(),
    p = decidePersona(s, 0, { timeBudgetMs: 80 });
  assert.equal(p.diagnostics.model, "NUSA-V18.0-SINGULARITY");
  assert.doesNotThrow(() => command(s, 0, p.action));
});
test("V18 can offer an isolated deed during buy, then resume the same purchase after acceptance", () => {
  let s = setup();
  for (const id of [16, 18, 13]) own(s, id);
  for (const id of [16, 18]) s.assets[id].mortgaged = true;
  s.players[0].cash = 1000;
  s.phase = "buy";
  s.buy = 19;
  const before = JSON.stringify(s),
    plan = planDecision(s, 0);
  assert(situationOf(s, 0, plan).needsPreBuyTrade);
  expandNusaCandidates(s, 0, plan);
  const proposal = plan.candidates.find((c) =>
    c.action.actionId?.startsWith("nusa-buyphase-trade"),
  );
  assert(proposal);
  assert.equal(
    decideNusa(s, 0, plan, { mode: "council" }).action.type,
    "OFFER",
  );
  assert.equal(JSON.stringify(s), before);
  s = command(s, 0, proposal.action);
  assert.equal(s.phase, "trade");
  s = command(s, s.trade.to, { type: "TRADE_ACCEPT" });
  assert.equal(s.phase, "buy");
  assert.equal(s.buy, 19);
  s = command(s, 0, { type: "BUY" });
  assert.equal(s.assets[19].owner, 0);
  assert.equal(s.assets[13].owner, 1);
});
test("V18 detects a rival bridge from public ownership and reads only public opponent profiles", () => {
  const s = setup();
  own(s, 16, 1);
  own(s, 18, 1);
  own(s, 19, 2);
  s.botMemory = {
    version: 1,
    players: { 1: { secret: "must-not-leak" } },
    opponents: { 1: { observations: 8, aggression: 1.6, groups: { 2: 3 } } },
  };
  const c = situationOf(s, 0, planDecision(s, 0));
  assert(c.collusionTargetTiles.has(19));
  assert.equal(c.collusionMap.get(19).threatRivalId, 1);
  assert.equal(c.collusionMap.get(19).holderRivalId, 2);
  assert(c.opponentProfiles.has(1));
  assert(!JSON.stringify(c.view).includes("must-not-leak"));
});
test("reverse counteroffer uses the correct sender/receiver direction and can acquire a monopoly", () => {
  let s = setup();
  own(s, 16);
  own(s, 18);
  own(s, 19, 1);
  own(s, 13, 1);
  s.turn = 1;
  s = command(s, 1, {
    type: "OFFER",
    trade: {
      to: 0,
      give: [13],
      take: [],
      giveCash: 0,
      takeCash: 5000,
      giveCards: 0,
      takeCards: 0,
    },
  });
  const action = {
    type: "COUNTER",
    trade: {
      to: 1,
      give: [],
      take: [19],
      giveCash: 2500,
      takeCash: 0,
      giveCards: 0,
      takeCards: 0,
    },
  };
  const c = situationOf(s, 0, planDecision(s, 0)),
    signal = STRATEGY_EXPERTS.find((e) => e.id === "counterHijacker").assess(
      c,
      action,
    );
  assert(signal?.signal > 0);
  s = command(s, 0, action);
  assert.equal(s.trade.from, 0);
  assert.equal(s.trade.to, 1);
  s = command(s, 1, { type: "TRADE_ACCEPT" });
  assert.equal(s.assets[19].owner, 0);
  assert.equal(s.players[0].cash, 12500);
  assert.equal(s.players[1].cash, 17500);
});
test("jail-card sweeteners preserve cash and transfer only an actually held card", () => {
  let s = setup();
  own(s, 13);
  own(s, 6, 1);
  for (const t of BOARD.filter(
    (t) => t.price && s.assets[t.id].owner === null,
  ).slice(0, 20))
    own(s, t.id, 2);
  s.players[0].cards = [{ deck: "chance", idx: 15 }];
  s.decks.chance = s.decks.chance.filter((i) => i !== 15);
  s.botMemory = {
    version: 1,
    players: {},
    opponents: { 1: { observations: 10, groups: { 2: 4 }, aggression: 1 } },
  };
  s.phase = "end";
  const action = {
    type: "OFFER",
    trade: {
      to: 1,
      give: [13],
      take: [6],
      giveCash: 0,
      takeCash: 0,
      giveCards: 1,
      takeCards: 0,
    },
  };
  const c = situationOf(s, 0, planDecision(s, 0));
  assert(c.canGiveJailCardSweetener);
  const signal = STRATEGY_EXPERTS.find((e) => e.id === "psychProfiler").assess(
    c,
    action,
  );
  assert(signal?.signal > 0);
  const cash = s.players.map((p) => p.cash);
  s = command(s, 0, action);
  s = command(s, 1, { type: "TRADE_ACCEPT" });
  assert.deepEqual(
    s.players.map((p) => p.cash),
    cash,
  );
  assert.equal(s.players[0].cards.length, 0);
  assert.equal(s.players[1].cards.length, 1);
});
