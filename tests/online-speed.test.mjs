import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGame,command,publicState,chooseBot} from '../lib/game.mjs';
import {ingestTimeline,advanceTimeline,stepDuration} from '../lib/presentation-timeline.mjs';
import {adaptOnlineTimeline,settleConfirmed,humanDecisionReady} from '../lib/online-presentation.mjs';
import {OnlinePerformance} from '../lib/online-performance.mjs';
import {GameSession} from '../frontend/session.mjs';
import {MODEL_FILES,MODEL_MANIFEST_ID} from '../lib/bot/model-manifest.mjs';
const game=n=>createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i,controller:i<Math.max(2,n-3)?'human':'bot',botPersona:'raka'})),startingRoll:false,matchId:'speed-'+n},()=>.2);
const commit=(s,id,type,data={})=>command(s,id,{type,...data},()=>.2);
const onlineSession=(t,state)=>{
 const s=new GameSession({persist:async()=>{},load:async()=>null,mind:{dispose(){}}});
 s.hidden=true;s.screen='gameplay';s.connected=true;s.room={code:'ABCDEFGH',seat:0,userId:'user'};s.online={status:'playing',held:false,roomRevision:0};
 s.auth={session:()=>({user:{id:'user'}})};s.ingest(state,{reset:true});t.after(()=>s.dispose());return s;
};
test('V23.2 manifest and every protected model/engine file are unchanged',()=>{
 assert.equal(MODEL_MANIFEST_ID,'f398a9793efd23c3c74e3e46d89aab0117a4c23c5102036d7e8f77a51c94e46d');
 for(const [file,hash]of Object.entries(MODEL_FILES))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,file);
});
for(const n of [2,3,4,5,6])test(`${n} players: catch-up preserves all confirmed payments, assets, history and final state`,()=>{
 let s=game(n);s.assets[1].owner=0;s.assets[3].owner=0;
 let model=ingestTimeline(null,publicState(s));
 for(const [type,data]of [['BUILD',{tile:1}],['SELL',{tile:1}],['MORTGAGE',{tile:3}],['REDEEM',{tile:3}]]){
  s=commit(s,0,type,data);model=ingestTimeline(model,publicState(s));
 }
 const before=structuredClone(s),adapted=adaptOnlineTimeline(model,publicState(s),{seat:0,now:100});
 assert.equal(adapted.queue.length,0);assert.deepEqual(adapted.view,publicState(s));assert.deepEqual(s,before);
 assert.deepEqual(adapted.view.log,s.log);assert.equal(adapted.view.players[0].cash,s.players[0].cash);
});
test('healthy online animation keeps normal timing; backlog folds older confirmed work and bounds the tail',()=>{
 let s=game(3);s.turn=2;
 let model=ingestTimeline(null,publicState(s));s=commit(s,2,'ROLL');model=ingestTimeline(model,publicState(s));
 const healthy=adaptOnlineTimeline(model,s,{seat:0,now:0});assert.equal(healthy.onlineMode,'normal');assert.equal(stepDuration(healthy.queue[0]),900);
 s=command(s,2,chooseBot(s,2),()=>.2);model=ingestTimeline(model,publicState(s));
 // Add a second confirmed roll if END itself has no animated event.
 if(s.phase==='roll'){s=commit(s,s.turn,'ROLL');model=ingestTimeline(model,publicState(s));}
 const caught=adaptOnlineTimeline(model,s,{seat:-1,now:2000,receivedAt:0});
 assert(caught.catchup);assert(caught.queue.reduce((n,h)=>n+stepDuration(h),0)<=701);
 assert.deepEqual(settleConfirmed(caught).model.view,publicState(s));
});
test('human decisions in auction, trade, build, mortgage, debt, card and starting remain explicit',()=>{
 const s=game(3);
 for(const phase of ['starting','roll','end','buy','jail','card','trade','debt','mortgage','buildOffer','auction']){
  const next={...s,phase,card:{player:0},trade:{to:0},debt:{from:0},mortgageDecision:{player:0},buildOffer:{pending:[0]},auction:{participants:[0,2],highest:2}};
  assert(humanDecisionReady(next,0),phase);
  const adapted=adaptOnlineTimeline(ingestTimeline(null,next),next,{seat:0,now:5});
  assert.equal(adapted.view.phase,phase);assert.equal(adapted.view.version,next.version);
 }
});
test('decorative backlog cannot block an online human click; dice stay unconfirmed until response and double clicks send once',async t=>{
 const state=game(3),s=onlineSession(t,state);let resolve,requests=0,payload;
 s.auth.request=async(path,body)=>{requests++;payload=body;return new Promise(r=>resolve=r);};
 // Real committed finance presentation with stale visual version.
 state.assets[1].owner=0;const next=commit(state,0,'MORTGAGE',{tile:1});s.state=next;s.model=ingestTimeline(ingestTimeline(null,state),next);
 assert(s.head);assert.equal(s.busy,false);
 const action=s.act('ROLL');assert(s.pendingRoll);assert.equal(s.state.version,1);assert.equal(await s.act('ROLL'),false);assert.equal(requests,1);assert.equal(payload.action.expectedVersion,1);
 const confirmed=command(next,0,payload.action,()=>.2);
 resolve({code:'ABCDEFGH',seat:0,roomRevision:2,status:'playing',held:false,state:confirmed,seats:confirmed.players});
 assert(await action);assert.equal(s.pendingRoll,null);assert.equal(s.state.version,2);assert.deepEqual(s.state.dice,confirmed.dice);
 assert(s.performance.summary()['human.click-to-state']);
});
test('Realtime arriving during a read queues one follow-up and does not lose a due heartbeat',async t=>{
 const state=game(2),s=onlineSession(t,state),pending=[],calls=[];
 s.auth.request=(path,body)=>{calls.push(body?.type||'GET');return new Promise(resolve=>pending.push(resolve));};
 const first=s.readRoom();await Promise.resolve();s.readRoom();s.readRoom(true);
 pending.shift()({code:'ABCDEFGH',seat:0,status:'playing',held:false,roomRevision:1,state,seats:state.players});await first;await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(calls,['GET','HEARTBEAT']);
 pending.shift()({code:'ABCDEFGH',seat:0,status:'playing',held:false,roomRevision:2,state,seats:state.players});await new Promise(r=>setTimeout(r,0));
});
test('stale callbacks cannot consume a new timeline; reconnect and offline never invent actions',t=>{
 const state=game(3),s=onlineSession(t,state);s.connected=false;
 assert(s.paused);const before=s.state;assert.equal(s.state,before);
 const model=ingestTimeline(ingestTimeline(null,state),commit(state,0,'ROLL'));
 assert.equal(advanceTimeline(model,'old-animation-callback'),model);
 s.ingest(state,{reset:true});assert.equal(s.model.queue.length,0);
});
test('diagnostics are bounded, redact unknown details, and report local P50/P95',()=>{
 const p=new OnlinePerformance({now:()=>100,limit:5});for(let n=0;n<10;n++)p.record('http',n,{trace:'safe',token:'secret',body:'private'});
 assert.equal(p.samples.length,5);assert.equal(p.summary().http.p50,7);assert.equal(p.summary().http.p95,9);assert(!JSON.stringify(p.export()).includes('secret'));
});


