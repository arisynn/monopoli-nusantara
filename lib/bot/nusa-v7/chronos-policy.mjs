/** V23 candidate synthesis. Every dispatched edge is validated by the engine;
 * trade acceptance, mortgage choices and scarce-building auctions are barriers.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {canManage,canTrade,managementError,redemption,rent} from '../../game.mjs';
import {candidateState,legalCandidate} from '../candidates.mjs';
import {constructionAffordable,buildingCashReserve} from '../economy.mjs';
import {prepareTradeCandidate} from '../negotiation.mjs';
import {rejectionActive} from '../concessions.mjs';
import {memoryFor} from '../memory.mjs';
import {predictPartnerAcceptance,solveOptimalTradeCash,normalizeTrade,completesGroupPostTrade} from './experts.mjs';

const intent=a=>{const {actionId,...rest}=a;return JSON.stringify(rest);};
const stopped=c=>!!c.decisionContext?.expired();
const cashFloor=c=>buildingCashReserve({reserve:c.trueReserve});

/** Highest affordable cash sale inside 100–135% face value. Binary refinement
 * rechecks every candidate; no caller treats human acceptance as guaranteed.
 */
export function solveDeadWeightSale(c,tile,partnerId){
  const p=c.view.players[partnerId],t=BOARD[tile];
  if(!p||!t?.price||c.view.assets[tile]?.owner!==c.actor)return null;
  let low=Math.ceil(t.price/10),high=Math.floor(Math.min(p.cash,t.price*1.35)/10),best=null;
  const probe=units=>{
    if(stopped(c))return null;
    const trade={to:partnerId,give:[tile],take:[],giveCash:0,takeCash:units*10,giveCards:0,takeCards:0};
    const oracle=predictPartnerAcceptance(c,trade);
    return oracle.willAccept&&oracle.myEval?.net>0&&legalCandidate(c.view,c.actor,{type:'OFFER',trade},c.decisionContext)?{trade,oracle}:null;
  };
  if(high<low)return null;
  // Coarse points also admit a valid interval beyond a nonmonotone low endpoint.
  const points=[...new Set([low,Math.floor((low+high)/2),high])].sort((a,b)=>a-b);
  for(const pt of points){const found=probe(pt);if(found)best=found;}
  if(!best)return null;
  low=best.trade.takeCash/10+1;
  while(low<=high&&!stopped(c)){
    const mid=Math.floor((low+high)/2),found=probe(mid);
    if(found){best=found;low=mid+1;}else high=mid-1;
  }
  return best;
}

function developmentStep(c,groupId){
  const {view,actor}=c,ids=GROUPS[groupId]?.ids;
  if(!ids?.every(id=>view.assets[id]?.owner===actor)||!canManage(view,actor)||['auction','debt'].includes(view.phase))return null;
  const mortgaged=ids.filter(id=>view.assets[id].mortgaged);
  const next=mortgaged.length?{type:'REDEEM',tile:mortgaged[0]}:
    ids.filter(id=>view.assets[id].level<3&&!managementError(view,actor,id,'BUILD',{ignoreCash:true}))
      .sort((a,b)=>(c.temporal.preEndTargets.find(x=>x.tileId===b)?.hitProbability||0)-
                   (c.temporal.preEndTargets.find(x=>x.tileId===a)?.hitProbability||0)||b-a)
      .map(tile=>({type:'BUILD',tile}))[0];
  if(!next)return null;
  const cost=next.type==='REDEEM'?redemption(next.tile):BOARD[next.tile].build;
  if(view.players[actor].cash-cost>=cashFloor(c)&&legalCandidate(view,actor,next,c.decisionContext))return {action:next,macro:[next]};
  // Funding is a real first edge; do not assume its follow-up survives a new event.
  for(const collateral of c.temporal.deadWeightAssets){
    if(stopped(c))break;
    if(collateral.group===groupId||managementError(view,actor,collateral.id,'MORTGAGE'))continue;
    const action={type:'MORTGAGE',tile:collateral.id};
    const funded=candidateState(view,actor,action,c.decisionContext);
    if(funded&&funded.players[actor].cash-cost>=cashFloor(c)&&legalCandidate(funded,actor,next,c.decisionContext))return {action,macro:[action,next]};
  }
  return null;
}

