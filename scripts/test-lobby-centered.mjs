import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fixturePage} from './portrait-fixtures.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.MN_BROWSER_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']}),checks=[];
try{
 for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:430,height:932},{width:360,height:420},{width:1280,height:800}]){
  const {context,page}=await fixturePage(browser,process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',{viewport,lobby:true});
  await page.locator('.setup-summary').click();await page.locator('[data-action=count][data-value="4"]').click();
  await page.locator('dialog .popup-footer [data-action=close]').click();
  const m=await page.evaluate(()=>{const lobby=document.querySelector('.lobby'),panel=document.querySelector('.lobby-panel'),footer=lobby.querySelector('.version-line'),l=lobby.getBoundingClientRect(),p=panel.getBoundingClientRect(),f=footer.getBoundingClientRect();return {top:p.top,bottom:f.bottom,left:p.left,right:p.right,centerOffset:Math.abs((p.top+f.bottom)/2-(l.top+l.bottom)/2),scrollHeight:lobby.scrollHeight,clientHeight:lobby.clientHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,roster:document.querySelectorAll('.lobby-player').length};});
  assert.equal(m.roster,4);assert(!m.horizontalOverflow);assert(m.left>=0&&m.right<=viewport.width+1);if(m.scrollHeight<=m.clientHeight+1)assert(m.centerOffset<2,JSON.stringify(m));else assert(m.top>=0,JSON.stringify(m));
  await page.locator('[data-action=startLocal]').scrollIntoViewIfNeeded();assert(await page.locator('[data-action=startLocal]').isVisible());checks.push({viewport,passed:true,metrics:m});
  if(viewport.width===390)await page.screenshot({path:'docs/screenshots-490/lobby.png',animations:'disabled'});
  await context.close();
 }
 console.log(`${checks.length} centered lobby scenarios passed.`);
}catch(e){checks.push({passed:false,error:e.stack});console.error(e);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/LOBBY_CENTERED_RESULTS.json',JSON.stringify({checks},null,2)+'\n');}
