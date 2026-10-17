import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineAuth,connectionId,subscribeRoom} from '../lib/online-client.mjs';
import {ConnectionError,sameRoom} from '../lib/room-client.mjs';
import {authenticate,createSupabaseStore,supabaseConfig} from '../lib/server/supabase-store.mjs';
const config={url:'https://example.supabase.co',key:'public-test-key',secret:'server-test-secret'};
function storage(t){
 const original={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
 const map=new Map(),session=new Map();const wrap=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 globalThis.localStorage=wrap(map);globalThis.sessionStorage=wrap(session);
 t.after(()=>{globalThis.localStorage=original.localStorage;globalThis.sessionStorage=original.sessionStorage});
}
test('guest Auth is persistent in browser; connection IDs survive refresh and identify one tab',async t=>{
 storage(t);let calls=0;
 const auth=new OnlineAuth(config,async(url,options)=>{calls++;assert.equal(url,'/api/auth?op=guest');assert(!('apikey' in options.headers));assert(!JSON.stringify(options).includes(config.secret));return Response.json({access_token:'guest-access-token',refresh_token:'refresh',expires_in:3600,user:{id:'user-one',is_anonymous:true}})});
 await auth.guest();assert.equal(auth.session().user.is_anonymous,true);assert.equal(await new OnlineAuth(config).token(),'guest-access-token');assert.equal(calls,1);assert.equal(connectionId(),connectionId());
});
test('expired access token uses rotating refresh token and never sends a room snapshot to Auth',async t=>{
 storage(t);localStorage.setItem(`nusantara-auth:${config.url}`,JSON.stringify({access_token:'expired',expires_at:0,refresh_token:'refresh-one',user:{id:'one'}}));
 const auth=new OnlineAuth(config,async(url,options)=>{assert.equal(url,'/api/auth?op=refresh');assert.deepEqual(JSON.parse(options.body),{refresh_token:'refresh-one'});return Response.json({access_token:'new-token',refresh_token:'refresh-two',expires_in:3600,user:{id:'one'}})});
 assert.equal(await auth.token(),'new-token');assert.equal(auth.session().refresh_token,'refresh-two');
});
test('Auth provider and connection failures stay distinct and do not destroy an existing identity',async t=>{
 storage(t);const old={access_token:'old',expires_at:0,refresh_token:'refresh',user:{id:'old-user'}};localStorage.setItem(`nusantara-auth:${config.url}`,JSON.stringify(old));
 await assert.rejects(new OnlineAuth(config,async()=>{throw Error('offline')}).token(),ConnectionError);
 assert.equal(new OnlineAuth(config).session().user.id,'old-user');
 await assert.rejects(new OnlineAuth(config,async()=>Response.json({msg:'Invalid login credentials'},{status:400})).login('person@example.test','password'),/Invalid login/);
});
test('room requests authenticate with current user bearer, not the service secret or seat name',async t=>{
 storage(t);localStorage.setItem(`nusantara-auth:${config.url}`,JSON.stringify({access_token:'user-access-token',expires_at:Date.now()/1000+3600,user:{id:'one'}}));
 const auth=new OnlineAuth(config,async(url,options)=>{assert.equal(url,'/api/online?rooms=1');assert.equal(options.headers.Authorization,'Bearer user-access-token');assert(!JSON.stringify(options).includes(config.secret));return Response.json({rooms:[]})});
 assert.deepEqual(await auth.request('?rooms=1'),{rooms:[]});
});
test('Supabase backend validates identity remotely; browser self-asserted user ID is insufficient',async()=>{
 await assert.rejects(authenticate(new Request('https://game.test'),config),e=>e.status===401);
 const request=new Request('https://game.test',{headers:{Authorization:'Bearer verified-user-access-token'}});
 const user=await authenticate(request,config,async(url,options)=>{assert.equal(url,config.url+'/auth/v1/user');assert.equal(options.headers.apikey,config.key);assert.equal(options.headers.Authorization,'Bearer verified-user-access-token');return Response.json({id:'00000000-0000-4000-8000-000000000001'})});assert(user.id);
 await assert.rejects(authenticate(request,config,async()=>Response.json({error:'invalid'},{status:401})),e=>e.status===401);
 await assert.rejects(authenticate(request,config,async()=>{throw Error('offline')}),e=>e.status===503);
});
test('server store scopes queries and commits through a backend-only RPC with expected revision',async()=>{
 const calls=[];const store=createSupabaseStore(config,async(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer '+config.secret);if(url.includes('/rpc/'))return Response.json({ok:true,revision:7});return Response.json([])});
 assert.equal(await store.get('ABCDEFGH'),null);await store.receipt('identity','command-one');await store.list('identity');
 const room={code:'ABCDEFGH',seats:[]};await store.commit({revision:6},room,{userId:'identity',requestId:'command-one',hash:'hash',type:'ACTION',notify:false});
 const b=JSON.parse(calls.at(-1).options.body);assert.equal(b.p_expected_revision,6);assert.equal(b.p_actor,'identity');assert.equal(b.p_notify,false);assert(calls.at(-1).url.endsWith('/rpc/mn_commit_room'));
 await assert.rejects(createSupabaseStore(config,async()=>Response.json({message:'secret database detail'},{status:500})).get('ABCDEFGH'),e=>e.status===503&&!e.message.includes('secret'));
});
test('Supabase config requires server credentials and rejects unsafe destinations',()=>{
 assert.equal(supabaseConfig({}),null);assert.equal(supabaseConfig({SUPABASE_URL:config.url,SUPABASE_ANON_KEY:'key'}),null);
 assert.throws(()=>supabaseConfig({SUPABASE_URL:'http://example.test',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'b'}));
 assert.equal(supabaseConfig({SUPABASE_URL:config.url,SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'b'}).url,config.url);
});
test('Realtime joins a room-scoped, authenticated revision-only channel and disposes resources',async()=>{
 let socket;const sent=[],status=[],changes=[];
 const stop=subscribeRoom(config,'ABCDEFGH',async()=>'access-token',()=>changes.push(true),v=>status.push(v),url=>{assert(url.startsWith('wss://'));socket={readyState:1,send:s=>sent.push(JSON.parse(s)),close(){this.closed=true;this.onclose?.()}};return socket});
 await new Promise(resolve=>setImmediate(resolve));socket.onopen();
 const joined=sent[0];assert.equal(joined.event,'phx_join');assert.equal(joined.payload.access_token,'access-token');assert.deepEqual(joined.payload.config.postgres_changes,[{event:'*',schema:'public',table:'mn_room_updates',filter:'code=eq.ABCDEFGH'}]);
 socket.onmessage({data:JSON.stringify({event:'phx_reply',topic:'realtime:mn-room:ABCDEFGH',payload:{status:'ok'}})});
 socket.onmessage({data:JSON.stringify({event:'postgres_changes',payload:{data:{record:{revision:9}}}})});assert.equal(changes.length,2);assert.deepEqual(status,[true]);
 stop();assert.equal(socket.closed,true);assert.equal(socket.onclose,null);assert.equal(socket.onmessage,null);
});
test('late responses for a different authenticated identity cannot replace the current seat',()=>{
 const a={provider:'supabase',code:'ABCDEFGH',userId:'identity-one'},b={...a,userId:'identity-two'};assert.equal(sameRoom(a,b),false);assert.equal(sameRoom(a,{...a}),true);
});

test('email confirmation verifies callback identity and removes tokens from the URL',async t=>{
 storage(t);const oldLocation=globalThis.location,oldHistory=globalThis.history;let cleaned='';
 globalThis.location={hash:'#access_token=confirmed-access-token&refresh_token=confirmed-refresh-token&expires_in=3600',pathname:'/',search:'?room=ABCDEFGH'};
 globalThis.history={state:null,replaceState:(_state,_title,url)=>{cleaned=url}};
 t.after(()=>{globalThis.location=oldLocation;globalThis.history=oldHistory});
 const auth=new OnlineAuth(config,async(url,options)=>{assert.equal(url,'/api/auth?op=user');assert.equal(options.headers.Authorization,'Bearer confirmed-access-token');return Response.json({id:'confirmed-user',is_anonymous:false})});
 await auth.consumeRedirect();assert.equal(auth.session().user.id,'confirmed-user');assert.equal(auth.session().refresh_token,'confirmed-refresh-token');assert.equal(cleaned,'/?room=ABCDEFGH');
});

test('reconnect replaces an untrusted browser cache even when its stored version is higher',async()=>{
 const {mergeState}=await import('../lib/room-client.mjs');
 const cached={matchId:'match',version:999999,players:[{cash:999999}]},server={matchId:'match',version:12,players:[{cash:15000}]};
 assert.equal(mergeState(cached,server,true),server);
 const current={...server,version:13};assert.equal(mergeState(current,server),current);
});

test('email login and signup use same-origin relay and show provider errors',async t=>{
 storage(t);const operations=[];const auth=new OnlineAuth(config,async(url,options)=>{operations.push([url,options]);return Response.json({error:'Email address not confirmed'},{status:400})});
 await assert.rejects(auth.login('person@example.com','password123'),/Email address not confirmed/);
 await assert.rejects(auth.signup('person@example.com','password123'),/Email address not confirmed/);
 assert.deepEqual(operations.map(([url])=>url),['/api/auth?op=login','/api/auth?op=signup']);
 assert(operations.every(([,o])=>!('apikey' in o.headers)&&!JSON.stringify(o).includes(config.secret)));
});
test('browser transport errors distinguish timeout without treating Auth 400 as connection loss',async t=>{
 storage(t);const auth=new OnlineAuth(config,async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})});
 await assert.rejects(auth.guest(),e=>e instanceof ConnectionError&&/terlalu lama/.test(e.message));
});
