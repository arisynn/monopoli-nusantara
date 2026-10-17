import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuthProxy} from '../app/api/auth/route.ts';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-publishable-test',SUPABASE_SERVICE_ROLE_KEY:'super-private-service-key'};
const req=(op,body,{method='POST',origin='https://game.test',auth}={})=>new Request(`https://game.test/api/auth?op=${op}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),'origin':origin,...(auth?{'Authorization':auth}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('login proxy only forwards to the known Supabase Auth API with a public key',async()=>{
 let called=0;const response=await handleAuthProxy(req('login',{email:' user@example.test ',password:'password123'}),env,async(url,opts)=>{
  called++;assert.equal(url,'https://example.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(opts.headers.apikey,env.SUPABASE_ANON_KEY);assert(!JSON.stringify(opts).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  assert.deepEqual(JSON.parse(opts.body),{email:'user@example.test',password:'password123'});
  return Response.json({access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600,user:{id:'user-test'}});
 });
 assert.equal(called,1);assert.equal(response.status,200);assert.equal((await response.json()).access_token,'mock-access');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('invalid credentials from Supabase remain an actionable HTTP 400, not a disconnect message',async()=>{
 const result=await handleAuthProxy(req('login',{email:'a@b.co',password:'password123'}),env,async()=>Response.json({msg:'Invalid login credentials'},{status:400}));
 assert.equal(result.status,400);assert.equal((await result.json()).error,'Invalid login credentials');
});
test('guest sign-up is restricted and successful; signup uses the same-origin callback',async()=>{
 const guest=await handleAuthProxy(req('guest',{data:{admin:true}}),env,async(url,opts)=>{assert(url.endsWith('/auth/v1/signup'));assert.deepEqual(JSON.parse(opts.body),{data:{}});return Response.json({user:{id:'guest'},access_token:'token'})});
 assert.equal(guest.status,200);
 const registered=await handleAuthProxy(req('signup',{email:'a@b.co',password:'password123'}),env,async(url)=>{assert.equal(url,'https://example.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fgame.test');return Response.json({user:{id:'registered'}})});
 assert.equal(registered.status,200);
});
test('proxy refuses unlisted endpoints, cross-site requests, malformed credentials and missing sessions',async()=>{
 let requests=0;const sent=async()=>{requests++;return Response.json({})};
 assert.equal((await handleAuthProxy(req('admin',{email:'x'}),env,sent)).status,404);
 assert.equal((await handleAuthProxy(req('signup',{email:'person@example.test',password:'123456'},{origin:'https://attacker.test'}),env,sent)).status,403);
 assert.equal((await handleAuthProxy(req('login',{email:'bad',password:''}),env,sent)).status,400);
 assert.equal((await handleAuthProxy(req('user',null,{method:'GET'}),env,sent)).status,401);
 assert.equal((await handleAuthProxy(req('guest',{data:{a:'x'.repeat(9000)}}),env,sent)).status,400);
 assert.equal(requests,0);
});
test('confirmed session and linked identity retain bearer token; upstream connectivity failure reports 503',async()=>{
 const bearer='Bearer '+ 'a'.repeat(60);
 const user=await handleAuthProxy(req('user',null,{method:'GET',auth:bearer}),env,async(url,opts)=>{assert(url.endsWith('/auth/v1/user'));assert.equal(opts.headers.Authorization,bearer);return Response.json({id:'verified'})});
 assert.equal((await user.json()).id,'verified');
 const linked=await handleAuthProxy(req('link',{email:'a@b.co',password:'password123'},{method:'PUT',auth:bearer}),env,async(url,opts)=>{assert(url.includes('/auth/v1/user?redirect_to='));assert.equal(opts.method,'PUT');return Response.json({id:'linked'})});
 assert.equal((await linked.json()).id,'linked');
 const unreachable=await handleAuthProxy(req('guest',{}),env,async()=>{throw Error('network')});
 assert.equal(unreachable.status,503);assert.match((await unreachable.json()).error,/tidak dapat dijangkau/);
});
