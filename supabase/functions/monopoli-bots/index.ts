import {createSupabaseStore} from './_shared/lib/server/supabase-store.mjs';
import {runBotWorker,workerAuthorized} from './_shared/lib/server/bot-worker.mjs';
import {aiDecision} from './_shared/lib/groq.ts';
import type {BotGameState} from './_shared/lib/bot/contracts.ts';
// Deno's standard env/serve surface is declared without weakening the application's TS strictness.
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
async function authorizedByVault(url:string,apiKey:string,supplied:string):Promise<boolean>{
  try {
    const response=await fetch(`${url}/rest/v1/rpc/mn_bot_worker_authorized`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:apiKey,...(!apiKey.startsWith('sb_secret_')?{Authorization:`Bearer ${apiKey}`}:{})},
      body:JSON.stringify({p_secret:supplied}),signal:AbortSignal.timeout(8000),
    });
    return response.ok && (await response.json())===true;
  } catch { return false; }
}
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return new Response('Unauthorized',{status:401});
 const supplied=request.headers.get('X-MN-Worker-Secret');
 if(!supplied||supplied.length<32||supplied.length>256)return new Response('Unauthorized',{status:401});
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return new Response('Worker configuration unavailable',{status:503});
 // Respect a normal Edge Secret when configured; otherwise authorize against the
 // Vault token through a service-role-only RPC. The raw token is never returned.
 const envSecret=Deno.env.get('MN_BOT_WORKER_SECRET');
 const authorized=envSecret
  ? await workerAuthorized(supplied,envSecret)
  : await authorizedByVault(url,secret,supplied);
 if(!authorized)return new Response('Unauthorized',{status:401});
 const store=createSupabaseStore({url,key:Deno.env.get('SUPABASE_ANON_KEY')||'',secret});
 const env={GROQ_API_KEY:Deno.env.get('GROQ_API_KEY'),GROQ_MODEL:Deno.env.get('GROQ_MODEL'),GROQ_TIMEOUT_MS:Deno.env.get('GROQ_TIMEOUT_MS')};
 const spend=async()=>await store.quota(`groq:${new Date().toISOString().slice(0,10)}`,86400)<=Math.min(1000,Math.max(0,Number(Deno.env.get('GROQ_DAILY_BUDGET')||100)));
 try{return Response.json(await runBotWorker({store,decide:(s:BotGameState,actor:number)=>aiDecision(s,actor,env,{spend})}));}
 catch{return new Response('Worker temporarily unavailable',{status:503});}
});
