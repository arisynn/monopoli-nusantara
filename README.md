# Monopoli Nusantara 4.8 — Papan Klasik

Frontend aktif menggunakan papan 2D klasik selebar layar portrait, header ringkas, Aset dan Barter berdampingan, serta dadu datar dengan animasi perubahan titik. Lobby dan gameplay menjadi dua layar utama; fitur lain dibuka dalam popup. Engine, ekonomi, bot, Auth dan room Supabase dipertahankan.

Baca [laporan 4.8](docs/CLASSIC_REPORT.md), [panduan frontend](docs/FRONTEND_GUIDE.md) dan [kontrak integrasi engine](AI_UI_INTEGRATION.md). Basis logic adalah paket headless v4.6.1 yang dicatat di `design/SOURCE_OF_TRUTH.json`; source UI aktif ini bukan frontend React lama. `/build.json` melaporkan versi UI, sedangkan `lib/version.mjs` dan `/health` tetap metadata core historis.

## Menjalankan

Gunakan Node.js **24.x**. Tidak perlu instalasi dependency untuk build dan bermain VS Bot:

```bash
npm run build
npm start
```

Buka `http://127.0.0.1:8787`. `npm run dev` menjalankan server yang sama; jalankan ulang build setelah mengubah source. Static root adalah **dist/**, bukan seluruh repository.

```bash
npm test                 # build + seluruh tes engine/backend/frontend
npm run test:frontend    # build + tes sesi/renderer/widget frontend
npm run check:source     # syntax dan resolusi import source/output
npm run build:vercel     # native Node build statis, bukan Next.js
npm run smoke:ui         # simulasi sesi VS Bot 2/3/4 peserta tanpa DOM
```

Untuk pemeriksaan TypeScript semantik:

```bash
npm ci --ignore-scripts
npm run typecheck
```

Dependency pengembangan hanya TypeScript dan tipe Node. Runtime frontend tetap ES modules, CSS dan SVG tanpa React/Next atau library 3D. Tidak ada script lint pada source basis.

## Desain dan alur

- Header hanya hamburger, nama Nusantara, serta kamera ketika gameplay. Tidak ada kamera di samping papan atau ikon pengaturan ganda.
- Papan persegi memakai seluruh lebar viewport portrait. Seluruh 40 petak tetap utuh dan koordinat engine tidak berubah. Nama lengkap sesuai BOARD; kata tunggal tidak dipotong sembarang. Nama dekat strip kelompok, harga di tepi luar, dengan orientasi isi petak 0°/90°/180°/270° menghadap tengah seperti papan klasik. Teks dapat dipadatkan secara horizontal pada petak sempit.
- Properti biasa: warna kelompok, nama, penanda pemilik/rumah/hotel/gadai. Harga/tabel sewa/detail berada pada popup. PNG transparan hanya untuk petak khusus; source vektornya tersedia di `design/classic-icons/`.
- Tengah papan memakai nama Nusantara dan dua area deck sederhana. Tidak memakai perspektif, alas batu, dekorasi pulau atau atlas foto pada petak biasa.
- Kapsul pemain 2–6 peserta, paling banyak dua baris. Aset dan Barter berada berdampingan di konsol bawah, diikuti dadu dan tindakan utama. Fitur lainnya lewat hamburger. Detail aset/kartu/barter/lelang/penjara/utang/profil/riwayat/save/room/settings tetap popup.
- Dadu tidak berputar atau berpindah ke tengah papan. Pip dekoratif berubah selama rolling, tanpa menerima hasil sah pada widget sampai tahap reveal. Pasangan yang sudah diperlihatkan disimpan dalam view presentasi agar tidak kembali ke log dadu lama ketika pion bergerak.
- Timer animasi tidak menentukan hasil gameplay. Klik ganda, versi state, hak bertindak dan idempotency tetap diperiksa. Snapshot reconnect menjadi baseline, bukan replay animasi lama.
- VS Bot memakai NUSA MIND existing, tiga persona dan empat model. Groq opsional; permainan lokal tidak memerlukan server, Redis atau Supabase. Aturan klasik tetap mempunyai akses Tagih Sewa.
- Autosave lokal, lima slot, previous save dan impor/ekspor JSON tetap menggunakan adapter existing. Room online tidak diubah lewat impor JSON.

## QA browser

`npm run test:browser` adalah suite terpisah yang memerlukan Playwright dan Chromium yang tersedia pada mesin QA. Keduanya tidak menjadi dependency produksi game. Jalankan server dan build terlebih dahulu. Bila modul/browser berada di luar project, gunakan `MN_BROWSER_MODULE` (path modul Playwright) dan `MN_CHROMIUM_PATH` (path executable). `MN_TEST_ORIGIN` opsional; default localhost:8787. Screenshot diletakkan di `MN_BROWSER_OUTPUT` atau `/tmp/nusantara-browser-qa`.

Laporan `docs/CLASSIC_BROWSER_RESULTS.json` mencatat hasil browser aktual. Viewport mobile adalah emulasi Chromium, belum pengujian perangkat Android fisik. Fixture enam kursi pada tes layout hanya fixture UI dan bukan penambahan mode hotseat baru.

## Backend dan deployment

`.env.example` hanya template, tanpa secret. Gunakan environment/secret manager server. Node tidak membaca `.env` otomatis; bila diperlukan:

```bash
node --env-file=.env --experimental-strip-types --import ./adapters/node/aliases.mjs adapters/node/server.mjs
```

- Adapter Node: `MN_HEADLESS_HOST`/`MN_HEADLESS_PORT` default 127.0.0.1:8787; `MN_HEADLESS_ORIGIN` harus cocok dengan origin publik bila memakai reverse proxy. Frontend dan `/api/*` satu origin.
- Vercel: framework **Other**, Node **24.x**, konfigurasi `vercel.json`, build `npm run build:vercel`, output `dist`. `api/index.ts` meneruskan handler Fetch existing untuk online/bot/game. Belum melakukan deployment Vercel aktual.
- Supabase membutuhkan URL/key publik serta service role key **hanya di server**. Browser mendapat URL dan public key melalui endpoint config. Identitas, kursi, transaksi, revision, persistence, pause/vote/resume dan heartbeat tetap backend-authoritative.
- Bot online tetap memakai jobs/lease/Edge Function/scheduler existing, tidak dijalankan browser host. Default `MN_ONLINE_BOTS_ENABLED=false`; aktifkan sesudah staging worker terverifikasi. Lihat `docs/DEPLOY_SUPABASE.md` dan `docs/DEPLOY_HYBRID.md`.
- Tidak ada migration baru pada update ini. Jangan mengulang migration existing tanpa memeriksa project. Tidak ada database produksi yang diubah.
- Groq memakai ENV server, bersifat opsional, dan tidak pernah masuk bundle publik. Tidak ada request Groq live atau Supabase live pada QA ini.

## Cache dan kompatibilitas

Cache shell dinaikkan ke `nusantara-classic-v480`. Service worker menyimpan aset/modul publik, tidak menyimpan respons API/Auth/state room. Cleanup terbatas pada cache Nusantara; save IndexedDB/localStorage tidak dihapus. Offline memerlukan kunjungan online yang berhasil untuk memasang cache lengkap.

Identitas pion, schema save dan rulepack tetap. Dua file shared presentation berubah untuk memperbaiki queue kosong dan mempertahankan hasil reveal; engine aturan, strategi bot dan backend otorisasi tidak diubah. Lihat `docs/CLASSIC_CORE_INTEGRITY.json` dan `docs/ASSET_MANIFEST.json`.

Dokumen HEADLESS, MIND, KEPULAUAN dan laporan 4.7 adalah bukti historis. Hasil aktif update ini memakai nama `CLASSIC_*`; runner gabungan menulis `CLASSIC_TEST_RESULTS.json`.
