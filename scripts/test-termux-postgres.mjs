// Isolated PostgreSQL + real engine/protocol. Never touches deployed Supabase.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {createTermuxService} from '../lib/server/termux-worker.mjs';
import {command,createGame,chooseBot} from '../lib/game.mjs';
import {decidePersona} from '../lib/bot/persona-router.mjs';
import {botActor} from '../lib/server/bot-worker.mjs';
import {simulationActor} from '../lib/bot/mind.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';
const container=`nusa-termux-test-${process.pid}`,env={...process.env};
for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=q=>execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'],{env,input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asql=q=>new Promise((resolve,reject)=>{const p=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'],{env});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(q);});
const quote=v=>v===null||v===undefined?'null':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(v).replaceAll("'","''")}'`;
const value=q=>{const raw=sql(q);const last=raw.split('\n').at(-1);return !raw?null:last==='t'?true:last==='f'?false:JSON.parse(last);};
const rpc=(name,p)=>value(`set role service_role;select public.${name}(${Object.entries(p).map(([k,v])=>`${k}=>${quote(typeof v==='object'&&v!==null?JSON.stringify(v):v)}`).join(',')});`);
const users=Array.from({length:3},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const checks=[],report={checks,limits:['Isolated PostgreSQL; not hosted Supabase Auth/Realtime.','Node/Linux; not physical Android/Termux.'],actions:0,botActions:0,bids:0};
let started=false;
try{
 docker('run','-d','--rm','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine','-c','wal_level=logical');started=true;
 for(let i=0;;i++){try{docker('exec',container,'pg_isready','-h','127.0.0.1','-U','postgres');break;}catch{if(i>100)throw Error('PostgreSQL startup failed');await new Promise(r=>setTimeout(r,100));}}
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create publication supabase_realtime;insert into auth.users values ${users.map(x=>`(${quote(x)})`).join(',')};`);
 for(const name of ['202610160001_persistent_online.sql','202610160002_hybrid_bot_jobs.sql','202610160003_nusa_mind_settings.sql','202610170004_bot_worker_vault_auth.sql','202610180006_online_room_management.sql','202610180007_termux_workers.sql','202610190008_online_speed.sql'])sql(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 checks.push('All migrations applied transactionally');
 const store={
  async workerAccess(hash){return rpc('mn_worker_access',{p_hash:hash});},
  async workerSnapshot(worker,job){return rpc('mn_termux_snapshot',{p_worker:worker.id,p_code:job.code,p_owner:job.lease,p_version:job.sourceVersion});},
  async workerClaim(args){return rpc('mn_termux_claim_profiled',args);},
  async workerRpc(name,p){return rpc(name,p);},
  async onlineCapabilities(){return value('select mn_online_capabilities();');},
  async get(code){return value(`set role service_role;select coalesce((select to_jsonb(r) from(select code,data,revision from mn_rooms where code=${quote(code)})r),'null'::jsonb);`);},
  async receipt(user,id){return value(`select coalesce((select to_jsonb(r) from mn_commands r where user_id=${quote(user)} and request_id=${quote(id)}),'null'::jsonb);`);},
  async quota(key,seconds){return value(`select mn_take_quota(${quote(key)},${seconds});`);},
  async commit(row,room,m={}){return value(`set role service_role;select mn_commit_room(${quote(room.code)},${row.revision},${quote(JSON.stringify(m.botWork?{...room,_botWork:m.botWork}:room))}::jsonb,${quote(m.userId)},${quote(m.requestId)},${quote(m.botLease||m.hash)},${quote(m.type)},${m.notify!==false});`);}
 };
 let code='ABCDEFGH';const online=createOnlineService({store,botsEnabled:true,generateCode:()=>code});
 const call=(i,type,data={})=>online.execute({type,code,clientId:`qa-browser-${i}`,requestId:data.action?.id||crypto.randomUUID(),...data},users[i]);
 const codes=['ABCDEFGH','BCDEFGHJ'];
 for(const [index,c] of codes.entries()){
  code=c;await call(0,'CREATE',{name:'QA A',capacity:6});await call(1,'JOIN',{name:'QA B'});
  for(const persona of (index?['raka','bima','sari']:['nusa','kresna','apex']))await call(0,'ADD_BOT',{persona});
  await call(0,'READY',{ready:true});await call(1,'READY',{ready:true});await call(0,'START');
  const row=await store.get(code);row.data.state=createGame({players:row.data.seats,startingRoll:false},()=>.2);row.data.state.turn=2;
  // Force an intensive, legal property auction; no precomputed bot actions.
  row.data.state.phase='buy';row.data.state.buy=39;row.data.state=command(row.data.state,2,{type:'AUCTION'},()=>.2);
  await store.commit(row,row.data,{notify:true});
 }
 checks.push('Two online rooms, two humans + three bots each; all six personas');
 const baseState=(await store.get(codes[0])).data.state;
 for(const patch of [
  {phase:'roll',turn:0,rentClaims:[{to:4}]},
  {phase:'card',card:{player:0},rentClaims:[{to:2}]},
  {phase:'trade',trade:{to:3},rentClaims:[]},
  {phase:'debt',debt:{from:4},rentClaims:[]},
  {phase:'buildOffer',buildOffer:{pending:[0,2,3]}},
  {phase:'starting',starting:{pending:[0,3]}},
  {phase:'auction',auction:{participants:[0,2,3],highest:2,passed:[3]}},
  {phase:'mortgage',mortgageDecision:{player:3}}
 ]){const s={...baseState,...patch};assert.equal(value(`select mn_termux_actor(${quote(JSON.stringify(s))}::jsonb);`),botActor(s));}
 checks.push('SQL scheduling actor matches production JS for auction, starting, rent, card, trade, debt, mortgage, buildOffer');
 const termux=createTermuxService({store,rng:()=>.2});
 const pairing=value('select to_jsonb(mn_worker_create_pairing(null,2));');
 const pair=await termux.pair({pairingCode:pairing,label:'Isolated QA',protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID},users[2]);
 await assert.rejects(termux.pair({pairingCode:pairing,label:'Replay',protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID},users[2]));
 const execute=(op,data={})=>termux.execute({op,protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID,...data},pair.token);
 sql(`update mn_worker_settings set provider='termux',model_manifest=${quote(MODEL_MANIFEST_ID)};`);
 // Setup and adversarial SQL checks can outlive browser leases on a busy host.
 const pulse=async()=>{for(const c of codes){code=c;for(let i=0;i<2;i++)await call(i,'HEARTBEAT');}await execute('heartbeat',{slots:2});};
 await pulse();
 assert.equal(value(`select mn_claim_bot_job('${crypto.randomUUID()}');`),null);
 const denied=value("select has_function_privilege('authenticated','mn_commit_room(text,bigint,jsonb,uuid,text,text,text,boolean)','execute');");assert.equal(denied,false);
 assert.equal(value("select has_function_privilege('authenticated','mn_termux_claim(uuid,uuid,text)','execute');"),false);
 assert.equal(value(`set role authenticated;set request.jwt.claim.sub=${quote(users[0])};select count(*) from mn_worker_wake;`),0);
 assert.equal(value(`set role authenticated;set request.jwt.claim.sub=${quote(users[2])};select count(*) from mn_worker_wake;`),1);
 for(const fn of ['mn_worker_access(text)','mn_termux_snapshot(uuid,text,uuid,bigint)','mn_termux_claim_profiled(uuid,uuid,text)'])for(const role of ['anon','authenticated'])assert.equal(value(`select has_function_privilege('${role}','${fn}','execute');`),false);
 checks.push('Single-use pairing, RLS wake isolation, privileged RPC denial (including migration 008), old Edge claim fenced');
 // Real concurrent SQL connections compete for one available scoped job.
 sql(`update mn_workers set allowed_codes=array['ABCDEFGH'] where id=${quote(pair.workerId)};`);
 const owners=[crypto.randomUUID(),crypto.randomUUID()];
 const claims=await Promise.all(owners.map(owner=>asql(`set role service_role;select mn_termux_claim(${quote(pair.workerId)},${quote(owner)},${quote(MODEL_MANIFEST_ID)});`)));
 assert.equal(claims.filter(Boolean).length,1);
 const owner=owners[claims.findIndex(Boolean)];
 await store.workerRpc('mn_termux_release',{p_worker:pair.workerId,p_code:'ABCDEFGH',p_owner:owner});
 sql(`update mn_workers set allowed_codes=null where id=${quote(pair.workerId)};update mn_bot_jobs set due_at=now();`);
 checks.push('Concurrent SQL claims: one lease per room and scope enforced');
 await pulse();
 const {job}=await execute('claim');assert(job);
 assert(!job.state.decks);assert(!job.state.seen);
 const plan=decidePersona(job.state,job.actor,{timeBudgetMs:64}),payload={job,action:plan.action,commandId:crypto.randomUUID()};
 const submitted=await execute('submit',payload);assert(submitted.ok);
 assert((await execute('submit',payload)).duplicate);
 assert.equal(value(`select count(*) from mn_bot_actions where code=${quote(job.code)} and source_version=${job.sourceVersion};`),1);
 await assert.rejects(execute('submit',{...payload,action:{type:'ROLL'}}));
 checks.push('Atomic room/action/worker receipt; lost ACK replay has one effect');
 // Failed SQL commit rolls back both state and receipt.
 const beforeCount=value('select count(*) from mn_worker_receipts;');
 const retry=(await execute('claim')).job;assert(retry);
 sql(`update mn_bot_jobs set lease_until=clock_timestamp()-interval '1 second' where code=${quote(retry.code)};`);
 await assert.rejects(execute('submit',{job:retry,commandId:crypto.randomUUID(),action:{type:'ROLL'}}));
 assert.equal(value('select count(*) from mn_worker_receipts;'),beforeCount);
 const recovered=(await execute('claim')).job;assert(recovered);assert.notEqual(recovered.lease,retry.lease);
 await execute('release',{job:recovered});sql('update mn_bot_jobs set due_at=now();');
 checks.push('Expired lease rejects stale action and is recoverable without browser wake');
 let lastPulse=0;
 for(let step=0;step<180;step++){
  if(Date.now()-lastPulse>10000){await pulse();lastPulse=Date.now();}
  const {job}=await execute('claim');
  if(job){
   const p=decidePersona(job.state,job.actor,{timeBudgetMs:64});assert(p.action);
   if(p.action.type==='BID'){assert.equal(p.action.amount%50,0);report.bids++;}
   assert((await execute('submit',{job,commandId:crypto.randomUUID(),action:p.action})).ok);report.botActions++;
  }else{
   let advanced=false;
   for(const c of codes){
    const row=await store.get(c),s=row.data.state;if(s.phase==='won'||botActor(s)!==null)continue;
    const actor=simulationActor(s);if(s.players[actor]?.controller!=='human')continue;
    const action=chooseBot(s,actor);assert(action);
    if(action.type==='BID'){assert.equal(action.amount%50,0);report.bids++;}
    code=c;const actionId=crypto.randomUUID();const {actionId:transient,financePlan,...intent}=action;
    await call(actor,'ACTION',{action:{...intent,id:actionId,expectedVersion:s.version}});advanced=true;
   }
   if(!advanced)break;
  }
  report.actions++;
  if((step+1)%30===0)console.log(`PostgreSQL integration ${step+1}/180; bot commits=${report.botActions}; bids=${report.bids}`);
 }
 assert(report.botActions>30);assert(report.bids>5);
 const caps=await store.onlineCapabilities();assert.equal(caps.workerProvider,'termux');assert(caps.workerAlive);
 const snapshot=value('select jsonb_agg(jsonb_build_object(\'code\',code,\'version\',data->\'state\'->\'version\')) from mn_rooms;');
 sql(`update mn_workers set revoked=true where id=${quote(pair.workerId)};`);
 await assert.rejects(execute('claim'));
 assert.equal(value(`set role authenticated;set request.jwt.claim.sub=${quote(users[2])};select count(*) from mn_worker_wake;`),0);
 assert.deepEqual(value('select jsonb_agg(jsonb_build_object(\'code\',code,\'version\',data->\'state\'->\'version\')) from mn_rooms;'),snapshot);
 checks.push('180 online scheduling iterations, real model decisions, intensive auctions, N5 bid grid');
 checks.push('Worker revoke stops claims and hint access without changing game state');
 report.pass=true;
}catch(error){report.pass=false;report.error=error.message;throw error;}
finally{
 if(started)docker('rm','-f',container);
 await mkdir(new URL('../docs/audits/',import.meta.url),{recursive:true});
 await writeFile(new URL('../docs/audits/TERMUX_POSTGRES_RESULTS.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
