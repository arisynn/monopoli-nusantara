# Monopoli Nusantara 4.10.1 — Multiplayer & Result UI Fix

## Yang diperbaiki

- Popup **Hasil Akhir**: avatar sprite tidak lagi ikut `display:flex;flex:1` dari selector global `result-row > span`. Avatar selalu berbentuk persegi dengan area identitas dan nominal Nusa sendiri, ada layout khusus untuk viewport sempit dan mode compact. Tampilan kartu emas juara tidak berubah.
- Label pemain yang telah bangkrut tampil jelas. Nominal memakai kekayaan akhir dari engine `worth`, tidak dihitung ulang dengan aturan baru.
- Bot online: jika advisor Groq gagal/timeout atau memberi aksi yang tidak sah, worker kembali memakai perencana NUSA MIND lokal, tanpa menulis revisi aksi ilegal. Penyelesaian tetap lewat `BOT_ACTION` dengan lease/versi database yang dipagari.
- `npm run prepare:edge` menyalin snapshot dependensi dari `/lib` ke `supabase/functions/monopoli-bots/_shared/lib`, sehingga Edge Function siap dibundel tanpa import relatif melintasi akar fungsi. Jangan edit salinannya; jalankan lagi sebelum deploy.
- Tes regresi baru untuk fallback bot dan tampilan hasil akhir 6 pemain.

## Hasil diagnosis proyek Supabase connectify (cek read-only, 17 Oktober 2026)

- Proyek: `ymunfgclqfdqaczluqti` (`connectify`), `ACTIVE_HEALTHY`.
- Tiga migrasi online `mn_persistent_online`, `mn_hybrid_bot_jobs`, `mn_nusa_mind_settings` terdaftar.
- Edge Functions terpasang: **0**. Function `monopoli-bots` **belum** aktif di server.
- Ekstensi terpasang yang relevan: `supabase_vault`; `pg_net` dan `pg_cron` **tidak** ditemukan.
- Akibatnya, fitur bot online **belum berfungsi di produksi**. Perbaikan source tidak otomatis mengaktifkan runtime Supabase.

## Langkah deploy aman (manual, berurutan)

1. Backup project dan uji pada staging jika tersedia. Tetap gunakan `MN_ONLINE_BOTS_ENABLED=false` di Vercel hingga alur lengkap lolos QA. **Jangan jalankan ulang tiga migrasi yang telah ada.**
2. Jalankan `npm run prepare:edge` dari root project. Pastikan `supabase/functions/monopoli-bots/_shared/lib` terisi. Login Supabase CLI lalu `supabase link --project-ref ymunfgclqfdqaczluqti`, dan `supabase functions deploy monopoli-bots --no-verify-jwt`. Function memakai rahasia `X-MN-Worker-Secret` diverifikasi SHA-256 constant-time; tidak menerima aksi dari browser tanpa secret. Jangan menaruh secret di repo.
3. Set `MN_BOT_WORKER_SECRET` (nilai acak minimal 32 karakter) di **Supabase Edge Function Secrets**. `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` biasanya disediakan oleh runtime Supabase; pastikan tersedia. Jika akan memakai Groq opsional, set secret GROQ_API_KEY dan anggarannya; tanpa Groq, bot tetap menggunakan AI lokal.
4. Aktifkan `pg_net` dan `pg_cron` pada Supabase Dashboard → Database → Extensions. Simpan dua rahasia Supabase Vault melalui tooling aman: `mn_bot_worker_url` = `https://ymunfgclqfdqaczluqti.supabase.co/functions/v1/monopoli-bots`, `mn_bot_worker_secret` = nilai yang sama dengan `MN_BOT_WORKER_SECRET` di Edge Functions. **Jangan tulis secret nyata dalam file SQL.**
5. Sesudah semua prasyarat ada, jalankan `supabase/bot_worker_activate.sql` melalui SQL Editor pada project yang BENAR. Script memasang ekstensi yang belum ada, memverifikasi Vault, dan mengaktifkan cron tiap menit untuk memulihkan panggilan/lease yang hilang.
6. Uji POST endpoint Edge Function **tanpa** header worker dan pastikan HTTP 401; lalu uji dengan header rahasia dan cek JSON `{claimed,committed,discarded}` tanpa membocorkan secret. Bila belum ada job, `claimed:0` wajar.
7. Buat room uji terpisah (2 manusia + 1 bot), siap lalu START; tes bot mendapat giliran, lelang, barter, reconnect, pause/resume dan 6 pemain. Cek `mn_bot_jobs` dan `mn_bot_actions` tanpa menampilkan data autentikasi. Jika sudah stabil, set `MN_ONLINE_BOTS_ENABLED=true` pada Vercel Production dan redeploy. Toggle ini hanya menampilkan penambahan bot; runtime terpisah wajib hidup lebih dahulu.

## Query audit aman (read-only)

```sql
select code,status,state_version,attempts,last_error,updated_at
from public.mn_bot_jobs order by updated_at desc limit 20;
select jobname,schedule,active from cron.job where jobname='mn-bot-recovery';
select name from vault.decrypted_secrets where name in ('mn_bot_worker_url','mn_bot_worker_secret');
```

Jangan menampilkan kolom `decrypted_secret`, token, cookie sesi, ataupun seluruh isi `mn_rooms.data` pada laporan/log publik.

## Batas verifikasi

Pengujian Node headless tidak menggantikan pemeriksaan browser Android yang sesungguhnya, koneksi Supabase Auth/Realtime, pg_net HTTP, dan worker yang telah ter-deploy. Tidak ada perubahan database atau pengaktifan ENV produksi otomatis dalam rilis ZIP ini. Aturan ekonomi, komposisi 2–6 pemain (minimal dua manusia saat online), voting jeda, batas disconnect 90 detik, dan algoritma inti NUSA MIND tetap dipertahankan.
