import {command} from '../game.mjs';
import {observation} from '../bot/mind.mjs';
import {botActor} from './bot-worker.mjs';
import {blockedFinance,cleanFinancePath} from '../bot/finance-history.mjs';
import {blockedStabilityAction} from '../bot/stability-guard.mjs';
import {brokerIntentMetadata} from '../bot/broker-intent.mjs';
import {reconcile,gameplayHeld,check,RoomError,validateOnlineAction} from './online-room.mjs';
import {digest} from './online-service.mjs';
import {secureRandom} from '../random.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../bot/model-manifest.mjs';

const id=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{8,80}$/.test(value);
export function workerProtocol(body){
 check(body.protocol===WORKER_PROTOCOL&&body.manifest===MODEL_MANIFEST_ID,'Versi worker/model berbeda. Perbarui paket Termux.',409);
}
function safeWorkerAction(state,actor,proposed,commandId){
 check(proposed&&typeof proposed==='object'&&!Array.isArray(proposed),'Aksi diperlukan.');
 const {actionId,financePlan,...intent}=proposed;
 check(actionId===undefined||typeof actionId==='string'&&actionId.length<=160,'ID kandidat tidak valid.');
 const action=validateOnlineAction({...intent,id:commandId,expectedVersion:state.version});
 check(!blockedFinance(state,actor,action),'Pembalikan pendanaan tanpa kemajuan ditolak.',409);
 check(!blockedStabilityAction(state,actor,action),'Aksi melanggar guard stabilitas bot.',409);
 const path=financePlan===undefined?null:cleanFinancePath(financePlan);
 check(financePlan===undefined||action.type==='MORTGAGE'&&path,'Rencana pendanaan tidak valid.');
 return {...action,...brokerIntentMetadata(state,actor,{...intent,actionId}),...(path?{financePlan:path}:{})};
}
export function createTermuxService({store,clock=Date.now,rng=secureRandom,advisor}){
 const rpc=(name,args)=>store.workerRpc(name,args);
 async function authorized(token){
  check(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'Credential worker tidak valid.',401);
  const worker=await rpc('mn_worker_auth',{p_hash:await digest(token)});
  check(worker?.id,'Worker tidak terdaftar atau sudah dicabut.',401);return worker;
 }
 async function fresh(job,worker){
  const valid=await rpc('mn_termux_lease',{p_worker:worker.id,p_code:job.code,p_owner:job.lease,p_version:job.sourceVersion});
  check(valid,'Lease berakhir atau pekerjaan diambil worker lain.',409);
  const row=await store.get(job.code);check(row,'Room tidak ditemukan.',404);
  const room=row.data;reconcile(room,clock());
  check(room.status==='playing'&&!gameplayHeld(room,clock()),'Pertandingan menunggu pemain atau dijeda.',409);
  check(room.state.matchId===job.matchId&&room.state.version===job.sourceVersion&&botActor(room.state)===job.actor,'Keputusan sudah kedaluwarsa.',409);
  return row;
 }
 return {
  async pair(body,userId){
   workerProtocol(body);check(typeof body.pairingCode==='string'&&/^[a-f0-9]{64}$/.test(body.pairingCode),'Kode pairing tidak valid.');
   check(typeof body.label==='string'&&body.label.length>0&&body.label.length<=64,'Nama perangkat diperlukan.');
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   const worker=await rpc('mn_worker_pair',{p_pair_hash:await digest(body.pairingCode),p_user:userId,p_hash:await digest(token),p_manifest:MODEL_MANIFEST_ID,p_label:body.label});
   check(worker?.id,'Kode pairing berakhir atau sudah digunakan.',403);
   return {workerId:worker.id,token,protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID};
  },
  async execute(body,token){
   workerProtocol(body);const worker=await authorized(token);
   check(['heartbeat','claim','submit','release','status','advisor'].includes(body.op),'Operasi worker tidak dikenal.');
   check(await store.quota(`worker:${worker.id}`,60)<=600,'Batas request worker tercapai.',429);
   if(body.op==='heartbeat'){
    check(Number.isInteger(body.slots)&&body.slots>=1&&body.slots<=worker.max_slots,'Jumlah slot tidak diizinkan.');
    return rpc('mn_worker_heartbeat',{p_worker:worker.id,p_slots:body.slots,p_manifest:MODEL_MANIFEST_ID});
   }
   if(body.op==='status')return rpc('mn_worker_status',{p_worker:worker.id});
   if(body.op==='claim'){
    const owner=crypto.randomUUID();const claimed=await rpc('mn_termux_claim',{p_worker:worker.id,p_owner:owner,p_manifest:MODEL_MANIFEST_ID});
    if(!claimed)return {job:null};
    const job={code:claimed.code,actor:claimed.actor,sourceVersion:claimed.source_version,matchId:claimed.match_id,lease:owner,leaseUntil:claimed.lease_until};
    try{
     const room=claimed.room;check(room,'Snapshot job tidak tersedia.',503);reconcile(room,clock());
     check(room.status==='playing'&&!gameplayHeld(room,clock())&&room.state.version===job.sourceVersion&&botActor(room.state)===job.actor,'Snapshot job berubah.',409);
     return {job:{...job,advisorEnabled:!!room.state.advisorEnabled,state:observation(room.state,job.actor)}};
    }
    catch(error){await rpc('mn_termux_release',{p_worker:worker.id,p_code:job.code,p_owner:owner});if(error.status===409)return {job:null};throw error;}
   }
   const job=body.job;
   check(job&&/^[A-HJ-NP-Z2-9]{8}$/.test(job.code)&&typeof job.lease==='string'&&/^[a-f0-9-]{36}$/i.test(job.lease)&&Number.isSafeInteger(job.sourceVersion)&&Number.isInteger(job.actor)&&typeof job.matchId==='string'&&job.matchId.length<=128,'Job tidak valid.');
   if(body.op==='release')return {released:await rpc('mn_termux_release',{p_worker:worker.id,p_code:job.code,p_owner:job.lease})};
   check(id(body.commandId),'ID command diperlukan.');
   const requestHash=await digest(JSON.stringify([job.code,job.matchId,job.sourceVersion,job.actor,body.action]));
   if(body.op==='submit'){
    const receipt=await rpc('mn_worker_receipt',{p_worker:worker.id,p_command:body.commandId});
    if(receipt){
     check(receipt.request_hash===requestHash,'ID command dipakai dengan isi berbeda.',409);
     const current=await store.get(job.code);
     const events=current?.data.state?.matchId===job.matchId?current.data.state.log.filter(e=>e.version===job.sourceVersion&&(!e.audience||e.audience==='public')):[];
     return {ok:true,duplicate:true,revision:receipt.revision,events,eventsUnavailable:!events.length};
    }
   }
   for(let attempt=0;attempt<4;attempt++){
    const row=await fresh(job,worker),state=row.data.state;
    if(body.op==='advisor'){
     check(state.advisorEnabled&&advisor,'Advisor tidak aktif.',409);
     return advisor(state,job.actor,body.plan,worker.id);
    }
    const action=safeWorkerAction(state,job.actor,body.action,`bot:${job.matchId}:${job.sourceVersion}`);
    const next=command(state,job.actor,action,rng);
    next.aiStatus='local';next.aiComment=null;
    next.aiDiagnostics={execution:'termux',actor:job.actor,sourceVersion:job.sourceVersion,model:state.players[job.actor].botPersona,manifest:MODEL_MANIFEST_ID};
    row.data.state=next;if(next.phase==='won')row.data.status='finished';
    if(row.data.vote?.status==='open'&&row.data.vote.eligible.some(i=>next.players[i].out))row.data.vote.status='cancelled';
    const result=await store.commit(row,row.data,{type:'BOT_ACTION',botLease:job.lease,botWork:{actor:job.actor,sourceVersion:job.sourceVersion,matchId:job.matchId,actionType:action.type,workerId:worker.id,commandId:body.commandId,requestHash},notify:true});
    if(result.ok)return {ok:true,duplicate:!!result.duplicate,revision:result.revision,version:next.version,phase:next.phase,events:next.log.filter(e=>e.id>state.eventId&&(!e.audience||e.audience==='public'))};
   }
   throw new RoomError('Room sedang sibuk; ulangi ID command yang sama.',409);
  }
 };
}
