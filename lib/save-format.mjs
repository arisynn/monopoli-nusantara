import {BOARD,DECKS,RULEPACK} from './content.mjs';
import {RULEPACK as LEGACY_RULEPACK} from './content-v1.mjs';
const fail=()=>{throw Error('Cadangan tidak valid atau tidak kompatibel. Gunakan berkas ekspor Monopoli Nusantara.')};
const assert=value=>{if(!value)fail()};
const int=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=(value,max)=>Array.isArray(value)&&value.length<=max;
function inspect(value,depth=0){assert(depth<=35);if(Array.isArray(value)){assert(value.length<=1500);for(const item of value)inspect(item,depth+1)}else if(object(value)){for(const [key,item] of Object.entries(value)){assert(!['__proto__','constructor','prototype'].includes(key));inspect(item,depth+1)}}else assert(value===undefined||value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=4000||typeof value==='number'&&Number.isFinite(value))}
export function validateLocalState(state){
 inspect(state);assert(object(state)&&[1,2].includes(state.schemaVersion));
 assert(state.rulepackVersion===(state.schemaVersion===1?LEGACY_RULEPACK.id:RULEPACK.id));
 assert(typeof state.matchId==='string'&&state.matchId.length>0&&state.matchId.length<=100&&int(state.version));
 assert(list(state.players,6)&&state.players.length>=2&&(state.schemaVersion!==1||state.players.length<=4));
 const player=id=>int(id,0,state.players.length-1),tile=id=>int(id,0,39),asset=id=>tile(id)&&!!BOARD[id].price;
 state.players.forEach((p,id)=>assert(object(p)&&p.id===id&&typeof p.name==='string'&&p.name.length<=24&&['human','bot'].includes(p.controller)&&int(p.cash)&&tile(p.pos)&&int(p.jail,0,3)&&typeof p.inJail==='boolean'&&typeof p.out==='boolean'&&list(p.cards,2)&&p.cards.every(c=>object(c)&&Object.hasOwn(DECKS,c.deck)&&int(c.idx,0,15))));
 assert(player(state.turn)&&int(state.round,1)&&int(state.eventId)&&list(state.log,300)&&list(state.seen,1500)&&state.seen.every(id=>typeof id==='string')&&list(state.queue,100));
 for(const event of state.log)assert(object(event)&&int(event.id)&&typeof event.text==='string'&&typeof event.type==='string'&&int(event.turn));
 assert(list(state.dice,2)&&state.dice.length===2&&state.dice.every(d=>int(d,1,6))&&int(state.doubles,0,3)&&typeof state.extra==='boolean');
 assert(object(state.assets)&&Object.keys(state.assets).length===28);let houses=0,hotels=0;
 for(const t of BOARD.filter(t=>t.price)){const a=state.assets[t.id];assert(object(a)&&(a.owner===null||player(a.owner))&&int(a.level,0,t.type==='city'?5:0)&&typeof a.mortgaged==='boolean');assert(!a.level||(a.owner!==null&&!a.mortgaged));a.level===5?hotels++:houses+=a.level}
 assert(houses<=32&&hotels<=12&&state.bank?.houses===32-houses&&state.bank?.hotels===12-hotels);
 assert(object(state.decks));
 for(const name of ['chance','community']){const deck=state.decks[name];assert(list(deck,16)&&deck.every(i=>int(i,0,15)));const held=state.players.flatMap(p=>p.cards.filter(c=>c.deck===name).map(c=>c.idx));const drawn=state.card?.deck===name&&state.card.jailCard?[state.card.idx]:[];const indices=[...deck,...held,...drawn];assert(indices.length===16&&new Set(indices).size===16)}
 const phases=['roll','end','jail','buy','card','debt','auction','trade','won','starting','mortgage','buildOffer'];assert(phases.includes(state.phase));
 if(state.phase==='buy')assert(asset(state.buy));
 if(state.phase==='card')assert(object(state.card)&&Object.hasOwn(DECKS,state.card.deck)&&int(state.card.idx,0,15)&&player(state.card.player)&&typeof state.card.title==='string');
 if(state.phase==='debt')assert(object(state.debt)&&player(state.debt.from)&&(state.debt.to===null||player(state.debt.to))&&int(state.debt.amount,1));
 if(state.phase==='auction'){const a=state.auction;assert(object(a)&&list(a.participants,6)&&a.participants.length>0&&a.participants.every(player)&&player(a.bidder)&&int(a.amount)&&(a.highest===null||player(a.highest)));if(a.kind==='building')assert(object(a.targets)&&Object.values(a.targets).every(asset));else assert(asset(a.tile));if(state.schemaVersion===2)assert(list(a.passed,6)&&a.passed.every(player))}
 if(state.phase==='trade'){const t=state.trade;assert(object(t)&&player(t.from)&&player(t.to)&&t.from!==t.to&&list(t.give,28)&&t.give.every(asset)&&list(t.take,28)&&t.take.every(asset)&&int(t.giveCash)&&int(t.takeCash)&&int(t.giveCards,0,2)&&int(t.takeCards,0,2));assert(state.schemaVersion===1?typeof t.returnPhase==='string':object(t.context)&&Array.isArray(t.context.queue))}
 if(state.phase==='won')assert(player(state.winner));
 if(state.schemaVersion===2){assert(object(state.rules)&&['classic','digital'].includes(state.rules.preset)&&['manual','auto'].includes(state.rules.rent)&&list(state.rentClaims,100)&&state.rentClaims.every(c=>object(c)&&player(c.from)&&player(c.to)&&asset(c.tile)&&int(c.amount)&&typeof c.id==='string'&&int(c.turnSerial))&&player(state.startSeat)&&int(state.turnSerial));if(state.phase==='starting')assert(list(state.starting?.pending,6)&&state.starting.pending.length>0&&state.starting.pending.every(player)&&list(state.starting.history,1500)&&list(state.starting.scores,6));if(state.phase==='mortgage')assert(player(state.mortgageDecision?.player)&&asset(state.mortgageDecision?.tile));if(state.phase==='buildOffer')assert(list(state.buildOffer?.pending,6)&&state.buildOffer.pending.length>0&&state.buildOffer.pending.every(player)&&['house','hotel'].includes(state.buildOffer.kind))}
 else assert(!['starting','mortgage','buildOffer'].includes(state.phase));
 const flow=(value,depth=0)=>{assert(object(value)&&depth<20&&phases.includes(value.phase)&&list(value.queue,100));
  if(value.phase==='buy')assert(asset(value.buy));
  if(value.phase==='debt')assert(object(value.debt)&&player(value.debt.from)&&(value.debt.to===null||player(value.debt.to))&&int(value.debt.amount,1));
  if(value.phase==='card')assert(object(value.card)&&Object.hasOwn(DECKS,value.card.deck)&&int(value.card.idx,0,15)&&player(value.card.player));
  if(value.phase==='auction')assert(object(value.auction)&&list(value.auction.participants,6)&&value.auction.participants.every(player)&&player(value.auction.bidder));
  for(const q of value.queue){assert(object(q)&&['resume','pay','move','land','jail','releaseMove','auction','mortgage'].includes(q.kind));
   if(q.kind==='resume'){flow(q.context,depth+1);continue}
   if(q.kind==='pay'){assert(player(q.from)&&(q.to===null||player(q.to))&&int(q.amount)&&typeof q.label==='string');continue}
   if(q.kind==='auction'){assert(asset(q.tile));continue}
   assert(player(q.player));
   if(q.kind==='mortgage')assert(asset(q.tile));
   if(q.kind==='move')assert(tile(q.to)||int(q.back,1,40));
   if(q.kind==='releaseMove')assert(int(q.steps,2,12));
  }
  if(value.phase==='trade'&&state.schemaVersion===2)flow(value.trade.context,depth+1);
 };
 flow(state);
 if(state.lastMove)assert(player(state.lastMove.player)&&list(state.lastMove.path,40)&&state.lastMove.path.every(tile));
 return structuredClone(state);
}
export function serializeSave(value){if(value?.room)throw Error('Cadangan JSON hanya untuk permainan lokal. Room tetap disimpan di server.');return JSON.stringify({format:'monopoli-nusantara-save',formatVersion:1,exportedAt:new Date().toISOString(),state:validateLocalState(value?.state)},null,2)}
export function parseSave(text){if(typeof text!=='string'||text.length>1000000)throw Error('Ukuran cadangan maksimal 1 MB.');let data;try{data=JSON.parse(text)}catch{fail()}assert(object(data)&&data.format==='monopoli-nusantara-save'&&data.formatVersion===1&&!data.room);return {state:validateLocalState(data.state),room:null}}
