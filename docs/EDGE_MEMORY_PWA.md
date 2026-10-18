# Bot Edge, memori barter, pengamatan NUSA, dan PWA

Bot online tetap dihitung oleh Supabase Edge. Browser pemain menerima state yang disahkan server; pelaksana bot tidak dipindahkan ke HP. Worker browser tetap melayani VS Bot lokal/offline.

## Barter bersama

`lib/bot/trade-memory.mjs` menyimpan maksimal 12 respons terakhir per pengirim di `botMemory`. Isi properti diurutkan dan uang dinormalisasi menjadi kas bersih untuk mengenali tawaran yang sama. Penolakan penerima, pembatalan pengirim, counteroffer, dan penerimaan dibedakan.

Penolakan mempunyai hipotesis dari fakta publik: kebutuhan kas, ketimpangan nilai dasar, ancaman monopoli sepihak, atau preferensi strategi. Hipotesis ditandai `estimated`; alasan sebenarnya dari manusia tidak diasumsikan diketahui. Counteroffer disimpan dengan arah sender/receiver yang benar dan digunakan sebagai petunjuk kompensasi berikutnya.

Pemeriksaan berlaku selama konteks ekonomi masih sama dan maksimal empat putaran meja. Perubahan kepemilikan, bangunan, gadai, jumlah kartu, status bangkrut, atau kelompok kas per 1.000 unit internal membuka evaluasi ulang. Setiap kelompok aset mendapat maksimal dua revisi setelah penolakan awal. Riwayat baru menggantikan blokir seluruh penerima; simpanan lama yang belum memiliki riwayat tetap memakai cooldown lama.

Kenaikan kompensasi harus berarti. Revisi otomatis mempertahankan setidaknya kas terlindungi ₦50 ketika tersedia, diperiksa legalitasnya, dan harus mempunyai nilai ekonomi positif bagi pengirim serta tidak negatif bagi penerima menurut evaluator bersama. Ancaman monopoli sepihak tidak otomatis dijawab dengan menaikkan uang; planner dapat memilih susunan aset atau aksi lain. Tawaran tetap memerlukan persetujuan penerima.

`negotiation.mjs` dan generator kandidat menyiapkan revisi; `negotiation-guard.mjs` memeriksa hasil akhir semua persona. Pakar NUSA atau kebijakan persona lain tidak dapat mengembalikan tawaran identik yang sudah diblokir melalui jalur keputusan aktif. Bobot masing-masing persona tidak diganti.

## Pengamatan NUSA

`lib/bot/observer.mjs` menerima aksi lawan yang sudah lolos engine. Ia tidak membaca urutan kartu, RNG, log privat, atau memori internal bot lain. Antrean dibatasi 32 kejadian; setiap batch biasa memproses empat aksi. Respons barter dan pergantian giliran juga memicu pemrosesan batch. Tidak ada timer hidup terus-menerus, pencarian langkah, pemanggilan model eksternal, atau penulisan database tersendiri.

Ringkasan mencakup minat kelompok properti, agresivitas tawaran lelang, tekanan kas, respons barter, monopoli yang terlihat, dan keyakinan berdasarkan jumlah pengamatan. `strategyView` menyediakan profil hasil pengamatan dan pending batch milik NUSA ketika mengambil keputusan, tanpa mengubah state otoritatif saat dibaca. Profil dipakai oleh pembaca memori lawan NUSA yang sudah ada. Ini pembaruan memori selama pertandingan, tanpa training bobot baru.

Riwayat dan pengamatan ikut tersimpan secara atomik bersama command di JSON state room. Replay command tidak menambah kejadian; rollback atau CAS yang ditolak tidak menyimpan memori. Reconnect dan instance Edge baru membaca data yang sama. `publicState` tetap menghapus `botMemory`; tidak ada perubahan hak akses room atau migrasi SQL yang diperlukan untuk struktur JSON tambahan ini.

