/**
 * ============================================================================
 * KRESNA V2.0 — QUANTUM GAME-THEORETIC NEMESIS (ARCH-RIVAL OF NUSA)
 * ============================================================================
 * Upgraded with:
 * 1. 3-Horizon Markov Discounted Cash Flow (DCF) Valuation (gamma = 0.93/0.83/0.73)
 * 2. Flash-Mortgage & Unmortgage Ambush Engine (Instant liquidity for 3-house traps)
 * 3. Kalai-Smorodinsky / Nash Bargaining Unilateral & Asymmetric Monopoly Swaps
 * 4. Anti-NUSA Stalker & Ascending-Clock Sniper Bidder
 * ============================================================================
 */
import {BOARD,GROUPS,auctionMinimum,AUCTION_RULES} from '../content.mjs';
import {observation} from './mind.mjs';
import {stock,rent,canTrade,redemption,managementError} from '../game.mjs';
import {landingForecast,expectedRentAt} from './probability.mjs';
import {legalCandidate,candidateState} from './candidates.mjs';
import {evaluateTrade} from './negotiation.mjs';
import {economyRules,strengthShares} from './economy.mjs';
import {memoryFor} from './memory.mjs';
import {rejectionActive} from './concessions.mjs';
import {buildingScore} from './strategy.mjs';
import {analyzeState} from './analysis.mjs';

export const KRESNA_MODEL_VERSION='2.0.0-quantum-nemesis';

const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';

// Kresna V2.0 DCF Group Multipliers: Red(4), Orange(3), Yellow(5), LightBlue(1), DarkBlue(7)
const KRESNA_GROUP_ROI=[1.08,1.40,1.26,1.62,1.64,1.36,0.90,1.36];
const GAMMA_1=0.93,GAMMA_2=0.83,GAMMA_3=0.73;

function analyzeKresnaBoard(view,actor){
  const self=view.players[actor];
  const rivals=view.players.filter(p=>p.id!==actor&&!p.out);
  const bank=stock(view);
  const rules=economyRules(view);
  const shares=strengthShares(view,BOARD,GROUPS,rent);
  const leader=rivals.slice().sort((a,b)=>(shares[b.id]-shares[a.id])||(b.cash-a.cash))[0]||null;
  const nusaRival=rivals.find(p=>p.botPersona==='nusa')||leader;

  const dcfVisits=Array(40).fill(0),ambushVisits=Array(40).fill(0);
  for(const r of rivals){
    const f1=landingForecast(view,r.id,1).visits;
    const f2=landingForecast(view,r.id,2).visits;
    const f3=landingForecast(view,r.id,3).visits;
    for(let i=0;i<40;i++){
      const step1=f1[i]||0;
      const step2=Math.max(0,(f2[i]||0)-step1);
      const step3=Math.max(0,(f3[i]||0)-(f2[i]||0));
      ambushVisits[i]+=step1;
      dcfVisits[i]+=step1*GAMMA_1+step2*GAMMA_2+step3*GAMMA_3;
    }
  }

  const ownForecast=landingForecast(view,actor,1);
  let expectedLoss=0,worstSpike=0;
  for(const t of BOARD){
    const a=view.assets[t.id];
    if(!t.price||a?.owner==null||a.owner===actor||a.mortgaged)continue;
    const exp=expectedRentAt(view,t.id,ownForecast);
    expectedLoss+=exp;
    if((ownForecast.visits[t.id]||0)>0.015){
      worstSpike=Math.max(worstSpike,rent(view,t.id,7));
    }
  }

  const groups=GROUPS.map((g,i)=>({
    id:i,
    ids:g.ids,
    own:g.ids.filter(id=>view.assets[id]?.owner===actor).length,
    unowned:g.ids.filter(id=>view.assets[id]?.owner==null).length,
    complete:g.ids.every(id=>view.assets[id]?.owner===actor&&!view.assets[id]?.mortgaged),
    fullSet:g.ids.every(id=>view.assets[id]?.owner===actor),
    mortgagedCount:g.ids.filter(id=>view.assets[id]?.owner===actor&&view.assets[id]?.mortgaged).length,
    levelMin:Math.min(...g.ids.map(id=>view.assets[id]?.level||0)),
    houseCost:BOARD[g.ids[0]]?.build||1000,
    nusaOwned:nusaRival?g.ids.filter(id=>view.assets[id]?.owner===nusaRival.id).length:0,
    rivalNearComplete:rivals.some(r=>g.ids.filter(id=>view.assets[id]?.owner===r.id).length===g.ids.length-1)
  }));

  const isolatedDeeds=BOARD
    .filter(t=>t.price&&view.assets[t.id]?.owner===actor&&!view.assets[t.id]?.mortgaged&&(t.group<0||!groups[t.group].fullSet)&&(view.assets[t.id]?.level||0)===0);
  const liquidCollateral=isolatedDeeds.reduce((n,t)=>n+(t.mortgage||0),0);

  const reserve=Math.max(
    rules.floor||360,
    Math.min(self.cash*0.46,expectedLoss*0.88+worstSpike*0.13-liquidCollateral*0.52)
  );

  const needsFlashCapital=groups.some(g=>(g.complete&&g.levelMin<3&&self.cash<g.houseCost*2+reserve)||(g.fullSet&&g.mortgagedCount>0));

  return {
    view,actor,self,rivals,bank,rules,shares,leader,nusaRival,
    dcfVisits,ambushVisits,ownForecast,expectedLoss,worstSpike,
    groups,isolatedDeeds,liquidCollateral,reserve,needsFlashCapital,
    unownedCount:BOARD.filter(t=>t.price&&view.assets[t.id]?.owner==null).length
  };
}

