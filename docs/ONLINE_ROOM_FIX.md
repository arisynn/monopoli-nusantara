# Pemeriksaan online dan perbaikan room

Pemeriksaan dilakukan pada `https://monopoli-nusantara-eight.vercel.app/` dengan dua identitas tamu dan satu room QA tersendiri. Room pengguna lain tidak diubah. Pertandingan QA ditinggalkan dalam keadaan dijeda.

## Temuan live

- Supabase Auth, membuat room, bergabung, kesiapan pemain, memulai pertandingan, sinkronisasi roster, kembali ke lobi dari pertandingan dan melanjutkan pertandingan berhasil. Ada race saat Lanjutkan ditekan sebelum konfigurasi online selesai dimuat.
- `/api/online?config=1` mengirim `onlineBots: false`. Percobaan ADD_BOT dengan identitas host mendapatkan HTTP 503 `Worker bot online belum diaktifkan.` Inilah penyebab langsung tombol bot dinonaktifkan. Keberhasilan membuat room tidak membuktikan worker Edge/scheduler sudah terpasang.
- Menu ketika masih menunggu di room tidak menyediakan pengelolaan room. Popup room juga mengakses `state.players` walaupun state pertandingan belum ada. LEAVE dan KICK belum diimplementasikan.
- Migrasi 002 masih memvalidasi tiga persona lama dan nama lama. Ini tidak cocok dengan keenam persona saat ini. Menyalakan flag bot saja belum menyelesaikan masalah tersebut.
- Pemetaan ID petak pada popup stok sudah diperbaiki di source live saat diperiksa. Dua jenis bangunan × tiga posisi pemain × dua viewport diuji memakai renderer/CSS live dan fixture DOM saja: seluruh isi tampil. Ini tidak mengubah stok di database produksi atau menyimulasikan bank habis secara alami dalam pertandingan live.

Laporan: [LIVE_ONLINE_RESULTS.json](LIVE_ONLINE_RESULTS.json) dan [LIVE_STOCK_RENDERER_RESULTS.json](LIVE_STOCK_RENDERER_RESULTS.json).

## Perbaikan source

- Lobi room menyediakan Kelola room, Keluar room dan akses menu yang sesuai. Status bot dapat dibaca saat layanan belum aktif, kemudian konfigurasi dapat diperiksa ulang. Popup room aman ketika pertandingan belum dimulai, dengan isi yang menggulir dan tombol dalam beberapa kolom.
- LEAVE mengosongkan kursi sebelum permainan dimulai. KICK hanya untuk host sebelum permainan dimulai, memakai `memberId` yang tetap agar perpindahan indeks tidak mengeluarkan orang yang berbeda. Perubahan peserta mengatur ulang kesiapan; host berpindah jika perlu. Room ditutup ketika manusia terakhir keluar, termasuk jika masih ada bot.
- Keputusan dan membership dikomit atomik dengan revision CAS serta receipt. Percobaan ulang LEAVE tetap aman setelah membership sudah dihapus. SQL menjaga identitas dan urutan relatif peserta yang tersisa, memperbarui `mn_members`, serta menolak perubahan kursi di pertandingan aktif.
- Pemain yang dikeluarkan kembali ke lobi utama setelah menerima penolakan membership. Hanya penunjuk room yang terkait yang dibersihkan; simpanan lebih baru dari tab lain dilindungi. Status penolakan dibawa HTTP sampai ke sesi, termasuk heartbeat ketika notifikasi Realtime tidak lagi dapat diterima karena RLS.
- **Kembali ke lobi** mempertahankan hak melanjutkan pertandingan. DISCONNECT melepas koneksi tab itu; tab lain tetap dihormati. Jika tidak ada koneksi tersisa dari pemain aktif, game dijeda tanpa mengubah state game. Keluar permanen/kick di tengah pertandingan tidak ditambahkan karena akan memerlukan aturan pengunduran diri dan penanganan seluruh aset/keputusan aktif.
- Resume menunggu konfigurasi identitas. Kegagalan penyimpanan perangkat tidak menjebak pemain online di papan; room tetap dapat ditemukan melalui akun. Penunjuk room baru dapat disimpan setelah room lama ditinggalkan, tanpa kehilangan revision penyimpanan.
- Popup keputusan dapat ditutup untuk melihat papan/menu; keputusannya tetap menunggu dan dapat dibuka kembali melalui tombol aksi. Kartu dan sertifikat mempertahankan tampilannya.
- Semua manusia yang masih menunggu keputusan stok dapat membuka pilihan dari klien masing-masing. Pemain yang telah memilih melihat penjelasan menunggu. Nama tanah, ID tombol numerik, gambar PNG dan kondisi tanpa pilihan tetap ditampilkan.
- Kamera mengikuti sampel gerakan pion pada setiap frame, termasuk sudut, dengan transisi zoom/pindah giliran singkat. Tidak ada loop kamera saat diam. Pause, popup, tab tersembunyi dan reduced motion dihormati; gerakan manual mengambil alih kamera. Label tombol mengikuti mode aktual.

