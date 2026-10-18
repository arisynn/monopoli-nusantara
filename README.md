# Frontend polish — papan dan popup yang lebih bersih

Pemeriksaan online terbaru: penyebab bot nonaktif, perbaikan keluar/kick/host, popup stok, serta kamera mengikuti pion. Pengelolaan room memerlukan migrasi **006**, dan bot live memerlukan aktivasi worker serta `MN_ONLINE_BOTS_ENABLED=true`. Hasil uji dan langkah penerapan: [ONLINE_ROOM_FIX.md](docs/ONLINE_ROOM_FIX.md).

Update gameplay terbaru: dadu PNG transparan 2D dipindahkan ke kanan riwayat agar tombol aksi lebih panjang; RNG memakai Web Crypto tanpa bias; popup stok diperbaiki; pelunasan otomatis menggantikan gadai otomatis lama. Panduan dan hasil uji: [GAMEPLAY_UPDATE.md](docs/GAMEPLAY_UPDATE.md).

Update terbaru: bot online tetap di Supabase Edge, memori penolakan barter dan revisi berlaku untuk keenam persona, NUSA mengamati aksi lawan dalam batch kecil, serta logo PNG dan PWA tersedia. Catatan arsitektur, pemasangan, dan verifikasi: [EDGE_MEMORY_PWA.md](docs/EDGE_MEMORY_PWA.md).

Papan menampilkan sewa seperti `₦ 6` tanpa latar hanya setelah properti dimiliki; nominal ribuan diringkas seperti `₦ 1,2k`. Kepemilikan mengikuti warna pion, rumah/hotel memakai gambar, dan popup Aset/Barter dibuat ringkas dengan scroll internal. Input nominal memakai keyboard angka/desimal bawaan dengan normalisasi nol di depan. Avatar manusia baru dan aset WebP melengkapi enam peserta berbeda. NUSA kini memakai V23 Chronos & Kairos dengan 33 pakar; aturan permainan tetap sama.

Panduan perubahan, pembersihan source, dan verifikasi: [FRONTEND_POLISH.md](docs/FRONTEND_POLISH.md). Build publik hanya memuat graph modul browser aktif; source runtime NUSA berada di `lib/bot/nusa-v7/`.

---

# Monopoli Nusantara — pembaruan UI, fondasi bot dan NUSA V23

Source lengkap mencakup lobi/lelang yang dirapikan, mata uang ₦, pembuka dan kenaikan lelang minimal ₦5, fondasi bot bersama, serta NUSA V23 dengan 33 pakar dan perencanaan temporal. Nomor aplikasi tetap 4.11.0. Catatan integrasi ada di [INTEGRASI_NUSA_V23.md](INTEGRASI_NUSA_V23.md).

**Paket engine aturan tanpa model/planner bot:** [unduh ZIP logic game](public/Monopoli_Nusantara_Game_Logic.zip). Pada situs hasil build, file tersedia di `/Monopoli_Nusantara_Game_Logic.zip`. Paket ini menerima label bot baru untuk sistem eksternal, terpisah dari enam persona pada aplikasi lengkap. Buat ulang paket dengan `python3 scripts/package-logic.py`.

---

# Monopoli Nusantara 4.11.0 — Enam Persona AI & Popup Pilihan Bot

Update di atas **v4.10.2** dengan source bot dari **Nusa.zip**. Raka, Bima, Sari, NUSA, Arka/APEX, dan Kresna kini dapat dipilih sebagai enam kebijakan bot independen. Pilihan persona dan empat tingkat kesulitan ditampilkan dalam dua dialog kartu yang terpisah, bukan dropdown. VS Bot mendukung 2–6 peserta; online tetap maksimal tiga bot, dengan dua manusia minimal. **LEARNED_MODEL = null** sampai ada bobot baru yang lolos verifikasi sumber dan benchmark holdout. Petunjuk & hasil uji ada di [INTEGRASI_NUSA_V411.md](INTEGRASI_NUSA_V411.md).

---

# Monopoli Nusantara 4.10.1 — Multiplayer & Result UI Fix

Perbaikan popup hasil akhir dan kesiapan Edge Function bot online. Lihat [catatan rilis & checklist deployment](docs/RELEASE_4101.md). Bot online **belum aktif otomatis**; toggling pada Vercel hanya setelah Edge Function dan penjadwal Supabase terverifikasi.

---

# Monopoli Nusantara 4.10.0 — Bank Nusantara & NUSA MIND 4.10

