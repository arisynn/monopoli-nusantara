import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,chooseBot,decisionActor,BOARD,stock,publicState} from '../lib/game.mjs';
import {createGame as legacyGame} from '../lib/game-v1.mjs';
import {bankSnapshot} from '../lib/bank-economy.mjs';
import {serializeSave,parseSave,validateLocalState} from '../lib/save-format.mjs';
import {seeded} from '../lib/bot/mind.mjs';
import {bankContent} from '../frontend/bank-view.mjs';
const setup=(n=3)=>createGame({players:Array.from({length:n},(_,id)=>({name:'Player '+id,controller:'human'})),startingRoll:false},()=>.2);
const total=s=>s.players.reduce((n,p)=>n+p.cash,0);
function reconcile(s){const b=s.bankEconomy;assert.equal(total(s),b.openingCirculation+b.issued-b.absorbed);assert.equal(b.turnover,b.issued+b.absorbed+b.transferred);assert.equal(Object.values(b.byKind).reduce((n,v)=>n+v.total,0),b.turnover);}
test('opening cash is circulation, not turnover or a finite bank balance',()=>{
 for(const n of [2,4,6]){const s=setup(n),b=bankSnapshot(s);assert.equal(b.circulation,n*15000);assert.equal(b.ledger.turnover,0);assert(b.ledger.complete);assert(!('cash' in s.bank));reconcile(s);}
});
test('purchase, mortgage, redemption, build and sale record once without changing financial rules',()=>{
 let s=setup();s.phase='buy';s.buy=1;s=command(s,0,{type:'BUY',id:'buy-once'});const copy=structuredClone(s);
 assert.equal(command(s,0,{type:'BUY',id:'buy-once'}),s);assert.deepEqual(s,copy);
 s.assets[3].owner=0;
 s=command(s,0,{type:'MORTGAGE',tile:1});assert.equal(bankSnapshot(s).mortgagePrincipal,BOARD[1].mortgage);reconcile(s);
 s=command(s,0,{type:'REDEEM',tile:1});assert.equal(bankSnapshot(s).mortgaged.length,0);reconcile(s);
 s=command(s,0,{type:'BUILD',tile:1});s=command(s,0,{type:'SELL',tile:1});reconcile(s);
 assert.deepEqual(Object.keys(s.bankEconomy.byKind).sort(),['purchase','mortgage','redeem','build','sell'].sort());
 const before=structuredClone(s);assert.throws(()=>command(s,1,{type:'REDEEM',tile:1}));assert.deepEqual(s,before);
});
test('rent and accepted cash barter transfer Nusa without issuing it; offers do not count',()=>{
 let s=setup();s.assets[3].owner=1;s.players[0].pos=0;
 s=command(s,0,{type:'ROLL'},(()=>{const values=[0,.2];return()=>values.shift()??.2;})());
 assert(s.bankEconomy.transferred>0);assert.equal(total(s),45000);reconcile(s);
 s.phase='end';s.extra=false;const turnover=s.bankEconomy.turnover;
 s=command(s,0,{type:'OFFER',trade:{to:1,give:[],take:[],giveCash:300,takeCash:200,giveCards:0,takeCards:0}});
 assert.equal(s.bankEconomy.turnover,turnover);s=command(s,1,{type:'TRADE_ACCEPT'});
 assert.equal(s.bankEconomy.turnover,turnover+500);assert.equal(total(s),45000);reconcile(s);
});
test('unpaid debt and bids are not transactions; settlement records one real payment',()=>{
 let s=setup();s.phase='buy';s.buy=19;s=command(s,0,{type:'AUCTION'});s=command(s,0,{type:'BID',amount:300});assert.equal(s.bankEconomy.turnover,0);
 s=command(s,1,{type:'PASS'});s=command(s,2,{type:'PASS'});assert.equal(s.bankEconomy.byKind.auction.total,300);reconcile(s);
 const before=s.bankEconomy.turnover;s.phase='debt';s.debt={from:0,to:null,amount:100,label:'test',category:'tax'};
 assert.equal(s.bankEconomy.turnover,before);s=command(s,0,{type:'PAY'});assert.equal(s.bankEconomy.turnover,before+100);reconcile(s);
});
test('old schema-2 saves initialize at the next committed action and state coverage honestly',()=>{
 let s=setup();delete s.bankEconomy;s.version=42;s.round=7;s.phase='buy';s.buy=1;
 assert.match(bankContent(s).html,/Simpanan lama/);validateLocalState(s);
 const old=structuredClone(s);s=command(s,0,{type:'BUY'});assert(!s.bankEconomy.complete);assert.equal(s.bankEconomy.fromVersion,42);assert.equal(s.bankEconomy.fromRound,7);reconcile(s);assert.deepEqual(old.bankEconomy,undefined);
 assert.match(bankContent(s).html,/sejak ronde 7/);assert.deepEqual(parseSave(serializeSave({state:s})).state,s);
});
test('mortgaged deeds are bank receivables, not unowned properties; details are read-only',()=>{
 let s=setup();s.assets[13].owner=1;s=command(s,1,{type:'MORTGAGE',tile:13});const b=bankSnapshot(s),before=structuredClone(s),html=bankContent(s).html;
 assert.equal(b.mortgaged[0].owner,1);assert(!b.unowned.includes(13));assert.match(html,/data-action="certificate" data-id="13"/);assert(!html.includes('data-type='));assert.deepEqual(s,before);
 const visible=publicState(s);assert.deepEqual(visible.bankEconomy,s.bankEconomy);
});
test('persistent totals reconcile through seeded games beyond the 300-event log cap, including bankruptcy and tax',()=>{
 let checked=0,bankrupt=0;
 for(const seed of [42,311,499]){
  const rng=seeded(seed);let s=createGame({players:[{name:'A',controller:'bot'},{name:'B',controller:'bot'},{name:'C',controller:'bot'}],rules:seed===311?'classic':'digital'},rng);
  for(let i=0;i<2500&&s.phase!=='won';i++){
   const a=chooseBot(s,decisionActor(s));s=command(s,decisionActor(s),a,rng);reconcile(s);checked++;
   if(i%47===0)assert.deepEqual(parseSave(serializeSave({state:s})).state,JSON.parse(JSON.stringify(s)));
   assert(s.bankEconomy.recent.length<=40);
  }
  assert(s.eventId>300);assert(s.bankEconomy.count>40);bankrupt+=s.bankEconomy.byKind.bankruptcy?.count||0;
 }
 assert(checked>1000);assert(bankrupt>0);
});
test('corrupt ledger fields are rejected on import while legacy schema remains readable',()=>{
 const s=setup();for(const edit of [x=>x.bankEconomy.issued=-1,x=>x.bankEconomy.count=NaN,x=>x.bankEconomy.recent=[{kind:'fake'}],x=>x.bankEconomy.byKind.unknown={total:1}]){const v=structuredClone(s);edit(v);assert.throws(()=>validateLocalState(v));}
 const legacy=legacyGame({players:[{name:'A'},{name:'B'}]},()=>.2);assert.doesNotThrow(()=>bankContent(legacy));assert(!bankSnapshot(legacy).ledger.complete);
});

