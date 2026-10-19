import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';import {createGame,stock} from '../../../../lib/game.mjs';import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({args:['--no-sandbox']}),results=[];
for(const [width,height,scale] of [[360,420,1]]){
 const c=await b.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));let s=createGame({startingRoll:false,players:Array.from({length:6},(_,i)=>({name:i?'BOT '+i:'QA Mobile',controller:i?'bot':'human',botPersona:['','raka','bima','sari','nusa','apex'][i]}))});
 s.assets[1].owner=0;s.assets[3].owner=0;s.assets[6].owner=0;s.assets[8].owner=0;s.assets[9].owner=0;s.bank=stock(s);
 await p.goto('http://127.0.0.1:8787',{waitUntil:'networkidle'});await p.evaluate(s=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null,persistedAt:Date.now()})),s);await p.reload({waitUntil:'networkidle'});await p.locator('[data-action=resume]').click();await p.locator('.board-stage').waitFor();
 if(scale!==1)await p.addStyleTag({content:`html{font-size:${scale*100}%}body{font-size:${scale*16}px}`});
 const metrics=await p.evaluate(()=>{const rect=x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return{viewport:{w:innerWidth,h:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth,board:rect(document.querySelector('.board-stage')),console:rect(document.querySelector('.action-console')),primary:rect(document.querySelector('[data-action=primary]')),smallButtons:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height<44).map(n=>({action:n.dataset.action,label:n.getAttribute('aria-label')||n.innerText,...rect(n)})),tileFont:getComputedStyle(document.querySelector('.tile-name')).fontSize,players:rect(document.querySelector('.players'))}});
 await p.screenshot({path:`docs/qa/follow-up/evidence/mobile-${width}x${height}-font${scale}.png`});
 const modals=[];for(const action of ['ownAssets','trade','bank','history']){
  await p.locator(`[data-action=${action}]`).first().click();await p.locator('dialog[open]').waitFor();const before=await p.locator('dialog[open]').boundingBox();const close=p.locator('dialog[open] .popup-dismiss');await close.scrollIntoViewIfNeeded();modals.push({action,bounds:before,close:await close.boundingBox(),text:(await p.locator('dialog[open]').innerText()).slice(0,250)});await p.screenshot({path:`docs/qa/follow-up/evidence/mobile-${width}x${height}-font${scale}-${action}.png`});await close.click();
 }
 results.push({width,height,fontScale:scale,metrics,modals,errors});await c.close();await writeFile('docs/qa/follow-up/evidence/short-mobile-audit.json',JSON.stringify(results,null,2));console.log({width,height,scale,metrics});
}
await b.close();
