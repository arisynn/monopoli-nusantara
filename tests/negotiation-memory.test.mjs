import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command} from '../lib/game.mjs';
import {tradeSignature,tradeRetryVerdict,revisedTrade,TRADE_HISTORY_LIMIT} from '../lib/bot/trade-memory.mjs';
import {strategyView} from '../lib/bot/memory.mjs';
import {guardNegotiation} from '../lib/bot/negotiation-guard.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {planDecision} from '../lib/bot/strategy.mjs';
import {prepareTradeCandidate} from '../lib/bot/negotiation.mjs';

const setup = () => {
  const s=createGame({players:[{name:'Bot',controller:'bot',botPersona:'nusa'},{name:'Partner',controller:'human'},{name:'Other',controller:'bot',botPersona:'bima'}],startingRoll:false},()=>.2);
  for(const id of [16,18,9])s.assets[id].owner=0;
  for(const id of [19,6,8])s.assets[id].owner=1;
  s.phase='end';return s;
};
const swap = () => ({to:1,give:[9],take:[19],giveCash:600,takeCash:0,giveCards:0,takeCards:0});
const refuse = (s,t=swap(),response='TRADE_REJECT') => command(command(s,0,{type:'OFFER',trade:t}),1,{type:response});

test('receiver refusal persists a canonical offer with an explicitly estimated reason',()=>{
  let s=setup();s=refuse(s);
  const r=s.botMemory.players[0].tradeHistory.at(-1);
  assert.equal(r.outcome,'rejected');assert.equal(r.confidence,'estimated');assert.equal(r.reason,'insufficient_value');
  s.turnSerial+=s.players.length;
  assert.equal(tradeRetryVerdict(s,0,swap()).reason,'repeated_offer');
  assert.equal(tradeSignature({...swap(),give:[9,13]}),tradeSignature({...swap(),give:[13,9]}));
  assert.equal(tradeSignature({...swap(),giveCash:700,takeCash:100}),tradeSignature(swap()));
  const loaded=JSON.parse(JSON.stringify(s));assert(!tradeRetryVerdict(loaded,0,swap()).allowed);
});
test('sender cancellation is not learned as a receiver rejection',()=>{
  let s=command(setup(),0,{type:'OFFER',trade:swap()});s=command(s,0,{type:'TRADE_REJECT'});
  assert.equal(s.botMemory.players[0].tradeHistory.at(-1).outcome,'withdrawn');
  assert.equal(s.botMemory.players[0].rejections?.[0],undefined);
  assert.equal(s.botMemory.opponents[1]?.tradeRejected||0,0);
  assert(tradeRetryVerdict(s,0,swap()).allowed);
});
test('counteroffers record the previous proposal in the correct direction and acceptance is observed',()=>{
  let s=command(setup(),0,{type:'OFFER',trade:swap()});
  const counter={...swap(),to:0,give:[19],take:[9],giveCash:0,takeCash:900};
  s=command(s,1,{type:'COUNTER',trade:counter});
  assert.equal(s.botMemory.players[0].tradeHistory.at(-1).outcome,'countered');
  assert.deepEqual(s.botMemory.players[0].tradeHistory.at(-1).counter,counter);
  assert.equal(revisedTrade(s,0,swap()).giveCash,900);
  assert.equal(tradeRetryVerdict(s,0,{...swap(),giveCash:900}).reason,'observed_counteroffer');
  s=command(s,0,{type:'TRADE_ACCEPT'});
  assert.equal(s.botMemory.players[1].tradeHistory.at(-1).outcome,'accepted');
  assert.equal(s.assets[19].owner,0);
});
test('revision requires meaningful compensation, respects retry limits and never spends protected cash',()=>{
  let s=setup();const t={...swap(),give:[],take:[6],giveCash:100};
  s=refuse(s,t);s.turnSerial+=s.players.length;s.players[0].lastOfferRound=-1;
  assert.equal(tradeRetryVerdict(s,0,{...t,giveCash:110}).reason,'insufficient_revision');
  const improved=revisedTrade(s,0,t);assert(improved.giveCash>=200);assert(tradeRetryVerdict(s,0,improved).allowed);
  assert(s.players[0].cash-improved.giveCash>=500);
  s=refuse(s,improved);s.turnSerial+=s.players.length;s.players[0].lastOfferRound=-1;
  const next=revisedTrade(s,0,improved);assert(next.giveCash>improved.giveCash);
  s=refuse(s,next);s.turnSerial+=s.players.length;
  assert.equal(revisedTrade(s,0,next),null);assert.equal(tradeRetryVerdict(s,0,{...next,giveCash:next.giveCash+1000}).reason,'revision_limit');
});
test('safe shared revision can still complete a mutually beneficial monopoly swap',()=>{
  let s=refuse(setup());s.turnSerial+=s.players.length;
  const candidate={type:'OFFER',trade:swap()},prepared=prepareTradeCandidate(s,0,candidate);
  assert(prepared);assert(prepared.trade.giveCash>candidate.trade.giveCash);
  s=command(s,0,prepared);s=command(s,1,{type:'TRADE_ACCEPT'});
  assert.equal(s.assets[19].owner,0);assert.equal(s.assets[9].owner,1);
});
test('shared final guard blocks specialist-injected repeated offers for all six personas',()=>{
  for(const persona of ['raka','bima','sari','nusa','apex','kresna']){
    const t={...swap(),give:[],giveCash:2000};
    const s=refuse(setup(),t);s.players[0].botPersona=persona;s.turnSerial+=s.players.length;
    const before=JSON.stringify(s),action={type:'OFFER',trade:t,actionId:'injected'};
    const guarded=guardNegotiation(s,0,{action,candidates:[{id:'exit',action:{type:'END',actionId:'exit'},score:0}]});
    assert.equal(guarded.action.type,'END');
    const plan=decidePersona(s,0,{timeBudgetMs:120});assert(plan.action);
    if(['OFFER','COUNTER'].includes(plan.action.type))assert(tradeRetryVerdict(s,0,plan.action.trade).allowed);
    assert.doesNotThrow(()=>command(s,0,plan.action));assert.equal(JSON.stringify(s),before);
  }
});
test('changed economic context unlocks reconsideration and history stays bounded/private',()=>{
  const s=refuse(setup());assert(!tradeRetryVerdict(s,0,swap()).allowed);
  s.players[1].cash+=5000;assert(tradeRetryVerdict(s,0,swap()).allowed);
  assert.equal(strategyView(s,2).botMemory.players[0],undefined);
  let repeated=setup();
  for(let i=0;i<TRADE_HISTORY_LIMIT+5;i++){repeated.players[0].lastOfferRound=-1;repeated=refuse(repeated);repeated.turnSerial+=3;}
  assert.equal(repeated.botMemory.players[0].tradeHistory.length,TRADE_HISTORY_LIMIT);
  assert(planDecision(repeated,0).action);
});
