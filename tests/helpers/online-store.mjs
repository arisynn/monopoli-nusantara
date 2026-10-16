// Test double for the store contract, not proof of PostgreSQL/RLS behavior.
export class MemoryOnlineStore {
 rooms = new Map(); receipts = new Map(); quotas = new Map(); notifications = [];
 async get(code) { await Promise.resolve(); return structuredClone(this.rooms.get(code) || null); }
 async list(userId) { return [...this.rooms.values()].filter(r => r.data.seats.some(s => s.userId === userId)).map(r => r.code); }
 async receipt(userId, id) { await Promise.resolve(); return structuredClone(this.receipts.get(`${userId}:${id}`) || null); }
 async quota(key) { const n = (this.quotas.get(key) || 0) + 1; this.quotas.set(key, n); return n; }
 async commit(row, room, meta = {}) {
  await Promise.resolve();
  const key = `${meta.userId}:${meta.requestId}`, receipt = meta.requestId && this.receipts.get(key);
  if (receipt) return {duplicate: true, code: receipt.code, hash: receipt.request_hash};
  const current = this.rooms.get(room.code);
  if (row.revision === -1 ? current : !current || current.revision !== row.revision) return {ok: false};
  const revision = row.revision + 1;
  this.rooms.set(room.code, structuredClone({code: room.code, data: room, revision}));
  if (meta.requestId) this.receipts.set(key, {code: room.code, request_hash: meta.hash, revision});
  if (meta.notify !== false) this.notifications.push({code: room.code, revision});
  return {ok: true, revision};
 }
 edit(code, fn) { fn(this.rooms.get(code).data); }
}
