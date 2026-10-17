import {BOARD} from '../lib/content.mjs';
import {legalCandidate} from '../lib/bot/candidates.mjs';
import {memoryFor} from '../lib/bot/memory.mjs';

/** Sparring policies only. These are never installed as gameplay personas. */
export function sparringAction(kind,s,id,plan){
 const candidates=plan.candidates,find=type=>candidates.find(c=>c.action.type===type)?.action;
 if(kind==='trade-refuser'&&s.phase==='trade')return find('TRADE_REJECT')||plan.action;
 if(kind==='housing-hoarder')return candidates.find(c=>!(c.action.type==='BUILD'&&s.assets[c.action.tile].level===4))?.action||plan.action;
 if(kind==='hyper-bidder'&&s.phase==='auction'){
  const tile=s.auction.kind==='building'?s.auction.targets[id]:s.auction.tile,t=BOARD[tile],amount=Math.max(100,s.auction.amount+10),cap=Math.min(s.players[id].cash,(t.price||t.build)*1.3);
  const bid={type:'BID',amount};if(amount<=cap&&legalCandidate(s,id,bid))return bid;return find('PASS')||plan.action;
 }
 if(kind==='trade-exploiter'&&s.phase==='end'&&s.turn===id&&s.turnSerial-memoryFor(s,id).lastOfferSerial>=s.players.length){
  const target=s.players.filter(p=>p.id!==id&&!p.out).sort((a,b)=>b.cash-a.cash)[0];
  const tile=BOARD.filter(t=>s.assets[t.id]?.owner===id&&s.assets[t.id].level===0).sort((a,b)=>a.price-b.price)[0];
  if(target&&tile){const offer={type:'OFFER',trade:{to:target.id,give:[tile.id],take:[],giveCash:0,takeCash:Math.min(target.cash,Math.ceil(tile.price*3)),giveCards:0,takeCards:0}};
   if(legalCandidate(s,id,offer))return offer;}
 }
 return plan.action;
}
export function leaguePolicies(index,n,learnerSeat=0){
 const slot=index*7%20,opponent=slot<6?'frozen-490':slot<11?'historical':slot<16?['hyper-bidder','trade-refuser','housing-hoarder'][slot%3]:'trade-exploiter';
 return Array.from({length:n},(_,i)=>i===learnerSeat?'learned':opponent);
}
