import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD, GROUPS, createGame, command, decisionActor, stock, worth } from '../lib/game.mjs';
import { decidePersona } from '../lib/bot/persona-router.mjs';
import { recordBotMemory } from '../lib/bot/memory.mjs';
import { observation, rolloutPolicy } from '../lib/bot/mind.mjs';
import { analyzeGuardState, detectMoneyScale, getAuctionMinStep, snapBidToFiveMultiple,
  stabilizeCandidates, stabilizeDecision, wrapModuleExport } from '../lib/bot/stability-guard.mjs';

let sequence = 0;
const game = (personas = ['nusa', 'kresna']) => createGame({ startingRoll: false,
  matchId: `guard-test-${sequence++}`, players: personas.map(botPersona =>
    ({ name: botPersona.toUpperCase(), botPersona, controller: 'bot', botDifficulty: 'hardcore' })) }, () => 0.413);
const commit = (state, actor, action) => {
  const next = command(state, actor, action, () => 0.413);
  // Official command() already records the successful transition.
  return next;
};
const own = (s, owner, ids, level = 0) => {
  for (const id of ids) Object.assign(s.assets[id], { owner, level });
  s.bank = stock(s);
  return s;
};
const row = (action, score = 10) => ({ id: action.actionId || 'test', action, score });
const pick = (s, actor, action, alternatives = []) => stabilizeDecision(s,
  { action, candidates: [row(action), ...alternatives.map(a => row(a))] }, { actor }).action;
const auction = (amount = 150, cash = 1000, kind = 'property') => {
  let s = game();
  s.phase = 'buy'; s.buy = 1;
  s = command(s, 0, { type: 'AUCTION' }, () => 0.413);
  s = command(s, 0, { type: 'BID', amount }, () => 0.413);
  s.players[1].cash = cash;
  if (kind === 'building') {
    own(s, 0, GROUPS[0].ids); own(s, 1, GROUPS[1].ids);
    Object.assign(s.auction, { kind, building: 'house', targets: { 0: 1, 1: 6 } });
  }
  return s;
};

test('adapter joins BOARD and assets, including group zero and exact building costs', () => {
  const s = own(game(), 0, [1, 3], 2);
  s.assets[3].mortgaged = true;
  const info = analyzeGuardState(s, { actor: 0 });
  assert.equal(info.tiles[1].houseCost, BOARD[1].build);
  assert.equal(info.tiles[3].mortgaged, true);
  assert.equal(info.tiles[3].redeemCost, 330);
  assert.equal(info.groups[0].complete, true);
  assert.equal(info.groups[0].buildable, false);
  assert.equal(info.rankings.find(r => r.actor === 0).worth, worth(s, 0));
});

test('currency and auction increment stay authoritative when all players are poor', () => {
  const s = game();
  for (const p of s.players) p.cash = 0;
  assert.equal(detectMoneyScale(s), 10);
  assert.equal(getAuctionMinStep(s), 50);
  assert.equal(snapBidToFiveMultiple(60, 60, 50), 150);
});

test('persona uses botPersona and never applies NUSA treatment to another seat/name', () => {
  const s = game(['bima', 'nusa', 'sari']);
  s.players[0].name = 'NUSA';
  assert.equal(analyzeGuardState(s, { actor: 0 }).isNusa, false);
  assert.equal(analyzeGuardState(s, { actor: 1 }).isNusa, true);
  assert.equal(analyzeGuardState(s, { actor: 2 }).isNusa, false);
  s.players[1].out = true;
  assert.equal(analyzeGuardState(s).activePlayers.length, 2);
  assert.equal(analyzeGuardState(game(['bima', 'sari'])).isNusa, false);
});

test('actor follows explicit actor or pending decision rather than the turn owner', () => {
  const s = auction();
  assert.equal(s.turn, 0);
  assert.equal(analyzeGuardState(s).actor, 1);
  assert.equal(analyzeGuardState(s, { actor: 0 }).actor, 0);
});

