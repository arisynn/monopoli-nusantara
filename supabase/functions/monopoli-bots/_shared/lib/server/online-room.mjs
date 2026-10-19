import {validDifficulty} from '../bot/mind-config.mjs';
import {requirePlayerName} from '../player-name.mjs';
import {createGame, publicState} from '../game.mjs';
import {commandWithTradeResult as command} from '../trade-command.mjs';
import {PERSONAS} from '../bot/personas.mjs';
import {availablePawn, setSeatPawn} from '../pawns.mjs';
import {commandBuildBatch,BuildBatchError} from '../build-batch.mjs';

export const LEASE_MS = 35000;
export const DISCONNECT_MS = 90000;
export const VOTE_MS = 60000;
export const VOTE_COOLDOWN_MS = 30000;
export class RoomError extends Error {
 constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; }
}
export function check(ok, message, status = 400) { if (!ok) throw new RoomError(message, status); }
export const activeSeats = room => room.seats.map((_, i) => i).filter(i => room.seats[i].controller==='human'&&!room.state?.players[i]?.out);
export const lastSeen = seat => Math.max(0, ...Object.values(seat?.connections || {}));
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
 return {userId, memberId:crypto.randomUUID(), name: requirePlayerName(body.name),
  controller: 'human', ready: false, pawn: availablePawn(room.seats, body.pawn), connections: {[clientId]: now}};
}
export function newRoom(body, code, userId, clientId, now) {
 const capacity = body.capacity ?? 6;
 check(Number.isInteger(capacity) && capacity >= 2 && capacity <= 6, 'Pilih kapasitas 2–6 pemain.');
 const room = {schemaVersion: 1, code, mode: 'online', rules: body.rules === 'classic' ? 'classic' : 'digital',
  advisorEnabled:body.advisorEnabled===true, capacity, created: now, status: 'waiting', host: 0, seats: [], state: null, vote: null,
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
 if(room.closed)return room;
 for(const member of room.seats)member.memberId ||= crypto.randomUUID();
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
  BUILD_BATCH: ['group','count'],
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
 if (a.type === 'BUILD_BATCH') {
  check(Number.isInteger(a.group) && a.group >= 0 && a.group < 8, 'Kelompok tidak valid.');
  check(Number.isInteger(a.count) && a.count >= 2 && a.count <= 15, 'Pilih 2–15 bangunan.');
 }
 if (fields[a.type].includes('trade')) {
  const t = a.trade;
  check(t && typeof t === 'object' && Object.keys(t).every(k => ['to','give','take','giveCash','takeCash','giveCards','takeCards'].includes(k)), 'Isi barter tidak valid.');
  check(Number.isInteger(t.to) && t.to >= 0 && t.to < 6, 'Penerima barter tidak valid.');
  for (const field of ['give','take']) check(Array.isArray(t[field]) && t[field].length <= 28 && t[field].every(id => Number.isInteger(id) && id >= 0 && id < 40), 'Daftar aset tidak valid.');
  for (const field of ['giveCash','takeCash','giveCards','takeCards']) check(Number.isSafeInteger(t[field]) && t[field] >= 0, 'Nilai barter tidak valid.');
 }
 return a;
}
export function applyOperation(room, seat, body, now, rng, options={botsEnabled:false}) {
 const type = body.type;
 if (type === 'JOIN') return;
 if (type === 'HEARTBEAT') return;
 if(type==='DISCONNECT'){
  delete room.seats[seat].connections[body.clientId];
  room.seats[seat].ready=false;
  if(!isConnected(room.seats[seat],now)&&activeSeats(room).includes(seat))pause(room,'leave',now);
  reconcile(room,now);
 } else if(type==='LEAVE'||type==='KICK'){
  check(room.status==='waiting','Peserta hanya dapat dikeluarkan sebelum permainan dimulai.',409);
  let target=seat;
  if(type==='KICK'){
   check(seat===room.host,'Hanya host dapat mengeluarkan peserta.',403);
   check(typeof body.memberId==='string','Identitas peserta diperlukan.');
   target=room.seats.findIndex(s=>s.memberId===body.memberId);
   check(target>=0,'Peserta sudah keluar. Muat kondisi room terbaru.',409);
   check(target!==seat,'Gunakan Keluar room untuk meninggalkan kursi sendiri.');
  }
  const host=room.seats[room.host];
  room.seats.splice(target,1);
  if(!room.seats.some(s=>s.controller==='human')){
   room.seats=[];room.host=null;room.closed=true;room.status='finished';room.advisorEnabled=false;
  }else{
   room.host=room.seats.includes(host)?room.seats.indexOf(host):room.seats.findIndex(s=>s.controller==='human');
   for(const member of room.seats)member.ready=false;
  }
 } else if (type === 'RENAME') {
  check(room.seats[seat].controller === 'human', 'Nama bot tidak dapat diubah.', 403);
  const name = requirePlayerName(body.name);
  room.seats[seat].name = name;
  if (room.state?.players?.[seat]) room.state.players[seat].name = name;
 } else if(type==='ADD_BOT'){
  check(options.botsEnabled,'Worker bot online belum diaktifkan.',503);
  check(seat===room.host,'Hanya host dapat menambah bot.',403);
  check(room.status==='waiting','Bot hanya dapat ditambahkan di lobby.',409);
  check(room.seats.length<room.capacity,'Room sudah penuh.',409);
  check(room.seats.length+1+Math.max(0,2-room.seats.filter(s=>s.controller==='human').length)<=room.capacity,'Sisakan kursi untuk minimal dua manusia.',409);
  check(body.difficulty===undefined||validDifficulty(body.difficulty),'Level bot tidak valid.');
  check(room.seats.filter(s=>s.controller==='bot').length<3,'Maksimal tiga bot di room.',409);
  check(body.persona===undefined||PERSONAS.some(p=>p.id===body.persona),'Persona bot tidak valid.');
  const persona=PERSONAS.find(p=>p.id===(body.persona||PERSONAS.find(p=>!room.seats.some(s=>s.botPersona===p.id))?.id));
  check(persona&&!room.seats.some(s=>s.botPersona===persona.id),'Persona bot sudah digunakan di room.',409);
  room.seats.push({controller:'bot',memberId:crypto.randomUUID(),botPersona:persona.id,botDifficulty:body.difficulty||'medium',name:persona.name,pawn:availablePawn(room.seats,persona.pawn),ready:false,userId:null,connections:{}});
 } else if (type === 'READY') {
  check(room.status === 'waiting', 'Pertandingan sudah dimulai.');
  check(typeof body.ready === 'boolean', 'Status siap tidak valid.');
  if (Object.hasOwn(body, 'pawn')) room.seats = setSeatPawn(room.seats, seat, body.pawn);
  room.seats[seat].ready = body.ready;
 } else if (type === 'START') {
  check(seat === room.host, 'Hanya host yang dapat memulai.', 403);
  check(room.status === 'waiting' && room.seats.filter(s=>s.controller==='human').length >= 2 && room.seats.every(s => s.controller==='bot'||s.ready && isConnected(s, now)), 'Tunggu minimal dua pemain, semuanya terhubung dan siap.');
  room.state = createGame({players: room.seats, rules: room.rules,advisorEnabled:room.advisorEnabled===true}, rng);
  room.status = 'playing';
 } else if (type === 'ACTION') {
  check(room.status === 'playing', 'Permainan sedang dijeda atau belum aktif.', 409);
  check(!gameplayHeld(room, now), 'Keputusan ditahan sampai seluruh pemain aktif tersambung kembali.', 409);
  check(room.seats[seat].controller==='human','Client tidak dapat menjalankan kursi bot.',403);
  const action = validateOnlineAction(body.action);
  check(action.type!=='ROLL'||!(room.state.rentClaims||[]).some(c=>room.state.players[c.to].controller==='bot'&&c.turnSerial<room.state.turnSerial),'Tunggu bot menagih sewa sebelum melempar.',409);
  // Persistent request receipts handle retries; never trust a client-provided dedup entry.
  check(action.expectedVersion === room.state.version, 'State berubah. Ambil kondisi terbaru lalu coba lagi.', 409);
  try { room.state = (action.type === 'BUILD_BATCH' ? commandBuildBatch : command)(room.state, seat, {...action, id: `${room.seats[seat].userId}:${action.id}`}, rng); }
  catch (error) { if (error?.constructor === Error || error instanceof BuildBatchError) throw new RoomError(error.message,400,error.code); throw error; }
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
 check(!room.closed,'Room sudah ditutup.',410);
 const previous = seatFor(room, userId);
 if (previous >= 0) return previous;
 check(room.status === 'waiting', 'Pertandingan sudah dimulai.');
 check(room.seats.length < room.capacity, 'Room sudah penuh.', 409);
 room.seats.push(newSeat(body, room, userId, clientId, now));
 return room.seats.length - 1;
}
export function roomView(row, userId, now) {
 const room = row.data, seat = seatFor(room, userId);
 if(seat<0||room.closed)throw new RoomError('Bukan peserta room. Kursi sudah tidak tersedia untuk identitas ini.',403,'room_membership_ended');
 return {provider: 'supabase', online: true, roomRevision: row.revision, code: room.code, mode: 'online', seat,
  capacity: room.capacity,advisorEnabled:room.advisorEnabled===true, host: room.host, status: room.status, rules: room.rules, created: room.created, serverNow: now,
  performance: room.performance||null,
  held: room.status === 'playing' && gameplayHeld(room, now),
  seats: room.seats.map((s, i) => ({id: i, memberId:s.memberId, name: s.name, ready: s.ready, controller: s.controller, botPersona:s.botPersona,botDifficulty:s.botDifficulty, pawn: s.pawn,
   connected: s.controller==='bot'||isConnected(s, now), lastSeen: lastSeen(s), out: !!room.state?.players[i]?.out})),
  vote: room.vote, pause: room.pause, state: room.state ? publicState(room.state) : null};
}
