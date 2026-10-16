import {SourceTextModule} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname,extname,relative} from 'node:path';
const root=resolve(import.meta.dirname,'..'),failures=[],checked=[];
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]))).flat();}
async function exists(path){try{return (await stat(path)).isFile()}catch{return false}}
for(const dir of ['frontend','lib','app','api','adapters','tests','scripts','examples','benchmarks','dist'])for(const path of await walk(resolve(root,dir))){
 if(!['.js','.mjs','.ts'].includes(extname(path)))continue;
 try{let code=await readFile(path,'utf8');if(extname(path)==='.ts')code=stripTypeScriptTypes(code,{mode:'strip'});const module=new SourceTextModule(code,{identifier:path});checked.push(relative(root,path));
 for(const spec of module.dependencySpecifiers){if(!spec.startsWith('.')&&!spec.startsWith('@/')){if(path.startsWith(resolve(root,'dist'))&&!spec.startsWith('/'))failures.push({path:relative(root,path),error:'Non-browser dependency '+spec});continue;}let target=spec.startsWith('@/')?resolve(root,spec.slice(2)):resolve(dirname(path),spec);if(!(await Promise.all([target,target+'.ts',target+'.mjs'].map(exists))).some(Boolean))failures.push({path:relative(root,path),error:'Missing import '+spec});}
 }catch(e){failures.push({path:relative(root,path),error:e.message})}
}
const publicRoot=resolve(root,'dist');for(const path of JSON.parse(await readFile(resolve(publicRoot,'precache.json'),'utf8')))if(!await exists(resolve(publicRoot,path==='/'?'index.html':path.slice(1))))failures.push({path,error:'Offline precache file missing'});
for(const path of ['lib/groq.ts','lib/server/runtime.ts','.env','README.md','design/SOURCE_OF_TRUTH.json'])if(await exists(resolve(publicRoot,path)))failures.push({path,error:'Private/source file in public output'});
const report={generatedAt:new Date().toISOString(),node:process.version,check:'Native module syntax and import graph, not semantic TypeScript or browser layout',files:checked.length,failures};await writeFile(resolve(root,'docs/KEPULAUAN_SYNTAX_IMPORTS.json'),JSON.stringify(report,null,2)+'\n');console.log(`${checked.length} source/output modules checked; ${failures.length} failures.`);if(failures.length){console.error(failures);process.exitCode=1;}
