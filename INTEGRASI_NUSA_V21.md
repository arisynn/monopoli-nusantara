# Integrasi NUSA V21

Arsip integrasi V21. Model aktif berikutnya: [NUSA V23](INTEGRASI_NUSA_V23.md). Hash V21 mencatat versi historis.

Model NUSA aktif adalah `21.0.0` (Machiavellian Egoist), dengan 50 pakar. Kelima modul tetap berada di `lib/bot/nusa-v7/` agar pemanggil kompatibel. Router memakai label `NUSA-V21.0-MACHIAVELLIAN`. Versi aplikasi tetap 4.11.0; algoritma persona lain dan aturan game tetap memakai implementasi sebelumnya.

Seluruh 46 ID pakar V20 dipertahankan. Empat tambahan dari lampiran adalah `egoistWinDelta` (evaluasi perubahan skor peluang menang), `extortionCounter` (tiga strategi tawar balik), `underdogFarmer` (klasifikasi pemimpin dan pemain lemah), serta `auctionExtortionist` (kenaikan tawaran dalam batas harga). Search CRN juga memakai bonus skor peluang menang pada evaluasi akhir simulasi.

## Impor yang dapat diulang

```sh
npm ci --ignore-scripts
node scripts/import-nusa-v21.mjs
```

Importer membaca lima template model dari `docs/imports/nusa-v21-generator.original.txt` melalui AST TypeScript sebagai data, memeriksa 50 ID unik dan kesinambungan V20, lalu memeriksa sintaks sebelum menulis modul. Argumen path opsional dapat dipakai untuk sumber V21 lain. SHA-256 sumber asli, checksum hasil impor, daftar pakar pendahulu, dan penyesuaian kompatibilitas tercatat di `NUSA_V21_IMPORTED_HASHES.json`. Manifest V18/V20 merupakan arsip.

Generator asli tidak dieksekusi: penulisan salinan lab, penggantian router/client secara keseluruhan, manifest generik, dan turnamen otomatisnya dilewati. Router/client diperbarui hanya pada identitas versi; context budget bersama, validasi aksi engine, pembatalan, pemeriksaan respons worker, fallback ringan, dan guard penolakan barter tetap dipakai. Salinan modul Edge di `supabase/functions/monopoli-bots/_shared/` disinkronkan dari source runtime.

Penyesuaian model mengikuti impor V20: lelang memakai `auctionMinimum()` dan increment bersama termasuk nominal save lama, simulasi menyimpan 80 log terbaru, pencarian tidak memaksakan waktu minimum ketika budget habis, dan ekspansi kandidat/pakar/search berhenti secara kooperatif melalui decision context.

## Verifikasi dan batas hasil

Suite aktif `tests/nusa-v21.test.mjs` meneruskan regresi V20 dan menambahkan pemeriksaan empat pakar V21, hash lampiran, kesamaan source Edge, perubahan skor peluang menang, serta tawar balik uang tunai melalui router dan penerimaan melalui engine. Daftar suite headless dan ekspektasi model online/browser diperbarui ke V21.

Hasil pemeriksaan pada Node.js 24.19.0:

- Tes NUSA V21, observasi, dan worker online: 41/41 lolos.
- `npm test`: 551/552 lolos. Satu kegagalan pada `active artwork has valid encodings and retired atlases are absent` disebabkan aset lama yang masih dilacak repo (`avatars/animal-portraits.png`, `currency/nusa-mark.png`, `ui/interface-icons.png`). Test dari HEAD awal mereproduksi kegagalan yang sama; aset tidak diubah oleh integrasi model. Laporan lengkap: `docs/CLASSIC_TEST_RESULTS.json`.
- Build web/server, `npm run typecheck`, dan `npm run check:source` lolos; 547 modul source/output diperiksa tanpa kegagalan.
- Impor ulang menghasilkan byte dan checksum yang identik. Lima modul model dan router/client Edge sama dengan source lokal.

Tes online memakai contract doubles lokal; Supabase live dan browser nyata tidak dijalankan dalam pemeriksaan ini.

`winProbability` dalam lampiran adalah estimasi heuristik softmax dari aset, kas, dan monopoli, bukan probabilitas eksak yang terkalibrasi. Sinyal negatif pakar digabung dalam skor council, bukan filter keras untuk semua aksi. Tawar balik tetap tergantung kandidat legal, prediksi penerimaan, budget, dan batas kedalaman negosiasi. Nama dan klaim performa dalam lampiran belum membuktikan kenaikan win rate.

Tidak ada training, benchmark turnamen, perubahan database, atau deployment pada integrasi ini. Bobot belajar tambahan tidak disertakan.
