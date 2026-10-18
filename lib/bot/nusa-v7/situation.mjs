/** NUSA V23.0 "Omniscient Cortex" — Situation & Hypergraph Telemetry. */
import {BOARD,GROUPS,AUCTION_RULES,auctionMinimum} from '../../content.mjs';
import {observation} from '../mind.mjs';
import {landingForecast} from '../probability.mjs';
import {stock,rent,redemption,canTrade} from '../../game.mjs';
import {economyRules,strengthShares} from '../economy.mjs';
import {analyzeState} from '../analysis.mjs';
import {analyzeBoardGraph,GROUP_TIER} from './board-graph.mjs';
import {analyzeTemporal} from './temporal.mjs';

export const APEX_TILES=new Set(GROUPS.map(g=>g.ids[g.ids.length-1]));
export const STATION_GEOMETRY_MULT=Object.freeze({5:1.26,15:1.16,25:1.16,35:0.98});

export function getAuctionQuantum(view,actor=view?.auction?.bidder){
  return {step:AUCTION_RULES.increment,minBid:auctionMinimum(view?.auction)};
}

export function analyzePublicCardCycles(view){
  const held=new Set((view.players||[]).flatMap(p=>p.cards||[]).map(c=>c.deck+':'+c.idx));
  const recentChance=[];
  const recentCommunity=[];
  const seenChance=new Set();
  const seenCommunity=new Set();

  for(const ev of (view.log||[])){
    const c=ev?.card||(ev?.finance?.[0]?.card);
    if(!c||!Number.isInteger(c.idx))continue;
    if(c.deck==='chance'&&!held.has('chance:'+c.idx)&&!seenChance.has(c.idx)){
      seenChance.add(c.idx);
      recentChance.push(c.idx);
    }else if(c.deck==='community'&&!held.has('community:'+c.idx)&&!seenCommunity.has(c.idx)){
      seenCommunity.add(c.idx);
      recentCommunity.push(c.idx);
    }
  }

  const bottomChance=new Set(recentChance.slice(0,12));
  const bottomCommunity=new Set(recentCommunity.slice(0,12));
  const chanceRepairSafe=bottomChance.has(11);
  const commRepairSafe=bottomCommunity.has(13);
  const repairSafe=chanceRepairSafe&&commRepairSafe;
  const repairImminent=(!chanceRepairSafe&&recentChance.length>=9)||(!commRepairSafe&&recentCommunity.length>=9);

  const activeMagnetTiles=new Set();
  if(!bottomChance.has(0))activeMagnetTiles.add(39);
  if(!bottomChance.has(2))activeMagnetTiles.add(24);
  if(!bottomChance.has(3))activeMagnetTiles.add(11);
  if(!bottomChance.has(9))activeMagnetTiles.add(19);
  if(!bottomChance.has(13))activeMagnetTiles.add(5);
  if(!bottomChance.has(4)||!bottomChance.has(5)){
    activeMagnetTiles.add(5);
    activeMagnetTiles.add(15);
    activeMagnetTiles.add(25);
  }

  return Object.freeze({
    repairSafe,
    repairImminent,
    activeMagnetTiles,
    recentChanceCount:recentChance.length,
    recentCommunityCount:recentCommunity.length
  });
}

export function situationOf(state,actor,plan,decisionContext){
  const compute=()=>computeSituation(state,actor,plan,decisionContext);
  return decisionContext?decisionContext.memo(state,'nusa-situation',actor+':'+state.version,compute):compute();
}

