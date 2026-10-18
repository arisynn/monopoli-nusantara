# Hasil implementasi 4.11.1

Dokumen ini adalah catatan rilis 4.11.1. Untuk pembaruan dan hasil tes 4.11.2, baca `GUARD_FIX_INTEGRATION.md`; berkas hasil PostgreSQL/PM2 yang namanya tetap memuat hasil pengujian terbaru.

Paket ini melanjutkan audit historis `NUSA_V23_FINANCE_LOOP_AUDIT.md` dan rencana `TERMUX_ONLINE_WORKER_PLAN.md`. Laporan audit tersebut menggambarkan kondisi sebelum perbaikan.

## Perubahan

- Semua persona memakai penjagaan riwayat transaksi agar gadai dan tebus tidak saling membatalkan pada konteks ekonomi yang sama. Utang dan perubahan konteks permainan tetap diproses. Jalur gadai untuk pembangunan/pembelian disimpan sebagai rencana lanjutan yang divalidasi ulang. Penilaian tebus memakai saldo sesudah pembayaran; bonus gadai Kresna memerlukan pembangunan yang layak.
- Lelang menggunakan kelipatan dan kenaikan minimum N5 pada engine, bot, dan antarmuka. Bid lama yang berada di luar kelipatan dibulatkan ke ambang sah berikutnya.
- Worker Termux menjalankan model lokal dalam kumpulan compute thread; Supabase tetap memegang state, RNG, validasi, lease, dan commit. CLI `bash nusa-online.sh` mengelola PM2, konfigurasi, koneksi, status, serta monitor lima event terakhir. Log lengkap dirotasi dalam file privat.
- Pairing terbatas room, token worker yang dapat dicabut, lease, pemeriksaan versi, dan receipt atomik mencegah aksi ganda atau worker lama mengirim aksi. Tidak ada kredensial administrator yang dibutuhkan perangkat. Groq opsional, dibatasi waktu, dan menggunakan fallback lokal.
- Manifest mengunci 50 berkas model/engine yang digunakan worker. Model tetap berasal dari versi repository yang diaudit, dengan koreksi keuangan/lelang yang tercatat; fixture benchmark historis tidak dipakai sebagai model runtime.
- Tiga gambar lama tanpa referensi runtime dipertahankan dalam `design/retired-assets/` agar pemeriksaan aset publik yang sudah ada kembali lulus.

## Verifikasi yang selesai

- Suite proyek: **617/617 lulus**, tanpa tes dilewati.
- Regresi worker dan keuangan terarah: **39/39 lulus**.
- PostgreSQL 17 terisolasi: migrasi, RLS, pairing, pembatasan room, lease bersamaan, receipt atomik, recovery lease, pencabutan worker, dan dua room dengan enam persona. 180 iterasi penjadwalan, 168 aksi bot, dan 110 bid sah. Rincian: `TERMUX_POSTGRES_RESULTS.json`.
- PM2 6.0.14 sungguhan di Linux: start, restart, pemulihan konfigurasi, stop, dan pelepasan lock. Backend HTTP untuk tes ini berupa mock. Rincian: `TERMUX_PM2_RESULTS.json`.
- Benchmark model: 1.500 aksi, 282 bid, tidak ada aksi ilegal atau pembalikan keuangan yang terlarang. Ketiga simulasi dihentikan pada batas 500 aksi, bukan dinyatakan selesai atau mempunyai pemenang. Rincian: `TERMUX_MODEL_BENCHMARK.json`.

## Batas verifikasi dan aktivasi

Pengujian belum dilakukan pada perangkat Android fisik maupun Supabase hosted dengan Auth/Realtime asli. Tidak ada deployment atau perubahan pada database online pengguna. Harness staging tersedia dalam `scripts/test-termux-staging.mjs`.

Ikuti `INSTALL.md` atau `docs/TERMUX_ONLINE.md` untuk memperbarui backend/frontend, menerapkan migrasi, mengaktifkan provider Termux, dan membuat kode pairing. Koneksi internet, pembatasan baterai Android, serta kapasitas perangkat tetap memengaruhi respons pertandingan. Ketika worker offline, state tetap tersimpan dan giliran bot menunggu recovery; tidak ada perpindahan diam-diam ke Edge.
