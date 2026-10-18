# Dadu, popup stok, pelunasan otomatis, dan Aset Saya

Source terbaru melanjutkan NUSA V20, bot online Supabase Edge, memori barter, pengamatan NUSA, serta PWA dan logo dari pembaruan sebelumnya.

## Dadu

Dadu dipindahkan ke kanan riwayat aktivitas dan nama petak, di atas panel aksi sesuai area merah referensi pengguna. Panel bawah memiliki dua kolom: Aset/Barter dan tombol aksi yang lebih panjang. Ukuran setiap dadu 48–62 CSS pixel; layar pendek menggunakan header dan kapsul yang lebih ringkas agar papan dan tombol tetap terlihat.

Enam gambar aktif berada di `public/assets/dice/die-1.png` sampai `die-6.png`: PNG 192×192 dengan alpha transparan nyata, gaya 2D datar dan pip 1–6. Jumlah seluruh aset 46.937 byte. Master image generation berada di luar source runtime; hanya enam potongan akhir yang disertakan. Ekspor ukuran dan kompresi mempertahankan alpha.

Renderer memasang gambar sekali dan hanya mengganti dua atribut nilai saat mengacak. Opacity berubah singkat; tidak ada rotasi, transformasi 3D, canvas loop, pembuatan DOM atau pengunduhan gambar ulang setiap tick. Animasi berhenti saat popup menutupi permainan, tab tersembunyi, pause, atau reduced motion. Hasil asli baru terlihat pada tahap reveal dan tidak dapat ditimpa callback animasi lama.

Sebelum lemparan pertama, sisi satu ditampilkan sebagai ilustrasi dengan label “Siap melempar”. Ini tidak mengisi hasil dadu pada state permainan.

## RNG

`lib/random.mjs` memakai Web Crypto `getRandomValues` dan rejection sampling untuk integer seragam. Nilai uint32 pada ekor yang tidak habis dibagi jumlah hasil dibuang; tidak menggunakan modulo secara langsung tanpa rejection. Lemparan pembuka, pergerakan, utilitas dan pengacakan deck memakai jalur ini pada produksi.

Engine schema 2 dan engine save lama sekarang menggunakan sumber aman secara default. Sesi browser, layanan online, worker bot Edge dan endpoint kompatibilitas memakai fungsi bersama yang sama. Online tetap menerima intent; server menentukan hasil, bukan browser pengirim. Tidak ada seed RNG produksi pada save atau log publik. Tidak ada fallback ke `Math.random` jika Web Crypto tidak tersedia.

RNG injeksi eksplisit tetap tersedia untuk simulasi bot dan tes deterministik; jalur tersebut dipisahkan dari default produksi. Jaminan keamanan mengikuti sumber kriptografi platform dan integritas perangkat/server. Perubahan ini bukan klaim bahwa suatu perangkat yang telah dimodifikasi tidak dapat memanipulasi permainan lokal.

## Popup stok bangunan

`buildTargets()` mengembalikan ID petak. Popup lama menganggapnya objek sehingga nama dan ID tombol menjadi kosong. Popup kini mengambil `BOARD[id]`, menampilkan sisa stok, rumah/hotel dari atlas PNG yang ada, nama tanah, biaya dan penjelasan minat/lelang. Pemain yang tidak lagi memenuhi syarat atau sedang menunggu mendapat teks yang jelas. Tombol dikirim dengan ID petak numerik yang legal.

## Lunasi otomatis

Ketika kas kurang pada fase tagihan, tombol bayar yang tidak dapat digunakan diganti **Lunasi otomatis**. Rencana yang dapat dibuka menampilkan aset/bangunan yang akan digunakan dan perkiraan sisa saldo. Klik tombol menjalankan rencana tersebut.

Planner memakai state publik dan solver likuidasi bersama. Gadai di luar set lengkap diprioritaskan bila cukup. Jika perlu, pencarian terbatas membandingkan langkah penjualan bangunan/gadai dengan perkiraan kerugian pendapatan. Pemeriksaan menggunakan engine nyata, termasuk pembangunan merata dan aturan hotel saat bank kekurangan rumah. Pencarian dibatasi; tidak mengklaim optimum global.

