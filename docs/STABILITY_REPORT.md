# Monopoli Nusantara 4.8.3 — Keamanan Simpanan & Stabilitas

Basis: source 4.8.2 dari ZIP pengguna; angka 4.8.1 pada nama ZIP lama adalah typo. Rilis ini mempertahankan aturan ekonomi, schema engine/save, bot lokal dan aset visual.

## Perubahan yang dirasakan pemain

- Satu tab aktif dapat mengendalikan pertandingan lokal pada browser dengan Web Locks. Tab kedua mendapat pesan yang jelas saat mencoba melanjutkan atau membuat permainan. Menutup tab pemilik atau kembali ke lobby melepaskan kunci.
- Resume membaca ulang simpanan terbaru sesudah memperoleh kunci, sehingga tab yang sebelumnya tertinggal tidak melanjutkan snapshot lama.
- Autosave menolak state usang dan cabang yang bersaing. Konflik tidak menimpa data; permainan lokal dijeda dan pemain dapat kembali ke lobby lalu melanjutkan simpanan terbaru.
- Tanpa Web Locks, read/check/write dalam satu transaksi IndexedDB tetap melindungi save antar-tab. Bila IndexedDB dan penguncian sama-sama tidak tersedia, browser tidak mengklaim autosave aman; ekspor cadangan tetap tersedia.
- Restore slot/impor eksplisit boleh memuat revision lama, dengan pemeriksaan envelope terkini. Aturan ini berbeda dari autosave yang tidak boleh mundur.
- Landscape 667×375, 568×320 dan 740×360 memakai layout dua kolom yang menjaga papan dan konsol tetap dalam viewport, termasuk fixture enam peserta.
- UI, health dan build memakai release version 4.8.3. Engine schema 2 dan rulepack nusantara-c1009-2 tetap terpisah.

## Penyimpanan dan kompatibilitas

`saveRevision` ditambahkan pada envelope penyimpanan perangkat, bukan state engine atau format ekspor pertandingan. Save lama tanpa field ini menggunakan persistedAt sebagai identitas awal dan memperoleh revision baru ketika disimpan. LocalStorage dan IndexedDB tetap menjadi dua jalur penyimpanan. Perbandingan dan penulisan IndexedDB memakai transaksi readwrite yang sama; fallback localStorage pada browser memerlukan Web Lock.

GameSession menserialkan penyimpanan miliknya sendiri agar dua update online yang masuk berdekatan tidak saling ditolak oleh revision envelope. Kunci tab lokal dan kunci transaksi penyimpanan memakai nama berbeda. Bot, asset plan dan presentasi dihentikan pada konflik lokal. Berpindah ke online melepaskan kepemilikan lokal; lifecycle pagehide/pageshow turut menangani pelepasan/pemulihan.

Autosave yang sudah tersimpan tetap terlindungi. Aksi lokal yang gagal disimpan akibat storage error tetap membutuhkan ekspor cadangan; aplikasi menampilkan pesan dan tidak menjanjikan sinkronisasi cloud untuk permainan lokal.

## Rilis, build dan sumber

`lib/version.mjs` memasok UI, /health dan /build.json. Pengujian memastikan package version dan metadata tersebut cocok dengan kontrak engine aktif. Fingerprint build mencakup seluruh path/byte output, termasuk modul dependency dan PNG, bukan hanya app.mjs/styles.css. Nama cache service worker memuat fingerprint; precache menggunakan cache:reload agar aset HTTP lama tidak dipakai saat pemasangan rilis.

Sumber frontend/CSS, storage, optional advisor, adapter Node dan build telah diformat dengan Prettier 3.6.2 yang dipin. `format`/`format:check` disediakan. TypeScript strict yang ada tetap dipakai; checkJs masih false sehingga semantik seluruh modul JavaScript belum tercakup.

