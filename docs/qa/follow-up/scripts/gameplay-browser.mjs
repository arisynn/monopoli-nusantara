import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const folder='docs/qa/follow-up/evidence',start=Number(process.env.QA_FROM||0),runs=start?JSON.parse(await readFile(folder+'/browser-matches.json')).filter(r=>r.match<start):[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
async function button(page,selector){const b=page.locator(selector).first();if(await b.count()&&await b.isVisible()&&await b.isEnabled()){try{await b.click({timeout:600});return true}catch(e){if(e.name==='TimeoutError')return false;throw e}}return false}
for(const m of [0,4]){
 const n=m+2,origin='http://127.0.0.1:8787',viewport=[{width:360,height:800},{width:393,height:873},{width:412,height:915},{width:360,height:640},{width:393,height:700}][m];
 const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});await ctx.tracing.start({screenshots:true,snapshots:true});const p=await ctx.newPage();p.setDefaultTimeout(4000);const errors=[],network=[],actions=[],states=[],perf=[];p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>network.push({url:r.url().split('?')[0],failure:r.failure()}));const t=performance.now();let status='not_started',lastVersion=-1,lastChange=t;
 try{
  await p.goto(origin,{waitUntil:'networkidle',timeout:60000});await p.screenshot({path:`${folder}/match-${m}-lobby.png`});
  await p.locator('[data-action=startLocal]').click();await p.locator('[name=playerName]').fill(`QA Pemain ${m}`);await p.locator('[data-action=savePlayerName]').click();
  await p.locator('[data-action=setup]').first().click();await p.locator(`[data-action=count][data-value="${n}"]`).click();
  // Select a strategic persona in the first bot slot; retain unique remaining choices.
  await p.locator('[data-action=pickBot][data-slot="0"]').click();const chosen=['nusa','apex','kresna','apex','kresna'][m];await p.locator(`[data-action=chooseBotPersona][data-value="${chosen}"]`).click();
  await button(p,'dialog[open] .popup-dismiss');
  await p.locator('[data-action=menu]').click();await p.locator('[data-action=settings]').click();await p.locator('[name=fast]').check();await p.locator('[name=reduced]').check();await p.locator('[name=sound]').uncheck();await button(p,'dialog[open] .popup-dismiss');
  await p.locator('[data-action=startLocal]').click();await p.locator('.board-stage').waitFor();status='playing';await p.screenshot({path:`${folder}/match-${m}-start.png`});
  while(performance.now()-t<300000){
   const s=await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('nusantara-save-v1')).state}catch{return null}});if(!s){await p.waitForTimeout(100);continue}
   if(s.version!==lastVersion){lastVersion=s.version;lastChange=performance.now();states.push({version:s.version,phase:s.phase,turn:s.turn,round:s.round,players:s.players.map(p=>({id:p.id,cash:p.cash,pos:p.pos,out:p.out})),events:s.log.filter(e=>e.version===s.version)});if(s.version%20===0)perf.push(await p.evaluate(()=>({version:JSON.parse(localStorage.getItem('nusantara-save-v1')).state.version,dom:document.querySelectorAll('*').length,heap:performance.memory?.usedJSHeapSize,overflow:document.documentElement.scrollWidth>innerWidth})));}
   if(s.phase==='won'){status='normal_winner';break}if(s.version>=80){status='action_limit';break}if(performance.now()-lastChange>45000){status='no_progress_45s';break}
   let clicked=false,what=null;const dialog=p.locator('dialog[open]');
   if(await dialog.count()){
    const kind=await dialog.evaluateAll(ns=>ns[0]?.dataset.kind);
    const commands=['ACK','TRADE_REJECT','BUILD_DECLINE','MORTGAGE_KEEP','PAY','JAIL_CARD','ROLL'];
    if(kind==='buy')commands.unshift(m%2===0?'BUY':'AUCTION');
    for(const type of commands)if(await button(p,`dialog[open] [data-action=command][data-type="${type}"]`)){clicked=true;what=type;break}
    if(!clicked&&kind==='auction'&&s.auction?.highest!==0){clicked=await button(p,'dialog[open] [data-action=command][data-type=PASS]');what='PASS'}
    if(!clicked&&kind==='debt'){clicked=await button(p,'dialog[open] [data-action=autoPayDebt]');what='autoPayDebt';if(!clicked){clicked=await button(p,'dialog[open] [data-action=bankrupt]');what='bankrupt'}}
    if(!clicked){clicked=await button(p,'dialog[open] [data-action=ackEvent]');what='ackEvent'}
    if(!clicked){clicked=await button(p,'dialog[open] .popup-dismiss');what='dismiss:'+kind}
   }else{
    const primary=p.locator('[data-action=primary]');if(await primary.isEnabled()){
     const label=await primary.innerText();if(/Lempar|Akhiri|Tagih|Beli|kartu|penjara|tagihan|barter|lelang|tergadai/i.test(label)){clicked=await primary.click({timeout:600}).then(()=>true).catch(e=>{if(e.name==='TimeoutError')return false;throw e});what='primary:'+label}
    }
   }
   if(clicked){actions.push({elapsedMs:Math.round(performance.now()-t),beforeVersion:s.version,action:what});if(actions.length%20===0)await p.screenshot({path:`${folder}/match-${m}-action-${actions.length}.png`});}
   await p.waitForTimeout(clicked?120:220);
  }
  if(status==='playing')status='time_limit';
  await p.screenshot({path:`${folder}/match-${m}-end.png`});const final=await p.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1'))?.state);await writeFile(`${folder}/match-${m}-state.json`,JSON.stringify(final,null,2));
  runs.push({match:m,origin,n,viewport,roster:final.players.map(p=>({controller:p.controller,persona:p.botPersona||'human'})),durationMs:performance.now()-t,uiActions:actions.length,engineActions:final.version,status,winner:final.phase==='won'?final.winner:null,errors,network,actions,states,perf,finalText:await p.locator('body').innerText()});
 }catch(e){runs.push({match:m,origin,n,status:'harness_error',error:e.stack,errors,network,actions,states,finalText:await p.locator('body').innerText().catch(()=>'' )});await p.screenshot({path:`${folder}/match-${m}-failure.png`}).catch(()=>{});}
 await ctx.tracing.stop({path:`${folder}/match-${m}-trace.zip`});await ctx.close();await writeFile(`${folder}/browser-matches.json`,JSON.stringify(runs,null,2));console.log(JSON.stringify({...runs.at(-1),actions:undefined,states:undefined,finalText:undefined}));
}
await browser.close();