function kresnaTileValuation(kb,tileId){
  const t=BOARD[tileId];
  if(!t?.price)return 0;
  if(t.type==='utility'){
    const ownOther=[12,28].some(i=>i!==tileId&&kb.view.assets[i]?.owner===kb.actor);
    return t.price*(ownOther?1.0:0.75);
  }
  if(t.type==='station'){
    const ownSt=[5,15,25,35].filter(i=>i!==tileId&&kb.view.assets[i]?.owner===kb.actor).length;
    return t.price*(1.15+ownSt*0.38)+kb.dcfVisits[tileId]*560;
  }
  const g=kb.groups[t.group];
  const roi=KRESNA_GROUP_ROI[t.group]||1.0;
  const completesMine=g.own===g.ids.length-1?1.38:g.own>0&&g.own+g.unowned===g.ids.length?0.62:0.22;
  const blocksNusa=(kb.nusaRival&&g.nusaOwned===g.ids.length-1)?1.15:g.rivalNearComplete?0.84:0;
  const dcfStream=kb.dcfVisits[tileId]*(t.rents?.[3]||600)*0.125*roi;
  return t.price*roi*(0.86+completesMine+blocksNusa)+dcfStream;
}

function kresnaAuctionCeiling(kb){
  const auction=kb.view.auction;
  if(!auction)return 0;
  const safeCash=Math.max(0,kb.self.cash-kb.reserve*0.30);
  if(auction.kind==='building'){
    const t=auction.targets?.[kb.actor];
    if(!Number.isInteger(t))return 0;
    const b=BOARD[t],lv=kb.view.assets[t]?.level??0;
    const deltaRent=(b?.rents?.[lv+1]||0)-rent(kb.view,t,7);
    const dcfGain=deltaRent*(kb.dcfVisits[t]*11.5+kb.ambushVisits[t]*9.5+2.2);
    return Math.min(safeCash,Math.round((b?.build||1000)+dcfGain*0.68));
  }
  const t=auction.tile,b=BOARD[t];
  if(!b)return 0;
  if(b.group>=0){
    const g=kb.groups[b.group];
    if(g.own===g.ids.length-1){
      return Math.min(Math.max(0,kb.self.cash-250),Math.round(b.price*2.50+1350));
    }
    if(g.nusaOwned===g.ids.length-1||g.rivalNearComplete){
      const rivalCash=kb.rivals
        .filter(r=>g.ids.filter(id=>kb.view.assets[id]?.owner===r.id).length===g.ids.length-1)
        .reduce((m,r)=>Math.max(m,r.cash),0);
      const sniperLock=rivalCash+10;
      if(sniperLock<=b.price*1.76&&sniperLock<=safeCash)return sniperLock;
      return Math.min(safeCash,Math.round(b.price*1.46));
    }
    if(g.own>=1&&g.own+g.unowned===g.ids.length){
      return Math.min(safeCash,Math.round(b.price*1.16));
    }
  }
  if(b.type==='station'){
    const ownSt=[5,15,25,35].filter(i=>i!==t&&kb.view.assets[i]?.owner===kb.actor).length;
    return Math.min(safeCash,Math.round(b.price*(1.04+ownSt*0.20)));
  }
  if([1,3,4,5].includes(b.group)){
    return Math.min(safeCash,Math.round(b.price*1.04));
  }
  return Math.min(safeCash,Math.round(b.price*(b.type==='utility'?0.75:0.95)));
}

