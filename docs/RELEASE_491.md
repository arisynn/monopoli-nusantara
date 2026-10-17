# 4.9.1 — Sertifikat Ringkas & Barter Informatif

Basis: GitHub main 604342c (4.9.0). User menyetujui rencana miniatur sertifikat dan kemudian meminta nilai/detail properti di barter tanpa menutup popup. Implementasi berada pada renderer frontend, navigasi dialog dan CSS; bot, engine, backend, Supabase schema dan ENV tidak diubah.

## Hasil

`propertyHero` dipakai oleh pembayaran sewa, lelang properti/bangunan, penerimaan aset tergadai dan renderer konfirmasi gadai/jual set. Gambar kosong sekarang menjadi miniatur dengan nama, warna kelompok, nilai sewa/gadai aktual dan ilustrasi stasiun/utilitas yang mengikuti sertifikat lengkap. Miniatur adalah tombol berlabel aksesibel; teks kecilnya dekoratif, sementara nama/harga/pemilik di luar miniatur tetap terbaca. Sertifikat lengkap memakai renderer lama yang sama.

Pembayaran memisahkan **Harga tanah N 140** dari **Sewa dibayar N 10**. Teks teknis disederhanakan menjadi “Pembayaran sudah tercatat.” Menutup tampilan detail mengembalikan ringkasan transaksi; hanya tombol Selesai pada transaksi yang melewati presentasi. Membuka/menutup detail tidak memotong saldo lagi.

Barter (pilihan, draft, tawaran masuk, tawar balik) menampilkan harga beli, nilai gadai, status bangunan/gadai dan konsekuensi biaya menerima properti tergadai. Jumlah “Nilai beli aset” menghitung properti per sisi, terpisah dari uang barter; tidak mengklaim nilai pasar/kewajaran. Semua angka berasal dari BOARD/assets dan redemption, bukan nilai perkiraan model. Pemilihan checkbox dan tombol hapus terpisah dari tombol detail. Pemilik berubah/bangunan masih ada tetap mengikuti validator dan pesan pilihan existing.

Detail sertifikat read-only memakai tombol Kembali. Escape, klik luar dan browser Back masuk melalui mekanisme kembali yang sama. Popup manual, scroll dan fokus dipulihkan; konteks otomatis dihitung kembali dari state/presentation saat ini. Konteks pertandingan lain dibuang. Tidak memanggil ACK, pembayaran, penawaran, penerimaan atau perintah aset ketika mengintip sertifikat. Form uang dan draft per lawan/counteroffer tidak di-reset. Preview tidak menyediakan pintasan Kelola yang melewatkan keputusan aktif. Density mendeteksi token class lengkap sehingga mini-deed tetap compact, sementara deed/kartu/katalog tetap preserved.

## Estimasi laba/rugi acuan

Panel berlaku pada draft, penawaran masuk dan tawar balik. Nilai aset normal = harga beli. Nilai aset tergadai = maks(0, harga beli − biaya tebus saat diterima), memakai redemption dari rulepack. Nilai per sisi = jumlah nilai aset bersih + uang. Estimasi = nilai diterima − nilai diberikan, dari perspektif pemain yang melihat; pengamat ditandai memakai perspektif pengirim. Positif tampil sebagai estimasi laba, negatif estimasi rugi, nol sebagai selisih acuan nol. Contoh: menerima Stasiun Gambir yang tergadai bernilai acuan N 90 (harga N 200 − tebus N 110) untuk Padang N 140 berarti −N 50; tambahan uang N 100 dari pengirim mengubahnya menjadi +N 50.

Ini bukan laba kas aktual atau rekomendasi menerima/menolak. Sewa masa depan, monopoli dan kartu bebas penjara tidak diberi harga; kartu yang ada ditandai eksplisit. Dasar perhitungan tersedia melalui details. Draft kosong, nilai tidak valid atau kepemilikan stale tidak mendapat angka estimasi yang menyesatkan. Input uang memperbarui hanya panel estimasi agar isi/cursor form tidak diganti; details yang sedang terbuka tetap terbuka. Memilih/menghapus aset, mengganti lawan dan menerima counteroffer mengikuti renderer/validator existing. Hasil estimasi tidak dimasukkan ke intent, snapshot atau database.

