import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brokerIntentMetadata } from "../lib/bot/broker-intent.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), "..");
const ROSTER = Object.freeze(["nusa", "apex", "kresna", "raka", "bima", "sari"]);
const EXPLICIT_FALLBACKS = new Set([
  "model_exception", "illegal_proposal_rejected", "foundation_budget_exhausted",
  "bounded_fallback", "no_action_fallback", "fallback",
]);

export function flashConfiguration(argv = []) {
  const allowed = new Set(["seed", "max-actions", "game-ms", "budget", "output"]);
  const args = {};
  for (const argument of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1])) throw Error(`Unknown flash argument: ${argument}`);
    args[match[1]] = match[2];
  }
  const config = {
    games: 1,
    seed: Number(args.seed ?? 0x20261018),
    maxActions: Number(args["max-actions"] ?? 600),
    maxMs: Number(args["game-ms"] ?? 30000),
    timeBudgetMs: Number(args.budget ?? 24),
    roster: [...ROSTER],
    difficulty: "hardcore",
    startingRoll: true,
    rules: "classic",
    outputPath: resolve(ROOT, args.output ?? "docs/NUSA_V23_FLASH.json"),
  };
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff ||
      !Number.isInteger(config.maxActions) || config.maxActions < 1 || config.maxActions > 600 ||
      !Number.isFinite(config.maxMs) || config.maxMs < 100 || config.maxMs > 30000 ||
      !Number.isFinite(config.timeBudgetMs) || config.timeBudgetMs < 0 || config.timeBudgetMs > 24)
    throw Error("Flash limits: uint32 seed, 1–600 actions, 100–30000 ms total, 0–24 ms/decision");
  return config;
}

function initialReport(config) {
  return {
    generatedAt: new Date().toISOString(),
    configuration: config,
    gameCount: 1,
    terminal: false,
    winner: null,
    stopReason: "starting",
    elapsedMs: 0,
    workerTerminated: false,
    actions: 0,
    decisions: 0,
    metrics: {
      illegalOutputs: 0, engineCommandRejected: 0, plannerExceptions: 0,
      modelExceptions: 0, noAction: 0, noActor: 0, illegalProposalsRejected: 0,
      sandboxRejected: 0, fallbackDecisions: 0, budgetExhausted: 0,
    },
    personas: Object.fromEntries(config.roster.map(persona => [persona, {
      decisions: 0, actions: 0, models: [], versions: [], algorithms: [],
      actionTypes: {}, reasons: {}, selectedBy: {},
      strategicDecisions: 0, temporalDecisions: 0, temporalCompleteDecisions: 0, temporalPostures: {},
      maximumDecisionMs: 0, totalDecisionMs: 0, decisionsOverBudget: 0,
    }])),
    phases: {},
    progress: null,
    consistency: { checkedStates: 0, violations: 0, examples: [] },
    failure: null,
    checkpoint: null,
    limits: [
      "Exactly one bounded game; this is integration evidence, not win-rate evidence.",
      "Only the engine phase won permits a winner. Caps never choose a wealth winner.",
      "Uses production decidePersona, botActor, and a seeded authoritative command RNG.",
      "Engine-rejected final outputs, recovered model diagnostics, and sandbox rejects are separate metrics.",
      "The parent watchdog includes worker startup and can stop synchronous planner work.",
      "At a watchdog cap, counts describe completed checkpoints; an in-flight decision may be incomplete.",
    ],
  };
}

export function flashCommand(state, actor, proposed) {
  const { actionId, ...intent } = proposed;
  return {
    ...intent,
    ...brokerIntentMetadata(state, actor, proposed),
    id: `flash:${state.matchId}:${state.version}`,
    expectedVersion: state.version,
  };
}

