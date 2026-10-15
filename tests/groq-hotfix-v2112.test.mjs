import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createGame,command,botCandidates,decisionActor} from '../lib/game.mjs';
import {validateLocalState} from '../lib/save-format.mjs';
import {aiDecision} from '../lib/groq.ts';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const testRuntime='__nusantaraGroqHotfixTest';
async function loadBotRoute(){
 let code=read('app/api/bot/route.ts');
 code=code.replace(/^import .*?;$/gm,line=>line.includes('getRuntime')?`const getRuntime=()=>globalThis.${testRuntime};`:line.replace(/'@\/(.*?)'/,(_,f)=>JSON.stringify(new URL('../'+f+(f==='lib/groq'?'.ts':''),import.meta.url).href)));
 return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code,{mode:'strip'})).toString('base64'));
}
const game=()=>{
 const s=createGame({players:[{name:'Jovan',controller:'human'},{name:'Raka',controller:'bot'}],startingRoll:false},()=>.45);
 s.turn=1;s.phase='buy';s.buy=1;
 assert.equal(decisionActor(s),1);
 assert(botCandidates(s,1).length>1);
 validateLocalState(s);
 return s;
};
function request(state,actor=1,origin='https://game.test'){
 return new Request('https://game.test/api/bot',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({state,actor})});
}
test('Groq hotfix detects configured API key without requiring Redis; VS Bot keeps local state',()=>{
 const gameApi=read('app/api/game/route.ts'),client=read('components/game/Game.tsx');
 assert(gameApi.includes("groq:!!String(context.env.GROQ_API_KEY||'').trim(),online:!!store"));
 assert(client.includes("requestJSON('/api/bot'"));
 assert(client.includes('refreshAI()'));
 assert(!client.includes("if(mode==='bot'&&online?.groq){const result=await api('CREATE'"));
 assert(client.includes("if(mode==='bot'){created.aiStatus="));
 assert(client.includes('botFeedback'));
});
test('stateless Groq bot returns server-validated legal action with no Redis',async t=>{
 const route=await loadBotRoute();
 globalThis[testRuntime]={env:{GROQ_API_KEY:'test-secret',GROQ_MODEL:'openai/gpt-oss-20b'},store:null};
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original;delete globalThis[testRuntime]});
 let called=0;
 globalThis.fetch=async(url,opts)=>{
  called++;
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(opts.headers.Authorization,'Bearer test-secret');
  const payload=JSON.parse(opts.body),snapshot=JSON.parse(payload.messages[1].content);
  assert(!('decks' in snapshot.state));assert(!('log' in snapshot.state));assert(!('queue' in snapshot.state));
  assert.equal(payload.model,'openai/gpt-oss-20b');
  return Response.json({choices:[{message:{content:JSON.stringify({actionId:'a0',comment:'Strategi beli properti.'})}}]});
 };
 const s=game(),response=await route.POST(request(s));const data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.status,'Groq aktif');
 assert(botCandidates(s,1).some(a=>a.type===data.action.type));assert.equal(data.reason,'success');assert.equal(called,1);
 const applied=command(s,1,{...data.action,id:'groq-test-move',expectedVersion:s.version},()=>.45);
 assert.equal(applied.version,s.version+1);assert.equal(applied.assets[1].owner,1);assert.equal(applied.players[1].cash,14400);
 const denied=await route.POST(request(s,0));assert.equal(denied.status,400);assert.match((await denied.json()).error,/giliran bot/i);
 const cross=await route.POST(request(s,1,'https://evil.test'));assert.equal(cross.status,400);
});
test('provider failures/illegal action use local bot without exposing credentials',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 const s=game(),env={GROQ_API_KEY:'secret-never-public'};
 for(const [status,reason] of [[401,'unauthorized'],[429,'rate_limited'],[500,'provider_error']]){
  globalThis.fetch=async()=>new Response('secret-never-public',{status});
  const value=await aiDecision(s,1,env);
  assert.equal(value.reason,reason);assert.equal(value.status,'Bot lokal cadangan');
  assert(botCandidates(s,1).some(a=>a.actionId===value.action.actionId));
  assert(!JSON.stringify(value).includes('secret-never-public'));
 }
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"actionId":"hacked","comment":"nope"}'}}]});
 assert.equal((await aiDecision(s,1,env)).reason,'invalid_response');
 globalThis.fetch=async()=>{throw Error('secret-never-public')};
 assert.equal((await aiDecision(s,1,env)).reason,'provider_error');
});
test('missing key prevents AI; forced action skips provider call',async t=>{
 const route=await loadBotRoute(),s=game();
 globalThis[testRuntime]={env:{},store:null};t.after(()=>delete globalThis[testRuntime]);
 const noKey=await route.POST(request(s));assert.equal(noKey.status,503);
 const oneAction=createGame({players:[{name:'Jovan',controller:'human'},{name:'Raka',controller:'bot'}]},()=>.34);
 assert.equal(decisionActor(oneAction),0);oneAction.starting.pending=[1];
 assert.equal(botCandidates(oneAction,1).length,1);
 const oldFetch=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw Error('Unexpected network request')};
 t.after(()=>globalThis.fetch=oldFetch);
 const result=await aiDecision(oneAction,1,{GROQ_API_KEY:'fake'});
 assert.equal(result.reason,'single_action');assert.equal(called,0);
});
