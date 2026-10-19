// Actual Chromium/DOM and GameSession, with an explicitly mocked online response.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createGame,command,publicState} from '../lib/game.mjs';
import {percentile} from '../lib/online-performance.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MN_BROWSER_MODULE||'playwright-core');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8788',baseline=process.env.MN_SPEED_BASELINE||'/workspace/speed-baseline-4112/dist';
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const rows=[],errors=[];
try{
 for(const optimized of [false,true])for(const [players,reduced]of [[2,false],[3,false],[4,false],[5,false],[6,false],[2,true]]){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  if(!optimized)await page.route('**/baseline/**',async route=>{const path=new URL(route.request().url()).pathname.slice('/baseline/'.length);if(path.includes('..'))return route.abort();try{await route.fulfill({body:await readFile(resolve(baseline,path)),contentType:'text/javascript'});}catch{await route.abort();}});
  await page.goto(origin,{waitUntil:'networkidle'});
  const initial=createGame({players:Array.from({length:players},(_,i)=>({name:'P'+i,controller:i<Math.max(2,players-3)?'human':'bot',botPersona:'raka'})),startingRoll:false},()=>.2);
  const done=command(initial,0,{type:'ROLL'},()=>.2);
  const result=await page.evaluate(async({initial,done,optimized,reduced})=>{
   const base=optimized?'':'/baseline', {GameSession}=await import(base+'/frontend/session.mjs'),{DiceView}=await import(base+'/frontend/dice-view.mjs'),{dicePresentation,primaryAction}=await import(base+'/frontend/domain.mjs');
   const s=new GameSession({persist:async()=>{},load:async()=>null,mind:{dispose(){}}});s.screen='gameplay';s.room={code:'ABCDEFGH',seat:0,userId:'test'};s.connected=true;s.online={status:'playing',held:false,roomRevision:0};s.reduced=reduced;
   const element=document.createElement('div');document.body.append(element);const dice=new DiceView(element);let requests=0,resolveResponse;
   s.auth={session:()=>({user:{id:'test'}}),request:()=>{requests++;return new Promise(r=>resolveResponse=r);}};
   const draw=()=>dice.update(s.pendingRoll?{stage:'rolling',values:null,label:'Menunggu konfirmasi server'}:dicePresentation(s.view,s.head),{id:s.pendingRoll||s.head?.id||'',reduced});s.addEventListener('change',draw);s.ingest(initial,{reset:true});s.notify();
   const clicked=performance.now(),first=s.act('ROLL');const duplicate=await s.act('ROLL');await new Promise(r=>setTimeout(r,180));
   if(s.state.version!==0||requests!==1||duplicate!==false)throw Error('Unconfirmed state or double click escaped');
   const responded=performance.now();resolveResponse({code:'ABCDEFGH',seat:0,status:'playing',held:false,roomRevision:1,state:done,seats:done.players});await first;
   const responseToState=performance.now()-responded;
   const deadline=performance.now()+8000;
   while(s.head&&performance.now()<deadline){if(s.head.finance)s.complete(s.head.id);await new Promise(r=>setTimeout(r,5));}
   if(s.head)throw Error('Presentation did not converge');
   const inputReady=performance.now(),action=primaryAction(optimized?s.interactionState:s.view,s.seat,optimized?s.interactionHead:s.head);
   if(!action.type)throw Error('Human decision disappeared');
   if(JSON.stringify(s.state)!==JSON.stringify(done))throw Error('Canonical economics changed');
   const values=[...element.querySelectorAll('.die')].map(n=>Number(n.dataset.value));if(values.join()!=done.dice.join())throw Error('Confirmed dice not visible');
   const row={optimized,reduced,players:initial.players.length,requests,clickToConfirmedStateMs:responded-clicked+responseToState,responseToInputReadyMs:inputReady-responded,clickToInputReadyMs:inputReady-clicked};dice.dispose();s.dispose();element.remove();return row;
  },{initial:publicState(initial),done:publicState(done),optimized,reduced});
  rows.push(result);await context.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{
 await browser.close();const summarize=optimized=>{const v=rows.filter(r=>r.optimized===optimized);return Object.fromEntries(['clickToConfirmedStateMs','responseToInputReadyMs','clickToInputReadyMs'].map(key=>[key,{p50:percentile(v.map(r=>r[key]),.5),p95:percentile(v.map(r=>r[key]),.95)}]));};
 await writeFile('docs/audits/ONLINE_SPEED_BROWSER_RESULTS.json',JSON.stringify({environment:'Real Chromium, emulated mobile DOM, actual GameSession and DiceView; controlled 180 ms backend response',rows,before:summarize(false),after:summarize(true),errors,pass:errors.length===0&&rows.length===12,limits:['No hosted Supabase/Auth/Realtime or physical Android.','Legacy already-paid tax receipt is acknowledged immediately by the harness, giving the baseline an optimistic input-ready time.']},null,2)+'\n');
}
console.log('PASS: 12 real Chromium before/after scenarios, 2–6 players and reduced motion.');
