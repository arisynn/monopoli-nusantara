# Integrasi NUSA V20

Arsip integrasi V20. Model aktif berikutnya: [NUSA V21](INTEGRASI_NUSA_V21.md). Hash di dokumen ini mencatat versi historis.

Pembaruan berikutnya: [pengamatan NUSA, barter bersama, kontrol Edge dan PWA](docs/EDGE_MEMORY_PWA.md). Importer V20 juga mereproduksi pemeriksaan budget kooperatif pada council, pakar, dan pencarian.

Model aktif sekarang `20.0.0` dengan 46 pakar, pada lima modul di `lib/bot/nusa-v7/`. Nama direktori dipertahankan agar pemanggil yang ada tetap kompatibel. Versi aplikasi tetap 4.11.0.

V20 adalah source lengkap, bukan patch yang harus dijalankan setelah V19. Perbandingan kedua lampiran memastikan seluruh 42 ID pakar V19 masih ada. Empat tambahannya adalah `povertyCloak`, `preTradeLeverage`, `binaryTradeSolver`, dan `velocitySwap`. SHA-256 kedua lampiran, daftar pakar V19, dan checksum lima modul hasil impor tercatat di `NUSA_V20_IMPORTED_HASHES.json`.

## Cara impor

```sh
node scripts/import-nusa.mjs /path/ke/v20.js /path/ke/v19.js
```

Importer `.mjs` membaca AST template literal sebagai data menggunakan TypeScript dari devDependencies. Ia tidak mengeksekusi generator. Lampiran V20 memiliki deklarasi template ganda sehingga tidak lolos `node --check` jika langsung dijalankan; importer mengambil definisi terakhir yang berisi V20. Kelima hasil ekstraksi diperiksa sintaksnya sebelum ditulis.

Generator asli juga mengganti router/client, menulis salinan lab dan benchmark, lalu otomatis menjalankan turnamen. Bagian tersebut tidak dijalankan. Tidak ada salinan model lab baru atau dependensi production baru.

## Penyesuaian runtime

- Import diarahkan ke source engine yang digunakan aplikasi.
- Lelang memakai `auctionMinimum()` dan kenaikan dari aturan bersama. Nominal save lama seperti 110 tetap menghasilkan minimum 160, tanpa dibulatkan ke tangga 50 yang berbeda.
- Simulasi mempertahankan 80 log terbaru karena log engine diurutkan terbaru lebih dahulu.
- Pencarian menghormati sisa waktu router, tanpa memaksakan minimum 1.800 ms saat budget habis. Batas node default V20 dipakai untuk pencarian taktis dan mendalam.
- Router dan worker yang ada tetap menangani pembatalan, respons usang, validasi aksi dengan engine, watchdog, dan fallback ringan. Algoritma lima persona lainnya dan aturan game tidak diganti.

Budget tetap kooperatif: penyusunan kandidat dan council sinkron bisa melampaui sisa waktu. Watchdog worker tetap menjadi mekanisme penghentian keras.

## Pemeriksaan

`tests/nusa-v20.test.mjs` memeriksa 46 pakar, kesinambungan 42 pakar V19, checksum hasil impor, lelang termasuk save lama, barter saling melengkapi monopoli, budget nol, barter saat pembelian, counteroffer, profil publik, dan transfer kartu penjara.

Pemeriksaan lain: suite regresi inti, build web/server, salinan Edge, TypeScript, graph import/sintaks, serta skenario worker browser termasuk cancel/restart dan pembelian di aplikasi. Hasil terbaru ada di `docs/CLASSIC_TEST_RESULTS.json`, `docs/CLASSIC_SYNTAX_IMPORTS.json`, dan `docs/BOT_FOUNDATION_BROWSER_RESULTS.json`.

Tidak ada benchmark, turnamen, training, atau deployment pada pembaruan ini. Nama “2x Power Multiplier” berasal dari lampiran; peningkatan win rate maupun kecepatan belum diukur. `learned-model.mjs` tetap tanpa bobot terlatih tambahan.

`INTEGRASI_NUSA_V18.md` dan `NUSA_V18_IMPORTED_HASHES.json` merupakan riwayat integrasi sebelumnya, bukan checksum model aktif.
