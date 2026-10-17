import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLearningModel,fitValue,reinforcePolicy,VALUE_FEATURES,POLICY_FEATURES} from '../lib/bot/learning.mjs';
import {runMatch,calibration} from './mind-learning-lab.mjs';
import {mindProvenance,modelHash} from './mind-provenance.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const games=Number(args.games||96),rounds=Number(args.rounds||3),batch=Number(args.batch||12),seedBase=Number(args['seed-base']||710000),sizes=(args.players||'2,3,4').split(',').map(Number),output=args.output||'docs/MIND_LEARNING_TRAINING.json';
if(!Number.isSafeInteger(games)||games<4||games>10000||!Number.isSafeInteger(rounds)||rounds<0||rounds>100||!Number.isSafeInteger(batch)||batch<1||batch>1000||sizes.some(n=>![2,3,4,6].includes(n)))throw Error('Invalid bounded training configuration');
const provenance=mindProvenance(),model=createLearningModel(),training=[],validation=[],runs=[],batches=[];let updateCount=0;
const record=(r,stage)=>{runs.push({...r,samples:undefined,episode:undefined,stage});console.log(`self-play ${runs.length}: ${r.n} seats / ${r.finished?'finished':'FAILED '+r.failure} / ${r.actions} actions`);};
// Entire match belongs to one split. Validation games never enter either fit.
for(let i=0;i<games;i++){
 const n=sizes[i%sizes.length],seed=seedBase+i*997,r=runMatch({seed,n,collect:true,policies:i%3===0?['baseline','economic']:['economic']});record(r,'value-warmup');
 (i%5===0?validation:training).push(...r.samples);
}
const untrained=calibration(model,validation),losses=fitValue(model,training,{epochs:Number(args.epochs||18)}),valueValidation=calibration(model,validation);
for(let round=0;round<rounds;round++){
 const episodes=[],samples=[];
 for(let i=0;i<batch;i++){
  const n=sizes[(round*batch+i)%sizes.length],seed=seedBase+100000+round*batch*997+i*997,r=runMatch({seed,n,model,collect:true,explore:true,policies:round%2?['learned','economic','baseline']:['learned']});record(r,'policy-round-'+round);
  if(r.episode)episodes.push(r.episode);samples.push(...r.samples);
 }
 const before=[...model.policy],updates=reinforcePolicy(model,episodes);updateCount+=updates;
 training.push(...samples);fitValue(model,training,{epochs:3,rate:.01});
 batches.push({round,episodes:episodes.length,policyUpdates:updates,weightDelta:model.policy.reduce((n,w,i)=>n+Math.abs(w-before[i]),0),validation:calibration(model,validation)});
}
model.training={games:runs.filter(r=>r.finished).length,attemptedGames:runs.length,seedRanges:[{stage:'warmup',base:seedBase,count:games,stride:997},{stage:'policy',base:seedBase+100000,count:rounds*batch,stride:997}],valueSamples:training.length,validationSamples:validation.length,policyUpdates:updateCount};
if(mindProvenance().sourceHash!==provenance.sourceHash)throw Error('Source changed during training; rerun on a stable snapshot');
model.training.sourceHash=provenance.sourceHash;
const report={version:'4.9.0',generatedAt:new Date().toISOString(),command:process.argv.slice(1),provenance,sourceHash:model.training.sourceHash,modelHash:modelHash(model),method:'terminal-winner softmax value fitting + on-policy REINFORCE with pre-action baseline',valueFeatures:VALUE_FEATURES,policyFeatures:POLICY_FEATURES,training:model.training,untrainedValidation:untrained,valueValidationBeforePolicy:valueValidation,finalValidation:calibration(model,validation),losses,batches,model,runs,limitations:['Local real engine, no Groq or Supabase live.','Small linear policy/value functions; no claim of general intelligence.','Validation is match-separated within training experiment, not the final competitive holdout.','Unfinished games do not supply fabricated terminal labels.','Policy safety shortlist and engine validator remain active.']};
mkdirSync('docs',{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const modelPath=output.replace(/\.json$/,'.model.json');writeFileSync(modelPath,JSON.stringify(model,null,2)+'\n');
if(args.bundle==='true')writeFileSync('lib/bot/learned-model.mjs',`// Reproducible candidate trained by scripts/train-mind.mjs; promotion is separate.\nexport const LEARNED_MODEL=Object.freeze(${JSON.stringify(model,null,2)});\n`);
console.log(JSON.stringify({output,modelPath,training:model.training,finalValidation:report.finalValidation,bundled:args.bundle==='true'},null,2));
