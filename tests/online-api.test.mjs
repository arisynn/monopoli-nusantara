import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {MemoryOnlineStore} from './helpers/online-store.mjs';

// Runs the actual API handler and Supabase REST adapter against a contract double.
// It does NOT execute PostgreSQL, GoTrue, or Realtime and is not a substitute for staging tests.
const source=await readFile(new URL('../app/api/online/route.ts',import.meta.url),'utf8');
let moduleSource=stripTypeScriptTypes(source,{mode:'strip'}).replace("import {getRuntime} from '@/lib/server/runtime';","const getRuntime=()=>globalThis.__mnTestRuntime;");
moduleSource=moduleSource.replaceAll(/from '@\/([^']+)'/g,(_,name)=>`from '${new URL('../'+name,import.meta.url).href}'`);
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
const ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const testKey='public-test-key',testSecret='server-test-secret';
function setup(t){
 const originalFetch=globalThis.fetch;const store=new MemoryOnlineStore();
 globalThis.__mnTestRuntime={env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:testKey,SUPABASE_SERVICE_ROLE_KEY:testSecret},creatorId:()=> 'test-ip'};
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):null;
  if(u.pathname==='/auth/v1/user'){
   assert.equal(options.headers.apikey,testKey);const token=options.headers.Authorization.split(' ')[1],i=Number(token.split('-').at(-1));
   return Number.isInteger(i)&&ids[i]?Response.json({id:ids[i]}):Response.json({error:'invalid'},{status:401});
  }
  assert.equal(options.headers.apikey,testSecret);assert.equal(options.headers.Authorization,'Bearer '+testSecret);
  if(u.pathname.endsWith('/mn_rooms')){const code=u.searchParams.get('code').slice(3);const r=await store.get(code);return Response.json(r?[r]:[])}
  if(u.pathname.endsWith('/mn_commands')){const r=await store.receipt(u.searchParams.get('user_id').slice(3),u.searchParams.get('request_id').slice(3));return Response.json(r?[r]:[])}
  if(u.pathname.endsWith('/mn_members')){const codes=await store.list(u.searchParams.get('user_id').slice(3));return Response.json(codes.map(code=>({code})))}
  if(u.pathname.endsWith('/mn_take_quota'))return Response.json(await store.quota(body.p_key,body.p_seconds));
  if(u.pathname.endsWith('/mn_online_capabilities'))return Response.json({schemaVersion:6,lobbyManagement:true,workerConfigured:false,schedulerConfigured:false});
  if(u.pathname.endsWith('/mn_commit_room'))return Response.json(await store.commit({revision:body.p_expected_revision},body.p_data,{userId:body.p_actor,requestId:body.p_request_id,hash:body.p_hash,type:body.p_type,notify:body.p_notify}));
  throw Error('Unexpected request '+u.pathname);
 };
 t.after(()=>{globalThis.fetch=originalFetch;delete globalThis.__mnTestRuntime});
 const headers=i=>({'Content-Type':'application/json',Authorization:`Bearer user-access-token-for-test-${i}`});
 const post=async(i,type,data={})=>{const requestId=data.action?.id||crypto.randomUUID();const response=await POST(new Request('https://game.test/api/online',{method:'POST',headers:headers(i),body:JSON.stringify({type,clientId:`browser-tab-${i}`,requestId,...data})}));return {status:response.status,data:await response.json()}};
 return {store,post,headers};
}
test('configuration exposes only the public project URL/key, and handles an unconfigured server',async t=>{
 setup(t);let r=await GET(new Request('https://game.test/api/online?config=1')),v=await r.json();assert.equal(v.key,testKey);assert(!JSON.stringify(v).includes(testSecret));
 globalThis.__mnTestRuntime.env={};r=await GET(new Request('https://game.test/api/online?config=1'));assert.equal((await r.json()).online,false);
});
test('API rejects unauthenticated, invalid-session, cross-origin and oversized requests',async t=>{
 const f=setup(t);
 assert.equal((await GET(new Request('https://game.test/api/online?rooms=1'))).status,401);
 assert.equal((await GET(new Request('https://game.test/api/online?rooms=1',{headers:{Authorization:'Bearer invalid-access-token-example'}}))).status,401);
 assert.equal((await POST(new Request('https://game.test/api/online',{method:'POST',headers:{...f.headers(0),Origin:'https://attacker.test'},body:'{}'}))).status,403);
 assert.equal((await POST(new Request('https://game.test/api/online',{method:'POST',headers:f.headers(0),body:JSON.stringify({padding:'x'.repeat(17000)})}))).status,413);
});
test('online diagnostics are authenticated and bot preflight rejects an unavailable worker',async t=>{
 const f=setup(t);
 assert.equal((await GET(new Request('https://game.test/api/online?diagnostics=1'))).status,401);
 const r=await GET(new Request('https://game.test/api/online?diagnostics=1',{headers:f.headers(0)}));
 const d=await r.json();assert.equal(d.capabilities.schemaVersion,6);assert.equal(d.capabilities.workerConfigured,false);assert(!JSON.stringify(d).includes(testSecret));
 const created=await f.post(0,'CREATE',{name:'QA Host'});globalThis.__mnTestRuntime.env.MN_ONLINE_BOTS_ENABLED='true';
 const blocked=await f.post(0,'ADD_BOT',{code:created.data.code,persona:'nusa'});assert.equal(blocked.status,503);assert.equal(blocked.data.code,'online_worker_unavailable');
});
for(const n of [2,3,6])test(`actual route: ${n} human identities, ready/start, dice validation and cross-room access`,async t=>{
 const f=setup(t),a=await f.post(0,'CREATE',{capacity:n,name:'Ayu'});assert.equal(a.status,200);const code=a.data.code;
 for(let i=1;i<n;i++){const joined=await f.post(i,'JOIN',{code,name:`Pemain ${i+1}`});assert.equal(joined.status,200);assert.equal(joined.data.seat,i)}
 assert.equal((await f.post(0,'START',{code})).status,400);
 for(let i=0;i<n;i++)assert.equal((await f.post(i,'READY',{code,ready:true})).status,200);
 const started=await f.post(0,'START',{code});assert.equal(started.status,200);assert.equal(started.data.status,'playing');assert(!('decks' in started.data.state));assert(!JSON.stringify(started.data).includes(ids[0]));
 const outsider=await GET(new Request(`https://game.test/api/online?code=${code}`,{headers:f.headers(6)}));assert.equal(outsider.status,403);
 const forged=await f.post(0,'ACTION',{code,action:{id:crypto.randomUUID(),type:'START_ROLL',dice:[6,6],expectedVersion:0}});assert.equal(forged.status,400);
 const valid=await f.post(0,'ACTION',{code,action:{id:crypto.randomUUID(),type:'START_ROLL',expectedVersion:0}});assert.equal(valid.status,200);assert.equal(valid.data.state.version,1);
 const list=await GET(new Request('https://game.test/api/online?rooms=1',{headers:f.headers(1)}));assert.equal((await list.json()).rooms[0].code,code);
});
