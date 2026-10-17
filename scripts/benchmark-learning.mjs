import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {seeded} from '../lib/bot/mind.mjs';
import {runMatch,quantile} from './mind-learning-lab.mjs';
import {mindProvenance,modelHash} from './mind-provenance.mjs';
import {Worker} from 'node:worker_threads';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const model=JSON.parse(readFileSync(args.model||'docs/MIND_LEARNING_TRAINING.model.json','utf8'));
const seeds=Number(args.seeds||8),seedBase=Number(args['seed-base']||930000),sizes=(args.players||'2,3,4').split(',').map(Number),variants=(args.variants||'foundation,learned-policy').split(','),pool=args.opponents||'baseline',output=args.output||'docs/MIND_LEARNING_EVALUATION.json',split=args.split||'holdout',workers=Number(args.workers||1);
if(!Number.isSafeInteger(workers)||workers<1||workers>4)throw Error('workers must be between 1 and 4');
if(!Number.isSafeInteger(seeds)||seeds<1||seeds>10000||sizes.some(n=>![2,3,4,6].includes(n))||!['baseline','economic'].includes(pool)||variants.some(v=>!['foundation','learned-policy','search','learned-search'].includes(v))||!['tuning','holdout'].includes(split))throw Error('Invalid benchmark configuration');
const trainingSeeds=new Set((model.training?.seedRanges||[]).flatMap(r=>Array.from({length:r.count},(_,i)=>r.base+i*r.stride)));
const evaluationSeeds=Array.from({length:seeds},(_,i)=>seedBase+i*997);if(evaluationSeeds.some(s=>trainingSeeds.has(s)))throw Error('Training/benchmark seeds overlap');
const provenance=mindProvenance(),artifactHash=modelHash(model),mapping={'foundation':'economic','learned-policy':'learned','search':'search','learned-search':'learned-search'},runs=[],controls=[],began=performance.now();
const protocol=Object.fromEntries(['scripts/benchmark-learning.mjs','scripts/mind-match-worker.mjs','scripts/mind-learning-lab.mjs','scripts/mind-lab-utils.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
function summary(selected){const finished=selected.filter(r=>r.finished).length,wins=selected.filter(r=>r.won).length;return {games:selected.length,finished,wins,winRate:selected.length?wins/selected.length:null,illegal:selected.reduce((n,r)=>n+r.illegal,0),failures:selected.filter(r=>r.failure).length,bankrupt:selected.filter(r=>r.bankrupt[r.seat]).length,medianPerMatchDecisionP50:quantile(selected.map(r=>r.latencyByPolicy?.[mapping[r.variant]]?.p50??r.latencyMs.p50),.5),medianPerMatchDecisionP95:quantile(selected.map(r=>r.latencyByPolicy?.[mapping[r.variant]]?.p95??r.latencyMs.p95),.5)};}
function paired(a,b){
 const clusters=new Map();
 for(const r of a){const control=b.find(c=>c.seed===r.seed&&c.n===r.n&&c.seat===r.seat);if(!control)continue;const key=`${r.seed}:${r.n}`,values=clusters.get(key)||[];values.push(Number(r.won)-Number(control.won));clusters.set(key,values);}
 const values=[...clusters].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v),rng=seeded(957218),boot=[],all=values.flat();
 if(values.length)for(let i=0;i<2000;i++){let sum=0,count=0;for(let k=0;k<values.length;k++){const group=values[Math.floor(rng()*values.length)];sum+=group.reduce((a,b)=>a+b,0);count+=group.length;}boot.push(sum/count);}
 return {pairs:all.length,independentSeedSizeClusters:values.length,delta:all.length?all.reduce((a,b)=>a+b,0)/all.length:null,clusterBootstrap95:[quantile(boot,.025),quantile(boot,.975)]};
}
function report(){
 const byVariant=Object.fromEntries(variants.map(v=>[v,summary(runs.filter(r=>r.variant===v))]));
 const pairedVsControl=Object.fromEntries(variants.map(v=>[v,paired(runs.filter(r=>r.variant===v),controls)]));
 const learned=runs.filter(r=>r.variant==='learned-policy'),foundation=runs.filter(r=>r.variant==='foundation'),learningDelta=paired(learned,foundation),problems=[];
 if(split!=='holdout')problems.push('not_final_holdout');if(learned.length<300)problems.push('insufficient_held_out_games');
 if(runs.length!==seeds*sizes.reduce((a,b)=>a+b,0)*variants.length||controls.length!==seeds*sizes.reduce((a,b)=>a+b,0))problems.push('evaluation_incomplete');
 if(learningDelta.independentSeedSizeClusters<30)problems.push('insufficient_independent_clusters');
 if(learned.some(r=>r.illegal)||!learned.length)problems.push('invalid_or_missing_action_results');
 if(!learned.length||learned.filter(r=>r.finished).length/learned.length<.99)problems.push('finish_rate_below_99_percent');
 if(!(learningDelta.clusterBootstrap95[0]>0))problems.push('learning_superiority_not_established');
 if(model.training?.sourceHash!==provenance.sourceHash)problems.push('model_source_mismatch');
 const runtime=runs.filter(r=>r.variant==='learned-search'),runtimeDelta=paired(runtime,runs.filter(r=>r.variant==='search')),runtimeProblems=[];
 if(split!=='holdout')runtimeProblems.push('not_final_holdout');
 if(runtime.length<300||runtimeDelta.pairs!==runtime.length)runtimeProblems.push('insufficient_runtime_comparisons');
 if(runtimeDelta.independentSeedSizeClusters<30)runtimeProblems.push('insufficient_independent_clusters');
 if(!runtime.length||runtime.some(r=>r.illegal)||runtime.filter(r=>r.finished).length/runtime.length<.99)runtimeProblems.push('runtime_health_not_established');
 if(!(runtimeDelta.clusterBootstrap95[0]>0))runtimeProblems.push('runtime_learning_superiority_not_established');
 if(problems.includes('model_source_mismatch')||problems.includes('evaluation_incomplete'))runtimeProblems.push('source_or_experiment_incomplete');
 return {version:'4.9.0',generatedAt:new Date().toISOString(),split,command:process.argv.slice(1),provenance,protocol,resume:args.resume?{file:args.resume,completedGroups:resumedGroups}:null,sourceHash:provenance.sourceHash,modelHash:artifactHash,seedBase,seeds,sizes,variants,pool,workers,modelTraining:model.training,wallSeconds:(performance.now()-began)/1000,byVariant,bySize:Object.fromEntries(sizes.map(n=>[n,Object.fromEntries(variants.map(v=>[v,summary(runs.filter(r=>r.variant===v&&r.n===n))]))])),byPersona:Object.fromEntries(['raka','bima','sari'].map((p,i)=>[p,Object.fromEntries(variants.map(v=>[v,summary(runs.filter(r=>r.variant===v&&(r.seed+r.seat)%3===i))]))])),pairedVsControl,learningVsFoundation:learningDelta,runtimeVsSearch:runtimeDelta,componentPromotion:{promote:problems.length===0,reasons:problems},promotion:{promote:runtimeProblems.length===0,reasons:runtimeProblems,evidenceScope:'learned-search',automaticProductionChanges:false},controls,runs,limitations:['Real local engine; no live Groq or Supabase.','Paired seeds share initial RNG; action policies can consume different later RNG values.','Clustered bootstrap groups seat rotations by seed and participant count.','Unfinished games receive no invented winner and count as zero wins.','Reported latency is cloud CPU with the declared worker count, not Android.','Self-play lab can repeat persona labels at six seats; production room limits are unchanged.']};
}
mkdirSync('docs',{recursive:true});
let resumedGroups=0;
if(args.resume){
 const old=JSON.parse(readFileSync(args.resume,'utf8'));
 if(old.sourceHash!==provenance.sourceHash||old.modelHash!==artifactHash||old.seedBase!==seedBase||old.seeds!==seeds||JSON.stringify(old.sizes)!==JSON.stringify(sizes)||JSON.stringify(old.variants)!==JSON.stringify(variants)||old.pool!==pool)throw Error('Resume evidence does not match model, source or experiment');
 for(const seed of evaluationSeeds)for(const n of sizes){const group=old.runs.filter(r=>r.seed===seed&&r.n===n),control=old.controls.filter(r=>r.seed===seed&&r.n===n);if(group.length===n*variants.length&&control.length===n&&[...group,...control].every(r=>r.finished&&!r.failure&&r.illegal===0)){runs.push(...group);controls.push(...control);resumedGroups++;}}
 console.log(`Resuming ${resumedGroups} completed groups with unchanged model/source; failed groups are re-run.`);
}
const jobs=evaluationSeeds.flatMap(seed=>sizes.filter(n=>!runs.some(r=>r.seed===seed&&r.n===n)).map(n=>({seed,n,pool,variants,model,budget:Number(args.budget||100),nodes:Number(args.nodes||240),ablation:args.ablation==='no-opponent'?{ablateOpponent:true}:{}})));
let nextJob=0;const threads=[];
try{await Promise.all(Array.from({length:workers},()=>new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./mind-match-worker.mjs',import.meta.url));threads.push(worker);
 const send=()=>{if(nextJob>=jobs.length){resolve();return;}worker.postMessage(jobs[nextJob++]);};
 worker.on('error',reject);worker.on('message',data=>{if(data.error){reject(Error(data.error));return;}controls.push(...data.controls);runs.push(...data.runs);runs.sort((a,b)=>a.seed-b.seed||a.n-b.n||a.seat-b.seat||a.variant.localeCompare(b.variant));controls.sort((a,b)=>a.seed-b.seed||a.n-b.n||a.seat-b.seat);writeFileSync(output,JSON.stringify(report(),null,2)+'\n');console.log(`benchmark ${runs.length}/${seeds*sizes.reduce((a,b)=>a+b,0)*variants.length}: seed ${data.seed}, ${data.n} seats, ${data.runs.filter(r=>r.finished).length}/${data.runs.length} finished`);send();});
 send();
})));}finally{await Promise.all(threads.map(w=>w.terminate()));}
if(mindProvenance().sourceHash!==provenance.sourceHash)throw Error('Source changed during evaluation; evidence cannot be promoted');
for(const [p,hash]of Object.entries(protocol))if(createHash('sha256').update(readFileSync(p)).digest('hex')!==hash)throw Error('Benchmark protocol changed during evaluation');
const final=report();
writeFileSync(output,JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify({output,byVariant:final.byVariant,learningVsFoundation:final.learningVsFoundation,promotion:final.promotion},null,2));
