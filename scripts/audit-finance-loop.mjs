// Read-only audit of an extracted NUSA benchmark archive against this checkout.
// Usage: node scripts/audit-finance-loop.mjs /path/to/NUSA_MIND_BENCHMARK_LAB_V23 [output.json]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as production from '../lib/game.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {observation} from '../lib/bot/mind.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {analyzeState, portfolioValue, liquidityPenalty} from '../lib/bot/analysis.mjs';
import {candidateState} from '../lib/bot/candidates.mjs';

if (!process.argv[2]) throw Error('Pass the extracted benchmark directory');
const root = path.resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const rows = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
const digest = data => createHash('sha256').update(data).digest('hex');
const hash = state => digest(JSON.stringify(state));
const lab = await import(pathToFileURL(path.join(root, 'engine/index.mjs')));
const {recordBotMemory} = await import(pathToFileURL(path.join(root, 'models/index.mjs')));
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
  const p = path.join(dir, e.name); return e.isDirectory() ? walk(p) : [p];
});
const rngFor = initial => {let seed = initial >>> 0; return () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;
};};
const increment = (map, key, n = 1) => {map[key] = (map[key] || 0) + n;};
const parity = walk(path.join(root, 'models/bot')).map(file => {
  const relative = path.relative(path.join(root, 'models/bot'), file);
  const target = path.join(repo, 'lib/bot', relative);
  return {file: relative, same: fs.existsSync(target) && digest(fs.readFileSync(file)) === digest(fs.readFileSync(target))};
});
const report = {node: process.version, modelFileCount: parity.length,
  modelDifferences: parity.filter(x => !x.same), completed: 0, partial: [],
  verifiedActions: 0, stopReasons: {}, loopPersonas: {}, actionsByPersona: {}, matches: [], probes: []};
