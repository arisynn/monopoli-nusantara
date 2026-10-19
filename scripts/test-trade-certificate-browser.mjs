import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGame,command,stock} from '../lib/game.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-trade-certificate-qa';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),checks=[],errors=[];
function fixture(mode){
 let s=createGame({players:['Jovan','Sari'].map(name=>({name,controller:'human'})),startingRoll:false},()=>.2);
 s.assets[13]={owner:0,level:0,mortgaged:false};s.assets[28]={owner:0,level:0,mortgaged:false};s.assets[5]={owner:1,level:0,mortgaged:true};s.bank=stock(s);
 if(mode!=='draft')s=command(s,1,{type:'OFFER',trade:{to:0,give:[5],take:[13],giveCash:500,takeCash:0,giveCards:0,takeCards:0}});
 return s;
}
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state);
async function ready(page){await page.locator('dialog[open]').evaluate(async el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))))}
async function fits(page,viewport){await ready(page);const m=await page.locator('dialog[open]').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.querySelector('.popup-body'),f=el.querySelector('.popup-footer').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:b.scrollWidth>b.clientWidth+1,footerBottom:f.bottom}});assert(m.left>=0&&m.right<=viewport.width+1&&m.top>=0&&m.bottom<=viewport.height+1&&m.footerBottom<=viewport.height+1&&!m.overflow,JSON.stringify(m));}
async function peek(page,id,parent,way='button'){
 const before=await state(page),scroll=await page.locator('.popup-body').evaluate(n=>n.scrollTop);
 await page.locator(`dialog [data-action=certificate][data-id="${id}"]`).click();await page.locator('dialog[data-kind=property] .deed').waitFor();assert.equal(await page.locator('dialog [data-type]').count(),0);assert.equal(await page.locator('dialog [data-action=manage]').count(),0);
 if(way==='button')await page.locator('.popup-dismiss').click();else if(way==='escape')await page.keyboard.press('Escape');else await page.evaluate(()=>history.back());
 await page.locator(`dialog[data-kind=${parent}] [data-action=certificate][data-id="${id}"]`).waitFor();await ready(page);assert.deepEqual(await state(page),before);return scroll;
}
try{
 for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932}])for(const mode of ['draft','incoming','counter']){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(s=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null,persistedAt:Date.now()})),fixture(mode));await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.board-stage').waitFor();const before=await state(page);
   if(mode==='draft'){
    await page.locator('.quick-actions [data-action=trade]').click();await page.locator('[name=giveCash]').fill('12.3');await page.locator('[data-action=tradePicker][data-side=give]').click();
    const checkbox=page.locator('[name=tradeAsset][value="13"]');assert(!(await checkbox.isChecked()));await peek(page,13,'picker');assert(!(await checkbox.isChecked()),'Detail click must not select property');await checkbox.check();await peek(page,13,'picker','escape');assert(await checkbox.isChecked(),'Detail return keeps the choice');
    await page.locator('[name=tradeAsset][value="28"]').check();await page.locator('[data-action=pickerDone]').click();assert.equal(await page.locator('[name=giveCash]').inputValue(),'12.3');await peek(page,13,'trade','back');assert.equal(await page.locator('[name=giveCash]').inputValue(),'12.3');assert.equal(await page.locator('[data-action=tradeRemove]').count(),2);
    await page.locator('[data-action=tradePicker][data-side=take]').click();assert((await page.locator('.trade-property-status').textContent()).includes('bunga N 10 atau tebus N 110'));await peek(page,5,'picker');await page.locator('[name=tradeAsset][value="5"]').check();await page.locator('[data-action=pickerDone]').click();await peek(page,5,'trade');assert.equal(await page.locator('[data-action=tradeRemove]').count(),3);assert.equal(await page.locator('.trade-value-summary').count(),2);assert.equal(await page.locator('.trade-estimate-heading.loss').count(),1);const quote=await page.locator('[data-trade-estimate]').textContent();await page.locator('[name=giveCash]').fill('0');assert.notEqual(await page.locator('[data-trade-estimate]').textContent(),quote);await page.locator('[name=giveCash]').fill('12.3');assert.equal(await page.locator('[data-trade-estimate]').textContent(),quote);await page.locator('.trade-estimate summary').click();await fits(page,viewport);assert(await page.locator('.trade-estimate details').evaluate(n=>n.open));await page.locator('[name=giveCash]').fill('12.4');assert(await page.locator('.trade-estimate details').evaluate(n=>n.open));await page.locator('[name=giveCash]').fill('12.3');await page.locator('.trade-estimate summary').click();
   }else if(mode==='incoming'){
    await page.locator('dialog[data-kind=tradeIncoming]').waitFor();for(const way of ['button','escape','back'])await peek(page,5,'tradeIncoming',way);assert.equal(await page.locator('[data-type=TRADE_ACCEPT]').count(),1);assert.equal(await page.locator('[data-action=tradeRemove]').count(),0);assert.equal(await page.locator('.trade-estimate-heading.even').count(),1);
   }else{
    await page.locator('[data-action=counter]').click();await page.locator('[name=giveCash]').fill('7.4');for(const way of ['button','escape','back'])await peek(page,13,'trade',way);assert.equal(await page.locator('[name=giveCash]').inputValue(),'7.4');assert.equal(await page.locator('[name=takeCash]').inputValue(),'50');assert.equal(await page.locator('[data-action=tradeRemove]').count(),2);assert.equal(await page.locator('.trade-estimate-heading.loss').count(),1);
   }
   await fits(page,viewport);assert.deepEqual(await state(page),before);if(viewport.width===390){await page.mouse.move(0,0);await page.screenshot({path:`${folder}/${mode}.png`,animations:'disabled'});}
   if(mode==='draft'){
    await page.locator('[data-action=saveTradeDraft]').click();await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=resume]').click();await page.locator('.quick-actions [data-action=trade]').click();assert.equal(await page.locator('[name=giveCash]').inputValue(),'12.3');assert.equal(await page.locator('[data-action=tradeRemove]').count(),3);
   }
   checks.push({name:`${mode} at ${viewport.width}x${viewport.height}`,passed:true,draftAndSelectionPreserved:true,authoritativeStateUnchanged:true});
  }finally{await context.close()}
 }
 assert.deepEqual(errors,[]);console.log(`${checks.length} trade certificate/draft scenarios passed.`);
}catch(e){checks.push({passed:false,error:e.stack});console.error(e);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/TRADE_CERTIFICATE_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),checks,errors,limits:['Chromium mobile emulation, not physical devices.','Local real engine and draft storage; no live trade is sent to Supabase.']},null,2)+'\n');}
