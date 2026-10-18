import {writeFile,rename,open,readFile,rm,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadConfig,DATA,initData} from './config.mjs';
import {WorkerClient,subscribeWork} from './client.mjs';
import {ComputePool} from './pool.mjs';
import {createLog} from './log.mjs';
import {MODEL_MANIFEST_ID,MODEL_RELEASE,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';

export async function startDaemon(config,{client=new WorkerClient(config),pool=new ComputePool(config.slots),dataDir=DATA,realtime=true}={}){
 const log=createLog(resolve(dataDir,'logs'));
 const state={pid:process.pid,startedAt:new Date().toISOString(),manifest:MODEL_MANIFEST_ID,model:MODEL_RELEASE,protocol:WORKER_PROTOCOL,connection:'starting',realtime:false,
  slots:config.slots,active:[],events:[],committed:0,retries:0,stale:0,rooms:[],heartbeatAt:null};
 let closed=false,pumping=false,kickAgain=false,poll,heart,snapshot,failures=0,emptyClaims=0,stopRealtime=()=>{};
 const inflight=new Set();
 async function event(kind,text,extra={}){state.events=[...state.events,{at:new Date().toISOString(),kind,text}].slice(-5);await log({kind,text,...extra});}
 async function persist(){state.memoryMb=Math.round(process.memoryUsage().rss/1048576);state.network=client.metrics;state.updatedAt=new Date().toISOString();await writeFile(resolve(dataDir,'status.tmp'),JSON.stringify(state,null,2),{mode:0o600});await rename(resolve(dataDir,'status.tmp'),resolve(dataDir,'status.json'));}
 async function work(job){
  const commandId=crypto.randomUUID();state.active.push({code:job.code,actor:job.actor,phase:job.state.phase,version:job.sourceVersion});
  let committed=false;
  try{
   let plan=await pool.compute({state:job.state,actor:job.actor,budget:config.budget});
   if(closed)return;
   let action=plan.action;if(!action)throw Error('Model tidak menghasilkan aksi.');
   await log({kind:'decision',code:job.code,actor:job.actor,sourceVersion:job.sourceVersion,action,diagnostics:plan.diagnostics,candidates:plan.candidates,summary:plan.summary});
   const jobRef={code:job.code,actor:job.actor,sourceVersion:job.sourceVersion,matchId:job.matchId,lease:job.lease};
   if(config.advisor&&job.advisorEnabled&&plan.shouldConsult){
    try{const advice=await client.request('advisor',{job:jobRef,commandId,plan:{action:plan.action,candidates:plan.candidates}},2500);action=advice.action||action;}
    catch{await event('advisor','Advisor tidak tersedia; memakai keputusan lokal.',{code:job.code});}
   }
   // Freeze intent and command ID for every uncertain submit retry.
   const payload={job:jobRef,commandId,action};
   for(let attempt=0;attempt<4&&!closed;attempt++){
    try{
     const result=await client.request('submit',payload);committed=true;state.connection='online';
     if(!result.duplicate)state.committed++;
     for(const e of result.events||[])await event('game',e.text,{code:job.code,eventId:e.id,event:e});
     if(result.eventsUnavailable)await event('history','Receipt terkonfirmasi; event lama sudah di luar riwayat server.',{code:job.code,commandId});
     await log({kind:'receipt',code:job.code,commandId,duplicate:!!result.duplicate,revision:result.revision});break;
    }catch(error){
     if(error.status===409){state.stale++;await event('stale','State/lease berubah; ambil pekerjaan terbaru.',{code:job.code});break;}
     if([400,401,403,413].includes(error.status))throw error;
     state.retries++;await new Promise(r=>setTimeout(r,Math.min(2000,250*2**attempt)));
    }
   }
  }catch(error){await event('error',error.message,{code:job.code});}
  finally{
   if(!committed)await client.request('release',{job:{code:job.code,lease:job.lease,actor:job.actor,sourceVersion:job.sourceVersion,matchId:job.matchId}}).catch(()=>{});
   state.active=state.active.filter(j=>j.code!==job.code);kick();
  }
 }
 async function pump(){
  if(closed)return;
  if(pumping){kickAgain=true;return;}pumping=true;clearTimeout(poll);
  try{
   do{kickAgain=false;
    while(!closed&&inflight.size<config.slots){
     const result=await client.request('claim');state.connection='online';failures=0;
     if(!result.job){emptyClaims++;break;}emptyClaims=0;
     const task=work(result.job);inflight.add(task);void task.finally(()=>{inflight.delete(task);kick();});
    }
   }while(kickAgain&&!closed&&inflight.size<config.slots);
  }catch(error){state.connection=error.status===401?'revoked':error.status===409?'version-mismatch':'reconnecting';failures++;await event('connection',error.message);}
  finally{pumping=false;const delay=state.realtime?(state.rooms.length?15000:60000):Math.min(30000,2000*2**Math.min(Math.max(failures,emptyClaims),4));if(!closed)poll=setTimeout(kick,delay*(.9+Math.random()*.2));}
 }
 function kick(){if(!closed)void pump();}
 async function heartbeat(){
  try{const info=await client.request('heartbeat',{slots:config.slots});state.rooms=info.rooms||[];state.provider=info.provider;state.heartbeatAt=new Date().toISOString();state.connection='online';if(state.rooms.some(r=>r.actor!==null))kick();}
  catch(error){state.connection='reconnecting';await event('connection',error.message);}
  finally{if(!closed)heart=setTimeout(heartbeat,30000);}
 }
 await initData();await event('start',`${MODEL_RELEASE}: ${config.slots} slot komputasi.`);
 await heartbeat();
 kick();
 if(realtime)stopRealtime=subscribeWork(client,kick,connected=>{state.realtime=connected;if(connected)kick();});
 let writing=false;
 snapshot=setInterval(()=>{if(writing)return;writing=true;void persist().catch(()=>{}).finally(()=>{writing=false;});},1000);
 await persist();
 return {state,kick,async close(){closed=true;clearTimeout(poll);clearTimeout(heart);clearInterval(snapshot);stopRealtime();await pool.close();await Promise.allSettled([...inflight]);state.connection='stopped';await event('stop','Worker berhenti; pekerjaan belum selesai dapat diambil ulang.');while(writing)await new Promise(r=>setTimeout(r,10));await persist();}};
}

export async function runDaemon(){
 await initData();const lock=resolve(DATA,'daemon.lock');let file;
 for(const name of ['pm2-out.log','pm2-error.log']){
  const p=resolve(import.meta.dirname,'../.nusa-online',name);
  if((await stat(p).catch(()=>({size:0}))).size>1024*1024){await rm(p+'.1',{force:true});await rename(p,p+'.1');}
 }
 try{file=await open(lock,'wx',0o600);}catch(error){
  if(error.code!=='EEXIST')throw error;
  const old=Number(await readFile(lock,'utf8'));try{process.kill(old,0);throw Error('Worker sudah berjalan.');}catch(e){if(e.code!=='ESRCH')throw e;}
  await rm(lock);file=await open(lock,'wx',0o600);
 }
 await file.writeFile(String(process.pid));await file.close();
 try{
  const daemon=await startDaemon(await loadConfig());let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await daemon.close();await rm(lock,{force:true});process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);console.log('NUSA worker aktif. Gunakan menu monitor untuk status.');
 }catch(e){await rm(lock,{force:true});throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))runDaemon().catch(()=>{console.error('Worker gagal dimulai. Periksa pairing, koneksi, atau proses yang sudah berjalan.');process.exitCode=1;});
