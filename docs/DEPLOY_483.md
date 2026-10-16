# Deployment aktif 4.8.3

Dokumen ini menggantikan perintah frontend/build pada panduan deployment historis. Source asal pengguna adalah 4.8.2; nama arsip 4.8.1 merupakan typo.

## Lokal

Node 24.x. Build/runtime tidak memerlukan dependency produksi.

```bash
npm run build
npm start
```

`npm start` dan `npm run dev` membaca `.env` jika tersedia. File rahasia itu tidak disertakan dalam ZIP. Salin `.env.example` dan isi lewat secret manager/perangkat pribadi.

Untuk pengembangan dan pemeriksaan:

```bash
npm ci --ignore-scripts
npm run typecheck
npm run format:check
npm test
npm run check:source
```

QA browser memerlukan Playwright dan Chromium; set `MN_BROWSER_MODULE` dan `MN_CHROMIUM_PATH` jika dipasang di luar proyek. Jalankan server lebih dahulu, lalu `test:browser`, `test:compact`, `test:plan`, `test:assets`, dan `test:stability`.

## Vercel

Framework Other, Node 24, build `npm run build:vercel`, output `dist`, handler API dan rewrite mengikuti `vercel.json`. Pasang environment server pada environment deployment yang benar. Tidak ada deployment Vercel yang dilakukan dalam update ini.

## Supabase tujuan: connectify

- Project ref: `ymunfgclqfdqaczluqti`.
- URL: `https://ymunfgclqfdqaczluqti.supabase.co`.
- Proyek dipulihkan dari status INACTIVE menjadi ACTIVE_HEALTHY.
- Tabel lama `mp_rooms` dengan satu room dipertahankan. Data itu memakai format berbeda dan tidak dikonversi otomatis menjadi room baru.
- Tiga migrasi fondasi `mn_*` sudah diterapkan pada 16 Oktober 2026. Jangan menjalankan ulang CREATE TABLE yang sama. Periksa history remote sebelum mengubah schema.
- Migration history remote: `20261016175341_mn_persistent_online`, `20261016175403_mn_hybrid_bot_jobs`, `20261016175404_mn_nusa_mind_settings`. File sumber tetap menggunakan nama migrasi historis dari paket untuk menjaga rujukan dokumentasi.
- Tujuh tabel `mn_*` memiliki RLS. Browser tidak dapat memanggil RPC commit; `service_role` bisa. Hanya `mn_room_updates` yang dipublikasikan dari schema Monopoli baru.
- Proyek champagne tetap untuk novel. Tidak ada migrasi atau perbaikan tabel novel yang dilakukan.

Runtime aplikasi memerlukan tiga variabel: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (boleh publishable key), dan `SUPABASE_SERVICE_ROLE_KEY` khusus server. Plugin dapat mengelola database tetapi tidak menyediakan service-role key runtime. Tanpa key server tersebut `/api/online?config=1` tetap `online:false`; jangan menganggap koneksi plugin sebagai konfigurasi backend aplikasi.

Ambil service-role key melalui dashboard Supabase proyek connectify dan pasang pada secret manager hosting/.env privat. Jangan menggunakan awalan NEXT_PUBLIC_, memasukkannya ke source, atau mengirimkannya ke browser.

Periksa Auth email/password, anonymous sign-in jika tamu diperlukan, Site URL dan allowed redirect origins. Setelah runtime lengkap, uji dua akun/perangkat pada deployment sebelum memperluas peserta.

`MN_ONLINE_BOTS_ENABLED=false` dipertahankan. Schema jobs sudah tersedia, tetapi Edge worker, Vault, pg_net, cron, dan pemulihan bot belum divalidasi live. Ikuti bagian worker pada DEPLOY_HYBRID.md setelah menyesuaikan perintah frontend dengan dokumen ini.

Tes `test:supabase` dan `test:supabase:bots` hanya untuk staging terisolasi dengan konfigurasi dan identitas QA yang sesuai. Jangan menjalankannya pada proyek yang berisi room pengguna hanya untuk melewati gate tes.

## Upstash dan Groq

`UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` tetap jalur kompatibilitas room Redis lama, bukan pengganti Supabase untuk room baru. PING live berhasil; tidak ada room Redis yang dibaca/diubah dalam update ini.

Advisor memakai `openai/gpt-oss-20b`, dengan `reasoning_effort:low` untuk keluarga gpt-oss dan batas keluaran 500 token. Endpoint model, structured output, serta satu keputusan advisor game sudah berhasil diuji live. Ini membuktikan akses/kontrak, bukan peningkatan win rate bot.

Groq menyediakan akses sesuai plan dan rate limit akun, bukan jaminan tanpa batas atau konversi otomatis akun berbayar ke gratis. Rujukan: https://console.groq.com/docs/models dan https://console.groq.com/docs/rate-limits. Model 120b tersedia sebagai pilihan `GROQ_MODEL`, tetapi 20b dipakai sebagai default ringan. Tidak ada pemilihan model berbayar cadangan secara otomatis.

`GROQ_DAILY_BUDGET=100` membatasi permintaan advisor. Budget global persisten memerlukan konfigurasi Supabase lengkap; tanpa itu pembatasan bersifat per-instance. Advisor tetap opt-in per pertandingan dan bot lokal berfungsi ketika kuota/provider gagal.

## Temuan audit di luar perubahan Monopoli

Audit read-only champagne menemukan `public.players`, `public.scores`, dan `public.hint_transactions` belum memiliki RLS. Ini memerlukan peninjauan akses aplikasi pemilik sebelum mengaktifkan RLS; perubahan otomatis dapat memutus fitur yang ada. Rujukan: https://supabase.com/docs/guides/database/postgres/row-level-security.

Advisor connectify juga mencatat fungsi legacy dengan search_path mutable dan fungsi event-trigger legacy yang dapat dieksekusi role publik. Perubahan 4.8.3 tidak mengubah fungsi `cde_*`/`rls_auto_enable`. Temuan INFO tanpa policy pada tabel Monopoli privat disengaja: browser memang tidak boleh mengakses tabel itu. Policy membership/update tetap memeriksa auth.uid().

