# Integrasi NUSA V23 — Chronos & Kairos

NUSA aktif memakai versi `23.0.0`, label router `NUSA-V23.0-CHRONOS-KAIROS`, dan algoritma diagnostik `chronos-kairos-v23.0`. Source tetap berada di `lib/bot/nusa-v7/` agar pemanggil sebelumnya kompatibel. Versi aplikasi tetap 4.11.0; aturan engine tidak diubah oleh strategi ini.

Pembaruan ini menerapkan target khusus NUSA dari lampiran V22 dan rencana V23. Dokumen ini tidak menyatakan seluruh rencana peningkatan fondasi bersama enam persona di `docs/BOT_FOUNDATION_PLAN.md` sudah dilaksanakan atau bahwa cakupan gameplay 100% sudah terbukti.

## Sumber dan jumlah pakar

Sumber generator V22 tersimpan utuh di `docs/imports/nusa-v22-generator.original.txt`. `scripts/import-nusa-v22.mjs` hanya membaca enam template modul melalui AST TypeScript sebagai data; generator, penulisan ulang infrastruktur, dan turnamen bawaan lampiran tidak dijalankan. SHA-256 sumber dan hasil impor tahap V22 tercatat di `NUSA_V22_IMPORTED_HASHES.json`.

V22 merupakan pembentukan ulang council: **28 pakar**, dengan 22 ID dipertahankan, 28 ID dilepas, dan enam ID ditambahkan dibanding 50 pakar V21. Kelengkapan V22 tidak diukur dengan mempertahankan seluruh ID V21. Lima pakar temporal V23 menambah jumlah menjadi **33 pakar**.

Rencana V23 asli diarsipkan tanpa perubahan di [docs/imports/nusa-v23-plan.original.md](docs/imports/nusa-v23-plan.original.md). V23 adalah implementasi lanjutan di atas hasil impor V22, bukan generator JavaScript baru dalam lampiran. Menjalankan importer V22 kembali akan mengembalikan enam modul ke tahap V22 dan menimpa perubahan V23 pada modul tersebut; gunakan hanya untuk merekonstruksi tahap impor dasar.

## Lima pilar V23

1. **Arus kas dan waktu menuju kesulitan kas.** Estimasi pemasukan, gaji, dan paparan sewa membentuk cashflow drift serta ETTR (*estimated time to ruin*). Council memakai `ATTRITION_LOCKDOWN`, `TEMPO_BREAKER`, atau `APEX_EXECUTIONER` untuk menyesuaikan nilai kandidat, batas harga, dan prioritas pembangunan sesuai posisi saat ini.
2. **Urutan pemain dan inisiatif.** Jarak kursi melewati pemain yang sudah keluar; posisi pemain dan kemungkinan pendaratan membantu menilai urgensi monopoli, pertukaran, dan intersepsi. Risiko pembangunan segera oleh lawan tetap harus diperhitungkan menurut legalitas engine aktual.
3. **Kelanjutan broker dua langkah.** Sesudah keadaan berubah karena transaksi, NUSA mengevaluasi ulang kepemilikan umpan dan peluang langkah kedua. Kelanjutan membutuhkan pasangan, kepemilikan, kas, batas negosiasi, dan fase yang masih sah. Keberhasilan langkah pertama tidak menjamin penerimaan langkah kedua. Langkah engine tetap dikirim satu per satu.
4. **Likuidasi modal aset kurang produktif.** Penjualan aset terpisah dapat menjadi sumber kas pembangunan atau akuisisi. Nilainya memperhitungkan fungsi blokir dan umpan broker, kepentingan pembeli, biaya aset tergadai, serta penerimaan transaksi. Target harga 100–135% dari lampiran adalah ruang pencarian bersyarat; bukan jaminan ada lawan yang mau membeli.
5. **Inspeksi sebelum mengakhiri giliran.** NUSA mempertimbangkan pemain berikutnya, kemungkinan pendaratan, dan kesempatan menebus/membangun sebelum `END`. Pembangunan tetap mengikuti aturan kelompok lengkap, gadai, pembangunan merata, stok bank, kas tersedia, dan kemungkinan interupsi lelang bangunan.

Router meneruskan `selected.temporalTelemetry` ke `diagnostics.temporalTelemetry` dan menampilkan `diagnostics.macroPosture`. Jika strategi temporal tidak sempat berjalan, nilainya boleh `null`; aksi dasar tetap tersedia. Identitas versi juga diperbarui pada komentar worker lokal serta ekspektasi kontrak browser/online.

## Koreksi asumsi lampiran terhadap engine

Pilar 2 lampiran mengatakan bangunan hanya boleh dibangun pada giliran sendiri dan pemain harus melempar sebelum sempat membangun. Asumsi tersebut **tidak sesuai engine saat ini**. `canManage()` di `lib/game.mjs` mengizinkan pengelolaan aset pada fase `roll`, `end`, `jail`, `buy`, `card`, `auction`, dan `debt`, termasuk di luar giliran; pembatasan tambahan berlaku sesuai aksi. Dalam fase utang hanya pihak berutang dapat mengelola aset, dengan aksi penyelamatan yang dibatasi. Pemesanan `BUILD` tidak diperbolehkan selama lelang.

Pemain dapat membangun **sebelum `ROLL`**, dan dapat membangun di luar giliran pada fase yang mengizinkannya. Karena itu, jarak kursi tidak boleh dipakai sebagai jaminan lawan belum dapat membangun. Nilai inisiatif adalah manfaat waktu dan paparan pion yang diperkirakan, dengan kemampuan membangun lawan dihitung secara konservatif.

Angka `roundTradeCount < 3`, ambang desire, bonus kandidat, rentang jarak, dan target tiga rumah dalam lampiran merupakan kebijakan strategi. Mereka tidak menambah batas atau hak baru pada aturan game. Pemeriksaan legalitas akhir tetap memakai engine aktual.

## Kompatibilitas, pemeriksaan, dan batas hasil

Impor mempertahankan `auctionMinimum()` dan increment bersama, 80 log simulasi terbaru, budget tanpa minimum waktu paksa, dan penghentian kooperatif melalui decision context. Router mempertahankan validasi aksi, fondasi cadangan, guard negosiasi, serta pembatalan dan pemeriksaan identitas respons worker.

Keenam template V22 dan perubahan metadata router/client lolos pemeriksaan sintaks. Pemeriksaan integrasi terarah V23: 71/71 lolos dalam kurang dari satu detik. Build, TypeScript, dan validasi 566 modul source/output lolos; 53 modul Edge cocok dengan source lokal. Satu flash game yang sempat berjalan sudah berakhir pada batas 600 aksi, dengan nol keluaran ilegal dan nol penolakan engine; game belum mencapai pemenang. Tidak ada pertandingan lanjutan sesuai permintaan pengguna. Hasil suite/benchmark V21 dalam dokumen lama merupakan arsip. Tidak ada turnamen atau suite penuh yang dijalankan sebagai bagian impor ini.

Cashflow drift, ETTR, probabilitas pendaratan, prediksi penerimaan lawan, dan `winProbability` merupakan **estimasi heuristik**. Acak dadu/kartu, keputusan lawan, perpindahan aset, penjara, stok, dan utang dapat mengubah hasil. ETTR bukan tenggat kebangkrutan pasti; drift positif bukan bukti pasti menang. Satu flash game hanya memeriksa model berjalan dan aksi legal pada lintasan yang dicapai, bukan kekuatan bermain atau seluruh kemungkinan gameplay.
