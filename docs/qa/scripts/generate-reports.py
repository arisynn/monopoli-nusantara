import json,pathlib,collections,statistics,datetime
root=pathlib.Path(__file__).resolve().parents[3];q=root/'docs/qa';e=q/'evidence'
def j(name):
 p=e/name
 return json.loads(p.read_text()) if p.exists() else None
def write(name,text): (q/name).write_text(text.strip()+'\n')
commit='6b237b4c7bc1cd133d74b7585ba011e1d8ba261c';env=f'Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source {commit}, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.'
b=j('benchmark.json');matches=j('browser-matches.json');commands=j('commands.json');extra=j('extra-commands.json') or [];runs=b['runs'];normal=[r for r in runs if r['stopReason']=='normal_winner'];counts=collections.Counter(r['stopReason'] for r in runs);wins=collections.Counter(r['winner'] for r in normal);total=sum(r['actions'] for r in runs)
continuations=[]
for fn in ['browser-continuations-final.json','browser-continuation-3-final.json','browser-continuation-1-retry.json']:
 continuations.extend(j(fn) or [])
continuations=list({r['match']:r for r in continuations if r['status']!='harness_error'}.values())
endings=j('endgames.json') or []
# Current results are regenerated when the long browser runs finish.
feature='''
| Fitur/dependency | Implementasi aktif | Bukti eksekusi / status |
|---|---|---|
| Lobby VS Bot 2–6 | frontend/app.mjs, personas.localPlayers | PASS lima ukuran roster lewat UI |
| Enam persona | Raka/Bima/Sari: decideMind; NUSA: V23 Chronos/Kairos; Arka: APEX-JS-3.0; Kresna: V2.0 | PASS benchmark semua persona; model tidak diubah |
| Engine schema 2 | lib/game.mjs + content.mjs, rulepack nusantara-c1009-2 | PASS invariant per aksi; legacy schema 1 punya reducer sendiri |
| Board/pion/kamera | frontend/board.mjs, board-camera.mjs, assets | PASS portrait umum; FAIL layar sangat pendek |
| Uang, rumah/hotel, gadai | game.mjs, finance.mjs, build-batch.mjs | PASS headless + UI fixture, termasuk double-click bangun |
| Lelang terbuka | game.mjs, auction-view.mjs | PASS transaksi UI; suite lama FAIL pada ekspektasi modal hasil |
| Barter dan receipt 4.11.6 | trade-command.mjs, TradeResults, shared popup | FAIL footer stale; PASS transfer/sudut pandang/persistensi terukur |
| Save lokal | storage.ts, IndexedDB CAS + localStorage, Web Locks | PASS suite inti; tab race browser di suite tambahan |
| PWA/offline | service-worker.js, pwa.mjs, precache | PASS suite PWA + reload production offline pada profil QA |
| Backend | Vercel api/index.mjs -> server-dist; /api/auth,/online,/bot,/worker | PASS endpoint/config/Auth dan dua sesi live |
| Room authoritative | online-service.mjs, online-room.mjs, Supabase RPC CAS/receipt | PASS wrong-turn, duplikat request, stale version dan snapshot live |
| Realtime | Supabase mn_room_updates; WebSocket memberi revision hint; HTTP recovery | PASS pesan WebSocket dan sync dua konteks; reordering live belum diinjeksi |
| Termux | PM2/daemon, compute threads, restricted worker protocol, Supabase jobs | FAIL availability live: offline/0 slot; PASS 67 test lokal |
| Edge worker | supabase/functions/monopoli-bots/_shared | Source relevan cocok; runtime Edge aktif tidak terbukti, provider live Termux |
| Groq advisor | /api/bot, kuota, fallback lokal | GET configured:true model gpt-oss-120b; panggilan berbayar tidak dipaksa |
| Migrasi/RLS | delapan SQL migration 001–008 | Source ditinjau; live capabilities schemaVersion 7; katalog DB/RLS tidak diakses langsung |
'''
write('FEATURE_DEPENDENCY_MAP.md',f'''# Peta fitur, source dan deployment

{env}

Clone bersih dibuat pada branch `qa/full-audit-2026-10-19`. HEAD `6b237b4` (pesan commit `y`), parent rilis `7f81589` (`4.11.6`). Proyek native ESM tanpa dependency runtime; TypeScript dipakai pada sebagian adapter/server, diubah saat build. `dist` berisi 103 modul browser reachable, `server-dist` 74 modul server privat. Node 24.x sesuai package.json.

{feature}

## Alur dependency

```mermaid
flowchart TD
 UI[Browser portrait / app.mjs] --> Session[GameSession dan presentation timeline]
 Session --> Local[Shared engine + local Web Worker persona]
 Session --> Save[IndexedDB CAS / localStorage / Web Locks]
 Session --> Online[Vercel /api/online]
 Online --> Auth[Supabase Auth via /api/auth]
 Online --> DB[Supabase room RPC / CAS / receipts]
 DB --> Hint[Realtime revision hints]
 Hint --> Session
 DB --> Job[Bot jobs / lease]
 Job --> Termux[Termux PM2 / compute threads]
 Termux --> Worker[Vercel /api/worker validates and commits]
 Worker --> DB
 Session --> Advisor[Optional /api/bot / Groq]
```

## Kecocokan versi

- Production `/build.json` dan build clone sama: **4.11.6 / 392170ce55b1d147**.
- Tujuh file publik diunduh dan SHA-256 dibandingkan byte demi byte: app, session, CSS, trade-results, engine, wrapper barter, service worker. Semua cocok: [production-file-comparison.json](evidence/production-file-comparison.json).
- `/api/worker` mengumumkan protocol/manifest yang cocok. Receipt barter live berstruktur membuktikan fitur backend 4.11.6 tersedia. Endpoint publik tidak memberikan commit SHA backend; kesamaan byte keseluruhan backend tidak dapat dibuktikan.
- Seluruh 51 hash file terlindungi dan hash file manifest diverifikasi; lihat [integrity.json](evidence/integrity.json) dan `extra-suite-03.log`. Dua modul client browser tidak disalin ke Edge (`mind-client`, `mind.worker`); itu pengecualian graph browser, bukan bukti worker berbeda versi. Modul terlindungi yang disalin cocok.
- Termux tidak aktif saat diuji. Versi paket/proses di perangkat Termux belum dapat diverifikasi walau manifest protokol backend cocok. Tidak ada pairing/restart dilakukan.
- PWA memakai cache per build, cache-first shell/modules, API di luar cache. Update menunggu aman di lobby/tab lain. Fresh profile mendapat versi terbaru; perangkat lama yang tetap membuka tab dapat tetap memakai shell lama dengan sengaja. Upgrade dari service worker production versi lama tidak diuji karena profil lama tidak tersedia. `v4110` pada prefix cache bukan bukti aplikasi masih 4.11.0; suffix fingerprint menentukan cache.

## Area risiko tinggi

1. Shared dialog DOM/cache dipakai lintas popup; footer kosong sesudah transaksi meninggalkan kontrol sebelumnya (QA-001).
2. Jalur async timeline/model/UI: state authoritative bisa lebih maju dari animasi; automation wajib menunggu kontrol yang tepat.
3. Ketergantungan worker perangkat: bot online berhenti tersedia ketika Termux offline (QA-003).
4. Transaksi utang/lelang/barter bertumpuk: banyak konteks resume; telah diuji per aksi, belum semua interleaving live.
5. PWA lama, beberapa tab, dan refresh saat receipt belum dibaca: unit/local DOM ada, upgrade lintas versi production belum ada profil.
6. Mobile portrait sangat pendek; board tetap persegi dan body tidak scroll (QA-002).
7. Suite browser lama tidak selalu mengikuti kontrak UI terbaru; status hijau suite inti saja tidak cukup (QA-004/005).

Dokumentasi riwayat di README memuat status lama 4.10 dan bukan observasi deployment sekarang. Rulepack memakai fixed point: 10 unit engine = ₦1. Batas lelang aktif 50 unit = ₦5, bukan harga lama dalam tabel RULEPACK.
''')
bugs=[
 dict(id='QA-001',title='Popup hasil barter membawa tombol transaksi dari dialog sebelumnya',severity='P2',category='BUG',location='Shared dialog / hasil barter 4.11.6',steps='1. Mulai permainan lokal dengan tawaran bot kepada manusia.\n2. Klik Tolak atau Terima pada Tawaran Barter.\n3. Tunggu popup hasil.\n4. Periksa footer; klik tombol Tolak yang masih tampil. Jalur lain: ajukan hadiah uang ke Raka lalu tunggu hasil berhasil.',expected='Popup receipt hanya menyajikan hasil dan Tutup; kontrol penerimaan/penolakan/pengajuan sebelumnya hilang.',actual='Hasil ditolak/diterima masih memuat Terima, Tawar balik, Tolak. Klik menghasilkan “Bukan keputusan bartermu.” Hasil hadiah dari manusia juga membawa “Ajukan tawaran”. Engine menolak klik stale; tidak ada transaksi ganda pada reproduksi. Tutup memulihkan kemajuan bot.',evidence='[match-4-end.png](evidence/match-4-end.png), [trace alami](evidence/match-4-trace.zip), [reproduksi accept/reject](evidence/trade-footer-repro.json), [hasil berhasil](evidence/asset-trade-trade-result.png), [bukti live penerima](evidence/advanced-trade-result-guest.png)',cause='Verified: renderDialog() mereset footerHTML ke string kosong ketika tidak ada popup, tetapi tidak membersihkan DOM footer. Receipt memiliki footer kosong setelah decisionFooter() membuang tombol close. Karena cache footerHTML juga kosong dan density tetap compact, penggantian innerHTML dilewati sehingga tombol lama tetap terlihat.',file='frontend/app.mjs renderDialog() sekitar 1116–1234; frontend/popup-controls.mjs decisionFooter(); frontend/popups.mjs tradeIncoming/tradeResult',fix='Saat dialog tidak aktif, kosongkan DOM/cache secara konsisten; saat mengganti identitas popup pastikan footer dirender ulang termasuk string kosong. Batasi handler tombol transaksi ke popup/decision yang berlaku. Pertahankan reducer/model.',regression='Browser alami: bot→human accept/reject, human→bot accepted, cancel/counter. Untuk setiap hasil pastikan tidak ada [data-type] transaksi atau submitTrade, hanya dismissal yang benar; klik kontrol lama tidak tersedia; refresh/reconnect dan Tutup tidak mengubah versi/saldo.'),
 dict(id='QA-002',title='Papan enam peserta tertutup kontrol pada portrait 360×480',severity='P2',category='BUG',location='Layout gameplay pada layar pendek',steps='1. Resume fixture lokal sah enam peserta di Chromium portrait 360×480.\n2. Gunakan overview.\n3. Ukur board dan action-console; lihat baris petak bawah.',expected='Seluruh papan dan kontrol dapat dilihat atau dicapai lewat scroll yang jelas.',actual='Board x0,y128,w360,h360: bottom488 > viewport480. Console dimulai y400 hingga480 sehingga sekitar88px bagian bawah papan berada di area kontrol/info. Tidak ada horizontal overflow, tetapi itu tidak membuktikan seluruh papan terlihat. Body overflow:hidden membatasi pemulihan lewat scroll.',evidence='[screenshot](evidence/mobile-360x480-font1.png), [geometri semua viewport](evidence/mobile-audit.json)',cause='Verified pada geometri DOM dan screenshot; penyebab CSS adalah kombinasi board persegi berukuran lebar, tinggi minimum baris gameplay dan body overflow:hidden. Breakpoint pendek tidak mencukupi enam pemain pada dimensi ini.',file='frontend/styles.css: .gameplay, .board-stage, media portrait pendek, body overflow',fix='Sesuaikan batas tinggi papan/komposisi pada viewport pendek atau sediakan scroll vertikal yang menjaga kontrol dapat dijangkau. Jangan mengubah ilustrasi board/pion.',regression='Ukur rect board tidak beririsan dengan gameplay-info/action-console pada 360×480, 360×600, 360×640 dan enam pemain; ulangi dengan modal, rotasi dan keyboard nyata.'),
 dict(id='QA-003',title='Bot online tidak tersedia karena worker Termux offline',severity='P1',category='BUG — operasional',location='Production tambah bot / dependency worker',steps='1. Login dua identitas tamu QA pada production.\n2. Buat room QA sendiri kapasitas3, gabungkan guest.\n3. Host pilih Tambah bot → Tambahkan bot.\n4. Bandingkan diagnostik terautentikasi.',expected='Bot online yang diaktifkan konfigurasi memiliki worker aktif sehingga dapat ditambahkan dan bermain.',actual='onlineBots:true, workerProvider:termux, workerConfigured:true, workerAlive:false, availableSlots:0. Penambahan ditolak “Bot online belum siap. Hubungkan worker terlebih dahulu.” Dua manusia dapat tetap bermain. Guard penolakan bekerja dengan aman; match bot online tidak dijalankan.',evidence='[diagnostik dan test live](evidence/multiplayer-advanced.json), [screenshot](evidence/advanced-add-bot.png), [attempt awal](evidence/multiplayer-advanced-attempt1.json)',cause='Verified bahwa worker tidak live pada waktu observasi. Penyebab perangkat mati/jaringan/PM2/pairing belum diketahui; tidak boleh disimpulkan model/worker beda versi.',file='app/api/online/route.ts preflight ADD_BOT; lib/server/worker-capabilities.mjs; Termux runtime eksternal',fix='Operator memulihkan worker yang sudah terpasang, memeriksa heartbeat/slot/lease dan monitoring. Validasi satu room QA bot setelah pulih. Tidak perlu mengubah model atau menjalankan deployment dari audit.',regression='Live dua manusia+bot: preflight, minimal beberapa giliran, disconnect worker, UI status offline, reconnect dan satu commit per job. Jangan menganggap local mocked worker sebagai pengganti uji ini.'),
 dict(id='QA-004',title='npm run test:online gagal karena alias loader tidak disertakan',severity='P2',category='TECH DEBT',location='package.json scripts.test:online',steps='1. Node24 pada clone bersih; npm ci --ignore-scripts.\n2. Jalankan npm run test:online.\n3. Jalankan file yang sama dengan --import ./adapters/node/aliases.mjs sebagai pembanding.',expected='Command test resmi menjalankan seluruh file tanpa masalah resolusi modul.',actual='Exit1, 79/80 test entry pass, auth-proxy.test.mjs gagal ERR_MODULE_NOT_FOUND pada @/lib dari app/api/auth/route.ts. Command file sama dengan loader alias exit0. npm test sudah menyertakan loader dan lolos.',evidence='[log asli](evidence/suite-03.log), [rerun dengan loader](evidence/extra-suite-00.log), [command/durasi](evidence/commands.json)',cause='Verified: script test:online tidak memiliki --import aliases.mjs sementara auth route masih memakai alias @/lib. Ini kerusakan entrypoint QA, bukan bukti auth production gagal.',file='package.json scripts.test:online; app/api/auth/route.ts imports',fix='Selaraskan command test dengan loader/entrypoint yang memang dipakai build tanpa mengubah perilaku game.',regression='CI menjalankan command npm persis dari package.json pada Node24 dan clone tanpa konfigurasi alias global.'),
 dict(id='QA-005',title='Beberapa suite browser memakai kontrak UI lama dan berhenti sebelum cakupan selesai',severity='P2',category='TECH DEBT',location='test:browser / test:portrait / test:auction / test:stability',steps='1. Build source4.11.6 dan jalankan server lokal.\n2. Jalankan keempat command browser dengan Playwright/Chromium valid.\n3. Telusuri assertion pertama yang gagal terhadap DOM/source saat ini.',expected='Suite menguji perilaku aktif dan menyelesaikan skenario yang diklaim.',actual='test:browser mengharapkan nol button dalam board-stage padahal bank-indicator adalah button. test:portrait mengharapkan nol lucide-icon pada dialog preserved, tetapi shared dismiss memakai ikon. test:auction menunggu modal result-hero padahal passivePopup() menyalurkan event pasif ke notice. test:stability memulai game dari tab tanpa nama sehingga profil terbuka lebih dahulu, bukan pesan lease yang ditunggu. Suite tetap berstatus FAIL; skenario sesudah titik gagal tidak dinyatakan pass.',evidence='[browser](evidence/suite-04.log), [portrait](evidence/suite-05.log), [auction](evidence/suite-06.log), [stability](evidence/suite-13.log), [auction trace state](evidence/auction-repro.json)',cause='Verified pada assertion dan source: penambahan Bank, perubahan dismiss, passive notice, serta kewajiban nama belum diterapkan menyeluruh ke suite lama. Kegagalan bank tambahan “null !== empty string” pada restorasi details dicatat terpisah sebagai Suspected, sebab race timing belum disingkirkan.',file='scripts/test-browser.mjs:18; test-portrait-browser.mjs:41; test-auction-browser.mjs:225; test-stability-browser.mjs:37; frontend/popup-controls.mjs',fix='Perbarui assertion dan fixture sesuai kontrak fitur yang disengaja; jangan menghapus check bermakna hanya agar hijau. Tambahkan check footer receipt yang benar-benar menemukan bug baru.',regression='Jalankan semua command browser dari clone bersih; pastikan jumlah skenario yang selesai dan test kondisi akhir, bukan hanya exit code.'),
 dict(id='QA-006',title='Dokumen RULEPACK masih menulis nominal lelang versi lama',severity='P3',category='TECH DEBT — dokumentasi',location='docs/RULEPACK.md tabel dan prosedur',steps='1. Baca baris Lelang properti pada RULEPACK.\n2. Bandingkan content.mjs AUCTION_RULES, konversi currency.mjs dan popup lelang4.11.6.',expected='Rulepack aktif menyebut minimal dan kenaikan yang sesuai rilis aktif, dengan unit jelas.',actual='Tabel menyebut mulai Rp100/kelipatanRp10/kenaikanRp10. Implementasi dan rilis terbaru menetapkan50 unit dasar=₦5, kenaikan50 unit=₦5. Dokumen historis belum konsisten. Perbedaan bukan bug pada lelang yang memang diperbarui sengaja.',evidence='docs/RULEPACK.md; lib/content.mjs AUCTION_RULES; [test preflight](evidence/extra-suite-00.log); [popup](evidence/auction-repro-before.png)',cause='Verified: dokumentasi tidak diperbarui setelah perubahan lelang. Aturan aktual dinilai menggunakan content, aturan UI dan catatan rilis terbaru, bukan baris dokumen yang tertinggal.',file='docs/RULEPACK.md tabel Lelang properti dan bagian Prosedur digital',fix='Perbarui dokumentasi untuk nominal ₦ dan bedakan unit engine; cantumkan perubahan house rule sebagai disengaja. Tidak mengubah aturan/engine.',regression='Test contract ringan membandingkan nominal rulepack UI/dokumen dengan konstanta resmi; review manual dokumen rilis.'),
]
write('BUG_REPORT.md','# Bug report\n\n'+env+'\n\n**6 temuan Confirmed: P0=0, P1=1, P2=4, P3=1.** Tiga mengenai runtime/operasional (QA-001/002/003); tiga mengenai tooling/dokumentasi (QA-004/005/006). Tidak ada bug finansial atau kebocoran secret yang confirmed.\n\n'+ '\n\n'.join(f'''## {r['id']} — {r['title']}

- Severity: **{r['severity']}**
- Status: **Confirmed**
- Kategori: {r['category']}
- Lokasi/fitur: {r['location']}
- Environment/commit: {env}

**Langkah reproduksi**

{r['steps']}

**Expected:** {r['expected']}

**Actual:** {r['actual']}

**Bukti:** {r['evidence']}

**File/fungsi:** `{r['file']}`

**Root cause:** {r['cause']}

**Rekomendasi fix:** {r['fix']}

**Regression test:** {r['regression']}
''' for r in bugs)+'''

## Observasi yang tidak dihitung sebagai bug confirmed

| Observasi | Status | Alasan / test lanjutan |
|---|---|---|
| test:bank kehilangan `open` pada details setelah navigasi sertifikat | Suspected | Lima viewport lulus sebelumnya, lalu assertion null vs empty string; butuh reproduksi stabil per metode button/Escape/back. Log suite-14.log. |
| Game browser #4 berhenti 45s saat footer hasil barter dibaca automation | Confirmed sebagai gejala QA-001 | Engine phase=end, bukan loop bot. Automation memilih tombol stale yang salah, bukan Tutup; close pada repro memulihkan bot. Tidak dihitung sebagai P1 bot stuck. |
| Satu headless match time_limit | Bounded result | Batas20s lokal, bukan kemenangan atau bukti bot loop. Tidak ada state signature berulang12 kali. |
| Timer/heap leak dalam sesi berjam-jam | Blocked | Pengujian belum mencakup durasi tersebut. |
| Termux model/protocol mismatch | Blocked | Worker offline; manifest backend cocok. Tidak ada bukti mismatch perangkat. |
''')
# Gameplay tables refreshed after long continuations.
rows='\n'.join(f"| {r['match']} | {'Production' if r['origin'].startswith('https') else 'Lokal identik'} | {r['n']} | {', '.join(p['persona'] for p in r['roster'] if p['persona']!='human')} | {r['durationMs']/1000:.1f}s | {r['uiActions']} / {r['engineActions']} | {r['status']} | {len(r['errors'])}/{len(r['network'])} |" for r in matches if 'roster' in r)
cr='\n'.join(f"| {r['match']} | {r.get('startVersion','?')} → {r.get('finalVersion','?')} | {r.get('uiActions','?')} | {r.get('durationMs',0)/1000:.1f}s | {r['status']} | {r.get('winner')} ({r.get('winnerController')}) |" for r in sorted(continuations,key=lambda r:r['match']))
write('GAMEPLAY_TEST_RESULTS.md',f'''# Hasil gameplay browser dan integritas aturan

{env}

## Eksekusi nyata

Lima pertandingan VS Bot dimulai lewat UI, masing-masing 2–6 peserta. Nama, jumlah peserta, persona dan pengaturan cepat/reduced dipilih lewat tombol/input. Game pertama dimainkan di production; empat berikutnya lokal dengan build yang tujuh file publiknya byte-identik. Semua dadu production memakai RNG asli. Tidak ada state/RNG production diganti.

| Match | Lokasi | Peserta | Bot | Durasi | Klik UI / aksi engine | Stop awal | JS/network error |
|---|---|---|---|---|---|---|---|
{rows}

`action_limit` di sini sengaja membatasi tahap awal80 aksi, bukan pemenang. Match4 mencapai78 lalu automation berulang memilih tombol stale pada receipt QA-001. Log dan trace menyimpan rangkaian tersebut; itu bukan bukti model bot macet. Dua percobaan pemilihan persona yang sudah dipakai kursi lain ditolak UI dengan benar; harness diperbaiki memilih persona unik dan match diulang. Lihat browser-first-attempt.json.

## Kelanjutan autosave asli

Untuk sesi panjang, autosave yang benar-benar dihasilkan tahap awal di-resume dalam browser lokal terisolasi. Kepemilikan, kas, kartu, giliran dan RNG tidak diubah. Match0 menjadi kelanjutan lokal dari autosave production yang sebelumnya dimainkan; proses berikutnya tidak berjalan di production. Semua aksi setelah resume tetap melalui UI. Automation menutup receipt dengan Tutup sebelum mencari command, sehingga mengatasi QA-001 sebagai pemain manusia.

| Match | Versi awal → akhir | Klik UI tambahan | Durasi tambahan | Hasil | Pemenang |
|---|---|---|---|---|---|
{cr or '| — | — | — | — | Belum ada hasil terminal saat laporan sementara | — |'}

Percobaan awal continuation mengandung timeout harness ketika modal baru muncul di antara pemeriksaan tombol dan klik. Itu disimpan di browser-continuations.json/browser-continuations-retry.json, tidak diklaim sebagai error game. Run final memakai retry untuk perubahan UI asinkron. Bila cap tetap tercapai, status cap tidak diubah menjadi kemenangan.

## Fixture akhir pertandingan legal

Lima fixture lokal tambahan: jumlah pemain2–6, dua survivor dan pemain lain sudah out. Satu survivor memiliki kelompok6/8/9 berhotel dengan stok sah; debtor hanya punya10 unit kas. ROLL reducer resmi menghasilkan mendarat6 dan utang sewa. Setelah resume lewat UI, manusia menyatakan bangkrut atau bot melikuidasi/bangkrut sendiri. Ini fixture akhir sah, **bukan lima pertandingan penuh dari saldo awal**.

| Fixture | Peserta awal | Hasil | Popup kemenangan |
|---|---|---|---|
'''+'\n'.join(f"| {r['i']} | {r['n']} | {'Manusia menang' if r['humanWins'] else 'Manusia kalah / bot menang'}; winner seat {r.get('winner')} | {'PASS' if r.get('wonModal')==1 else 'FAIL'} |" for r in endings)+f'''

## Interaksi yang benar-benar dilakukan

| Skenario | Status | Bukti / batas |
|---|---|---|
| Buka, nama, mode, roster, persona, mulai | PASS | Lima trace match0–4 |
| Dadu awal, roll gerak, end turn | PASS | Versi/log/dice nyata tiap match |
| Beli/tolak/lelang/pass | PASS | Match1/3 menolak; state log auction; auction suite sebagian dan UI nyata |
| Bid nominal valid/invalid | PASS lokal | test:auction sebelum assertion stale; invalid engine cases; belum bid realtime production |
| Barter manusia→bot | PASS transfer; FAIL UI | Hadiah₦100 ke Raka; saldo berkurang1000 unit sekali; receipt footer stale |
| Barter bot→manusia accept/reject | PASS transfer; FAIL UI | trade-footer-repro accept/reject dengan pertukaran properti+₦200 |
| Barter antar manusia live | PASS transfer/perspektif | Penerima melihat₦10 diterima, pengirim₦10 diberi; snapshot sama versi8 |
| Bangun merata hingga hotel | PASS | Double-click pesanan10: level5/5, kas15000→10000, bank rumah32 hotel10 |
| Gadai / tebus | PASS UI | Properti6:10000→10500→9950; bunga50; flag benar |
| Pembayaran sewa, pajak, gaji dan kartu | PASS engine; UI sesuai log | Benchmark ledger dan log pertandingan browser; kartu lokal otomatis setelah pembacaan |
| Penjara/keluar/kartu bebas | PASS engine; cakupan UI tergantung log | Cek aksi/event aktual di data browser; bukan semua jalur penjara diklik manual |
| Bangkrut dan menang manusia/bot | PASS fixture browser | Lima ending, pemenang engine dan popup; natural match di tabel continuation |
| Refresh receipt belum dibaca | PASS isi/snapshot | asset-trade-trade-refreshed.png; footer stale hilang setelah reload |
| Tutup receipt tidak mengulang transaksi | PASS | closeNoTransaction:true, resultNotRepeated:true pada asset-trade.json |
| Save dua tab Web Locks/CAS | PASS suite inti + browser tambahan | Jangan memakai test:stability yang FAIL sebagai bukti penuh |

## Audit rulepack dan invariant

Acuan utama: content.mjs / game.mjs, dokumen RULEPACK, catatan rilis4.11.5/4.11.6. Otomatisasi sewa digital, lelang terbuka, pembayaran kartu berurutan dan penjualan set sengaja diterapkan. Fixed point10unit=₦1. Tidak menilai semua house rule sebagai pelanggaran Hasbro. Dokumen rulepack sudah menyatakan keterbatasan pembandingan28 sertifikat/32 kartu terhadap set fisik; PDF Hasbro tidak diunduh ulang pada audit ini, sehingga tidak ada klaim100% cocok set fisik.

Benchmark **{len(runs)} match / {total:,} aksi** memeriksa setiap transisi:

- Kas integer aman dan tidak negatif; saldo sesudah identik saldo sebelum ditambah semua finance event baru.
- Owner valid, tidak ada aset milik pemain out; level0–5; aset tergadai tidak punya bangunan.
- Set bangunan satu owner, pemerataan level, stok aktual32 rumah/12hotel dan stock(s) konsisten.
- Total32 kartu konservatif terhadap deck, kartu bebas di tangan dan kartu bebas yang sedang dibaca; tidak ada duplikasi index.
- Posisi0–39 dan pemenang hanya survivor tunggal.

Hasil: tidak ada pelanggaran invariant atau error reducer. Ini meliputi transaksi bank yang mengeluarkan/menyerap uang secara sah, sehingga total uang pemain tidak dipaksa tetap konstan. Double-click/retry online juga diuji terhadap versi/receipt; bukan hanya kesamaan saldo akhir.

Bukti utama: browser-matches.json, browser-continuations-final.json, browser-continuation-3-final.json, match-*-state.json, endgame-*-states.json, benchmark.json, security-local.json. Screenshot/trace bukan simulasi engine; benchmark headless dilabel terpisah.
''')
online=j('multiplayer-advanced.json');live=j('multiplayer-live.json')
write('MULTIPLAYER_TEST_RESULTS.md',f'''# Multiplayer dan realtime

{env}

**Dua sesi browser independen benar-benar tersedia dan dipakai.** Setiap context mendapat identitas tamu sendiri melalui UI production. Tidak menggunakan akun/room pemain lain. Room QA yang pernah dibuat tercatat pada JSON; room bermain tidak dihapus. Percobaan LEAVE setelah start ditolak server sesuai aturan saat ini, sehingga room tersisa memakai mekanisme presence/expiry normal. Tidak ada database/save/pairing yang dihapus.

## Pengujian live

| Skenario | Status | Hasil teramati |
|---|---|---|
| Guest login dua identitas | PASS | /api/auth200, cookie/storage terpisah |
| Host buat room, guest join kode | PASS | Kapasitas3 dipilih lewat dropdown UI; kode milik QA |
| Ready, start | PASS | Kedua siap, host start, board dua sesi |
| Unready | NOT TESTED live | Ada coverage service lokal, tidak diklaim browser live |
| Dadu, pion, beli, pergantian giliran | PASS terbatas | Putaran awal dua manusia dan log uang terlihat di dua sesi |
| Server snapshot sama | PASS | Sesudah barter kedua GET state sama, hostVersion=guestVersion=8 |
| Realtime WebSocket | PASS terbatas | Host16 dan guest14 pesan pada koneksi awal, guest2 pada koneksi sesudah refresh; socket error0. Isi frame/token tidak disimpan |
| Lelang realtime lengkap | NOT TESTED | Keputusan lelang/browser lokal ada; belum diklaim live |
| Barter dua manusia | PASS transaksi/perspektif | Host memberi100 unit=₦10; guest menerima; tepat satu receipt |
| Popup hasil barter live | FAIL UI | Penerima membawa footer lama; QA-001. Rincian jumlah/perspektif benar |
| Barter dengan bot live | BLOCKED | Worker offline; tambah bot ditolak preflight |
| Dua request identik hampir bersamaan | PASS | Dua respons sukses versi5; state dari4 hanya menjadi5, dadu3+5 satu roll |
| Request ID sama, payload berbeda | PASS |409 “ID permintaan sudah dipakai untuk isi berbeda.” |
| Request terlambat versi sebelumnya | PASS |409 “State berubah…” |
| Pemain bukan giliran mengirim ROLL | PASS |400 “Belum waktunya melempar.” |
| Refresh lalu Resume | PASS | Identitas tetap, authoritative state pulih; tidak menyalin cache sebagai authority |
| Offline/reconnect singkat | PASS terbatas |4detik offline lalu reconnect; bukan pembuktian timeout lease35s/disconnect90s |
| Pause/resume/voting | NOT TESTED live | Service tests dan14 skenario browser lokal ada |
| Host disconnect/transfer | NOT TESTED live | Logika/service tests ada; tidak menunggu presence timeout production |
| Pemain bangkrut/keluar, pemenang online | NOT TESTED live | Fixture lokal ending tidak menggantikan ini |
| Dua tab identitas sama | NOT TESTED live | Suite lokal CAS/Web Locks/identity ada |
| Event berulang/terbalik | NOT TESTED live | Unit contract ada; jaringan production tidak disabotase |
| Retry setelah respons timeout hilang | NOT TESTED live | Duplikat bersamaan live diuji; hilang ACK worker diuji lokal |

## Worker dan kompatibilitas

Production config menyatakan `onlineBots:true`, tetapi preflight terautentikasi mengembalikan:

```json
{{"workerProvider":"termux","workerAlive":false,"availableSlots":0,"workerConfigured":true,"schedulerConfigured":false,"schemaVersion":7}}
```

`schedulerConfigured:false` tidak otomatis bug pada mode Termux; scheduler Edge berbeda dari heartbeat worker perangkat. Kegagalan utama adalah workerAlive:false dan slot0. UI berhasil menghindari memulai room dengan bot yang tidak dapat bekerja. Penyebab infrastruktur lebih dalam dan versi proses Termux BLOCKED.

## Authority, CAS dan idempotency

Source memvalidasi identitas Supabase dari bearer di server, memetakan user ke seat, memeriksa membership/lease/status, mem-whitelist action field dan memakai expectedVersion. Request digest mengikat requestId pada isi. Store commit memakai revision CAS dan receipts. Worker claim/submit memiliki lease dan revalidasi match/version/actor sebelum commit; client tidak dapat memasang saldo atau dadu sendiri.

Bukti kuat live adalah versi4→5 untuk dua request roll identik, penolakan salah giliran/stale version/payload berubah, serta state dua sesi yang sama setelah transfer. Ini tidak membuktikan RLS SQL live seluruhnya benar atau semua kemungkinan interleaving bebas masalah.

## Bukti dan batas automation

- [Live gameplay dua sesi](evidence/multiplayer-live.json), screenshot online-host-gameplay.png / online-guest-gameplay.png.
- [Race, authority, barter, worker](evidence/multiplayer-advanced.json), screenshot advanced-*.png.
- Log script `multiplayer-progress.log`, `multiplayer-advanced-progress.log`.
- Percobaan harness pertama gagal pada native select tersembunyi; kedua pada selector numerik tanpa kutip; percobaan berikut menilai ready sebelum response selesai. Semua disimpan sebagai attempt, tidak dianggap bug game. Iterasi advanced awal membuka profil karena UI presentasi tertinggal state authoritative; harness akhir memakai API sah untuk opening, lalu UI penerimaan barter.
- `test:online:rooms`:14 skenario browser **lokal** memakai MemoryOnlineStore, auth test, socket fixture; PASS65.896s. Itu bukan Supabase live.
- `test:online` literal FAIL karena loader, rerun file sama dengan loader PASS. `npm test`710/710 merupakan in-process/local coverage, bukan710 transaksi production.

**Skor reliability:70/100 pada rubrik master.** Dua manusia dapat bermain pada jalur yang diuji; rekomendasi publik dengan bot online menunggu pemulihan worker dan satu match live hingga pemenang.
''')
write('BOT_STABILITY_REPORT.md',f'''# Stabilitas bot dan benchmark seeded

{env}

**{len(runs)} pertandingan, {total:,} aksi legal yang berhasil dikomit;99 pemenang normal,1 time limit,0 error,0 aksi ilegal,0 pelanggaran invariant,0 loop terdeteksi oleh signature12 kunjungan.** Jumlah100 memenuhi target awal; tidak ada cap yang dihitung sebagai kemenangan.

## Konfigurasi yang dapat diulang

Script [benchmark.mjs](scripts/benchmark.mjs) memanggil production `decidePersona`, `botActor`, `brokerIntentMetadata`, dan wrapper command resmi. Rulepack digital schema2, hardcore metadata, pemain2/3/4/5/6 berotasi; semua enam persona tercakup. Seed engine: `0x4e550000 + matchIndex * 997`, LCG32bit. Opening roll aktif pada indeks genap.

Batas per match:4000 aksi,20.000ms, planning budget4ms. Budget kecil sengaja membatasi biaya; sebagian jalur persona memakai economic floor bila budget habis. Browser asli memakai320ms untuk sebagian bot hardcore dan NUSA setidaknya2600ms, sehingga benchmark ini **bukan evaluasi penuh mutu strategi/search production**. RNG engine dapat diulang; clock CPU/timing dan fallback planner tidak deterministik, sehingga hasil menang tidak dijanjikan bit-identik pada mesin lain. CPU dibagi dengan browser/tests lain, khususnya akhir benchmark.

Total durasi compute teramati {sum(r['durationMs'] for r in runs)/1000:.2f}s; durasi per match, histogram aksi dan p50/p95/max decision tersedia pada JSON. Jadwal/timer browser dan latensi network tidak termasuk latency headless ini.

| Outcome | Jumlah |
|---|---|
| Pemenang engine normal |99|
| Batas waktu |1|
| Batas aksi |0|
| Error / illegal action |0|
| Repeated-state12 |0|

## Pemenang normal, bukan balancing claim

| Persona | Kemenangan normal |
|---|---|
'''+'\n'.join(f'| {p} | {wins[p]} |' for p in ['nusa','kresna','apex','raka','bima','sari'])+'''

Roster, seat, ukuran match dan budget tidak merupakan desain statistik win rate seimbang. Angka ini tidak membuktikan NUSA lebih lemah/kuat daripada persona lain dan tidak menjadi alasan mengganti bobot/model.

## Match yang belum berakhir

Index99, seed1314292111,6peserta,862aksi,20.006,7ms, stop=time_limit. Tidak ditetapkan pemenang berdasarkan wealth. Tidak ada error atau loop berulang yang memenuhi threshold. Karena hanya ringkasan state disimpan untuk match normal/cap dan full snapshot khusus kegagalan/loop, replay sampai titik identik bergantung timing planner. Perbaikan harness yang disarankan: snapshot otomatis pada seluruh cap untuk investigasi lebih dalam.

## Legalitas dan loop

- Seluruh aksi dilaksanakan oleh engine asli; exception langsung menandai error.
- Perubahan uang diverifikasi terhadap metadata finance setiap command, termasuk bunga, rent, gaji, pembelian, bangunan, trade dan bankruptcy.
- Stok bangunan, pemerataan, owner pemain out dan konservasi kartu diperiksa setiap aksi.
- Signature mencakup phase/turn, posisi/kas/jail/out semua pemain, assets, debt/trade/auction dan doubles. Dua belas kemunculan state ekonomi sama akan menyimpan state+32aksi terakhir. Tidak ada yang terpicu. Ini heuristic, bukan bukti formal semua loop mustahil.
- Tidak ada rangkaian loop terkonfirmasi; karena itu tidak mengarang “state sebelum/sesudah loop”. Hambatan45s pada browser6peserta adalah tombol stale UI QA-001, pulih setelah Tutup, bukan model loop.

## Integrasi persona/worker

Semua enam persona tampil pada UI/source dan benchmark. NUSA di browser memakai worker/anggaran lebih besar; cancellation memeriksa match/version/actor. Worker online revalidasi lease dan state setelah compute/provider sebelum commit. TestTermux67/67, termasuk compute threads untuk dua room, lost submit ACK retry, semua persona, protokol manifest dan rejection state stale.

Live Termux offline. Legalitas/stabilitas **online** untuk keenam persona BLOCKED; tidak ada klaim seluruh persona telah menyelesaikan match production. Groq GET configured, parsing/fallback diuji lokal, panggilan advisor eksternal tidak dipaksa. Semua51 file dalam MODEL_MANIFEST dan file manifest sendiri tetap sesuai hash; tidak ada training, promosi, pergantian model, atau prepare:edge/deployment.

Skor bot lokal95/100: legalitas4/4, invariant4/4, progress4/4, outcome normal3/4, cakupan persona/roster4/4. Confidence untuk strategi full-budget dan live worker lebih rendah dari skor legalitas lokal.

Bukti: [benchmark.json](evidence/benchmark.json), [progress log](evidence/benchmark-progress.log), [Termux67 test](evidence/suite-15.log), [hash](evidence/integrity.json), [script](scripts/benchmark.mjs).
''')
write('UI_UX_REVIEW.md',f'''# Review UI/UX portrait dan pengalaman pemain

{env}

**Skor70/100.** Layout standar muat pada360×800,393×873,412×915. Popup barter punya masalah kontrol nyata QA-001; portrait360×480 dengan enam pemain mengalami overlap/clipping QA-002. Ini bukan tugas redesign; tidak ada aset, warna pion atau CSS game diubah.

## Eksekusi viewport

| Viewport | Pemain | Status geometri | Catatan |
|---|---|---|---|
|360×800|6|PASS|Board360persegi, console bottom800; modal Aset/Barter/Bank/Riwayat diuji|
|393×873|6|PASS|Board393persegi, console bottom873|
|412×915|6|PASS|Board412persegi, console bottom915|
|360×640|5 pada match alami|PASS terbatas|Match/UI/trace nyata; belum seluruh dialog pada6peserta|
|360×480|6|FAIL|Board bottom488, console y400–480, bagian papan tertutup|
|800×360 landscape|6|PASS geometri|Board312persegi, bottom351; kontrol sisi kanan|
|360×800 CSSfont150%|6|PASS geometri, keterbacaan terbatas|Banyak ukuran px tetap; bukan emulasi font Android yang valid|
|393×873 CSSfont200%|6|PASS geometri, keterbacaan terbatas|Native text scaling/zoom OS NOT TESTED|

Screenshot sebelum/sesudah modal tersedia pada mobile-*.png dan JSON rect [mobile-audit.json](evidence/mobile-audit.json). Rotasi satu sesi online aktif, virtual keyboard Android/iOS, browser back saat semua jenis popup, resume dari OS kill: NOT TESTED atau hanya coverage suite lokal, tidak dipasarkan PASS perangkat nyata.

## Popup hasil barter4.11.6

| Check | Status | Bukti |
|---|---|---|
| Giver/receiver benar | PASS contoh teruji | Live host memberi₦10, guest menerima₦10; fixture menerima Balikpapan+₦200, memberi Banyuwangi |
| Aset/kas tidak tertukar | PASS contoh teruji | Asset-trade/trade-footer/live snapshot |
| Transfer tepat sekali | PASS | Klik stale ditolak; Tutup tidak menambah versi; race/receipt juga diuji |
| Refresh unread receipt | PASS | Receipt tersimpan muncul setelah resume, isi tetap; footer stale hilang |
| Dismiss lalu reload tidak muncul lagi | PASS | resultNotRepeated:true |
| Duplicate/reordered ingest | PASS suite lokal | test:trade:results &6 browser scenarios; belum injeksi WebSocket live |
| Footer konsisten/satu tombol Tutup | FAIL | Tombol Terima/Tolak/Tawar balik/Ajukan tawaran tersisa dari popup sebelumnya |
| Modal tidak hilang selama dibaca | PASS sesi diuji | Unread ditahan, bot menunggu acknowledgement |
| Expired log300event / lintas perangkat | Batas yang diketahui | Receipt per perangkat/kursi; belum diterima sebelum window lewat tidak direkonstruksi. Bukan bug baru |

`refreshSameText:false` pada asset-trade.json disebabkan footer stale hilang, bukan rincian uang berubah. Catatan ini mencegah pembacaan hasil test yang keliru.

## Perspektif pemain baru

- Satu menit pertama: tombol Mulai VS Bot jelas dan nama wajib dipandu profil. Istilah ₦=Nusa ditampilkan. Avatar/role bot membantu pemilihan; cara tahan–lepas dadu ada pada aria-description dan label saat siap.
- Aturan sewa digital otomatis masuk akal untuk pemain baru. Perubahan saldo punya finance history dan Bank; informasi dapat dicari tetapi detail membutuhkan beberapa tap. Bantu pemain melihat sumber pembayaran langsung dari riwayat paling baru.
- Barter memberi dua sisi serta estimasi, namun kontrol receipt stale membuat keputusan yang sudah final tampak masih dapat diubah. Ini kebingungan paling konkret yang diamati.
- Lelang memiliki input minimal, step dan saldo jelas; hasil pasif berupa notice merupakan pilihan desain aktif. Suite lama yang menunggu modal tidak membuktikan lelang rusak.
- Waktu tunggu bot dipengaruhi animasi, pembacaan kartu dan planner. NUSA mempunyai budget jauh lebih besar daripada benchmark kecil. Tidak ada survey pengguna nyata, sehingga rasa bosan adalah risiko UX, bukan temuan terukur semua pemain.

## Keterbacaan dan aksesibilitas

Board overview memuat40petak sehingga label sangat kecil pada360px. Kamera follow/zoom tersedia; edukasi singkat tentang kamera berpotensi berdampak besar. Nominal Nusa di console/profil cukup terbaca pada screenshot; nama panjang dipotong pada kartu lobby. Menu/kamera40×40 dan beberapa tombol pendek kurang dari44px; itu rekomendasi target sentuh, bukan otomatis pelanggaran WCAG (batas lain berbeda). Informasi owner memakai warna dan ada detail tekstual; simulasi color blindness/contrast seluruh komponen belum dijalankan. Jangan memberi PASS aksesibilitas penuh.

CSS font150–200% tidak mengubah banyak teks berukuran px. Ini alasan melakukan pengujian font scaling native, bukan bukti pasti bahwa pengaturan Android gagal. Keyboard desktop/headless tidak membuktikan keyboard virtual tidak menutup tombol.

## Tiga perubahan dampak tertinggi

1. **BUG:** perbaiki lifecycle footer shared modal agar receipt barter benar-benar final dan aman dipahami.
2. **UX:** status ketersediaan bot online yang jelas sebelum pemilihan, disertai pemulihan worker operasional; hindari pemain menyiapkan room untuk bot yang tidak tersedia.
3. **BUG/UX:** pastikan overview dan aksi muat pada portrait pendek; tambahkan petunjuk kamera singkat untuk keterbacaan40petak tanpa mengganti board/pion.

Kemenangan diverifikasi dengan popup final pada lima fixture dan hasil natural bila tersedia. Rasa puas pemain belum diukur lewat user study; rekomendasi enhancement adalah ringkasan kemenangan yang menjelaskan aset/transaksi penentu, bukan memperbaiki aturan menang yang sudah benar.
''')
perf=j('performance.json');api_times=sorted(r['timing']['responseEnd'] for r in online['requests'] if r['timing']['responseEnd']>=0)
write('PERFORMANCE_REPORT.md',f'''# Performance dan reliability

{env}

## Angka terukur

| Pengukuran | Hasil | Metode / batas |
|---|---|---|
| Lobby production fresh context |{perf[0]['lobbyReadyMs']/1000:.3f}s|Playwright goto→lobby, satu sampel, jaringan cloud|
| FCP fresh context |1.792s|PerformancePaintTiming|
| Slow network100KiB/s, latency150ms |{perf[1]['lobbyReadyMs']/1000:.3f}s lobby; FCP4.516s|CDP emulasi, satu sampel, bukan ponsel fisik|
| Setup click→modal visible |{perf[0]['setupClickToVisibleMs']:.1f}ms cold; {perf[1]['setupClickToVisibleMs']:.1f}ms slow|Termasuk overhead Playwright/scroll/render, bukan EventTiming murni|
| Resource fresh profile |111 entries,671.654byte transfer,1.220.048byte decoded|Snapshot1s sesudah lobby; SW/background belum tentu seluruhnya selesai|
| Dist lokal |sekitar3,1MiB|Seluruh output statis, bukan bundle JS tunggal|
| JS heap fresh lobby |2.663.992byte used;5.287.936byte total|CDP Runtime.getHeapUsage, satu snapshot|
| DOM fresh lobby |491node,57JS event listener,3documents|CDP Memory.getDOMCounters; includes browser documents|
| API live |n={len(api_times)}, median{statistics.median(api_times):.1f}ms, p95{api_times[int(len(api_times)*.95)]:.1f}ms, max{max(api_times):.1f}ms|request.timing.responseEnd dari request start, termasuk HTTP Auth/reads/aksi; bukan khusus latency multiplayer|
| Backend diagnostik worker |551,0ms salah satu request|Auth65,2ms; quota210,4ms; capabilities275,1ms; satu request bukan statistik|
| Headless100match |61.365aksi,691,76s total compute|Budget kecil4ms, CPU berbagi browser/tests|

Screenshot dan data mentah: [performance.json](evidence/performance.json), [multiplayer-advanced.json](evidence/multiplayer-advanced.json), [production-browser-inspect.json](evidence/production-browser-inspect.json).

`performance.memory` pada tahap gameplay awal membulatkan heap menjadi10.000.000byte; itu tidak digunakan untuk menyimpulkan penggunaan memori tetap atau bebas leak. Angka CDP di atas lebih tepat tetapi hanya untuk lobby. DOM match awal bertambah seiring owned assets/UI/log (contoh6peserta445→482nodes sebelum78aksi); pertumbuhan kecil ini tidak membuktikan leak. Source log dibatasi300event, bank40recent, seen sekitar200ID; IndexedDB/save dan receipt queue punya kebijakan berbeda.

## Respons, offline dan sesi panjang

- PASS production offline lobby setelah service worker siap dan profil QA dikontrol; bukti performance-offline.png. API online tetap gagal saat offline dan tidak dicache. Suite PWA juga PASS.
- PASS reconnect singkat dua sesi, pemulihan authoritative state sesudah refresh. Reconnect90s/host transfer dan jaringan putus di tengah animasi belum diuji live.
- Animasi fast/reduced dipilih melalui UI untuk pertandingan panjang; uji ini tidak membuktikan60FPS mode animasi penuh.
- Run browser berlanjut ratusan aksi, dengan outcome dan cap ditulis terpisah pada gameplay report. Tidak ada sample CPU/frame/listener kontinu pada semua run; jangan menyatakan “tidak melambat setelah ratusan aksi” hanya dari terminal match.
- Tidak ada stress test production, FPS/raf benchmark, profiling rerender komponen atau sesi24jam. P95 bot headless ada per match; latensi pikir bot browser NUSA/full search tidak diinstrumentasi terpisah dari animasi.

## Rekomendasi PERFORMANCE

1. Tambahkan instrumentation development untuk waktu planner, queue presentasi, HTTP dan waktu kontrol kembali aktif, agar pengguna tahu apakah sedang berpikir/animasi/jaringan.
2. Jalankan soak satu tab1.000+aksi dengan CDP heap/DOM/listener/timer pada checkpoint dan forced GC hanya di lab; bandingkan setelah modal ditutup.
3. Ukur Core Web Vitals dan60FPS/long tasks pada Android kelas menengah serta Safari. Sampel cloud tunggal tidak cukup untuk target SLA.
4. Review waterfall111request dan precache saat startup; optimasi hanya setelah pengukuran perangkat. Tidak ada perubahan bundling yang dilakukan di audit.

Skor75/100 dari rubrik master: load4, jaringan lambat3, offline4, long-session telemetry2, heap/listener confidence2 (maks4 tiap kriteria). Ini mencerminkan performa dan kelengkapan bukti, bukan klaim leak ditemukan.
''')
scan=j('source-secret-scan.json') or {'scanned':0,'findings':[]}
write('SECURITY_DATA_INTEGRITY.md',f'''# Keamanan dan integritas data non-destruktif

{env}

**Security confidence: sedang; rubrik80/100, bukan sertifikasi keamanan.** Tidak ada exploit, transaksi finansial ganda, kebocoran secret atau bypass giliran yang confirmed dalam batas pengujian ini.

## Yang dijalankan

| Area | Status | Bukti |
|---|---|---|
| /api/online tanpa bearer |PASS penolakan|401, tidak menghasilkan aksi|
| /api/worker request tanpa protokol |PASS penolakan|409 sebelum token action; bukan bukti seluruh auth worker live|
| Private server module static |PASS untuk dua path|/lib/server/runtime.mjs dan /server-dist/...404|
| Fake actor/dice/saldo |PASS validator lokal|Whitelist field menolak input tak diizinkan; service suite|
| Salah giliran live |PASS|400, state tidak berubah|
| Replay request/same ID |PASS live terbatas|State4→5 sekali; isi berbeda ID sama409|
| Stale revision/game version |PASS|Live previous-version409; mock CAS tests|
| Negatif/NaN/Infinity/unsafe integer |PASS lokal|38adversarial cases total,0fail; tidak dikirim agresif production|
| Gadai/bangun ilegal/uneven |PASS penolakan lokal|38cases termasuk unowned/incomplete/mortgaged/uneven|
| Uang/kartu/stok/owner |PASS benchmark|61.365transisi; ledger delta persis, stock/card invariant|
| Cross-room/membership |PASS suite lokal|Tidak mengakses room pemain lain live; live cross-room NOT TESTED|
| XSS nama |Source guard + unit|requirePlayerName menolak<>/control; esc digunakan renderer. Payload eksekusi live tidak dicoba|
| Scan source secret heuristik |{ 'PASS terbatas' if not scan['findings'] else 'REVIEW' }|{scan['scanned']}file teks; {len(scan['findings'])}candidate pola privat, nilai tidak dicetak|
| RLS/SQL live dan service role |BLOCKED|Tidak ada kredensial adminDB; hanya source migration ditinjau|

## Temuan arsitektur yang mendukung integritas

1. Auth diverifikasi pada backend melalui Supabase; body userId/playerId tidak menjadi identitas.
2. `validateOnlineAction` membatasi action/field dan validasi integer aman; trade context dari browser ditolak. Owner/turn/phase diputuskan reducer.
3. Online commit memakai expected revision/CAS dan receipt request hash. RNG server authority tidak berasal dari dadu kiriman klien.
4. Worker protocol memeriksa manifest, token, lease, match/version/actor dan legal candidate. Compute/provider tidak memegang transaksiDB selama menunggu.
5. Static graph tidak mengekspos server-dist; tidak ada dependency runtime produksi. Dua pemeriksaan404 bukan scan seluruh URL.
6. SQL source mengaktifkan RLS untuk room/members/commands/updates/rate limits; revoke dari anon/authenticated dan grant RPC commit/quota ke service_role. `security definer` menyetel search_path kosong. Penerapan live persis belum diverifikasi dengan katalogDB.
7. Auth/room responses memakai no-store dan service worker mengecualikan API. Config public berisi publishable/anon key yang memang boleh terlihat, bukan service-role secret.

## Risiko/batas tanpa klaim bug

- Bearer/refresh token tersimpan localStorage per perangkat: jika origin terkena XSS, token dapat dibaca. Ini model ancaman yang perlu mitigasi, bukan bukti XSS ditemukan. CSP belum diaudit penuh; tidak mengusulkan approval/deployment selama audit.
- Request auth guest publik memang diperlukan; rate limiting provider dan relay terhadap abuse lintasinstance belum diuji agresif.
- Tidak melakukan penetration test, bruteforce room, fuzz jaringan massal, injeksi destructive SQL, pencarian data pengguna lain, maupun uji biaya Groq massal.
- Tidak ada secret diprint/dibagikan. Trace berasal dari gameplay lokal/production tanpa login; pengujian Auth live menyimpan status/timing dan snapshot publik terpilih, bukan bearer/refresh token.
- Tiga risiko lintas sesi: refresh token rotating di browser tanpa Web Locks, event out-of-order saat reconnect panjang, dan receipt tertinggal melewati300log. Unit coverage ada; proof live lengkap tidak ada.

Bukti: [security-local.json](evidence/security-local.json), [source scan](evidence/source-secret-scan.json), [integrity](evidence/integrity.json), [online live](evidence/multiplayer-advanced.json), suite-03/extra-suite-00/suite-15.
''')
write('IMPROVEMENT_ROADMAP.md','''# Roadmap update berikutnya

Audit tidak mengimplementasikan perbaikan berikut. Tidak mengubah model/engine/aturan/board, pairing, database atau deployment. Pengerjaan fix menunggu instruksi pengguna.

## HOTFIX

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|1|BUG / operasional|Pulihkan heartbeat dan kapasitas Termux QA-003|WorkerAlive=true,slot>0,dua manusia+bot bermain live; job/retry hanya commit sekali|
|2|BUG|Bersihkan footer shared modal QA-001|Receipt accepted/rejected/cancelled tidak memuat command lama, refresh/dismiss tidak mentransfer ulang|
|3|BUG|Tangani portrait pendek QA-002|Board/info/aksi tidak saling menutup pada360×480 enam peserta; modal dan keyboard bisa dijangkau|

## STABILITY

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|4|TECH DEBT|Perbaiki entrypoint test:online QA-004|Command resmi exit0 dari cleanclone Node24 tanpa alias global|
|5|TECH DEBT|Perbarui suite kontrak UI QA-005 dan telusuri test:bank suspected|Semua suite menyelesaikan cakupan yang tercatat; tidak hanya menghapus assertion|
|6|TECH DEBT|Sinkronkan rulepack/dokumen QA-006 dan catatan status historis|Nominal₦/unit jelas; status live tidak disamakan arsipREADME|
|7|PERFORMANCE|Soak1.000+aksi, snapshot cap, metrics bot/queue/DOM/heap/listener|Tak ada unbounded growth yang terukur; semua cap punya state/seed/action history|
|8|BUG verification|Complete live online auction, trade mortgaged/card/counter, pause/vote,host loss,90s reconnect sampai menang|Dua akun/perangkat,authoritative snapshot tetap sama; state tidak diaplikasi ulang|

## UX POLISH

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|9|UX|Jelaskan status worker/bot sebelum pengguna menyiapkan room|Offline slot0 terlihat lebih awal; retry/pemulihan tidak membingungkan|
|10|UX|Petunjuk1menit tentang nama,₦,kamera,dadu,riwayat,barter|Pemain baru memahami aksi legal dan alasan saldo tanpa penjelasan tester|
|11|UX|Review ukuran sentuh,teks overview,kontras dan font scaling native|Diuji Android/iOS nyata,termasuk keyboard dan color-vision limitations|
|12|UX|Audit receipt/hasil lelang/utang dan back navigation lintas popup|Sudut pandang konsisten; konten scroll; konfirmasi selalu terjangkau|

## FUTURE ENHANCEMENTS

| Prioritas | Kategori | Usulan | Alasan |
|---|---|---|---|
|13|ENHANCEMENT|Ringkasan akhir dengan transaksi/aset penentu|Kemenangan lebih mudah dipahami; aturan menang tetap survivor terakhir|
|14|ENHANCEMENT|Panduan ringan trade/lelang dan tautan alasan pembayaran|Mengurangi kebingungan tanpa merombak papan|
|15|BALANCING|Eksperimen roster/seat/seed seimbang pada budget production|100match budget4ms bukan bukti kekuatan relatif persona; jangan ubah model dari angka audit ini|
|16|TECH DEBT|Dashboard kesehatan worker dan alert heartbeat/operator|Mengurangi ketergantungan pada pemeriksaan manual tanpa mengekspos credential|

## Sepuluh rekomendasi utama

1. Pulihkan dan monitor worker Termux sebelum mempromosikan online bots.
2. Perbaiki footer receipt dan tambahkan browser regression accept/reject/cancel/counter.
3. Pastikan papan/aksi pada portrait pendek tetap terlihat.
4. Benahi command online test yang kehilangan loader.
5. Sinkronkan suite browser dengan fitur aktif dan tambahkan assertion yang menemukan QA-001.
6. Jalankan satu match online dua manusia+bot hingga pemenang,termasuk gangguan koneksi dan lease.
7. Lengkapi race lelang/barter/property-transfer dan pause/host-loss live pada room QA sendiri.
8. Jalankan soak dan metrik perangkat nyata; simpan snapshot setiap cap.
9. Perjelas pemilihan bot,₦,kamera dan alasan perubahan saldo dalam onboarding ringkas.
10. Perbarui rulepack nominal dan matriks source/frontend/backend/worker release.

Top3 dampak pengalaman: receipt bebas kontrol lama, bot online tersedia/terjelaskan, portrait pendek+keterbacaan kamera. Rekomendasi UX/ENHANCEMENT/BALANCING tidak dihitung sebagai bug confirmed.
''')
cmd_table='\n'.join(f"| `{r['command']}` | {'PASS' if r['exitCode']==0 else 'FAIL'} | {r['exitCode']} | {r['durationSeconds']:.3f}s | [{pathlib.Path(r['log']).name}](evidence/{pathlib.Path(r['log']).name}) |" for r in commands+extra)
write('AUTOMATED_TEST_RESULTS.md',f'''# Automated tests dan catatan command

{env}

Dependency development dipasang `npm ci --ignore-scripts`; tidak ada dependency runtime tambahan ke package.json/lockfile. Playwright dipasang di `/tmp/nusa-qa-browser` di luar repo, Chromium di cache user. Server lokal memakai npm start port8787. Browser suite menerima `MN_BROWSER_MODULE=/tmp/nusa-qa-browser/node_modules/playwright`, output diarahkan ke docs/qa/evidence. Perlu jaringan proxy untuk Node fetch: gunakan `--use-env-proxy` sebagaimana diagnose:deployment. Satu percobaan verify-integrity tanpa opsi proxy mendapat ECONNREFUSED, lalu rerun opsi proxy berhasil; itu bukan kegagalan production.

| Command | Hasil | Exit | Durasi | Log lengkap |
|---|---|---|---|---|
{cmd_table}

`npm test`: **710/710 PASS,0skip**. Node test in-process dengan doubles tidak menguji browser/Supabase live. Exact command `npm run test:online` FAIL karena alias loader; rerun baris file sama dengan loader PASS. Kedua fakta tetap dicatat.

Suite browser `test:trade:results:browser`6scenario PASS, `test:hold:batch:browser`PASS, `test:online:rooms`14scenario PASS, PWA PASS. Suite browser/portrait/auction/stability/bank FAIL tidak ditutupi oleh PASS unit; cakupan parsialnya dijelaskan pada bug report. Dice100.000roll baseline sum6–8=44,576% (ekspektasi44,444%); tidak ada bukti bias dari sampel itu. Ini audit statistik terbatas, bukan pembuktian semua sumber entropy.

## Script tambahan QA

Semua berada di docs/qa/scripts, tidak mengubah production source:

- benchmark.mjs:100match seeded, invariant per transisi, bounded planning, summaryJSON.
- gameplay-browser.mjs:5start UI nyata; retry memilih persona yang belum digunakan.
- continue-browser.mjs:resume autosave asli dan aksi UI; state/status tersimpan, cap eksplisit.
- endgame-browser.mjs:5fixture legal dengan bank history parsial agar ledger pembukaan jujur;3manusia menang/2kalah.
- asset-trade-browser.mjs:hotel/gadai/tebus/hadiah, double-click build, receipt refresh/dismiss.
- repro-trade-footer.mjs:accept/reject menampilkan footer stale; penolakan command stale dan pemulihan.
- multiplayer-browser.mjs:dua sesi tamu dan UI live; multiplayer-advanced.mjs:aksi legal API sendiri/race dan penerimaan barter UI.
- mobile-audit.mjs:7viewport/font configurations dan4modal per context.
- performance-browser.mjs:CDP/network/PWA offline produksi pada profil QA.
- security-local.mjs:38kasus penolakan/integritas lokal.
- verify-integrity.mjs dan compare-production.mjs:hash51file plus tujuh file production; GET aman dan penolakan unauth.
- scan-public.mjs:755file teks,0candidate private secret; tanpa membaca .env/credential.

Jalankan script dari root repo dengan Node24. Untuk semua script network Node gunakan --use-env-proxy. Script browser mengakses origin yang tertulis; yang bertanda production membuat identitas/room QA sendiri. Jangan mengulang live automation massal tanpa batas. Tidak ada npm install yang memodifikasi manifest proyek.

## Regression plan setiap bug

| Bug | Regression wajib | Lapisan |
|---|---|---|
|QA-001|Accepted/rejected/cancelled/counter:footer hanya dismissal; rAF gap no-popup; refresh/reconnect; dismiss tanpa versi/uang berubah|Browser nyata+unit dialog cache|
|QA-002|Rect board tidak berpotongan console/info di short portrait6p; modal/keyboard/rotate|Chromium+Android/iOS|
|QA-003|Healthy/offline/recovery worker,2humans+bot hingga menang; stale compute ditolak|Live staging/roomQA|
|QA-004|Exact npm command dari cleanclone Node24|CI|
|QA-005|Suite selesai semua skenario dan assertion mengikuti kontrak aktif; jangan menurunkan coverage|CI browser|
|QA-006|Nominal dokumen/rulepackUI sesuai konstanta dan fixedpoint|Review+contract ringan|

Invariant/script QA baru tidak mengubah expected aturan untuk membuat test lolos. Model file dan manifest diaudit lagi sesudah eksekusi. Generated laporan bawaan yang menimpa arsip docs disalin ke evidence/upstream-generated lalu arsip repo dipulihkan, sehingga perubahan akhir hanya docs/qa.
''')
# Aggregate terminal browser results from final attempts, prefer last valid record per match.
by_match={}
for r in continuations:
 if r['status']!='harness_error':by_match[r['match']]=r