function computeSituation(state,actor,plan,decisionContext){
  const view=observation(state,actor),self=view.players[actor];
  if(!self||self.out)throw Error('NUSA V23.0 actor inactive');
  const rivals=view.players.filter(p=>p.id!==actor&&!p.out);
  const owned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===actor);
  const unowned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner==null);
  const bank=stock(view);
  const cardCycle=analyzePublicCardCycles(view);
  const {step:auctionStep,minBid:auctionMinBid}=getAuctionQuantum(view,actor);

  const rawOppMem=view.botMemory?.opponents||{};
  const opponentProfiles=new Map();
  for(const p of rivals){
    const rec=rawOppMem[p.id]||{};
    const obs=rec.observations||0;
    const conf=obs/(obs+6);
    const aggression=1+((rec.aggression||1)-1)*conf;
    const desiredGroups=rec.groups||{};
    const tradeAccepted=rec.tradeAccepted||0;
    const tradeRejected=rec.tradeRejected||0;
    const receptiveness=(tradeAccepted+2)/(tradeAccepted+tradeRejected+4);
    opponentProfiles.set(p.id,{
      id:p.id,
      aggression,
      confidence:conf,
      desiredGroups,
      receptiveness,
      isHotBidder:aggression>=1.18&&obs>=2
    });
  }

  // Build Omniscient Board & Player Hypergraph
  let boardGraph=analyzeBoardGraph(view,actor,opponentProfiles);

  const groups=GROUPS.map((g,i)=>({
    id:i,
    ids:g.ids,
    apexTile:g.ids[g.ids.length-1],
    tier:GROUP_TIER[i]||1,
    own:g.ids.filter(t=>view.assets[t]?.owner===actor).length,
    unownedCount:g.ids.filter(t=>view.assets[t]?.owner==null).length,
    owners:rivals.map(p=>({
      id:p.id,
      persona:p.botPersona||'human',
      cash:p.cash,
      count:g.ids.filter(t=>view.assets[t]?.owner===p.id).length
    })),
    complete:g.ids.every(t=>view.assets[t]?.owner===actor&&!view.assets[t]?.mortgaged),
    mortgagedCount:g.ids.filter(t=>view.assets[t]?.owner===actor&&view.assets[t]?.mortgaged).length,
    fullSetOwned:g.ids.every(t=>view.assets[t]?.owner===actor),
    levelMin:Math.min(...g.ids.map(t=>view.assets[t]?.level||0)),
    levelMax:Math.max(...g.ids.map(t=>view.assets[t]?.level||0)),
    redeemCost:g.ids.filter(t=>view.assets[t]?.owner===actor&&view.assets[t]?.mortgaged).reduce((n,t)=>n+redemption(t),0),
    houseCost:BOARD[g.ids[0]]?.build||1000,
    ambushIntensity:boardGraph.corridorRadar.groupAmbushIntensity[i]||0
  }));

  const cloakedMonopolyGroups=new Set(
    groups.filter(g=>g.own===g.ids.length-1&&g.unownedCount===0&&g.mortgagedCount>=1).map(g=>g.id)
  );

  const splitThreeWayGroups=groups
    .filter(g=>g.ids.length===3&&g.unownedCount===0&&g.own===1&&g.owners.filter(o=>o.count===1).length===2)
    .sort((a,b)=>b.tier-a.tier);

  const chainTargetTiles=new Set();
  for(const g of splitThreeWayGroups){
    for(const tid of g.ids){
      if(view.assets[tid]?.owner!==actor&&(view.assets[tid]?.level||0)===0){
        chainTargetTiles.add(tid);
      }
    }
  }

  const doubleSweepGroups=[];
  for(const g of groups){
    if(g.ids.length===3&&g.own===1&&g.unownedCount===0&&g.levelMax===0){
      const pairHolder=g.owners.find(o=>o.count===2);
      if(pairHolder){
        const missingPair=g.ids.filter(tid=>view.assets[tid]?.owner===pairHolder.id&&(view.assets[tid]?.level||0)===0);
        if(missingPair.length===2){
          doubleSweepGroups.push({
            groupId:g.id,
            tier:g.tier,
            houseCost:g.houseCost,
            partnerId:pairHolder.id,
            missingPair
          });
        }
      }
    }
  }
  doubleSweepGroups.sort((a,b)=>b.tier-a.tier);

  const collusionTargetTiles=boardGraph.thirdPartyInterceptionTiles;
  const steppingStoneTiles=boardGraph.brokerTargetTiles;
  const contestedAnchorTiles=boardGraph.poisonPillTiles;

  let visits=Array(40).fill(0),immediateVisits=Array(40).fill(0),ownVisits=Array(40).fill(0);
  const rivalForecasts1=new Map();
  for(const p of rivals){
    const f1=landingForecast(view,p.id,1);
    const f2=landingForecast(view,p.id,2);
    rivalForecasts1.set(p.id,f1);
    for(let i=0;i<40;i++){
      immediateVisits[i]+=(f1.visits[i]||0);
      visits[i]+=(f2.visits[i]||0)*0.60+(f1.visits[i]||0)*0.40;
    }
  }
  ownVisits=landingForecast(view,actor,1).visits;

  const threat=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner!=null&&view.assets[t.id]?.owner!==actor&&!view.assets[t.id]?.mortgaged);
  const nearLoss=threat.reduce((n,t)=>n+(ownVisits[t.id]||0)*rent(view,t.id,7),0);
  const expectedIncome=owned.filter(t=>!view.assets[t.id].mortgaged).reduce((n,t)=>n+visits[t.id]*rent(view,t.id,7),0);
  const maxThreat=Math.max(0,...threat.filter(t=>(ownVisits[t.id]||0)>0.015).map(t=>rent(view,t.id,7)));
  const rules=economyRules(view);

  const isolatedMortgageable=owned
    .filter(t=>!view.assets[t.id]?.mortgaged&&(t.group<0||!groups[t.group].fullSetOwned)&&(view.assets[t.id]?.level||0)===0)
    .sort((a,b)=>{
      const rank=t=>t.type==='utility'?0:t.type==='city'?(groups[t.group]?.own===1?1:2):3;
      return rank(a)-rank(b)||a.price-b.price;
    });
  const liquidBuffer=isolatedMortgageable.reduce((n,t)=>n+(t.mortgage||0),0);
  const effectiveTradeCash=self.cash+liquidBuffer;
  const canUsePovertyCloak=liquidBuffer>=1000;

  const ownHotels=owned.filter(t=>view.assets[t.id]?.level===5).length;
  const rivalHasHotel=rivals.some(p=>BOARD.some(t=>t.price&&view.assets[t.id]?.owner===p.id&&view.assets[t.id]?.level===5));
  const hotelTrapActive=rivalHasHotel&&bank.houses>=1&&bank.houses<=8;

  const hotspotReserve=Math.min(2200,Math.round(boardGraph.corridorRadar.unownedStrategicAhead*1.75));

  const queuedAuctionTiles=(view.queue||[])
    .filter(q=>q?.kind==='auction'&&Number.isInteger(q.tile))
    .map(q=>q.tile);

  let queueAuctionReserve=0;
  let hasHighPriorityQueuedAuction=false;
  if(queuedAuctionTiles.length>0){
    const currentAuctionTile=view.phase==='auction'?view.auction?.tile:null;
    const curGroup=Number.isInteger(currentAuctionTile)?BOARD[currentAuctionTile]?.group:-1;
    const curCompletes=curGroup>=0&&groups[curGroup]?.own===groups[curGroup]?.ids.length-1;

    for(const qTile of queuedAuctionTiles){
      const qb=BOARD[qTile];
      if(!qb?.price)continue;
      const qg=qb.group>=0?groups[qb.group]:null;
      const qCompletes=qg&&qg.own===qg.ids.length-1;
      const qBlocks=qg&&qg.owners.some(o=>o.count===qg.ids.length-1);
      if(qCompletes||qBlocks||steppingStoneTiles.has(qTile)){
        hasHighPriorityQueuedAuction=true;
        if(!curCompletes){
          queueAuctionReserve=Math.max(queueAuctionReserve,Math.min(self.cash*0.55,Math.round(qb.price*(qCompletes?1.25:1.05))));
        }
      }
    }
  }

  const killshotTargets=rivals.map(p=>{
    const pDeeds=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===p.id);
    const pLiquid=p.cash+pDeeds.reduce((acc,t)=>acc+(view.assets[t.id]?.mortgaged?0:t.mortgage)+(t.build||0)*(view.assets[t.id]?.level||0)*0.5,0);
    const f1=rivalForecasts1.get(p.id);
    const riskExposure=owned.filter(t=>!view.assets[t.id]?.mortgaged).reduce((acc,t)=>acc+((f1?.visits[t.id]||0)*rent(view,t.id,7)),0);
    return {
      id:p.id,
      cash:p.cash,
      liquid:pLiquid,
      deedCount:pDeeds.length,
      riskExposure,
      vulnerable:p.cash<1800||pLiquid<3500,
      dying:pDeeds.length>=2&&(pLiquid<950||riskExposure>pLiquid*0.75)
    };
  });

  const dyingRivals=killshotTargets.filter(k=>k.dying);
  const vultureReserve=dyingRivals.length>0?Math.min(1800,Math.round(self.cash*0.22)):0;

  const tileKillshot=Array(40).fill(0);
  for(const t of owned){
    const a=view.assets[t.id];
    if(t.type!=='city'||!a||a.level>=5)continue;
    const nextRent=t.rents?.[a.level+1]||0;
    let kScore=0;
    for(const p of killshotTargets){
      const hitProb=rivalForecasts1.get(p.id)?.visits[t.id]||0;
      if(hitProb<=0.01)continue;
      const bountyBoost=1+Math.min(0.8,p.deedCount*0.12);
      if(nextRent>p.liquid)kScore+=hitProb*5.0*bountyBoost;
      else if(nextRent>p.cash)kScore+=hitProb*2.4*bountyBoost;
    }
    tileKillshot[t.id]=Math.min(1,kScore);
  }

  // Dynamic Spatial-Temporal Reserve
  const repairMod=cardCycle.repairSafe?0.90:cardCycle.repairImminent?1.12:1.0;
  const hotelSelfGuard=(ownHotels>0&&bank.houses<=5)?1.15:1.0;
  const spatialFactor=boardGraph.corridorRadar.spatialDangerFactor;
  const rawReserve=Math.max(
    rules.floor||0,
    (nearLoss*0.78+maxThreat*0.10-liquidBuffer*0.70-expectedIncome*0.20)*repairMod*hotelSelfGuard*spatialFactor
  );
  const reserve=Math.max(rules.floor||0,Math.min(self.cash*0.35,rawReserve));
  const trueReserve=Math.max(rules.floor||0,(nearLoss*0.70+maxThreat*0.08)*repairMod*hotelSelfGuard*spatialFactor);

  const hasPendingRivalRentClaim=(view.rentClaims||[]).some(c=>c.from===actor&&c.turnSerial<view.turnSerial);
  const shouldDeferPreRollBuild=view.phase==='roll'&&view.turn===actor&&(
    hasPendingRivalRentClaim||((view.doubles||0)===0&&bank.houses>4&&!hotelTrapActive)
  );

  const earlyCashSinkTiles=new Set();
  if(unowned.length>=7){
    for(const t of unowned){
      if(steppingStoneTiles.has(t.id)||contestedAnchorTiles.has(t.id))continue;
      if(t.group===6){
        const g6=groups[6];
        const anyRivalOwns=g6.owners.some(o=>o.count>=1);
        if(g6.own===0&&!anyRivalOwns&&(self.cash-t.price<trueReserve+hotspotReserve+1800)){
          earlyCashSinkTiles.add(t.id);
        }
      }else if(t.type==='utility'){
        const ownUtils=[12,28].filter(i=>view.assets[i]?.owner===actor).length;
        if(ownUtils===0&&(self.cash-t.price<trueReserve+hotspotReserve+1400)){
          earlyCashSinkTiles.add(t.id);
        }
      }
    }
  }

  const shares=strengthShares(view,BOARD,GROUPS,rent);
  const alivePlayers=view.players.filter(p=>!p.out);
  const tableLeaderPlayer=alivePlayers.slice().sort((a,b)=>(shares[b.id]-shares[a.id])||(b.cash-a.cash))[0]||null;
  const leader=rivals.slice().sort((a,b)=>(shares[b.id]-shares[a.id])||(b.cash-a.cash))[0]||null;
  const nemesis=rivals.find(p=>p.botPersona==='kresna'||p.botPersona==='bima')||leader;
  const sariPresent=rivals.some(p=>p.botPersona==='sari');
  const ownMonopolies=groups.filter(g=>g.fullSetOwned).length;
  const rivalMonopolies=rivals.filter(p=>GROUPS.some(g=>g.ids.every(id=>view.assets[id]?.owner===p.id))).length;
  const boardDeadlocked=unowned.length<=6&&ownMonopolies===0&&rivalMonopolies<=1;

  const catchUpPartners=new Set();
  if(alivePlayers.length>=3&&tableLeaderPlayer&&tableLeaderPlayer.id!==actor&&(shares[tableLeaderPlayer.id]||0)>1.4/alivePlayers.length){
    for(const r of rivals){
      if(r.id!==tableLeaderPlayer.id){
        catchUpPartners.add(r.id);
      }
    }
  }
  const underdogs=rivals.filter(r=>r.id!==tableLeaderPlayer?.id);

  const hasMortgagedMonopoly=groups.some(g=>g.fullSetOwned&&g.mortgagedCount>0);
  const hasUnbuiltMonopoly=groups.some(g=>g.complete&&g.levelMin<3);
  const needsBuildCapital=hasMortgagedMonopoly||hasUnbuiltMonopoly;
  const mortgagedOwned=owned.filter(t=>view.assets[t.id]?.mortgaged);
  const canDeleverage=!needsBuildCapital&&mortgagedOwned.length>0&&self.cash>trueReserve+1200;

  const ownMemory=view.botMemory?.players?.[actor]||{};
  const roundTradeCount=ownMemory.nusaTradeTurnSerial===view.turnSerial?(ownMemory.nusaTurnTradeCount||0):0;
  const temporal=analyzeTemporal(view,actor,boardGraph,{roundTradeCount,brokerState:ownMemory.nusaBroker,shouldStop:()=>decisionContext?.expired()||false});
  boardGraph={...boardGraph,...temporal};

  let needsPreBuyMortgage=false;
  let needsPreBuyTrade=false;
  if(view.phase==='buy'&&view.turn===actor&&Number.isInteger(view.buy)){
    const bTile=BOARD[view.buy];
    if(bTile?.price&&!earlyCashSinkTiles.has(view.buy)&&self.cash<bTile.price){
      if(self.cash+liquidBuffer>=bTile.price){
        needsPreBuyMortgage=true;
      }else if(canTrade(view,actor)&&roundTradeCount<2&&isolatedMortgageable.length>0){
        needsPreBuyTrade=true;
      }
    }
  }

  let needsMidAuctionMortgage=false;
  let needsMidAuctionTrade=false;
  if(view.phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor&&isolatedMortgageable.length>0){
    const minBid=auctionMinBid;
    if(view.auction.kind==='building'){
      const bTarget=view.auction.targets?.[actor];
      const bCost=BOARD[bTarget]?.build||1000;
      const desiredCap=bCost*2.0;
      if(minBid<=desiredCap&&self.cash<minBid+trueReserve*0.25){
        if(self.cash+liquidBuffer>=minBid)needsMidAuctionMortgage=true;
        else if(canTrade(view,actor)&&roundTradeCount<2)needsMidAuctionTrade=true;
      }
    }else if(Number.isInteger(view.auction.tile)){
      const aTile=BOARD[view.auction.tile];
      const ag=aTile?.group>=0?groups[aTile.group]:null;
      const completesSet=ag&&ag.own===ag.ids.length-1;
      const blocksSet=ag&&ag.owners.some(o=>o.count===ag.ids.length-1);
      const isKeyAnchor=contestedAnchorTiles.has(view.auction.tile)||steppingStoneTiles.has(view.auction.tile);
      const strategicCap=completesSet?aTile.price*1.45:blocksSet?aTile.price*1.25:isKeyAnchor?aTile.price*1.12:0;
      if(strategicCap>0&&minBid<=strategicCap&&self.cash<minBid+trueReserve*0.30){
        if(self.cash+liquidBuffer>=minBid)needsMidAuctionMortgage=true;
        else if(canTrade(view,actor)&&roundTradeCount<2)needsMidAuctionTrade=true;
      }
    }
  }

  const canGiveJailCardSweetener=(self.cards?.length||0)>0&&(unowned.length<=9||nearLoss>=400);
  const stage=unowned.length>10?'acquisition':needsBuildCapital?'development':rivals.length<=2?'endgame':'contested';

  const logitVal=(pl)=>{
    const pAssets=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===pl.id);
    const pWorth=pl.cash+pAssets.reduce((n,t)=>n+(view.assets[t.id]?.mortgaged?t.mortgage:t.price)+(t.build||0)*(view.assets[t.id]?.level||0)*0.95,0);
    const pBuiltMonos=GROUPS.filter(g=>g.ids.every(id=>view.assets[id]?.owner===pl.id&&!view.assets[id]?.mortgaged)).reduce((n,g)=>n+1.1+Math.min(3,Math.min(...g.ids.map(id=>view.assets[id]?.level||0)))*0.62,0);
    return Math.log(Math.max(500,pWorth))*1.18+pBuiltMonos*1.05;
  };
  const logitMap=Object.fromEntries(alivePlayers.map(pl=>[pl.id,logitVal(pl)]));
  const expSum=alivePlayers.reduce((sum,pl)=>sum+Math.exp(logitMap[pl.id]||0),0);
  const winProbability=Math.exp(logitMap[actor]||0)/Math.max(1e-6,expSum);

  const cands=plan?.candidates||[];
  const hasHighStakesAction=cands.some(c=>['OFFER','COUNTER','TRADE_ACCEPT','BUILD','BUILD_JOIN','BID','BUY'].includes(c.action?.type));
  const isCriticalTurn=cands.length>=2&&hasHighStakesAction&&(stage!=='acquisition'||view.phase==='trade'||view.phase==='auction'||view.phase==='buy');

  const ownAnalysis=analyzeState(view,actor,{fast:false,context:decisionContext});
  const _partnerAnalyses=new Map();

  return Object.freeze({
    view,actor,self,rivals,owned,unowned,groups,bank,cardCycle,
    boardGraph,temporal,macroPosture:temporal.macroPosture,
    cashflowByPlayer:temporal.cashflowByPlayer,readyStep2BrokerChains:temporal.readyStep2BrokerChains,
    deadWeightAssets:temporal.deadWeightAssets,preEndTargets:temporal.preEndTargets,
    auctionStep,auctionMinBid,
    effectiveTradeCash,canUsePovertyCloak,
    cloakedMonopolyGroups,catchUpPartners,doubleSweepGroups,
    dyingRivals,vultureReserve,underdogs,tableLeaderPlayer,
    splitThreeWayGroups,chainTargetTiles,collusionTargetTiles,
    opponentProfiles,canGiveJailCardSweetener,
    shouldDeferPreRollBuild,hasPendingRivalRentClaim,
    visits,immediateVisits,ownVisits,expectedIncome,nearLoss,maxThreat,
    isolatedMortgageable,liquidBuffer,mortgagedOwned,
    ownHotels,rivalHasHotel,hotelTrapActive,
    queuedAuctionTiles,queueAuctionReserve,hasHighPriorityQueuedAuction,
    hotspotReserve,contestedAnchorTiles,earlyCashSinkTiles,
    hasMortgagedMonopoly,hasUnbuiltMonopoly,needsBuildCapital,canDeleverage,
    needsPreBuyMortgage,needsPreBuyTrade,needsMidAuctionMortgage,needsMidAuctionTrade,roundTradeCount,
    boardDeadlocked,ownMonopolies,steppingStoneTiles,
    reserve,trueReserve,stage,leader,nemesis,sariPresent,
    shares,rivalMonopolies,killshotTargets,tileKillshot,winProbability,
    isCriticalTurn,ownAnalysis,_partnerAnalyses,_tradeEvalCache:new Map(),
    salary:rules.salary,
    live:alivePlayers.length
  });
}
