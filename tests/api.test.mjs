import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(await realpath(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare}=require('miniflare'),{build}=require('esbuild');
const scratch=await mkdtemp(path.join(tmpdir(),'nusantara-api-'));
const output=await build({stdin:{contents:"import {GET,POST} from './app/api/game/route.ts';export default {fetch:r=>r.method==='GET'?GET(r):POST(r)}",resolveDir:process.cwd(),sourcefile:'test-entry.ts'},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers'],alias:{'@/lib/server/runtime':'./lib/server/runtime-sites.ts'},tsconfig:'tsconfig.json'});
const mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],d1Persist:scratch,bindings:{ALLOW_LEGACY_ROOM_CREATION:'true'}});
try{
 const db=await mf.getD1Database('DB');const sql=await readFile('drizzle/0000_green_paper_doll.sql','utf8');for(const part of sql.split('--> statement-breakpoint'))if(part.trim())await db.prepare(part.trim()).run();
 async function call(body,token='',user='test-user'){const result=await mf.dispatchFetch('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':token,'oai-authenticated-user-id':user},body:JSON.stringify(body)});return {status:result.status,data:await result.json()}}
 const created=await call({type:'CREATE',name:'Satu',rules:'classic'});assert.equal(created.status,200,JSON.stringify(created.data));const a=created.data;assert(a.token);assert(!a.seats[0].token);assert.equal(a.rules,'classic');console.log('PASS room creation, rule selection and token redaction');
 const joined=await call({type:'JOIN',code:a.code,name:'Dua'});assert.equal(joined.status,200);const b=joined.data,tokens=[a.token,b.token];
 assert.equal((await call({type:'START',code:a.code},a.token)).status,400);assert.equal((await call({type:'READY',code:a.code,ready:true},b.token)).status,200);
 const started=await call({type:'START',code:a.code},a.token);assert.equal(started.status,200);assert(!('decks' in started.data.state));assert.equal(started.data.state.rules.rent,'manual');assert.equal(started.data.state.phase,'starting');console.log('PASS ready gate, pinned rules and hidden deck');
 assert.equal((await call({type:'ACTION',code:a.code,action:{type:'START_ROLL',id:'wrong-seat',expectedVersion:0}},b.token)).status,400);console.log('PASS seat authorization');
 let state=started.data.state;
 while(state.phase==='starting'){const actor=state.starting.pending[0],result=await call({type:'ACTION',code:a.code,action:{type:'START_ROLL',id:crypto.randomUUID(),expectedVersion:state.version}},tokens[actor]);assert.equal(result.status,200);state=result.data.state}
 const token=tokens[state.turn],version=state.version;
 const simultaneous=await Promise.all([call({type:'ACTION',code:a.code,action:{type:'ROLL',id:'roll-a',expectedVersion:version}},token),call({type:'ACTION',code:a.code,action:{type:'ROLL',id:'roll-b',expectedVersion:version}},token)]);
 assert.equal(simultaneous.filter(r=>r.status===200).length,1);assert.equal(simultaneous.filter(r=>r.status===400).length,1);console.log('PASS concurrent command compare-and-swap');
 const good=simultaneous.find(r=>r.status===200),actionId=simultaneous[0].status===200?'roll-a':'roll-b';const retry=await call({type:'ACTION',code:a.code,action:{type:'ROLL',id:actionId,expectedVersion:version}},token);assert.equal(retry.status,200);assert.equal(retry.data.state.version,good.data.state.version);assert.deepEqual(retry.data.state.players,good.data.state.players);console.log('PASS duplicate command idempotency');
 const reconnect=await mf.dispatchFetch(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':b.token}});assert.equal(reconnect.status,200);assert.equal((await reconnect.json()).seat,1);
 const bad=await mf.dispatchFetch(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':'unknown'}});assert.equal(bad.status,400);console.log('PASS reconnect and invalid token rejection');
 assert.equal((await call({type:'JOIN',code:a.code,name:'Tiga'})).status,400);console.log('PASS late join rejection');
 const ai=await call({type:'CREATE',name:'Solo',mode:'ai'});assert.equal(ai.status,200);assert.equal(ai.data.state.players.length,2);assert.equal(ai.data.state.aiStatus,'Bot cadangan aktif');console.log('PASS AI fallback status without secret');
 const lobby=(await call({type:'CREATE',name:'Six'})).data;for(let i=1;i<6;i++){const seat=await call({type:'JOIN',code:lobby.code,name:'P'+i});assert.equal(seat.status,200);assert.equal(seat.data.seat,i)}assert.equal((await call({type:'JOIN',code:lobby.code,name:'Overflow'})).status,400);console.log('PASS six seats accepted, seventh rejected');
 console.log('API integration: 9 check groups passed.');
}finally{await mf.dispose();await rm(scratch,{recursive:true,force:true})}
