/** NUSA V23.0 "Omniscient Cortex" — Hypergraph Council & Macro Action Synthesizer.
 * Synthesizes:
 * 1. 1-Hop Direct & Trojan-Bait Monopoly Buyouts (`boardGraph.brokerPlans`).
 * 2. 2-Hop Broker Acquisitions ("Acquire Y from B, then trade Y to A for X").
 * 3. Preemptive Third-Party Monopoly Interdictions (`boardGraph.thirdPartyInterceptions`).
 * 4. 1-Step Double-Deed Monopoly Sweeps (1/3 -> 3/3).
 * 5. 3-Tier Extortionate Counter-Offers in `phase === 'trade'`.
 * 6. Multi-Action Macro Chaining (`candidate.macro`) for CRN rollout precision.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {canTrade,canManage,redemption,managementError} from '../../game.mjs';
import {legalCandidate} from '../candidates.mjs';
import {liquidityPenalty} from '../analysis.mjs';
import {rejectionActive} from '../concessions.mjs';
import {memoryFor} from '../memory.mjs';
import {situationOf,APEX_TILES} from './situation.mjs';
import {ensureChronosCandidates,temporalTelemetry} from './chronos-policy.mjs';
import {
  runExperts,STRATEGY_EXPERTS,grandmasterAuctionCeiling,GROUP_TIER,
  normalizeTrade,evaluateTradeForActor,completion,block,valuation,
  predictPartnerAcceptance,solveOptimalTradeCash,projectWinProbabilityDelta
} from './experts.mjs';

export const NUSA_V7_VERSION='23.0.0-chronos-kairos';

export function cleanAction(a){
  if(!a||typeof a!=='object')return a;
  const {actionId,...rest}=a;
  return rest;
}
export const eq=(a,b)=>JSON.stringify(cleanAction(a))===JSON.stringify(cleanAction(b));
const protectedType=a=>['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT'].includes(a?.type);

const STAGE_WEIGHTS={
  acquisition:{
    boardReaderDesire:3.3,brokerPathfinder:3.4,monopolyInterdictor:3.4,spatialCorridorAmbush:2.9,
    egoistWinDelta:3.4,extortionCounter:3.3,underdogFarmer:3.1,auctionExtortionist:3.1,
    portfolio:2.8,auction:3.0,development:2.6,scarcity:2.5,liquidity:2.6,mortgage:2.7,
    jail:2.7,bankruptcy:2.8,negotiation:2.8,trajectorySolver:3.1,velocitySwap:2.9,
    postRollDiscipline:3.1,chainAccumulator:2.9,doubleDeedSweep:3.2,povertyCloak:3.1,
    coalitionArbitrage:3.0,crossPhaseRescue:3.2,buildingAuctionSniper:3.0,cardAndQueueOracle:2.7,killshot:2.5
  },
  development:{
    boardReaderDesire:3.4,brokerPathfinder:3.5,monopolyInterdictor:3.4,spatialCorridorAmbush:3.3,
    egoistWinDelta:3.5,extortionCounter:3.4,underdogFarmer:3.2,auctionExtortionist:3.1,
    portfolio:2.5,auction:2.9,development:3.2,scarcity:2.9,liquidity:2.7,mortgage:2.9,
    jail:2.6,bankruptcy:2.9,negotiation:2.9,trajectorySolver:3.2,velocitySwap:3.2,
    postRollDiscipline:3.2,chainAccumulator:3.0,doubleDeedSweep:3.3,povertyCloak:3.3,
    coalitionArbitrage:3.1,crossPhaseRescue:3.2,buildingAuctionSniper:3.1,cardAndQueueOracle:2.8,killshot:2.9
  },
  contested:{
    boardReaderDesire:3.4,brokerPathfinder:3.5,monopolyInterdictor:3.5,spatialCorridorAmbush:3.4,
    egoistWinDelta:3.5,extortionCounter:3.4,underdogFarmer:3.2,auctionExtortionist:3.1,
    portfolio:2.4,auction:2.9,development:3.1,scarcity:3.1,liquidity:2.8,mortgage:2.9,
    jail:2.7,bankruptcy:3.0,negotiation:2.9,trajectorySolver:3.2,velocitySwap:3.2,
    postRollDiscipline:3.2,chainAccumulator:2.9,doubleDeedSweep:3.3,povertyCloak:3.3,
    coalitionArbitrage:3.1,crossPhaseRescue:3.2,buildingAuctionSniper:3.2,cardAndQueueOracle:2.8,killshot:3.2
  },
  endgame:{
    boardReaderDesire:3.3,brokerPathfinder:3.3,monopolyInterdictor:3.4,spatialCorridorAmbush:3.4,
    egoistWinDelta:3.5,extortionCounter:3.4,underdogFarmer:3.1,auctionExtortionist:3.1,
    portfolio:2.3,auction:2.9,development:3.1,scarcity:3.1,liquidity:2.9,mortgage:2.9,
    jail:2.8,bankruptcy:3.2,negotiation:2.8,trajectorySolver:3.1,velocitySwap:3.1,
    postRollDiscipline:3.1,chainAccumulator:2.7,doubleDeedSweep:3.2,povertyCloak:3.2,
    coalitionArbitrage:3.0,crossPhaseRescue:3.2,buildingAuctionSniper:3.2,cardAndQueueOracle:2.7,killshot:3.4
  }
};

function weightFor(expertId,context){
  if(['cashflowClock','turnInitiative','statefulBroker','deadWeightLiquidator','preEndAmbush'].includes(expertId))return 3.6;
  const table=STAGE_WEIGHTS[context.stage]||{};
  return table[expertId]||1.50;
}

function sovereignScoreRebase(context,action,nativeScore){
  const {view,self,trueReserve,liquidBuffer}=context;
  const inflatedReserve=Math.max(trueReserve*1.6,self.cash*0.55);
  let spend=0;
  if(action.type==='BUILD'||action.type==='BUILD_JOIN'){
    if(context.shouldDeferPreRollBuild&&action.type==='BUILD')return nativeScore-450;
    spend=BOARD[action.tile]?.build||0;
  }else if(action.type==='BUY'){
    if(context.earlyCashSinkTiles?.has(view.buy))return nativeScore;
    spend=BOARD[view.buy]?.price||0;
  }else if(action.type==='REDEEM'||action.type==='MORTGAGE_REDEEM'){
    if(context.shouldDeferPreRollBuild&&action.type==='REDEEM')return nativeScore-380;
    const t=action.type==='MORTGAGE_REDEEM'?view.mortgageDecision?.tile:action.tile;
    const g=BOARD[t]?.group;
    if(Number.isInteger(t)&&((g>=0&&context.groups[g]?.fullSetOwned)||context.canDeleverage||action.type==='MORTGAGE_REDEEM')){
      spend=redemption(t);
    }
  }
  if(spend<=0)return nativeScore;
  const effectiveAfter=self.cash-spend+liquidBuffer*0.75;
  if(effectiveAfter<trueReserve)return nativeScore;

  const penaltyBefore=liquidityPenalty(self.cash,inflatedReserve);
  const penaltyAfter=liquidityPenalty(self.cash-spend,inflatedReserve);
  const artificialDrag=Math.max(0,penaltyAfter-penaltyBefore);
  return nativeScore+artificialDrag*0.86;
}

export function ensureSovereignCandidates(context,plan){
  const expansionKey=context.view.matchId+':'+context.view.version+':'+context.actor;
  if(plan?._nusaExpansionKey===expansionKey)return plan;
  const candidates=plan?.candidates;
  if(!Array.isArray(candidates))return plan;
  const {view,actor,self,auctionStep,auctionMinBid,boardGraph}=context;
  const phase=view.phase;
  const topScore=()=>Math.max(0,...candidates.map(c=>c.score));

  const pushCandidate=(action,score,macro=null)=>{
    if(!action||context.decisionContext?.expired())return false;
    const existing=candidates.find(c=>eq(c.action,action));
    if(existing){
      if(score>existing.score){
        existing.score=score;
        if(action.actionId)existing.action.actionId=action.actionId;
      }
      if(Array.isArray(macro)&&macro.length>1)existing.macro=macro;
      return true;
    }
    const id=action.actionId||('nusa-'+candidates.length);
    const withId={...action,actionId:id};
    if(legalCandidate(view,actor,withId)){
      const entry={id,action:withId,score,expanded:true};
      if(Array.isArray(macro)&&macro.length>1)entry.macro=macro;
      candidates.push(entry);
      return true;
    }
    return false;
  };

  for(const c of candidates){

    if(context.decisionContext?.expired())break;
    c.score=sovereignScoreRebase(context,c.action,c.score);
  }

  // 1. BUY PHASE: Selective Buy, Broker Bait Seizure, Poison-Pill Anchor, or Pre-Buy Flash Liquidity
  if(phase==='buy'&&view.turn===actor&&Number.isInteger(view.buy)){
    const tId=view.buy,bTile=BOARD[tId];
    if(bTile?.price){
      const comp=completion(context,tId,actor);
      const blk=block(context,tId);
      const val=valuation(context,tId);
      const isCritDeny=boardGraph.unownedCriticalDeny.has(tId);
      const isBrokerBait=boardGraph.brokerTargetTiles.has(tId);
      const isPoisonPill=boardGraph.poisonPillTiles.has(tId);
      const isCashSink=context.earlyCashSinkTiles?.has(tId);
      const isStrategic=isCritDeny||isBrokerBait||isPoisonPill||comp>=0.85||blk>=0.65||val>=bTile.price*1.12||bTile.type==='station';

      if(isCashSink&&!isStrategic&&comp<0.50&&blk<0.50){
        pushCandidate({type:'AUCTION',actionId:'nusa-selective-auction-'+tId},topScore()+285);
      }else if(self.cash>=bTile.price){
        if(isStrategic||self.cash-bTile.price>=context.trueReserve*0.48){
          const boost=isCritDeny?390:isBrokerBait?365:isPoisonPill?345:285;
          pushCandidate({type:'BUY',actionId:'nusa-buy-'+tId},topScore()+boost);
        }
      }else if(isStrategic&&self.cash+context.liquidBuffer>=bTile.price+context.trueReserve*0.25){
        const coll=context.isolatedMortgageable.find(d=>d.id!==tId&&!managementError(view,actor,d.id,'MORTGAGE'));
        if(coll){
          const mortAct={type:'MORTGAGE',tile:coll.id,actionId:'nusa-prebuy-mort-'+coll.id};
          pushCandidate(mortAct,topScore()+430,[mortAct,{type:'BUY'}]);
        }
      }else if(isStrategic&&context.needsPreBuyTrade&&canTrade(view,actor)){
        const deficit=bTile.price-self.cash;
        const mem=memoryFor(view,actor);
        const richRivals=context.rivals.filter(p=>p.cash>=deficit&&!rejectionActive(view,mem,p.id)).sort((a,b)=>b.cash-a.cash);
        let buyTradeFound=false;
        for(const r of richRivals){
          if(context.decisionContext?.expired())break;
          if(buyTradeFound)break;
          for(const deed of context.isolatedMortgageable){
            if(context.decisionContext?.expired())break;
            if(deed.id===tId)continue;
            if(deed.group>=0){
              const oppCnt=GROUPS[deed.group].ids.filter(i=>view.assets[i]?.owner===r.id).length;
              if(oppCnt>=GROUPS[deed.group].ids.length-1)continue;
            }
            for(const mult of [1.0,0.92,0.85]){
              if(context.decisionContext?.expired())break;
              const askCash=Math.min(r.cash,Math.max(deficit,Math.floor((deed.price*mult)/10)*10));
              if(askCash<deficit)continue;
              const trade={to:r.id,give:[deed.id],take:[],giveCash:0,takeCash:askCash,giveCards:0,takeCards:0};
              if(JSON.stringify(trade)===mem.lastSignature)continue;
              if(predictPartnerAcceptance(context,trade).willAccept){
                const offAct={type:'OFFER',trade,actionId:'nusa-buyphase-trade-'+deed.id};
                pushCandidate(offAct,topScore()+465);
                buyTradeFound=true;
                break;
              }
            }
            if(buyTradeFound)break;
          }
        }
      }
    }
  }

  // 2. BUILD-OFFER PHASE: Always contest scarce bank houses on highest-ambush Apex tile
  if(phase==='buildOffer'&&view.buildOffer?.pending?.includes(actor)){
    const joinCands=candidates.filter(c=>c.action.type==='BUILD_JOIN');
    if(joinCands.length>0){
      joinCands.sort((a,b)=>{
        const apexA=APEX_TILES.has(a.action.tile)?0.35:0;
        const apexB=APEX_TILES.has(b.action.tile)?0.35:0;
        const ambA=boardGraph.corridorRadar.tileRivalRollProb[a.action.tile]||0;
        const ambB=boardGraph.corridorRadar.tileRivalRollProb[b.action.tile]||0;
        return ((context.tileKillshot[b.action.tile]||0)*2+ambB*2+apexB)-
               ((context.tileKillshot[a.action.tile]||0)*2+ambA*2+apexA);
      });
      pushCandidate(joinCands[0].action,topScore()+455);
    }
  }

  // 3. MORTGAGE DECISION PHASE: Single-Pass Transfer Unmortgage
  if(phase==='mortgage'&&view.mortgageDecision?.player===actor){
    const mTile=view.mortgageDecision.tile;
    const rCost=redemption(mTile);
    const g=BOARD[mTile]?.group;
    const inMono=g>=0&&context.groups[g]?.fullSetOwned;
    if(self.cash-rCost>=context.trueReserve*0.55||inMono||BOARD[mTile]?.type==='station'){
      pushCandidate({type:'MORTGAGE_REDEEM',actionId:'nusa-single-pass-redeem-'+mTile},topScore()+365);
    }
  }

  // 4. AUCTION PHASE: Quantum 5-Nusa Sniper + Mid-Auction Flash Liquidity + Broker Bait Acquisition
  if(phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor){
    if(context.needsMidAuctionMortgage){
      const coll=context.isolatedMortgageable.find(d=>!managementError(view,actor,d.id,'MORTGAGE'));
      if(coll){
        const mortAct={type:'MORTGAGE',tile:coll.id,actionId:'nusa-midauction-mort-'+coll.id};
        pushCandidate(mortAct,topScore()+445);
      }
    }else if(context.needsMidAuctionTrade&&canTrade(view,actor)){
      const minBid=auctionMinBid;
      const deficit=minBid-self.cash;
      const mem=memoryFor(view,actor);
      const richRivals=context.rivals
        .filter(p=>p.id!==view.auction?.highest&&p.cash>=deficit+100&&!rejectionActive(view,mem,p.id))
        .sort((a,b)=>b.cash-a.cash);
      let midAuctionTradeFound=false;
      for(const r of richRivals){
        if(context.decisionContext?.expired())break;
        if(midAuctionTradeFound)break;
        for(const deed of context.isolatedMortgageable){
          if(context.decisionContext?.expired())break;
          if(deed.id===view.auction?.tile)continue;
          if(deed.group>=0){
            const oppCnt=GROUPS[deed.group].ids.filter(i=>view.assets[i]?.owner===r.id).length;
            if(oppCnt>=GROUPS[deed.group].ids.length-1)continue;
          }
          for(const mult of [0.95,0.85]){
            if(context.decisionContext?.expired())break;
            const askCash=Math.min(r.cash,Math.max(deficit,Math.floor((deed.price*mult)/10)*10));
            if(askCash<deficit)continue;
            const trade={to:r.id,give:[deed.id],take:[],giveCash:0,takeCash:askCash,giveCards:0,takeCards:0};
            if(JSON.stringify(trade)===mem.lastSignature)continue;
            if(predictPartnerAcceptance(context,trade).willAccept){
              pushCandidate({type:'OFFER',trade,actionId:'nusa-midauction-trade-'+deed.id},topScore()+460);
              midAuctionTradeFound=true;
              break;
            }
          }
          if(midAuctionTradeFound)break;
        }
      }
    }

    const qStep=auctionStep||10;
    const minBid=auctionMinBid;
    const ceiling=grandmasterAuctionCeiling(context);
    if(minBid<=ceiling&&minBid<=self.cash){
      const currentAmt=view.auction.amount||0;
      const gap=ceiling-currentAmt;
      const multStep=view.auction.kind==='building'?(gap>300?qStep*2:qStep):(gap>450?qStep*3:gap>200?qStep*2:qStep);
      const rawSmart=Math.min(ceiling,Math.max(minBid,currentAmt+multStep));
      const smartBid=Math.floor(rawSmart/qStep)*qStep;
      if(smartBid>=minBid){
        pushCandidate({type:'BID',amount:smartBid,actionId:'nusa-smart-bid-'+smartBid},topScore()+198);
      }
      if(smartBid!==minBid){
        pushCandidate({type:'BID',amount:minBid,actionId:'nusa-min-bid-'+minBid},topScore()+182);
      }
    }else if(!context.needsMidAuctionMortgage&&!context.needsMidAuctionTrade){
      pushCandidate({type:'PASS',actionId:'nusa-trap-pass'},topScore()+220);
    }
  }

  // 5. INCOMING TRADE PHASE: 3-Tier Extortionate Counter-Offer Engine (Powered by Desire Matrix)
  if(phase==='trade'&&view.trade&&view.trade.to===actor){
    const t=view.trade;
    const senderId=t.from;
    const senderCash=view.players[senderId]?.cash||0;
    const norm=normalizeTrade(context,{type:'TRADE_ACCEPT'});
    const evalScore=evaluateTradeForActor(context,norm);
    const acceptProj=projectWinProbabilityDelta(context,{type:'TRADE_ACCEPT'});

    if((view.botMemory?.negotiation?.depth||0)<2){
      const senderTargets=BOARD.filter(d=>{
        if(!d.price||view.assets[d.id]?.owner!==senderId||(view.assets[d.id]?.level||0)>0)return false;
        if(d.group>=0&&GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
        const completesOurs=d.group>=0&&context.groups[d.group].own===GROUPS[d.group].ids.length-1;
        const isInterceptionOrBroker=boardGraph.thirdPartyInterceptionTiles.has(d.id)||boardGraph.brokerTargetTiles.has(d.id)||context.chainTargetTiles?.has(d.id);
        const isHighStationOrHotspot=d.id===5||(d.group>=0&&[1,3,4].includes(d.group));
        return completesOurs||isInterceptionOrBroker||isHighStationOrHotspot;
      }).sort((a,b)=>completion(context,b.id,actor)-completion(context,a.id,actor)||(GROUP_TIER[b.group]||1)-(GROUP_TIER[a.group]||1));

      const trojanBaits=(boardGraph.trojanBaitForRival.get(senderId)||[]).map(x=>BOARD[x.tileId]).filter(Boolean);

      let counterSynthesized=false;

      // TIER 1: Monopoly / Broker Hijack Counter using Trojan Baits
      for(const targetDeed of senderTargets.slice(0,2)){
        if(context.decisionContext?.expired())break;
        if(counterSynthesized)break;
        const giveOptions=trojanBaits.slice(0,2).map(b=>[b.id]);
        giveOptions.push([]);
        for(const giveList of giveOptions){
          if(context.decisionContext?.expired())break;
          if(counterSynthesized)break;
          const cardSweetener=(context.canGiveJailCardSweetener&&(self.cards?.length||0)>0)?1:0;
          const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-900)/10)*10);
          const solved=solveOptimalTradeCash(context,{
            partnerId:senderId,
            giveList,
            takeList:[targetDeed.id],
            giveCards:cardSweetener,
            minOverpay:-200,
            maxOverpay:680,
            maxCashOffer:maxCash,
            partnerMaxCash:senderCash
          });
          if(solved){
            const cAct={type:'COUNTER',trade:solved.trade,actionId:'nusa-tier1-hijack-counter-'+targetDeed.id};
            const proj=projectWinProbabilityDelta(context,cAct);
            if(proj.deltaWinProb>0&&pushCandidate(cAct,topScore()+460)){
              counterSynthesized=true;
              break;
            }
          }
        }
      }

      // TIER 2: Extortionate Cash Toll Counter
      if(!counterSynthesized&&(t.take?.length||0)>0){
        const requestedSafe=t.take.every(tid=>{
          const b=BOARD[tid];
          if(!b||(view.assets[tid]?.level||0)>0)return false;
          if(b.group>=0&&context.groups[b.group].own>=2)return false;
          if(b.group>=0){
            const oppCnt=GROUPS[b.group].ids.filter(i=>view.assets[i]?.owner===senderId).length;
            if(oppCnt>=GROUPS[b.group].ids.length-1)return false;
          }
          return true;
        });
        if(requestedSafe&&(evalScore<0.12||acceptProj.deltaWinProb<=0)){
          const takeCandidates=senderTargets.length>0?[[senderTargets[0].id],[]]:[[]];
          for(const takeList of takeCandidates){
            if(context.decisionContext?.expired())break;
            if(counterSynthesized)break;
            const solvedToll=solveOptimalTradeCash(context,{
              partnerId:senderId,
              giveList:[...t.take],
              takeList,
              giveCards:0,
              minOverpay:-650,
              maxOverpay:-80,
              maxCashOffer:0,
              partnerMaxCash:senderCash
            });
            if(solvedToll&&solvedToll.trade.takeCash>0){
              const cAct={type:'COUNTER',trade:solvedToll.trade,actionId:'nusa-tier2-toll-counter-'+solvedToll.trade.takeCash};
              const proj=projectWinProbabilityDelta(context,cAct);
              if(proj.deltaWinProb>0&&pushCandidate(cAct,topScore()+395)){
                counterSynthesized=true;
                break;
              }
            }
          }
        }
      }

      // TIER 3: Toxic-Asset Swap Counter
      if(!counterSynthesized&&trojanBaits.length>0&&senderTargets.length>0){
        const toxicBait=trojanBaits.find(d=>d.type==='utility'||d.group===6)||trojanBaits[0];
        const primeTarget=senderTargets[0];
        const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-700)/10)*10);
        const solvedSwap=solveOptimalTradeCash(context,{
          partnerId:senderId,
          giveList:[toxicBait.id],
          takeList:[primeTarget.id],
          giveCards:0,
          minOverpay:-250,
          maxOverpay:350,
          maxCashOffer:maxCash,
          partnerMaxCash:senderCash
        });
        if(solvedSwap){
          const cAct={type:'COUNTER',trade:solvedSwap.trade,actionId:'nusa-tier3-toxic-swap-'+primeTarget.id};
          const proj=projectWinProbabilityDelta(context,cAct);
          if(proj.deltaWinProb>0){
            pushCandidate(cAct,topScore()+365);
          }
        }
      }
    }
  }

  // 6. DEBT EMERGENCY RESCUE TRADE
  if(phase==='debt'&&view.debt?.from===actor&&self.cash<view.debt.amount&&canTrade(view,actor)&&context.roundTradeCount<2){
    const deficit=view.debt.amount-self.cash;
    if(context.liquidBuffer<deficit&&context.isolatedMortgageable.length>0){
      const mem=memoryFor(view,actor);
      const richRivals=context.rivals.filter(p=>p.cash>=400&&!rejectionActive(view,mem,p.id)).sort((a,b)=>b.cash-a.cash);
      let debtTradeSynthesized=false;
      for(const r of richRivals){
        if(context.decisionContext?.expired())break;
        if(debtTradeSynthesized)break;
        for(const deed of context.isolatedMortgageable){
          if(context.decisionContext?.expired())break;
          if(deed.group>=0){
            const oppCnt=GROUPS[deed.group].ids.filter(i=>view.assets[i]?.owner===r.id).length;
            if(oppCnt>=GROUPS[deed.group].ids.length-1)continue;
          }
          for(const mult of [1.0,0.92,0.85]){
            if(context.decisionContext?.expired())break;
            const askCash=Math.min(r.cash,Math.max(deed.mortgage+100,Math.floor((deed.price*mult)/10)*10));
            if(askCash<=deed.mortgage)continue;
            const trade={to:r.id,give:[deed.id],take:[],giveCash:0,takeCash:askCash,giveCards:0,takeCards:0};
            if(JSON.stringify(trade)===mem.lastSignature)continue;
            if(predictPartnerAcceptance(context,trade).willAccept){
              pushCandidate({type:'OFFER',trade,actionId:'nusa-debt-rescue-'+deed.id},topScore()+485);
              debtTradeSynthesized=true;
              break;
            }
          }
          if(debtTradeSynthesized)break;
        }
      }
    }
  }

  // 7. JAIL PHASE: Spatial Corridor Check
  if(phase==='jail'&&view.turn===actor&&context.unowned.length>=5&&context.nearLoss<420&&boardGraph.corridorRadar.spatialDangerFactor<1.15){
    if(self.cards?.length>0){
      pushCandidate({type:'JAIL_CARD',actionId:'nusa-early-jail-card'},topScore()+265);
    }else if(self.cash-500>=context.trueReserve+1200){
      pushCandidate({type:'JAIL_PAY',actionId:'nusa-early-jail-pay'},topScore()+245);
    }
  }

  if(phase==='roll'&&view.turn===actor&&context.shouldDeferPreRollBuild){
    pushCandidate({type:'ROLL',actionId:'nusa-disciplined-roll'},topScore()+(context.hasPendingRivalRentClaim?485:355));
  }

  // 8. POST-ROLL / JAIL DEVELOPMENT: Spatial-Corridor Prioritized Building & Macro Attachment
  if(['roll','end','jail'].includes(phase)&&view.turn===actor&&canManage(view,actor)&&!context.shouldDeferPreRollBuild){
    for(const g of context.groups){
      if(context.decisionContext?.expired())break;
      if(g.fullSetOwned&&g.mortgagedCount>0){
        const mTile=g.ids.find(id=>view.assets[id]?.mortgaged);
        if(mTile!==undefined){
          const rCost=redemption(mTile);
          if(self.cash-rCost>=context.trueReserve*0.45&&!managementError(view,actor,mTile,'REDEEM')){
            const redAct={type:'REDEEM',tile:mTile,actionId:'nusa-redeem-mono-'+mTile};
            const firstBuild={type:'BUILD',tile:g.apexTile};
            pushCandidate(redAct,topScore()+410,[redAct,firstBuild]);
          }else if(self.cash+context.liquidBuffer-rCost>=context.trueReserve*0.50){
            const coll=context.isolatedMortgageable.find(d=>!managementError(view,actor,d.id,'MORTGAGE'));
            if(coll){
              const mortAct={type:'MORTGAGE',tile:coll.id,actionId:'nusa-leverage-redeem-'+coll.id};
              pushCandidate(mortAct,topScore()+390,[mortAct,{type:'REDEEM',tile:mTile}]);
            }
          }
        }
      }
    }

    const maxTargetLevel=4;
    const buildGroups=context.groups
      .filter(g=>g.complete&&g.levelMin<maxTargetLevel)
      .sort((a,b)=>(b.ambushIntensity*1.8+b.tier)-(a.ambushIntensity*1.8+a.tier));

    for(const g of buildGroups){

      if(context.decisionContext?.expired())break;
      const levelMin=g.levelMin;
      const lockHouses=(context.sariPresent||context.rivalMonopolies>0||context.rivalHasHotel)?context.bank.houses<=18:context.bank.houses<=14;
      if(levelMin===4&&lockHouses)continue;

      const validTiles=g.ids
        .filter(id=>!managementError(view,actor,id,'BUILD'))
        .sort((x,y)=>{
          const apexX=APEX_TILES.has(x)?0.45:0;
          const apexY=APEX_TILES.has(y)?0.45:0;
          const ambX=boardGraph.corridorRadar.tileRivalRollProb[x]||0;
          const ambY=boardGraph.corridorRadar.tileRivalRollProb[y]||0;
          const scoreX=(context.tileKillshot[x]||0)*2.5+ambX*2.2+apexX;
          const scoreY=(context.tileKillshot[y]||0)*2.5+ambY*2.2+apexY;
          return scoreY-scoreX;
        });

      if(validTiles.length>0){
        const bestTile=validTiles[0];
        const bCost=BOARD[bestTile].build;
        const safetyFloor=(levelMin<3||context.hotelTrapActive)?context.trueReserve*0.42:context.trueReserve*0.78;
        if(self.cash-bCost>=safetyFloor){
          const ambushBoost=g.ambushIntensity>=0.20?25:0;
          const trapBoost=context.hotelTrapActive?420:(levelMin<3?400+ambushBoost:245+ambushBoost);
          const buildAct={type:'BUILD',tile:bestTile,actionId:'nusa-build-'+bestTile};
          const macroSeq=[buildAct];
          if(validTiles.length>1&&self.cash-bCost*2>=safetyFloor){
            macroSeq.push({type:'BUILD',tile:validTiles[1]});
          }
          pushCandidate(buildAct,topScore()+trapBoost,macroSeq);
        }else if(levelMin<3||context.hotelTrapActive){
          const collateral=context.isolatedMortgageable.find(t=>!managementError(view,actor,t.id,'MORTGAGE'));
          if(collateral&&self.cash+collateral.mortgage-bCost>=safetyFloor*0.85){
            const mortAct={type:'MORTGAGE',tile:collateral.id,actionId:'nusa-leverage-build-'+collateral.id};
            pushCandidate(mortAct,topScore()+370,[mortAct,{type:'BUILD',tile:bestTile}]);
          }
        }
      }
    }

    if(context.canDeleverage&&phase==='end'){
      const redeemTargets=context.mortgagedOwned
        .filter(t=>!context.cloakedMonopolyGroups?.has(t.group)&&!managementError(view,actor,t.id,'REDEEM')&&self.cash-redemption(t.id)>=context.trueReserve+900)
        .sort((a,b)=>(b.type==='station'?1:0)-(a.type==='station'?1:0)||b.price-a.price);
      if(redeemTargets.length>0){
        const rt=redeemTargets[0];
        pushCandidate({type:'REDEEM',tile:rt.id,actionId:'nusa-deleverage-'+rt.id},topScore()+225);
      }
    }
  }

  // 9. OMNISCIENT HYPERGRAPH TRADE SYNTHESIS (1-Hop Trojan Buyout, 2-Hop Broker, Interdiction, Double-Sweep)
  if(phase==='end'&&view.turn===actor&&canTrade(view,actor)&&context.roundTradeCount<3){
    for(const c of candidates){
      if(context.decisionContext?.expired())break;
      if(c.action.type==='OFFER'){
        const norm=normalizeTrade(context,c.action);
        const s=evaluateTradeForActor(context,norm);
        const oracle=predictPartnerAcceptance(context,c.action.trade);
        if(oracle.willAccept&&s>=0.22&&oracle.myEval.net>0&&oracle.myEval.deltaShare>=oracle.myEval.partnerDelta){
          c.score=Math.max(c.score+220,topScore()+200*s);
        }else if(!oracle.willAccept){
          c.score-=1500;
        }
      }
    }

    const mem=memoryFor(view,actor);
    let synthesizedCount=0;

    // A. 1-HOP DIRECT & TROJAN-BAIT MONOPOLY BUYOUT + 2-HOP BROKER ACQUISITION
    for(const bp of boardGraph.brokerPlans){
      if(context.decisionContext?.expired())break;
      if(synthesizedCount>=3)break;
      const {groupId:gId,tier,houseCost,missingTile,keyHolderId:targetOwner,directBaits,twoHopBaits}=bp;
      const g=context.groups[gId];
      if(g.ids.some(id=>(view.assets[id]?.level||0)>0))continue;

      let directSolved=false;
      if(!rejectionActive(view,mem,targetOwner)){
        const partnerMaxCash=view.players[targetOwner]?.cash||0;
        const isCatchUpPartner=context.catchUpPartners?.has(targetOwner);
        const packages=[];
        for(const b of directBaits.slice(0,3))packages.push([b.tileId]);
        if(directBaits.length>=2)packages.push([directBaits[0].tileId,directBaits[1].tileId]);
        packages.push([]);

        const cardOptions=(context.canGiveJailCardSweetener&&(self.cards?.length||0)>0)?[1,0]:[0];
        const maxOverpayCap=Math.round(780*tier+(isCatchUpPartner?180:0));

        for(const giveList of packages){

          if(context.decisionContext?.expired())break;
          if(directSolved)break;
          const surrenderedBuffer=giveList.reduce((n,id)=>n+(view.assets[id]?.mortgaged?0:(BOARD[id]?.mortgage||0)),0);
          const remainingBuffer=Math.max(0,context.liquidBuffer-surrenderedBuffer);
          const minBuildNeed=Math.max(0,houseCost*2+context.trueReserve*0.40-remainingBuffer*0.85);
          const maxCashOffer=Math.max(0,Math.floor((self.cash-minBuildNeed)/10)*10);

          for(const giveCards of cardOptions){

            if(context.decisionContext?.expired())break;
            if(directSolved)break;
            const solved=solveOptimalTradeCash(context,{
              partnerId:targetOwner,
              giveList,
              takeList:[missingTile],
              giveCards,
              minOverpay:isCatchUpPartner?-420:-300,
              maxOverpay:maxOverpayCap,
              maxCashOffer,
              partnerMaxCash
            });
            if(solved&&JSON.stringify(solved.trade)!==mem.lastSignature){
              const action={
                type:'OFFER',
                trade:solved.trade,
                actionId:'nusa-bsearch-buyout-'+missingTile+'-'+solved.trade.giveCash
              };
              const buildFollowUp={type:'BUILD',tile:g.apexTile};
              if(pushCandidate(action,topScore()+435+(giveCards*15)+(isCatchUpPartner?25:0),[action,buildFollowUp])){
                synthesizedCount++;
                directSolved=true;
                break;
              }
            }
          }
        }

        // Pre-Trade Liquidity Mortgage if direct buyout only failed due to cash cap
        if(!directSolved&&canManage(view,actor)&&context.isolatedMortgageable.length>0){
          const giveList=packages[0]||[];
          const nonBaitColl=context.isolatedMortgageable.find(d=>!giveList.includes(d.id)&&!managementError(view,actor,d.id,'MORTGAGE'));
          if(nonBaitColl){
            const boostedView={
              ...view,
              players:view.players.map((p,i)=>i===actor?{...p,cash:p.cash+nonBaitColl.mortgage}:p),
              assets:{...view.assets,[nonBaitColl.id]:{...view.assets[nonBaitColl.id],mortgaged:true}}
            };
            const boostedMaxCash=Math.max(0,Math.floor(((self.cash+nonBaitColl.mortgage)-houseCost*1.5)/10)*10);
            const solvedBoost=solveOptimalTradeCash(context,{
              partnerId:targetOwner,
              giveList,
              takeList:[missingTile],
              giveCards:0,
              minOverpay:0,
              maxOverpay:maxOverpayCap,
              maxCashOffer:boostedMaxCash,
              partnerMaxCash,
              stateOverride:boostedView
            });
            if(solvedBoost){
              const mortAct={type:'MORTGAGE',tile:nonBaitColl.id,actionId:'nusa-pretrade-mort-'+nonBaitColl.id};
              const offAct={type:'OFFER',trade:solvedBoost.trade};
              if(pushCandidate(mortAct,topScore()+422,[mortAct,offAct])){
                synthesizedCount++;
                directSolved=true;
              }
            }
          }
        }
      }

      // B. 2-HOP BROKER ACQUISITION ("Si A butuh Y, dan Y dipegang Si B -> Ambil Y dari Si B sekarang!")
      if(!directSolved&&twoHopBaits.length>0){
        for(const hop of twoHopBaits){
          if(context.decisionContext?.expired())break;
          if(synthesizedCount>=3)break;
          const partyB=hop.baitOwner;
          if(partyB==null||partyB===actor||rejectionActive(view,mem,partyB))continue;
          const baitsForB=(boardGraph.trojanBaitForRival.get(partyB)||[]).slice(0,2).map(x=>[x.tileId]);
          baitsForB.push([]);
          const maxCashB=Math.max(0,Math.floor((self.cash-context.trueReserve-houseCost*2)/10)*10);
          const partnerCashB=view.players[partyB]?.cash||0;

          let hopSolved=false;
          for(const giveListB of baitsForB){
            if(context.decisionContext?.expired())break;
            if(hopSolved)break;
            const solvedB=solveOptimalTradeCash(context,{
              partnerId:partyB,
              giveList:giveListB,
              takeList:[hop.baitTile],
              giveCards:0,
              minOverpay:-240,
              maxOverpay:320,
              maxCashOffer:maxCashB,
              partnerMaxCash:partnerCashB
            });
            if(solvedB&&JSON.stringify(solvedB.trade)!==mem.lastSignature){
              const step1Act={
                type:'OFFER',
                trade:solvedB.trade,
                actionId:'nusa-2hop-broker-step1-'+hop.baitTile+'-for-'+missingTile
              };
              const step2Trade={
                to:targetOwner,
                give:[hop.baitTile],
                take:[missingTile],
                giveCash:Math.max(0,Math.round(((BOARD[missingTile]?.price||0)-(BOARD[hop.baitTile]?.price||0)+180)/10)*10),
                takeCash:0,
                giveCards:0,
                takeCards:0
              };
              if(pushCandidate(step1Act,topScore()+415,[step1Act,{type:'OFFER',trade:step2Trade}])){
                synthesizedCount++;
                hopSolved=true;
                break;
              }
            }
          }
        }
      }
    }

    // C. PREEMPTIVE THIRD-PARTY MONOPOLY INTERDICTION ("Rebut kunci grup Si A dari tangan Si B!")
    if(synthesizedCount<3&&boardGraph.thirdPartyInterceptions.length>0){
      for(const inter of boardGraph.thirdPartyInterceptions){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=3)break;
        const holderB=inter.holderRivalId;
        if(rejectionActive(view,mem,holderB))continue;
        const baitsForB=(boardGraph.trojanBaitForRival.get(holderB)||[])
          .filter(x=>BOARD[x.tileId]?.group!==inter.groupId)
          .slice(0,2)
          .map(x=>[x.tileId]);
        baitsForB.push([]);
        const maxCashB=Math.max(0,Math.floor((self.cash-context.trueReserve-900)/10)*10);
        const solvedInter=baitsForB.map(giveList=>solveOptimalTradeCash(context,{
          partnerId:holderB,
          giveList,
          takeList:[inter.tileId],
          giveCards:0,
          minOverpay:-220,
          maxOverpay:280,
          maxCashOffer:maxCashB,
          partnerMaxCash:view.players[holderB]?.cash||0
        })).find(Boolean);

        if(solvedInter&&JSON.stringify(solvedInter.trade)!==mem.lastSignature){
          const act={
            type:'OFFER',
            trade:solvedInter.trade,
            actionId:'nusa-interdict-snatch-'+inter.tileId
          };
          if(pushCandidate(act,topScore()+412)){
            synthesizedCount++;
          }
        }
      }
    }

    // D. 1-STEP DOUBLE-DEED MONOPOLY SWEEP (1/3 -> 3/3)
    if(synthesizedCount<3&&context.doubleSweepGroups.length>0){
      for(const ds of context.doubleSweepGroups){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=3)break;
        const partnerId=ds.partnerId;
        if(rejectionActive(view,mem,partnerId))continue;
        const sweepBaits=(boardGraph.trojanBaitForRival.get(partnerId)||[])
          .filter(x=>BOARD[x.tileId]?.group!==ds.groupId);

        const sweepBundles=[];
        if(sweepBaits.length>=2)sweepBundles.push([sweepBaits[0].tileId,sweepBaits[1].tileId]);
        for(const b of sweepBaits.slice(0,2))sweepBundles.push([b.tileId]);

        const cardSweetener=(context.canGiveJailCardSweetener&&(self.cards?.length||0)>0)?1:0;
        for(const giveList of sweepBundles){
          if(context.decisionContext?.expired())break;
          const surrenderedBuffer=giveList.reduce((n,id)=>n+(view.assets[id]?.mortgaged?0:(BOARD[id]?.mortgage||0)),0);
          const remainingBuffer=Math.max(0,context.liquidBuffer-surrenderedBuffer);
          const minBuildRes=Math.max(0,ds.houseCost*2+context.trueReserve*0.40-remainingBuffer*0.85);
          const maxCashOffer=Math.max(0,Math.floor((self.cash-minBuildRes)/10)*10);
          const solvedSweep=solveOptimalTradeCash(context,{
            partnerId,
            giveList,
            takeList:ds.missingPair,
            giveCards:cardSweetener,
            minOverpay:-100,
            maxOverpay:900,
            maxCashOffer,
            partnerMaxCash:view.players[partnerId]?.cash||0
          });
          if(solvedSweep&&JSON.stringify(solvedSweep.trade)!==mem.lastSignature){
            const action={type:'OFFER',trade:solvedSweep.trade,actionId:'nusa-bsearch-sweep-'+ds.groupId};
            if(pushCandidate(action,topScore()+430)){
              synthesizedCount++;
              break;
            }
          }
        }
      }
    }
  }

  ensureChronosCandidates(context,plan);
  plan._nusaExpansionKey=expansionKey;
  return plan;
}

function compatible(base,action,phase,context){
  if(eq(base,action))return true;
  if(protectedType(base)||protectedType(action))return false;
  if(phase==='buy'){
    const allowedBuy=context.needsPreBuyMortgage
      ?['BUY','AUCTION','MORTGAGE']
      :context.needsPreBuyTrade
        ?['BUY','AUCTION','OFFER']
        :['BUY','AUCTION'];
    return allowedBuy.includes(base.type)&&allowedBuy.includes(action.type);
  }
  if(phase==='auction'){
    const allowedAuction=context.needsMidAuctionMortgage
      ?['BID','PASS','MORTGAGE']
      :context.needsMidAuctionTrade
        ?['BID','PASS','OFFER']
        :['BID','PASS'];
    return allowedAuction.includes(base.type)&&allowedAuction.includes(action.type);
  }
  if(phase==='trade')return ['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(base.type)&&['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(action.type);
  if(phase==='jail'){
    const allowedJail=['JAIL_PAY','JAIL_CARD','ROLL','BUILD','REDEEM'];
    return allowedJail.includes(base.type)&&allowedJail.includes(action.type);
  }
  if(phase==='buildOffer')return ['BUILD_JOIN','BUILD_DECLINE'].includes(base.type)&&['BUILD_JOIN','BUILD_DECLINE'].includes(action.type);
  if(phase==='mortgage')return ['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(base.type)&&['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(action.type);
  if(phase==='debt')return ['MORTGAGE','SELL','SELL_SET','OFFER'].includes(base.type)&&['MORTGAGE','SELL','SELL_SET','OFFER'].includes(action.type);

  if(phase==='roll'||phase==='end'){
    if(action.type==='SELL'||action.type==='SELL_SET')return false;
    if(action.type==='MORTGAGE'){
      const aid=String(action.actionId||'');
      const isSpecialMort=aid.startsWith('nusa-stealth-cloak-')||aid.startsWith('nusa-pretrade-mort-')||aid.startsWith('nusa-leverage-')||aid.startsWith('nusa-preend-');
      const isIsolatedLeverage=context.isolatedMortgageable.some(d=>d.id===action.tile)&&context.needsBuildCapital&&!context.shouldDeferPreRollBuild;
      if(!isSpecialMort&&!isIsolatedLeverage)return false;
    }
    const allowedTurnTypes=phase==='roll'
      ?(context.shouldDeferPreRollBuild?['ROLL','BUILD','REDEEM']:['ROLL','BUILD','REDEEM','MORTGAGE'])
      :['END','BUILD','REDEEM','MORTGAGE','OFFER'];
    return allowedTurnTypes.includes(base.type)&&allowedTurnTypes.includes(action.type);
  }
  return base.type===action.type;
}

function computeAdvisory(signals,context,salary,action){
  if(!signals.length)return {advisory:0,bonus:0};
  let weightedSum=0,weightTotal=0;
  for(const s of signals){
    const w=weightFor(s.id,context);
    weightedSum+=s.signal*w;
    weightTotal+=w;
  }
  const norm=weightedSum/Math.max(1,Math.sqrt(weightTotal));
  let momentum=0;
  if(norm>0.20){
    const aid=String(action.actionId||'');
    if(action.type==='BUILD'||action.type==='BUILD_JOIN')momentum=salary*0.17;
    else if((action.type==='REDEEM'||action.type==='MORTGAGE_REDEEM')&&(context.hasMortgagedMonopoly||context.canDeleverage||context.view.phase==='mortgage'))momentum=salary*0.16;
    else if(action.type==='MORTGAGE'&&(context.needsPreBuyMortgage||context.needsMidAuctionMortgage||aid.startsWith('nusa-stealth-cloak-')||aid.startsWith('nusa-pretrade-mort-')||aid.startsWith('nusa-leverage-')))momentum=salary*0.19;
    else if(action.type==='OFFER'&&(norm>0.35||context.needsPreBuyTrade||context.needsMidAuctionTrade))momentum=salary*0.19;
    else if(action.type==='COUNTER'&&norm>0.35)momentum=salary*0.18;
    else if(action.type==='BUY'&&norm>0.25)momentum=salary*0.14;
    else if(action.type==='AUCTION'&&context.earlyCashSinkTiles?.has(context.view.buy))momentum=salary*0.16;
    else if(action.type==='ROLL'&&context.shouldDeferPreRollBuild)momentum=salary*0.18;
  }
  const bonus=Math.max(-salary*0.54,Math.min(salary*0.54,norm*salary*0.29+momentum));
  return {advisory:norm,bonus};
}

export function nusaV7Decision(state,actor,plan,{diagnostics=false,disabled=[],context:decisionContext}={}){
  let telemetry=null;
  const fallback=(reason,extra={})=>({action:plan?.action??null,changed:false,reason,temporalTelemetry:telemetry,...extra});
  if(decisionContext?.expired())return fallback('council_budget_exhausted');
  if(!plan?.action||protectedType(plan.action)||(plan.candidates?.[0]?.score??0)>=1e7)return fallback('protected_or_trivial');
  if(!['auction','buy','roll','end','trade','jail','buildOffer','mortgage','debt'].includes(state.phase))return fallback('protected_phase');

  const context={...situationOf(state,actor,plan,decisionContext),decisionContext};
  telemetry=temporalTelemetry(context);
  ensureSovereignCandidates(context,plan);

  const base=plan.action,candidates=plan.candidates||[];
  if(candidates.length<2)return fallback('single_candidate');

  const salary=context.salary;
  const allowed=new Set(STRATEGY_EXPERTS.map(x=>x.id));
  if(disabled.some(id=>!allowed.has(id)))throw Error('Unknown NUSA expert ablation: '+disabled.find(id=>!allowed.has(id)));

  const eligible=candidates.filter(c=>compatible(base,c.action,state.phase,context));
  if(eligible.length<2)return fallback('no_compatible_alternative');

  const ranked=eligible.map(c=>{
    const signals=runExperts(context,c.action).filter(s=>!disabled.includes(s.id));
    const {advisory,bonus}=computeAdvisory(signals,context,salary,c.action);
    return {...c,bonus,advisory,signals,unified:c.score+bonus};
  }).sort((x,y)=>y.unified-x.unified||x.id.localeCompare(y.id));

  const current=ranked.find(c=>eq(c.action,base));
  if(!current)return fallback('baseline_not_ranked');
  const best=ranked[0];
  const improvement=best.unified-current.unified;

  const changeAllowed=!eq(best.action,base)&&
    improvement>Math.max(5,salary*0.002)&&
    best.score>=current.score-salary*0.92&&
    legalCandidate(context.view,actor,best.action);

  const result={
    action:changeAllowed?best.action:base,
    changed:changeAllowed,
    temporalTelemetry:telemetry,
    reason:changeAllowed?'chronos_kairos_v23_selected':'native_plan_preserved',
    rankedPool:ranked
  };

  if(diagnostics){
    result.context={
      stage:context.stage,live:context.live,unowned:context.unowned.length,
      bankHouses:context.bank.houses,reserve:Math.round(context.reserve),
      trueReserve:Math.round(context.trueReserve),
      spatialDangerFactor:context.boardGraph.corridorRadar.spatialDangerFactor,
      brokerPlans:context.boardGraph.brokerPlans.length,
      brokerTargets:context.boardGraph.brokerTargetTiles.size,
      thirdPartyInterceptions:context.boardGraph.thirdPartyInterceptions.length,
      hostageGroupsHeld:context.boardGraph.hostageGroupsHeld,
      effectiveTradeCash:context.effectiveTradeCash,canUsePovertyCloak:context.canUsePovertyCloak,
      auctionStep:context.auctionStep,hotelTrapActive:context.hotelTrapActive,
      winProbability:+context.winProbability.toFixed(3),isCriticalTurn:context.isCriticalTurn
    };
    result.proposals=ranked.slice(0,8).map(c=>({id:c.id,type:c.action.type,score:+c.score.toFixed(2),unified:+c.unified.toFixed(2)}));
    result.expertCount=STRATEGY_EXPERTS.length;
    result.candidateCount=candidates.length;
    result.eligibleCount=eligible.length;
  }
  return result;
}