test('online room retries and concurrent purchases persist one ledger entry shared by all seats',async()=>{
 const {createOnlineService}=await import('../lib/server/online-service.mjs');
 const {MemoryOnlineStore}=await import('./helpers/online-store.mjs');
 const users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const store=new MemoryOnlineStore(),service=createOnlineService({store,clock:()=>1000000,rng:()=>.2,generateCode:()=> 'ABCDEFGH'});
 const call=(i,type,data={})=>service.execute({type,clientId:'bank-test-'+i,code:'ABCDEFGH',requestId:crypto.randomUUID(),...data},users[i]);
 await call(0,'CREATE');await call(1,'JOIN');await call(0,'READY',{ready:true});await call(1,'READY',{ready:true});await call(0,'START');
 store.edit('ABCDEFGH',room=>{room.state=createGame({players:room.seats,startingRoll:false},()=>.2);room.state.phase='buy';room.state.buy=1;});
 const id=crypto.randomUUID(),body={type:'ACTION',clientId:'bank-test-0',code:'ABCDEFGH',requestId:id,action:{type:'BUY',id,expectedVersion:0}};
 const both=await Promise.all([service.execute(body,users[0]),service.execute(body,users[0])]);
 const a=await service.read('ABCDEFGH',users[0]),b=await service.read('ABCDEFGH',users[1]);
 assert.deepEqual(a.state.bankEconomy,b.state.bankEconomy);assert(both.every(v=>v.state.bankEconomy.count===1));assert.equal(a.state.bankEconomy.absorbed,BOARD[1].price);reconcile(a.state);
 const restarted=createOnlineService({store,clock:()=>1000000});assert.deepEqual((await restarted.read('ABCDEFGH',users[1])).state.bankEconomy,b.state.bankEconomy);
});
