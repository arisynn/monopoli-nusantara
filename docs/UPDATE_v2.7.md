# Monopoli Nusantara v2.7 — Audit, implementasi, dan QA

Tanggal: 15 Oktober 2026. Sumber: ZIP `Monopoli_Nusantara_v2.6_Simple_Assets_Barter.zip` dari pengguna. Empat mockup digunakan untuk arah minimalis, hierarki, dan navigasi; susunan papan, kota, nilai, dan data tetap berasal dari proyek.

## Audit sebelum implementasi

| Temuan v2.6 | Keputusan v2.7 |
| --- | --- |
| Beranda didominasi hero, ilustrasi, tagline, dan tombol pembuka sebelum pilihan mode pada ponsel. | Tampilkan Main lokal, Lawan bot/AI, dan Room online langsung. Form setup yang ada dibuka setelah memilih mode. Tidak menambah mode Main Cepat atau menu yang belum tersedia. |
| Papan SVG dan kamera sudah mendukung overview, follow, geser, pinch, serta 40 petak dengan benar. | Pertahankan source papan/kamera seluruhnya. Kontrol tetap berada di luar papan. |
| HUD memakai gambar avatar dan beberapa baris pada 5–6 pemain. | Nomor/warna pion memakai CSS; daftar pemain satu baris yang bisa digeser, otomatis menampilkan pemain pengambil keputusan. |
| Teks banyak panel berukuran 8–11 px dan kontrol kecil. | Perbesar teks fungsi, kontras, input, serta sebagian besar target sentuh menjadi minimal 44 px. |
| Pemilih “Kelola sebagai” muncul juga di riwayat; aset menampilkan dua pemilih pemain. | Riwayat tanpa pemilih pemain. Aset memakai satu pemilih portofolio; pada hotseat memilih pemain manusia juga memilih pengendalinya. Pemain room tetap hanya mengendalikan kursi sendiri. |
| Pencarian/filter aset dan wizard barter empat langkah sudah berguna. | Gunakan kembali komponen tersebut; tambah detail yang membantu, bukan mengganti alurnya. |
| Membuka tab barter mengosongkan draf; langkah wizard hilang saat unmount. | Draf dan langkah disimpan per pertandingan/pemain. Draf counter terikat pada tawaran aktif, bukan portofolio yang sebelumnya dilihat. |
| Riwayat hanya teks dan putaran tanpa pencarian/pengelompokan. | Baris ringkas, jenis peristiwa, nomor kejadian asli, kelompok putaran, pencarian teks dan filter transaksi. Tidak membuat jam/tanggal/pemain/nilai contoh. |
| Pengelolaan aset terduplikasi di dua dialog dan beberapa tombol hanya menjelaskan ketidaktersediaan lewat tooltip. | Komponen tindakan bersama; alasan terlihat di bawah tindakan, termasuk fase utang/lelang dan kas yang dicadangkan. |
| Lock perintah lokal dilepas sebelum efek lemparan selesai. | Lock sinkron dan status sibuk dipertahankan selama interval aksi/dadu; timer non-dadu tidak lagi mengakhiri efek lemparan berikutnya. Validasi command engine tetap otoritatif. |

## Perubahan yang diterapkan

- Identitas navy, krem, dan emas dipertahankan. Beranda memakai kartu mode ringkas tanpa ilustrasi besar. Lanjutkan permainan tetap tersedia; simpanan, aturan, dan pengaturan tetap di header.
- Pengaturan meja, nama 2–6 pemain, tingkat bot, aturan sewa, pembuatan room dan gabung kode tetap menggunakan fungsi lama. Status layanan online yang belum aktif dijelaskan.
- HUD dan dock lebih ringkas, teks aksi langsung, kekurangan kas saat pembelian terlihat. Tombol detail yang berulang pada dock dihapus; Detail giliran/Tagih sewa tetap di atas papan. Efek gerakan dekoratif pion yang terus berulang dimatikan; perjalanan pion dan efek lempar dadu asli tetap berjalan melalui komponen lama.
- Aset menampilkan kelompok aktual, bangunan/status, harga bangun/tebus, kekayaan dan stok bank. Gadai serta jual semua bangunan kelompok meminta konfirmasi dengan hasil uang dan konsekuensinya. Build yang memicu keputusan stok terbatas membuka detail keputusan. Pencarian/filter dan akses sertifikat/semua petak tetap ada.
- Barter tetap mendukung multi-properti, uang dari kedua pihak, kartu bebas penjara, aset tergadai, transaksi di luar giliran/saat utang sesuai engine, serta counter. Pilihan dapat dihapus lewat chip, termasuk aset yang kepemilikannya berubah. Jumlah uang tetap menerima satuan Rp1. Ringkasan menjelaskan pihak pemberi/penerima dan bunga/tebus aset tergadai sesuai versi save.
- Draf bertahan selama komponen Game masih terbuka ketika berpindah tab, menutup dialog counter, atau kembali langkah. Draf tidak menjadi bagian save engine dan tidak dipulihkan setelah reload. Mengirim tawaran berhasil menghapus draf penawaran tersebut.
- Fokus keyboard dibatasi pada dialog/setup/panel ponsel; Escape menutup lapisan teratas, fokus kembali ke pemicu bila masih ada. Serah giliran tetap membutuhkan tombol “Aku siap”.
- Cache service worker dinaikkan ke `nusantara-v27`; ilustrasi yang sudah tidak dipakai tidak lagi dipramuat. Aset asli tetap disertakan dalam paket.

