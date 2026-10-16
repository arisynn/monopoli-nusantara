import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {createGame,command,publicState,decisionActor,chooseBot,BOARD,DECKS,stock} from '../lib/game.mjs';
import {ingestTimeline,advanceTimeline,presentedState,liveCardDecision,stepDuration,MAX_VISUAL_STEPS} from '../lib/presentation-timeline.mjs';
import {transactionDeltas,financeRows} from '../lib/finance.mjs';
import {pawnSlot} from '../lib/pawn-layout.mjs';import {tileRect} from '../lib/board-camera.mjs';import {pawnRoute,samplePawnRoute,pawnStepTiming} from '../lib/pawn-animation.mjs';import {validateLocalState} from '../lib/save-format.mjs';
const setup=(n=2)=>createGame({players:Array.from({length:n},(_,i)=>({name:['Jovan','Raka','Bima','Sari','Nara','Damar'][i]})),startingRoll:false},()=>.2);
const rng=(...pips)=>{let i=0;return()=>((pips[i++]??2)-.5)/6};
const act=(s,id,type,data={},pips=[])=>command(s,id,{type,...data},rng(...pips));
function drain(model){const steps=[];while(model?.queue.length){steps.push({head:model.queue[0],view:presentedState(model)});model=advanceTimeline(model,model.queue[0].id);assert(steps.length<=MAX_VISUAL_STEPS)}return {model,steps};}
function assertLedger(before,after){const events=after.log.filter(e=>e.id>before.eventId),net=Array(before.players.length).fill(0);for(const e of events)for(const t of e.finance||[])for(const d of transactionDeltas(t))net[d.player]+=d.amount;assert.deepEqual(after.players.map((p,i)=>p.cash-before.players[i].cash),net,JSON.stringify(events.map(e=>({id:e.id,type:e.type,finance:e.finance}))));}
const card=(s,deck,predicate)=>{const idx=DECKS[deck].findIndex(predicate);assert(idx>=0);s.decks[deck]=[idx,...s.decks[deck].filter(i=>i!==idx)];return idx};
function landCard(deck,predicate,n=2){let s=setup(n);const idx=card(s,deck,predicate);s.players[0].pos=deck==='chance'?4:39;const before=structuredClone(s);s=act(s,0,'ROLL',{},[1,2]);assert.equal(s.phase,'card');assert.equal(s.card.idx,idx);return {before,state:s};}

