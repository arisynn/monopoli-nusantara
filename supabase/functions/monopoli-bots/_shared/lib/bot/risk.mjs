import {BOARD,DECKS,GROUPS} from '../content.mjs';
import {rent,managementError} from '../game.mjs';
import {economyRules,strengthShares} from './economy.mjs';

const distributions=new Map();
/** Upper-tail mean with exact atom splitting, normalized finite probabilities. */
export function discreteCVaR(scenarios,alpha=.85){
 if(!Number.isFinite(alpha)||alpha<0||alpha>=1)throw RangeError('CVaR alpha must be in [0,1).');
 const rows=scenarios.filter(x=>Number.isFinite(x.loss)&&Number.isFinite(x.prob)&&x.prob>0).sort((a,b)=>b.loss-a.loss);
 const mass=rows.reduce((n,x)=>n+x.prob,0);if(!mass)return {mean:0,var:0,cvar:0};
 let remaining=1-alpha,tail=0,cumulative=0,quantile=rows.at(-1).loss;
 for(const row of rows){const p=row.prob/mass,take=Math.min(remaining,p);tail+=take*row.loss;remaining=Math.max(0,remaining-take);}
 for(const row of rows.slice().reverse()){cumulative+=row.prob/mass;quantile=row.loss;if(cumulative+1e-12>=alpha)break;}
 return {mean:rows.reduce((n,x)=>n+x.loss*x.prob/mass,0),var:quantile,cvar:tail/(1-alpha)};
}

/** Joint public-card, dice and cash-path model for one/two future ROLLS, not an
 * exact whole-table-turn or finite-deck model. Uses peak cash need so an income
 * arriving after a bill cannot retroactively rescue that earlier payment. */
export function lossDistribution(s,id,rolls=2){
 const horizon=Math.min(2,Math.max(1,Math.floor(rolls))),p=s.players[id],rules=economyRules(s);
 const held=new Set(s.players.flatMap(q=>q.cards||[]).map(c=>`${c.deck}:${c.idx}`));
 if(s.card?.jailCard)held.add(`${s.card.deck}:${s.card.idx}`);
 const key=JSON.stringify([s.schemaVersion,id,horizon,p.pos,p.inJail,p.jail,s.turn===id?s.doubles:0,rules.salary,rules.jailFine,s.players.map(q=>q.out),s.assets,[...held].sort()]);
 if(distributions.has(key))return distributions.get(key);
 const active=s.players.filter(q=>!q.out).length,own=BOARD.filter(t=>s.assets[t.id]?.owner===id);
 const charge=(node,amount)=>({...node,balance:node.balance+amount,peak:Math.max(node.peak,node.balance+amount)});
 const forward=(node,to,back=false)=>({...node,pos:to,balance:node.balance-(!back&&to<node.pos?rules.salary:0)});
 function land(node,dice,depth=0,factor=1,utility=false){
  const t=BOARD[node.pos],a=s.assets[node.pos];
  if(t.type==='gojail')return [{...node,pos:10,inJail:true,jail:0,doubles:0}];
  if(t.type==='tax')return [charge(node,t.tax)];
  if(a?.owner!=null&&a.owner!==id&&!a.mortgaged){
   if(t.type==='utility'&&(s.schemaVersion!==1||utility)){const out=[];for(let x=1;x<=6;x++)for(let y=1;y<=6;y++)out.push({...charge(node,rent(s,t.id,x+y,factor,utility)),p:node.p/36});return out;}
   return [charge(node,rent(s,t.id,dice,factor))];
  }
  if(!['chance','community'].includes(t.type)||depth>=4)return [node];
  const deck=DECKS[t.type].filter((_,idx)=>!held.has(`${t.type}:${idx}`)),out=[];
  for(const c of deck){let next={...node,p:node.p/deck.length};
   if(c.jail){out.push({...next,pos:10,inJail:true,jail:0,doubles:0});continue;}
   if(c.money)next=charge(next,-c.money);
   if(c.each<0)next=charge(next,-c.each*(active-1));
   // Other players' future payments are uncertain: do not spend them in advance.
   if(c.repair)next=charge(next,own.reduce((n,t)=>n+(s.assets[t.id].level===5?c.repair[1]:s.assets[t.id].level*c.repair[0]),0));
   let to=next.pos,moved=false,back=false;
   if(c.move!==undefined){to=c.move;moved=to!==next.pos;}
   else if(c.back){to=(to-c.back+40)%40;moved=true;back=true;}
   else if(c.nearest){do{to=(to+1)%40;}while(BOARD[to].type!==c.nearest);moved=true;}
   if(moved)out.push(...land(forward(next,to,back),dice,depth+1,c.rentFactor||1,!!c.utilityRoll));else out.push(next);
  }
  return out;
 }
 let nodes=[{pos:p.pos,inJail:!!p.inJail,jail:p.jail||0,doubles:s.turn===id?s.doubles||0:0,balance:0,peak:0,p:1}];
 for(let step=0;step<horizon;step++){
  const next=new Map();
  const add=node=>{const k=[node.pos,+node.inJail,node.jail,node.doubles,node.balance,node.peak].join(':');if(next.has(k))next.get(k).p+=node.p;else next.set(k,node);};
  for(const node of nodes)for(let x=1;x<=6;x++)for(let y=1;y<=6;y++){
   const double=x===y;let child={...node,p:node.p/36};
   if(node.inJail&&!double&&node.jail<2){add({...child,jail:node.jail+1,doubles:0});continue;}
   if(!node.inJail&&double&&node.doubles===2){add({...child,pos:10,inJail:true,jail:0,doubles:0});continue;}
   if(node.inJail&&!double)child=charge(child,rules.jailFine);
   child=forward({...child,inJail:false,jail:0,doubles:node.inJail||!double?0:node.doubles+1},(node.pos+x+y)%40);
   for(const arrival of land(child,x+y))add(arrival);
  }
  nodes=[...next.values()];
 }
 const losses=new Map();for(const node of nodes)losses.set(node.peak,(losses.get(node.peak)||0)+node.p);
 const result=Object.freeze([...losses].map(([loss,prob])=>Object.freeze({loss,prob})));
 if(distributions.size>=128)distributions.delete(distributions.keys().next().value);distributions.set(key,result);return result;
}

export function riskReserve(s,id,{persona,expectedIncome=0,rolls=2}={}){
 const rules=economyRules(s),shares=strengthShares(s,BOARD,GROUPS,rent),active=s.players.filter(p=>!p.out).length;
 const alpha=Math.max(.6,Math.min(.95,(persona?.cvarAlpha??.84)+.3*((shares[id]||0)-1/Math.max(1,active))));
 const distribution=lossDistribution(s,id,rolls),risk=discreteCVaR(distribution,alpha);
 let buffer=0,estate=Math.max(0,s.players[id].cash);
 for(const t of BOARD){const a=s.assets[t.id];if(a?.owner!==id)continue;
  estate+=(a.mortgaged?0:t.mortgage)+(t.build||0)*a.level*.5;
  if(!managementError(s,id,t.id,'MORTGAGE')&&(t.group<0||!GROUPS[t.group].ids.every(i=>s.assets[i].owner===id)))buffer+=t.mortgage;
 }
 const need=Math.max(0,risk.cvar-buffer*.75-Math.max(0,expectedIncome)*.15);
 return Object.freeze({...risk,alpha,buffer,estate,reserve:Math.ceil(rules.floor+need*(persona?.risk||1)),
  ruinProbability:distribution.reduce((n,x)=>n+(x.loss>estate?x.prob:0),0),horizonRolls:rolls,model:'public-independent-card-rolls'});
}
