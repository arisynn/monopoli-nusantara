import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Parse literal data only. Never execute the supplied generator, which also
// overwrites infrastructure and launches its own tournament.
const root = resolve(import.meta.dirname, '..');
const sourcePath = process.argv[2] || resolve(root, 'docs/imports/nusa-v22-generator.original.txt');
const source = await readFile(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (ast.parseDiagnostics.length) throw Error('Generator contains invalid template syntax');
const templates = new Map();
const counts = {};
for (const statement of ast.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    const name = declaration.name.getText(ast);
    if (!/^LAB_(BOARD_GRAPH|SITUATION|EXPERTS|COUNCIL|REASONING|INDEX)_MJS$/.test(name)) continue;
    if (!ts.isNoSubstitutionTemplateLiteral(declaration.initializer))
      throw Error(`Expected a literal source for ${name}`);
    templates.set(name, declaration.initializer.text);
    counts[name] = (counts[name] || 0) + 1;
  }
}
const sha = value => createHash('sha256').update(value).digest('hex');
const staged = new Map();
for (const name of ['board-graph', 'situation', 'experts', 'council', 'reasoning', 'index']) {
  let code = templates.get(`LAB_${name.toUpperCase().replaceAll('-', '_')}_MJS`);
  if (!code) throw Error(`Missing ${name} source`);
  code = code
    .replaceAll("'../../lib/content.mjs'", "'../../content.mjs'")
    .replaceAll("'../../lib/game.mjs'", "'../../game.mjs'")
    .replaceAll("'../../lib/bot/", "'../")
    .replaceAll('s.log=s.log.slice(-80)', 's.log=s.log.slice(0,80)')
    .replace('const maxMs=gear===3?Math.min(4200,Math.max(1800,requestedMs)):Math.min(240,Math.max(24,requestedMs));',
      'const maxMs=Math.max(0,Math.min(gear===3?4200:240,Number.isFinite(requestedMs)?requestedMs:0));');
  if (name === 'situation') {
    // Engine supports non-multiple legacy bids (e.g. 110 -> 160). Probing a
    // rounded ladder can misidentify that increment; use the shared rules.
    code = code.replace('BOARD,GROUPS,AUCTION_RULES', 'BOARD,GROUPS,AUCTION_RULES,auctionMinimum');
    code = code.replace("import {legalCandidate} from '../candidates.mjs';\n", '');
    const start = code.indexOf('export function getAuctionQuantum(');
    const end = code.indexOf('\nexport function analyzePublicCardCycles(', start);
    if (start < 0 || end < 0) throw Error('Missing auction compatibility boundary');
    code = code.slice(0, start) + `export function getAuctionQuantum(view,actor=view?.auction?.bidder){
  return {step:AUCTION_RULES.increment,minBid:auctionMinimum(view?.auction)};
}
` + code.slice(end);
  }
  if (name === 'council') {
    code = code.replace('if(!action)return false;', 'if(!action||context.decisionContext?.expired())return false;');
    const start = code.indexOf('export function ensureSovereignCandidates(');
    const end = code.indexOf('\nfunction compatible(', start);
    if (start < 0 || end < 0) throw Error('Missing council work boundary');
    const bounded = code.slice(start, end).replace(/^(\s*)for\(([^;\n]+)\)\{/gm,
      '$1for($2){\n$1  if(context.decisionContext?.expired())break;');
    code = code.slice(0, start) + bounded + code.slice(end);
    code = code.replace('plan,{diagnostics=false,disabled=[]}={})', 'plan,{diagnostics=false,disabled=[],context:decisionContext}={})');
    code = code.replace("if(!plan?.action||protectedType(plan.action)", "if(decisionContext?.expired())return fallback('council_budget_exhausted');\n  if(!plan?.action||protectedType(plan.action)");
    code = code.replace('const context=situationOf(state,actor,plan);\n  ensureSovereignCandidates', 'const context={...situationOf(state,actor,plan),decisionContext};\n  ensureSovereignCandidates');
  }
  if (name === 'experts') {
    code = code.replace('const targetView=stateOverride||c.view;\n  const partnerId=trade.to;',
      "if(c.decisionContext?.expired())return {willAccept:false,partnerNet:-Infinity,myEval:null,partnerEval:null};\n  const targetView=stateOverride||c.view;\n  const partnerId=trade.to;");
    code = code.replace('return STRATEGY_EXPERTS.flatMap(x=>{', 'return STRATEGY_EXPERTS.flatMap(x=>{\n    if(context.decisionContext?.expired())return [];');
  }
  if (name === 'reasoning') {
    code = code.replace('plan,{maxExtra=6}={})', 'plan,{maxExtra=6,context:decisionContext}={})');
    code = code.replace('if(!plan?.candidates)return plan;', 'if(!plan?.candidates||decisionContext?.expired())return plan;');
    code = code.replace('const context=situationOf(state,actor,plan);', 'const context={...situationOf(state,actor,plan),decisionContext};');
    code = code.replace('rawPlan,{maxExtra:6}', 'rawPlan,{maxExtra:6,context:options.context}');
    code = code.replace('diagnostics:!!options.diagnostics}', 'diagnostics:!!options.diagnostics,context:options.context}');
    code = code.replace('const expired=()=>performance.now()-began>=maxMs;', 'const expired=()=>options.context?.expired()||performance.now()-began>=maxMs;');
  }
  staged.set(`lib/bot/nusa-v7/${name}.mjs`, code.trimStart());
}
const expertIds = text => [...text.matchAll(/\{id:'([^']+)',name:/g)].map(m => m[1]);
const currentIds = expertIds(staged.get('lib/bot/nusa-v7/experts.mjs'));
if (!currentIds.length || new Set(currentIds).size !== currentIds.length)
  throw Error('Expected nonempty unique V22 experts');
const previous = JSON.parse(await readFile(resolve(root, 'NUSA_V21_IMPORTED_HASHES.json'), 'utf8'));
const previousIds = [...previous.predecessor.expertIds, ...previous.predecessor.addedExpertIds];
if (previous.version !== '21.0.0') throw Error('Expected V21 predecessor manifest');
// V22 intentionally rebuilds the expert council. Report membership changes;
// do not pretend that the clean-slate release retains all 50 V21 experts.
const predecessor = {
  version: previous.version, sourceFile: previous.sourceFile, sourceSha256: previous.sourceSha256,
  expertIds: previousIds,
  retainedExpertIds: currentIds.filter(id => previousIds.includes(id)),
  removedExpertIds: previousIds.filter(id => !currentIds.includes(id)),
  addedExpertIds: currentIds.filter(id => !previousIds.includes(id)),
  membershipPolicy: 'clean-slate'
};
const index = staged.get('lib/bot/nusa-v7/index.mjs');
const version = index.match(/NUSA_MODEL_VERSION='([^']+)'/)?.[1];
if (version !== '22.0.0') throw Error(`Expected reviewed V22 model, received ${version}`);
const temporary = await mkdtemp(join(tmpdir(), 'nusa-import-'));
try {
  for (const [path, code] of staged) {
    const file = join(temporary, basename(path));
    await writeFile(file, code);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
for (const [path, code] of staged) await writeFile(resolve(root, path), code);
await writeFile(resolve(root, 'NUSA_V22_IMPORTED_HASHES.json'), JSON.stringify({
  version, sourceFile: basename(sourcePath), sourceSha256: sha(source),
  templateOccurrences: counts, expertCount: currentIds.length, expertIds: currentIds, predecessor,
  files: Object.fromEntries([...staged].map(([path, code]) => [path, sha(code)])),
  compatibilityPatches: [
    'Extract the six V22 model literals without executing generator side effects.',
    'Resolve imports to canonical runtime modules.',
    'Use shared auctionMinimum and increment, including legacy save amounts.',
    'Retain newest 80 simulation events.',
    'Honor remaining search budget without a forced minimum.',
    'Preserve existing worker and persona-router safeguards separately.',
    'Cooperatively stop optional council expansion, expert evaluation and search with the shared decision context.'
  ],
  containsTrainedWeights: false,
  benchmarkRun: false
}, null, 2) + '\n');
console.log(`Imported NUSA ${version}: six syntax-checked model modules; no generator execution or benchmark.`);
