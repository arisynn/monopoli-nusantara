> Catatan source aktif: kontrak logic di dokumen ini tetap berlaku. Frontend baru kini tersedia di `frontend/`; baca README.md dan docs/FRONTEND_GUIDE.md untuk menjalankannya. Keterangan paket tanpa frontend di bawah adalah konteks basis v4.6.1.

# Panduan untuk AI yang membangun UI baru

Anda menerima **logic/backend + aset**, bukan source tampilan yang harus ditambal. Buat frontend baru dan sambungkan melalui kontrak berikut. `README.md` adalah pintu masuk; `UI_REBUILD_BRIEF.md` adalah kebutuhan produk. Folder source lengkap aslinya tidak ikut dikemas.

## 1. Aturan integrasi

- Jangan rewrite `lib/game.mjs`, `lib/bot`, `lib/server`, ekonomi Nusa atau migrations untuk menyesuaikan layout.
- Jangan membuat engine kedua di reducer React, fungsi animasi atau endpoint UI.
- UI lokal mengirim command ke engine lokal. UI online mengirim niat ke backend dan merender snapshot hasil backend. **Client online tidak memanggil `command()` untuk menetapkan hasil otoritatif.**
- Dadu/uang/posisi/kartu/properti tidak berasal dari animasi. Callback animasi hanya memajukan presentasi lokal.
- Tidak ada bot pengganti manusia disconnect. Host bukan server dan bukan pemilik kursi orang lain.
- Semua angka/kontrol dalam mockup hanya ilustrasi. Nilai dan hak aktual diperoleh dari modul paket.

## 2. Apa yang sudah tersedia

| Perlu | Modul/kontrak |
| --- | --- |
| Buat/ubah state sah | `createGame`, `command`, `decisionActor` dari `lib/game.mjs` |
| Board/rulepack/city/card templates | `BOARD`, `GROUPS`, `DECKS`, `RULEPACK` dari `lib/content.mjs` |
| Validasi manajemen properti | `canManage`, `managementError`, `assets`, `stock`, `redemption`, `rent` dari engine |
| Format/input uang | `money`, `parseNusa`, `nusaInput`, `nusaText` dari `lib/currency.mjs` |
| Local AI | `decideMind`, `observation`, `simulationActor` dari `lib/bot/mind.mjs` |
| Local Worker adapter | `createMindClient` dari `lib/bot/mind-client.mjs` |
| Persona/komposisi baru | `localPlayers`, `PERSONAS` dari `lib/bot/personas.mjs` |
| Hybrid advisor | Server `lib/groq.ts`, endpoint `/api/bot`, types `lib/bot/contracts.ts` |
| Room/service/worker | `lib/server/online-service.mjs`, `online-room.mjs`, `bot-worker.mjs` |
| Browser Auth/Realtime | `OnlineAuth`, `connectionId`, `subscribeRoom` dari `lib/online-client.mjs` |
| HTTP/revision helpers | `lib/room-client.mjs` |
| Save lokal/ekspor | `lib/storage.ts`, `lib/save-format.mjs` |
| Antrean presentasi murni | `lib/presentation-timeline.mjs`, types `lib/presentation-types.ts` |
| Metadata keputusan/popup | `lib/gameplay-presentation.mjs`; metadata saja, bukan otorisasi |
| Ledger/riwayat uang | `transactionDeltas`, `financeRows`, `financeLabels` dari `lib/finance.mjs` |
| Geometri board/pion | `lib/board-camera.mjs`, `pawn-layout.mjs`, `pawn-animation.mjs` |
| Seleksi/barter/helper tanpa DOM | `lib/compact-ui.mjs`, `lib/auction-presentation.mjs` |

Tidak ada hook React `useGameplayPresentation` di paket ini: hook tersebut merupakan frontend dan sengaja dikeluarkan. Gunakan **pure timeline yang sama**, lalu tulis scheduler/render hook baru untuk framework pilihan Anda.

## 3. State: pisahkan yang otoritatif dan yang visual

Tiga lapis yang harus dibedakan:

1. **Authoritative state**: state utuh lokal atau snapshot publik hasil server. Ini yang menjadi basis version, aksi berikutnya dan persistence.
2. **Presentation model/state**: proyeksi antrean yang menahan reveal, posisi atau saldo untuk urutan visual. Tidak disimpan sebagai hasil pertandingan.
3. **UI state**: popup terbuka, filter aset, draft barter, pilihan kamera, focus. Bukan bagian engine.

