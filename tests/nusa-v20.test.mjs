import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGame, command, BOARD } from "../lib/game.mjs";
import { AUCTION_RULES, auctionMinimum } from "../lib/content.mjs";
import { planDecision } from "../lib/bot/strategy.mjs";
import { decidePersona } from "../lib/bot/persona-router.mjs";
import {
  situationOf,
  STRATEGY_EXPERTS,
  NUSA_MODEL_VERSION,
  expandNusaCandidates,
  decideNusa,
  getAuctionQuantum,
  solveOptimalTradeCash,
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
      matchId: "nusa20-test",
    },
    () => 0.2,
  );
const own = (s, id, player = 0) => {
  s.assets[id].owner = player;
};
test("NUSA V20 exposes 46 experts and is selected by the real persona router", () => {
  assert.equal(NUSA_MODEL_VERSION, "20.0.0");
  assert.equal(STRATEGY_EXPERTS.length, 46);
  for (const id of [
    "crossPhaseTrade",
    "collusionInterdictor",
    "counterHijacker",
    "psychProfiler",
    "stealthCloaker",
    "coalitionArbitrage",
    "doubleDeedSweep",
    "vultureHarvester",
    "povertyCloak",
    "preTradeLeverage",
    "binaryTradeSolver",
    "velocitySwap",
  ])
    assert(STRATEGY_EXPERTS.some((e) => e.id === id));
  const s = setup(),
    p = decidePersona(s, 0, { timeBudgetMs: 80 });
  assert.equal(p.diagnostics.model, "NUSA-V20.0-APOTHEOSIS");
  assert.notEqual(p.diagnostics.reason, "model_exception");
  assert.doesNotThrow(() => command(s, 0, p.action));
});
test("imported V20 preserves all 42 V19 experts and its five source hashes", () => {
  const manifest = JSON.parse(readFileSync(new URL('../NUSA_V20_IMPORTED_HASHES.json', import.meta.url)));
  assert.equal(manifest.predecessor.expertIds.length, 42);
  assert.deepEqual(manifest.predecessor.missingExpertIds, []);
  assert.equal(manifest.predecessor.addedExpertIds.length, 4);
  for (const id of manifest.predecessor.expertIds)
    assert(STRATEGY_EXPERTS.some(expert => expert.id === id), id);
  for (const [path, expected] of Object.entries(manifest.files))
    assert.equal(createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex'), expected, path);
});
test("auction quantum follows current rules and accepts legacy non-multiple amounts", () => {
  let s = command(setup(), 0, {type:'ROLL'}, () => 0);
  // Construct a bank auction through the real purchase command flow.
  s.phase = 'buy'; s.buy = 13;
  s = command(s, 0, {type:'AUCTION'});
  for (const amount of [0, 50, 110]) {
    const state = structuredClone(s);
    state.auction.amount = amount;
    if (amount) state.auction.highest = 1;
    const quantum = getAuctionQuantum(state, 0);
    assert.equal(quantum.step, AUCTION_RULES.increment);
    assert.equal(quantum.minBid, auctionMinimum(state.auction));
    assert.doesNotThrow(() => command(state, 0, {type:'BID', amount:quantum.minBid}));
  }
});
test("V20 trade solver emits an engine-valid mutual monopoly swap without mutating state", () => {
  let s = setup();
  for (const id of [16, 18, 9]) own(s, id);
  for (const id of [19, 6, 8]) own(s, id, 1);
  s.phase = 'end';
  const before = JSON.stringify(s);
  const context = situationOf(s, 0, planDecision(s, 0));
  const solved = solveOptimalTradeCash(context, {
    partnerId:1, giveList:[9], takeList:[19], maxCashOffer:6000, partnerMaxCash:6000
  });
  assert(solved?.validForUs);
  assert(solved.oracle.willAccept && solved.oracle.myEval.net > 0);
  assert.equal(solved.trade.giveCash % 10, 0);
  assert(solved.trade.giveCash <= 6000);
  assert.equal(JSON.stringify(s), before);
  s = command(s, 0, {type:'OFFER',trade:solved.trade});
  s = command(s, 1, {type:'TRADE_ACCEPT'});
  for (const id of [16,18,19]) assert.equal(s.assets[id].owner, 0);
  for (const id of [6,8,9]) assert.equal(s.assets[id].owner, 1);
});
test("deep search with an exhausted budget performs no rollout nodes", () => {
  const s = setup();
  for (const id of [16,18,9]) own(s,id);
  for (const id of [19,6,8]) own(s,id,1);
  s.phase = 'end';
  const result = decideNusa(s, 0, planDecision(s, 0), {deep:true,maxMs:0});
  assert(result.action);
  assert.equal(result.search.nodes, 0);
  assert.doesNotThrow(() => command(s,0,result.action));
});
test("V20 can offer an isolated deed during buy, then resume the same purchase after acceptance", () => {
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
test("V20 detects a rival bridge from public ownership and reads only public opponent profiles", () => {
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
