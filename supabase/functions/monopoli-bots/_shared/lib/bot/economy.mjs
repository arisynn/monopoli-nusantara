import {CURRENCY} from '../currency.mjs';
import {RULEPACK,BOARD} from '../content.mjs';

/** Adapter for the authoritative rules, never display-formatted currency. The
 * current C1009 engine exposes scale but keeps salary/start cash in its reducer.
 * A target engine may expose those constants through rulepack/rules instead. */
export function economyRules(s={}){
 const rules=typeof s.rulepack==='object'?s.rulepack:s.rules||{};
 const positive=(v,fallback)=>Number.isFinite(v)&&v>0?v:fallback;
 const scale=positive(RULEPACK.scale,10);
 const salary=positive(rules.goSalary,positive(RULEPACK.goSalary,200*scale));
 return Object.freeze({salary,startingCash:positive(rules.startingCash,positive(RULEPACK.startingCash,salary*7.5)),
  jailFine:positive(rules.jailFine,salary*.25),floor:salary*.18,
  houses:positive(rules.houseSupply,32),hotels:positive(rules.hotelSupply,12)});
}

/** Public strategic strength, not a trained/calibrated win probability. All
 * participants use the same parameters; controller/persona is never consulted. */
export function strengthShares(s,board,groups,rentAt){
 const {salary}=economyRules(s),alive=s.players.filter(p=>!p.out);
 if(s.phase==='won')return Object.fromEntries(s.players.map(p=>[p.id,p.id===s.winner?1:0]));
 const strengths=alive.map(p=>{
  let equity=Math.max(0,p.cash)*.65,flow=0,readiness=0;
  for(const t of board){const a=s.assets[t.id];if(a?.owner!==p.id)continue;
   equity+=a.mortgaged?t.mortgage*.4:t.price*.9;
   equity+=(t.build||0)*a.level*.5;
   if(!a.mortgaged)flow+=rentAt(s,t.id,7)*.025*Math.max(1,alive.length-1)*10;
  }
  for(const g of groups)if(g.ids.every(i=>s.assets[i].owner===p.id&&!s.assets[i].mortgaged)){
   const cost=g.ids.reduce((n,i)=>n+Math.max(0,3-s.assets[i].level)*board[i].build,0);
   readiness+=Math.min(salary*2,cost*.4)*Math.min(1,Math.max(0,p.cash)/Math.max(salary*.1,cost));
  }
  return Math.max(.01,(equity+flow+readiness)/salary);
 });
 const exponent=1.15,total=strengths.reduce((n,v)=>n+v**exponent,0);
 return Object.fromEntries(s.players.map(p=>[p.id,p.out?0:strengths[alive.findIndex(q=>q.id===p.id)]**exponent/Math.max(.0001,total)]));
}

/** Construction policy only; authoritative human rules/currency are unchanged.
 * Keep N50..N200 liquid according to public risk. Higher reserves still affect
 * economic scoring; this is a hard lower bound, not a cap on total cash. */
export function buildingCashReserve({reserve=200*CURRENCY.unitsPerNusa}={}){
 return Math.ceil(Math.max(50*CURRENCY.unitsPerNusa,Math.min(200*CURRENCY.unitsPerNusa,reserve)));
}
export function constructionAffordable(s,id,action,reserve){
 const building=['BUILD','BUILD_JOIN'].includes(action.type)||action.type==='BID'&&s.auction?.kind==='building';
 if(!building)return true;
 const cost=action.type==='BID'?action.amount:BOARD[action.tile]?.build;
 const committed=action.type!=='BID'&&s.auction?.highest===id?s.auction.amount:0;
 return Number.isSafeInteger(cost)&&s.players[id].cash-cost-committed>=buildingCashReserve({reserve});
}
