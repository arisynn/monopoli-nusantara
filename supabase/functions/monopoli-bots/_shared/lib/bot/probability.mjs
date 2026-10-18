import {BOARD,DECKS} from '../content.mjs';
import {rent} from '../game.mjs';

// Public marginal forecasts, not reconstruction of the live shuffled deck. Keep
// doubles and jail attempts in the state: visiting tile 10 is not incarceration.
const caches=new Map();
function publicKernel(s){
 const held=new Set(s.players.flatMap(p=>p.cards||[]).map(c=>`${c.deck}:${c.idx}`));
 if(s.card?.jailCard)held.add(`${s.card.deck}:${s.card.idx}`);
 const key=[...held].sort().join(',');if(caches.has(key))return caches.get(key);
 const arrivals=new Map(),rolls=new Map(),forecasts=new Map();
 function land(pos,depth=0){
  if(pos===30)return [{pos:10,inJail:true,factor:1,utility:false,p:1}];
  if(!['chance','community'].includes(BOARD[pos].type)||depth>3)return [{pos,inJail:false,factor:1,utility:false,p:1}];
  if(arrivals.has(pos))return arrivals.get(pos);
  const deck=DECKS[BOARD[pos].type].filter((_,i)=>!held.has(`${BOARD[pos].type}:${i}`)),out=[];
  for(const card of deck){
   if(card.jail){out.push({pos:10,inJail:true,factor:1,utility:false,p:1/deck.length});continue;}
   let dest=pos;
   if(card.move!==undefined)dest=card.move;
   else if(card.back)dest=(pos-card.back+40)%40;
   else if(card.nearest){do{dest=(dest+1)%40;}while(BOARD[dest].type!==card.nearest);}
   const children=dest===pos?[{pos,inJail:false,factor:1,utility:false,p:1}]:land(dest,depth+1);
   for(const child of children)out.push({...child,factor:card.rentFactor||child.factor,utility:!!card.utilityRoll||child.utility,p:child.p/deck.length});
  }
  arrivals.set(pos,out);return out;
 }
 function roll(node){
  const key=`${node.pos}:${node.inJail?node.jail+1:0}:${node.doubles}`;
  if(rolls.has(key))return rolls.get(key);
  const out=[];
  for(let x=1;x<=6;x++)for(let y=1;y<=6;y++){
   const double=x===y;
   if(node.inJail&&!double&&node.jail<2){out.push({pos:10,inJail:true,jail:node.jail+1,doubles:0,factor:1,utility:false,p:1/36,fine:0});continue;}
   if(!node.inJail&&double&&node.doubles===2){out.push({pos:10,inJail:true,jail:0,doubles:0,factor:1,utility:false,p:1/36,fine:0});continue;}
   for(const dest of land((node.pos+x+y)%40))out.push({...dest,jail:0,doubles:dest.inJail||node.inJail||!double?0:node.doubles+1,p:dest.p/36,diceTotal:x+y,fine:node.inJail&&!double?500:0});
  }
  rolls.set(key,out);return out;
 }
 const kernel={roll,forecasts};if(caches.size>=8)caches.delete(caches.keys().next().value);caches.set(key,kernel);return kernel;
}
export function landingForecast(s,id,horizon=3){
 const p=s.players[id],steps=Math.min(6,Math.max(1,Math.floor(horizon))),kernel=publicKernel(s);
 const first={pos:p.pos,inJail:p.inJail,jail:p.jail||0,doubles:s.turn===id?s.doubles||0:0};
 const key=JSON.stringify([first,steps]);if(kernel.forecasts.has(key))return kernel.forecasts.get(key);
 let current=new Map([[JSON.stringify(first),{...first,p:1}]]);
 const visits=Array(40).fill(0),rentWeights=Array(40).fill(0),utilityWeights=Array(40).fill(0),diceWeights=Array(40).fill(0),utilityDiceWeights=Array(40).fill(0);let jailFine=0;
 for(let step=0;step<steps;step++){
  const next=new Map();
  for(const node of current.values())for(const child of kernel.roll(node)){
   const chance=node.p*child.p;visits[child.pos]+=chance;
   rentWeights[child.pos]+=chance*child.factor;
   diceWeights[child.pos]+=chance*child.factor*(child.utility?7:(child.diceTotal||0));
   if(child.utility){utilityWeights[child.pos]+=chance;utilityDiceWeights[child.pos]+=chance*child.factor*7;}
   jailFine+=chance*child.fine;
   const k=`${child.pos}:${child.inJail?child.jail+1:0}:${child.doubles}`,prior=next.get(k);
   if(prior)prior.p+=chance;else next.set(k,{pos:child.pos,inJail:child.inJail,jail:child.jail,doubles:child.doubles,p:chance});
  }
  current=next;
 }
 const result=Object.freeze({visits:Object.freeze(visits),rentWeights:Object.freeze(rentWeights),utilityWeights:Object.freeze(utilityWeights),diceWeights:Object.freeze(diceWeights),utilityDiceWeights:Object.freeze(utilityDiceWeights),jailFine});
 if(kernel.forecasts.size>=256)kernel.forecasts.delete(kernel.forecasts.keys().next().value);kernel.forecasts.set(key,result);return result;
}
export function expectedRentAt(s,tile,forecast){
 // Ordinary utility rent uses the dice that caused this landing. Its conditional
 // mean is not generally seven. Card-requested utility rolls are independent.
 if(BOARD[tile].type==='utility'&&forecast.diceWeights){
  const normal=rent(s,tile,1),special=rent(s,tile,1,1,true);
  return normal*forecast.diceWeights[tile]+(special-normal)*forecast.utilityDiceWeights[tile];
 }
 const normal=rent(s,tile,7),premium=BOARD[tile].type==='utility'?Math.max(0,rent(s,tile,7,1,true)-normal)*forecast.utilityWeights[tile]:0;
 return normal*forecast.rentWeights[tile]+premium;
}
