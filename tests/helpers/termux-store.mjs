import {BotJobStore} from './bot-job-store.mjs';
import {botActor} from '../../lib/server/bot-worker.mjs';
import {gameplayHeld} from '../../lib/server/online-room.mjs';
export class TermuxStore extends BotJobStore{
 workers=new Map();workerReceipts=new Map();provider='termux';
 async workerRpc(name,p){
  const w=this.workers.get(p.p_worker);
  switch(name){
   case 'mn_worker_auth':return [...this.workers.values()].find(w=>w.hash===p.p_hash&&!w.revoked)||null;
   case 'mn_worker_heartbeat':if(!w||w.revoked||p.p_slots>w.max_slots)throw Error('invalid worker');w.slots=p.p_slots;w.heartbeat=this.clock();return {...await this.workerRpc('mn_worker_status',p),ok:true};
   case 'mn_worker_status':return {provider:this.provider,label:'QA',slots:w.slots,maxSlots:w.max_slots,rooms:[...this.rooms.values()].map(r=>({code:r.code,phase:r.data.state.phase,sourceVersion:r.data.state.version,actor:botActor(r.data.state)}))};
   case 'mn_termux_claim':{
    if(this.provider!=='termux'||!w||w.revoked||w.heartbeat<this.clock()-60000)return null;
    if([...this.jobs.values()].filter(j=>j.worker===w.id&&j.owner&&j.until>this.clock()).length>=w.slots)return null;
    for(const j of this.jobs.values()){
     const r=this.rooms.get(j.code)?.data;
     if(w.codes&&!w.codes.includes(j.code)||!r||r.status!=='playing'||gameplayHeld(r,this.clock())||botActor(r.state)===null||j.status!=='scheduled'||j.due>this.clock()||j.owner&&j.until>this.clock())continue;
     j.owner=p.p_owner;j.until=this.clock()+30000;j.worker=w.id;
     return {code:j.code,actor:botActor(r.state),source_version:r.state.version,match_id:r.state.matchId,lease_until:new Date(j.until).toISOString(),room:structuredClone(r)};
    }return null;
   }
   case 'mn_termux_lease':{const j=this.jobs.get(p.p_code);return !!w&&!w.revoked&&j?.worker===w.id&&j.owner===p.p_owner&&j.until>this.clock()&&j.version===p.p_version;}
   case 'mn_termux_release':{const j=this.jobs.get(p.p_code);if(j?.worker!==p.p_worker||j.owner!==p.p_owner)return false;j.owner=null;j.until=0;return true;}
   case 'mn_worker_receipt':return this.workerReceipts.get(`${p.p_worker}:${p.p_command}`)||null;
   default:throw Error(`Unhandled RPC ${name}`);
  }
 }
 async commit(row,room,meta={}){
  const work=meta.botWork,key=work?.workerId&&`${work.workerId}:${work.commandId}`;
  if(key){if(this.workers.get(work.workerId)?.revoked)return {ok:false};const old=this.workerReceipts.get(key);if(old)return {ok:true,duplicate:true,revision:old.revision};}
  const result=await super.commit(row,room,meta);
  if(key&&result.ok)this.workerReceipts.set(key,{request_hash:work.requestHash,revision:result.revision});return result;
 }
}
export class FastTermuxStore extends TermuxStore{
 async workerAccess(hash){const worker=[...this.workers.values()].find(w=>w.hash===hash&&!w.revoked);return worker?{worker,requests:await this.quota(`worker:${worker.id}`,60)}:null;}
 async workerSnapshot(worker,job){const w=this.workers.get(worker.id),j=this.jobs.get(job.code);if(!w||w.revoked||w.codes&&!w.codes.includes(job.code)||j?.worker!==w.id||j.owner!==job.lease||j.until<=this.clock()||j.version!==job.sourceVersion)return null;return this.get(job.code);}
 async workerClaim(p){const result=await super.workerRpc('mn_termux_claim',p);return result?{...result,queue_wait_ms:Math.max(0,this.clock()-this.jobs.get(result.code).due)}:null;}
}
