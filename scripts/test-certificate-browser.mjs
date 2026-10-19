import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {createGame,command,stock,BOARD} from '../lib/game.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-certificate-qa';await mkdir(folder,{recursive:true});
const make=()=>createGame({players:['Jovan','Sari'].map(name=>({name,controller:'human'})),startingRoll:false},()=>.2);
export function certificateFixture(kind,tile=11){
 let s=make();
 if(kind==='rent'){s.players[0].pos=tile-2;s.assets[tile]={owner:1,level:0,mortgaged:false};}
 if(kind==='auction'){s.phase='buy';s.buy=tile;s=command(s,0,{type:'AUCTION'});}
 if(kind==='building'){
  for(const id of [1,3])s.assets[id]={owner:0,level:1,mortgaged:false};
  for(const [ids,level] of [[[6,8,9],3],[[11,13,14],4],[[16],2],[[18,19],3]])for(const id of ids)s.assets[id]={owner:1,level,mortgaged:false};
  s.bank=stock(s);s=command(s,0,{type:'BUILD',tile:1});s=command(s,1,{type:'BUILD_JOIN',tile:6});assert.equal(s.auction.kind,'building');
 }
 if(kind==='mortgage'){
  s.assets[tile]={owner:1,level:0,mortgaged:true};s.bank=stock(s);
  s=command(s,1,{type:'OFFER',trade:{to:0,give:[tile],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0}});s=command(s,0,{type:'TRADE_ACCEPT'});assert.equal(s.phase,'mortgage');
 }
 s.bank=stock(s);return s;
}
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),checks=[],errors=[];
async function read(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state)}
async function ready(page){await page.locator('dialog[open]').evaluate(async el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))))}
async function bounds(page,viewport){
 await ready(page);const m=await page.locator('dialog[open]').evaluate(el=>{const b=el.getBoundingClientRect(),body=el.querySelector('.popup-body'),f=el.querySelector('.popup-footer').getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,footerBottom:f.bottom,overflow:body.scrollWidth>body.clientWidth+1,density:el.dataset.density,titles:el.querySelectorAll('#popup-title').length}});
 assert(m.x>=0&&m.right<=viewport.width+1&&m.y>=0&&m.bottom<=viewport.height+1&&m.footerBottom<=viewport.height+1&&!m.overflow,JSON.stringify(m));assert.equal(m.titles,1);return m;
}
async function scenario(viewport,kind,tile=11){
 const context=await browser.newContext({viewport,isMobile:viewport.width<800,hasTouch:viewport.width<800,deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(0);return a;}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(state=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state,room:null,persistedAt:Date.now()})),certificateFixture(kind,tile));await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.board-stage').waitFor();
  if(kind==='rent')await page.locator('[data-action=primary]').click();
  const parent=kind==='rent'?'settlement':kind==='building'?'auction':kind;
  await page.locator(`dialog[open][data-kind=${parent}] .mini-deed`).waitFor();const before=await read(page),m=await bounds(page,viewport);assert.equal(m.density,'compact');
  const id=Number(await page.locator('.mini-deed').getAttribute('data-id'));
  if(kind==='rent'){assert.equal(before.players[0].cash,15000-(before.players[1].cash-15000));assert(before.players[0].cash<15000);assert.equal(await page.locator('.settlement-label').textContent(),'Sewa dibayar');assert(await page.locator('.property-price-label').textContent());}
  for(const way of ['button','escape','back']){
   await page.locator('.mini-deed').click();await page.locator('dialog[data-kind=property] .deed').waitFor();const detail=await bounds(page,viewport);assert.equal(detail.density,'preserved');assert.equal(await page.locator('dialog [data-action=manage]').count(),0);assert.equal(await page.locator('dialog [data-type]').count(),0);assert((await page.locator('.deed header h2').textContent()).includes(BOARD[id].name.toUpperCase()));
   if(way==='button')await page.locator('.popup-dismiss').click();else if(way==='escape')await page.keyboard.press('Escape');else await page.evaluate(()=>history.back());
   await page.locator(`dialog[data-kind=${parent}] .mini-deed`).waitFor();await ready(page);assert.deepEqual(await read(page),before,`${kind}: ${way} must not execute any game action`);assert.equal(await page.locator('dialog').getAttribute('data-density'),'compact');
  }
  if(viewport.width===390){await page.mouse.move(0,0);await page.screenshot({path:`${folder}/${kind}-${tile}.png`,animations:'disabled'});}
  if(kind==='rent'){await page.locator('[data-action=dismissEvent]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open][data-kind=settlement]'));assert.deepEqual(await read(page),before,'Acknowledgement must not charge rent again');}
  checks.push({name:`${kind} ${tile} at ${viewport.width}x${viewport.height}`,passed:true,returnMethods:['button','Escape','browser Back'],authoritativeStateUnchanged:true,metrics:m});
 }finally{await context.close()}
}
try{
 for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932}]){
  for(const tile of [11,5,12,28])await scenario(viewport,'rent',tile);
  for(const kind of ['auction','building','mortgage'])await scenario(viewport,kind);
  console.log(`Certificate summaries ${viewport.width}: 7 scenarios passed.`);
 }
 for(const kind of ['rent','mortgage'])await scenario({width:360,height:420},kind);
 await scenario({width:1280,height:800},'rent');
 assert.deepEqual(errors,[]);console.log(`${checks.length} certificate navigation/layout scenarios passed.`);
}catch(e){checks.push({passed:false,error:e.stack});console.error(e);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/CERTIFICATE_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Chromium emulation, not a physical device.','Real local engine commands and persisted state; no live room or database changes.','Legacy standalone confirmAsset renderer is covered by core tests; Assets confirmation remains inline.']},null,2)+'\n');}