Melanjutkan **4.9.1**. Indikator kecil **Nusa beredar** di tengah papan membuka popup Bank Nusantara. Ringkasan menampilkan perputaran uang dan pokok gadai; rincian arus dana, sertifikat aset tergadai, persediaan rumah/hotel/properti dan 40 transaksi terakhir dibuka sesuai kebutuhan. Total transaksi tersimpan terpisah dari log yang dibatasi. Nusa beredar adalah total kas pemain, bukan kas bank terbatas. Bank tidak mengubah pajak, bunga, gaji, harga atau aturan permainan.

Save schema 2 lama tetap dapat dipakai: riwayat bank mulai dicatat pada aksi berikutnya dan ditandai parsial. Saldo/gadai selalu memakai kondisi aktual. Save schema 1 tetap kompatibel; riwayat bank baru hanya tersedia pada engine schema 2. Data bank ikut state lokal/online tanpa tabel, migration atau ENV baru.

Bot **NUSA MIND 4.10** memakai analisis risiko kas, alokasi pembangunan bertahap, penyelamatan gadai, negosiasi dan pencarian skenario terbaru. Khusus pembangunan, kandidat BUILD, BUILD_JOIN dan BID rumah/hotel harus menyisakan **N50–N200** sesuai risiko publik. Alokasi beberapa aksi memakai batas yang sama; aksi dihitung ulang setelah setiap langkah. Ini batas minimum kas setelah pengeluaran pembangunan, bukan batas maksimum tabungan atau jaminan saldo setelah membayar kewajiban lain. Bobot belajar runtime tetap `null`; paket riset tidak dipromosikan otomatis. Lihat [laporan integrasi](docs/RELEASE_4100.md).

Fitur 4.9.1 dipertahankan: miniatur sertifikat, detail tanpa kehilangan draft, estimasi nilai barter, dan lelang adaptif empat pemain 2×2. Sertifikat penuh, kartu, nama/harga petak dan tata letak gameplay selain satu indikator bank tetap.

**Panduan ENV dan deployment terbaru: [ENV_REQUIRED.md](ENV_REQUIRED.md).** Target database Monopoli adalah **connectify**; champagne tetap untuk novel. Tidak ada SQL baru untuk update ini. Redis/Upstash telah dilepas dari runtime aktif. File ENV privat dan key rahasia tidak disertakan dalam ZIP.

## Menjalankan

Node.js **24.x**. Build/runtime tidak memerlukan dependency produksi:

```sh
npm run build
npm start
```

Buka http://127.0.0.1:8787. Server menyajikan `dist`, sehingga perubahan source memerlukan build ulang. VS Bot lokal tidak membutuhkan ENV. Untuk development opsional `npm ci --ignore-scripts` menyediakan TypeScript dan Prettier yang dipin.

```sh
npm test                    # build + regresi inti/frontend/backend
npm run typecheck
npm run format:check
npm run check:source
npm run smoke:ui            # GameSession 2/3/4 peserta, tanpa DOM
npm run diagnose:online     # status ENV lokal tanpa menampilkan key
npm run diagnose:deployment -- --origin=https://monopoli-nusantara-eight.vercel.app
```

## Perubahan UI

Lobi berada di tengah layar dengan dekorasi geometris lembut; pada layar pendek konten tetap dapat digulir dari atas. Lobi memakai kartu peserta dua kolom yang lebih pendek. Popup setup, online/login, menu, pengaturan, profil, aset, bangun, pelunasan otomatis, barter dan keputusan memakai jarak lebih rapat; footer tetap dapat dijangkau dan konten panjang menggulir di dalam popup. Informasi konsekuensi gadai tetap tersedia lewat detail yang bisa dibuka. Ikon identitas online kini memiliki ukuran tetap, sehingga tidak gepeng.

`frontend/lucide-icons.mjs` memuat 25 glyph SVG resmi secara inline; tidak bergantung CDN saat bermain. Lisensi ISC ada di `licenses/LUCIDE.txt`. Ilustrasi karakter, pion, papan, bangunan dan kartu tetap memakai aset game. Pergantian ikon hanya dilakukan di lobi dan popup dengan `data-density="compact"`. Indikator bank baru juga memakai Lucide. Renderer petak/pion dan popup `preserved` tetap memakai aset sebelumnya.

## Bot

Paket bot digabung selektif setelah membaca [README v4.10](docs/bot-v410-package/README_UNTUK_AI.md). Engine, dispatcher, worker, server-authoritative online, lease, revision CAS, otorisasi dan hook memori tunggal dipertahankan. Baseline tujuan 4.9.1 tersedia di `benchmarks/pre-v410/lib`, khusus laboratorium.

