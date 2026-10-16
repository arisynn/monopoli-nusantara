> Panduan historis. Untuk perintah build/runtime dan status database terbaru gunakan [DEPLOY_483.md](DEPLOY_483.md).

# Deploy NUSA MIND v4.6

Status: source kandidat; **jangan promosi produksi sampai semantic TypeScript, production build dan staging live lulus**. Lingkungan pengerjaan tidak memiliki executable Next/TypeScript atau kredensial Supabase/Groq. Tidak ada deployment atau migrasi produksi dilakukan.

1. Gunakan source v4.6 hasil paket, bukan v2.x/ZIP hotfix lama. Jalankan Node 24 dan pnpm sesuai packageManager/lockfile. Instal dependency melalui prosedur CI proyek yang sudah ada; jangan mengganti versi atau lockfile untuk menyembunyikan error.
2. Jalankan `npm run typecheck`, `npm test`, `npm run test:bots`, `npm run test:mind`, `npm run test:experience`, `npm run lint`, `npm run build:vercel`. Untuk hosting Sites, jalankan juga `npm run build` memakai environment hosting yang benar. TypeScript kontrak di tests/types ikut diperiksa tsc. Parser Babel bukan pengganti tsc.
3. Staging Supabase: pastikan migration 001 persistent-online dan 002 hybrid-bot-jobs sudah sesuai kondisi database, backup/snapshot tersedia, lalu review dan apply **202610160003_nusa_mind_settings.sql**. Ini menambahkan trigger validasi flag advisor dan level bot; tidak mengubah saldo, snapshots lama, tabel ekonomi atau aturan permainan. Pengaturan hilang dibaca Medium/false.
4. Deploy ulang `supabase/functions/monopoli-bots` dengan shared lib engine/bot v4.6 secara bersamaan dengan aplikasi. Pertahankan JWT Auth frontend, secret custom worker, CAS/lease/jobs/cron/Vault yang sudah dijelaskan pada DEPLOY_HYBRID.md/DEPLOY_V45.md. Jangan menjalankan online bot hanya dengan request browser host. Verifikasi queue wake + cron recovery sebelum mengaktifkan MN_ONLINE_BOTS_ENABLED.
5. GROQ_API_KEY/GROQ_MODEL hanya pada server/Edge secret manager. Groq default per match/room **off**, meskipun ENV tersedia. Aktifkan melalui setup sebelum match; jangan mengubah level/flag diam-diam pada pertandingan berjalan. Tidak ada perubahan default model atau retry berbayar otomatis.
6. Uji 2 manusia, 2 manusia+3 bot, 3 manusia+3 bot dan 6 manusia. Setiap level/persona diperiksa; human disconnect tetap memblok keputusan/auto-pause90s; bot tidak vote/ready; stale advisor dan bot lease hanya boleh commit satu aksi.
7. Uji bundle module Web Worker pada Next dan hosting aktual, CSP worker-src same-origin, offline setelah aset worker berhasil tercache, abort saat pindah room/menu/pause. Fallback worker yang tidak tersedia adalah Medium lokal, dengan diagnostik QA workerFallback. PWA cache baru nusantara-v460 hanya mengganti cache UI; IndexedDB/saves tidak dihapus dan reload tidak dipaksa.
8. Pantau lease/job failures, action latency, fallback, error quota dan build ID internal. Default bot Medium menjaga jalur ekonomi sebelumnya. Hard/Hardcore tersedia, tetapi **difficulty ladder/keunggulan kompetitif belum boleh diasumsikan** dari nama level.

Rollback: matikan flag bot online/stop wake worker, tunggu lease selesai atau kedaluwarsa, rollback aplikasi dan worker sebagai satu pasangan. Jika versi lama belum memahami level per bot, review/drop hanya trigger mn_guard_mind_settings dan fungsinya sebelum rollback; jangan menghapus data room. Pertahankan snapshot untuk kembali ke v4.6. Tidak ada training otomatis di produksi atau perubahan ekonomi untuk mempercepat benchmark.

Lihat MIND_REPORT.md untuk perintah eksperimen, gates dan checklist manual.
