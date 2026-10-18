/** NUSA V23.0 "Chronos Predator" — 33 hypergraph and temporal experts.
 * Replaces overlapping legacy rules with sharp, graph-driven intelligence:
 * - Reads `boardGraph.desireMatrix`, `brokerPlans`, `trojanBaitForRival`,
 *   `thirdPartyInterceptions`, `poisonPillTiles`, and `corridorRadar`.
 */
import {BOARD,GROUPS,auctionMinimum} from '../../content.mjs';
import {rent,redemption,interest,canManage,managementError} from '../../game.mjs';
import {evaluateTrade} from '../negotiation.mjs';
import {analyzeState} from '../analysis.mjs';
import {landingForecast} from '../probability.mjs';
import {APEX_TILES,STATION_GEOMETRY_MULT} from './situation.mjs';
import {GROUP_TIER} from './board-graph.mjs';

export {GROUP_TIER};

const clamp=(x,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,x));
const owner=(c,t)=>c.view.assets[t]?.owner;
const actType=a=>a?.type;
const build=a=>['BUILD','BUILD_JOIN'].includes(actType(a));
const tileOf=(c,a)=>a.type==='BUY'?c.view.buy:a.type==='BID'?(c.view.auction?.kind==='building'?c.view.auction?.targets?.[c.actor]:c.view.auction?.tile):a.type==='MORTGAGE_REDEEM'||a.type==='MORTGAGE_KEEP'?c.view.mortgageDecision?.tile:a.tile;
const dollars=(c,a)=>a.type==='BUY'?BOARD[c.view.buy]?.price||0:a.type==='BID'?a.amount||0:build(a)?BOARD[a.tile]?.build||0:a.type==='REDEEM'||a.type==='MORTGAGE_REDEEM'?redemption(tileOf(c,a)):a.type==='MORTGAGE_KEEP'?interest(tileOf(c,a)):0;
const delta=(signal,reason)=>({signal:clamp(signal),reason});
const once=(c,t)=>Number.isInteger(t)&&BOARD[t]?.price>0;
const tradeAction=a=>['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type);
const matchesAction=(x,a)=>x.type===a.type&&x.tile===a.tile;
const readyPreEndTargets=c=>{
  if(c.view.phase!=='end'||c.view.turn!==c.actor||!canManage(c.view,c.actor))return [];
  return (c.temporal?.preEndTargets||[]).filter(target=>target.affordableNow&&target.sufficientHouseStock&&
    [...(target.redeemActions||[]),...(target.buildActions||[])].some(action=>
      ['BUILD','REDEEM'].includes(action.type)&&!managementError(c.view,c.actor,action.tile,action.type)));
};

export function completion(c,t,who=c.actor){
  const b=BOARD[t];
  if(!b)return 0;
  if(b.type==='station'){
    const ownCount=[5,15,25,35].filter(i=>owner(c,i)===who&&i!==t).length;
    return clamp(0.32+ownCount*0.24,0,1);
  }
  if(b.type==='utility'){
    const ownCount=[12,28].filter(i=>owner(c,i)===who&&i!==t).length;
    return ownCount>=1?0.40:0.10;
  }
  if(b.group<0)return 0;
  const ids=GROUPS[b.group].ids;
  const ownCount=ids.filter(i=>owner(c,i)===who&&i!==t).length;
  const otherCount=ids.filter(i=>owner(c,i)!=null&&owner(c,i)!==who&&i!==t).length;
  if(ownCount===ids.length-1)return 1.0;
  if(otherCount===0&&ownCount>0)return (ownCount/ids.length)*0.84;
  if(otherCount===0)return 0.36;
  return (ownCount/ids.length)*0.28;
}

export function block(c,t){
  const b=BOARD[t];
  if(!b)return 0;
  if(c.boardGraph?.unownedCriticalDeny?.has(t))return 0.99;
  if(c.boardGraph?.thirdPartyInterceptionTiles?.has(t))return 0.96;
  if(b.type==='station'){
    const rivalMax=Math.max(0,...c.rivals.map(p=>[5,15,25,35].filter(i=>owner(c,i)===p.id&&i!==t).length));
    return rivalMax>=2?0.72:rivalMax===1?0.35:0;
  }
  if(b.group<0)return 0;
  const g=c.groups[b.group];
  const tier=GROUP_TIER[b.group]||1;
  let maxThreat=0;
  for(const o of g.owners){
    const isPriorityRival=(o.persona==='bima'||o.persona==='kresna')||(c.leader?.id===o.id);
    if(o.count===g.ids.length-1){
      const rivalCash=c.view.players[o.id]?.cash||0;
      const readiness=clamp(rivalCash/Math.max(1000,g.ids.length*2*g.houseCost),0.35,1.25);
      const boost=isPriorityRival?1.30:1.0;
      maxThreat=Math.max(maxThreat,clamp(0.95*readiness*boost,0,1));
    }else if(o.count===1&&g.own===0){
      const anchorVal=tier>=1.25?(isPriorityRival?0.80:0.70):tier>=1.10?0.55:0.30;
      maxThreat=Math.max(maxThreat,anchorVal);
    }
  }
  return maxThreat;
}

export function rentDelta(c,t){
  const a=c.view.assets[t],b=BOARD[t];
  if(!a||!b?.build||a.level>=5)return 0;
  return Math.max(0,b.rents[a.level+1]-rent(c.view,t,7));
}

export function threeHouseSweetSpotGain(c,t){
  const a=c.view.assets[t],b=BOARD[t];
  if(!a||!b?.build||a.level>=3)return 0;
  const stepsTo3=3-a.level;
  return Math.max(0,(b.rents[3]-rent(c.view,t,7))/stepsTo3);
}

export function valuation(c,t){
  const p=BOARD[t];
  if(!p)return 0;
  if(p.type==='utility'){
    const ownUt=[12,28].filter(i=>owner(c,i)===c.actor&&i!==t).length;
    return p.price*(ownUt>=1?0.96:0.74);
  }
  if(p.type==='station'){
    const ownSt=[5,15,25,35].filter(i=>owner(c,i)===c.actor&&i!==t).length;
    const geoMult=STATION_GEOMETRY_MULT[t]||1.0;
    const fifoBoost=c.cardCycle?.activeMagnetTiles?.has(t)?p.price*0.14:0;
    const brokerBonus=c.boardGraph?.brokerTargetTiles?.has(t)?p.price*0.30:0;
    return p.price*(1.05+ownSt*0.36)*geoMult+fifoBoost+brokerBonus;
  }
  const tier=p.group>=0?(GROUP_TIER[p.group]||1):1;
  const synergy=completion(c,t,c.actor);
  const denial=block(c,t);
  const apexBonus=APEX_TILES.has(t)?p.price*0.08*tier:0;
  const poisonBonus=c.boardGraph?.poisonPillTiles?.has(t)?p.price*0.30*tier:0;
  const brokerBonus=c.boardGraph?.brokerTargetTiles?.has(t)?p.price*0.38*tier:0;
  const interceptBonus=c.boardGraph?.thirdPartyInterceptionTiles?.has(t)?p.price*0.42*tier:0;
  const chainBonus=c.chainTargetTiles?.has(t)?p.price*0.24*tier:0;
  const visits=(c.visits[t]||0)+0.65*(c.immediateVisits?.[t]||0);
  const magnetBonus=c.cardCycle?.activeMagnetTiles?.has(t)?p.price*0.20:0;
  const rent3=p.rents?.[3]||p.rents?.[0]||200;
  return p.price*tier*(0.88+synergy*1.18+denial*0.74)+visits*rent3*0.22+magnetBonus+apexBonus+poisonBonus+brokerBonus+interceptBonus+chainBonus;
}

export function grandmasterAuctionCeiling(c){
  const auction=c.view.auction;
  if(!auction)return 0;
  const qStep=c.auctionStep||10;
  if(auction.kind==='building'){
    const t=auction.targets?.[c.actor];
    if(!Number.isInteger(t))return 0;
    const bCost=BOARD[t]?.build||1000;
    const lv=c.view.assets[t]?.level||0;
    const mult=lv===2?2.25:lv===1?2.05:lv===3?1.85:1.55;
    const rawCap=Math.min(Math.max(0,c.self.cash-c.trueReserve*0.35),bCost*mult);
    return Math.floor(rawCap/qStep)*qStep;
  }
  const t=auction.tile,p=BOARD[t];
  if(!p)return 0;
  const comp=completion(c,t,c.actor);
  const blk=block(c,t);
  const tier=p.group>=0?(GROUP_TIER[p.group]||1):1;

  let maxVal=p.price*0.98;
  if(comp>=0.95){
    maxVal=p.price*Math.min(1.58,Math.max(1.32,tier*1.14))+360;
  }else if(blk>=0.80||c.boardGraph?.unownedCriticalDeny?.has(t)){
    const needyRival=c.groups[p.group]?.owners?.find(o=>o.count===GROUPS[p.group].ids.length-1);
    const rivalStillBidding=needyRival&&auction.participants?.includes(needyRival.id)&&!auction.passed?.includes(needyRival.id);
    const rivalCash=needyRival?c.view.players[needyRival.id]?.cash||0:0;
    const driveCap=p.price*1.36+240;
    maxVal=rivalStillBidding?Math.min(rivalCash+qStep,driveCap):p.price*1.12;
  }else if(c.boardGraph?.brokerTargetTiles?.has(t)){
    // 2-Hop Broker Bait in Auction: Winning this tile lets us trade it for our monopoly!
    maxVal=p.price*Math.min(1.22,Math.max(1.08,tier*0.96));
  }else if(c.earlyCashSinkTiles?.has(t)){
    maxVal=p.price*0.82;
  }else if(c.boardGraph?.poisonPillTiles?.has(t)){
    maxVal=p.price*Math.min(1.10,Math.max(0.98,tier*0.86));
  }else if(c.chainTargetTiles?.has(t)){
    maxVal=p.price*1.08;
  }else if(comp>=0.40){
    maxVal=p.price*Math.min(1.06,Math.max(0.98,tier*0.88));
  }else if(p.type==='station'){
    const ownSt=[5,15,25,35].filter(i=>owner(c,i)===c.actor&&i!==t).length;
    const geoMult=STATION_GEOMETRY_MULT[t]||1.0;
    maxVal=p.price*(0.96+ownSt*0.10)*geoMult;
  }else if(p.type==='utility'){
    maxVal=p.price*0.80;
  }

  const qReserve=(comp<0.90&&blk<0.80)?((c.queueAuctionReserve||0)+(c.vultureReserve||0)*0.5):0;
  const safeCash=Math.max(0,c.self.cash+(c.liquidBuffer||0)*0.35-c.trueReserve*0.45-qReserve);
  const rawLimit=Math.min(c.self.cash,safeCash,maxVal);
  return Math.floor(rawLimit/qStep)*qStep;
}

export function normalizeTrade(c,a){
  if(!['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(a.type))return null;
  const raw=(a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT')?c.view.trade:a.trade;
  if(!raw)return null;
  const isIncoming=a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT';
  const proposerId=isIncoming?raw.from:c.actor;
  const partnerId=isIncoming?raw.from:raw.to;
  const myGive=isIncoming?(raw.take||[]):(raw.give||[]);
  const myTake=isIncoming?(raw.give||[]):(raw.take||[]);
  const cashReceived=isIncoming?(raw.giveCash||0):(raw.takeCash||0);
  const cashPaid=isIncoming?(raw.takeCash||0):(raw.giveCash||0);
  const cardsReceived=isIncoming?(raw.giveCards||0):(raw.takeCards||0);
  const cardsPaid=isIncoming?(raw.takeCards||0):(raw.giveCards||0);
  const mortgageFeePaid=myTake.reduce((n,t)=>n+(c.view.assets[t]?.mortgaged?interest(t):0),0);
  const mortgageFeePartner=myGive.reduce((n,t)=>n+(c.view.assets[t]?.mortgaged?interest(t):0),0);
  return {
    raw,isIncoming,isReject:a.type==='TRADE_REJECT',
    proposerId,partnerId,myGive,myTake,
    netCash:cashReceived-cashPaid-mortgageFeePaid,
    partnerNetCash:cashPaid-cashReceived-mortgageFeePartner,
    netCards:cardsReceived-cardsPaid
  };
}

export function completesGroupPostTrade(c,playerId,acquired,surrendered){
  const acqSet=new Set(acquired),surSet=new Set(surrendered);
  let count=0,bestTier=0,buildCost3=0,groupIds=[];
  for(let gIdx=0;gIdx<GROUPS.length;gIdx++){
    const ids=GROUPS[gIdx].ids;
    const hadBefore=ids.every(i=>owner(c,i)===playerId);
    const hasAfter=ids.every(i=>(owner(c,i)===playerId&&!surSet.has(i))||acqSet.has(i));
    if(hasAfter&&!hadBefore){
      count++;
      groupIds.push(gIdx);
      bestTier=Math.max(bestTier,GROUP_TIER[gIdx]||1);
      buildCost3+=ids.length*3*(BOARD[ids[0]]?.build||1000);
    }
  }
  return {count,bestTier,buildCost3,groupIds};
}

export function getBilateralTradeEvaluation(c,trade,proposerId=c.actor,stateOverride=null){
  const targetView=stateOverride||c.view;
  const partnerId=proposerId===c.actor?trade.to:proposerId;
  const key=(stateOverride?'override:':'live:')+proposerId+':'+partnerId+':'+JSON.stringify(trade);
  if(!stateOverride&&c._tradeEvalCache?.has(key))return c._tradeEvalCache.get(key);

  let partnerAnalysis=!stateOverride?c._partnerAnalyses?.get(partnerId):null;
  if(!partnerAnalysis){
    partnerAnalysis=analyzeState(targetView,partnerId,{fast:false,context:c.decisionContext});
    if(!stateOverride)c._partnerAnalyses?.set(partnerId,partnerAnalysis);
  }
  const proposerPublic=analyzeState(targetView,proposerId,{fast:true,publicOpponent:true,context:c.decisionContext});
  const partnerContext={
    observerId:partnerId,decisionContext:c.decisionContext,
    analyses:new Map([[partnerId,partnerAnalysis],[proposerId,proposerPublic]])
  };

  const myAnalysis=(!stateOverride&&c.ownAnalysis)||analyzeState(targetView,c.actor,{fast:false,context:c.decisionContext});
  const partnerPublic=analyzeState(targetView,partnerId,{fast:true,publicOpponent:true,context:c.decisionContext});
  const myContext={
    observerId:c.actor,decisionContext:c.decisionContext,
    analyses:new Map([[c.actor,myAnalysis],[partnerId,partnerPublic]])
  };

  const partnerEval=evaluateTrade(targetView,partnerId,trade,proposerId,partnerContext);
  const myEval=evaluateTrade(targetView,c.actor,trade,proposerId,myContext);
  const result={myEval,partnerEval};
  if(!stateOverride)c._tradeEvalCache?.set(key,result);
  return result;
}

export function predictPartnerAcceptance(c,trade,stateOverride=null){
  if(c.decisionContext?.expired())return {willAccept:false,partnerNet:-Infinity,myEval:null,partnerEval:null};
  const targetView=stateOverride||c.view;
  const partnerId=trade.to;
  const partner=targetView.players[partnerId];
  if(!partner||partner.out)return {willAccept:false,partnerNet:-1e8,myEval:null,partnerEval:null};

  const {myEval,partnerEval}=getBilateralTradeEvaluation(c,trade,c.actor,stateOverride);
  if(partnerEval.invalid||partnerEval.insolventAfterFees||partnerEval.unilateralLoss||partnerEval.net<2){
    return {willAccept:false,partnerNet:partnerEval.net,myEval,partnerEval};
  }

  const tradeContext=stateOverride?{...c,view:targetView}:c;
  const myMono=completesGroupPostTrade(tradeContext,c.actor,trade.take||[],trade.give||[]);
  const oppMono=completesGroupPostTrade(tradeContext,partnerId,trade.give||[],trade.take||[]);
  const persona=partner.botPersona||'human';

  if(persona==='kresna'){
    if(myMono.count>0&&oppMono.count===0){
      return {willAccept:false,partnerNet:partnerEval.net,myEval,partnerEval};
    }
    return {willAccept:partnerEval.net>=15,partnerNet:partnerEval.net,myEval,partnerEval};
  }

  if(persona==='apex'){
    return {willAccept:partnerEval.net>=5,partnerNet:partnerEval.net,myEval,partnerEval};
  }

  const isCatchUp=c.catchUpPartners?.has(partnerId);
  const requiredNet=myMono.count>0&&oppMono.count===0?(isCatchUp?50:72):12;
  return {
    willAccept:partnerEval.net>=requiredNet,
    partnerNet:partnerEval.net,
    myEval,
    partnerEval
  };
}

export function solveOptimalTradeCash(c,{
  partnerId,giveList,takeList,giveCards=0,
  minOverpay=-360,maxOverpay=950,maxCashOffer,partnerMaxCash,stateOverride=null
}){
  const targetVal=takeList.reduce((n,id)=>n+(BOARD[id]?.price||0),0);
  const giveVal=giveList.reduce((n,id)=>n+(BOARD[id]?.price||0),0);
  const cardVal=giveCards*250;
  const targetView=stateOverride||c.view;
  const stopped=()=>c.decisionContext?.expired()||false;
  const ownCash=Math.max(0,targetView.players[c.actor]?.cash||0);
  const cashCap=Math.floor(Math.min(ownCash,Number.isFinite(maxCashOffer)?Math.max(0,maxCashOffer):ownCash)/10)*10;
  const partnerCash=Math.max(0,targetView.players[partnerId]?.cash||0);
  const partnerCap=Math.floor(Math.min(partnerCash,Number.isFinite(partnerMaxCash)?Math.max(0,partnerMaxCash):partnerCash)/10)*10;
  const tempoMultiplier=c.temporal?.macroPosture==='TEMPO_BREAKER'?1.6:1;
  const effectiveMaxOverpay=Math.min(maxOverpay+Math.max(0,maxOverpay)*(tempoMultiplier-1),cashCap-targetVal+giveVal+cardVal);

  const makeOfferAt=(overpay)=>{
    if(stopped())return null;
    const rawPay=targetVal-giveVal-cardVal+overpay;
    if(rawPay>cashCap)return null;
    const giveCash=rawPay>0?Math.min(cashCap,Math.round(rawPay/10)*10):0;
    const takeCash=rawPay<0?Math.min(partnerCap,Math.round(Math.abs(rawPay)/10)*10):0;
    if(giveList.length===0&&giveCards===0&&giveCash<targetVal)return null;
    const trade={to:partnerId,give:giveList,take:takeList,giveCash,takeCash,giveCards,takeCards:0};
    const oracle=predictPartnerAcceptance(c,trade,stateOverride);
    const validForUs=oracle.willAccept&&oracle.myEval?.net>0&&(oracle.myEval.deltaShare>=oracle.myEval.partnerDelta-0.002);
    return {trade,oracle,validForUs,overpay};
  };

  const probePoints=[...new Set([minOverpay,-180,0,120,260,420,600,780,maxOverpay,effectiveMaxOverpay])].filter(x=>x>=minOverpay&&x<=effectiveMaxOverpay).sort((a,b)=>a-b);
  let highRes=null;
  let lowFail=minOverpay;

  for(const pt of probePoints){
    if(stopped())break;
    const res=makeOfferAt(pt);
    if(res?.validForUs){
      highRes=res;
      break;
    }
    lowFail=pt;
  }
  if(!highRes)return null;

  let lo=Math.floor(lowFail/10);
  let hi=Math.floor(highRes.overpay/10);
  let best=highRes;
  while(lo<=hi&&!stopped()){
    const mid=Math.floor((lo+hi)/2);
    const cand=makeOfferAt(mid*10);
    if(cand?.validForUs){
      best=cand;
      hi=mid-1;
    }else{
      lo=mid+1;
    }
  }
  return best;
}

export function projectWinProbabilityDelta(c,a){
  const {view,actor,self,rivals,liquidBuffer,winProbability}=c;
  const alive=[self,...rivals].filter(p=>p&&!p.out);
  if(alive.length<=1)return {deltaWinProb:0,postWinProb:winProbability,leaderDelta:0};

  const cashDelta=new Map(alive.map(p=>[p.id,0]));
  const acqMap=new Map(alive.map(p=>[p.id,new Set()]));
  const surMap=new Map(alive.map(p=>[p.id,new Set()]));
  const buildBoost=new Map(alive.map(p=>[p.id,0]));

  if(a.type==='BUY'&&Number.isInteger(view.buy)){
    const t=BOARD[view.buy];
    if(t?.price){
      cashDelta.set(actor,-t.price);
      acqMap.get(actor)?.add(t.id);
    }
  }else if(a.type==='BID'&&view.phase==='auction'){
    const amt=a.amount||0;
    cashDelta.set(actor,-amt);
    if(view.auction?.kind==='building'){
      buildBoost.set(actor,0.65);
    }else if(Number.isInteger(view.auction?.tile)){
      acqMap.get(actor)?.add(view.auction.tile);
    }
  }else if(a.type==='BUILD'||a.type==='BUILD_JOIN'){
    const bCost=BOARD[a.tile]?.build||1000;
    cashDelta.set(actor,-bCost);
    buildBoost.set(actor,0.68);
  }else if(a.type==='REDEEM'||a.type==='MORTGAGE_REDEEM'){
    const t=a.type==='MORTGAGE_REDEEM'?view.mortgageDecision?.tile:a.tile;
    if(Number.isInteger(t)){
      cashDelta.set(actor,-redemption(t));
      const g=BOARD[t]?.group;
      if(g>=0&&c.groups[g]?.fullSetOwned)buildBoost.set(actor,0.55);
    }
  }else if(['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type)){
    const norm=normalizeTrade(c,a);
    if(norm&&!norm.isReject){
      cashDelta.set(actor,norm.netCash);
      cashDelta.set(norm.partnerId,norm.partnerNetCash);
      for(const tid of norm.myTake){
        acqMap.get(actor)?.add(tid);
        surMap.get(norm.partnerId)?.add(tid);
      }
      for(const tid of norm.myGive){
        surMap.get(actor)?.add(tid);
        acqMap.get(norm.partnerId)?.add(tid);
      }
    }
  }

  const logitPost=(pl,baseline=false)=>{
    const pid=pl.id;
    const acq=baseline?new Set():acqMap.get(pid)||new Set();
    const sur=baseline?new Set():surMap.get(pid)||new Set();
    const pCash=Math.max(100,pl.cash+(baseline?0:cashDelta.get(pid)||0));
    let propVal=0;
    for(const t of BOARD){
      if(!t.price)continue;
      const curOwner=view.assets[t.id]?.owner;
      const ownsAfter=(curOwner===pid&&!sur.has(t.id))||acq.has(t.id);
      if(ownsAfter){
        const mort=view.assets[t.id]?.mortgaged;
        const lv=view.assets[t.id]?.level||0;
        propVal+=(mort?t.mortgage:t.price)+(t.build||0)*lv*0.95;
        if(pid===actor){
          if(c.boardGraph?.brokerTargetTiles?.has(t.id))propVal+=t.price*0.42;
          if(c.boardGraph?.thirdPartyInterceptionTiles?.has(t.id))propVal+=t.price*0.48;
        }
      }
    }
    let pBuiltMonos=baseline?0:buildBoost.get(pid)||0;
    for(let gIdx=0;gIdx<GROUPS.length;gIdx++){
      const g=GROUPS[gIdx];
      const tier=GROUP_TIER[gIdx]||1;
      const hasMono=g.ids.every(id=>{
        const curOwner=view.assets[id]?.owner;
        return (curOwner===pid&&!sur.has(id))||acq.has(id);
      });
      if(hasMono){
        const curMinLv=Math.min(...g.ids.map(id=>view.assets[id]?.level||0));
        const houseCost=BOARD[g.ids[0]]?.build||1000;
        const extraBuf=pid===actor?(liquidBuffer||0)*0.75:0;
        const potentialLv=Math.min(3,curMinLv+Math.floor(Math.max(0,pCash+extraBuf-500)/(houseCost*g.ids.length)));
        pBuiltMonos+=(1.1+potentialLv*0.62)*tier;
      }
    }
    return Math.log(Math.max(500,pCash+propVal))*1.18+pBuiltMonos*1.05;
  };

  // Compare the same public heuristic before and after. situation.winProbability
  // uses a different feature set; subtracting it gave even NOOP a false gain.
  const beforeLogits=Object.fromEntries(alive.map(pl=>[pl.id,logitPost(pl,true)]));
  const beforeSum=alive.reduce((sum,pl)=>sum+Math.exp(beforeLogits[pl.id]||0),0);
  const beforeWinProb=Math.exp(beforeLogits[actor]||0)/Math.max(1e-6,beforeSum);
  const postLogits=Object.fromEntries(alive.map(pl=>[pl.id,logitPost(pl)]));
  const expSum=alive.reduce((s,pl)=>s+Math.exp(postLogits[pl.id]||0),0);
  const postWinProb=Math.exp(postLogits[actor]||0)/Math.max(1e-6,expSum);
  const leaderId=c.tableLeaderPlayer?.id;
  const leaderPostProb=(leaderId!=null&&leaderId!==actor)?Math.exp(postLogits[leaderId]||0)/Math.max(1e-6,expSum):0;
  const leaderBeforeProb=(leaderId!=null&&leaderId!==actor)?Math.exp(beforeLogits[leaderId]||0)/Math.max(1e-6,beforeSum):0;

  return {
    deltaWinProb:postWinProb-beforeWinProb,
    beforeWinProb,postWinProb,
    leaderPostProb,leaderDelta:leaderPostProb-leaderBeforeProb,
    model:'uncalibrated-public-heuristic'
  };
}

export function evaluateTradeForActor(c,norm){
  if(!norm)return 0;
  const myPropGain=norm.myTake.reduce((n,t)=>n+valuation(c,t),0)-norm.myGive.reduce((n,t)=>n+valuation(c,t),0);
  const faceDelta=norm.myTake.reduce((n,t)=>n+BOARD[t].price,0)-norm.myGive.reduce((n,t)=>n+BOARD[t].price,0)+norm.netCash;
  const cardUnitVal=c.canGiveJailCardSweetener?180:420;
  const cashAndCardGain=norm.netCash+norm.netCards*cardUnitVal;
  const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
  const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);

  const surrenderedBuffer=norm.myGive.reduce((n,t)=>n+(c.view.assets[t]?.mortgaged?0:(BOARD[t]?.mortgage||0)),0);
  const remainingLiquidBuffer=Math.max(0,(c.liquidBuffer||0)-surrenderedBuffer);
  const myPostCash=c.self.cash+norm.netCash+remainingLiquidBuffer*0.85;
  const oppPlayer=c.view.players[norm.partnerId];
  const oppPostCash=(oppPlayer?.cash||0)+norm.partnerNetCash;

  let strategicDelta=0;
  if(oppMono.count>0&&myMono.count===0){
    strategicDelta-=6800;
  }else if(myMono.count>0&&oppMono.count===0){
    const houseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
    const isDoubleSweep=norm.myTake.length>=2;
    const allowedFaceLoss=isDoubleSweep?-1550:-1150;
    if(myPostCash<houseCost*2||faceDelta<allowedFaceLoss){
      strategicDelta-=3000;
    }else{
      const buildReadiness=clamp(myPostCash/Math.max(1500,myMono.buildCost3*0.55),0.45,1.45);
      strategicDelta+=(isDoubleSweep?4400:3900)*myMono.bestTier*buildReadiness;
    }
  }else if(myMono.count>0&&oppMono.count>0){
    const myHouseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
    const oppHouseCost=BOARD[GROUPS[oppMono.groupIds[0]].ids[0]]?.build||1000;
    const myBuildableHouses=Math.min(9,Math.floor(Math.max(0,myPostCash-c.trueReserve*0.4)/myHouseCost));
    const oppBuildableHouses=Math.min(9,Math.floor(Math.max(0,oppPostCash-300)/oppHouseCost));
    // Both sides may manage after the transaction resumes. Capital and group
    // readiness can confer an advantage; proposing the trade does not.
    const capitalReadinessAdvantage=myBuildableHouses>=3;

    if(capitalReadinessAdvantage&&(myBuildableHouses>=oppBuildableHouses+2||oppBuildableHouses<=1||myMono.bestTier>oppMono.bestTier*1.12)){
      strategicDelta+=3700;
    }else if(oppBuildableHouses>=2){
      strategicDelta-=4600;
    }else{
      strategicDelta-=3900;
    }
  }else{
    if((c.view.phase==='debt'||(c.view.phase==='buy'&&c.needsPreBuyTrade)||(c.view.phase==='auction'&&c.needsMidAuctionTrade))&&norm.netCash>0&&faceDelta>=-320){
      strategicDelta+=2600;
    }else if(faceDelta<-260){
      strategicDelta-=1800;
    }else{
      for(const t of norm.myTake){
        if(c.boardGraph?.thirdPartyInterceptionTiles?.has(t))strategicDelta+=1250*(GROUP_TIER[BOARD[t]?.group]||1);
        if(c.boardGraph?.brokerTargetTiles?.has(t))strategicDelta+=1150*(GROUP_TIER[BOARD[t]?.group]||1);
        if(c.chainTargetTiles?.has(t))strategicDelta+=850*(GROUP_TIER[BOARD[t]?.group]||1);
        const b=BOARD[t];
        if(b?.group>=0&&c.groups[b.group].own===1&&GROUPS[b.group].ids.length===3){
          strategicDelta+=480*(GROUP_TIER[b.group]||1);
        }
      }
      if(c.needsBuildCapital&&norm.netCash>=900&&faceDelta>=-50&&norm.myGive.every(t=>!c.groups[BOARD[t]?.group]?.fullSetOwned)){
        strategicDelta+=780;
      }
    }
  }

  const rawScore=(myPropGain+cashAndCardGain+strategicDelta)/Math.max(1200,c.salary);
  const signal=clamp(rawScore,-1,1);
  return norm.isReject?clamp(-signal,-1,1):signal;
}

/* 28 HYPERGRAPH CORE EXPERTS + 5 TEMPORAL EXPERTS */
const defs=[
  // 1. OMNISCIENT BOARD-GRAPH & DESIRE READER (Core Pillar 1)
  {id:'boardReaderDesire',name:'Omniscient 6-Player Desire & Trojan-Bait Reader',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(oppMono.count>0)return delta(-0.99,'veto_giving_rival_monopoly');
    const trojanList=c.boardGraph?.trojanBaitForRival?.get(norm.partnerId)||[];
    const usesTrojanBait=norm.myGive.some(tid=>trojanList.some(tb=>tb.tileId===tid&&tb.isLockedHostagePair));
    const partnerDesires=c.boardGraph?.desireMatrix?.get(norm.partnerId)||[];
    const maxPartnerDesire=Math.max(0,...norm.myGive.map(tid=>partnerDesires[tid]||0));
    if(usesTrojanBait)return delta(0.98,'trojan_bait_2_of_3_illusion_with_our_3rd_tile_hostage');
    if(maxPartnerDesire>=60)return delta(0.92,'high_desire_bait_exploits_rival_preference');
    return null;
  }},
  // 2. 2-HOP BROKER PATHFINDER ("Memancing Si A Lewat Tanah Si B" - Core Pillar 2)
  {id:'brokerPathfinder',name:'2-Hop Broker & Bait Pathfinder ("Si A Butuh Tanah Si B")',types:['BUY','BID','AUCTION','OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    if(a.type==='BUY'||a.type==='BID'||a.type==='AUCTION'){
      const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
      if(!once(c,t)||!c.boardGraph?.brokerTargetTiles?.has(t))return null;
      if(a.type==='AUCTION')return delta(-0.96,'never_auction_2hop_broker_bait');
      if(a.type==='BUY')return delta(0.96,'buy_2hop_broker_bait_to_unlock_monopoly_trade');
      if(a.type==='BID'){
        const ceiling=grandmasterAuctionCeiling(c);
        return a.amount<=ceiling?delta(0.94,'bid_2hop_broker_bait_for_key_holder'):null;
      }
    }
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const acquiresBrokerBait=norm.myTake.some(t=>c.boardGraph?.brokerTargetTiles?.has(t));
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(acquiresBrokerBait&&oppMono.count===0&&norm.netCash>=-320){
      const oracle=a.type==='OFFER'?predictPartnerAcceptance(c,norm.raw):{willAccept:true};
      if(oracle.willAccept)return delta(0.97,'2hop_broker_step1_acquire_bait_from_party_B');
    }
    return null;
  }},
  // 3. ACTIVE MONOPOLY INTERDICTOR (3-Layer Denial - Core Pillar 3)
  {id:'monopolyInterdictor',name:'3-Layer Active Monopoly Interdiction & Poison-Pill Engine',types:['BUY','AUCTION','BID','OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    if(a.type==='BUY'||a.type==='AUCTION'||a.type==='BID'){
      const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
      if(!once(c,t))return null;
      const isCritDeny=c.boardGraph?.unownedCriticalDeny?.has(t);
      const isPoisonPill=c.boardGraph?.poisonPillTiles?.has(t);
      if(isCritDeny){
        if(a.type==='BUY')return delta(0.99,'critical_deny_block_rival_monopoly');
        if(a.type==='AUCTION')return delta(-0.99,'never_auction_rival_monopoly_completion');
        if(a.type==='BID'&&a.amount<=grandmasterAuctionCeiling(c))return delta(0.98,'bid_critical_deny_tile');
      }
      if(isPoisonPill){
        if(a.type==='BUY')return delta(0.92,'plant_poison_pill_hostage_in_rival_group');
        if(a.type==='AUCTION')return delta(-0.94,'keep_poison_pill_out_of_auction');
        if(a.type==='BID'&&a.amount<=grandmasterAuctionCeiling(c))return delta(0.89,'bid_poison_pill_anchor');
      }
      return null;
    }
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(oppMono.count>0)return delta(-0.99,'never_interdict_by_giving_monopoly');
    const snatchesLeak=norm.myTake.some(t=>c.boardGraph?.thirdPartyInterceptionTiles?.has(t));
    if(snatchesLeak&&norm.netCash>=-320){
      const oracle=a.type==='OFFER'?predictPartnerAcceptance(c,norm.raw):{willAccept:true};
      if(oracle.willAccept)return delta(0.98,'preemptive_3rd_party_hostage_snatch_blocks_rival');
    }
    return null;
  }},
  // 4. SPATIAL-TEMPORAL CORRIDOR AMBUSH (Core Pillar 4)
  {id:'spatialCorridorAmbush',name:'Spatial-Temporal Pawn Corridor Ambush & Danger Shield',types:['BUILD','BUILD_JOIN','REDEEM','JAIL_PAY','JAIL_CARD','ROLL'],assess:(c,a)=>{
    if(c.view.phase==='jail'){
      const highDanger=c.boardGraph?.corridorRadar?.spatialDangerFactor>=1.20;
      if(highDanger){
        if(a.type==='ROLL')return delta(0.95,'spatial_corridor_lethal_ahead_stay_in_jail');
        if(a.type==='JAIL_PAY'||a.type==='JAIL_CARD')return delta(-0.92,'veto_jail_exit_into_lethal_corridor');
      }
      return null;
    }
    if(c.shouldDeferPreRollBuild&&(a.type==='BUILD'||a.type==='REDEEM'))return null;
    if(build(a)){
      const t=a.tile,gId=BOARD[t]?.group;
      const ambush=gId>=0?(c.boardGraph?.corridorRadar?.groupAmbushIntensity?.[gId]||0):0;
      const tileProb=c.boardGraph?.corridorRadar?.tileRivalRollProb?.[t]||0;
      if(ambush>=0.22||tileProb>=0.12){
        return delta(clamp(0.76+ambush*0.95+tileProb*1.4,0.75,0.99),'corridor_ambush_rivals_5_to_9_steps_behind');
      }
    }
    return null;
  }},
  // 5. STRICT WIN-PROBABILITY DELTA EGOIST GATE
  {id:'egoistWinDelta',name:'Strict Win-Probability Delta Egoist Gate',types:['OFFER','COUNTER','TRADE_ACCEPT','BUILD','BUILD_JOIN','BUY','BID','REDEEM'],assess:(c,a)=>{
    const proj=projectWinProbabilityDelta(c,a);
    if(['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type)){
      const norm=normalizeTrade(c,a);
      if(norm&&!norm.isReject){
        const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
        const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
        if(oppMono.count>0&&myMono.count===0)return delta(-0.99,'egoist_veto_kingmaking');
        const isEmergency=c.view.phase==='debt'||(c.view.phase==='buy'&&c.needsPreBuyTrade)||(c.view.phase==='auction'&&c.needsMidAuctionTrade);
        if(!isEmergency&&proj.deltaWinProb<=0.0004){
          return delta(-0.96,'strict_egoist_gate_veto_non_positive_win_delta');
        }
        if(proj.deltaWinProb>=0.014){
          return delta(clamp(0.80+proj.deltaWinProb*4.5,0.80,0.99),'egoist_positive_win_probability_surge');
        }
      }
    }
    if(proj.deltaWinProb>=0.008){
      return delta(clamp(0.58+proj.deltaWinProb*5.0,0.58,0.98),'egoist_positive_win_delta');
    }
    return null;
  }},
  // 6. 3-TIER EXTORTIONATE COUNTER-OFFER ENGINE
  {id:'extortionCounter',name:'3-Tier Extortionate Counter-Offer Engine',types:['COUNTER','TRADE_REJECT'],assess:(c,a)=>{
    if(c.view.phase!=='trade')return null;
    if(a.type==='COUNTER'){
      const norm=normalizeTrade(c,a);if(!norm)return null;
      const s=evaluateTradeForActor(c,norm);
      const oracle=predictPartnerAcceptance(c,norm.raw);
      const proj=projectWinProbabilityDelta(c,a);
      if(oracle.willAccept&&s>=0.12&&proj.deltaWinProb>0){
        return delta(clamp(s+0.38,0.78,0.99),'extortionate_3tier_counter_verified');
      }
      return delta(-0.92,'reject_unaccepted_or_weak_counter');
    }
    return null;
  }},
  // 7. UNDERDOG FARMING & TABLE LEADER EMBARGO
  {id:'underdogFarmer',name:'Underdog Farming & Table Leader Embargo Expert',types:['OFFER','COUNTER'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const partnerId=norm.partnerId;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,partnerId,norm.myGive,norm.myTake);
    const isLeader=c.tableLeaderPlayer&&c.tableLeaderPlayer.id===partnerId&&c.tableLeaderPlayer.id!==c.actor;
    if(isLeader&&(oppMono.count>0||myMono.count===0)){
      return delta(-0.95,'strict_embargo_on_table_leader');
    }
    if(c.underdogs?.some(u=>u.id===partnerId)&&oppMono.count===0){
      return delta(myMono.count>0?0.96:0.86,'farm_underdog_for_monopoly_or_baits');
    }
    return null;
  }},
  // 8. RIVAL HOUSE-CASH STARVATION & AUCTION EXTORTIONIST
  {id:'auctionExtortionist',name:'Rival House-Cash Starvation & Auction Price-Driving Expert',types:['BID','PASS'],assess:(c,a)=>{
    if(c.view.phase!=='auction'||c.view.auction?.kind==='building')return null;
    const t=c.view.auction?.tile;
    if(!once(c,t))return null;
    const p=BOARD[t];
    const group=p.group;
    const needyRival=group>=0?c.groups[group]?.owners?.find(o=>o.count>0&&o.count<GROUPS[group].ids.length):null;
    const rivalStillActive=needyRival&&c.view.auction?.participants?.includes(needyRival.id)&&!c.view.auction?.passed?.includes(needyRival.id);
    if(rivalStillActive&&a.type==='BID'){
      const ceiling=grandmasterAuctionCeiling(c);
      if(a.amount<=ceiling&&a.amount<=p.price*1.08){
        return delta(0.92,'price_drive_starve_rival_house_cash');
      }
    }
    return null;
  }},
  // 9. PORTFOLIO & COMPLETION VALUE
  {id:'portfolio',name:'Portfolio & Completion Synergy Expert',types:['BUY','AUCTION'],assess:(c,a)=>{
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    if(c.earlyCashSinkTiles?.has(t)){
      return delta(a.type==='AUCTION'?0.92:-0.82,'early_cash_sink_send_to_discount_auction');
    }
    const comp=completion(c,t,c.actor);
    const v=valuation(c,t),cost=BOARD[t]?.price||0;
    if(a.type==='AUCTION')return delta(comp>=0.85?-0.98:comp>=0.40?-0.75:-0.40,'protect_key_deed_from_auction');
    return delta(Math.max(comp,(v-cost)/Math.max(v,500)),'marginal_portfolio_and_completion');
  }},
  // 10. SNIPER CLOCK AUCTION ENGINE
  {id:'auction',name:'Sniper Clock & Quantum 5-Nusa Auction Expert',types:['BID','PASS'],assess:(c,a)=>{
    if(c.view.phase!=='auction')return null;
    const ceiling=grandmasterAuctionCeiling(c);
    const minBid=c.auctionMinBid||auctionMinimum(c.view.auction);
    if(a.type==='PASS')return delta(minBid<=ceiling?-0.96:0.96,'clock_auction_pass_gate');
    if(a.amount>ceiling)return delta(-clamp((a.amount-ceiling)/300,0.55,1.0),'over_ceiling_bid_veto');
    const overstep=Math.max(0,a.amount-minBid);
    const stepScore=clamp(0.96-(overstep/Math.max(200,ceiling))*0.80,0.20,0.98);
    return delta(stepScore,'sniper_quantum_bid');
  }},
  // 11. 3-HOUSE SWEET SPOT & APEX EVEN-BUILD
  {id:'development',name:'3-House Sweet Spot & Apex Even-Build Expert',types:['BUILD','BUILD_JOIN','BUILD_DECLINE'],assess:(c,a)=>{
    if(a.type==='BUILD_DECLINE')return delta(-0.95,'never_decline_scarce_house_offer');
    if(!build(a))return null;
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return delta(-0.88,'defer_build_until_post_roll');
    const t=a.tile,lv=c.view.assets[t]?.level??0;
    const rd=rentDelta(c,t),sweet=threeHouseSweetSpotGain(c,t);
    const traffic=(c.visits[t]||0)*1.35+(c.immediateVisits?.[t]||0)*2.8;
    const inflection=lv===2?2.65:lv===1?2.00:lv===0?1.60:lv===3?1.15:0.55;
    const apexBoost=APEX_TILES.has(t)?1.14:1.0;
    const v=(rd*0.55+sweet*0.45)*traffic*inflection*apexBoost;
    return delta(v/Math.max(150,dollars(c,a)*0.30),'sweet_spot_3house_apex_roi');
  }},
  // 12. 32-HOUSE CHOKEHOLD & HOTEL DOWNGRADE TRAP
  {id:'scarcity',name:'32-House Chokehold & Hotel Trap Exploiter',types:['BUILD','BUILD_JOIN','SELL_SET'],assess:(c,a)=>{
    if(a.type==='SELL_SET'&&c.view.phase==='debt')return delta(-0.92,'avoid_catastrophic_sell_set');
    if(!build(a))return null;
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    const lv=c.view.assets[a.tile]?.level??0;
    const bCost=BOARD[a.tile]?.build||1000;
    const threshold=(c.sariPresent||c.rivalMonopolies>0||c.rivalHasHotel)?18:14;
    if(c.bank.houses<=threshold){
      if(lv===4)return delta(-0.99,'never_upgrade_hotel_keep_4_houses_locked');
      if(c.hotelTrapActive)return delta(0.98,'lock_bank_houses_below_4_to_trap_rival_hotel');
      const cheapBonus=bCost<=1000?0.38:0.18;
      return delta(clamp((20-c.bank.houses)/14+cheapBonus,0.40,1.0),'hoard_houses_chokehold');
    }
    return delta(lv<4?0.32:-0.15,'preserve_house_lock');
  }},
  // 13. TRUE SURVIVAL LIQUIDITY & DYNAMIC RESERVE
  {id:'liquidity',name:'Spatial-Adjusted True Survival Liquidity Expert',types:['BUY','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP'],assess:(c,a)=>{
    const cost=dollars(c,a);
    const effectiveAfter=c.self.cash-cost+(c.liquidBuffer||0)*0.75;
    const shortage=c.trueReserve-effectiveAfter;
    if(a.type==='MORTGAGE_KEEP')return delta(shortage>0?0.75:-0.65,'keep_mortgaged_only_if_tight');
    return delta(shortage>0?-clamp(shortage/Math.max(350,c.trueReserve),0,1):0.48,'spatial_survival_margin');
  }},
  // 14. SINGLE-PASS REDEEM & LEVERAGE MORTGAGE ENGINE
  {id:'mortgage',name:'Single-Pass Transfer Redeem & Pre-Trade Leverage Expert',types:['MORTGAGE','REDEEM','SELL','SELL_SET','MORTGAGE_REDEEM','MORTGAGE_KEEP'],assess:(c,a)=>{
    const t=tileOf(c,a),b=BOARD[t];if(!b)return null;
    const group=b.group;
    const inFullSet=group>=0&&c.groups[group].fullSetOwned;
    const isStation=b.type==='station';
    if(a.type==='MORTGAGE_REDEEM'){
      const rCost=redemption(t);
      return delta((inFullSet||isStation||c.self.cash-rCost>=c.trueReserve*0.60)?0.98:-0.35,'single_pass_redeem_save_double_interest');
    }
    if(a.type==='MORTGAGE_KEEP'){
      const rCost=redemption(t);
      return delta((inFullSet||isStation||c.self.cash-rCost>=c.trueReserve*0.60)?-0.90:0.65,'avoid_double_interest_trap');
    }
    if(a.type==='REDEEM'){
      if(c.shouldDeferPreRollBuild)return delta(-0.80,'defer_redeem_until_post_roll');
      if(inFullSet)return delta(0.99,'redeem_monopoly_immediately');
      if(group>=0&&c.cloakedMonopolyGroups?.has(group))return delta(-0.88,'keep_stealth_cloak_mortgaged');
      if(c.canDeleverage)return delta(isStation?0.92:0.78,'late_game_deleverage');
      return delta(-0.45,'defer_nonessential_redeem');
    }
    if(a.type==='MORTGAGE'){
      if(c.view.phase==='debt')return delta(inFullSet?-0.35:0.92,'mortgage_before_selling_houses');
      if(inFullSet)return delta(-0.99,'never_mortgage_monopoly');
      const aid=String(a.actionId||'');
      if(aid.startsWith('nusa-stealth-cloak-')||aid.startsWith('nusa-pretrade-mort-'))return delta(0.97,'strategic_pretrade_or_cloak_mortgage');
      if(c.view.phase==='buy'&&c.needsPreBuyMortgage)return delta(0.97,'pre_buy_flash_liquidity_mortgage');
      if(c.view.phase==='auction'&&c.needsMidAuctionMortgage)return delta(0.98,'mid_auction_flash_liquidity_mortgage');
      if(c.needsBuildCapital&&(b.type==='utility'||c.isolatedMortgageable.some(d=>d.id===t))&&!c.shouldDeferPreRollBuild)return delta(0.89,'leverage_isolated_deed_for_monopoly_build');
      return delta(-0.80,'avoid_unnecessary_mortgage_interest_loss');
    }
    return delta(c.view.phase==='debt'?-0.25:-0.99,'protect_houses');
  }},
  // 15. JAIL-CELL REMOTE LANDLORD & TWO-PHASE TACTICS
  {id:'jail',name:'Jail-Cell Remote Landlord & Two-Phase Exit Expert',types:['JAIL_PAY','JAIL_CARD','ROLL','BUILD','REDEEM'],assess:(c,a)=>{
    if(c.view.phase!=='jail')return null;
    if(a.type==='BUILD'||a.type==='REDEEM')return delta(0.97,'jail_cell_remote_landlord_build_first');
    const earlyExpansion=c.unowned.length>=5&&c.nearLoss<420&&c.boardGraph?.corridorRadar?.spatialDangerFactor<1.15;
    if(a.type==='ROLL')return delta(earlyExpansion?-0.88:0.92,'jail_shelter_late_game');
    return delta(earlyExpansion?0.94:-0.75,'jail_exit_timing');
  }},
  // 16. BANKRUPTCY DEFENSE & EMERGENCY DEBT TRADE
  {id:'bankruptcy',name:'Bankruptcy Defense & Emergency Trade Rescue Expert',types:['MORTGAGE','SELL','SELL_SET','BANKRUPT','OFFER'],assess:(c,a)=>{
    if(c.view.phase!=='debt')return null;
    if(a.type==='BANKRUPT')return delta(-1,'never_surrender');
    if(a.type==='OFFER'){
      const norm=normalizeTrade(c,a);
      if(norm&&norm.netCash>0&&predictPartnerAcceptance(c,norm.raw).willAccept){
        return delta(0.99,'debt_emergency_trade_rescue_save_houses');
      }
      return delta(-0.90,'unaccepted_debt_trade');
    }
    if(a.type==='MORTGAGE')return delta(0.94,'mortgage_first_in_debt');
    if(a.type==='SELL')return delta(0.35,'even_sell_over_set_wipe');
    return delta(-0.50,'avoid_full_set_wipe');
  }},
  // 17. GRANDMASTER BILATERAL TRADE NPV & ANTI-KINGMAKING
  {id:'negotiation',name:'Grandmaster Trade NPV & Anti-Kingmaking Expert',types:['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    return delta(evaluateTradeForActor(c,norm),'bilateral_trade_npv');
  }},
  // 18. MIND-READER ORACLE & TRAJECTORY SOLVER
  {id:'trajectorySolver',name:'Mind-Reader Oracle & Post-Trade Trajectory Solver',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const {myEval}=getBilateralTradeEvaluation(c,norm.raw,norm.proposerId);
    const isEmergencyRescue=c.view.phase==='debt'||(c.view.phase==='buy'&&c.needsPreBuyTrade)||(c.view.phase==='auction'&&c.needsMidAuctionTrade);
    if(myEval.invalid||myEval.net<0||(!isEmergencyRescue&&myEval.deltaShare<myEval.partnerDelta-0.005)){
      return delta(-0.98,'negative_post_trade_trajectory_veto');
    }
    if(a.type==='OFFER'&&!predictPartnerAcceptance(c,norm.raw).willAccept){
      return delta(-0.96,'mind_reader_rejection_shield_veto');
    }
    return delta(clamp(myEval.net/1400,0.30,0.98),'mind_reader_verified_trajectory');
  }},
  // 19. VELOCITY-DOMINATED MUTUAL MONOPOLY SWAP
  {id:'velocitySwap',name:'Velocity-Dominated Mutual Monopoly Swap Expert',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    const surrenderedBuffer=norm.myGive.reduce((n,t)=>n+(c.view.assets[t]?.mortgaged?0:(BOARD[t]?.mortgage||0)),0);
    const myTotalBuildCash=c.self.cash+norm.netCash+Math.max(0,(c.liquidBuffer||0)-surrenderedBuffer)*0.85;
    if(myMono.count>0&&oppMono.count===0){
      return delta(myTotalBuildCash>=1500?0.97:-0.65,'unilateral_monopoly_with_build_cash');
    }
    if(myMono.count>0&&oppMono.count>0){
      const oppTotalBuildCash=(c.view.players[norm.partnerId]?.cash||0)+norm.partnerNetCash;
      const myHouseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
      const oppHouseCost=BOARD[GROUPS[oppMono.groupIds[0]].ids[0]]?.build||1000;
      const myHouses=Math.floor(Math.max(0,myTotalBuildCash-c.trueReserve*0.4)/myHouseCost);
      const oppHouses=Math.floor(Math.max(0,oppTotalBuildCash-300)/oppHouseCost);
      if(myHouses>=3&&(myHouses>=oppHouses+2||oppHouses<=1)){
        return delta(0.97,'velocity_dominated_swap_with_comparative_build_capital');
      }
      return delta(-0.96,'unsafe_bilateral_monopoly_swap_veto');
    }
    return null;
  }},
  // 20. POST-ROLL CONSTRUCTION & RENT-CLAIM EXPIRY DISCIPLINE
  {id:'postRollDiscipline',name:'Post-Roll Construction & Rent-Claim Expiry Discipline',types:['BUILD','REDEEM','ROLL','END'],assess:(c,a)=>{
    if(c.view.phase==='roll'&&c.hasPendingRivalRentClaim&&a.type==='ROLL'){
      return delta(0.99,'instant_roll_to_expire_rival_manual_rent_claim');
    }
    if(c.view.phase==='roll'&&c.shouldDeferPreRollBuild){
      if(a.type==='BUILD')return delta(-0.92,'wait_until_post_roll_end_phase_to_build');
      if(a.type==='REDEEM')return delta(-0.85,'wait_until_post_roll_end_phase_to_redeem');
      if(a.type==='ROLL')return delta(0.94,'roll_first_with_100pct_liquid_cash');
    }
    if(c.view.phase==='end'){
      if(a.type==='BUILD')return delta(0.96,'post_roll_end_phase_optimal_build_window');
      if(a.type==='REDEEM'){
        const g=BOARD[a.tile]?.group;
        if((g>=0&&c.groups[g]?.fullSetOwned)||c.canDeleverage){
          return delta(0.94,'post_roll_end_phase_optimal_redeem');
        }
      }
    }
    return null;
  }},
  // 21. SILENT 2-STEP CHAIN ACCUMULATOR (1/3 -> 2/3)
  {id:'chainAccumulator',name:'Silent 2-Step Chain Accumulation Expert (1/3 -> 2/3)',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(oppMono.count>0)return null;
    const acquiresChainTarget=norm.myTake.some(t=>c.chainTargetTiles?.has(t));
    if(!acquiresChainTarget)return null;
    const surrendersOwnPair=norm.myGive.some(t=>{
      const g=BOARD[t]?.group;
      return g>=0&&c.groups[g].own>=2;
    });
    if(surrendersOwnPair)return delta(-0.90,'never_break_own_pair_for_chain');
    const faceDelta=norm.myTake.reduce((n,t)=>n+BOARD[t].price,0)-norm.myGive.reduce((n,t)=>n+BOARD[t].price,0)+norm.netCash;
    if(faceDelta>=-240&&(a.type!=='OFFER'||predictPartnerAcceptance(c,norm.raw).willAccept)){
      return delta(0.93,'silent_2step_chain_accumulation_1_to_2');
    }
    return null;
  }},
  // 22. 1-STEP DOUBLE-DEED MONOPOLY SWEEP (1/3 -> 3/3)
  {id:'doubleDeedSweep',name:'1-Step Double-Deed Monopoly Sweep Expert (1/3 -> 3/3)',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject||norm.myTake.length<2)return null;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(myMono.count>0&&oppMono.count===0&&(a.type!=='OFFER'||predictPartnerAcceptance(c,norm.raw).willAccept)){
      return delta(0.98,'instant_1_to_3_double_deed_monopoly_sweep');
    }
    return null;
  }},
  // 23. CASH-CLOAKED POVERTY ILLUSION & STEALTH MORTGAGE
  {id:'povertyCloak',name:'Cash-Cloaked Poverty Illusion & Stealth Mortgage Expert',types:['OFFER','COUNTER','MORTGAGE'],assess:(c,a)=>{
    if(a.type==='MORTGAGE'&&String(a.actionId||'').startsWith('nusa-stealth-cloak-')){
      return delta(0.96,'stealth_mortgage_cloak_unlocks_monopoly_buyout');
    }
    if(!c.canUsePovertyCloak)return null;
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(myMono.count>0&&oppMono.count===0){
      const visiblePostCash=c.self.cash+norm.netCash;
      const surrenderedBuffer=norm.myGive.reduce((n,t)=>n+(c.view.assets[t]?.mortgaged?0:(BOARD[t]?.mortgage||0)),0);
      const hiddenReserve=Math.max(0,(c.liquidBuffer||0)-surrenderedBuffer);
      const houseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
      if(visiblePostCash<=houseCost*1.5&&visiblePostCash+hiddenReserve>=houseCost*2.5){
        if(a.type!=='OFFER'||predictPartnerAcceptance(c,norm.raw).willAccept){
          return delta(0.98,'poverty_illusion_discounts_rival_monopoly_threat_to_15pct');
        }
      }
    }
    return null;
  }},
  // 24. CATCH-UP COALITION & JAIL-CARD ARBITRAGE
  {id:'coalitionArbitrage',name:'Catch-Up Coalition & Jail-Card Sweetener Arbitrage',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm||norm.isReject)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(oppMono.count>0)return null;
    const usesJailSweetener=c.canGiveJailCardSweetener&&(norm.raw.giveCards||0)>0;
    const isCatchUp=c.catchUpPartners?.has(norm.partnerId);
    if(usesJailSweetener&&isCatchUp)return delta(0.96,'catch_up_coalition_plus_jail_card_arbitrage');
    if(isCatchUp)return delta(0.93,'catch_up_coalition_0_10_jealousy_arbitrage');
    if(usesJailSweetener)return delta(0.90,'jail_card_sweetener_preserves_build_cash');
    return null;
  }},
  // 25. CROSS-PHASE BUY & MID-AUCTION RESCUE TRADE
  {id:'crossPhaseRescue',name:'Cross-Phase Buy & Mid-Auction Flash Rescue Expert',types:['OFFER','AUCTION','PASS','MORTGAGE'],assess:(c,a)=>{
    if(c.view.phase==='buy'&&c.needsPreBuyTrade){
      if(a.type==='OFFER'){
        const norm=normalizeTrade(c,a);
        if(norm&&norm.netCash>0&&predictPartnerAcceptance(c,norm.raw).willAccept){
          return delta(0.99,'cross_phase_buy_rescue_trade_for_instant_cash');
        }
        return delta(-0.92,'unaccepted_buy_rescue_trade');
      }
      if(a.type==='AUCTION')return delta(-0.90,'avoid_auction_when_cross_phase_trade_available');
    }
    if(c.view.phase==='auction'&&c.needsMidAuctionTrade){
      if(a.type==='OFFER'){
        const norm=normalizeTrade(c,a);
        if(norm&&norm.netCash>0&&predictPartnerAcceptance(c,norm.raw).willAccept){
          return delta(0.99,'mid_auction_cross_phase_trade_rescue');
        }
        return delta(-0.90,'unaccepted_mid_auction_trade');
      }
      if(a.type==='PASS')return delta(-0.92,'do_not_pass_before_mid_auction_rescue');
    }
    return null;
  }},
  // 26. BUILDING-OFFER & BUILDING-AUCTION ARBITRAGE SNIPER
  {id:'buildingAuctionSniper',name:'Building-Offer & Building-Auction Arbitrage Sniper',types:['BUILD_JOIN','BUILD_DECLINE','BID','PASS'],assess:(c,a)=>{
    if(c.view.phase==='buildOffer'){
      return delta(a.type==='BUILD_JOIN'?0.99:-0.99,'mandatory_build_join_contest_scarce_house');
    }
    if(c.view.phase==='auction'&&c.view.auction?.kind==='building'){
      const ceiling=grandmasterAuctionCeiling(c);
      const minBid=c.auctionMinBid||auctionMinimum(c.view.auction);
      if(a.type==='BID'&&a.amount<=ceiling)return delta(0.98,'building_auction_arbitrage_bid');
      if(a.type==='PASS'&&minBid<=ceiling)return delta(-0.98,'never_let_rival_win_cheap_building_auction');
    }
    return null;
  }},
  // 27. PUBLIC FIFO 16-CARD DECK CYCLE & QUEUE LOOKAHEAD
  {id:'cardAndQueueOracle',name:'Public FIFO 16-Card Cycle & Auction-Queue Lookahead',types:['BUY','BID','PASS','BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(c.hasHighPriorityQueuedAuction&&c.queueAuctionReserve>0&&c.view.phase==='auction'&&c.view.auction?.kind!=='building'){
      const t=c.view.auction?.tile;
      if(completion(c,t,c.actor)<0.90&&block(c,t)<0.80){
        const ceiling=grandmasterAuctionCeiling(c);
        const minBid=c.auctionMinBid||auctionMinimum(c.view.auction);
        if(a.type==='PASS'&&minBid>ceiling)return delta(0.96,'save_cash_for_queued_monopoly_auction');
        if(a.type==='BID'&&a.amount>ceiling)return delta(-0.96,'preserve_queue_auction_reserve');
      }
    }
    if(a.type==='BUY'||a.type==='BID'){
      const t=tileOf(c,a);
      if(c.cardCycle?.activeMagnetTiles?.has(t)&&!c.earlyCashSinkTiles?.has(t)){
        return delta(0.85,'fifo_card_magnet_active_in_deck');
      }
    }
    if(build(a)&&!c.shouldDeferPreRollBuild&&c.cardCycle?.repairSafe){
      return delta(0.80,'fifo_repair_cards_already_passed');
    }
    return null;
  }},
  // 28. PREY INSOLVENCY & KILLSHOT HARVESTER
  {id:'killshot',name:'Prey Insolvency & Estate Killshot Harvester',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    if(build(a)){
      const ks=c.tileKillshot?.[a.tile]||0;
      const imm=c.immediateVisits?.[a.tile]||0;
      if(ks>0.12||imm>0.09)return delta(clamp(ks*1.40+imm*2.5,0.35,1.0),'killshot_ambush_build');
    }
    return null;
  }},
  // 29. PUBLIC CASHFLOW CLOCK: DRIFT IS AN ESTIMATE, NOT A BANKRUPTCY VERDICT.
  {id:'cashflowClock',name:'Public Cashflow Clock & Attrition Posture Expert',types:['OFFER','COUNTER','TRADE_ACCEPT','BUY','BID','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM','ROLL','END'],assess:(c,a)=>{
    const temporal=c.temporal;if(!temporal)return null;
    const posture=temporal.macroPosture;
    if(posture==='ATTRITION_LOCKDOWN'){
      if(tradeAction(a)){
        const norm=normalizeTrade(c,a);if(!norm)return null;
        const rivalMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
        if(rivalMono.count>0)return delta(-0.99,'cashflow_lockdown_veto_rival_monopoly');
        const projection=projectWinProbabilityDelta(c,a);
        if(norm.netCash<0&&projection.deltaWinProb<=0)return delta(-0.90,'cashflow_lockdown_preserve_positive_drift_and_cash');
      }
      if((a.type==='ROLL'||a.type==='END')&&!readyPreEndTargets(c).length)return delta(0.34,'cashflow_lockdown_preserve_public_attrition_advantage');
    }
    if(posture==='TEMPO_BREAKER'&&['OFFER','COUNTER','TRADE_ACCEPT','BUY','BID','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM'].includes(a.type)){
      const projection=projectWinProbabilityDelta(c,a);
      if(projection.deltaWinProb>0)return delta(clamp(0.64+projection.deltaWinProb*7,0.64,0.96),'cashflow_tempo_breaker_positive_relative_improvement');
    }
    if(build(a)&&(temporal.executionTargets||[]).length){
      let pressure=0;
      for(const target of temporal.executionTargets){
        if(c.decisionContext?.expired())break;
        const probability=landingForecast(c.view,target.id,1).visits[a.tile]||0;
        pressure+=probability/Math.max(0.5,Number.isFinite(target.ETTR)?target.ETTR:2);
      }
      if(pressure>0&&rentDelta(c,a.tile)>0)return delta(clamp(0.62+pressure*2.2,0.62,0.98),'cashflow_execution_target_rent_pressure');
    }
    return null;
  }},
  // 30. SEAT ORDER AFFECTS THE NEXT ROLL, NOT EXCLUSIVE BUILD RIGHTS.
  {id:'turnInitiative',name:'Public Turn Initiative & Outside-Turn Management Expert',types:['BUY','BID','AUCTION','BUILD','BUILD_JOIN','OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const temporal=c.temporal;if(!temporal)return null;
    if(tradeAction(a)){
      const norm=normalizeTrade(c,a);if(!norm)return null;
      const rivalMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
      if(rivalMono.count>0){
        // After the transaction resumes, rivals may build before their own turn.
        // Seat distance never makes gifting a build-ready monopoly safe.
        const initiative=temporal.initiative?.get(norm.partnerId);
        return delta(initiative?.canBuildBeforeOwnRoll===false?-0.88:-0.98,'initiative_rival_can_manage_without_waiting_for_own_roll');
      }
      return null;
    }
    if(build(a)&&temporal.nextPlayerId!=null){
      const hit=landingForecast(c.view,temporal.nextPlayerId,1).visits[a.tile]||0;
      if(hit>0.03)return delta(clamp(0.60+hit*1.7,0.60,0.94),'initiative_build_before_next_public_roll');
    }
    if(['BUY','BID','AUCTION'].includes(a.type)){
      const tile=a.type==='AUCTION'?c.view.buy:tileOf(c,a),group=BOARD[tile]?.group;
      if(!(group>=0))return null;
      for(const rival of c.rivals){
        if(GROUPS[group].ids.filter(id=>id!==tile&&owner(c,id)===rival.id).length!==GROUPS[group].ids.length-1)continue;
        const initiative=temporal.initiative?.get(rival.id),urgency=initiative?.interdictionUrgency||1;
        if(a.type==='AUCTION')return delta(-0.94,'initiative_keep_monopoly_key_out_of_rival_auction');
        if(a.type==='BUY'||a.amount<=grandmasterAuctionCeiling(c))return delta(clamp(0.69+urgency*0.16,0.69,0.96),'initiative_interdict_rival_key_before_future_rolls');
      }
    }
    return null;
  }},
  // 31. COMPLETE A BROKER CHAIN ONLY FROM THE CURRENT PUBLIC INVENTORY.
  {id:'statefulBroker',name:'Stateful Step-Two Broker Execution Expert',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    if(!tradeAction(a)||!c.temporal)return null;
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const match=(c.temporal.readyStep2BrokerChains||[]).find(chain=>chain.partnerId===norm.partnerId&&norm.myGive.includes(chain.baitTile)&&norm.myTake.includes(chain.missingTile));
    if(!match)return null;
    const rivalMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(rivalMono.count>0)return delta(-0.99,'stateful_broker_veto_rival_monopoly');
    const ownMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    if(!ownMono.count)return null;
    if(a.type!=='TRADE_ACCEPT'&&!predictPartnerAcceptance(c,norm.raw).willAccept)return null;
    const generated=String(a.actionId||'').startsWith('nusa-broker-step2-');
    return delta(generated?0.99:0.94,'stateful_broker_step2_current_bait_for_missing_monopoly_key');
  }},
  // 32. LIQUIDATE STRATEGICALLY IDLE DEEDS WITHOUT REMOVING A MONOPOLY BLOCKER.
  {id:'deadWeightLiquidator',name:'Dead-Weight Deed Sale & Capital Recycling Expert',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    if(!tradeAction(a)||!c.temporal)return null;
    const norm=normalizeTrade(c,a);if(!norm||!norm.myGive.length||norm.myTake.length||norm.netCash<=0)return null;
    const idle=new Set((c.temporal.deadWeightAssets||[]).map(t=>t.tileId??t.id));
    if(!norm.myGive.every(tile=>idle.has(tile)))return null;
    const rivalMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(rivalMono.count>0)return delta(-0.99,'deadweight_sale_veto_rival_monopoly');
    const face=norm.myGive.reduce((sum,tile)=>sum+(BOARD[tile]?.price||0),0);
    if(norm.netCash<face)return null;
    if(a.type!=='TRADE_ACCEPT'&&!predictPartnerAcceptance(c,norm.raw).willAccept)return null;
    const generated=String(a.actionId||'').startsWith('nusa-deadweight-sale-');
    return delta(generated?0.96:0.84,'deadweight_sale_recycles_idle_deed_at_face_or_premium');
  }},
  // 33. PREPARE RENT BEFORE ENDING, WITH LEGALITY AND STOCK CHECKED NOW.
  {id:'preEndAmbush',name:'Legal Pre-End Redeem & Build Ambush Expert',types:['END','BUILD','REDEEM','MORTGAGE'],assess:(c,a)=>{
    if(!c.temporal||c.view.phase!=='end'||c.view.turn!==c.actor)return null;
    const ready=readyPreEndTargets(c);
    if(a.type==='END'&&ready.length)return delta(ready.every(t=>t.constructionMayInterrupt)?-0.68:-0.98,'pre_end_ambush_prepare_affordable_legal_target_before_end');
    if(a.type==='BUILD'||a.type==='REDEEM'){
      const target=ready.find(t=>[...(t.redeemActions||[]),...(t.buildActions||[])].some(action=>matchesAction(action,a)));
      if(target)return delta(target.constructionMayInterrupt?0.77:0.99,'pre_end_ambush_legal_preparation_before_next_roll');
    }
    if(a.type==='MORTGAGE'&&!managementError(c.view,c.actor,a.tile,'MORTGAGE')){
      const funding=(c.temporal.preEndTargets||[]).some(t=>!t.affordableNow&&t.affordableWithMortgage&&t.sufficientHouseStock&&(t.fundingActions||[]).some(action=>matchesAction(action,a)));
      if(funding)return delta(0.88,'pre_end_ambush_fund_target_with_idle_deed');
    }
    return null;
  }}
];

export const STRATEGY_EXPERTS=Object.freeze(defs.map(d=>Object.freeze(d)));
export function runExperts(context,action){
  return STRATEGY_EXPERTS.flatMap(x=>{
    if(context.decisionContext?.expired())return [];
    const r=x.assess(context,action);
    if(!r||!Number.isFinite(r.signal))return [];
    return [{id:x.id,name:x.name,...r}];
  });
}
