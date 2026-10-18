import { writeFile } from "node:fs/promises";
import { createGame, command, worth } from "../lib/game.mjs";
import { PERSONAS } from "../lib/bot/personas.mjs";
import { decidePersona } from "../lib/bot/persona-router.mjs";
import { botActor } from "../lib/server/bot-worker.mjs";
const args = Object.fromEntries(
  process.argv.slice(2).map((x) => x.replace(/^--/, "").split("=")),
);
const maxActions = Number(args["max-actions"] || 600),
  maxMs = Number(args["game-ms"] || 20000),
  budget = Number(args.budget || 24);
if (
  !Number.isInteger(maxActions) ||
  maxActions < 1 ||
  maxActions > 20000 ||
  !Number.isFinite(maxMs) ||
  maxMs < 100 ||
  !Number.isFinite(budget) ||
  budget < 0 ||
  budget > 2600
)
  throw Error("Invalid bounded arena configuration");
const runs = [];
for (const n of [2, 4, 6]) {
  let seed = 0x28180000 + n * 997;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const roster = [
    PERSONAS[3],
    PERSONAS[4],
    PERSONAS[5],
    ...PERSONAS.slice(0, 3),
  ].slice(0, n);
  let s = createGame(
    {
      players: roster.map((p) => ({
        name: p.name,
        controller: "bot",
        botPersona: p.id,
        botDifficulty: "hardcore",
      })),
      startingRoll: false,
      matchId: "v18-arena-" + n,
    },
    rng,
  );
  const started = performance.now(),
    models = new Set(),
    phases = new Set();
  let actions = 0,
    failure = null,
    illegal = 0;
  while (
    s.phase !== "won" &&
    actions < maxActions &&
    performance.now() - started < maxMs
  ) {
    const actor = botActor(s);
    phases.add(s.phase);
    if (actor === null) {
      failure = "no_actor";
      break;
    }
    let plan;
    try {
      plan = decidePersona(s, actor, { timeBudgetMs: budget });
    } catch {
      failure = "planner_exception";
      break;
    }
    models.add(plan.diagnostics.model);
    if (!plan.action) {
      failure = "no_action";
      break;
    }
    try {
      s = command(s, actor, plan.action, rng);
    } catch (e) {
      illegal++;
      failure = e.message;
      break;
    }
    actions++;
  }
  const finished = s.phase === "won";
  runs.push({
    n,
    actions,
    elapsedMs: performance.now() - started,
    finished,
    winner: finished ? s.players[s.winner].botPersona : null,
    stopReason:
      failure ||
      (!finished ? (actions >= maxActions ? "action_cap" : "time_cap") : null),
    illegal,
    models: [...models],
    phases: [...phases],
    publicWealth: s.players.map((p) => ({
      persona: p.botPersona,
      out: p.out,
      worth: worth(s, p.id),
    })),
  });
  console.log(
    JSON.stringify({
      n,
      actions,
      finished,
      winner: runs.at(-1).winner,
      stopReason: runs.at(-1).stopReason,
      illegal,
    }),
  );
}
const report = {
  generatedAt: new Date().toISOString(),
  configuration: { maxActions, maxMs, budget },
  runs,
  limits: [
    "A bounded integration arena, not statistical evidence of win-rate improvement.",
    "Only an engine terminal winner counts as a winner; wealth at a cap is a descriptive snapshot.",
    "Production persona router and actor scheduler are used.",
    "Local Node.js CPU; no external advisor or live online service.",
  ],
};
await writeFile(
  "docs/NUSA_V18_ARENA.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (
  runs.some(
    (r) =>
      r.illegal ||
      ["no_actor", "planner_exception", "no_action"].includes(r.stopReason),
  )
)
  process.exitCode = 1;
