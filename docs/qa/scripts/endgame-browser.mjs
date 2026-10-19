import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';import {createGame,command,stock} from '../../../lib/game.mjs';import {createBankEconomy} from '../../../lib/bank-economy.mjs';import {validateLocalState} from '../../../lib/save-format.mjs';import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({args:['--no-sandbox']}),results=[];
for(let i=0;i<5;i++){
 const n=i+2,humanWins=i%2===0,bot=n-1,debtor=humanWins?bot:0,creditor=humanWins?0:bot,personas=['raka','bima','sari','nusa','kresna'];let s=createGame({startingRoll:false,players:Array.from({length:n},(_,j)=>({name:j?personas[j-1]:'QA Final',controller:j?'bot':'human',botPersona:personas[j-1]}))},()=>.4);
 for(const p of s.players)if(p.id!==0&&p.id!==bot){p.out=true;p.cash=0}
 for(const tile of [6,8,9])s.assets[tile]={owner:creditor,level:5,mortgaged:false};s.bank=stock(s);s.players[debtor].cash=10;s.bankEconomy=createBankEconomy(s,{complete:false});s.turn=debtor;s=command(s,debtor,{type:'ROLL',id:'qa-fixture-roll'},()=>.4);validateLocalState(s);if(s.phase!=='debt')throw Error('Fixture not debt');
 const c=await b.newContext({viewport:{width:[360,393,412,360,393][i],height:[800,873,915,640,700][i]},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));const t=performance.now();
 try{await p.goto('http://127.0.0.1:8787',{waitUntil:'networkidle'});await p.evaluate(s=>localStorage.setItem('nusantara-save-v1',JSON.stringify({state:s,room:null,persistedAt:Date.now()})),s);await p.reload({waitUntil:'networkidle'});await p.locator('[data-action=resume]').click();await p.locator('.board-stage').waitFor();await p.screenshot({path:`docs/qa/evidence/endgame-${i}-before.png`});
 let actions=0;if(!humanWins){await p.locator('[data-action=bankrupt]').click();await p.locator('[data-action=command][data-type=BANKRUPT]').click();actions+=2}
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('nusantara-save-v1'))?.state.phase==='won',{timeout:30000});
 // Allow ledger/event presentation to settle; close only visible informational modals.
 for(let z=0;z<20;z++){if(await p.locator('dialog[data-kind=won][open]').count())break;const close=p.locator('dialog[open] .popup-dismiss');if(await close.count()&&await close.isVisible()){await close.click();actions++}await p.waitForTimeout(180)}
 const final=await p.evaluate(()=>JSON.parse(localStorage.getItem('nusantara-save-v1')).state);await p.screenshot({path:`docs/qa/evidence/endgame-${i}-winner.png`});results.push({i,n,humanWins,fixture:true,durationMs:performance.now()-t,uiActions:actions,engineActions:final.version-s.version,winner:final.winner,wonModal:await p.locator('dialog[data-kind=won][open]').count(),text:await p.locator('body').innerText(),errors});
 await writeFile(`docs/qa/evidence/endgame-${i}-states.json`,JSON.stringify({fixture:s,final},null,2));
 }catch(e){results.push({i,n,humanWins,error:e.stack,errors,text:await p.locator('body').innerText()});await p.screenshot({path:`docs/qa/evidence/endgame-${i}-failure.png`})}
 await c.close();await writeFile('docs/qa/evidence/endgames.json',JSON.stringify(results,null,2));console.log(results.at(-1));
}
await b.close();