Strategi memakai kalkulasi risiko kas, perencanaan pembangunan dengan stok bersama, likuidasi, negosiasi dan search CRN dari paket 4.10, ditambah cadangan pembangunan N50–N200. **LEARNED_MODEL tetap null**; bobot candidate belum lolos promosi. Build menolak model yang bukan promoted atau hash source-nya sudah berubah.

Tooling opsional `train:hybrid`, `benchmark:hybrid`, `benchmark:learning` dan `promote:mind` tersedia. Baca [laporan integrasi](docs/RELEASE_4100.md) sebelum menjalankan eksperimen. Smoke kecil hanya memeriksa alur/aksi legal, bukan bukti peningkatan win rate. Tidak ada promosi model otomatis.

## Online / Vercel

Pemeriksaan URL pengguna menemukan `/api/online` dan `/api/bot` merespons **500 FUNCTION_INVOCATION_FAILED** sementara build statis 4.8.3 berhasil. Entrypoint lama bergantung pada resolusi alias TypeScript; import Node biasa mereproduksi kegagalan resolusi `@/lib`. Tanpa Function Logs, penyebab lengkap deployment lama belum dapat dipastikan.

Build kini menghasilkan `server-dist` privat berisi native ESM dan alias relatif. `api/index.mjs` memuatnya tanpa alias loader atau TypeScript runtime. `vercel.json` menyertakan output privat ke function; static output tetap `dist`. Jangan mengunggah hanya `dist` sebagai situs statis. Function ini diuji lewat HTTP lokal dengan Node biasa, lalu berhasil deploy ke Vercel: build 4.9.0, online config HTTP 200/online:true, bot HTTP 200. Lihat docs/VERCEL_DIAGNOSIS_AFTER.json.

Online memerlukan URL, public/publishable key dan secret/service-role key Supabase dari proyek yang sama. Alias ENV integrasi Vercel dan key Supabase modern didukung. GET konfigurasi memberi JSON diagnostik aman bila ENV tidak lengkap, serta tidak pernah mengirim secret ke browser. Groq `openai/gpt-oss-20b` opsional; model bot lokal tetap tersedia tanpa Groq. Bot room online tetap dimatikan secara default sampai worker/scheduler staging tervalidasi.

Lihat [ENV_REQUIRED.md](ENV_REQUIRED.md) untuk nama ENV wajib, Auth redirect, pengecekan JSON, serta langkah uji dua akun/perangkat. SQL mn_* sebelumnya sudah diterapkan di connectify; update ini tidak menjalankan migration baru atau menghapus room/database eksternal.

## QA dan sumber

Suite browser: `test:browser`, `test:compact`, `test:plan`, `test:assets`, `test:stability`, `test:portrait`, `test:lobby`, `test:certificate`, `test:trade-certificate`, `test:auction`. Jalankan server dahulu. Playwright/Chromium diperlukan hanya untuk QA; set `MN_BROWSER_MODULE`, `MN_CHROMIUM_PATH`, dan opsional `MN_TEST_ORIGIN` jika terpasang di luar proyek. Perbandingan pixel memakai `scripts/capture-portrait-reference.mjs` pada baseline dan `MN_PORTRAIT_REFERENCE` pada suite portrait, dalam lingkungan browser/font yang sama.

Bukti aktual ada di laporan JSON `docs/`, dengan batas pengujian masing-masing. Browser memakai emulasi Chromium, belum perangkat Android/iOS fisik. Regresi API memakai mock/HTTP lokal. Pemeriksaan live setelah push mengonfirmasi endpoint Vercel merespons 200, konfigurasi mengarah ke connectify, serta guest/email Auth aktif. Login, transaksi room, Realtime multi-device dan scheduler belum diuji live.

Cache publik versi `v4100-<build>` tidak menyimpan API/Auth/state room dan tidak menghapus simpanan. ZIP menyertakan source, migration existing, baseline bot, tests, tooling, aset dan dokumentasi; mengecualikan `.env`, dependencies, build output dan log. `PACKAGE_MANIFEST.json` mencatat SHA-256 berkas. Dokumen rilis 4.8.x/lebih lama merupakan arsip; panduan aktif adalah README ini dan ENV_REQUIRED.md.

**Status Supabase connectify per 17 Oktober 2026:** Edge Function `monopoli-bots` v2, Vault, pg_net, pg_cron, dan scheduler sudah terpasang dan request HTTP 200/401 lolos. Auth email/tamu aktif; frontend Vercel masih 4.10.0 dan onlineBots masih false. Lihat [dokumen deployment aktual](docs/CONNECTIFY_DEPLOYED_20261017.md).
