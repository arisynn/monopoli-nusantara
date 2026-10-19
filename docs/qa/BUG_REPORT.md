# Bug report

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**6 temuan Confirmed: P0=0, P1=1, P2=4, P3=1.** Tiga mengenai runtime/operasional (QA-001/002/003); tiga mengenai tooling/dokumentasi (QA-004/005/006). Tidak ada bug finansial atau kebocoran secret yang confirmed.

## QA-001 — Popup hasil barter membawa tombol transaksi dari dialog sebelumnya

- Severity: **P2**
- Status: **Confirmed**
- Kategori: BUG
- Lokasi/fitur: Shared dialog / hasil barter 4.11.6
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Mulai permainan lokal dengan tawaran bot kepada manusia.
2. Klik Tolak atau Terima pada Tawaran Barter.
3. Tunggu popup hasil.
4. Periksa footer; klik tombol Tolak yang masih tampil. Jalur lain: ajukan hadiah uang ke Raka lalu tunggu hasil berhasil.

**Expected:** Popup receipt hanya menyajikan hasil dan Tutup; kontrol penerimaan/penolakan/pengajuan sebelumnya hilang.

**Actual:** Hasil ditolak/diterima masih memuat Terima, Tawar balik, Tolak. Klik menghasilkan “Bukan keputusan bartermu.” Hasil hadiah dari manusia juga membawa “Ajukan tawaran”. Engine menolak klik stale; tidak ada transaksi ganda pada reproduksi. Tutup memulihkan kemajuan bot.

**Bukti:** [match-4-end.png](evidence/match-4-end.png), [trace alami](evidence/match-4-trace.zip), [reproduksi accept/reject](evidence/trade-footer-repro.json), [hasil berhasil](evidence/asset-trade-trade-result.png), [bukti live penerima](evidence/advanced-trade-result-guest.png)

**File/fungsi:** `frontend/app.mjs renderDialog() sekitar 1116–1234; frontend/popup-controls.mjs decisionFooter(); frontend/popups.mjs tradeIncoming/tradeResult`

**Root cause:** Verified: renderDialog() mereset footerHTML ke string kosong ketika tidak ada popup, tetapi tidak membersihkan DOM footer. Receipt memiliki footer kosong setelah decisionFooter() membuang tombol close. Karena cache footerHTML juga kosong dan density tetap compact, penggantian innerHTML dilewati sehingga tombol lama tetap terlihat.

**Rekomendasi fix:** Saat dialog tidak aktif, kosongkan DOM/cache secara konsisten; saat mengganti identitas popup pastikan footer dirender ulang termasuk string kosong. Batasi handler tombol transaksi ke popup/decision yang berlaku. Pertahankan reducer/model.

**Regression test:** Browser alami: bot→human accept/reject, human→bot accepted, cancel/counter. Untuk setiap hasil pastikan tidak ada [data-type] transaksi atau submitTrade, hanya dismissal yang benar; klik kontrol lama tidak tersedia; refresh/reconnect dan Tutup tidak mengubah versi/saldo.


## QA-002 — Papan enam peserta tertutup kontrol pada portrait 360×480

- Severity: **P2**
- Status: **Confirmed**
- Kategori: BUG
- Lokasi/fitur: Layout gameplay pada layar pendek
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Resume fixture lokal sah enam peserta di Chromium portrait 360×480.
2. Gunakan overview.
3. Ukur board dan action-console; lihat baris petak bawah.

**Expected:** Seluruh papan dan kontrol dapat dilihat atau dicapai lewat scroll yang jelas.

**Actual:** Board x0,y128,w360,h360: bottom488 > viewport480. Console dimulai y400 hingga480 sehingga sekitar88px bagian bawah papan berada di area kontrol/info. Tidak ada horizontal overflow, tetapi itu tidak membuktikan seluruh papan terlihat. Body overflow:hidden membatasi pemulihan lewat scroll.

**Bukti:** [screenshot](evidence/mobile-360x480-font1.png), [geometri semua viewport](evidence/mobile-audit.json)

**File/fungsi:** `frontend/styles.css: .gameplay, .board-stage, media portrait pendek, body overflow`

**Root cause:** Verified pada geometri DOM dan screenshot; penyebab CSS adalah kombinasi board persegi berukuran lebar, tinggi minimum baris gameplay dan body overflow:hidden. Breakpoint pendek tidak mencukupi enam pemain pada dimensi ini.

