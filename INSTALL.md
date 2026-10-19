# NUSA Online Worker 4.11.6 — instalasi dan operasi

Untuk update **4.11.5 → 4.11.6**, baca `docs/TRADE_RESULTS_4116_UPDATE.md`. Perbarui frontend dan backend bersama agar event hasil barter lengkap; siapkan ulang/redeploy Edge worker bila masih digunakan. Tidak ada SQL migration, pergantian manifest atau pairing ulang.

Paket ini memindahkan **komputasi AI** ke Termux/Node 24+. API Node/Vercel tetap menjalankan engine resmi untuk memvalidasi intent; Supabase menyimpan state, lease, receipt, Auth/RLS dan Realtime. Jalur normal mode Termux tidak menjalankan Edge Function.

Model dasarnya adalah source V23 yang diaudit. Release `v23.2-guard-finance-auction` berisi integrasi Stability Guard 2.0.0, bugfix scorer/pendanaan/anti-loop dan validasi bid ₦5, bukan model V24 atau campuran file model lama. `lib/bot/model-manifest.mjs` dan `MODEL_MANIFEST.json` dalam ZIP mengunci 51 file model/engine. Checksum baseline dan file yang berubah dicatat dalam `SOURCE_PATCHES.json`.

Audit update guard dan penyesuaian terhadap host official dijelaskan di `docs/audits/GUARD_FIX_INTEGRATION.md`. Engine tetap sama dengan rilis official 4.11.1; update ini menambahkan penjagaan keputusan dan riwayat transaksi bot.

Untuk update dari **4.11.2**, baca `docs/ONLINE_SPEED_UPDATE.md` terlebih dahulu. Rilis 4.11.3 memakai **model dan manifest V23.2 yang sama persis**; perubahan ada pada presentasi/sinkronisasi dan RPC server. Terapkan migration 008 sebelum deploy backend baru. Tidak perlu pairing ulang atau mengubah provider bila instalasi 4.11.2 sudah aktif.

Untuk update **4.11.4 → 4.11.5**, baca `docs/HOLD_BATCH_4115_UPDATE.md`. Frontend dan backend harus diperbarui bersama untuk aksi bangun banyak atomik. Dadu manusia memakai tahan–lepas; CSPRNG dan lemparan bot tetap sama. Tidak ada migration baru, pergantian manifest, pairing ulang, atau perubahan runtime Termux. Riwayat update UI 4.11.4 tersedia di `docs/UI_4114_UPDATE.md`.

## A. Setup backend sekali oleh pemilik proyek

1. Gunakan source lengkap di ZIP ini untuk memperbarui repo aplikasi. Backend ada di `app/api`, `lib/server`, `adapters`, `api` dan `vercel.json`; frontend ada di `frontend`. Jangan hanya menyalin folder `termux` ke backend lama.
2. Di lingkungan deployment backend, pertahankan konfigurasi Supabase yang sudah berfungsi: URL, publishable/anon key, dan secret/service-role key **server-only**. Set `MN_ONLINE_BOTS_ENABLED=true`. Key administrator tidak pernah dimasukkan ke Termux atau browser.
3. Untuk proyek yang sudah memiliki migration 001–006, terapkan `supabase/migrations/202610180007_termux_workers.sql`, lalu `supabase/migrations/202610190008_online_speed.sql` melalui SQL Editor sebagai operator. Migration ini tambahan, tidak mereset room atau ekonomi. Untuk database baru, terapkan 001, 002, 003, 004, 006, 007, 008; migration 005 khusus penjadwalan Edge lama tidak diperlukan untuk mode Termux. Pastikan extension pgcrypto, Auth, dan publication Realtime Supabase tersedia.
4. Jalankan `npm ci`, `npm run typecheck`, `npm test`, lalu deploy build `npm run build`. Aplikasi ini memakai satu handler Vercel; rewrite `/api/worker` serta output `server-dist` sudah terintegrasi. URL `https://SITUS/api/worker` harus mengembalikan protocol 1 dan manifest yang sama dengan paket.
5. Sebelum mengubah provider, uji di staging. Setelah backend cocok, jalankan `supabase/termux_enable.sql`. Ini memilih Termux, mengunci manifest, dan menonaktifkan cron wake Edge lama. Klaim serta commit Edge lama juga dibatasi di database; tidak ada fallback Edge otomatis. Lease lama dapat memerlukan sampai 30 detik untuk habis.
6. Buat kode pairing lewat SQL Editor. Pilih salah satu scope di bawah; kode hanya berlaku 10 menit dan satu kali penggunaan:

```sql
-- Seluruh room proyek, satu slot komputasi (perangkat operator terpercaya):
select public.mn_worker_create_pairing(null, 1);

-- Alternatif: hanya room tertentu, maksimal dua slot:
select public.mn_worker_create_pairing(array['ABCDEFGH','BCDEFGHJ'], 2);
```

Salin hasil kode secara privat ke CLI. Jangan commit kode itu, memasukkannya ke screenshot/log, atau memberikan key Supabase administrator sebagai pengganti. Worker memakai token acak terbatas dan sesi Auth perangkat. Scope serta otorisasinya disimpan server, bukan metadata user yang dapat diedit pemain.

