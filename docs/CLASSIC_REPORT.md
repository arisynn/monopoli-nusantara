# Monopoli Nusantara 4.8 — Papan Klasik

Pembaruan ini menerapkan arahan terakhir: papan 2D klasik selebar layar, nama petak lengkap, header ringkas, Aset dan Barter berdampingan, serta dadu datar yang hanya mengacak titik. Ini adalah source yang dapat dijalankan, bukan mockup gambar.

## Basis dan audit

Source aktif `/workspace/monopoli-nusantara` melanjutkan frontend Kepulauan 4.7.1 di atas paket logic v4.6.1. Tidak memakai source React v2.11.1 atau patch/hotfix lama sebagai pengganti. SHA paket basis dan referensi terbaru dicatat dalam `design/SOURCE_OF_TRUTH.json`. Tidak ada metadata Git/branch yang dapat dipakai untuk membuktikan hubungan ke commit deployment `bc90b2f`.

Arsitektur aktual adalah ES modules native, CSS, renderer SVG, shared engine, adapter Fetch/Node/Vercel, worker NUSA MIND, dan integrasi Supabase existing. Build aktif bukan Next.js. Script `build:vercel` menghasilkan `dist/` dan adapter Vercel tetap memakai API yang sama. Tipe `BotDecisionResult` existing dan fallback Groq dipertahankan; tidak ditambahkan `as any`, penonaktifan strict, atau pengabaian error compiler.

Audit menemukan bahwa mekanisme timeline, public events, transaction presentation, popup keputusan, seat ownership, reconnect baseline dan server actions sudah tersedia. Karena itu tidak dibuat ulang engine, room, bot, atau event system. Tidak ada koneksi proyek Supabase/Groq live di lingkungan ini; tidak ada migration, perubahan data produksi, atau deployment eksternal yang dilakukan.

## Perubahan desain

- Papan datar memakai latar mint, garis tegas dan strip kelompok. Semua 40 petak mengikuti ID, nama dan koordinat `BOARD` existing. Nama dekat strip kelompok dan harga pada tepi luar, mengikuti posisi referensi 1251174. Isi petak diputar 0°/90°/180°/270° menghadap tengah papan; pion tetap menghadap layar. Nama ditulis kapital tanpa mengubah nama engine, tidak dipotong di tengah kata; nama beberapa kata memakai maksimal dua baris. Teks panjang dipadatkan secara horizontal dalam batas petak, dengan nama lengkap dan harga/sewa tersedia lewat popup.
- Tidak ada foto/pemandangan pada petak properti biasa. Sepuluh PNG transparan khusus dibuat dari vektor asli di `design/classic-icons/`. Strip pemilik, empat rumah, hotel H, gadai dan highlight pilihan tetap terlihat.
- Overview portrait memakai seluruh lebar viewport tanpa gutter horizontal, tanpa perspektif dan tanpa alas 2.5D. Kamera zoom/geser tetap tersedia, hanya ada satu tombol kamera di header.
- Header hanya hamburger, Nusantara dan kamera gameplay. Pengaturan tetap lewat menu. Kapsul mendukung 2–6 pemain, maksimal dua baris; saldo, giliran, penjara, bangkrut, koneksi dan transaksi tetap dipertahankan.
- Konsol bawah berisi Aset dan Barter berdampingan, dua dadu dan tindakan utama. Tidak ada bottom tab atau rak Properti Saya permanen. Semua fitur lainnya menggunakan popup dengan latar redup/blur.
- Lobby dipadatkan tanpa hero ilustrasi besar dan header dekoratif ganda. Latar scenery lama masih sesuai untuk lobby, sedangkan gameplay memakai warna tenang.
- Renderer posisi pion tetap deterministik, dengan offset visual di dalam petak agar nama tidak tertutup. Tidak mengubah posisi logis atau rute engine.

## Akar masalah dan perbaikannya

### Error `reading 'kind'` saat memulai kembali

`advanceTimeline()` membandingkan `queue[0]?.id` dengan ID penyelesaian. Jika queue kosong dan ID juga `undefined`, perbandingan tersebut lolos lalu `apply()` menerima langkah yang tidak ada. Alur buka/tutup layer saat kembali dari lobby dapat memicunya. Kini fungsi bersama dan `GameSession.complete()` mengabaikan head/ID kosong atau ID lama. Tes mencakup queue kosong, callback duplikat dan siklus mulai → lobby → mulai/resume.

### Angka dadu kembali ke pasangan lama