**Rekomendasi fix:** Sesuaikan batas tinggi papan/komposisi pada viewport pendek atau sediakan scroll vertikal yang menjaga kontrol dapat dijangkau. Jangan mengubah ilustrasi board/pion.

**Regression test:** Ukur rect board tidak beririsan dengan gameplay-info/action-console pada 360×480, 360×600, 360×640 dan enam pemain; ulangi dengan modal, rotasi dan keyboard nyata.


## QA-003 — Bot online tidak tersedia karena worker Termux offline

- Severity: **P1**
- Status: **Confirmed**
- Kategori: BUG — operasional
- Lokasi/fitur: Production tambah bot / dependency worker
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Login dua identitas tamu QA pada production.
2. Buat room QA sendiri kapasitas3, gabungkan guest.
3. Host pilih Tambah bot → Tambahkan bot.
4. Bandingkan diagnostik terautentikasi.

**Expected:** Bot online yang diaktifkan konfigurasi memiliki worker aktif sehingga dapat ditambahkan dan bermain.

**Actual:** onlineBots:true, workerProvider:termux, workerConfigured:true, workerAlive:false, availableSlots:0. Penambahan ditolak “Bot online belum siap. Hubungkan worker terlebih dahulu.” Dua manusia dapat tetap bermain. Guard penolakan bekerja dengan aman; match bot online tidak dijalankan.

**Bukti:** [diagnostik dan test live](evidence/multiplayer-advanced.json), [screenshot](evidence/advanced-add-bot.png), [attempt awal](evidence/multiplayer-advanced-attempt1.json)

**File/fungsi:** `app/api/online/route.ts preflight ADD_BOT; lib/server/worker-capabilities.mjs; Termux runtime eksternal`

**Root cause:** Verified bahwa worker tidak live pada waktu observasi. Penyebab perangkat mati/jaringan/PM2/pairing belum diketahui; tidak boleh disimpulkan model/worker beda versi.

**Rekomendasi fix:** Operator memulihkan worker yang sudah terpasang, memeriksa heartbeat/slot/lease dan monitoring. Validasi satu room QA bot setelah pulih. Tidak perlu mengubah model atau menjalankan deployment dari audit.

**Regression test:** Live dua manusia+bot: preflight, minimal beberapa giliran, disconnect worker, UI status offline, reconnect dan satu commit per job. Jangan menganggap local mocked worker sebagai pengganti uji ini.


## QA-004 — npm run test:online gagal karena alias loader tidak disertakan

- Severity: **P2**
- Status: **Confirmed**
- Kategori: TECH DEBT
- Lokasi/fitur: package.json scripts.test:online
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Node24 pada clone bersih; npm ci --ignore-scripts.
2. Jalankan npm run test:online.
3. Jalankan file yang sama dengan --import ./adapters/node/aliases.mjs sebagai pembanding.

**Expected:** Command test resmi menjalankan seluruh file tanpa masalah resolusi modul.

**Actual:** Exit1, 79/80 test entry pass, auth-proxy.test.mjs gagal ERR_MODULE_NOT_FOUND pada @/lib dari app/api/auth/route.ts. Command file sama dengan loader alias exit0. npm test sudah menyertakan loader dan lolos.

**Bukti:** [log asli](evidence/suite-03.log), [rerun dengan loader](evidence/extra-suite-00.log), [command/durasi](evidence/commands.json)

**File/fungsi:** `package.json scripts.test:online; app/api/auth/route.ts imports`

**Root cause:** Verified: script test:online tidak memiliki --import aliases.mjs sementara auth route masih memakai alias @/lib. Ini kerusakan entrypoint QA, bukan bukti auth production gagal.

**Rekomendasi fix:** Selaraskan command test dengan loader/entrypoint yang memang dipakai build tanpa mengubah perilaku game.

**Regression test:** CI menjalankan command npm persis dari package.json pada Node24 dan clone tanpa konfigurasi alias global.


## QA-005 — Beberapa suite browser memakai kontrak UI lama dan berhenti sebelum cakupan selesai

- Severity: **P2**
- Status: **Confirmed**
- Kategori: TECH DEBT
- Lokasi/fitur: test:browser / test:portrait / test:auction / test:stability
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Build source4.11.6 dan jalankan server lokal.
2. Jalankan keempat command browser dengan Playwright/Chromium valid.
3. Telusuri assertion pertama yang gagal terhadap DOM/source saat ini.

**Expected:** Suite menguji perilaku aktif dan menyelesaikan skenario yang diklaim.

