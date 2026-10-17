/** NUSA V10.0 — Selective Public-Information Paired CRN Search with CVaR
 * Downside Tail Guard and Ascending-Clock Auction Preservation.
 */
import {command} from '../../game.mjs';
import {observation,sampleWorld,positionValue,rolloutPolicy,simulationActor,hashSeed} from '../mind.mjs';
import {legalCandidate} from '../candidates.mjs';
import {ScenarioRandom} from '../scenario-random.mjs';
import {situationOf} from './situation.mjs';
import {nusaV7Decision,ensureSovereignCandidates} from './council.mjs';

export const NUSA_REASONING_VERSION='10.0.0-sovereign-crn';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const guardedPhase=new Set(['debt','card','starting','auction','buy']);
const safeTypes=new Set(['BUILD','BUILD_JOIN','BUILD_DECLINE','JAIL_PAY','JAIL_CARD','ROLL','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','MORTGAGE_REDEEM','MORTGAGE_KEEP','REDEEM']);
const protectedTypes=new Set(['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT','SELL','SELL_SET']);

export function expandNusaCandidates(state,actor,plan,{maxExtra=5}={}){
  if(!plan?.candidates)return plan;
  const context=situationOf(state,actor,plan);
  ensureSovereignCandidates(context,plan);
  return plan;
}

