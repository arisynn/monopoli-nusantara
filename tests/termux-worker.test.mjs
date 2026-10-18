import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TermuxStore} from './helpers/termux-store.mjs';
import {createGame,command} from '../lib/game.mjs';
import {createTermuxService} from '../lib/server/termux-worker.mjs';
import {digest} from '../lib/server/online-service.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {WorkerClient} from '../termux/client.mjs';
import {startDaemon} from '../termux/daemon.mjs';
import {render} from '../termux/manage.mjs';
const token='d'.repeat(64),other='e'.repeat(64),workerId='00000000-0000-4000-8000-000000000003';
const body=(op,data={})=>({op,protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID,...data});
async function fixture(personas=['nusa','kresna','apex']){
 let now=Date.now();const clock=()=>now,store=new TermuxStore(clock);
 const worker={id:workerId,hash:await digest(token),max_slots:2,slots:2,heartbeat:now};store.workers.set(workerId,worker);
 const players=[{name:'A',controller:'human'},{name:'B',controller:'human'},...personas.map(p=>({name:p,controller:'bot',botPersona:p}))];
 const state=createGame({players,startingRoll:false},()=>.2);state.turn=2;
 const code='ABCDEFGH',room={code,schemaVersion:1,mode:'online',status:'playing',capacity:6,host:0,state,seats:state.players.map((p,i)=>({...p,userId:p.controller==='human'?`user-${i}`:null,connections:p.controller==='human'?{browser:now}:{}}))};
 store.rooms.set(code,{code,revision:0,data:room});store.jobs.set(code,{code,version:0,status:'scheduled',due:now,owner:null,until:0,attempts:0});
 const service=createTermuxService({store,clock,rng:()=>.2});
 const execute=(op,data={},auth=token)=>service.execute(body(op,data),auth);
 return {store,worker,room,code,execute,advance:n=>now+=n,service};
}
test('worker authentication, manifest matching, scope, and sanitized decision views',async()=>{
 const f=await fixture();await assert.rejects(f.execute('claim',{},other),/Worker/);
 await assert.rejects(f.service.execute({...body('claim'),manifest:'old'},token),/Versi/);
 f.worker.codes=['BCDEFGHJ'];assert.equal((await f.execute('claim')).job,null);f.worker.codes=null;
 f.room.state.botMemory={players:{0:{secret:'human'},2:{lastOfferSerial:0}},opponents:{}};
 const {job}=await f.execute('claim');assert(job);assert(!job.state.decks);assert(!job.state.seen);assert(!job.state.botMemory.players[0]);assert.equal(job.actor,2);
});
test('concurrent claims, duplicate submit with lost ACK, and replay mismatch have one committed effect',async()=>{
 const f=await fixture();const claims=await Promise.all([f.execute('claim'),f.execute('claim')]);assert.equal(claims.filter(x=>x.job).length,1);
 const job=claims.find(x=>x.job).job,commandId=crypto.randomUUID(),payload={job,commandId,action:{type:'ROLL'}};
 const before=f.room.state.players[2].cash;const first=await f.execute('submit',payload);assert(first.ok);
 const repeat=await f.execute('submit',payload);assert(repeat.duplicate);assert.equal(f.store.botActions.size,1);assert.equal(f.store.rooms.get(f.code).data.state.version,1);
 assert(before>=0);await assert.rejects(f.execute('submit',{...payload,action:{type:'END'}}),/isi berbeda/);
});
test('forged dice/state, revoked worker, expired lease, pause, and human version changes are rejected',async()=>{
 for(const scenario of ['forged','revoked','expired','pause','version']){
  const f=await fixture(),{job}=await f.execute('claim');
  const payload={job,commandId:crypto.randomUUID(),action:{type:'ROLL'}};
  if(scenario==='forged')payload.action.dice=[6,6];
  if(scenario==='revoked')f.worker.revoked=true;
  if(scenario==='expired')f.advance(31000);
  if(scenario==='pause')f.room.status='paused';
  if(scenario==='version')f.room.state.version++;
  await assert.rejects(f.execute('submit',payload),scenario);
  assert.equal(f.store.botActions.size,0);
 }
});
test('lease recovers after worker crash; heartbeat-only room revision does not invalidate a decision',async()=>{
 const f=await fixture(),old=(await f.execute('claim')).job;f.advance(31000);
 const newer=(await f.execute('claim')).job;assert(newer);assert.notEqual(old.lease,newer.lease);
 await assert.rejects(f.execute('submit',{job:old,commandId:crypto.randomUUID(),action:{type:'ROLL'}}));
 f.store.rooms.get(f.code).revision++;
 assert((await f.execute('submit',{job:newer,commandId:crypto.randomUUID(),action:{type:'ROLL'}})).ok);
});
test('offline provider and absent humans leave canonical state untouched',async()=>{
 const f=await fixture();f.store.provider='edge';assert.equal((await f.execute('claim')).job,null);
 f.store.provider='termux';f.advance(36000);assert.equal((await f.execute('claim')).job,null);assert.equal(f.room.state.version,0);
});
test('all six personas can compute and submit through the same restricted worker protocol',async()=>{
 for(const persona of ['nusa','kresna','apex','raka','bima','sari']){
  const f=await fixture([persona]),{job}=await f.execute('claim');
  const plan=decidePersona(job.state,job.actor,{timeBudgetMs:64});
  const result=await f.execute('submit',{job,commandId:crypto.randomUUID(),action:plan.action});assert(result.ok,persona);
 }
});
test('worker client sends no admin credentials and preserves the submit command ID across retries',async()=>{
 const calls=[];const client=new WorkerClient({api:'https://game.example',token},{transport:async(url,opts)=>{calls.push({url,...opts});return Response.json({ok:true});},persist:async()=>{}});
 const p={commandId:'same-command',action:{type:'ROLL'}};await client.request('submit',p);await client.request('submit',p);
 assert.equal(calls[0].body,calls[1].body);assert(!calls[0].body.includes(token));assert.equal(calls[0].headers.Authorization,`Bearer ${token}`);
});
test('real compute threads drive two rooms; lost submit ACK retries, and dashboard stays at five events',async()=>{
 const f=await fixture(['raka','bima','sari']),dir=await mkdtemp(join(tmpdir(),'nusa-worker-'));
 const second=structuredClone(f.store.rooms.get(f.code));second.code=second.data.code='BCDEFGHJ';second.data.state.turn=3;second.data.state.matchId=crypto.randomUUID();
 f.store.rooms.set(second.code,second);f.store.jobs.set(second.code,{...f.store.jobs.get(f.code),code:second.code});
 let lost=false;
 const client={request:async(op,data={})=>{const result=await f.execute(op,data);if(op==='submit'&&!lost){lost=true;throw Error('Lost ACK');}return result;}};
 const daemon=await startDaemon({slots:2,budget:64,advisor:false},{client,dataDir:dir,realtime:false});
 try{
  const until=Date.now()+15000;while(f.store.botActions.size<4&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
  assert(f.store.botActions.size>=4);assert(lost);assert(daemon.state.retries>=1);assert(daemon.state.events.length<=5);
  assert(new Set([...f.store.botActions.values()].map(x=>`${x.matchId}:${x.sourceVersion}`)).size===f.store.botActions.size);
  const printed=render({...daemon.state,events:Array.from({length:20},(_,i)=>({text:`event ${i}`,at:'12:00:00'}))});
  assert(!printed.includes('event 14\n'));assert(printed.includes('event 19'));
 }finally{await daemon.close();await rm(dir,{recursive:true,force:true});}
});


test('backend rejects a worker bypassing committed build/sell stability history', async () => {
  const f = await fixture();
  f.room.state.assets[1].owner = 2; f.room.state.assets[3].owner = 2;
  f.room.state = command(f.room.state, 2, { type: 'BUILD', tile: 1 }, () => .2);
  const jobRow = f.store.jobs.get(f.code); jobRow.version = f.room.state.version;
  const { job } = await f.execute('claim'); assert(job);
  await assert.rejects(f.execute('submit', { job, commandId: crypto.randomUUID(),
    action: { type: 'SELL', tile: 1 } }), /guard stabilitas/);
  assert.equal(f.store.botActions.size, 0);
  assert.equal(f.room.state.assets[1].level, 1);
});
