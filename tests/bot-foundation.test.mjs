import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createGame, command, BOARD } from "../lib/game.mjs";
import { createDecisionContext } from "../lib/bot/foundation.mjs";
import { candidateState, legalCandidate } from "../lib/bot/candidates.mjs";
import { planDecision } from "../lib/bot/strategy.mjs";
import { landingForecast, expectedRentAt } from "../lib/bot/probability.mjs";
import { lossDistribution } from "../lib/bot/risk.mjs";
import { decidePersona } from "../lib/bot/persona-router.mjs";
import { PERSONAS } from "../lib/bot/personas.mjs";
const setup = (n = 3) =>
  createGame(
    {
      players: Array.from({ length: n }, (_, id) => ({
        name: "P" + id,
        controller: "bot",
        botPersona: PERSONAS[id].id,
      })),
      startingRoll: false,
      matchId: "foundation-test",
    },
    () => 0.2,
  );
const auction = () => {
  const s = setup();
  s.phase = "buy";
  s.buy = 13;
  return command(s, 0, { type: "AUCTION" });
};
test("decision caches reuse validated transitions and rejected actions without crossing state or request boundaries", () => {
  const s = auction(),
    before = JSON.stringify(s),
    context = createDecisionContext();
  const first = candidateState(
    s,
    0,
    { type: "BID", amount: 50, actionId: "one" },
    context,
  );
  assert.equal(
    candidateState(s, 0, { type: "BID", amount: 50, actionId: "two" }, context),
    first,
  );
  assert.equal(context.snapshot().counters.transitions, 1);
  assert(!legalCandidate(first, 1, { type: "BID", amount: 60 }, context));
  assert(!legalCandidate(first, 1, { type: "BID", amount: 60 }, context));
  assert.equal(context.snapshot().counters.rejected, 1);
  assert(!legalCandidate(first, 1, { type: "BID", amount: 50 }, context));
  assert(legalCandidate(first, 1, { type: "BID", amount: 100 }, context));
  const independent = createDecisionContext();
  assert(legalCandidate(s, 0, { type: "BID", amount: 50 }, independent));
  assert.equal(independent.snapshot().counters.transitions, 1);
  assert.equal(JSON.stringify(s), before);
});
test("cache limits do not change legal decisions and diagnostics remain structured-cloneable", () => {
  const s = auction(),
    limited = createDecisionContext({ maxEntries: 1 });
  for (const amount of [50, 100, 150])
    assert(legalCandidate(s, 0, { type: "BID", amount }, limited));
  assert(limited.snapshot().cacheEntries <= 1);
  const p = planDecision(s, 0, { diagnostics: true });
  assert(p.foundation.counters.hits > 0);
  assert.doesNotThrow(() => structuredClone(p));
  assert.deepEqual(planDecision(s, 0), planDecision(s, 0));
});
test("utility forecasts and cash risk use the engine's independent utility reroll", () => {
  const s = setup(2);
  s.players[0].pos = 8;
  s.assets[12].owner = 1;
  const forecast = landingForecast(s, 0, 1);
  // From tile eight, only the three outcomes summing to four reach utility 12.
  assert(Math.abs(expectedRentAt(s, 12, forecast) - (3 / 36) * 7 * 40) < 1e-9);
  assert(Math.abs(forecast.diceWeights[12] - (3 / 36) * 7) < 1e-9);
  // Every fresh utility roll is represented; movement sum four cannot fix rent.
  const rows = lossDistribution(s, 0, 1);
  assert(rows.some(row => row.loss === 80));
  assert(rows.some(row => row.loss === 480));
  const world = structuredClone(s);
  let index = 0;
  const leaf = command(world, 0, { type: "ROLL" }, () => [0.2, 0.2, 0, 0][index++] ?? 0);
  assert.equal(leaf.players[0].cash, world.players[0].cash - 80);
  s.players[0].pos = 5;
  const cardForecast = landingForecast(s, 0, 1);
  // Ordinary sum-seven arrivals plus the chance-card instruction's fresh roll.
  const expected = (6 / 36) * 7 * 40 + (1 / 36) * (1 / 16) * 7 * 100;
  assert(Math.abs(expectedRentAt(s, 12, cardForecast) - expected) < 1e-9);
});
test("public cashflow reports bank/card/tax effects per roll without spending card receivables", () => {
  const s = setup(3);
  s.players[0].pos = 38;
  for (const tile of [1, 3]) Object.assign(s.assets[tile], { owner: 0, level: 2 });
  for (const tile of [37, 39]) Object.assign(s.assets[tile], { owner: 0, level: 5 });
  const forecast = landingForecast(s, 0, 1), predicted = forecast.cashflow;
  const actual = { salary: 0, tax: 0, cardNet: 0, cardReceivable: 0, jailFine: 0 };
  // From square 38, Chance 7 can go back to tax 4, but cannot draw a second
  // deck. Enumerate 36 movement outcomes and 16 public card draws, not games.
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) for (let draw = 0; draw < 16; draw++) {
    const world = structuredClone(s);
    for (const deck of ["chance", "community"]) world.decks[deck] = [draw, ...world.decks[deck].filter(i => i !== draw)];
    let cursor = 0;
    let leaf = command(world, 0, { type: "ROLL" }, () => cursor++ === 0 ? (x - 0.5) / 6 : (y - 0.5) / 6);
    while (leaf.phase === "card") leaf = command(leaf, 0, { type: "ACK" }, () => 0.5);
    for (const event of leaf.log.filter(e => e.id > world.eventId)) for (const entry of event.finance || []) {
      const net = (entry.to === 0 ? entry.amount : 0) - (entry.from === 0 ? entry.amount : 0);
      if (entry.kind === "salary") actual.salary += net / 576;
      else if (entry.kind === "tax") actual.tax -= net / 576;
      else if (entry.kind === "jail") actual.jailFine -= net / 576;
      else if (entry.kind === "repair" || entry.kind === "card") {
        if (entry.to === 0 && entry.from !== null) actual.cardReceivable += net / 576;
        else actual.cardNet += net / 576;
      }
    }
  }
  for (const field of Object.keys(actual)) assert(Math.abs(predicted[field] - actual[field]) < 1e-8, field);
  assert.equal(predicted.perRoll.length, 1);
  assert.equal(predicted.perRoll[0].nonRentNet, predicted.nonRentNet);
  assert.equal(predicted.nonRentNet, predicted.salary + predicted.cardNet - predicted.tax - predicted.jailFine);
  assert(predicted.cardReceivable > 0);
  assert.throws(() => { predicted.perRoll[0].salary = 0; });
  const hidden = structuredClone(s);
  hidden.decks.chance.reverse(); hidden.decks.community.reverse();
  assert.deepEqual(landingForecast(hidden, 0, 1), forecast);
  s.assets[39].level = 4;
  assert.notEqual(landingForecast(s, 0, 1).cashflow.cardNet, predicted.cardNet);
  s.players[2].out = true;
  assert(landingForecast(s, 0, 1).cashflow.cardReceivable < predicted.cardReceivable);
});
test("expired optimization preserves a legal survival path requiring many mortgages", () => {
  let s = setup();
  for (const id of [1, 3, 5, 12, 15, 25, 28]) s.assets[id].owner = 0;
  s.players[0].cash = 0;
  s.phase = "debt";
  s.debt = { from: 0, to: null, amount: 5000, label: "Test" };
  let steps = 0;
  while (s.phase === "debt" && steps++ < 15) {
    const p = planDecision(s, 0, {
      timeBudgetMs: 0,
      fast: true,
      diagnostics: true,
    });
    assert.notEqual(p.action.type, "BANKRUPT");
    assert.equal(p.foundation.stopReason, "time_budget");
    s = command(s, 0, p.action);
  }
  assert.notEqual(s.phase, "debt");
  assert(!s.players[0].out);
});
test("all six personas return legal, serializable decisions across 2/4/6-seat phases and cancelled budgets", () => {
  for (const n of [2, 4, 6])
    for (const persona of PERSONAS)
      for (const phase of ["buy", "auction", "end"]) {
        let s = setup(n);
        s.players[0].botPersona = persona.id;
        s.players[0].botDifficulty = "hardcore";
        s.phase = "buy";
        s.buy = 13;
        if (phase === "auction") s = command(s, 0, { type: "AUCTION" });
        else s.phase = phase;
        const before = JSON.stringify(s),
          controller = new AbortController();
        controller.abort();
        const p = decidePersona(s, 0, {
          signal: controller.signal,
          timeBudgetMs: 0,
        });
        assert(p.action);
        assert.doesNotThrow(() => command(s, 0, p.action));
        assert.doesNotThrow(() => structuredClone(p));
        assert.equal(JSON.stringify(s), before);
        assert(p.diagnostics.interrupted);
      }
});
test("authoritative rules preserve baseline apart from approved RNG and N5 auction corrections", () => {
  const sha = (path) =>
    createHash("sha256")
      .update(readFileSync(new URL(path, import.meta.url)))
      .digest("hex");
  for (const file of [
    "bot/personas.mjs",
    "bot/apex-policy.mjs",
  ])
    assert.equal(
      sha("../lib/" + file),
      sha("../benchmarks/pre-foundation-v18/lib/" + file),
      file,
    );
  const originalContent=readFileSync(new URL('../benchmarks/pre-foundation-v18/lib/content.mjs',import.meta.url),'utf8');
  const originalMinimum=originalContent.split('\n').find(line=>line.startsWith('export const auctionMinimum ='));
  const content=readFileSync(new URL('../lib/content.mjs',import.meta.url),'utf8').replace(/^export const auctionMinimum =.*$/m,originalMinimum);
  assert.equal(content,originalContent);
  const originalGame=readFileSync(new URL('../benchmarks/pre-foundation-v18/lib/game.mjs',import.meta.url),'utf8');
  const originalBid=originalGame.split('\n').find(line=>line.includes("if(a.type==='BID'){if(auction.kind==='building')"));
  const game=readFileSync(new URL('../lib/game.mjs',import.meta.url),'utf8')
    .replace("import {secureRandom,randomIndex} from './random.mjs';\n",'')
    .replaceAll('rng=secureRandom','rng=Math.random')
    .replaceAll('randomIndex(i+1,rng)','Math.floor(rng()*(i+1))')
    .replaceAll('randomIndex(6,rng)','Math.floor(rng()*6)')
    .replace(/^.*if\(a.type==='BID'\)\{if\(auction.kind==='building'\).*$/m,originalBid);
  assert.equal(createHash('sha256').update(game).digest('hex'),sha('../benchmarks/pre-foundation-v18/lib/game.mjs'));
});
