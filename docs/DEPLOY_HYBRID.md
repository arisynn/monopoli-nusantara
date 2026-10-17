> Arsip konfigurasi rilis sebelumnya. Untuk 4.9.0 ikuti [ENV_REQUIRED.md](../ENV_REQUIRED.md): native ESM Vercel, key modern/alias didukung, Redis tidak dipakai runtime aktif.

> Panduan historis. Untuk perintah build/runtime dan status database terbaru gunakan [DEPLOY_483.md](DEPLOY_483.md).

# Deployment Hybrid Bot Intelligence 4.0

Ini panduan penerapan source, bukan bukti deployment berhasil. Paket mempertahankan pembaruan Supabase sebelumnya. Workspace tidak memiliki Git checkout, remote atau commit `bc90b2f`; cocokkan source/branch tujuan dan diff sebelum integrasi. Jangan menimpa perubahan multiplayer yang belum ada di paket ini.

## Frontend dan bot lokal

1. Gunakan Node 24 dan pnpm sesuai `package.json` pada runner yang memiliki akses dependency. Instal satu kali dengan lockfile existing. Dependency/lockfile tidak diubah oleh pembaruan ini.
2. Jalankan:

   ```bash
   pnpm install --frozen-lockfile
   npm run typecheck
   npm run test:core
   npm run test:bots
   npm test
   npm run lint
   npm run build:vercel
   ```

   Untuk hosting Sites, jalankan juga `npm run build` melalui workflow hosting existing. `tests/types/bot-contract.ts` termasuk dalam typecheck dan memeriksa `reason` pada hasil lokal/hybrid serta `createGame().aiComment`. Keberhasilan tes Node/syntax parsing tidak menggantikan typecheck, TSX rendering atau build.
3. Deploy frontend/backend versi sama melalui pipeline target existing. Jangan mengubah desain board, identitas project hosting atau binding backend legacy. Package tetap 2.11.1; nomor package bukan identitas commit.
4. VS Bot baru memilih 2, 3 atau 4 peserta total. Tanpa ENV/backend, gunakan engine lokal dan save/load existing. Agar dapat membuka offline setelah pemasangan, shell/assets harus pernah dimuat lewat HTTPS dan tercache. Browser Android perlu QA nyata.

## Groq opsional

Sediakan lewat secret manager server: `GROQ_API_KEY`; opsional `GROQ_MODEL`, `GROQ_TIMEOUT_MS` (default 6500, rentang 1500–9000), `GROQ_DAILY_BUDGET` (default 100, maksimum 1000). Model default tetap `openai/gpt-oss-20b`; akun/kompatibilitas belum diperiksa dan tidak ada pergantian model otomatis. Coba request staging kecil sebelum menambah budget. Tidak ada pengujian berbayar pada pekerjaan ini.

`GET /api/bot` hanya memberi status konfigurasi. Status `hybrid` baru muncul setelah request provider valid dan keputusan lolos gate. `fallback` mengembalikan aksi lokal dan enum alasan aman. Endpoint tidak menyimpan snapshot client atau mengubah room online. Redis tidak diperlukan.

Budget Supabase bersifat persisten bila konfigurasi server lengkap. Tanpa Supabase, budget/circuit/rate limiter adalah per-instance; batas global serverless belum terjamin. Jangan menaikkan budget berdasarkan angka konfigurasi saja. Endpoint lama `/api/game` tetap mempunyai kuota legacy tersendiri untuk save room bertoken lama.

## Supabase dan bot online

1. Audit project/ref/environment, migration history, schema `mn_*`, grants, Auth, RLS, publication, log dan extensions memakai koneksi resmi. Backup terlebih dahulu. SQL belum dijalankan dalam pekerjaan ini. Jika objek sudah ada, sesuaikan migration dengan schema aktual; jangan drop tabel/data.
2. Ikuti fondasi [DEPLOY_SUPABASE.md](DEPLOY_SUPABASE.md). Review migration `202610160001_persistent_online.sql` bila belum diterapkan, kemudian `202610160002_hybrid_bot_jobs.sql`. Migration 002 menambah tabel jobs/receipts dan mengganti RPC service-only dengan kontrak delapan parameter yang sama. Verifikasi kompatibilitas pada staging sebelum produksi.
3. Enable/review Supabase Vault, `pg_net` dan `pg_cron` sesuai fasilitas project aktual. Tidak ada klaim paket/kuota extension tertentu. Jobs bot tidak ditambahkan ke Realtime publication; hanya `mn_room_updates` tetap dipublikasikan.
4. Buat secret acak minimal 32 karakter melalui secret manager. Pasang `MN_BOT_WORKER_SECRET` pada Edge Function. Bila advisor diinginkan untuk bot online, pasang ENV Groq secara terpisah pada function. Secret Supabase server otomatis disediakan runtime function; jangan menyalinnya ke frontend.
5. Deploy function dari root project menggunakan Supabase CLI resmi yang sudah terautentikasi:

   ```bash
   supabase functions deploy monopoli-bots --project-ref <staging-project-ref>
   ```

   `supabase/config.toml` mematikan verifikasi JWT untuk function ini karena autentikasinya memakai header rahasia khusus `X-MN-Worker-Secret`, diverifikasi di handler. Browser JWT bukan otorisasi worker. Tanpa secret yang cocok, handler menolak request. Jangan membuka endpoint ini tanpa handler autentikasi.
