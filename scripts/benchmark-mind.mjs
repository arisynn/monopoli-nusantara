import {cycleFingerprint,promotionGate} from './mind-lab-utils.mjs';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGame,command,GROUPS,BOARD} from '../lib/game.mjs';
import {decideMind,MODELS,seeded,simulationActor,observation,positionValue} from '../lib/bot/mind.mjs';
import {PERSONAS} from '../lib/bot/personas.mjs';
import {planDecision as frozenPlan} from '../benchmarks/frozen-v45/lib/bot/strategy.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const mode=args.mode||'evaluation',seedBase=Number(args['seed-base']||460000),seeds=Number(args.seeds||2),maxActions=Number(args['max-actions']||6000);
const sizes=(args.players||'2,3,4,6').split(',').map(Number),variants=(args.models||'baseline,easy,medium,hard,hardcore').split(',');
const maxNodes=Number(args.nodes||160),seconds=Number(args.seconds||300),began=performance.now(),deadline=began+seconds*1000;
const sourceHash=createHash('sha256').update(['lib/bot/mind.mjs','lib/bot/strategy.mjs','lib/game.mjs'].map(p=>readFileSync(p)).join('\n')).digest('hex');
const runs=[],timings={},postmortems=[];let latestProgress=began;
const quantile=(a,q)=>a.length?a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))]:null;
function wilson(w,n){if(!n)return [0,1];const z=1.96,p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,e=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-e,c+e];}
function play(n,seed,seat,model,options={}){
 options={searchVariant:args.search||'short',...options};
 const rng=seeded(seed),persona=PERSONAS[(seed+seat)%3];
 const players=Array.from({length:n},(_,i)=>({name:`${PERSONAS[i%3].name} ${i}`,controller:'bot',botPersona:i===seat?persona.id:PERSONAS[i%3].id,botDifficulty:i===seat?model:'medium'}));
 // Competitive opponents are frozen v4.5, except explicit mixed/self-play conditions.
 let s=createGame({players,matchId:`mind-${seed}-${seat}`,startingRoll:true},rng),actions=0,invalid=0,failed=null,nodes=0,samples=0,budgetStops=0,builds=0,trades=0,monopolies=0,income=0,spendBuilding=0,auctionRatios=[],seenPhases=new Set(),traces=[],recent=[],cycles=new Map();
 while(s.phase!=='won'&&actions<maxActions){
  if(actions%40===0&&performance.now()>=deadline){failed='wall_budget';break;}
  const actor=simulationActor(s),useNew=mode==='self'||mode==='league'||actor===seat,policy=useNew?(mode==='league'?MODELS[actor%4].id:model):(args.opponents==='random'?'random':'baseline');let plan;
  seenPhases.add(s.phase);const t=performance.now();
  try{plan=policy==='baseline'?frozenPlan(s,actor):decideMind(s,actor,{difficulty:policy==='random'?'medium':policy,maxNodes,timeBudgetMs:180,seed:seed+actions*997,...options});}
  catch(e){failed='planner_exception:'+e.message;break;}
  const elapsed=performance.now()-t,key=policy+':'+s.phase;
  const times=timings[key]||=[];if(times.length<20000)times.push(elapsed);
  let action=plan.action;
  if(policy==='random'&&plan.candidates.length)action=plan.candidates[Math.floor(seeded(seed+actions*17)()*plan.candidates.length)].action;
  if(!action){failed='no_candidate';break;}
  nodes+=plan.diagnostics?.nodes||0;samples+=plan.diagnostics?.samples||0;budgetStops+=Number(plan.diagnostics?.budgetExhausted||false);
  const previous=s;
  try{s=command(s,actor,{...action,id:`lab:${actions}`,expectedVersion:s.version},rng);}catch(e){invalid++;failed='illegal_action:'+e.message;break;}
  const fingerprint=cycleFingerprint(s);
  const count=(cycles.get(fingerprint)||0)+1;if(cycles.size>256)cycles.clear();cycles.set(fingerprint,count);
  if(count>8){failed='repeated_policy_cycle';break;}
  actions++;recent.push({actor,action,phase:previous.phase,version:previous.version});if(recent.length>40)recent.shift();
  if(actor===seat){
   if(['BUILD','BUILD_JOIN'].includes(action.type))builds++;
   if(action.type==='TRADE_ACCEPT')trades++;
   if(['BUY','BUILD','BID','TRADE_ACCEPT','MORTGAGE','OFFER'].includes(action.type)&&traces.length<20){
    const delta=positionValue(s,actor)-positionValue(previous,actor);
    if(delta<-100||['BID','OFFER'].includes(action.type))traces.push({match:s.matchId,version:previous.version,phase:previous.phase,actor,policy,action,positionDelta:delta,state:observation(previous,actor),candidates:plan.candidates.map(c=>({id:c.id,action:c.action,utility:c.score})),diagnostics:plan.diagnostics});
   }
  }
  for(const e of s.log)if(e.id>previous.eventId){
   for(const f of e.finance||[]){if(f.to===seat)income+=f.amount;if(f.from===seat&&f.kind==='build')spendBuilding+=f.amount;}
   const r=e.auctionResult;if(r?.winner===seat)auctionRatios.push(r.amount/(r.kind==='building'?BOARD[r.tile]?.build||1:BOARD[r.tile].price));
  }
  monopolies=Math.max(monopolies,GROUPS.filter(g=>g.ids.every(i=>s.assets[i].owner===seat)).length);
 }
 const finished=s.phase==='won';
 if(!finished&&!failed)failed='action_cap';
 // Loss traces are hypotheses for review, not automatic claims that a legal move was wrong.
 if(finished&&s.winner!==seat&&postmortems.length<30)for(const trace of traces.slice(-3)){if(postmortems.length>=30)break;postmortems.push({...trace,outcome:'subsequent_match_loss',assessment:'counterfactual review required; outcome alone does not prove decision error'});}
 return {n,seed,seat,persona:persona.id,model,options,finished,winner:finished?s.winner:null,won:finished&&s.winner===seat,bankrupt:s.players[seat].out,actions,invalid,failed,builds,trades,monopolies,income,spendBuilding,auctionPriceRatio:auctionRatios.length?auctionRatios.reduce((a,b)=>a+b,0)/auctionRatios.length:null,nodes,samples,budgetStops,seenPhases:[...seenPhases],...(failed?{failedSnapshot:observation(s,seat),recent}:{} )};
}
const ablations={full:{},no_opponent:{noOpponent:true},no_lookahead:{noLookahead:true},no_risk:{noRisk:true},no_memory:{noMemory:true}};
outer:for(let k=0;k<seeds;k++)for(const n of sizes)for(let seat=0;seat<n;seat++)for(const model of variants){
 if(args.seat!==undefined&&Number(args.seat)!==seat)continue;
 for(const [variant,options] of mode==='ablation'?Object.entries(ablations):[['full',{}]]){
  if(performance.now()>=deadline)break outer;
  const seed=seedBase+k*997+n*31,result=play(n,seed,seat,model,options);runs.push({...result,variant});
  if(performance.now()-latestProgress>8000){console.log(`NUSA MIND: ${runs.length} games / ${runs.filter(r=>r.finished).length} finished / ${Math.round((performance.now()-began)/1000)}s`);latestProgress=performance.now();}
 }
}
const summarize=selected=>{const wins=selected.filter(r=>r.won).length;return {games:selected.length,finished:selected.filter(r=>r.finished).length,wins,winRate:selected.length?wins/selected.length:0,wilson95:wilson(wins,selected.length),illegal:selected.reduce((n,r)=>n+r.invalid,0),failed:selected.filter(r=>r.failed).length,bankrupt:selected.filter(r=>r.bankrupt).length,meanBuilds:selected.reduce((n,r)=>n+r.builds,0)/Math.max(1,selected.length),monopolies:selected.reduce((n,r)=>n+r.monopolies,0),acceptedTrades:selected.reduce((n,r)=>n+r.trades,0)};};
const paired={};
for(const model of variants.filter(m=>m!=='baseline')){
 const clusters=new Map();
 for(const r of runs.filter(r=>r.model===model)){
  const control=runs.find(c=>c.model==='baseline'&&c.seed===r.seed&&c.n===r.n&&c.seat===r.seat);if(!control)continue;
  const key=r.seed+':'+r.n;const group=clusters.get(key)||[];group.push(Number(r.won)-Number(control.won));clusters.set(key,group);
 }
 const groups=[...clusters.values()],boot=seeded(46818),deltas=[];
 if(groups.length)for(let i=0;i<1500;i++){let sum=0,count=0;for(let j=0;j<groups.length;j++){const g=groups[Math.floor(boot()*groups.length)];sum+=g.reduce((a,b)=>a+b,0);count+=g.length;}deltas.push(sum/count);}
 const all=groups.flat();paired[model]={pairs:all.length,independentSeedSizeClusters:groups.length,delta:all.length?all.reduce((a,b)=>a+b,0)/all.length:null,clusterBootstrap95:[quantile(deltas,.025),quantile(deltas,.975)]};
}
const report={node:process.version,resources:process.resourceUsage(),sourceHashFiles:['lib/bot/mind.mjs','lib/bot/strategy.mjs','lib/game.mjs'],version:'4.6.0',generatedAt:new Date().toISOString(),command:process.argv.slice(1),mode,sourceHash,seedBase,seeds,sizes,maxActions,maxNodes,wallSeconds:(performance.now()-began)/1000,summary:summarize(runs),byModel:Object.fromEntries(variants.map(m=>[m,summarize(runs.filter(r=>r.model===m))])),byPersona:Object.fromEntries(PERSONAS.map(p=>[p.id,summarize(runs.filter(r=>r.persona===p.id))])),bySize:Object.fromEntries(sizes.map(n=>[n,summarize(runs.filter(r=>r.n===n))])),paired,
 latencyMs:Object.fromEntries(Object.entries(timings).map(([k,a])=>[k,{samples:a.length,p50:quantile(a,.5),p95:quantile(a,.95),max:Math.max(...a)}])),
 limitations:['No real Groq calls or live Supabase; this is the real local game engine.','Paired seeds share initial RNG, but policies consume future random values differently.','Wilson intervals are descriptive; seed/size-cluster bootstrap accounts for rotated-seat correlation.','Unfinished/failed matches remain in denominators with zero wins. No artificial net-worth winner.','Income/build activity and auction premiums are descriptive, not proof of realized ROI.','Cloud CPU performance does not establish Android performance.','Difficulty ladder and competitive superiority require confidence intervals and sufficient held-out games.'],runs};
report.promotion=promotionGate(report);
mkdirSync('docs',{recursive:true});const output=args.output||'docs/MIND_EVALUATION.json';writeFileSync(output,JSON.stringify(report,null,2)+'\n');
writeFileSync(output.replace(/\.json$/,'.csv'),'n,seed,seat,persona,model,variant,finished,won,actions,invalid,failed\n'+runs.map(r=>[r.n,r.seed,r.seat,r.persona,r.model,r.variant,r.finished,r.won,r.actions,r.invalid,r.failed||''].join(',')).join('\n')+'\n');
writeFileSync(output.replace(/\.json$/,'_traces.json'),JSON.stringify(postmortems,null,2)+'\n');
console.log(JSON.stringify({output,wallSeconds:report.wallSeconds,summary:report.summary,byModel:report.byModel,paired},null,2));