for (const kind of ['property', 'building']) {
  test(`${kind} auction normalizes against auction.amount and the actual bidder cash`, () => {
    const s = auction(150, 250, kind);
    const before = structuredClone(s);
    const a = pick(s, 1, { type: 'BID', amount: 50 }, [{ type: 'PASS' }]);
    assert.equal(a.type, 'BID'); assert.equal(a.amount, 200);
    assert.doesNotThrow(() => command(s, 1, a, () => 0.413));
    assert.deepEqual(s, before);
  });
}

test('official N5 grid preserves valid bids and repairs legacy N1 amounts', () => {
  const s = auction(150, 250);
  assert.equal(pick(s, 1, { type: 'BID', amount: 200 }).amount, 200);
  s.auction.amount = 60;
  assert.equal(pick(s, 1, { type: 'BID', amount: 110 }).amount, 150);
});

test('unaffordable correction falls back to a legal pass without manufacturing cash', () => {
  const s = auction(150, 190);
  const a = pick(s, 1, { type: 'BID', amount: 50 }, [{ type: 'PASS' }]);
  assert.equal(a.type, 'PASS');
  assert.doesNotThrow(() => command(s, 1, a));
});

test('incoming unsafe monopoly trade uses recipient persona and emits TRADE_REJECT', () => {
  let s = own(game(['kresna', 'nusa']), 0, [1]); own(s, 1, [3]);
  s = command(s, 0, { type: 'OFFER', trade: { to: 1, give: [], take: [3],
    giveCash: 0, takeCash: 0, giveCards: 0, takeCards: 0 } });
  assert.equal(analyzeGuardState(s).actor, 1);
  assert.equal(pick(s, 1, { type: 'TRADE_ACCEPT' }).type, 'TRADE_REJECT');
  s.players[1].botPersona = 'bima';
  assert.equal(pick(s, 1, { type: 'TRADE_ACCEPT' }).type, 'TRADE_ACCEPT');
});

test('mutual monopoly trade retains the existing favorable-swap exception', () => {
  const s = own(game(), 0, [3, 16, 18]); own(s, 1, [1, 19]);
  const a = { type: 'OFFER', trade: { to: 1, give: [3], take: [19],
    giveCash: 0, takeCash: 0, giveCards: 0, takeCards: 0 } };
  assert.equal(pick(s, 0, a).type, 'OFFER');
});

test('malformed trade proposal falls back to a legal phase action', () => {
  const s = game();
  const a = pick(s, 0, { type: 'OFFER', trade: { to: 1, give: 'bad', take: [] } });
  assert.equal(a.type, 'ROLL');
  assert.doesNotThrow(() => command(s, 0, a));
});

test('planning and repeated decisions neither mutate state nor commit a mortgage', () => {
  const s = own(game(), 0, [1]);
  const before = structuredClone(s), action = { type: 'MORTGAGE', tile: 1 };
  assert.deepEqual(pick(s, 0, action), action);
  assert.deepEqual(pick(s, 0, action), action);
  assert.deepEqual(s, before);
  assert.equal(s.botMemory, undefined);
});

test('rejected proposals and hypothetical engine transitions cannot pollute live history', () => {
  const s = own(game(), 0, [1]);
  assert.throws(() => command(s, 0, { type: 'MORTGAGE', tile: 31 }));
  const simulated = command(s, 0, { type: 'MORTGAGE', tile: 1 });
  assert.equal(s.botMemory, undefined);
  // Official engine records history on the isolated result, never the live input.
  assert.deepEqual(simulated.botMemory.players[0].stabilityGuard.mortgaged, [1]);
  assert.notEqual(simulated, s);
  assert.equal(pick(s, 0, { type: 'MORTGAGE', tile: 1 }).type, 'MORTGAGE');
});

test('successful mortgage blocks same-tile redemption, including a fresh worker observation', () => {
  let s = own(game(), 0, [1, 3]); s.assets[3].mortgaged = true;
  const before = structuredClone(s);
  s = commit(s, 0, { type: 'MORTGAGE', tile: 1 });
  assert.deepEqual(before.botMemory, undefined);
  assert.deepEqual(s.botMemory.players[0].stabilityGuard.mortgaged, [1]);
  const view = observation(s, 0);
  assert.equal(pick(view, 0, { type: 'REDEEM', tile: 1 }).type, 'ROLL');
  // Funding a different redemption is legitimate, not an inverse of this action.
  assert.equal(pick(view, 0, { type: 'REDEEM', tile: 3 }).type, 'REDEEM');
});

