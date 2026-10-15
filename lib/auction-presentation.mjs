/** Stable across bidder changes and compatible with auctions saved before IDs. */
export function auctionIdentity(s){const a=s?.auction;return !a?null:a.id||JSON.stringify([s.matchId,'legacy-auction',a.kind||'property',a.tile??null,a.targets??null])}
export function auctionResultData(s,a){
 return {auctionId:auctionIdentity({...s,auction:a}),kind:a.kind||'property',building:a.building||null,tile:a.kind==='building'?(a.highest===null?null:a.targets[a.highest]):a.tile,winner:a.highest,amount:a.highest===null?0:a.amount,participants:[...a.participants]};
}
export function projectAuction(previous,s,enabled=true,epoch=0){
 const cursor={match:s?.matchId,version:s?.version??0,eventId:s?.eventId??0};
 if(!previous||!enabled||!previous.enabled||previous.epoch!==epoch||previous.cursor.match!==cursor.match)return {enabled,epoch,cursor,results:[]};
 if(cursor.version<previous.cursor.version||cursor.eventId<previous.cursor.eventId)return previous;
 if(cursor.version===previous.cursor.version&&cursor.eventId===previous.cursor.eventId)return previous;
 const fresh=(s.log||[]).filter(e=>e.id>previous.cursor.eventId&&e.type==='auctionResult'&&e.auctionResult).sort((a,b)=>a.id-b.id).map(e=>({...e.auctionResult,id:`${s.matchId}:${e.id}`}));
 return {enabled,epoch,cursor,results:[...previous.results,...fresh].slice(-12)};
}
export function dismissAuctionResult(model,id){return {...model,results:model.results.filter(r=>r.id!==id)}}
