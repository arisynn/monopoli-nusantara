/** NUSA V18.0 "Transcendent Metagame & Multi-Agent Singularity" — CRN Search Engine.
 * - Enhanced `sovereignLeafValue` with Monopoly Readiness & Rent Differential.
 * - Supports Cross-Phase Buy-Rescue Trades (`OFFER` in `phase === 'buy'`) and
 *   Reverse Counter-Offer Hijacking (`COUNTER` in `phase === 'trade'`).
 */
import {BOARD,GROUPS,auctionMinimum} from '../../lib/content.mjs';
import {command,worth,managementError,complete} from '../../lib/game.mjs';
import {observation,sampleWorld,positionValue,rolloutPolicy,simulationActor,hashSeed} from '../../lib/bot/mind.mjs';
import {legalCandidate} from '../../lib/bot/candidates.mjs';
import {evaluateTrade} from '../../lib/bot/negotiation.mjs';
import {ScenarioRandom} from '../../lib/bot/scenario-random.mjs';
import {situationOf,APEX_TILES,STATION_GEOMETRY_MULT} from './situation.mjs';
import {nusaV7Decision,ensureSovereignCandidates,eq} from './council.mjs';
import {GROUP_TIER} from './experts.mjs';

export const NUSA_REASONING_VERSION='18.0.0-singularity-crn';

const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';
const guardedPhase=new Set(['card','starting']);
const safeTypes=new Set(['BUY','AUCTION','BID','BUILD','BUILD_JOIN','JAIL_PAY','JAIL_CARD','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','MORTGAGE_REDEEM','MORTGAGE_KEEP','MORTGAGE']);
const protectedTypes=new Set(['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT','SELL','SELL_SET','END','ROLL','REDEEM']);

export function expandNusaCandidates(state,actor,plan,{maxExtra=6}={}){
  if(!plan?.candidates)return plan;
  const context=situationOf(state,actor,plan);
  ensureSovereignCandidates(context,plan);
  return plan;
}

