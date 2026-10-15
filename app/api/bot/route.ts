import {getRuntime} from '@/lib/server/runtime';
import {aiDecision} from '@/lib/groq';
import {botCandidates,decisionActor} from '@/lib/game.mjs';
import {validateLocalState} from '@/lib/save-format.mjs';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=20;

// Local VS Bot remains a local game: only the AI's choice is delegated to the server.
// In-memory limits below are best-effort when Redis is absent (Vercel instances do not share memory).
// Redis, when configured, supplies the enforceable per-project quotas.
const fallbackLimits=new Map<string,{value:number,until:number}>();
function count(key:string,limit:number,ttl:number){
 const now=Date.now();if(fallbackLimits.size>2000){for(const [k,v] of fallbackLimits)if(v.until<=now)fallbackLimits.delete(k);if(fallbackLimits.size>2000)fallbackLimits.clear()}
 const entry=fallbackLimits.get(key);const value=entry&&entry.until>now?entry.value+1:1;
 fallbackLimits.set(key,{value,until:entry&&entry.until>now?entry.until:now+ttl});
 if(value>limit)throw Error('Batas sementara permintaan AI tercapai.');
}
async function quota(context:any,request:Request){
 const day=new Date().toISOString().slice(0,10);
 const ip=context.env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim():'local';
 const client=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip||'anonymous'));
 const id=Array.from(new Uint8Array(client).slice(0,12),n=>n.toString(16).padStart(2,'0')).join('');
 if(context.store){
  if(await context.store.quota(`groq:${day}`,172800)>1000)throw Error('Batas permintaan Groq harian tercapai.');
  if(await context.store.quota(`groq-client:${id}:${Math.floor(Date.now()/3600000)}`,7200)>30)throw Error('Terlalu banyak permintaan AI. Coba beberapa saat lagi.');
 }else{
  count(`day:${day}`,300,86400000);
  count(`ip:${id}:${Math.floor(Date.now()/3600000)}`,12,3600000);
 }
}
function send(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw Error('Origin tidak diizinkan.');
  const context=getRuntime();if(!String(context.env.GROQ_API_KEY||'').trim())return send({error:'Groq belum dikonfigurasi pada environment deployment ini.'},503);
  const raw=await request.text();if(raw.length>180000)throw Error('State permainan terlalu besar.');
  const body=JSON.parse(raw);const s=validateLocalState(body.state);
  const actor=body.actor;
  if(!Number.isSafeInteger(actor)||!s.players[actor]||s.players[actor].controller!=='bot'||decisionActor(s)!==actor||s.phase==='won')throw Error('Bukan giliran bot.');
  // Do not spend an API request on a forced action.
  const candidates=botCandidates(s,actor);if(!candidates.length)throw Error('Bot tidak memiliki tindakan legal.');
  if(candidates.length>1)await quota(context,request);
  const result=await aiDecision(s,actor,context.env);
  if(!result.action)throw Error('Bot tidak memiliki tindakan valid.');
  return send({action:result.action,status:result.status,comment:result.comment,reason:result.reason});
 }catch(error:any){
  // Never expose provider credentials or unfiltered error responses.
  const known=String(error?.message||'');
  const message=/^(Origin tidak diizinkan\.|State permainan terlalu besar\.|Bukan giliran bot\.|Bot tidak memiliki tindakan legal\.|Bot tidak memiliki tindakan valid\.|Batas sementara permintaan AI tercapai\.|Batas permintaan Groq harian tercapai\.|Terlalu banyak permintaan AI\. Coba beberapa saat lagi\.)$/.test(known)?known:'Permintaan bot tidak valid atau layanan sementara tidak tersedia.';
  return send({error:message},message.includes('Batas')||message.includes('Terlalu banyak')?429:400);
 }
}
