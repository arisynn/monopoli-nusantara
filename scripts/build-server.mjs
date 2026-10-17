import {mkdir,readFile,writeFile,readdir,rm,stat} from 'node:fs/promises';
import {resolve,dirname,relative,extname} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';

/** Emit native ESM for Vercel. No alias loader, TypeScript runtime or npm
 * production dependency is required by the deployed serverless entry. */
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'server-dist');
await rm(out,{recursive:true,force:true});
async function isFile(path){try{return (await stat(path)).isFile()}catch{return false}}
async function emit(directory){
 for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){
  const path=directory+'/'+entry.name;
  if(entry.isDirectory()){await emit(path);continue;}
  if(!/\.(?:mjs|ts)$/.test(path)||entry.name==='runtime-sites.ts')continue;
  let code=await readFile(resolve(root,path),'utf8');
  if(path.endsWith('.ts'))code=stripTypeScriptTypes(code,{mode:'strip'});
  const dependencies=[...code.matchAll(/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"])(@\/[^'"]+|\.{1,2}\/[^'"]+)(['"])/g)];
  for(const match of dependencies){
   const spec=match[2];let target=spec.startsWith('@/')?resolve(root,spec.slice(2)):resolve(dirname(resolve(root,path)),spec);
   if(!await isFile(target)){
    if(await isFile(target+'.ts'))target+='.ts';
    else if(await isFile(target+'.mjs'))target+='.mjs';
    else throw Error(`Unresolved server import ${path}: ${spec}`);
   }
   let next=relative(dirname(resolve(root,path)),target).replaceAll('\\','/').replace(/\.ts$/,'.mjs');
   if(!next.startsWith('.'))next='./'+next;
   code=code.replace(match[0],match[1]+next+match[3]);
  }
  const output=resolve(out,path.replace(/\.ts$/,'.mjs'));await mkdir(dirname(output),{recursive:true});await writeFile(output,code);
 }
}
for(const dir of ['lib','app/api','adapters/node','adapters/vercel'])await emit(dir);
console.log('Built private server-dist native ESM for Vercel.');
