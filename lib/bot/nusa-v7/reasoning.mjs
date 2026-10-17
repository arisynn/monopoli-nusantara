/** ₦USA V7.1 — Selective public-information scenario search.
 * Uses authoritative Nusantara reducer, paired possible worlds / semantic RNG,
 * unchanged expert council, bounded node/time budgets, no trained weights.
 * Simulated private deck order is sampled independently from public knowledge;
 * it NEVER reads or copies the live game's hidden decks.
 */
import {BOARD} from '../../content.mjs';
import {command} from '../../game.mjs';
import {observation,sampleWorld,positionValue,rolloutPolicy,simulationActor,hashSeed} from '../mind.mjs';
import {legalCandidate} from '../candidates.mjs';
import {ScenarioRandom} from '../scenario-random.mjs';
import {nusaV7Decision} from './council.mjs';

export const NUSA_REASONING_VERSION='7.1.0-selective-crn';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const guardedPhase=new Set(['debt','card','starting','mortgage','buildOffer']);
const safeTypes=new Set(['BUY','BID','BUILD','BUILD_JOIN','JAIL_PAY','JAIL_CARD','OFFER','COUNTER']);
const protectedTypes=new Set(['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT','REDEEM','MORTGAGE','SELL','SELL_SET','TRADE_ACCEPT']);

/** Add legal incremental bid options to the native planner's shortlisted bids.
 * New bids use interpolation of native scores, NOT invented benefit estimates;
 * their merit still must survive paired simulations.
 */
export function expandNusaCandidates(state,actor,plan,{maxExtra=3}={}){
 const baseline=plan?.candidates||[];
 if(state.phase!=='auction'||!baseline.some(c=>c.action.type==='BID')||state.auction?.kind==='building')return plan;
 const bids=baseline.filter(c=>c.action.type==='BID'&&Number.isFinite(c.action.amount)).sort((a,b)=>a.action.amount-b.action.amount);
 const min=bids[0]?.action.amount,max=bids.at(-1)?.action.amount;
 if(!Number.isFinite(min)||min===max)return plan;
 const values=new Set(bids.map(c=>c.action.amount)),proposed=[];
 for(const factor of [.25,.5,.75]){
  const amount=Math.round((min+(max-min)*factor)/10)*10;
  if(amount<=min||amount>=max||values.has(amount))continue;
  const action={type:'BID',amount};
  if(!legalCandidate(observation(state,actor),actor,action))continue;
  const hi=bids.find(c=>c.action.amount>=amount),lo=bids.slice().reverse().find(c=>c.action.amount<=amount);
  if(!lo||!hi)continue;
  const weight=(amount-lo.action.amount)/Math.max(1,hi.action.amount-lo.action.amount);
  const score=lo.score+(hi.score-lo.score)*weight;
  proposed.push({id:`nusa-bid-${amount}`,action,score,expanded:true});
  if(proposed.length>=maxExtra)break;
 }
 return proposed.length?{...plan,candidates:[...baseline,...proposed]}:plan;
}
function eligible(base,c,phase){
 if(same(base,c))return true;
 if(phase==='buy')return c.type===base.type;
 if(phase==='auction')return c.type===base.type&&c.type==='BID';
 if(isBuild(base))return isBuild(c);
 if(isBuild(c))return false; // no speculative build against an END/ROLL baseline
 if(phase==='trade')return base.type===c.type;
 if(phase==='jail')return base.type===c.type;
 return false;
}
function searchCandidatePool(plan,first,phase,maxRoots){
 const selected=plan.candidates.filter(c=>eligible(first,c.action,phase));
 const base=selected.find(c=>same(c.action,first));if(!base)return [];
 // Score proximity guard: search cannot resurrect substantially worse native actions.
 const window=Math.max(220,Math.abs(base.score)*.16);
 return [base,...selected.filter(c=>c!==base&&c.score>=base.score-window).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))]
  .slice(0,maxRoots);
}
function evaluateWorld(publicView,actor,candidate,scenarioSeed,opts,expired){
 const random=new ScenarioRandom(scenarioSeed);
 let s=sampleWorld(publicView,random.stream(0,0,'sampled-decks'));
 const initial=positionValue(s,actor,{noRisk:true,noLearning:true});
 let nodes=0;
 try{
  const root=command(s,actor,candidate.action,random.forAction(s,actor,candidate.action));
  nodes++;s=root;
  if(s.log?.length>80)s.log=s.log.slice(-80);
  // A native macro is an optional legal plan, never a shortcut around reducer.
  const path=Array.isArray(candidate.macro)?candidate.macro.slice(1,5):[];
  for(const part of path){
   if(expired()||simulationActor(s)!==actor||!legalCandidate(s,actor,part))break;
   s=command(s,actor,part,random.forAction(s,actor,part));nodes++;
  }
  const horizon=publicView.turnSerial+opts.horizonTurns;
  for(let step=0;step<opts.horizonSteps&&s.phase!=='won'&&s.turnSerial<horizon;step++){
   if(expired())return {ok:false,nodes,reason:'budget'};
   const who=simulationActor(s),action=rolloutPolicy(s,who,random.policy(s,who),{rootActor:actor});
   if(!action)break;
   s=command(s,who,action,random.forAction(s,who,action));nodes++;
   if(s.log?.length>80)s.log=s.log.slice(-80);
  }
  return {ok:true,nodes,value:positionValue(s,actor,{noRisk:true,noLearning:true})-initial};
 }catch(e){return {ok:false,nodes,reason:'sandbox_exception'};}
}
/** Search only among compatible, native-legal candidates. Return original action
 * unless complete paired batches favor an alternative by a material margin.
 * Passing clock/budget for tests is supported; no nondeterministic policy RNG.
 */
