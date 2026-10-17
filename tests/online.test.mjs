import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {DISCONNECT_MS, LEASE_MS} from '../lib/server/online-room.mjs';
import {createGame, command, chooseBot, decisionActor} from '../lib/game.mjs';
import {MemoryOnlineStore} from './helpers/online-store.mjs';
const users = Array.from({length: 8}, (_, i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function fixture(n=2) {
 let now=1000000, codeCounter=0;
 const store=new MemoryOnlineStore(), service=createOnlineService({store,clock:()=>now,rng:()=>.2,generateCode:()=>`ABCDEFG${'HJKLMNPQ'[codeCounter++]}`});
 const body=(i,type,data={})=>({type,clientId:`connection-${i}`,requestId:crypto.randomUUID(),...data});
 const createdBody=body(0,'CREATE',{name:'Same name',capacity:n}), created=await service.execute(createdBody,users[0]);
 const code=created.code;
 const call=(i,type,data={})=>service.execute(body(i,type,{code,...data}),users[i]);
 for(let i=1;i<n;i++)await call(i,'JOIN',{name:'Same name'});
 for(let i=0;i<n;i++)await call(i,'READY',{ready:true});
 await call(0,'START');
 // Gameplay phase fixtures are changed by tests directly, never through a production API.
 store.edit(code,r=>{r.state=createGame({players:r.seats,startingRoll:false},()=>.2)});
 const action=(i,type,data={})=>{const id=crypto.randomUUID();return call(i,'ACTION',{requestId:id,action:{type,id,expectedVersion:store.rooms.get(code).data.state.version,...data}})};
 const view=i=>service.read(code,users[i]);
 const beats=async()=>{for(let i=0;i<n;i++)await call(i,'HEARTBEAT')};
 const votePause=async()=>{await call(0,'PAUSE_REQUEST');for(let i=1;i<Math.floor(n/2)+1;i++)await call(i,'VOTE',{voteId:store.rooms.get(code).data.vote.id,agree:true})};
 return {store,service,body,createdBody,code,call,view,action,beats,votePause,advance:ms=>{now+=ms},now:()=>now};
}
for(const n of [2,3,4,5,6])test(`pause majority ${Math.floor(n/2)+1}/${n}, offline electorate retained`,async()=>{
 const f=await fixture(n);await f.call(0,'PAUSE_REQUEST');
 const v=f.store.rooms.get(f.code).data.vote;assert.equal(v.eligible.length,n);
 for(let i=1;i<Math.floor(n/2);i++){await f.call(i,'VOTE',{voteId:v.id,agree:true});assert.equal((await f.view(0)).status,'playing')}
 await f.call(Math.floor(n/2),'VOTE',{voteId:v.id,agree:true});assert.equal((await f.view(0)).status,'paused');
});
test('persistent Auth seat rejoin works after start, duplicate tabs and host loss never move seats',async()=>{
 const f=await fixture(3);const row=f.store.rooms.get(f.code);const match=row.data.state.matchId;
 const rejoin=await f.call(1,'JOIN',{clientId:'another-device-1',name:'Stolen display name'});assert.equal(rejoin.seat,1);assert.equal(rejoin.seats.length,3);
 f.advance(LEASE_MS+1);await f.call(2,'HEARTBEAT');const v=await f.view(2);assert.equal(v.host,2);assert.equal(v.state.matchId,match);assert.equal(v.seat,2);
 assert.equal((await f.call(0,'JOIN')).seat,0);assert.equal(f.store.rooms.get(f.code).data.seats[0].userId,users[0]);
});
test('non-members cannot read, mutate or take a seat by display name after start',async()=>{
 const f=await fixture();await assert.rejects(f.service.read(f.code,users[6]),/Bukan peserta/);
 const id=crypto.randomUUID();await assert.rejects(f.call(6,'ACTION',{requestId:id,action:{type:'ROLL',id,expectedVersion:0}}),/Bukan peserta/);
 await assert.rejects(f.call(6,'JOIN',{name:'Same name'}),/sudah dimulai/);
});
test('concurrent purchases commit once; same command receipt returns current snapshot',async()=>{
 const f=await fixture();f.store.edit(f.code,r=>{r.state.phase='buy';r.state.buy=1});
 const id=crypto.randomUUID(), body=f.body(0,'ACTION',{code:f.code,requestId:id,action:{type:'BUY',id,expectedVersion:0}});
 const other={...body,requestId:crypto.randomUUID()};other.action={...body.action,id:other.requestId};
 const results=await Promise.allSettled([f.service.execute(body,users[0]),f.service.execute(other,users[0])]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const winner=results[0].status==='fulfilled'?body:other;
 const retry=await f.service.execute(winner,users[0]);assert.equal(retry.state.players[0].cash,14400);assert.equal(retry.state.assets[1].owner,0);assert.equal(retry.state.version,1);
 await assert.rejects(f.service.execute({...winner,action:{...winner.action,type:'ROLL'}},users[0]),/isi berbeda/);
});
test('concurrent duplicate creates and duplicate joins keep one room and one seat',async()=>{
 const store=new MemoryOnlineStore();let i=0;
 const s=createOnlineService({store,generateCode:()=>`ABCDEFG${'HJKLMN'[i++]}`});
 const b={type:'CREATE',clientId:'browser-tab-one',requestId:crypto.randomUUID(),capacity:6,name:'Ayu'};
 const both=await Promise.all([s.execute(b,users[0]),s.execute(b,users[0])]);assert.equal(both[0].code,both[1].code);assert.equal(store.rooms.size,1);
 const j={type:'JOIN',code:both[0].code,clientId:'browser-tab-two',requestId:crypto.randomUUID(),name:'Budi'};
 const joined=await Promise.all([s.execute(j,users[1]),s.execute({...j,requestId:crypto.randomUUID()},users[1])]);assert(joined.every(x=>x.seat===1));assert.equal(store.rooms.get(j.code).data.seats.length,2);
});
test('simultaneous final seat join respects capacity',async()=>{
 const f=await fixture(2);f.store.edit(f.code,r=>{r.status='waiting';r.state=null;r.capacity=3});
 const result=await Promise.allSettled([f.call(2,'JOIN',{name:'Dina'}),f.call(3,'JOIN',{name:'Eka'})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.store.rooms.get(f.code).data.seats.length,3);
});
test('forged dice, balances, bot commands, wrong actor and stale revision are rejected',async()=>{
 const f=await fixture();for(const data of [{dice:[6,6]},{cash:999999},{expectedVersion:99}])await assert.rejects(f.action(0,'ROLL',data));
 await assert.rejects(f.action(1,'ROLL'),/Belum waktunya/);await assert.rejects(f.call(0,'AI'),/tidak dikenal/);
 assert.equal((await f.view(0)).state.version,0);const rolled=await f.action(0,'ROLL');assert.deepEqual(rolled.state.dice,[2,2]);
});
test('duplicate trade accept does not transfer cash or assets twice',async()=>{
 const f=await fixture();f.store.edit(f.code,r=>{r.state.assets[1].owner=0});
 await f.action(0,'OFFER',{trade:{to:1,give:[1],take:[],giveCash:0,takeCash:100,giveCards:0,takeCards:0}});
 const id=crypto.randomUUID(), b=f.body(1,'ACTION',{code:f.code,requestId:id,action:{type:'TRADE_ACCEPT',id,expectedVersion:1}});
 const values=await Promise.all([f.service.execute(b,users[1]),f.service.execute(b,users[1])]);
 assert(values.every(v=>v.state.players[0].cash===15100));assert.equal(f.store.rooms.get(f.code).data.state.assets[1].owner,1);
 await assert.rejects(f.action(1,'TRADE_ACCEPT'));assert.equal((await f.view(0)).state.players[1].cash,14900);
});
test('lost connection immediately holds critical decisions after lease detection and reconnect under 90s keeps phase',async()=>{
 const f=await fixture(3);const before=structuredClone(f.store.rooms.get(f.code).data.state);
 f.advance(LEASE_MS+1);await f.call(0,'HEARTBEAT');await assert.rejects(f.action(0,'ROLL'),/ditahan/);
 assert.equal((await f.view(0)).held,true);f.advance(10000);await f.beats();
 const after=await f.view(0);assert.equal(after.status,'playing');assert.equal(after.held,false);assert.deepEqual(after.state.players,before.players);assert.equal(after.state.phase,before.phase);
});
test('all clients offline overnight auto-pauses BEFORE returning heartbeat, full snapshot survives service restart',async()=>{
 const f=await fixture();f.store.edit(f.code,r=>{r.state.players[0].cash=12345;r.state.assets[1].owner=0});
 const snapshot=structuredClone(f.store.rooms.get(f.code).data.state);f.advance(86400000);
 const s=createOnlineService({store:f.store,clock:f.now});const result=await s.execute(f.body(0,'HEARTBEAT',{code:f.code}),users[0]);
 assert.equal(result.status,'paused');assert.equal(result.pause.reason,'disconnect');assert.equal(result.pause.at,1000000+DISCONNECT_MS);
 const full=f.store.rooms.get(f.code).data.state;assert.deepEqual(full,snapshot);assert.equal(result.state.players[0].cash,12345);assert.equal(result.state.assets[1].owner,0);
});
test('a rejected stale gameplay command still persists overdue auto-pause',async()=>{
 const f=await fixture();f.advance(DISCONNECT_MS+1);await assert.rejects(f.action(0,'ROLL'),/dijeda/);assert.equal(f.store.rooms.get(f.code).data.status,'paused');
});
test('one live tab keeps the same seat online when another tab disappears',async()=>{
 const f=await fixture();await f.call(0,'HEARTBEAT',{clientId:'other-browser-tab'});f.advance(30000);await f.call(0,'HEARTBEAT',{clientId:'other-browser-tab'});await f.call(1,'HEARTBEAT');f.advance(15000);
 const v=await f.view(1);assert.equal(v.seats[0].connected,true);assert.equal(v.held,false);
});
test('offline voters keep their vote entitlement, expired votes cannot pass, duplicate votes rejected',async()=>{
 const f=await fixture(3);await f.call(0,'PAUSE_REQUEST');let v=(await f.view(0)).vote;
 await assert.rejects(f.call(0,'VOTE',{voteId:v.id,agree:true}),/sudah tercatat/);
 f.advance(40000);const offline=await f.view(0);assert.equal(offline.vote.eligible.length,3);assert.equal(offline.seats[1].connected,false);
 f.advance(21000);await assert.rejects(f.call(1,'VOTE',{voteId:v.id,agree:true}),/tidak lagi/);assert.equal((await f.view(0)).vote.status,'expired');assert.equal((await f.view(0)).status,'playing');
});
test('concurrent pause requests create one open vote; impossible majority rejects and spam is limited',async()=>{
 const f=await fixture(3);const results=await Promise.allSettled([f.call(0,'PAUSE_REQUEST'),f.call(1,'PAUSE_REQUEST')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const v=(await f.view(0)).vote;for(const i of [0,1,2].filter(i=>i!==v.requestedBy))await f.call(i,'VOTE',{voteId:v.id,agree:false});
 assert.equal((await f.view(0)).vote.status,'rejected');await assert.rejects(f.call(2,'PAUSE_REQUEST'),/Tunggu/);
});
test('bankrupt spectators neither vote, block connection, nor count toward unanimous resume',async()=>{
 const f=await fixture(4);f.store.edit(f.code,r=>{r.state.players[3].out=true;r.seats[3].connections={}});
 await assert.rejects(f.call(3,'PAUSE_REQUEST'),/Spectator/);await f.call(0,'PAUSE_REQUEST');const v=(await f.view(0)).vote;assert.equal(v.eligible.length,3);
 await assert.rejects(f.call(3,'VOTE',{voteId:v.id,agree:true}),/hak suara/);await f.call(1,'VOTE',{voteId:v.id,agree:true});
 const cycle=(await f.view(0)).pause.cycle;for(let i=0;i<3;i++)await f.call(i,'RESUME_READY',{cycle,ready:true});assert.equal((await f.view(0)).status,'playing');
});
test('resume requires every active identity; host cannot force it and ready resets after a disconnect',async()=>{
 const f=await fixture(3);await f.votePause();const cycle=(await f.view(0)).pause.cycle;
 await f.call(0,'RESUME_READY',{cycle,ready:true});await f.call(1,'RESUME_READY',{cycle,ready:true});assert.equal((await f.view(0)).status,'paused');
 f.advance(LEASE_MS+1);await f.call(2,'HEARTBEAT');assert.deepEqual((await f.view(2)).pause.ready,[]);
 await f.call(2,'RESUME_READY',{cycle,ready:true});await f.call(0,'RESUME_READY',{cycle,ready:true});assert.equal((await f.view(0)).status,'paused');
 const resumed=await f.call(1,'RESUME_READY',{cycle,ready:true});assert.equal(resumed.status,'playing');assert.equal(resumed.state.version,0);
 await assert.rejects(f.call(0,'RESUME_READY',{cycle,ready:true}),/Siklus/);
});
test('two concurrent final resume commands are idempotent and preserve the game snapshot',async()=>{
 const f=await fixture();await f.votePause();const cycle=(await f.view(0)).pause.cycle;
 await f.call(0,'RESUME_READY',{cycle,ready:true});const b=f.body(1,'RESUME_READY',{code:f.code,cycle,ready:true});
 const result=await Promise.all([f.service.execute(b,users[1]),f.service.execute(b,users[1])]);assert(result.every(v=>v.status==='playing'));assert.equal(result[0].state.version,0);
});
for(const phase of ['auction','trade','debt','card','jail','mortgage','buildOffer'])test(`pause/restart/resume preserves ${phase}, decks, queue, ownership and phase exactly`,async()=>{
 const f=await fixture();f.store.edit(f.code,r=>{
  const s=r.state;s.phase=phase;s.players[0].inJail=phase==='jail';s.players[0].jail=2;
  s.queue=[{kind:'pay',from:0,to:1,amount:100,label:'Pending'}];s.debt={from:0,to:1,amount:17000,label:'Debt'};
  s.trade={from:0,to:1,give:[1],take:[],giveCash:100,takeCash:0,giveCards:0,takeCards:0,context:{phase:'auction',auction:{amount:400}}};
  s.auction={id:'saved-auction',tile:3,kind:'property',amount:500,highest:0,bidder:1,participants:[0,1],passed:[]};
  s.card={deck:'chance',idx:1,player:0,title:'Pending card'};s.mortgageDecision={player:1,tile:3};s.buildOffer={pending:[1],targets:{0:1},remaining:1,kind:'house'};
 });
 const snapshot=structuredClone(f.store.rooms.get(f.code).data.state);await f.votePause();assert.deepEqual(f.store.rooms.get(f.code).data.state,snapshot);
 const cycle=(await f.view(0)).pause.cycle;await f.call(0,'RESUME_READY',{cycle,ready:true});await f.call(1,'RESUME_READY',{cycle,ready:true});assert.deepEqual(f.store.rooms.get(f.code).data.state,snapshot);
});
test('snapshots and revision hints never include Auth IDs, connections, decks, receipts or seat tokens',async()=>{
 const f=await fixture();const v=await f.view(0);assert(!('decks' in v.state));assert(!('seen' in v.state));assert(!JSON.stringify(v).includes(users[0]));assert(!('connections' in v.seats[0]));assert(!('token' in v.seats[0]));
 assert(f.store.notifications.every(n=>Object.keys(n).sort().join(',')==='code,revision'));
});
test('list finds persistent rooms by identity and reconciles overnight absence',async()=>{
 const f=await fixture();f.advance(86400000);const list=await f.service.list(users[1]);assert.equal(list[0].code,f.code);assert.equal(list[0].status,'paused');assert.deepEqual(await f.service.list(users[6]),[]);
});
test('VS Bot supports one human and one to five bots with the unchanged shared engine',()=>{
 for(let n=2;n<=6;n++){
  let s=createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i,controller:i?'bot':'human'})),startingRoll:false});
  assert.equal(s.players.filter(p=>p.controller==='human').length,1);
  for(let i=0;i<30&&s.phase!=='won';i++){const actor=decisionActor(s),a=chooseBot(s,actor);assert(a);s=command(s,actor,{...a,id:crypto.randomUUID(),expectedVersion:s.version},()=>.21)}
  assert(s.version>0);
 }
});

test('numeric strings and injected trade contexts cannot corrupt ownership types',async()=>{
 const f=await fixture();f.store.edit(f.code,r=>{r.state.assets[1].owner=0});
 const trade={to:1,give:[1],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0};
 for(const patch of [{to:'1'},{give:['1']},{context:{phase:'won'}},{takeCash:'100'},{giveCards:-1}])await assert.rejects(f.action(0,'OFFER',{trade:{...trade,...patch}}));
 assert.equal(f.store.rooms.get(f.code).data.state.assets[1].owner,0);assert.equal((await f.view(0)).state.phase,'roll');
});

test('human names are mandatory when creating and joining a new online seat',async()=>{
 const store=new MemoryOnlineStore(),service=createOnlineService({store,generateCode:()=> 'ABCDEFGH'});
 const b={type:'CREATE',capacity:4,clientId:'browser-one',requestId:crypto.randomUUID()};
 await assert.rejects(service.execute(b,users[0]),/Isi nama pemain/);
 const room=await service.execute({...b,name:'  Sinta   Putri '},users[0]);
 assert.equal(room.seats[0].name,'Sinta Putri');
 await assert.rejects(service.execute({type:'JOIN',code:room.code,clientId:'browser-two',requestId:crypto.randomUUID()},users[1]),/Isi nama pemain/);
 assert.equal((await service.read(room.code,users[0])).seats.length,1);
});

test('participant can rename while playing and paused without rewriting turn, assets, or game version',async()=>{
 const f=await fixture(2);
 const original=(await f.view(0)), turn=original.state.turn, version=original.state.version,
  assets=structuredClone(original.state.assets), match=original.state.matchId;
 const renamed=await f.call(1,'RENAME',{name:'  Ayu    Maharani  '});
 assert.equal(renamed.seats[1].name,'Ayu Maharani');
 assert.equal((await f.view(0)).state.players[1].name,'Ayu Maharani');
 assert.equal(renamed.state.version,version);
 assert.equal(renamed.state.turn,turn);
 assert.equal(renamed.state.matchId,match);
 assert.deepEqual(renamed.state.assets,assets);
 await f.votePause();
 const pause=await f.call(0,'RENAME',{name:'Budi'});
 assert.equal(pause.status,'paused');
 assert.equal(pause.seats[0].name,'Budi');
 assert.equal(pause.state.players[0].name,'Budi');
 assert.equal(pause.pause.ready.length,0);
 // An existing user may reconnect with an outdated name and must not overwrite the chosen name.
 const rejoin=await f.call(0,'JOIN',{name:'Old name'});
 assert.equal(rejoin.seats[0].name,'Budi');
 // Only the identified participant can change their own seat.
 await assert.rejects(f.call(6,'RENAME',{name:'Impersonated'}),/Bukan peserta/);
});
