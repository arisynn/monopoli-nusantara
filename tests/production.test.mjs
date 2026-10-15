import {createRequire} from 'node:module';
import {realpath,readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const require=createRequire(await realpath(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare}=require('miniflare');
const moduleFiles=(await readdir('dist/server',{recursive:true})).filter(file=>/\.m?js$/.test(file));
moduleFiles.sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const mf=new Miniflare({
  modules:moduleFiles.map(file=>({type:'ESModule',path:path.resolve('dist/server',file)})),
  modulesRoot:path.resolve('dist/server'),
  compatibilityDate:'2026-05-15',
  compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'],
  serviceBindings:{
    ASSETS:async request=>{
      try{
        const url=new URL(request.url);
        const file=path.resolve('dist/client','.'+decodeURIComponent(url.pathname));
        if(!file.startsWith(path.resolve('dist/client')+'/'))return new Response('Not found',{status:404});
        return new Response(await readFile(file));
      }catch{return new Response('Not found',{status:404})}
    }
  }
});
try{
  const response=await mf.dispatchFetch('https://game.test/');
  const html=await response.text();
  assert.equal(response.status,200,html.slice(0,500));
  assert(html.includes('Nusantara'));
  for(const label of ['Main lokal','Lawan bot','Room online'])assert(html.includes(label));
  assert(!html.includes('Starter Project'));
  assert(!html.includes('<img class="lobby-illustration"'));
  for(const asset of ['nusantara-scene','pawn-atlas','region-atlas','card-atlas']){
    const bytes=await readFile(`dist/client/assets/${asset}.webp`);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF',asset);
    assert.equal(bytes.subarray(8,12).toString(),'WEBP',asset);
    assert(bytes.length>1000,asset);
  }
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
  assert(scripts.length>0);
  for(const script of scripts){
    if(script.startsWith('/'))assert((await readFile(path.resolve('dist/client','.'+script))).length>0,script);
  }
  console.log(`PASS production SSR homepage, title, primary button and ${scripts.length} script reference(s).`);
  console.log('PASS direct mode choices and all four preserved WebP assets.');
  const db=await mf.getD1Database('DB');
  const migration=await readFile('drizzle/0000_green_paper_doll.sql','utf8');
  for(const sql of migration.split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
  const status=await mf.dispatchFetch('https://game.test/api/game?status=1');
  assert.equal(status.status,200);
  assert.equal((await status.json()).online,true);
  const created=await mf.dispatchFetch('https://game.test/api/game',{
    method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'production-test'},
    body:JSON.stringify({type:'CREATE',name:'Pemeriksaan produksi'})
  });
  const room=await created.json();
  assert.equal(created.status,200,JSON.stringify(room));
  assert(room.token&&room.code);
  console.log('PASS production API routing, D1 migration and room creation.');
}finally{await mf.dispose()}