Field utama state v2: `schemaVersion`, `matchId`, `version`, `rulepackVersion`, `presentationVersion`, `players`, `assets`, `turn`, `startSeat`, `turnSerial`, `round`, `phase`, `starting`, `dice`, `utilityDice`, `doubles`, `extra`, `bank`, `card`, `auction`, `trade`, `debt`, `mortgageDecision`, `buildOffer`, `rentClaims`, `queue`, `log`, `eventId`, `lastMove`, `seen`, `advisorEnabled`, `aiStatus`, `aiComment`, dan `winner` jika selesai. Jangan mengganti nama field berdasarkan asumsi dari source lama.

- `players[i].id` adalah seat index. Ada `name/controller/pawn/cash/pos/inJail/jail/cards/out` dan field persona/model untuk bot.
- `assets[tileId] = {owner:number|null, level:0..5, mortgaged:boolean}`; 5 = hotel.
- `phase` mengatur legalitas tindakan, bukan popup. `turn` bukan satu-satunya pemegang keputusan: lelang, klaim sewa, barter, utang dan buildOffer dapat melibatkan seat lain.
- `publicState(fullState)` menghapus `decks`, `seen`, `botMemory` dan log privat. Jangan mengirim state penuh server ke browser.
- Snapshot publik online **tidak dapat dipakai sebagai save/restore otoritatif**: informasi privat tetap di backend. Local save memakai state lokal utuh.

## 4. VS Bot lokal

Komposisi baru hanya satu manusia: total 2 = Jovan+Raka, 3 = +Bima, 4 = +Sari. `localPlayers()` memvalidasi jumlah serta persona/pion. `MODELS` memiliki `easy/medium/hard/hardcore`; default existing `medium`. Nama karakter tetap, model dan persona berbeda konsep.

Contoh membuat state dan mengeksekusi perintah tanpa renderer:

```js
import {createGame, command, decisionActor} from './lib/game.mjs';
import {localPlayers} from './lib/bot/personas.mjs';
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
let authoritative = createGame({
  players: localPlayers('Jovan', 4, 0, {raka:'medium', bima:'hard', sari:'hardcore'}),
  rules:'digital', advisorEnabled:false
}, secureRandom);

// Default game dimulai dari phase starting, bukan langsung ROLL.
const actor = decisionActor(authoritative);
const action = {type:'START_ROLL', id:crypto.randomUUID(), expectedVersion:authoritative.version};
authoritative = command(authoritative, actor, action, secureRandom);
```

Gunakan kunci in-flight/ref agar double click sebelum rerender tidak memanggil dua command. `command` memvalidasi `expectedVersion`, idempotency, fase, kepemilikan dan ekonomi; jangan menggantikan validasi itu dengan tombol disabled saja. Save snapshot otoritatif setelah command berhasil. Tangani exception sebagai feedback ringkas, tanpa memutasi input untuk “memperbaiki” fase.

Untuk bot lokal, gunakan `createMindClient()` dalam browser Worker agar search tidak membekukan UI. Ini adapter tanpa React. Cancel/dispose saat match berubah, unmount, pause atau snapshot berganti. Hasil memuat match/version/actor: validasi ulang sebelum commit. Jika tidak ada Worker atau Worker gagal, adapter memakai baseline ekonomi lokal dan memberi diagnostik fallback. Jangan menganggap Hard/Hardcore aktif bila worker fallback ke Medium.

Dalam self-play headless, `simulationActor()` melayani fase di luar main turn. Pada gameplay manusia/bot, evaluasi bot yang benar-benar perlu merespons; jangan sekadar `players[state.turn]` pada setiap fase. Contoh worker online adalah referensi penjadwalan fase. Selalu batasi langkah per invocation dan hentikan pada keputusan manusia/pause.

## 5. Action catalog

Semua aksi online menggunakan `{type,id,expectedVersion,...fields}`. Jangan mengirim field lain seperti dice, saldo, owner baru, actor atau winner. Daftar whitelist actual berada di `validateOnlineAction()` dan juga `docs/CONTRACTS.json`.

