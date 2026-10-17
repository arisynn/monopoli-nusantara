import test from 'node:test';import assert from 'node:assert/strict';
import {createGame} from '../lib/game.mjs';
import {decideMind} from '../lib/bot/mind.mjs';
import {LEARNED_MODEL} from '../lib/bot/learned-model.mjs';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {runBotWorker} from '../lib/server/bot-worker.mjs';
import {BotJobStore} from './helpers/bot-job-store.mjs';
async function room(){
 const clock=()=>1000000,store=new BotJobStore(clock),service=createOnlineService({store,clock,botsEnabled:true,generateCode:()=> 'ABCDEFGH',rng:()=>.2}),users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const call=(i,type,data={})=>service.execute({type,clientId:'connection-'+i,code:'ABCDEFGH',requestId:data.action?.id||crypto.randomUUID(),...data},users[i]);
 await call(0,'CREATE',{name:'Ayu'});await call(1,'JOIN',{name:'Budi'});await call(0,'ADD_BOT',{difficulty:'hardcore'});await call(0,'READY',{ready:true});await call(1,'READY',{ready:true});await call(0,'START');
 const row=await store.get('ABCDEFGH');row.data.state=createGame({players:row.data.seats,startingRoll:false},()=>.2);row.data.state.turn=2;row.data.state.phase='buy';row.data.state.buy=19;row.data.state.assets[6].owner=0;await store.commit(row,row.data,{notify:true});
 return {store,clock,call};
}
const advise=s=>({action:decideMind(s,2,{difficulty:'hardcore',learningModel:LEARNED_MODEL,allowCandidateModel:true,maxNodes:100,timeBudgetMs:80}).action,status:'local',comment:null});
test('trained-model recommendation uses the existing backend lease and cannot double-commit concurrent work',async()=>{
 const {store,clock}=await room();let release,entered;
 const started=new Promise(r=>entered=r),pending=new Promise(r=>release=r);
 const first=runBotWorker({store,clock,maxSteps:1,decide:async s=>{const result=advise(s);entered();await pending;return result;}});await started;
 const second=await runBotWorker({store,clock,maxSteps:1});assert.equal(second.committed,0);release();assert.equal((await first).committed,1);assert.equal((await store.get('ABCDEFGH')).data.state.version,1);
});
test('pause committed during learned-model work discards the recommendation and preserves pending purchase',async()=>{
 const {store,clock,call}=await room();
 const r=await runBotWorker({store,clock,maxSteps:1,decide:async s=>{const result=advise(s);await call(0,'PAUSE_REQUEST');const v=(await store.get('ABCDEFGH')).data.vote;await call(1,'VOTE',{voteId:v.id,agree:true});return result;}});
 const saved=(await store.get('ABCDEFGH')).data;assert.equal(r.committed,0);assert.equal(r.discarded,1);assert.equal(saved.status,'paused');assert.equal(saved.state.phase,'buy');assert.equal(saved.state.version,0);
});
test('revision changed during learned-model work is discarded and a fresh worker can recover once',async()=>{
 const {store,clock,call}=await room();
 const stale=await runBotWorker({store,clock,maxSteps:1,decide:async s=>{const result=advise(s);await call(0,'ACTION',{action:{type:'MORTGAGE',tile:6,id:crypto.randomUUID(),expectedVersion:s.version}});return result;}});
 assert.equal(stale.committed,0);assert.equal(stale.discarded,1);assert.equal((await store.get('ABCDEFGH')).data.state.version,1);
 const fresh=await runBotWorker({store,clock,maxSteps:1,decide:async s=>advise(s)});assert.equal(fresh.committed,1);assert.equal((await store.get('ABCDEFGH')).data.state.version,2);
});
