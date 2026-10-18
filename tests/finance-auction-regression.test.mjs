import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,command,BOARD,redemption} from '../lib/game.mjs';
import {AUCTION_RULES,auctionMinimum} from '../lib/content.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {guardFinance} from '../lib/bot/finance-guard.mjs';
import {blockedFinance,financeContext} from '../lib/bot/finance-history.mjs';
import {PERSONAS} from '../lib/bot/personas.mjs';
import {parseSave,serializeSave} from '../lib/save-format.mjs';
const snapshots=JSON.parse(readFileSync(new URL('./fixtures/finance-loop-v23.json',import.meta.url)));
const options={timeBudgetMs:2600,clock:()=>0,nusaMode:'council'};
for(const {source,state} of snapshots)test(`archived oscillation escapes: ${source}`,()=>{
 let s=structuredClone(state);const id=s.turn,seen=new Map();
 for(let step=0;step<12;step++){
  const plan=decidePersona(s,id,options);assert(plan.action,`no action at ${s.phase}`);
  const a=plan.action;
  assert(!blockedFinance(s,id,a),'persona reintroduced a blocked inverse');
  if(['MORTGAGE','REDEEM'].includes(a.type)){
   const key=JSON.stringify([financeContext(s,id),a.tile]);
   assert(!seen.has(key)||seen.get(key)===a.type,'same-context inverse repeats');seen.set(key,a.type);
  }
  s=command(s,id,a,()=>.413);
  if(s.turn!==id||s.phase!==state.phase)break;
 }
});
for(const persona of PERSONAS)test(`${persona.name}: finance guard persists without NUSA, survives save/load, and debt rescue stays legal`,()=>{
 let s=createGame({players:[{name:persona.name,controller:'bot',botPersona:persona.id},{name:'Human',controller:'human'}],startingRoll:false},()=>.2);
 s.assets[5].owner=0;s.players[0].cash=4000;
 s=command(s,0,{type:'MORTGAGE',tile:5},()=>.2);
 s=parseSave(serializeSave({state:s})).state;
 const inverse={type:'REDEEM',tile:5};assert(blockedFinance(s,0,inverse));
 const result=guardFinance(s,0,{action:inverse,candidates:[{action:inverse},{action:{type:'ROLL'}}]});
 assert.equal(result.action.type,'ROLL');
 const plan=decidePersona(s,0,{...options,baseOnly:true});assert.notEqual(plan.action.type,'REDEEM');
 s=command(s,0,{type:'REDEEM',tile:5},()=>.2); // human/engine rules still allow it
 s.phase='debt';s.debt={from:0,to:1,amount:8000,label:'Rent'};
 assert(!blockedFinance(s,0,{type:'MORTGAGE',tile:5}));
 assert.doesNotThrow(()=>command(s,0,{type:'MORTGAGE',tile:5},()=>.2));
});
test('NUSA funds and completes the original purchase instead of redeeming collateral',()=>{
 let s=structuredClone(snapshots.find(x=>x.source.includes('match-0002-before-224')).state);
 const id=s.turn,target=s.buy;const plan=decidePersona(s,id,options);
 assert.equal(plan.action.type,'MORTGAGE');assert.deepEqual(plan.action.financePlan,[{type:'BUY'}]);
 s=command(s,id,plan.action,()=>.413);const after=decidePersona(s,id,options);
 assert.equal(after.action.type,'BUY');s=command(s,id,after.action,()=>.413);assert.equal(s.assets[target].owner,id);
});
test('redemption score accounts for cash consumed by the real transition',()=>{
 const s=structuredClone(snapshots.find(x=>x.source.includes('match-0001-before-755')).state);
 const p=planDecision(s,s.turn,options),c=p.candidates.find(c=>c.action.type==='REDEEM'&&c.action.tile===5);
 assert(c);assert(c.score<0);assert.equal(redemption(5),1100);
});
test('all personas bid only multiples of N5; off-grid saved bid rounds up safely',()=>{
 for(const persona of PERSONAS){
  let s=createGame({players:[{name:persona.name,controller:'bot',botPersona:persona.id},{name:'Human',controller:'human'}],startingRoll:false},()=>.2);
  s.phase='buy';s.buy=1;s=command(s,0,{type:'AUCTION'},()=>.2);s.auction.amount=110;s.auction.highest=1;
  assert.equal(auctionMinimum(s.auction),200);
  for(const n of [120,150,160,199,201,210])assert.throws(()=>command(s,0,{type:'BID',amount:n}));
  const plan=decidePersona(s,0,options);
  for(const c of plan.candidates.filter(c=>c.action.type==='BID')){assert.equal(c.action.amount%AUCTION_RULES.increment,0);assert(c.action.amount>=200);}
  assert.doesNotThrow(()=>command(s,0,plan.action,()=>.2));
 }
});
