# Monopoli Nusantara v4.10.2 — Compact Pause & My Profile

## Perubahan
- Avatar dalam daftar anggota room dikunci 1:1 (sprite atlas tetap tanpa distorsi), termasuk mode compact.
- Notifikasi permainan dijeda menjadi strip satu baris setinggi sekitar 36px; ikon tidak lagi mengambil ruang teks.
- Status ringkas menampilkan jumlah pemain manusia aktif yang siap lanjut. Detail voting tetap tersedia di popup room.
- Profil Saya di menu permainan, Pengaturan, dan tombol Ubah nama pada profil pemain sendiri dapat menyimpan nama manusia yang dimasukkan secara eksplisit (2–24 karakter).
- Nama awal kosong jika belum pernah disimpan di perangkat; tombol Mulai VS Bot dan Buat/Gabung Room meminta nama terlebih dulu.
- Nama pemain online dapat diubah saat waiting, playing, paused, finished; server menegakkan kepemilikan kursi dan mengirim pembaruan melalui revisi room. Nama pada state permainan mengikuti nama kursi tanpa mengubah versi ekonomi.
- Nama VS Bot dapat diubah dari Profil Saya dan disimpan pada state lokal.

## Penyimpanan dan dampak
- Preferensi nama di `localStorage` melalui `nusantara-player-name`; bukan identitas akun Supabase. Setiap perangkat baru yang belum punya nama meminta input manual.
- Peserta room lama yang memakai nama lama tetap tampil seperti tersimpan sampai menggantinya melalui Profil Saya.
- `RENAME` memakai endpoint multiplayer yang sama dan autentikasi Supabase. Tidak memerlukan SQL migration maupun perubahan Supabase Edge Function.
- Deployment membutuhkan build frontend dan backend terbaru bersama-sama karena `RENAME` harus didukung server.
- Jangan menjalankan ulang migration atau menghapus data room.

## Verifikasi lokal
- `npm run build:vercel` — lulus.
- `npm run typecheck` — lulus.
- `node --experimental-strip-types --import ./adapters/node/aliases.mjs scripts/test-headless.mjs` — 472/472 tes lulus (Node 22).
- `npm run check:source` — 425 modul diperiksa tanpa kegagalan.
- Validasi browser visual nyata belum dapat dijalankan dari lingkungan ini; audit breakpoint/CSS dilakukan statis.

## Petunjuk deployment
1. Ganti source lengkap atau masukkan file-file dari patch ke branch `main`.
2. Push ke GitHub agar proyek Vercel `monopoli-nusantara` rebuild.
3. Pastikan commit baru berstatus READY.
4. Refresh browser dan periksa popup Profil Saya serta jeda online 2–6 manusia.
5. Jangan paksa perubahan nama pada room orang lain: operasi backend memakai user yang terautentikasi.