6. Di Vault melalui UI/tool resmi, simpan dua entri: `mn_bot_worker_url` = URL HTTPS function staging, dan `mn_bot_worker_secret` = secret yang sama dengan ENV function. Jangan menaruh nilai rahasia ke SQL tracked, laporan atau chat.
7. Review lalu jalankan `supabase/scheduler_setup.sql` satu kali pada staging. Trigger transactional menjadwalkan HTTP setelah commit; cron satu menit memulihkan wakeup yang hilang dan lease kedaluwarsa. Lease 30 detik, batas empat klaim per invocation, re-read revision/status setelah advisor, serta receipt `(code, match_id, source_version)` melindungi eksekusi ulang. Function tidak menahan transaksi selama Groq.
8. Baru setelah worker/scheduler berjalan, set `MN_ONLINE_BOTS_ENABLED=true` pada runtime aplikasi. Default false menjaga lobby tidak menawarkan bot sebelum infrastruktur siap. Flag tidak menghentikan bot pada pertandingan existing; pause room melalui mekanisme sah untuk maintenance. Jangan mematikan worker/cron lalu meninggalkan room bot aktif.
9. Jalankan pada staging terisolasi:

   ```bash
   npm run test:supabase
   npm run test:supabase:bots
   ```

   Gunakan `MN_ALLOW_LIVE_TESTS=staging` dan konfigurasi Supabase staging. Script bot memerlukan `MN_TEST_ACCESS_TOKENS` berisi JSON dua session Auth berbeda, diberikan lewat environment rahasia. Script fondasi memerlukan tujuh identitas sesuai panduannya. Jangan mencetak token. Script membuat room QA persisten baru; tidak menghapus data. Tes bot memverifikasi akses tabel/RPC ditolak untuk browser, endpoint worker menolak browser JWT, lalu menunggu scheduler tanpa memanggil worker dari browser. Belum dijalankan pada pekerjaan ini.
10. Uji kegagalan function, hilangnya wakeup, lease expiry, pause saat Groq berlangsung, disconnect 35–90 detik lalu reconnect, dan seluruh manusia offline lebih dari 90 detik. State auto-pause dapat direkonsiliasi saat room diakses kembali; semua aksi ditahan selama lease manusia tidak valid. Job `blocked` dijadwalkan ulang ketika heartbeat seluruh manusia kembali segar. Resume hanya menghitung manusia aktif.
11. Amati `mn_bot_jobs.status`, `attempts`, `due_at`, lease dan `last_error` melalui akses operator server. Lima kegagalan keputusan menghasilkan status `failed`; perbaiki penyebab, lalu requeue dengan pemeriksaan revision menggunakan tool operator resmi. Alert/console operator khusus belum dibuat. Recovery crash lease berlangsung melalui cron; bukan ketergantungan browser host.
12. Promosikan ke produksi hanya sesudah build, QA perangkat, RLS/SQL, scheduler dan recovery staging lulus. Tidak ada promosi/deployment/migration produksi dilakukan dalam pekerjaan ini. Saat rollback, pertahankan schema/jobs dan snapshot yang dapat dibaca; jangan drop data atau menghilangkan worker yang masih diperlukan pertandingan aktif.

## Reproduksi benchmark

```bash
node scripts/benchmark-bots.mjs --stage=evaluation --seeds=5 --seed-base=250000 --max-actions=2500 --seconds=220 --output=docs/BOT_EVALUATION.json
node scripts/benchmark-bots.mjs --stage=ablation --max-actions=2500 --seconds=60 --output=docs/BOT_ABLATION.json
node scripts/analyze-benchmark.mjs
```

Evaluasi yang disertakan berasal dari run 306 pertandingan (270 evaluasi + tuning/diagnostik/self-play), lalu run ablation terkontrol 30 pertandingan. Perintah evaluasi di atas hanya mengulang 270 pasangan evaluasi, bukan seluruh tahap run asli. Seed tuning/eksplorasi terpisah; jangan memakai cohort evaluasi ini untuk tuning berikutnya dan kemudian mengklaimnya held-out kembali. CI per-baris mentah deskriptif karena baseline/persona/seat berkorelasi; gunakan analisis bootstrap per seed dan perluas seed sebelum klaim kompetitif yang kuat.