test('roll -> result -> pawn -> arrival -> committed finance is a strict visual sequence',()=>{
 let s=setup();s.assets[3].owner=1;const done=act(s,0,'ROLL',{},[1,2]);let model=ingestTimeline(ingestTimeline(null,s),done);
 assert.equal(done.players[0].pos,3);assert.notEqual(done.players[0].cash,s.players[0].cash);
 assert.deepEqual(model.queue.slice(0,5).map(x=>x.kind),['diceRolling','diceResult','pawnMoving','tileArrival','financialSettlement']);
 assert.deepEqual(presentedState(model).dice,s.dice);assert.equal(presentedState(model).players[0].pos,0);assert.equal(presentedState(model).players[0].cash,s.players[0].cash);
 model=advanceTimeline(model,model.queue[0].id);assert.deepEqual(presentedState(model).dice,[1,2]);assert.equal(presentedState(model).players[0].pos,0);
 model=advanceTimeline(model,model.queue[0].id);assert.equal(presentedState(model).players[0].pos,3);assert.equal(presentedState(model).players[0].cash,s.players[0].cash);
 const result=drain(model);assert.deepEqual(result.model.view,done);assertLedger(s,done);
});
test('identical snapshots and stale completion callbacks never restart or consume a new step',()=>{
 const s=setup(),done=act(s,0,'ROLL',{},[2,3]);let m=ingestTimeline(ingestTimeline(null,s),done),id=m.queue[0].id;
 assert.equal(ingestTimeline(m,done),m);m=advanceTimeline(m,id);assert.equal(advanceTimeline(m,id),m);assert.equal(ingestTimeline(m,s),m);
});
test('rapid revisions queue all public movement and finance, not only the latest lastMove',()=>{
 let s=setup();const initial=s;s=act(s,0,'ROLL',{},[1,2]);s=act(s,0,'BUY');s=act(s,0,'END');s=act(s,1,'ROLL',{},[2,3]);
 const m=ingestTimeline(ingestTimeline(null,publicState(initial)),publicState(s));assert.equal(m.queue.filter(x=>x.kind==='pawnMoving').length,2);assert.equal(m.queue.filter(x=>x.kind==='financialSettlement').length,1);assert.equal(drain(m).model.view.version,s.version);
});
for(const n of [2,4,6])for(const deck of ['chance','community'])test(`${n} clients receive the same public ${deck} card; only its human actor can ACK`,()=>{
 const {before,state}=landCard(deck,c=>!!c.money&&c.money>0,n),models=Array.from({length:n},()=>ingestTimeline(ingestTimeline(null,publicState(before)),publicState(state)));
 const events=models.map(m=>m.queue.find(x=>x.event?.type==='card').event);assert(events.every(e=>e.id===events[0].id));assert(events.every(e=>e.card.title===state.card.title));
 for(let seat=0;seat<n;seat++)assert.equal(liveCardDecision(events[seat],publicState(state),seat),seat===0);
 assert(!('decks'in publicState(state)));assert(!('botMemory'in publicState(state)));
});
test('card acknowledged rapidly by a bot remains visible to observers before its finance/move',()=>{
 const {before,state}=landCard('chance',c=>c.move===0);const done=act(state,0,'ACK');const m=ingestTimeline(ingestTimeline(null,publicState(before)),publicState(done));
 const cardIndex=m.queue.findIndex(x=>x.event?.card),moves=m.queue.map((x,i)=>x.kind==='pawnMoving'?i:-1).filter(i=>i>=0);assert(cardIndex>moves[0]);assert(moves[1]>cardIndex);assert(!liveCardDecision(m.queue[cardIndex].event,done,0));assertLedger(state,done);
});
test('reconnect, refresh and match changes baseline old effects while retaining pending decisions',()=>{
 const {before,state}=landCard('community',c=>c.money>0),m=ingestTimeline(ingestTimeline(null,before),state);assert(m.queue.some(x=>x.event?.card));
 const restored=ingestTimeline(m,state,{epoch:1});assert.equal(restored.queue.length,0);assert.equal(restored.view.phase,'card');assert.equal(ingestTimeline(null,state).queue.length,0);
 assert.equal(ingestTimeline(m,setup()).queue.length,0);
});
test('pause while rolling catches up safely; resume never repeats a confirmed roll/card/payment',()=>{
 const s=setup(),done=act(s,0,'ROLL',{},[1,2]);let m=ingestTimeline(ingestTimeline(null,s),done);m=ingestTimeline(m,done,{reset:true});assert.equal(m.queue.length,0);assert.deepEqual(m.view,done);assert.equal(ingestTimeline(m,done).queue.length,0);
});
test('missed log window and excessive backlog recover snapshot rather than invent missing events',()=>{
 const s=setup(),base=ingestTimeline(null,s),after=structuredClone(s);after.version=100;after.eventId=500;after.log=[{id:500,turn:1,type:'turn',text:'New'}];const m=ingestTimeline(base,after);assert(m.recovered);assert.equal(m.queue.length,0);
 const full={...base,queue:Array.from({length:MAX_VISUAL_STEPS},(_,i)=>({id:'queued'+i,kind:'diceRolling'}))};assert(ingestTimeline(full,act(s,0,'ROLL',{},[1,2])).recovered);
});
test('GO is paid once by the engine and visually appears after movement, not before dice reveal',()=>{
 let s=setup();s.players[0].pos=39;const done=act(s,0,'ROLL',{},[1,2]),m=ingestTimeline(ingestTimeline(null,s),done);
 const movement=m.queue.findIndex(x=>x.kind==='pawnMoving'),salary=m.queue.findIndex(x=>x.finance?.kind==='salary');assert(salary>movement);assert.equal(done.players[0].cash,17000);assertLedger(s,done);
});
test('jail entry has one jump/event; subsequent jailed turns do not replay entry',()=>{
 let s=setup();s.players[0].pos=28;const before=s;s=act(s,0,'ROLL',{},[1,1]);const r=drain(ingestTimeline(ingestTimeline(null,before),s));assert.equal(r.steps.filter(x=>x.head.event?.type==='jail').length,1);assert.equal(r.steps.filter(x=>x.head.move?.jump&&x.head.kind==='pawnMoving').length,1);assert.equal(s.players[0].pos,10);
 let m=r.model;s=act(s,0,'END');m=ingestTimeline(m,s);s=act(s,1,'ROLL',{},[2,3]);m=drain(ingestTimeline(m,s)).model;s=act(s,1,'BUY');m=drain(ingestTimeline(m,s)).model;s=act(s,1,'END');m=ingestTimeline(m,s);assert.equal(s.phase,'jail');assert(!m.queue.some(x=>x.event?.type==='jail'));
});
for(const type of ['JAIL_PAY','JAIL_CARD','ROLL'])test(`jail ${type} releases once without replaying entry`,()=>{
 const s=setup();s.phase='jail';s.players[0].pos=10;s.players[0].inJail=true;
 if(type==='JAIL_CARD'){const idx=card(s,'chance',c=>c.jailCard);s.players[0].cards=[{deck:'chance',idx}];s.decks.chance=s.decks.chance.filter(i=>i!==idx)}
 const done=act(s,0,type,{},[2,2]),m=ingestTimeline(ingestTimeline(null,s),done);assert.equal(m.queue.filter(x=>x.event?.type==='release').length,1);assert.equal(m.queue.filter(x=>x.event?.type==='jail').length,0);assert(!done.players[0].inJail);assertLedger(s,done);const finished=drain(m).model;assert.equal(ingestTimeline(finished,done).queue.length,0);
});
test('failed jail roll has dice but no movement/release popup; third failure preserves debt until paid',()=>{
 let s=setup();s.phase='jail';s.players[0].pos=10;s.players[0].inJail=true;let done=act(s,0,'ROLL',{},[1,2]);assert(!ingestTimeline(ingestTimeline(null,s),done).queue.some(x=>x.move||x.event));
 s=setup();s.phase='jail';s.players[0].pos=10;s.players[0].inJail=true;s.players[0].jail=2;s.players[0].cash=0;s.assets[1].owner=0;done=act(s,0,'ROLL',{},[1,2]);assert.equal(done.phase,'debt');assert(done.players[0].inJail);assertLedger(s,done);
 const mortgaged=act(done,0,'MORTGAGE',{tile:1});mortgaged.players[0].cash=500;const paid=act(mortgaged,0,'PAY');assert.equal(paid.players[0].inJail,false);assertLedger(mortgaged,paid);
});
test('manual rent is animated only after the legitimate claim, never on an unpaid debt',()=>{
 let s=setup();s.rules={preset:'classic',rent:'manual'};s.assets[3].owner=1;const landed=act(s,0,'ROLL',{},[1,2]);assertLedger(s,landed);assert.equal(landed.log.filter(e=>e.id>s.eventId).flatMap(e=>e.finance||[]).length,0);
 const paid=act(landed,1,'CLAIM_RENT',{claimId:landed.rentClaims[0].id});assertLedger(landed,paid);assert.equal(paid.log.find(e=>e.finance?.length).finance[0].kind,'rent');
 s=setup();s.assets[3].owner=1;s.players[0].cash=0;const debt=act(s,0,'ROLL',{},[1,2]);assert.equal(debt.phase,'debt');assertLedger(s,debt);
});
test('purchase, tax, construction, sale, mortgage and redemption have exact authoritative ledger entries',()=>{
 let s=setup();s.phase='buy';s.buy=1;let done=act(s,0,'BUY');assertLedger(s,done);s=done;s.phase='buy';s.buy=3;done=act(s,0,'BUY');assertLedger(s,done);s=done;
 for(const [type,data] of [['BUILD',{tile:1}],['BUILD',{tile:3}],['SELL',{tile:1}],['SELL_SET',{tile:3}],['MORTGAGE',{tile:1}],['REDEEM',{tile:1}]]){done=act(s,0,type,data);assertLedger(s,done);s=done;}
 s=setup();s.players[0].pos=1;done=act(s,0,'ROLL',{},[1,2]);assertLedger(s,done);assert.equal(done.log.find(e=>e.finance?.length).finance[0].kind,'tax');assert(validateLocalState(done));
});
test('auction settlement has one payment despite separate buy and result log entries',()=>{
 let s=setup();s.phase='buy';s.buy=1;s=act(s,0,'AUCTION');s=act(s,1,'BID',{amount:100});const done=act(s,0,'PASS',{id:'auction-finish'});assertLedger(s,done);assert.equal(done.log.filter(e=>e.id>s.eventId).flatMap(e=>e.finance||[]).length,1);assert.equal(act(done,0,'PASS',{id:'auction-finish'}),done);
 const m=ingestTimeline(ingestTimeline(null,s),done);assert.equal(m.queue.filter(x=>x.event?.auctionResult).length,1);
});
test('cash/property barter carries both legal directions and mortgage interest exactly once',()=>{
 let s=setup();s.assets[1].owner=0;s.assets[1].mortgaged=true;s=act(s,0,'OFFER',{trade:{to:1,give:[1],take:[],giveCash:500,takeCash:200,giveCards:0,takeCards:0}});let done=act(s,1,'TRADE_ACCEPT');assertLedger(s,done);assert.equal(done.assets[1].owner,1);const fee=act(done,1,'MORTGAGE_KEEP');assertLedger(done,fee);assert.equal(fee.log.find(e=>e.finance?.length).finance[0].kind,'interest');assert.equal(done.log.find(e=>e.type==='trade'&&e.finance).finance.length,2);
});
for(const deck of ['chance','community'])for(const positive of [true,false])test(`${deck} ${positive?'income':'expense'} card effects retain exact finance and deduplicate ACK`,()=>{
 const {state}=landCard(deck,c=>positive?c.money>0:c.money<0);const done=act(state,0,'ACK',{id:'card-ack'});assertLedger(state,done);assert.equal(act(done,0,'ACK',{id:'card-ack'}),done);assert(done.log.some(e=>e.finance?.some(t=>t.card?.deck===deck)));
});
test('multi-player card collections and bankruptcy liquidation match all actual balances',()=>{
 const {state}=landCard('community',c=>!!c.each,4),done=act(state,0,'ACK');assertLedger(state,done);
 let s=setup(3);s.assets[1].owner=0;s.assets[1].level=1;s.bank=stock(s);s.players[0].cash=100;s.phase='debt';s.debt={from:0,to:1,amount:100000,label:'Rent'};const bankrupt=act(s,0,'BANKRUPT');assertLedger(s,bankrupt);assert(bankrupt.players[0].out);
 const event=bankrupt.log.find(e=>e.type==='bankrupt');assert.equal(event.finance.length,2);assert(financeRows(event,bankrupt.players).some(r=>r.player===1&&r.amount>0));
});
test('every ledger matches committed cash throughout a deterministic complete-game simulation',()=>{
 let seed=713,r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},s=createGame({players:Array.from({length:4},(_,id)=>({name:'P'+id,controller:'bot'}))},r),moves=0;
 for(;moves<800&&s.phase!=='won';moves++){const id=decisionActor(s),a=chooseBot(s,id),next=command(s,id,a,r);assertLedger(s,next);s=next;}assert(moves>50);
});
test('pawn occupancy is deterministic, bounded and non-overlapping for every orientation and 1–6 players',()=>{
 for(let tile=0;tile<40;tile++)for(let n=1;n<=6;n++){
  const r=tileRect(tile),points=Array.from({length:n},(_,i)=>pawnSlot(tile,i,n));assert.deepEqual(points,Array.from({length:n},(_,i)=>pawnSlot(tile,i,n)));
  for(const p of points){assert(p.x-p.size/2>=r.x&&p.x+p.size/2<=r.x+r.width);assert(p.y-p.size/2>=r.y&&p.y+p.size/2<=r.y+r.height)}
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)assert(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=(points[i].size+points[j].size)/2-.01);
 }
});
test('movement uses actual forward/backward paths and has momentum at intermediate squares',()=>{
 const points=pawnRoute({id:1,player:0,from:39,path:[0,1,2]});assert.equal(points.length,4);const step=pawnStepTiming(3),before=samplePawnRoute(points,step-1,step),after=samplePawnRoute(points,step+1,step);assert(Math.hypot(before.x-after.x,before.y-after.y)>0.5);assert(samplePawnRoute(points,step*3,step).done);assert(pawnStepTiming(12)*12<=1800);assert(pawnStepTiming(12,{fast:true})*12<=1100);assert.equal(pawnRoute({jump:true,player:0,path:[10]}).length,0);
});
test('reduced motion and fast mode keep the same event order and never call an engine action',()=>{
 const s=setup(),done=act(s,0,'ROLL',{},[1,2]),m=ingestTimeline(ingestTimeline(null,s),done),before=JSON.stringify(done);for(const step of m.queue){assert(stepDuration(step,{reduced:true})>=0);assert(stepDuration(step,{fast:true})>=0)}assert.deepEqual(drain(m).model.view,done);assert.equal(JSON.stringify(done),before);
});

