# Nusantara Digital v1

Permainan ini memakai 40 petak, 22 kota dalam delapan kelompok, empat stasiun, dua utilitas, serta dua deck masing-masing 16 kartu. Semua nominal adalah uang permainan, skala 10× dari tabel ekonomi klasik. Sumber angka, efek kartu, dan aturan terpusat pada `lib/content.mjs` serta `lib/game.mjs`.

Ini adaptasi digital, bukan klaim reproduksi tersertifikasi C1009 atau produk resmi Hasbro. Rulebook C1009 terindeks tetapi unduhan teks penuh belum dapat diverifikasi pada sesi implementasi. Konten kartu ditulis ulang dalam tema Nusantara. Tabel sertifikat mengikuti tabel ekonomi klasik yang lazim; cocokkan dengan satu set sertifikat fisik berlisensi bila kelak mengunci paritas edisi tertentu.

## Ketentuan versi ini

- Modal Rp15.000, gaji Mulai Rp2.000, pajak penghasilan Rp2.000, pajak kemewahan Rp1.000, denda penjara Rp500.
- Dua dadu. Kembar mengizinkan lemparan berikutnya setelah keputusan selesai. Kembar ketiga langsung ke penjara. Kembar untuk keluar penjara tidak memberi lemparan tambahan.
- Sewa otomatis. Tanah kosong dengan kelompok lengkap: 2×. Stasiun 250/500/1.000/2.000, utilitas 4× atau 10× jumlah dadu × Rp10. Efek kartu utilitas menggunakan lemparan baru.
- Lelang bergiliran, pembukaan Rp100, kenaikan minimal Rp1. Pemain yang menolak pembelian tetap ikut. Mundur mengeluarkan peserta dari lelang itu. Tidak ada timer; pemenang adalah penawar tersisa dengan tawaran tertinggi.
- Rumah dibangun dan dijual merata. Empat rumah mendahului hotel. Stok 32 rumah/12 hotel; perintah valid dilayani menurut urutan, tanpa lelang kelangkaan bangunan. Hotel dapat diturunkan menjadi empat rumah bila stok memungkinkan; seluruh bangunan kelompok juga dapat dijual serentak untuk menghindari kebuntuan stok.
- Biaya penjualan bangunan setengah biaya pembelian. Gadai membutuhkan seluruh kelompok tanpa bangunan; kepemilikan tetap, sewa berhenti. Tebus nilai gadai +10%. Uang bilangan bulat; bunga dibulatkan ke atas.
- Utang ditahan sebelum transfer uang. Pemain memilih jual/gadai, lalu melunasi. Kebangkrutan hanya diizinkan bila nilai likuidasi tidak mencukupi. Aset kepada bank dilelang, aset kepada pemain dipindahkan dengan bunga penerimaan aset tergadai 10%.
- Barter beberapa properti, uang, kartu, dengan validasi atomik dan tawaran balik. Penerima aset tergadai membayar bunga 10% sekarang; penebusan kemudian tetap +10%.
- Tidak ada hadiah Parkir Bebas. Menang sebagai satu-satunya pemain aktif.
- Urutan awal mengikuti kursi lobby. Room tanpa timer; tidak ada bot pengganti otomatis saat putus koneksi.

## Referensi pengembangan

- Hasbro C1009: https://www.hasbro.com/common/documents/dad288661c4311ddbd0b0800200c9a66/97DF546B6BF64A70A2A759D3FA5BD804.pdf
- Hasbro Classic: https://www.hasbro.com/common/instruct/00009.pdf
- Groq Structured Outputs: https://console.groq.com/docs/structured-outputs
- Three.js OrthographicCamera: https://threejs.org/docs/pages/OrthographicCamera.html

## Batas versi pertama

Tidak mencakup replay rekonstruksi penuh, statistik lintas pertandingan, lelang bangunan langka, timer, spectator, pergantian host, penyesuaian warna/pion, persona Groq terpisah, atau percakapan bebas dengan Groq. Room memakai polling 1,8 detik dan optimistic concurrency D1, bukan WebSocket. Token kursi tersimpan hanya di perangkat asal; akses lintas perangkat membutuhkan sesi room baru atau pemindahan save secara terkelola pada pengembangan berikutnya.
