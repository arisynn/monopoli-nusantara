# Monopoli Nusantara — Kepulauan UI 4.7.1 — Board 2.5D

Frontend baru berdasarkan **paket logic v4.6.1 tanpa frontend**. Source aktif ini memakai 10 mockup terakhir yang disetujui, dengan penyesuaian: hanya lobby dan gameplay menjadi layar penuh, tanpa bottom tab, tanpa deretan properti di bawah papan. Fitur lain dibuka dalam popup dengan latar blur.

Baca [laporan implementasi dan QA](docs/KEPULAUAN_REPORT.md), [peta frontend](docs/FRONTEND_GUIDE.md), dan [kontrak logic](AI_UI_INTEGRATION.md). Nomor 4.7.1 menandai frontend baru; engine dan backend v4.6.1 dipertahankan. `lib/version.mjs` dan `/health` tetap melaporkan versi core headless, bukan versi UI. Versi UI tercantum di lobby, pengaturan, dan `/build.json`.

## Menjalankan

Gunakan **Node.js 24.x**, lalu dari folder source:

```bash
npm run build
npm start
```

Buka `http://127.0.0.1:8787`. Build frontend memakai ES modules, CSS, SVG, dan native TypeScript stripping untuk adapter storage. Tidak memerlukan React/Next, Redis, Supabase, Groq, atau instalasi dependency untuk VS Bot lokal. `npm run dev` menjalankan server yang sama; setelah mengubah source, jalankan build lagi dan refresh.

```bash
npm test                  # build + seluruh tes core/backend/frontend
npm run test:frontend     # build + tes sesi dan renderer frontend
npm run smoke:ui          # simulasi sesi lengkap VS Bot 2/3/4 peserta
npm run check:source      # syntax dan resolusi import source/output
npm run build:vercel      # build statis untuk konfigurasi Vercel terlampir
npm run selfplay -- --model=medium --seed=461 --max-actions=4000
```

`npm run typecheck` tetap tersedia untuk pemeriksaan TypeScript semantik setelah dependency pengembangan diinstal (`npm install --ignore-scripts`). Compiler `tsc` tidak tersedia di lingkungan pekerjaan ini. Native stripping dan build statis **bukan** pengganti typecheck semantik. Tidak ada script lint yang tersedia.

## Board 2.5D

Papan memakai perspektif trapesium SVG 2D, alas batu berketebalan, bayangan, rumah/hotel miniatur dan sprite pion yang berdiri tegak. Nama petak menghadap pemain di seluruh sisi. Proyeksi visual tidak mengubah koordinat engine, hasil dadu atau posisi tile. Tanpa WebGL, physics atau dependency 3D; kamera pan/zoom/follow tetap bekerja pada scene 2D.

## Alur antarmuka

- Lobby: atur nama/pion, 2–4 peserta VS Bot, persona tetap Raka/Bima/Sari dan empat model NUSA MIND; atau buat/gabung/lanjutkan room online.
- Gameplay: dua baris kapsul pemain bila peserta lebih dari dua, papan interaktif, ringkasan aktivitas, dadu dalam konsol UI, tombol tindakan utama dan Properti Saya. Ikon menu membuka akses Barter, Riwayat, room, simpanan, profil dan pengaturan.
- Detail petak, beli, kelola/bangun/gadai, barter/counteroffer, lelang, kartu, penjara, utang, hasil akhir, Auth dan pengaturan seluruhnya popup. Footer tindakan tetap berada dalam batas popup; isi panjang bergulir di dalamnya.
- Geser/cubit/scroll untuk kamera. Ikon peta berganti overview/follow. Reduced motion dan animasi cepat tersedia. Tombol Back menutup lapisan popup terlebih dahulu.
- Animasi menyajikan hasil engine/server: dadu → hasil → pion → kejadian → transaksi visual. Rent/pajak yang sudah dibukukan hanya diberi konfirmasi presentasi, tidak ditagih ulang.
- Aturan **Meja Klasik** tetap mendukung klaim sewa manual lewat tombol utama yang kontekstual dan menu Tagih Sewa.
- Lokal autosave memakai storage existing, lima slot, previous save, impor/ekspor JSON. Room online memakai snapshot backend dan identitas akun; JSON lokal tidak boleh mengganti state room.

