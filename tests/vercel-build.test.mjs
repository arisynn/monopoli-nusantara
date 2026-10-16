import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const html=await readFile('.next/server/app/index.html','utf8');
for(const label of ['VS Bot','Online Multiplayer'])assert(html.includes(label));assert(!html.includes('<img class="lobby-illustration"'));
const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]).filter(src=>src.startsWith('/_next/'));
assert(scripts.length>0);
for(const script of scripts)assert((await readFile('.next/'+script.slice('/_next/'.length))).length>0);
for(const asset of ['nusantara-scene','pawn-atlas','region-atlas']){const bytes=await readFile(`public/assets/${asset}.webp`);assert.equal(bytes.subarray(8,12).toString(),'WEBP')}
for(const file of ['board/chance.svg','board/community.svg','tokens/pinisi.svg','tokens/angklung.svg','tokens/rumah-gadang.svg'])assert((await readFile(`public/assets/${file}`,'utf8')).includes('<svg'));
assert.equal((await readFile('public/assets/nusa-symbol.woff')).subarray(0,4).toString(),'wOFF');
const trace=JSON.parse(await readFile('.next/server/app/api/game/route.js.nft.json','utf8'));
assert(!trace.files.some(file=>/wrangler|miniflare|runtime-sites|cloudflare:workers/.test(file)));
const files=await readdir('.next/server',{recursive:true});for(const file of files.filter(file=>/\.js$/.test(file))){const code=await readFile(path.join('.next/server',file),'utf8');assert(!code.includes('cloudflare:workers'),file)}
console.log(`PASS Next.js production HTML, ${scripts.length} bundled scripts, three preserved images, board vectors and API trace without Workers imports.`);

const chunks=await readdir('.next/static/chunks',{recursive:true});
for(const file of chunks.filter(file=>/\.js$/.test(file))){const code=await readFile(path.join('.next/static/chunks',file),'utf8');assert(!/WebGLRenderer|OrbitControls|THREE\.REVISION/.test(code),`3D renderer leaked into ${file}`)}
console.log('PASS client bundles exclude the removed Three.js board renderer.');