export function recordTemporalTelemetry(persona, diagnostics) {
  if (diagnostics.selectedBy === "strategic-persona") persona.strategicDecisions++;
  const telemetry = diagnostics.temporalTelemetry;
  // A version/model label or top-level posture alone does not prove that the
  // temporal expert ran. Require its actual telemetry object.
  if (!telemetry || typeof telemetry !== "object" || typeof telemetry.macroPosture !== "string") return;
  persona.temporalDecisions++;
  if (telemetry.complete === true) persona.temporalCompleteDecisions++;
  const posture = telemetry.macroPosture;
  persona.temporalPostures[posture] = (persona.temporalPostures[posture] || 0) + 1;
}

// This function also accepts tiny synthetic states for focused harness tests.
export function stateConsistency(s, board = [], groups = [], previous = null) {
  const errors = [];
  const add = (test, label) => { if (!test) errors.push(label); };
  let houses = 0, hotels = 0;
  for (const [index, player] of s.players.entries()) {
    add(player.id === index, `player_id:${index}`);
    add(Number.isSafeInteger(player.cash) && player.cash >= 0, `cash:${index}`);
    add(Number.isInteger(player.pos) && player.pos >= 0 && player.pos < 40, `position:${index}`);
  }
  for (const [tile, asset] of Object.entries(s.assets)) {
    add(asset.owner === null || (Number.isInteger(asset.owner) &&
      !!s.players[asset.owner] && !s.players[asset.owner].out), `owner:${tile}`);
    add(Number.isInteger(asset.level) && asset.level >= 0 && asset.level <= 5, `level:${tile}`);
    add(typeof asset.mortgaged === "boolean", `mortgage_type:${tile}`);
    add(!(asset.mortgaged && asset.level), `mortgaged_building:${tile}`);
    add(asset.owner !== null || (!asset.level && !asset.mortgaged), `unowned_asset:${tile}`);
    if (board[tile]) add(board[tile].type === "city" || asset.level === 0, `non_city_building:${tile}`);
    if (asset.level === 5) hotels++;
    else houses += asset.level;
  }
  add(s.bank.houses === 32 - houses && s.bank.hotels === 12 - hotels, "bank_stock_consistency");
  add(Number.isInteger(s.bank.houses) && s.bank.houses >= 0 && s.bank.houses <= 32, "house_stock_bounds");
  add(Number.isInteger(s.bank.hotels) && s.bank.hotels >= 0 && s.bank.hotels <= 12, "hotel_stock_bounds");
  for (const group of groups) {
    const assets = group.ids.map(tile => s.assets[tile]);
    if (!assets.some(asset => asset.level > 0)) continue;
    add(assets.every(asset => asset.owner === assets[0].owner && asset.owner !== null && !asset.mortgaged),
      `developed_group_owner:${group.ids[0]}`);
    const levels = assets.map(asset => asset.level);
    add(Math.max(...levels) - Math.min(...levels) <= 1, `even_development:${group.ids[0]}`);
  }
  if (s.bankEconomy?.complete) {
    const ledger = s.bankEconomy;
    add(s.players.reduce((sum, player) => sum + player.cash, 0) ===
      ledger.openingCirculation + ledger.issued - ledger.absorbed, "cash_ledger_consistency");
  }
  if (previous) {
    add(s.version === previous.version + 1, "version_progress");
    add(s.eventId >= previous.eventId, "event_progress");
    add(s.turnSerial >= previous.turnSerial, "turn_progress");
  }
  return errors;
}

function reportPasses(report) {
  return report.actions > 0 && report.configuration.roster.every(id => report.personas[id].decisions > 0) &&
    !report.failure && !report.consistency.violations &&
    ["illegalOutputs", "engineCommandRejected", "plannerExceptions", "modelExceptions", "noAction", "noActor",
      "illegalProposalsRejected"].every(name => report.metrics[name] === 0);
}

