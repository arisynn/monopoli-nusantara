import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createLearningModel,fitValue,tdLambdaSamples,advantageWeightedPolicy,validLearningModel} from '../lib/bot/learning.mjs';
import {runMatch,calibration} from './mind-learning-lab.mjs';
import {leaguePolicies} from './mind-league.mjs';
import {mindProvenance,modelHash} from './mind-provenance.mjs';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const config={games:Number(args.games||16),rounds:Number(args.rounds||2),batch:Number(args.batch||8),hidden:Number(args.hidden??16),epochs:Number(args.epochs||6),seedBase:Number(args['seed-base']||0x10000000),sizes:(args.players||'2,3,4').split(',').map(Number),maxMs:Number(args['game-ms']||60000),maxActions:Number(args['max-actions']||6000),maxSamples:Number(args['max-samples']||3000)};
for(const [key,min,max] of [['games',4,10000],['rounds',0,1000],['batch',1,1000],['hidden',0,32],['epochs',1,100],['maxMs',100,3600000],['maxActions',1,100000],['maxSamples',100,20000]])if(!Number.isSafeInteger(config[key])||config[key]<min||config[key]>max)throw Error('Invalid training '+key);
if(config.sizes.some(n=>![2,3,4,6].includes(n))||!Number.isSafeInteger(config.seedBase)||config.seedBase<0||config.seedBase+0x01000000+(config.games+config.rounds*config.batch)*997>0x1fffffff)throw Error('Invalid training seeds/player counts');
const output=args.output||'docs/MIND_HYBRID_TRAINING.json',checkpoint=args.resume||args.checkpoint||output.replace(/\.json$/,'.checkpoint.json'),provenance=mindProvenance();
const protocolHash=createHash('sha256');for(const p of ['scripts/train-hybrid.mjs','scripts/mind-learning-lab.mjs','scripts/mind-league.mjs'])protocolHash.update(readFileSync(p));const protocol=protocolHash.digest('hex');
let state=args.resume?JSON.parse(readFileSync(args.resume,'utf8')):{schema:2,sourceHash:provenance.sourceHash,protocol,config,model:createLearningModel({hidden:config.hidden}),runs:[],training:[],validation:[],history:[],round:0,pending:[],pendingSamples:[],batches:[],warmupFitted:false};
if(state.schema!==2||state.sourceHash!==provenance.sourceHash||state.protocol!==protocol||JSON.stringify(state.config)!==JSON.stringify(config)||!validLearningModel(state.model))throw Error('Checkpoint differs from current source, protocol, model schema or configuration');
const save=()=>{if(mindProvenance().sourceHash!==provenance.sourceHash)throw Error('Source changed during training');mkdirSync(dirname(checkpoint),{recursive:true});writeFileSync(checkpoint+'.tmp',JSON.stringify(state));renameSync(checkpoint+'.tmp',checkpoint);};
const retain=(rows,added,limit)=>{rows.push(...added);if(rows.length>limit)rows.splice(0,rows.length-limit);};
let stop=false;process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
const record=(r,stage)=>{state.runs.push({...r,samples:undefined,episode:undefined,stage});console.log(`hybrid ${state.runs.length}: ${r.n} seats / ${r.finished?'finished':'FAILED '+r.failure} / ${r.actions} actions`);};
const play=(seed,n,options)=>runMatch({seed,n,maxActions:config.maxActions,maxMs:config.maxMs,collect:true,...options});
for(let i=state.runs.filter(r=>r.stage==='warmup').length;i<config.games&&!stop;i++){
 const n=config.sizes[i%config.sizes.length],r=play(config.seedBase+i*997,n,{policies:i%3?['economic']:['frozen-490','economic']});record(r,'warmup');
 retain(i%5===0?state.validation:state.training,r.samples,i%5===0?Math.max(100,Math.floor(config.maxSamples/4)):config.maxSamples);save();await new Promise(setImmediate);
}
if(!stop&&!state.warmupFitted){state.untrainedValidation=calibration(state.model,state.validation);state.losses=fitValue(state.model,state.training,{epochs:config.epochs});state.warmupFitted=true;state.history.push(structuredClone(state.model));save();}
for(;state.round<config.rounds&&!stop;state.round++){
 for(let i=state.pending.length;i<config.batch&&!stop;i++){
  const index=state.round*config.batch+i,n=config.sizes[index%config.sizes.length],seed=config.seedBase+0x01000000+index*997;
  const r=play(seed,n,{model:state.model,historicalModel:state.history[index%state.history.length],policies:leaguePolicies(index,n,index%n),explore:true});record(r,'league-'+state.round);
  state.pending.push(r.episode||null);retain(state.pendingSamples,r.samples,config.maxSamples);save();await new Promise(setImmediate);
 }
 if(stop)break;
 const episodes=state.pending.filter(Boolean),td=episodes.flatMap(e=>tdLambdaSamples(state.model,e)),updates=advantageWeightedPolicy(state.model,episodes);
 retain(state.training,state.pendingSamples,config.maxSamples);fitValue(state.model,[...state.training,...td].slice(-config.maxSamples),{epochs:3,rate:.01});
 state.batches.push({round:state.round,episodes:episodes.length,policyUpdates:updates,tdSamples:td.length,validation:calibration(state.model,state.validation)});
 state.history.push(structuredClone(state.model));state.history=state.history.slice(-3);state.pending=[];state.pendingSamples=[];
 // Advance before saving, so resume never repeats a completed update.
 state.round++;save();state.round--;
}
save();
if(stop){console.log(JSON.stringify({stopped:true,checkpoint,attempted:state.runs.length}));process.exitCode=0;}
else{
 const model=state.model;model.training={games:state.runs.filter(r=>r.finished).length,attemptedGames:state.runs.length,sourceHash:provenance.sourceHash,protocol,seedRanges:[{base:config.seedBase,count:config.games,stride:997},{base:config.seedBase+0x01000000,count:config.rounds*config.batch,stride:997}],method:'undiscounted TD(lambda) value calibration + KL-anchored AWR',policyUpdates:state.batches.reduce((n,b)=>n+b.policyUpdates,0)};
 const report={version:'4.10.0',generatedAt:new Date().toISOString(),provenance,config,checkpoint,modelHash:modelHash(model),training:model.training,untrainedValidation:state.untrainedValidation,finalValidation:calibration(model,state.validation),losses:state.losses,batches:state.batches,model,runs:state.runs,limitations:['Offline cloud CPU; Android/Termux speed must be measured on device.','No fabricated winner or training label from an unfinished match.','Feature model is a candidate, not a promoted production checkpoint.','Validation separates entire matches; a separate competitive holdout is still required.','Historical sparring uses up to three frozen checkpoints; this is a bounded league, not a claim of convergence.']};
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');writeFileSync(output.replace(/\.json$/,'.model.json'),JSON.stringify(model,null,2)+'\n');save();
 console.log(JSON.stringify({output,training:model.training,finalValidation:report.finalValidation,status:model.status},null,2));
}
