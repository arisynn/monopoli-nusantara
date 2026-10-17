import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command} from '../lib/game.mjs';
import {localPlayers,PERSONAS} from '../lib/bot/personas.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {decideMind,simulationActor,observation} from '../lib/bot/mind.mjs';
import {legalCandidate} from '../lib/bot/candidates.mjs';
import {serializeSave,parseSave} from '../lib/save-format.mjs';
import {STRATEGY_EXPERTS} from '../lib/bot/nusa-v7/index.mjs';
function game(ids=['nusa','apex','raka']){
 return createGame({players:localPlayers('Tester',ids.length+1,0,{},ids),startingRoll:false},()=>.4);
}
const random=(seed=31991)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
test('three selectable, distinct bot identities, independent from difficulty',()=>{
 assert.equal(STRATEGY_EXPERTS.length,16);
 assert(PERSONAS.some(p=>p.id==='nusa')&&PERSONAS.some(p=>p.id==='apex'));
 const s=game();assert.deepEqual(s.players.slice(1).map(p=>p.botPersona),['nusa','apex','raka']);
 assert.throws(()=>localPlayers('Tester',4,0,{},['nusa','apex','apex']),/unik/);
 for(const p of s.players.slice(1))assert.equal(p.controller,'bot');
});
test('NUSA and Apex are separate algorithms, legal and deterministic',()=>{
 const s=game();s.turn=1;const a=decidePersona(s,1);s.turn=2;const b=decidePersona(s,2);s.turn=3;const c=decidePersona(s,3);
 assert.equal(a.diagnostics.model,'NUSA-V7.2');assert.equal(b.diagnostics.model,'APEX-JS-1.0');
 assert.equal(c.diagnostics.model,decideMind(s,3).diagnostics.model);
 for(const [who,result] of [[1,a],[2,b],[3,c]]){
  s.turn=who;assert(result.action);assert(legalCandidate(observation(s,who),who,result.action));
  assert.doesNotThrow(()=>command(s,who,result.action,random()));
 }
 s.turn=1;assert.deepEqual(decidePersona(s,1).action,a.action);
 s.turn=2;assert.deepEqual(decidePersona(s,2).action,b.action);
 assert.equal(a.diagnostics.learning.enabled,false);
 assert.equal(b.diagnostics.learning.enabled,false);
});
test('bot identities and model algorithms survive save/load, legacy formats remain valid',()=>{
 const s=game(),saved=parseSave(serializeSave({state:s})).state;
 assert.deepEqual(saved.players.map(p=>p.botPersona),s.players.map(p=>p.botPersona));
 saved.turn=1;assert.equal(decidePersona(saved,1).diagnostics.model,'NUSA-V7.2');
 saved.turn=2;assert.equal(decidePersona(saved,2).diagnostics.model,'APEX-JS-1.0');
 assert.deepEqual(localPlayers('Tester',4).slice(1).map(p=>p.botPersona),['raka','bima','sari']);
});
test('NUSA and Apex cannot read hidden card order and do not mutate authoritative state',()=>{
 const s=game(),copy=structuredClone(s),hidden=structuredClone(s);
 hidden.decks.chance.reverse();hidden.decks.community.reverse();
 for(const actor of [1,2]){
  s.turn=actor;hidden.turn=actor;assert.deepEqual(decidePersona(s,actor).action,decidePersona(hidden,actor).action);
 }
 s.turn=copy.turn;assert.deepEqual(s,copy);
});
test('multi-persona gameplay uses real engine, 0 illegal decisions',()=>{
 let s=game();const rng=random(740823);let nusa=0,apex=0,steps=0;
 for(;steps<320&&s.phase!=='won';steps++){
  const actor=simulationActor(s);assert.notEqual(actor,null,`no actor for ${s.phase}`);
  const result=decidePersona(s,actor,{difficulty:'medium',timeBudgetMs:0});
  assert(result.action,`missing action for ${s.phase} / ${actor}`);
  assert(legalCandidate(observation(s,actor),actor,result.action),`illegal ${s.phase} / ${actor} / ${result.action.type}`);
  if(actor===1)nusa++;if(actor===2)apex++;
  s=command(s,actor,result.action,rng);
 }
 assert(steps>=120);assert(nusa>0&&apex>0);
});

test('room host can select NUSA and Apex explicitly; bot worker keeps both independent',async()=>{
 const {createOnlineService}=await import('../lib/server/online-service.mjs');
 const {runBotWorker}=await import('../lib/server/bot-worker.mjs');
 const {BotJobStore}=await import('./helpers/bot-job-store.mjs');
 let now=500000;const clock=()=>now,store=new BotJobStore(clock);
 const service=createOnlineService({store,clock,botsEnabled:true,rng:()=>.3,generateCode:()=> 'ABCDEFGH'});
 const users=['00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102'];
 const op=(u,type,data={})=>service.execute({type,code:'ABCDEFGH',clientId:'persona-browser-'+u,requestId:crypto.randomUUID(),...data},users[u]);
 await op(0,'CREATE',{capacity:4,name:'Tester Host'});
 await op(1,'JOIN',{name:'Tester Guest'});
 await op(0,'ADD_BOT',{persona:'nusa',difficulty:'hard'});
 await op(0,'ADD_BOT',{persona:'apex',difficulty:'hardcore'});
 await assert.rejects(op(0,'ADD_BOT',{persona:'apex'}),/tiga|unik|valid|bot|penuh/i);
 await op(0,'READY',{ready:true});await op(1,'READY',{ready:true});await op(0,'START');
 const read=()=>store.rooms.get('ABCDEFGH').data;
 assert.deepEqual(read().state.players.slice(2).map(p=>p.botPersona),['nusa','apex']);
 for(let actor=2;actor<=3;actor++){
   const row=await store.get('ABCDEFGH');
   row.data.state=createGame({players:row.data.seats,startingRoll:false},()=>.3);
   row.data.state.turn=actor;
   await store.commit(row,row.data,{notify:true});
   store.jobs.get('ABCDEFGH').status='scheduled';
   const initial=read().state.version;
   const result=await runBotWorker({store,clock,maxSteps:1,rng:()=>.3});
   assert.equal(result.committed,1,`${read().state.players[actor].botPersona} failed`);
   assert.equal(read().state.version,initial+1);
 }
});
