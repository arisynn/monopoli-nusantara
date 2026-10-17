> Arsip konfigurasi rilis sebelumnya. Untuk 4.9.0 ikuti [ENV_REQUIRED.md](../ENV_REQUIRED.md): native ESM Vercel, key modern/alias didukung, Redis tidak dipakai runtime aktif.

> Panduan historis. Untuk perintah build/runtime dan status database terbaru gunakan [DEPLOY_483.md](DEPLOY_483.md).

> Bot online memerlukan migration 002 dan scheduler backend; ikuti [DEPLOY_HYBRID.md](DEPLOY_HYBRID.md). Panduan ini tetap menjadi fondasi room/Auth manusia.

# Deployment Online Multiplayer dengan Supabase

Kode lokal tersedia; panduan ini bukan bukti deployment berhasil. Gunakan staging terlebih dahulu. Jangan menerapkan SQL pada proyek yang belum dipastikan identitas dan skemanya.

1. Audit proyek Supabase target: tabel, constraints/indexes, grants/RLS, Auth, publication, RPC, dan migration history. Source awal hanya memiliki D1/Redis, tetapi struktur remote Supabase belum diketahui. Jika objek `mn_*` telah ada, hentikan dan sesuaikan migration sesudah review; jangan drop tabel atau menimpa data.
2. Siapkan backup dan environment staging. Review lalu terapkan `supabase/migrations/202610160001_persistent_online.sql` menggunakan Supabase SQL Editor atau CLI resmi yang sudah terautentikasi. SQL bersifat transactional/aditif; publication `supabase_realtime` harus tersedia. Tidak ada perintah penghapusan room/data existing.
3. Pada Supabase Auth aktifkan email/password; tetapkan konfirmasi email dan Site URL/allowed redirect URL sesuai origin aplikasi. Aktifkan anonymous sign-in jika pilihan tamu akan digunakan. Atur rate limits/provider SMTP yang sesuai. Jangan mengaktifkan CAPTCHA wajib untuk guest sebelum client memiliki widget/token challenge yang sesuai.
4. Isi **runtime server**, bukan source/client, dengan `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` melalui secret manager hosting. Jangan gunakan prefiks `NEXT_PUBLIC_` pada secret. Endpoint config hanya mengekspos URL dan anon/public key. Browser harus dapat mengakses HTTPS Auth dan WSS/HTTPS Supabase; server harus dapat mengakses Auth/PostgREST.
5. Biarkan binding D1/variabel Redis lama tersedia jika masih ada pertandingan existing. Jangan set `ALLOW_LEGACY_ROOM_CREATION` pada production; flag itu hanya untuk tes/pekerjaan kompatibilitas yang disengaja. Kode room Supabase baru delapan karakter; room lama enam karakter dilanjutkan dengan sesi/token lama, bukan JOIN ke database baru.
6. Setelah dependency environment tersedia (Node 24, package manager sesuai `package.json`), jalankan:

   ```bash
   pnpm install --frozen-lockfile
   npm run test:core
   npm test
   pnpm exec tsc --noEmit
   npm run build:vercel
   ```

   Untuk Sites/Cloudflare, gunakan workflow build/deploy Sites existing dan `pnpm build`; pertahankan manifest project/audience dan binding yang masih diperlukan. Jangan mempublikasikan hanya berdasarkan tes Node atau status config.

7. Jalankan tes live **hanya pada staging terisolasi** dengan environment server Supabase staging dan `MN_ALLOW_LIVE_TESTS=staging`:

   ```bash
   npm run test:supabase
   ```

   Script membutuhkan tujuh identitas Auth (enam peserta + satu outsider). Bila `MN_TEST_ACCESS_TOKENS` tidak disediakan melalui environment secret, script mencoba membuat tujuh guest dan perlu anonymous Auth/rate limits staging yang memadai. Variabel opsional tersebut adalah JSON array access tokens; jangan taruh nilainya pada chat, source atau log. Script membuat room QA persisten baru dan tidak menghapus data. Lakukan pada proyek staging agar produksi tidak diisi fixture. Test menjalankan service dengan adapter database nyata; route deployed dan UX tetap perlu QA terpisah.

8. Verifikasi role `authenticated` tidak dapat membaca/mengubah `mn_rooms`/`mn_commands` atau mengeksekusi RPC commit. Hanya `mn_members` milik sendiri dan `mn_room_updates` pada room sendiri dapat dibaca. Pastikan hanya `mn_room_updates` ditambahkan ke Realtime publication dari tabel baru. Periksa log error target; jangan menyalin secret ke laporan.
9. Jalankan checklist pada laporan implementasi, termasuk dua perangkat akun tertaut, semua-browser-offline, replay/concurrent actions, dan jeda pada lelang/barter/utang/kartu. Pastikan jumlah tes penuh, TypeScript dan build lulus sebelum promosi.
10. Setelah hasil staging dan backup produksi ditinjau, terapkan migration non-destruktif serta server/frontend versi sama pada target yang benar. Pertahankan data dan backend lama untuk pertandingan yang belum dimigrasikan. Pada Site existing, audience saat audit masih terbatas ke pemilik; undang teman/ubah akses secara eksplisit sesuai keputusan pemilik setelah validasi.

Room Supabase tidak kedaluwarsa karena semua pemain offline. Untuk room hanya manusia, tidak ada scheduler yang wajib hidup: reconciler pada read/list/command/heartbeat memproses auto-pause yang terlewat sebelum menerima koneksi baru. Jika pematerialan status tepat waktu saat tidak ada akses diperlukan, tambahkan scheduler server yang menggunakan rekonsiliasi dan transaksi yang sama; jangan menjadikan satu browser sebagai scheduler.

Saat rollback frontend/backend, jangan menjalankan DROP pada tabel baru. Snapshot schema v1 membungkus engine schema v2; pertahankan server yang dapat membacanya sampai migrasi data ditinjau. `SOURCE_SNAPSHOT.json` bawaan ZIP adalah manifest rilis asal; gunakan paket/diff pembaruan dan hasil QA baru sebagai acuan perubahan ini.
