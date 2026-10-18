import {RoomError, check} from './online-room.mjs';
import {resolvedSupabaseEnv,supabaseConfigurationStatus} from './supabase-config.mjs';
export function supabaseConfig(env) {
 const c=resolvedSupabaseEnv(env),status=supabaseConfigurationStatus(env);
 check(!status.invalid.length,'Konfigurasi Supabase tidak valid.',503);
 if(status.missing.length)return null;
 return {...c,url:new URL(c.url).origin};
}
export function createSupabaseStore(config, transport = fetch) {
 async function rest(path, body) {
  try {
   const response = await transport(`${config.url}/rest/v1/${path}`, {method: body === undefined ? 'GET' : 'POST',
    headers: {apikey: config.secret, ...(!config.secret.startsWith('sb_secret_')?{Authorization: `Bearer ${config.secret}`} : {}), 'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), cache: 'no-store', signal: AbortSignal.timeout(8000)});
   if (!response.ok) throw Error('Supabase response rejected');
   return await response.json();
  } catch { throw new RoomError('Penyimpanan room belum dapat dihubungi. Coba kembali nanti.', 503); }
 }
 return {
  async get(code) { const rows = await rest(`mn_rooms?code=eq.${encodeURIComponent(code)}&select=code,data,revision`); return rows[0] || null; },
  async list(userId) {
   const rows = await rest(`mn_members?user_id=eq.${encodeURIComponent(userId)}&select=code,mn_rooms(created_at)&order=mn_rooms(created_at).desc&limit=50`);
   return rows.map(r => r.code);
  },
  async receipt(userId, requestId) {
   const rows = await rest(`mn_commands?user_id=eq.${encodeURIComponent(userId)}&request_id=eq.${encodeURIComponent(requestId)}&select=code,request_hash&limit=1`);
   return rows[0] || null;
  },
  async claimBot(owner) { return rest('rpc/mn_claim_bot_job',{p_owner:owner}); },
  async releaseBot(code,owner,status='waiting',error=null) { return rest('rpc/mn_release_bot_job',{p_code:code,p_owner:owner,p_status:status,p_error:error}); },
  async wakeBots() { return rest('rpc/mn_wake_bot_worker',{}); },
  async onlineCapabilities(){return rest('rpc/mn_online_capabilities',{});},
  async quota(key, seconds) { return rest('rpc/mn_take_quota', {p_key: key, p_seconds: seconds}); },
  async commit(row, room, meta = {}) {
   return rest('rpc/mn_commit_room', {p_code: room.code, p_expected_revision: row.revision, p_data: meta.botWork?{...room,_botWork:meta.botWork}:room,
    p_actor: meta.userId || null, p_request_id: meta.requestId || null, p_hash: meta.botLease || meta.hash || null,
    p_type: meta.type || null, p_notify: meta.notify !== false});
  }
 };
}
export async function authenticate(request, config, transport = fetch) {
 const header = request.headers.get('Authorization') || '';
 check(/^Bearer [^\s]{20,8192}$/.test(header), 'Masuk atau pilih identitas tamu dahulu.', 401);
 let response;
 try { response = await transport(`${config.url}/auth/v1/user`, {headers: {apikey: config.key, Authorization: header}, cache: 'no-store', signal: AbortSignal.timeout(6000)}); }
 catch { throw new RoomError('Layanan identitas belum dapat dihubungi.', 503); }
 check(response.ok, 'Sesi berakhir. Masuk kembali untuk memulihkan kursimu.', 401);
 const user = await response.json();
 check(typeof user.id === 'string' && /^[0-9a-f-]{36}$/i.test(user.id), 'Identitas tidak sah.', 401);
 return user;
}