export function ensureChronosCandidates(c,plan){
  if(!c.temporal||stopped(c)||!Array.isArray(plan?.candidates))return plan;
  const {view,actor,self,temporal}=c,mem=memoryFor(view,actor),candidates=plan.candidates;
  const baseScore=Math.max(0,...candidates.map(x=>x.score));
  const add=(raw,bonus,macro=null)=>{
    if(stopped(c))return false;
    const action=prepareTradeCandidate(view,actor,raw,{decisionContext:c.decisionContext});
    if(!action||!constructionAffordable(view,actor,action,c.trueReserve)||!legalCandidate(view,actor,action,c.decisionContext))return false;
    const key=intent(action),old=candidates.find(x=>intent(x.action)===key);
    if(old){
      old.score=Math.max(old.score,baseScore+bonus);
      if(action.actionId){old.action.actionId=action.actionId;old.id=action.actionId;}
      if(macro)old.macro=macro;
    }else candidates.push({id:action.actionId,action,score:baseScore+bonus,expanded:true,...(macro?{macro}:{})});
    return true;
  };

  // Posture is an economic preference, never a replacement for a rule guard.
  for(const candidate of candidates){
    const a=candidate.action;
    if(temporal.macroPosture==='ATTRITION_LOCKDOWN'&&['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type)){
      const norm=normalizeTrade(c,a);
      if(norm&&!norm.isReject){
        const opponentMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
        const ours=completesGroupPostTrade(c,actor,norm.myTake,norm.myGive);
        if(opponentMono.count>0||norm.netCash<0&&ours.count===0&&!String(a.actionId).includes('interdict'))candidate.score-=c.salary*1.2;
      }
    }
    if(temporal.macroPosture==='APEX_EXECUTIONER'&&['BUILD','BUILD_JOIN'].includes(a.type)){
      const exposure=temporal.executionTargets.reduce((sum,p)=>sum+(c.visits?.[a.tile]||0)/(1+p.ETTR),0);
      candidate.score+=Math.min(300,exposure*c.salary);
    }
  }

  if(view.phase!=='end'||view.turn!==actor)return plan;
  const saved=mem.nusaBroker;
  const pending=saved?.matchId===view.matchId&&saved.turnSerial===view.turnSerial?saved:null;

  // Finish an accepted two-hop chain before finding unrelated opportunities.
  if(canTrade(view,actor)&&c.roundTradeCount<3){
    const chains=temporal.readyStep2BrokerChains.slice().sort((a,b)=>
      Number(b.baitTile===pending?.baitTile&&b.missingTile===pending?.ultimateTargetTile)-
      Number(a.baitTile===pending?.baitTile&&a.missingTile===pending?.ultimateTargetTile)||b.priority-a.priority);
    for(const chain of chains.slice(0,4)){
      if(stopped(c))break;
      if(chain.breaksOwnNearMonopoly||rejectionActive(view,mem,chain.keyHolderId))continue;
      const houseCost=BOARD[GROUPS[chain.groupId].ids[0]].build;
      const cap=Math.max(0,Math.floor((self.cash-Math.max(cashFloor(c),houseCost*2))/10)*10);
      const solved=solveOptimalTradeCash(c,{partnerId:chain.keyHolderId,giveList:[chain.baitTile],takeList:[chain.missingTile],
        minOverpay:-360,maxOverpay:950,maxCashOffer:cap,partnerMaxCash:view.players[chain.keyHolderId].cash});
      if(solved&&add({type:'OFFER',trade:solved.trade,actionId:`nusa-broker-step2-${chain.baitTile}-for-${chain.missingTile}`},495))break;
    }
  }

  // Cash released by selling low-value isolated land funds development or an
  // identified buyout. Never sell hostage deeds, strategic bait or a target set.
  const developmentNeed=c.groups.reduce((max,g)=>g.fullSetOwned?Math.max(max,g.redeemCost+
    g.ids.reduce((n,id)=>n+Math.max(0,3-view.assets[id].level)*BOARD[id].build,0)+cashFloor(c)-self.cash):max,0);
  const buyoutNeed=c.boardGraph.brokerPlans.reduce((max,b)=>Math.max(max,BOARD[b.missingTile].price+2*b.houseCost+cashFloor(c)-self.cash),0);
  if(canTrade(view,actor)&&c.roundTradeCount<3&&(developmentNeed>0||buyoutNeed>0)){
    let sold=false;
    for(const tile of temporal.deadWeightAssets.filter(t=>t.group!==c.ownAnalysis.targetGroup).slice(0,3)){
      if(stopped(c)||sold)break;
      for(const partner of c.underdogs.slice().sort((a,b)=>b.cash-a.cash).slice(0,3)){
        if(stopped(c)||rejectionActive(view,mem,partner.id))continue;
        if(tile.group>=0&&GROUPS[tile.group].ids.filter(id=>view.assets[id]?.owner===partner.id).length>=GROUPS[tile.group].ids.length-1)continue;
        const solved=solveDeadWeightSale(c,tile.id,partner.id);
        if(solved&&add({type:'OFFER',trade:solved.trade,actionId:`nusa-deadweight-sale-${tile.id}-${solved.trade.takeCash}`},465)){sold=true;break;}
      }
    }
  }

  const targets=temporal.preEndTargets.filter(t=>t.inApexWindow&&t.affordableWithMortgage);
  const groups=[...new Set([...(pending?.stage==='develop'?[pending.targetGroupId]:[]),...targets.map(t=>t.groupId)])];
  let actionable=false;
  for(const groupId of groups){
    if(stopped(c))break;
    const step=developmentStep(c,groupId);
    if(step){
      const action={...step.action,actionId:`nusa-preend-${step.action.type.toLowerCase()}-${step.action.tile}`};
      if(add(action,pending?.stage==='develop'?560:525,[action,...step.macro.slice(1)])){actionable=true;break;}
    }
  }
  if(actionable)for(const cnd of candidates)if(cnd.action.type==='END')cnd.score-=c.salary*0.5;
  return plan;
}

export function temporalTelemetry(c){
  const t=c.temporal,row=t?.cashflowByPlayer.get(c.actor);
  return {macroPosture:t?.macroPosture??'NEUTRAL',complete:!!t?.complete,
    drift:row?.drift??null,estimatedOrbitsToRuin:Number.isFinite(row?.ETTR)?row.ETTR:null,
    nextPlayer:t?.nextPlayerId??null,readyBrokerChains:t?.readyStep2BrokerChains.length??0,
    deadWeightAssets:t?.deadWeightAssets.length??0,preEndTargets:t?.preEndTargets.length??0,
    orbitIsNormalized:true,opponentCanBuildBeforeRoll:true};
}
