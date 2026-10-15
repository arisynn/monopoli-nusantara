import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,chooseBot,decisionActor} from '../lib/game.mjs';
import {createGame as legacyGame} from '../lib/game-v1.mjs';
import {serializeSave,parseSave,validateLocalState} from '../lib/save-format.mjs';
const config={players:[{name:'Jovan',controller:'bot'},{name:'Raka',controller:'bot'}]};
function random(seed){return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)}

test('both existing save versions export and import without changing state',()=>{
 for(const create of [createGame,legacyGame]){const s=create(config,random(42));assert.deepEqual(parseSave(serializeSave({state:s,room:null})).state,s)}
});
test('pending optional context survives a barter export and continues',()=>{
 let s=createGame({...config,startingRoll:false});s=command(s,0,{type:'OFFER',trade:{to:1,give:[],take:[],giveCash:100,takeCash:0,giveCards:0,takeCards:0}});
 const restored=parseSave(serializeSave({state:s})).state;assert.equal(restored.phase,'trade');const next=command(restored,1,{type:'TRADE_ACCEPT'});assert.equal(next.players[0].cash,14900);assert.equal(next.players[1].cash,15100);assert.equal(next.phase,'roll');
});
test('save validation accepts states reached during four real seeded matches',()=>{
 const phases=new Set();let checked=0;
 for(const [create,seed] of [[legacyGame,7],[createGame,42],[createGame,311],[createGame,499]]){
  const rng=random(seed);let s=create({...config,rules:seed===311?'classic':'digital'},rng);
  for(let i=0;i<1600&&s.phase!=='won';i++){if(i%7===0||!phases.has(s.phase)){assert.deepEqual(parseSave(serializeSave({state:s})).state,JSON.parse(JSON.stringify(s)));checked++}phases.add(s.phase);const actor=decisionActor(s),a=chooseBot(s,actor);assert(a);s=command(s,actor,a,rng)}
 }
 assert(checked>100);assert(phases.has('card'));assert(phases.has('auction'));
});
test('malformed, online, oversized and corrupted backups are rejected before restore',()=>{
 const s=createGame(config);assert.throws(()=>serializeSave({state:s,room:{token:'private'}}),/lokal/);
 for(const bad of ['{broken','x'.repeat(1000001),JSON.stringify({format:'another',state:s})])assert.throws(()=>parseSave(bad));
 for(const corrupt of [v=>v.players[0].pos=40,v=>delete v.assets[1],v=>v.decks.chance.fill(0),v=>v.bank.houses=1,v=>v.players[0].cash=-1,v=>v.phase='anything',v=>v.rentClaims=[{from:99,to:1}],v=>{v.phase='trade';v.trade={}}]){const copy=structuredClone(s);corrupt(copy);assert.throws(()=>validateLocalState(copy))}
 const envelope=serializeSave({state:s}).replace('"state": {','"state": {"__proto__":{},');assert.throws(()=>parseSave(envelope));
});
