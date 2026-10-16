import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {createRedisStore,redisConfig} from '../lib/server/redis-store.mjs';

const bridge=spawn(process.env.PYTHON||'python',['tests/fixtures/redis-lua.py'],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let serial=0;
const reader=createInterface({input:bridge.stdout});
reader.on('line',line=>{const value=JSON.parse(line);const job=pending.get(value.id);pending.delete(value.id);if(job){value.error?job.reject(Error(value.error)):job.resolve(value.result)}});
bridge.on('exit',code=>{for(const job of pending.values())job.reject(Error(`Redis fixture exited (${code}). Install fakeredis[lua] first.`));pending.clear()});
const command=(args)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});bridge.stdin.write(JSON.stringify({id,command:args})+'\n')});
const transport=async(url,options)=>{assert.equal(new URL(url).hostname,'redis.test');assert.equal(options.headers.Authorization,'Bearer test-only-token');return Response.json({result:await command(JSON.parse(options.body))})};
const config={url:'https://redis.test',token:'test-only-token',prefix:'test:production',ttl:3600};
const store=createRedisStore(config,transport),another=createRedisStore(config,transport);
const originalFetch=globalThis.fetch;
try{
 assert.equal(redisConfig({}),null);
 assert.equal(redisConfig({UPSTASH_REDIS_REST_URL:config.url,UPSTASH_REDIS_REST_TOKEN:config.token,VERCEL_ENV:'preview'}).prefix,'nusantara:v2:preview');
 assert.throws(()=>createRedisStore({...config,url:'http://redis.test'}),/Konfigurasi/);
 const room={code:'ABC234',seats:[],state:null};
 assert.equal(await store.create(room),true);assert.equal(await another.create({...room,state:'overwrite'}),false);
 const row=await another.get(room.code);assert.equal(JSON.parse(row.data).state,null);assert.equal(row.revision,0);
 assert((await command(['TTL','test:production:room:{ABC234}']))>3500);
 console.log('PASS Redis configuration, create-if-absent, persistence across instances and room TTL');
 const commits=await Promise.all([store.commit(row,{...room,state:'one'}),another.commit(row,{...room,state:'two'})]);assert.equal(commits.filter(Boolean).length,1);assert.equal((await store.get(room.code)).revision,1);
 console.log('PASS Redis atomic CAS rejects a stale simultaneous writer');
 assert.deepEqual(await Promise.all([store.quota('limit',120),another.quota('limit',120)]),[1,2]);assert((await command(['TTL','test:production:quota:limit']))>100);
 assert.equal(await createRedisStore({...config,prefix:'test:preview'},transport).get(room.code),null);
 console.log('PASS atomic quotas expire and preview namespace cannot read production rooms');
 const current=await store.get(room.code);assert.equal(await store.acquire(current,'old'),true);assert.equal(await another.acquire(current,'second'),false);
 await another.release(current,'wrong');assert.equal(await another.acquire(current,'second'),false);
 await command(['PEXPIRE','test:production:room:{ABC234}:ai',0]);assert.equal(await another.acquire(current,'new'),true);
 await store.release(current,'old');assert.equal(await another.acquire(current,'third'),false);await another.release(current,'new');assert.equal(await store.acquire(current,'third'),true);await store.release(current,'third');
 console.log('PASS AI lease exclusivity, expiration and owner-checked release');
 await assert.rejects(createRedisStore(config,async()=>Response.json({error:'secret-should-not-leak'},{status:401})).get('ABC234'),e=>!e.message.includes('secret')&&e.message.includes('Penyimpanan'));
 console.log('PASS provider failures return a safe service message');

 // Run actual built Next.js route exports, without a development/preview server.
 const require=createRequire(import.meta.url);const entry=require('../.next/server/app/api/game/route.js');const {GET,POST}=entry.routeModule.userland;
 for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','GROQ_API_KEY'])delete process.env[key];
 let status=await (await GET(new Request('https://game.test/api/game?status=1'))).json();assert.deepEqual(status,{online:false,groq:false,hosting:'vercel'});
 let unavailable=await POST(new Request('https://game.test/api/game',{method:'POST',body:JSON.stringify({type:'CREATE'})}));assert.equal(unavailable.status,400);assert((await unavailable.json()).error.includes('belum diaktifkan'));
 console.log('PASS built Next.js API gracefully disables room/Groq without database configuration');
 Object.assign(process.env,{UPSTASH_REDIS_REST_URL:config.url,UPSTASH_REDIS_REST_TOKEN:config.token,ROOM_NAMESPACE:'test:api',VERCEL:'1',VERCEL_ENV:'production'});
 globalThis.fetch=transport;
 async function call(body,token='',extra={}){const result=await POST(new Request('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':token,'x-vercel-forwarded-for':'192.0.2.1',Origin:'https://game.test',...extra},body:JSON.stringify(body)}));return {status:result.status,data:await result.json()}}
 const a=(await call({type:'CREATE',name:'Jovan',rules:'classic'})).data;assert(a.token,a.error);assert.equal(a.roomRevision,0);assert.equal(a.online,true);assert.equal(a.rules,'classic');assert(!a.seats[0].token);
 const b=(await call({type:'JOIN',code:a.code,name:'Raka'})).data;assert(b.token,b.error);assert.equal(b.roomRevision,1);
 assert.equal((await call({type:'START',code:a.code},a.token)).status,400);assert.equal((await call({type:'READY',code:a.code,ready:true},b.token)).status,200);
 let result=await call({type:'START',code:a.code},a.token);assert.equal(result.status,200);assert.equal(result.data.roomRevision,3);let state=result.data.state;assert(!state.decks);assert.equal(state.phase,'starting');const tokens=[a.token,b.token];
 assert.equal((await call({type:'ACTION',code:a.code,action:{type:'START_ROLL',id:'wrong-seat',expectedVersion:state.version}},b.token)).status,400);
 while(state.phase==='starting'){const who=state.starting.pending[0];result=await call({type:'ACTION',code:a.code,action:{type:'START_ROLL',id:crypto.randomUUID(),expectedVersion:state.version}},tokens[who]);assert.equal(result.status,200,JSON.stringify(result.data));state=result.data.state}
 console.log('PASS Vercel guest room, token redaction, join, ready gate, hidden decks and seat authorization');
 const token=tokens[state.turn],version=state.version;
 const parallel=await Promise.all(['a','b'].map(id=>call({type:'ACTION',code:a.code,action:{type:'ROLL',id,expectedVersion:version}},token)));
 assert.equal(parallel.filter(v=>v.status===200).length,1);const good=parallel.findIndex(v=>v.status===200),retry=await call({type:'ACTION',code:a.code,action:{type:'ROLL',id:good===0?'a':'b',expectedVersion:version}},token);assert.equal(retry.status,200);assert.equal(retry.data.state.version,parallel[good].data.state.version);
 const reconnected=await GET(new Request(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':b.token}}));assert.equal(reconnected.status,200);assert.equal((await reconnected.json()).seat,1);
 const invalid=await GET(new Request(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':'wrong'}}));assert.equal(invalid.status,400);
 assert.equal((await call({type:'JOIN',code:a.code,name:'Late'})).status,400);
 console.log('PASS built API CAS, command retry, reconnect and rejection of invalid token/late join');
 const ai=(await call({type:'CREATE',mode:'ai'})).data;assert.equal(ai.state.aiStatus,'Bot cadangan aktif');let aiState=(await call({type:'ACTION',code:ai.code,action:{type:'START_ROLL',id:'human-start',expectedVersion:ai.state.version}},ai.token)).data.state;assert.equal(aiState.starting.pending[0],1);const aiMove=await call({type:'AI',code:ai.code},ai.token);assert.equal(aiMove.status,200,JSON.stringify(aiMove.data));assert(aiMove.data.state.version>aiState.version);
 console.log('PASS Vercel bot decision commits through Redis lease without a Groq key');
 assert.equal((await call({type:'CREATE'},'',{Origin:'https://elsewhere.test'})).status,400);
 const raw=await POST(new Request('https://game.test/api/game',{method:'POST',body:'x'.repeat(17000)}));assert.equal(raw.status,400);
 const lobby=(await call({type:'CREATE'})).data;for(let i=1;i<6;i++)assert.equal((await call({type:'JOIN',code:lobby.code,name:'P'+i})).status,200);assert.equal((await call({type:'JOIN',code:lobby.code})).status,400);
 for(let i=3;i<30;i++)assert.equal((await call({type:'CREATE'})).status,200);
 const limit=await call({type:'CREATE'},'',{'oai-authenticated-user-id':'spoofed-user'});assert.equal(limit.status,400);assert(limit.data.error.includes('Batas'));
 console.log('PASS six-seat limit, origin/body validation and guest quota cannot be bypassed with ChatGPT headers');
 console.log('Vercel/Redis integration: 10 check groups passed (fakeredis + Lua emulator, built Next.js route).');
}finally{globalThis.fetch=originalFetch;bridge.stdin.end();reader.close();bridge.kill()}
