import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, command, BOARD, canManage, publicState, stock,
} from '../lib/game.mjs';
import {createGame as createLegacyGame} from '../lib/game-v1.mjs';
import {AUCTION_RULES, auctionMinimum} from '../lib/content.mjs';
import {serializeSave, parseSave} from '../lib/save-format.mjs';
import {observation} from '../lib/bot/mind.mjs';
import {strategyView} from '../lib/bot/memory.mjs';
import {createDecisionContext} from '../lib/bot/foundation.mjs';
import {legalCandidate} from '../lib/bot/candidates.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {landingForecast, expectedRentAt} from '../lib/bot/probability.mjs';
import {analyzeTemporal, turnDistance, nextTurnPlayer} from '../lib/bot/nusa-v7/temporal.mjs';
import {ensureChronosCandidates, solveDeadWeightSale} from '../lib/bot/nusa-v7/chronos-policy.mjs';
import {
  analyzeBoardGraph, situationOf, STRATEGY_EXPERTS, NUSA_MODEL_VERSION,
  expandNusaCandidates, decideNusa, getAuctionQuantum,
  solveOptimalTradeCash, projectWinProbabilityDelta,
} from '../lib/bot/nusa-v7/index.mjs';

// These are direct deterministic decision/transition checks, never full matches.
const setup = (options = {}) => createGame({
  players: ['nusa', 'bima', 'raka', 'sari', 'apex', 'kresna'].map(persona => ({
    name: persona.toUpperCase(), controller: 'bot', botPersona: persona,
  })),
  startingRoll: false, matchId: 'nusa-v23-focused', ...options,
}, () => 0.2);
const own = (state, tile, player = 0) => { state.assets[tile].owner = player; };
const deal = (to, values = {}) => ({
  to, give: [], take: [], giveCash: 0, takeCash: 0, giveCards: 0, takeCards: 0,
  ...values,
});
const brokerSetup = () => {
  const state = setup();
  own(state, 16); own(state, 18); own(state, 19, 1);
  own(state, 5, 1); own(state, 15, 1); own(state, 25, 2);
  state.phase = 'end';
  return state;
};
const openBrokerStep1 = (state = brokerSetup()) => command(state, 0, {
  type: 'OFFER', actionId: 'nusa-2hop-broker-step1-25-for-19',
  trade: deal(2, {take: [25], giveCash: BOARD[25].price}),
});
const contextOf = state => situationOf(state, 0, planDecision(state, 0));

test('NUSA V23 advertises the active router and keeps the 28 V22 graph experts plus five temporal pillars', () => {
  assert.equal(NUSA_MODEL_VERSION, '23.0.0');
  assert.equal(STRATEGY_EXPERTS.length, 33);
  assert.equal(new Set(STRATEGY_EXPERTS.map(expert => expert.id)).size, 33);
  for (const id of [
    'boardReaderDesire', 'brokerPathfinder', 'monopolyInterdictor',
    'spatialCorridorAmbush', 'egoistWinDelta', 'extortionCounter',
    'cashflowClock', 'turnInitiative', 'statefulBroker',
    'deadWeightLiquidator', 'preEndAmbush',
  ]) assert(STRATEGY_EXPERTS.some(expert => expert.id === id), id);
  const state = setup(), before = JSON.stringify(state);
  const result = decidePersona(state, 0, {
    nusaMode: 'council', timeBudgetMs: 1000, clock: () => 0,
  });
  assert.equal(result.diagnostics.model, 'NUSA-V23.0-CHRONOS-KAIROS');
  assert.equal(result.diagnostics.version, '23.0.0');
  assert.notEqual(result.diagnostics.reason, 'model_exception');
  assert(result.action);
  assert.doesNotThrow(() => command(state, 0, result.action));
  assert.equal(JSON.stringify(state), before);
});