Provider default migration adalah Edge agar instalasi schema tidak diam-diam memindahkan game aktif. Sampai langkah aktivasi selesai, worker Termux bisa terdaftar/heartbeat tetapi tidak mengambil job. Aktivasi adalah pergantian provider satu proyek; canary dilakukan di staging terlebih dahulu.

### Memperbarui instalasi Termux 4.11.1

Stop worker, cadangkan konfigurasi privat `.nusa-online` pada direktori privat, lalu ekstrak source baru di direktori instalasi yang sama. Perbarui backend/frontend dan jalankan ulang `supabase/termux_enable.sql` dari paket baru agar manifest cocok; migration 007 tidak perlu diterapkan ulang jika sudah ada. Perangkat yang sudah dipair tetap memakai token lama dan memperbarui manifest saat heartbeat setelah backend cocok. Jika heartbeat menolak karena versi, pastikan seluruh deployment dan paket perangkat berasal dari ZIP yang sama. Jalankan selftest sebelum start kembali. Instalasi yang belum dipair mengikuti langkah instalasi biasa.

## B. Instalasi di Android

Gunakan Termux yang mendukung Node 24+, lalu ekstrak ZIP ke direktori privat home Termux, misalnya `~/nusa-online`. Jangan melakukan pairing di `/sdcard`, `~/storage/shared`, atau direktori lain yang dapat dibaca aplikasi lain. CLI menolak penyimpanan credential pada shared storage yang umum.

```bash
pkg update
pkg install nodejs-lts unzip python -y
mkdir -p ~/nusa-online
unzip ~/storage/downloads/NUSA_ONLINE_TERMUX_4.11.6.zip -d ~/nusa-online
cd ~/nusa-online
bash nusa-online.sh --selftest
bash nusa-online.sh
```

`--selftest` memeriksa checksum serta menjalankan enam persona melalui compute thread dan engine, tanpa login/Supabase. Menjalankan worker tidak membutuhkan `npm install` aplikasi atau SDK Supabase. CLI memasang PM2 6.0.14 bila belum tersedia; instalasi pertama memerlukan internet. Python digunakan untuk tooling paket, bukan daemon harian.

Di menu:

1. **Setup/pairing**: masukkan origin situs game, pilih identitas tamu baru atau akun perangkat, masukkan kode pairing, dan beri nama perangkat. Anonymous sign-in harus aktif bila memakai identitas tamu; bila dinonaktifkan, gunakan login akun perangkat.
2. **Jalankan worker**: PM2 menjalankan `nusa-online-worker`. Pemanggilan berulang me-restart aplikasi bernama itu, tidak menciptakan proses baru per room.
3. **Periksa koneksi**: memeriksa manifest, otorisasi worker, heartbeat, provider, dan status room yang diizinkan.
4. **Monitor**: layar diperbarui dari cache lokal, maksimal lima event. Menutup monitor atau keluar CLI tidak menghentikan PM2.

Config dan sesi berada di `.nusa-online/config.json` dengan permission privat. PM2 tidak menerima token lewat argumen CLI atau ecosystem config. Jangan menyalin folder `.nusa-online` saat membagikan ZIP atau source. File proses lokal/credential juga dikecualikan oleh packager.

Satu worker dapat memakai seluruh enam persona, dengan batas room online yang sudah ada: minimal dua manusia, maksimal tiga bot, total maksimal enam peserta. ARKA memakai ID internal `apex`. Enam persona diuji lewat beberapa roster, bukan enam bot sekaligus pada room online.

## C. Kapasitas dan performa

- Default satu slot komputasi, budget eksplisit 2.600 ms. Main thread mengurus jaringan; compute berjalan di `worker_threads`, sehingga pencarian model tidak memblokir heartbeat/reconnect.
- Satu room serial; beberapa room dapat berjalan paralel sesuai slot yang diizinkan pairing (maksimal empat). Naikkan slot lewat pengaturan hanya setelah mengukur RAM, suhu, dan waktu keputusan HP. Tidak ada penggantian model ke bot acak/versi lama saat sibuk.
- Realtime hanya membawa hint pekerjaan. Claim sekaligus mengambil snapshot; heartbeat sekaligus membawa status. Saat benar-benar idle dan Realtime sehat, perkiraan tiga request API worker per menit: dua heartbeat dan satu recovery claim; autentikasi/RPC di baliknya tetap memakai database. Saat match aktif, recovery lebih sering dan setiap aksi memerlukan claim/submit serta validasi.
- Hint sehat memberi respons cepat tanpa menunggu polling. Jika WebSocket gagal, recovery polling memakai backoff sampai 30 detik; latensi saat jaringan bermasalah tidak dijamin sama dengan koneksi sehat.
- Aksi manusia tidak menunggu planner atau Groq. Aturan asli seperti klaim sewa manual sebelum roll tetap berlaku dan dapat mengharuskan respons bot lebih dahulu.
- Ukur pemakaian Supabase/Vercel dan bandwidth pada akun sebenarnya. Paket ini menghapus inferensi AI dari jalur Edge normal, bukan seluruh biaya database/API/Realtime.

