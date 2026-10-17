/**
 * MONOPOLY APEX policy adapter for NUSA MIND research matches.
 * Adapted from user-provided monopoly_apex.py (Sonnet); JS implementation runs
 * inside the authoritative Nusantara engine. DOES NOT use the Python simulator.
 * Every action is selected from planDecision's legal candidates. Only public
 * observation, property definitions and public forecast APIs are accessed.
 * Apex instances are independent: no shared team state or coordination.
 * Research baseline, NOT a proven strongest bot or production replacement.
 */
import {BOARD,GROUPS} from '../content.mjs';
import {observation} from './mind.mjs';
import {stock,rent} from '../game.mjs';
import {landingForecast,expectedRentAt} from './probability.mjs';
import {legalCandidate} from './candidates.mjs';

export const APEX_ADAPTER_VERSION='1.0.0';
const isBuild=a=>a?.type==='BUILD'||a?.type==='BUILD_JOIN';
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const SETTINGS=Object.freeze({
  setMultiplier:2.35,partialMultiplier:.47,contestedMultiplier:.78,
  denialWeight:.62,auctionRiskWeight:.38,houseHoardWeight:.18,
  tradeOpponentPenalty:.58,buildFutureWeight:.19,
});

// Assess group acquisition as a PORTFOLIO delta (not a property face-value tag).
function groupValue(view,actor,group,override=null){
  const ids=GROUPS[group].ids,n=ids.length;
  let mine=0,other=0,price=0;
  for(const id of ids){
    const owner=id===override?.tile?override.owner:view.assets[id]?.owner;
    if(owner===actor){mine++;price+=BOARD[id].price;}else if(owner!=null)other++;
  }
  if(!mine)return 0;
  // A completed set is useful only when construction is attainable; remaining
  // cash and mortgage status are assessed by the existing rule/economy planner.
  if(mine===n)return price*SETTINGS.setMultiplier;
  if(other===0)return price*(1+SETTINGS.partialMultiplier*mine/n);
  return price*SETTINGS.contestedMultiplier;
}
function acquisitionValue(view,actor,tile){
  const t=BOARD[tile];
  if(!t?.price)return 0;
  if(t.group<0){
    const sameKind=BOARD.filter(b=>b.type===t.type && b.price);
    const own=sameKind.filter(b=>view.assets[b.id]?.owner===actor).length;
    const maximum=t.type==='station'?4:2;
    const basic=t.price*(t.type==='station'?1.25:.8);
    return basic*(1+.36*own/Math.max(1,maximum-1));
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
  if(bank.houses>=12)return 0;
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
function marginalBuild(view,actor,tile,visits,scarcity,bank){
  const t=BOARD[tile],a=view.assets[tile];
  if(!t||!a||a.owner!==actor||a.level>=5)return -Infinity;
  const after={...view,assets:{...view.assets,[tile]:{...a,level:a.level+1}}};
  const nextRent=visits.reduce((v,f)=>v+expectedRentAt(after,tile,f)-expectedRentAt(view,tile,f),0);
  const incrementCost=t.build||0;
  const level=a.level;
  let nearThree=0;
  if(level<2){
    // Route-to-3 potential, discounted so the first low-rent house is not
    // unfairly discarded. This is NOT a legal multi-build command.
    nearThree=(t.rents[3]-t.rents[level+1])*visits.reduce((s,f)=>s+(f.visits[tile]||0),0);
  }
  const denial=level<4&&bank.houses<=9?Math.max(0,10-bank.houses)*scarcity*incrementCost*SETTINGS.houseHoardWeight:0;
  const release=level===4&&bank.houses<=9?4*scarcity*incrementCost*SETTINGS.houseHoardWeight:0;
  return nextRent*1.8+nearThree*SETTINGS.buildFutureWeight+denial-release-incrementCost*.15;
}

/** Choose only among legal, already-generated actions. Returns plan unchanged on
 * nonstrategic phases and debt/liquidation, which have strict engine invariants.
 */
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
  const salary=view.rules?.salary??2000;
  const reserve=Math.max(salary*.18,exposure.expected*.7+Math.min(exposure.worst*.18,salary*.4));
  const scored=plan.candidates.map(c=>{
    const a=c.action;let score=c.score;
    if(phase==='buy'&&a.type==='BUY'){
      const tile=view.buy;
      if(Number.isInteger(tile)){
        const value=acquisitionValue(view,actor,tile);
        const price=BOARD[tile]?.price??0;
        score+=clamp((value-price)*.4, -salary*.5,salary*1.4);
        if(p.cash-price<reserve)score-=Math.min(salary*.6,(reserve-(p.cash-price))*.3);
      }
    }else if(phase==='auction'&&view.auction?.kind!=='building'&&a.type==='BID'){
      const tile=view.auction?.tile,amount=a.amount??0;
      if(Number.isInteger(tile)){
        const value=acquisitionValue(view,actor,tile);
        // Preserve bidding when value supports it. A budget guard is only
        // penalized, not converted into unconditional PASS (V4 failure mode).
        const surplus=value-amount;
        score+=clamp(surplus*.16,-salary*.35,salary*.8);
        if(p.cash-amount<reserve)score-=(reserve-(p.cash-amount))*SETTINGS.auctionRiskWeight;
      }
    }else if(isBuild(a)&&Number.isInteger(a.tile)){
      const marginal=marginalBuild(view,actor,a.tile,chance,scarcity,banking);
      if(Number.isFinite(marginal)){
        score+=clamp(marginal*.12,-salary*.22,salary*.65);
        if(p.cash-(BOARD[a.tile].build??0)<reserve)
          score-=Math.min(salary*.25,(reserve-(p.cash-BOARD[a.tile].build))*.15);
      }
    }else if(phase==='trade'&&['OFFER','COUNTER','TRADE_ACCEPT'].includes(a.type)){
      // Native Nusa planner handles 6-player bilateral utility & solvency.
      // Never replace that robust evaluation with Sonnet's two-player-only one.
      score-=Math.max(0,-c.score)*SETTINGS.tradeOpponentPenalty;
    }
    return {...c,apexScore:score};
  }).sort((a,b)=>b.apexScore-a.apexScore||a.id.localeCompare(b.id));
  const best=scored[0];
  if(!best||same(best.action,base))return {action:base,changed:false,reason:'apex_same'};
  // Never undo force priority or debt guard from authoritative strategy planner.
  if((plan.candidates[0]?.score??0)>1e6||!legalCandidate(view,actor,best.action))
    return {action:base,changed:false,reason:'apex_guard'};
  // Changes require a material margin to avoid policy jitter and turn cycles.
  const original=scored.find(c=>same(c.action,base));
  if(original&&best.apexScore-original.apexScore<Math.max(30,salary*.009))
    return {action:base,changed:false,reason:'apex_margin'};
  return {action:best.action,changed:true,reason:'apex_portfolio',
    ...(diagnostics?{details:{oldScore:original?.apexScore,newScore:best.apexScore,phase,reserve,scarcity}}:{})};
}
