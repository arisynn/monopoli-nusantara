/** NUSA V17.0 "Total Mechanical Omniscience" — Full-Spectrum Situation Telemetry.
 * Includes:
 * - Public FIFO 16-Card Cycle Tracker + C1009 Back-3 Banyuwangi (19) Magnet
 * - Exact C1009 Station Asymmetry (Gambir 5 > Tawang 15 / Gubeng 25 > Tugu 35)
 * - Apex-Tile Set (g.ids.at(-1)) for Optimal Even-Build Ordering
 * - Bankruptcy Auction-Queue Lookahead (`view.queue` inspection)
 * - Mid-Auction Flash Liquidity Detector (`needsMidAuctionMortgage`)
 * - Hotel Downgrade Trap Radar (`rivalHasHotel`, `ownHotels`)
 * - Manual Rent-Claim Expiration Trigger (`hasPendingRivalRentClaim`)
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {observation} from '../mind.mjs';
import {landingForecast} from '../probability.mjs';
import {stock,rent,redemption} from '../../game.mjs';
import {economyRules,strengthShares} from '../economy.mjs';
import {analyzeState} from '../analysis.mjs';

// C1009 Color Group Tier Multipliers:
// 0:Priangan(Br), 1:Jawa(LB), 2:Sumatra(Pk), 3:JawaTimur(Or), 4:NusaTenggara(Rd), 5:Kalimantan(Yl), 6:IndoTimur(Gr), 7:Ikonik(DB)
const GROUP_TIER=[1.14,1.48,1.30,1.72,1.62,1.32,0.84,1.36];
const DICE_PROB=[0,0,1/36,2/36,3/36,4/36,5/36,6/36,5/36,4/36,3/36,2/36,1/36];
const HOTSPOT_GROUPS=new Set([1,2,3,4,5,7]);

// C1009 Apex Tiles: last tile in each color group (same build cost, higher rent at every level!)
export const APEX_TILES=new Set(GROUPS.map(g=>g.ids[g.ids.length-1]));

// Exact C1009 Station Asymmetry Multipliers:
// 5 (Gambir): hit by Chance #13 (move:5) + Chance #4 & #5 (nearest station from Chance 36, 2x rent!)
// 15 (Tawang): hit by Chance #4 & #5 from Chance 7 (2x rent!)
// 25 (Gubeng): hit by Chance #4 & #5 from Chance 22 (2x rent!)
// 35 (Tugu): NEVER hit by any nearest-station card!
export const STATION_GEOMETRY_MULT=Object.freeze({5:1.26,15:1.16,25:1.16,35:0.98});

/**
 * Tracks the 16-card FIFO queues for 'chance' and 'community' using ONLY
 * public log events (`view.log`) and held jail cards (`view.players[].cards`).
 */
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

  // Repair cards: chance #11 (Renovasi lingkungan: 250/house, 1000/hotel)
  //               community #13 (Perbaikan jalan: 400/house, 1150/hotel)
  const chanceRepairSafe=bottomChance.has(11);
  const commRepairSafe=bottomCommunity.has(13);
  const repairSafe=chanceRepairSafe&&commRepairSafe;
  const repairImminent=(!chanceRepairSafe&&recentChance.length>=9)||(!commRepairSafe&&recentCommunity.length>=9);

  // Teleport / Magnet cards in 'chance' that are NOT in the bottom of the FIFO queue:
  // #0 -> 39 (Jakarta SCBD), #2 -> 24 (Labuan Bajo), #3 -> 11 (Medan),
  // #4 & #5 -> nearest station (5, 15, 25 with 2x rent!), #9 -> back 3 (from 22 -> 19 Banyuwangi!),
  // #13 -> 5 (Stasiun Gambir)
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

