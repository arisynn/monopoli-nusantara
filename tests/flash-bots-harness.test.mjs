import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flashConfiguration, flashCommand, recordTemporalTelemetry, stateConsistency, superviseFlashWorker,
} from "../scripts/flash-bots.mjs";

test("flash configuration permits exactly one game within the user's limits", () => {
  const config = flashConfiguration([]);
  assert.equal(config.games, 1);
  assert.equal(config.maxMs, 30000);
  assert.equal(config.maxActions, 600);
  assert.equal(config.timeBudgetMs, 24);
  assert.equal(config.roster.length, 6);
  assert.equal(config.startingRoll, true);
  assert.equal(config.rules, "classic");
  for (const arg of ["--games=2", "--max-actions=601", "--game-ms=30001", "--budget=25", "--seed=-1"])
    assert.throws(() => flashConfiguration([arg]));
});

test("flash commands preserve trusted broker markers with separate command identity", () => {
  const state = { players: [{ controller: "bot", botPersona: "nusa" }], matchId: "fixture", version: 7 };
  const proposed = { type: "OFFER", actionId: "nusa-2hop-broker-step1-5-for-12-extra", trade: { to: 1 } };
  assert.deepEqual(flashCommand(state, 0, proposed), {
    type: "OFFER", trade: { to: 1 }, actionId: "nusa-2hop-broker-step1-5-for-12",
    id: "flash:fixture:7", expectedVersion: 7,
  });
  assert.equal(proposed.actionId, "nusa-2hop-broker-step1-5-for-12-extra");
  assert.equal(flashCommand(state, 0, { ...proposed, actionId: "c4" }).actionId, undefined);
  assert.equal(flashCommand(state, 0, { ...proposed, type: "COUNTER" }).actionId, undefined);
  state.players[0].botPersona = "raka";
  assert.equal(flashCommand(state, 0, proposed).actionId, undefined);
});

test("temporal counts require real telemetry and distinguish full analysis and strategic selection", () => {
  const persona = { strategicDecisions: 0, temporalDecisions: 0, temporalCompleteDecisions: 0, temporalPostures: {} };
  recordTemporalTelemetry(persona, { model: "NUSA-V23", macroPosture: "TEMPO_BREAKER" });
  assert.equal(persona.temporalDecisions, 0);
  recordTemporalTelemetry(persona, {
    selectedBy: "strategic-persona", temporalTelemetry: { macroPosture: "TEMPO_BREAKER", complete: true },
  });
  recordTemporalTelemetry(persona, {
    selectedBy: "economic-floor", temporalTelemetry: { macroPosture: "NEUTRAL", complete: false },
  });
  assert.deepEqual(persona, {
    strategicDecisions: 1, temporalDecisions: 2, temporalCompleteDecisions: 1,
    temporalPostures: { TEMPO_BREAKER: 1, NEUTRAL: 1 },
  });
});

test("state checks catch invalid cash, owner, stock, and missing version progress", () => {
  const state = {
    players: [{ id: 0, cash: 15000, pos: 0, out: false }],
    assets: { 1: { owner: 0, level: 0, mortgaged: false } },
    bank: { houses: 32, hotels: 12 }, version: 1, eventId: 1, turnSerial: 0,
    bankEconomy: { complete: true, openingCirculation: 15000, issued: 0, absorbed: 0 },
  };
  assert.deepEqual(stateConsistency(state), []);
  const invalid = structuredClone(state);
  invalid.players[0].cash = -1;
  invalid.assets[1].owner = 7;
  invalid.bank.houses = 31;
  const errors = stateConsistency(invalid, [], [], state);
  for (const expected of ["cash:0", "owner:1", "bank_stock_consistency", "cash_ledger_consistency", "version_progress"])
    assert(errors.includes(expected), expected);
});

test("parent watchdog persists a report and stops synchronous work without starting a game", async () => {
  const folder = await mkdtemp(join(tmpdir(), "nusa-flash-watchdog-"));
  try {
    const config = { ...flashConfiguration([]), maxMs: 100, outputPath: join(folder, "report.json") };
    // Deliberately no game/model import: this verifies the watchdog mechanism.
    const worker = new Worker("while (true) {}", { eval: true });
    const started = performance.now();
    const report = await superviseFlashWorker(worker, config);
    assert(performance.now() - started < 5000);
    assert.equal(report.stopReason, "time_cap");
    assert.equal(report.workerTerminated, true);
    assert.equal(report.terminal, false);
    assert.equal(report.winner, null);
    assert.equal(report.actions, 0);
    assert.equal(report.passed, false);
    assert.deepEqual(JSON.parse(await readFile(config.outputPath, "utf8")), report);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