`npm start`/`npm run dev` membaca .env jika tersedia. File .env privat di workspace tidak masuk ZIP, dist atau manifest. Panduan deployment aktif dipusatkan di DEPLOY_483.md; panduan historis diberi tautan menuju dokumen aktif.

## Supabase dan layanan live

Proyek pilihan pengguna adalah **connectify** (ymunfgclqfdqaczluqti). Proyek dipulihkan dari INACTIVE, diaudit, kemudian tiga migrasi mn_* diterapkan. Satu room legacy dalam mp_rooms tetap ada; tidak ada pengubahan data novel champagne atau konversi otomatis room legacy.

Migrasi bot 002 lama gagal pada PostgreSQL nyata karena ekspresi CASE tanpa pembungkus dalam kondisi PL/pgSQL. Percobaan tersebut ter-rollback: mn_bot_jobs belum terbentuk setelah kegagalan. Ekspresi diberi tanda kurung, kemudian migrasi 002 dan 003 berhasil diterapkan. Perbaikan yang sama disertakan dalam source ZIP.

Verifikasi live memastikan tujuh tabel mn_* memakai RLS; anon/authenticated tidak memiliki izin RPC commit; service_role memilikinya; hanya mn_room_updates dari tabel baru yang masuk publication. Melalui API publik, pembacaan snapshot privat ditolak 401/42501 dan RPC commit tidak ditemukan bagi browser (404/PGRST202). Settings Auth melaporkan email dan anonymous sign-in aktif.

**Online aplikasi belum dinyatakan siap:** service-role key belum tersedia pada runtime server, Auth redirect/deployment dan Realtime lintas perangkat belum diuji, dan worker/scheduler bot belum dipasang/divalidasi. MN_ONLINE_BOTS_ENABLED tetap false. Schema yang berhasil dipasang tidak menggantikan pengujian integrasi tersebut.

Upstash merespons PONG tanpa membaca/mengubah room. Groq openai/gpt-oss-20b lolos model listing, strict JSON connection check, serta satu keputusan melalui aiDecision game (status hybrid, BID legal, 1.035 token total pada run itu). Reasoning effort low dipakai khusus keluarga gpt-oss. Kuota dan plan gratis mengikuti akun/provider; tidak ada klaim peningkatan kekuatan bot atau pemakaian tanpa batas.

Temuan keamanan pada tabel/fungsi lama di kedua proyek dicatat di DEPLOY_483.md dan tidak diperbaiki otomatis karena berada di luar schema Monopoli baru.

## Hasil verifikasi

- 354/354 tes headless, backend, storage, bot, kontrak dan frontend lulus; 0 gagal/skipped.
- 54 skenario browser lokal lulus: Classic 16, Compact 18, Plan 5, Assets 8, Stability 7.
- Kasus baru mencakup dua tab sungguhan, kepemilikan writer, penutupan pemilik, pemuatan state terbaru, fallback tanpa Web Locks, race transaksi IndexedDB, restore revision lama dan tiga viewport landscape enam peserta.
- TypeScript strict dan format check lulus. Source/output graph memeriksa 202 modul tanpa kegagalan.
- 23 file aturan, ekonomi, save validator, algoritma bot dan backend room/job diperiksa hash-nya terhadap paket basis: identik. Perubahan server utama hanya request advisor opsional dan metadata adapter; perubahan SQL 002 memperbaiki sintaks tanpa mengganti aturan bot.
- Build source-only dari ekstraksi ZIP diuji terpisah saat delivery. Bukti: STABILITY_VERIFICATION.json, STABILITY_CORE_INTEGRITY.json dan file hasil runner.

Browser memakai Chromium emulasi, bukan perangkat Android fisik. Tidak ada deployment aplikasi/Vercel, tes Supabase end-to-end lintas perangkat, atau benchmark AI kompetitif baru. Tutorial, ringkasan pertandingan, hotseat dan mode cepat tetap rencana rilis berikutnya.