function comparableCandidate(first,cand,phase){
  if(eq(first,cand))return true;
  if(isBuild(first))return isBuild(cand);
  if(first.type==='OFFER')return cand.type==='OFFER'||isBuild(cand)||cand.type==='MORTGAGE'||(phase==='buy'&&cand.type==='AUCTION');
  if(phase==='buy')return ['BUY','AUCTION','MORTGAGE','OFFER'].includes(cand.type);
  if(phase==='auction')return ['BID','PASS','MORTGAGE'].includes(cand.type);
  if(phase==='buildOffer')return ['BUILD_JOIN','BUILD_DECLINE'].includes(cand.type);
  if(phase==='mortgage')return ['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(cand.type);
  if(phase==='trade')return ['TRADE_ACCEPT','COUNTER','TRADE_REJECT'].includes(cand.type);
  if(phase==='jail')return ['JAIL_PAY','JAIL_CARD','ROLL','BUILD','REDEEM'].includes(cand.type);
  return first.type===cand.type;
}

function searchCandidatePool(plan,council,phase,maxRoots){
  const first=council.action;
  const source=council.rankedPool||plan.candidates;
  const selected=source.filter(c=>comparableCandidate(first,c.action,phase));
  const base=selected.find(c=>eq(c.action,first));
  if(!base)return [];
  const baseVal=base.unified??base.score;
  const window=Math.max(300,Math.abs(baseVal)*0.28);
  return [
    base,
    ...selected
      .filter(c=>c!==base&&(c.unified??c.score)>=baseVal-window)
      .sort((a,b)=>(b.unified??b.score)-(a.unified??a.score)||b.score-a.score||a.id.localeCompare(b.id))
  ].slice(0,maxRoots);
}

/**
 * V18.0 Enhanced Leaf Evaluator:
 * Rewards Monopoly Readiness, 3-House Sweet Spots, and Net Worth Dominance.
 */
function sovereignLeafValue(s,actor){
  const posVal=positionValue(s,actor,{noRisk:false,noLearning:true});
  if(s.players[actor]?.out||s.phase==='won')return posVal;
  const myWorth=worth(s,actor);
  const aliveOthers=s.players.filter(p=>p.id!==actor&&!p.out);
  const maxRivalWorth=Math.max(1,...aliveOthers.map(p=>worth(s,p.id)));
  const worthEdge=(myWorth-maxRivalWorth*0.85)*0.28;

  let monopolyBonus=0;
  for(let gIdx=0;gIdx<GROUPS.length;gIdx++){
    if(complete(s,actor,gIdx)){
      const g=GROUPS[gIdx];
      const tier=GROUP_TIER[gIdx]||1;
      const minLv=Math.min(...g.ids.map(i=>s.assets[i]?.level||0));
      monopolyBonus+=(420+Math.min(3,minLv)*260)*tier;
    }
  }
  return posVal*0.74+worthEdge+monopolyBonus;
}

function omniscientRolloutStep(s,who,rng,rootActor){
  if(who===rootActor){
    const p=s.players[who];
    if(s.phase==='buildOffer'&&s.buildOffer?.pending?.includes(who)){
      for(const g of GROUPS){
        for(const tid of [...g.ids].reverse()){
          const joinAct={type:'BUILD_JOIN',tile:tid};
          if(legalCandidate(s,who,joinAct))return joinAct;
        }
      }
    }
    if(s.phase==='buy'&&s.turn===who&&Number.isInteger(s.buy)){
      const t=BOARD[s.buy];
      const price=t?.price||0;
      const isCashSink=t?.group===6&&GROUPS[6].ids.every(i=>s.assets[i]?.owner==null)&&(p.cash-price<2600);
      if(!isCashSink&&p.cash>=price){
        const buyAct={type:'BUY'};
        if(legalCandidate(s,who,buyAct))return buyAct;
      }
    }
    if(s.phase==='auction'&&s.auction&&s.auction.participants?.includes(who)&&s.auction.highest!==who){
      if(s.auction.kind==='building'){
        const tId=s.auction.targets?.[who];
        const bCost=BOARD[tId]?.build||1000;
        const ceiling=Math.floor(bCost*2.1/10)*10;
        const minBid=auctionMinimum(s.auction);
        if(minBid<=ceiling&&minBid<=p.cash-500){
          const bidAct={type:'BID',amount:minBid};
          if(legalCandidate(s,who,bidAct))return bidAct;
        }
      }else{
        const t=BOARD[s.auction.tile];
        if(t?.price){
          const isCashSink=t.group===6||t.type==='utility';
          const completes=t.group>=0&&GROUPS[t.group].ids.filter(i=>s.assets[i]?.owner===who&&i!==t.id).length===GROUPS[t.group].ids.length-1;
          const geoMult=t.type==='station'?(STATION_GEOMETRY_MULT[t.id]||1):1;
          const ceiling=completes?Math.floor(t.price*1.38/10)*10:isCashSink?Math.floor(t.price*0.82/10)*10:Math.floor(t.price*0.98*geoMult/10)*10;
          const minBid=auctionMinimum(s.auction);
          if(minBid<=ceiling&&minBid<=p.cash-600){
            const step=ceiling-minBid>250?30:10;
            const bidAmt=Math.min(ceiling,minBid+step);
            const bidAct={type:'BID',amount:bidAmt};
            if(legalCandidate(s,who,bidAct))return bidAct;
          }else{
            const passAct={type:'PASS'};
            if(legalCandidate(s,who,passAct))return passAct;
          }
        }
      }
    }
    if(s.phase==='end'&&s.turn===who){
      for(const g of GROUPS){
        if(g.ids.every(i=>s.assets[i]?.owner===who&&!s.assets[i]?.mortgaged)){
          const minLv=Math.min(...g.ids.map(i=>s.assets[i]?.level||0));
          if(minLv<3){
            const orderedIds=[...g.ids].reverse();
            const tile=orderedIds.find(i=>(s.assets[i]?.level||0)===minLv&&!managementError(s,who,i,'BUILD'));
            if(tile!==undefined&&p.cash-(BOARD[tile]?.build||1000)>=600){
              const buildAct={type:'BUILD',tile};
              if(legalCandidate(s,who,buildAct))return buildAct;
            }
          }
        }
      }
    }
  }
  if(s.phase==='trade'&&s.trade&&s.trade.to===who&&who!==rootActor){
    const ev=evaluateTrade(s,who,s.trade,s.trade.from);
    const act=ev.net>=0&&!ev.invalid&&!ev.insolventAfterFees?{type:'TRADE_ACCEPT'}:{type:'TRADE_REJECT'};
    if(legalCandidate(s,who,act))return act;
  }
  return rolloutPolicy(s,who,rng,{rootActor});
}

function evaluateWorld(publicView,actor,candidate,scenarioSeed,opts,expired){
  const random=new ScenarioRandom(scenarioSeed);
  let s=sampleWorld(publicView,random.stream(0,0,'sampled-decks'));
  const initial=sovereignLeafValue(s,actor);
  let nodes=0;
  try{
    const root=command(s,actor,candidate.action,random.forAction(s,actor,candidate.action));
    nodes++;s=root;
    if(s.log?.length>80)s.log=s.log.slice(0,80);
    const path=Array.isArray(candidate.macro)?candidate.macro.slice(1,6):[];
    for(const part of path){
      if(expired()||simulationActor(s)!==actor||!legalCandidate(s,actor,part))break;
      s=command(s,actor,part,random.forAction(s,actor,part));nodes++;
    }
    const horizon=publicView.turnSerial+opts.horizonTurns;
    const maxEngineSteps=Math.max(opts.horizonSteps,opts.horizonTurns*12);
    for(let step=0;step<maxEngineSteps&&s.phase!=='won';step++){
      if(s.turnSerial>=horizon&&['roll','jail','won'].includes(s.phase))break;
      if(expired())return {ok:false,nodes,reason:'budget'};
      const who=simulationActor(s),action=omniscientRolloutStep(s,who,random.policy(s,who),actor);
      if(!action)break;
      s=command(s,who,action,random.forAction(s,who,action));nodes++;
      if(s.log?.length>80)s.log=s.log.slice(0,80);
    }
    return {ok:true,nodes,value:sovereignLeafValue(s,actor)-initial};
  }catch{
    return {ok:false,nodes,reason:'sandbox_exception'};
  }
}

export function nusaV71Decision(state,actor,rawPlan,options={}){
  const began=performance.now();
  const phase=state.phase;
  const plan=expandNusaCandidates(state,actor,rawPlan,{maxExtra:6});
  const council=nusaV7Decision(state,actor,plan,{disabled:options.disabled||[],diagnostics:!!options.diagnostics});
  const result=(reason,extra={})=>({
    action:council.action,
    changed:council.changed,
    reason,
    search:{attempted:false,gear:1,pairedSamples:0,nodes:0,wallMs:+(performance.now()-began).toFixed(2),reason},
    ...extra
  });
  if(options.disableSearch)return result('search_disabled');
  if(!council.action||guardedPhase.has(phase)||protectedTypes.has(council.action.type)||
     !safeTypes.has(council.action.type))return result('gear1_instant_reflex');

  const requestedMs=Number(options.maxMs??options.timeBudgetMs??64);
  const deepMode=options.deep===true||requestedMs>=1500;
  const gear=deepMode?3:2;

  const maxMs=Math.max(0,Math.min(gear===3?4200:240,requestedMs));
  const maxNodes=gear===3?Math.min(4800,Math.max(900,options.maxNodes??2600)):Math.min(420,Math.max(60,options.maxNodes??160));
  const maxRoots=gear===3?Math.min(5,Math.max(2,options.maxRoots??4)):Math.min(3,Math.max(2,options.maxRoots??3));
  const maxSamples=gear===3?Math.min(24,Math.max(4,options.maxSamples??16)):Math.min(8,Math.max(2,options.maxSamples??4));
  const horizonTurns=gear===3?12:4;
  const horizonSteps=gear===3?96:36;

  const pool=searchCandidatePool(plan,council,phase,maxRoots);
  if(pool.length<2)return result('gear1_single_dominant_candidate');
  const view=observation(state,actor);
  if(pool.some(c=>!legalCandidate(view,actor,c.action)))return result('illegal_candidate_rejected');

  const expired=()=>performance.now()-began>=maxMs;
  const estimatedSeed=hashSeed(state.matchId+':'+state.version+':'+actor+':'+NUSA_REASONING_VERSION);
  const returns=pool.map(()=>[]);
  let activeIndices=pool.map((_,i)=>i);
  let nodes=0,samples=0,reason='completed';

  const halvingPoint=Math.max(3,Math.floor(maxSamples*0.45));

  for(let batch=0;batch<maxSamples;batch++){
    if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
    const batchValues=new Map();
    for(const idx of activeIndices){
      if(expired()||nodes>=maxNodes){reason='budget_exhausted';break;}
      const root=pool[idx];
      const seed=hashSeed(estimatedSeed+':batch:'+batch);
      const evaluation=evaluateWorld(view,actor,root,seed,{horizonTurns,horizonSteps},expired);
      nodes+=evaluation.nodes;
      if(!evaluation.ok){reason=evaluation.reason||'simulation_failed';break;}
      batchValues.set(idx,evaluation.value);
    }
    if(batchValues.size!==activeIndices.length)break;
    for(const [idx,val] of batchValues.entries()){
      returns[idx].push(val);
    }
    samples++;

    if(samples===halvingPoint&&activeIndices.length>2){
      const scored=activeIndices.map(idx=>{
        const rs=returns[idx];
        const mean=rs.reduce((a,b)=>a+b,0)/rs.length;
        const baseU=pool[idx].unified??pool[idx].score;
        return {idx,u:baseU+mean*0.35};
      }).sort((a,b)=>b.u-a.u);
      const keepCount=Math.max(2,Math.ceil(activeIndices.length/2));
      const kept=new Set([0,...scored.slice(0,keepCount).map(x=>x.idx)]);
      activeIndices=[...kept].sort((a,b)=>a-b);
    }
  }

  const wallMs=+(performance.now()-began).toFixed(2);
  const search={attempted:true,gear,pairedSamples:samples,nodes,wallMs,reason,roots:pool.length};
  if(samples<2)return {...result(reason),search};

  const evidence=choosePairedSearchEvidence(pool,returns,view.rules?.salary??2000);
  const enough=evidence.selectedIndex>0;
  return {
    action:enough?pool[evidence.selectedIndex].action:council.action,
    changed:enough||council.changed,
    reason:enough?('singularity_gear'+gear+'_crn_selected'):council.reason,
    search
  };
}

export function choosePairedSearchEvidence(pool,returns,salary){
  if(pool.length<2||returns.length!==pool.length||!returns[0]?.length)
    return {selectedIndex:0,bestDelta:0};
  const baseScore=pool[0].unified??pool[0].score;
  const utilities=pool.map((c,i)=>{
    const rs=returns[i];
    if(!rs||!rs.length)return -Infinity;
    const mean=rs.reduce((a,b)=>a+b,0)/rs.length;
    const sorted=rs.slice().sort((a,b)=>a-b);
    const tailCount=Math.max(1,Math.ceil(sorted.length*0.25));
    const cvar=sorted.slice(0,tailCount).reduce((a,b)=>a+b,0)/tailCount;
    const blended=mean*0.72+cvar*0.28;
    return ((c.unified??c.score)-baseScore)+blended*0.38;
  });
  const order=pool.map((_,i)=>i).sort((a,b)=>utilities[b]-utilities[a]);
  const best=order[0],delta=utilities[best]-utilities[0];
  const bestReturns=returns[best],ctrlReturns=returns[0];
  const commonLen=Math.min(bestReturns.length,ctrlReturns.length);
  const pairs=bestReturns.slice(0,commonLen).map((v,i)=>v-ctrlReturns[i]);
  const wins=pairs.filter(d=>d>0).length;
  const enough=best!==0&&commonLen>=2&&wins>=Math.ceil(commonLen*0.65)&&delta>Math.max(25,salary*0.012);
  return {selectedIndex:enough?best:0,bestDelta:+delta.toFixed(2)};
}
