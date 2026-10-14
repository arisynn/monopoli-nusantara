import {createRequire} from 'node:module';import {readFile,mkdtemp,rm,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(await realpath(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare}=require('miniflare'),{build}=require('esbuild');
const scratch=await mkdtemp(path.join(tmpdir(),'nusantara-api-'));
const output=await build({stdin:{contents:"import {GET,POST} from './app/api/game/route.ts';export default {fetch:r=>r.method==='GET'?GET(r):POST(r)}",resolveDir:process.cwd(),sourcefile:'test-entry.ts'},bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers'],tsconfig:'tsconfig.json'});
const mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],d1Persist:scratch});
try{
 const db=await mf.getD1Database('DB');const sql=await readFile('drizzle/0000_green_paper_doll.sql','utf8');for(const part of sql.split('--> statement-breakpoint')){if(part.trim())await db.prepare(part.trim()).run()}
 async function call(body,token='',user='test-user'){let result=await mf.dispatchFetch('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':token,'oai-authenticated-user-id':user},body:JSON.stringify(body)});return {status:result.status,data:await result.json()}}
 let created=await call({type:'CREATE',name:'Satu'});assert.equal(created.status,200,JSON.stringify(created.data));let a=created.data;assert(a.token);assert(!a.seats[0].token);console.log('PASS room creation and token redaction');
 let joined=await call({type:'JOIN',code:a.code,name:'Dua'});assert.equal(joined.status,200);let b=joined.data;
 assert.equal((await call({type:'START',code:a.code},a.token)).status,400);
 assert.equal((await call({type:'READY',code:a.code,ready:true},b.token)).status,200);
 let started=await call({type:'START',code:a.code},a.token);assert.equal(started.status,200);assert(!('decks' in started.data.state));console.log('PASS ready gate and hidden deck');
 assert.equal((await call({type:'ACTION',code:a.code,action:{type:'ROLL',id:'wrong-seat',expectedVersion:0}},b.token)).status,400);console.log('PASS seat authorization');
 const simultaneous=await Promise.all([call({type:'ACTION',code:a.code,action:{type:'ROLL',id:'roll-a',expectedVersion:0}},a.token),call({type:'ACTION',code:a.code,action:{type:'ROLL',id:'roll-b',expectedVersion:0}},a.token)]);assert.equal(simultaneous.filter(r=>r.status===200).length,1);assert.equal(simultaneous.filter(r=>r.status===400).length,1);console.log('PASS concurrent command compare-and-swap');
 let good=simultaneous.find(r=>r.status===200);let actionId=simultaneous[0].status===200?'roll-a':'roll-b';let retry=await call({type:'ACTION',code:a.code,action:{type:'ROLL',id:actionId,expectedVersion:0}},a.token);assert.equal(retry.status,200);assert.equal(retry.data.state.version,good.data.state.version);assert.deepEqual(retry.data.state.players,good.data.state.players);console.log('PASS duplicate command idempotency');
 const reconnect=await mf.dispatchFetch(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':b.token}});assert.equal(reconnect.status,200);assert.equal((await reconnect.json()).seat,1);
 const bad=await mf.dispatchFetch(`https://game.test/api/game?code=${a.code}`,{headers:{'X-Room-Token':'unknown'}});assert.equal(bad.status,400);console.log('PASS reconnect and invalid token rejection');
 assert.equal((await call({type:'JOIN',code:a.code,name:'Tiga'})).status,400);console.log('PASS late join rejection');
 let ai=await call({type:'CREATE',name:'Solo',mode:'ai'});assert.equal(ai.status,200);assert.equal(ai.data.state.players.length,2);assert.equal(ai.data.state.aiStatus,'Bot cadangan aktif');console.log('PASS AI fallback status without secret');
 console.log('API integration: 8 checks passed.');
}finally{await mf.dispose();await rm(scratch,{recursive:true,force:true})}