/** Inject Kresna V2.0 Minimum-Increment Bids, Flash-Liquidity Unlocks, and Nash Swaps */
export function ensureKresnaCandidates(kb,plan){
  const candidates=plan?.candidates;
  if(!Array.isArray(candidates))return;
  const {view,actor,self}=kb;
  const topScore=()=>Math.max(0,...candidates.map(c=>c.score));

  // 1. AUCTION: Inject the shared minimum increment bid
  if(view.phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor){
    const minBid=auctionMinimum(view.auction);
    const ceiling=kresnaAuctionCeiling(kb);
    if(minBid<=ceiling&&minBid<=self.cash){
      const existing=candidates.find(c=>c.action.type==='BID'&&c.action.amount===minBid);
      if(!existing){
        const action={type:'BID',amount:minBid,actionId:'kresna-min-bid-'+minBid};
        if(legalCandidate(view,actor,action)){
          candidates.push({id:action.actionId,action,score:topScore()+85,expanded:true});
        }
      }else{
        existing.score=Math.max(existing.score,topScore()+45);
      }
    }
  }

  // 2. FLASH-REDEEM & FLASH-MORTGAGE KILLSHOT ENGINE
  if(['roll','end'].includes(view.phase)&&view.turn===actor){
    for(const g of kb.groups){
      if(g.fullSet&&g.mortgagedCount>0){
        const mTile=g.ids.find(id=>view.assets[id]?.mortgaged);
        if(mTile!==undefined&&self.cash>=redemption(mTile)+kb.reserve*0.5&&!managementError(view,actor,mTile,'REDEEM')){
          const ex=candidates.find(c=>c.action.type==='REDEEM'&&c.action.tile===mTile);
          if(ex)ex.score=Math.max(ex.score,topScore()+155);
          else{
            const act={type:'REDEEM',tile:mTile,actionId:'kresna-redeem-'+mTile};
            if(legalCandidate(view,actor,act))candidates.push({id:act.actionId,action:act,score:topScore()+155,expanded:true});
          }
        }
      }
    }
    if(kb.needsFlashCapital&&kb.isolatedDeeds.length>0){
      const collateral=kb.isolatedDeeds.slice().sort((a,b)=>(a.type==='utility'?0:1)-(b.type==='utility'?0:1)||a.price-b.price)[0];
      const funded=collateral&&candidateState(view,actor,{type:'MORTGAGE',tile:collateral.id});
      const fundedAnalysis=funded&&analyzeState(funded,actor,{fast:true});
      const target=funded&&BOARD.find(t=>t.type==='city'&&funded.assets[t.id]?.owner===actor&&!managementError(funded,actor,t.id,'BUILD')&&funded.players[actor].cash-t.build>=Math.max(500,kb.reserve)&&buildingScore(funded,actor,t.id,fundedAnalysis)>redemption(collateral.id)-collateral.mortgage);
      if(target&&collateral&&!managementError(view,actor,collateral.id,'MORTGAGE')){
        const ex=candidates.find(c=>c.action.type==='MORTGAGE'&&c.action.tile===collateral.id);
        if(ex){ex.score=Math.max(ex.score,topScore()+115);ex.macro=[ex.action,{type:'BUILD',tile:target.id}];}
        else{
          const act={type:'MORTGAGE',tile:collateral.id,actionId:'kresna-flash-mort-'+collateral.id};
          if(legalCandidate(view,actor,act))candidates.push({id:act.actionId,action:act,score:topScore()+115,expanded:true,macro:[act,{type:'BUILD',tile:target.id}]});
        }
      }
    }
  }

  // 3. KALAI-SMORODINSKY / NASH BARGAINING MONOPOLY BUYOUT & SWAP SYNTHESIZER
  const mem=memoryFor(view,actor);
  if(['end','roll'].includes(view.phase)&&view.turn===actor&&canTrade(view,actor)&&
     self.lastOfferRound!==view.round&&(view.turnSerial-(mem.lastOfferSerial??-100))>=view.players.length){
    const priorityGroups=[4,3,5,1,2,7,0,6];
    const tradableDeeds=BOARD.filter(d=>{
      if(!d.price||view.assets[d.id]?.owner!==actor||view.assets[d.id]?.level>0)return false;
      if(d.group>=0&&kb.groups[d.group].fullSet)return false;
      if(d.group>=0&&GROUPS[d.group].ids.some(i=>view.assets[i]?.level>0))return false;
      return true;
    });

    let added=0;
    for(const gIdx of priorityGroups){
      if(added>=3)break;
      const g=kb.groups[gIdx];
      if(g.own!==g.ids.length-1)continue;
      const missing=g.ids.find(id=>view.assets[id]?.owner!==actor&&view.assets[id]?.owner!=null);
      if(missing===undefined||g.ids.some(id=>view.assets[id]?.level>0))continue;
      const targetOwner=view.assets[missing].owner;
      if(rejectionActive(view,mem,targetOwner))continue;

      const bPrice=BOARD[missing].price||1000;
      const maxCash=Math.max(0,self.cash-kb.reserve-BOARD[missing].build*2);
      const validDonors=tradableDeeds.filter(d=>{
        if(d.group===gIdx)return false;
        if(d.group<0)return true;
        return GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length<GROUPS[d.group].ids.length-1;
      });

      const bundles=[[],...validDonors.slice(0,4).map(d=>[d.id])];
      if(validDonors.length>=2)bundles.push([validDonors[0].id,validDonors[1].id]);

      for(const give of bundles){
        if(added>=3)break;
        for(const mult of [0.95,1.2,1.45,1.75,2.05]){
          const giveCash=Math.min(maxCash,Math.round((bPrice*mult)/50)*50);
          if(give.length===0&&giveCash<bPrice)continue;
          const trade={to:targetOwner,give,take:[missing],giveCash,takeCash:0,giveCards:0,takeCards:0};
          const action={type:'OFFER',trade,actionId:'kresna-nash-'+missing+'-'+give.join('_')+'-'+giveCash};
          if(candidates.some(c=>same(c.action,action)))continue;
          if(!legalCandidate(view,actor,action))continue;
          try{
            const partnerEval=evaluateTrade(view,targetOwner,trade,actor);
            const ownEval=evaluateTrade(view,actor,trade,actor);
            if(partnerEval.net>=2&&ownEval.net>0){
              candidates.push({id:action.actionId,action,score:ownEval.net+280*(KRESNA_GROUP_ROI[gIdx]||1),expanded:true});
              added++;
              break;
            }
          }catch{}
        }
      }

      // Asymmetric Swap for Kresna V2.0
      if(added<3&&(KRESNA_GROUP_ROI[gIdx]||1)>=1.25&&self.cash>=BOARD[missing].build*2+500){
        const swapDonors=tradableDeeds.filter(d=>{
          if(d.group<0||d.group===gIdx)return false;
          if((KRESNA_GROUP_ROI[d.group]||1)>=(KRESNA_GROUP_ROI[gIdx]||1)-0.08)return false;
          return GROUPS[d.group].ids.filter(i=>view.assets[i]?.owner===targetOwner).length===GROUPS[d.group].ids.length-1;
        });
        for(const sDeed of swapDonors){
          if(added>=3)break;
          for(const cDiff of [-300,0,250,500]){
            const giveCash=cDiff>0?Math.min(maxCash,cDiff):0;
            const takeCash=cDiff<0?Math.min(view.players[targetOwner]?.cash||0,-cDiff):0;
            const trade={to:targetOwner,give:[sDeed.id],take:[missing],giveCash,takeCash,giveCards:0,takeCards:0};
            const action={type:'OFFER',trade,actionId:'kresna-swap-'+missing+'-'+sDeed.id+'-'+cDiff};
            if(candidates.some(c=>same(c.action,action)))continue;
            if(!legalCandidate(view,actor,action))continue;
            try{
              const partnerEval=evaluateTrade(view,targetOwner,trade,actor);
              const ownEval=evaluateTrade(view,actor,trade,actor);
              if(partnerEval.net>=5&&ownEval.net>0){
                candidates.push({id:action.actionId,action,score:ownEval.net+265*(KRESNA_GROUP_ROI[gIdx]||1),expanded:true});
                added++;
                break;
              }
            }catch{}
          }
        }
      }
    }
  }
}

