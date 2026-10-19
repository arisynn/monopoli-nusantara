import test from 'node:test';
import assert from 'node:assert/strict';
import {speedFixture} from './helpers/speed-fixture.mjs';
import {createTermuxService} from '../lib/server/termux-worker.mjs';
import {requestPerformance} from '../lib/server/request-performance.mjs';
test('batched worker path reduces round trips while preserving canonical dice and receipt events',async()=>{
 for(const fast of [false,true]){
  const f=await speedFixture({fast}),s=createTermuxService({store:f.wrapped,clock:f.clock,rng:()=>.2});
  const {job}=await s.execute(f.body('claim'),f.token);assert(job);
  const payload={job,commandId:crypto.randomUUID(),action:{type:'ROLL'}};
  const first=await s.execute(f.body('submit',payload),f.token);
  assert(first.ok);assert.equal(first.version,1);assert(first.events.length);assert(first.performance.commitMs>=0);
  assert.equal(f.calls.length,fast?6:9,JSON.stringify(f.calls));
  const repeat=await s.execute(f.body('submit',payload),f.token);assert(repeat.duplicate);assert.deepEqual(repeat.events,first.events);assert.equal(f.store.botActions.size,1);
 }
});
test('fast snapshot rejects expired, revoked, wrong scope and wrong version leases before state exposure',async()=>{
 for(const mode of ['expired','revoked','scope','version']){
  const f=await speedFixture(),s=createTermuxService({store:f.wrapped,clock:f.clock}),{job}=await s.execute(f.body('claim'),f.token);
  if(mode==='expired')f.store.jobs.get(f.code).until=f.clock()-1;
  if(mode==='revoked')f.store.workers.get(f.workerId).revoked=true;
  if(mode==='scope')f.store.workers.get(f.workerId).codes=['BCDEFGHJ'];
  if(mode==='version')job.sourceVersion++;
  await assert.rejects(s.execute(f.body('submit',{job,commandId:crypto.randomUUID(),action:{type:'ROLL'}}),f.token));
  assert.equal(f.store.botActions.size,0);
 }
});
test('batch access applies the same 600/min quota on every call and never caches revocation',async()=>{
 const f=await speedFixture(),s=createTermuxService({store:f.wrapped,clock:f.clock});
 f.store.quota=async()=>601;await assert.rejects(s.execute(f.body('claim'),f.token),e=>e.status===429);assert(!f.store.jobs.get(f.code).owner);
 f.store.quota=async()=>1;assert((await s.execute(f.body('claim'),f.token)).job);f.store.workers.get(f.workerId).revoked=true;
 await assert.rejects(s.execute(f.body('status'),f.token),e=>e.status===401);
});
test('profile responses expose timings and trace but no worker token or arguments',async()=>{
 const f=await speedFixture(),p=requestPerformance(),s=createTermuxService({store:p.wrap(f.wrapped),clock:f.clock});
 const response=p.response(await s.execute(f.body('claim'),f.token)),body=await response.json();
 assert(response.headers.get('server-timing').includes('app;dur='));assert(body._performance.spans.workerAccess>=0);assert(!JSON.stringify(body).includes(f.token));
});
