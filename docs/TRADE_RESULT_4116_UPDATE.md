# Update 4.11.5 → 4.11.6

Rilis ini menambahkan hasil barter yang jelas untuk pemain yang terlibat. Engine, aturan permainan, keputusan semua persona, RNG, model V23.2 dan manifest tetap sama. Dadu tahan–lepas serta BUILD_BATCH atomik dari 4.11.5 tetap tersedia.

## Perilaku UI

- **Diterima:** popup padat dengan nama lawan, ronde, **Anda menerima** dan **Anda memberikan**. Properti, uang masuk/keluar dan jumlah kartu bebas penjara ditampilkan terpisah. Tutup memakai satu teks di bagian paling bawah; hasil diterima tidak hilang karena timer.
- **Ditolak:** pemberitahuan singkat yang tidak mengunci input, menyebut pemain yang menolak, tanpa tombol tutup. Menutup otomatis sesudah 3,6 detik waktu terlihat. Timer berhenti saat popup lain menutupi, halaman tidak aktif, atau permainan dijeda. Lempar dadu, tombol aksi dan shortcut tetap bisa dipakai sesuai giliran/versi state.
- **Dibatalkan:** dibedakan dari penolakan; menyebut pengirim yang menarik tawaran. Pemberitahuan tidak mengunci input; perilaku timer sama dengan penolakan.
- **Tawar balik:** tetap tawaran baru yang membutuhkan keputusan, belum dianggap transaksi berhasil. Rincian penerimaan memakai syarat tawaran terakhir.
- **Properti tergadai:** label merekam kondisi saat transaksi, meskipun kemudian ditebus. Keputusan tebus/bayar bunga lebih dahulu ditampilkan bagi pemain yang wajib memutuskan. Biaya bank dan keputusan lanjutan tetap dicatat terpisah dalam Riwayat.
- **Akses ulang:** tautan teks Hasil barter terbaru tersedia dalam menu/tawaran Barter bila ada hasil pemain tersebut. Filter Barter dan tautan hasil/catatan tersedia di Riwayat. Kembali dari rincian mempertahankan draft/filter asal selama masih relevan.
- Barter yang tidak melibatkan pemain tidak memunculkan popup baginya. Riwayat publik tetap tersedia.

Popup memiliki animasi 140 ms, mengikuti reduced motion, dan badan yang dapat bergulir untuk daftar panjang. Tombol tutup teks tetap terlihat. Tidak ada deretan tombol baru, estimasi keuntungan, atau klaim bahwa nilai properti sama dengan uang tunai.

## Pencatatan hasil dan sinkronisasi

`lib/trade-result.mjs` membungkus satu pemanggilan command resmi. Setelah command berhasil, adapter menyalin syarat tawaran final ke `tradeResult` pada event barter publik yang sudah dibuat engine. Pencatatan terjadi sebelum CAS commit yang sama. Tidak ada transfer kedua, perubahan state.version tambahan, request database tambahan, polling khusus hasil barter, panggilan Groq atau fungsi Edge baru.

Jalur yang diperbarui adalah aksi manusia online, bot offline, adapter submit bot Termux di server, serta fallback bot Edge yang sudah ada. Program/compute thread Termux tidak berubah; adapter server tetap memvalidasi autentikasi, manifest, lease, aksi legal, versi dan receipt sebelum commit. RLS dan SQL tidak berubah.

Rincian berasal dari syarat tawaran yang berhasil diproses, bukan perkiraan selisih saldo atau parsing teks log. Metadata tidak membawa user ID akun, ID command privat, context engine, deck tersembunyi atau identitas kartu yang dipegang; hanya jumlah kartu bebas penjara.

Antrean memakai identitas match/event dan watermark monoton. Respons request dan pengiriman state berulang tidak menggandakan popup. Baseline restore/reconnect tidak memutar ulang notifikasi historis; rincian yang masih berada dalam jendela log dapat dibuka kembali secara manual. Jendela log mengikuti batas engine yang sudah ada (300 event untuk schema 2, 100 untuk legacy); ini bukan arsip transaksi tanpa batas.

