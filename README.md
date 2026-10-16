# Monopoli Nusantara 4.8.3 — Keamanan Simpanan & Stabilitas

Source aktif melanjutkan 4.8.2 (nama ZIP 4.8.1 sebelumnya hanya typo): papan klasik 40 petak selebar layar portrait tanpa bingkai pilihan dan tanpa kotak deck tengah, dua layar utama (lobby dan gameplay), serta popup untuk fitur lain. Update ini menyatukan pembangunan, penjualan, gadai dan penebusan di Aset Saya, menambahkan pilihan jumlah bangunan dan Gadai Otomatis, memperjelas petak khusus/pajak, serta mengganti sepuluh ikon papan dengan PNG hasil generasi baru. Engine, ekonomi, bot dan otorisasi multiplayer dipertahankan.


Update 4.8.3 menambahkan satu tab penulis lokal, pemeriksaan konflik autosave atomik di IndexedDB, pemulihan simpanan terbaru, layout landscape kecil, metadata versi terpadu, fingerprint seluruh output/aset dan format sumber frontend yang mudah dibaca. Restore/import eksplisit tetap dapat memuat versi pertandingan lebih lama; save schema dan aturan ekonomi tetap.

Panduan deployment aktif: [DEPLOY_483.md](docs/DEPLOY_483.md). Laporan rilis: [STABILITY_REPORT.md](docs/STABILITY_REPORT.md). Target Supabase **connectify**, bukan proyek novel champagne. Schema mn_* sudah diterapkan pada connectify; runtime online masih membutuhkan service-role key server dan pengujian Auth/Realtime lintas perangkat.

Baca [laporan implementasi dan QA 4.8.2](docs/ASSETS_REPORT.md), [peta frontend](docs/FRONTEND_GUIDE.md), [pemetaan 32 kartu](docs/CARD_ASSET_MAP.json), dan [kontrak engine](AI_UI_INTEGRATION.md). File laporan CLASSIC/KEPULAUAN/MIND/HEADLESS lama merupakan sejarah rilis sebelumnya kecuali hasil tes yang diperbarui oleh runner. `/health`, `/build.json` dan UI kini memakai releaseVersion yang sama; engine schema 2 dan rulepack nusantara-c1009-2 ditampilkan terpisah.

## Menjalankan

Node.js **24.x**. Build dan runtime tidak memerlukan dependency produksi:

```bash
npm run build
npm start
```