## Pekerjaan Edge

`runBotWorker` secara default mengerjakan satu keputusan per pemanggilan, dengan batas wall-clock 10 detik. Antrean database, lease 30 detik, pemeriksaan match/version/aktor, dan commit tunggal tetap digunakan. Job selanjutnya dilanjutkan scheduler yang sudah ada. Fallback lokal dalam satu pekerjaan digunakan kembali bila diperlukan.

Budget komputasi keputusan lokal tetap 180 ms. Sisa budget yang sama diteruskan ke perluasan kandidat, council, pemeriksaan pakar, dan pencarian NUSA. Pemeriksaan ini kooperatif: satu evaluasi sinkron tidak dapat dipotong di tengah eksekusinya. Nilai 180 ms bukan jaminan batas CPU keras Supabase.

`state.aiDiagnostics` hanya berisi ringkasan aman: pelaksana Edge, aktor, versi sumber, label model, elapsed time, jumlah node, budget habis, penggunaan fallback, dan kode alasan. Tidak menyimpan prompt, respons provider, token, atau stack. Tidak ada klaim V20 pasti muat pada limit Edge sebelum pengujian deployment nyata.

## PWA dan logo

- `public/manifest.webmanifest`: standalone, scope/start URL root, ikon PNG 192/512, serta maskable 512 dengan ruang aman.
- `frontend/pwa.mjs`: pemasangan melalui gesture browser, petunjuk Safari, status jaringan, dan pembaruan dari Pengaturan. Tombol pembaruan dinonaktifkan saat gameplay.
- Service worker menyimpan satu rilis shell/aset publik secara utuh. Cache-first menjaga modul dan worker sesuai rilis shell. API, identitas, state room, dan save tidak disimpan dalam cache ini.
- Versi baru menunggu tab lama ditutup atau persetujuan bahwa seluruh tab berada di luar gameplay. Tidak ada aktivasi paksa otomatis pada saat install.
- VS Bot dan simpanan lokal dapat berjalan offline setelah precache berhasil. Room online, login, serta advisor tetap memerlukan jaringan.
- Logo pion hijau dengan unsur kepulauan dipakai di header, favicon, ikon pemasangan, dan Apple touch icon. Aset PNG aktif berada di `public/assets/brand/`; sumber dibuat dengan image generation pada 18 Oktober 2026. Ekspor ukuran memakai ImageMagick; gambar generator beresolusi penuh berada di luar paket runtime.

Pemasangan dan perilaku background pada Android/iOS fisik belum diuji. Cache dan manifest tidak membuat pertandingan online dapat berjalan tanpa koneksi.

## Verifikasi dan deployment

Tes terarah: `tests/negotiation-memory.test.mjs`, `tests/nusa-observer.test.mjs`, `tests/pwa.test.mjs`, dan tambahan pada `tests/online-bots.test.mjs`. Suite juga menjaga kompatibilitas cooldown lama, memori privat, save, pembatalan, dan fencing pekerjaan online.

```sh
npm test
npm run typecheck
npm run prepare:edge
npm run check:source
npm run test:pwa:browser
npm run test:foundation:browser
npm run test:polish:browser
```

Browser test memerlukan Playwright dan Chromium; lingkungan ini memakai `MN_BROWSER_MODULE` dan `MN_CHROMIUM_PATH`. Hasil ada di `PWA_BROWSER_RESULTS.json`, `BOT_FOUNDATION_BROWSER_RESULTS.json`, `FRONTEND_POLISH_BROWSER.json`, dan `CLASSIC_TEST_RESULTS.json`.

Source Edge siap di `supabase/functions/monopoli-bots/_shared/`. Penerapan nyata membutuhkan deployment frontend/API dan fungsi `monopoli-bots` ke proyek Supabase yang benar. Deployment, Supabase live, benchmark pertandingan, dan training tidak dijalankan pada pembaruan ini.
