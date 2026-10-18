# Monopoli Nusantara — Logic Sistem Game

Engine aturan dan transisi state saja. Tidak berisi enam persona, model NUSA,
planner bot, frontend, atau layanan online. Bisa dipakai bersama dua sistem
bot terpisah; masing-masing menghasilkan action untuk engine yang sama.
Node.js 24+, tanpa npm install.

## Contoh satu aksi

Simpan sebagai `demo.mjs` di sebelah `index.mjs`, jalankan `node demo.mjs`:

```js
import {createGame, command, decisionActor, publicState} from './index.mjs';

let state = createGame({
  players: [
    {name: 'Sistem A', controller: 'bot', botPersona: 'sistem-a', pawn: 0},
    {name: 'Standalone', controller: 'bot', botPersona: 'standalone', pawn: 1},
  ],
  startingRoll: false,
  advisorEnabled: false,
});
const actor = decisionActor(state);
const view = publicState(state); // Kirim ke sistem bot pilihanmu.
const action = {type: 'ROLL'};   // Contoh respons, valid pada fase awal ini.
state = command(state, actor, {
  ...action,
  id: `action:${state.matchId}:${state.version}`,
  expectedVersion: state.version,
});
console.log({version: state.version, phase: state.phase});
```

`command(state, actor, action, rng)` mengembalikan state baru. Aksi ilegal
melempar exception dan tidak mengubah input. Simpan hasil hanya jika berhasil.
ID mencegah pengulangan aksi yang sama; expectedVersion menolak keputusan basi.
RNG default memakai Web Crypto dan rejection sampling tanpa bias. RNG opsional
untuk pengujian harus mengembalikan angka dalam rentang [0, 1). Host bertanggung
jawab atas penjadwalan, batas waktu dan fallback masing-masing sistem bot.

`publicState()` menyembunyikan urutan kartu, daftar ID aksi dan botMemory.
Engine tidak menjalankan AI atau membuat keputusan otomatis. `botPersona`
hanya label ID opsional untuk routing eksternal (1–64 karakter), boleh memakai
nama sistem/model baru. Parameter difficulty lama hanya metadata kompatibilitas.

## Aktor dan fase

- Gunakan `decisionActor(state)` untuk keputusan utama, bukan selalu state.turn.
- Pada lelang schema 2, peserta yang belum PASS dan bukan pemegang harga
  tertinggi boleh merespons. Pilih dari auction.participants, saring
  auction.passed dan auction.highest. command memeriksa legalitas akhir.
- Pada buildOffer, respons datang dari buildOffer.pending. Pada mode sewa
  manual, pemilik tagihan rentClaims dapat CLAIM_RENT di luar giliran.
- Trade, card, debt dan mortgage dapat menunggu pemain berbeda. Jalankan
  ulang pemilihan aktor setelah setiap state baru; berhenti pada phase 'won'.
- Untuk aksi yang salah, tangkap exception lalu minta bot memilih kembali;
  jangan mengulang action/ID yang sama tanpa batas. Model dan watchdog milik host.

## API aturan

- `createGame`, `command`, `decisionActor`, `publicState`.
- `BOARD`, `GROUPS`, `DECKS`, `RULEPACK`, `PAWNS`.
- `assets`, `complete`, `rent`, `worth`, `stock`, `managementError`,
  `canManage`, `canTrade`, `buildTargets`, `interest`, `redemption`.
- `serializeSave({state})`, `parseSave(text)`, `validateLocalState(state)`.
- `CURRENCY`, `money`, `parseNusa`, `nusaInput`, `auctionMinimum`.

Uang memakai integer: **10 unit internal = ₦1**. Schema 2 memakai pembuka
lelang minimal ₦5 (50 unit), kenaikan minimal ₦5; nominal tidak wajib kelipatan
lima. Maksimum 6 peserta per pertandingan. Save schema 1 memakai engine
historisnya, termasuk aturan historis lelang.

## Pemisahan dari aplikasi terintegrasi

Source aturan dipertahankan. Pada paket ini saja, fungsi pemilih aksi bot lama
botCandidates/chooseBot dihapus, pencatatan memori strategi dilepas, dan
validator difficulty dipisah menjadi controller-compat.mjs tanpa model.
Whitelist enam ID persona diganti validasi string sehingga label bot baru
bisa dipakai. Semua validator transaksi dan aturan permainan tetap aktif.
Folder lib tidak memerlukan file dari aplikasi asal. Modul data log/hasil
lelang dipertahankan karena dipakai engine. MANIFEST.json mencatat SHA-256
setiap file, kecuali manifest itu sendiri. Revisi paket 1.0.0 bukan nomor
rilis aplikasi penuh.