## Yang sengaja dipertahankan

Dibandingkan byte demi byte dengan ZIP masukan: `Board.tsx`, `BoardMap.tsx`, `DiceRollFx.tsx`, engine v1/v2, konten aturan/deck, kamera, lintasan pion, storage, format save, klien room, dan API game tidak berubah. Semua aset gambar asli juga tetap tersedia.

Stack React/TypeScript/Next.js serta jalur Vinext/Cloudflare, konfigurasi Vercel, backend Redis/D1, bot lokal/Groq, slot save, ekspor/impor dan pemulihan room tetap ada. Isi dependency, devDependency, scripts, overrides, packageManager dan engines tidak berubah. `pnpm-lock.yaml` identik dengan ZIP; hanya metadata versi package menjadi `2.7.0`.

## File terkait

| File | Perubahan |
| --- | --- |
| `components/game/Game.tsx` | Beranda, integrasi panel, pemilih pemain, draf per pemain, counter recipient, lock aksi, konfirmasi aset dan fokus. |
| `components/game/MobileDock.tsx` | Label langsung, alasan kas kurang, mengurangi tombol detail berulang. |
| `components/game/AssetManager.tsx` | Satu pemilih pemain, status/kelompok/biaya dan fase aksi yang sesuai. |
| `components/game/AssetActions.tsx` (baru) | Komponen tindakan aset bersama dengan alasan ketidaktersediaan. |
| `components/game/TradeWizard.tsx` | Langkah tersimpan, ringkasan pihak, pencegahan kirim ganda, koreksi pilihan yang kedaluwarsa. |
| `components/game/TradeReview.tsx` | Ringkasan yang sama bagi pengirim/penerima, konsekuensi aset tergadai. |
| `components/game/HistoryPanel.tsx` (baru) | Cari/filter, nomor peristiwa dan pengelompokan putaran. |
| `components/game/useDialogFocus.ts` (baru) | Siklus fokus dan keyboard dialog/panel. |
| `app/globals.css` | Penyempurnaan visual dan breakpoint; geometri papan tidak diubah. |
| `public/sw.js` | Versi cache dan pengurangan pramuat ilustrasi. |
| `tests/ui-refinement.test.mjs`, `tests/asset-trade-v26.test.mjs` | Menyesuaikan pemeriksaan source untuk komponen bersama/cache baru, dengan tes aturan tetap utuh. |
| `tests/production.test.mjs`, `tests/vercel-build.test.mjs` | Ekspektasi beranda kini memeriksa tiga mode asli; pemeriksaan aset/bundle/API tetap ada. Belum dijalankan karena build tidak tersedia. |
| `package.json`, `README.md`, `MULAI_DI_SINI.txt`, `SOURCE_SNAPSHOT.json`, dokumen ini | Metadata rilis, instruksi, hasil audit dan QA. |

## Hasil pengujian yang benar-benar dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| Delapan berkas tes Node: game, classic, storage, save-format, room-client, ui-refinement, pawn-flow, asset-trade-v26 | **86 lulus, 0 gagal.** Termasuk simulasi bot, keputusan aturan, transaksi/counter, penyimpanan dan pemulihan klien. |
| Tujuh tes matematika/gesture kamera pada board-2d | **7 lulus, 0 gagal.** Geometri 40 petak, batas pan/zoom, mengikuti pion, resize, tap/drag/pinch/cancel pada berbagai ukuran viewport numerik. |
| Total pemeriksaan yang dapat dijalankan | **93 lulus. Ini bukan hasil seluruh suite browser/React.** |
| `npm test` | Percobaan awal tidak lulus penuh. Pemeriksaan source yang masih merujuk cache/komponen lama telah disesuaikan dan lulus ulang. `portrait.test.mjs` dan render artwork pada `board-2d.test.mjs` masih membutuhkan TypeScript/React yang tidak tersedia. |
| Next build: `npm run build:vercel` | Terhenti: `next: not found`. Bukan build berhasil. |
| Vinext build: `npm run build` | Terhenti: `node_modules/vinext/dist/cli.js` tidak tersedia. |
| TypeScript | Tidak dapat dijalankan: `node_modules/typescript/bin/tsc` tidak tersedia. TSX belum diverifikasi compiler. |
| `npm run lint` | Terhenti: `eslint: not found`. |
| `node --check public/sw.js`, syntax check hook `.ts` dengan Node | Lulus pemeriksaan sintaks masing-masing; bukan pengganti tsc atau lint. |
| API integrasi D1: `node tests/api.test.mjs` | Terhenti sebelum tes: `node_modules/wrangler/package.json` tidak tersedia. |
| Chromium/Playwright | Chromium tersedia tetapi gagal diluncurkan: `setsockopt: Operation not permitted`, berakhir SIGTRAP. Tidak ada screenshot/hasil tes DOM yang diklaim. |
| Smartphone potret/desktop, seluruh menu dan gesture browser | Ditinjau dari source/breakpoint; **belum diuji secara visual/interaktif**. |
| Multiplayer end-to-end, Upstash/Groq live, offline SW nyata | **Belum diuji**. Tes klien room adalah pengujian unit, bukan dua perangkat terhubung ke backend live. |

