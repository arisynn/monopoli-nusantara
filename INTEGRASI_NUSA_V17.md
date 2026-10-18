> Riwayat integrasi V17. Source aktif working tree kini mengikuti [INTEGRASI_NUSA_V18.md](INTEGRASI_NUSA_V18.md).

# Monopoli Nusantara — NUSA V17 integration

- Game UI: popup daftar karakter 6 persona (1 kolom), tanpa kesulitan manual. Internal engine `botDifficulty` dipertahankan untuk kompatibilitas save/server; game baru mengirim `hardcore`.
- Model: seluruh `lib/bot` dan `lab/nusa-v7` diganti dari Nusa_v17.zip sesudah menjalankan generator yang diperbaiki. Checksum tiap model ada di `NUSA_V17_SOURCE_HASHES.json`.
- Aturan gameplay `lib/game.mjs` dan `lib/content.mjs` tidak diubah.
- Portrait: atlas asli dipecah menjadi 6 PNG persegi tanpa perubahan objek untuk mencegah distorsi.
- Tidak termasuk deployment ke Supabase/Vercel; periksa worker Edge terdeploy sebelum bermain online.
- Asal source game: v4.11.0 yang terakhir tersedia pada percakapan.

Catatan: bobot *learned* lama dinonaktifkan (`LEARNED_MODEL=null`) karena diverifikasi usang terhadap source baru; algoritma kebijakan dan V17 generator tidak diubah.