## D. Groq opsional

Default off. Untuk memakai advisor, konfigurasikan `GROQ_API_KEY`, model dan budget harian hanya pada backend, aktifkan advisor pada room, lalu aktifkan opsi advisor worker. Server memakai plan yang telah dihitung Termux dan tidak memanggil planner AI lagi. Timeout advisor dibatasi; worker memakai keputusan lokal yang sudah ada jika Groq lambat/error/rate limited.

Gate asli persona dipertahankan: NUSA/KRESNA/ARKA pada router strategis saat ini tidak meminta konsultasi (`shouldConsult=false`). Mengaktifkan Groq tidak memaksakan advisor ke jalur model tersebut. Advisor bukan syarat agar bot berjalan.

## E. Recovery dan saat worker offline

- Job, lease dan receipt berada di Supabase. Reconnect mengambil keputusan terbaru, bukan melanjutkan state cache secara membabi buta.
- Retry submit menggunakan command ID dan intent yang sama. Commit per sourceVersion bersifat paling banyak satu; respons hilang tidak menggandakan dadu, pembelian, bid, atau pembayaran.
- Proses mati atau standby takeover: lease kedaluwarsa maksimal 30 detik. Hasil worker lama ditolak setelah versi atau kepemilikan lease berubah.
- Worker offline: game tidak kehilangan state atau membuat pemenang palsu. Frontend menunjukkan bot menunggu worker. Aksi manusia yang masih legal tetap dapat dilakukan; keputusan yang membutuhkan bot menunggu.
- Worker scope tertentu tidak dapat membaca/mengerjakan room lain. Token pemain tidak dapat claim job atau menulis state bot.
- Untuk mencabut perangkat: SQL operator `update public.mn_workers set revoked=true where id='UUID-PERANGKAT';`. Perangkat langsung kehilangan API serta akses hint Realtime. Pair kembali dengan kode baru untuk mendaftarkan perangkat pengganti.
- PM2 tidak dapat mencegah Android force-stop. Bila diperlukan, gunakan battery exemption dan `termux-wake-lock` jika tersedia. `pm2 save` sudah dipanggil oleh menu start; setelah reboot gunakan `pm2 resurrect`. Termux:Boot dapat menjalankan `bash ~/nusa-online/nusa-online.sh --start` setelah konfigurasi privat siap.
- Stop tertib melalui CLI melepas pekerjaan yang belum selesai. Jika proses dibunuh paksa, database yang memulihkan lewat lease expiry.

## F. Log dan batas histori

Log lengkap keputusan yang diproses worker (kandidat, diagnostik, aksi, receipt) dan seluruh event publik hasil submit disimpan sebagai JSONL di `.nusa-online/logs/worker.jsonl`. File dirotasi pada 5 MiB dengan tiga arsip tambahan. Layar monitor hanya menampilkan lima event terakhir. PM2 stdout/error dipangkas saat startup bila melewati 1 MiB; umumnya hanya mencatat start/fatal error.

Retry ACK mengambil event terkait dari riwayat canonical bila masih tersedia. Jika histori server sudah terpotong (engine menyimpan 300 event), worker mencatat `eventsUnavailable`/peringatan histori; ia tidak mengarang event. Log worker bukan pengganti arsip lengkap aksi manusia selama perangkat offline. Salin log sebelum melewati retensi bila dibutuhkan untuk audit panjang.

## G. Pengujian dan rollback

```bash
npm run test:termux
npm run test:termux:postgres   # Docker lokal, tidak menyentuh Supabase live
node scripts/test-termux-pm2.mjs  # memerlukan PM2 tersedia
npm test
npm run typecheck
npm run check:source
# Di Termux/Node yang sudah dipair khusus satu room QA staging (PM2 dihentikan):
MN_ALLOW_LIVE_TESTS=staging node scripts/test-termux-staging.mjs KODE_QA
```

Pengujian yang dikirim berlabel jelas: unit/in-process, PostgreSQL terisolasi dengan model nyata, lifecycle PM2 Linux, serta benchmark compute thread. Pengujian Android fisik dan hosted Supabase Auth/Realtime belum dijalankan di lingkungan pembuatan paket ini; lakukan staging/HP sebelum penggunaan pertandingan penting.

Rollback operator: deploy ulang Edge dari source/manifest yang sama, siapkan Vault endpoint/secret server, lalu jalankan `supabase/termux_rollback.sql`. Jangan mengaktifkan Edge lama: manifest yang berbeda ditolak saat commit. Rollback tidak menghapus room, receipt atau job. Stop Termux dan tunggu lease drain bila ingin berpindah provider; tidak ada fallback otomatis yang menyembunyikan biaya Edge.

Dokumen rancangan dan temuan awal berada di `docs/audits/`. Laporan implementasi serta hasil tes final juga berada di sana. ZIP berisi source penuh yang dapat dibangun ulang, bukan executable Android atau deployment Supabase yang sudah diaktifkan.