Pada fase `diceResult`, UI memakai pasangan baru. Sesudahnya, selector kembali membaca log pada view timeline yang masih merupakan baseline lama selama pion bergerak. Kini hasil yang telah diperlihatkan disimpan sebagai metadata `presentationDice` pada view saja. Metadata ini tidak masuk ke state otoritatif atau autosave. Snapshot akhir/reconnect memakai log terbaru tanpa replay.

### Ketukan ganda menghentikan animasi

Sebelum rerender men-disable tombol, ketukan kedua dapat masuk ke cabang detail dan membuka profil. Popup tersebut menahan presentasi. Handler kini memeriksa `session.pending` dan `primaryAction.disabled` langsung sebelum bertindak. Browser menguji dua `.click()` sinkron dan memastikan hanya satu revision tersimpan serta pion menunggu reveal.

### Timer widget dadu pada browser

Referensi native `setTimeout` yang dipanggil sebagai method widget dapat menghasilkan `Illegal invocation` di Chromium. Default scheduler/cancel kini memakai wrapper `globalThis`, sehingga receiver tetap benar. Tes browser memeriksa perubahan titik aktual dan tidak menerima console error.

## Urutan presentasi dadu

Engine/backend tetap menentukan pasangan sah. Selama rolling, selector memberikan nilai `null` kepada widget. Widget hanya menggambar pasangan dekoratif 1–6 berdasarkan ID presentasi dan tick, tanpa RNG game. Titik berubah dengan interval melambat; tidak ada rotasi, perspektif, fisika atau perpindahan ke tengah papan.

Pada reveal, timer dibatalkan dan kedua wajah langsung memakai nilai sah. Guard serial membatalkan callback lama; rerender dengan ID sama tidak mengulang shuffle. Baru kemudian langkah pion berjalan. Pengaturan reduced motion melewati shuffle dan tetap memperlihatkan hasil sah. Popup/paused menahan presentasi lokal; callback animasi tidak mengubah dadu, uang atau status room server.

Reconnect/refresh memasang snapshot sebagai baseline sehingga tidak memutar ulang lemparan lama. Dadu utility juga mempunyai reveal terpisah dan tidak menimpa pasangan movement sebelum waktunya.

## Fitur yang dipertahankan

Engine, ekonomi Nusa, rulepack, 40 ID petak, harga/sewa, kepemilikan, stok bangunan, lelang, barter/counteroffer, utang, penjara, kartu, kebangkrutan dan kemenangan tidak diubah. Tiga persona, empat model NUSA MIND, worker lokal dan Groq opsional dipertahankan. VS Bot tetap 2–4 peserta; fixture enam manusia pada tes layout hanya menguji tampilan/save compatibility, bukan fitur hotseat baru.

Supabase Auth, seat binding, room persistence, revision/idempotency, lease/jobs bot, voting manusia, heartbeat/reconnect dan pause/resume tetap menggunakan backend existing. Kontrol interaktif tetap memeriksa hak pemain. Animasi transaksi memakai ledger yang sudah dikonfirmasi, bukan pembayaran baru. Riwayat dan popup publik tetap memakai event ID existing.

`CLASSIC_CORE_INTEGRITY.json` membandingkan 56 file core terhadap paket logic: 54 identik, hanya `lib/presentation-timeline.mjs` dan `lib/presentation-types.ts` berubah untuk dua perbaikan presentasi di atas. Engine, bot, original API, migrasi dan schema tidak berubah. Daftar perubahan terhadap UI 4.7.1 ada di `CLASSIC_CHANGED_FILES.json`; hash seluruh paket ada di `PACKAGE_MANIFEST.json`.

## Verifikasi

Hasil akhir: **316/316 tes** (termasuk 50 frontend), **16/16 skenario Chromium**, **3/3 simulasi sesi sampai kemenangan**, semantic TypeScript, 173 pemeriksaan modul/import, dan `build:vercel` lulus. Hasil akhir dan jumlah pemeriksaan ada di `CLASSIC_VERIFICATION.json`. Rincian otomatis ada pada:

- `CLASSIC_TEST_RESULTS.json`: unit/integration engine, classic rules, save/load, room/Auth, API, bot, Groq mock, presentation dan frontend. Bukan layanan live.
- `CLASSIC_BROWSER_RESULTS.json`: Chromium nyata melalui HTTP lokal, DOM dan SVG aktual; viewport portrait 320×568, 360×640, 390×844, 430×932 masing-masing 2/4/6 pemain, desktop, popup, nama tidak keluar petak, kamera tunggal, siklus lobby dan dadu normal/reduced motion. Pengacakan game dikontrol hanya dalam context tes.
- `CLASSIC_SESSION_SMOKE.json`: simulasi sesi frontend sampai kemenangan untuk 2/3/4 peserta, persistence double dan keputusan manusia disimulasikan planner. Bukan benchmark kompetitif.
- `CLASSIC_SYNTAX_IMPORTS.json`: syntax, import graph, precache dan pembatasan static output. Pemeriksaan semantik TypeScript dijalankan terpisah.