function eligible(base,c,phase){
  if(same(base,c))return true;
  if(phase==='buildOffer')return ['BUILD_JOIN','BUILD_DECLINE'].includes(c.type);
  if(phase==='mortgage')return ['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(c.type);
  if(isBuild(base))return isBuild(c)||c.type==='REDEEM';
  if(phase==='trade')return ['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(c.type);
  if(phase==='jail')return ['JAIL_PAY','JAIL_CARD','ROLL'].includes(c.type);
  return base.type===c.type;
}

function searchCandidatePool(plan,first,phase,maxRoots){
  const selected=plan.candidates.filter(c=>eligible(first,c.action,phase));
  const base=selected.find(c=>same(c.action,first));
  if(!base)return [];
  const window=Math.max(240,Math.abs(base.score)*0.20);
  return [
    base,
    ...selected
      .filter(c=>c!==base&&c.score>=base.score-window)
      .sort((a,b)=>(b.unified??b.score)-(a.unified??a.score)||b.score-a.score||a.id.localeCompare(b.id))
  ].slice(0,maxRoots);
}

function evaluateWorld(publicView,actor,candidate,scenarioSeed,opts,expired){
  const random=new ScenarioRandom(scenarioSeed);
  let s=sampleWorld(publicView,random.stream(0,0,'sampled-decks'));
  const initial=positionValue(s,actor,{noRisk:false,noLearning:true});
  let nodes=0;
  try{
    const root=command(s,actor,candidate.action,random.forAction(s,actor,candidate.action));
    nodes++;s=root;
    if(s.log?.length>80)s.log=s.log.slice(-80);
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
    return {ok:true,nodes,value:positionValue(s,actor,{noRisk:false,noLearning:true})-initial};
  }catch{
    return {ok:false,nodes,reason:'sandbox_exception'};
  }
}

export function nusaV71Decision(state,actor,rawPlan,options={}){
  const began=performance.now();
  const phase=state.phase;
  const plan=expandNusaCandidates(state,actor,rawPlan,{maxExtra:5});
  const council=nusaV7Decision(state,actor,plan,{disabled:options.disabled||[],diagnostics:!!options.diagnostics});
  const councilDiagnostics=options.diagnostics?{
    reason:council.reason,
    candidateCount:council.candidateCount??plan?.candidates?.length??0,
    eligibleCount:council.eligibleCount??0,
    expertCoverage:council.expertCoverage??{},
    leaveOneOut:council.leaveOneOut??{}
  }:undefined;
  const result=(reason,extra={})=>({
    action:council.action,
    changed:council.changed,
    reason,
    search:{attempted:false,pairedSamples:0,nodes:0,reason},
    ...(councilDiagnostics?{councilDiagnostics}:{}),
    ...extra
  });
  if(options.disableSearch)return result('search_disabled');
  if(!council.action||guardedPhase.has(phase)||protectedTypes.has(council.action.type)||
     !safeTypes.has(council.action.type)||plan.candidates[0]?.score>=1e7)return result('protected_or_trivial');
  if(phase==='roll'&&council.action.type==='ROLL')return result('direct_roll');

  const maxMs=bounded(Number(options.maxMs??36),1,240);
  const maxNodes=bounded(Number(options.maxNodes??48),2,192);
  const maxRoots=bounded(Number(options.maxRoots??3),2,4);
  const maxSamples=bounded(Number(options.maxSamples??3),1,8);
  const pool=searchCandidatePool(plan,council.action,phase,maxRoots);
  if(pool.length<2)return result('no_comparable_candidates');
  const view=observation(state,actor);
  if(pool.some(c=>!legalCandidate(view,actor,c.action)))return result('illegal_candidate_rejected');

  const expired=()=>performance.now()-began>=maxMs;
  const estimatedSeed=hashSeed(state.matchId+':'+state.version+':'+actor+':'+NUSA_REASONING_VERSION);
  const horizonTurns=bounded(Number(options.horizonTurns??2),1,6);
  const horizonSteps=bounded(Number(options.horizonSteps??8),1,32);
  const returns=pool.map(()=>[]);
  let nodes=0,samples=0,reason='insufficient_paired_samples';

  for(let batch=0;batch<maxSamples;batch++){
    if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
    const values=[];
    for(const root of pool){
      if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
      const seed=hashSeed(estimatedSeed+':batch:'+batch);
      const evaluation=evaluateWorld(view,actor,root,seed,{horizonTurns,horizonSteps},expired);
      nodes+=evaluation.nodes;
      if(!evaluation.ok){reason=evaluation.reason||'simulation_failed';break;}
      values.push(evaluation.value);
    }
    if(values.length!==pool.length)break;
    values.forEach((v,i)=>returns[i].push(v));
    samples++;
  }

  const search={attempted:true,pairedSamples:samples,nodes,reason,roots:pool.length,wallMs:+(performance.now()-began).toFixed(2)};
  if(samples<2)return {...result(reason),search};
  const evidence=choosePairedSearchEvidence(pool,returns,view.rules?.salary??2000);
  search.reason=evidence.selectedIndex>0?'paired_search_selected':'economic_or_risk_guard';
  search.bestDelta=evidence.bestDelta;
  search.means=evidence.means;
  search.selected=pool[evidence.selectedIndex].id;
  const enough=evidence.selectedIndex>0;
  return {
    action:enough?pool[evidence.selectedIndex].action:council.action,
    changed:enough||council.changed,
    reason:enough?'crn_selective_search':council.reason,
    search,
    ...(councilDiagnostics?{councilDiagnostics}:{})
  };
}

export function choosePairedSearchEvidence(pool,returns,salary){
  if(pool.length<2||returns.length!==pool.length||!returns[0]?.length||
     returns.some(x=>x.length!==returns[0].length||x.some(v=>!Number.isFinite(v))))
    return {selectedIndex:0,bestDelta:0,means:[]};
  const samples=returns[0].length,baseScore=pool[0].score;
  const means=returns.map(xs=>xs.reduce((a,b)=>a+b,0)/samples);
  const cvars=returns.map(xs=>{
    const sorted=[...xs].sort((a,b)=>a-b);
    const tailCount=Math.max(1,Math.ceil(samples*0.25));
    return sorted.slice(0,tailCount).reduce((a,b)=>a+b,0)/tailCount;
  });
  const riskAdjusted=means.map((m,i)=>m*0.72+cvars[i]*0.28);
  const utilities=pool.map((c,i)=>(c.score-baseScore)+riskAdjusted[i]*0.36);
  const order=pool.map((_,i)=>i).sort((a,b)=>utilities[b]-utilities[a]||pool[a].id.localeCompare(pool[b].id));
  const best=order[0],delta=utilities[best]-utilities[0];
  const pairs=returns[best].map((v,i)=>v-returns[0][i]);
  const avg=pairs.reduce((a,b)=>a+b,0)/samples;
  const enough=best!==0&&
    samples>=2&&
    delta>Math.max(35,salary*0.015)&&
    avg>Math.max(60,salary*0.025)&&
    pairs.filter(d=>d>0).length>=Math.ceil(samples*0.66)&&
    pool[best].score>=baseScore-Math.max(120,salary*0.065);
  return {selectedIndex:enough?best:0,bestDelta:+delta.toFixed(2),means:means.map(n=>+n.toFixed(2))};
}
