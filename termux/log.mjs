import {appendFile,stat,rename,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
export function createLog(dir,{maxBytes=5*1024*1024,retained=3}={}){
 let chain=mkdir(dir,{recursive:true,mode:0o700});const file=resolve(dir,'worker.jsonl');
 return row=>{
  chain=chain.then(async()=>{
   if((await stat(file).catch(()=>({size:0}))).size>=maxBytes){await rm(`${file}.${retained}`,{force:true});for(let i=retained-1;i>=1;i--)await rename(`${file}.${i}`,`${file}.${i+1}`).catch(()=>{});await rename(file,`${file}.1`);}
   await appendFile(file,JSON.stringify({at:new Date().toISOString(),...row})+'\n',{mode:0o600});
  });return chain;
 };
}