export function nusaV71Decision(state,actor,plan,options={}){
 const began=performance.now();const phase=state.phase;
 const council=nusaV7Decision(state,actor,plan,{disabled:options.disabled||[],diagnostics:!!options.diagnostics});
 const councilDiagnostics=options.diagnostics?{reason:council.reason,candidateCount:council.candidateCount??plan?.candidates?.length??0,eligibleCount:council.eligibleCount??0,expertCoverage:council.expertCoverage??{},leaveOneOut:council.leaveOneOut??{}}:undefined;
 const result=(reason,extra={})=>({action:council.action,changed:council.changed,reason,search:{attempted:false,pairedSamples:0,nodes:0,reason},...(councilDiagnostics?{councilDiagnostics}:{}),...extra});
 if(options.disableSearch)return result('search_disabled');
 if(!council.action||guardedPhase.has(phase)||protectedTypes.has(council.action.type)||
    !safeTypes.has(council.action.type)||plan.candidates[0]?.score>=1e6)return result('protected_or_trivial');
 const maxMs=bounded(Number(options.maxMs??24),1,150);
 const maxNodes=bounded(Number(options.maxNodes??32),2,128);
 const maxRoots=bounded(Number(options.maxRoots??2),2,4);
 const maxSamples=bounded(Number(options.maxSamples??2),1,8);
 const pool=searchCandidatePool(plan,council.action,phase,maxRoots);
 if(pool.length<2)return result('no_comparable_candidates');
 const view=observation(state,actor);
 const invalid=pool.some(c=>!legalCandidate(view,actor,c.action));
 if(invalid)return result('illegal_candidate_rejected');
 const expired=()=>performance.now()-began>=maxMs;
 const estimatedSeed=hashSeed(`${state.matchId}:${state.version}:${actor}:${NUSA_REASONING_VERSION}`);
 const horizonTurns=bounded(Number(options.horizonTurns??2),1,6),horizonSteps=bounded(Number(options.horizonSteps??3),1,30);
 const returns=pool.map(()=>[]);let nodes=0,samples=0,reason='insufficient_paired_samples';
 for(let batch=0;batch<maxSamples;batch++){
  if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
  const values=[],batchNodes=[];
  for(const root of pool){
   if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
   const seed=hashSeed(`${estimatedSeed}:batch:${batch}`);
   const evaluation=evaluateWorld(view,actor,root,seed,{horizonTurns,horizonSteps},expired);
   nodes+=evaluation.nodes;
   if(!evaluation.ok){reason=evaluation.reason||'simulation_failed';break;}
   values.push(evaluation.value);batchNodes.push(evaluation.nodes);
  }
  // A truncated paired batch must never count as evidence for one candidate.
  if(values.length!==pool.length)break;
  values.forEach((v,i)=>returns[i].push(v));samples++;
 }
 const search={attempted:true,pairedSamples:samples,nodes,reason,roots:pool.length,wallMs:+(performance.now()-began).toFixed(2)};
 if(samples<2)return {...result(reason),search};
 const evidence=choosePairedSearchEvidence(pool,returns,view.rules?.salary??2000);
 search.reason=evidence.selectedIndex>0?'paired_search_selected':'economic_or_risk_guard';
 search.bestDelta=evidence.bestDelta;
 search.means=evidence.means;
 search.selected=pool[evidence.selectedIndex].id;
 const enough=evidence.selectedIndex>0;
 return {action:enough?pool[evidence.selectedIndex].action:council.action,changed:enough||council.changed,
   reason:enough?'crn_selective_search':council.reason,search,...(councilDiagnostics?{councilDiagnostics}:{})};
}

/** Pure evidence gate. Can be unit-tested independently of a particular game.
 * returns[i][sample] shares sampled worlds across i; no false 'win chance'.
 */
export function choosePairedSearchEvidence(pool,returns,salary){
 if(pool.length<2||returns.length!==pool.length||!returns[0]?.length||
   returns.some(x=>x.length!==returns[0].length||x.some(v=>!Number.isFinite(v))))
   return {selectedIndex:0,bestDelta:0,means:[]};
 const samples=returns[0].length,baseScore=pool[0].score;
 const means=returns.map(xs=>xs.reduce((a,b)=>a+b,0)/samples);
 const utilities=pool.map((c,i)=>c.score-baseScore+means[i]*.32);
 const order=pool.map((_,i)=>i).sort((a,b)=>utilities[b]-utilities[a]||pool[a].id.localeCompare(pool[b].id));
 const best=order[0],delta=utilities[best]-utilities[0];
 const pairs=returns[best].map((v,i)=>v-returns[0][i]);
 const avg=pairs.reduce((a,b)=>a+b,0)/samples;
 const enough=best!==0&&samples>=2&&delta>Math.max(35,salary*.014)&&avg>Math.max(60,salary*.025)&&
   pairs.filter(d=>d>0).length>=Math.ceil(samples*.66)&&
   pool[best].score>=baseScore-Math.max(120,salary*.065);
 return {selectedIndex:enough?best:0,bestDelta:+delta.toFixed(2),means:means.map(n=>+n.toFixed(2))};
}
