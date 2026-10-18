// Opt-in real hosted staging check using an already-paired, room-scoped device.
// Stop its PM2 daemon first. No admin credential is read or required.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadConfig,DATA} from '../termux/config.mjs';
import {WorkerClient,subscribeWork} from '../termux/client.mjs';
import {ComputePool} from '../termux/pool.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';
import {resolve} from 'node:path';
if(process.env.MN_ALLOW_LIVE_TESTS!=='staging')throw Error('No live test ran. Set MN_ALLOW_LIVE_TESTS=staging for an isolated staging project only.');
const expected=process.argv[2];assert(/^[A-HJ-NP-Z2-9]{8}$/.test(expected),'Pass the isolated QA room code');
const config=await loadConfig(),client=new WorkerClient(config),pool=new ComputePool(1);
const report={environment:'Hosted staging (operator selected)',api:config.api,room:expected,checks:[]};
let stop=()=>{};
try{
 const protocol=await (await fetch(`${config.api}/api/worker`)).json();assert.equal(protocol.protocol,WORKER_PROTOCOL);assert.equal(protocol.manifest,MODEL_MANIFEST_ID);
 const info=await client.request('heartbeat',{slots:1});assert.equal(info.provider,'termux');
 assert(info.rooms.some(r=>r.code===expected),'Prepared QA room must be playing');
 assert(info.rooms.every(r=>r.code===expected),'Use a dedicated device scoped only to this QA room');
 let connected=false;stop=subscribeWork(client,()=>{},value=>{connected=value;});
 const deadline=Date.now()+20000;while(!connected&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));assert(connected,'Supabase Realtime subscription must authorize and join');
 report.checks.push('Matched backend/model protocol and real Auth/RLS Realtime join');
 const {job}=await client.request('claim');assert(job&&job.code===expected,'Wait for a bot decision in the QA room, then rerun');
 assert(!job.state.decks);assert(!job.state.seen);
 const plan=await pool.compute({state:job.state,actor:job.actor,budget:config.budget});
 const payload={job:{code:job.code,lease:job.lease,matchId:job.matchId,sourceVersion:job.sourceVersion,actor:job.actor},commandId:crypto.randomUUID(),action:plan.action};
 assert((await client.request('submit',payload)).ok);assert((await client.request('submit',payload)).duplicate);
 report.checks.push('Real claim, local model computation, canonical submit and duplicate receipt');report.pass=true;
}finally{stop();await pool.close();await writeFile(resolve(DATA,'staging-test.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));}
