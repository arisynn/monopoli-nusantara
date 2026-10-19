# Publikasi source dan bukti QA

Branch `fix/qa-stability-and-modals` memuat audit awal, perbaikan modal otomatis, dan urutan animasi online. Branch ini disiapkan untuk ditinjau; tidak mengubah `main` atau melakukan deployment production.

- [Audit awal](QA_MASTER_REPORT.md)
- [Perbaikan modal dan temuan QA](follow-up/FIX_REPORT.md)
- [Perbaikan urutan animasi online](online-flow/README.md)

Laporan merupakan snapshot saat pengujian. Pernyataan “belum dipush” di laporan historis merujuk waktu laporan dibuat; publikasi GitHub dijalankan setelah pengguna memberikan instruksi push.

Laporan Markdown, screenshot, data JSON, script audit, patch, dan log command ikut dilacak Git. Arsip `.zip` berisi trace Playwright tidak dilacak karena ukurannya besar; arsip tersebut tetap ada dalam workspace/paket unduhan audit. Manifest artefak historis tetap dipertahankan lengkap, sehingga entri ZIP di manifest merupakan inventaris hasil audit dan tidak selalu tersedia dalam checkout GitHub.

Hasil terakhir: 713/713 test inti lulus; 4 skenario alur online dengan dua sesi browser lokal per skenario lulus. Engine/model tetap cocok dengan 51 hash yang dilindungi. Pengujian lokal tidak membuktikan worker production aktif; pemulihan worker Termux masih memerlukan akses perangkat.