Perintah untuk mereproduksi 86 tes yang lulus tanpa dependency UI:

```bash
node --experimental-strip-types --test --test-isolation=none \
  tests/game.test.mjs tests/classic.test.mjs tests/storage.test.mjs \
  tests/save-format.test.mjs tests/room-client.test.mjs \
  tests/ui-refinement.test.mjs tests/pawn-flow.test.mjs tests/asset-trade-v26.test.mjs
```

Tujuh tes kamera tanpa render React:

```bash
node --test-name-pattern='40 classic tiles|pan clamps|zoom keeps|follow keeps|resizing preserves|tap selects|pinch zooms' tests/board-2d.test.mjs
```

### Kendala lingkungan

Proses instalasi pertama menerima EPERM untuk akses registry dan dihentikan. Kebijakan managed environment melaporkan jaringan umum tersedia, tetapi sandbox perintah menggunakan jaringan restricted; ini tidak membuktikan npm registry bermasalah. Pencarian dependensi lokal tidak menemukan React, Next.js atau TypeScript yang dapat dipakai; struktur `node_modules` hasil instalasi parsial tidak berisi paket yang diperlukan. Tidak ada percobaan mengganti versi/dependency/lockfile atau mematikan kebijakan keamanan untuk melewati masalah tersebut.

Tidak ada dependency instalasi parsial, cache, node_modules, atau output build dalam ZIP hasil. Tidak ada push, deployment, atau perubahan riwayat Git.

## Masalah terbuka dan pemeriksaan sebelum rilis

Keterbatasan utama: kompilasi TypeScript/TSX dan perilaku browser belum dapat diverifikasi. Tidak ada jaminan bebas regresi visual atau runtime sebelum pemeriksaan berikut dijalankan di lingkungan yang memiliki dependensi:

1. Install sesuai lockfile sekali setelah akses registry tersedia. Jalankan tsc, lint, seluruh `npm test`, build Next/Vinext yang digunakan, lalu tes produksi sesuai target hosting.
2. Periksa 320×568, 360×640, 390×844, 430×932, tablet 768×1024 dan desktop 1440×900, termasuk keyboard virtual, zoom teks, landscape, safe area dan 6 pemain/nama panjang.
3. Buka/tutup semua mode/setup/menu/simpanan/aturan; pastikan fokus dan Escape kembali dengan benar. Form setup tetap dapat digulir sampai tombol mulai.
4. Jalankan lempar pembuka, normal, kembar, penjara/kartu, perpindahan pion, beli/lelang/utang dan akhir giliran. Ulangi ketukan cepat; satu aksi harus hanya dieksekusi sekali. Uji animasi cepat, reduced motion dan serah giliran.
5. Aset: cari/filter, pindah pemilik, bangun merata, stok terbatas/hotel, jual satu/seluruh kelompok, gadai/batal/konfirmasi/tebus, reserved cash pada lelang dan save v1.
6. Barter: multi-properti, uang dua arah, kartu, aset tergadai, tawaran balik setelah melihat portofolio pemain lain; tutup/buka panel dan kembali langkah tanpa kehilangan pilihan; perubahan kepemilikan saat draf terbuka; respons bot.
7. Dua browser/perangkat: buat/gabung room, siap/mulai, kursi/token, aksi serentak, putus/sambung ulang dan reload. Verifikasi backend Upstash/D1 serta Groq hanya bila kredensial server tersedia.
8. Periksa autosave, slot, ekspor/impor, cache service worker baru dan offline setelah shell benar-benar tersimpan.

## Saran berikutnya (belum diterapkan)

- Tambahkan tes browser otomatis untuk draf barter, fokus dialog, pencegahan ketukan ganda, dan transaksi aset setelah runtime tersedia.
- Tambahkan metadata aktor/nominal terstruktur ke log pada pekerjaan terpisah dengan migrasi save yang teruji, bila nantinya diperlukan filter pemain/nominal. v2.7 tetap menampilkan teks log asli lengkap.
- Konsolidasikan CSS versi lama setelah perbandingan visual desktop/ponsel selesai. Lapisan v2.7 saat ini membatasi perubahan tanpa merombak stylesheet papan.
