import {MemoryOnlineStore} from './online-store.mjs';
export class BotJobStore extends MemoryOnlineStore {
 jobs=new Map();botActions=new Map();wakeups=0;
 constructor(clock){super();this.clock=clock;}
 async claimBot(owner){await Promise.resolve();for(const j of this.jobs.values())if(j.status==='scheduled'&&j.due<=this.clock()&&(!j.owner||j.until<=this.clock())){j.owner=owner;j.until=this.clock()+30000;j.attempts++;return {code:j.code,state_version:j.version};}return null;}
 async releaseBot(code,owner,status='waiting',error=null){const j=this.jobs.get(code);if(j?.owner!==owner)return false;j.owner=null;j.until=0;j.status=error&&j.attempts>=5?'failed':status;j.due=this.clock()+(error?5000:0);return true;}
 async wakeBots(){this.wakeups++;return null;}
 async commit(row,room,meta={}){
  await Promise.resolve();
  const current=this.rooms.get(room.code),key=`${meta.userId}:${meta.requestId}`,receipt=meta.requestId&&this.receipts.get(key);
  if(receipt)return {duplicate:true,code:receipt.code,hash:receipt.request_hash};
  if(row.revision===-1?current:!current||current.revision!==row.revision)return {ok:false};
  if(meta.type==='BOT_ACTION'){
   const j=this.jobs.get(room.code),w=meta.botWork;
   if(!j||j.owner!==meta.botLease||j.until<=this.clock()||current.data.status!=='playing'||j.version!==current.data.state.version||!w||w.sourceVersion!==j.version||room.state.version!==j.version+1)return {ok:false,stale:true};
   const actionKey=`${room.code}:${w.matchId}:${w.sourceVersion}`;if(this.botActions.has(actionKey))return {ok:false};this.botActions.set(actionKey,{...w});
  }
  const revision=row.revision+1;this.rooms.set(room.code,structuredClone({code:room.code,revision,data:room}));
  if(meta.requestId)this.receipts.set(key,{code:room.code,request_hash:meta.hash,revision});
  if(meta.notify!==false)this.notifications.push({code:room.code,revision});
  const hasBot=room.state?.players.some(p=>p.controller==='bot'&&!p.out);
  if(room.status==='playing'&&hasBot){if(!current||current.data.state?.version!==room.state.version||current.data.status!==room.status||(this.jobs.get(room.code)?.status==='blocked'&&room.seats.every((seat,i)=>seat.controller==='bot'||room.state.players[i].out||Math.max(0,...Object.values(seat.connections))>this.clock()-35000))){this.jobs.set(room.code,{code:room.code,version:room.state.version,status:'scheduled',due:this.clock(),owner:null,until:0,attempts:0});}}
  else if(this.jobs.has(room.code)){const j=this.jobs.get(room.code);j.status='waiting';j.owner=null;j.until=0;}
  return {ok:true,revision};
 }
}