| Fase/kebutuhan | Aksi | Field tambahan |
| --- | --- | --- |
| Lempar awal | `START_ROLL` | tidak ada |
| Lempar pergerakan/percobaan penjara | `ROLL` | tidak ada |
| Akhir giliran | `END` | tidak ada |
| Beli / mulai lelang properti | `BUY` / `AUCTION` | tidak ada |
| Lelang | `BID` / `PASS` | `amount` hanya BID |
| Kartu | `ACK` | tidak ada; hanya pemegang keputusan aktif |
| Penjara | `JAIL_PAY`, `JAIL_CARD` | `cardIndex` opsional untuk kartu |
| Aset | `BUILD`, `SELL`, `SELL_SET`, `MORTGAGE`, `REDEEM` | `tile` |
| Stok bangunan langka | `BUILD_JOIN`, `BUILD_DECLINE` | `tile` untuk JOIN |
| Penerimaan aset tergadai | `MORTGAGE_KEEP`, `MORTGAGE_REDEEM` | tidak ada |
| Utang | `PAY`, `BANKRUPT` | tidak ada |
| Barter | `OFFER`, `COUNTER` | `trade` |
| Respons barter | `TRADE_ACCEPT`, `TRADE_REJECT` | tidak ada |
| Sewa manual | `CLAIM_RENT` | `claimId` |

`trade` tepatnya `{to,give:tileIds[],take:tileIds[],giveCash,takeCash,giveCards,takeCards}`. Perspektif selalu milik pengirim command: give = aset/uang yang ia berikan, take = yang ia minta. Counteroffer perlu menukar sisi dengan benar; jangan reuse form tanpa memperbarui perspektif penerima. Draft bukan state transaksi dan boleh disimpan di UI. Validasi final tetap engine.

Gunakan helper legalitas untuk preview: `managementError()` mengembalikan alasan; `canManage()`/`canTrade()` hanya sinyal awal, bukan janji aksi akan lolos setelah revision berubah. Pada lelang, kas highest bidder dicadangkan; jangan menjanjikan saldo bebas melebihi yang sah. Ikuti `AUCTION_RULES`: internal minimum 100 = N 10, increment/kelipatan 10 = N 1. Jangan hardcode dari tampilan mockup.

## 6. Nusa dan ledger

**10 unit internal = N 1.** Contoh `cash:15000` ditampilkan `money(15000)` → `N 1.500`. Engine, API, save dan command selalu integer unit internal. Jangan membagi state dengan 10 atau membulatkan nilai saat menyimpan.

`parseNusa('120')` → 1200. `parseNusa('1,5')` → 15. Input bukan string uang berformat ribuan: gunakan `nusaInput()` dan parser yang disediakan. Jangan mengirim hasil `parseFloat(money(...))`.

Peristiwa `log` dapat membawa `finance:[{kind,from,to,amount,tile?,card?}]`. `null` untuk from/to berarti bank, bukan pemain baru. Gunakan `transactionDeltas()` untuk signed effects dan `financeRows()` untuk teks riwayat. Jangan menyimpulkan transaksi baru dari beda saldo antar snapshot, karena reconnect dan revisi gabungan dapat menggandakan animasi. Satu ledger dapat menghasilkan dua baris perspektif tanpa menyimpan transaksi ganda.

## 7. Multiplayer: kontrak HTTP

`app/api/online/route.ts` adalah jalur baru Supabase. `app/api/game/route.ts` hanya adapter legacy room bertoken; jangan membangun room baru manusia di jalur legacy.

- `GET /api/online?config=1` → URL/public key/provider/flag bot atau `online:false`. Public key boleh ke browser; service-role dan Groq key tidak.
- Auth browser: `new OnlineAuth(config)`. Existing API mendukung `.guest()`, `.login(email,password)`, `.signup(email,password)`, `.link(email,password)`, `.consumeRedirect()`, `.token()`, `.session()`, `.request(path,body)`.
- **Source ini memakai email/password dan anonymous guest**, bukan magic link UI otomatis. Tambahan provider harus dirancang/diuji sendiri, bukan mengarang endpoint yang belum ada.
- Request room membawa `Authorization: Bearer <access_token>`; backend memverifikasi Auth dan binding seat. Nama, kode room atau `actor` dari client bukan bukti kepemilikan.
- `GET /api/online?rooms=1` daftar room milik identitas; `GET /api/online?code=ABCDEFGH` snapshot room.
- Kode room baru **8 karakter**, alfabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Legacy memakai 6; jangan memaksa salah satunya ke protokol lain.

Contoh envelope perubahan:

```js
const requestId = crypto.randomUUID();
const body = {
  type:'ACTION', code:room.code, clientId:connectionId(), requestId,
  action:{type:'ROLL', id:requestId, expectedVersion:authoritative.version}
};
const result = await auth.request('', body);
// Ambil result.state, result.seat, result.roomRevision dan status room.
// Jangan menghitung sendiri hasil roll.
```

