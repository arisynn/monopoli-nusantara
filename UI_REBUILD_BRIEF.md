> Brief historis pemisahan logic. UI baru sudah diimplementasikan berdasarkan 10 referensi yang tercatat di design/SOURCE_OF_TRUTH.json. Panduan aktif: README.md dan docs/FRONTEND_GUIDE.md.

# Brief UI baru untuk AI

Mockup sebelumnya ditolak dan file gambarnya sudah dihapus sesuai instruksi pemilik. Tidak ada mockup yang dianggap desain final atau disertakan dalam paket ini. UI berikutnya harus dirancang ulang berdasarkan kebutuhan, bukan menyalin gambar yang ditolak.

Permintaan pemilik produk: buat ulang tampilan saja menggunakan paket logic ini. Jangan membuat ulang ekonomi, engine, AI, room atau protokol demi kemudahan implementasi UI.

## Arsitektur pengalaman

Hanya dua jenis page layar penuh:

1. **Menu Utama** — VS Bot, Online, Lanjutkan; akses Profil/Pengaturan/Aturan. Setup VS Bot, login, Create/Join/Resume Room dan lobby dibuka sebagai popup dari menu ini.
2. **Gameplay** — papan sebagai fokus, kapsul pemain compact dalam dua baris untuk 6 peserta, dadu tetap dalam area UI dan action deck mudah dijangkau.

Semua fitur lain berupa popup/bottom sheet di atas page asal, bukan navigasi ke page penuh baru. Gunakan satu modal aktif: picker aset menggantikan popup barter sementara, lalu kembali; jangan tumpuk modal berlapis tanpa fokus/back yang jelas.

## Gaya dan akses langsung

Arcade compact, navy/krem/emas, papan dan pion Indonesia existing, tipografi terbaca, tombol jelas dan jarak efisien. Setiap area punya fungsi; tidak mengejar panel kosong atau heading besar. “Padat” tetap membutuhkan keterbacaan, safe area dan target sentuh yang nyaman.

Konsol aksi mencakup tray dua dadu, informasi giliran singkat dan satu aksi utama kontekstual. Shortcut yang mudah ditemukan dapat memakai dua baris tiga tombol: Aset / Barter / Riwayat dan Bangun / Room / Lainnya. Ini kontrol permainan, bukan alasan menambah page penuh. Jika tombol Bangun dibuka tanpa hak/legal target, tampilkan penjelasan dan portofolio, jangan bypass engine.

Dadu tidak dilempar ke tengah papan. Urutan visual memakai queue yang telah disediakan. Pertahankan pan/pinch, mode seluruh papan/ikuti pion, reduced motion dan feedback uang di kapsul. Jangan mengubah state gameplay dari callback animasi.

## Popup yang perlu dibangun

- Setup VS Bot: total 2/3/4, satu manusia, Raka/Bima/Sari tetap; empat model existing dapat dipilih sesuai source.
- Online Create/Join/Resume, identitas email/password/tamu dan lobby; kode room baru **8 karakter**, bukan 6.
- Aset: owner filter, pencarian, bangunan, gadai, tebus, stok bank. Aset lawan read-only.
- Sertifikat properti dan kelola/bangun/jual; konfirmasi tindakan ekonomi penting.
- Barter: susun, picker aset, tawaran masuk, counteroffer. Label memberi/menerima harus sesuai perspektif.
- Riwayat dan detail transaksi dari ledger, tanpa pembayaran kedua.
- Profil: identitas dan statistik pertandingan yang memang tersedia. Jangan mengarang rank/achievement/account stats yang backend belum punya.
- Lelang aktif/hasil; kartu publik; penjara; utang; penerimaan properti tergadai; permintaan stok bangunan; hasil pertandingan.
- Voting pause; room paused/ready resume; koneksi terputus sebagai indikator kecil.
- Pengaturan, simpanan lokal/ekspor/impor, aturan/bantuan, pemilihan pion pregame.

Mockup adalah arahan visual, bukan kontrak nilai/hak/aksi. Nama kota, harga, sewa, jumlah petak, legalitas bangunan dan tipe aksi selalu berasal dari source. Jangan mengubah aturan agar cocok dengan angka ilustrasi mockup.

## Urutan implementasi yang disarankan

Bangun Menu/Gameplay shell → tampilkan BOARD/player/asset → lokal turn actions → popup keputusan → bot worker → timeline dadu/pion/event/ledger → save/load → Auth/room/Realtime → pause/reconnect → QA perangkat dan build. Setelah setiap tahap jalankan tes terkait. Catat dengan jelas mana hasil simulasi dan mana backend live.

Panduan integrasi teknis yang wajib dibaca: `AI_UI_INTEGRATION.md`.
