import {DECKS} from '../../lib/content.mjs';
import {transactionDeltas} from '../../lib/finance.mjs';
import {diceTiming} from '../../lib/dice-timing.mjs';
export const MAX_VISUAL_STEPS=96;
const cursor=s=>({match:s.matchId,version:s.version,eventId:s.eventId||0});
const title=type=>({card:'Kartu dibuka',jail:'Masuk penjara',release:'Bebas dari penjara',bankrupt:'Kebangkrutan',auctionResult:'Hasil lelang'})[type]||'Peristiwa';
function eventCard(e,s){
 if(e.card)return e.card;
 // Compatibility with older servers: an already revealed card can be recovered from its public log title.
 const current=s.phase==='card'&&s.card&&s.log.find(x=>x.type==='card')?.id===e.id?s.card:null;
 if(current)return current;
 if(s.schemaVersion===1||!Number.isInteger(e.actor))return null;
 for(const [deck,cards] of Object.entries(DECKS))for(let idx=0;idx<cards.length;idx++)if(e.text.endsWith(': '+cards[idx].title+'.'))return {deck,idx,player:e.actor??s.turn,...cards[idx]};
 return null;
}
function eventMove(e,s){
 if(e.move)return {...e.move,approach:undefined};
 return s.lastMove?.id===e.id?{...s.lastMove,approach:undefined}:null;
}
function reveal(e,s){const card=e.type==='card'?eventCard(e,s):null;return {id:`${s.matchId}:${e.id}`,logId:e.id,type:e.type,title:title(e.type),text:e.text,actor:e.actor??card?.player??s.turn,...(card?{card}:{}),...(e.auctionResult?{auctionResult:e.auctionResult}:{})};}
function buildSteps(events,s){
 const steps=[],deferred=[],counts=new Map();
 const add=(e,kind,data={})=>{const key=`${e.id}:${kind}`,ordinal=counts.get(key)||0;counts.set(key,ordinal+1);steps.push({id:`${s.matchId}:${e.id}:${kind}:${ordinal}`,kind,source:e,...data})};
 function finance(e){
  if(e.finance?.length)e.finance.forEach((transaction,index)=>add(e,'financialSettlement',{finance:transaction,...(index===0?{assetChanges:e.assetChanges}:{})}));
  else if(e.assetChanges?.length)add(e,'asset',{assetChanges:e.assetChanges});
 }
 function motion(e,m){add(e,'pawnMoving',{move:m,actor:m.player});add(e,'tileArrival',{move:m,actor:m.player});}
 for(let i=0;i<events.length;i++){
  const e=events[i],move=eventMove(e,s);
  // GO is credited by the engine during movement; reveal its committed income after arrival.
  if(e.finance?.some(t=>t.kind==='salary')&&events.slice(i+1).some(x=>x.type==='move'&&x.version===e.version)){deferred.push(e);continue;}
  if(e.type==='dice'){
   const values=e.dice||(s.log.find(x=>x.type==='dice'&&/melempar|lempar awal|Dadu baru/.test(x.text))?.id===e.id?(/Dadu baru/.test(e.text)?s.utilityDice:s.dice):null);
   if(values?.length===2){add(e,'diceRolling',{dice:[...values],diceKind:e.diceKind||'movement',actor:e.actor??s.turn});add(e,'diceResult',{dice:[...values],diceKind:e.diceKind||'movement',actor:e.actor??s.turn});}
  }
  if(e.type==='move'&&move){motion(e,move);for(const held of deferred.splice(0))finance(held);}
  if(e.type==='jail'&&move)motion(e,move);
  finance(e);
  if(['card','jail','release','bankrupt','auctionResult'].includes(e.type)){const event=reveal(e,s);if(e.type!=='card'||event.card)add(e,'eventRevealing',{event,actor:event.actor});}
 }
 for(const e of deferred)finance(e);
 return steps;
}
function apply(view,step){
 if(step.kind==='snapshot')return step.snapshot;
 let next=view;
 if(step.kind==='diceResult')next={...next,presentationDice:{id:step.id,values:[...step.dice],kind:step.diceKind||'movement'},...(step.diceKind==='utility'?{utilityDice:step.dice}:{dice:step.dice})};
 if(step.kind==='pawnMoving'&&step.move){const m=step.move;next={...next,lastMove:m,players:next.players.map(p=>p.id===m.player?{...p,pos:m.path.at(-1)??p.pos}:p)};}
 if(step.kind==='financialSettlement'&&step.finance){const deltas=transactionDeltas(step.finance);next={...next,players:next.players.map(p=>({...p,cash:p.cash+deltas.filter(d=>d.player===p.id).reduce((n,d)=>n+d.amount,0)}))};}
 if(step.assetChanges?.length){const assets={...next.assets};for(const {tile,...asset} of step.assetChanges)assets[tile]=asset;next={...next,assets};}
 if(step.event&&['jail','release','bankrupt'].includes(step.event.type)){const e=step.event;next={...next,players:next.players.map(p=>p.id!==e.actor?p:{...p,...(e.type==='bankrupt'?{out:true}:{inJail:e.type==='jail'})})};}
 return next;
}
function flush(model){let next=model;while(next.queue[0]&&['snapshot','asset'].includes(next.queue[0].kind)){next={...next,view:apply(next.view,next.queue[0]),queue:next.queue.slice(1)}}return next;}
/** @returns {import('./presentation-types.ts').TimelineModel|null} */
export function ingestTimeline(model,s,{enabled=true,epoch=0,reset=false}={}){
 if(!s)return null;
 const latest=cursor(s),baseline=()=>({cursor:latest,epoch,enabled,view:s,queue:[]});
 if(!model||!enabled||!model.enabled||reset||model.epoch!==epoch||model.cursor.match!==s.matchId)return baseline();
 if(latest.version<model.cursor.version||latest.eventId<model.cursor.eventId)return model;
 if(latest.version===model.cursor.version&&latest.eventId===model.cursor.eventId)return model;
 const fresh=s.log.filter(e=>e.id>model.cursor.eventId&&e.audience!=='private').sort((a,b)=>a.id-b.id);
 if(fresh.length&&fresh[0].id>model.cursor.eventId+1)return {...baseline(),recovered:true};
 const steps=buildSteps(fresh,s),queue=[...model.queue,...steps,{id:`${s.matchId}:${s.version}:snapshot`,kind:'snapshot',snapshot:s}];
 if(queue.length>MAX_VISUAL_STEPS)return {...baseline(),recovered:true};
 const rejected=fresh.findLast(e=>e.type==='trade'&&/ditolak|dibatalkan/.test(e.text));
 return flush({...model,cursor:latest,epoch,enabled,queue,...(rejected?{notice:{id:`${s.matchId}:${rejected.id}`,text:rejected.text}}:{})});
}
/** @returns {import('./presentation-types.ts').TimelineModel|null} */
export function advanceTimeline(model,id){const head=model?.queue[0];if(!head||!id||head.id!==id)return model;return flush({...model,view:apply(model.view,head),queue:model.queue.slice(1)});}
/** @returns {import('./presentation-types.ts').PresentedGame|null} */
export const presentedState=model=>model?apply(model.view,model.queue[0]||{kind:'idle'}):null;
/**
 * @param {import('./presentation-types.ts').PresentationEvent|null|undefined} event
 * @param {import('./presentation-types.ts').PresentedGame|null} s
 * @param {number|null} [seat]
 * @returns {boolean}
 */
export function liveCardDecision(event,s,seat=null){
 const c=event?.card;if(!c||s?.phase!=='card'||s.card?.player!==c.player||s.card.deck!==c.deck||s.card.idx!==c.idx)return false;
 return s.log.find(e=>e.type==='card')?.id===event.logId&&s.players[c.player]?.controller==='human'&&(seat===null||seat===c.player);
}
export function stepDuration(step,{fast=false,reduced=false}={}){
 if(!step)return 0;
 const timing=diceTiming({fast,reduced});
 return step.kind==='diceRolling'?timing.roll:step.kind==='diceResult'?timing.settle:step.kind==='financialSettlement'?(reduced?150:fast?650:1000):step.kind==='tileArrival'?(reduced?0:100):step.kind==='eventRevealing'?(reduced?1000:fast?1600:2400):step.kind==='pawnMoving'?(reduced?0:step.move?.jump?220:Math.min(fast?1100:1800,(step.move?.path.length||1)*(fast?90:140))):0;
}
