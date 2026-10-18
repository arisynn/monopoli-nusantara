import test from 'node:test';import assert from 'node:assert/strict';
import{createGame,command}from'../lib/game.mjs';import{renderPopup}from'../frontend/popups.mjs';import{autoPopup,localBotActor}from'../frontend/domain.mjs';import{ingestTimeline,advanceTimeline,presentedState}from'../lib/presentation-timeline.mjs';
function setup(n=4){let s=createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i,controller:i?'bot':'human'})),startingRoll:false},()=>.2);s.phase='buy';s.buy=13;return command(s,0,{type:'AUCTION'})}
const render=(s,p={kind:'auction'})=>renderPopup({view:s,state:s,seat:0,busy:false,paused:false,pending:false},{},p);
test('passing does not disable a new legal human bid while the auction is open',()=>{
 let s=setup();s=command(s,0,{type:'PASS'});assert(s.auction.passed.includes(0));const r=render(s);const bid=r.footer.match(/<button[^>]*data-action="bid"[^>]*>/)[0],pass=r.footer.match(/<button[^>]*data-type="PASS"[^>]*>/)[0];assert(!bid.includes('disabled'));assert(pass.includes('disabled'));s=command(s,0,{type:'BID',amount:100});assert.equal(s.auction.highest,0);assert.deepEqual(s.auction.passed,[]);
});
test('bots who passed become eligible again when a human raises the price',()=>{
 let s=setup();for(const id of [1,2,3])s=command(s,id,{type:'PASS'});assert.equal(localBotActor(s),null);s=command(s,0,{type:'BID',amount:100});assert.deepEqual(s.auction.passed,[]);assert.equal(localBotActor(s),1);assert(!render(s).html.includes('<small>Lewati</small>'));
});
test('auction remains visible and read-only through committed payment then shows a single result',()=>{
 let s=setup(2);s=command(s,1,{type:'BID',amount:100});const before=s,done=command(s,0,{type:'PASS'});let m=ingestTimeline(ingestTimeline(null,before),done);assert.equal(m.queue[0].finance.kind,'auction');const p=autoPopup(presentedState(m),done,m.queue[0],0,'');assert.equal(p.kind,'auction');assert(p.settling);const ui=render(presentedState(m),p);assert(ui.footer.match(/data-action="bid"[^>]*disabled/));assert(ui.html.includes('Tawaran ditutup'));assert(ui.html.match(/name="bid"[^>]*disabled/));m=advanceTimeline(m,m.queue[0].id);const result=autoPopup(presentedState(m),done,m.queue[0],0,'');assert.equal(result.kind,'event');assert.equal(result.event.auctionResult.amount,100);assert.equal(done.players[1].cash,before.players[1].cash-100);
});
test('auction focuses on the highest bid without participant portraits at every room size',()=>{
 for(const n of [2,3,4,5,6]){
  let s=setup(n);const before=render(s);assert(before.html.includes('Belum ada penawaran'));
  assert(!before.html.includes('auction-people'));assert(!before.html.includes('animal-avatar'));
  s=command(s,1,{type:'BID',amount:50});const r=render(s);
  assert(r.html.includes('HARGA TERTINGGI'));assert(r.html.includes('₦ 5'));
  assert(r.html.includes('P1'));assert(r.html.includes('min="10"'));
 }
});
test('opening bid and every increase require at least five Nusa without mutating rejected states',()=>{
 let s=setup(3);const original=JSON.stringify(s);
 for(const amount of [0,10,40,49,51])assert.throws(()=>command(s,0,{type:'BID',amount}));
 assert.equal(JSON.stringify(s),original);
 s=command(s,0,{type:'BID',amount:50});const committed=JSON.stringify(s);
 for(const amount of [50,60,90,99,101])assert.throws(()=>command(s,1,{type:'BID',amount}));
 assert.equal(JSON.stringify(s),committed);
 s=command(s,1,{type:'BID',amount:100});assert.equal(s.auction.amount,100);
 // Existing saves may have a highest bid not divisible by five Nusa.
 s.auction.amount=110;
 assert.throws(()=>command(s,0,{type:'BID',amount:150}));
 assert.throws(()=>command(s,0,{type:'BID',amount:160}));
 assert.equal(command(s,0,{type:'BID',amount:200}).auction.amount,200);
});
test('an edited low, fractional or unaffordable bid stays visible and cannot be submitted',()=>{
 const s=setup();
 for(const raw of ['','4','5.1','1501']){
  const r=renderPopup({view:s,state:s,seat:0,busy:false,paused:false,pending:false},{bidRaw:raw},{kind:'auction'});
  assert(r.html.includes(`value="${raw}"`));assert(r.footer.match(/data-action="bid"[^>]*disabled/));
 }
 const good=renderPopup({view:s,state:s,seat:0,busy:false,paused:false,pending:false},{bidRaw:'5'},{kind:'auction'});
 assert(!good.footer.match(/data-action="bid"[^>]*disabled/));
});
