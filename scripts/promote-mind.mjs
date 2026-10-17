import {readFileSync,writeFileSync} from 'node:fs';
import {mindProvenance,modelHash} from './mind-provenance.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
if(!args.report||!args.model)throw Error('Use --report=heldout.json --model=trained.model.json');
const report=JSON.parse(readFileSync(args.report,'utf8')),model=JSON.parse(readFileSync(args.model,'utf8')),current=mindProvenance();
if(report.split!=='holdout'||report.promotion?.evidenceScope!=='learned-search'||!report.promotion.promote||report.promotion.reasons.length||report.modelHash!==modelHash(model)||report.sourceHash!==current.sourceHash||model.training?.sourceHash!==current.sourceHash)throw Error('Promotion rejected: require matching model/source and a passing held-out runtime benchmark, not just a policy component');
model.status='promoted';model.evidence={report:args.report,reportHash:modelHash(report),sourceHash:current.sourceHash,comparisons:report.runtimeVsSearch};
writeFileSync('lib/bot/learned-model.mjs',`// Promoted only after matching held-out evidence. Re-train after strategy changes.\nexport const LEARNED_MODEL=Object.freeze(${JSON.stringify(model,null,2)});\n`);
console.log('Verified learning model promoted; build and regression checks are still required.');