Buka `http://127.0.0.1:8787`. Server menyajikan **dist/**. Setelah mengubah source, jalankan build kembali. VS Bot tetap dapat bermain tanpa Redis, Supabase atau Groq; cache offline memerlukan kunjungan pertama yang berhasil.

```bash
npm test                  # build dan seluruh tes engine/backend/frontend
npm run check:source      # syntax dan resolusi import source/output
npm run smoke:ui          # sesi VS Bot 2/3/4 peserta tanpa DOM
npm run build:vercel      # build native Node statis, bukan Next.js
npm run test:assets       # QA browser untuk aset terpadu, katalog/pajak dan gadai
npm run diagnose:online   # hanya keberadaan/bentuk konfigurasi, tanpa nilai secret
npm run test:stability    # regresi dua tab dan landscape kecil
npm run format:check      # format sumber frontend dan adapter
```

Untuk TypeScript: `npm ci --ignore-scripts`, lalu `npm run typecheck`. Tidak ada lint semantik penuh; formatter Prettier dipin bersama TypeScript dan tipe Node. checkJs tetap false, sehingga typecheck belum mencakup semantik semua modul JavaScript.

## UI dan aset

- Header: hamburger, Nusantara, satu kamera pada gameplay. Aset/Barter berdampingan pada konsol; profil melalui kapsul; riwayat melalui dua baris informasi di atas info petak. Hamburger gameplay berisi fitur pendukung tanpa salinan akses tersebut.
- Baris aksi mengikuti kejadian yang sedang diperlihatkan; baris Nusa mengikuti transaksi publik yang sudah sah. Tinggi tetap. Hasil dadu tidak masuk baris aksi sebelum reveal.
- Feedback uang berada pada baris tetap di dalam kapsul. Profil menampilkan ledger pemain yang dipilih, dari log publik tersimpan (maksimal 300 kejadian), bukan rekonstruksi seluruh sejarah pertandingan.
- Tab Bangun dalam Aset Saya menampilkan delapan kelompok warna, kelompok siap di atas, kepemilikan, biaya dan perubahan sewa. Satu kelompok harus lengkap; status gadai, pembangunan merata, saldo, bank, utang dan lelang mengikuti validator. Tombol Barter ke pemilik yang dibutuhkan menyiapkan draft; belum mengirim transaksi. Panel tetap terbuka setelah membangun/menggadai/menebus. Pemain dapat memilih jumlah bangunan per kelompok; perintah dijalankan satu per satu, merata dan divalidasi ulang. Antrean berhenti bila panel ditutup, halaman disembunyikan, pause, disconnect, revision berubah atau bank perlu keputusan lain. Antrean tidak disimpan dan tidak diulang saat refresh.
- Gadai Otomatis menampilkan daftar rekomendasi dan dana sebelum eksekusi. Aset dengan bangunan atau yang sudah digadai dikecualikan; set lengkap dipertahankan bila alternatif cukup. Perkiraan kehilangan sewa, biaya pemulihan, kelompok hampir lengkap dan posisi lawan ikut dinilai. Bila daftar/revision berubah, rekomendasi tidak diganti diam-diam. Ini heuristik bantuan, bukan jaminan strategi terbaik.
- Ketuk petak khusus untuk info. Kesempatan/Dana Umum menampilkan katalog 16 kartu dengan scroll internal, bukan urutan deck. Pajak Penghasilan N 200 dan Kemewahan N 100 tetap ke Bank, tanpa perhitungan kekayaan/opsi 10% atau jackpot Parkir Bebas. Pembayaran sekali tetap dari engine. Semua popup dibatasi tinggi agar footer dapat dijangkau.
- Draft barter disimpan privat pada perangkat per match, identitas, lawan dan konteks counteroffer. Menutup popup tidak mengirim tawaran. Semua nilai divalidasi ulang saat pengiriman. Penyimpanan tidak tersedia memakai draft sesi dengan status jujur.
- Pemilihan aturan, peserta, aset pemain dan opsi lainnya memakai kontrol game; native select hanya adapter nilai tersembunyi. Tidak ada prompt/confirm/alert untuk keputusan game.
- Kesempatan/Dana Umum: 16 ilustrasi kontekstual dipetakan eksplisit ke **32 kartu**, 16 tiap deck. Teks, nominal, urutan dan efek dari engine. Dokter, pendidikan, kereta, penjara, perbaikan dan uang memakai ikon sesuai konteks; tidak dibagi acak.
- Sertifikat ringkas memakai warna kelompok, tabel sewa asli, harga bangun/gadai, PNG rumah/hotel dan simbol stasiun/utilitas. Popup bertombol footer tidak mempunyai X di sudut; footer, Escape/Back tetap menyediakan jalan keluar yang sesuai.
- Enam profil hewan kepala–bahu, enam pion memanjang, rumah/hotel, ikon UI, kartu dan monogram Nusa memakai PNG transparan. Numeric pawn IDs tetap 0–5. Board tetap SVG **untuk garis, teks dan hit area**, sedangkan ilustrasinya PNG supaya nama/harga tetap tajam saat zoom. Master PNG ikon papan baru dan master SVG logo Nusa disimpan di `design/`; runtime tidak mengunduh aset SVG.
- Seluruh aset runtime lama di luar papan sudah dihentikan; atlas pion lama kemudian diganti sesuai instruksi. Sepuluh ikon papan kini diganti PNG hasil generasi dengan gaya retro yang sekeluarga dengan kartu; master SVG ikon papan lama dihentikan. Lihat `ASSET_CLEANUP.json` dan `ASSET_MANIFEST.json`.

## QA browser

Jalankan server/build lebih dahulu, lalu `npm run test:browser`, `npm run test:compact`, dan `npm run test:plan`, dan `npm run test:assets`, serta `npm run test:stability`. QA memerlukan Playwright dan Chromium; keduanya tidak menjadi dependency produksi. Bila terpasang di luar proyek, set `MN_BROWSER_MODULE` dan `MN_CHROMIUM_PATH`. Opsional: `MN_TEST_ORIGIN`, `MN_BROWSER_OUTPUT`.

Hasil aktual ada pada `CLASSIC_TEST_RESULTS.json`, `CLASSIC_BROWSER_RESULTS.json`, `COMPACT_BROWSER_RESULTS.json`, `PLAN_BROWSER_RESULTS.json`, `ASSETS_BROWSER_RESULTS.json` dan `ASSETS_VERIFICATION.json` dalam `docs/`. Pengujian portrait memakai emulasi Chromium, bukan Android fisik. Enam kursi manusia pada fixture hanya untuk QA UI, bukan mode hotseat baru. Pengujian online menggunakan simulasi/handler lokal dan mock konfigurasi, bukan Supabase live.

## Online dan deployment

Runtime lokal memiliki konfigurasi privat Upstash/Groq dan endpoint publik connectify, tetapi service-role key server belum tersedia. `/api/online?config=1` tetap `online:false` hingga konfigurasi server lengkap. File `.env` privat tidak disertakan dalam ZIP. UI membedakan belum dikonfigurasi, gagal memuat konfigurasi, perlu masuk, dan room terputus; Periksa ulang tidak menghapus simpanan.

`npm start`/`npm run dev` kini membaca `.env` jika tersedia. Pada hosting gunakan secret manager server. Jika memanggil Node langsung:

```bash
node --env-file=.env --experimental-strip-types --import ./adapters/node/aliases.mjs adapters/node/server.mjs
```

Konfigurasi server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Hanya URL dan key publik boleh sampai browser. Simpan service role dan Groq key hanya pada server. Jangan memasukkan nilai secret ke ZIP.

Vercel: framework **Other**, Node **24.x**, build `npm run build:vercel`, output `dist`, rewrite `/api/*` melalui `api/index.ts` sesuai `vercel.json`. Atur ENV untuk environment deployment yang benar, lalu redeploy. Build lokal bukan bukti deployment Vercel berhasil.

Periksa Supabase Auth URL/redirect origin publik, metode guest/email yang digunakan, tiga migration existing, RLS/permission RPC dan Realtime `mn_room_updates` pada staging. Jangan mengulang migration tanpa melihat keadaan project. Update 4.8.3 telah menerapkan tiga migration mn_* pada connectify setelah audit; satu room legacy mp_rooms tetap dipertahankan. Lihat DEPLOY_483.md sebelum menjalankan SQL ulang. Lihat `docs/DEPLOY_SUPABASE.md`, `docs/DEPLOY_HYBRID.md`, dan bagian diagnosis pada laporan baru.

Bot online tetap backend-authoritative dengan jobs/lease/recovery existing. `MN_ONLINE_BOTS_ENABLED` default false sampai worker staging tervalidasi. Groq opsional. Groq live telah diuji (structured output dan satu keputusan advisor game); Supabase SQL/RLS/grants/publication diverifikasi. Auth/Realtime multi-device, scheduler bot dan deployment aplikasi belum diuji live.

## Cache dan kompatibilitas

Cache shell `nusantara-classic-v483-<build hash>` hanya menyimpan modul/aset publik, tidak API/Auth/room state. Cache Nusantara lama dibersihkan tanpa menghapus localStorage/IndexedDB pertandingan. Schema save, angka ekonomi, numeric pawn IDs dan aturan bot tetap; nama visual pion berubah menjadi warna sesuai aset barunya.

Paket source menyertakan backend, migration, tests, docs, lockfile, aset dan master desain; tidak memuat `node_modules`, `dist`, secret ENV atau log. `PACKAGE_MANIFEST.json` mencatat hash setiap file selain dirinya sendiri. Bandingkan perubahan inti pada `docs/ASSETS_CORE_INTEGRITY.json`.
