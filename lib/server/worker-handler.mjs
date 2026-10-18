import {getRuntime} from './runtime.ts';
import {supabaseConfig,createSupabaseStore,authenticate} from './supabase-store.mjs';
import {createTermuxService} from './termux-worker.mjs';
import {RoomError,check} from './online-room.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../bot/model-manifest.mjs';
import {aiDecision} from '../groq.ts';
import {observation} from '../bot/mind.mjs';
import {legalCandidate} from '../bot/candidates.mjs';
import {blockedFinance} from '../bot/finance-history.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store',Vary:'Authorization'}});
export async function GET(){return json({protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID});}
export async function POST(request){
 try{
  check(request.headers.get('Content-Type')?.split(';')[0]==='application/json','Gunakan JSON.');
  const origin=request.headers.get('Origin');check(!origin||origin===new URL(request.url).origin,'Origin tidak diizinkan.',403);
  const reader=request.body?.getReader();check(reader,'Isi diperlukan.');let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;check(size<=65536,'Permintaan terlalu besar.',413);chunks.push(value);}}finally{await reader.cancel();}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder().decode(data));check(body&&typeof body==='object'&&!Array.isArray(body),'Isi tidak valid.');
  const runtime=getRuntime(),config=supabaseConfig(runtime.env);check(config,'Backend belum dikonfigurasi.',503);
  const store=createSupabaseStore(config);
  if(['claim','submit','advisor'].includes(body.op))check(runtime.env.MN_ONLINE_BOTS_ENABLED==='true','Bot online sedang dinonaktifkan.',503);
  const advisor=async(state,actor,plan,workerId)=>{
   check(plan&&Array.isArray(plan.candidates)&&plan.candidates.length>=2&&plan.candidates.length<=64,'Plan advisor tidak valid.');
   const view=observation(state,actor);
   const ids=new Set();
   for(const c of plan.candidates){check(c&&typeof c.id==='string'&&c.id.length<=80&&!ids.has(c.id)&&Number.isFinite(c.score)&&Math.abs(c.score)<=1e9&&c.action&&!blockedFinance(state,actor,c.action)&&legalCandidate(view,actor,c.action),'Kandidat advisor tidak valid.');ids.add(c.id);}
   check(plan.action&&plan.candidates.some(c=>JSON.stringify(c.action)===JSON.stringify(plan.action)),'Aksi dasar advisor tidak valid.');
   const cleanPlan={action:plan.action,candidates:plan.candidates,shouldConsult:true,summary:{}};
   const spend=async()=>await store.quota(`groq:${new Date().toISOString().slice(0,10)}`,86400)<=Math.min(1000,Math.max(0,Number(runtime.env.GROQ_DAILY_BUDGET||100)));
   // The precomputed plan avoids any server-side decidePersona call.
   return aiDecision(state,actor,{...runtime.env,GROQ_TIMEOUT_MS:'1500'},{plan:cleanPlan,spend,circuitKey:`worker:${workerId}`});
  };
  const service=createTermuxService({store,advisor});
  if(body.op==='pair'){
   const user=await authenticate(request,config);
   check(await store.quota(`worker-pair:${user.id}`,60)<=5,'Terlalu banyak percobaan pairing.',429);
   return json(await service.pair(body,user.id));
  }
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  return json(await service.execute(body,token));
 }catch(error){
  return error instanceof RoomError?json({error:error.message},error.status):json({error:'Permintaan worker gagal. Ulangi dengan ID command yang sama.'},503);
 }
}
