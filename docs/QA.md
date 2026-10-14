# Verifikasi rilis Monopoli Nusantara v1

Tanggal: 14 Oktober 2026. Pengujian dilakukan pada Node.js 24.19, TypeScript, dan runtime Workers lokal Miniflare. Ini bukan hasil pengujian browser atau perangkat Android.

## Pemeriksaan otomatis

- 29 tes mesin permainan lulus. Salah satu tes menjalankan 12 pertandingan penuh dengan seed tetap, konfigurasi 2, 3, dan 4 bot; semua mencapai pemenang sambil memeriksa kas, stok bangunan, dan pemerataan.
- 8 pemeriksaan integrasi API room lulus: pembuatan room/token, gerbang Siap, penyembunyian deck, otorisasi kursi, dua perintah bersamaan, deduplikasi, reconnect/token salah, late join, dan status bot cadangan. Beberapa pemeriksaan mencakup lebih dari satu assertion.
- 4 tes penyimpanan lulus menggunakan adapter browser tiruan: localStorage penuh, pemilihan snapshot terbaru, JSON lokal rusak, dan kegagalan kedua penyimpanan.
- TypeScript `--noEmit` lulus.
- Build produksi dan smoke test produksi menjadi gate wajib sebelum arsip diterbitkan. Smoke test memeriksa SSR beranda, judul/tombol, referensi script, routing API, migrasi D1, dan pembuatan room dari bundle produksi.

## Perbaikan pemeriksaan akhir

- Respons polling dengan versi lebih tua tidak menimpa state permainan yang lebih baru.
- Menu utama menyediakan jalan kembali ke lobby room yang belum mulai.
- Menutup pengaturan dengan Escape juga melepaskan jeda lokal.
- Autosave tetap dapat menggunakan IndexedDB ketika localStorage gagal; saat memuat, snapshot terbaru dipilih dari dua salinan.
- Harness smoke test produksi diperbaiki agar memuat modul dinamis Worker secara eksplisit.

## Belum diverifikasi

- Visual, sentuhan, kamera, FPS, ukuran layar kecil, dan pertandingan melalui browser/perangkat nyata. Skill kontrol browser tidak tersedia; tidak ada klaim screenshot atau pengujian visual.
- Groq langsung: secret belum dikonfigurasi. Jalur tanpa secret memakai bot lokal dengan label yang terlihat.
- Offline service worker pada browser nyata dan reconnect lintas perangkat.
- Multiplayer pada domain terbitan dengan beberapa akun. Site privat hanya dapat dibuka pemilik sampai akses berbagi diubah secara sengaja.

## Batas fitur

Lihat `RULEPACK.md`. Rilis ini adalah Nusantara Digital v1; bukan implementasi seluruh fitur lanjutan masterplan atau paritas aturan C1009 yang tersertifikasi.