**Actual:** test:browser mengharapkan nol button dalam board-stage padahal bank-indicator adalah button. test:portrait mengharapkan nol lucide-icon pada dialog preserved, tetapi shared dismiss memakai ikon. test:auction menunggu modal result-hero padahal passivePopup() menyalurkan event pasif ke notice. test:stability memulai game dari tab tanpa nama sehingga profil terbuka lebih dahulu, bukan pesan lease yang ditunggu. Suite tetap berstatus FAIL; skenario sesudah titik gagal tidak dinyatakan pass.

**Bukti:** [browser](evidence/suite-04.log), [portrait](evidence/suite-05.log), [auction](evidence/suite-06.log), [stability](evidence/suite-13.log), [auction trace state](evidence/auction-repro.json)

**File/fungsi:** `scripts/test-browser.mjs:18; test-portrait-browser.mjs:41; test-auction-browser.mjs:225; test-stability-browser.mjs:37; frontend/popup-controls.mjs`

**Root cause:** Verified pada assertion dan source: penambahan Bank, perubahan dismiss, passive notice, serta kewajiban nama belum diterapkan menyeluruh ke suite lama. Kegagalan bank tambahan “null !== empty string” pada restorasi details dicatat terpisah sebagai Suspected, sebab race timing belum disingkirkan.

**Rekomendasi fix:** Perbarui assertion dan fixture sesuai kontrak fitur yang disengaja; jangan menghapus check bermakna hanya agar hijau. Tambahkan check footer receipt yang benar-benar menemukan bug baru.

**Regression test:** Jalankan semua command browser dari clone bersih; pastikan jumlah skenario yang selesai dan test kondisi akhir, bukan hanya exit code.


## QA-006 — Dokumen RULEPACK masih menulis nominal lelang versi lama

- Severity: **P3**
- Status: **Confirmed**
- Kategori: TECH DEBT — dokumentasi
- Lokasi/fitur: docs/RULEPACK.md tabel dan prosedur
- Environment/commit: Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Langkah reproduksi**

1. Baca baris Lelang properti pada RULEPACK.
2. Bandingkan content.mjs AUCTION_RULES, konversi currency.mjs dan popup lelang4.11.6.

**Expected:** Rulepack aktif menyebut minimal dan kenaikan yang sesuai rilis aktif, dengan unit jelas.

**Actual:** Tabel menyebut mulai Rp100/kelipatanRp10/kenaikanRp10. Implementasi dan rilis terbaru menetapkan50 unit dasar=₦5, kenaikan50 unit=₦5. Dokumen historis belum konsisten. Perbedaan bukan bug pada lelang yang memang diperbarui sengaja.

**Bukti:** docs/RULEPACK.md; lib/content.mjs AUCTION_RULES; [test preflight](evidence/extra-suite-00.log); [popup](evidence/auction-repro-before.png)

**File/fungsi:** `docs/RULEPACK.md tabel Lelang properti dan bagian Prosedur digital`

**Root cause:** Verified: dokumentasi tidak diperbarui setelah perubahan lelang. Aturan aktual dinilai menggunakan content, aturan UI dan catatan rilis terbaru, bukan baris dokumen yang tertinggal.

**Rekomendasi fix:** Perbarui dokumentasi untuk nominal ₦ dan bedakan unit engine; cantumkan perubahan house rule sebagai disengaja. Tidak mengubah aturan/engine.

**Regression test:** Test contract ringan membandingkan nominal rulepack UI/dokumen dengan konstanta resmi; review manual dokumen rilis.


## Observasi yang tidak dihitung sebagai bug confirmed

| Observasi | Status | Alasan / test lanjutan |
|---|---|---|
| test:bank kehilangan `open` pada details setelah navigasi sertifikat | Suspected | Lima viewport lulus sebelumnya, lalu assertion null vs empty string; butuh reproduksi stabil per metode button/Escape/back. Log suite-14.log. |
| Game browser #4 berhenti 45s saat footer hasil barter dibaca automation | Confirmed sebagai gejala QA-001 | Engine phase=end, bukan loop bot. Automation memilih tombol stale yang salah, bukan Tutup; close pada repro memulihkan bot. Tidak dihitung sebagai P1 bot stuck. |
| Satu headless match time_limit | Bounded result | Batas20s lokal, bukan kemenangan atau bukti bot loop. Tidak ada state signature berulang12 kali. |
| Timer/heap leak dalam sesi berjam-jam | Blocked | Pengujian belum mencakup durasi tersebut. |
| Termux model/protocol mismatch | Blocked | Worker offline; manifest backend cocok. Tidak ada bukti mismatch perangkat. |