Setiap langkah mengirim command tersendiri dengan versi terbaru dan ID unik. Setelah kas cukup, langkah berikutnya langsung membayar. Penutupan panel, pause, halaman tersembunyi, state berubah atau kegagalan jaringan menghentikan sisa rencana. Transaksi yang sudah sah tetap tersimpan; tidak diulang menggunakan ID baru. Jika seluruh tagihan tidak dapat ditutup, tidak ada likuidasi parsial atau kebangkrutan otomatis. Barter dan pengelolaan manual tetap tersedia.

Rencana otomatis hanya bersifat sementara pada sesi UI. Save/refresh tidak melanjutkan penjualan sendiri. Sewa dan kewajiban tetap ditentukan engine.

## Popup Aset dan tata letak

Angka sewa di petak milik pemain memakai simbol mata uang, misalnya `₦ 6`, tetap tanpa latar tambahan. Nominal di bawah 1.000 Nusa dipertahankan; ribuan memakai `k` dengan maksimal satu desimal, misalnya `₦ 1k`, `₦ 1,2k` dan `₦ 10k`. Sertifikat dan label aksesibilitas menampilkan jumlah lengkap. Utilitas tetap menampilkan pengali dadu karena jumlah sewanya ditentukan lemparan.

Gadai otomatis lama, planner khusus, input target, event handler, CSS dan pengujiannya telah dihapus dari jalur aktif. Aset Saya hanya mempunyai tab Properti, Bangun, dan Digadai. Gadai/tebus manual serta penjualan bangunan tetap tersedia.

Kartu properti menggunakan dua kolom mulai lebar 360 pixel; kartu yang dibuka membentang agar kontrolnya mudah dibaca. Layar sangat sempit menggunakan satu kolom. Footer popup compact memakai dua kolom, dengan tombol utama tertentu membentang pada jumlah tombol ganjil. Isi panjang menggulir di body; header/footer tetap terjangkau. Sertifikat dan kartu mempertahankan bentuk khususnya.

## Verifikasi dan paket

- `tests/random.test.mjs`: batas rejection sampling, sumber aman yang tidak tersedia, injeksi deterministik, dan default produksi tanpa `Math.random`.
- `tests/building-stock-popup.test.mjs`: pilihan rumah/hotel dan state menunggu/tidak memenuhi syarat.
- `tests/debt-payment.test.mjs`: dana legal, perlindungan set lengkap, hotel, pembayaran sekali, stop/cancel, intent online serta penghapusan UI lama.
- `DICE_LAYOUT_BROWSER_RESULTS.json`: delapan viewport dan enam PNG transparan.
- `GAMEPLAY_UPDATE_BROWSER_RESULTS.json`: popup stok, pelunasan dan pengelolaan aset manual pada 320/390 pixel.
- `CLASSIC_BROWSER_RESULTS.json`: pengacakan, reveal, double click, reduced motion dan refresh.

Build web/server, salinan Edge, TypeScript, graph import dan regresi inti diperiksa terpisah. Uji browser memakai Chromium emulasi, bukan pengukuran performa HP fisik. Tidak ada benchmark pertandingan atau deployment eksternal.

Verifikasi akhir: 535/535 tes inti lulus, ditambah pemeriksaan ulang 81 tes frontend setelah perbaikan ilustrasi dadu awal. Enam suite browser terkait mencatat 50 skenario lulus: layout dadu 9, animasi dadu 2, popup/pelunasan 8, polish 19, pengelolaan aset/info 7, serta PWA 5. Pemeriksaan graph mencakup 536 modul tanpa kegagalan. Format source, TypeScript dan pemeriksaan whitespace juga lulus.

Paket source mencakup source aplikasi, enam PNG, fungsi Edge, PWA, panduan dan tes. `.env`, dependensi terpasang, `.git` serta hasil `dist/server-dist` tidak disertakan. Jalankan `npm ci`, `npm run build`, kemudian `npm start` pada Node 24. Paket rules-only yang diunduh dari aplikasi juga dibuat ulang agar membawa RNG terbaru.