## Penerapan di Vercel/Supabase

Perubahan di workspace dan ZIP **belum diterapkan ke situs live**. Sesi ini tidak memiliki akses administrasi Vercel atau Supabase.

1. Deploy source aplikasi terbaru ke Vercel dan source `supabase/functions/monopoli-bots` ke Edge Function. `npm run prepare:edge` menghasilkan dependensi Edge dari runtime yang sama.
2. Untuk proyek yang sudah memasang migrasi 001–005, terapkan **hanya** `supabase/migrations/202610180006_online_room_management.sql`. Proyek baru mengikuti urutan migrasi serta prasyarat Vault/scheduler pada panduan sebelumnya. Jangan mengulang migrasi awal pada proyek yang sudah memiliki tabelnya.
3. Pastikan worker `monopoli-bots`, Vault `mn_bot_worker_url`/`mn_bot_worker_secret`, pg_net, serta job pemulihan `mn-bot-recovery` telah dikonfigurasi dan worker sudah diuji di staging. Lihat [ENV_REQUIRED.md](../ENV_REQUIRED.md), [EDGE_MEMORY_PWA.md](EDGE_MEMORY_PWA.md) dan `supabase/bot_worker_activate.sql`. Nilai secret tidak dimasukkan dalam source atau laporan.
4. Setelah worker/scheduler siap, set **`MN_ONLINE_BOTS_ENABLED=true`** pada environment Production Vercel lalu redeploy. Konfigurasi Supabase URL/public/secret yang sudah dipakai room manusia tetap digunakan.
5. Buka **Status bot → Periksa ulang** untuk memeriksa layanan memakai sesi login yang sedang aktif. GET `/api/online?diagnostics=1` menyediakan metadata aman: flag bot, versi capability, daftar persona, dan boolean konfigurasi worker/scheduler. RPC capability sendiri hanya dapat dipanggil service role. POST ADD_BOT menolak jika migrasi atau konfigurasi worker belum siap. Metadata konfigurasi bukan bukti bahwa suatu keputusan bot benar-benar sudah dieksekusi.
6. Uji room baru dua manusia + NUSA. Pastikan versi state bertambah saat giliran bot dan tidak ada aksi ganda. Jika worker gagal, periksa log Edge/job backend; jangan memindahkan otoritas bot ke browser untuk mengakali kegagalan konfigurasi.

Untuk PWA yang masih memakai build lama, tutup seluruh tab pertandingan lalu perbarui aplikasi dari Pengaturan. Tidak perlu menghapus data situs atau simpanan.

## Verifikasi

`npm test`, TypeScript, build web/server, prepare Edge, graph import dan format source diperiksa. `npm run test:online:postgres` menjalankan migrasi dan service terhadap PostgreSQL 17 terpisah, termasuk enam persona, perubahan membership, receipt, penutupan room dan batas akses. Vault pada uji ini hanya tabel kosong untuk kompatibilitas; pg_net/cron dan Edge live tidak dijalankan.

`npm run test:online:rooms` memakai aplikasi browser asli, HTTP serta service aturan room asli, dengan Auth dan notifikasi Realtime berupa kontrak uji. Meliputi beberapa browser pada 320/390 px, status bot, NUSA, kick, pemulihan klien, host, keluar, resume, kamera dan popup stok rumah/hotel. Hasil aktual tercatat pada `ONLINE_ROOM_BROWSER_RESULTS.json` dan `ONLINE_POSTGRES_RESULTS.json`. Uji DOM live stok dipisahkan dari pemeriksaan room live agar batas pengujiannya jelas. Tidak ada benchmark bot.

Hasil akhir: **548/548 tes inti**, 14 skenario browser room, 12 pemeriksaan renderer stok live, 5 skenario PostgreSQL terpisah, 3 skenario mode kamera dan 5 skenario PWA lulus. Pemeriksaan kamera tambahan mencakup pause saat popup, lanjut setelah popup ditutup, pengambilalihan manual, label tombol, reduced motion dan resize. Build, TypeScript, format, whitespace dan graph **541 modul** lulus; seluruh 48 dependensi Edge identik dengan source aktif. Laporan kamera: `CAMERA_BROWSER_RESULTS.json`.
