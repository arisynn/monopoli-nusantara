/** Visual identity only. IDs stay numeric and travel with the existing player.pawn field. */
export const TOKENS=Object.freeze([
 {id:0,name:'Pinisi',file:'pinisi'}, {id:1,name:'Komodo',file:'komodo'},
 {id:2,name:'Becak',file:'becak'}, {id:3,name:'Cenderawasih',file:'cenderawasih'},
 {id:4,name:'Angklung',file:'angklung'}, {id:5,name:'Rumah Gadang',file:'rumah-gadang'}
].map(token=>Object.freeze({...token,src:`/assets/tokens/${token.file}.svg`})));
export const validPawn=id=>Number.isInteger(id)&&id>=0&&id<TOKENS.length;
export const pawnFor=player=>validPawn(player?.pawn)?player.pawn:(Number.isInteger(player?.id)?player.id:0)%TOKENS.length;
/** Reserve requested IDs first so fallback assignments never steal a later valid choice. */
export function assignPawns(players){
 const used=new Set(),assigned=players.map(p=>{if(validPawn(p.pawn)&&!used.has(p.pawn)){used.add(p.pawn);return p.pawn}return null});
 return assigned.map(id=>{if(id!==null)return id;const free=TOKENS.find(p=>!used.has(p.id)).id;used.add(free);return free});
}
export function availablePawn(players,requested){
 const used=new Set(assignPawns(players));return validPawn(requested)&&!used.has(requested)?requested:TOKENS.find(p=>!used.has(p.id))?.id;
}
/** Local selection swaps identities, retaining unique choices even for hidden seats. */
export function selectPawn(choices,seat,pawn){
 if(!validPawn(pawn)||!Number.isInteger(seat)||seat<0||seat>=choices.length)return choices;
 const next=[...choices],other=next.indexOf(pawn);if(other>=0)next[other]=next[seat];next[seat]=pawn;return next;
}
/** Lobby-only update; caller authenticates the seat and checks the room has not started. */
export function setSeatPawn(seats,seat,pawn){
 if(!Number.isInteger(seat)||!seats[seat]||!validPawn(pawn))throw Error('Pilihan pion tidak valid.');
 const ids=assignPawns(seats);
 if(ids.some((id,i)=>i!==seat&&id===pawn))throw Error('Pion sudah dipilih pemain lain.');
 return seats.map((p,i)=>({...p,pawn:i===seat?pawn:ids[i]}));
}