`requestId` dan `action.id` **harus sama**. Untuk retry request yang belum diketahui hasilnya, gunakan envelope/id yang sama persis; jangan reuse id untuk payload/clientId baru. Jika 409/version mismatch, fetch snapshot terbaru lalu minta tindakan baru yang sah. Jangan replay antrian transaksi offline begitu koneksi pulih.

Operasi room di luar action game: `CREATE`, `JOIN`, `READY`, `START`, `HEARTBEAT`, `ADD_BOT`, `PAUSE_REQUEST`, `VOTE`, `RESUME_READY`. Non-heartbeat memerlukan `requestId`; semua execute memerlukan `clientId` valid. Field spesifik lihat `docs/CONTRACTS.json`/source.

Response room: `provider`, `online`, `roomRevision`, `code`, `mode`, `seat`, `capacity`, `advisorEnabled`, `host`, `status`, `rules`, `created`, `serverNow`, `held`, `seats`, `vote`, `pause`, `state`. `roomRevision` dapat berubah tanpa `state.version` bertambah (misalnya heartbeat/ready/vote). Jangan memakai keduanya sebagai satu counter.

Seat viewer selalu `room.seat`, termasuk saat main turn milik bot/orang lain. Pemilik portofolio yang sedang dilihat boleh berbeda seat, tetapi tidak mengubah controllerId atau token. UI harus read-only untuk aset lawan. Host hanya mengelola lobby/start sesuai backend; tidak pernah menetapkan dadu/uang/posisi.

## 8. Realtime, heartbeat, reconnect

`subscribeRoom(config,code,()=>auth.token(),onChange,onStatus)` memberi **revision hint**, bukan state otoritatif. Di `onChange`, fetch HTTP snapshot terbaru dengan debounce ringan; gunakan `acceptRevision`/`mergeState` agar respons lama tidak menimpa baru. Simpan fungsi unsubscribe dan jalankan saat room berubah/unmount. Jangan membuka subscription berulang pada setiap render.

Kirim heartbeat HTTP berkala (pola lama sekitar 20 detik), hentikan/cleanup timer dengan aman. Lease server 35 detik (`LEASE_MS`); auto-pause 90 detik sejak lastSeen (`DISCONNECT_MS`). Browser offline event hanya indikator UX, bukan bukti server. Selama server mendeteksi lease pemain aktif hilang, `held` menahan gameplay. Jangan tampilkan jaminan deteksi fisik putus dalam nol milidetik.

Saat fokus/koneksi kembali: verifikasi Auth → ambil snapshot → pastikan room/seat cocok → pulihkan subscription → lakukan presentation baseline baru. Simpan reference target room agar hasil request room lama tidak diterapkan setelah pengguna berganti room. Refresh token ditangani adapter Auth dengan serialization browser locks bila tersedia. Guest di satu browser tidak menjamin recovery lintas perangkat; akun tertaut diperlukan.

## 9. Pause/resume dan bot online

- Status room: `waiting/playing/paused/finished`; phase engine adalah konsep terpisah.
- `PAUSE_REQUEST` memulai voting manusia aktif, pemohon dihitung setuju. Mayoritas `floor(humanAktif/2)+1`. Bot dan manusia bangkrut tidak voting; offline tidak otomatis dihapus dari denominator. Voting 60 detik, cooldown existing.
- `VOTE` membawa `voteId` dan boolean `agree`. Satu suara per pemilih; UI tidak menetapkan hasil.
- `RESUME_READY` membawa `cycle:room.pause.cycle` dan boolean `ready`. Resume hanya saat semua manusia aktif online/siap; bot ikut status room otomatis. Host tidak punya tombol paksa resume.
- Manusia disconnect tidak diganti bot. Kursi/aset tidak dihapus. Pending trade/auction/debt/card tetap ada.
- `ADD_BOT` hanya host saat Waiting, maksimal tiga persona unik, minimal dua kursi manusia dan maksimal kapasitas 6. Flag online bot OFF sampai worker/scheduler diverifikasi.
- **UI tidak mengeksekusi online bot melalui `command`, advisor lokal atau klaim host.** `lib/server/bot-worker.mjs` + jobs/lease/CAS + Edge Function/scheduler adalah jalurnya. Worker menghitung di luar transaksi dan validasi ulang status/version sebelum commit. Tidak memerlukan browser host terus terbuka.

