import test from 'node:test';import assert from 'node:assert/strict';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {runBotWorker,botActor,workerAuthorized} from '../lib/server/bot-worker.mjs';
import {createGame,command} from '../lib/game.mjs';
import {BotJobStore} from './helpers/bot-job-store.mjs';
const users=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function fixture(humans=2,bots=3,personas=null){let now=1000000;const clock=()=>now,store=new BotJobStore(clock),service=createOnlineService({store,clock,botsEnabled:true,rng:()=>.2,generateCode:()=> 'ABCDEFGH'});
 const call=(i,type,data={})=>service.execute({type,clientId:`connection-${i}`,requestId:data.action?.id||crypto.randomUUID(),code:'ABCDEFGH',...data},users[i]);
 await call(0,'CREATE',{capacity:6,name:'Player 1'});for(let i=1;i<humans;i++)await call(i,'JOIN',{name:`Player ${i+1}`});for(let i=0;i<bots;i++)await call(0,'ADD_BOT',personas?{persona:personas[i]}:{});
 for(let i=0;i<humans;i++)await call(i,'READY',{ready:true});await call(0,'START');
 const engine=async fn=>{const row=await store.get('ABCDEFGH');row.data.state=createGame({players:row.data.seats,startingRoll:false},()=>.2);fn(row.data.state);await store.commit(row,row.data,{notify:true});store.jobs.get('ABCDEFGH').status='scheduled';};
 return {store,service,call,clock,advance:t=>now+=t,engine,room:()=>store.rooms.get('ABCDEFGH').data};
}
for(const [humans,bots] of [[2,0],[2,1],[2,3],[3,3],[6,0]])test(`room composition ${humans} humans + ${bots} bots`,async()=>{
 const f=await fixture(humans,bots),r=f.room();assert.equal(r.seats.length,humans+bots);assert.equal(new Set(r.seats.filter(s=>s.controller==='bot').map(s=>s.botPersona)).size,bots);assert.deepEqual(r.seats.filter(s=>s.controller==='bot').map(s=>s.name),['RAKA','BIMA','SARI'].slice(0,bots));
 if(bots)assert(r.state.players.some(p=>p.botPersona==='raka'));
});
test('only host can add at Waiting; no duplicate personas, fourth bot, or participant overflow',async()=>{
 const f=await fixture(2,3);await assert.rejects(f.call(0,'ADD_BOT'),/lobby/);await assert.rejects(f.call(1,'ADD_BOT'),/host/);
 const row=await f.store.get('ABCDEFGH');row.data.status='waiting';row.data.state=null;await f.store.commit(row,row.data);await assert.rejects(f.call(0,'ADD_BOT'),/tiga/);
});
test('two humans required even with three bots and joining after a bot preserves human seat identity',async()=>{
 const store=new BotJobStore(Date.now),service=createOnlineService({store,botsEnabled:true,generateCode:()=> 'ABCDEFGH'});
 const op=(i,type,data={})=>service.execute({type,clientId:`browser-${i}`,requestId:crypto.randomUUID(),code:'ABCDEFGH',...data},users[i]);
 await op(0,'CREATE',{name:'Ayu'});await op(0,'ADD_BOT');await op(0,'READY',{ready:true});await assert.rejects(op(0,'START'));
 const joined=await op(1,'JOIN',{name:'Budi'});assert.equal(joined.seat,2);await op(1,'READY',{ready:true});await op(0,'START');assert.equal((await service.read('ABCDEFGH',users[1])).seat,2);
});
test('bot voting/Ready are excluded and resume needs only all active humans',async()=>{
 const f=await fixture();await f.call(0,'PAUSE_REQUEST');let v=await f.service.read('ABCDEFGH',users[0]);assert.equal(v.vote.eligible.length,2);
 await f.call(1,'VOTE',{voteId:v.vote.id,agree:true});v=await f.service.read('ABCDEFGH',users[0]);assert.equal(v.status,'paused');
 await f.call(0,'RESUME_READY',{cycle:v.pause.cycle,ready:true});assert.equal(f.room().status,'paused');await f.call(1,'RESUME_READY',{cycle:v.pause.cycle,ready:true});assert.equal(f.room().status,'playing');
});
test('human client cannot execute bot turn, claim bot actor, or post fake dice/balance',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});
 const id=crypto.randomUUID();await assert.rejects(f.call(0,'ACTION',{action:{type:'ROLL',id,expectedVersion:0}}));
 await assert.rejects(f.call(0,'AI'));const fake=crypto.randomUUID();await assert.rejects(f.call(0,'ACTION',{action:{type:'ROLL',id:fake,expectedVersion:0,actor:2,dice:[6,6],cash:999999}}));assert.equal(f.room().state.version,0);
});
test('concurrent backend invocations fence and commit at most one action per state version',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});let heldResolve,enteredResolve;const entered=new Promise(r=>enteredResolve=r),held=new Promise(r=>heldResolve=r);
 const first=runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2,decide:async()=>{enteredResolve();await held;return {action:{type:'ROLL'},status:'local'}}});
 await entered;const other=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1});assert.equal(other.committed,0);heldResolve();assert.equal((await first).committed,1);assert.equal(f.room().state.version,1);assert.equal(f.store.botActions.size,1);
});
test('paused or disconnected human prevents worker mutation, without replacing that human with a bot',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});f.advance(90001);const run=await runBotWorker({store:f.store,clock:f.clock,maxSteps:2});assert.equal(run.committed,0);assert.equal(f.room().status,'paused');assert.equal(f.room().seats[0].controller,'human');assert.equal(f.room().seats.length,3);
});
test('pause arriving while Groq is in flight discards the stale recommendation',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});
 const result=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,decide:async()=>{await f.call(0,'PAUSE_REQUEST');await f.call(1,'VOTE',{voteId:f.room().vote.id,agree:true});return {action:{type:'ROLL'},status:'hybrid'}}});
 assert.equal(result.committed,0);assert.equal(f.room().status,'paused');assert.equal(f.room().state.version,0);
});
test('game version change during advisor work is discarded and requeued',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2;s.assets[1].owner=0});
 const result=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,decide:async()=>{const id=crypto.randomUUID();await f.call(0,'ACTION',{action:{type:'MORTGAGE',tile:1,id,expectedVersion:0}});return {action:{type:'ROLL'},status:'hybrid'}}});
 assert.equal(result.committed,0);assert.equal(f.room().state.version,1);assert.equal(f.store.jobs.get('ABCDEFGH').status,'scheduled');
});
test('expired worker lease after process failure can be recovered by a different worker',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});await f.store.claimBot('crashed-worker');f.advance(30001);for(let i=0;i<2;i++)await f.call(i,'HEARTBEAT');
 const r=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2});assert.equal(r.committed,1);assert.equal(f.room().state.version,1);
});
test('lease expiry during consultation rejects commit even when game version remains unchanged',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});const r=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,decide:async()=>{f.advance(30001);for(let i=0;i<2;i++)await f.call(i,'HEARTBEAT');return {action:{type:'ROLL'},status:'hybrid'}}});assert.equal(r.committed,0);assert.equal(f.room().state.version,0);
});
test('bot responses work outside the main turn in auctions, trade and scarce building interest',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.phase='buy';s.buy=1;const next=command(s,0,{type:'AUCTION'});Object.assign(s,next)});assert.equal(botActor(f.room().state),2);
 assert.equal((await runBotWorker({store:f.store,clock:f.clock,maxSteps:1})).committed,1);
 await f.engine(s=>{s.assets[1].owner=0;Object.assign(s,command(s,0,{type:'OFFER',trade:{to:2,give:[1],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0}}))});
 assert.equal((await runBotWorker({store:f.store,clock:f.clock,maxSteps:1})).committed,1);assert.equal(f.room().state.assets[1].owner,2);
 const s=f.room().state;s.phase='buildOffer';s.buildOffer={pending:[0,2],kind:'house'};assert.equal(botActor(s),2);
});
test('worker is bounded and its authorization rejects browser tokens and absent/short secrets',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});const r=await runBotWorker({store:f.store,clock:f.clock,maxSteps:2,rng:()=>.2});assert(r.claimed<=2);assert(await workerAuthorized('a'.repeat(40),'a'.repeat(40)));assert(!await workerAuthorized('Bearer user','a'.repeat(40)));assert(!await workerAuthorized('short','short'));
});
test('short disconnect blocks a bot job and heartbeat recovery requeues without host action',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});f.advance(36000);
 const stopped=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1});assert.equal(stopped.committed,0);assert.equal(f.room().status,'playing');assert.equal(f.store.jobs.get('ABCDEFGH').status,'blocked');
 await f.call(0,'HEARTBEAT');assert.equal(f.store.jobs.get('ABCDEFGH').status,'blocked');await f.call(1,'HEARTBEAT');assert.equal(f.store.jobs.get('ABCDEFGH').status,'scheduled');
 assert.equal((await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2})).committed,1);
});
test('manual rent owed to a bot is claimed before the next human roll can expire it',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.rules={preset:'classic',rent:'manual'};s.turn=0;s.turnSerial=2;s.rentClaims=[{id:'rent-test',from:1,to:2,amount:100,tile:1,turnSerial:1}];});
 assert.equal(botActor(f.room().state),2);await assert.rejects(f.call(0,'ACTION',{action:{type:'ROLL',id:crypto.randomUUID(),expectedVersion:0}}));
 const before=f.room().state.players[2].cash;assert.equal((await runBotWorker({store:f.store,clock:f.clock,maxSteps:1})).committed,1);assert.equal(f.room().state.players[2].cash,before+100);assert.equal(f.room().state.rentClaims.length,0);
});
test('online bot advisor outage continues with local NUSA MIND, without duplicate commits',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});
 const result=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2,decide:async()=>{throw Error('provider unavailable');}});
 assert.equal(result.committed,1);assert.equal(f.room().state.version,1);assert.equal(f.room().state.aiStatus,'local');assert.equal(f.store.botActions.size,1);
});
test('invalid online bot suggestion falls back to a legal local decision',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2});
 const result=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2,decide:async()=>({action:{type:'NONEXISTENT'},status:'hybrid'})});
 assert.equal(result.committed,1);assert.equal(f.room().state.version,1);assert.equal(f.room().state.aiStatus,'local');assert.equal(f.store.botActions.size,1);
});

