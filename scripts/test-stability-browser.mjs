import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGame} from '../lib/game.mjs';
import {APP_VERSION} from '../lib/version.mjs';

const require=createRequire(import.meta.url), {chromium}=require(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787';
const folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-stability-qa';
await mkdir(folder,{recursive:true});
assert.equal((await fetch(origin+'/build.json').then(r=>r.json())).version,APP_VERSION);
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[],errors=[];
const fixture=n=>createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i,controller:'human'})),startingRoll:false},()=>.2);
async function context({locks=true,viewport={width:390,height:844}}={}) {
 const ctx=await browser.newContext({viewport,serviceWorkers:'block'});await ctx.addInitScript(()=>{try{localStorage.setItem('nusantara-player-name','QA Pemain')}catch{}const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=2;return array;}return original(array)};});
 if(!locks)await ctx.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
 ctx.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
 return ctx;
}
async function seeded(ctx,n=2) {
 const page=await ctx.newPage();await page.goto(origin,{waitUntil:'networkidle'});
 await page.evaluate(state=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state,room:null,persistedAt:Date.now()})),fixture(n));
 await page.reload({waitUntil:'networkidle'});return page;
}
const saved=page=>page.evaluate(async()=>{const m=await import('/lib/storage.mjs');return m.loadGame()});
async function leave(page) {
 if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
 await page.locator('[data-action=menu]').click();await page.locator('[data-action=lobby]').click();
 await page.locator('.lobby').waitFor();
}
try {
 {
  const ctx=await context(),a=await seeded(ctx);await a.locator('[data-action=resume]').click();
  const b=await ctx.newPage();await b.goto(origin,{waitUntil:'networkidle'});await b.locator('[data-action=resume]').click();
  await b.getByText(/sedang dibuka di tab lain/).waitFor();assert.equal(await b.locator('.board-stage').count(),0);
  await b.locator('[data-action=startLocal]').click();await b.getByText(/sedang dibuka di tab lain/).waitFor();
  await a.bringToFront();await a.locator('[data-action=primary]').click();await a.waitForFunction(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state.version===1);
  await a.close();await b.bringToFront();await b.locator('[data-action=resume]').click();await b.locator('.board-stage').waitFor();
  assert.equal((await saved(b)).state.version,1);await leave(b);assert.equal((await saved(b)).state.version,1);
  checks.push({name:'one writer tab; rejected resume/start; closing owner releases lock and latest revision resumes',passed:true});await ctx.close();
 }
 {
  const ctx=await context({locks:false}),a=await seeded(ctx);await a.locator('[data-action=resume]').click();
  const b=await ctx.newPage();await b.goto(origin,{waitUntil:'networkidle'});await b.locator('[data-action=resume]').click();
  await a.bringToFront();await a.locator('[data-action=primary]').click();await a.waitForFunction(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state.version===1);
  await b.bringToFront();await b.locator('[data-action=menu]').click();await b.locator('[data-action=lobby]').click();
  await b.locator('#page-status').filter({hasText:'Simpanan berubah'}).waitFor();assert.equal((await saved(b)).state.version,1);
  await b.locator('[data-action=menu]').click();await b.locator('[data-action=lobby]').click();await b.locator('.lobby').waitFor();
  await b.locator('[data-action=resume]').click();await b.locator('.board-stage').waitFor();
  assert.equal((await saved(b)).state.version,1);
  checks.push({name:'without Web Locks, stale-tab lobby save cannot overwrite latest progress and can recover',passed:true});await ctx.close();
 }
 {
  const ctx=await context({locks:false}),a=await seeded(ctx),b=await ctx.newPage();await b.goto(origin,{waitUntil:'networkidle'});
  const baseline=await saved(a);
  const race=await Promise.all([a,b].map((page,i)=>page.evaluate(async({baseline,i})=>{
   const m=await import('/lib/storage.mjs');
   try {await m.saveGame({state:{...baseline.state,version:1,branch:i},room:null},{expectedRevision:m.saveRevision(baseline)});return 'committed';}
   catch(e){return e.name;}
  },{baseline,i})));
  assert.equal(race.filter(x=>x==='committed').length,1);assert.equal(race.filter(x=>x==='SaveConflictError').length,1);
  checks.push({name:'real IndexedDB transaction allows only one simultaneous branch without Web Locks',passed:true});await ctx.close();
 }
 {
  const ctx=await context(),page=await seeded(ctx);
  const result=await page.evaluate(async()=>{
   const m=await import('/lib/storage.mjs'),initial=await m.loadGame();
   const current=await m.saveGame({state:{...initial.state,version:8},room:null},{expectedRevision:m.saveRevision(initial)});
   const restored=await m.saveGame({state:{...initial.state,version:2},room:null},{replace:true,expectedRevision:m.saveRevision(current)});
   return {version:restored.state.version,schema:restored.state.schemaVersion};
  });assert.deepEqual(result,{version:2,schema:2});
  checks.push({name:'explicit restore permits older local state without changing engine schema',passed:true});await ctx.close();
 }
 for(const viewport of [{width:667,height:375},{width:568,height:320},{width:740,height:360}]) {
  const ctx=await context({viewport}),page=await seeded(ctx,6);await page.locator('[data-action=resume]').click();await page.locator('.board-stage').waitFor();
  const metrics=await page.evaluate(()=>{const b=document.querySelector('.board-stage').getBoundingClientRect(),c=document.querySelector('.action-console').getBoundingClientRect(),g=document.querySelector('.gameplay');return {board:{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height},consoleBottom:c.bottom,internalOverflow:g.scrollHeight>g.clientHeight+1,horizontalOverflow:document.documentElement.scrollWidth>innerWidth}});
  assert(metrics.board.y>=0&&metrics.board.bottom<=viewport.height+1,JSON.stringify(metrics));assert(metrics.board.right<=viewport.width+1);assert(!metrics.internalOverflow);assert(!metrics.horizontalOverflow);assert(metrics.consoleBottom<=viewport.height+1);
  if(viewport.width===667)await page.screenshot({path:folder+'/landscape-667x375.png'});
  checks.push({name:`landscape ${viewport.width}x${viewport.height}, six players, board and controls fit`,passed:true,metrics});await ctx.close();
 }
 assert.deepEqual(errors,[]);console.log(`${checks.length} stability browser scenarios passed.`);
} catch(error) {checks.push({name:'stability browser failure',passed:false,error:error.stack});console.error(error);process.exitCode=1;}
finally {await browser.close();await writeFile('docs/STABILITY_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Local Chromium emulation; not a physical mobile device.','No Supabase or Groq is called by this browser suite.']},null,2)+'\n');}
