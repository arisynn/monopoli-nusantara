import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,command,decisionActor,chooseBot,publicState,GROUPS,BOARD} from '../lib/game.mjs';
import {chooseSmartBot,planDecision,decisionGate} from '../lib/bot/strategy.mjs';
import {generateCandidates,legalCandidate} from '../lib/bot/candidates.mjs';
import {analyzeState,landingProbabilities} from '../lib/bot/analysis.mjs';
import {evaluateTrade} from '../lib/bot/negotiation.mjs';
import {localPlayers,PERSONAS,personaFor} from '../lib/bot/personas.mjs';
import {strategyView} from '../lib/bot/memory.mjs';
import {validateLocalState} from '../lib/save-format.mjs';
const setup=(n=3)=>createGame({players:localPlayers('Human',Math.min(n,4)),startingRoll:false},()=>.2);
const own=(s,t,id,level=0)=>Object.assign(s.assets[t],{owner:id,level});
const trade=(to,patch={})=>({to,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0,...patch});
const offer=(s,from,t)=>command(s,from,{type:'OFFER',trade:t});
test('fixed persona order, high skill shared by all, total count and pawn uniqueness',()=>{
 for(const n of [2,3,4]){const p=localPlayers('A',n,1);assert.equal(p.length,n);assert.deepEqual(p.slice(1).map(p=>p.name),PERSONAS.slice(0,n-1).map(p=>p.name));assert.equal(new Set(p.map(p=>p.pawn)).size,n);const s=createGame({players:p});assert.deepEqual(s.players.slice(1).map(p=>p.botPersona),PERSONAS.slice(0,n-1).map(p=>p.id));}
 assert.throws(()=>localPlayers('A',5));assert.throws(()=>localPlayers('A',1));
});
test('public chance probabilities sum to horizon and ignore hidden shuffled deck/RNG',()=>{
 const s=setup(),b=structuredClone(s);b.decks.chance.reverse();b.decks.community.reverse();
 for(const p of s.players){const dist=landingProbabilities(s,p.id);assert(Math.abs(dist.reduce((a,b)=>a+b,0)-3)<1e-8);assert.deepEqual(dist,landingProbabilities(b,p.id));}
 assert.deepEqual(planDecision(s,0),planDecision(b,0));
});
test('bot never sees other bot private strategic memory or deck order',()=>{
 const s=setup();s.botMemory={version:1,players:{1:{lastOfferSerial:0},2:{secretTarget:39}},opponents:{}};
 const v=strategyView(s,1);assert(!v.decks);assert(!v.seen);assert(!v.botMemory.players[2]);assert(!('botMemory'in publicState(s)));
});
test('every generated candidate is accepted by the actual engine over a multi-phase simulation',()=>{
 let s=setup(4);let seed=12431;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<180&&s.phase!=='won';i++){const id=decisionActor(s),plan=planDecision(s,id);assert(plan.action,`missing ${s.phase}`);for(const c of plan.candidates)assert.doesNotThrow(()=>command(s,id,c.action,rng));s=command(s,id,plan.action,rng);assert(s.players.every(p=>p.cash>=0));}
});
test('accepts a genuinely free unmortgaged property in every persona',()=>{
 for(let id=1;id<4;id++){let s=setup(4);own(s,1,0);s=offer(s,0,trade(id,{give:[1]}));assert.equal(chooseSmartBot(s,id).type,'TRADE_ACCEPT');}
});
test('rejects paying a large sum for nothing and never gives high value property away',()=>{
 let s=setup();own(s,39,1);s=offer(s,0,trade(1,{take:[39]}));assert.notEqual(chooseSmartBot(s,1).type,'TRADE_ACCEPT');
 s=setup();s=offer(s,0,trade(1,{takeCash:12000}));assert.equal(chooseSmartBot(s,1).type,'TRADE_REJECT');
});
test('trade sender/recipient perspectives have correct opposite cash direction',()=>{
 const s=setup();const t=trade(1,{giveCash:1000});assert(evaluateTrade(s,1,t,0).net>0);assert(evaluateTrade(s,0,t,0).net<0);
 const reverse=trade(0,{takeCash:1000});assert.equal(evaluateTrade(s,1,reverse,1).raw,evaluateTrade(s,1,t,0).raw);
});
test('accounts for dangerous opponent monopoly rather than approving a superficially fair swap',()=>{
 const s=setup();own(s,37,0);own(s,39,1);own(s,12,0);s.players[0].cash=30000;
 const value=evaluateTrade(s,1,trade(1,{give:[12],take:[39],giveCash:1000}),0);assert(value.monopolyThreat>0);assert(value.net<0);
});
test('negotiator can create a legal counteroffer with correct ownership direction',()=>{
 let s=setup(3);own(s,1,2);own(s,3,0);s.players[2].botPersona='bima';
 s=offer(s,0,trade(2,{give:[3],takeCash:10000}));const p=planDecision(s,2),c=p.candidates.find(c=>c.action.type==='COUNTER');assert(c);assert(legalCandidate(s,2,c.action));assert.equal(c.action.trade.to,0);assert.deepEqual(c.action.trade.take,[3]);assert(evaluateTrade(s,2,c.action.trade,2).net>=0);
});
test('proactive negotiation candidates target groups and stop after repeated rejection',()=>{
 const s=setup();own(s,1,1);own(s,3,0);own(s,6,0);own(s,8,1);s.phase='end';s.turn=1;
 const p=planDecision(s,1);assert(p.candidates.some(c=>c.action.type==='OFFER'));
 const action=p.candidates.find(c=>c.action.type==='OFFER').action;let next=command(s,1,action);next=command(next,action.trade.to,{type:'TRADE_REJECT'});
 assert(!planDecision(next,1).candidates.some(c=>c.action.type==='OFFER'));
});
test('cash reserves respond to reachable hotels and current debt instead of fixed floor',()=>{
 const s=setup(),quiet=analyzeState(s,1).reserve;own(s,37,0,5);own(s,39,0,5);s.players[1].pos=30;
 const danger=analyzeState(s,1).reserve;assert(danger>quiet);s.phase='debt';s.debt={from:1,to:0,amount:12000,label:'Rent'};assert(analyzeState(s,1).reserve>=12000);
});
test('completing a strong monopoly and an alternate target affect actual valuations',()=>{
 const s=setup();own(s,16,1);own(s,18,1);s.turn=1;s.phase='buy';s.buy=19;
 assert.equal(chooseSmartBot(s,1).type,'BUY');const p=planDecision(s,1);assert.equal(p.summary.targetGroup,3);
 const normal=p.candidates.find(c=>c.action.type==='BUY').score,ablated=planDecision(s,1,{ablatePlan:true}).candidates.find(c=>c.action.type==='BUY').score;assert(normal>ablated);
});
test('auctions generate legal distinct increments, respect liquidity and rationally pass unaffordable bids',()=>{
 let s=setup();s.phase='buy';s.buy=19;s=command(s,0,{type:'AUCTION'});const p=planDecision(s,1),bids=p.candidates.filter(c=>c.action.type==='BID');assert(bids.length>1);assert(bids.every(c=>c.action.amount%10===0&&c.action.amount<=s.players[1].cash));assert(p.action.amount>100,'Contested auction can rationally select a jump bid');
 s.auction.amount=14990;s.auction.highest=0;assert.equal(chooseSmartBot(s,1).type,'PASS');
});
test('development compares economically distinct properties and respects even building/stock',()=>{
 const s=setup(4);for(const i of [1,3])own(s,i,1);s.turn=1;
 const p=planDecision(s,1);const builds=p.candidates.filter(c=>c.action.type==='BUILD');assert.equal(builds.length,2);assert(p.action.type==='BUILD');assert.equal(p.action.tile,3);
 s.assets[3].level=1;assert(!planDecision(s,1).candidates.some(c=>c.action.type==='BUILD'&&c.action.tile===3));
});
test('debt liquidates low-income collateral before dismantling a profitable monopoly',()=>{
 const s=setup();for(const i of [16,18,19])own(s,i,1,3);own(s,5,1);s.players[1].cash=0;s.phase='debt';s.debt={from:1,to:0,amount:900,label:'Debt'};
 const p=planDecision(s,1);assert.equal(p.action.type,'MORTGAGE');assert.equal(p.action.tile,5);assert(p.summary.liquidationPlanned);
});
test('jail mobility and late-board danger produce different rational choices',()=>{
 const s=setup();s.turn=1;s.phase='jail';s.players[1].inJail=true;
 assert(['JAIL_PAY','JAIL_CARD'].includes(chooseSmartBot(s,1).type));for(const t of BOARD.filter(t=>t.type==='city'))own(s,t.id,0,5);
 assert.equal(chooseSmartBot(s,1).type,'ROLL');
});
test('Groq gate refuses illegal candidates and material economic downgrades',()=>{
 const s=setup();s.phase='buy';s.buy=1;const p=planDecision(s,0);assert.equal(decisionGate(p,'unknown').accepted,false);
 const synthetic={action:{type:'BUY'},candidates:[{id:'best',action:{type:'BUY'},score:1000},{id:'bad',action:{type:'AUCTION'},score:0}]};assert.equal(decisionGate(synthetic,'bad').reason,'economic_guard');
});
test('optional serialized memory and nullable aiComment keep old/new local saves compatible',()=>{
 let s=setup();assert.equal(s.aiComment,null);assert(validateLocalState(s));own(s,1,1);s.phase='end';s.turn=1;s=command(s,1,{type:'OFFER',trade:trade(0,{give:[1],takeCash:800})});s=command(s,0,{type:'TRADE_REJECT'});assert(validateLocalState(s));const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(planDecision(restored,1),planDecision(s,1));
});
