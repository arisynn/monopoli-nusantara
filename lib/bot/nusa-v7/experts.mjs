/** NUSA V11.0 Sovereign Grandmaster Knowledge Bank (22 Deterministic Experts).
 * Includes Asymmetric Monopoly Swap Arbitrage, Flash-Liquidity Build Engine,
 * Counter-KRESNA Nemesis Denial, and 32-House Chokehold Lock.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {rent,redemption,interest} from '../../game.mjs';
import {evaluateTrade} from '../negotiation.mjs';

const clamp=(x,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,x));
const owner=(c,t)=>c.view.assets[t]?.owner;
const actType=a=>a?.type;
const build=a=>['BUILD','BUILD_JOIN'].includes(actType(a));
const tileOf=(c,a)=>a.type==='BUY'?c.view.buy:a.type==='BID'?(c.view.auction?.kind==='building'?c.view.auction?.targets?.[c.actor]:c.view.auction?.tile):a.type==='MORTGAGE_REDEEM'||a.type==='MORTGAGE_KEEP'?c.view.mortgageDecision?.tile:a.tile;
const dollars=(c,a)=>a.type==='BUY'?BOARD[c.view.buy]?.price||0:a.type==='BID'?a.amount||0:build(a)?BOARD[a.tile]?.build||0:a.type==='REDEEM'||a.type==='MORTGAGE_REDEEM'?redemption(tileOf(c,a)):a.type==='MORTGAGE_KEEP'?interest(tileOf(c,a)):0;
const delta=(signal,reason)=>({signal:clamp(signal),reason});
const once=(c,t)=>Number.isInteger(t)&&BOARD[t]?.price>0;

// C1009 Nusantara Color Group Strategic Multipliers:
// 0:Priangan(Brown), 1:Jawa(LightBlue), 2:Sumatra(Pink), 3:Jawa Timur(Orange),
// 4:Nusa Tenggara(Red), 5:Kalimantan(Yellow), 6:Indonesia Timur(Green), 7:Destinasi Ikonik(DarkBlue)
export const GROUP_TIER=[1.10,1.42,1.26,1.65,1.55,1.28,0.88,1.30];
const CARD_MAGNETS=new Set([24,39,11,5,15,25,35]);

export function completion(c,t,who=c.actor){
  const b=BOARD[t];
  if(!b)return 0;
  if(b.type==='station'){
    const ownCount=[5,15,25,35].filter(i=>owner(c,i)===who&&i!==t).length;
    return clamp(0.28+ownCount*0.24,0,1);
  }
  if(b.type==='utility'){
    const ownCount=[12,28].filter(i=>owner(c,i)===who&&i!==t).length;
    return ownCount>=1?0.44:0.14;
  }
  if(b.group<0)return 0;
  const ids=GROUPS[b.group].ids;
  const ownCount=ids.filter(i=>owner(c,i)===who&&i!==t).length;
  const otherCount=ids.filter(i=>owner(c,i)!=null&&owner(c,i)!==who&&i!==t).length;
  if(ownCount===ids.length-1)return 1.0;
  if(otherCount===0&&ownCount>0)return (ownCount/ids.length)*0.78;
  if(otherCount===0)return 0.32;
  return (ownCount/ids.length)*0.24;
}

export function block(c,t){
  const b=BOARD[t];
  if(!b||b.group<0)return 0;
  const g=c.groups[b.group];
  let maxThreat=0;
  for(const o of g.owners){
    const rival=c.view.players[o.id];
    const isKresnaOrLeader=(rival?.botPersona==='kresna')||(c.leader?.id===o.id);
    if(o.count===g.ids.length-1){
      const buildReady=clamp((rival?.cash||0)/Math.max(1,g.ids.length*2*(b.build||1000)),0.48,1.35);
      const nemesisBoost=isKresnaOrLeader?1.32:1.0;
      maxThreat=Math.max(maxThreat,clamp(0.94*buildReady*nemesisBoost,0,1));
    }else if(o.count===1&&g.ids.length===3&&g.unownedCount===1){
      maxThreat=Math.max(maxThreat,isKresnaOrLeader?0.52:0.36);
    }
  }
  return maxThreat;
}

function capPressure(c,cost){
  const effectiveCash=c.self.cash+(c.liquidBuffer||0)*0.52;
  return clamp((effectiveCash-cost-c.reserve)/Math.max(600,c.reserve));
}

export function rentDelta(c,t){
  const a=c.view.assets[t],b=BOARD[t];
  if(!a||!b?.build||a.level>=5)return 0;
  return Math.max(0,b.rents[a.level+1]-rent(c.view,t,7));
}

export function valuation(c,t){
  const p=BOARD[t];
  if(!p)return 0;
  if(p.type==='utility'){
    const otherOwned=[12,28].some(i=>i!==t&&owner(c,i)===c.actor);
    return p.price*(otherOwned?1.02:0.76);
  }
  if(p.type==='station'){
    const ownStations=[5,15,25,35].filter(i=>i!==t&&owner(c,i)===c.actor).length;
    return p.price*(1.14+ownStations*0.38)+(c.visits[t]||0)*560;
  }
  const tier=p.group>=0?(GROUP_TIER[p.group]||1):1;
  const magnet=CARD_MAGNETS.has(t)?1.12:1.0;
  const synergy=completion(c,t,c.actor);
  const denial=block(c,t);
  const visits=(c.visits[t]||0)+0.60*(c.immediateVisits?.[t]||0);
  const threeHousePotential=p.rents?.[3]?p.rents[3]*0.12*tier:190;
  return p.price*tier*magnet*(0.88+synergy*1.22+denial*0.72)+visits*threeHousePotential;
}

/** Exact Game-Theoretic Auction Ceiling for NUSA V11.0. */
export function grandmasterAuctionCeiling(c){
  const auction=c.view.auction;
  if(!auction)return 0;
  if(auction.kind==='building'){
    const t=auction.targets?.[c.actor];
    if(!Number.isInteger(t))return 0;
    const bCost=BOARD[t]?.build||1000;
    const gain=rentDelta(c,t)*((c.visits[t]||0)*12.5+(c.immediateVisits?.[t]||0)*10+2.8);
    return Math.min(Math.max(0,c.self.cash-c.reserve*0.38),Math.round(bCost+gain*0.72));
  }
  const t=auction.tile,p=BOARD[t];
  if(!p)return 0;
  const comp=completion(c,t,c.actor);
  const blk=block(c,t);
  const safeCash=Math.max(0,c.self.cash-c.reserve*0.30);

  if(comp>=0.95){
    return Math.min(Math.max(0,c.self.cash-250),Math.round(p.price*2.55+1400));
  }
  if(blk>=0.70){
    const dangerousRivals=c.groups[p.group]?.owners.filter(o=>o.count===GROUPS[p.group].ids.length-1).map(o=>c.view.players[o.id]?.cash||0)||[0];
    const maxRivalCash=Math.max(0,...dangerousRivals);
    const lockBid=maxRivalCash+10;
    if(lockBid<=p.price*1.80&&lockBid<=safeCash)return lockBid;
    return Math.min(safeCash,Math.round(p.price*1.48));
  }
  if(comp>=0.45){
    return Math.min(safeCash,Math.round(p.price*1.18));
  }
  if([1,3,4].includes(p.group)||p.type==='station'){
    return Math.min(safeCash,Math.round(p.price*1.06));
  }
  return Math.min(safeCash,Math.round(p.price*(p.type==='utility'?0.76:0.96)));
}

