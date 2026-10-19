# Laporan lengkap perbaikan QA dan modal otomatis

**Lima temuan QA sudah diperbaiki pada source lokal. Satu temuan operasional masih BLOCKED: worker Termux production offline.** Notifikasi mengambang telah diganti modal bersama tanpa tombol Tutup, lalu menutup otomatis. Perubahan belum dipush, dimerge, atau dideploy; situs production masih menjalankan build lama.

Branch: `fix/qa-stability-and-modals`. Basis commit: `6b237b4c7bc1cd133d74b7585ba011e1d8ba261c`. Node 24.19.0, Playwright 1.58.2, Chromium 145 Linux headless. Tanggal 19 Oktober 2026 UTC. Build lokal `dcd4074bfe6f9c21`, production `392170ce55b1d147`, keduanya masih memakai label basis 4.11.6; belum dibuat/publikasikan rilis baru.

## Permintaan yang diterapkan

| Jenis modal | Perilaku terbaru | Tombol |
|---|---|---|
|Gaji melewati Start/Mulai|Modal game bersama, nominal positif, menutup otomatis sekitar 2,8 detik|Tidak ada|
|Sewa diterima|Modal bersama, pemberi/properti jelas, burst sewa digabung, sekitar 2,8 detik|Tidak ada|
|Sewa/pajak dibayar|Modal bersama, nominal negatif, sekitar 2,6 detik|Tidak ada|
|Uang dari kartu|Modal bersama sesudah efek kartu dikomit, sekitar 2,8 detik|Tidak ada|
|Masuk/bebas penjara, hasil lelang, informasi kartu pemain lain|Modal bersama, waktu baca menurut panjang teks 2,3–6,5 detik|Tidak ada|
|Hasil barter diterima/ditolak/dibatalkan|Modal bersama, sudut pandang dan snapshot transaksi benar, waktu baca 4,5–12 detik|Tidak ada|
|Keputusan beli/lelang/barter/penjara/gadai/stok|Tetap menunggu keputusan legal pemain|Tombol aksi dipertahankan|
|Aset, aturan, pengaturan, informasi properti yang dibuka pemain, hasil akhir pertandingan|Tetap bisa dibaca/digunakan sampai pemain selesai|Kontrol navigasi/aksi tetap ada|

Timer berjalan setelah modal benar-benar ditampilkan, berhenti saat tab tersembunyi atau ditutup modal manual lain, dan melanjutkan sisa waktu saat terlihat kembali. Pembaruan state online tidak mengganti modal yang sedang dibaca. Timeout hanya mengakui informasi/receipt di sisi presentasi; tidak memanggil command game atau memproses uang lagi. Kartu yang membutuhkan penerapan efek tetap memakai alur ACK resmi; timer informasi tidak mengambil keputusan transaksi.

Contoh hasil: [gaji](evidence/modal-salary.png), [sewa masuk](evidence/modal-rent-income.png), [sewa keluar](evidence/modal-rent-payment.png), [pajak](evidence/modal-tax.png), [barter diterima](evidence/modal-trade-accepted.png), [barter ditolak](evidence/modal-trade-rejected.png), [barter dibatalkan](evidence/modal-trade-cancelled.png).

## Status setiap temuan audit

