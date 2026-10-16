import {BOARD,money} from './content.mjs';
import {decisionActor,assets} from './game.mjs';

// UI metadata only. Decisions and every transaction remain owned by command().
export function gameplayDecision(s){
 if(!s)return null;
 const actor=decisionActor(s),phase=s.phase;
 if(!['buy','card','trade','debt','auction','jail','mortgage','buildOffer','won'].includes(phase))return null;
 const last=type=>(s.log||[]).find(e=>e.type===type)?.id??0;
 let detail;
 if(phase==='buy')detail=[s.buy,s.lastMove?.id];
 if(phase==='card')detail=[s.card?.deck,s.card?.idx,last('card')];
 if(phase==='trade'){const t=s.trade;detail=[t.from,t.to,t.give,t.take,t.giveCash,t.takeCash,t.giveCards,t.takeCards,last('trade')]}
 if(phase==='debt')detail=[s.debt?.from,s.debt?.to,s.debt?.amount,s.debt?.label,last('debt')];
 if(phase==='auction')detail=[s.auction?.kind,s.auction?.tile,s.auction?.targets,(s.log||[]).find(e=>e.type==='auction'&&e.text.startsWith('Lelang '))?.id];
 if(phase==='jail')detail=[s.turnSerial??s.round,actor];
 if(phase==='mortgage')detail=[s.mortgageDecision?.player,s.mortgageDecision?.tile,last('trade'),last('bankrupt')];
 if(phase==='buildOffer')detail=[s.buildOffer?.kind,s.buildOffer?.targets,actor];
 if(phase==='won')detail=[s.winner];
 return {key:JSON.stringify([s.matchId,phase,phase==='auction'&&s.schemaVersion!==1?null:actor,detail]),phase,actor,kind:phase==='card'||phase==='won'?'event':'decision'};
}

export function canPresentDecision(s,seat=null){
 const d=gameplayDecision(s);if(!d)return false;
 if(d.phase==='won')return true;
 if(d.phase==='auction')return s.auction.participants.some(id=>s.players[id]?.controller==='human'&&!s.players[id].out&&(seat===null||seat===id));
 return s.players[d.actor]?.controller==='human'&&(seat===null||seat===d.actor);
}
export const presentationCursor=s=>s?{match:s.matchId,version:s.version,eventId:s.eventId??Math.max(0,...(s.log||[]).map(e=>e.id))}:null;

// A monotonic log watermark makes rerenders and repeated room snapshots harmless.
// Baseline on restore/reconnect: show the live decision, never historical effects.
export function collectPresentation(cursor,s,{baseline=false}={}){
 const next=presentationCursor(s);
 if(!s||baseline||!cursor||cursor.match!==next.match)return {cursor:next,events:[],notices:[]};
 if(next.version<cursor.version||next.eventId<cursor.eventId)return {cursor,events:[],notices:[]};
 if(next.eventId===cursor.eventId)return {cursor:next,events:[],notices:[]};
 const fresh=(s.log||[]).filter(e=>e.id>cursor.eventId).sort((a,b)=>a.id-b.id);
 const events=fresh.filter(e=>['jail','release','bankrupt'].includes(e.type)).map(e=>({id:`${s.matchId}:${e.id}`,title:e.type==='jail'?'Masuk penjara':e.type==='release'?'Bebas dari penjara':'Kebangkrutan',text:e.text,type:e.type}));
 const notices=fresh.filter(e=>['money','buy','build','turn','rent'].includes(e.type)||e.type==='trade'&&/selesai|dibatalkan|ditolak/i.test(e.text));
 return {cursor:next,events,notices};
}

export function cardImpact(s){
 const c=s.card;if(!c)return '';
 if(c.jailCard)return 'Kartu disimpan untuk keluar dari penjara nanti.';
 if(c.jail)return 'Langsung ke penjara tanpa menerima gaji Mulai.';
 if(c.move!==undefined)return `Bergerak ke ${BOARD[c.move].name}; petak tujuan diselesaikan sesuai aturan.`;
 if(c.back)return `Mundur ${c.back} petak, lalu selesaikan petak tujuan.`;
 if(c.nearest)return `Bergerak ke ${c.nearest==='station'?'stasiun':'utilitas'} terdekat, lalu selesaikan petak tujuan.`;
 if(c.money)return `${c.money>0?'Terima':'Bayar'} ${money(Math.abs(c.money))}.`;
 if(c.each)return `${c.each>0?'Terima dari':'Bayar kepada'} setiap pemain lain ${money(Math.abs(c.each))}.`;
 if(c.repair){const amount=assets(s,c.player).reduce((n,t)=>n+(s.assets[t.id].level===5?c.repair[1]:s.assets[t.id].level*c.repair[0]),0);return `Biaya perbaikan asetmu: ${money(amount)}.`}
 return 'Ikuti petunjuk kartu untuk melanjutkan.';
}

export function bankruptcyShortfall(s,id){
 if(s?.phase!=='debt'||s.debt?.from!==id)return 0;
 const liquidation=s.players[id].cash+assets(s,id).reduce((n,t)=>n+(s.assets[t.id].mortgaged?0:t.mortgage)+(t.build||0)*s.assets[t.id].level/2,0);
 return Math.max(0,s.debt.amount-liquidation);
}

/** Navigation may temporarily cover a decision; no presentation can replace it.
 * @param {{menu?:string|null,ready?:boolean,eligible?:boolean,decision?:{key:string,phase:string}|null,dismissed?:string,event?:unknown,handoff?:boolean}} [options]
 */
export function selectGameplayPopup({menu=null,ready=false,eligible=false,decision=null,dismissed='',event=null,handoff=false}={}){
 if(handoff)return null;
 if(menu)return menu;
 if(!ready)return null;
 if(eligible&&decision&&decision.key!==dismissed)return 'turn';
 if(event&&decision?.phase!=='won')return 'event';
 return null;
}