test('host recording is idempotent for an already committed version', () => {
  const before = own(game(), 0, [1]);
  const action = { type: 'MORTGAGE', tile: 1 }, next = commit(before, 0, action);
  const snapshot = structuredClone(next.botMemory.players[0].stabilityGuard);
  recordBotMemory(next, before, 0, action);
  assert.deepEqual(next.botMemory.players[0].stabilityGuard, snapshot);
});

test('match ids isolate history even when copied state retains another match memory', () => {
  let s = own(game(), 0, [1]); s = commit(s, 0, { type: 'MORTGAGE', tile: 1 });
  const other = structuredClone(s); other.matchId = 'independent-match';
  assert.equal(pick(other, 0, { type: 'REDEEM', tile: 1 }).type, 'REDEEM');
  assert.equal(pick(s, 0, { type: 'REDEEM', tile: 1 }).type, 'ROLL');
});

test('anti-loop history is isolated by owner', () => {
  let s = own(game(), 0, [1]); own(s, 1, [3]); s.assets[3].mortgaged = true;
  s = commit(s, 0, { type: 'MORTGAGE', tile: 1 });
  assert.equal(pick(s, 1, { type: 'REDEEM', tile: 3 }).type, 'REDEEM');
});

test('debt can mortgage a just-redeemed deed to avoid an artificial bankruptcy', () => {
  let s = own(game(), 0, [1]); s.assets[1].mortgaged = true;
  s = commit(s, 0, { type: 'REDEEM', tile: 1 });
  assert.equal(pick(s, 0, { type: 'MORTGAGE', tile: 1 }).type, 'ROLL');
  s.phase = 'debt'; s.debt = { from: 0, to: 1, amount: 20000, label: 'sewa', category: 'rent' };
  const a = pick(s, 0, { type: 'MORTGAGE', tile: 1 });
  assert.equal(a.type, 'MORTGAGE');
  assert.doesNotThrow(() => command(s, 0, a));
});

test('a build committed on another players build-offer reply is recorded for its owner', () => {
  let s = own(game(), 0, [1, 3]); own(s, 1, [6, 8, 9]);
  own(s, 0, GROUPS[2].ids, 4); own(s, 0, GROUPS[3].ids, 4); own(s, 0, GROUPS[4].ids, 2);
  assert.equal(stock(s).houses, 2);
  s = commit(s, 0, { type: 'BUILD', tile: 1 });
  assert.equal(s.phase, 'buildOffer');
  assert.equal(s.assets[1].level, 0);
  s = commit(s, 1, { type: 'BUILD_DECLINE' });
  assert.equal(s.assets[1].level, 1);
  assert.deepEqual(s.botMemory.players[0].stabilityGuard.built, [1]);
  assert.equal(pick(s, 0, { type: 'SELL_SET', tile: 3 }).type, 'ROLL');
});

test('mortgage transfer decision obeys same-tile history and uses MORTGAGE_KEEP fallback', () => {
  let s = own(game(), 0, [1]); s = commit(s, 0, { type: 'MORTGAGE', tile: 1 });
  s.phase = 'mortgage'; s.mortgageDecision = { player: 0, tile: 1 };
  assert.equal(pick(s, 0, { type: 'MORTGAGE_REDEEM' }).type, 'MORTGAGE_KEEP');
});

test('guard is idempotent and preserves native candidate scores and input objects', () => {
  const s = game(), a = { type: 'ROLL', actionId: 'native-roll' };
  const plan = { action: a, candidates: [row(a, 123)], diagnostics: { selected: a.actionId } };
  const copy = structuredClone(plan);
  const once = stabilizeDecision(s, plan, { actor: 0 });
  const twice = stabilizeDecision(s, once, { actor: 0 });
  assert.deepEqual(twice, once); assert.deepEqual(plan, copy);
  assert.equal(once.candidates[0].score, 123);
});