export function normalizeTrade(c,a){
  if(!['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(a.type))return null;
  const raw=(a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT')?c.view.trade:a.trade;
  if(!raw)return null;
  const isIncoming=a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT';
  const partnerId=isIncoming?raw.from:raw.to;
  const proposerId=isIncoming?raw.from:c.actor;
  const myGive=isIncoming?(raw.take||[]):(raw.give||[]);
  const myTake=isIncoming?(raw.give||[]):(raw.take||[]);
  const cashReceived=isIncoming?(raw.giveCash||0):(raw.takeCash||0);
  const cashPaid=isIncoming?(raw.takeCash||0):(raw.giveCash||0);
  const cardsReceived=isIncoming?(raw.giveCards||0):(raw.takeCards||0);
  const cardsPaid=isIncoming?(raw.takeCards||0):(raw.giveCards||0);
  const feePaid=myTake.reduce((n,id)=>n+(c.view.assets[id]?.mortgaged?interest(id):0),0);
  const feePartner=myGive.reduce((n,id)=>n+(c.view.assets[id]?.mortgaged?interest(id):0),0);
  return {
    raw,
    isIncoming,
    isReject:a.type==='TRADE_REJECT',
    proposerId,
    partnerId,
    myGive,
    myTake,
    netCash:cashReceived-cashPaid-feePaid,
    partnerNetCash:cashPaid-cashReceived-feePartner,
    netCards:cardsReceived-cardsPaid
  };
}

export function completesGroupPostTrade(c,playerId,acquired,surrendered){
  const acqSet=new Set(acquired),surSet=new Set(surrendered);
  let count=0,bestTier=0,buildCost3=0,expectedRent3=0;
  for(let gIdx=0;gIdx<GROUPS.length;gIdx++){
    const ids=GROUPS[gIdx].ids;
    const hadBefore=ids.every(i=>owner(c,i)===playerId);
    const hasAfter=ids.every(i=>(owner(c,i)===playerId&&!surSet.has(i))||acqSet.has(i));
    if(hasAfter&&!hadBefore){
      count++;
      const tier=GROUP_TIER[gIdx]||1;
      bestTier=Math.max(bestTier,tier);
      buildCost3+=ids.length*3*(BOARD[ids[0]]?.build||1000);
      expectedRent3+=ids.reduce((n,i)=>n+(BOARD[i].rents?.[3]||500)*((c.visits[i]||0.05)+0.5*(c.immediateVisits?.[i]||0)),0)*tier;
    }
  }
  return {count,bestTier,buildCost3,expectedRent3};
}

export function evaluateTradeForActor(c,norm){
  if(!norm)return 0;
  const partner=c.view.players[norm.partnerId];
  const isPartnerNemesis=partner?.botPersona==='kresna'||c.leader?.id===norm.partnerId;
  const myGain=norm.myTake.reduce((n,t)=>n+valuation(c,t),0)-norm.myGive.reduce((n,t)=>n+valuation(c,t),0);
  const totalNet=myGain+norm.netCash+norm.netCards*360;

  const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
  const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);

  if(oppMono.count>0&&myMono.count===0){
    return norm.isReject?1.0:-1.0;
  }
  if(oppMono.count>0&&myMono.count>0){
    const myCashAfter=c.self.cash+norm.netCash+(c.liquidBuffer||0)*0.5;
    const oppCashAfter=(partner?.cash||0)+norm.partnerNetCash;
    const myReadiness=clamp(myCashAfter/Math.max(1,myMono.buildCost3),0.15,1.35)*myMono.bestTier;
    const oppReadiness=clamp(oppCashAfter/Math.max(1,oppMono.buildCost3),0.15,1.35)*oppMono.bestTier*(isPartnerNemesis?1.18:1.0);
    if(oppReadiness>myReadiness*0.90){
      return norm.isReject?0.96:-0.98;
    }
    const swapAdvantage=clamp((myReadiness-oppReadiness)*1.2+0.55,-1,1);
    return norm.isReject?clamp(-swapAdvantage,-1,1):swapAdvantage;
  }

  if(!norm.isIncoming){
    try{
      const partnerEval=evaluateTrade(c.view,norm.partnerId,norm.raw,c.actor);
      if(partnerEval.net<-2){
        return -0.88;
      }
    }catch{
      return -0.95;
    }
    const fundsBuild=c.needsBuildCapital&&norm.netCash>=700&&norm.myTake.length===0;
    if(myMono.count>0)return clamp(0.92+0.08*myMono.bestTier,-1,1);
    if(fundsBuild)return 0.82;
  }

  const leaderPenalty=(c.live>=3&&isPartnerNemesis&&oppMono.count>0)?0.75:0;
  const monoBonus=myMono.count>0?0.72*myMono.bestTier:0;
  const rawSignal=clamp((totalNet/Math.max(1200,c.salary))+monoBonus-leaderPenalty,-1,1);
  return norm.isReject?clamp(-rawSignal,-1,1):rawSignal;
}

const defs=[
  {id:'portfolio',name:'Portfolio Expert',types:['BUY','BID'],assess:(c,a)=>{
    if(a.type==='BID')return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    const v=valuation(c,t),cost=dollars(c,a);
    return delta((v-cost)/Math.max(v,500),'marginal_portfolio_value');
  }},
  {id:'completion',name:'Monopoly Completion',types:['BUY','BID','AUCTION'],assess:(c,a)=>{
    if(a.type==='BID')return null;
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    const comp=completion(c,t,c.actor);
    if(a.type==='AUCTION')return delta(comp>=0.35?-0.96:-0.45,'never_auction_synergy_deed');
    return delta(Math.max(0.38,comp),'set_completion');
  }},
  {id:'auction',name:'Ascending Clock Auction Expert',types:['BID','PASS'],assess:(c,a)=>{
    if(c.view.phase!=='auction')return null;
    const ceiling=grandmasterAuctionCeiling(c);
    const minBid=Math.max(100,(c.view.auction?.amount||0)+10);
    if(a.type==='PASS'){
      return delta(minBid<=ceiling?-1.0:1.0,'ascending_clock_pass_gate');
    }
    if(a.amount>ceiling){
      return delta(-1.0,'veto_overpriced_bid');
    }
    const overbidSteps=Math.max(0,a.amount-minBid)/10;
    const incrementScore=clamp(1.0-overbidSteps*0.09,0.10,1.0);
    return delta(incrementScore,'minimum_increment_surplus_maximization');
  }},
  {id:'blocking',name:'Blocking & Nemesis Denial Expert',types:['BUY','AUCTION'],assess:(c,a)=>{
    const t=a.type==='AUCTION'?c.view.buy:tileOf(c,a);
    if(!once(c,t))return null;
    const b=block(c,t);
    if(a.type==='AUCTION')return delta(b>0.28?-0.96:0,'never_auction_blocker_tile');
    return delta(b,'denial_value');
  }},
  {id:'development',name:'Development Expert',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(!build(a))return null;
    const t=a.tile,rd=rentDelta(c,t);
    const traffic=(c.visits[t]||0)*1.20+(c.immediateVisits?.[t]||0)*2.75;
    const tier=BOARD[t]?.group>=0?(GROUP_TIER[BOARD[t].group]||1):1;
    return delta((rd*traffic*tier)/Math.max(175,dollars(c,a)),'marginal_house_rent');
  }},
  {id:'scarcity',name:'Housing Scarcity',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(!build(a))return null;
    const lv=c.view.assets[a.tile]?.level??0;
    const oppThreat=c.rivalMonopolies>0||c.sariPresent||c.groups.some(g=>g.owners.some(o=>o.count>=g.ids.length-1));
    const houseThreshold=c.sariPresent?18:16;
    if(c.bank.houses<=houseThreshold&&oppThreat){
      const pressure=clamp((houseThreshold+2-c.bank.houses)/14,0.30,1);
      if(lv===4)return delta(-1.0,'chokehold_hotel_veto_keep_4_houses');
      const cheapBoost=(BOARD[a.tile]?.build||1000)<=1000?1.38:1.0;
      if(lv===3||lv===2)return delta(pressure*cheapBoost,'physical_house_denial_lock');
      return delta(pressure*0.70*cheapBoost,'scarcity_house_accumulation');
    }
    return delta(lv<4?0.20:-0.05,'normal_housing_stock');
  }},
  {id:'cashflow',name:'Cashflow Expert',types:['BUILD','BUILD_JOIN','BUY'],assess:(c,a)=>{
    if(!(build(a)||a.type==='BUY'))return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    const opportunity=build(a)?rentDelta(c,t):(BOARD[t].rents?.[0]||120);
    const income=opportunity*((c.visits[t]||0)+(c.immediateVisits?.[t]||0)*1.6);
    return delta(income/Math.max(210,dollars(c,a)),'expected_rent_cashflow');
  }},
  {id:'liquidity',name:'Liquidity Expert',types:['BUY','BUILD','BUILD_JOIN','REDEEM','MORTGAGE_REDEEM'],assess:(c,a)=>{
    if(!(build(a)||a.type==='BUY'||a.type==='REDEEM'||a.type==='MORTGAGE_REDEEM'))return null;
    const cost=dollars(c,a);
    const remaining=c.self.cash-cost+(c.liquidBuffer||0)*0.48;
    const shortage=c.reserve-remaining;
    return delta(shortage>0?-shortage/Math.max(300,c.reserve):0.24,'post_spend_liquidity');
  }},
  {id:'mortgage',name:'Mortgage & Build-Finance Expert',types:['MORTGAGE','REDEEM','SELL','SELL_SET'],assess:(c,a)=>{
    if(!['MORTGAGE','REDEEM','SELL','SELL_SET'].includes(a.type))return null;
    const t=a.tile,b=BOARD[t];if(!b)return null;
    const net=(c.visits[t]||0)*rent(c.view,t,7);
    const group=b.group;
    const fullSet=group>=0&&c.groups[group].fullSetOwned;
    if(a.type==='REDEEM'){
      return delta((fullSet?0.98:0.25)+net/Math.max(200,c.salary),'redeem_monopoly_unlock');
    }
    if(a.type==='MORTGAGE'){
      if(fullSet)return delta(-0.98,'never_mortgage_active_monopoly');
      if(c.needsBuildCapital&&c.self.cash<c.reserve+1800){
        const isUtilityOrIsolated=b.type==='utility'||(group>=0&&c.groups[group].own===1);
        return delta(isUtilityOrIsolated?0.88:0.68,'mortgage_isolated_deed_to_fund_houses');
      }
      return delta(-0.40-net/Math.max(200,c.salary),'preserve_unmortgaged_income');
    }
    return delta(-0.90,'preserve_standing_houses');
  }},
  {id:'probability',name:'Probability Expert',types:['BUILD','BUILD_JOIN','BUY'],assess:(c,a)=>{
    if(!(build(a)||a.type==='BUY'))return null;
    const t=tileOf(c,a);if(!once(c,t))return null;
    const hot=((c.visits[t]||0)*1.28+(c.immediateVisits?.[t]||0)*2.25)*(CARD_MAGNETS.has(t)?1.18:1.0);
    return delta(hot,'public_landing_probability');
  }},
  {id:'jail',name:'Jail Expert',types:['JAIL_PAY','JAIL_CARD','ROLL'],assess:(c,a)=>{
    if(c.view.phase!=='jail'||!['JAIL_PAY','JAIL_CARD','ROLL'].includes(a.type))return null;
    const earlyExpansion=c.unowned.length>=6&&c.nearLoss<380&&c.maxThreat<1800;
    const lateShelter=c.unowned.length<=4&&(c.nearLoss>=360||c.maxThreat>=1600||c.rivalMonopolies>=1);
    if(a.type==='ROLL'){
      if(lateShelter)return delta(0.94,'late_game_jail_shelter_collect_rent');
      if(earlyExpansion)return delta(-0.58,'early_game_avoid_staying_in_jail');
      return delta(0.18,'neutral_jail_roll');
    }
    const cost=a.type==='JAIL_PAY'?500:180;
    if(earlyExpansion&&c.self.cash-cost>c.reserve)return delta(a.type==='JAIL_CARD'?0.90:0.76,'early_game_rapid_expansion_exit');
    if(lateShelter)return delta(-0.90,'late_game_never_pay_to_leave_safety');
    return delta((c.unowned.length*36-c.nearLoss*1.35-cost)/Math.max(500,c.salary),'jail_exit_opportunity');
  }},
  {id:'bankruptcy',name:'Bankruptcy Defense',types:['MORTGAGE','SELL','SELL_SET','BANKRUPT'],assess:(c,a)=>{
    if(c.view.phase!=='debt'||!['MORTGAGE','SELL','SELL_SET','BANKRUPT'].includes(a.type))return null;
    if(a.type==='BANKRUPT')return delta(-1.0,'never_surrender_if_resolvable');
    if(a.type==='MORTGAGE'){
      const b=BOARD[a.tile];
      const nonMono=b?.group<0||!c.groups[b.group]?.fullSetOwned;
      return delta(nonMono?0.88:0.48,'debt_rescue_mortgage_first');
    }
    return delta(a.type==='SELL'?0.22:-0.32,'debt_rescue_gradual_sale');
  }},
  {id:'negotiation',name:'Negotiation Expert',types:['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    return delta(evaluateTradeForActor(c,norm),'relative_trade_advantage');
  }},
  {id:'opponent',name:'Opponent & Nemesis Analyst',types:['BUY','AUCTION','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{
    if(a.type==='BUY')return delta(block(c,tileOf(c,a))*0.90,'rival_monopoly_threat');
    if(a.type==='AUCTION')return delta(-block(c,c.view.buy)*0.94,'block_rival_by_buying');
    const norm=normalizeTrade(c,a);if(!norm)return null;
    return delta(evaluateTradeForActor(c,norm)*0.94,'opponent_kingmaking_guard');
  }},
  {id:'endgame',name:'Endgame Expert',types:['BUILD','BUILD_JOIN','REDEEM','MORTGAGE'],assess:(c,a)=>{
    if(c.live>3||!['BUILD','BUILD_JOIN','REDEEM','MORTGAGE'].includes(a.type))return null;
    if(a.type==='MORTGAGE')return delta(c.needsBuildCapital?0.55:-0.45,'endgame_leverage_or_hold');
    if(build(a)){
      const ambush=(c.immediateVisits?.[a.tile]||0)>0.07?0.50:0;
      return delta(capPressure(c,dollars(c,a))*0.55+ambush,'endgame_killshot_build');
    }
    return delta(0.42,'endgame_redeem_strength');
  }},
  {id:'competitive',name:'Competitive Strategy',types:['BUILD','BUILD_JOIN','BUY','REDEEM'],assess:(c,a)=>{
    if(!(build(a)||a.type==='BUY'||a.type==='REDEEM'))return null;
    const factor=c.stage==='acquisition'?(a.type==='BUY'?0.48:-0.05):c.stage==='development'?(build(a)||a.type==='REDEEM'?0.52:0.15):c.stage==='contested'?(build(a)?0.48:0.22):(capPressure(c,dollars(c,a))*0.38);
    return delta(factor,'game_stage_priority');
  }},
  {id:'buildingWar',name:'C1009 Building War Expert',types:['BUILD_JOIN','BUILD_DECLINE','BID'],assess:(c,a)=>{
    if(a.type==='BUILD_JOIN'){
      const lv=c.view.assets[a.tile]?.level??0;
      if(lv===4&&c.bank.houses<=15&&(c.rivalMonopolies>0||c.sariPresent))return delta(-0.96,'decline_hotel_in_house_shortage');
      return delta(capPressure(c,BOARD[a.tile]?.build||1000)>-0.22?0.92:-0.3,'join_contested_building_allocation');
    }
    if(a.type==='BUILD_DECLINE'){
      return delta(c.self.cash<c.reserve+380?0.5:-0.85,'contest_scarce_buildings');
    }
    if(a.type==='BID'&&c.view.auction?.kind==='building'){
      const ceiling=grandmasterAuctionCeiling(c);
      const minBid=Math.max(100,(c.view.auction?.amount||0)+10);
      if(a.amount>ceiling)return delta(-1.0,'building_war_overbid_veto');
      return delta(a.amount===minBid?0.96:0.4,'building_war_minimum_increment');
    }
    return null;
  }},
  {id:'auctionTrap',name:'Opportunistic Buy & Price-Drive Expert',types:['BUY','AUCTION','BID'],assess:(c,a)=>{
    if(c.view.phase==='buy'&&['BUY','AUCTION'].includes(a.type)){
      const t=c.view.buy,b=BOARD[t];if(!b)return null;
      const maxRivalCash=Math.max(0,...c.rivals.map(r=>r.cash));
      const guaranteedDiscount=maxRivalCash<b.price*0.64&&c.self.cash>b.price*0.75;
      if(a.type==='AUCTION')return delta(guaranteedDiscount?0.86:-0.94,'strict_buy_preserve_net_worth');
      return delta(guaranteedDiscount?-0.45:0.94,'direct_buy_captures_asset_equity');
    }
    if(a.type==='BID'&&c.view.auction?.kind!=='building'){
      const ceiling=grandmasterAuctionCeiling(c);
      const minBid=Math.max(100,(c.view.auction?.amount||0)+10);
      if(a.amount>ceiling)return delta(-1.0,'never_exceed_grandmaster_ceiling');
      if(a.amount===minBid)return delta(0.96,'optimal_ascending_increment');
      return delta(clamp(0.4-(a.amount-minBid)/400,-0.8,0.4),'penalize_unnecessary_jump_bid');
    }
    return null;
  }},
  {id:'tempoRace',name:'3-House Sweet-Spot Velocity Expert',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{
    if(!build(a))return null;
    const t=a.tile,b=BOARD[t],lv=c.view.assets[t]?.level??0;
    if(!b||b.group<0)return null;
    const tier=GROUP_TIER[b.group]||1;
    const sweetSpot=lv===2?1.0:lv===1?0.85:lv===0?0.65:lv===3?0.38:-0.25;
    const ambush=(c.immediateVisits?.[t]||0)*2.8;
    return delta((sweetSpot*tier+ambush)*0.82,'three_house_sweet_spot_velocity');
  }},
  {id:'mortgageShield',name:'Mortgage Transfer Arbitrage Expert',types:['MORTGAGE_REDEEM','MORTGAGE_KEEP'],assess:(c,a)=>{
    if(c.view.phase!=='mortgage')return null;
    const t=c.view.mortgageDecision?.tile;if(!Number.isInteger(t))return null;
    const cost=redemption(t),group=BOARD[t]?.group??-1;
    const highValue=group>=0&&(c.groups[group]?.fullSetOwned||[1,3,4].includes(group));
    const affordable=c.self.cash-cost>=c.reserve*0.72;
    if(a.type==='MORTGAGE_REDEEM')return delta(affordable?(highValue?0.92:0.68):-0.6,'avoid_double_10pct_interest_fee');
    return delta(affordable?-0.55:0.72,'defer_redemption_when_illiquid');
  }},
  {id:'asymmetricSwap',name:'Asymmetric Monopoly Swap & Counter Expert',types:['OFFER','COUNTER','TRADE_ACCEPT'],assess:(c,a)=>{
    const norm=normalizeTrade(c,a);if(!norm)return null;
    const myMono=completesGroupPostTrade(c,c.actor,norm.myTake,norm.myGive);
    const oppMono=completesGroupPostTrade(c,norm.partnerId,norm.myGive,norm.myTake);
    if(myMono.count>0&&oppMono.count===0)return delta(0.98,'unilateral_monopoly_acquisition');
    if(myMono.count>0&&oppMono.count>0){
      const ratio=(myMono.expectedRent3+1)/(oppMono.expectedRent3+1);
      return delta(ratio>=1.12?0.92:-0.88,'asymmetric_monopoly_swap_velocity');
    }
    return null;
  }},
  {id:'flashLiquidity',name:'Flash Unmortgage & Build Unlock Expert',types:['REDEEM','MORTGAGE'],assess:(c,a)=>{
    const t=a.tile,b=BOARD[t];if(!b)return null;
    if(a.type==='REDEEM'&&b.group>=0&&c.groups[b.group]?.fullSetOwned){
      return delta(0.98,'flash_redeem_complete_monopoly_to_build');
    }
    if(a.type==='MORTGAGE'&&c.needsBuildCapital&&(b.group<0||!c.groups[b.group]?.fullSetOwned)){
      const hasLockedMono=c.groups.some(g=>g.fullSetOwned&&g.mortgagedCount>0&&c.self.cash<g.redeemCost+c.reserve);
      const hasUnderbuiltMono=c.groups.some(g=>g.complete&&g.levelMin<3&&c.self.cash<g.houseCost*2+c.reserve);
      if(hasLockedMono||hasUnderbuiltMono)return delta(0.92,'flash_mortgage_collateral_for_monopoly_houses');
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
