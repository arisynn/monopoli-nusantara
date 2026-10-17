/** NUSA V11.0 Sovereign Grandmaster Council.
 * Combines 22 Stage-Weighted Experts, Ascending-Clock Auction Override,
 * Flash-Liquidity Monopoly Unlocker, and Asymmetric Win-Win Monopoly Swaps.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {canTrade,redemption,managementError} from '../../game.mjs';
import {legalCandidate} from '../candidates.mjs';
import {evaluateTrade} from '../negotiation.mjs';
import {rejectionActive} from '../concessions.mjs';
import {memoryFor} from '../memory.mjs';
import {situationOf} from './situation.mjs';
import {runExperts,STRATEGY_EXPERTS,grandmasterAuctionCeiling,GROUP_TIER} from './experts.mjs';

export const NUSA_V7_VERSION='11.0.0-sovereign-council';

const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const building=a=>['BUILD','BUILD_JOIN'].includes(a?.type);
const protectedType=a=>['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT'].includes(a?.type);

const STAGE_WEIGHTS={
  acquisition:{portfolio:1.6,completion:2.0,blocking:1.9,auction:2.5,auctionTrap:2.25,jail:1.65,probability:1.35,liquidity:1.25,negotiation:2.15,opponent:2.15,asymmetricSwap:2.2},
  development:{development:1.95,tempoRace:2.25,scarcity:1.9,auction:2.35,auctionTrap:2.0,cashflow:1.55,mortgage:1.8,flashLiquidity:2.35,negotiation:2.15,opponent:2.05,asymmetricSwap:2.25,liquidity:1.45},
  contested:{scarcity:2.35,buildingWar:2.2,tempoRace:1.95,auction:2.25,blocking:1.95,flashLiquidity:2.1,negotiation:2.05,opponent:2.2,jail:1.9,liquidity:1.65},
  endgame:{endgame:2.2,scarcity:2.2,tempoRace:2.0,flashLiquidity:2.15,liquidity:1.85,bankruptcy:2.0,jail:2.0,opponent:2.05,auction:2.0}
};

function weightFor(expertId,context){
  const table=STAGE_WEIGHTS[context.stage]||{};
  return table[expertId]||1.15;
}

/** Inject Minimum-Increment Auction Bids, Flash-Liquidity Unlocks,
 * and Both Unilateral & Asymmetric Monopoly-Completion Trades into plan.candidates!
 */
