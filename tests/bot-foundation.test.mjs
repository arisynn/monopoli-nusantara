import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createGame, command, BOARD } from "../lib/game.mjs";
import { createDecisionContext } from "../lib/bot/foundation.mjs";
import { candidateState, legalCandidate } from "../lib/bot/candidates.mjs";
import { planDecision } from "../lib/bot/strategy.mjs";
import { landingForecast, expectedRentAt } from "../lib/bot/probability.mjs";
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
test("utility forecasts price the actual landing dice rather than using an unconditional seven", () => {
  const s = setup(2);
  s.players[0].pos = 8;
  s.assets[12].owner = 1;
  const forecast = landingForecast(s, 0, 1);
  // From tile eight, only the three outcomes summing to four reach utility 12.
  assert(Math.abs(expectedRentAt(s, 12, forecast) - (3 / 36) * 4 * 40) < 1e-9);
  assert(Math.abs(forecast.diceWeights[12] - (3 / 36) * 4) < 1e-9);
  s.players[0].pos = 5;
  const cardForecast = landingForecast(s, 0, 1);
  // Ordinary sum-seven arrivals plus the chance-card instruction's fresh roll.
  const expected = (6 / 36) * 7 * 40 + (1 / 36) * (1 / 16) * 7 * 100;
  assert(Math.abs(expectedRentAt(s, 12, cardForecast) - expected) < 1e-9);
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
test("authoritative rules preserve the baseline apart from approved secure RNG substitutions", () => {
  const sha = (path) =>
    createHash("sha256")
      .update(readFileSync(new URL(path, import.meta.url)))
      .digest("hex");
  for (const file of [
    "content.mjs",
    "bot/personas.mjs",
    "bot/apex-policy.mjs",
    "bot/kresna-policy.mjs",
  ])
    assert.equal(
      sha("../lib/" + file),
      sha("../benchmarks/pre-foundation-v18/lib/" + file),
      file,
    );
  const game=readFileSync(new URL('../lib/game.mjs',import.meta.url),'utf8')
    .replace("import {secureRandom,randomIndex} from './random.mjs';\n",'')
    .replaceAll('rng=secureRandom','rng=Math.random')
    .replaceAll('randomIndex(i+1,rng)','Math.floor(rng()*(i+1))')
    .replaceAll('randomIndex(6,rng)','Math.floor(rng()*6)');
  assert.equal(createHash('sha256').update(game).digest('hex'),sha('../benchmarks/pre-foundation-v18/lib/game.mjs'));
});