test('V22 desire hypergraph identifies real two-hop bait for the missing monopoly deed', () => {
  const state = brokerSetup(), before = JSON.stringify(state);
  const graph = analyzeBoardGraph(observation(state, 0), 0);
  assert.equal(graph.desireMatrix.size, 6);
  for (const scores of graph.desireMatrix.values()) {
    assert.equal(scores.length, 40);
    assert(scores.every(score => Number.isFinite(score) && score >= 0 && score <= 100));
  }
  assert(graph.desireMatrix.get(1)[25] >= 54);
  assert.equal(graph.desireMatrix.get(1)[5], 0, 'a player does not desire a deed already owned');
  const target = graph.brokerTileToPlan.get(25);
  assert.equal(target.baitOwner, 2);
  assert.equal(target.keyHolderId, 1);
  assert.equal(target.ultimateTargetTile, 19);
  assert(graph.brokerTargetTiles.has(25));
  assert(graph.brokerPlans.some(plan => plan.missingTile === 19 && plan.twoHopBaits.some(bait => bait.baitTile === 25)));
  assert.equal(JSON.stringify(state), before);
});

test('Trojan bait retains a blocker and never supplies the last deed of a rival monopoly', () => {
  const state = setup();
  own(state, 31); own(state, 34); own(state, 32, 1);
  own(state, 16); own(state, 18, 1); own(state, 19, 1);
  own(state, 21); own(state, 23); own(state, 24, 2);
  const graph = analyzeBoardGraph(observation(state, 0), 0);
  const baits = graph.trojanBaitForRival.get(1);
  assert(baits.some(bait => bait.tileId === 31 && bait.isLockedHostagePair));
  assert(baits.some(bait => bait.tileId === 34 && bait.isLockedHostagePair));
  assert(!baits.some(bait => bait.tileId === 16), 'cannot complete a rival monopoly');
  for (const rivalBaits of graph.trojanBaitForRival.values())
    assert(!rivalBaits.some(bait => [21, 23].includes(bait.tileId)), 'preserve our high-tier pair');
});

test('interdiction graph distinguishes a bank blocker from a third-party monopoly bridge', () => {
  const state = setup();
  own(state, 16, 1); own(state, 18, 1);
  own(state, 21, 2); own(state, 23, 2); own(state, 24, 3);
  const graph = analyzeBoardGraph(observation(state, 0), 0);
  assert(graph.unownedCriticalDeny.has(19));
  assert(graph.poisonPillTiles.has(19));
  assert(graph.thirdPartyInterceptionTiles.has(24));
  const bridge = graph.thirdPartyInterceptions.find(item => item.tileId === 24);
  assert.equal(bridge.dangerRivalId, 2);
  assert.equal(bridge.holderRivalId, 3);
});

test('NUSA observations and expansion neither inspect hidden draws nor change the authoritative state', () => {
  const state = brokerSetup();
  state.botMemory = {
    version: 1, players: {1: {privateSentinel: 'other-player-secret'}},
    opponents: {}, negotiation: null,
  };
  state.log.unshift({id: ++state.eventId, type: 'info', turn: 1, text: 'private-log-sentinel', audience: 1});
  const before = JSON.stringify(state), view = observation(state, 0);
  assert.equal(view.decks, undefined);
  assert.equal(view.seen, undefined);
  assert.equal(view.botMemory.players[1], undefined);
  assert(!JSON.stringify(view).includes('other-player-secret'));
  assert(!JSON.stringify(view).includes('private-log-sentinel'));
  const plan = planDecision(view, 0), context = situationOf(state, 0, plan);
  assert.equal(context.boardGraph.desireMatrix.size, 6);
  expandNusaCandidates(view, 0, plan);
  for (const candidate of plan.candidates) assert(legalCandidate(view, 0, candidate.action));
  assert.equal(JSON.stringify(state), before);
});

