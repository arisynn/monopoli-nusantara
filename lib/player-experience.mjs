/** Presentation-only navigation. Never grants authority to execute an engine command. */
export const FEATURE_LABELS=Object.freeze({aset:'Aset & bangunan',barter:'Barter',riwayat:'Riwayat aktivitas',menu:'Meja permainan',room:'Room & koneksi'});
export function playerSeat(s,roomSeat=null,localSeat=-1){
 if(roomSeat!==null)return roomSeat;
 if(s.players[localSeat]?.controller==='human'&&!s.players[localSeat].out)return localSeat;
 const acting=s.players[s.turn];
 return acting?.controller==='human'&&!acting.out?acting.id:s.players.find(p=>p.controller==='human'&&!p.out)?.id??s.players.find(p=>p.controller==='human')?.id??0;
}
/** A settled historical pair can be shown statically after reconnect, never rolled again. */
export function lastPublicDice(s){
 const event=s?.log?.find(e=>(!e.audience||e.audience==='public')&&Array.isArray(e.dice)&&e.dice.length===2&&e.dice.every(d=>Number.isInteger(d)&&d>=1&&d<=6));
 return event?{id:`${s.matchId}:${event.id}`,dice:event.dice,kind:event.diceKind||'movement'}:null;
}
