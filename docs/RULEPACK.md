# Klasik Nusantara v2 — acuan C1009

Aturan dasar mengacu pada **Hasbro Monopoly C1009 ©2016, lembar cetak 15 Februari 2017**, dua halaman lembar lipat. Nama kota, gambar, dan narasi kartu memakai tema Nusantara. Ini bukan produk resmi Hasbro dan bukan klaim kesetaraan seluruh edisi Monopoly.

Sumber primer: https://www.hasbro.com/common/documents/dad288661c4311ddbd0b0800200c9a66/97DF546B6BF64A70A2A759D3FA5BD804.pdf

PDF dibaca penuh pada 14 Oktober 2026. Nominal game memakai skala 10× dari unit pada rulebook. Semua nominal adalah uang permainan. Harga, sewa, bunga, dan saldo menggunakan bilangan bulat; bunga dihitung `ceil(nilaiGadai / 10)`, bukan perkalian floating point.

## Dua pilihan sewa

- **Klasik Digital:** mekanik yang sama, dengan sewa dibukukan otomatis. Ini otomatisasi yang disengaja.
- **Meja Klasik:** pemilik harus menagih sebelum pemain berikutnya melempar. Melewatkan batas tersebut menghapus klaim. Dadu kembar pemain yang sama tidak mengakhiri kesempatan menagih. Tombol Tagih menunjukkan pemilik, pembayar, properti, dan jumlah.

Pilihan ditetapkan saat membuat permainan/room. Pemain lain melihatnya di lobby. Permainan yang sudah mulai tidak mengganti rulepack.

## Cakupan mekanik

| Sistem | Perilaku v2 | Acuan |
|---|---|---|
| Pemain | 2–6, sesuai sampul PDF yang dipilih; duel tetap 1 manusia + 1 bot/AI | C1009 hlm. 1 |
| Awal | Setiap pemain melempar dua dadu; tertinggi mulai; setelah itu urutan kursi melingkar | Hlm. 2 |
| Modal / Mulai | Rp15.000 / Rp2.000; perpindahan langsung ke penjara tidak mendapat gaji | Hlm. 2 |
| Papan | 40 petak; 22 kota, 4 stasiun, 2 utilitas, 6 kartu, 2 pajak, 4 sudut | Komponen dan papan |
| Sertifikat | 28 aset dengan harga, sewa, nilai gadai, tebus, dan biaya bangun jika kota | Hlm. 1–2; batas verifikasi di bawah |
| Dadu | Kembar memberi lempar ulang; kembar ketiga langsung penjara | Hlm. 2 |
| Beli / tolak | Beli pada harga sertifikat atau lelang untuk semua, termasuk pemain yang menolak | Hlm. 1 |
| Lelang properti | Terbuka: semua peserta boleh BID. Mulai ₦5; kelipatan ₦5; kenaikan minimal ₦5 (50 unit dasar engine) | Hlm. 1 |
| Sewa kota | Sesuai tingkat bangunan; tanah kosong dalam set lengkap 2×; aset tergadai tidak menagih | Hlm. 1–2 |
| Stasiun | 1/2/3/4: Rp250/500/1.000/2.000 | Hlm. 2 |
| Utilitas | Dua dadu baru untuk sewa; 4× atau 10× jumlah ×Rp10. Dadu sewa terpisah dari dadu gerak | Hlm. 2 |
| Rumah / hotel | Set lengkap tanpa gadai; bangun dan jual merata; 4 rumah lalu hotel; maksimum 1 hotel/petak | Hlm. 1 |
| Stok | 32 rumah dan 12 hotel. Stok nol menolak bangunan baru. Kelangkaan memicu pemeriksaan minat, lalu lelang bila peminat melebihi stok | Hlm. 1 |
| Bangun di luar giliran | Tersedia saat tidak sedang menyelesaikan keputusan yang memerlukan serialisasi | Hlm. 1 |
| Gadai | Jual semua bangunan kelompok dahulu; terima nilai gadai; kepemilikan tetap | Hlm. 1 |
| Tebus | Pokok gadai +10%; aset lain yang tidak tergadai tetap mendapat bonus set | Hlm. 1 |
| Terima aset tergadai | Pilih langsung tebus 110%, atau bayar bunga 10% sekarang dan tetap tergadai; tebus nanti 110% lagi | Hlm. 1 |
| Barter | Beberapa properti, uang, dan kartu; di luar giliran, saat berutang, dan di sela penawaran lelang; transaksi atomik | Hlm. 1 |
| Bangunan saat barter | Tidak ditransfer ke pemain lain; harus dijual ke bank dahulu | Hlm. 1 |
| Penjara | Bayar Rp500/kartu sebelum roll, atau coba kembar maksimum 3 giliran; gagal ketiga bayar lalu bergerak; kembar keluar tidak memberi bonus roll | Hlm. 2 |
| Aktivitas di penjara | Tetap bisa menerima sewa, membangun, gadai, barter, dan ikut lelang | Hlm. 2 |
| Pajak | Penghasilan Rp2.000; kemewahan Rp1.000 | Hlm. 2 |
| Kartu | Dua deck 16 kartu, berputar; kartu bebas ditahan dan kembali saat dipakai; perpindahan menyelesaikan petak tujuan | Hlm. 2; batas konten di bawah |
| Utang | Tidak mengkredit uang fiktif; jual bangunan, gadai, atau barter untuk menggalang dana | Hlm. 1 |
| Bangkrut ke pemain | Aset, sisa kas setelah penjualan bangunan, dan kartu ke kreditur; pilih penanganan gadai | Hlm. 1 |
| Bangkrut ke bank | Gadai dibatalkan, properti dilelang, kartu bebas kembali ke deck | Hlm. 1 |
| Parkir Bebas | Tanpa jackpot | Hlm. 2 |
| Menang | Pemain terakhir yang bertahan, bukan batas kekayaan/putaran | Hlm. 1 |
| Larangan pinjaman pribadi | Tidak ada fitur meminjam uang antar pemain atau menjual bangunan langsung ke pemain lain | Hlm. 1 top tips |

