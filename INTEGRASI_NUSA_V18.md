# NUSA V18 dan fondasi bot bersama — working tree

Perubahan ini melanjutkan update UI lobi/lelang, nama model kapital, simbol ₦, dan aturan pembuka/kenaikan lelang minimal ₦5. Versi aplikasi belum dinaikkan dan tidak ada deployment eksternal. Sesuai klarifikasi terakhir, `Monopoli_Nusantara_Game_Logic.zip` berisi engine aturan saja, tanpa model atau planner bot. Paket tersebut memisahkan hook memori strategi, membuang pemilih aksi bot, dan menerima label controller baru; source aplikasi terintegrasi tetap memakai enam persona. ZIP aplikasi penuh belum dibuat.

## Model NUSA

- Source dari file generator V18 yang diberikan pengguna; model aktif `18.0.0`, terdiri dari 38 pakar.
- Lima berkas model disimpan pada `lab/nusa-v7/` dan `lib/bot/nusa-v7/`. Nama folder lama dipertahankan agar import dan save tetap kompatibel.
- Generator asli disimpan tanpa perubahan di `docs/imports/nusa-v18-generator.original.txt`. Generator tersebut memiliki template literal dengan backtick yang tidak di-escape dan gagal dijalankan. Importer mengambil isi lima template sebagai source, tanpa mengeksekusi generator, menulis ulang engine, atau menjalankan turnamen bawaannya.
- Reproduksi: `node scripts/import-nusa-v18.mjs docs/imports/nusa-v18-generator.original.txt`.
- Empat penyesuaian integrasi: perbaikan ekstraksi generator, penggunaan `auctionMinimum()` sesuai aturan ₦5, mengambil 80 log terbaru untuk sandbox (`slice(0,80)`), dan menghormati sisa budget pencarian yang diberikan runtime.
- Bobot pakar dan kebijakan metagame V18 lainnya berasal dari file pengguna. Artefak learned tambahan tetap nonaktif, tanpa training baru.
- `NUSA_V18_IMPORTED_HASHES.json` mencatat SHA-256 generator asli dan hasil impor. Hash V17 adalah riwayat sumber lama, bukan checksum source aktif.

## Fondasi bersama

- `foundation.mjs`: konteks per keputusan, cache terbatas maksimum 2048 entri, waktu per tahap, penghitung validasi/cache, dan budget/AbortSignal kooperatif. Fungsi dan WeakMap tidak ikut dikirim ke worker; hanya diagnostik biasa yang diserialisasi.
- Analisis, valuasi portofolio/properti, estimasi kompetisi lelang, dan validasi/transisi kandidat menggunakan kembali hasil selama satu keputusan. Tidak ada cache analisis ekonomi lintas pertandingan/revisi. Snapshot transisi yang di-cache hanya dibaca oleh planner.
- `probability.mjs`: perkiraan sewa utilitas biasa memakai distribusi nilai dadu yang menyebabkan pendaratan. Instruksi kartu yang meminta lemparan baru memakai mean tujuh dari lemparan independen. API forecast lama tetap tersedia.
- Pembangunan dan negosiasi opsional dapat berhenti ketika budget habis. Penyelamatan utang tetap membentuk jalur legal sebelum optimisasi dihentikan. Langkah pertama penyelamatan dipertahankan walaupun daftar kandidat sebelumnya dibatasi.
- Router memakai sisa budget setelah planner dasar; fallback worker tidak mengulang pencarian model berat pada main thread. Label diagnostik ARKA dan KRESNA mengacu ke kebijakan masing-masing, bukan diberi label NUSA.
- `EconomicPlan` dan `FoundationDiagnostics` ditambahkan pada kontrak TypeScript tanpa mengubah format command/save.
- Aturan game `lib/game.mjs`, `lib/content.mjs`, parameter persona, serta source strategi ARKA/KRESNA sama dengan snapshot sebelum upgrade ini. Keputusan model lain bisa berubah karena mendapat perhitungan dasar yang lebih tepat.
- Budget bersifat kooperatif. Analisis sinkron dan jalur keselamatan wajib dapat melampaui permintaan waktu; watchdog worker tetap mekanisme penghentian keras. Ini bukan klaim hard real-time atau performa Android.

## Verifikasi dan batasnya

- Tes fungsi mencakup cache valid/invalid lintas revisi/request, limit cache, serialisasi, nilai dadu utilitas, utang yang memerlukan banyak gadai, 2/4/6 kursi untuk seluruh persona, pembatalan, dan checksum source yang dipertahankan.
- Uji V18: 38 pakar, barter pada fase beli dan kembali ke properti yang sama setelah penerimaan, pendeteksian bridge lawan, arah COUNTER, serta perpindahan kartu bebas penjara tanpa kas tambahan.
- Uji worker online memakai store memori, termasuk NUSA yang membeli properti melalui antrean job dan commit satu kali. Bukan pengujian Supabase live.
- `docs/BOT_FOUNDATION_BROWSER_RESULTS.json`: 8 skenario worker browser dan aplikasi nyata; termasuk cancel/restart serta commit pembelian NUSA sekali.
- `docs/AUCTION_BROWSER_RESULTS.json`: 21 skenario regresi lelang, termasuk update bot tanpa menghapus input atau menggeser panel.
- `docs/BOT_FOUNDATION_PROFILE.json`: perbandingan planner sebelum/sesudah pada 18 fixture dengan 15 pengulangan dan 30 pemeriksaan melalui router persona sesungguhnya. Hasil mencakup kasus yang lebih cepat maupun lebih lambat; tidak menjadi klaim semua keputusan lebih cepat atau win rate meningkat.
- `docs/NUSA_V18_ARENA.json`: arena integrasi 2/4/6 pemain. Pemenang hanya dicatat ketika engine benar-benar selesai. Pertandingan yang mencapai batas tetap ditandai belum selesai, tanpa pemenang berdasarkan kekayaan.
- Baseline sebelum perubahan tersedia di `benchmarks/pre-foundation-v18/lib/`, memakai aturan ₦5 yang sama. Build publik tetap hanya mengambil source aktif.

Perintah: `npm test`, `npm run typecheck`, `npm run check:source`, `npm run benchmark:foundation`, `npm run benchmark:personas`, dan `MN_CHROMIUM_PATH=/usr/bin/chromium npm run test:foundation:browser` pada lingkungan ini.
