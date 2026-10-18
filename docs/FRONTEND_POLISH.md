# Frontend polish

Perubahan lokal pada aplikasi 4.11.0; fingerprint build diperbarui otomatis. Tidak ada deployment atau perubahan database.

## Tampilan

- Properti belum dimiliki tidak menampilkan nominal pada papan. Properti dimiliki menampilkan sewa aktif seperti `₦ 6`, tanpa latar tambahan. Nominal ribuan diringkas, misalnya `₦ 1k` atau `₦ 1,2k`; sertifikat dan label aksesibilitas tetap memakai nilai lengkap. Harga beli tersedia di sertifikat dan keputusan pembelian.
- Sewa mengikuti kelompok lengkap, pembangunan, kepemilikan stasiun dan gadai. Utilitas menampilkan pengali dadu karena sewa akhirnya bergantung pada lemparan; efek khusus kartu tetap dihitung oleh engine.
- Kepemilikan memakai garis/tint warna pion. Animasi singkat hanya saat pemilik berubah, tanpa loop dan tanpa replay saat load. Reduced motion menonaktifkannya.
- Rumah/hotel memakai gambar PNG asli yang lebih besar dan jelas. Tidak ada tulisan HOTEL, label P1/P2 atau hitungan × rumah pada papan. Status gadai memakai ikon.
- Avatar WebP baru untuk manusia; persona bot mempertahankan gambarnya di lobi, gameplay, profil, barter dan hasil. Pemetaan manusia menggunakan gambar yang tidak dipakai bot di pertandingan itu.
- Popup compact dibatasi 76% viewport/maksimal 560px; popup lain maksimal 80%/620px. Header/footer tetap, body scroll. Informasi sejajar jika muat; tombol tetap dapat disentuh pada layar kecil.
- Aset hanya memperlihatkan properti pemain yang dilihat. Tab Bangun memuat kelompok yang dimiliki beserta asetnya; kelompok belum lengkap menampilkan ringkasan kekurangan. Detail/aksi disembunyikan sampai dibuka.
- Barter mempertahankan dua sisi, nominal, pilihan properti dan draft ketika membaca sertifikat. Kontrol kartu muncul hanya jika ada kartu atau ada pilihan lama yang perlu dikoreksi. Detail valuasi dilipat.
- Input nominal memakai keyboard native melalui inputmode numeric/decimal. Nol di depan dihapus tanpa pembulatan; 012 menjadi 12, 000 menjadi 0, 00,5 menjadi 0,5. Nilai kosong dan 0, saat mengetik tetap dipertahankan. Nilai 0 dipilih saat fokus. Validasi jumlah tetap memakai unit integer engine.

## Source dan distribusi

- Hapus atlas avatar, logo mata uang, bitmap ikon UI yang digantikan, serta PNG avatar lama setelah dikonversi ke WebP. Aset manusia disimpan pada resolusi 256px; gambar generasi asli berada di workspace di luar repo.
- Hapus source lab NUSA yang tidak diimpor; importer kini menulis satu sumber runtime di lib/bot/nusa-v7. Source algoritme aktif tidak berubah. Hash generator/runtime dipertahankan dalam manifest impor.
- Hapus helper UI tanpa pemanggil, adapter hosting lama, implementasi D1 yang hanya digunakan sebagai bentuk tipe, dan source eksperimen/original yang tidak dieksekusi. Kontrak nullable endpoint lama tetap tersedia sebagai interface.
- Hapus source artwork historis yang tidak dirujuk aplikasi, CSS tanpa pemakai dan deklarasi lama yang tertimpa. Riwayat tersedia melalui Git. Tes, baseline benchmark yang masih diimpor dan engine save lama tetap bagian pengembangan aktif.
- Web, server dan Edge memakai graph dependensi entrypoint masing-masing, termasuk worker dan import dinamis literal. Output Edge tidak lagi menyertakan modul UI/storage. Modul backend tidak diekspos sebagai aset publik.
- Build dan precache memuat aset publik aktif. Tidak menambah dependency produksi. prepare:edge hanya menghasilkan source lokal; tidak men-deploy layanan.

Ukuran sebelum/sesudah dan daftar penghapusan tercatat pada FRONTEND_POLISH_CLEANUP.json. Ukuran adalah byte berkas tanpa kompresi transport, bukan pengukuran kecepatan internet atau pemakaian RAM.

## Verifikasi

npm test
npm run typecheck
npm run check:source
npm run format:check
npm run test:polish:browser

Suite browser memerlukan Playwright dan Chromium. Gunakan MN_BROWSER_MODULE/MN_CHROMIUM_PATH sesuai instalasi, serta MN_BROWSER_OUTPUT untuk screenshot di luar source. Cakupan: 2/4/6 pemain, lebar 320–1280px, landscape pendek, sewa, bangunan, draft, node/caret input, keyboard hints dan animasi kepemilikan. Hasil aktual disimpan pada laporan JSON terkait. Pengujian memakai Chromium/emulasi viewport, belum keyboard Android/iOS fisik atau room Supabase live.
