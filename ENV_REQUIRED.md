# ENV yang perlu dipasang di Vercel

Untuk **VS Bot lokal**, tidak ada ENV wajib.

Untuk **Main Online**, isi tiga nilai ini pada Vercel → Project → Settings → Environment Variables:

| Nama | Nilai / sumber |
| --- | --- |
| `SUPABASE_URL` | `https://ymunfgclqfdqaczluqti.supabase.co` — proyek connectify |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key proyek connectify, biasanya diawali `sb_publishable_` |
| `SUPABASE_SECRET_KEY` | Secret key proyek connectify, biasanya diawali `sb_secret_`; khusus server |

Key terdapat pada Supabase → Settings → API Keys. Jangan memakai key dari proyek novel champagne. Secret key tidak boleh memiliki awalan ENV `NEXT_PUBLIC_` atau dimasukkan ke frontend.

Jika integrasi Vercel sudah membuat `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, keduanya otomatis didukung. Nama lama `SUPABASE_ANON_KEY` serta `SUPABASE_SERVICE_ROLE_KEY` juga tetap didukung sebagai pengganti pasangan key baru. Tidak perlu mengisi semua alias sekaligus.

Sesudah mengubah ENV, **redeploy** agar function memakai nilai baru. Pilih environment Production/Preview yang sesuai dengan URL yang akan dites.

## Cara cek

1. Build Vercel: Framework **Other**, Node **24.x**, perintah `npm run build:vercel`, output `dist`.
2. Build juga menghasilkan `server-dist` privat; `api/index.mjs` memakai output native ESM itu. Jangan mengunggah hanya folder dist sebagai deployment statis.
3. Buka `https://<domain>/api/online?config=1`: harus JSON, bukan halaman error 500. `online:true` menandakan konfigurasi lengkap; belum membuktikan login dan transaksi database berhasil.
4. Jika JSON menunjukkan `online:false`, periksa daftar `configuration.missing` / `configuration.invalid` tanpa menyalin key ke laporan.
5. Jika masih `FUNCTION_INVOCATION_FAILED`, lihat Vercel Function Logs dan pastikan source API beserta hasil build privat ikut deployment. Hal ini berbeda dari ENV yang belum lengkap.
6. Supabase Auth → URL Configuration: tambahkan origin Vercel aplikasi ke Site URL / Redirect URLs. Anonymous sign-in perlu aktif untuk Main sebagai tamu.
7. Setelah masuk, tes buat room, gabung dari perangkat/akun kedua, siap, mulai, refresh dan reconnect.

**SQL:** tiga migrasi mn_* sudah diterapkan di connectify pada update 4.8.3. Update UI/bot 4.9 ini tidak memerlukan SQL baru. Jangan menjalankan ulang CREATE TABLE yang sudah ada. Room legacy mp_rooms tidak dihapus.

## Opsional

- `GROQ_API_KEY`: hanya untuk advisor online opsional.
- `GROQ_MODEL=openai/gpt-oss-20b`.
- `GROQ_DAILY_BUDGET=100`, `GROQ_TIMEOUT_MS=6500`.
- `MN_ONLINE_BOTS_ENABLED=false`: pertahankan false sampai worker/scheduler bot backend sudah divalidasi. VS Bot lokal tetap berfungsi.

**Redis/Upstash tidak diperlukan dan sudah dilepas dari runtime Node/Vercel aktif.** Tidak perlu mengisi UPSTASH, KV_REST, ROOM_NAMESPACE, atau ROOM_TTL_SECONDS. Adapter lama hanya tersimpan di baseline laboratorium, tidak dimuat API aktif. Update ini tidak menghapus database Redis eksternal atau room lama.


## Pembaruan 4.10.1 — bot online

**Belum aktif secara otomatis:** deploy Edge Function, konfigurasi Vault, pg_net/pg_cron, dan verifikasi worker wajib sebelum `MN_ONLINE_BOTS_ENABLED=true`. Perintah dan hasil audit: [docs/RELEASE_4101.md](docs/RELEASE_4101.md).
