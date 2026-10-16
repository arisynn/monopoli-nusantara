// Opt-in, isolated STAGING only. Creates persistent QA rooms, never removes production data.
import assert from 'node:assert/strict';
import {createSupabaseStore,supabaseConfig} from '../lib/server/supabase-store.mjs';
import {createOnlineService} from '../lib/server/online-service.mjs';
import {decisionActor} from '../lib/game.mjs';
if(process.env.MN_ALLOW_LIVE_TESTS!=='staging')throw Error('No live tests ran. Configure an isolated staging project and MN_ALLOW_LIVE_TESTS=staging.');
const config=supabaseConfig(process.env);assert(config,'Staging Supabase configuration required.');
const tokens=JSON.parse(process.env.MN_TEST_ACCESS_TOKENS||'[]');assert(tokens.length>=2,'Provision two staging Auth sessions using official tooling.');
const identities=[];
for(const token of tokens.slice(0,2)){
 const response=await fetch(config.url+'/auth/v1/user',{headers:{apikey:config.key,Authorization:`Bearer ${token}`}});assert(response.ok,'Staging Auth session required.');identities.push({id:(await response.json()).id,token});
}
assert.notEqual(identities[0].id,identities[1].id);
const store=createSupabaseStore(config),service=createOnlineService({store,botsEnabled:true});
const call=(i,type,data={})=>service.execute({type,clientId:`qa-bots-${i}`,requestId:data.action?.id||crypto.randomUUID(),...data},identities[i].id);
const code=(await call(0,'CREATE',{name:'QA bot scheduler',capacity:5})).code;
await call(1,'JOIN',{code});for(let i=0;i<3;i++)await call(0,'ADD_BOT',{code});for(let i=0;i<2;i++)await call(i,'READY',{code,ready:true});await call(0,'START',{code});
const browser=(path,body)=>fetch(`${config.url}/rest/v1/${path}`,{method:body?'POST':'GET',headers:{apikey:config.key,Authorization:`Bearer ${identities[0].token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
assert(!(await browser('mn_bot_jobs?select=*')).ok);assert(!(await browser('mn_bot_actions?select=*')).ok);
assert(!(await browser('rpc/mn_claim_bot_job',{p_owner:crypto.randomUUID()})).ok);
const forged=await fetch(config.url+'/functions/v1/monopoli-bots',{method:'POST',headers:{Authorization:`Bearer ${identities[0].token}`,'Content-Type':'application/json'},body:'{}'});assert.equal(forged.status,401);
// Submit only human opening rolls. The deployed scheduler must run bot work independently.
for(let i=0;i<2;i++){const row=await store.get(code),actor=decisionActor(row.data.state);assert.equal(row.data.state.players[actor].controller,'human');await call(actor,'ACTION',{code,action:{type:'START_ROLL',id:crypto.randomUUID(),expectedVersion:row.data.state.version}});}
const receipts=async()=>{const r=await fetch(`${config.url}/rest/v1/mn_bot_actions?code=eq.${code}&select=source_version,actor`,{headers:{apikey:config.secret,Authorization:`Bearer ${config.secret}`}});assert(r.ok,'Migration 002 required.');return r.json()};
let events=[];const until=Date.now()+25000;
while(Date.now()<until){events=await receipts();if(events.length)break;await new Promise(r=>setTimeout(r,1000));}
assert(events.length,'No autonomous bot action arrived. Check function, pg_net, Vault and cron recovery.');assert.equal(new Set(events.map(e=>e.source_version)).size,events.length);
// Refresh both human leases, then pause with human-only votes.
for(let i=0;i<2;i++)await call(i,'HEARTBEAT',{code});await call(0,'PAUSE_REQUEST',{code});let view=await service.read(code,identities[0].id);assert.equal(view.vote.eligible.length,2);await call(1,'VOTE',{code,voteId:view.vote.id,agree:true});
const paused=await store.get(code);assert.equal(paused.data.status,'paused');const before=JSON.stringify(paused.data.state);await new Promise(r=>setTimeout(r,1500));assert.equal(JSON.stringify((await store.get(code)).data.state),before);
view=await service.read(code,identities[0].id);for(let i=0;i<2;i++)await call(i,'RESUME_READY',{code,cycle:view.pause.cycle,ready:true});assert.equal((await store.get(code)).data.status,'playing');
console.log('PASS staging bot RLS, browser forgery rejection, autonomous scheduler, unique receipts and human-only pause/resume. Persistent QA room:',code);