export function kresnaPolicyAction(state,actor,plan,{diagnostics=false}={}){
  const base=plan?.action;
  if(!base||!plan?.candidates?.length)return {action:base??null,changed:false,reason:'no_candidates'};
  const phase=state.phase;
  if(!['buy','auction','roll','end','buildOffer','trade','jail','mortgage'].includes(phase)){
    return {action:base,changed:false,reason:'protected_phase'};
  }

  const kb=analyzeKresnaBoard(state,actor);
  ensureKresnaCandidates(kb,plan);

  const {view,self}=kb;
  const ceiling=phase==='auction'?kresnaAuctionCeiling(kb):0;
  const minBid=phase==='auction'?auctionMinimum(view.auction):0;

  const scored=plan.candidates.map(c=>{
    const a=c.action;
    let bonus=0;

    if(phase==='buy'){
      const t=view.buy,b=BOARD[t];
      if(b){
        const val=kresnaTileValuation(kb,t);
        const maxRivalCash=Math.max(0,...kb.rivals.map(r=>r.cash));
        const starvedRivals=maxRivalCash<b.price*0.62&&self.cash>b.price*0.75;
        if(a.type==='BUY'){
          bonus+=starvedRivals?-180:clamp((val-b.price)*0.48+240,-200,950);
        }else if(a.type==='AUCTION'){
          bonus+=starvedRivals?280:-380;
        }
      }
    }else if(phase==='auction'){
      if(a.type==='PASS'){
        bonus+=(minBid<=ceiling&&minBid<=self.cash)?-980:680;
      }else if(a.type==='BID'){
        if(a.amount>ceiling){
          bonus-=1250;
        }else{
          const overSteps=Math.max(0,a.amount-minBid)/AUCTION_RULES.increment;
          bonus+=Math.max(60,640-overSteps*68);
        }
      }
    }else if(isBuild(a)&&Number.isInteger(a.tile)){
      const t=a.tile,b=BOARD[t],lv=view.assets[t]?.level??0;
      const deltaR=(b?.rents?.[lv+1]||0)-rent(view,t,7);
      const dcfFlow=deltaR*(kb.dcfVisits[t]*1.45+kb.ambushVisits[t]*2.95);
      const sweetSpot=lv===2?260:lv===1?185:lv===0?130:lv===3?65:-120;
      const chokeholdVeto=(lv===4&&kb.bank.houses<=16&&kb.rivals.some(r=>GROUPS.some(g=>g.ids.every(i=>view.assets[i]?.owner===r.id))))?-1150:0;
      bonus+=clamp(dcfFlow*0.26+sweetSpot+chokeholdVeto,-1150,880);
    }else if(a.type==='REDEEM'&&Number.isInteger(a.tile)){
      const gIdx=BOARD[a.tile]?.group??-1;
      if(gIdx>=0&&kb.groups[gIdx]?.fullSet)bonus+=520;
    }else if(a.type==='MORTGAGE'&&Number.isInteger(a.tile)){
      const gIdx=BOARD[a.tile]?.group??-1;
      if(gIdx>=0&&kb.groups[gIdx]?.fullSet)bonus-=900;
      else if(kb.needsFlashCapital&&c.macro?.length>1)bonus+=360;
    }else if(phase==='jail'){
      const early=kb.unownedCount>=6&&kb.expectedLoss<380;
      const late=kb.unownedCount<=4&&kb.expectedLoss>=360;
      if(a.type==='ROLL')bonus+=late?380:(early?-250:45);
      if(a.type==='JAIL_CARD'||a.type==='JAIL_PAY')bonus+=early?340:(late?-400:0);
    }else if(['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(a.type)){
      const raw=(a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT')?view.trade:a.trade;
      if(raw){
        const isIncoming=a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT';
        const partnerId=isIncoming?raw.from:raw.to;
        const myGive=isIncoming?(raw.take||[]):(raw.give||[]);
        const myTake=isIncoming?(raw.give||[]):(raw.take||[]);
        const givesOppMono=GROUPS.some(g=>!g.ids.every(i=>view.assets[i]?.owner===partnerId)&&g.ids.every(i=>(view.assets[i]?.owner===partnerId&&!myTake.includes(i))||myGive.includes(i)));
        const givesMeMono=GROUPS.some(g=>!g.ids.every(i=>view.assets[i]?.owner===actor)&&g.ids.every(i=>(view.assets[i]?.owner===actor&&!myGive.includes(i))||myTake.includes(i)));
        if(givesOppMono&&!givesMeMono){
          bonus+=(a.type==='TRADE_REJECT')?850:-1600;
        }else if(givesMeMono&&!givesOppMono){
          bonus+=(a.type==='TRADE_REJECT')?-650:620;
        }
      }
    }

    return {...c,kresnaScore:c.score+bonus};
  }).sort((a,b)=>b.kresnaScore-a.kresnaScore||a.id.localeCompare(b.id));

  const best=scored[0];
  if(!best||same(best.action,base))return {action:base,changed:false,reason:'kresna_baseline'};
  if((plan.candidates[0]?.score??0)>=1e7||!legalCandidate(view,actor,best.action)){
    return {action:base,changed:false,reason:'kresna_guard'};
  }
  return {
    action:best.action,
    changed:true,
    reason:'kresna_v2_quantum_dcf',
    ...(diagnostics?{details:{topScore:best.kresnaScore,phase,reserve:kb.reserve}}:{})
  };
}
