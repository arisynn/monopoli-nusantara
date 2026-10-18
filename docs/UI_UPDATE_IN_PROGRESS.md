# Pembaruan UI yang sedang dikerjakan

Status: perubahan lokal, belum menjadi rilis baru. Nomor versi belum dinaikkan dan ZIP baru belum dibuat.

## Perubahan

- Lobi: judul tunggal, badge mode, jarak dan ukuran kartu yang seragam, badge bot tanpa pengulangan nama, dan ringkasan kapasitas room aktual.
- Pengaturan lobi: pilihan 2–6 peserta mendapat baris sendiri agar tidak tertutup tombol Pilih Pion di layar kecil.
- Lelang: profil peserta dihapus; harga tertinggi dan nama pemegang tawaran menjadi fokus. Nama memakai seluruh lebar panel supaya terbaca pada layar 320 px.
- Pembaruan lelang mempertahankan node input dan panel. Angka/status diperbarui tanpa animasi, pergantian fokus, atau penimpaan nominal yang sedang diketik.
- Input tidak valid tetap terlihat, tombol Tawar dinonaktifkan, dan penjelasan memakai ruang tetap. Hasil dan pembayaran tetap mengikuti timeline engine.
- Tawaran awal minimal ₦ 5; setiap kenaikan minimal ₦ 5. Nominal tetap Nusa bulat, bukan wajib kelipatan lima: setelah ₦ 11 pada save lama, minimum berikutnya ₦ 16.
- Aturan bersumber dari `lib/content.mjs`, digunakan validator command, UI, bot dasar, ARKA/APEX, KRESNA, dan keluarga NUSA V17. Nilai uang internal tetap 10 unit per Nusa.
- Model tetap bernama NUSA. Nama persona lain menjadi RAKA, BIMA, SARI, ARKA, dan KRESNA. ID persona dan parameter strategi tidak diganti.
- Simbol mata uang game menjadi karakter ₦, termasuk papan, sertifikat, saldo, aturan, dan teks log baru. Teks mata uang N pada log save lama dinormalisasi saat ditampilkan tanpa mengubah nama NUSA atau nilai input.

## Output dan verifikasi

- `dist/` dan `server-dist/` dibangun ulang dari source.
- Salinan dependensi Edge worker disinkronkan memakai `npm run prepare:edge`; tidak ada deploy layanan eksternal.
- Sebelum perubahan: 484/484 tes inti lulus.
- Sesudah perubahan engine/UI: 486/486 tes inti lulus. Tes khusus service online juga menerima pembuka ₦ 5, menolak kenaikan ₦ 1, dan memeriksa pembayaran sekali.
- 18 pemeriksaan tambahan: seluruh enam persona menghasilkan bid/action legal, termasuk harga tertinggi dari save sebelum pembaruan.
- 21 skenario browser lelang lulus; termasuk pembaruan nyata dari worker bot yang mempertahankan input, fokus, node DOM, posisi panel, dan transisi hasil.
- 18 skenario lobi lulus: 2/4/6 pemain, nama panjang, lebar 320–1280 px, dan viewport pendek yang memerlukan scroll.
- `typecheck` lulus dan 452 modul source/output diverifikasi tanpa kegagalan.
- Browser memakai Chromium lokal. Service online diuji dengan store memori, bukan room Supabase live.

Screenshot berada di `docs/screenshots-ui-update/`. Manifest/hash impor V17 tetap merupakan catatan sumber awal, bukan checksum working tree yang sudah diperbarui ini. Save schema 1 tetap memakai engine historisnya.

## Kelanjutan update bot

Fondasi bersama dan NUSA V18 sudah ditambahkan sesudah update UI ini; lihat [INTEGRASI_NUSA_V18.md](../INTEGRASI_NUSA_V18.md). File frontend dan aturan ₦5 tetap sama selama pekerjaan bot. Permintaan terakhir hanya mengemas engine aturan sebagai `Monopoli_Nusantara_Game_Logic.zip`, tanpa model/planner bot atau frontend; ZIP aplikasi penuh tetap ditunda.
