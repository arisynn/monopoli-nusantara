# Verifikasi rilis Monopoli Nusantara v2

Tanggal: 15 Oktober 2026. Pengujian dilakukan pada Node.js 24.19, TypeScript, dan runtime Workers lokal Miniflare. Ini bukan hasil pengujian browser atau perangkat Android.

## Pemeriksaan otomatis yang lulus

- **62 tes**: 29 tes aturan v2, 29 regresi mesin v1, dan 4 tes penyimpanan.
- Tes v2 mencakup lempar awal/seri, 2–6 pemain, dadu utilitas terpisah, lelang terbuka, kelangkaan bangunan, barter saat utang/di luar giliran, cadangan penawaran, penerimaan aset tergadai, klaim sewa manual, dan kelanjutan transaksi yang tertunda.
- Semua 32 efek kartu dijalankan melalui fixture. Ini menguji perilaku program, bukan membuktikan kesamaan seluruh nominal/konten dengan kartu fisik C1009.
- 20 pertandingan penuh v2 dengan seed tetap, mencakup 2–6 pemain dan kedua mode sewa, mencapai pemenang. 12 pertandingan penuh v1 juga lulus untuk menjaga kompatibilitas save lama.
- 4 tes penyimpanan memakai adapter browser tiruan: localStorage penuh, pemilihan snapshot terbaru, JSON lokal rusak, dan kegagalan kedua penyimpanan.
- **9 kelompok pemeriksaan integrasi API room** lulus: pembuatan room/pilihan aturan/token; gerbang Siap dan deck tersembunyi; otorisasi kursi; perintah bersamaan/CAS; deduplikasi; reconnect/token salah; late join; bot cadangan; batas enam kursi dan penolakan kursi ketujuh.
- TypeScript `--noEmit` lulus setelah perubahan UI terakhir.
- **Build produksi lulus** melalui helper Sites. Peringatan ukuran chunk muncul untuk bundle besar; ini bukan hasil pengukuran performa perangkat.
- **Smoke test bundle produksi lulus**: SSR beranda, judul/tombol, tiga referensi script, referensi gambar beranda, empat aset WebP yang valid, routing API, migrasi D1, dan pembuatan room.
- Gambar hasil generasi ditinjau sebagai aset sebelum konversi WebP. Pemeriksaan ini tidak menggantikan inspeksi tata letak game di browser.

## Perbaikan pemeriksaan akhir

- Metadata beranda diperbarui menjadi 2–6 pemain.
- Biaya tebus yang ditampilkan mengikuti aritmetika engine v2; save v1 tetap mempertahankan perhitungannya sendiri.
- Tombol bangun tidak aktif selama lelang sehingga sesuai dengan serialisasi keputusan engine.
- Service worker memakai versi cache baru dan menyertakan empat aset gambar.
- Mesin dan konten v1 dibekukan; save lama diarahkan ke mesin tersebut.

## Belum diverifikasi

- Visual, sentuhan, kamera, FPS, ukuran layar kecil, dan pertandingan melalui browser/perangkat nyata. Skill kontrol browser tidak tersedia; tidak ada klaim screenshot atau pengujian antarmuka langsung.
- Groq langsung: secret belum dikonfigurasi. Jalur tanpa secret memakai bot lokal dengan label yang terlihat.
- Offline service worker pada browser nyata dan reconnect lintas perangkat.
- Multiplayer enam pengguna pada domain terbitan dengan beberapa akun. Site privat hanya dapat dibuka pemilik sampai akses berbagi diubah secara sengaja.
- Seluruh wajah 28 sertifikat dan 32 kartu dari satu set fisik C1009. Rulebook resmi tidak menampilkan inventaris konten lengkap itu.

## Cakupan rilis

Lihat `RULEPACK.md` untuk acuan, cakupan mekanik, dan prosedur digital yang diadaptasi. Rilis ini tidak diberi label “100% identik C1009”. ZIP menyertakan source, aset, dokumen, dan build v2; situs v1 yang sudah terbit tidak otomatis diperbarui.
