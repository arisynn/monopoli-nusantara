// Extracted headless tests; exclusions documented in docs/HEADLESS_TEST_SELECTION.json.
import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,command} from '../lib/game.mjs';
import {localPlayers,PERSONAS} from '../lib/bot/personas.mjs';
import {decideMind,MODELS,seeded,sampleWorld,observation,simulationActor,positionValue} from '../lib/bot/mind.mjs';
import {createMindClient} from '../lib/bot/mind-client.mjs';
import {validateLocalState} from '../lib/save-format.mjs';
import {aiDecision} from '../lib/groq.ts';
import {newRoom,applyOperation,roomView} from '../lib/server/online-room.mjs';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {runBotWorker} from '../lib/server/bot-worker.mjs';
import {BotJobStore} from './helpers/bot-job-store.mjs';
import {Worker as NodeWorker} from 'node:worker_threads';

import {readFileSync} from 'node:fs';
import {cycleFingerprint,promotionGate} from '../scripts/mind-lab-utils.mjs';
const setup=()=>createGame({players:localPlayers('Human',4),startingRoll:false,matchId:'mind-test'},seeded(123));
const auction=()=>{const s=setup();s.phase='buy';s.buy=19;return command(s,0,{type:'AUCTION'});};
const trade=(s,give,take,giveCash=0,takeCash=0)=>command(s,0,{type:'OFFER',trade:{to:1,give,take,giveCash,takeCash,giveCards:0,takeCards:0}});
for(const m of MODELS)for(const p of PERSONAS)test(`${m.code} / ${p.id}: legal policy, stable persona, bounded budget`,()=>{
 const s=auction();s.players[1].botPersona=p.id;s.players[1].botDifficulty=m.id;
 const copy=JSON.stringify(s),plan=decideMind(s,1,{timeBudgetMs:100,maxNodes:160});
 assert(plan.action);assert.equal(plan.diagnostics.persona,p.id);assert.equal(plan.diagnostics.algorithm,m.algorithm);assert(plan.diagnostics.nodes<=160);assert.doesNotThrow(()=>command(s,1,plan.action,seeded(3)));assert.equal(JSON.stringify(s),copy);
});
test('four models expose four different decision algorithms; tactical and rollout really execute engine nodes',()=>{
 const s=auction(),plans=MODELS.map(m=>decideMind(s,1,{difficulty:m.id,timeBudgetMs:1000,maxNodes:256}));
 assert.equal(new Set(plans.map(p=>p.diagnostics.algorithm)).size,4);assert.equal(plans[0].diagnostics.nodes,0);assert.equal(plans[1].diagnostics.nodes,0);assert(plans[2].diagnostics.nodes>0);assert(plans[3].diagnostics.samples>=2);assert.equal(plans[3].diagnostics.selectedBy,'rollout');
});
test('private decks, seed-like metadata, other memory and private logs cannot influence local search',()=>{
 const s=auction();s.botMemory={version:1,players:{2:{secret:'private'}},opponents:{}};s.log.unshift({id:999,audience:'private',type:'trade',text:'secret',turn:1});
 const hidden=structuredClone(s);hidden.decks.chance.reverse();hidden.decks.community.reverse();hidden.botMemory.players[2].secret='different';
 const options={difficulty:'hardcore',clock:()=>0,maxNodes:180};
 assert.deepEqual(decideMind(s,1,options),decideMind(hidden,1,options));
 const v=observation(s,1);assert(!('decks' in v));assert(!JSON.stringify(v).includes('secret'));assert(!v.botMemory.players[2]);
});
test('hidden-information worlds preserve held jail cards and never mutate live state',()=>{
 const s=setup();s.players[1].cards=[{deck:'chance',idx:15}];s.decks.chance=s.decks.chance.filter(i=>i!==15);const before=JSON.stringify(s),v=observation(s,1),world=sampleWorld(v,seeded(8));
 assert(!world.decks.chance.includes(15));assert.equal(world.decks.chance.length,15);assert.equal(new Set(world.decks.community).size,16);assert.equal(JSON.stringify(s),before);
});
test('zero budget, cancelled search and node cap return best-so-far legal action',()=>{
 const s=auction(),controller=new AbortController();controller.abort();
 for(const options of [{timeBudgetMs:0},{signal:controller.signal},{maxNodes:1}]){
  const p=decideMind(s,1,{difficulty:'hardcore',...options});assert(p.action);assert(p.diagnostics.nodes<=1);assert.equal(p.diagnostics.samples,0);assert.doesNotThrow(()=>command(s,1,p.action));
 }
});
test('complete paired sampling batches receive equal counts when interrupted',()=>{
 const p=decideMind(auction(),1,{difficulty:'hardcore',clock:()=>0,maxNodes:83});
 assert(p.diagnostics.nodes<=83);assert.equal(new Set(p.diagnostics.search.map(c=>c.samples)).size,1);
});
for(const m of MODELS)test(`${m.id} accepts free property, rejects a give-away and an expensive empty trade`,()=>{
 let s=setup();s.assets[1].owner=0;const free=trade(s,[1],[]);assert.equal(decideMind(free,1,{difficulty:m.id}).action.type,'TRADE_ACCEPT');
 s=setup();s.assets[39].owner=1;let offer=trade(s,[],[39]);assert.notEqual(decideMind(offer,1,{difficulty:m.id}).action.type,'TRADE_ACCEPT');
 s=setup();offer=trade(s,[],[],1,10000);assert.notEqual(decideMind(offer,1,{difficulty:m.id}).action.type,'TRADE_ACCEPT');
});
test('Hardcore prefers solvent assets over a forced bankruptcy; terminal value never invents a winner',()=>{
 const s=setup();s.turn=1;s.phase='debt';s.debt={from:1,to:null,amount:2000,label:'test'};s.players[1].cash=0;s.assets[39].owner=1;
 const p=decideMind(s,1,{difficulty:'hardcore',timeBudgetMs:100});assert.notEqual(p.action.type,'BANKRUPT');assert(Number.isFinite(positionValue(s,1)));
});
test('worker adapter returns baseline offline when workers cannot start',async()=>{
 const c=createMindClient(()=>{throw Error('CSP/unavailable')});const p=await c.decide(auction(),1);assert(p.action);assert.equal(p.diagnostics.workerFallback,true);c.dispose();
});
test('worker reply for a stale revision is discarded; AbortSignal terminates the CPU worker',async()=>{
 let worker,terminated=0;const c=createMindClient(()=>worker={terminate(){terminated++},postMessage(message){this.message=message}});
 const request=c.decide(auction(),1);worker.onmessage({data:{id:worker.message.id,matchId:'wrong',stateVersion:0,actor:1,plan:{action:{type:'ROLL'}}}});assert.equal(await request,null);
 const controller=new AbortController(),second=c.decide(auction(),1,{signal:controller.signal});controller.abort();assert.equal(await second,null);assert.equal(terminated,2);c.dispose();
});
test('an unresponsive local worker is terminated and replaced by an offline fallback',async()=>{
 let terminated=0;const c=createMindClient(()=>({terminate(){terminated++},postMessage(){}}));
 const p=await c.decide(auction(),1);assert(p.action);assert(p.diagnostics.workerFallback);assert.equal(terminated,1);c.dispose();
});
test('a worker crash and subsequent restart preserves local play without network',async()=>{
 let worker,count=0;const c=createMindClient(()=>{count++;return worker={terminate(){},postMessage(){queueMicrotask(()=>this.onerror())}}});
 assert((await c.decide(auction(),1)).action);assert((await c.decide(auction(),1)).action);assert.equal(count,2);c.dispose();
});
test('actual module worker executes Deep Think off-thread while the parent remains responsive',async()=>{
 const c=createMindClient(()=>{
  const thread=new NodeWorker(new URL('./helpers/mind-thread.mjs',import.meta.url));
  const adapter={terminate:()=>thread.terminate(),postMessage:message=>thread.postMessage(message),onmessage:null,onerror:null};
  thread.on('message',data=>adapter.onmessage?.({data}));thread.on('error',e=>adapter.onerror?.(e));return adapter;
 });
 const s=auction();s.players[1].botDifficulty='hardcore';let responsive=false;const timer=setTimeout(()=>responsive=true,0);
 try{const p=await c.decide(s,1);assert.equal(p.diagnostics.model,'NUSA-X4');assert(p.diagnostics.nodes>0);assert(!p.diagnostics.workerFallback);assert(responsive);assert.doesNotThrow(()=>command(s,1,p.action));}finally{clearTimeout(timer);c.dispose();}
});
test('old saves default to Medium; levels and optional advisor survive save/load without changing Nusa',()=>{
 const s=setup();delete s.players[1].botDifficulty;assert.equal(decideMind(s,1).diagnostics.model,'NUSA-M2');
 s.players[1].botDifficulty='hardcore';s.advisorEnabled=true;const saved=validateLocalState(s);assert.equal(saved.players[1].botDifficulty,'hardcore');assert.equal(saved.players[1].cash,15000);assert(saved.advisorEnabled);
 s.players[1].botDifficulty='fake';assert.throws(()=>validateLocalState(s));
});
test('host configures public fixed bot difficulty before start; invalid settings and post-start additions fail',()=>{
 const r=newRoom({capacity:4,advisorEnabled:true},'ABCDEFGH','user','tab',1000);
 assert.throws(()=>applyOperation(r,0,{type:'ADD_BOT',difficulty:'impossible'},1000,()=>.1,{botsEnabled:true}));
 applyOperation(r,0,{type:'ADD_BOT',difficulty:'hardcore'},1000,()=>.1,{botsEnabled:true});
 assert.equal(r.seats[1].botDifficulty,'hardcore');assert.equal(roomView({data:r,revision:0},'user',1000).seats[1].botDifficulty,'hardcore');r.status='playing';
 assert.throws(()=>applyOperation(r,0,{type:'ADD_BOT',difficulty:'easy'},1000,()=>.1,{botsEnabled:true}));
});
test('adding lobby bots reserves enough capacity for the second required human',()=>{
 for(const capacity of [2,3,4,6]){
  const r=newRoom({capacity},'ABCDEFGH','user','connection',1000);
  for(let i=0;i<Math.min(3,capacity-2);i++)applyOperation(r,0,{type:'ADD_BOT'},1000,()=>.1,{botsEnabled:true});
  assert(r.capacity-r.seats.length>=1);assert.throws(()=>applyOperation(r,0,{type:'ADD_BOT'},1000,()=>.1,{botsEnabled:true}));
 }
});