Ikuti `docs/DEPLOY_SUPABASE.md`, `DEPLOY_HYBRID.md`, `DEPLOY_V46.md` untuk review backend/migrations dan staging. Konfigurasi/source/tes doubles bukan bukti setup remote sudah aktif.

## 10. Groq opsional

Semua model lokal berjalan tanpa API. `advisorEnabled` default false, berbeda dari `configured`. Status kontrak `BotDecisionResult` mencakup `local/configured/consulting/hybrid/fallback`, `action`, `comment`, `reason?`, match/version/actor dan metadata aman. `reason` adalah enum opsional yang sudah dideklarasikan, bukan alasan memakai `as any`.

Gunakan `/api/bot` hanya sebagai advisor mode lokal; ia tidak dapat mengubah room online. Online worker memanggil advisor server sendiri. AI eksternal hanya memilih kandidat dan melewati guardrail lokal; tidak memodifikasi state. Fallback tidak boleh membuat permainan menunggu tanpa batas. Bedakan konfigurasi tersedia dan request benar-benar berhasil. Jangan mengekspos API key, prompt mentah, stack atau analisis privat bot kepada pemain lain.

## 11. Antrean presentasi: ganti renderer, bukan aturannya

```js
import {ingestTimeline,presentedState,advanceTimeline,stepDuration,liveCardDecision}
  from './lib/presentation-timeline.mjs';
let model = ingestTimeline(null, authoritative); // baseline: tidak replay riwayat
function receiveSnapshot(snapshot, {reconnect=false, epoch=0}={}) {
  authoritative = snapshot;
  model = ingestTimeline(model, snapshot, {epoch, reset:reconnect});
  render(presentedState(model), model.queue[0] || null);
}
function completeVisual(stepId) {
  model = advanceTimeline(model, stepId); // stale id diabaikan
  render(presentedState(model), model.queue[0] || null);
}
```

`render` adalah fungsi UI baru Anda, tidak disediakan paket. Jadwalkan setiap head hanya satu kali, batalkan timer/RAF saat popup/paused/unmount/room change, simpan sisa durasi saat menahan presentasi. Gunakan `stepDuration` dengan opsi `fast/reduced`; animasi pion dapat memanggil completion valid berdasarkan step id, jangan memproses action.

Pola hasil:

1. `diceRolling`: hasil sah sudah ada pada step internal, tetapi **jangan tampilkan pasangan/total atau orientasi final/ARIA**. Tampilkan animasi tray generik.
2. `diceResult`: baru reveal pasangan sah. Opening dan utility roll tidak selalu menggerakkan pion.
3. `pawnMoving`: gunakan `head.move`, `pawnRoute`, `samplePawnRoute`. Jangan memulai saat rolling.
4. `tileArrival`, `eventRevealing`, `financialSettlement`: kartu/masuk-bebas penjara/hasil lelang dan ledger ditampilkan sekali dari event ID.
5. Setelah queue habis, keputusan yang sah dari phase dapat dibuka. Jangan membiarkan popup lama mengeksekusi keputusan baru.

Kartu publik dilihat semua peserta, tetapi hanya pemilik hak mendapat tombol ACK. Pakai `liveCardDecision(event,authoritative,seat)` sebelum ACK. Menutup popup pengamat hanya menutup presentasi lokal, bukan memproses efek kartu. Menutup popup penjara tidak mengirim perintah keluar penjara. Jangan trigger popup masuk penjara dari `inJail===true` pada setiap render.

Baseline reconnect/refresh/restore, match baru, background wake dan backlog recovery tidak memutar ulang seluruh log. `MAX_VISUAL_STEPS` membatasi backlog. State server tidak menunggu ACK animasi semua client. Membuka Aset/Barter/Riwayat boleh menahan presentasi lokal, tidak menahan transaksi server; setelahnya queue/recovery mengejar snapshot sah.

Authoritative state untuk save, bukan `presentedState()` yang masih menahan saldo/posisi visual. Signed Nusa effect berasal dari `head.finance`, bukan delta snapshot. Simpan event ID yang ditampilkan hanya untuk dedup presentasi, bukan otorisasi transaksi.

## 12. Board dan aset existing

Semua file dalam `public/` selain service worker lama disalin identik. Sajikan di `/assets/...` seperti semula, atau gunakan resolver path yang konsisten tanpa mengganti ID logic.

