import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, command, publicState} from '../lib/game.mjs';
import {localPlayers, PERSONAS} from '../lib/bot/personas.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {legalCandidate} from '../lib/bot/candidates.mjs';
import {validateLocalState} from '../lib/save-format.mjs';
import {newRoom, applyOperation} from '../lib/server/online-room.mjs';

const rng=()=>.42;
test('all six distinct personas survive engine and save validation',()=>{
 for(const p of PERSONAS){
  const state=createGame({players:[{name:'Manusia',controller:'human',pawn:0},{name:p.name,controller:'bot',botPersona:p.id,pawn:p.pawn}],startingRoll:false},rng);
  assert.equal(state.players[1].botPersona,p.id);
  assert.equal(validateLocalState(state).players[1].botPersona,p.id);
 }
});
test('local VS Bot supports 2-6 seats and independent character choice',()=>{
 for(let n=2;n<=6;n++){
  const selected=[...PERSONAS].reverse().slice(0,n-1).map(x=>x.id);
  const ps=localPlayers('Manusia',n,0,{},selected);
  assert.deepEqual(ps.slice(1).map(x=>x.botPersona),selected);
  assert.equal(new Set(ps.map(x=>x.pawn)).size,n);
  assert.deepEqual(createGame({players:ps},rng).players.slice(1).map(x=>x.botPersona),selected);
 }
 assert.throws(()=>localPlayers('Manusia',3,0,{},['nusa','nusa']),/unik/);
 assert.throws(()=>localPlayers('Manusia',3,0,{},['tidakada','raka']),/valid/);
});
test('strategic bots NUSA, Kresna, Arka produce legal actions in diverse phases',()=>{
 for(const p of PERSONAS){
  let s=createGame({players:[{name:'Human',controller:'human'}, {name:p.name,controller:'bot',botPersona:p.id,botDifficulty:'medium'}],startingRoll:false},rng);
  s.turn=1;
  let plan=decidePersona(s,1,{timeBudgetMs:50});
  assert.ok(plan?.action,`${p.id}: no roll action`);
  assert.ok(legalCandidate(publicState(s),1,plan.action),`${p.id}: invalid roll action`);
  assert.doesNotThrow(()=>command(s,1,plan.action,rng));
  s.phase='buy';s.buy=1;s.assets[1].owner=null;
  plan=decidePersona(s,1,{timeBudgetMs:50});
  assert.ok(plan?.action,`${p.id}: no buy action`);
  assert.ok(legalCandidate(publicState(s),1,plan.action),`${p.id}: invalid buy action`);
  assert.doesNotThrow(()=>command(s,1,plan.action,rng));
  if(['nusa','kresna','apex'].includes(p.id))assert.ok(plan.diagnostics?.model?.length,`${p.id}: router not used`);
 }
});

test('online room allows selecting NUSA, Arka, Kresna independently and enforces unique bots',()=>{
 const room=newRoom({name:'Ayu',capacity:6},'ABCDEFGH','user1','connection1',1000);
 applyOperation(room,0,{type:'ADD_BOT',persona:'nusa',difficulty:'hardcore'},1001,rng,{botsEnabled:true});
 applyOperation(room,0,{type:'ADD_BOT',persona:'apex',difficulty:'hard'},1002,rng,{botsEnabled:true});
 applyOperation(room,0,{type:'ADD_BOT',persona:'kresna',difficulty:'medium'},1003,rng,{botsEnabled:true});
 assert.deepEqual(room.seats.slice(1).map(p=>p.botPersona),['nusa','apex','kresna']);
 assert.deepEqual(room.seats.slice(1).map(p=>p.botDifficulty),['hardcore','hard','medium']);
 assert.throws(()=>applyOperation(room,0,{type:'ADD_BOT',persona:'bima'},1004,rng,{botsEnabled:true}),/tiga/);
 const other=newRoom({name:'Ayu',capacity:6},'ABCDEFGH','user1','connection1',1000);
 applyOperation(other,0,{type:'ADD_BOT',persona:'nusa'},1001,rng,{botsEnabled:true});
 assert.throws(()=>applyOperation(other,0,{type:'ADD_BOT',persona:'nusa'},1002,rng,{botsEnabled:true}),/sudah digunakan/);
 assert.throws(()=>applyOperation(other,0,{type:'ADD_BOT',persona:'invalid'},1002,rng,{botsEnabled:true}),/tidak valid/);
});
