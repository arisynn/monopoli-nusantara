import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {preservedCases,fixturePage} from './portrait-fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-portrait-qa',reference=process.env.MN_PORTRAIT_REFERENCE;
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),checks=[],errors=[];
async function metrics(page){return page.evaluate(()=>{
 const dialog=document.querySelector('dialog[open]'),node=dialog||document.querySelector('.lobby-panel'),r=node.getBoundingClientRect(),body=dialog?.querySelector('.popup-body'),footer=dialog?.querySelector('.popup-footer'),f=footer?.getBoundingClientRect();
 const bad=[...node.querySelectorAll('.lucide-icon')].filter(n=>{const b=n.getBoundingClientRect();return Math.abs(b.width-b.height)>.6||b.width===0}).length;
 return {width:r.width,height:r.height,x:r.x,y:r.y,bottom:r.bottom,right:r.right,footerBottom:f?.bottom,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,bodyOverflow:body?body.scrollWidth>body.clientWidth+1:false,density:dialog?.dataset.density,nonSquareIcons:bad};
})}
async function checkView(page,name,viewport){
 const m=await metrics(page);assert(m.x>=0&&m.right<=viewport.width+1,JSON.stringify({name,m}));assert(!m.horizontalOverflow&&!m.bodyOverflow,JSON.stringify({name,m}));assert.equal(m.nonSquareIcons,0,name);
 if(m.density){assert.equal(m.density,'compact',name);assert(m.y>=0&&m.bottom<=viewport.height+1);assert(m.footerBottom<=viewport.height+1);}
 checks.push({name:`${name} ${viewport.width}x${viewport.height}`,passed:true,metrics:m});return m;
}
async function selectCase(page,name){
 if(name==='setup')await page.locator('.setup-summary').click();
 else if(name==='pawn'){await page.locator('.setup-summary').click();await page.locator('dialog [data-action=pawn]').click();}
 else if(name==='onlineEntry')await page.locator('.lobby-secondary [data-action=onlineEntry]').click();
 else if(name==='auth'){await page.locator('.lobby-secondary [data-action=onlineEntry]').click();await page.locator('dialog [data-action=auth]').click();}
 else if(['menu','settings','rules','saves','room','allTiles'].includes(name)){
  await page.locator('[data-action=menu]').click();
  if(name==='allTiles'){await page.keyboard.press('Escape');await page.locator('[data-action=ownAssets]').click();await page.locator('dialog [data-action=allTiles]').click();}
  else if(name!=='menu')await page.locator(`dialog [data-action=${name}]`).click();
 }
 else if(name==='profile')await page.locator('.player-capsule[data-id="0"]').click();
 else if(['assets','build','auto'].includes(name)){await page.locator('[data-action=ownAssets]').click();if(name!=='assets')await page.locator(`[data-action=assetTab][aria-pressed][data-value=${name}]`).click();}
 else if(name==='trade')await page.locator('.quick-actions [data-action=trade]').click();
 else if(name==='history')await page.locator('[data-action=history]').click();
 else if(name==='tax'){await page.locator('[data-tile="4"]').focus();await page.keyboard.press('Enter');}
 if(name!=='lobby'){await page.locator('dialog[open]').waitFor();await page.locator('dialog[open]').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});}
 await page.mouse.move(0,0);
}
try{
 for(const c of preservedCases){
  const {context,page}=await fixturePage(browser,origin,c);page.on('pageerror',e=>errors.push(e.message));await page.mouse.move(0,0);
  if(!c.id.startsWith('game-')){assert.equal(await page.locator('dialog').getAttribute('data-density'),'preserved');assert.equal(await page.locator('dialog .lucide-icon').count(),0);}
  const png=await page.screenshot({path:`${folder}/${c.id}.png`,animations:'disabled'}),hash=createHash('sha256').update(png).digest('hex');
  if(reference){const old=await readFile(`${reference}/${c.id}.png`);assert(png.equals(old),`Protected screenshot changed: ${c.id}`);}
  checks.push({name:`preserved ${c.id}`,passed:true,sha256:hash,pixelCompared:!!reference});await context.close();
 }
 const viewports=[{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932}];
 const allNames=['lobby','setup','pawn','onlineEntry','auth','menu','settings','rules','saves','profile','assets','build','auto','trade','history','allTiles','tax','jail','debt','auction','won'];
 const names=process.env.MN_PORTRAIT_CASES?allNames.filter(n=>process.env.MN_PORTRAIT_CASES.split(',').includes(n)):allNames;
 for(const viewport of viewports)for(const name of names){
  const kind=['jail','debt','auction','won'].includes(name)?name:'game',lobby=['lobby','setup','pawn','onlineEntry','auth'].includes(name);
  const {context,page}=await fixturePage(browser,origin,{viewport,kind,lobby});page.on('pageerror',e=>errors.push(e.message));await selectCase(page,name);
  await checkView(page,name,viewport);
  if(name==='onlineEntry'){
   const icon=page.locator('.identity-chip [data-lucide=people]');assert.equal(await icon.count(),1);const b=await icon.boundingBox();assert(Math.abs(b.width-b.height)<.1&&b.width===20);
  }
  if(viewport.width===390)await page.screenshot({path:`${folder}/${name}.png`,animations:'disabled'});
  await context.close();if(name===names.at(-1))console.log(`Portrait ${viewport.width}: ${names.length} scenarios passed.`);
 }
 // Text inputs remain usable and footer stays within the resized visual viewport.
 {const viewport={width:360,height:420},{context,page}=await fixturePage(browser,origin,{viewport,lobby:true});await selectCase(page,'auth');await page.locator('[name=email]').fill('player@example.com');await checkView(page,'auth with reduced viewport',viewport);await context.close();}
 // Desktop adapts to the compact content without changing the game board layout.
 {const viewport={width:1280,height:800},{context,page}=await fixturePage(browser,origin,{viewport,lobby:true});await selectCase(page,'setup');await checkView(page,'desktop setup',viewport);await context.close();}
 assert.deepEqual(errors,[]);console.log(`${checks.length} portrait/protection scenarios passed.`);
}catch(error){checks.push({name:'portrait failure',passed:false,error:error.stack});console.error(error);process.exitCode=1;}
finally{await browser.close();await writeFile(process.env.MN_PORTRAIT_REPORT||'docs/PORTRAIT_BROWSER_RESULTS.json',JSON.stringify({generatedAt:new Date().toISOString(),referenceUsed:!!reference,checks,errors,limits:['Chromium mobile emulation; no physical Android or iOS device.','Online forms tested locally; no real account is created.','Pixel equality is compared only against a reference captured in the same environment.']},null,2)+'\n');}
