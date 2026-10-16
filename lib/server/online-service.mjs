import {check, RoomError, newRoom, reconcile, touch, joinSeat, seatFor, applyOperation, roomView} from './online-room.mjs';

export const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), n => alphabet[n % alphabet.length]).join('');
export const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), x => x.toString(16).padStart(2, '0')).join('');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const requestDigest = body => digest(JSON.stringify(canonical(body)));
const validCode = code => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(code);
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(id);
export function createOnlineService({store, clock = Date.now, rng = secureRandom, generateCode = roomCode}) {
 async function limit(key, max, seconds) { check(await store.quota(key, seconds) <= max, 'Batas permintaan tercapai. Coba lagi nanti.', 429); }
 async function recover(code, userId) {
  for (let attempt = 0; attempt < 8; attempt++) {
   const row = await store.get(code); check(row, 'Room tidak ditemukan.', 404);
   check(seatFor(row.data, userId) >= 0, 'Bukan peserta room.', 403);
   const before = JSON.stringify(row.data), now = clock(); reconcile(row.data, now);
   if (before === JSON.stringify(row.data)) return row;
   const committed = await store.commit(row, row.data, {notify: true});
   if (committed.ok) return {...row, revision: committed.revision};
  }
  throw new RoomError('Room sedang sibuk. Coba kembali.', 409);
 }
 return {
  async list(userId) {
   const codes = await store.list(userId);
   // List is paginated by the store; do not expose a stale Playing state after a long absence.
   const result = [];
   for (const code of codes) { const row = await recover(code, userId); const view = roomView(row, userId, clock()); result.push({code, status: view.status, created: view.created, players: view.seats.length, capacity: view.capacity, revision: view.roomRevision}); }
   return result;
  },
  async read(code, userId) {
   check(validCode(code), 'Kode room harus delapan karakter.');
   return roomView(await recover(code, userId), userId, clock());
  },
  async execute(body, userId) {
   check(body && typeof body === 'object' && validId(body.clientId), 'Identitas koneksi diperlukan.');
   const heartbeat = body.type === 'HEARTBEAT';
   if (!heartbeat) check(validId(body.requestId), 'ID permintaan diperlukan.');
   if (body.type === 'ACTION') check(body.action?.id === body.requestId, 'ID aksi harus sama dengan ID permintaan.');
   const hash = heartbeat ? null : await requestDigest(body);
   if (!heartbeat) {
    const receipt = await store.receipt(userId, body.requestId);
    if (receipt) {
     check(receipt.request_hash === hash, 'ID permintaan sudah dipakai untuk isi berbeda.', 409);
     return roomView(await recover(receipt.code, userId), userId, clock());
    }
   }
   await limit(`user:${userId}:${heartbeat ? 'heartbeat' : 'command'}`, heartbeat ? 60 : 120, 60);
   if (body.type === 'CREATE') await limit(`create:${userId}`, 30, 86400);
   if (body.type === 'JOIN') await limit(`join:${userId}`, 20, 60);
   if (body.type !== 'CREATE') check(validCode(body.code), 'Kode room harus delapan karakter.');
   for (let attempt = 0; attempt < 8; attempt++) {
    const now = clock();
    const code = body.type === 'CREATE' ? generateCode() : body.code;
    const row = body.type === 'CREATE' ? {code, revision: -1, data: newRoom(body, code, userId, body.clientId, now)} : await store.get(code);
    check(row, 'Room tidak ditemukan.', 404);
    const room = row.data;
    let seat = seatFor(room, userId);
    if (body.type !== 'CREATE' && body.type !== 'JOIN') check(seat >= 0, 'Bukan peserta room.', 403);
    // Reconcile BEFORE accepting a returning heartbeat. All-offline expiry must survive reconnect.
    const before = JSON.stringify(room);
    reconcile(room, now);
    if (body.type === 'JOIN') seat = joinSeat(room, body, userId, body.clientId, now);
    const wasConnected = room.seats[seat] && Object.values(room.seats[seat].connections || {}).some(at => at > now - 35000);
    // A request from a valid session establishes a lease. A lease gap invalidates readiness first.
    touch(room, seat, body.clientId, now);
    if (body.type !== 'CREATE') {
     try { applyOperation(room, seat, body, now, rng); }
     catch (error) {
      // Persist fairness transitions even when the requested gameplay action is rejected.
      const original = await store.get(code);
      if (original && original.revision === row.revision) {
       const snapshot = JSON.stringify(original.data); reconcile(original.data, now);
       if (snapshot !== JSON.stringify(original.data)) await store.commit(original, original.data, {notify: true});
      }
      throw error;
     }
    }
    room.connectivity = room.seats.map(s => Object.values(s.connections || {}).some(at => at > now - 35000));
    const meta = {userId, requestId: heartbeat ? null : body.requestId, hash, type: body.type,
     notify: !heartbeat || !wasConnected || room.status !== JSON.parse(before).status || room.host !== JSON.parse(before).host || JSON.stringify(room.vote) !== JSON.stringify(JSON.parse(before).vote) || JSON.stringify(room.pause) !== JSON.stringify(JSON.parse(before).pause) || JSON.stringify(room.connectivity) !== JSON.stringify(JSON.parse(before).connectivity)};
    const committed = await store.commit(row, room, meta);
    if (committed.duplicate) {
     check(committed.hash === hash, 'ID permintaan sudah dipakai untuk isi berbeda.', 409);
     return roomView(await recover(committed.code, userId), userId, clock());
    }
    if (committed.ok) return roomView({...row, data: room, revision: committed.revision}, userId, now);
    // Retry CAS only after reloading and revalidating intent. Stale gameplay versions fail above.
   }
   throw new RoomError('State berubah bersamaan. Ambil kondisi terbaru lalu coba lagi.', 409);
  }
 };
}
