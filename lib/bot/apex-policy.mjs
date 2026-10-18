/**
 * MONOPOLY APEX V3.0 — Portfolio Velocity, 1-Roll Ambush & Scarcity Predator.
 * Upgraded with C1009 Color Group ROI Matrix, 1-Roll Ambush Build Targeting,
 * Monopoly Unmortgage Acceleration, and Anti-Kingmaking Guard.
 */
import {BOARD,GROUPS,auctionMinimum} from '../content.mjs';
import {observation} from './mind.mjs';
import {stock,rent,redemption,managementError} from '../game.mjs';
import {landingForecast,expectedRentAt} from './probability.mjs';
import {legalCandidate} from './candidates.mjs';

export const APEX_ADAPTER_VERSION='3.0.0-predator';

const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

const GROUP_ROI=[1.06,1.38,1.22,1.58,1.50,1.25,0.88,1.25];
const SETTINGS=Object.freeze({
  setMultiplier:2.45,
  partialMultiplier:0.55,
  contestedMultiplier:0.78,
  denialWeight:0.72,
  auctionRiskWeight:0.35,
  houseHoardWeight:0.26,
  tradeOpponentPenalty:0.70,
  buildFutureWeight:0.24
});

function groupValue(view,actor,group,override=null){
  const ids=GROUPS[group].ids,n=ids.length,roi=GROUP_ROI[group]||1;
  let mine=0,other=0,price=0;
  for(const id of ids){
    const owner=id===override?.tile?override.owner:view.assets[id]?.owner;
    if(owner===actor){mine++;price+=BOARD[id].price;}else if(owner!=null)other++;
  }
  if(!mine)return 0;
  if(mine===n)return price*SETTINGS.setMultiplier*roi;
  if(other===0)return price*(1+SETTINGS.partialMultiplier*mine/n)*roi;
  return price*SETTINGS.contestedMultiplier;
}

function acquisitionValue(view,actor,tile){
  const t=BOARD[tile];
  if(!t?.price)return 0;
  if(t.group<0){
    const sameKind=BOARD.filter(b=>b.type===t.type&&b.price);
    const own=sameKind.filter(b=>view.assets[b.id]?.owner===actor).length;
    const maximum=t.type==='station'?4:2;
    const basic=t.price*(t.type==='station'?1.24:0.76);
    return basic*(1+0.38*own/Math.max(1,maximum-1));
  }
  const own=groupValue(view,actor,t.group,{tile,owner:actor})-groupValue(view,actor,t.group);
  let denial=0;
  for(const p of view.players){
    if(p.id===actor||p.out)continue;
    const value=groupValue(view,p.id,t.group,{tile,owner:p.id})-groupValue(view,p.id,t.group);
    denial=Math.max(denial,value);
  }
  return own+denial*SETTINGS.denialWeight;
}

function houseThreat(view,actor,bank){
  if(bank.houses>=15)return 0;
  let rivals=0;
  for(const p of view.players){
    if(p.out||p.id===actor)continue;
    if(GROUPS.some(g=>g.ids.every(i=>view.assets[i]?.owner===p.id&&!view.assets[i]?.mortgaged)&&g.ids.some(i=>view.assets[i]?.level<4)))rivals++;
  }
  return Math.min(1,rivals/Math.max(1,view.players.filter(p=>!p.out&&p.id!==actor).length));
}

function publicExposure(view,actor){
  const forecast=landingForecast(view,actor,1);
  const ownCash=view.players[actor].cash;
  let expected=0,worst=0;
  for(const t of BOARD){
    const asset=view.assets[t.id];
    if(!t.price||asset?.owner==null||asset.owner===actor||asset.mortgaged)continue;
    const r=expectedRentAt(view,t.id,forecast);
    expected+=r;
    if(forecast.visits[t.id]>0)worst=Math.max(worst,rent(view,t.id,7));
  }
  return {expected,worst,cash:ownCash};
}

function marginalBuild(view,actor,tile,visits,immediateVisits,scarcity,bank){
  const t=BOARD[tile],a=view.assets[tile];
  if(!t||!a||a.owner!==actor||a.level>=5)return -Infinity;
  const after={...view,assets:{...view.assets,[tile]:{...a,level:a.level+1}}};
  const nextRent=visits.reduce((v,f)=>v+expectedRentAt(after,tile,f)-expectedRentAt(view,tile,f),0);
  const ambushRent=immediateVisits.reduce((v,f)=>v+expectedRentAt(after,tile,f)-expectedRentAt(view,tile,f),0);
  const incrementCost=t.build||0;
  const level=a.level;
  let nearThree=0;
  if(level<3){
    nearThree=(t.rents[3]-t.rents[level+1])*visits.reduce((s,f)=>s+(f.visits[tile]||0),0)*(GROUP_ROI[t.group]||1);
  }
  const denial=level<4&&bank.houses<=14?Math.max(0,15-bank.houses)*scarcity*incrementCost*SETTINGS.houseHoardWeight:0;
  const release=level===4&&bank.houses<=14?4*scarcity*incrementCost*SETTINGS.houseHoardWeight*1.65:0;
  return nextRent*1.85+ambushRent*1.35+nearThree*SETTINGS.buildFutureWeight+denial-release-incrementCost*0.13;
}