ZIP juga dibuka ke direktori baru: `build:vercel` berhasil tanpa instalasi dependency, lalu 173 pemeriksaan modul/import lulus. CRC ZIP dan hash SHA256 seluruh file manifest diperiksa. Screenshot aktual ada pada `docs/screenshots/`.

Node 24 tersedia dan dependency dev compiler berhasil dipasang sekali. Tidak ada script lint pada source basis. Build statis tidak memerlukan dependency runtime. Screenshot yang disertakan berasal dari UI yang dijalankan di Chromium, bukan mockup hasil raster SVG.

## Batas verifikasi

Belum diuji di Android fisik atau melalui beberapa perangkat nyata. Belum diuji pada Supabase Auth/RLS/Postgres/Realtime, worker terjadwal, Groq sungguhan atau deployment Vercel live. Tes online menggunakan handler asli dan contract doubles/simulasi. Tidak ada klaim production-ready, peningkatan AI kompetitif atau keberhasilan deployment dari pembaruan UI ini.

Pada overview layar kecil, nama panjang tetap harus padat karena 40 petak berada pada lebar 320–430 px. Kamera dan popup menyediakan detail besar. Tidak mengubah nama/kelompok/ekonomi hanya untuk mengikuti teks dekoratif mockup. Kualitas 60 FPS perlu diukur pada perangkat sasaran.

Service worker memakai namespace baru `nusantara-classic-v480`, network-first public shell/assets dan membersihkan cache UI Nusantara versi terdahulu. Auth/API tidak dicache. LocalStorage/IndexedDB save tidak dihapus. Upgrade cache perlu diuji dari deployment lama pada domain sebenarnya.

## Menjalankan dan deployment

1. Node 24.x, `npm run build` lalu `npm start`; buka `http://127.0.0.1:8787`.
2. Untuk compiler: `npm ci --ignore-scripts`, `npm run typecheck`.
3. `npm test`, `npm run check:source`, `npm run smoke:ui`, `npm run build:vercel`.
4. Suite browser opsional: siapkan Playwright/Chromium, server yang sudah berjalan dan `npm run test:browser`. Path eksternal dapat ditentukan dengan `MN_BROWSER_MODULE` / `MN_CHROMIUM_PATH`.
5. Vercel: framework Other, Node 24.x, build `npm run build:vercel`, output `dist`, konfigurasi adapter pada `vercel.json`. Backend ENV mengikuti `.env.example` dan panduan Supabase existing, tidak menaruh service role/Groq key pada frontend.
6. Tidak ada migration database baru pada update ini. Aktifkan konfigurasi backend existing sesuai panduan bila room online akan dipakai. Jalankan pengujian live sebelum rilis multiplayer.
7. Periksa `/build.json` untuk `4.8.0` dan build hash. `lib/version.mjs` / `/health` masih metadata versi core historis.

## Checklist manual

- Buka lobby, ubah peserta 2/3/4, pion dan model; mulai, simpan, kembali lobby dan lanjutkan tanpa error.
- Portrait kecil/tinggi dengan 2/4/6 peserta: semua sisi papan terlihat, nama lengkap, kapsul dan aksi utama tidak terpotong. Coba pinch/drag dan satu tombol kamera.
- Ketuk properti, Aset, Barter, Riwayat, Profil, Pengaturan dan Simpanan: semuanya popup, tombol kembali dan keyboard tetap nyaman.
- Lempar normal, cepat, reduced motion dan ketuk ganda: hanya titik berubah, hasil baru jelas sebelum pion bergerak, hasil tidak kembali ke angka lama.
- Uji doubles, melewati Mulai, kartu perpindahan, utility roll, penjara dan pembayaran. Tutup popup/rerender saat presentasi, pastikan tidak membayar atau memproses kartu dua kali.
- Periksa strip kelompok/pemilik, 1–4 rumah, hotel dan gadai pada empat sisi, termasuk beberapa pion di petak sama.
- Dua perangkat pada room sungguhan: semua melihat hasil server sama, kontrol pemain lain read-only, tidak ada event duplikat, reconnect baseline tidak replay.
- Pause saat dadu/pion, resume, heartbeat terputus >90 detik, host offline dan bot off-turn lelang/barter: state/ledger tetap benar.
- Upgrade deployment lama dengan PWA terpasang, muat online/offline dan pastikan UI baru tampil serta simpanan lama tetap tersedia.
