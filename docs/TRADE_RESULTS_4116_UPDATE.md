# NUSA 4.11.6 — Popup hasil barter

Basis: paket NUSA_ONLINE_TERMUX_4.11.5.zip yang diunggah pengguna.

## Perubahan

- Modal hasil barter berhasil, ditolak penerima, atau dibatalkan pengirim.
- Hasil berhasil langsung memuat bagian **Anda menerima** dan **Anda memberi**, meliputi properti, Nusa, kartu bebas penjara dan status gadai saat transaksi.
- Sudut pandang disesuaikan dengan kursi pengguna, termasuk setelah tawaran balik.
- Tetap memakai modal bersama: header tetap, isi dapat digulir, penutup **Tutup**, tipografi dan kartu barter yang sama. Tidak ada timer penutup otomatis.
- Hanya pihak barter manusia yang mendapat popup; transaksi pihak lain tetap tercatat di Riwayat.
- Antrean hasil terpisah dari animasi online dan notifikasi singkat. Hasil belum dibaca disimpan di perangkat dan dipulihkan saat refresh pada state yang sesuai; polling dan reconnect tidak menggandakan popup. Kunjungan pertama menjadi baseline, sehingga riwayat lama tidak diputar ulang.
- Modal manual atau presentasi yang sedang berjalan selesai lebih dahulu. Keputusan berikutnya, termasuk bunga/tebus gadai, tetap memakai modal dan aturan lama. Membaca/menutup hasil tidak menjalankan perintah game.

## Batas perubahan

Board, kamera, pion, aset gambar, aturan barter, saldo awal, dadu, lelang dan algoritma/model bot tidak diubah. Seluruh file dalam manifest model V23.2, termasuk lib/game.mjs, dipertahankan byte-identik.

Metadata tradeOffer/tradeResult ditambahkan pada log yang sudah dihasilkan engine melalui lib/trade-command.mjs. Wrapper dipakai pada jalur manusia lokal/online, bot lokal, bot Edge dan commit hasil Termux. Validasi, transfer dan increment versi tetap dilakukan engine resmi; tidak ada transfer kedua.

## Penerapan

1. Cadangkan source dan simpanan yang sedang dipakai.
2. Terapkan source 4.11.6 ke repository yang sama. Jangan menghapus .env, folder .nusa-online, pairing atau data lokal.
3. Deploy frontend dan backend dari paket/commit yang sama. Ini diperlukan agar event hasil barter berisi rincian terstruktur. Server lama tidak menjamin popup hasil lengkap.
4. Jika Edge Function monopoli-bots masih digunakan, deploy salinan worker yang disiapkan paket ini. Source _shared sudah disinkronkan dari lib/ melalui npm run prepare:edge.
5. Gunakan nusa-online.sh dengan cara pembaruan/restart yang biasa. Model/manifest/protokol tetap sama; pairing ulang dan SQL migration baru tidak diperlukan untuk fitur ini.
6. Muat ulang aplikasi/PWA setelah deployment aktif. Trade yang sudah tertunda di save lama tetap dapat diselesaikan oleh backend baru.

Tidak ada deployment atau perubahan database live yang dilakukan dalam pengerjaan paket ini.

## Verifikasi

- npm run test:trade:results
- npm run test:trade:results:browser (memerlukan Playwright dan Chromium; dukung MN_BROWSER_MODULE dan MN_CHROMIUM_PATH)
- npm test
- npm run typecheck
- npm run check:source
- node scripts/verify-speed-model.mjs

Hasil yang benar: setiap penerimaan/penolakan/pembatalan muncul sekali untuk pihak terkait, rincian penerimaan selalu sesuai sisi transaksi, dan menutup popup tidak mengubah saldo atau kepemilikan. Rincian memakai snapshot transaksi, sehingga perubahan aset setelahnya tidak mengubah isi hasil lama.

Penyimpanan popup bersifat per perangkat/per kursi. Jika penyimpanan browser diblokir atau penuh, popup tetap bekerja selama sesi berjalan, tetapi pemulihan setelah refresh tidak dapat dijamin. Jika tidak ada cursor perangkat sebelumnya, log lama tidak otomatis diputar ulang. Log engine tetap dibatasi jendela 300 event; hasil yang tidak pernah diterima sebelum jendela tersebut berlalu tidak direkonstruksi dengan menebak.
