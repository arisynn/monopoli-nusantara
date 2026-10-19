# Update 4.11.3 → 4.11.4

Rilis ini memperbaiki popup dan memadatkan lobby online serta pengelolaan aset. Model V23.2, manifest, engine, backend, keamanan worker, dan runtime Termux sama dengan paket 4.11.3. Tidak ada migration baru.

## Perubahan tampilan

- Popup memakai satu teks **Tutup** di paling bawah; preview dan popup jumlah pembangunan memakai **Kembali**. Tombol keputusan seperti Beli, Tawar, Pass, Terima/Tolak barter dan Bangkrut tetap menjalankan aksi aslinya.
- Penerimaan sewa, pembayaran tercatat, gaji, bonus, penjara, hasil lelang dan kartu pemain lain tampil sebagai notifikasi otomatis tanpa tombol. Notifikasi tidak mengambil fokus atau menghalangi sentuhan. Detail ekonomi tetap ada di Riwayat dan profil pemain.
- Kartu Kesempatan/Dana Umum milik manusia dibaca otomatis selama 2,3–6,5 detik sesuai panjang teks. Efek diproses melalui `GameSession.act("ACK")` dengan controller, versi state dan ID aksi yang sama dengan jalur manual. Membuka menu, menyembunyikan halaman atau menjeda permainan menghentikan waktu baca sementara. Kegagalan tidak menimbulkan retry otomatis terus-menerus; tersedia tombol coba lagi. Pilihan beli, lelang, utang, barter, gadai, stok bangunan dan hasil akhir tidak diputuskan otomatis.
- Popup **Terima sewa** hanya berasal dari transaksi sewa yang sudah tercatat untuk kursi manusia lokal. Pengulangan snapshot tidak menggandakan notifikasi; pembayaran beruntun digabung. Reconnect/restore memasang baseline baru agar transaksi lama tidak diputar ulang. Pada Meja Klasik, sewa tetap harus ditagih manual sebelum notifikasi penerimaan muncul.
- Aset Saya menjadi **Properti · Bangun · Pegadaian**. Satu kelompok/sertifikat dibuka pada satu waktu. Tab tetap terlihat saat daftar digulir, dan pencarian, scroll serta item terbuka diingat per tab dan pemilik selama sesi. Aset pemain lain hanya dapat dilihat.
- Di Bangun, daftar properti ringkas menampilkan tingkat bangunan dan sewa. Satu tombol **Bangun** per kelompok membuka popup jumlah. Jumlah **1** menyediakan pilihan properti tujuan; jumlah lebih besar dibangun merata dengan pemeriksaan saldo, kepemilikan dan stok sebelum setiap langkah. Kembali membatalkan pilihan sebelum transaksi. Setelah konfirmasi, tampilan kembali ke kelompok asal. Jual bangunan satuan tersedia di baris aset; jual seluruh bangunan kelompok hanya ditampilkan sekali dengan konfirmasi.
- Semua gadai/tebus manual berada di **Pegadaian**, dengan filter Bisa digadai/Sedang digadai, nilai dana diterima, pokok, bunga, biaya tebus, dan alasan aksi tidak tersedia. Keputusan wajib atas properti tergadai yang diterima melalui barter tetap mengikuti popup keputusan engine.
- Tombol Menu diperbaiki: membuka menu permainan, sedangkan unduh diagnostik hanya melalui Pengaturan. Kembali ke lobby dan lanjut room diperiksa pada pengujian multiplayer.
- Lobby online dipadatkan untuk 2–6 peserta. Status koneksi, kode dan kesiapan tetap terlihat. Baris kontrol memakai grid dan jarak tetap; aksi Kelola/Keluar berupa kontrol teks yang lebih ringan.
- UI statis tidak dapat diseleksi lewat long press. Input tetap mendukung pengeditan, paste dan autofill. Tombol Salin menyalin **kode delapan karakter**, menggunakan Clipboard API atau fallback dari gesture pengguna. Keberhasilan hanya ditampilkan jika metode salin berhasil; browser/perangkat tetap dapat menolak akses clipboard.

## Update GitHub dan Vercel

1. Cadangkan source/config privat. Ekstrak ZIP ke direktori terpisah dan salin source ke working tree proyek, pertahankan `.git`, `.env*`, `.nusa-online`, dan identitas proyek Vercel. ZIP juga membawa output `dist`/`server-dist`, dokumentasi dan tes. Jangan mengunggah ZIP sebagai pengganti source repository.
2. Review perubahan: utama di `frontend/`, versi di `package.json`, `package-lock.json`, `lib/version.mjs`, serta tes/dokumentasi. Jalankan:

```bash
npm ci
npm run typecheck
npm test
npm run check:source
node scripts/verify-speed-model.mjs
```

3. Commit dan push branch pembaruan ke repository sendiri. Deploy preview Vercel dengan build `npm run build`, lalu cek `build.json` menampilkan `4.11.4`. Region Singapore dan environment Supabase/Groq/worker yang sudah berfungsi tetap dipertahankan. Setelah dicek, promosikan deployment sesuai alur proyek.
4. Browser/PWA yang masih terbuka perlu kembali ke lobby lalu memperbarui aplikasi atau reload. Tidak perlu menghapus simpanan, logout, atau mereset room.

Jika backend masih **4.11.2**, ikuti dahulu `docs/ONLINE_SPEED_UPDATE.md` untuk migration 008 dan deployment backend. Instruksi tidak ada migration baru di sini berlaku untuk instalasi **4.11.3 yang sudah lengkap**.

## Termux

Worker 4.11.3 dengan manifest V23.2 yang cocok dapat terus dipakai. Tidak perlu menghentikan worker, pairing ulang, menjalankan SQL aktivasi ulang, atau mengubah PM2 untuk pembaruan UI ini. Untuk instalasi baru gunakan `INSTALL.md`/`docs/TERMUX_ONLINE.md` dan `bash nusa-online.sh`. Jangan menyalin atau membagikan folder `.nusa-online`.

## Verifikasi dan batas pengujian

Validasi rilis: **678/678** tes inti/frontend, **41/41** pemeriksaan UI Chromium, **14/14** skenario multiplayer browser, typecheck dan **619** modul source/output tanpa kegagalan. Selftest worker lolos untuk enam persona dan bid minimal ₦5.

Hasil regresi tersimpan di `docs/CLASSIC_TEST_RESULTS.json`, pemeriksaan DOM/clipboard/mobile di `docs/audits/UI_4114_BROWSER_RESULTS.json`, dan pembandingan runtime dengan ZIP 4.11.3 di `docs/audits/UI_4114_RUNTIME_LOCK.json`. Model diperiksa dengan 51 checksum dan checksum berkas manifest. Uji browser memakai Chromium nyata, viewport mobile, state/transport terkontrol; pengujian ini tidak menghubungi layanan Supabase/Vercel produksi atau Android fisik.

Regresi mencakup auto-ACK, jeda timer, kegagalan jaringan, snapshot ganda, reconnect baseline, klaim sewa manual, burst penerimaan sewa, transaksi gadai/tebus, jumlah dan lokasi pembangunan, ketukan ganda, serta popup dan batas layar kecil. Diagnostik dan benchmark P50/P95 optimasi online sebelumnya tetap disertakan dalam `docs/ONLINE_SPEED_UPDATE.md` dan `docs/audits/ONLINE_SPEED_*`; angka lokal tersebut bukan pengukuran latensi produksi baru.
