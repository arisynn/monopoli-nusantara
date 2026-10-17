import {requestJSON, ConnectionError} from './room-client.mjs';
// Use the game domain for Auth to avoid cross-domain browser failures.
const sessionKey = config => `nusantara-auth:${config.url}`;
const readSession = config => { try { return JSON.parse(localStorage.getItem(sessionKey(config)) || 'null'); } catch { return null; } };
const saveSession = (config, value) => { if (value) localStorage.setItem(sessionKey(config), JSON.stringify(value)); else localStorage.removeItem(sessionKey(config)); };
export const connectionId = () => {
 let id = sessionStorage.getItem('nusantara-connection');
 if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('nusantara-connection', id); }
 return id;
};
export class OnlineAuth {
 constructor(config, transport = fetch) { this.config = config; this.transport = transport; }
 session() { return readSession(this.config); }
 async auth(path, body, token) {
  const op=path.startsWith('token?grant_type=password')?'login':path.startsWith('token?grant_type=refresh_token')?'refresh':path.startsWith('user')?'link':body?.email?'signup':'guest';
  let response, result;
  try {
   response = await this.transport(`/api/auth?op=${op}`, {method: op==='link'?'PUT':'POST',
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify(body), cache:'no-store', signal: AbortSignal.timeout(18000)});
  } catch (cause) {
   const timeout=cause?.name==='TimeoutError'||cause?.name==='AbortError';
   throw new ConnectionError(timeout?'Layanan identitas terlalu lama merespons. Coba lagi.':'Browser tidak dapat menghubungi server game. Periksa internet dan coba lagi.');
  }
  try { result = await response.json(); }
  catch { throw Error('Server game mengirim respons identitas yang tidak valid. Muat ulang situs.'); }
  if (!response.ok) throw Error(result?.msg || result?.error_description || result?.message || result?.error || `Login gagal (HTTP ${response.status}).`);
  if (result.access_token) {
   saveSession(this.config, {...result, expires_at: Math.floor(Date.now()/1000) + result.expires_in});
  }
  if (path.startsWith('user') && result.id && this.session()) saveSession(this.config, {...this.session(), user: result});
  return result;
 }
 async token() {
  const refresh = async () => {
   const session = this.session();
   if (!session?.access_token) throw Error('Masuk atau pilih Main sebagai tamu dahulu.');
   if (session.expires_at > Date.now()/1000 + 60) return session.access_token;
   const result = await this.auth('token?grant_type=refresh_token', {refresh_token: session.refresh_token});
   return result.access_token;
  };
  // Supabase refresh tokens rotate. Serialize browser tabs around the shared session.
  return globalThis.navigator?.locks ? navigator.locks.request(`mn-auth:${this.config.url}`, refresh) : refresh();
 }
 async consumeRedirect() {
  if (!globalThis.location?.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has('access_token')) return;
  const token = params.get('access_token'), refresh = params.get('refresh_token');
  try {
   if (!token || !refresh) throw Error('Konfirmasi akun belum lengkap. Masuk kembali dengan email.');
   let response;
   try { response = await this.transport('/api/auth?op=user', {headers: {Authorization: `Bearer ${token}`}, cache:'no-store', signal: AbortSignal.timeout(18000)}); }
   catch { throw new ConnectionError(); }
   if (!response.ok) throw Error('Tautan konfirmasi berakhir. Masuk kembali dengan email.');
   const user = await response.json(), seconds = Number(params.get('expires_in'));
   if (!user.id) throw Error('Identitas konfirmasi tidak valid.');
   saveSession(this.config, {access_token: token, refresh_token: refresh, user,
    expires_at: Math.floor(Date.now()/1000) + (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 604800 ? seconds : 3600)});
  } finally { history.replaceState(history.state, '', location.pathname + location.search); }
 }
 async guest() { return this.auth('signup', {data: {}}); }
 async login(email, password) { return this.auth('token?grant_type=password', {email: email.trim(), password}); }
 async signup(email, password) { return this.auth('signup', {email: email.trim(), password}); }
 async link(email, password) { return this.auth('user', {email: email.trim(), password}, await this.token()); }
 async request(path, body) {
  return requestJSON(`/api/online${path}`, {headers: {'Content-Type': 'application/json', Authorization: `Bearer ${await this.token()}`},
   ...(body === undefined ? {} : {method: 'POST', body: JSON.stringify(body)})}, this.transport);
 }
}
/** Supabase Realtime/Phoenix protocol, revision hints only. HTTP heartbeat remains recovery. */
export function subscribeRoom(config, code, getToken, onChange, onStatus, socketFactory = url => new WebSocket(url)) {
 let socket, heartbeat, retry, closed = false, ref = 0, failures = 0;
 const topic = `realtime:mn-room:${code}`;
 const send = (event, payload, target = topic) => socket?.readyState === 1 && socket.send(JSON.stringify({topic: target, event, payload, ref: String(++ref)}));
 async function connect() {
  if (closed) return;
  try {
   const token = await getToken(); if (closed) return;
   const url = `${config.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(config.key)}&vsn=1.0.0`;
   socket = socketFactory(url);
   socket.onopen = () => {
    send('phx_join', {config: {broadcast: {self: false}, presence: {key: ''}, postgres_changes: [{event: '*', schema: 'public', table: 'mn_room_updates', filter: `code=eq.${code}`}]}, access_token: token});
    heartbeat = setInterval(async () => {
     send('heartbeat', {}, 'phoenix');
     try { send('access_token', {access_token: await getToken()}); } catch { onStatus(false); }
    }, 25000);
   };
   socket.onmessage = event => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.event === 'phx_reply' && message.topic === topic) {
     if (message.payload?.status === 'ok') { failures = 0; onStatus(true); onChange(); }
     else { onStatus(false); socket.close(); }
    }
    if (message.event === 'postgres_changes') onChange();
    if (message.event === 'phx_error' || message.event === 'phx_close') socket.close();
   };
   socket.onerror = () => socket.close();
   socket.onclose = () => { clearInterval(heartbeat); onStatus(false); if (!closed) retry = setTimeout(connect, Math.min(30000, 1000 * 2**Math.min(failures++, 5))); };
  } catch { onStatus(false); if (!closed) retry = setTimeout(connect, 15000); }
 }
 connect();
 return () => { closed = true; clearTimeout(retry); clearInterval(heartbeat); if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); } };
}