export function ensureSovereignCandidates(context,plan){
  const candidates=plan?.candidates;
  if(!Array.isArray(candidates))return plan;
  const {view,actor,self}=context;
  const phase=view.phase;
  const topScore=()=>Math.max(0,...candidates.map(c=>c.score));

  // 1. AUCTION PHASE: Ensure Minimum Legal Increment Bid (minBid) is present!
  if(phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor){
    const minBid=Math.max(100,(view.auction.amount||0)+10);
    const ceiling=grandmasterAuctionCeiling(context);
    if(minBid<=ceiling&&minBid<=self.cash){
      const existingMin=candidates.find(c=>c.action.type==='BID'&&c.action.amount===minBid);
      if(!existingMin){
        const action={type:'BID',amount:minBid,actionId:'nusa-min-bid-'+minBid};
        if(legalCandidate(view,actor,action)){
          candidates.push({id:action.actionId,action,score:topScore()+85,expanded:true});
        }
      }else{
        existingMin.score=Math.max(existingMin.score,topScore()+45);
      }
    }
  }

  // 2. FLASH-REDEEM & FLASH-MORTGAGE TO UNLOCK MONOPOLY CONSTRUCTION
  if(['roll','end'].includes(phase)&&view.turn===actor){
    for(const g of context.groups){
      if(g.fullSetOwned&&g.mortgagedCount>0){
        const mortgagedTile=g.ids.find(id=>view.assets[id]?.mortgaged);
        if(mortgagedTile!==undefined){
          const rCost=redemption(mortgagedTile);
          if(self.cash>=rCost+context.reserve*0.5&&!managementError(view,actor,mortgagedTile,'REDEEM')){
            const existingRedeem=candidates.find(c=>c.action.type==='REDEEM'&&c.action.tile===mortgagedTile);
            if(existingRedeem){
              existingRedeem.score=Math.max(existingRedeem.score,topScore()+160);
            }else{
              const action={type:'REDEEM',tile:mortgagedTile,actionId:'nusa-flash-redeem-'+mortgagedTile};
              if(legalCandidate(view,actor,action)){
                candidates.push({id:action.actionId,action,score:topScore()+160,expanded:true});
              }
            }
          }else if(context.isolatedMortgageable.length>0){
            const bestCollateral=context.isolatedMortgageable
              .slice()
              .sort((a,b)=>(a.type==='utility'?0:1)-(b.type==='utility'?0:1)||a.price-b.price)[0];
            if(bestCollateral&&!managementError(view,actor,bestCollateral.id,'MORTGAGE')){
              const existingMort=candidates.find(c=>c.action.type==='MORTGAGE'&&c.action.tile===bestCollateral.id);
              if(existingMort){
                existingMort.score=Math.max(existingMort.score,topScore()+120);
              }else{
                const action={type:'MORTGAGE',tile:bestCollateral.id,actionId:'nusa-flash-mort-'+bestCollateral.id};
                if(legalCandidate(view,actor,action)){
                  candidates.push({id:action.actionId,action,score:topScore()+120,expanded:true});
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. END / ROLL PHASE: Synthesize Guaranteed-Acceptance Monopoly-Completing Trades!
  const mem=memoryFor(view,actor);
  if(['end','roll'].includes(phase)&&view.turn===actor&&canTrade(view,actor)&&
     self.lastOfferRound!==view.round&&(view.turnSerial-(mem.lastOfferSerial??-100))>=view.players.length){
    for(const c of candidates){
      if(c.action.type==='OFFER'&&c.action.trade){
        try{
          const partnerEval=evaluateTrade(view,c.action.trade.to,c.action.trade,actor);
          const ownEval=evaluateTrade(view,actor,c.action.trade,actor);
          if(partnerEval.net>=0&&ownEval.net>0){
            c.score=Math.max(c.score,ownEval.net+195);
          }
        }catch{}
      }
    }

    const priorityGroups=[3,4,1,2,5,7,0,6];
    const allTradableOwned=context.owned.filter(d=>{
      if(view.assets[d.id]?.level>0)return false;
      if(d.group>=0&&context.groups[d.group].fullSetOwned)return false;
      if(d.group>=0&&GROUPS[d.group].ids.some(i=>view.assets[i]?.level>0))return false;
      return true;
    });

    let addedOffers=0;
    for(const gIdx of priorityGroups){
      if(addedOffers>=3)break;
      const g=context.groups[gIdx];
      if(g.own!==g.ids.length-1)continue;
      const missingTile=g.ids.find(id=>view.assets[id]?.owner!==actor&&view.assets[id]?.owner!=null);
      if(missingTile===undefined)continue;
      if(g.ids.some(id=>view.assets[id]?.level>0))continue;
      const targetOwner=view.assets[missingTile].owner;
      if(rejectionActive(view,mem,targetOwner))continue;

      const bPrice=BOARD[missingTile].price||1000;
      const buildBudgetNeeded=BOARD[missingTile].build*2;
      const maxCashToGive=Math.max(0,self.cash-context.reserve-buildBudgetNeeded);

      // Strategy A: Safe non-monopoly donors + Cash
      const safeForTarget=allTradableOwned.filter(d=>{
        if(d.group===gIdx)return false;
        if(d.group<0)return true;
        const targetCount=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length;
        return targetCount<GROUPS[d.group].ids.length-1;
      }).sort((a,b)=>{
        const scoreD=d=>d.group>=0&&GROUPS[d.group].ids.some(i=>view.assets[i]?.owner===targetOwner)?1:0;
        return scoreD(b)-scoreD(a)||b.price-a.price;
      });

      const donorOptions=[[],...safeForTarget.slice(0,4).map(d=>[d.id])];
      if(safeForTarget.length>=2){
        donorOptions.push([safeForTarget[0].id,safeForTarget[1].id]);
      }

      for(const give of donorOptions){
        if(addedOffers>=3)break;
        for(const mult of [0.95,1.2,1.45,1.75,2.1]){
          const giveCash=Math.min(maxCashToGive,Math.round((bPrice*mult)/50)*50);
          if(give.length===0&&giveCash<bPrice)continue;
          const trade={to:targetOwner,give,take:[missingTile],giveCash,takeCash:0,giveCards:0,takeCards:0};
          const action={type:'OFFER',trade,actionId:'nusa-gm-offer-'+missingTile+'-'+give.join('_')+'-'+giveCash};
          if(candidates.some(c=>eq(c.action,action)))continue;
          if(!legalCandidate(view,actor,action))continue;
          try{
            const partnerEval=evaluateTrade(view,targetOwner,trade,actor);
            const ownEval=evaluateTrade(view,actor,trade,actor);
            if(partnerEval.net>=2&&ownEval.net>0){
              candidates.push({id:action.actionId,action,score:ownEval.net+285*(GROUP_TIER[gIdx]||1),expanded:true});
              addedOffers++;
              break;
            }
          }catch{}
        }
      }

      // Strategy B: Asymmetric Monopoly Swap (Give rival a weaker/slower group completion when NUSA gets a faster/higher-ROI group!)
      if(addedOffers<3&&(GROUP_TIER[gIdx]||1)>=1.24&&self.cash>=buildBudgetNeeded+600){
        const swapDonors=allTradableOwned.filter(d=>{
          if(d.group<0||d.group===gIdx)return false;
          const theirTier=GROUP_TIER[d.group]||1;
          if(theirTier>=(GROUP_TIER[gIdx]||1)-0.08)return false;
          const targetCount=GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length;
          return targetCount===GROUPS[d.group].ids.length-1;
        });
        for(const swapDeed of swapDonors){
          if(addedOffers>=3)break;
          for(const cashDiff of [-400,-200,0,200,450]){
            const giveCash=cashDiff>0?Math.min(maxCashToGive,cashDiff):0;
            const takeCash=cashDiff<0?Math.min(view.players[targetOwner]?.cash||0,-cashDiff):0;
            const trade={to:targetOwner,give:[swapDeed.id],take:[missingTile],giveCash,takeCash,giveCards:0,takeCards:0};
            const action={type:'OFFER',trade,actionId:'nusa-asym-swap-'+missingTile+'-'+swapDeed.id+'-'+cashDiff};
            if(candidates.some(c=>eq(c.action,action)))continue;
            if(!legalCandidate(view,actor,action))continue;
            try{
              const partnerEval=evaluateTrade(view,targetOwner,trade,actor);
              const ownEval=evaluateTrade(view,actor,trade,actor);
              if(partnerEval.net>=5&&ownEval.net>0){
                candidates.push({id:action.actionId,action,score:ownEval.net+260*(GROUP_TIER[gIdx]||1),expanded:true});
                addedOffers++;
                break;
              }
            }catch{}
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
  if(phase==='buy')return ['BUY','AUCTION'].includes(base.type)&&['BUY','AUCTION'].includes(action.type);
  if(phase==='auction')return ['BID','PASS'].includes(base.type)&&['BID','PASS'].includes(action.type);
  if(phase==='buildOffer')return ['BUILD_JOIN','BUILD_DECLINE'].includes(base.type)&&['BUILD_JOIN','BUILD_DECLINE'].includes(action.type);
  if(phase==='mortgage')return ['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(base.type)&&['MORTGAGE_REDEEM','MORTGAGE_KEEP'].includes(action.type);
  if(phase==='jail')return ['JAIL_PAY','JAIL_CARD','ROLL'].includes(base.type)&&['JAIL_PAY','JAIL_CARD','ROLL'].includes(action.type);
  if(phase==='trade')return ['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(base.type)&&['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(action.type);
  if(phase==='debt')return ['MORTGAGE','SELL','SELL_SET'].includes(base.type)&&['MORTGAGE','SELL','SELL_SET'].includes(action.type);
  if(building(base)){
    const isHotelLock=context&&context.bank.houses<=16&&context.view.assets[base.tile]?.level===4;
    if(isHotelLock&&['END','ROLL','REDEEM'].includes(action.type))return true;
    return building(action)||action.type==='REDEEM';
  }
  if(['roll','end'].includes(phase)&&['ROLL','END'].includes(base.type)){
    if(['BUILD','REDEEM','OFFER'].includes(action.type))return true;
    if(action.type==='MORTGAGE'&&context.needsBuildCapital)return true;
  }
  return base.type===action.type;
}

function computeAdvisory(signals,context,salary){
  if(!signals.length)return {advisory:0,bonus:0};
  let weightedSum=0,weightTotal=0;
  for(const s of signals){
    const w=weightFor(s.id,context);
    weightedSum+=s.signal*w;
    weightTotal+=w;
  }
  const norm=weightedSum/Math.max(1,Math.sqrt(weightTotal));
  const cap=salary*0.28;
  const bonus=Math.max(-cap,Math.min(cap,norm*salary*0.12));
  return {advisory:norm,bonus};
}

export function nusaV7Decision(state,actor,plan,{diagnostics=false,disabled=[]}={}){
  const fallback=(reason,extra={})=>({action:plan?.action??null,changed:false,reason,...extra});
  if(!plan?.action||protectedType(plan.action)||(plan.candidates?.[0]?.score??0)>=1e7)return fallback('protected_or_trivial');
  if(!['auction','buy','roll','end','trade','jail','buildOffer','mortgage','debt'].includes(state.phase))return fallback('protected_phase');

  const context=situationOf(state,actor,plan);
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
    if(c.action.type==='MORTGAGE'&&Array.isArray(c.macro)&&c.macro.some(m=>m.type==='BUILD')){
      signals.push({id:'development',name:'Macro Build Route',signal:0.94,reason:'mortgage_to_build_route'});
    }
    const {advisory,bonus}=computeAdvisory(signals,context,salary);
    return {...c,bonus,advisory,signals,unified:c.score+bonus};
  }).sort((x,y)=>y.unified-x.unified||x.id.localeCompare(y.id));

  const current=ranked.find(c=>eq(c.action,base));
  if(!current)return fallback('baseline_not_ranked');
  const best=ranked[0];
  const improvement=best.unified-current.unified;

  const strongOverride=(state.phase==='auction')||(best.advisory-current.advisory>=0.52);
  const scoreFloor=strongOverride?current.score-salary*0.68:current.score-salary*0.16;
  const changeAllowed=!eq(best.action,base)&&
    improvement>Math.max(10,salary*0.005)&&
    best.score>=scoreFloor&&
    legalCandidate(context.view,actor,best.action);

  const result={
    action:changeAllowed?best.action:base,
    changed:changeAllowed,
    reason:changeAllowed?'expert_council_selected':'native_plan_preserved'
  };

  if(diagnostics){
    result.context={
      stage:context.stage,
      live:context.live,
      unowned:context.unowned.length,
      bankHouses:context.bank.houses,
      reserve:Math.round(context.reserve),
      leader:context.leader?.id??null,
      nemesis:context.nemesis?.id??null
    };
    result.proposals=ranked.slice(0,8).map(c=>({
      id:c.id,
      type:c.action.type,
      score:+c.score.toFixed(2),
      unified:+c.unified.toFixed(2),
      signals:c.signals.map(s=>({expert:s.id,signal:+s.signal.toFixed(3),reason:s.reason}))
    }));
    result.expertCount=STRATEGY_EXPERTS.length;
    result.expertCoverage=Object.fromEntries(STRATEGY_EXPERTS.map(e=>[e.id,ranked.reduce((n,c)=>n+Number(c.signals.some(x=>x.id===e.id)),0)]));
    result.candidateCount=candidates.length;
    result.eligibleCount=eligible.length;
    result.leaveOneOut=Object.fromEntries(STRATEGY_EXPERTS.map(expert=>{
      const originalAction=result.action;
      const pool=ranked.map(c=>{
        const without=c.signals.filter(signal=>signal.id!==expert.id);
        const {bonus}=computeAdvisory(without,context,salary);
        return {...c,unified:c.score+bonus};
      }).sort((a,b)=>b.unified-a.unified||a.id.localeCompare(b.id));
      const fb=pool.find(c=>eq(c.action,base)),leader=pool[0];
      const legal=leader&&fb&&!eq(leader.action,base)&&
        leader.unified-fb.unified>Math.max(10,salary*0.005)&&
        leader.score>=fb.score-salary*0.16&&
        legalCandidate(context.view,actor,leader.action);
      const predicted=legal?leader.action:base;
      return [expert.id,{
        activeCandidates:ranked.filter(c=>c.signals.some(x=>x.id===expert.id)).length,
        changesDecision:!eq(predicted,originalAction),
        changesRanking:!eq(leader.action,best.action)
      }];
    }));
  }
  return result;
}
