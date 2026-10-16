import {getRuntime} from '@/lib/server/runtime';
import {aiDecision,advisorConfiguration} from '@/lib/groq';
import type {BotDecisionResult,BotGameState} from '@/lib/bot/contracts';
import {ruleState} from '@/lib/bot/candidates.mjs';
import {validateLocalState} from '@/lib/save-format.mjs';
import {createSupabaseStore,supabaseConfig} from '@/lib/server/supabase-store.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=20;
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
// Local advisory has no authority over online rooms. Persistent quota is used when configured.
const limits=new Map<string,{at:number;count:number}>();let day='',daily=0;
export async function GET(){return response(advisorConfiguration(getRuntime().env));}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'Origin tidak diizinkan.'},403);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return response({error:'Gunakan JSON.'},400);
  const reader=request.body?.getReader();if(!reader)return response({error:'State diperlukan.'},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)return response({error:'Snapshot terlalu besar.'},413);chunks.push(value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  const body:unknown=JSON.parse(new TextDecoder().decode(bytes));
  if(!record(body)||body.code||body.room||!record(body.state)||!Array.isArray(body.state.players)||body.state.players.length>6||!Number.isInteger(body.actor))return response({error:'Permintaan advisor lokal tidak valid.'},400);
  const actor=Number(body.actor),state:BotGameState=validateLocalState(ruleState(body.state));
  if(!state.players[actor]||state.players[actor].controller!=='bot'||state.players[actor].out)return response({error:'Bukan keputusan bot aktif.'},400);
  const context=getRuntime(),now=Date.now();let source='shared';try{source=context.creatorId(request)}catch{}
  if(limits.size>1000)for(const [k,v] of limits)if(now-v.at>60000)limits.delete(k);
  const limit=limits.get(source);if(limit&&now-limit.at<60000&&limit.count>=12)return response({error:'Batas advisor tercapai; bot lokal tetap aktif.'},429);
  limits.set(source,{at:limit&&now-limit.at<60000?limit.at:now,count:limit&&now-limit.at<60000?limit.count+1:1});
  const config=supabaseConfig(context.env),store=config?createSupabaseStore(config):null;
  const spend=async()=>{const today=new Date().toISOString().slice(0,10),cap=Math.min(1000,Math.max(0,Number(context.env.GROQ_DAILY_BUDGET||100)));if(!Number.isFinite(cap))return false;if(store)return await store.quota(`groq:${today}`,86400)<=cap;if(day!==today){day=today;daily=0}return ++daily<=cap};
  const decision:BotDecisionResult=await aiDecision(state,actor,context.env,{spend});
  // reason is an explicit optional safe enum on every branch of the shared contract.
  return response(decision);
 }catch{return response({error:'Snapshot atau keputusan bot belum dapat diproses. Gunakan bot lokal.'},400)}
}
