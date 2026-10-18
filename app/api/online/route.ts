import {getRuntime} from '@/lib/server/runtime';
import {supabaseConfig, createSupabaseStore, authenticate} from '@/lib/server/supabase-store.mjs';
import {supabaseConfigurationStatus} from '@/lib/server/supabase-config.mjs';
import {createOnlineService, digest} from '@/lib/server/online-service.mjs';
import {RoomError, check} from '@/lib/server/online-room.mjs';
import {roomWorkerStatus} from '@/lib/server/worker-capabilities.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', Vary: 'Authorization'}});
function context() {
 const runtime = getRuntime(), config = supabaseConfig(runtime.env);
 check(config, 'Supabase online belum dikonfigurasi.', 503);
 const store = createSupabaseStore(config!);
 return {config: config!, store, service: createOnlineService({store,botsEnabled:runtime.env.MN_ONLINE_BOTS_ENABLED==='true'}), runtime};
}
function failure(error: unknown) {
 return error instanceof RoomError ? json({error: error.message,code:error.code}, error.status) : json({error: 'Permintaan belum dapat diproses. Ambil kondisi terbaru lalu coba kembali.'}, 400);
}
export async function GET(request: Request) {
 try {
  const url = new URL(request.url);
  if (url.searchParams.has('config')) {
   const configuration=supabaseConfigurationStatus(getRuntime().env);
   if(!configuration.configured)return json({online:false,provider:'supabase',configuration});
   const config = supabaseConfig(getRuntime().env);
   return json(config ? {online: true, provider: 'supabase', onlineBots:getRuntime().env.MN_ONLINE_BOTS_ENABLED==='true', url: config.url, key: config.key} : {online: false, provider: 'supabase'});
  }
  const {config, service, store} = context(), user = await authenticate(request, config);
  check(await store.quota(`read:${user.id}`, 60) <= 120, 'Terlalu banyak pemuatan room. Coba lagi nanti.', 429);
  if(url.searchParams.has('diagnostics')){
   try{return json({onlineBots:getRuntime().env.MN_ONLINE_BOTS_ENABLED==='true',capabilities:await store.onlineCapabilities()});}
   catch{return json({onlineBots:getRuntime().env.MN_ONLINE_BOTS_ENABLED==='true',capabilities:null,code:'online_migration_required'});}
  }
  if (url.searchParams.has('rooms')) return json({rooms: await service.list(user.id)});
  const view=await service.read((url.searchParams.get('code') || '').toUpperCase(), user.id);
  try{return json({...view,worker:await roomWorkerStatus(store,view.code,config.url)});}catch{return json(view);}
 } catch (error) { return failure(error); }
}
async function readBody(request: Request) {
 const reader = request.body?.getReader(); check(reader, 'Isi permintaan diperlukan.');
 let size = 0; const chunks: Uint8Array[] = [];
 try { while (true) { const {done, value} = await reader!.read(); if (done) break; size += value.length; check(size <= 16384, 'Permintaan terlalu besar.', 413); chunks.push(value); } }
 finally { await reader!.cancel(); }
 const all = new Uint8Array(size); let offset = 0;
 for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
 return JSON.parse(new TextDecoder().decode(all));
}
export async function POST(request: Request) {
 try {
  const origin = request.headers.get('Origin');
  check(!origin || origin === new URL(request.url).origin, 'Origin tidak diizinkan.', 403);
  check(request.headers.get('Content-Type')?.split(';')[0] === 'application/json', 'Gunakan JSON.');
  const {config, service, store, runtime} = context(), user = await authenticate(request, config);
  const body = await readBody(request);
  if(['LEAVE','KICK'].includes(body.type)||body.type==='ADD_BOT'&&runtime.env.MN_ONLINE_BOTS_ENABLED==='true'){
   let capabilities;
   try{capabilities=await store.onlineCapabilities();}catch{throw new RoomError('Layanan room perlu diperbarui sebelum fitur ini tersedia.',503,'online_migration_required');}
   if(!capabilities?.lobbyManagement||capabilities.schemaVersion<6)throw new RoomError('Layanan room perlu diperbarui sebelum fitur ini tersedia.',503,'online_migration_required');
   if(body.type==='ADD_BOT'&&(!capabilities.workerConfigured||(capabilities.workerProvider==='termux'?!capabilities.workerAlive:!capabilities.schedulerConfigured)))throw new RoomError('Bot online belum siap. Hubungkan worker terlebih dahulu.',503,'online_worker_unavailable');
   if(body.type==='ADD_BOT'&&capabilities.workerProvider==='termux'){
    const status=await store.workerRpc('mn_worker_room_status',{p_code:body.code});
    if(status?.status==='offline')throw new RoomError('Tidak ada worker aktif yang diizinkan menangani room ini.',503,'online_worker_unavailable');
   }
  }
  if (body.type === 'CREATE' || body.type === 'JOIN') {
   let source = 'unidentified'; try { source = runtime.creatorId(request); } catch { /* public deployment uses a conservative shared bucket */ }
   check(await store.quota(`entry:${await digest(source)}`, 60) <= 120, 'Terlalu banyak percobaan masuk. Coba lagi nanti.', 429);
  }
  const result=await service.execute(body, user.id);
  if(body.type==='HEARTBEAT'){
   try{return json({...result,worker:await roomWorkerStatus(store,result.code,config.url)});}catch{/* safe status is optional */}
  }
  return json(result);
 } catch (error) { return failure(error); }
}