- `BOARD` tepat 40 petak. `tileRect(id)` memakai koordinat dunia **1000×1000**; tile 0 Mulai kanan bawah, 10 Penjara kiri bawah, 20 Parkir kiri atas, 30 Masuk Penjara kanan atas.
- `GROUPS` adalah warna tanah. Warna pemilik berbeda; jangan mengganti group strip dengan owner strip. Bangunan mengikuti `assets[tile].level` dan mortgage mengikuti flag asli.
- `TOKENS`/`pawnFor()` dari `pawns.mjs`: 0 Pinisi, 1 Komodo, 2 Becak, 3 Cenderawasih, 4 Angklung, 5 Rumah Gadang. **Gunakan player.pawn**, bukan mengasumsikan pawn selalu player.id. Sprite atlas lama tetap disertakan untuk kompatibilitas; SVG token terbaru di `assets/tokens/`.
- `pawnPlacement`, `pawnSlot`, `pawnRoute` menangani cluster dan gerakan pada empat sisi board, termasuk 1–6 pion. Renderer baru dapat memakai SVG/Canvas/CSS/native; posisi tetap deterministik.
- Artwork board `start/jail/gojail/parking/chance/community/station/tax/water/electric.svg` dan `region-atlas.webp` tersedia. Isi/nama/harga tile tetap dari BOARD, bukan teks di artwork/mockup.
- `nusa.svg` dan font `nusa-symbol.woff` adalah monogram Nusa. Scope font hanya ke glyph N simbol; teks lain tetap font normal dan sediakan literal fallback N. Jangan memakai font simbol untuk seluruh saldo/heading.
- `nusantara-scene.webp`, favicon dan ikon statis lama tetap tersedia. Lihat `docs/ASSET_MANIFEST.json` untuk path/ukuran/hash.

## 13. Save/load dan profil

`saveGame/loadGame` memakai IndexedDB dengan fallback localStorage; tidak memerlukan React. Jangan import/call saat server render. Namespace save lama jangan dihapus hanya karena UI diganti. `saveSlot/listSaves/clearSlot/savePrevious` adalah save lokal, bukan fasilitas mengganti state room online.

`serializeSave/parseSave/validateLocalState` menyediakan format JSON tervalidasi, maksimum ukuran, compatibility v1/v2 dan default fields. Jangan cast JSON sembarang ke state. Ketika local load/restore: cancel animasi & bot, validasi, reset baseline, pulihkan phase yang sama. State online selalu dibaca dari backend, jangan menerima impor JSON untuk room.

Profil UI dapat menunjukkan nama, pion, status koneksi, jumlah aset dan kondisi pertandingan yang sah. Paket ini tidak memiliki leaderboard akun, pembelian, premium wallet, MMR atau achievement global; jangan membuat seolah tersimpan di backend tanpa implementasi eksplisit.

## 14. Tugas AI pelaksana UI berikutnya

1. Audit isi paket dan jalankan `npm test`/demo. Catat versi Node dan lingkungan, jangan mengklaim backend live dari tes mocks.
2. Pilih framework dan proyek UI baru. Pasang dependency frontend di proyek UI tersebut; paket logic dapat dijadikan sibling/local package atau source integration yang terisolasi.
3. Tentukan transport: mount tiga Fetch handlers pada server framework yang sama atau reverse-proxy `/api/*` ke Node adapter. Berkas asli memakai alias `@/`; konfigurasi alias framework ke root logic yang benar. Node adapter sudah menyediakan resolver tanpa mengubah handler.
4. Implementasikan dua full-screen page dan popup pada brief. Integrasikan seluruh phase/actor terlebih dahulu, baru polish animasi. Hindari dialog full-screen baru untuk tiap fitur.
5. Jalankan regression: dice reveal, no early movement, card audience, jail dedup, ledger, trade perspective, legal building, debt, save roundtrip, bot no-stuck, concurrent action, Auth/seat, reconnect, pause/resume dan 2–6 pemain.
6. Tambahkan tes UI sebenarnya dan build framework baru. Tes headless 266 lulus tidak membuktikan layout atau React DOM.
7. Validasi Supabase/Groq hanya jika kredensial dan akses resmi tersedia. Tidak mencetak/memasukkan key ke source. Migrasi produksi harus ditinjau; jangan drop data untuk menyamakan mockup.
8. Laporkan selesai/parsial/belum diverifikasi dengan bukti. Jangan menyebut production-ready sebelum build, keamanan dan recovery live terpenuhi.

Jangan mengurangi tes logic agar UI baru terlihat berhasil. Jika source mengembalikan error validasi, tampilkan pesan aman dan ambil state terbaru; jangan mengakali dengan mutasi saldo/fase langsung.
