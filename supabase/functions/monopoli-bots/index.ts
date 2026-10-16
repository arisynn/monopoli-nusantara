import {createSupabaseStore} from '../../../lib/server/supabase-store.mjs';
import {runBotWorker,workerAuthorized} from '../../../lib/server/bot-worker.mjs';
import {aiDecision} from '../../../lib/groq.ts';
import type {BotGameState} from '../../../lib/bot/contracts.ts';
// Deno's standard env/serve surface is declared without weakening the application's TS strictness.
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST'||!await workerAuthorized(request.headers.get('X-MN-Worker-Secret'),Deno.env.get('MN_BOT_WORKER_SECRET')))return new Response('Unauthorized',{status:401});
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return new Response('Worker configuration unavailable',{status:503});
 const store=createSupabaseStore({url,key:Deno.env.get('SUPABASE_ANON_KEY')||'',secret});
 const env={GROQ_API_KEY:Deno.env.get('GROQ_API_KEY'),GROQ_MODEL:Deno.env.get('GROQ_MODEL'),GROQ_TIMEOUT_MS:Deno.env.get('GROQ_TIMEOUT_MS')};
 const spend=async()=>await store.quota(`groq:${new Date().toISOString().slice(0,10)}`,86400)<=Math.min(1000,Math.max(0,Number(Deno.env.get('GROQ_DAILY_BUDGET')||100)));
 try{return Response.json(await runBotWorker({store,decide:(s:BotGameState,actor:number)=>aiDecision(s,actor,env,{spend})}));}
 catch{return new Response('Worker temporarily unavailable',{status:503});}
});