Keputusan wajib manusia mendapat prioritas atas popup hasil otomatis, termasuk gadai, lelang, utang, kartu dan tawaran berikutnya. Hasil yang belum dibaca tetap antre selama event masih tersedia. Membaca hasil tidak menjeda room atau compute bot. Saat keputusan wajib baru datang, hasil menyerahkan layar dan dapat dilanjutkan kemudian.

Log versi lama yang belum memiliki metadata menampilkan catatan publik terkonfirmasi beserta keterangan bahwa rincian terstruktur belum tersedia. Tidak ada rincian yang dikarang dari kepemilikan atau saldo terbaru.

## Update GitHub dan Vercel

1. Cadangkan konfigurasi privat. Salin source ZIP ke working tree proyek; pertahankan `.git`, `.env*`, `.nusa-online` dan pengaturan proyek deployment.
2. Jalankan `npm ci`, `npm run typecheck`, `npm test`, `npm run check:source` dan `node scripts/verify-speed-model.mjs`. Review perubahan lalu commit/push melalui alur proyek sendiri.
3. Deploy frontend **dan backend** dari rilis yang sama, memakai `npm run build`. Pastikan `/build.json` menampilkan 4.11.6. Reload/update PWA dari lobby agar frontend terbaru aktif.
4. Tidak ada migration baru untuk instalasi 4.11.5 lengkap. Jika berasal dari versi lebih lama, ikuti panduan migrasi dan pemasangan pada `docs/TERMUX_ONLINE.md`.
5. Provider Termux tetap memakai API submit yang sama. Jika instalasi masih memakai provider Edge lama, deploy ulang bundle fungsi `monopoli-bots` agar adapter hasil barter di jalur tersebut ikut diperbarui. Tidak perlu mengaktifkan Edge untuk instalasi Termux.

## Termux

Worker V23.2 yang manifest/protokolnya sudah cocok dapat terus berjalan tanpa pairing ulang. Tidak ada perubahan konfigurasi PM2, token, SQL aktivasi atau Groq. ZIP membawa CLI dan source/output lengkap untuk instalasi baru:

```bash
bash nusa-online.sh
```

Self-test tanpa kredensial:

```bash
bash nusa-online.sh --selftest
```

## Validasi

Tes fitur: `npm run test:trade:result`. Pengujian browser: `npm run test:trade:result:browser` dengan Chromium/Playwright yang tersedia. Hasil rinci tercatat pada `docs/audits/TRADE_RESULT_BROWSER_RESULTS.json` dan `docs/audits/TRADE_RESULT_VALIDATION.json`.

Pengujian menggunakan service/engine nyata secara lokal, memory store, serta contract double Auth/Realtime/worker database. Tidak mengakses Supabase/Vercel produksi dan tidak mengukur perangkat Android fisik. File manifest dan model/engine diverifikasi dengan checksum, bukan dibuat ulang.

Hasil rilis: **721/721 uji inti**, termasuk 21 regresi barter; **94 pemeriksaan browser** (17 barter, 41 UI, 22 tahan–lepas/bangun batch, 14 room online) lolos. Typecheck dan pemeriksaan 642 modul source/output lolos. CLI self-test lulus untuk enam persona, compute thread, legalitas engine dan kenaikan bid ₦5. Sebanyak 71 berkas model/manifest/Termux/SQL cocok dengan ZIP 4.11.5; tiga adapter server diperbarui secara sengaja, seperti dirinci dalam `docs/audits/TRADE_RESULT_RUNTIME_LOCK.json`.

Dua perbaikan pada harness: pengujian transaksi memisahkan commit dari pembaruan administratif inisialisasi fixture; pengujian accordion menunggu kondisi DOM satu item terbuka, menggantikan jeda tetap 30 ms yang mudah terlambat pada mesin sibuk. Persyaratan ekonominya dan pemeriksaan jumlah accordion tetap sama.
