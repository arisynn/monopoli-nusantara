import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {staticResponse} from '../adapters/node/static.mjs';
import {handleRequest} from '../adapters/node/router.mjs';
import {createGame} from '../lib/game.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.MN_BROWSER_MODULE||'playwright');
const folder=process.env.MN_PWA_OUTPUT||join(tmpdir(),'nusantara-pwa');await mkdir(folder,{recursive:true});
let release=1;
const server=createServer(async(req,res)=>{
  try{
    const request=new Request(`http://${req.headers.host}${req.url}`);
    let response;
    if(req.url==='/nusantara-sw.js'){
      const source=(await readFile(new URL('../dist/nusantara-sw.js',import.meta.url),'utf8')).replace('nusantara-classic-v4110-',`nusantara-classic-v4110-qa${release}-`);
      response=new Response(source,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
    }else if(req.url.startsWith('/api/pwa-probe'))response=Response.json({private:'not-for-cache'},{headers:{'Cache-Control':'private, no-store'}});
    else response=await staticResponse(request)||await handleRequest(request);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('test server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[],errors=[];
const fixture=()=>{
  const s=createGame({players:[{name:'Ayu',controller:'human'},{name:'NUSA',controller:'bot',botPersona:'nusa',botDifficulty:'hardcore'}],startingRoll:false},()=>.2);
  s.turn=1;s.phase='buy';s.buy=13;return s;
};
try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.reload();await page.locator('.lobby').waitFor();
  const manifest=await page.evaluate(async()=>{
    const url=document.querySelector('link[rel=manifest]').href,response=await fetch(url);
    return {type:response.headers.get('content-type'),data:await response.json()};
  });
  assert.match(manifest.type,/manifest\+json/);assert.equal(manifest.data.display,'standalone');
  const cdp=await context.newCDPSession(page),app=await cdp.send('Page.getAppManifest');
  assert.deepEqual(app.errors,[]);assert(app.data.includes('Monopoli Nusantara'));
  assert.equal(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await page.screenshot({path:folder+'/lobby-logo-390.png'});
  checks.push({name:'Manifest, install icons, standalone metadata and logo load in Chromium at 390px',passed:true});
  const probe=await page.evaluate(async()=>{await fetch('/api/pwa-probe?room=private');const keys=await caches.keys();return (await Promise.all(keys.map(async key=>(await (await caches.open(key)).keys()).map(r=>r.url)))).flat();});
  assert(!probe.some(url=>url.includes('/api/')||url.includes('/auth')));
  checks.push({name:'Private API responses are absent from public cache',passed:true});

  await page.evaluate(state=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state,room:null})),fixture());
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-action=resume]').click();await page.locator('.board-stage').waitFor();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state.assets[13].owner===1);
  await page.screenshot({path:folder+'/offline-nusa-390.png'});
  checks.push({name:'Offline shell resumes a save and real NUSA worker commits its purchase',passed:true});
  await context.setOffline(false);
  // A second tab keeps the active match; the first tab returns to the lobby.
  const lobby=await context.newPage();await lobby.goto(origin);await lobby.locator('.lobby').waitFor();
  release=2;await lobby.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await lobby.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  await lobby.locator('[data-action=menu]').click();await lobby.locator('[data-action=settings]').click();
  await lobby.locator('[data-action=updateApp]').waitFor();await lobby.locator('[data-action=updateApp]').click();
  await lobby.waitForTimeout(400);
  assert(await lobby.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting));
  assert.equal(await page.locator('.board-stage').count(),1);
  checks.push({name:'Waiting PWA update cannot activate while another tab is playing',passed:true});
  await page.close();
  const navigated=lobby.waitForEvent('load');await lobby.locator('[data-action=updateApp]').click();await navigated;
  await lobby.locator('.lobby').waitFor();
  await lobby.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistration()).waiting);
  const cacheNames=await lobby.evaluate(()=>caches.keys());
  assert(cacheNames.some(k=>k.includes('qa2-')));assert(!cacheNames.some(k=>k.includes('qa1-')));
  checks.push({name:'PWA update activates and reloads safely after gameplay tab closes',passed:true});
  await context.close();assert.deepEqual(errors,[]);
}catch(error){checks.push({passed:false,error:error.stack});process.exitCode=1;console.error(error);}
finally{
  await writeFile(new URL('../docs/PWA_BROWSER_RESULTS.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Chromium on a local test server; no physical Android/iOS installation, live Supabase or benchmark was exercised.']},null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
console.log(`${checks.filter(c=>c.passed).length} PWA browser scenarios passed.`);
