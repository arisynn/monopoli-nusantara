# Monopoli Nusantara 2.3.0 — Papan 2D & Kamera Pintar

Prioritas rilis ini adalah papan yang tajam, ringan, dan bisa dijelajahi pada HP portrait. Bentuk papan mengikuti susunan klasik: empat petak sudut besar, sembilan petak di setiap sisi, serta pita kelompok warna menghadap pusat. Ke-40 petak Nusantara tetap dalam urutan semula; data, harga, aturan, kartu, dan kompatibilitas save tidak diubah.

- Papan SVG vektor menggantikan Three.js/WebGL sepenuhnya. Tidak ada foto, tekstur 3D, bayangan GPU, atau loop render ketika papan diam. Library Three.js juga dihapus dari dependency.
- **Ikuti pemain**: tampilan dekat, mengikuti lintasan pion yang bergerak. Perpindahan ke penjara langsung dan reduced motion tetap didukung. Save yang dibuka tidak memutar ulang gerakan lama.
- **Seluruh papan**: menghitung ulang ukuran agar empat sudut masuk viewport. Susunan papan tidak diputar.
- **Jelajah manual**: satu jari untuk geser; dua jari untuk pinch/pan; wheel atau tombol +/− untuk zoom. Area kamera selalu berbatas pada papan. Gerakan tidak dianggap sebagai ketukan petak. Kamera tidak mengambil alih lagi sampai Ikuti pemain ditekan.
- Minimap menunjukkan posisi pemain dan area pandang; ketuk minimap untuk menuju area lain. Pion memakai nomor dan warna yang sama dengan badge kartu pemain. Petak menampilkan pemilik, rumah/hotel, gadai, dan seleksi.
- Keyboard: fokus papan, pan memakai tombol panah, zoom dengan +/−; Tab memilih petak dan Enter/Spasi membuka detailnya.
- Layout portrait dan dock aksi tetap dalam viewport. Detail panjang memakai panel dengan gulir sendiri.
- Preferensi kamera lama dimigrasikan; opsi kualitas 3D dihapus. Mode awal untuk perangkat baru adalah Ikuti pemain.

Supabase 2–4 pemain dan alur pembukaan kartu merupakan tahap selanjutnya, belum masuk rilis ini. Room online yang sudah ada tetap menggunakan Redis pada Vercel atau D1 pada Sites. Konfigurasi Vercel tidak berubah.

Lihat `QA_BOARD_2D.md` untuk verifikasi aktual dan batas pengujian. ZIP berisi source, lockfile, konfigurasi Vercel, aset UI, dokumentasi, dan tes. Tidak ada publikasi ke situs live pada rilis ZIP ini.
