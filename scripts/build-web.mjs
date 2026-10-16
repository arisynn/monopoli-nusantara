import {mkdir,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
// Only the generated output directory is replaced; source, saves and server files are untouched.
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await cp(new URL('public/',root),dist,{recursive:true});
await mkdir(new URL('frontend/',dist),{recursive:true});
for(const name of await readdir(new URL('frontend/',root))){if(name==='service-worker.js')continue;const data=await readFile(new URL('frontend/'+name,root));if(name==='index.html')await writeFile(new URL('index.html',dist),data);else await writeFile(new URL('frontend/'+name,dist),name.endsWith('.mjs')?data.toString().replaceAll("../lib/storage.ts","../lib/storage.mjs"):data);}
await mkdir(new URL('lib/bot/',dist),{recursive:true});
const allowed=[];
for(const dir of ['lib/','lib/bot/'])for(const name of await readdir(new URL(dir,root))){if(!name.endsWith('.mjs'))continue;allowed.push(dir+name);await cp(new URL(dir+name,root),new URL(dir+name,dist));}
await writeFile(new URL('lib/storage.mjs',dist),stripTypeScriptTypes(await readFile(new URL('lib/storage.ts',root),'utf8'),{mode:'strip'}));
await cp(new URL('frontend/service-worker.js',root),new URL('nusantara-sw.js',dist));
const css=await readFile(new URL('frontend/styles.css',dist));const hash=createHash('sha256').update(css).update(await readFile(new URL('frontend/app.mjs',dist))).digest('hex').slice(0,12);
const html=(await readFile(new URL('index.html',dist),'utf8')).replace('/frontend/styles.css',`/frontend/styles.css?v=${hash}`).replace('/frontend/app.mjs',`/frontend/app.mjs?v=${hash}`);
await writeFile(new URL('index.html',dist),html);
await writeFile(new URL('build.json',dist),JSON.stringify({version:'4.8.0',frontend:'classic',build:hash,serverModulesExposed:false},null,2)+'\n');
const precache=['/','/frontend/styles.css',...((await readdir(new URL('frontend/',dist))).filter(n=>n.endsWith('.mjs')).map(n=>'/frontend/'+n)),...allowed.map(p=>'/'+p),'/lib/storage.mjs','/assets/archipelago-light.webp','/assets/region-atlas-light.webp','/assets/pawn-miniatures.webp','/assets/nusa-symbol.woff',...['pinisi','komodo','becak','cenderawasih','angklung','rumah-gadang'].map(n=>'/assets/tokens/'+n+'.svg'),...['start','chance','community','jail','gojail','parking','station','tax','electric','water'].map(n=>'/assets/classic/'+n+'.png'),...['start','chance','community','jail','gojail','parking','station','tax','electric','water'].map(n=>'/assets/board/'+n+'.svg')];
for(const path of precache)await readFile(new URL(path==='/'?'index.html':path.slice(1),dist));
await writeFile(new URL('precache.json',dist),JSON.stringify(precache));
// Avoid leaking any backend module or historical metadata through the static root.
console.log(`Built ${fileURLToPath(dist)} — browser modules ${allowed.length+1}; no server secrets/modules or dependency install.`);
