# Update 4.11.4 → 4.11.5

Dadu tetap menggunakan CSPRNG resmi dengan rejection sampling. Tidak ada simulasi fisika, pembobotan angka, anti-kembar, pengurangan jumlah 6–8, seed dari durasi sentuhan, atau perubahan kebijakan persona AI. Seluruh 51 checksum model/engine dan berkas manifest V23.2 tetap dipertahankan.

## Tahan–lepas

- Tahan tombol lempar untuk mengocok, lepaskan di dalam tombol untuk mengirim satu aksi. Ketukan singkat tetap didukung.
- Space/Enter pada tombol memakai alur tahan–lepas yang sama. Space dari papan juga didukung. Pengulangan keyboard dan klik susulan setelah pelepasan ditahan agar tidak menggandakan aksi.
- Geser keluar tombol, pointer cancel, Escape, pindah fokus/halaman, koneksi terputus, atau perubahan versi state membatalkan kocokan yang belum dikirim.
- Sebelum dilepas tidak ada request lempar, perubahan state, atau pemanggilan RNG gameplay. Setelah terkirim, hasil tidak dapat dibatalkan untuk mencoba hasil lain. Versi state, controller, pending action dan receipt tetap melindungi hasil.
- Animasi sewaktu menahan dan menunggu respons hanya dekorasi. Hasil otoritatif masuk setelah respons server. Reduced motion tetap didukung.
- Lempar awal dan lempar untuk mencoba bebas penjara memakai kontrol yang sama. Dadu utilitas tetap diselesaikan otomatis oleh engine.
- Bot mengirim keputusan ROLL biasa. Tidak perlu meniru durasi tangan dan tidak mendapat waktu tunggu tambahan. Animasi bot tetap mengikuti catch-up online yang sudah ada.

## Bangun banyak sekaligus

Popup jumlah tetap menyediakan jumlah satu dan properti tujuan. Jumlah 2–15 dikirim melalui satu `BUILD_BATCH` dalam jalur `ACTION` yang sudah diautentikasi.

Wrapper baru `lib/build-batch.mjs` menerapkan perintah BUILD resmi pada snapshot privat di memori. Kepemilikan, kas, gadai, pembangunan merata, stok, fase permainan dan transisi hotel divalidasi oleh engine yang sama. Hasil lengkap baru dipublikasikan setelah seluruh pesanan berhasil. Kesalahan tidak membeli sebagian pesanan.

Satu batch memakai satu request ID, satu receipt, satu CAS commit room dan satu notifikasi perubahan. `roomRevision` naik satu; `state.version` tetap menghitung langkah engine dan naik sesuai jumlah BUILD. Backend 4.11.5 menangani loncatan versi ini, termasuk metadata profiling. Human lease/RLS/worker fencing tetap memakai mekanisme database yang sudah ada. Guard bot tetap mensyaratkan satu intent resmi per commit bot.

Riwayat dan ledger bank mempertahankan setiap transaksi BUILD. Metadata publik mengelompokkan presentasi menjadi satu penyelesaian visual, tanpa mengekspos awalan user ID privat pada command. Saldo dan semua properti berubah bersamaan di layar.

Jika simulasi pesanan memasuki perebutan stok, batch ditolak seluruhnya tanpa pemotongan uang. Popup menawarkan **Pemesanan stok · jumlah 1**. Pemain meninjau dan mengonfirmasi pesanan satuan untuk membuka mekanisme stok/lelang resmi. Tidak ada klaim stok diam-diam atau penurunan jumlah pesanan otomatis.

## Audit angka dadu

Peluang jumlah 6–8 untuk dua dadu adil adalah **16/36 = 44,44%**; peluang kembar **1/6**. Mengubah cara menekan tombol tidak mengubah distribusi tersebut.

Arsip benchmark yang dilampirkan menghasilkan **1.441 lemparan unik**, dengan **684 jumlah 6–8 = 47,47%**. Sebanyak **5.032** pengulangan kejadian dari snapshot/log dibuang, tanpa konflik pasangan. Arsip memakai seed berulang dan pertandingan yang dibatasi/terhenti. Sampel ini tidak independen dan tidak mewakili layanan dadu online produksi.

Satu sampel baru **100.000 pasangan CSPRNG** menghasilkan **44.087 jumlah 6–8 = 44,087%**. Hasil lengkap beserta sisi, 36 pasangan, jumlah, kembar, korelasi, interval kepercayaan dan statistik eksploratif ada di `docs/audits/DICE_4115_AUDIT.json`. Checkpoint 100/1.000/10.000/100.000 merupakan sampel bertingkat dari run yang sama. Sebagian uji individual bisa menghasilkan p kecil secara kebetulan; angka-angka tersebut tidak dipakai untuk menyesuaikan RNG atau membuktikan keadilan sempurna.