test('Groq opt-in defaults off even when configured; no unsolicited provider request',async()=>{
 let calls=0;const r=await aiDecision(auction(),1,{GROQ_API_KEY:'fake'},{transport:async()=>{calls++;throw Error('must not call')}});assert.equal(calls,0);assert(r.action);
});
test('Groq ignoring AbortSignal is still bounded by the local timeout',async()=>{
 const s=auction();s.advisorEnabled=true;
 const r=await aiDecision(s,1,{GROQ_API_KEY:'fake',GROQ_TIMEOUT_MS:'1500'},{circuitKey:crypto.randomUUID(),transport:async()=>new Promise(()=>{})});assert.equal(r.reason,'timeout');assert(r.action);
});
test('online worker escapes a hung advisor and commits exactly one local command',async()=>{
 const clock=()=>1000000,store=new BotJobStore(clock),service=createOnlineService({store,clock,botsEnabled:true,generateCode:()=> 'ABCDEFGH',rng:()=>.2});
 const users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const call=(i,type,data={})=>service.execute({type,clientId:'connection-'+i,code:'ABCDEFGH',requestId:crypto.randomUUID(),...data},users[i]);
 await call(0,'CREATE');await call(1,'JOIN');await call(0,'ADD_BOT',{difficulty:'hardcore'});await call(0,'READY',{ready:true});await call(1,'READY',{ready:true});await call(0,'START');
 let row=await store.get('ABCDEFGH');row.data.state=createGame({players:row.data.seats,startingRoll:false},()=>.2);row.data.state.turn=2;await store.commit(row,row.data,{notify:true});
 const r=await runBotWorker({store,clock,maxSteps:1,maxMs:120,decide:async()=>new Promise(()=>{})});assert.equal(r.committed,1);assert.equal((await store.get('ABCDEFGH')).data.state.version,1);
});
test('six-seat online room persists three distinct levels and excludes bots from vote/resume',async()=>{
 const clock=()=>1000000,store=new BotJobStore(clock),service=createOnlineService({store,clock,botsEnabled:true,generateCode:()=> 'ABCDEFGH',rng:()=>.2});
 const users=Array.from({length:3},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const call=(i,type,data={})=>service.execute({type,clientId:'connection-'+i,code:'ABCDEFGH',requestId:crypto.randomUUID(),...data},users[i]);
 await call(0,'CREATE',{capacity:6,advisorEnabled:true});await call(1,'JOIN');await call(2,'JOIN');
 for(const difficulty of ['easy','hard','hardcore'])await call(0,'ADD_BOT',{difficulty});
 for(let i=0;i<3;i++)await call(i,'READY',{ready:true});await call(0,'START');
 const view=await service.read('ABCDEFGH',users[2]);assert.deepEqual(view.state.players.slice(3).map(p=>p.botDifficulty),['easy','hard','hardcore']);assert(view.advisorEnabled);assert(view.state.advisorEnabled);
 await call(0,'PAUSE_REQUEST');let r=(await store.get('ABCDEFGH')).data;assert.deepEqual(r.vote.eligible,[0,1,2]);await call(1,'VOTE',{voteId:r.vote.id,agree:true});r=(await store.get('ABCDEFGH')).data;
 for(let i=0;i<3;i++)await call(i,'RESUME_READY',{cycle:r.pause.cycle,ready:true});assert.equal((await store.get('ABCDEFGH')).data.status,'playing');
});
for(const difficulty of ['easy','medium','hard','hardcore'])test(`${difficulty}: short simulation handles real phases without illegal moves`,()=>{
 const rng=seeded(17),s0=setup();let s=s0;
 for(let i=0;i<90&&s.phase!=='won';i++){const actor=simulationActor(s),p=decideMind(s,actor,{difficulty,maxNodes:64,timeBudgetMs:90});assert(p.action,`${s.phase}`);s=command(s,actor,p.action,rng);assert(s.players.every(p=>p.cash>=0));}
});
for(const difficulty of ['easy','medium','hard','hardcore'])test(`${difficulty}: real 10,000-action scarce-house stalemate progresses without changing bank rules`,()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/scarce-house-cycle-v45.json',import.meta.url),'utf8')),rng=seeded(400);
 let s=sampleWorld(fixture,rng);const serial=s.turnSerial;
 for(let i=0;i<32&&s.turnSerial===serial;i++){const who=simulationActor(s),p=decideMind(s,who,{difficulty,timeBudgetMs:100,maxNodes:80});assert(p.action);s=command(s,who,p.action,rng);}
 assert(s.turnSerial>serial,'must escape BUILD → JOIN → all PASS → BUILD');assert(s.bank.houses>=0);assert(s.players.every(p=>p.cash>=0));
});
test('six-player opening-roll progress is never mistaken for a policy cycle',()=>{
 const rng=seeded(443),players=Array.from({length:6},(_,i)=>({name:'P'+i,controller:'bot'}));let s=createGame({players},rng),seen=new Set();
 for(let i=0;i<24&&s.phase==='starting';i++){const key=cycleFingerprint(s);assert(!seen.has(key));seen.add(key);s=command(s,simulationActor(s),{type:'START_ROLL'},rng);}
 assert.notEqual(s.phase,'starting');
});
test('champion promotion requires sufficient finished held-out evidence and a positive clustered interval',()=>{
 assert.equal(promotionGate({}).promote,false);
 const report={byModel:{hardcore:{games:300,finished:300,illegal:0}},paired:{hardcore:{clusterBootstrap95:[.02,.15]}}};assert(promotionGate(report).promote);
 report.paired.hardcore.clusterBootstrap95=[-.02,.15];assert(!promotionGate(report).promote);
});
