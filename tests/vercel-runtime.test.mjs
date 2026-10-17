import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {supabaseConfig,createSupabaseStore} from '../lib/server/supabase-store.mjs';
import {supabaseConfigurationStatus} from '../lib/server/supabase-config.mjs';
import {getRuntime} from '../lib/server/runtime.ts';

test('Vercel public aliases and modern server secret resolve without exposing a secret as a public key',()=>{
 const env={NEXT_PUBLIC_SUPABASE_URL:' "https://example.supabase.co" ',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'};
 assert.deepEqual(supabaseConfig(env),{url:'https://example.supabase.co',key:'sb_publishable_test',secret:'sb_secret_test'});
 assert(supabaseConfigurationStatus(env).configured);
 const bad={...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_public'};
 assert.deepEqual(supabaseConfigurationStatus(bad).invalid,['public_key_is_secret']);assert.throws(()=>supabaseConfig(bad));
});
test('configuration diagnostics describe missing names without values and invalid URL remains a safe error',()=>{
 const s=supabaseConfigurationStatus({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'});
 assert.deepEqual(s.missing,['SUPABASE_SECRET_KEY']);assert(!JSON.stringify(s).includes('example.supabase.co'));
 assert.deepEqual(supabaseConfigurationStatus({SUPABASE_URL:'https://example.supabase.co/extra'}).invalid,['invalid_url']);
});
test('modern secret goes in apikey only; legacy service JWT retains its supported bearer header',async()=>{
 for(const secret of ['sb_secret_test','legacy-service-token']){
  let headers;const store=createSupabaseStore({url:'https://example.supabase.co',key:'public',secret},async(_url,options)=>{headers=options.headers;return Response.json([])});
  await store.get('ABCDEFGH');assert.equal(headers.apikey,secret);assert.equal(headers.Authorization,secret.startsWith('sb_secret_')?undefined:'Bearer '+secret);
 }
});
test('Node runtime never activates Redis even if obsolete environment variables remain',()=>{
 const old=[process.env.UPSTASH_REDIS_REST_URL,process.env.UPSTASH_REDIS_REST_TOKEN];
 try{process.env.UPSTASH_REDIS_REST_URL='https://unused.example';process.env.UPSTASH_REDIS_REST_TOKEN='unused';assert.equal(getRuntime().store,null);}
 finally{for(const [i,key]of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'].entries())if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];}
});
test('built Vercel entry starts with plain Node, no alias loader, TS stripping flag, or Redis',async()=>{
 const code=`
 import assert from 'node:assert/strict';import {createServer} from 'node:http';import handler from './api/index.mjs';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://native-test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.SUPABASE_SECRET_KEY='sb_secret_private_test';
 for(const name of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GROQ_API_KEY'])delete process.env[name];
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const origin='http://127.0.0.1:'+server.address().port;
 const response=await fetch(origin+'/api/index?_endpoint=online&config=1');assert.equal(response.status,200);const c=await response.json();assert.equal(c.online,true);assert.equal(c.key,'sb_publishable_test');assert(!JSON.stringify(c).includes('sb_secret_private_test'));
 const denied=await fetch(origin+'/api/index?_endpoint=online',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
 const bot=await fetch(origin+'/api/index?_endpoint=bot');assert.equal(bot.status,200);assert.equal((await bot.json()).configured,false);
 console.log('Native Vercel entry passed');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 `;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),timeout:15000});assert(result.stdout.includes('passed'));
});