## Lelang adaptif dan transisi

Empat peserta memakai grid 2×2 dengan avatar/nama/status mendatar; 5–6 peserta memakai tiga kolom pada lebar cukup, dua pada lebar 320. Harga tertinggi dan input disusun mendatar agar tidak menghabiskan tinggi dialog. Footer tetap dapat dijangkau dengan scroll internal.

Akar bug re-entry ada pada UI yang menonaktifkan BID bersamaan dengan PASS untuk pemain yang pernah melewati. Engine sudah mengizinkan BID ulang selama lelang masih aktif dan mengosongkan passed setelah kenaikan harga. Kini BID tetap tersedia untuk peserta yang memenuhi syarat, PASS berulang dinonaktifkan, serta status roster mengikuti state baru. Bot yang sudah melewati kembali eligible setelah harga dinaikkan; tidak menghidupkan kembali lelang yang sudah selesai.

Saat menang, antrean presentasi memiliki pembayaran sebelum hasil. Sebelumnya financialSettlement kind auction membuat autoPopup null, menutup dialog sesaat sebelum hasil sehingga tampak berkedip. Sekarang dialog lelang tetap ada dalam keadaan read-only hingga hasil ditampilkan. Tidak mengulang transfer atau menambah perintah engine. Identitas lelang dipakai untuk mengosongkan nominal draft pada lelang berikutnya, sambil mempertahankannya ketika bidder berubah pada lelang yang sama.

QA khusus lelang **16/16** di AUCTION_BROWSER_RESULTS.json mencakup 2/4/6 peserta pada empat viewport, human/bot re-entry, pembayaran sekali, observasi atribut open dialog tanpa celah penutupan, dan rantai lelang aset bangkrut dengan reset nominal. Bot idle delay ditahan hanya pada fixture agar langkah manusia deterministik; eligibility bot diuji juga pada core. Aturan engine tidak berubah.

## Verifikasi

- Core **406/406**, tanpa fail/skip, mencakup 18 tes sertifikat/barter/estimasi/lelang baru.
- Browser khusus sertifikat **31/31**: sewa kota/stasiun/listrik/air, lelang properti/bangunan, aset tergadai; lebar 320/360/390/430, viewport pendek 360x420 dan desktop. Tiap skenario mengecek tombol Kembali, Escape dan browser Back serta kesamaan state tersimpan. Acknowledgement sewa tidak memotong saldo lagi.
- Browser barter **12/12**: draft, tawaran masuk dan counteroffer pada empat lebar portrait; detail tidak memilih/menghapus properti, nilai uang dan pilihan bertahan, draft tetap bisa dipulihkan setelah refresh, state pertandingan tidak berubah.
- Regresi umum **54/54** dan portrait **96/96** selesai untuk fitur sertifikat/barter. Setelah panel estimasi ditambahkan, skenario barter **12/12**, compact **18/18** dan portrait terarah **20/20** (barter/lelang dan 10 perbandingan pixel) diulang; hasil akhir ada di TRADE_CERTIFICATE_BROWSER_RESULTS.json, COMPACT_BROWSER_RESULTS.json dan TRADE_VALUE_PORTRAIT_RESULTS.json. Gunakan JSON aktual beserta waktunya.
- Typecheck, format check, build dan graph import diverifikasi dengan Node 24 dan tooling dipin.
- Fixture Padang diuji melalui ROLL engine asli: harga N 140 dan pembayaran sewa N 10. Screenshot di screenshots-491/; uji transaksi tidak menyentuh database live.

Seluruh browser QA memakai Chromium emulation, belum perangkat fisik. Tidak membuat akun/room atau mengirim barter live. Backend, SQL, otorisasi dan bot mengikuti 4.9.0. Konfirmasi di Aset Saya tetap inline; cabang popup konfirmasi standalone diuji pada renderer. Detail di kartu hasil lelang/riwayat yang tidak memakai propertyHero tidak ditambah diam-diam.

Panduan ENV tetap ../ENV_REQUIRED.md. Tidak ada SQL baru, Redis atau ENV baru. Push GitHub akan memakai integrasi Vercel existing; status endpoint publik diperiksa sesudah deployment. Laporan historis 4.9.0 tetap disimpan sebagai arsip, beserta baseline lab bot.
