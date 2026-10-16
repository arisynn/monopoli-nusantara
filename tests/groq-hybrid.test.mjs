import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,command} from '../lib/game.mjs';import {localPlayers} from '../lib/bot/personas.mjs';
import {aiDecision,advisorConfiguration,localDecision} from '../lib/groq.ts';
const fixture=()=>{let s=createGame({players:localPlayers('Human',3),advisorEnabled:true,startingRoll:false},()=>.2);s.phase='buy';s.buy=19;return command(s,0,{type:'AUCTION'})};
const env={GROQ_API_KEY:'test-key-not-real',GROQ_MODEL:'configured-model'};
const options=transport=>({transport,circuitKey:crypto.randomUUID()});
test('uniform result contract includes safe optional reason in local, configured and hybrid cases',async()=>{
 const s=fixture();const local=await aiDecision(s,1,{});assert.equal(local.status,'local');assert.equal(local.reason,'not_configured');assert(local.action);assert.equal(local.advisorUsed,false);
 assert.equal(advisorConfiguration(env).status,'configured');assert.equal(localDecision(s,1,'timeout').reason,'timeout');
});
test('simple/mechanical choices never call provider even with ENV configured',async()=>{
 const s=createGame({players:localPlayers('A',2)},()=>.2);s.starting.pending=[1];
 const r=await aiDecision(s,1,env,options(async()=>{throw Error('must not call')}));assert.equal(r.reason,'simple');assert.equal(r.status,'configured');
});
test('valid structured recommendation respects guardrails and reports real call usage',async()=>{
 let prompt;const s=fixture();const r=await aiDecision(s,1,env,options(async(_url,o)=>{prompt=JSON.parse(o.body);const context=JSON.parse(prompt.messages[1].content);assert(context.economy.reserve>=0);assert(context.candidates[0].utility!==undefined);assert(!JSON.stringify(context).includes('decks'));assert.equal(o.headers.Authorization,'Bearer test-key-not-real');return Response.json({choices:[{message:{content:JSON.stringify({actionId:context.candidates[0].actionId})}}],usage:{total_tokens:123}})}));
 assert.equal(r.status,'hybrid');assert.equal(r.advisorUsed,true);assert.equal(r.usage.totalTokens,123);assert.equal(prompt.model,'configured-model');assert(!JSON.stringify(r).includes(env.GROQ_API_KEY));assert(!r.comment);
});
for(const [status,reason] of [[401,'unauthorized'],[403,'forbidden'],[429,'rate_limited'],[500,'provider_error'],[503,'provider_error']])test(`HTTP ${status} uses safe fallback and never exposes provider body`,async()=>{
 const r=await aiDecision(fixture(),1,env,options(async()=>Response.json({error:'secret stack Bearer key'},{status})));assert.equal(r.status,'fallback');assert.equal(r.reason,reason);assert(!JSON.stringify(r).includes('secret'));assert(r.action);
});
for(const content of ['not json','{}','{"actionId":"not-legal"}','{"actionId":"c0","reason":"internal"}'])test('invalid/illegal provider output falls back: '+content,async()=>{
 const r=await aiDecision(fixture(),1,env,options(async()=>Response.json({choices:[{message:{content}}]})));assert.equal(r.status,'fallback');assert(['invalid_response','illegal_action'].includes(r.reason));assert(r.action);
});
test('timeout, failed network and exhausted budget preserve an immediate local baseline',async()=>{
 const r=await aiDecision(fixture(),1,{...env,GROQ_TIMEOUT_MS:'1500'},options(async(_u,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))));assert.equal(r.reason,'timeout');assert(r.action);
 const failure=await aiDecision(fixture(),1,env,options(async()=>{throw Error('network raw-secret')}));assert.equal(failure.reason,'network_error');
 const budget=await aiDecision(fixture(),1,env,{...options(async()=>{throw Error('must not call')}),spend:async()=>false});assert.equal(budget.reason,'budget');
});
test('circuit breaker prevents repeated paid provider requests after 429',async()=>{
 let calls=0;const config={...options(async()=>{calls++;return new Response('',{status:429})}),clock:()=>100000};
 const a=await aiDecision(fixture(),1,env,config),b=await aiDecision(fixture(),1,env,config);assert.equal(a.reason,'rate_limited');assert.equal(b.reason,'circuit_open');assert.equal(calls,1);
});

test('quota backend error preserves a typed local fallback without calling the provider',async()=>{
 let called=false;const r=await aiDecision(fixture(),1,env,{...options(async()=>{called=true;throw Error('must not call')}),spend:async()=>{throw Error('private quota failure')}});assert.equal(called,false);assert.equal(r.status,'fallback');assert.equal(r.reason,'budget');assert(r.action);assert(!JSON.stringify(r).includes('private'));
});