export function situationOf(state,actor,plan){
  const view=observation(state,actor),self=view.players[actor];
  if(!self||self.out)throw Error('NUSA V17.0 actor inactive');
  const rivals=view.players.filter(p=>p.id!==actor&&!p.out);
  const owned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===actor);
  const unowned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner==null);
  const bank=stock(view);
  const cardCycle=analyzePublicCardCycles(view);

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
    houseCost:BOARD[g.ids[0]]?.build||1000
  }));

  // 1-1-1 Split Group Detector for Silent 2-Step Chain Accumulation
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

  // V17.0 ENGINE #4: Hotel Downgrade Trap Radar (`level === 5 && bank.houses < 4` forces `SELL_SET`)
  const ownHotels=owned.filter(t=>view.assets[t.id]?.level===5).length;
  const rivalHasHotel=rivals.some(p=>BOARD.some(t=>t.price&&view.assets[t.id]?.owner===p.id&&view.assets[t.id]?.level===5));
  const hotelTrapActive=rivalHasHotel&&bank.houses>=1&&bank.houses<=8;

  // Forward Hotspot Opportunity Scanner (2-12 steps ahead)
  let forwardHotspotDemand=0;
  let unownedHotspotsAhead=0;
  for(let d=2;d<=12;d++){
    const nextPos=(self.pos+d)%40;
    const t=BOARD[nextPos];
    if(t?.price&&view.assets[nextPos]?.owner==null){
      const isHotspot=t.type==='station'||(t.group>=0&&HOTSPOT_GROUPS.has(t.group));
      if(isHotspot){
        forwardHotspotDemand+=t.price*(DICE_PROB[d]||0);
        unownedHotspotsAhead++;
      }
    }
  }
  const hotspotReserve=unownedHotspotsAhead>=2?Math.min(2400,Math.round(forwardHotspotDemand*1.85)):0;

  // Contested-Anchor Hostage Detector
  const contestedAnchorTiles=new Set();
  for(const t of unowned){
    if(t.group>=0){
      const g=groups[t.group];
      const rivalHasOne=g.owners.some(o=>o.count===1);
      const rivalAlmostComplete=g.owners.some(o=>o.count===g.ids.length-1);
      if((g.tier>=1.10&&rivalHasOne)||rivalAlmostComplete){
        contestedAnchorTiles.add(t.id);
      }
    }else if(t.type==='station'){
      const rivalHasStation=rivals.some(p=>[5,15,25,35].filter(i=>view.assets[i]?.owner===p.id).length>=1);
      const ownStation=[5,15,25,35].filter(i=>view.assets[i]?.owner===actor).length>=1;
      if(rivalHasStation||ownStation){
        contestedAnchorTiles.add(t.id);
      }
    }
  }

  // V17.0 ENGINE #3: Bankruptcy Auction-Queue Lookahead (`view.queue` inspection)
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
      const qHighAnchor=qg&&qg.tier>=1.48&&qg.own>=1;
      if(qCompletes||qBlocks||qHighAnchor){
        hasHighPriorityQueuedAuction=true;
        if(!curCompletes){
          queueAuctionReserve=Math.max(queueAuctionReserve,Math.min(self.cash*0.55,Math.round(qb.price*(qCompletes?1.25:1.05))));
        }
      }
    }
  }

  // Prey Insolvency & Per-Tile Killshot Snowball Pressure
  const killshotTargets=rivals.map(p=>{
    const pDeeds=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===p.id);
    const pLiquid=p.cash+pDeeds.reduce((acc,t)=>acc+(view.assets[t.id]?.mortgaged?0:t.mortgage)+(t.build||0)*(view.assets[t.id]?.level||0)*0.5,0);
    const f1=rivalForecasts1.get(p.id);
    const riskExposure=owned.filter(t=>!view.assets[t.id]?.mortgaged).reduce((acc,t)=>acc+((f1?.visits[t.id]||0)*rent(view,t.id,7)),0);
    return {id:p.id,cash:p.cash,liquid:pLiquid,deedCount:pDeeds.length,riskExposure,vulnerable:p.cash<1800||pLiquid<3500};
  });

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

  // Stepping-Stone (Triangle) Trade Matrix
  const steppingStoneTiles=new Set();
  const steppingStoneMap=new Map();
  for(const g of groups){
    if(g.own===g.ids.length-1&&g.unownedCount===0){
      const missingTile=g.ids.find(id=>view.assets[id]?.owner!==actor);
      const keyHolder=missingTile!==undefined?view.assets[missingTile]?.owner:null;
      if(keyHolder!=null&&keyHolder!==actor){
        for(const g2 of groups){
          if(g2.id===g.id)continue;
          const khCount=g2.ids.filter(id=>view.assets[id]?.owner===keyHolder).length;
          if(khCount>=1&&khCount<g2.ids.length){
            for(const tid of g2.ids){
              const thirdOwner=view.assets[tid]?.owner;
              if(thirdOwner!=null&&thirdOwner!==actor&&thirdOwner!==keyHolder&&(view.assets[tid]?.level||0)===0){
                steppingStoneTiles.add(tid);
                steppingStoneMap.set(tid,{holderOfOurKey:keyHolder,ourMissingTile:missingTile,wantedGroup:g2.id});
              }
            }
          }
        }
      }
    }
  }

  // True 2-Roll Survival Reserve (adjusted for FIFO repair card risk & Hotel Downgrade Trap protection!)
  const repairMod=cardCycle.repairSafe?0.92:cardCycle.repairImminent?1.12:1.0;
  const hotelSelfGuard=(ownHotels>0&&bank.houses<=5)?1.15:1.0;
  const rawReserve=Math.max(
    rules.floor||0,
    (nearLoss*0.80+maxThreat*0.10-liquidBuffer*0.70-expectedIncome*0.20)*repairMod*hotelSelfGuard
  );
  const reserve=Math.max(rules.floor||0,Math.min(self.cash*0.36,rawReserve));
  const trueReserve=Math.max(rules.floor||0,(nearLoss*0.72+maxThreat*0.08)*repairMod*hotelSelfGuard);

  // V17.0 ENGINE #7: Manual Rent-Claim Expiration Trigger & Post-Roll Construction Gate
  const hasPendingRivalRentClaim=(view.rentClaims||[]).some(c=>c.from===actor&&c.turnSerial<view.turnSerial);
  const shouldDeferPreRollBuild=view.phase==='roll'&&view.turn===actor&&(
    hasPendingRivalRentClaim||((view.doubles||0)===0&&bank.houses>4&&!hotelTrapActive)
  );

  // Early Cash-Sink Filter (Selective Buy vs Auction Trap)
  const earlyCashSinkTiles=new Set();
  if(unowned.length>=7){
    for(const t of unowned){
      if(t.group===6){
        const g6=groups[6];
        const anyRivalOwns=g6.owners.some(o=>o.count>=1);
        if(g6.own===0&&!anyRivalOwns&&!steppingStoneTiles.has(t.id)&&(self.cash-t.price<trueReserve+hotspotReserve+1800)){
          earlyCashSinkTiles.add(t.id);
        }
      }else if(t.type==='utility'){
        const ownUtils=[12,28].filter(i=>view.assets[i]?.owner===actor).length;
        if(ownUtils===0&&!steppingStoneTiles.has(t.id)&&(self.cash-t.price<trueReserve+hotspotReserve+1400)){
          earlyCashSinkTiles.add(t.id);
        }
      }
    }
  }

  const shares=strengthShares(view,BOARD,GROUPS,rent);
  const leader=rivals.slice().sort((a,b)=>(shares[b.id]-shares[a.id])||(b.cash-a.cash))[0]||null;
  const nemesis=rivals.find(p=>p.botPersona==='kresna'||p.botPersona==='bima')||leader;
  const sariPresent=rivals.some(p=>p.botPersona==='sari');
  const ownMonopolies=groups.filter(g=>g.fullSetOwned).length;
  const rivalMonopolies=rivals.filter(p=>GROUPS.some(g=>g.ids.every(id=>view.assets[id]?.owner===p.id))).length;
  const boardDeadlocked=unowned.length<=6&&ownMonopolies===0&&rivalMonopolies<=1;

  const hasMortgagedMonopoly=groups.some(g=>g.fullSetOwned&&g.mortgagedCount>0);
  const hasUnbuiltMonopoly=groups.some(g=>g.complete&&g.levelMin<3);
  const needsBuildCapital=hasMortgagedMonopoly||hasUnbuiltMonopoly;
  const mortgagedOwned=owned.filter(t=>view.assets[t.id]?.mortgaged);
  const canDeleverage=!needsBuildCapital&&mortgagedOwned.length>0&&self.cash>trueReserve+1200;

  // Pre-Buy Flash Liquidity Detector (when in phase === 'buy')
  let needsPreBuyMortgage=false;
  if(view.phase==='buy'&&view.turn===actor&&Number.isInteger(view.buy)){
    const bTile=BOARD[view.buy];
    if(bTile?.price&&!earlyCashSinkTiles.has(view.buy)&&self.cash<bTile.price&&self.cash+liquidBuffer>=bTile.price){
      needsPreBuyMortgage=true;
    }
  }

  // V17.0 ENGINE #1: Mid-Auction Flash Liquidity Detector (when in phase === 'auction')
  let needsMidAuctionMortgage=false;
  if(view.phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor&&isolatedMortgageable.length>0){
    const minBid=Math.max(100,(view.auction.amount||0)+10);
    if(view.auction.kind==='building'){
      const bTarget=view.auction.targets?.[actor];
      const bCost=BOARD[bTarget]?.build||1000;
      const desiredCap=bCost*2.0;
      if(minBid<=desiredCap&&self.cash<minBid+trueReserve*0.25&&self.cash+liquidBuffer>=minBid){
        needsMidAuctionMortgage=true;
      }
    }else if(Number.isInteger(view.auction.tile)){
      const aTile=BOARD[view.auction.tile];
      const ag=aTile?.group>=0?groups[aTile.group]:null;
      const completesSet=ag&&ag.own===ag.ids.length-1;
      const blocksSet=ag&&ag.owners.some(o=>o.count===ag.ids.length-1);
      const isKeyAnchor=contestedAnchorTiles.has(view.auction.tile);
      const strategicCap=completesSet?aTile.price*1.45:blocksSet?aTile.price*1.25:isKeyAnchor?aTile.price*1.05:0;
      if(strategicCap>0&&minBid<=strategicCap&&self.cash<minBid+trueReserve*0.30&&self.cash+liquidBuffer>=minBid){
        needsMidAuctionMortgage=true;
      }
    }
  }

  // V17.0 ENGINE #2: Same-Turn Multi-Trade Chain Counter
  const roundTradeCount=(view.log||[]).filter(e=>e.type==='trade'&&e.turn===view.round&&e.actor===actor).length;

  const stage=unowned.length>10?'acquisition':needsBuildCapital?'development':rivals.length<=2?'endgame':'contested';

  // Multi-Agent Softmax Victory Probability P(Win)
  const alivePlayers=view.players.filter(p=>!p.out);
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

  const ownAnalysis=analyzeState(view,actor,{fast:false});
  const _partnerAnalyses=new Map();

  return Object.freeze({
    view,actor,self,rivals,owned,unowned,groups,bank,cardCycle,
    splitThreeWayGroups,chainTargetTiles,shouldDeferPreRollBuild,hasPendingRivalRentClaim,
    visits,immediateVisits,ownVisits,expectedIncome,nearLoss,maxThreat,
    isolatedMortgageable,liquidBuffer,mortgagedOwned,
    ownHotels,rivalHasHotel,hotelTrapActive,
    queuedAuctionTiles,queueAuctionReserve,hasHighPriorityQueuedAuction,
    forwardHotspotDemand,unownedHotspotsAhead,hotspotReserve,
    contestedAnchorTiles,earlyCashSinkTiles,
    hasMortgagedMonopoly,hasUnbuiltMonopoly,needsBuildCapital,canDeleverage,
    needsPreBuyMortgage,needsMidAuctionMortgage,roundTradeCount,
    boardDeadlocked,ownMonopolies,
    steppingStoneTiles,steppingStoneMap,
    reserve,trueReserve,stage,leader,nemesis,sariPresent,
    shares,rivalMonopolies,killshotTargets,tileKillshot,winProbability,
    isCriticalTurn,ownAnalysis,_partnerAnalyses,_tradeEvalCache:new Map(),
    salary:rules.salary,
    live:alivePlayers.length
  });
}
