import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {preservedCases,fixturePage} from './portrait-fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MN_BROWSER_MODULE||'playwright');
const origin=process.env.MN_TEST_ORIGIN||'http://127.0.0.1:8787',folder=process.env.MN_BROWSER_OUTPUT||'/tmp/nusa-portrait-before';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MN_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),captures=[];
try {
 for(const c of preservedCases){const {context,page}=await fixturePage(browser,origin,c);await page.mouse.move(0,0);const png=await page.screenshot({path:`${folder}/${c.id}.png`,animations:'disabled'});captures.push({id:c.id,sha256:createHash('sha256').update(png).digest('hex')});await context.close();}
 for(const name of (process.env.MN_PROTECTED_ONLY?[]:['lobby','setup','menu','settings','profile','assets','trade','jail','debt'])){
  const isLobby=['lobby','setup'].includes(name),{context,page}=await fixturePage(browser,origin,{lobby:isLobby,kind:['jail','debt'].includes(name)?name:'game'});
  if(name==='setup')await page.locator('.setup-summary[data-action=setup]').click();
  else if(name==='menu'||name==='settings'){await page.locator('[data-action=menu]').click();if(name==='settings')await page.locator('dialog [data-action=settings]').click();}
  else if(name==='profile')await page.locator('.player-capsule[data-id="0"]').click();
  else if(name==='assets')await page.locator('[data-action=ownAssets]').click();
  else if(name==='trade')await page.locator('.quick-actions [data-action=trade]').click();
  if(!['lobby'].includes(name))await page.locator('dialog[open]').waitFor();
  await page.mouse.move(0,0);await page.screenshot({path:`${folder}/${name}.png`,animations:'disabled'});
  const metrics=await page.evaluate(()=>{const n=document.querySelector('dialog[open]')||document.querySelector('.lobby-panel'),r=n.getBoundingClientRect();return {width:r.width,height:r.height,bodyHeight:document.querySelector('.popup-body')?.scrollHeight}});captures.push({id:name,metrics});await context.close();
 }
} finally {await browser.close();if(process.env.MN_PROTECTED_ONLY){try{const {readFile}=await import('node:fs/promises');const old=JSON.parse(await readFile(`${folder}/captures.json`,'utf8'));captures.push(...old.captures.filter(c=>!captures.some(n=>n.id===c.id)));}catch{}}await writeFile(`${folder}/captures.json`,JSON.stringify({origin,captures},null,2)+'\n');}
console.log(`Captured ${captures.length} reference views.`);
