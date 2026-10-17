// Generate a self-contained Supabase Edge Function import tree from shared engine code.
// Source of truth remains /lib; always regenerate immediately before deploy.
import {cp,rm,mkdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const target=new URL('../supabase/functions/monopoli-bots/_shared/lib/',import.meta.url);
await rm(new URL('../supabase/functions/monopoli-bots/_shared/',import.meta.url),{recursive:true,force:true});
await mkdir(target,{recursive:true});
await cp(new URL('../lib/',import.meta.url),target,{recursive:true});
// The browser's localStorage adapter is never imported from this worker.
const entry=await readFile(new URL('../supabase/functions/monopoli-bots/index.ts',import.meta.url),'utf8');
if(!entry.includes('./_shared/lib/server/bot-worker.mjs'))throw Error('Unexpected Edge worker entrypoint');
console.log('Prepared self-contained Edge Function dependencies from lib/.');
