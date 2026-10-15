# Monopoli Nusantara v2.6 — Kelola Aset & Barter

Pembaruan terfokus berdasarkan v2.5. **Tidak mengubah tema navy/emas, tampilan papan 2D, animasi pion/dadu, backend, algoritma dadu, ataupun aturan permainan.**

## Kelola Aset
- Tab Aset memakai daftar ringkas dengan pencarian nama, filter Semua, Bisa bangun, Digadai, Set lengkap.
- Menampilkan status bangunan setiap kota, kekayaan pemilik, dan stok bank.
- Jika sah menurut `managementError` dan dapat dilakukan saat ini, Bangun / Tebus ditampilkan sebagai aksi cepat.
- Aksi lain (Jual, Jual semua bangunan set, Gadai) tetap tersedia di detail kota agar tidak mudah tertekan tanpa sengaja.
- Properti pemain lain dapat dilihat, tetapi hanya pemilik yang diizinkan engine dapat bertindak.
- Alasan aksi tak tersedia ditampilkan pada detail kota, bukan hanya sebagai tooltip desktop.

## Barter
- Alur empat langkah: Pilih lawan → Aset kamu → Aset lawan → Konfirmasi.
- Daftar properti dapat dicari, dipilih lebih dari satu, dan difilter secara otomatis untuk menolak kelompok dengan bangunan.
- Uang dan kartu bebas penjara tetap didukung pada kedua sisi pertukaran.
- Ringkasan menampilkan apa yang masing-masing pemain berikan sebelum Ajukan Barter.
- Tawaran balik menggunakan langkah aset dan ringkasan yang sama, dengan pihak lawan terkunci sesuai aturan engine.
- Navigasi Kembali tidak menghapus pilihan. Tombol ajukan nonaktif jika tak ada isi atau dana/kartu tidak mencukupi.
- Validasi sesungguhnya tetap dilakukan engine `lib/game.mjs` dan, di mode room, server.

## Implementasi
- Baru: `components/game/AssetManager.tsx`, `TradeWizard.tsx`, `TradeReview.tsx`.
- Integrasi hanya di `components/game/Game.tsx` dan CSS terisolasi di `app/globals.css`.
- Tidak ada dependency npm baru. Tidak ada gambar baru. Cache PWA diubah menjadi v26.

## Pengujian & batasan
- 86 tes Node otomatis lolos pada suite yang dapat dijalankan tanpa dependensi frontend, termasuk tes baru `tests/asset-trade-v26.test.mjs`.
- Sintaks keempat komponen TSX yang terkait diperiksa menggunakan parser TypeScript.
- Tes yang membutuhkan React atau package build tidak tersedia di lingkungan ini. Build Vercel, pemeriksaan TypeScript penuh, interaksi sentuh di browser, dan room online perlu diverifikasi setelah memasang dependensi.
- Lakukan uji end-to-end sebelum mengganti versi produksi. Contoh alur: punya 1 dari 2 kota warna → Bangun belum tersedia; lengkapi warna → Bangun; gadai & tebus; barter properti/uang/kartu; tawaran balik; mode HP kecil; room online.