| ID / severity awal | Hasil | Perbaikan dan bukti |
|---|---|---|
|QA-001 P2, footer hasil barter stale|**FIXED LOCAL**|DOM footer dibersihkan saat modal tidak aktif. Modal informasi/receipt tidak membawa Terima/Tolak/Ajukan tawaran lama. Sebelas skenario khusus dan 6 skenario barter browser lulus. [Sebelum](../evidence/match-4-end.png), [sesudah](evidence/modal-trade-rejected.png).|
|QA-002 P2, papan portrait pendek tertutup kontrol|**FIXED LOCAL**|Slot papan mengambil ruang yang tersisa; ukuran persegi dibatasi lebar dan tinggi slot. Pada 360×480 enam pemain: board 198×198, y128–326, console 400–480; sebelumnya board 360×360, y128–488. Kontrol Bank dipusatkan di layar pendek dan menjadi ikon 44px pada ≤440px agar tidak menutup petak. [Sebelum](../evidence/mobile-360x480-font1.png), [sesudah](evidence/mobile-360x480-font1.png), [360×420](evidence/mobile-360x420-font1.png).|
|QA-003 P1, worker bot online offline|**BLOCKED OPERASIONAL; UI DIMANTAPKAN**|UI memeriksa diagnostik sebelum mengaktifkan Tambahkan bot, menjelaskan unavailable dan menyediakan retry. Slot sedang sibuk tidak disamakan dengan worker mati; Termux sehat tidak diwajibkan punya scheduler Edge. Perangkat worker belum dapat dipulihkan tanpa aksesnya. [Diagnostik terbaru](evidence/worker-status-live.json).|
|QA-004 P2, command test:online kehilangan alias loader|**FIXED LOCAL**|Script resmi memakai loader yang sama dengan runtime test. 84/84 test online lulus melalui command npm yang semula gagal.|
|QA-005 P2, suite browser tertinggal kontrak aktif|**FIXED LOCAL**|Assertion Bank, ikon ilustrasi, profil nama wajib, hasil lelang/modal dan footer diperbarui. Cakupan AllTiles usang diganti navigasi inventaris Bank yang memang aktif, jumlah skenario dipertahankan. Kasus tab memakai RNG fixture lokal agar ACK kartu acak tidak disangka race save. Seluruh command final di tabel lulus.|
|QA-006 P3, nominal lelang dokumen lama|**FIXED LOCAL**|Rulepack kini menyebut pembuka/kenaikan ₦5=50 unit engine. Tidak mengubah aturan aktual.|
|Bank details restoration, Suspected sebelumnya|**Tidak terbukti sebagai bug game**|Test menunggu pemulihan detail pada animation frame; 7 skenario Bank lulus. Tidak menambal reducer/keuangan berdasarkan kegagalan harness.|

`FIXED LOCAL` berarti perbaikan ada pada branch ini dan terverifikasi lokal. Bug production belum dinyatakan hilang karena belum ada deployment.

## Perubahan source

- [auto-dismiss.mjs](../../../frontend/auto-dismiss.mjs): timer presentasi bersama, pause/resume, proteksi key popup lama, cleanup.
- [feedback.mjs](../../../frontend/feedback.mjs): notifikasi bertanda pemasukan/pengeluaran, agregasi/dedup, umur modal dihitung ketika sudah tampil.
- [session.mjs](../../../frontend/session.mjs): antrean informasi/receipt menahan bot lokal sampai informasi selesai, menjaga identitas modal saat update online, membersihkan timer saat dispose.
- [app.mjs](../../../frontend/app.mjs): memakai dialog game bersama, menyembunyikan penutup untuk informasi/receipt, membersihkan footer, memeriksa status bot.
- [popups.mjs](../../../frontend/popups.mjs): isi modal informasi memakai header/body dan komponen nominal game yang ada.
- [index.html](../../../frontend/index.html) dan [styles.css](../../../frontend/styles.css): toast lama dihapus; layout slot papan portrait dan Bank pendek ditangani tanpa mengubah ilustrasi/pion.
- [online-status.mjs](../../../frontend/online-status.mjs): membedakan konfigurasi, worker offline, worker sibuk, serta scheduler Edge vs Termux.
- Package/test scripts dan dokumentasi aktif diperbarui sesuai kontrak UI terbaru.

Tidak mengubah `lib/`, engine, aturan implementasi, bobot/model bot, MODEL_MANIFEST, API/backend, Termux, pairing atau SQL. Seluruh 51 hash engine/model dan hash file manifest tetap cocok; protokol/wire state tidak berubah. Tidak ada artwork board/pion yang diganti. Fallback ukuran papan juga disediakan untuk browser yang belum memahami container-query units; perangkat lama belum diuji fisik.

## Hasil pengujian otomatis terbaru

**15 command berbeda: 15 PASS, 0 FAIL pada hasil akhir.** Percobaan gagal sebelum perbaikan harness tetap disimpan di commands.json/rechecks.json; tabel ini mengambil eksekusi terakhir per command. `npm test` **712/712 PASS**. Angka 84 online termasuk overlap dengan suite inti dan tidak dijumlahkan sebagai test unik tambahan.

