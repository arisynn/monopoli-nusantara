# Monopoli Nusantara 2.2.0 — Portrait 2.5D

Pembaruan ini menerapkan arah mockup ke antarmuka permainan yang dapat dimainkan. Susunan 40 petak, data sertifikat/kartu, aturan, dan aset gambar v2 dipertahankan.

## Tampilan HP

- Beranda dan gameplay memakai tinggi viewport dinamis, termasuk safe area serta perubahan bilah browser. Halaman utama tidak memanjang ke bawah.
- Informasi pemain di atas, papan di tengah, aksi utama dan navigasi di bawah. Pada layar pendek, kartu pemain dipadatkan; 5–6 pemain tetap memakai dua baris.
- Beli/lelang, lempar awal, lempar dadu, dan akhiri giliran tersedia langsung di dock. Kartu, lelang, penjara, utang, barter, dan keputusan stok bangunan tersedia melalui panel lengkap.
- Menu Aset, Barter, Riwayat, sertifikat, pengaturan, dan formulir meja mempunyai area gulir sendiri. Tombol tutup/kembali tersedia; halaman papan tetap terkunci.
- Kamera 2.5D bersudut tetap. Ukuran tampilan seluruh papan dihitung dari ruang yang tersedia; empat sudut tidak dipangkas oleh frustum. Zoom/pan hanya mengubah tampilan, bukan susunan petak. Pilih Seluruh papan untuk kembali dari fokus/zoom.
- Kualitas grafis Ringan, Seimbang, Detail tinggi, serta 2D opsional; kehilangan konteks WebGL beralih ke papan 2D. Render dihentikan ketika tab tersembunyi dan tidak terus menggambar ketika papan diam.

## Penyimpanan dan koneksi

- Lima slot lokal manual dan satu arsip permainan sebelumnya, di samping autosave.
- Ekspor/impor cadangan JSON lokal: memeriksa versi, pemain, posisi, kepemilikan, stok, deck, dan keputusan tertunda. Token room tidak diekspor.
- Pengaturan suara, animasi, kualitas, kamera, dan serah giliran disimpan di perangkat.
- Request room memakai timeout/pembatalan, polling tanpa tumpang tindih, jeda ketika tab tersembunyi, reconnect bertahap, dan pemeriksaan revision/session untuk mencegah respons terlambat menimpa state baru. Mutasi dinonaktifkan ketika belum tersambung.

## Deploy

Konfigurasi Vercel v2.1 dipertahankan: Next.js native, Node 24, lockfile pnpm, output `.next`, Redis REST untuk room, dan Groq di server. Lihat `DEPLOY_VERCEL.md`. ZIP berisi source dan aset, bukan dependency atau output build.

Rilis ini tidak mengubah deployment live. Lihat `QA_PORTRAIT.md` untuk hasil pengujian aktual dan batas verifikasi.