// Kept independent of game imports so a blocked synchronous model cannot block
// this timer or report persistence. Tests may supply a synthetic Worker.
export async function superviseFlashWorker(worker, config) {
  const started = performance.now();
  let report = initialReport(config);
  let settled = false;
  let watchdog;
  return await new Promise((resolveResult, rejectResult) => {
    const finish = async (reason, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      report = { ...report, elapsedMs: performance.now() - started, stopReason: reason };
      if (reason === "time_cap") {
        report.workerTerminated = true;
        report.terminal = false;
        report.winner = null;
      }
      if (error) report.failure = { kind: reason, message: String(error.message || error) };
      report.allPersonasActed = config.roster.every(id => report.personas[id]?.decisions > 0);
      report.passed = reportPasses(report);
      const termination = worker.terminate();
      try {
        await mkdir(dirname(config.outputPath), { recursive: true });
        // Persist independently of worker termination, even during a blocked decision.
        await writeFile(config.outputPath, JSON.stringify(report, null, 2) + "\n");
        await termination;
        resolveResult(report);
      } catch (writeError) {
        await termination;
        rejectResult(writeError);
      }
    };
    watchdog = setTimeout(() => { void finish("time_cap"); }, config.maxMs);
    worker.on("message", message => {
      if (settled) return;
      if (message?.type === "snapshot") report = message.report;
      if (message?.type === "done") {
        report = message.report;
        void finish(report.stopReason);
      }
    });
    worker.on("error", error => { void finish("worker_exception", error); });
    worker.on("exit", code => {
      if (!settled) void finish("worker_exit", Error(`Worker exited without final report (code ${code})`));
    });
  });
}

function seededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  rng.getState = () => seed;
  rng.clone = () => seededRandom(seed);
  return rng;
}

