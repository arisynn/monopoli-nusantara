/** NUSA V22.0 "Omniscient Cortex" — Hypergraph Board Reader & Multi-Agent Strategic Planner.
 * Reads the entire board and all 6 players to construct:
 * 1. Group Ownership Topology (`groupTopology`)
 * 2. 6-Player Desire Matrix (`desireMatrix[playerId][tileId]` on 0..100 scale)
 * 3. Trojan-Bait Inventory (`trojanBaitTiles` — pairs where NUSA holds the 3rd blocker)
 * 4. 1-Hop & 2-Hop Broker Acquisition Plans (`brokerPlans`, `brokerTargetTiles`)
 * 5. 3-Layer Active Monopoly Interdiction (`interdictionTargets`, `poisonPillTiles`)
 * 6. Spatial-Temporal Pawn Corridor Radar (`corridorRadar`)
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {rent} from '../../game.mjs';
import {landingForecast,expectedRentAt} from '../probability.mjs';

export const GROUP_TIER=Object.freeze([1.14,1.48,1.30,1.72,1.62,1.32,0.84,1.36]);
export const STATION_IDS=Object.freeze([5,15,25,35]);
export const UTILITY_IDS=Object.freeze([12,28]);

export function analyzeBoardGraph(view,actor,opponentProfiles=new Map()){
  const alivePlayers=view.players.filter(p=>!p.out);
  const rivals=alivePlayers.filter(p=>p.id!==actor);
  const ownerOf=tid=>view.assets[tid]?.owner;

  // 1. SPATIAL-TEMPORAL PAWN CORRIDOR RADAR
  // Use the shared public one-roll model, including jail attempts, third
  // doubles and card movement. Never inspect the shuffled deck order.
  const selfForecast=landingForecast(view,actor,1);
  const tileRivalRollProb=Array(40).fill(0);
  const tileSelfRollProb=[...selfForecast.visits];

  for(const r of rivals){
    const forecast=landingForecast(view,r.id,1);
    for(let tile=0;tile<BOARD.length;tile++)tileRivalRollProb[tile]+=forecast.visits[tile]||0;
  }

  let selfImmediateDangerExpected=0;
  let selfMaxSingleHit=0;
  let unownedStrategicAhead=0;
  for(const b of BOARD){
    const dest=b.id,a=view.assets[dest],prob=tileSelfRollProb[dest]||0;
    if(b?.price&&a?.owner!=null&&a.owner!==actor&&!a.mortgaged){
      selfImmediateDangerExpected+=expectedRentAt(view,dest,selfForecast);
      if(prob>=1/18){
        // Tail upper bound, separate from the expected payment above. Utility
        // rent may roll twelve; nearest-utility cards use the special multiplier.
        const factor=(selfForecast.rentWeights[dest]||0)>prob+1e-12?2:1;
        const utility=(selfForecast.utilityWeights[dest]||0)>0;
        selfMaxSingleHit=Math.max(selfMaxSingleHit,rent(view,dest,12,factor,utility));
      }
    }else if(b?.price&&a?.owner==null){
      if(b.type==='station'||(b.group>=0&&(GROUP_TIER[b.group]||1)>=1.25)){
        unownedStrategicAhead+=prob*b.price;
      }
    }
  }

  const spatialDangerFactor=selfMaxSingleHit>=1800||selfImmediateDangerExpected>=380
    ?1.26
    :selfMaxSingleHit<=350&&selfImmediateDangerExpected<=95
      ?0.68
      :0.95;

  const groupAmbushIntensity=GROUPS.map((g,gIdx)=>{
    const sumProb=g.ids.reduce((acc,tid)=>acc+(tileRivalRollProb[tid]||0),0);
    return +(sumProb*(GROUP_TIER[gIdx]||1)).toFixed(4);
  });

  // 2. 6-PLAYER DESIRE MATRIX & TROJAN-BAIT DETECTION
  const desireMatrix=new Map();
  for(const p of alivePlayers){
    const scores=Array(40).fill(0);
    const prof=opponentProfiles.get(p.id);
    const psychGroups=prof?.desiredGroups||{};
    const persona=p.botPersona||'human';

    for(const t of BOARD){
      if(!t.price)continue;
      const tid=t.id;
      if(ownerOf(tid)===p.id)continue;

      if(t.type==='station'){
        const stOwned=STATION_IDS.filter(i=>ownerOf(i)===p.id).length;
        const personaBoost=persona==='raka'?18:0;
        scores[tid]=Math.min(92,28+stOwned*20+personaBoost+(tid===5?8:0));
        continue;
      }
      if(t.type==='utility'){
        const utOwned=UTILITY_IDS.filter(i=>ownerOf(i)===p.id).length;
        scores[tid]=utOwned>=1?48:15;
        continue;
      }
      if(t.group>=0){
        const gIds=GROUPS[t.group].ids;
        const tier=GROUP_TIER[t.group]||1;
        const pCount=gIds.filter(i=>ownerOf(i)===p.id).length;
        const otherOwners=new Set(gIds.filter(i=>i!==tid&&ownerOf(i)!=null&&ownerOf(i)!==p.id).map(i=>ownerOf(i)));
        const psychBonus=Math.min(16,(psychGroups[t.group]||0)*6);

        if(pCount===gIds.length-1){
          scores[tid]=Math.min(100,Math.round(88+tier*7+psychBonus));
        }else if(pCount===1&&gIds.length===3){
          if(otherOwners.size===0){
            scores[tid]=Math.min(86,Math.round(62*tier+psychBonus));
          }else{
            scores[tid]=Math.min(78,Math.round(48*tier+psychBonus));
          }
        }else if(pCount===0&&otherOwners.size===0){
          scores[tid]=Math.round(24*tier+psychBonus);
        }else{
          scores[tid]=Math.round(14*tier+psychBonus);
        }
      }
    }
    desireMatrix.set(p.id,scores);
  }

  // Trojan Baits: Tiles owned by NUSA where giving the tile to Rival R gives R 2/3 of a 3-tile group,
  // while NUSA ALSO owns the 3rd tile (or can keep the 3rd tile as an unbreakable hostage), OR where
  // Rival R strongly desires the tile (desire >= 52) without completing R's monopoly!
  const trojanBaitForRival=new Map();
  for(const r of rivals){
    const rDesire=desireMatrix.get(r.id)||[];
    const list=[];
    for(const t of BOARD){
      if(!t.price||ownerOf(t.id)!==actor||(view.assets[t.id]?.level||0)>0)continue;
      if(t.group>=0){
        const gIds=GROUPS[t.group].ids;
        if(gIds.some(i=>(view.assets[i]?.level||0)>0))continue;
        const rCount=gIds.filter(i=>ownerOf(i)===r.id).length;
        const myCount=gIds.filter(i=>ownerOf(i)===actor).length;
        // Never hand over a tile that completes R's monopoly!
        if(rCount>=gIds.length-1)continue;
        // Never break our own 2/3 near-monopoly in a high-tier group unless we are keeping a hostage in low-tier
        if(myCount>=2&&(GROUP_TIER[t.group]||1)>=1.28)continue;

        const isLockedHostagePair=(gIds.length===3&&rCount===1&&myCount===2&&(GROUP_TIER[t.group]||1)<1.28);
        const appeal=rDesire[t.id]+(isLockedHostagePair?24:0);
        list.push({tileId:t.id,appeal,isLockedHostagePair,price:t.price});
      }else if(t.type==='station'||t.type==='utility'){
        const mySt=STATION_IDS.filter(i=>ownerOf(i)===actor).length;
        if(t.type==='station'&&mySt>=3)continue;
        list.push({tileId:t.id,appeal:rDesire[t.id],isLockedHostagePair:false,price:t.price});
      }
    }
    list.sort((a,b)=>b.appeal-a.appeal||a.price-b.price);
    trojanBaitForRival.set(r.id,list);
  }

  // 3. GROUP OWNERSHIP TOPOLOGY & INTERDICTION / BROKER TARGETS
  const poisonPillTiles=new Set();       // Unowned tiles we MUST buy to plant a blocking anchor
  const unownedCriticalDeny=new Set();   // Unowned tiles that would complete a rival's monopoly
  const thirdPartyInterceptions=[];      // Tiles held by Rival B that Rival A (2/3) is about to buy
  const thirdPartyInterceptionTiles=new Set();
  const brokerPlans=[];                  // 1-Hop and 2-Hop acquisition plans for NUSA's near-monopolies
  const brokerTargetTiles=new Set();     // Tiles held by B (or unowned) that A wants, so we can trade to A for our key tile!
  const brokerTileToPlan=new Map();
  const rivalCashStarvationTargets=new Map();

  const groupTopologies=GROUPS.map((g,gIdx)=>{
    const ids=g.ids;
    const tier=GROUP_TIER[gIdx]||1;
    const houseCost=BOARD[ids[0]]?.build||1000;
    const myTiles=ids.filter(i=>ownerOf(i)===actor);
    const unownedTiles=ids.filter(i=>ownerOf(i)==null);
    const rivalCounts=rivals.map(r=>({
      id:r.id,
      cash:r.cash,
      persona:r.botPersona||'human',
      tiles:ids.filter(i=>ownerOf(i)===r.id)
    })).filter(x=>x.tiles.length>0).sort((a,b)=>b.tiles.length-a.tiles.length||b.cash-a.cash);

    let status='OPEN';
    if(myTiles.length===ids.length){
      status='MONOPOLY_OURS';
    }else if(rivalCounts[0]?.tiles.length===ids.length){
      status='MONOPOLY_RIVAL';
      const rOwner=rivalCounts[0];
      const maxLv=Math.max(...ids.map(i=>view.assets[i]?.level||0));
      if(maxLv<3){
        rivalCashStarvationTargets.set(rOwner.id,{
          rivalId:rOwner.id,
          groupId:gIdx,
          dangerCashThreshold:houseCost*ids.length,
          priority:tier*1.35
        });
      }
    }else if(myTiles.length===ids.length-1){
      status='OUR_NEAR_MONOPOLY';
      const missingTile=ids.find(i=>ownerOf(i)!==actor);
      const holderId=ownerOf(missingTile);
      if(holderId!=null&&holderId!==actor){
        const holderDesire=desireMatrix.get(holderId)||[];
        const myBaits=trojanBaitForRival.get(holderId)||[];

        // Scan 2-Hop Broker Baits: Tiles Y (unowned or owned by third-party B) that holderId strongly desires
        const twoHopBaits=[];
        for(const candT of BOARD){
          if(!candT.price||candT.id===missingTile)continue;
          const yOwner=ownerOf(candT.id);
          if(yOwner===actor||yOwner===holderId)continue;
          if((view.assets[candT.id]?.level||0)>0)continue;
          if(candT.group>=0&&GROUPS[candT.group].ids.some(i=>(view.assets[i]?.level||0)>0))continue;
          // Ensure giving candT to holderId does NOT complete holderId's monopoly!
          if(candT.group>=0){
            const hCount=GROUPS[candT.group].ids.filter(i=>ownerOf(i)===holderId).length;
            if(hCount>=GROUPS[candT.group].ids.length-1)continue;
          }
          // If owned by third-party B, ensure B isn't holding a 2/3 pair on candT
          if(yOwner!=null&&candT.group>=0){
            const bCount=GROUPS[candT.group].ids.filter(i=>ownerOf(i)===yOwner).length;
            if(bCount>=2)continue;
          }
          const desireByKeyHolder=holderDesire[candT.id]||0;
          if(desireByKeyHolder>=54){
            twoHopBaits.push({
              baitTile:candT.id,
              baitOwner:yOwner, // null if unowned, or Rival B's id
              desireScore:desireByKeyHolder,
              ultimateTargetTile:missingTile,
              keyHolderId:holderId,
              targetGroupId:gIdx,
              priority:tier*(desireByKeyHolder/60)
            });
          }
        }
        twoHopBaits.sort((a,b)=>b.priority-a.priority);
        for(const tb of twoHopBaits.slice(0,4)){
          brokerTargetTiles.add(tb.baitTile);
          if(!brokerTileToPlan.has(tb.baitTile)){
            brokerTileToPlan.set(tb.baitTile,tb);
          }
        }

        brokerPlans.push({
          groupId:gIdx,
          tier,
          houseCost,
          missingTile,
          keyHolderId:holderId,
          directBaits:myBaits.slice(0,4),
          twoHopBaits:twoHopBaits.slice(0,4)
        });
      }
    }else if(rivalCounts[0]?.tiles.length===ids.length-1){
      status='RIVAL_NEAR_MONOPOLY';
      const dangerRival=rivalCounts[0];
      const missingTile=ids.find(i=>ownerOf(i)!==dangerRival.id);
      const holderId=ownerOf(missingTile);

      rivalCashStarvationTargets.set(dangerRival.id,{
        rivalId:dangerRival.id,
        groupId:gIdx,
        dangerCashThreshold:houseCost*ids.length+BOARD[missingTile]?.price,
        priority:tier*1.25
      });

      if(holderId==null){
        unownedCriticalDeny.add(missingTile);
        poisonPillTiles.add(missingTile);
      }else if(holderId!==actor){
        // THIRD-PARTY LEAK EMERGENCY: Rival A has 2/3, Rival B holds the 3rd tile!
        if((view.assets[missingTile]?.level||0)===0){
          thirdPartyInterceptionTiles.add(missingTile);
          thirdPartyInterceptions.push({
            tileId:missingTile,
            groupId:gIdx,
            tier,
            dangerRivalId:dangerRival.id,
            holderRivalId:holderId,
            priority:tier*(dangerRival.cash>=houseCost*2?1.45:1.15)
          });
        }
      }
    }else if(ids.length===3&&unownedTiles.length===0&&myTiles.length===1&&rivalCounts.length===2){
      status='SPLIT_1_1_1';
    }else if(myTiles.length===0&&rivalCounts.length>=1&&unownedTiles.length>=1&&tier>=1.14){
      status='RIVAL_SEEDED_OPEN';
      for(const ut of unownedTiles){
        poisonPillTiles.add(ut);
      }
    }

    return {
      groupId:gIdx,
      ids,
      tier,
      houseCost,
      status,
      myCount:myTiles.length,
      unownedCount:unownedTiles.length,
      rivalCounts,
      ambushIntensity:groupAmbushIntensity[gIdx]
    };
  });

  brokerPlans.sort((a,b)=>b.tier-a.tier);
  thirdPartyInterceptions.sort((a,b)=>b.priority-a.priority);

  // Count how many rival groups NUSA currently holds a blocking hostage in
  const hostageGroupsHeld=groupTopologies.filter(gt=>
    gt.myCount>=1&&gt.myCount<gt.ids.length&&gt.rivalCounts.some(r=>r.tiles.length>=1)
  ).length;

  return Object.freeze({
    groupTopologies,
    desireMatrix,
    trojanBaitForRival,
    brokerPlans,
    brokerTargetTiles,
    brokerTileToPlan,
    poisonPillTiles,
    unownedCriticalDeny,
    thirdPartyInterceptions,
    thirdPartyInterceptionTiles,
    rivalCashStarvationTargets,
    hostageGroupsHeld,
    corridorRadar:Object.freeze({
      tileRivalRollProb,
      tileSelfRollProb,
      groupAmbushIntensity,
      selfImmediateDangerExpected,
      selfMaxSingleHit,
      selfMaxSingleHitIsPublicUpperBound:true,
      unownedStrategicAhead,
      spatialDangerFactor
    })
  });
}
