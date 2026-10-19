import {chromium} from '/tmp/nusa-qa-browser/node_modules/playwright/index.mjs';import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({args:['--no-sandbox']}),origin='https://monopoli-nusantara-eight.vercel.app',out={steps:[],requests:[],sockets:[],errors:[],cases:[]},clients=[];let code;
async function save(){await writeFile('docs/qa/evidence/multiplayer-advanced.json',JSON.stringify(out,null,2))}
async function snap(x,name){await x.p.screenshot({path:`docs/qa/evidence/advanced-${name}.png`});out.steps.push({name,text:await x.p.locator('body').innerText()});await save()}
async function client(name){const c=await b.newContext({viewport:{width:393,height:873},reducedMotion:'reduce'}),p=await c.newPage(),x={c,p,name};clients.push(x);p.setDefaultTimeout(15000);p.on('pageerror',e=>out.errors.push({name,error:e.message}));p.on('requestfinished',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))out.requests.push({client:name,method:r.method(),path:new URL(r.url()).pathname,timing:r.timing()})});p.on('websocket',ws=>{const row={client:name,host:new URL(ws.url()).hostname,received:0,errors:0};out.sockets.push(row);ws.on('framereceived',()=>row.received++);ws.on('socketerror',()=>row.errors++)});
 await p.goto(origin,{waitUntil:'networkidle'});await p.locator('[data-action=startLocal]').click();await p.locator('[name=playerName]').fill(name);await p.locator('[data-action=savePlayerName]').click();await p.locator('[data-action=onlineEntry]').click();await p.locator('[data-action=auth]').click();await p.locator('[data-action=guest]').click();await p.locator('dialog[data-kind=onlineEntry]').waitFor({timeout:30000});
 await p.evaluate(async()=>{const config=await fetch('/api/online?config=1').then(r=>r.json());const {OnlineAuth}=await import('/lib/online-client.mjs');window.qaAuditAuth=new OnlineAuth(config)});return x;
}
async function rpc(x,body,path=''){return await x.p.evaluate(async({body,path})=>{try{return {ok:true,data:await window.qaAuditAuth.request(path,body)}}catch(e){return{ok:false,message:e.message,status:e.status,code:e.code}}},{body,path})}
async function read(x){const r=await rpc(x,undefined,'?code='+code);if(!r.ok)throw Error(r.message);return r.data}
async function act(x,type,extra={},id=crypto.randomUUID(),version){const s=(await read(x)).state;return rpc(x,{type:'ACTION',code,clientId:await x.p.evaluate(()=>sessionStorage.getItem('nusantara-connection')),requestId:id,action:{type,...extra,id,expectedVersion:version??s.version}})}
async function recordCase(name,data){out.cases.push({name,...data});await save()}
async function dismiss(x){const el=x.p.locator('dialog[open] .popup-dismiss');if(await el.count()&&await el.isVisible())await el.click()}
try{
 const h=await client('QA Advanced Host'),g=await client('QA Advanced Guest');
 out.diagnostics=(await rpc(h,undefined,'?diagnostics=1')).data;
 await h.p.locator('[data-selection-name=capacity]').click();await h.p.locator('.selection-options [data-value="3"]').click();await h.p.locator('[data-action=enterRoom]').click();await h.p.locator('.room-code b').waitFor({timeout:30000});code=await h.p.locator('.room-code b').innerText();out.qaRoom=code;
 await g.p.locator('[data-action=onlineTab][data-value=join]').click();await g.p.locator('[name=joinCode]').fill(code);await g.p.locator('[data-action=enterRoom]').click();await g.p.locator('.room-code b').waitFor({timeout:30000});await h.p.waitForFunction(()=>document.querySelectorAll('.lobby-player:not(.empty-seat)').length===2,{timeout:30000});
 await h.p.locator('[data-action=addBotPopup]').click();await h.p.locator('[data-action=addBot]').click();await h.p.waitForTimeout(2000);await snap(h,'add-bot');let row=await read(h);out.botAdded=row.seats.some(s=>s.controller==='bot');await dismiss(h);
 // A failed preflight does not prevent the two-human test.
 for(const x of [h,g]){await x.p.locator('[data-action=ready]').click();await x.p.waitForFunction(()=>document.querySelector('[data-action=ready]')?.textContent==='Batal siap',{timeout:30000})}
 await h.p.waitForFunction(()=>!document.querySelector('[data-action=startRoom]')?.disabled,{timeout:30000});await h.p.locator('[data-action=startRoom]').click();for(const x of [h,g])await x.p.locator('.board-stage').waitFor({timeout:30000});await snap(h,'started');
 // Drive lawful opening rolls through the UI.
 for(let i=0;i<40;i++){row=await read(h);if(row.state.phase!=='starting')break;const x=clients[row.state.starting.pending[0]];if(!x)break;await act(x,'START_ROLL');await x.p.waitForTimeout(150)}
 for(let i=0;i<20;i++){row=await read(h);if(row.state.phase==='roll')break;await h.p.waitForTimeout(200)}
 const base=row.state,owner=clients[base.turn],other=clients[1-base.turn];
 if(owner&&other&&base.phase==='roll'){
  await recordCase('wrong_turn_roll',{result:await act(other,'ROLL',{},crypto.randomUUID(),base.version)});
  const id=crypto.randomUUID(),before=(await read(owner)).state;
  const both=await Promise.all([act(owner,'ROLL',{},id,before.version),act(owner,'ROLL',{},id,before.version)]);const after=(await read(owner)).state;
  await recordCase('same_request_concurrent_roll',{responses:both.map(r=>({ok:r.ok,error:r.message,version:r.data?.state?.version})),versionBefore:before.version,versionAfter:after.version,dice:after.dice});
  await recordCase('changed_payload_same_request_id',{result:await act(owner,'END',{},id,before.version)});
  await recordCase('late_previous_version',{result:await act(owner,'ROLL',{},crypto.randomUUID(),before.version)});
  await snap(owner,'race-after');
 }
 // Finish active nontrade decisions with lawful API commands on our own seats; then trade.
 for(let i=0;i<8;i++){row=await read(h);const s=row.state,x=clients[s.turn];if(!x)break;if(['roll','end'].includes(s.phase))break;if(s.phase==='buy')await act(x,'BUY');else if(s.phase==='card')await act(clients[s.card.player],'ACK');else break;await h.p.waitForTimeout(300)}
 row=await read(h);if(['roll','end'].includes(row.state.phase)){
  const offer=await act(h,'OFFER',{trade:{to:1,give:[],take:[],giveCash:100,takeCash:0,giveCards:0,takeCards:0}});await recordCase('human_trade_offer',{ok:offer.ok,error:offer.message});
  if(offer.ok){await g.p.locator('dialog[data-kind=tradeIncoming][open]').waitFor({timeout:30000});await snap(g,'trade-incoming');await g.p.locator('[data-type=TRADE_ACCEPT]').click();await g.p.locator('dialog[data-kind=tradeResult][open]').waitFor({timeout:30000});await snap(g,'trade-result-guest');await h.p.locator('dialog[data-kind=tradeResult][open]').waitFor({timeout:30000});await snap(h,'trade-result-host');
   const state=(await read(h)).state;out.tradeAfter={version:state.version,cash:state.players.map(p=>p.cash),results:state.log.filter(e=>e.tradeResult)};
   for(const x of [g,h])await dismiss(x);
  }
 }
 // Read both independent sessions after state convergence.
 const a=await read(h),z=await read(g);await recordCase('authoritative_snapshot_agreement',{same:JSON.stringify(a.state)===JSON.stringify(z.state),hostVersion:a.state.version,guestVersion:z.state.version});
 await g.p.reload({waitUntil:'networkidle'});await g.p.waitForFunction(()=>!document.querySelector('[data-action=resume]')?.disabled,{timeout:15000});await g.p.locator('[data-action=resume]').click();await g.p.locator('.board-stage').waitFor({timeout:30000});await snap(g,'refresh-resumed');
 // Restore only the read-only helper lost on page reload.
 await g.p.evaluate(async()=>{const config=await fetch('/api/online?config=1').then(r=>r.json());const {OnlineAuth}=await import('/lib/online-client.mjs');window.qaAuditAuth=new OnlineAuth(config)});
 await g.c.setOffline(true);await h.p.waitForTimeout(4000);await snap(h,'offline-short');await g.c.setOffline(false);await g.p.waitForTimeout(3000);await snap(g,'reconnected');
}catch(e){out.failure=e.stack;for(const x of clients)await snap(x,x.name.replaceAll(' ','-')+'-failure').catch(()=>{})}finally{
 // Leave only our newly created QA room, through the normal authenticated operation.
 if(code)for(const x of [...clients].reverse()){try{const result=await rpc(x,{type:'LEAVE',code,clientId:await x.p.evaluate(()=>sessionStorage.getItem('nusantara-connection')),requestId:crypto.randomUUID()});out.cases.push({name:x.name+' leave own QA room',ok:result.ok,error:result.message})}catch{}}
 await save();await b.close();console.log({code,botAdded:out.botAdded,cases:out.cases,failure:out.failure});
}
