# Connectify — verifikasi deployment Supabase 17 Oktober 2026

Project: `connectify` (`ymunfgclqfdqaczluqti`). Source baseline Monopoli Nusantara **4.10.1**, tidak mengubah rulepack maupun struktur room.

## Sudah dipasang dan diverifikasi

- Tiga migrasi awal (`mn_persistent_online`, `mn_hybrid_bot_jobs`, `mn_nusa_mind_settings`) sudah terpasang sebelum sesi ini dan tidak dijalankan ulang.
- Migrasi `mn_bot_worker_prerequisites_4101`: `pg_net` dan `pg_cron` aktif.
- Migrasi `mn_bot_worker_vault_authorization_4101`: RPC `mn_bot_worker_authorized(text)` hanya boleh dipanggil `service_role` dan `postgres`; membandingkan hash SHA-256, tanpa mengembalikan raw secret.
- Edge Function `monopoli-bots` **ACTIVE v2** dengan 35 file dependensi, `verify_jwt=false` karena memakai pemeriksaan header rahasia **wajib** (bukan endpoint publik yang boleh menjalankan bot tanpa token). Bila `MN_BOT_WORKER_SECRET` disediakan, header dibandingkan langsung; jika belum ada, worker memverifikasi token terhadap Vault melalui RPC khusus server-side.
- Migrasi `mn_bot_worker_vault_scheduler_4101`: Vault punya nama `mn_bot_worker_secret` (token acak 64 karakter, tidak pernah dicetak) dan `mn_bot_worker_url`; cron `mn-bot-recovery` berjalan setiap menit.
- Tes HTTP dari Postgres `pg_net` ke Edge Function: token sah → **HTTP 200** dengan `{"claimed":0,"committed":0,"discarded":0}` karena belum ada antrean; token salah → **HTTP 401**.
- Tidak ditemukan room online aktif maupun bot jobs pada waktu pemeriksaan. Karena itu **belum** ada tes 2 manusia + bot sampai permainan selesai.

## Authentication yang sedang aktif

Endpoint Supabase GoTrue `/auth/v1/settings` dikonfirmasi **HTTP 200** dengan API key publik dari konfigurasi aplikasi:

- `external.email = true`
- `external.anonymous_users = true`
- `disable_signup = false`
- `mailer_autoconfirm = true`
- OAuth Google tidak aktif (game tidak memakai Google Sign-In).

Database berisi 103 akun termasuk 58 akun anonim pada waktu pemeriksaan; ini bukan bukti tes login real-time dengan perangkat. Login user yang gagal masih memerlukan pesan error, pemeriksaan Auth redirect URL, dan tes nyata di perangkat.

## Vercel aplikasi (belum diubah)

- `https://monopoli-nusantara-eight.vercel.app/build.json`: **4.10.0**.
- `GET /api/online?config=1`: **HTTP 200**, `online:true`, `onlineBots:false`, URL menunjuk ke project connectify.
- Artinya, Supabase backend telah dideploy, tetapi **frontend 4.10.1 belum terpasang** di Vercel dan penambahan bot online masih disembunyikan/diblokir oleh ENV.
- Lakukan deploy frontend 4.10.1 dari ZIP ini, lalu uji login, room 2 manusia, bot, disconnect/reconnect, pause/resume. Setelah E2E sukses, atur `MN_ONLINE_BOTS_ENABLED=true` pada Vercel lalu **redeploy**. Jangan mengaktifkan flag tanpa uji live multiuser.

## Keamanan

Jangan menampilkan kolom `vault.decrypted_secrets.decrypted_secret`, header pekerja, service-role key, atau auth tokens. Jangan mengirim secret ke browser, file `.env` publik, repositori, ataupun laporan build. Alternatif Vault-only ini dipasang agar deployment Edge Function dan worker dapat dilakukan tanpa menyalin secret secara manual; gunakan keamanan jaringan Supabase dan akses `service_role` yang sudah diatur.
