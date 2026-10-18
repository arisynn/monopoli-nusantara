/** NUSA V18.0 "Transcendent Metagame & Multi-Agent Singularity" Knowledge Bank (38 Experts).
 * Adds 4 Metagame & Cross-Phase Specialists (Experts 35-38):
 * - crossPhaseTrade (Executes OFFER inside `phase === 'buy'` or `'roll'` to rescue key acquisitions)
 * - collusionInterdictor (Preemptively acquires third-party bridge tiles to block rival-to-rival trades)
 * - counterHijacker (Hijacks incoming rival trade offers with a monopoly-acquiring COUNTER on their turn)
 * - psychProfiler (Exploits `view.botMemory.opponents` aggression/group desire & Jail-Card arbitrage)
 */
import {BOARD,GROUPS,auctionMinimum} from '../../content.mjs';
import {rent,redemption,interest} from '../../game.mjs';
import {evaluateTrade} from '../negotiation.mjs';
import {analyzeState} from '../analysis.mjs';
import {APEX_TILES,STATION_GEOMETRY_MULT} from './situation.mjs';

const clamp=(x,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,x));
const owner=(c,t)=>c.view.assets[t]?.owner;
const actType=a=>a?.type;
const build=a=>['BUILD','BUILD_JOIN'].includes(actType(a));
const acquisition=a=>['BUY','BID'].includes(actType(a));
const tileOf=(c,a)=>a.type==='BUY'?c.view.buy:a.type==='BID'?(c.view.auction?.kind==='building'?c.view.auction?.targets?.[c.actor]:c.view.auction?.tile):a.type==='MORTGAGE_REDEEM'||a.type==='MORTGAGE_KEEP'?c.view.mortgageDecision?.tile:a.tile;
const dollars=(c,a)=>a.type==='BUY'?BOARD[c.view.buy]?.price||0:a.type==='BID'?a.amount||0:build(a)?BOARD[a.tile]?.build||0:a.type==='REDEEM'||a.type==='MORTGAGE_REDEEM'?redemption(tileOf(c,a)):a.type==='MORTGAGE_KEEP'?interest(tileOf(c,a)):0;
const delta=(signal,reason)=>({signal:clamp(signal),reason});
const once=(c,t)=>Number.isInteger(t)&&BOARD[t]?.price>0;

export const GROUP_TIER=[1.14,1.48,1.30,1.72,1.62,1.32,0.84,1.36];
const CARD_MAGNETS=new Set([19,24,39,11,5,15,25]);

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
      const anchorVal=tier>=1.25?(isPriorityRival?0.78:0.68):tier>=1.10?0.52:0.28;
      maxThreat=Math.max(maxThreat,anchorVal);
    }
  }
  return maxThreat;
}

function capPressure(c,cost){
  const effectiveCash=c.self.cash+(c.liquidBuffer||0)*0.65;
  return clamp((effectiveCash-cost-c.reserve)/Math.max(600,c.reserve));
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
    return p.price*(1.05+ownSt*0.36)*geoMult+fifoBoost;
  }
  const tier=p.group>=0?(GROUP_TIER[p.group]||1):1;
  const synergy=completion(c,t,c.actor);
  const denial=block(c,t);
  const apexBonus=APEX_TILES.has(t)?p.price*0.08*tier:0;
  const anchorBonus=c.contestedAnchorTiles?.has(t)?p.price*0.28*tier:0;
  const stepBonus=c.steppingStoneTiles?.has(t)?p.price*0.32:0;
  const chainBonus=c.chainTargetTiles?.has(t)?p.price*0.24*tier:0;
  const collusionBonus=c.collusionTargetTiles?.has(t)?p.price*0.34*tier:0;
  const visits=(c.visits[t]||0)+0.65*(c.immediateVisits?.[t]||0);
  const magnetBonus=(c.cardCycle?.activeMagnetTiles?.has(t)?p.price*0.20:(CARD_MAGNETS.has(t)?p.price*0.12:0));
  const rent3=p.rents?.[3]||p.rents?.[0]||200;
  return p.price*tier*(0.88+synergy*1.18+denial*0.72)+visits*rent3*0.22+magnetBonus+apexBonus+anchorBonus+stepBonus+chainBonus+collusionBonus;
}

/**
 * V18.0 Omniscient Auction Ceiling:
 * Incorporates Building-Auction Arbitrage, C1009 Station Asymmetry,
 * Bankruptcy Auction-Queue Lookahead, and Psychological Price-Driving!
 */
