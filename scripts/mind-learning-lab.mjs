import {createGame,command} from '../lib/game.mjs';
import {decideMind,seeded,simulationActor} from '../lib/bot/mind.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {decideMind as frozenMind} from '../benchmarks/pre-v410/lib/bot/mind.mjs';
import {valueFeatures,predictValues,learnedPolicy,valueLogit} from '../lib/bot/learning.mjs';
import {cycleFingerprint} from './mind-lab-utils.mjs';
import {createHash} from 'node:crypto';
import {decideMind as frozen490} from '../benchmarks/pre-v410/lib/bot/mind.mjs';
import {sparringAction} from './mind-league.mjs';

export const quantile=(values,q)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))]:null;
export function runMatch({seed,n=3,policies=['economic'],model=null,historicalModel=null,explore=false,maxActions=6000,timeBudgetMs=80,maxNodes=160,maxMs=60000,collect=false,rules='digital',ablation={},captureFailure=false,simulationLogLimit=80}){
 const rng=seeded(seed),policyRng=seeded(seed^0x5f3759df),sampleRng=seeded(seed^0x1f123bb5),began=performance.now();
 // Lab controllers may repeat personas to exercise six seats. Production room
 // limits (>=2 humans, <=3 unique bots) are not altered by this harness.
 let s=createGame({players:Array.from({length:n},(_,i)=>({name:`Lab ${i}`,controller:'bot',botPersona:['raka','bima','sari'][(i+seed)%3],botDifficulty:'medium'})),startingRoll:true,matchId:`learn-${seed}-${n}`,rules},rng);
 const actionHash=createHash('sha256'),decisions=[],frames=[],latency=[],timings=new Map(),cycles=new Map(),recent=[],metrics={builds:0,trades:0,offers:0,auctions:0,monopolies:0};let actions=0,illegal=0,failure=null,lastFrameSerial=-1;
 while(s.phase!=='won'&&actions<maxActions){
  // The bot's public observation already retains only 80 log entries. Trimming
  // older presentation text in the lab reduces clone cost without changing any
  // action, RNG, money, queue or engine rule. Runtime history is never truncated.
  if(simulationLogLimit&&s.log.length>simulationLogLimit)s={...s,log:s.log.slice(0,simulationLogLimit)};
  if(performance.now()-began>maxMs){failure='wall_budget';break;}
  const actor=simulationActor(s),policy=policies[actor%policies.length],started=performance.now();let plan,decision=null;
  try{
   if(policy==='frozen-490')plan=frozen490(s,actor,{difficulty:'medium',timeBudgetMs:0});
   else if(policy==='baseline')plan=frozenMind(s,actor,{difficulty:'medium',timeBudgetMs:0});
   else if(policy==='baseline-search')plan=frozenMind(s,actor,{difficulty:'hardcore',timeBudgetMs,maxNodes,seed:seed+actions*997});
   else if(policy==='search'||policy==='learned-search')plan=decideMind(s,actor,{difficulty:'hardcore',timeBudgetMs,maxNodes,seed:seed+actions*997,...(policy==='learned-search'?{learningModel:model,allowCandidateModel:true}:{}),...ablation});
   else{plan=planDecision(s,actor,ablation);if(policy==='learned'||policy==='historical'){const recommendation=learnedPolicy(s,actor,plan,policy==='historical'?(historicalModel||model):model,{explore,rng:policyRng,temperature:.8});
    if(policy==='learned')decision=recommendation;if(recommendation)plan={...plan,action:recommendation.action};
   }else if(['hyper-bidder','trade-refuser','housing-hoarder','trade-exploiter'].includes(policy))plan={...plan,action:sparringAction(policy,s,actor,plan)};}
  }catch(e){failure=`planner_exception:${e.message}`;break;}
  const elapsed=performance.now()-started;latency.push(elapsed);if(!timings.has(policy))timings.set(policy,[]);timings.get(policy).push(elapsed);
  if(!plan.action){failure='no_candidate';break;}
  actionHash.update(JSON.stringify([actor,s.phase,plan.action,s.dice]));
  if(collect&&s.turnSerial!==lastFrameSerial){
   lastFrameSerial=s.turnSerial;const alive=s.players.filter(p=>!p.out);
   // Bounded, evenly spread match samples. Never label capped games as winners.
   const frame={features:alive.map(p=>valueFeatures(s,p.id)),ids:alive.map(p=>p.id),serial:s.turnSerial};
   if(frames.length<48)frames.push(frame);else{const slot=Math.floor(sampleRng()*(s.turnSerial+1));if(slot<48)frames[slot]=frame;}
  }
  if(collect&&decision){const predicted=predictValues(s,model);decisions.push({actor,serial:s.turnSerial,features:decision.features,probabilities:decision.probabilities,index:decision.index,baseline:predicted?.[actor]??1/s.players.filter(p=>!p.out).length});}
  const before=s;
  if(captureFailure){recent.push({actor,phase:s.phase,action:plan.action,auction:s.auction,queue:s.queue});if(recent.length>32)recent.shift();}
  try{s=command(s,actor,{...plan.action,id:`lab:${seed}:${actions}`,expectedVersion:s.version},rng);}catch(e){illegal++;failure=`illegal_action:${e.message}`;break;}
  if(['BUILD','BUILD_JOIN'].includes(plan.action.type))metrics.builds++;
  if(['OFFER','COUNTER'].includes(plan.action.type))metrics.offers++;
  if(plan.action.type==='TRADE_ACCEPT')metrics.trades++;
  metrics.auctions+=s.log.filter(e=>e.id>before.eventId&&e.type==='auctionResult').length;
  const fingerprint=cycleFingerprint(s),count=(cycles.get(fingerprint)||0)+1;cycles.set(fingerprint,count);if(cycles.size>256)cycles.delete(cycles.keys().next().value);
  if(count>8){failure='policy_cycle';break;}
  actions++;
 }
 if(s.phase!=='won'&&!failure)failure='action_cap';
 const finished=s.phase==='won',winner=finished?s.winner:null;
 const samples=finished?frames.filter(f=>f.ids.includes(winner)).map(f=>({features:f.features,winner:f.ids.indexOf(winner),progress:f.serial/Math.max(1,s.turnSerial)})):[];
 return {seed,n,policies,finished,winner,actions,actionHash:actionHash.digest('hex'),simulationLogLimit,illegal,failure,wallMs:performance.now()-began,metrics,latencyMs:{p50:quantile(latency,.5),p95:quantile(latency,.95),max:Math.max(0,...latency)},latencyByPolicy:Object.fromEntries([...timings].map(([p,values])=>[p,{samples:values.length,p50:quantile(values,.5),p95:quantile(values,.95),max:Math.max(...values)}])),bankrupt:s.players.map(p=>p.out),...(collect?{samples,episode:finished?{winner,decisions,frames:[...frames].sort((a,b)=>a.serial-b.serial)}:null}:{}),...(!finished?{failureState:{phase:s.phase,turn:s.turn,serial:s.turnSerial,auction:s.auction,trade:s.trade,players:s.players.map(p=>({id:p.id,cash:p.cash,out:p.out}))},...(captureFailure?{snapshot:s,recent}:{})}:{})};
}

export function calibration(model,samples,includeStages=true){
 let loss=0,brier=0,correct=0;
 for(const s of samples){const logits=s.features.map(x=>valueLogit(model,x)),max=Math.max(...logits),exp=logits.map(v=>Math.exp(v-max)),sum=exp.reduce((a,b)=>a+b,0),p=exp.map(v=>v/sum);
  loss-=Math.log(Math.max(1e-9,p[s.winner]));brier+=p.reduce((n,v,i)=>n+(v-(i===s.winner?1:0))**2,0);correct+=Number(p.indexOf(Math.max(...p))===s.winner);
 }
 return {samples:samples.length,logLoss:samples.length?loss/samples.length:null,brier:samples.length?brier/samples.length:null,accuracy:samples.length?correct/samples.length:null,...(includeStages?{byMatchProgress:{opening:calibration(model,samples.filter(s=>s.progress<1/3),false),middle:calibration(model,samples.filter(s=>s.progress>=1/3&&s.progress<2/3),false),late:calibration(model,samples.filter(s=>s.progress>=2/3),false)}}:{})};
}
