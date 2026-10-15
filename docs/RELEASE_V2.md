# Monopoli Nusantara v2 — Illustrated Classic

## Yang berubah

- Empat aset gambar generatif orisinal: diorama Nusantara, atlas empat pion, delapan ilustrasi kawasan, dan dua ilustrasi kartu. Dipakai pada beranda, tekstur papan, pion billboard, deck, sertifikat, dan daftar aset. Dua kursi tambahan memakai variasi warna pion; nomor dan nama tetap membedakan pemain.
- Mendukung 2–6 pemain, lempar awal, lelang terbuka, lelang bangunan langka, tagih sewa manual, pilihan penerimaan gadai, barter di luar giliran/saat utang/di sela lelang, dan dadu sewa utilitas tersendiri.
- Save lama memakai mesin v1. Aturan baru hanya untuk pertandingan baru.
- Source dan build modular disertakan. Source aset, prompt, rulepack, dan laporan verifikasi ada di paket.

## Lokasi aset

- `public/assets/nusantara-scene.webp`
- `public/assets/pawn-atlas.webp`
- `public/assets/region-atlas.webp`
- `public/assets/card-atlas.webp`

Dibuat memakai built-in `image_gen`; prompt lengkap ada di `ASSET_PROMPTS.json`. WebP adalah konversi format untuk pengiriman web, tanpa perubahan komposisi. Label, angka, keputusan, dan kepemilikan tetap berupa data game/HTML; bukan teks yang dibakar ke gambar.

## Batas

Lihat `RULEPACK.md` dan `QA.md`. Groq langsung memerlukan secret server; visual/sentuhan/performa perangkat nyata belum diuji. Tidak ada klaim semua sertifikat/kartu identik edisi fisik. Berkas ZIP ini adalah pembaruan v2; penerbitan web v1 tidak otomatis berubah oleh penerimaan ZIP.
