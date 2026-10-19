# Review UI/UX portrait dan pengalaman pemain

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Skor70/100.** Layout standar muat pada360×800,393×873,412×915. Popup barter punya masalah kontrol nyata QA-001; portrait360×480 dengan enam pemain mengalami overlap/clipping QA-002. Ini bukan tugas redesign; tidak ada aset, warna pion atau CSS game diubah.

## Eksekusi viewport

| Viewport | Pemain | Status geometri | Catatan |
|---|---|---|---|
|360×800|6|PASS|Board360persegi, console bottom800; modal Aset/Barter/Bank/Riwayat diuji|
|393×873|6|PASS|Board393persegi, console bottom873|
|412×915|6|PASS|Board412persegi, console bottom915|
|360×640|5 pada match alami|PASS terbatas|Match/UI/trace nyata; belum seluruh dialog pada6 peserta|
|360×480|6|FAIL|Board bottom488, console y400–480, bagian papan tertutup|
|800×360 landscape|6|PASS geometri|Board312persegi, bottom351; kontrol sisi kanan|
|360×800 CSSfont150%|6|PASS geometri, keterbacaan terbatas|Banyak ukuran px tetap; bukan emulasi font Android yang valid|
|393×873 CSSfont200%|6|PASS geometri, keterbacaan terbatas|Native text scaling/zoom OS NOT TESTED|

Screenshot sebelum/sesudah modal tersedia pada mobile-*.png dan JSON rect [mobile-audit.json](evidence/mobile-audit.json). Rotasi satu sesi online aktif, virtual keyboard Android/iOS, browser back saat semua jenis popup, resume dari OS kill: NOT TESTED atau hanya coverage suite lokal, tidak dipasarkan PASS perangkat nyata.

## Popup hasil barter4.11.6

| Check | Status | Bukti |
|---|---|---|
| Giver/receiver benar | PASS contoh teruji | Live host memberi₦10, guest menerima₦10; fixture menerima Balikpapan+₦200, memberi Banyuwangi |
| Aset/kas tidak tertukar | PASS contoh teruji | Asset-trade/trade-footer/live snapshot |
| Transfer tepat sekali | PASS | Klik stale ditolak; Tutup tidak menambah versi; race/receipt juga diuji |
| Refresh unread receipt | PASS | Receipt tersimpan muncul setelah resume, isi tetap; footer stale hilang |
| Dismiss lalu reload tidak muncul lagi | PASS | resultNotRepeated:true |
| Duplicate/reordered ingest | PASS suite lokal | test:trade:results &6 browser scenarios; belum injeksi WebSocket live |
| Footer konsisten/satu tombol Tutup | FAIL | Tombol Terima/Tolak/Tawar balik/Ajukan tawaran tersisa dari popup sebelumnya |
| Modal tidak hilang selama dibaca | PASS sesi diuji | Unread ditahan, bot menunggu acknowledgement |
| Expired log300 event / lintas perangkat | Batas yang diketahui | Receipt per perangkat/kursi; belum diterima sebelum window lewat tidak direkonstruksi. Bukan bug baru |

`refreshSameText:false` pada asset-trade.json disebabkan footer stale hilang, bukan rincian uang berubah. Catatan ini mencegah pembacaan hasil test yang keliru.

## Perspektif pemain baru

- Satu menit pertama: tombol Mulai VS Bot jelas dan nama wajib dipandu profil. Istilah ₦=Nusa ditampilkan. Avatar/role bot membantu pemilihan; cara tahan–lepas dadu ada pada aria-description dan label saat siap.
- Aturan sewa digital otomatis masuk akal untuk pemain baru. Perubahan saldo punya finance history dan Bank; informasi dapat dicari tetapi detail membutuhkan beberapa tap. Bantu pemain melihat sumber pembayaran langsung dari riwayat paling baru.
- Barter memberi dua sisi serta estimasi, namun kontrol receipt stale membuat keputusan yang sudah final tampak masih dapat diubah. Ini kebingungan paling konkret yang diamati.
- Lelang memiliki input minimal, step dan saldo jelas; hasil pasif berupa notice merupakan pilihan desain aktif. Suite lama yang menunggu modal tidak membuktikan lelang rusak.
- Waktu tunggu bot dipengaruhi animasi, pembacaan kartu dan planner. NUSA mempunyai budget jauh lebih besar daripada benchmark kecil. Tidak ada survey pengguna nyata, sehingga rasa bosan adalah risiko UX, bukan temuan terukur semua pemain.

## Keterbacaan dan aksesibilitas

Board overview memuat40petak sehingga label sangat kecil pada360px. Kamera follow/zoom tersedia; edukasi singkat tentang kamera berpotensi berdampak besar. Nominal Nusa di console/profil cukup terbaca pada screenshot; nama panjang dipotong pada kartu lobby. Menu/kamera40×40 dan beberapa tombol pendek kurang dari44px; itu rekomendasi target sentuh, bukan otomatis pelanggaran WCAG (batas lain berbeda). Informasi owner memakai warna dan ada detail tekstual; simulasi color blindness/contrast seluruh komponen belum dijalankan. Jangan memberi PASS aksesibilitas penuh.

CSS font150–200% tidak mengubah banyak teks berukuran px. Ini alasan melakukan pengujian font scaling native, bukan bukti pasti bahwa pengaturan Android gagal. Keyboard desktop/headless tidak membuktikan keyboard virtual tidak menutup tombol.

## Tiga perubahan dampak tertinggi

1. **BUG:** perbaiki lifecycle footer shared modal agar receipt barter benar-benar final dan aman dipahami.
2. **UX:** status ketersediaan bot online yang jelas sebelum pemilihan, disertai pemulihan worker operasional; hindari pemain menyiapkan room untuk bot yang tidak tersedia.
3. **BUG/UX:** pastikan overview dan aksi muat pada portrait pendek; tambahkan petunjuk kamera singkat untuk keterbacaan40petak tanpa mengganti board/pion.

Kemenangan diverifikasi dengan popup final pada lima fixture dan hasil natural bila tersedia. Rasa puas pemain belum diukur lewat user study; rekomendasi enhancement adalah ringkasan kemenangan yang menjelaskan aset/transaksi penentu, bukan memperbaiki aturan menang yang sudah benar.