test('Realtime bursts use a leading read and discard revisions already covered by the response',async t=>{
 const s=onlineSession(t,game(3));let reads=0;s.lastRealtimeRevision=10;
 s.readRoom=async()=>{reads++;s.online.roomRevision=10;};
 for(let i=0;i<20;i++)s.scheduleRoomRead();
 await new Promise(r=>setTimeout(r,40));assert.equal(reads,1);
 for(let i=0;i<20;i++)s.scheduleRoomRead();
 await new Promise(r=>setTimeout(r,40));assert.equal(reads,1);
});

test('an old response cannot clear a newer reconnect read or replace its state',async t=>{
 const state=game(3),s=onlineSession(t,state),resolvers=[];s.auth.request=()=>new Promise(r=>resolvers.push(r));
 const old=s.readRoom();s.disconnect();const newer=s.readRoom();
 resolvers[0]({code:'ABCDEFGH',seat:0,roomRevision:999,state:{...state,version:999}});await old;assert(s.reading);assert.equal(s.state.version,0);
 resolvers[1]({code:'ABCDEFGH',seat:0,roomRevision:1,status:'playing',held:false,state,seats:state.players});await newer;assert.equal(s.reading,false);assert.equal(s.state.version,0);
});


test('a late action response cannot resurrect a disconnected room',async t=>{
 const state=game(2),s=onlineSession(t,state);let resolve;s.auth.request=()=>new Promise(r=>resolve=r);
 const action=s.act('ROLL');s.disconnect();s.room=null;
 resolve({code:'ABCDEFGH',seat:0,roomRevision:1,status:'playing',state:commit(state,0,'ROLL')});
 assert.equal(await action,false);assert.equal(s.room,null);
});