| Command | Status | Exit | Durasi | Log |
|---|---|---|---|---|
| `npm test` | PASS | 0 | 37.647 s | [recheck-00.log](evidence/recheck-00.log) |
| `npm run typecheck` | PASS | 0 | 2.09 s | [recheck-05.log](evidence/recheck-05.log) |
| `npm run check:source` | PASS | 0 | 0.922 s | [recheck-06.log](evidence/recheck-06.log) |
| `npm run test:online` | PASS | 0 | 0.616 s | [check-03.log](evidence/check-03.log) |
| `npm run test:browser` | PASS | 0 | 44.163 s | [check-04.log](evidence/check-04.log) |
| `npm run test:portrait` | PASS | 0 | 156.735 s | [portrait-complete.log](evidence/portrait-complete.log) |
| `npm run test:auction` | PASS | 0 | 51.392 s | [recheck-02.log](evidence/recheck-02.log) |
| `npm run test:stability` | PASS | 0 | 17.4 s | [stability-final.log](evidence/stability-final.log) |
| `npm run test:bank` | PASS | 0 | 25.367 s | [recheck-04.log](evidence/recheck-04.log) |
| `npm run test:ui:4114:browser` | PASS | 0 | 61.108 s | [check-09.log](evidence/check-09.log) |
| `npm run test:trade:results:browser` | PASS | 0 | 58.631 s | [check-10.log](evidence/check-10.log) |
| `npm run test:online:rooms` | PASS | 0 | 53.493 s | [check-11.log](evidence/check-11.log) |
| `npm run test:pwa:browser` | PASS | 0 | 7.157 s | [check-12.log](evidence/check-12.log) |
| `npm run test:hold:batch:browser` | PASS | 0 | 32.895 s | [check-13.log](evidence/check-13.log) |
| `node scripts/verify-speed-model.mjs` | PASS | 0 | 0.073 s | [recheck-07.log](evidence/recheck-07.log) |

Durasi portrait final diukur dari start proses Node sampai laporan ditulis (tidak memasukkan startup npm). Durasi stability final memakai waktu pembuatan log sampai laporan, presisi sekitar 1 detik; lihat final-checks.json. Command lain diukur wall-clock subprocess.

Kelompok browser yang selesai: 16 gameplay/layout, 92 portrait/protection, 21 lelang, 7 stabilitas/tab, 7 Bank, 41 UI, 6 hasil barter, 14 room lokal, 5 PWA, 22 hold/batch. Hasil mock room tetap dilabel lokal; tidak diklaim sebagai multiplayer production.

## Sebelas reproduksi modal melalui browser

Skenario gaji memakai ROLL lewat tombol UI pada fixture lokal legal yang melewati Mulai; sewa/pajak/jail/release dan kartu memakai reducer resmi. Hasil barter diterima/ditolak melalui kontrol UI, cancellation memakai update state hasil reducer untuk mewakili lawan. Semua memakai aplikasi/DOM asli, bukan hanya render string.

- Tidak ada button terlihat pada modal informasi atau receipt.
- Modal muncul dengan density compact dan shell yang sama dengan modal game lain.
- Penutupan otomatis terjadi; seluruh state game sebelum/sesudah penutupan identik pada 11 skenario.
- Snapshot ulang tidak menampilkan sewa dua kali.
- Barter accepted/rejected/cancelled tidak membawa command footer lama.
- Test barter browser juga mengecek unread receipt setelah refresh dan tidak replay sesudah diakui otomatis.

[Data 11 skenario](evidence/modal-browser.json). Waktu observasi setelah screenshot sekitar 2,36–2,86 detik untuk notifikasi pendek dan 4,43–4,86 detik untuk contoh barter; bukan janji durasi identik untuk teks yang lebih panjang. Unit timer memakai clock terkontrol untuk memeriksa hidden/pause/superseded-key tanpa menunggu real time.

## Gameplay regresi setelah perubahan

Dua match baru dimulai dari lobby lewat UI: 2 peserta melawan NUSA dan 6 peserta melawan Kresna/Bima/Sari/NUSA/Arka. Masing-masing mencapai 80 dan 81 aksi engine, total **161 aksi**, lalu dihentikan oleh cap yang disengaja. **Tidak ada pemenang yang diklaim pada dua run ini.** Error JavaScript/API: 0. Durasi sekitar 97,7 dan 83,9 detik. [Hasil dan log aksi](evidence/browser-matches.json), trace `match-0-trace.zip` dan `match-4-trace.zip`.

Lima match penuh/100 match headless pada audit awal merupakan baseline historis, sebelum perubahan ini; tidak dilaporkan ulang seolah dijalankan kembali setelah fix. Reducer/model tetap byte-identik dan suite 712 test dijalankan ulang.

## Mobile dan Bank