test('NUSA V23 runs through the online job worker and commits one legal purchase',async()=>{
 const f=await fixture(2,1,['nusa']);await f.engine(s=>{s.turn=2;s.phase='buy';s.buy=13;});
 const result=await runBotWorker({store:f.store,clock:f.clock,maxSteps:1,rng:()=>.2});
 assert.equal(result.committed,1);assert.equal(f.room().state.version,1);
 assert.equal(f.room().state.players[2].botPersona,'nusa');assert.equal(f.room().state.assets[13].owner,2);
 assert.equal(f.room().state.players[2].cash,13600);assert.equal(f.store.botActions.size,1);
 assert.equal(f.room().state.aiDiagnostics.execution,'edge');assert.equal(f.room().state.aiDiagnostics.model,'NUSA-V23.0-CHRONOS-KAIROS');
});
test('human actions persist NUSA observations without a separate bot commit or gameplay version',async()=>{
 const f=await fixture(2,1,['nusa']);await f.engine(s=>{s.assets[1].owner=0;s.assets[3].owner=0;});
 const initial=f.room().state.version;
 for(const tile of [1,3]){const id=crypto.randomUUID();await f.call(0,'ACTION',{action:{type:'MORTGAGE',tile,id,expectedVersion:f.room().state.version}});}
 const memory=f.room().state.botMemory.players[2].observation;
 assert.equal(memory.pending.length,2);assert.equal(f.room().state.version,initial+2);assert.equal(f.store.botActions.size,0);
 const read=await f.service.read('ABCDEFGH',users[0]);assert.equal(read.state.botMemory,undefined);
});
test('default Edge invocation commits one action and records recovery from an invalid advisor',async()=>{
 const f=await fixture(2,1);await f.engine(s=>{s.turn=2;});
 const result=await runBotWorker({store:f.store,clock:f.clock,rng:()=>.2,decide:async()=>({action:{type:'INVALID'},status:'hybrid'})});
 assert.equal(result.committed,1);assert.equal(result.claimed,1);assert(f.room().state.aiDiagnostics.fallback);
});
