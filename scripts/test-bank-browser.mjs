import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGame,command,stock} from '../lib/game.mjs';
import {bankSnapshot} from '../lib/bank-economy.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-bank-qa';
await mkdir(folder,{recursive:true});
const checks=[],errors=[],browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
function fixture(n=4){
 let s=createGame({players:['Jovan','Raka','Bima','Sari','Dewi','Bayu'].slice(0,n).map(name=>({name,controller:'human'})),startingRoll:false,matchId:'bank-qa'},()=>.2);
 s.assets[13].owner=1;s=command(s,1,{type:'MORTGAGE',tile:13});s.assets[1].owner=0;s.assets[3].owner=0;s=command(s,0,{type:'BUILD',tile:1});
 s=command(s,0,{type:'OFFER',trade:{to:1,give:[],take:[],giveCash:300,takeCash:0,giveCards:0,takeCards:0}});s=command(s,1,{type:'TRADE_ACCEPT'});s.bank=stock(s);return s;
}
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state);
const settled=page=>page.locator('dialog[open]').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
async function bounds(page,v){
 await settled(page);
 const m=await page.locator('dialog[open]').evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.popup-body'),f=el.querySelector('.popup-footer').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,footer:f.bottom,overflow:body.scrollWidth>body.clientWidth+1};});
 assert(m.left>=0&&m.right<=v.width+1&&m.top>=0&&m.bottom<=v.height+1&&m.footer<=v.height+1&&!m.overflow,JSON.stringify(m));return m;
}
try{
 for(const v of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932},{width:360,height:420},{width:1280,height:800}]){
  const context=await browser.newContext({viewport:v,isMobile:v.width<800,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const state=fixture(v.width===320?6:4);
  await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(s=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null,persistedAt:Date.now()})),state);await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.bank-indicator').waitFor();
  const before=await read(page),expected=bankSnapshot(before),button=page.locator('.bank-indicator');
  assert.equal(await button.count(),1);assert(await button.evaluate(el=>{const r=el.getBoundingClientRect(),stage=el.closest('.board-stage').getBoundingClientRect();return r.height>=44&&r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom;}));
  // No property/pawn overlaps in the overview: the control occupies the open center.
  assert(await button.evaluate(el=>{const r=el.getBoundingClientRect();return [...document.querySelectorAll('[data-tile],[data-pawn]')].every(t=>{const b=t.getBoundingClientRect();return b.right<=r.left||b.left>=r.right||b.bottom<=r.top||b.top>=r.bottom;});}));
  assert.equal(await page.locator('.bank-indicator small').textContent(),'Nusa beredar');
  if(v.width===390)await page.screenshot({path:folder+'/board-bank.png',animations:'disabled'});
  await button.tap();await page.locator('dialog[open][data-kind=bank]').waitFor();assert.equal(await page.locator('dialog').getAttribute('data-density'),'compact');assert.equal(await page.locator('.bank-detail[open]').count(),0);const metrics=await bounds(page,v);if(v.width===390)await page.screenshot({path:folder+'/bank-ringkas.png',animations:'disabled'});
  await page.locator('[data-asset-key=bank-flows] summary').click();await page.locator('[data-asset-key=bank-mortgages] summary').click();await bounds(page,v);
  assert.equal(expected.mortgaged.length,1);assert(await page.locator('[data-asset-key=bank-mortgages]').textContent().then(t=>t.includes('Padang')&&t.includes('Raka')));
  if(v.width===390)await page.screenshot({path:folder+'/bank-rincian.png',animations:'disabled'});
  for(const method of ['button','escape','back']){
   await page.locator('[data-asset-key=bank-mortgages] [data-action=certificate]').click();await page.locator('dialog[data-kind=property] .deed').waitFor();assert.equal(await page.locator('dialog [data-type]').count(),0);
   if(method==='button')await page.locator('.popup-footer [data-action=close]').click();else if(method==='escape')await page.keyboard.press('Escape');else await page.evaluate(()=>history.back());
   await page.locator('dialog[data-kind=bank]').waitFor();await settled(page);assert.equal(await page.locator('[data-asset-key=bank-mortgages]').getAttribute('open'),'');assert.equal(await page.locator('[data-asset-key=bank-flows]').getAttribute('open'),'');assert.deepEqual(await read(page),before);
  }
  await page.locator('[data-asset-key=bank-inventory] summary').click();await page.locator('[data-asset-key=bank-inventory] [data-action=certificate]').first().click();await page.locator('dialog .deed').waitFor();await page.keyboard.press('Escape');await page.locator('dialog[data-kind=bank]').waitFor();await bounds(page,v);
  await page.locator('.popup-footer [data-action=close]').click();await page.locator('dialog[open]').waitFor({state:'hidden'});
  await page.locator('.bank-indicator').focus();await page.keyboard.press('Enter');await page.locator('dialog[open][data-kind=bank]').waitFor();await page.keyboard.press('Escape');assert.deepEqual(await read(page),before);
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.bank-indicator').click();await page.locator('dialog[data-kind=bank]').waitFor();assert.deepEqual((await read(page)).bankEconomy,before.bankEconomy);
  await page.keyboard.press('Escape');
  // Follow/zoom keep the bank in board coordinates, or hide it outside view.
  await page.locator('[data-action=camera]').click();
  assert(await page.locator('.bank-indicator').evaluate(el=>{
   if(el.hidden)return true;const r=el.getBoundingClientRect();return [...document.querySelectorAll('[data-tile],[data-pawn]')].every(t=>{const b=t.getBoundingClientRect();return b.right<=r.left||b.left>=r.right||b.bottom<=r.top||b.top>=r.bottom;});
  }));
  await page.locator('[data-action=camera]').click();await page.locator('.bank-indicator').waitFor({state:'visible'});
  checks.push({name:`bank ${v.width}x${v.height}`,passed:true,metrics,readOnlyNavigation:true,detailsRestored:true,persistedTotals:true});await context.close();console.log(`Bank ${v.width}x${v.height} passed.`);
 }
 // A migrated save has honest partial coverage; opening the bank itself never mutates it.
 {const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await c.newPage();await p.goto(origin);const s=fixture();delete s.bankEconomy;await p.evaluate(s=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null})),s);await p.reload({waitUntil:'networkidle'});await p.locator('[data-action=resume]').click();const before=await read(p);await p.locator('.bank-indicator').click();assert.match(await p.locator('.bank-scope').textContent(),/Simpanan lama/);assert.deepEqual(await read(p),before);checks.push({name:'old save current holdings shown with partial-history explanation; opening does not migrate state',passed:true});await c.close();}
 assert.deepEqual(errors,[]);console.log(`${checks.length} bank browser scenarios passed.`);
}catch(e){checks.push({name:'failure',passed:false,error:e.stack});console.error(e);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/BANK_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Chromium emulation; no physical Android/iOS.','Local authoritative engine state. No live room/account/database modifications.']},null,2)+'\n');}