**Unduh log dadu** tersedia di Pengaturan saat bermain. Ekspor memuat jendela log publik yang masih tersedia, bukan rekaman lengkap sepanjang pertandingan. Deck tersembunyi, seen-command IDs, kredensial dan user ID akun tidak ikut diekspor. Pengumpulan tidak menambah polling/database request. Gunakan untuk memeriksa pertandingan online sendiri:

```bash
npm run audit:dice -- --input NUSA-dice-log.json --count 100000 --output dice-audit.json
```

Tool menerima file JSON save/snapshot dan JSONL; `--input` dapat diulang. Deduplikasi memakai match/event ID, pesan lempar awal seri tanpa pasangan tidak dihitung sebagai lemparan baru, dan utilitas dipisahkan. Konteks lempar penjara yang tidak dapat dipastikan dari log ditandai sebagai tidak diketahui.

Untuk mengaudit arsip benchmark tanpa menjalankan source model di dalamnya:

```bash
python3 scripts/audit-dice-archive.py /path/NUSA_BENCHMARK_V23_RESULTS.zip --output archive-dice-audit.json
```

Sampel CSPRNG baru akan berbeda setiap kali tool dijalankan. Tidak ada akses Supabase produksi dalam audit yang disertakan.

## Benchmark pembangunan

Uji memakai service dan engine resmi, memory store, dua pengulangan pada masing-masing roster 2–6 manusia, serta delay terkontrol **180 ms/request**. Enam pembangunan seimbang menghasilkan ekonomi akhir yang sama.

| Pengukuran | Enam request BUILD lama | Satu BUILD_BATCH |
|---|---:|---:|
| Request / commit | 6 / 6 | 1 / 1 |
| Waktu respons P50 | 1.096 ms | 184 ms |
| Waktu respons P95 | 1.122 ms | 193 ms |

Baseline bahkan tidak memasukkan jeda animasi per bangunan yang lama. Ini hasil lokal dengan delay buatan, bukan janji latensi Vercel/Supabase/Android. Data mentah: `docs/audits/BUILD_BATCH_BENCHMARK.json`; ulangi dengan `npm run benchmark:build:batch`.

## GitHub, Vercel dan Termux

1. Cadangkan konfigurasi privat dan perbarui source dari ZIP ini di working tree repository. Pertahankan `.git`, `.env*`, `.nusa-online` dan identitas proyek deployment.
2. Jalankan `npm ci`, `npm run typecheck`, `npm test`, `npm run check:source` dan `node scripts/verify-speed-model.mjs`. Review, commit dan push source sesuai alur proyek sendiri.
3. Deploy frontend **dan backend** dari rilis yang sama melalui build Vercel `npm run build`. Frontend baru memerlukan backend yang mengenal BUILD_BATCH; backend 4.11.4 belum mengenalnya. Pastikan `/build.json` menampilkan 4.11.5 dan reload/PWA update dari lobby.
4. Tidak ada migration baru untuk instalasi 4.11.4 yang lengkap. Jika berasal dari 4.11.2, ikuti dahulu `docs/ONLINE_SPEED_UPDATE.md` untuk migration 008. Tidak ada perubahan RLS, lease, manifest atau protokol worker.
5. Worker Termux V23.2 yang sudah cocok dapat terus berjalan. Tidak perlu pairing ulang, SQL aktivasi ulang, atau mengganti konfigurasi PM2. Paket tetap membawa CLI `bash nusa-online.sh` serta source/output lengkap untuk instalasi baru.

Tes baru: `npm run test:hold:batch` dan `npm run test:hold:batch:browser`. Hasil browser: `docs/audits/HOLD_BATCH_BROWSER_RESULTS.json`. Validasi lokal menggunakan Chromium nyata dan emulasi sentuhan/mobile; perangkat Android fisik dan layanan produksi belum diuji.

## Hasil validasi rilis

- 700/700 uji inti/frontend lolos; tidak ada gagal atau skipped.
- 22 uji browser tahan–lepas/batch, 41 regresi UI sebelumnya, dan 14 skenario room online lolos.
- Typecheck dan pemeriksaan 632 modul source/output lolos.
- Self-test CLI: enam persona, compute thread, legalitas engine dan kenaikan lelang ₦5 lolos.
- Seluruh 51 hash model/engine cocok; 64 berkas model/manifest/worker/CLI yang dibandingkan dengan ZIP 4.11.4 tetap identik.

Laporan mesin: `docs/audits/HOLD_BATCH_VALIDATION.json`. Pengujian kamera kini mengumpulkan frame sebelum klik agar observasi tidak terlambat saat eksekusi browser sibuk; syarat pergerakan kamera dan pion tetap diperiksa.
