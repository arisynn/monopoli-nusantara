import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({headless:true,args:['--no-sandbox']}),out={mode:'live-production-two-independent-contexts',steps:[],errors:[],requests:[]},contexts=[];const origin='https://monopoli-nusantara-eight.vercel.app';
async function snap(p,name){await p.screenshot({path:`docs/qa/evidence/online-${name}.png`});out.steps.push({name,text:await p.locator('body').innerText()});await writeFile('docs/qa/evidence/multiplayer-live.json',JSON.stringify(out,null,2))}
async function client(name){const c=await b.newContext({viewport:{width:393,height:873},reducedMotion:'reduce'});contexts.push(c);const p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>out.errors.push({name,message:e.message}));p.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))out.requests.push({client:name,path:new URL(r.url()).pathname,status:r.status()})});await p.goto(origin,{waitUntil:'networkidle'});await p.locator('[data-action=startLocal]').click();await p.locator('[name=playerName]').fill(name);await p.locator('[data-action=savePlayerName]').click();await p.locator('[data-action=onlineEntry]').click();await p.locator('[data-action=auth]').click();await p.locator('[data-action=guest]').click();await p.locator('dialog[data-kind=onlineEntry]').waitFor({timeout:30000});await snap(p,name+'-authenticated');return {c,p};}
let host,guest,code;
try{
 host=await client('QA Host');guest=await client('QA Guest');
 await host.p.locator('[data-selection-name=capacity]').click();await host.p.locator('.selection-options [data-value="3"]').click();await host.p.locator('[data-action=enterRoom]').click();await host.p.locator('.room-code b').waitFor({timeout:30000});code=await host.p.locator('.room-code b').innerText();out.qaRoom=code;await snap(host.p,'host-room');
 await guest.p.locator('[data-action=onlineTab][data-value=join]').click();await guest.p.locator('[name=joinCode]').fill(code);await guest.p.locator('[data-action=enterRoom]').click();await guest.p.locator('.room-code b').waitFor({timeout:30000});await snap(guest.p,'guest-joined');
 console.log('ROOM',code);await host.p.waitForFunction(()=>document.querySelectorAll('.lobby-player:not(.empty-seat)').length===2,{timeout:30000});
 for(const [who,x] of [['host',host],['guest',guest]]){await x.p.locator('[data-action=ready]').click();await x.p.waitForFunction(()=>document.querySelector('[data-action=ready]')?.textContent==='Batal siap',{timeout:30000});await snap(x.p,who+'-ready');}
 await host.p.waitForFunction(()=>!document.querySelector('[data-action=startRoom]')?.disabled,{timeout:30000});const start=host.p.locator('[data-action=startRoom]');out.startEnabled=await start.isEnabled();
 if(out.startEnabled){await start.click();for(const x of [host,guest])await x.p.locator('.board-stage').waitFor({timeout:30000});await snap(host.p,'started');
  for(let i=0;i<24;i++){for(const x of [host,guest]){
   const p=x.p;const open=p.locator('dialog[open]');let click=null;
   if(await open.count()){
    for(const type of ['ACK','BUY','TRADE_REJECT','PASS','ROLL']){const el=p.locator(`dialog[open] [data-action=command][data-type=${type}]`).first();if(await el.count()&&await el.isEnabled()){click=el;break}}
    if(!click){const el=p.locator('dialog[open] .popup-dismiss');if(await el.count()&&await el.isVisible()&&await el.isEnabled())click=el}
   }else{const el=p.locator('[data-action=primary]');if(await el.isEnabled()&&/Lempar|Akhiri/.test(await el.innerText()))click=el}
   if(click)await click.click();
  }await host.p.waitForTimeout(650)}
  await snap(host.p,'host-gameplay');await snap(guest.p,'guest-gameplay');
  await guest.p.reload({waitUntil:'networkidle'});if(await guest.p.locator('[data-action=resume]').isEnabled())await guest.p.locator('[data-action=resume]').click();await snap(guest.p,'refresh');
  await guest.c.setOffline(true);await host.p.waitForTimeout(3000);await snap(host.p,'guest-offline-3s');await guest.c.setOffline(false);await guest.p.waitForTimeout(4000);await snap(guest.p,'reconnected');
 }
}catch(e){out.failure=e.stack;if(host)await snap(host.p,'host-failure').catch(()=>{});if(guest)await snap(guest.p,'guest-failure').catch(()=>{});console.log(e.stack)}finally{
 // Only UI leave operations on the room created by this audit; never delete database records.
 for(const [name,x] of [['guest',guest],['host',host]])if(x&&code){try{const p=x.p;if(await p.locator('dialog[open]').count())await p.locator('dialog[open] .popup-dismiss').click();if(!await p.locator('[data-action=leaveRoomConfirm]').count()){if(await p.locator('[data-action=menu]').count())await p.locator('[data-action=menu]').click();if(await p.locator('[data-action=room]').count())await p.locator('[data-action=room]').first().click();}const leave=p.locator('[data-action=leaveRoomConfirm]');if(await leave.count()){await leave.click();await p.locator('[data-action=leaveRoom]').click();out.steps.push({name:name+'-left-qa-room'})}}catch(e){out.steps.push({name:name+'-leave-unavailable',message:e.message})}}
 await writeFile('docs/qa/evidence/multiplayer-live.json',JSON.stringify(out,null,2));await b.close();
}
