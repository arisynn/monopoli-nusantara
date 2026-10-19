import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';import {writeFile,readFile} from 'node:fs/promises';
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']}),runs=[];
async function click(p,sel){const e=p.locator(sel).first();if(await e.count()&&await e.isVisible()&&await e.isEnabled()){try{await e.click({timeout:700});return true}catch(err){if(err.name==='TimeoutError')return false;throw err}}return false}
async function run(m){const c=await browser.newContext({viewport:{width:393,height:873},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[],actions=[],states=[];p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));const saved=JSON.parse(await readFile(`docs/qa/evidence/match-${m}-state.json`)),t=performance.now();let last=saved.version,lastChange=t,status='time_limit',final;
 try{await p.goto('http://127.0.0.1:8787',{waitUntil:'networkidle'});await p.evaluate(s=>{localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null,persistedAt:Date.now()}));localStorage.setItem('nusantara-player-name',s.players[0].name)},saved);await p.reload({waitUntil:'networkidle'});await p.locator('[data-action=resume]').click();await p.locator('.board-stage').waitFor();await click(p,'dialog[open] .popup-dismiss');await p.locator('[data-action=menu]').click();await p.locator('[data-action=settings]').click();await p.locator('[name=fast]').check();await p.locator('[name=reduced]').check();await p.locator('[name=sound]').uncheck();await click(p,'dialog[open] .popup-dismiss');
 while(performance.now()-t<600000){const s=await p.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state);final=s;if(s.version!==last){last=s.version;lastChange=performance.now();states.push({version:s.version,phase:s.phase,turn:s.turn,round:s.round,cash:s.players.map(p=>p.cash),out:s.players.map(p=>p.out),events:s.log.filter(e=>e.version===s.version)});if(s.version%100===0)await p.screenshot({path:`docs/qa/evidence/continued-${m}-v${s.version}.png`});}
 if(s.phase==='won'){status='normal_winner';break}if(s.version>=1800){status='action_limit';break}if(performance.now()-lastChange>60000){status='no_progress_60s';break}
 let what=null;const d=p.locator('dialog[open]');if(await d.count()){
 const kind=await d.evaluateAll(ns=>ns[0]?.dataset.kind);if(['tradeResult','bankrupt','event','settlement'].includes(kind)){
  if(kind==='bankrupt'){if(await click(p,'dialog[open] [data-type=BANKRUPT]'))what='BANKRUPT'}
  else if(kind==='event'){if(await click(p,'dialog[open] [data-type=ACK]'))what='ACK'}
  if(!what&&await click(p,'dialog[open] .popup-dismiss'))what='close:'+kind;
 }else{
 const cmds=['ACK','TRADE_REJECT','BUILD_DECLINE','MORTGAGE_KEEP','PAY','JAIL_CARD','ROLL'];if(kind==='buy')cmds.unshift(s.players[0].cash>2500?'BUY':'AUCTION');if(kind==='auction')cmds.unshift('PASS');
 for(const type of cmds)if(await click(p,`dialog[open] [data-action=command][data-type=${type}]`)){what=type;break}
 if(!what&&kind==='debt'){if(await click(p,'dialog[open] [data-action=autoPayDebt]'))what='autoPayDebt';else if(await click(p,'dialog[open] [data-action=bankrupt]'))what='confirm-bankrupt'}
 if(!what&&await click(p,'dialog[open] .popup-dismiss'))what='close:'+kind;
 }
 }else{const b=p.locator('[data-action=primary]');if(await b.isEnabled()&&/Lempar|Akhiri|Tagih|Beli|kartu|penjara|tagihan|barter|lelang|tergadai/i.test(await b.innerText())){what='primary:'+await b.innerText();await b.click({timeout:700}).catch(e=>{if(e.name!=='TimeoutError')throw e})}}
 if(what)actions.push({ms:Math.round(performance.now()-t),version:s.version,action:what});await p.waitForTimeout(what?120:200);
 }
 await p.screenshot({path:`docs/qa/evidence/continued-${m}-end.png`});await writeFile(`docs/qa/evidence/continued-${m}-state.json`,JSON.stringify(final,null,2));runs.push({match:m,source:'Restored exact autosave from previously played browser game into isolated local browser; no RNG/state changes during continuation',startVersion:saved.version,finalVersion:final.version,additionalEngineActions:final.version-saved.version,uiActions:actions.length,durationMs:performance.now()-t,status,winner:final.phase==='won'?final.winner:null,winnerController:final.phase==='won'?final.players[final.winner].controller:null,errors,actions,states,finalText:await p.locator('body').innerText()});
 }catch(e){runs.push({match:m,status:'harness_error',error:e.stack,errors,actions,states})}finally{await c.close();await writeFile('docs/qa/evidence/'+(process.env.QA_OUTPUT|| (process.env.QA_MATCH_LIST?'browser-continuations-retry.json':'browser-continuations.json')),JSON.stringify(runs,null,2));console.log(JSON.stringify({...runs.at(-1),actions:undefined,states:undefined,finalText:undefined}))}
}
await Promise.all((process.env.QA_MATCH_LIST?process.env.QA_MATCH_LIST.split(',').map(Number):[0,1,2,3,4]).map(run));await browser.close();
