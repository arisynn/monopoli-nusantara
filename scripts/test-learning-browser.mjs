import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import {createGame,command} from '../lib/game.mjs';
import {localPlayers} from '../lib/bot/personas.mjs';
import {LEARNED_MODEL} from '../lib/bot/learned-model.mjs';
import {createLearningModel} from '../lib/bot/learning.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MN_BROWSER_MODULE||'playwright'),origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8790';
const checks=[],errors=[],browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 let state=createGame({players:localPlayers('Jovan',4),startingRoll:false,matchId:'browser-learning'},()=>.2);state.turn=1;state.phase='buy';state.buy=19;state=command(state,1,{type:'AUCTION'});
 const result=await page.evaluate(async({state,model})=>{
  let ticks=0;const timer=setInterval(()=>ticks++,1),worker=new Worker('/lib/bot/mind.worker.mjs',{type:'module'});
  try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('worker timeout')),3000);worker.onerror=e=>reject(Error(e.message));worker.onmessage=e=>{clearTimeout(timeout);resolve({data:e.data,ticks});};worker.postMessage({id:1,state,actor:1,options:{difficulty:'hardcore',learningModel:model,allowCandidateModel:true,timeBudgetMs:180,maxNodes:240}});});}finally{clearInterval(timer);worker.terminate();}
 },{state,model:LEARNED_MODEL||createLearningModel({hidden:8})});
 assert(result.data.plan?.action);assert(result.data.plan.diagnostics.learning.enabled);assert.equal(result.data.stateVersion,state.version);assert(result.ticks>0);assert.doesNotThrow(()=>command(state,1,result.data.plan.action,()=>.2));checks.push({name:'real browser module worker runs the schema-2 tiny-network candidate off-thread with legal action and matching revision',passed:true,mainThreadTicks:result.ticks});
 await context.setOffline(true);
 const offline=await page.evaluate(async state=>{
  const {createMindClient}=await import('/lib/bot/mind-client.mjs');const client=createMindClient();
  try{return await client.decide(state,1);}finally{client.dispose();}
 },state);
 assert(offline?.action);assert(!offline.diagnostics.workerFallback);assert.doesNotThrow(()=>command(state,1,offline.action,()=>.2));checks.push({name:'pre-cached local bot and worker execute with browser network offline; no Groq/Supabase/Redis dependency',passed:true});
 await context.setOffline(false);await context.close();assert.deepEqual(errors,[]);
 console.log(checks.length+' learning browser scenarios passed.');
}catch(e){checks.push({name:'failure',passed:false,error:String(e.stack||e)});console.error(e);process.exitCode=1;}finally{await browser.close();await writeFile('docs/MIND_LEARNING_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Chromium mobile emulation, not physical Android.','Candidate model is explicitly supplied for this research test; runtime promotion remains gated.','No live multiplayer or Groq was contacted.']},null,2)+'\n');}