## Prosedur digital yang dinyatakan terbuka

1. **Hasil awal seri:** peserta yang sama-sama tertinggi melempar ulang. Rulebook tidak merinci tiebreak.
2. **Penutupan lelang:** tanpa timer. Lelang ditutup setelah semua peserta selain penawar tertinggi memilih tidak menaikkan tawaran itu. Bid baru menghapus status tidak menawar, sehingga peserta boleh masuk kembali. Di hotseat, pilih penawar melalui dropdown; di room, token kursi mengikat identitas.
3. **Stok bangunan:** saat stok menipis, setiap pemain yang punya lokasi sah diberi kesempatan meminta satu bangunan. Jika permintaan melebihi stok, bangunan dilelang satu per satu. Selama keputusan minat dan penerimaan gadai, transaksi lain menunggu agar tidak merusak syarat yang sedang dihitung.
4. **Cadangan lelang:** kas penawaran tertinggi tidak boleh dihabiskan melalui barter/tebus. Kelompok yang diperlukan untuk bangunan yang ditawar harus tetap memenuhi syarat. Penjualan dan gadai aset lain dapat menggalang kas.
5. **Penjualan seluruh set:** tombol menjual semua bangunan sekaligus meringkas urutan penjualan merata. Untuk hotel ketika stok empat rumah tidak tersedia, digunakan klarifikasi penjualan hotel satu kelompok dari rulebook Hasbro 00009 hlm. 7; C1009 sendiri tidak merinci kasus tersebut. Sumber pembanding: https://www.hasbro.com/common/instruct/00009.pdf . Aturan pajak, utilitas, batas klaim sewa, dan lelang dari edisi lama tersebut tidak dipakai.
6. **Pembayaran kepada beberapa pemain:** kartu diselesaikan berurutan menurut kursi. Rulebook ringkas tidak merinci distribusi saat insolven pada beberapa kreditur sekaligus.
7. **Bank:** pembukuan digital tanpa pecahan uang kertas; bank tidak dibatasi kas fisik. Nominal antarmuka memakai Nusa: 10 unit dasar engine = ₦1. Sejak pembaruan lelang aktif, pembuka dan kenaikan minimal adalah ₦5 (50 unit dasar engine); ini prosedur digital Nusantara yang disengaja.

## Batas verifikasi yang tidak boleh disembunyikan

PDF resmi memuat contoh beberapa sertifikat, tabel stasiun/utilitas, serta jumlah komponen. PDF **tidak memuat seluruh wajah 28 sertifikat dan 32 kartu**. Empat contoh kota yang terlihat cocok dengan tabel game; sisa data ekonomi dan efek kartu mengikuti konten klasik yang sudah digunakan pada v1, dengan teks Nusantara. Seluruh 32 efek diuji dapat dijalankan, tetapi itu tidak membuktikan seluruh nominal/konten identik dengan satu set fisik C1009.

Karena itu rilis ini menyediakan seluruh kategori mekanik utama yang diaudit, dengan prosedur digital yang dijelaskan, tetapi **belum diberi label “100% identik C1009”**. Untuk klaim tersebut, masih diperlukan verifikasi inventaris kartu/sertifikat lengkap dari edisi fisik yang sama dan pengujian interaksi browser/perangkat nyata.

## Save lama

`schemaVersion: 1` tetap dijalankan oleh `game-v1.mjs` dan `content-v1.mjs`, dengan label aturan lama. Save tersebut tidak diam-diam memperoleh perubahan ekonomi/prosedur v2. Pertandingan baru memakai schema 2 dan rulepack `nusantara-c1009-2`.