async function runOneGame(config) {
  const [{ createGame, command, BOARD, GROUPS, worth }, { decidePersona }, { botActor }, { PERSONAS }] =
    await Promise.all([
      import("../lib/game.mjs"), import("../lib/bot/persona-router.mjs"),
      import("../lib/server/bot-worker.mjs"), import("../lib/bot/personas.mjs"),
    ]);
  const report = initialReport(config);
  const rng = seededRandom(config.seed);
  let state = createGame({
    players: config.roster.map(id => ({
      name: PERSONAS.find(persona => persona.id === id).name,
      controller: "bot", botPersona: id, botDifficulty: config.difficulty,
    })),
    startingRoll: config.startingRoll, rules: config.rules,
    matchId: `nusa-v23-flash-${config.seed}`,
  }, rng);
  const started = performance.now();
  const count = (object, key) => { object[key] = (object[key] || 0) + 1; };
  const unique = (array, value) => { if (value != null && !array.includes(value)) array.push(value); };
  const snapshot = (type = "snapshot") => {
    report.elapsedMs = performance.now() - started;
    report.progress = {
      phase: state.phase, round: state.round, turnSerial: state.turnSerial,
      version: state.version, eventId: state.eventId, rngState: rng.getState(),
      bank: state.bank, openingRollRounds: state.starting?.round ?? null,
      players: state.players.map(player => ({
        persona: player.botPersona, out: player.out, cash: player.cash, worth: worth(state, player.id),
        ownedTiles: Object.entries(state.assets).filter(([, a]) => a.owner === player.id).map(([id]) => Number(id)),
      })),
    };
    parentPort.postMessage({ type, report });
  };
  const fail = (kind, message, actor = null, action = null) => {
    report.failure = { kind, message: String(message), actor, action };
    report.stopReason = kind;
    report.checkpoint = { state, actor, action, rngState: rng.getState() };
  };
  const consistency = previous => {
    const errors = stateConsistency(state, BOARD, GROUPS, previous);
    report.consistency.checkedStates++;
    report.consistency.violations += errors.length;
    report.consistency.examples.push(...errors.slice(0, 12 - report.consistency.examples.length));
    if (errors.length) fail("state_invariant", errors.join(", "));
  };
  consistency(null);
  snapshot();
  while (!report.failure && state.phase !== "won" && report.actions < config.maxActions &&
         performance.now() - started < config.maxMs) {
    const actor = botActor(state);
    count(report.phases, state.phase);
    if (actor === null) {
      report.metrics.noActor++;
      fail("no_actor", `No production actor for ${state.phase}`);
      break;
    }
    const persona = report.personas[state.players[actor].botPersona];
    report.decisions++;
    persona.decisions++;
    // Send before synchronous planning too: a watchdog can identify the actor
    // whose decision was in flight, without inventing a completed action.
    report.inFlight = { actor, persona: state.players[actor].botPersona, phase: state.phase, version: state.version };
    snapshot();
    let plan;
    const beforeDecision = performance.now();
    try { plan = decidePersona(state, actor, { timeBudgetMs: config.timeBudgetMs }); }
    catch (error) {
      report.metrics.plannerExceptions++;
      fail("planner_exception", error.message, actor);
      break;
    }
    const decisionMs = performance.now() - beforeDecision;
    persona.totalDecisionMs += decisionMs;
    persona.maximumDecisionMs = Math.max(persona.maximumDecisionMs, decisionMs);
    if (decisionMs > config.timeBudgetMs) persona.decisionsOverBudget++;
    const diagnostics = plan?.diagnostics || {};
    unique(persona.models, diagnostics.model);
    unique(persona.versions, diagnostics.version);
    unique(persona.algorithms, diagnostics.algorithm);
    count(persona.reasons, diagnostics.reason ?? "unspecified");
    count(persona.selectedBy, diagnostics.selectedBy ?? "unspecified");
    recordTemporalTelemetry(persona, diagnostics);
    if (diagnostics.reason === "model_exception") report.metrics.modelExceptions++;
    if (diagnostics.reason === "illegal_proposal_rejected") report.metrics.illegalProposalsRejected++;
    if (EXPLICIT_FALLBACKS.has(diagnostics.reason)) report.metrics.fallbackDecisions++;
    if (diagnostics.budgetExhausted) report.metrics.budgetExhausted++;
    report.metrics.sandboxRejected += plan?.foundation?.counters?.rejected || 0;
    if (!plan?.action) {
      report.metrics.noAction++;
      fail("no_action", `No action for ${state.phase}`, actor);
      break;
    }
    const action = flashCommand(state, actor, plan.action);
    // Validate against the real state and exactly the same upcoming random
    // stream. A clone keeps hypothetical validation from consuming game RNG.
    try { command(state, actor, action, rng.clone()); }
    catch (error) {
      report.metrics.illegalOutputs++;
      fail("illegal_output", error.message, actor, action);
    }
    let next;
    try { next = command(state, actor, action, rng); }
    catch (error) {
      report.metrics.engineCommandRejected++;
      fail("engine_command_rejected", error.message, actor, action);
      break;
    }
    const previous = state;
    state = next;
    report.actions++;
    persona.actions++;
    count(persona.actionTypes, action.type);
    delete report.inFlight;
    consistency(previous);
    snapshot();
  }
  report.terminal = state.phase === "won";
  report.winner = report.terminal ? state.players[state.winner].botPersona : null;
  if (!report.failure) report.stopReason = report.terminal ? "won" :
    report.actions >= config.maxActions ? "action_cap" : "time_cap";
  snapshot("done");
}

if (!isMainThread && workerData?.flashBots === true) {
  await runOneGame(workerData.config);
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  const config = flashConfiguration(process.argv.slice(2));
  const report = await superviseFlashWorker(new Worker(new URL(import.meta.url), {
    workerData: { flashBots: true, config },
  }), config);
  console.log(JSON.stringify({
    report: config.outputPath, actions: report.actions, stopReason: report.stopReason,
    terminal: report.terminal, winner: report.winner, allPersonasActed: report.allPersonasActed,
    passed: report.passed, metrics: report.metrics,
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