for fn in ['browser-continuation-1-retry.json']:
 for r in j(fn) or []:
  if r['status']!='harness_error':by_match[r['match']]=r
terminal=sum(r['status']=='normal_winner' for r in by_match.values())
write('QA_MASTER_REPORT.md',f'''# Monopoli Nusantara — QA Master Report

**Keputusan: belum direkomendasikan sebagai rilis publik yang menjanjikan bot online andal.** Mode lokal dan online dua manusia berhasil dijalankan; worker Termux production offline saat audit, popup hasil barter punya footer transaksi stale, dan layar sangat pendek mengalami overlap papan. Perbaiki HOTFIX, jalankan verifikasi worker live dan suite browser yang tertinggal sebelum promosi rilis berikutnya.

{env}

Repo: https://github.com/arisynn/monopoli-nusantara.git  
Production: https://monopoli-nusantara-eight.vercel.app/  
Branch audit: `qa/full-audit-2026-10-19`. Tidak ada push/merge/deploy. Tidak ada source game, engine, aturan, model, board, database, save pengguna, pairing atau konfigurasi production diubah. Hanya test/laporan/artefak QA baru dipertahankan.

## Skor dan metode

Skor adalah penilaian QA berbasis bukti, bukan probabilitas bebas bug. Masing-masing dimensi memakai5kriteria0–4; skor=sum/20×100. Nilai4 berarti bukti kuat pada scope diuji,3 coverage kuat dengan batas,2 campuran/parsial,1 risiko besar atau bukti tipis,0 gagal/blocked. Bukti yang tidak dijalankan tidak mendapat label PASS.

| Dimensi | Kriteria dan nilai0–4 | Skor | Bobot |
|---|---|---|---|
|Gameplay stability|Start/turn4,ekonomi4,receipt2,ending4,long-session coverage2|**80/100**|25%|
|Multiplayer reliability|Entry/start4,sync4,authority/CAS4,worker0,recovery/vote2|**70/100**|20%|
|Bot stability lokal|Legal4,invariant4,progress4,normal outcome3,persona/roster4|**95/100**|20%|
|Mobile UI/UX|Portrait4,modal scroll4,keterbacaan3,receipt2,short portrait1|**70/100**|15%|
|Performance|Load4,slow network3,offline4,long telemetry2,heap/listener2|**75/100**|10%|
|Security evidence|Auth4,CAS4,input4,secret/static3,infrastructure proof1|**80/100; confidence sedang**|10%|

**Overall Quality Score:79/100**, hasil20+14+19+10,5+7,5+8. Bot95 hanya stabilitas/legalitas lokal; availability online masuk skor multiplayer. Skor gameplay tidak dinaikkan hanya karena710unit test lolos. Performance dan security menyertakan keterbatasan bukti, bukan hanya hasil positif.

## Ringkasan eksekusi

- **Real browser:**5pertandingan dimulai melalui UI (2–6peserta), satu awalnya di production. Tahap awal398aksi engine, trace dan screenshot tersimpan. Kelanjutan autosave asli berjalan lokal melalui UI; **{terminal} match mencapai pemenang normal** pada data final saat laporan dibuat. Hasil cap/error harness dilaporkan terpisah, bukan kemenangan.
- **Fixture browser:**5ending legal tambahan,3kemenangan manusia dan2kekalahan manusia/bot menang, popup pemenang muncul. Fixture tidak diklaim lima game penuh dari saldo awal.
- **Engine/bot:**100match seeded,61.365aksi;99pemenang normal,1time limit,0error/aksi ilegal/pelanggaran invariant. Tidak ada kemenangan fiktif berdasar wealth/action cap.
- **Online production:**dua identitas guest/context independen,room sendiri,ready/start/roll/beli/trade/refresh/reconnect. Wrong-turn ditolak400,requestId payload berubah409,stale version409. Dua roll request identik menaikkan versi4→5sekali. Snapshot state dua pengguna sama setelah barter.
- **Worker online:**onlineBots=true tetapi workerAlive=false,slot0. Penambahan bot ditolak; gameplay bot online **BLOCKED**.
- **Suite:**npm test710/710,typecheck/check:source/Termux/hold/trade/PWA/dice lolos. Exact test:online dan lima suite browser lama gagal; penyebab/batas dilaporkan, bukan ditimpa PASS unit.
- **Versi:**build392170ce55b1d147 cocok,tujuh file publik sama SHA-256.51hash model/engine dan file manifest tetap cocok. Versi proses Termux tidak dapat diverifikasi saat offline.

## Bug confirmed

| Severity | Jumlah | Temuan |
|---|---|---|
|P0|0|Tidak ditemukan dalam scope|
|P1|1|QA-003 worker bot online tidak tersedia; insiden operasional|
|P2|4|QA-001 footer receipt,QA-002short portrait,QA-004online test entrypoint,QA-005browser test drift|
|P3|1|QA-006nominal lelang dokumen stale|

Total6confirmed mencakup3runtime/operasional dan3tooling/dokumentasi. Satu observasi bank details restoration **Suspected**, tidak masuk hitungan. Tidak ada bug finansial/security critical confirmed. [Format bug lengkap dan bukti](BUG_REPORT.md).

## Status scope

| Area | Status | Arti praktis |
|---|---|---|
|Frontend production vs HEAD|PASS|Tujuh file+fingerprint cocok; tidak membuktikan seluruh backend byte-identik|
|Versi worker Termux running|BLOCKED|Tidak ada worker aktif untuk diperiksa|
|Gameplay start/turn/buy dan ekonomi legal|PASS scope diuji|Browser+61.365transisi invariant|
|Receipt barter tampilan|FAIL|Kontrol stale memberi error dan kebingungan; transaksi tidak ganda|
|Ending manusia/bot|PASS fixture|Natural continuation status pada gameplay report|
|Semua2–6roster dimulai lewat UI|PASS|Pemilihan benar-benar diklik|
|Online dua manusia jalur dasar|PASS terbatas|Bukan satu pertandingan live hingga pemenang|
|Online bot dan barter bot live|BLOCKED|Worker offline|
|Online auction/voting/host-loss/long disconnect/winner|NOT TESTED live|Lokal/service coverage ada|
|Mobile360×800,393×873,412×915|PASS geometri teruji|Empat modal dan board; bukan sertifikasi semua interaksi|
|Portrait360×480 enam pemain|FAIL|Board tertutup console/info|
|Android/iOS native font/keyboard/color blindness|NOT TESTED|Headless emulasi bukan perangkat fisik|
|PWA offline fresh production profile|PASS|Service worker controlled,lobby reload offline|
|Upgrade dari PWA production lama|NOT TESTED|Tidak ada profil lama; source cache policy ditinjau|
|Input/authority/security scoped checks|PASS terbatas|38local adversarial+penolakan live; RLS adminlive BLOCKED|
|Leak timer/memori24jam/FPS fisik|NOT TESTED|SnapshotCDP bukan soak proof|
|Suite browser lama keseluruhan|FAIL|Assertion tertinggal membuat cakupan berhenti awal|

## Sepuluh masalah paling penting

1. **BUG P1:**bot online tidak tersedia karena Termux offline; bukan masalah model yang boleh “diperbaiki” tanpa diagnosis operator.
2. **BUG P2:**popup hasil barter membawa tombol transaksi lama; pemain melihat Terima/Tolak setelah transaksi final.
3. **BUG P2:**papan6peserta pada360×480 tertutup kontrol.
4. **TECH DEBT P2:**command resmi test:online gagal resolusi alias meskipun suite utama hijau.
5. **TECH DEBT P2:**suite browser tertinggal kontrak Bank/notice/profil; coverage berhenti sebelum semua skenario.
6. **TECH DEBT P3:**dokumen rulepack nominal lelang berbeda dari implementasi aktif.
7. **UX:**teks overview40petak kecil dan discoverability kamera perlu uji pengguna; ini rekomendasi, bukan bug aturan.
8. **Risiko belum terverifikasi:**belum ada satu match online hingga pemenang dengan bot live,auction/voting/host-loss/long reconnect.
9. **PERFORMANCE coverage:**belum ada profil leak/60FPS pada perangkat nyata setelah sesi sangat panjang; jangan menafsir snapshot heap sebagai bebas leak.
10. **Security confidence boundary:**RLS/katalogSQL live dan seluruh jalur cross-room/abuse tidak diuji dengan akses admin; hasil non-destruktif terbatas tidak menjadi sertifikasi.

## Sepuluh rekomendasi terbaik

1. Pulihkan heartbeat/slot Termux dan lakukan smoke live dua manusia+bot hingga winner.
2. Benahi lifecycle shared footer dan regression receipt accept/reject/cancel/counter.
3. Pastikan board/info/aksi tidak overlap pada short portrait.
4. Selaraskan loader command test:online.
5. Perbarui assertion browser berdasarkan perilaku aktif,tambahkan coverage bug footer yang lolos suite lama.
6. Uji auction/barter transfer/CAS/voting/reconnect/host-loss live pada room QA terisolasi.
7. Soak1.000+aksi dengan heap/DOM/listener/timer dan snapshot semua action/time cap.
8. Validasi Android/iOS portrait,keyboard,text scaling dan aksesibilitas warna.
9. Berikan petunjuk singkat nama,₦,kamera,dadu dan alasan pembayaran/status bot.
10. Sinkronkan rulepack dan matriks release frontend/backend/Termux dengan fingerprint yang dapat diperiksa operator.

## Kesiapan publik dan prioritas update

**Belum siap untuk klaim “full online bot gameplay stabil”.** Dapat digunakan terbatas untuk VS Bot dan dua manusia pada jalur yang diuji,dengan bug UI yang sudah teridentifikasi. Release gate berikutnya:QA-003pulih dan satu matchbotlive selesai,QA-001/002diperbaiki,command/suite browser relevan menyelesaikan seluruh cakupan,tidak ada regresi uang/stock/owner/receipt.

**HOTFIX → STABILITY → UX POLISH → FUTURE ENHANCEMENTS**:

- HOTFIX:worker availability,footer barter,short portrait.
- STABILITY:QA command/contract,live realtime recovery/race hingga winner,soak dan cap snapshots.
- UX POLISH:status worker,onboarding kamera/uang/aksi,sentuh/font/keyboard nyata.
- FUTURE ENHANCEMENTS:ringkasan kemenangan,panduan barter/lelang,benchmark balancing seat/roster penuh sebelum mengusulkan perubahan model.

## Laporan dan bukti

- [Bug report](BUG_REPORT.md)
- [Gameplay dan aturan](GAMEPLAY_TEST_RESULTS.md)
- [Multiplayer](MULTIPLAYER_TEST_RESULTS.md)
- [Bot](BOT_STABILITY_REPORT.md)
- [UI/UX](UI_UX_REVIEW.md)
- [Roadmap](IMPROVEMENT_ROADMAP.md)
- [Peta dependency/deployment](FEATURE_DEPENDENCY_MAP.md)
- [Performance](PERFORMANCE_REPORT.md)
- [Security](SECURITY_DATA_INTEGRITY.md)
- [Commands/regression](AUTOMATED_TEST_RESULTS.md)

Seluruh artefak berada di evidence/,script reproduksi di scripts/. Screenshot/trace browser dibedakan dari hasil headless. Semua skor dibatasi lingkungan Chromium cloud,tanpa perangkat Android/iOS fisik,tanpaadminDB/Termux. Audit berhenti pada dokumentasi dan rekomendasi; **perbaikan game menunggu instruksi**.
''')
print('Generated reports:',len(list(q.glob('*.md'))),'natural terminal matches:',terminal)
# Light prose formatting; do not rewrite code fences, hashes, paths or test identities.
import re
words=['pertandingan','match','aksi','peserta','pemain','file','kriteria','hash','unit','scenario','skenario','byte','node','roll','manusia','kemenangan','kekalahan','ending','fixture','survivor','rumah','hotel','event','log','recent','test','skip','candidate','transisi','adversarial','detik','kasus','pemenang','command','viewport','document','documents','JS','nominal','lama','matchbotlive']
for path in q.glob('*.md'):
 content=path.read_text();parts=re.split(r'(```[\s\S]*?```|`[^`\n]*`)',content)
 for k in range(0,len(parts),2):
  parts[k]=re.sub(r'(?<=\d)(?=(?:'+ '|'.join(words) +r')\b)', ' ',parts[k])
  parts[k]=re.sub(r'\b(Match|match|QA-|slot|Index|index)(?=\d)',r'\1 ',parts[k]) if False else parts[k]
  for a,z in [('Semua51','Semua 51'),('semua2–6','semua 2–6'),('hingga winner','hingga pemenang'),('2humans','2 manusia'),('14scenario','14 skenario'),('3manusia','3 manusia'),('2kekalahan','2 kekalahan'),('p95774','p95 774'),('CAPS','CAPS')]:parts[k]=parts[k].replace(a,z)
 path.write_text(''.join(parts))