export function grandmasterAuctionCeiling(c){
  const auction=c.view.auction;
  if(!auction)return 0;
  if(auction.kind==='building'){
    const t=auction.targets?.[c.actor];
    if(!Number.isInteger(t))return 0;
    const bCost=BOARD[t]?.build||1000;
    const lv=c.view.assets[t]?.level||0;
    const mult=lv===2?2.25:lv===1?2.05:lv===3?1.85:1.55;
    return Math.min(Math.max(0,c.self.cash-c.trueReserve*0.35),Math.floor((bCost*mult)/10)*10);
  }
  const t=auction.tile,p=BOARD[t];
  if(!p)return 0;
  const comp=completion(c,t,c.actor);
  const blk=block(c,t);
  const tier=p.group>=0?(GROUP_TIER[p.group]||1):1;

  let maxVal=p.price*0.98;
  if(comp>=0.95){
    maxVal=p.price*Math.min(1.55,Math.max(1.30,tier*1.12))+350;
  }else if(blk>=0.80){
    const needyRival=c.groups[p.group]?.owners?.find(o=>o.count===GROUPS[p.group].ids.length-1);
    const rivalStillBidding=needyRival&&auction.participants?.includes(needyRival.id)&&!auction.passed?.includes(needyRival.id);
    const rivalCash=needyRival?c.view.players[needyRival.id]?.cash||0:0;
    const prof=needyRival?c.opponentProfiles?.get(needyRival.id):null;
    const driveCap=prof?.isHotBidder?p.price*1.36+220:p.price*1.32+200;
    maxVal=rivalStillBidding?Math.min(rivalCash+10,driveCap):p.price*1.08;
  }else if(c.earlyCashSinkTiles?.has(t)){
    maxVal=p.price*0.82;
  }else if(c.contestedAnchorTiles?.has(t)||c.collusionTargetTiles?.has(t)){
    maxVal=p.price*Math.min(1.08,Math.max(0.98,tier*0.84));
  }else if(c.steppingStoneTiles?.has(t)||c.chainTargetTiles?.has(t)){
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

  const qReserve=(comp<0.90&&blk<0.80)?(c.queueAuctionReserve||0):0;
  const safeCash=Math.max(0,c.self.cash+(c.liquidBuffer||0)*0.35-c.trueReserve*0.45-qReserve);
  return Math.min(c.self.cash,safeCash,Math.floor(maxVal/10)*10);
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

export function getBilateralTradeEvaluation(c,trade,proposerId=c.actor){
  const partnerId=proposerId===c.actor?trade.to:proposerId;
  const key=proposerId+':'+partnerId+':'+JSON.stringify(trade);
  if(c._tradeEvalCache?.has(key))return c._tradeEvalCache.get(key);

  let partnerAnalysis=c._partnerAnalyses?.get(partnerId);
  if(!partnerAnalysis){
    partnerAnalysis=analyzeState(c.view,partnerId,{fast:false});
    c._partnerAnalyses?.set(partnerId,partnerAnalysis);
  }
  const proposerPublic=analyzeState(c.view,proposerId,{fast:true,publicOpponent:true});
  const partnerContext={
    observerId:partnerId,
    analyses:new Map([[partnerId,partnerAnalysis],[proposerId,proposerPublic]])
  };

  const myAnalysis=c.ownAnalysis||analyzeState(c.view,c.actor,{fast:false});
  const partnerPublic=analyzeState(c.view,partnerId,{fast:true,publicOpponent:true});
  const myContext={
    observerId:c.actor,
    analyses:new Map([[c.actor,myAnalysis],[partnerId,partnerPublic]])
  };

  const partnerEval=evaluateTrade(c.view,partnerId,trade,proposerId,partnerContext);
  const myEval=evaluateTrade(c.view,c.actor,trade,proposerId,myContext);
  const result={myEval,partnerEval};
  c._tradeEvalCache?.set(key,result);
  return result;
}

export function predictPartnerAcceptance(c,trade){
  const partnerId=trade.to;
  const partner=c.view.players[partnerId];
  if(!partner||partner.out)return {willAccept:false,partnerNet:-1e8,myEval:null,partnerEval:null};

  const {myEval,partnerEval}=getBilateralTradeEvaluation(c,trade,c.actor);
  if(partnerEval.invalid||partnerEval.insolventAfterFees||partnerEval.unilateralLoss||partnerEval.net<2){
    return {willAccept:false,partnerNet:partnerEval.net,myEval,partnerEval};
  }

  const myMono=completesGroupPostTrade(c,c.actor,trade.take||[],trade.give||[]);
  const oppMono=completesGroupPostTrade(c,partnerId,trade.give||[],trade.take||[]);
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

  const requiredNet=myMono.count>0&&oppMono.count===0?75:12;
  return {
    willAccept:partnerEval.net>=requiredNet,
    partnerNet:partnerEval.net,
    myEval,
    partnerEval
  };
}

export function evaluateTradeForActor(c,norm){
  if(!norm)return 0;
  const myPropGain=norm.myTake.reduce((n,t)=>n+valuation(c,t),0)-norm.myGive.reduce((n,t)=>n+valuation(c,t),0);
  const faceDelta=norm.myTake.reduce((n,t)=>n+BOARD[t].price,0)-norm.myGive.reduce((n,t)=>n+BOARD[t].price,0)+norm.netCash;
  // Jail card value adapts to stage: worth 450 in early game, 180 in mid/late game when staying in jail is desirable!
  const cardUnitVal=c.canGiveJailCardSweetener?180:420;
  const cashAndCardGain=norm.netCash+norm.netCards*cardUnitVal;
  const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
  const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);

  const myPostCash=c.self.cash+norm.netCash+(c.liquidBuffer||0)*0.75;
  const oppPlayer=c.view.players[norm.partnerId];
  const oppPostCash=(oppPlayer?.cash||0)+norm.partnerNetCash;

  let strategicDelta=0;
  if(oppMono.count>0&&myMono.count===0){
    strategicDelta-=6000;
  }else if(myMono.count>0&&oppMono.count===0){
    const houseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
    if(myPostCash<houseCost*2||faceDelta<-950){
      strategicDelta-=2800;
    }else{
      const buildReadiness=clamp(myPostCash/Math.max(1500,myMono.buildCost3*0.55),0.45,1.40);
      strategicDelta+=3500*myMono.bestTier*buildReadiness;
    }
  }else if(myMono.count>0&&oppMono.count>0){
    const myHouseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
    const oppHouseCost=BOARD[GROUPS[oppMono.groupIds[0]].ids[0]]?.build||1000;
    const myBuildableHouses=Math.min(9,Math.floor(Math.max(0,myPostCash-c.trueReserve*0.4)/myHouseCost));
    const oppBuildableHouses=Math.min(9,Math.floor(Math.max(0,oppPostCash-300)/oppHouseCost));
    const firstBuildAdvantage=!norm.isIncoming&&myBuildableHouses>=3;

    if(firstBuildAdvantage&&(myBuildableHouses>=oppBuildableHouses+2||oppBuildableHouses<=1||myMono.bestTier>oppMono.bestTier*1.12)){
      strategicDelta+=3200;
    }else if(norm.isIncoming&&oppBuildableHouses>=2){
      strategicDelta-=4200;
    }else{
      strategicDelta-=3600;
    }
  }else{
    if((c.view.phase==='debt'||(c.view.phase==='buy'&&c.needsPreBuyTrade))&&norm.netCash>0&&faceDelta>=-320){
      strategicDelta+=2400;
    }else if(faceDelta<-250){
      strategicDelta-=1800;
    }else{
      for(const t of norm.myTake){
        if(c.collusionTargetTiles?.has(t))strategicDelta+=1050*(GROUP_TIER[BOARD[t]?.group]||1);
        if(c.steppingStoneTiles?.has(t))strategicDelta+=950;
        if(c.chainTargetTiles?.has(t))strategicDelta+=820*(GROUP_TIER[BOARD[t]?.group]||1);
        const b=BOARD[t];
        if(b?.group>=0&&c.groups[b.group].own===1&&GROUPS[b.group].ids.length===3){
          strategicDelta+=480*(GROUP_TIER[b.group]||1);
        }
      }
      if(c.needsBuildCapital&&norm.netCash>=900&&faceDelta>=-50&&norm.myGive.every(t=>!c.groups[BOARD[t]?.group]?.fullSetOwned)){
        strategicDelta+=750;
      }
    }
  }

  const rawScore=(myPropGain+cashAndCardGain+strategicDelta)/Math.max(1200,c.salary);
  const signal=clamp(rawScore,-1,1);
  return norm.isReject?clamp(-signal,-1,1):signal;
}

const defs=[
  {id:'portfolio',name:'Portfolio Expert',types:['BUY','BID'],assess:(c,a)=>{
    if(a.type==='BID')return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    if(c.earlyCashSinkTiles?.has(t))return delta(-0.55,'early_cash_sink_discount_preferred');
    const v=valuation(c,t),cost=dollars(c,a);
    return delta((v-cost)/Math.max(v,500),'marginal_portfolio_value');
  }},
  {id:'completion',name:'Monopoly Completion',types:['BUY','BID','AUCTION'],assess:(c,a)=>{
    if(a.type==='BID')return null;
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    const comp=completion(c,t,c.actor);
    if(a.type==='AUCTION')return delta(comp>=0.9?-1:comp>=0.40?-0.70:0.10,'avoid_auction_on_key_set');
    return delta(comp,'set_completion');
  }},
  {id:'auction',name:'Net-Worth Preserving Sniper Auction Expert',types:['BID','PASS'],assess:(c,a)=>{
    if(c.view.phase!=='auction')return null;
    const auction=c.view.auction;
    const ceiling=grandmasterAuctionCeiling(c);
    const minBid=auctionMinimum(auction);
    if(a.type==='PASS'){
      return delta(minBid<=ceiling?-0.96:0.96,'clock_auction_pass_gate');
    }
    if(a.amount>ceiling){
      return delta(-clamp((a.amount-ceiling)/300,0.55,1.0),'over_ceiling_bid_veto');
    }
    const overstep=Math.max(0,a.amount-minBid);
    const stepScore=clamp(0.96-(overstep/Math.max(200,ceiling))*0.80,0.20,0.98);
    return delta(stepScore,'sniper_clock_bid');
  }},
  {id:'blocking',name:'Blocking Expert',types:['BUY','AUCTION'],assess:(c,a)=>{
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    const blk=block(c,t);
    if(a.type==='AUCTION')return delta(blk>=0.50?-0.94:0,'block_via_buy');
    return delta(blk,'denial_value');
  }},
  {id:'development',name:'Development & 3-House Sweet Spot Expert',types:['BUILD','BUILD_JOIN','BUILD_DECLINE'],assess:(c,a)=>{
    if(a.type==='BUILD_DECLINE')return delta(-0.92,'decline_penalized');
    if(!build(a))return null;
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return delta(-0.85,'defer_build_until_post_roll');
    const t=a.tile,lv=c.view.assets[t]?.level??0;
    const rd=rentDelta(c,t),sweet=threeHouseSweetSpotGain(c,t);
    const traffic=(c.visits[t]||0)*1.35+(c.immediateVisits?.[t]||0)*2.8;
    const inflection=lv===2?2.65:lv===1?2.00:lv===0?1.60:lv===3?1.15:0.55;
    const apexBoost=APEX_TILES.has(t)?1.12:1.0;
    const v=(rd*0.55+sweet*0.45)*traffic*inflection*apexBoost;
    return delta(v/Math.max(150,dollars(c,a)*0.30),'sweet_spot_3house_roi');
  }},
  {id:'scarcity',name:'32-House Chokehold Expert',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(!build(a))return null;
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    const lv=c.view.assets[a.tile]?.level??0;
    const bCost=BOARD[a.tile]?.build||1000;
    const threshold=(c.sariPresent||c.rivalMonopolies>0||c.rivalHasHotel)?18:14;
    if(c.bank.houses<=threshold){
      if(lv===4)return delta(-0.99,'strict_hotel_upgrade_veto_lock_houses');
      const cheapBonus=bCost<=1000?0.38:0.18;
      return delta(clamp((20-c.bank.houses)/14+cheapBonus,0.40,1.0),'hoard_houses_chokehold');
    }
    return delta(lv<4?0.30:-0.15,'preserve_house_lock');
  }},
  {id:'cashflow',name:'Cashflow Velocity Expert',types:['BUILD','BUILD_JOIN','BUY'],assess:(c,a)=>{
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    const opportunity=build(a)?rentDelta(c,t):(BOARD[t].rents?.[0]||60);
    const traffic=(c.visits[t]||0)+0.90*(c.immediateVisits?.[t]||0);
    return delta((opportunity*traffic)/Math.max(180,dollars(c,a)*0.38),'expected_rent_cashflow');
  }},
  {id:'liquidity',name:'True Survival Liquidity Expert',types:['BUY','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM','MORTGAGE_KEEP'],assess:(c,a)=>{
    const cost=dollars(c,a);
    const effectiveAfter=c.self.cash-cost+(c.liquidBuffer||0)*0.75;
    const shortage=c.trueReserve-effectiveAfter;
    if(a.type==='MORTGAGE_KEEP')return delta(shortage>0?0.75:-0.65,'keep_mortgaged_only_if_tight');
    return delta(shortage>0?-clamp(shortage/Math.max(350,c.trueReserve),0,1):0.45,'post_spend_survival_margin');
  }},
  {id:'mortgage',name:'Single-Pass & Pre-Buy Leverage Expert',types:['MORTGAGE','REDEEM','SELL','SELL_SET','MORTGAGE_REDEEM','MORTGAGE_KEEP'],assess:(c,a)=>{
    const t=tileOf(c,a),b=BOARD[t];if(!b)return null;
    const group=b.group;
    const inFullSet=group>=0&&c.groups[group].fullSetOwned;
    const isStation=b.type==='station';
    if(a.type==='MORTGAGE_REDEEM'){
      const rCost=redemption(t);
      if(inFullSet||isStation||c.self.cash-rCost>=c.trueReserve*0.60){
        return delta(0.98,'single_pass_redeem_save_double_interest');
      }
      return delta(-0.35,'preserve_cash_on_tight_transfer');
    }
    if(a.type==='MORTGAGE_KEEP'){
      const rCost=redemption(t);
      if(inFullSet||isStation||c.self.cash-rCost>=c.trueReserve*0.60){
        return delta(-0.90,'avoid_double_10pct_interest_trap');
      }
      return delta(0.65,'keep_mortgaged_when_low_cash');
    }
    if(a.type==='REDEEM'){
      if(c.shouldDeferPreRollBuild)return delta(-0.80,'defer_redeem_until_post_roll');
      if(inFullSet)return delta(0.99,'redeem_monopoly_immediately');
      if(c.canDeleverage&&isStation)return delta(0.92,'late_game_deleverage_station');
      if(c.canDeleverage)return delta(0.78,'late_game_deleverage_asset');
      return delta(-0.45,'defer_nonessential_redeem');
    }
    if(a.type==='MORTGAGE'){
      if(c.view.phase==='debt')return delta(inFullSet?-0.35:0.88,'mortgage_before_selling_houses');
      if(inFullSet)return delta(-0.99,'never_mortgage_monopoly');
      if(c.view.phase==='buy'&&c.needsPreBuyMortgage)return delta(0.96,'pre_buy_flash_liquidity_mortgage');
      if(c.view.phase==='auction'&&c.needsMidAuctionMortgage)return delta(0.97,'mid_auction_flash_liquidity_mortgage');
      if(c.needsBuildCapital&&b.type==='utility'&&!c.shouldDeferPreRollBuild)return delta(0.86,'leverage_utility_for_monopoly_build');
      return delta(-0.80,'avoid_unnecessary_mortgage_interest_loss');
    }
    return delta(c.view.phase==='debt'?-0.25:-0.99,'protect_houses');
  }},
  {id:'probability',name:'Markov Traffic Expert',types:['BUILD','BUILD_JOIN','BUY'],assess:(c,a)=>{
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    const tier=BOARD[t].group>=0?(GROUP_TIER[BOARD[t].group]||1):1.1;
    const traffic=(c.visits[t]||0)*1.25+(c.immediateVisits?.[t]||0)*2.0;
    return delta((traffic*tier)-0.10,'markov_landing_hotspot');
  }},
  {id:'jail',name:'Jail-Cell Remote Landlord & Tactics Expert',types:['JAIL_PAY','JAIL_CARD','ROLL','BUILD','REDEEM'],assess:(c,a)=>{
    if(c.view.phase!=='jail')return null;
    if(a.type==='BUILD'||a.type==='REDEEM'){
      return delta(0.96,'jail_cell_remote_landlord_build_first');
    }
    const earlyExpansion=c.unowned.length>=5&&c.nearLoss<420;
    if(a.type==='ROLL'){
      return delta(earlyExpansion?-0.85:0.90,'jail_shelter_late_game');
    }
    const penalty=a.type==='JAIL_PAY'?500:200;
    const netBenefit=(c.unowned.length*60+c.expectedIncome*0.35)-c.nearLoss*1.4-penalty;
    return delta(earlyExpansion?0.92:netBenefit/Math.max(500,c.salary),'jail_exit_timing');
  }},
  {id:'bankruptcy',name:'Bankruptcy Defense & Emergency Trade Rescue Expert',types:['MORTGAGE','SELL','SELL_SET','BANKRUPT','OFFER'],assess:(c,a)=>{
    if(c.view.phase!=='debt')return null;
    if(a.type==='BANKRUPT')return delta(-1,'never_surrender');
    if(a.type==='OFFER'){
      const norm=normalizeTrade(c,a);
      if(norm&&norm.netCash>0){
        const oracle=predictPartnerAcceptance(c,norm.raw);
        if(oracle.willAccept)return delta(0.98,'debt_emergency_trade_rescue_save_houses');
      }
      return delta(-0.90,'unaccepted_debt_trade');
    }
    if(a.type==='MORTGAGE')return delta(0.94,'mortgage_first_in_debt');
    if(a.type==='SELL')return delta(0.35,'even_sell_over_set_wipe');
    return delta(-0.50,'avoid_full_set_wipe');
  }},
  {id:'negotiation',name:'Grandmaster Trade & Anti-Kingmaking Expert',types:['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    return delta(evaluateTradeForActor(c,norm),'bilateral_trade_npv');
  }},
  {id:'opponent',name:'Opponent & Bima/Kresna Threat Analyst',types:['BUY','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{
    if(a.type==='BUY')return delta(block(c,tileOf(c,a))*0.92,'block_rival_set');
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    if(oppMono.count>0&&myMono.count===0)return delta(norm.isReject?0.99:-0.99,'veto_kingmaking_trade');
    return delta(evaluateTradeForActor(c,norm)*0.85,'relative_rival_suppression');
  }},
  {id:'endgame',name:'Mid-to-Late Game Attrition Expert',types:['BUILD','BUILD_JOIN','REDEEM','MORTGAGE'],assess:(c,a)=>{
    if(c.stage!=='contested'&&c.stage!=='endgame')return null;
    if(c.shouldDeferPreRollBuild&&(a.type==='BUILD'||a.type==='REDEEM'))return null;
    if(a.type==='REDEEM')return delta(c.canDeleverage?0.92:0.78,'late_game_unmortgage_power');
    if(build(a))return delta(capPressure(c,dollars(c,a))*0.85,'late_game_rent_escalation');
    return delta(c.needsBuildCapital?0.55:-0.75,'late_game_asset_shield');
  }},
  {id:'competitive',name:'Stage Tempo Expert',types:['BUILD','BUILD_JOIN','BUY','REDEEM','OFFER'],assess:(c,a)=>{
    if(c.stage==='acquisition'&&a.type==='BUY'){
      const t=tileOf(c,a);
      if(c.earlyCashSinkTiles?.has(t))return delta(-0.50,'skip_early_cash_sink_buy');
      return delta(0.65,'early_selective_land_grab');
    }
    if(c.shouldDeferPreRollBuild&&(a.type==='BUILD'||a.type==='REDEEM'))return null;
    if(c.stage!=='acquisition'&&(build(a)||a.type==='REDEEM'||a.type==='OFFER'))return delta(0.78,'mid_late_tempo_push');
    return delta(0.18,'tempo_alignment');
  }},
  {id:'killshot',name:'Prey Insolvency & Snowball Harvester',types:['BUILD','BUILD_JOIN','OFFER'],assess:(c,a)=>{
    if(c.shouldDeferPreRollBuild&&a.type==='BUILD')return null;
    if(build(a)){
      const ks=c.tileKillshot?.[a.tile]||0;
      const imm=c.immediateVisits?.[a.tile]||0;
      if(ks>0.12||imm>0.09)return delta(clamp(ks*1.35+imm*2.4,0.30,1.0),'killshot_ambush_build');
    }
    return null;
  }},
  {id:'asymmetricSwap',name:'Trojan-Horse & First-Build Monopoly Swap Expert',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(myMono.count>0&&oppMono.count===0){
      const myPostCash=c.self.cash+norm.netCash+(c.liquidBuffer||0)*0.75;
      return delta(myPostCash>=1500?0.96:-0.65,'unilateral_monopoly_with_build_cash');
    }
    if(myMono.count>0&&oppMono.count>0){
      const myHouseCost=BOARD[GROUPS[myMono.groupIds[0]].ids[0]]?.build||1000;
      const oppHouseCost=BOARD[GROUPS[oppMono.groupIds[0]].ids[0]]?.build||1000;
      const myPostCash=c.self.cash+norm.netCash+(c.liquidBuffer||0)*0.75;
      const oppPostCash=(c.view.players[norm.partnerId]?.cash||0)+norm.partnerNetCash;
      const myHouses=Math.floor(Math.max(0,myPostCash-c.trueReserve*0.4)/myHouseCost);
      const oppHouses=Math.floor(Math.max(0,oppPostCash-300)/oppHouseCost);
      if(!norm.isIncoming&&myHouses>=3&&(myHouses>=oppHouses+2||oppHouses<=1)){
        return delta(0.95,'first_build_asymmetric_swap_dominance');
      }
      return delta(-0.96,'unsafe_bilateral_monopoly_swap_veto');
    }
    return null;
  }},
  {id:'steppingStone',name:'Stepping-Stone Triangle Trade Expert',types:['BUY','BID','OFFER','TRADE_ACCEPT'],assess:(c,a)=>{
    if(a.type==='BUY'||a.type==='BID'){
      const t=tileOf(c,a);
      if(c.steppingStoneTiles?.has(t))return delta(0.88,'acquire_triangle_trade_bait');
      return null;
    }
    const norm=normalizeTrade(c,a);if(!norm)return null;
    if(norm.myTake.some(t=>c.steppingStoneTiles?.has(t))&&norm.netCash>=-250){
      return delta(0.86,'triangle_stepping_stone_acquisition');
    }
    return null;
  }},
  {id:'trajectorySolver',name:'Mind-Reader Oracle & Trajectory Solver',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const {myEval}=getBilateralTradeEvaluation(c,norm.raw,norm.proposerId);
    const isEmergencyRescue=c.view.phase==='debt'||(c.view.phase==='buy'&&c.needsPreBuyTrade);
    if(myEval.invalid||myEval.net<0||(!isEmergencyRescue&&myEval.deltaShare<myEval.partnerDelta-0.005)){
      return delta(-0.98,'negative_post_trade_trajectory_veto');
    }
    if(a.type==='OFFER'){
      const oracle=predictPartnerAcceptance(c,norm.raw);
      if(!oracle.willAccept)return delta(-0.95,'mind_reader_rejection_shield_veto');
    }
    return delta(clamp(myEval.net/1400,0.28,0.98),'mind_reader_verified_trajectory');
  }},
  {id:'flashLiquidity',name:'Pre-Buy & Flash Unmortgage Liquidity Expert',types:['REDEEM','MORTGAGE','BUILD'],assess:(c,a)=>{
    if(c.shouldDeferPreRollBuild&&(a.type==='REDEEM'||a.type==='BUILD'))return null;
    if(a.type==='REDEEM'){
      const g=BOARD[a.tile]?.group;
      if(g>=0&&c.groups[g].fullSetOwned)return delta(0.99,'flash_redeem_monopoly_unlock');
      if(c.canDeleverage)return delta(0.88,'deleverage_surplus_cash');
    }
    if(a.type==='MORTGAGE'){
      if(c.view.phase==='buy'&&c.needsPreBuyMortgage)return delta(0.97,'flash_mortgage_for_key_buy');
      if(c.view.phase==='auction'&&c.needsMidAuctionMortgage)return delta(0.98,'flash_mortgage_for_key_auction');
      if(c.needsBuildCapital&&BOARD[a.tile]?.type==='utility'&&!c.shouldDeferPreRollBuild)return delta(0.85,'flash_mortgage_utility_for_houses');
    }
    return null;
  }},
  {id:'counterTrade',name:'Active Counter-Offer Expert',types:['COUNTER'],assess:(c,a)=>{
    if(a.type!=='COUNTER')return null;
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const s=evaluateTradeForActor(c,norm);
    return delta(s>0.15?clamp(s+0.25,0,1):-0.85,'counter_offer_leverage');
  }},
  {id:'contestedAnchor',name:'Contested-Group Split & Hostage Expert',types:['BUY','AUCTION','BID'],assess:(c,a)=>{
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    if(!c.contestedAnchorTiles?.has(t))return null;
    const p=BOARD[t];
    const tier=p.group>=0?(GROUP_TIER[p.group]||1):1.25;
    if(a.type==='BUY')return delta(clamp(0.86+(tier-1)*0.18,0.82,0.98),'seize_contested_color_anchor_hostage');
    if(a.type==='AUCTION')return delta(-0.96,'never_auction_contested_anchor');
    if(a.type==='BID'){
      const ceiling=grandmasterAuctionCeiling(c);
      return a.amount<=ceiling?delta(0.88,'bid_contested_anchor_hostage'):null;
    }
    return null;
  }},
  {id:'earlySelectivity',name:'Forward-Horizon Buy vs Auction Filter Expert',types:['BUY','AUCTION'],assess:(c,a)=>{
    if(c.view.phase!=='buy')return null;
    const t=c.view.buy;
    if(!once(c,t))return null;
    if(c.earlyCashSinkTiles?.has(t)){
      if(a.type==='AUCTION')return delta(0.92,'selective_auction_on_early_cash_sink');
      if(a.type==='BUY')return delta(-0.84,'avoid_full_price_early_cash_sink');
    }
    const p=BOARD[t];
    const tier=p.group>=0?(GROUP_TIER[p.group]||1):1.15;
    if(c.contestedAnchorTiles?.has(t)||tier>=1.14||p.type==='station'){
      if(a.type==='BUY')return delta(0.94,'selective_buy_high_future_value');
      if(a.type==='AUCTION')return delta(-0.94,'veto_auction_on_strategic_deed');
    }
    return null;
  }},
  {id:'auctionTrap',name:'Early-Game Discount Arbitrage & Cash-Drain Expert',types:['BID','PASS'],assess:(c,a)=>{
    if(c.view.phase!=='auction'||c.view.auction?.kind==='building')return null;
    const t=c.view.auction?.tile;
    if(!once(c,t)||!c.earlyCashSinkTiles?.has(t))return null;
    const p=BOARD[t];
    const trapCeiling=Math.floor((p.price*0.82)/10)*10;
    const minBid=auctionMinimum(c.view.auction);
    if(a.type==='PASS')return delta(minBid>trapCeiling?0.98:-0.92,'dump_overpriced_cash_sink_on_rival');
    if(a.type==='BID')return delta(a.amount<=trapCeiling?0.90:-0.96,'early_discount_arbitrage_bid');
    return null;
  }},
  {id:'earlyBlitz',name:'Early-Game Mobility & First-Monopoly Blitz Expert',types:['JAIL_PAY','JAIL_CARD','ROLL','OFFER'],assess:(c,a)=>{
    if(c.view.phase==='jail'&&c.unowned.length>=5&&c.nearLoss<420){
      if(a.type==='JAIL_CARD'||a.type==='JAIL_PAY')return delta(0.96,'early_blitz_instant_jail_exit');
      if(a.type==='ROLL')return delta(-0.90,'avoid_early_jail_stagnation');
    }
    if(a.type==='OFFER'&&c.stage==='acquisition'){
      const norm=normalizeTrade(c,a);
      if(!norm)return null;
      const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
      const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
      if(myMono.count>0&&oppMono.count===0){
        const oracle=predictPartnerAcceptance(c,norm.raw);
        if(oracle.willAccept&&oracle.myEval?.net>0){
          return delta(0.97,'early_first_monopoly_blitz_trade');
        }
      }
    }
    return null;
  }},
  {id:'postRollDiscipline',name:'Post-Roll Construction & Liquidity Discipline Expert',types:['BUILD','REDEEM','ROLL','END'],assess:(c,a)=>{
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
  {id:'chainAccumulator',name:'Silent 2-Step Chain Accumulation Expert (1/3 -> 2/3)',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
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
    if(faceDelta>=-220){
      const oracle=a.type==='OFFER'?predictPartnerAcceptance(c,norm.raw):{willAccept:true};
      if(oracle.willAccept){
        return delta(0.93,'silent_2step_chain_accumulation_1_to_2');
      }
    }
    return null;
  }},
  {id:'cardCycleTracker',name:'Public FIFO 16-Card Deck Cycle Tracker',types:['BUY','BID','BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(a.type==='BUY'||a.type==='BID'){
      const t=tileOf(c,a);
      if(c.cardCycle?.activeMagnetTiles?.has(t)&&!c.earlyCashSinkTiles?.has(t)){
        return delta(0.84,'fifo_card_magnet_active_in_deck');
      }
      return null;
    }
    if(build(a)&&!c.shouldDeferPreRollBuild){
      if(c.cardCycle?.repairSafe)return delta(0.78,'fifo_repair_cards_already_passed');
      if(c.cardCycle?.repairImminent&&c.self.cash-dollars(c,a)<c.trueReserve*1.15){
        return delta(-0.45,'fifo_repair_card_imminent_caution');
      }
    }
    return null;
  }},
  {id:'buildingAuctionSniper',name:'Building-Offer & Building-Auction Arbitrage Sniper',types:['BUILD_JOIN','BUILD_DECLINE','BID','PASS'],assess:(c,a)=>{
    if(c.view.phase==='buildOffer'){
      if(a.type==='BUILD_JOIN')return delta(0.99,'mandatory_build_join_contest_scarce_house');
      if(a.type==='BUILD_DECLINE')return delta(-0.99,'never_decline_contested_building_offer');
    }
    if(c.view.phase==='auction'&&c.view.auction?.kind==='building'){
      const ceiling=grandmasterAuctionCeiling(c);
      const minBid=auctionMinimum(c.view.auction);
      if(a.type==='BID'&&a.amount<=ceiling){
        return delta(0.98,'building_auction_arbitrage_and_denial_bid');
      }
      if(a.type==='PASS'&&minBid<=ceiling){
        return delta(-0.98,'never_let_rival_win_cheap_building_auction');
      }
    }
    return null;
  }},
  {id:'midAuctionLiquidity',name:'Mid-Auction Flash Liquidity Mortgage Expert',types:['MORTGAGE','PASS','BID'],assess:(c,a)=>{
    if(c.view.phase!=='auction'||!c.needsMidAuctionMortgage)return null;
    if(a.type==='MORTGAGE'){
      const b=BOARD[a.tile];
      const inFullSet=b?.group>=0&&c.groups[b.group]?.fullSetOwned;
      if(!inFullSet)return delta(0.98,'mid_auction_flash_mortgage_to_win_key_lot');
    }
    if(a.type==='PASS'){
      return delta(-0.95,'do_not_pass_before_mid_auction_mortgage');
    }
    return null;
  }},
  {id:'queueLookahead',name:'Bankruptcy Auction-Queue Lookahead Expert',types:['BID','PASS','BUY'],assess:(c,a)=>{
    if(!c.hasHighPriorityQueuedAuction||c.queueAuctionReserve<=0)return null;
    if(c.view.phase==='auction'&&c.view.auction?.kind!=='building'){
      const t=c.view.auction?.tile;
      const comp=completion(c,t,c.actor);
      const blk=block(c,t);
      if(comp<0.90&&blk<0.80){
        const ceiling=grandmasterAuctionCeiling(c);
        const minBid=auctionMinimum(c.view.auction);
        if(a.type==='PASS'&&minBid>ceiling){
          return delta(0.96,'save_cash_for_upcoming_queued_monopoly_auction');
        }
        if(a.type==='BID'&&a.amount>ceiling){
          return delta(-0.96,'preserve_queue_auction_reserve');
        }
      }
    }
    return null;
  }},
  {id:'hotelTrapExploiter',name:'Hotel Downgrade Trap (`bank.houses < 4` -> `SELL_SET`) Exploiter',types:['BUILD','BUILD_JOIN','SELL','SELL_SET'],assess:(c,a)=>{
    if(build(a)){
      const lv=c.view.assets[a.tile]?.level??0;
      if(lv===4&&c.bank.houses<=16){
        return delta(-0.99,'never_release_4_houses_via_hotel_upgrade');
      }
      if(c.hotelTrapActive&&lv<4){
        return delta(0.96,'lock_bank_houses_below_4_to_trap_rival_hotel');
      }
    }
    if(a.type==='SELL_SET'&&c.view.phase==='debt'){
      return delta(-0.90,'avoid_catastrophic_sell_set_if_mortgage_exists');
    }
    return null;
  }},
  {id:'mechanicsSage',name:'C1009 Station Geometry, Apex Even-Build & Rent-Claim Expiry Sage',types:['ROLL','BUILD','BUILD_JOIN','BUY','BID'],assess:(c,a)=>{
    if(c.view.phase==='roll'&&c.hasPendingRivalRentClaim&&a.type==='ROLL'){
      return delta(0.99,'instant_roll_to_expire_rival_manual_rent_claim');
    }
    if(build(a)&&!c.shouldDeferPreRollBuild){
      if(APEX_TILES.has(a.tile)){
        return delta(0.88,'apex_tile_even_build_higher_rent_for_same_cost');
      }
    }
    if(a.type==='BUY'||a.type==='BID'){
      const t=tileOf(c,a);
      if(t===5||t===19){
        return delta(0.86,'c1009_gambir_and_banyuwangi_card_geometry_hotspot');
      }
    }
    return null;
  }},
  // =========================================================================
  // 4 NEW TRANSCENDENT METAGAME EXPERTS (NUSA V18.0 — Experts 35 to 38)
  // =========================================================================
  {id:'crossPhaseTrade',name:'Cross-Phase Buy-Rescue & Ambush Trade Expert',types:['OFFER','AUCTION'],assess:(c,a)=>{
    if(c.view.phase==='buy'&&c.needsPreBuyTrade){
      if(a.type==='OFFER'){
        const norm=normalizeTrade(c,a);
        if(norm&&norm.netCash>0){
          const oracle=predictPartnerAcceptance(c,norm.raw);
          if(oracle.willAccept)return delta(0.99,'cross_phase_buy_rescue_trade_for_instant_cash');
        }
        return delta(-0.92,'unaccepted_buy_rescue_trade');
      }
      if(a.type==='AUCTION'){
        return delta(-0.90,'avoid_auction_when_cross_phase_trade_rescue_available');
      }
    }
    return null;
  }},
  {id:'collusionInterdictor',name:'Preemptive Rival-Collusion Interdictor Expert (6-Player Table)',types:['OFFER','COUNTER','TRADE_ACCEPT','BUY','BID'],assess:(c,a)=>{
    if(a.type==='BUY'||a.type==='BID'){
      const t=tileOf(c,a);
      if(c.collusionTargetTiles?.has(t))return delta(0.94,'preempt_rival_collusion_bridge_tile');
      return null;
    }
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(oppMono.count>0)return null;
    const seizesCollusionBridge=norm.myTake.some(t=>c.collusionTargetTiles?.has(t));
    if(seizesCollusionBridge&&norm.netCash>=-280){
      const oracle=a.type==='OFFER'?predictPartnerAcceptance(c,norm.raw):{willAccept:true};
      if(oracle.willAccept){
        return delta(0.95,'front_run_rival_to_rival_collusion_monopoly');
      }
    }
    return null;
  }},
  {id:'counterHijacker',name:'Reverse Counter-Offer Hijacking Expert',types:['COUNTER','TRADE_REJECT'],assess:(c,a)=>{
    if(c.view.phase!=='trade')return null;
    if(a.type==='COUNTER'){
      const norm=normalizeTrade(c,a);if(!norm)return null;
      const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
      const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
      if(oppMono.count>0&&myMono.count===0)return delta(-0.99,'never_hijack_into_kingmaking');
      if(myMono.count>0&&oppMono.count===0){
        return delta(0.98,'reverse_counter_hijack_monopoly_on_rival_turn');
      }
      const acquiresChainOrBridge=norm.myTake.some(t=>c.chainTargetTiles?.has(t)||c.collusionTargetTiles?.has(t)||c.steppingStoneTiles?.has(t));
      if(acquiresChainOrBridge&&oppMono.count===0){
        return delta(0.94,'reverse_counter_hijack_strategic_deed');
      }
    }
    return null;
  }},
  {id:'psychProfiler',name:'Psychological Memory & Jail-Card Arbitrage Expert',types:['OFFER','COUNTER','BID'],assess:(c,a)=>{
    if(a.type==='OFFER'||a.type==='COUNTER'){
      const norm=normalizeTrade(c,a);if(!norm)return null;
      const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
      if(oppMono.count>0)return null;
      const prof=c.opponentProfiles?.get(norm.partnerId);
      const usesJailSweetener=c.canGiveJailCardSweetener&&(norm.raw.giveCards||0)>0;
      const matchesDesire=prof&&norm.myGive.some(tid=>{
        const g=BOARD[tid]?.group;
        return g>=0&&(prof.desiredGroups?.[g]||0)>0;
      });
      if(usesJailSweetener&&matchesDesire)return delta(0.95,'psych_desire_plus_zero_cash_jail_card_arbitrage');
      if(usesJailSweetener)return delta(0.91,'jail_card_arbitrage_preserves_house_cash');
      if(matchesDesire)return delta(0.87,'psych_memory_desired_group_bait');
    }
    return null;
  }}
];

export const STRATEGY_EXPERTS=Object.freeze(defs.map(d=>Object.freeze(d)));
export function runExperts(context,action){
  return STRATEGY_EXPERTS.flatMap(x=>{
    const r=x.assess(context,action);
    if(!r||!Number.isFinite(r.signal))return [];
    return [{id:x.id,name:x.name,...r}];
  });
}