test('helper arrays, telemetry, rollout policies and afterstates are never wrapped', () => {
  for (const name of ['runExperts', 'landingForecast', 'rolloutPolicy', 'candidateState', 'ruleState', 'observation']) {
    const helper = () => [];
    assert.equal(wrapModuleExport('index', name, helper), helper);
  }
  assert.equal(wrapModuleExport('mind', 'rolloutPolicy', rolloutPolicy), rolloutPolicy);
});

test('candidate wrapper honors positional actor, preserves caller inputs and deduplicates corrected bids', () => {
  const s = auction(150, 250);
  const input = [{ type: 'BID', amount: 50 }, { type: 'BID', amount: 200 }, { type: 'PASS' }];
  const copy = structuredClone(input);
  const generate = wrapModuleExport('candidates', 'generateCandidates', () => input);
  const output = generate(s, 1);
  assert.deepEqual(input, copy);
  assert.deepEqual(output.map(a => a.type), ['BID', 'PASS']);
  assert.equal(output[0].amount, 200);
});

test('archived illegal-bid states produce legal decisions for their pending actors', () => {
  for (const match of ['match-0001', 'match-0002']) {
    const s = JSON.parse(readFileSync(new URL(`./fixtures/stability-guard-${match}.json`, import.meta.url)));
    const actor = decisionActor(s), snapshot = structuredClone(s);
    const plan = decidePersona(s, actor, { timeBudgetMs: 15, baseOnly: true });
    assert.ok(plan.action);
    assert.doesNotThrow(() => command(s, actor, plan.action, () => 0.413));
    if (plan.action.type === 'BID') assert.ok(plan.action.amount >= s.auction.amount + 50);
    assert.deepEqual(s, snapshot);
  }
});

test('original loop fixture advances legally without a mortgage/redeem reversal', () => {
  let s = JSON.parse(readFileSync(new URL('./fixtures/stability-guard-loop.json', import.meta.url))).state;
  const initialVersion = s.version, last = new Map();
  for (let i = 0; i < 30 && s.phase !== 'won'; i++) {
    const actor = decisionActor(s), snapshot = structuredClone(s);
    const plan = decidePersona(s, actor, { timeBudgetMs: 8, baseOnly: true });
    assert.deepEqual(s, snapshot);
    assert.ok(plan.action, `missing action at ${s.phase}`);
    if (['MORTGAGE', 'REDEEM'].includes(plan.action.type) && s.phase !== 'debt') {
      const key = `${s.turnSerial}:${actor}:${plan.action.tile}`;
      assert.ok(!last.has(key) || last.get(key) === plan.action.type, 'same-turn inverse action');
      last.set(key, plan.action.type);
    }
    s = commit(s, actor, plan.action);
  }
  assert.ok(s.version > initialVersion);
});


test('repeated inverse transactions remain blocked across the bounded flip window', () => {
  let s = own(game(['bima', 'sari']), 0, [1]);
  s = commit(s, 0, { type: 'MORTGAGE', tile: 1 });
  s.turnSerial++;
  s = commit(s, 0, { type: 'REDEEM', tile: 1 }); // Engine/human rules remain unchanged.
  s.turnSerial++;
  assert.equal(pick(s, 0, { type: 'MORTGAGE', tile: 1 }).type, 'ROLL');
  const independent = structuredClone(s); independent.matchId = 'other-match';
  assert.equal(pick(independent, 0, { type: 'MORTGAGE', tile: 1 }).type, 'MORTGAGE');
  s.turnSerial += 4;
  assert.equal(pick(s, 0, { type: 'MORTGAGE', tile: 1 }).type, 'MORTGAGE');
});

test('every persona records build/sell inverses while retaining emergency liquidation', () => {
  for (const persona of ['nusa', 'kresna', 'apex', 'raka', 'bima', 'sari']) {
    let s = own(game([persona, 'bima']), 0, [1, 3]);
    s = commit(s, 0, { type: 'BUILD', tile: 1 });
    assert.equal(pick(s, 0, { type: 'SELL', tile: 1 }).type, 'ROLL', persona);
    s.phase = 'debt'; s.debt = { from: 0, to: 1, amount: 20000, label: 'sewa' };
    assert.equal(pick(s, 0, { type: 'SELL', tile: 1 }).type, 'SELL', persona);
  }
});