const probeOrigins = new Map();
const frozen = {timeBudgetMs: 10000, clock: () => 0, noLearning: true};
function inspect(before, actor, recorded) {
  const view = observation(before, actor), base = planDecision(view, actor, frozen);
  const a = analyzeState(view, actor, frozen);
  const selected = decidePersona(before, actor, {...frozen, nusaMode: 'council'});
  const redeems = base.candidates.filter(c => c.action.type === 'REDEEM').map(c => {
    const tile = c.action.tile, cost = production.redemption(tile);
    const synthetic = {...view, assets: {...view.assets, [tile]: {...view.assets[tile], mortgaged: false}}};
    const actual = candidateState(view, actor, c.action);
    assert(actual, 'A listed redemption must be legal');
    const beforeValue = portfolioValue(view, actor, a);
    const syntheticValue = portfolioValue(synthetic, actor, a), actualValue = portfolioValue(actual, actor, a);
    const penalty = liquidityPenalty(view.players[actor].cash - cost, a.reserve) - liquidityPenalty(view.players[actor].cash, a.reserve);
    return {tile, cost, cashBefore: view.players[actor].cash, cashAfter: actual.players[actor].cash,
      beforeValue, syntheticValue, actualValue, listedScore: c.score,
      syntheticScore: syntheticValue - beforeValue - cost - penalty,
      actualTransitionScore: actualValue - beforeValue - cost - penalty};
  });
  return {recorded, baseAction: base.action, councilOrKresnaAction: selected.action,
    reason: selected.diagnostics?.reason, redeems};
}
for (const run of fs.readdirSync(path.join(root, 'runs')).filter(x => x.startsWith('run-')).sort()) {
  const matches = path.join(root, 'runs', run, 'matches');
  for (const match of fs.readdirSync(matches).sort()) {
    const dir = path.join(matches, match), actions = rows(path.join(dir, 'actions.jsonl'));
    const key = `${run}/${match}`;
    if (!fs.existsSync(path.join(dir, 'summary.json'))) {
      report.partial.push({match: key, actions: actions.length}); continue;
    }
    const cfg = read(path.join(dir, 'summary.json')), initial = read(path.join(dir, 'initial-state.json'));
    const alerts = rows(path.join(dir, 'alerts.jsonl'));
    const options = {players: initial.players.map(p => ({name: p.name, controller: p.controller,
      botPersona: p.botPersona, botDifficulty: p.botDifficulty})), startingRoll: false,
      advisorEnabled: false, matchId: initial.matchId};
    const labRng = rngFor(cfg.seed), prodRng = rngFor(cfg.seed);
    let state = lab.createGame(options, labRng), prod = production.createGame(options, prodRng);
    assert.equal(hash(state), hash(initial), `${key}: lab initial`);
    assert.equal(hash(prod), hash(initial), `${key}: production initial`);
    const findings = [];
    for (const row of actions) {
      assert.equal(hash(state), row.stateHashBefore, `${key}:${row.step}: lab before`);
      assert.equal(hash(prod), row.stateHashBefore, `${key}:${row.step}: production before`);
      for (const alert of alerts) {
        if (row.step === alert.firstStep || row.step === alert.firstStep + 1) {
          findings.push({step: row.step, ...inspect(prod, row.actor, row.action)});
          if (!probeOrigins.has(row.persona)) probeOrigins.set(row.persona, {match: key, step: row.step, state: structuredClone(prod), actor: row.actor});
        }
      }
      const action = {...row.action, id: `bench:${initial.matchId}:${row.step}`, expectedVersion: state.version};
      const previous = state;
      state = lab.command(previous, row.actor, action, labRng);
      recordBotMemory(state, previous, row.actor, row.action);
      prod = production.command(prod, row.actor, action, prodRng);
      assert.equal(hash(state), row.stateHashAfter, `${key}:${row.step}: lab after`);
      assert.equal(hash(prod), row.stateHashAfter, `${key}:${row.step}: production after`);
      increment(report.actionsByPersona, row.persona);
    }
    assert.equal(hash(prod), hash(read(path.join(dir, 'final-state.json'))), `${key}: final`);
    report.completed++; report.verifiedActions += actions.length;
    increment(report.stopReasons, cfg.stopReason);
    for (const alert of alerts) increment(report.loopPersonas, actions.find(r => r.step === alert.lastStep).persona);
    report.matches.push({match: key, steps: actions.length, stopReason: cfg.stopReason,
      replay: 'PASS: lab and production, every before/after hash', alerts, findings});
  }
}
for (const [persona, origin] of probeOrigins) {
  let state = origin.state;
  const continuation = [];
  for (let i = 0; i < 6; i++) {
    // NUSA uses the default search entry point with a real 2600 ms budget.
    // Kresna has no scenario search: freeze the clock to remove exhaustion.
    const options = persona === 'nusa' ? {timeBudgetMs: 2600} : frozen;
    const result = decidePersona(state, origin.actor, options);
    continuation.push({cash: state.players[origin.actor].cash, phase: state.phase,
      turnSerial: state.turnSerial, action: result.action, reason: result.diagnostics?.reason,
      nodes: result.diagnostics?.nodes});
    state = production.command(state, origin.actor, result.action, () => .413);
    if (state.turn !== origin.actor || state.phase !== origin.state.phase) break;
  }
  report.probes.push({persona, match: origin.match, step: origin.step, continuation});
}
const fixture = read(path.join(root, 'fixtures/nusa-loop-mortgage-redeem.json')).state;
const fixtureFinance = fixture.log.toSorted((a, b) => a.id - b.id).flatMap(e =>
  (e.finance || []).filter(f => ['mortgage', 'redeem'].includes(f.kind)).map(f =>
    ({eventId: e.id, version: e.version, actor: e.actor, round: e.turn, ...f})));
report.namedFixture = {events: fixture.log.length, financeEvents: fixtureFinance.length,
  phase: fixture.phase, version: fixture.version, finance: fixtureFinance,
  interestPaid: fixtureFinance.filter(f => f.kind === 'redeem').reduce((n, f) =>
    n + f.amount - production.BOARD[f.tile].mortgage, 0)};
const output = process.argv[3];
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({completed: report.completed, partial: report.partial.length,
  verifiedActions: report.verifiedActions, stopReasons: report.stopReasons,
  loopPersonas: report.loopPersonas, modelDifferences: report.modelDifferences.length,
  probes: report.probes.map(p => ({persona: p.persona, actions: p.continuation.map(r => r.action.type)}))}, null, 2));
