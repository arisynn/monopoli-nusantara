import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import { createGame, command } from "../lib/game.mjs";
import { PERSONAS } from "../lib/bot/personas.mjs";
import { planDecision as current } from "../lib/bot/strategy.mjs";
import { planDecision as baseline } from "../benchmarks/pre-foundation-v18/lib/bot/strategy.mjs";
import { decidePersona } from "../lib/bot/persona-router.mjs";
const args = Object.fromEntries(
  process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
);
const repeats = Number(args.repeats || 7);
if (!Number.isInteger(repeats) || repeats < 2 || repeats > 100)
  throw Error("repeats must be 2..100");
const quantile = (values, q) =>
  values.slice().sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * q))
  ];
function fixture(n, phase) {
  let s = createGame(
    {
      players: Array.from({ length: n }, (_, id) => ({
        name: PERSONAS[id].name,
        controller: "bot",
        botPersona: PERSONAS[id].id,
        botDifficulty: "hardcore",
      })),
      startingRoll: false,
      matchId: `foundation-profile-${n}-${phase}`,
    },
    () => 0.2,
  );
  if (phase === "buy" || phase === "auction") {
    s.phase = "buy";
    s.buy = 19;
    if (phase === "auction") s = command(s, 0, { type: "AUCTION" });
  }
  if (phase === "build") {
    s.phase = "end";
    for (const i of [16, 18, 19]) s.assets[i].owner = 0;
    s.players[0].cash = 6000;
  }
  if (phase === "debt") {
    s.phase = "debt";
    s.players[0].cash = 500;
    s.debt = { from: 0, to: null, amount: 4000, label: "Profile" };
    for (const i of [1, 3, 5, 12, 16, 18, 19]) s.assets[i].owner = 0;
  }
  if (phase === "trade") {
    s.assets[16].owner = 1;
    s.assets[18].owner = 0;
    s.assets[19].owner = 0;
    s = command(s, 1, {
      type: "OFFER",
      trade: {
        to: 0,
        give: [16],
        take: [],
        giveCash: 0,
        takeCash: 4000,
        giveCards: 0,
        takeCards: 0,
      },
    });
  }
  return s;
}
const rows = [],
  routing = [];
for (const n of [2, 4, 6])
  for (const phase of ["roll", "buy", "auction", "build", "debt", "trade"]) {
    const s = fixture(n, phase),
      before = JSON.stringify(s),
      timings = { baseline: [], current: [] },
      counts = { hits: 0, transitions: 0 };
    baseline(s, 0);
    current(s, 0); // Equal warm-up; alternate order below.
    for (let i = 0; i < repeats; i++)
      for (const variant of i % 2
        ? ["current", "baseline"]
        : ["baseline", "current"]) {
        const began = performance.now(),
          plan = (variant === "current" ? current : baseline)(s, 0, {
            diagnostics: true,
          });
        timings[variant].push(performance.now() - began);
        command(s, 0, plan.action, () => 0.2);
        if (variant === "current") {
          counts.hits += plan.foundation.counters.hits;
          counts.transitions += plan.foundation.counters.transitions;
        }
      }
    if (before !== JSON.stringify(s)) throw Error("Profile mutated live state");
    rows.push({
      n,
      phase,
      baseline: {
        p50: quantile(timings.baseline, 0.5),
        p95: quantile(timings.baseline, 0.95),
      },
      current: {
        p50: quantile(timings.current, 0.5),
        p95: quantile(timings.current, 0.95),
      },
      meanCacheHits: counts.hits / repeats,
      meanTransitions: counts.transitions / repeats,
    });
    console.log(`profile ${n} seats ${phase}`);
  }
for (const persona of PERSONAS)
  for (const phase of ["buy", "auction", "build", "debt", "trade"]) {
    const s = fixture(4, phase);
    s.players[0].botPersona = persona.id;
    const plan = decidePersona(s, 0, { timeBudgetMs: 80 });
    command(s, 0, plan.action, () => 0.2);
    if (plan.diagnostics.reason === "model_exception")
      throw Error(`Persona failed: ${persona.id}/${phase}`);
    routing.push({
      persona: persona.id,
      phase,
      action: plan.action.type,
      model: plan.diagnostics.model,
      elapsedMs: plan.diagnostics.elapsedMs,
      selectedBy: plan.diagnostics.selectedBy,
      reason: plan.diagnostics.reason ?? null,
      stopReason: plan.foundation?.stopReason,
      cacheHits: plan.foundation?.counters.hits,
    });
  }
const result = {
  generatedAt: new Date().toISOString(),
  repeats,
  rows,
  routing,
  summary: {
    cases: rows.length,
    routerChecks: routing.length,
    lowerMedianCases: rows.filter((r) => r.current.p50 < r.baseline.p50).length,
    meanCaseMedianBaseline:
      rows.reduce((n, r) => n + r.baseline.p50, 0) / rows.length,
    meanCaseMedianCurrent:
      rows.reduce((n, r) => n + r.current.p50, 0) / rows.length,
  },
  limits: [
    "Cloud Node.js CPU and bounded fixtures, not Android profiling or proof of stronger play.",
    "Baseline is this project after the accepted UI/five-Nusa update and before foundation/V18 changes.",
    "Shared planner profiling isolates foundation changes; router checks exercise actual six-persona integration.",
    "Time budgets are cooperative; synchronous safety analysis can exceed a requested budget. Worker watchdog remains the hard interruption mechanism.",
  ],
};
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/BOT_FOUNDATION_PROFILE.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result.summary));
