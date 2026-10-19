import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import * as before from '../benchmarks/online-speed-4112/presentation-timeline.mjs';
import * as after from '../lib/presentation-timeline.mjs';
import {adaptOnlineTimeline,settleConfirmed} from '../lib/online-presentation.mjs';
import {percentile} from '../lib/online-performance.mjs';
import {createGame,command,chooseBot,decisionActor,publicState} from '../lib/game.mjs';
import {createTermuxService} from '../lib/server/termux-worker.mjs';
import {speedFixture} from '../tests/helpers/speed-fixture.mjs';
import {MODEL_MANIFEST_ID} from '../lib/bot/model-manifest.mjs';
const stats=v=>({count:v.length,p50:percentile(v,.5),p95:percentile(v,.95),max:Math.max(0,...v)});
function fixtures(n){
 let seed=20261019+n;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let s=createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i,controller:i<Math.max(2,n-3)?'human':'bot',botPersona:'raka'})),startingRoll:false,matchId:'speed-benchmark-'+n},rng);
 s.assets[1].owner=0;s.assets[3].owner=0;const states=[publicState(s)];
 for(const action of [{type:'BUILD',tile:1},{type:'SELL',tile:1},{type:'MORTGAGE',tile:3},{type:'REDEEM',tile:3}]){s=command(s,0,action,rng);states.push(publicState(s));}
 while(states.length<=174&&s.phase!=='won'){const actor=decisionActor(s),action=chooseBot(s,actor);assert(action);s=command(s,actor,action,rng);states.push(publicState(s));}
 return states;
}
function replay(states,optimized){
 const api=optimized?after:before,duration=h=>api.stepDuration(h)+(!optimized&&h.kind==='pawnMoving'?300:!optimized&&h.event?Math.max(0,3200-api.stepDuration(h)):0);
 let model=api.ingestTimeline(null,states[0]),now=0,headId=null,deadline=0,recoveries=0;
 const received=new Map(),visible=[],lag=[],depth=[],gate=[];
 const measure=()=>{for(const [v,t]of received)if(v<=model.view.version){visible.push(now-t);received.delete(v);}};
 const arm=()=>{const h=model.queue[0];if(!h){headId=null;deadline=Infinity;}else if(h.id!==headId){headId=h.id;deadline=now+duration(h);}else deadline=Math.min(deadline,now+duration(h));};
 const until=t=>{arm();let count=0;while(model.queue.length&&deadline<=t){now=deadline;model=api.advanceTimeline(model,model.queue[0].id);measure();arm();assert(++count<10000);}now=t;};
 for(let i=1;i<states.length;i++){
  until(i*760);received.set(states[i].version,now);const prev=model;
  model=api.ingestTimeline(model,states[i]);
  if(model.recovered&&!model.queue.length&&prev.queue.length)recoveries++;
  if(optimized)model=adaptOnlineTimeline(model,states[i],{seat:-1,now,receivedAt:now});
  measure();arm();lag.push(Math.max(0,now-model.view.version*760));depth.push(model.queue.length);
  gate.push(optimized?0:model.queue.reduce((n,h)=>n+duration(h),0));
 }
 until(now+1000000);assert.deepEqual(model.view,states.at(-1));assert.equal(received.size,0);
 const folded=settleConfirmed(model);assert.deepEqual(folded.model.view,states.at(-1));
 return {receiptToVisibleMs:stats(visible),visualAgeAtReceiptMs:stats(lag),decorativeInputWaitMs:stats(gate),queueDepth:stats(depth),overflowResets:recoveries,finalLedgerAndHistoryIdentical:true};
}
const presentations=[];
for(const players of [2,3,4,5,6]){const states=fixtures(players);presentations.push({players,commits:states.length-1,before:replay(states,false),after:replay(states,true)});}
const backend={};
for(const fast of [false,true]){
 const elapsed=[],calls=[];
 for(let i=0;i<18;i++){
  const f=await speedFixture({fast,delayMs:8}),service=createTermuxService({store:f.wrapped,clock:f.clock,rng:()=>.2});
  const start=performance.now(),{job}=await service.execute(f.body('claim'),f.token);assert(job);
  assert((await service.execute(f.body('submit',{job,commandId:crypto.randomUUID(),action:{type:'ROLL'}}),f.token)).ok);
  elapsed.push(performance.now()-start);calls.push(f.calls.length);
 }
 backend[fast?'after':'before']={claimAndSubmitMs:stats(elapsed),databaseRoundTrips:stats(calls)};
}
const report={version:'4.11.3',manifest:MODEL_MANIFEST_ID,userReportedBaseline:{room:'XKL5BY56',botActions:174,uninterruptedIntervals:134,medianCommitIntervalMs:760,p90Ms:960,maxMs:3500,source:'User report; live logs were not accessible in this environment'},method:{presentation:'Deterministic virtual-clock replay of confirmed engine states at 760 ms/commit; frozen 4.11.2 timeline vs adaptive 4.11.3. Includes all settlements and full ledger equality. Observer mode separates visual backlog from a particular seat decision.',backend:'Actual service calls with contract store and controlled 8 ms delay per database round trip; legacy 4.11.2-compatible RPC sequence vs batch RPC sequence. No AI or WAN delay in this measurement.'},presentations,backend,limits:['These are reproducible controlled benchmarks, not production Vercel/Supabase latency or a reproduction of the private match trace.','Physical Android, live WAN, hosted Auth/Realtime, thermal load and device rendering require field measurements.','Decorative input wait is queue gating only; actual clicks still pay Auth/network/commit latency.']};
await mkdir('docs/audits',{recursive:true});await writeFile('docs/audits/ONLINE_SPEED_BENCHMARK.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({backend,presentation:presentations.map(x=>({players:x.players,beforeP95:x.before.receiptToVisibleMs.p95,afterP95:x.after.receiptToVisibleMs.p95}))},null,2));
