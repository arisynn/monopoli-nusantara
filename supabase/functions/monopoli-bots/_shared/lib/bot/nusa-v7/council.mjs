/** NUSA V20.0 "Apotheosis — 2x Power Multiplier" Council.
 * 1. Closed-Form Binary-Search Trade Synthesis (`solveOptimalTradeCash`).
 * 2. Multi-Step Pre-Trade Liquidity Sequencer (`nusa-pretrade-mort-` -> `OFFER` -> `BUILD`).
 * 3. Poverty Illusion Buyout (Uses `liquidBuffer` for post-trade houses while keeping visible cash low).
 * 4. Full Isolated-Asset Leverage for 3-House Sweet-Spot Construction.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {canTrade,canManage,redemption,managementError} from '../../game.mjs';
import {legalCandidate} from '../candidates.mjs';
import {liquidityPenalty} from '../analysis.mjs';
import {rejectionActive} from '../concessions.mjs';
import {memoryFor} from '../memory.mjs';
import {situationOf,APEX_TILES} from './situation.mjs';
import {
  runExperts,STRATEGY_EXPERTS,grandmasterAuctionCeiling,GROUP_TIER,
  normalizeTrade,evaluateTradeForActor,completion,block,valuation,
  predictPartnerAcceptance,getBilateralTradeEvaluation,solveOptimalTradeCash
} from './experts.mjs';

export const NUSA_V7_VERSION='20.0.0-apotheosis-2x-power-multiplier';

export function cleanAction(a){
  if(!a||typeof a!=='object')return a;
  const {actionId,...rest}=a;
  return rest;
}
export const eq=(a,b)=>JSON.stringify(cleanAction(a))===JSON.stringify(cleanAction(b));
const protectedType=a=>['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT'].includes(a?.type);

const STAGE_WEIGHTS={
  acquisition:{
    postRollDiscipline:3.0,contestedAnchor:3.0,earlySelectivity:2.9,auctionTrap:2.8,
    earlyBlitz:2.8,chainAccumulator:2.8,cardCycleTracker:2.4,buildingAuctionSniper:2.9,
    midAuctionLiquidity:3.0,queueLookahead:2.8,hotelTrapExploiter:2.5,mechanicsSage:2.8,
    crossPhaseTrade:3.1,collusionInterdictor:2.9,counterHijacker:3.0,psychProfiler:2.7,
    stealthCloaker:3.0,coalitionArbitrage:2.9,doubleDeedSweep:3.1,vultureHarvester:2.9,
    povertyCloak:3.1,preTradeLeverage:3.1,binaryTradeSolver:3.0,velocitySwap:2.9,
    portfolio:2.1,completion:2.6,blocking:2.4,auction:2.9,
    negotiation:2.5,trajectorySolver:2.9,steppingStone:2.2,jail:2.5,flashLiquidity:2.6
  },
  development:{
    postRollDiscipline:3.1,development:2.9,scarcity:2.6,chainAccumulator:2.9,
    cardCycleTracker:2.5,buildingAuctionSniper:3.0,contestedAnchor:2.4,
    midAuctionLiquidity:3.1,queueLookahead:2.9,hotelTrapExploiter:3.0,mechanicsSage:2.9,
    crossPhaseTrade:3.1,collusionInterdictor:3.0,counterHijacker:3.1,psychProfiler:2.8,
    stealthCloaker:3.2,coalitionArbitrage:3.0,doubleDeedSweep:3.2,vultureHarvester:3.0,
    povertyCloak:3.3,preTradeLeverage:3.2,binaryTradeSolver:3.1,velocitySwap:3.1,
    auction:2.7,flashLiquidity:2.8,mortgage:2.6,negotiation:2.6,trajectorySolver:2.9,
    asymmetricSwap:2.7,steppingStone:2.4,killshot:2.6,jail:2.5
  },
  contested:{
    postRollDiscipline:3.1,scarcity:2.8,development:2.8,chainAccumulator:2.8,
    cardCycleTracker:2.5,buildingAuctionSniper:3.0,midAuctionLiquidity:3.1,
    queueLookahead:3.0,hotelTrapExploiter:3.1,mechanicsSage:2.9,
    crossPhaseTrade:3.1,collusionInterdictor:3.1,counterHijacker:3.1,psychProfiler:2.9,
    stealthCloaker:3.2,coalitionArbitrage:3.1,doubleDeedSweep:3.2,vultureHarvester:3.1,
    povertyCloak:3.3,preTradeLeverage:3.2,binaryTradeSolver:3.1,velocitySwap:3.2,
    flashLiquidity:2.7,mortgage:2.6,negotiation:2.6,trajectorySolver:2.9,
    asymmetricSwap:2.7,killshot:2.9,endgame:2.5,counterTrade:2.4,jail:2.5
  },
  endgame:{
    postRollDiscipline:3.0,endgame:2.8,scarcity:2.7,buildingAuctionSniper:3.0,
    midAuctionLiquidity:3.1,queueLookahead:3.0,hotelTrapExploiter:3.1,mechanicsSage:2.9,
    crossPhaseTrade:3.0,collusionInterdictor:3.0,counterHijacker:3.1,psychProfiler:2.8,
    stealthCloaker:3.1,coalitionArbitrage:3.0,doubleDeedSweep:3.1,vultureHarvester:3.2,
    povertyCloak:3.2,preTradeLeverage:3.1,binaryTradeSolver:3.0,velocitySwap:3.1,
    cardCycleTracker:2.4,flashLiquidity:2.6,mortgage:2.6,killshot:3.0,bankruptcy:2.8,jail:2.6
  }
};

function weightFor(expertId,context){
  const table=STAGE_WEIGHTS[context.stage]||{};
  return table[expertId]||1.30;
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
  return nativeScore+artificialDrag*0.85;
}

export function ensureSovereignCandidates(context,plan){
  const candidates=plan?.candidates;
  if(!Array.isArray(candidates))return plan;
  const {view,actor,self,auctionStep,auctionMinBid}=context;
  const phase=view.phase;
  const topScore=()=>Math.max(0,...candidates.map(c=>c.score));

  const pushCandidate=(action,score)=>{
    if(!action||context.decisionContext?.expired())return false;
    const existing=candidates.find(c=>eq(c.action,action));
    if(existing){
      if(score>existing.score){
        existing.score=score;
        if(action.actionId)existing.action.actionId=action.actionId;
      }
      return true;
    }
    const id=action.actionId||('nusa-'+candidates.length);
    const withId={...action,actionId:id};
    if(legalCandidate(view,actor,withId)){
      candidates.push({id,action:withId,score,expanded:true});
      return true;
    }
    return false;
  };

  for(const c of candidates){

    if(context.decisionContext?.expired())break;
    c.score=sovereignScoreRebase(context,c.action,c.score);
  }

  // 0. EARLY-GAME SELECTIVE BUY vs AUCTION TRAP, PRE-BUY MORTGAGE, & CROSS-PHASE BUY-RESCUE TRADE!
  if(phase==='buy'&&view.turn===actor&&Number.isInteger(view.buy)){
    const tId=view.buy,bTile=BOARD[tId];
    if(bTile?.price){
      const comp=completion(context,tId,actor);
      const blk=block(context,tId);
      const val=valuation(context,tId);
      const isContestedAnchor=context.contestedAnchorTiles?.has(tId);
      const isCashSink=context.earlyCashSinkTiles?.has(tId);
      const isStrategic=isContestedAnchor||comp>=0.85||blk>=0.65||val>=bTile.price*1.12||bTile.type==='station';

      if(isCashSink&&!isContestedAnchor&&comp<0.50&&blk<0.50){
        pushCandidate({type:'AUCTION',actionId:'nusa-selective-auction-'+tId},topScore()+280);
      }else if(self.cash>=bTile.price){
        if(isStrategic||self.cash-bTile.price>=context.trueReserve*0.50){
          pushCandidate({type:'BUY',actionId:'nusa-buy-'+tId},topScore()+(isContestedAnchor?340:280));
        }
      }else if(isStrategic&&self.cash+context.liquidBuffer>=bTile.price+context.trueReserve*0.25){
        const coll=context.isolatedMortgageable.find(d=>d.id!==tId&&!managementError(view,actor,d.id,'MORTGAGE'));
        if(coll){
          pushCandidate({type:'MORTGAGE',tile:coll.id,actionId:'nusa-prebuy-mort-'+coll.id},topScore()+420);
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
              const oracle=predictPartnerAcceptance(context,trade);
              if(oracle.willAccept){
                pushCandidate({type:'OFFER',trade,actionId:'nusa-buyphase-trade-'+deed.id},topScore()+460);
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

  // 1. AUCTION PHASE (5-Nusa Quantum Aware!) & BUILDING OFFER PHASE
  if(phase==='buildOffer'&&view.buildOffer?.pending?.includes(actor)){
    const joinCands=candidates.filter(c=>c.action.type==='BUILD_JOIN');
    if(joinCands.length>0){
      joinCands.sort((a,b)=>{
        const apexA=APEX_TILES.has(a.action.tile)?0.35:0;
        const apexB=APEX_TILES.has(b.action.tile)?0.35:0;
        return ((context.tileKillshot[b.action.tile]||0)*2+(context.immediateVisits[b.action.tile]||0)+apexB)-
               ((context.tileKillshot[a.action.tile]||0)*2+(context.immediateVisits[a.action.tile]||0)+apexA);
      });
      pushCandidate(joinCands[0].action,topScore()+450);
    }
  }

  if(phase==='mortgage'&&view.mortgageDecision?.player===actor){
    const mTile=view.mortgageDecision.tile;
    const rCost=redemption(mTile);
    const g=BOARD[mTile]?.group;
    const inMono=g>=0&&context.groups[g]?.fullSetOwned;
    if(self.cash-rCost>=context.trueReserve*0.55||inMono||BOARD[mTile]?.type==='station'){
      pushCandidate({type:'MORTGAGE_REDEEM',actionId:'nusa-single-pass-redeem-'+mTile},topScore()+360);
    }
  }

  if(phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor){
    if(context.needsMidAuctionMortgage){
      const coll=context.isolatedMortgageable.find(d=>!managementError(view,actor,d.id,'MORTGAGE'));
      if(coll){
        pushCandidate({type:'MORTGAGE',tile:coll.id,actionId:'nusa-midauction-mort-'+coll.id},topScore()+440);
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
            const oracle=predictPartnerAcceptance(context,trade);
            if(oracle.willAccept){
              pushCandidate({type:'OFFER',trade,actionId:'nusa-midauction-trade-'+deed.id},topScore()+455);
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
        pushCandidate({type:'BID',amount:smartBid,actionId:'nusa-smart-bid-'+smartBid},topScore()+195);
      }
      if(smartBid!==minBid){
        pushCandidate({type:'BID',amount:minBid,actionId:'nusa-min-bid-'+minBid},topScore()+180);
      }
    }else if(!context.needsMidAuctionMortgage&&!context.needsMidAuctionTrade){
      pushCandidate({type:'PASS',actionId:'nusa-trap-pass'},topScore()+220);
    }
  }

  // 2. INCOMING TRADE PHASE: Reverse Counter-Offer Hijacking & Smart Cash Counter
  if(phase==='trade'&&view.trade&&view.trade.to===actor){
    const t=view.trade;
    const senderId=t.from;
    const senderCash=view.players[senderId]?.cash||0;
    const norm=normalizeTrade(context,{type:'TRADE_ACCEPT'});
    const evalScore=evaluateTradeForActor(context,norm);

    if((view.botMemory?.negotiation?.depth||0)<2){
      const senderTargets=BOARD.filter(d=>{
        if(!d.price||view.assets[d.id]?.owner!==senderId||(view.assets[d.id]?.level||0)>0)return false;
        if(d.group>=0&&GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
        const completesOurs=d.group>=0&&context.groups[d.group].own===GROUPS[d.group].ids.length-1;
        const isChainOrCollusion=context.chainTargetTiles?.has(d.id)||context.collusionTargetTiles?.has(d.id);
        return completesOurs||isChainOrCollusion;
      }).sort((a,b)=>completion(context,b.id,actor)-completion(context,a.id,actor)||(GROUP_TIER[b.group]||1)-(GROUP_TIER[a.group]||1));

      const safeBaitsForSender=context.owned.filter(d=>{
        if((view.assets[d.id]?.level||0)>0)return false;
        if(d.group>=0&&context.groups[d.group].own>=2)return false;
        if(d.group>=0&&GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
        if(d.group>=0){
          const oppCnt=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===senderId).length;
          if(oppCnt>=GROUPS[d.group].ids.length-1)return false;
        }
        return true;
      }).sort((a,b)=>{
        const desA=context.opponentProfiles?.get(senderId)?.desiredGroups?.[a.group]||0;
        const desB=context.opponentProfiles?.get(senderId)?.desiredGroups?.[b.group]||0;
        return desB-desA||a.price-b.price;
      });

      let hijackSynthesized=false;
      for(const targetDeed of senderTargets.slice(0,2)){
        if(context.decisionContext?.expired())break;
        if(hijackSynthesized)break;
        const giveOptions=safeBaitsForSender.slice(0,2).map(b=>[b.id]);
        giveOptions.push([]);
        for(const giveList of giveOptions){
          if(context.decisionContext?.expired())break;
          if(hijackSynthesized)break;
          const cardSweetener=(context.canGiveJailCardSweetener&&(self.cards?.length||0)>0)?1:0;
          const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-900)/10)*10);
          const solved=solveOptimalTradeCash(context,{
            partnerId:senderId,
            giveList,
            takeList:[targetDeed.id],
            giveCards:cardSweetener,
            minOverpay:-150,
            maxOverpay:550,
            maxCashOffer:maxCash,
            partnerMaxCash:senderCash
          });
          if(solved){
            if(pushCandidate({type:'COUNTER',trade:solved.trade,actionId:'nusa-counter-hijack-'+targetDeed.id},topScore()+415)){
              hijackSynthesized=true;
              break;
            }
          }
        }
      }

      if(!hijackSynthesized&&evalScore<0.08){
        const askExtra=Math.min(senderCash,Math.max(300,Math.round((t.takeCash||0)+450)));
        if(askExtra>0&&(t.take?.length||0)>0){
          const counterTrade={
            to:senderId,
            give:[...(t.take||[])],
            take:[...(t.give||[])],
            giveCash:0,
            takeCash:askExtra,
            giveCards:0,
            takeCards:0
          };
          const {myEval,partnerEval}=getBilateralTradeEvaluation(context,counterTrade,actor);
          if(myEval.net>0&&partnerEval.net>=10){
            pushCandidate({type:'COUNTER',trade:counterTrade,actionId:'nusa-counter-cash'},topScore()+180);
          }
        }
      }
    }
  }

  // 2B. DEBT-PHASE EMERGENCY TRADE RESCUE (Mode E: Save Monopoly Houses from 50% Liquidation Loss)
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
            const oracle=predictPartnerAcceptance(context,trade);
            if(oracle.willAccept){
              pushCandidate({type:'OFFER',trade,actionId:'nusa-debt-rescue-'+deed.id},topScore()+480);
              debtTradeSynthesized=true;
              break;
            }
          }
          if(debtTradeSynthesized)break;
        }
      }
    }
  }

  // 3. EARLY JAIL BLITZ & POST-ROLL DISCIPLINED ASSET MANAGEMENT ('roll', 'end', 'jail')
  if(phase==='jail'&&view.turn===actor&&context.unowned.length>=5&&context.nearLoss<420){
    if(self.cards?.length>0){
      pushCandidate({type:'JAIL_CARD',actionId:'nusa-early-jail-card'},topScore()+260);
    }else if(self.cash-500>=context.trueReserve+1200){
      pushCandidate({type:'JAIL_PAY',actionId:'nusa-early-jail-pay'},topScore()+240);
    }
  }

  if(phase==='roll'&&view.turn===actor&&context.shouldDeferPreRollBuild){
    pushCandidate({type:'ROLL',actionId:'nusa-disciplined-roll'},topScore()+(context.hasPendingRivalRentClaim?480:350));
  }

  if(['roll','end','jail'].includes(phase)&&view.turn===actor&&canManage(view,actor)&&!context.shouldDeferPreRollBuild){
    // 3A. Unmortgage any mortgaged tile inside a completed color set!
    for(const g of context.groups){
      if(context.decisionContext?.expired())break;
      if(g.fullSetOwned&&g.mortgagedCount>0){
        const mTile=g.ids.find(id=>view.assets[id]?.mortgaged);
        if(mTile!==undefined){
          const rCost=redemption(mTile);
          if(self.cash-rCost>=context.trueReserve*0.45&&!managementError(view,actor,mTile,'REDEEM')){
            pushCandidate({type:'REDEEM',tile:mTile,actionId:'nusa-redeem-mono-'+mTile},topScore()+400);
          }else if(self.cash+context.liquidBuffer-rCost>=context.trueReserve*0.50){
            const coll=context.isolatedMortgageable.find(d=>!managementError(view,actor,d.id,'MORTGAGE'));
            if(coll){
              pushCandidate({type:'MORTGAGE',tile:coll.id,actionId:'nusa-leverage-redeem-'+coll.id},topScore()+385);
            }
          }
        }
      }
    }

    // 3B. Aggressive 3-House Construction, Hotel-Trap Lock, & Full Isolated-Asset Leverage!
    const maxTargetLevel=4;
    const buildGroups=context.groups
      .filter(g=>g.complete&&g.levelMin<maxTargetLevel)
      .sort((a,b)=>(GROUP_TIER[b.id]||1)-(GROUP_TIER[a.id]||1));

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
          const scoreX=(context.tileKillshot[x]||0)*2.5+(context.immediateVisits[x]||0)+apexX;
          const scoreY=(context.tileKillshot[y]||0)*2.5+(context.immediateVisits[y]||0)+apexY;
          return scoreY-scoreX;
        });

      if(validTiles.length>0){
        const bestTile=validTiles[0];
        const bCost=BOARD[bestTile].build;
        const safetyFloor=(levelMin<3||context.hotelTrapActive)?context.trueReserve*0.45:context.trueReserve*0.80;
        if(self.cash-bCost>=safetyFloor){
          const trapBoost=context.hotelTrapActive?415:(levelMin<3?395:240);
          pushCandidate({type:'BUILD',tile:bestTile,actionId:'nusa-build-'+bestTile},topScore()+trapBoost);
        }else if(levelMin<3||context.hotelTrapActive){
          // V20.0 Post-Trade Poverty-Cloak Unpack: Mortgage ANY isolated non-monopoly asset (utility, singleton city, or lone station)
          // to immediately fund the 3-house sweet spot!
          const collateral=context.isolatedMortgageable.find(t=>!managementError(view,actor,t.id,'MORTGAGE'));
          if(collateral&&self.cash+collateral.mortgage-bCost>=safetyFloor*0.85){
            pushCandidate({type:'MORTGAGE',tile:collateral.id,actionId:'nusa-leverage-build-'+collateral.id},topScore()+365);
          }
        }
      }
    }

    // 3C. Late-Game De-Leveraging: Redeem Stations & Mortgaged Deeds when Flush with Cash
    if(context.canDeleverage&&phase==='end'){
      const redeemTargets=context.mortgagedOwned
        .filter(t=>!context.cloakedMonopolyGroups?.has(t.group)&&!managementError(view,actor,t.id,'REDEEM')&&self.cash-redemption(t.id)>=context.trueReserve+900)
        .sort((a,b)=>(b.type==='station'?1:0)-(a.type==='station'?1:0)||b.price-a.price);
      if(redeemTargets.length>0){
        const rt=redeemTargets[0];
        pushCandidate({type:'REDEEM',tile:rt.id,actionId:'nusa-deleverage-'+rt.id},topScore()+220);
      }
    }
  }

  // 4. APOTHEOSIS TRADE SYNTHESIZER (Binary-Search Solver + Poverty Cloak + Pre-Trade Liquidity Sequencer!)
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
    const groupOrder=[3,4,1,2,5,7,0,6];
    let synthesizedCount=0;

    // Mode A (Binary-Search + Poverty Cloak), Mode A-PreTradeMortgage, Mode A-StealthCloak, & Mode B (Velocity Swap)
    for(const gId of groupOrder){
      if(context.decisionContext?.expired())break;
      if(synthesizedCount>=3)break;
      const g=context.groups[gId];
      if(g.own!==g.ids.length-1||g.unownedCount>0)continue;
      const missingTile=g.ids.find(id=>view.assets[id]?.owner!==actor);
      if(missingTile===undefined)continue;
      const targetOwner=view.assets[missingTile]?.owner;
      if(targetOwner==null||targetOwner===actor||rejectionActive(view,mem,targetOwner))continue;
      if(g.ids.some(id=>(view.assets[id]?.level||0)>0))continue;

      const partnerMaxCash=view.players[targetOwner]?.cash||0;
      const partnerDesire=context.opponentProfiles?.get(targetOwner)?.desiredGroups||{};
      const isCatchUpPartner=context.catchUpPartners?.has(targetOwner);

      const safeBaits=context.owned.filter(d=>{
        if(d.group===gId||(view.assets[d.id]?.level||0)>0)return false;
        if(d.group>=0&&GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
        if(d.group>=0){
          const oppCount=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length;
          if(oppCount>=GROUPS[d.group].ids.length-1)return false;
        }
        return true;
      }).sort((a,b)=>{
        const desA=a.group>=0?(partnerDesire[a.group]||0):0;
        const desB=b.group>=0?(partnerDesire[b.group]||0):0;
        if(desB!==desA)return desB-desA;
        const oppHasA=a.group>=0?GROUPS[a.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length:0;
        const oppHasB=b.group>=0?GROUPS[b.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length:0;
        return oppHasB-oppHasA||a.price-b.price;
      });

      const packages=[];
      for(const b of safeBaits.slice(0,3))packages.push([b.id]);
      if(safeBaits.length>=2)packages.push([safeBaits[0].id,safeBaits[1].id]);
      packages.push([]);

      const cardOptions=(context.canGiveJailCardSweetener&&(self.cards?.length||0)>0)?[1,0]:[0];
      const maxOverpayCap=Math.round(700*g.tier+(isCatchUpPartner?150:0));

      let foundForGroup=false;
      for(const giveList of packages){
        if(context.decisionContext?.expired())break;
        if(foundForGroup)break;
        // V20.0 BREAKTHROUGH #2: Poverty Illusion Capital Accounting!
        // Because we can immediately mortgage our remaining `isolatedMortgageable` deeds AFTER the trade
        // to build houses, we only need `(self.cash - giveCash) + remainingLiquidBuffer >= g.houseCost * 2`!
        const surrenderedBuffer=giveList.reduce((n,id)=>n+(view.assets[id]?.mortgaged?0:(BOARD[id]?.mortgage||0)),0);
        const remainingBuffer=Math.max(0,context.liquidBuffer-surrenderedBuffer);
        const minBuildNeed=Math.max(0,g.houseCost*2+context.trueReserve*0.40-remainingBuffer*0.85);
        const maxCashOffer=Math.max(0,Math.floor((self.cash-minBuildNeed)/10)*10);

        for(const giveCards of cardOptions){

          if(context.decisionContext?.expired())break;
          if(foundForGroup)break;
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
              actionId:'nusa-bsearch-buyout-'+missingTile+'-'+solved.trade.giveCash+'-c'+giveCards
            };
            if(pushCandidate(action,topScore()+405+(giveCards*15)+(isCatchUpPartner?20:0))){
              synthesizedCount++;
              foundForGroup=true;
              break;
            }
          }
        }
      }

      // V20.0 BREAKTHROUGH #3: Multi-Step Pre-Trade Liquidity Sequencer!
      // If our current `self.cash` was too low to pay the required `giveCash`, check if mortgaging
      // 1 isolated non-bait deed first unlocks a guaranteed accepted monopoly buyout!
      if(!foundForGroup&&canManage(view,actor)&&context.isolatedMortgageable.length>0){
        const giveList=packages[0]||[];
        const nonBaitColl=context.isolatedMortgageable.find(d=>!giveList.includes(d.id)&&!managementError(view,actor,d.id,'MORTGAGE'));
        if(nonBaitColl){
          const boostedView={
            ...view,
            players:view.players.map((p,i)=>i===actor?{...p,cash:p.cash+nonBaitColl.mortgage}:p),
            assets:{...view.assets,[nonBaitColl.id]:{...view.assets[nonBaitColl.id],mortgaged:true}}
          };
          const boostedMaxCash=Math.max(0,Math.floor(((self.cash+nonBaitColl.mortgage)-g.houseCost*1.5)/10)*10);
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
            if(pushCandidate({type:'MORTGAGE',tile:nonBaitColl.id,actionId:'nusa-pretrade-mort-'+nonBaitColl.id},topScore()+412)){
              synthesizedCount++;
              foundForGroup=true;
            }
          }
        }
      }

      // Preparatory Stealth-Mortgage Cloak (mortgages 1 own tile in the 2/3 target group to blind rival `allocateDevelopment`)
      if(!foundForGroup&&g.mortgagedCount===0&&canManage(view,actor)){
        const ownTileToCloak=g.ids.find(id=>view.assets[id]?.owner===actor&&!view.assets[id]?.mortgaged&&!managementError(view,actor,id,'MORTGAGE'));
        if(ownTileToCloak!==undefined){
          const cloakedView={
            ...view,
            players:view.players.map((p,i)=>i===actor?{...p,cash:p.cash+BOARD[ownTileToCloak].mortgage}:p),
            assets:{...view.assets,[ownTileToCloak]:{...view.assets[ownTileToCloak],mortgaged:true}}
          };
          const maxCashCloak=Math.max(0,Math.floor((self.cash+BOARD[ownTileToCloak].mortgage-g.houseCost*2)/10)*10);
          for(const giveList of packages.slice(0,2)){
            if(context.decisionContext?.expired())break;
            const solvedCloak=solveOptimalTradeCash(context,{
              partnerId:targetOwner,
              giveList,
              takeList:[missingTile],
              giveCards:0,
              minOverpay:0,
              maxOverpay:550,
              maxCashOffer:maxCashCloak,
              partnerMaxCash,
              stateOverride:cloakedView
            });
            if(solvedCloak){
              if(pushCandidate({type:'MORTGAGE',tile:ownTileToCloak,actionId:'nusa-stealth-cloak-'+ownTileToCloak},topScore()+408)){
                synthesizedCount++;
                foundForGroup=true;
                break;
              }
            }
          }
        }
      }

      // Mode B (V20.0 BREAKTHROUGH #5): Velocity-Dominated Mutual Monopoly Swap
      if(!foundForGroup&&synthesizedCount<3){
        const swapBaits=context.owned.filter(d=>{
          if(d.group===gId||d.group<0||(view.assets[d.id]?.level||0)>0)return false;
          if(GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
          const oppCount=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length;
          return oppCount===GROUPS[d.group].ids.length-1;
        });
        for(const sb of swapBaits){
          if(context.decisionContext?.expired())break;
          const oppHouseCost=BOARD[sb.id]?.build||1000;
          const surrenderedBuffer=view.assets[sb.id]?.mortgaged?0:(sb.mortgage||0);
          const myHiddenBuffer=Math.max(0,context.liquidBuffer-surrenderedBuffer)*0.85;
          const askCash=Math.min(partnerMaxCash,Math.max(0,Math.floor(((view.players[targetOwner]?.cash||0)-oppHouseCost)/10)*10));
          for(const takeCash of [askCash,Math.floor(askCash*0.6/10)*10,0]){
            if(context.decisionContext?.expired())break;
            const oppPostCash=(view.players[targetOwner]?.cash||0)-takeCash;
            const myPostCash=self.cash+takeCash+myHiddenBuffer;
            const myHouses=Math.floor(Math.max(0,myPostCash-context.trueReserve*0.4)/g.houseCost);
            const oppHouses=Math.floor(Math.max(0,oppPostCash-300)/oppHouseCost);
            if(myHouses<3||(myHouses<oppHouses+2&&oppHouses>1))continue;

            const trade={to:targetOwner,give:[sb.id],take:[missingTile],giveCash:0,takeCash,giveCards:0,takeCards:0};
            if(JSON.stringify(trade)===mem.lastSignature)continue;
            const oracle=predictPartnerAcceptance(context,trade);
            if(oracle.willAccept&&oracle.myEval.net>0&&oracle.myEval.deltaShare>=oracle.myEval.partnerDelta){
              const action={type:'OFFER',trade,actionId:'nusa-velocity-swap-'+missingTile+'-'+sb.id};
              if(pushCandidate(action,topScore()+360)){
                synthesizedCount++;
                foundForGroup=true;
                break;
              }
            }
          }
          if(foundForGroup)break;
        }
      }
    }

    // Mode G: 1-Step Double-Deed Monopoly Sweep (1/3 -> 3/3 in ONE Trade via Binary Search!)
    if(synthesizedCount<2&&context.doubleSweepGroups.length>0){
      for(const ds of context.doubleSweepGroups){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=2)break;
        const partnerId=ds.partnerId;
        if(rejectionActive(view,mem,partnerId))continue;
        const partnerDesire=context.opponentProfiles?.get(partnerId)?.desiredGroups||{};

        const sweepBaits=context.owned.filter(d=>{
          if(d.group===ds.groupId||(view.assets[d.id]?.level||0)>0)return false;
          if(d.group>=0&&GROUPS[d.group].ids.some(i=>(view.assets[i]?.level||0)>0))return false;
          if(d.group>=0){
            const oppCount=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===partnerId).length;
            if(oppCount>=GROUPS[d.group].ids.length-1)return false;
          }
          return true;
        }).sort((a,b)=>{
          const desA=a.group>=0?(partnerDesire[a.group]||0):0;
          const desB=b.group>=0?(partnerDesire[b.group]||0):0;
          return desB-desA||b.price-a.price;
        });

        const sweepBundles=[];
        if(sweepBaits.length>=2)sweepBundles.push([sweepBaits[0].id,sweepBaits[1].id]);
        for(const b of sweepBaits.slice(0,2))sweepBundles.push([b.id]);

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
            maxOverpay:850,
            maxCashOffer,
            partnerMaxCash:view.players[partnerId]?.cash||0
          });
          if(solvedSweep&&JSON.stringify(solvedSweep.trade)!==mem.lastSignature){
            const action={type:'OFFER',trade:solvedSweep.trade,actionId:'nusa-bsearch-sweep-'+ds.groupId};
            if(pushCandidate(action,topScore()+402)){
              synthesizedCount++;
              break;
            }
          }
        }
      }
    }

    // Mode D: Silent 2-Step Chain Accumulation (1/3 -> 2/3 when group is split 1-1-1!)
    if(synthesizedCount===0&&context.splitThreeWayGroups.length>0){
      for(const sg of context.splitThreeWayGroups){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=2)break;
        const rivalTiles=sg.ids.filter(id=>view.assets[id]?.owner!==actor&&(view.assets[id]?.level||0)===0);
        for(const rTile of rivalTiles){
          if(context.decisionContext?.expired())break;
          if(synthesizedCount>=2)break;
          const rOwner=view.assets[rTile]?.owner;
          if(rOwner==null||rejectionActive(view,mem,rOwner))continue;

          const chainBaits=context.isolatedMortgageable.filter(d=>{
            if(d.group===sg.id)return false;
            if(d.group>=0&&context.groups[d.group].own>=2)return false;
            if(d.group>=0&&(GROUP_TIER[d.group]||1)>sg.tier)return false;
            if(d.group>=0){
              const oppCnt=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===rOwner).length;
              if(oppCnt>=GROUPS[d.group].ids.length-1)return false;
            }
            return true;
          }).sort((a,b)=>{
            const desA=context.opponentProfiles?.get(rOwner)?.desiredGroups?.[a.group]||0;
            const desB=context.opponentProfiles?.get(rOwner)?.desiredGroups?.[b.group]||0;
            if(desB!==desA)return desB-desA;
            const oppHasA=a.group>=0?GROUPS[a.group].ids.filter(i=>view.assets[i]?.owner===rOwner).length:0;
            const oppHasB=b.group>=0?GROUPS[b.group].ids.filter(i=>view.assets[i]?.owner===rOwner).length:0;
            return oppHasB-oppHasA||a.price-b.price;
          });

          for(const cb of chainBaits.slice(0,3)){

            if(context.decisionContext?.expired())break;
            const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-1100)/10)*10);
            const solvedChain=solveOptimalTradeCash(context,{
              partnerId:rOwner,
              giveList:[cb.id],
              takeList:[rTile],
              giveCards:0,
              minOverpay:-160,
              maxOverpay:240,
              maxCashOffer:maxCash,
              partnerMaxCash:view.players[rOwner]?.cash||0
            });
            if(solvedChain&&JSON.stringify(solvedChain.trade)!==mem.lastSignature){
              const action={type:'OFFER',trade:solvedChain.trade,actionId:'nusa-chain-accum-'+rTile};
              if(pushCandidate(action,topScore()+315)){
                synthesizedCount++;
                break;
              }
            }
          }
        }
      }
    }

    // Mode F: Preemptive Rival-Collusion Interdiction!
    if(synthesizedCount===0&&context.collusionTargetTiles.size>0){
      for(const bridgeTile of context.collusionTargetTiles){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=2)break;
        const info=context.collusionMap.get(bridgeTile);
        const holderId=view.assets[bridgeTile]?.owner;
        if(!info||holderId==null||rejectionActive(view,mem,holderId))continue;
        if(info.tier<1.28)continue;

        const bPrice=BOARD[bridgeTile].price;
        const interdictBaits=context.isolatedMortgageable.filter(d=>{
          if(d.group===info.groupId)return false;
          if(d.group>=0&&context.groups[d.group].own>=2)return false;
          if(d.group>=0&&(GROUP_TIER[d.group]||1)>info.tier)return false;
          if(d.group>=0){
            const oppCnt=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===holderId).length;
            if(oppCnt>=GROUPS[d.group].ids.length-1)return false;
          }
          return Math.abs(d.price-bPrice)<=600;
        }).sort((a,b)=>a.price-b.price);

        for(const ib of interdictBaits.slice(0,2)){

          if(context.decisionContext?.expired())break;
          const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-1300)/10)*10);
          const solvedInterdict=solveOptimalTradeCash(context,{
            partnerId:holderId,
            giveList:[ib.id],
            takeList:[bridgeTile],
            giveCards:0,
            minOverpay:-100,
            maxOverpay:200,
            maxCashOffer:maxCash,
            partnerMaxCash:view.players[holderId]?.cash||0
          });
          if(solvedInterdict&&JSON.stringify(solvedInterdict.trade)!==mem.lastSignature){
            const action={type:'OFFER',trade:solvedInterdict.trade,actionId:'nusa-collusion-interdict-'+bridgeTile};
            if(pushCandidate(action,topScore()+305)){
              synthesizedCount++;
              break;
            }
          }
        }
      }
    }

    // Mode C: Stepping-Stone Triangle Trade
    if(synthesizedCount<3&&context.steppingStoneTiles.size>0){
      for(const stepTile of context.steppingStoneTiles){
        if(context.decisionContext?.expired())break;
        if(synthesizedCount>=3)break;
        const thirdOwner=view.assets[stepTile]?.owner;
        if(thirdOwner==null||rejectionActive(view,mem,thirdOwner))continue;
        const candidatesToGive=context.isolatedMortgageable.filter(d=>{
          if(context.steppingStoneTiles.has(d.id))return false;
          if(d.group>=0){
            const cnt=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===thirdOwner).length;
            if(cnt>=GROUPS[d.group].ids.length-1)return false;
          }
          return Math.abs(d.price-BOARD[stepTile].price)<=600;
        });
        for(const d of candidatesToGive.slice(0,2)){
          if(context.decisionContext?.expired())break;
          const maxCash=Math.max(0,Math.floor((self.cash-context.trueReserve-1100)/10)*10);
          const solvedStep=solveOptimalTradeCash(context,{
            partnerId:thirdOwner,
            giveList:[d.id],
            takeList:[stepTile],
            giveCards:0,
            minOverpay:-80,
            maxOverpay:180,
            maxCashOffer:maxCash,
            partnerMaxCash:view.players[thirdOwner]?.cash||0
          });
          if(solvedStep&&JSON.stringify(solvedStep.trade)!==mem.lastSignature){
            const action={type:'OFFER',trade:solvedStep.trade,actionId:'nusa-stepstone-'+stepTile};
            if(pushCandidate(action,topScore()+265)){
              synthesizedCount++;
              break;
            }
          }
        }
      }
    }
  }

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
      const isSpecialMort=aid.startsWith('nusa-stealth-cloak-')||aid.startsWith('nusa-pretrade-mort-')||aid.startsWith('nusa-leverage-');
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
    if(action.type==='BUILD'||action.type==='BUILD_JOIN')momentum=salary*0.16;
    else if((action.type==='REDEEM'||action.type==='MORTGAGE_REDEEM')&&(context.hasMortgagedMonopoly||context.canDeleverage||context.view.phase==='mortgage'))momentum=salary*0.15;
    else if(action.type==='MORTGAGE'&&(context.needsPreBuyMortgage||context.needsMidAuctionMortgage||aid.startsWith('nusa-stealth-cloak-')||aid.startsWith('nusa-pretrade-mort-')||aid.startsWith('nusa-leverage-')))momentum=salary*0.19;
    else if(action.type==='OFFER'&&(norm>0.35||context.needsPreBuyTrade||context.needsMidAuctionTrade))momentum=salary*0.18;
    else if(action.type==='COUNTER'&&norm>0.35)momentum=salary*0.17;
    else if(action.type==='BUY'&&norm>0.25)momentum=salary*0.13;
    else if(action.type==='AUCTION'&&context.earlyCashSinkTiles?.has(context.view.buy))momentum=salary*0.16;
    else if(action.type==='ROLL'&&context.shouldDeferPreRollBuild)momentum=salary*0.18;
  }
  const bonus=Math.max(-salary*0.52,Math.min(salary*0.52,norm*salary*0.28+momentum));
  return {advisory:norm,bonus};
}

export function nusaV7Decision(state,actor,plan,{diagnostics=false,disabled=[],context:decisionContext}={}){
  const fallback=(reason,extra={})=>({action:plan?.action??null,changed:false,reason,...extra});
  if(decisionContext?.expired())return fallback('council_budget_exhausted');
  if(!plan?.action||protectedType(plan.action)||(plan.candidates?.[0]?.score??0)>=1e7)return fallback('protected_or_trivial');
  if(!['auction','buy','roll','end','trade','jail','buildOffer','mortgage','debt'].includes(state.phase))return fallback('protected_phase');

  const context={...situationOf(state,actor,plan),decisionContext};
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
    reason:changeAllowed?'apotheosis_v20_selected':'native_plan_preserved',
    rankedPool:ranked
  };

  if(diagnostics){
    result.context={
      stage:context.stage,live:context.live,unowned:context.unowned.length,
      bankHouses:context.bank.houses,reserve:Math.round(context.reserve),
      trueReserve:Math.round(context.trueReserve),hotspotReserve:context.hotspotReserve,
      queueAuctionReserve:context.queueAuctionReserve,vultureReserve:context.vultureReserve,
      effectiveTradeCash:context.effectiveTradeCash,canUsePovertyCloak:context.canUsePovertyCloak,
      auctionStep:context.auctionStep,hotelTrapActive:context.hotelTrapActive,
      cloakedGroups:context.cloakedMonopolyGroups.size,catchUpPartners:context.catchUpPartners.size,
      doubleSweepGroups:context.doubleSweepGroups.length,
      contestedAnchors:context.contestedAnchorTiles.size,earlyCashSinks:context.earlyCashSinkTiles.size,
      splitThreeWayGroups:context.splitThreeWayGroups.length,collusionTargets:context.collusionTargetTiles.size,
      repairSafe:context.cardCycle.repairSafe,
      winProbability:+context.winProbability.toFixed(3),isCriticalTurn:context.isCriticalTurn
    };
    result.proposals=ranked.slice(0,8).map(c=>({id:c.id,type:c.action.type,score:+c.score.toFixed(2),unified:+c.unified.toFixed(2)}));
    result.expertCount=STRATEGY_EXPERTS.length;
    result.candidateCount=candidates.length;
    result.eligibleCount=eligible.length;
  }
  return result;
}