## Backend dan deployment

`.env.example` hanya template. Masukkan nilai aktual melalui environment/secret manager **server**. Node tidak membaca `.env` otomatis; bila perlu:

```bash
node --env-file=.env --experimental-strip-types --import ./adapters/node/aliases.mjs adapters/node/server.mjs
```

- Variabel adapter Node: `MN_HEADLESS_HOST`/`MN_HEADLESS_PORT` (default `127.0.0.1:8787`) dan `MN_HEADLESS_ORIGIN` jika origin publik berbeda. Frontend dan `/api/*` harus satu origin.
- Groq opsional: `GROQ_API_KEY`, `GROQ_MODEL`, timeout/budget. Key tidak pernah masuk static output. Status terkonfigurasi berbeda dari keberhasilan request.
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan secret `SUPABASE_SERVICE_ROLE_KEY` hanya di server. Browser mengambil URL dan key publik dari endpoint konfigurasi. Identitas Auth, keanggotaan, revision, idempotency, pause/voting/reconnect tetap di backend existing.
- Bot online memerlukan worker, migration 002, Vault, pg_net dan recovery scheduler yang sudah disediakan source logic. Default `MN_ONLINE_BOTS_ENABLED=false`; aktifkan setelah staging lulus. Browser host tidak menjalankan bot room. Lihat [deployment Supabase](docs/DEPLOY_SUPABASE.md) dan [deployment hybrid](docs/DEPLOY_HYBRID.md). Jangan mengulang migration yang sudah diterapkan.
- Vercel: pilih **Other**, Node **24.x**, gunakan `vercel.json` (build `npm run build:vercel`, output `dist`). `api/index.ts` mengadaptasi handler Fetch existing dan rewrite `/api/online`, `/api/bot`, `/api/game`. Supabase Edge Function dan scheduler dipasang terpisah. Belum dilakukan deployment aktual ke Vercel.
- Hosting statis saja dapat menjalankan VS Bot setelah build, tetapi fitur server membutuhkan adapter API pada origin yang sama. Jangan menyajikan direktori repository sebagai static root; gunakan **hanya `dist/`**.

## Assets dan cache

Background kepulauan dan atlas properti dibuat baru untuk tema putih/biru. Logo, avatar dan ikon UI baru berupa SVG. Identitas enam pion tetap sama, dengan atlas miniatur transparan baru. SVG pion lama, simbol Nusa dan ikon petak khusus dipertahankan sebagai aset kompatibilitas. Lihat [manifest aset](docs/ASSET_MANIFEST.json) untuk detail perubahan dan hash.

Service worker baru hanya menyimpan shell, modul browser dan aset publik. API/Auth/state room tidak dicache; IndexedDB/localStorage save tidak dihapus. Cache/worker Nusantara lama dipensiunkan secara terbatas. Pemakaian offline perlu satu kunjungan online yang berhasil dan instalasi cache lengkap terlebih dahulu.

## Batas verifikasi

Tes otomatis mencakup engine, backend, renderer SVG/HTML, sesi UI, transport Vercel dan simulasi 2/4/6 client. Pengujian layout/klik browser Android, Supabase live/RLS/Realtime dan Groq live **belum terverifikasi**. Chromium ditolak sandbox (`setsockopt: Operation not permitted`); tidak ada klaim screenshot browser, deployment, atau production-ready.

Paket logic awal tetap tersedia sebagai backup terpisah. Dokumen `HEADLESS_*`, `MIND_*`, `QA_V46_*` dan `DEPLOY_V4*` adalah bukti/panduan historis; hasil baru berada pada `KEPULAUAN_*` dan `QA_KEPULAUAN_RESULTS.json`.