Viewport 360×800, 393×873, 412×915 tetap memakai papan selebar viewport dan geometri yang sama. Portrait pendek 360×480 dan 360×420 kini tidak overlap dengan aktivitas/console. Landscape 800×360 tetap berfungsi. Font CSS 150/200% juga diperiksa, sebagai simulasi CSS saja, bukan pembuktian font scaling Android.

- [Geometri 7 konfigurasi](evidence/mobile-audit.json)
- [Geometri 360×420](evidence/short-mobile-audit.json)
- Empat modal Aset/Barter/Bank/Riwayat dibuka pada setiap konfigurasi dengan penutup terjangkau.
- Test Bank mencakup 6 viewport termasuk 360×420 dan 1280×800, sertifikat→kembali, pemulihan detail, state read-only dan penyimpanan riwayat parsial; 7 skenario lulus.
- Screenshot proteksi board/card/certificate dibuat ulang; tidak ada baseline pixel reference lintas mesin yang dipaksakan. Tidak mengklaim pixel identik di semua platform.

## Production, worker dan batas pekerjaan

Pada 2026-10-19T10:42:41.882Z, diagnostik production masih `onlineBots:true`, provider Termux, `workerAlive:false`, `availableSlots:0`. `schedulerConfigured:false` bukan bug untuk mode Termux. Build production tetap 392170ce55b1d147. Pembacaan ini memakai guest QA baru dan endpoint diagnostik; tidak membuat room, pairing, migrasi atau perintah worker.

Pemulihan worker perlu dilakukan pada perangkat yang sudah dipair: periksa PM2/heartbeat/log/akses jaringan lewat menu `nusa-online.sh`, jalankan ulang worker yang sudah ada tanpa menghapus konfigurasi, lalu uji satu room dua manusia+bot hingga pemenang. Instruksi operasional ada di [TERMUX_ONLINE.md](../../TERMUX_ONLINE.md). Tidak menjalankan enable SQL, pairing ulang atau deploy sebagai jalan pintas.

Tidak ada akses perangkat Termux/kredensial operator dalam sesi ini. Karena itu QA-003 tetap BLOCKED dan tidak disebut FIXED. Tampilan status baru mengurangi kebingungan dan menolak penambahan bot yang belum siap; itu bukan pengganti worker aktif.

## Risiko dan tindak lanjut yang belum boleh diberi PASS

1. Deployment/push belum dilakukan; URL publik belum memakai perbaikan ini.
2. Satu pertandingan live online hingga pemenang, dengan bot, auction/voting/host-loss/90s reconnect belum diuji ulang karena worker tidak aktif.
3. Android/iOS fisik, virtual keyboard, font scaling native dan color blindness tetap belum diuji; tidak ada redesign warna/board.
4. Profil heap/listener/timer sesi 24 jam dan 60 FPS perangkat nyata belum dijalankan. Cleanup timer diuji, namun itu bukan bukti tanpa semua jenis leak.
5. Notifikasi umum yang belum dibaca tidak direplay dari seluruh riwayat setelah refresh; baseline mencegah alert lama. Receipt barter memiliki persistence per perangkat/kursi dan diuji ulang. Uang/ownership tetap disimpan oleh engine.
6. Timeout otomatis dapat menutup rincian panjang; waktu baca dibatasi 12 detik untuk barter. Rincian transaksi tetap ada di Riwayat/Bank.
7. Label aplikasi masih 4.11.6 + basis perbaikan lokal; build fingerprint baru membedakan artefak. Release version/publikasi belum dibuat.

Tidak memberikan skor production baru untuk code yang belum dideploy. Skor 79/100 pada audit awal tetap catatan baseline, bukan penilaian perbaikan yang belum live.

## Roadmap tersisa

**HOTFIX:** verifikasi operator Termux dan health; review/publikasikan perubahan melalui proses yang diotorisasi.  
**STABILITY:** smoke live dua manusia + bot hingga menang; lease/reconnect/host-loss/auction/barter race; soak dan metrik.  
**UX POLISH:** uji Android/iOS, keyboard/font/kontras; petunjuk kamera dan cara membaca ₦; evaluasi waktu baca pada usability test.  
**FUTURE ENHANCEMENTS:** ringkasan transaksi penentu kemenangan dan eksperimen balancing seat/roster/budget seimbang sebelum mengubah model.

Laporan baseline tetap utuh di [QA_MASTER_REPORT.md](../QA_MASTER_REPORT.md). Artefak baru terpisah di follow-up/ agar FAIL historis dan PASS sesudah perbaikan tidak tercampur. Data ringkas: [summary.json](evidence/summary.json).
