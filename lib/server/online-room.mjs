import {createGame, command, publicState, decisionActor} from '../game.mjs';
import {availablePawn, setSeatPawn} from '../pawns.mjs';

export const LEASE_MS = 35000;
export const DISCONNECT_MS = 90000;
export const VOTE_MS = 60000;
export const VOTE_COOLDOWN_MS = 30000;
export class RoomError extends Error {
 constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(ok, message, status = 400) { if (!ok) throw new RoomError(message, status); }
export const activeSeats = room => room.seats.map((_, i) => i).filter(i => !room.state?.players[i]?.out);
export const lastSeen = seat => Math.max(0, ...Object.values(seat.connections || {}));
export const isConnected = (seat, now) => lastSeen(seat) > now - LEASE_MS;
export const seatFor = (room, userId) => room.seats.findIndex(s => s.userId === userId);
export function touch(room, seat, clientId, now) {
 const s = room.seats[seat];
 s.connections = Object.fromEntries(Object.entries(s.connections || {}).filter(([, at]) => at > now - DISCONNECT_MS));
 // Bound per-account browser leases; a fresh device cannot take a different seat.
 if (!Object.hasOwn(s.connections, clientId) && Object.keys(s.connections).length >= 8) {
  const oldest = Object.keys(s.connections).sort((a, b) => s.connections[a] - s.connections[b])[0];
  delete s.connections[oldest];
 }
 s.connections[clientId] = now;
}
function newSeat(body, room, userId, clientId, now) {
 return {userId, name: String(body.name || 'Penjelajah').trim().slice(0, 24) || 'Penjelajah',
  controller: 'human', ready: false, pawn: availablePawn(room.seats, body.pawn), connections: {[clientId]: now}};
}
export function newRoom(body, code, userId, clientId, now) {
 const capacity = body.capacity ?? 6;
 check(Number.isInteger(capacity) && capacity >= 2 && capacity <= 6, 'Pilih kapasitas 2–6 pemain.');
 const room = {schemaVersion: 1, code, mode: 'online', rules: body.rules === 'classic' ? 'classic' : 'digital',
  capacity, created: now, status: 'waiting', host: 0, seats: [], state: null, vote: null,
  lastVoteAt: null, pause: null, pauseCycle: 0};
 room.seats.push(newSeat(body, room, userId, clientId, now));
 return room;
}
function pause(room, reason, now) {
 if (room.status !== 'playing') return;
 room.status = 'paused';
 room.pause = {cycle: ++room.pauseCycle, reason, at: now, ready: []};
 // The existing engine has no gameplay deadlines; its full phase/context stays untouched.
 // This wrapper owns wall-clock voting/leases only, so no dice/card/economic effect is replayed.
 if (room.vote?.status === 'open') room.vote.status = 'cancelled';
}
export function reconcile(room, now) {
 if (room.state?.phase === 'won') room.status = 'finished';
 const active = activeSeats(room);
 if (room.status === 'playing') {
  const absent = active.filter(i => now - lastSeen(room.seats[i]) >= DISCONNECT_MS);
  if (absent.length) pause(room, 'disconnect', Math.min(...absent.map(i => lastSeen(room.seats[i]) + DISCONNECT_MS)));
 }
 if (room.status === 'paused') room.pause.ready = room.pause.ready.filter(i => active.includes(i) && isConnected(room.seats[i], now));
 if (room.vote?.status === 'open' && now >= room.vote.expiresAt) room.vote.status = 'expired';
 // Administrative transfer only. No player/asset/turn indices are moved.
 if (!isConnected(room.seats[room.host], now)) {
  const next = active.find(i => isConnected(room.seats[i], now));
  if (next !== undefined) room.host = next;
 }
 return room;
}
function activePlayer(room, seat) { check(activeSeats(room).includes(seat), 'Spectator tidak memiliki hak ini.', 403); }
function tally(room, now) {
 const v = room.vote, needed = Math.floor(v.eligible.length / 2) + 1;
 const yes = Object.values(v.votes).filter(x => x === true).length;
 const no = Object.values(v.votes).filter(x => x === false).length;
 if (yes >= needed) { v.status = 'passed'; pause(room, 'vote', now); }
 else if (no > v.eligible.length - needed) v.status = 'rejected';
}
// Conservatively hold gameplay whenever any live participant's lease has expired.
// This also protects open auctions, rent claims, queued debt and nested trade contexts.
export function gameplayHeld(room, now) { return activeSeats(room).some(i => !isConnected(room.seats[i], now)); }
export function validateOnlineAction(a) {
 check(a && typeof a === 'object' && !Array.isArray(a), 'Perintah tidak valid.');
 const fields = {
  START_ROLL: [], ROLL: [], END: [], BUY: [], AUCTION: [], ACK: [], PAY: [], BANKRUPT: [],
  JAIL_PAY: [], JAIL_CARD: ['cardIndex'], BID: ['amount'], PASS: [],
  BUILD: ['tile'], SELL: ['tile'], SELL_SET: ['tile'], MORTGAGE: ['tile'], REDEEM: ['tile'],
  BUILD_JOIN: ['tile'], BUILD_DECLINE: [], MORTGAGE_KEEP: [], MORTGAGE_REDEEM: [],
  OFFER: ['trade'], COUNTER: ['trade'], TRADE_ACCEPT: [], TRADE_REJECT: [], CLAIM_RENT: ['claimId']
 };
 check(Object.hasOwn(fields, a.type), 'Aksi tidak dikenal.');
 check(Object.keys(a).every(k => ['type', 'id', 'expectedVersion', ...fields[a.type]].includes(k)), 'Nilai tambahan tidak boleh dikirim pada aksi.');
 check(typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 80, 'ID perintah diperlukan.');
 check(Number.isSafeInteger(a.expectedVersion) && a.expectedVersion >= 0, 'Versi state diperlukan.');
 if (Object.hasOwn(a, 'tile')) check(Number.isInteger(a.tile) && a.tile >= 0 && a.tile < 40, 'Petak tidak valid.');
 if (Object.hasOwn(a, 'amount')) check(Number.isSafeInteger(a.amount) && a.amount >= 0, 'Jumlah tidak valid.');
 if (Object.hasOwn(a, 'cardIndex')) check(Number.isInteger(a.cardIndex) && a.cardIndex >= 0, 'Pilihan kartu tidak valid.');
 if (Object.hasOwn(a, 'claimId')) check(typeof a.claimId === 'string' && a.claimId.length <= 128, 'Klaim tidak valid.');
 if (fields[a.type].includes('trade')) {
  const t = a.trade;
  check(t && typeof t === 'object' && Object.keys(t).every(k => ['to','give','take','giveCash','takeCash','giveCards','takeCards'].includes(k)), 'Isi barter tidak valid.');
  check(Number.isInteger(t.to) && t.to >= 0 && t.to < 6, 'Penerima barter tidak valid.');
  for (const field of ['give','take']) check(Array.isArray(t[field]) && t[field].length <= 28 && t[field].every(id => Number.isInteger(id) && id >= 0 && id < 40), 'Daftar aset tidak valid.');
  for (const field of ['giveCash','takeCash','giveCards','takeCards']) check(Number.isSafeInteger(t[field]) && t[field] >= 0, 'Nilai barter tidak valid.');
 }
 return a;
}
export function applyOperation(room, seat, body, now, rng) {
 const type = body.type;
 if (type === 'JOIN') return;
 if (type === 'HEARTBEAT') return;
 if (type === 'READY') {
  check(room.status === 'waiting', 'Pertandingan sudah dimulai.');
  check(typeof body.ready === 'boolean', 'Status siap tidak valid.');
  if (Object.hasOwn(body, 'pawn')) room.seats = setSeatPawn(room.seats, seat, body.pawn);
  room.seats[seat].ready = body.ready;
 } else if (type === 'START') {
  check(seat === room.host, 'Hanya host yang dapat memulai.', 403);
  check(room.status === 'waiting' && room.seats.length >= 2 && room.seats.every(s => s.ready && isConnected(s, now)), 'Tunggu minimal dua pemain, semuanya terhubung dan siap.');
  room.state = createGame({players: room.seats, rules: room.rules}, rng);
  room.status = 'playing';
 } else if (type === 'ACTION') {
  check(room.status === 'playing', 'Permainan sedang dijeda atau belum aktif.', 409);
  check(!gameplayHeld(room, now), 'Keputusan ditahan sampai seluruh pemain aktif tersambung kembali.', 409);
  const action = validateOnlineAction(body.action);
  // Persistent request receipts handle retries; never trust a client-provided dedup entry.
  check(action.expectedVersion === room.state.version, 'State berubah. Ambil kondisi terbaru lalu coba lagi.', 409);
  try { room.state = command(room.state, seat, {...action, id: `${room.seats[seat].userId}:${action.id}`}, rng); }
  catch (error) { if (error?.constructor === Error) throw new RoomError(error.message); throw error; }
  if (room.vote?.status === 'open' && room.vote.eligible.some(i => room.state.players[i].out)) room.vote.status = 'cancelled';
  if (room.state.phase === 'won') room.status = 'finished';
 } else if (type === 'PAUSE_REQUEST') {
  activePlayer(room, seat);
  check(room.status === 'playing', 'Pertandingan tidak sedang aktif.', 409);
  check(room.vote?.status !== 'open', 'Voting jeda sudah berlangsung.', 409);
  check(room.lastVoteAt === null || now - room.lastVoteAt >= VOTE_MS + VOTE_COOLDOWN_MS, 'Tunggu sebelum mengajukan voting lagi.', 429);
  room.lastVoteAt = now;
  room.vote = {id: body.requestId, eligible: activeSeats(room), votes: {[seat]: true}, requestedBy: seat, createdAt: now, expiresAt: now + VOTE_MS, status: 'open'};
  tally(room, now);
 } else if (type === 'VOTE') {
  const v = room.vote;
  check(v?.status === 'open' && v.id === body.voteId && now < v.expiresAt, 'Voting tidak lagi berlaku.', 409);
  check(v.eligible.includes(seat) && !room.state.players[seat].out, 'Tidak memiliki hak suara.', 403);
  check(typeof body.agree === 'boolean', 'Suara tidak valid.');
  check(!Object.hasOwn(v.votes, seat), 'Suara sudah tercatat.', 409);
  v.votes[seat] = body.agree;
  tally(room, now);
 } else if (type === 'RESUME_READY') {
  activePlayer(room, seat);
  check(room.status === 'paused' && body.cycle === room.pause.cycle, 'Siklus jeda telah berubah.', 409);
  check(typeof body.ready === 'boolean' && isConnected(room.seats[seat], now), 'Harus terhubung untuk siap lanjut.');
  room.pause.ready = room.pause.ready.filter(i => i !== seat);
  if (body.ready) room.pause.ready.push(seat);
  const active = activeSeats(room);
  if (active.every(i => room.pause.ready.includes(i) && isConnected(room.seats[i], now))) {
   room.status = 'playing'; room.pause = null;
  }
 } else throw new RoomError('Permintaan tidak dikenal.');
}
export function joinSeat(room, body, userId, clientId, now) {
 const previous = seatFor(room, userId);
 if (previous >= 0) return previous;
 check(room.status === 'waiting', 'Pertandingan sudah dimulai.');
 check(room.seats.length < room.capacity, 'Room sudah penuh.', 409);
 room.seats.push(newSeat(body, room, userId, clientId, now));
 return room.seats.length - 1;
}
export function roomView(row, userId, now) {
 const room = row.data, seat = seatFor(room, userId);
 check(seat >= 0, 'Bukan peserta room.', 403);
 return {provider: 'supabase', online: true, roomRevision: row.revision, code: room.code, mode: 'online', seat,
  capacity: room.capacity, host: room.host, status: room.status, rules: room.rules, created: room.created, serverNow: now,
  held: room.status === 'playing' && gameplayHeld(room, now),
  seats: room.seats.map((s, i) => ({id: i, name: s.name, ready: s.ready, controller: 'human', pawn: s.pawn,
   connected: isConnected(s, now), lastSeen: lastSeen(s), out: !!room.state?.players[i]?.out})),
  vote: room.vote, pause: room.pause, state: room.state ? publicState(room.state) : null};
}