function swFixture(){const handlers={},deleted=[],cached=new Map(),writes=[],network=[];const context={self:{location:{origin:'https://game.test'},clients:{claim:async()=>{}},skipWaiting(){},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({add:async()=>{},match:async key=>cached.get(typeof key==='string'?key:key.url),put:async(k,v)=>{writes.push(k);cached.set(typeof k==='string'?k:k.url,v)}}),keys:async()=>['nusantara-v211','nusantara-v450','other-app-cache'],delete:async k=>deleted.push(k),match:async key=>cached.get(typeof key==='string'?key:key.url)},URL,Response,fetch:async request=>{network.push(typeof request==='string'?request:request.url);return new Response('fresh')}};runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);return {handlers,deleted,cached,writes,network,context};}
test('PWA only retires old UI caches and never clears matches or another app cache',async()=>{const f=swFixture();let done;f.handlers.activate({waitUntil:p=>done=p});await done;assert.deepEqual(f.deleted,['nusantara-v211']);assert(!readFileSync(new URL('../public/sw.js',import.meta.url),'utf8').includes('indexedDB.deleteDatabase'));});
test('PWA refreshes unhashed JS, keeps immutable hashes, and never caches API/Auth requests',async()=>{
 const f=swFixture();f.cached.set('https://game.test/app.js',new Response('stale'));let result;f.handlers.fetch({request:new Request('https://game.test/app.js'),waitUntil:()=>{},respondWith:p=>result=p});assert.equal(await (await result).text(),'fresh');assert.equal(f.network.length,1);
 f.cached.set('https://game.test/assets/main-abcdef12.js',new Response('hashed'));f.handlers.fetch({request:new Request('https://game.test/assets/main-abcdef12.js'),waitUntil:()=>{},respondWith:p=>result=p});assert.equal(await(await result).text(),'hashed');assert.equal(f.network.length,1);
 for(const path of ['/api/online','/api/bot','/signin','/callback','/signin-with-chatgpt','/signout-with-chatgpt']){let intercepted=false;f.handlers.fetch({request:new Request('https://game.test'+path),respondWith:()=>intercepted=true});assert.equal(intercepted,false)}
});
for(const n of [2,4,6])test(`actual room service distributes revealed card and ledger to ${n} members and refuses observer ACK`,async()=>{
 const {createOnlineService}=await import('../lib/server/online-service.mjs'),{MemoryOnlineStore}=await import('./helpers/online-store.mjs');
 const store=new MemoryOnlineStore(),service=createOnlineService({store,clock:()=>1000000,rng:()=>.2,generateCode:()=> 'ABCDEFGH'}),users=Array.from({length:n},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const call=(i,type,data={})=>service.execute({type,code:'ABCDEFGH',clientId:`client-${i}`,requestId:data.action?.id||crypto.randomUUID(),...data},users[i]);
 await call(0,'CREATE',{capacity:n});for(let i=1;i<n;i++)await call(i,'JOIN');for(let i=0;i<n;i++)await call(i,'READY',{ready:true});await call(0,'START');
 const row=await store.get('ABCDEFGH');row.data.state=setup(n);row.data.state.players[0].pos=3;card(row.data.state,'chance',c=>c.money>0);await store.commit(row,row.data);
 const before=await Promise.all(users.map(id=>service.read('ABCDEFGH',id)));const rolled=await call(0,'ACTION',{action:{type:'ROLL',id:crypto.randomUUID(),expectedVersion:0}});assert.equal(rolled.state.phase,'card');
 const views=await Promise.all(users.map(id=>service.read('ABCDEFGH',id)));const events=views.map((v,i)=>ingestTimeline(ingestTimeline(null,before[i].state),v.state).queue.find(x=>x.event?.card).event);assert(events.every(e=>e.id===events[0].id));
 await assert.rejects(call(1,'ACTION',{action:{type:'ACK',id:crypto.randomUUID(),expectedVersion:rolled.state.version}}));
 const action={type:'ACK',id:crypto.randomUUID(),expectedVersion:rolled.state.version};const paid=await call(0,'ACTION',{action});const replay=await call(0,'ACTION',{action});assert.equal(paid.state.version,replay.state.version);assertLedger(rolled.state,paid.state);
 const finalViews=await Promise.all(users.map(id=>service.read('ABCDEFGH',id)));assert(finalViews.every(v=>JSON.stringify(v.state.log)===JSON.stringify(paid.state.log)));
});
test('private events and strategic memory never become public presentation payloads',()=>{
 const s=setup();s.botMemory={players:{1:{privatePlan:'test'}}};s.log.unshift({id:++s.eventId,turn:1,type:'card',audience:'private',text:'private test'});const view=publicState(s);assert(!view.botMemory);assert(!view.log.some(e=>e.audience==='private'));
});
test('visual transaction IDs stay identical when clients receive split versus coalesced revisions',()=>{
 let s=setup();s.phase='buy';s.buy=1;const a=act(s,0,'BUY');const b=act(a,0,'END');
 const split=ingestTimeline(ingestTimeline(ingestTimeline(null,s),a),b),together=ingestTimeline(ingestTimeline(null,s),b);
 assert.deepEqual(split.queue.filter(x=>x.finance).map(x=>x.id),together.queue.filter(x=>x.finance).map(x=>x.id));
});
test('extra doubles rolls remain distinct, and the third double has one direct jail presentation',()=>{
 const initial=setup();let s=act(initial,0,'ROLL',{},[2,2]);assert(s.extra&&s.phase==='roll');s=act(s,0,'ROLL',{},[2,2]);s=act(s,0,'BUY');s=act(s,0,'ROLL',{},[2,2]);assert.equal(s.players[0].inJail,true);
 const m=ingestTimeline(ingestTimeline(null,initial),s),rolls=m.queue.filter(x=>x.kind==='diceRolling');assert.equal(rolls.length,3);assert.equal(new Set(rolls.map(x=>x.id)).size,3);assert.equal(m.queue.filter(x=>x.event?.type==='jail').length,1);assert.equal(m.queue.filter(x=>x.move?.jump&&x.kind==='pawnMoving').length,1);
});
test('two concurrent room roll requests cannot both commit, even when the first earns an extra roll',async()=>{
 const {createOnlineService}=await import('../lib/server/online-service.mjs'),{MemoryOnlineStore}=await import('./helpers/online-store.mjs');const store=new MemoryOnlineStore(),service=createOnlineService({store,clock:()=>1000000,rng:()=>.2,generateCode:()=> 'ABCDEFGH'}),users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const call=(i,type,data={})=>service.execute({type,code:'ABCDEFGH',clientId:`double-${i}`,requestId:data.action?.id||crypto.randomUUID(),...data},users[i]);await call(0,'CREATE');await call(1,'JOIN');await call(0,'READY',{ready:true});await call(1,'READY',{ready:true});await call(0,'START');const row=await store.get('ABCDEFGH');row.data.state=setup();await store.commit(row,row.data);
 const race=await Promise.allSettled([call(0,'ACTION',{action:{type:'ROLL',id:crypto.randomUUID(),expectedVersion:0}}),call(0,'ACTION',{action:{type:'ROLL',id:crypto.randomUUID(),expectedVersion:0}})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);const final=(await service.read('ABCDEFGH',users[0])).state;assert.equal(final.version,1);assert.equal(final.phase,'roll');assert.equal(final.log.filter(e=>e.type==='dice').length,1);
});
test('PWA offline navigation restores cached shell without touching persistent saves',async()=>{const f=swFixture();f.cached.set('/',new Response('cached game shell'));f.context.fetch=async()=>{throw Error('offline')};let result;f.handlers.fetch({request:{method:'GET',url:'https://game.test/',mode:'navigate'},waitUntil:()=>{},respondWith:p=>result=p});assert.equal(await(await result).text(),'cached game shell');});
test('release marker and package version agree for v4.5',async()=>{const {APP_VERSION,APP_RELEASE}=await import('../lib/version.mjs');assert.equal(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version,APP_VERSION);assert.equal(APP_RELEASE,'Board & Gameplay Experience');});
test('background clients baseline incoming snapshots and do not replay them on return',()=>{const s=setup(),next=act(s,0,'ROLL',{},[1,2]);let m=ingestTimeline(null,s,{enabled:false});m=ingestTimeline(m,next,{enabled:false});assert.equal(m.queue.length,0);m=ingestTimeline(m,next,{enabled:true});assert.equal(m.queue.length,0);assert.deepEqual(m.view,next);});
test('a previously displayed card cannot ACK a later reveal with the same card and player',()=>{const {before,state}=landCard('chance',c=>c.money>0),model=ingestTimeline(ingestTimeline(null,before),state),event=model.queue.find(x=>x.event?.card).event,later=structuredClone(state);later.log.unshift({...later.log.find(e=>e.type==='card'),id:++later.eventId});later.version++;assert.equal(liveCardDecision(event,later,0),false);});

test('asset cache quota failures do not replace a successful network response with a stale page',async()=>{const f=swFixture();f.context.caches.open=async()=>{throw Error('quota')};let result;f.handlers.fetch({request:new Request('https://game.test/app.js'),waitUntil:()=>{},respondWith:p=>result=p});assert.equal(await(await result).text(),'fresh');});