test('an exhausted common budget stops NUSA expansion and deep rollout nodes', () => {
  const state = brokerSetup(), plan = planDecision(state, 0);
  const count = plan.candidates.length;
  const context = createDecisionContext({timeBudgetMs: 0, clock: () => 0});
  expandNusaCandidates(state, 0, plan, {context});
  const result = decideNusa(state, 0, plan, {deep: true, maxMs: 0, context});
  assert.equal(plan.candidates.length, count);
  assert.equal(result.search.nodes, 0);
  assert(result.action);
  assert.doesNotThrow(() => command(state, 0, result.action));
});

test('a pending manual rent claim is collected before an optional END or development action', () => {
  const state = setup({rules: 'classic'});
  state.phase = 'end'; state.turn = 1; state.turnSerial = 3;
  own(state, 16); own(state, 18); own(state, 19);
  state.rentClaims = [{
    kind: 'pay', from: 1, to: 0, amount: 500, tile: 19,
    label: 'sewa', id: 'claim-v23', turnSerial: 2,
  }];
  const before = JSON.stringify(state), cash = state.players[0].cash;
  const result = decidePersona(state, 0, {timeBudgetMs: 1000, clock: () => 0});
  assert.equal(result.action.type, 'CLAIM_RENT');
  assert.equal(result.action.claimId, 'claim-v23');
  const next = command(state, 0, result.action);
  assert.equal(next.players[0].cash, cash + 500);
  assert.equal(next.turn, 1);
  assert.equal(next.rentClaims.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test('actual engine management rights allow a rival to build before their own turn', () => {
  const state = setup(); state.phase = 'end';
  for (const tile of [6, 8, 9]) own(state, tile, 4);
  assert.notEqual(state.turn, 4);
  assert.equal(canManage(state, 4), true);
  const next = command(state, 4, {type: 'BUILD', tile: 6});
  assert.equal(next.assets[6].level, 1);
  assert.equal(next.turn, 0);
  assert.equal(next.phase, 'end');
});

test('auction quantum follows active rules including legacy non-multiple high bids', () => {
  let state = setup(); state.phase = 'buy'; state.buy = 13;
  state = command(state, 0, {type: 'AUCTION'});
  for (const amount of [0, 50, 110]) {
    const legacy = structuredClone(state); legacy.auction.amount = amount;
    if (amount) legacy.auction.highest = 1;
    const quantum = getAuctionQuantum(legacy, 0);
    assert.equal(quantum.step, AUCTION_RULES.increment);
    assert.equal(quantum.minBid, auctionMinimum(legacy.auction));
    assert.doesNotThrow(() => command(legacy, 0, {type: 'BID', amount: quantum.minBid}));
  }
});

test('trade solver retains an engine-valid mutual monopoly exchange without mutating state', () => {
  let state = setup();
  for (const tile of [16, 18, 9]) own(state, tile);
  for (const tile of [19, 6, 8]) own(state, tile, 1);
  state.phase = 'end';
  const before = JSON.stringify(state), context = contextOf(state);
  const result = solveOptimalTradeCash(context, {
    partnerId: 1, giveList: [9], takeList: [19], maxCashOffer: 6000, partnerMaxCash: 6000,
  });
  assert(result?.validForUs);
  assert(result.oracle.willAccept && result.oracle.myEval.net > 0);
  assert.equal(result.trade.giveCash % 10, 0);
  assert.equal(JSON.stringify(state), before);
  state = command(state, 0, {type: 'OFFER', trade: result.trade});
  state = command(state, 1, {type: 'TRADE_ACCEPT'});
  for (const tile of [16, 18, 19]) assert.equal(state.assets[tile].owner, 0);
  for (const tile of [6, 8, 9]) assert.equal(state.assets[tile].owner, 1);
});

test('trade projection rewards our monopoly and detects an opponent-only monopoly', () => {
  const state = setup(); state.phase = 'end';
  own(state, 16); own(state, 18); own(state, 19, 1);
  const context = contextOf(state), before = JSON.stringify(state);
  const gain = projectWinProbabilityDelta(context, {type: 'OFFER', trade: deal(1, {take: [19], giveCash: 2500})});
  assert(gain.deltaWinProb > 0);
  assert(gain.postWinProb >= 0 && gain.postWinProb <= 1);
  const other = setup(); other.phase = 'end';
  own(other, 16, 1); own(other, 18, 1); own(other, 19);
  const loss = projectWinProbabilityDelta(contextOf(other), {type: 'OFFER', trade: deal(1, {give: [19], takeCash: 1})});
  assert(loss.deltaWinProb < 0);
  assert.equal(JSON.stringify(state), before);
});

test('confirmed two-hop accepts persist the macro across save/load then finish ownership before development', () => {
  let state = openBrokerStep1();
  assert.equal(state.botMemory.players[0].nusaBroker.stage, 'awaiting_step1');
  state = command(state, 2, {type: 'TRADE_ACCEPT'});
  const memory = state.botMemory.players[0].nusaBroker;
  assert.equal(memory.stage, 'ready_step2');
  assert.equal(memory.baitTile, 25);
  assert.equal(memory.ultimateTargetTile, 19);
  assert.equal(memory.keyHolderId, 1);
  assert.equal(state.phase, 'end'); assert.equal(state.turn, 0);
  assert.equal(state.assets[25].owner, 0);
  state = parseSave(serializeSave({state})).state;
  assert.deepEqual(state.botMemory.players[0].nusaBroker, memory);
  assert.equal(strategyView(state, 1).botMemory.players[0], undefined);
  assert.equal(publicState(state).botMemory, undefined);
  state = command(state, 0, {
    type: 'OFFER', actionId: 'nusa-broker-step2-25-for-19',
    trade: deal(1, {give: [25], take: [19]}),
  });
  assert.equal(state.botMemory.players[0].nusaBroker.stage, 'awaiting_step2');
  state = command(state, 1, {type: 'TRADE_ACCEPT'});
  assert.equal(state.botMemory.players[0].nusaBroker.stage, 'develop');
  assert.equal(state.assets[25].owner, 1);
  assert.equal(state.assets[19].owner, 0);
  assert.equal(state.turn, 0); assert.equal(state.phase, 'end');
  const developed = command(state, 0, {type: 'BUILD', tile: 19});
  assert.equal(developed.assets[19].level, 1);
});

test('rejected or incompatible counteroffers cannot leave a ready broker chain behind', () => {
  const pending = openBrokerStep1();
  const rejected = command(pending, 2, {type: 'TRADE_REJECT'});
  assert(!rejected.botMemory.players[0].nusaBroker);
  const countered = command(pending, 2, {
    type: 'COUNTER', trade: deal(0, {giveCash: 100}),
  });
  assert(!countered.botMemory.players[0].nusaBroker);
  const acceptedCounter = command(countered, 0, {type: 'TRADE_ACCEPT'});
  assert(!acceptedCounter.botMemory.players[0].nusaBroker);
  assert.equal(acceptedCounter.assets[25].owner, 2);
});

test('ending the turn clears a same-turn broker chain and a later acquisition does not revive it', () => {
  let state = command(openBrokerStep1(), 2, {type: 'TRADE_ACCEPT'});
  const serial = state.turnSerial;
  state = command(state, 0, {type: 'END'});
  assert(state.turnSerial > serial);
  assert(!state.botMemory.players[0].nusaBroker);
});

test('cashflow clock includes positional GO income, rent, taxes and public card effects without reading hidden decks', () => {
  const state = setup(); state.phase = 'end';
  state.players[0].pos = 39; state.players[1].pos = 0;
  own(state, 12, 3); own(state, 28, 3);
  state.players[4].pos = 5;
  const view = observation(state, 0), before = JSON.stringify(view);
  const temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  assert.equal(temporal.cashflowByPlayer.size, 6);
  const nearGO = temporal.cashflowByPlayer.get(0), afterGO = temporal.cashflowByPlayer.get(1);
  assert(nearGO.salaryPerRoll > afterGO.salaryPerRoll, 'salary arrival depends on pawn position');
  assert(nearGO.taxPerRoll >= 0);
  assert(Number.isFinite(nearGO.cardNetPerRoll));
  assert(temporal.cashflowByPlayer.get(4).rentOutPerRoll > 0);
  for (const row of temporal.cashflowByPlayer.values()) {
    assert(Number.isFinite(row.drift));
    assert(Math.abs(row.perRollDrift - (row.incomePerRoll - row.rentOutPerRoll + row.nonRentPerRoll)) < 1e-8);
    assert.equal(row.estimateOnly, true);
    if (row.drift >= 0) assert.equal(row.ETTR, Infinity);
  }
  const reordered = structuredClone(state);
  reordered.decks.chance.reverse(); reordered.decks.community.reverse();
  reordered.dice = [6, 6];
  const alternate = observation(reordered, 0);
  assert.deepEqual(analyzeTemporal(alternate, 0, analyzeBoardGraph(alternate, 0)).cashflowByPlayer, temporal.cashflowByPlayer);
  assert.equal(JSON.stringify(view), before);
  assert.equal(temporal.normalization.ettrIsHeuristic, true);
  assert.equal(temporal.normalization.orbitalDriftIsNotTableRound, true);
});

test('cashflow runway reserves the live auction and queued obligations without treating a manual claim as cash', () => {
  let state = setup({rules: 'classic'});
  state.players[0].cash = 5000; state.phase = 'buy'; state.buy = 13;
  state = command(state, 0, {type: 'AUCTION'});
  state = command(state, 0, {type: 'BID', amount: 900});
  state.queue.push({kind: 'pay', from: 0, to: null, amount: 1200, label: 'known obligation'});
  state.rentClaims.push({kind: 'pay', id: 'future-claim', from: 0, to: 1, tile: 19, amount: 300, label: 'manual rent', turnSerial: 0});
  const view = observation(state, 0), temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  const self = temporal.cashflowByPlayer.get(0), recipient = temporal.cashflowByPlayer.get(1);
  assert.equal(self.committedCash, 900);
  assert.equal(self.confirmedObligations, 1200);
  assert.equal(self.conditionalObligations, 300);
  assert.equal(self.spendableCash, 2900);
  assert.equal(self.liquidationRunway - self.conservativeLiquidationRunway, 300);
  assert.equal(recipient.spendableCash, state.players[1].cash, 'uncollected receivables cannot be spent');
  assert.equal(recipient.rentCollection, 'conditional_on_public_claim');
});

test('cashflow postures respond to a stronger rival and a public short-run insolvency target', () => {
  const ahead = setup(); ahead.phase = 'end';
  for (const player of ahead.players) { player.cash = 10000000; player.pos = 10; }
  for (const tile of [16, 18, 19]) { own(ahead, tile); ahead.assets[tile].level = 3; }
  ahead.bank = stock(ahead);
  const read = state => {
    const view = observation(state, 0);
    return analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  };
  const lock = read(ahead);
  assert.equal(lock.macroPosture, 'ATTRITION_LOCKDOWN');
  assert(lock.cashflowByPlayer.get(0).drift > 0);
  const behind = structuredClone(ahead);
  for (const tile of [16, 18, 19]) own(behind, tile, 1);
  assert.equal(read(behind).macroPosture, 'TEMPO_BREAKER');
  const prey = structuredClone(ahead); prey.players[2].cash = 0;
  const execution = read(prey);
  assert.equal(execution.macroPosture, 'APEX_EXECUTIONER');
  const target = execution.executionTargets.find(player => player.id === 2);
  assert(target && target.drift < 0 && target.ETTR <= 2);
});

test('temporal seat urgency skips bankrupt players and preserves actual outside-turn management rights', () => {
  const state = setup(); state.phase = 'end';
  state.players[2].out = true; state.players[4].out = true;
  assert.equal(turnDistance(state, 0, 5), 3);
  assert.equal(turnDistance(state, 5, 1), 2);
  assert.equal(turnDistance(state, 0, 2), Infinity);
  assert.equal(nextTurnPlayer(state, 0).id, 1);
  const view = observation(state, 0), temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  assert.equal(temporal.nextPlayerId, 1);
  assert.equal(temporal.initiative.get(1).turnDistance, 1);
  assert(temporal.initiative.get(1).interdictionUrgency > temporal.initiative.get(5).interdictionUrgency);
  for (const player of view.players.filter(player => !player.out)) {
    const rights = temporal.initiative.get(player.id);
    assert.equal(rights.canManageNow, canManage(state, player.id));
    assert.equal(rights.canBuildBeforeOwnRoll, true);
    assert.equal(rights.exclusiveBuildWindow, false);
  }
});

test('dead-weight inventory preserves near monopolies, blocking deeds and desired broker bait', () => {
  const state = brokerSetup();
  own(state, 25); own(state, 13); own(state, 31);
  own(state, 21); own(state, 23, 3); own(state, 24, 3);
  const view = observation(state, 0), temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  const dead = new Set(temporal.deadWeightAssets.map(tile => tile.id));
  assert(dead.has(13)); assert(dead.has(31));
  for (const protectedTile of [16, 18, 21, 25]) assert(!dead.has(protectedTile), `protect strategic deed ${protectedTile}`);
  for (const tile of temporal.deadWeightAssets) {
    assert.equal(tile.minSalePrice, BOARD[tile.id].price);
    assert(tile.maxSalePrice <= BOARD[tile.id].price * 1.35);
  }
});

test('ready same-turn broker chains require owned bait, public desire, remaining quota and a valid target', () => {
  const state = brokerSetup(); own(state, 25);
  const inspect = (value, count = 0) => {
    const view = observation(value, 0);
    return analyzeTemporal(view, 0, analyzeBoardGraph(view, 0), {roundTradeCount: count});
  };
  assert(inspect(state).readyStep2BrokerChains.some(chain => chain.baitTile === 25 && chain.ultimateTargetTile === 19 && chain.requiresAcceptance));
  assert.equal(inspect(state, 3).readyStep2BrokerChains.length, 0);
  const lostBait = structuredClone(state); own(lostBait, 25, 2);
  assert(!inspect(lostBait).readyStep2BrokerChains.some(chain => chain.baitTile === 25));
  const completed = structuredClone(state); own(completed, 19);
  assert(!inspect(completed).readyStep2BrokerChains.some(chain => chain.ultimateTargetTile === 19));
  const laterTurn = structuredClone(state); laterTurn.turn = 1;
  assert.equal(inspect(laterTurn).readyStep2BrokerChains.length, 0);
});

test('pre-END lookahead emits legal even-build actions in the next pawn corridor', () => {
  const state = setup(); state.phase = 'end'; state.players[1].pos = 11;
  for (const tile of [16, 18, 19]) { own(state, tile); state.assets[tile].level = 2; }
  state.bank = stock(state);
  const view = observation(state, 0), before = JSON.stringify(state);
  const temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  const target = temporal.preEndTargets.find(item => item.tileId === 19);
  assert(target?.inApexWindow);
  assert.equal(target.nextPlayerId, 1);
  assert(target.hitProbability > 0);
  assert(target.affordableNow && target.sufficientHouseStock);
  assert(target.buildPath.includes(19));
  assert.equal(target.exclusiveBuildWindow, false);
  for (const item of temporal.preEndTargets)
    for (const action of [...item.buildActions, ...item.redeemActions, ...item.fundingActions])
      assert.doesNotThrow(() => command(state, 0, action));
  assert.equal(JSON.stringify(state), before);
});

test('pre-END lookahead redeems a mortgaged monopoly before suggesting construction', () => {
  const state = setup(); state.phase = 'end'; state.players[1].pos = 11;
  for (const tile of [16, 18, 19]) own(state, tile);
  state.assets[19].mortgaged = true;
  const view = observation(state, 0), temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0));
  const target = temporal.preEndTargets.find(item => item.tileId === 19);
  assert(target?.canRedeemNow);
  assert(target.redeemActions.some(action => action.type === 'REDEEM' && action.tile === 19));
  assert.equal(target.buildActions.length, 0);
  assert.doesNotThrow(() => command(state, 0, target.redeemActions[0]));
});

test('interrupted temporal analysis reports incomplete evidence without a misleading partial drift table', () => {
  const view = observation(setup(), 0), before = JSON.stringify(view);
  let checkpoints = 0;
  const temporal = analyzeTemporal(view, 0, analyzeBoardGraph(view, 0), {shouldStop: () => ++checkpoints >= 3});
  assert.equal(temporal.complete, false);
  assert.equal(temporal.cashflowByPlayer.size, 0);
  assert.equal(temporal.macroPosture, 'NEUTRAL');
  assert.equal(JSON.stringify(view), before);
});

test('situation wiring exposes the same temporal facts through the shared board graph', () => {
  const state = brokerSetup(), context = contextOf(state);
  assert(context.temporal);
  assert.equal(context.temporal.cashflowByPlayer.size, 6);
  assert.equal(context.boardGraph.macroPosture, context.temporal.macroPosture);
  assert.equal(context.boardGraph.nextTurnPlayer.id, context.temporal.nextPlayerId);
  assert.deepEqual(context.boardGraph.readyStep2BrokerChains, context.temporal.readyStep2BrokerChains);
});

test('Chronos candidate policy performs a legal pre-END build or redemption before closing the turn', () => {
  for (const mortgaged of [false, true]) {
    const state = setup(); state.phase = 'end'; state.players[1].pos = 11;
    for (const tile of [16, 18, 19]) { own(state, tile); state.assets[tile].level = mortgaged ? 0 : 2; }
    state.assets[19].mortgaged = mortgaged; state.bank = stock(state);
    const before = JSON.stringify(state), plan = planDecision(state, 0), context = situationOf(state, 0, plan);
    const end = plan.candidates.find(candidate => candidate.action.type === 'END'), priorEndScore = end.score;
    ensureChronosCandidates(context, plan);
    const initiative = plan.candidates.find(candidate => candidate.action.actionId?.startsWith(mortgaged ? 'nusa-preend-redeem' : 'nusa-preend-build'));
    assert(initiative);
    assert(initiative.score > end.score);
    assert(end.score < priorEndScore);
    assert.equal(initiative.action.type, mortgaged ? 'REDEEM' : 'BUILD');
    assert.doesNotThrow(() => command(state, 0, initiative.action));
    assert.equal(JSON.stringify(state), before);
  }
});

test('accepted first-hop ownership is converted into an engine-valid step-two offer', () => {
  const state = command(openBrokerStep1(), 2, {type: 'TRADE_ACCEPT'});
  const before = JSON.stringify(state), plan = planDecision(state, 0), context = situationOf(state, 0, plan);
  ensureChronosCandidates(context, plan);
  const next = plan.candidates.find(candidate => candidate.action.actionId === 'nusa-broker-step2-25-for-19');
  assert(next, 'a ready accepted chain gets a concrete legal second offer');
  assert.deepEqual(next.action.trade.give, [25]);
  assert.deepEqual(next.action.trade.take, [19]);
  const offered = command(state, 0, next.action);
  assert.equal(offered.trade.to, 1);
  assert.equal(offered.botMemory.players[0].nusaBroker.stage, 'awaiting_step2');
  assert.equal(JSON.stringify(state), before);
});

test('dead-weight cash sales respect face-price bounds, receiver solvency and strategic protection', () => {
  const state = setup(); state.phase = 'end'; state.players[0].cash = 1000;
  state.players[1].cash = 100000;
  for (const tile of [16, 18, 19]) own(state, tile);
  own(state, 13); own(state, 11, 2);
  const before = JSON.stringify(state), plan = planDecision(state, 0), context = situationOf(state, 0, plan);
  const solved = solveDeadWeightSale(context, 13, 2);
  assert(solved);
  assert(solved.trade.takeCash >= BOARD[13].price);
  assert(solved.trade.takeCash <= BOARD[13].price * 1.35);
  assert.equal(solved.trade.takeCash % 10, 0);
  assert(solved.oracle.willAccept && solved.oracle.myEval.net > 0);
  ensureChronosCandidates(context, plan);
  const sale = plan.candidates.find(candidate => candidate.action.actionId?.startsWith('nusa-deadweight-sale-13-'));
  assert(sale);
  assert.equal(sale.action.type, 'OFFER');
  assert.doesNotThrow(() => command(state, 0, sale.action));
  assert.equal(JSON.stringify(state), before);
});

test('same-turn broker quota counts confirmed offers, ignores counters, and blocks a fourth synthesized offer', () => {
  let state = openBrokerStep1();
  assert.equal(state.botMemory.players[0].nusaTurnTradeCount, 1);
  state = command(state, 2, {
    type: 'COUNTER', trade: deal(0, {give: [25], takeCash: BOARD[25].price + 100}),
  });
  assert.equal(state.botMemory.players[0].nusaTurnTradeCount, 1);
  state = command(state, 0, {type: 'TRADE_ACCEPT'});
  assert.equal(state.botMemory.players[0].nusaBroker.stage, 'ready_step2');
  for (let index = 0; index < 2; index++) {
    state = command(state, 0, {type: 'OFFER', trade: deal(3, {giveCash: 10})});
    state = command(state, 3, {type: 'TRADE_REJECT'});
  }
  assert.equal(state.botMemory.players[0].nusaTurnTradeCount, 3);
  const plan = planDecision(state, 0), context = situationOf(state, 0, plan);
  assert.equal(context.roundTradeCount, 3);
  assert.equal(context.temporal.readyStep2BrokerChains.length, 0);
  ensureChronosCandidates(context, plan);
  assert(!plan.candidates.some(candidate => candidate.action.actionId?.startsWith('nusa-broker-step2-')));
});

test('Chronos synthesis leaves candidates untouched once the shared deadline is exhausted', () => {
  const state = brokerSetup(), plan = planDecision(state, 0), before = JSON.stringify(plan.candidates);
  const context = {...situationOf(state, 0, plan), decisionContext: createDecisionContext({timeBudgetMs: 0, clock: () => 0})};
  ensureChronosCandidates(context, plan);
  assert.equal(JSON.stringify(plan.candidates), before);
});

test('utility forecasts preserve legacy movement dice while current gameplay rerolls independent rent dice', () => {
  for (const legacy of [false, true]) {
    const state = legacy ? createLegacyGame({players: [
      {name: 'NUSA', controller: 'bot'}, {name: 'RIVAL', controller: 'bot'},
    ], matchId: 'nusa-v23-legacy'}, () => 0.2) : setup();
    own(state, 12, 1); state.players[0].pos = 10;
    // From petak 10, ordinary landing on utility 12 requires exactly double one.
    // No one-roll card route from this position can reach utility 12.
    const forecast = landingForecast(observation(state, 0), 0, 1);
    assert(Math.abs(forecast.visits[12] - 1 / 36) < 1e-12);
    assert(Math.abs(expectedRentAt(state, 12, forecast) - (legacy ? 2 : 7) * 40 / 36) < 1e-10);
    const draws = [0, 0, 0.999, 0.999]; let draw = 0;
    const next = command(state, 0, {type: 'ROLL'}, () => draws[draw++] ?? 0);
    assert.equal(next.players[0].cash, 15000 - (legacy ? 80 : 480));
    assert.equal(next.players[1].cash, 15000 + (legacy ? 80 : 480));
    assert.deepEqual(next.dice, [1, 1]);
    if (!legacy) assert.deepEqual(next.utilityDice, [6, 6]);
  }
});
