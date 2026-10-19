# Update online 4.11.2 → 4.11.3

Model tetap `v23.2-guard-finance-auction`, manifest `f398a9793efd23c3c74e3e46d89aab0117a4c23c5102036d7e8f77a51c94e46d`. Semua 51 berkas model/engine serta berkas manifest dipertahankan. Tidak ada perubahan aturan, persona, budget berpikir, RNG, RLS lama, lease 30 detik, atau protokol worker.

## Urutan pembaruan

1. **Supabase:** sebagai pemilik proyek, jalankan `supabase/migrations/202610190008_online_speed.sql` di SQL Editor. Untuk instalasi 4.11.2, jangan menerapkan ulang migration 007. Migration 008 hanya menambah tiga RPC server: akses worker dengan kuota, snapshot dengan lease, dan claim dengan pengukuran antrean. Tidak mereset room atau mengubah provider. Fungsi baru ditolak untuk `PUBLIC`, `anon`, dan `authenticated`.
2. **GitHub:** buat branch dari source proyekmu, salin perubahan source dari ZIP ini ke working tree, dan pertahankan `.git`, `.env*`, `.nusa-online`, serta konfigurasi privat. ZIP berisi source penuh; jangan mengunggah ZIP sebagai pengganti source deployment.

```bash
git switch -c perf/online-speed-4.11.3
# Salin source hasil ekstraksi ke working tree ini, tanpa folder privat.
npm ci
node scripts/verify-speed-model.mjs
npm run typecheck
npm test
git status --short
git add frontend lib app adapters api termux supabase scripts tests docs \
  benchmarks/online-speed-4112 package.json package-lock.json vercel.json
git commit -m "perf: adaptive online presentation and worker RPC batching"
git push -u origin perf/online-speed-4.11.3
```

Tinjau diff dan merge PR ke branch deployment. Periksa agar file credential tidak ikut commit.

3. **Vercel:** deploy source baru dengan build `npm run build:vercel`. `vercel.json` mengunci region `sin1`; pertahankan Supabase di Singapore. Environment Supabase dan `MN_ONLINE_BOTS_ENABLED=true` tetap di backend. Tidak ada key admin di perangkat/browser. Pastikan `/build.json` menampilkan 4.11.3. Build web memiliki fingerprint baru. Pengguna PWA kembali ke lobby dan memperbarui aplikasi/muat ulang untuk menerima frontend baru.
4. **Termux:** worker 4.11.2 masih kompatibel karena manifest/protokol tetap sama. Perbarui source perangkat untuk memperoleh instrumentasi dan perbaikan pump terbaru. Stop dahulu, ekstrak ZIP ke direktori privat instalasi yang sama, lalu jalankan:

```bash
bash nusa-online.sh --stop
# Ekstrak NUSA_ONLINE_TERMUX_4.11.3.zip ke direktori instalasi ini.
# Pertahankan .nusa-online/config.json; jangan salin config ke shared storage.
bash nusa-online.sh --selftest
bash nusa-online.sh --start
bash nusa-online.sh
```

Tidak perlu mengisi token administrator, pairing ulang, atau menjalankan ulang `termux_enable.sql` pada instalasi 4.11.2 yang sudah aktif. State game tetap di server; lease pekerjaan yang terhenti pulih melalui mekanisme lama. Untuk instalasi dari nol, ikuti `INSTALL.md`.

## Perilaku baru

- Papan/dadu tetap mengikuti event yang sudah dikonfirmasi. Kontrol keputusan online memakai state canonical terbaru dan tidak menunggu efek dekoratif. Selama request dadu masih berjalan, UI hanya menampilkan pengacakan dekoratif; nilai hasil masuk setelah respons server.
- Tanpa backlog, urutan visual tetap normal. Saat sedikitnya dua versi animasi menumpuk, 20 langkah terantre, atau antrean berusia lebih dari 1,8 detik ketika snapshot diterima, reducer menyelesaikan langkah lama dan membatasi ekor presentasi terbaru hingga 700 ms. Saldo/aset/history tetap berasal dari snapshot dan event engine.
- Keputusan manusia diprioritaskan: animasi sebelumnya diselesaikan, sedangkan kartu aktif tetap menunggu ACK manusia. Lelang, barter, utang, bangunan, pilihan gadai, dan hasil pertandingan menggunakan state server terbaru. Ringkasan catch-up menampilkan jumlah transaksi terkonfirmasi dan mengarahkan ke Riwayat; pembayaran tidak diputar ulang di server.
- Realtime memakai read di awal jendela, revisi yang sudah diterima diabaikan, dan hint saat read berjalan menjadwalkan satu follow-up. Read berbasis hint dibatasi jaraknya 550 ms agar burst tidak menghabiskan kuota 120 read/menit. Heartbeat pemain tetap 20 detik saat bermain; WebSocket terputus memakai recovery read 3–5 detik. Validasi versi dan ID aksi tetap berlaku.

## Mengambil hasil profiling pertandingan nyata

Di menu Pengaturan saat online, pilih **Unduh diagnostik online**. File lokal JSON berisi maksimal 512 sampel dan ringkasan P50/P95. Data tidak otomatis dikirim ke Supabase. Field yang tersedia meliputi token/Auth wait, HTTP, backend Auth/database/commit, Realtime-hint ke state, kedalaman antrean, catch-up, durasi langkah, dan receipt ke snapshot yang tampil.

Header HTTP `Server-Timing` dan `_performance` pada respons memiliki trace serta span database per request. Worker menyimpan P50/P95 antrean database, komputasi thread, submit, commit, serta claim ke ACK di `.nusa-online/status.json`; detail dan trace ada dalam log JSONL berotasi. Monitor CLI tetap maksimal lima event terakhir.

Durasi memakai clock monotonic lokal untuk setiap proses. `server.commit-start-to-read` adalah usia dari awal commit sampai pembacaan server, **bukan** latensi satu arah commit→Realtime. Jangan mengurangkan clock Android/browser dengan clock server. Cocokkan trace, versi, dan command ID saat menganalisis file dari beberapa perangkat.

Bandingkan konfigurasi perangkat/budget yang sama dan ambil sampel beberapa pertandingan. Ukur interval commit terpisah dari backlog presentasi. Nilai lama XKL5BY56 berasal dari laporan pengguna; lingkungan pembuatan paket tidak mempunyai akses log private pertandingan tersebut.

## Pengujian dan rollback

```bash
npm run test:speed
npm run benchmark:speed
npm run test:termux:postgres   # Docker/PostgreSQL terisolasi
# Browser: Playwright Core + Chromium, server lokal dan baseline build 4.11.2:
MN_BROWSER_MODULE=/path/playwright-core MN_SPEED_BASELINE=/path/4.11.2/dist \
  node scripts/test-online-speed-browser.mjs
```

Benchmark JSON, audit, dan hasil Chromium ada di `docs/audits/ONLINE_SPEED_*`. Angka pengujian lokal tidak diklaim sebagai latensi produksi atau perangkat Android fisik. Canonical log memiliki batas histori bawaan engine; catch-up tidak mengubah batas itu, tidak menghapus transaksi darinya, dan tidak dapat merekonstruksi event yang sudah terpotong ketika perangkat offline lama.

Rollback ke deployment/source 4.11.2 dapat dilakukan tanpa menghapus migration 008; fungsi tambahan tidak dipakai backend lama. Manifest/protokol/provider tetap kompatibel. Tidak perlu mengubah ke Edge atau membuang data room untuk rollback presentasi.