export function apexPolicyAction(state,actor,plan,{diagnostics=false}={}){
  const base=plan?.action;
  if(!base||!plan?.candidates?.length)return {action:base??null,changed:false,reason:'no_candidates'};
  const phase=state.phase;
  if(!['buy','auction','roll','end','buildOffer','trade','jail'].includes(phase))
    return {action:base,changed:false,reason:'protected_phase'};
  const view=observation(state,actor),p=view.players[actor];
  if(!p||p.out)return {action:base,changed:false,reason:'inactive'};
  const banking=stock(view),rivals=view.players.filter(q=>!q.out&&q.id!==actor);
  const exposure=publicExposure(view,actor),scarcity=houseThreat(view,actor,banking);
  const chance=rivals.map(q=>landingForecast(view,q.id,2));
  const immediateChance=rivals.map(q=>landingForecast(view,q.id,1));
  const salary=view.rules?.salary??2000;
  const reserve=Math.max(salary*0.18,exposure.expected*0.68+Math.min(exposure.worst*0.17,salary*0.38));

  // Ensure minimum increment bid exists in auction
  if(phase==='auction'&&view.auction?.participants?.includes(actor)&&view.auction?.highest!==actor){
    const minBid=auctionMinimum(view.auction);
    const tile=view.auction.kind==='building'?view.auction.targets?.[actor]:view.auction.tile;
    const val=view.auction.kind==='building'?(BOARD[tile]?.build||1000)*1.50:Math.min(BOARD[tile]?.price*1.42||1500,acquisitionValue(view,actor,tile));
    if(minBid<=val&&minBid<=p.cash-reserve*0.28&&!plan.candidates.some(c=>c.action.type==='BID'&&c.action.amount===minBid)){
      const act={type:'BID',amount:minBid,actionId:'apex-min-bid-'+minBid};
      if(legalCandidate(view,actor,act)){
        plan.candidates.push({id:act.actionId,action:act,score:plan.candidates[0]?.score||0});
      }
    }
  }

  // Ensure monopoly REDEEM is prioritized if affordable
  if(['roll','end'].includes(phase)&&view.turn===actor){
    for(const g of GROUPS){
      if(g.ids.every(i=>view.assets[i]?.owner===actor)){
        const mTile=g.ids.find(i=>view.assets[i]?.mortgaged);
        if(mTile!==undefined&&p.cash>=redemption(mTile)+reserve*0.5&&!managementError(view,actor,mTile,'REDEEM')){
          const ex=plan.candidates.find(c=>c.action.type==='REDEEM'&&c.action.tile===mTile);
          if(ex)ex.score+=420;
        }
      }
    }
  }

  const scored=plan.candidates.map(c=>{
    const a=c.action;let score=c.score;
    if(phase==='buy'&&a.type==='BUY'){
      const tile=view.buy;
      if(Number.isInteger(tile)){
        const value=acquisitionValue(view,actor,tile);
        const price=BOARD[tile]?.price??0;
        score+=clamp((value-price)*0.48,-salary*0.4,salary*1.45)+165;
        if(p.cash-price<reserve)score-=Math.min(salary*0.6,(reserve-(p.cash-price))*0.3);
      }
    }else if(phase==='auction'&&a.type==='BID'){
      const tile=view.auction?.kind==='building'?view.auction?.targets?.[actor]:view.auction?.tile;
      const amount=a.amount??0;
      const minBid=auctionMinimum(view.auction);
      if(Number.isInteger(tile)){
        const rawVal=view.auction?.kind==='building'?(BOARD[tile]?.build||1000)*1.50:acquisitionValue(view,actor,tile);
        const cap=view.auction?.kind==='building'?rawVal:Math.min(rawVal,BOARD[tile].price*1.45);
        const surplus=cap-amount;
        score+=clamp(surplus*0.24-(amount-minBid)*0.38,-salary*0.45,salary*0.88);
        if(p.cash-amount<reserve)score-=(reserve-(p.cash-amount))*SETTINGS.auctionRiskWeight;
      }
    }else if(isBuild(a)&&Number.isInteger(a.tile)){
      const marginal=marginalBuild(view,actor,a.tile,chance,immediateChance,scarcity,banking);
      if(Number.isFinite(marginal)){
        score+=clamp(marginal*0.15,-salary*0.25,salary*0.75);
        if(p.cash-(BOARD[a.tile].build??0)<reserve)
          score-=Math.min(salary*0.25,(reserve-(p.cash-BOARD[a.tile].build))*0.15);
      }
    }else if(phase==='trade'&&['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type)){
      score-=Math.max(0,-c.score)*SETTINGS.tradeOpponentPenalty;
    }
    return {...c,apexScore:score};
  }).sort((a,b)=>b.apexScore-a.apexScore||a.id.localeCompare(b.id));

  const best=scored[0];
  if(!best||same(best.action,base))return {action:base,changed:false,reason:'apex_same'};
  if((plan.candidates[0]?.score??0)>1e6||!legalCandidate(view,actor,best.action))
    return {action:base,changed:false,reason:'apex_guard'};
  const original=scored.find(c=>same(c.action,base));
  if(original&&best.apexScore-original.apexScore<Math.max(22,salary*0.008))
    return {action:base,changed:false,reason:'apex_margin'};
  return {
    action:best.action,
    changed:true,
    reason:'apex_v3_predator',
    ...(diagnostics?{details:{oldScore:original?.apexScore,newScore:best.apexScore,phase,reserve,scarcity}}:{})
  };
}
