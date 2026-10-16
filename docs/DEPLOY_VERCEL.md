> Hybrid Intelligence 4.0: panduan terbaru [DEPLOY_HYBRID.md](DEPLOY_HYBRID.md). Bagian Redis/duel di dokumen ini adalah jalur legacy; VS Bot baru 2–4 peserta dan `/api/bot` tidak memerlukan Redis.

> Pembaruan Online Multiplayer: room baru memakai Supabase, bukan Redis. Ikuti [DEPLOY_SUPABASE.md](DEPLOY_SUPABASE.md). Panduan Redis di bawah tetap relevan untuk pemulihan room legacy; tidak memigrasikan identitas/data secara otomatis.

# Deploy Monopoli Nusantara v2.2 ke Vercel

Paket ini menambahkan jalur Next.js asli untuk Vercel. Source, tampilan 2.5D, gambar, aturan v2, dan dukungan save v1 tetap disertakan.

## Mengapa paket lama dapat gagal

Paket v2 membangun `dist/server` untuk Cloudflare Workers melalui Vinext. API mengimpor `cloudflare:workers`, memakai D1, dan mengharapkan identitas dari ChatGPT. Itu tidak cocok dengan build dan runtime Next.js Vercel. Tanpa log deployment lama, penyebab persis kegagalan Anda belum dapat dipastikan; ketergantungan platform tersebut sudah dipisahkan pada v2.1.

## 1. Upload source dan deploy

1. Ekstrak ZIP. Gunakan **isi folder yang memiliki `package.json`**, `app/`, dan `vercel.json` sebagai root repository. Push pembaruan ke repository GitHub Anda.
2. Di Vercel, impor repository atau buka proyek lama. Pilih Root Directory yang berisi `package.json`.
3. Gunakan konfigurasi berikut. `vercel.json` sudah menyediakannya; jangan memakai `dist` sebagai output Vercel.

| Pengaturan | Nilai |
|---|---|
| Framework Preset | Next.js |
| Node.js Version | 24.x |
| Install Command | `npx --yes pnpm@11.25.0 install --frozen-lockfile` |
| Build Command | `npm run build:vercel` |
| Output Directory | `.next` |
| Root Directory | Folder yang memuat `package.json` |

4. Deploy. Jika proyek lama masih menggunakan konfigurasi/cache Vite atau Workers, gunakan Redeploy dengan build cache lama dimatikan satu kali.
5. Tanpa environment variable pun, beranda, aset dan VS Bot lokal dapat dibangun (save hotseat lama tetap kompatibel). UI menampilkan bahwa room online belum aktif.

Vercel membangun source sendiri. Jangan mengunggah `node_modules`, `.next`, `.env.local`, atau build `dist` lama. ZIP source ini sengaja tidak menyertakan dependency terpasang atau output build platform lain.

## 2. Aktifkan room online

Tambahkan database **Upstash Redis** lewat Storage/Marketplace Vercel atau gunakan database Upstash milik Anda. Ambil REST URL dan REST token yang dapat menulis, lalu tambahkan pada Settings → Environment Variables:

| Variable | Kebutuhan |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Wajib untuk room; URL HTTPS REST database |
| `UPSTASH_REDIS_REST_TOKEN` | Wajib untuk room; token baca/tulis, bukan token read-only |
| `GROQ_API_KEY` | Opsional; advisor VS Bot baru mandiri. Duel legacy tetap memakai Redis |
| `GROQ_MODEL` | Opsional; default `openai/gpt-oss-20b` |
| `ROOM_NAMESPACE` | Opsional; pemisah database untuk beberapa proyek |
| `ROOM_TTL_SECONDS` | Opsional; default `604800` (7 hari), rentang 1 jam–30 hari |

Alias `KV_REST_API_URL` dan `KV_REST_API_TOKEN` juga didukung jika integrasi Vercel Anda memakai nama itu. Pilih satu pasangan lengkap. Jangan memakai awalan `NEXT_PUBLIC_`; semua token hanya dibaca server.

Tambahkan nilai pada environment **Production**, dan **Preview** bila Anda ingin menguji preview. Redeploy setelah mengubah konfigurasi. Namespace default memisahkan production, preview, dan development. Jika satu database dipakai oleh beberapa proyek, berikan `ROOM_NAMESPACE` unik per proyek dan per environment, misalnya `monopoli-jovan:production` dan `monopoli-jovan:preview`. Preview dalam proyek yang sama berbagi namespace default.

Tidak perlu migrasi SQL untuk Redis. Room tersimpan di Redis, bukan memori fungsi Vercel. Masa simpan diperbarui saat perubahan room berhasil; membuka/polling room saja tidak memperpanjangnya. Room di D1 pada situs lama tidak otomatis dimigrasikan.

Akses bermain memakai nama tamu, kode room, dan token kursi pada perangkat. Tidak diperlukan login ChatGPT di Vercel. Siapa pun yang memegang kode dapat bergabung selama lobby belum dimulai; setelah mulai, token kursi diperlukan untuk membaca dan bertindak. Batas bawaan: 30 pembuatan room per IP per hari, 300 pembuatan room total per hari, 30 upaya JOIN per IP per menit, dan 1.000 keputusan Groq per hari. Pengguna pada jaringan/IP yang sama berbagi kuota.

## 3. Cek deployment

- Buka beranda, pastikan diorama dan pion muncul, lalu mulai permainan lokal.
- Buka `/api/game?status=1`: tanpa Redis, `online` dan `groq` bernilai `false`. Dengan pasangan konfigurasi Redis, `online: true`; dengan Redis dan kunci Groq, `groq: true`. Status ini memeriksa konfigurasi, bukan koneksi langsung ke penyedia.
- Buat room untuk menguji koneksi Redis sebenarnya; gabung dari perangkat/browser kedua, siap, dan mulai.
- Tutup/buka kembali pada perangkat yang sama untuk memeriksa pemulihan kursi.
- Jika konfigurasi penyimpanan gagal, mode lokal tetap tersedia. Lihat Runtime Logs Vercel dan periksa REST URL/token pada environment yang sedang dideploy.

## Menjalankan di komputer

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
# Opsional: salin .env.example ke .env.local lalu isi nilainya.
npm run dev:vercel
```

Untuk build produksi lokal:

```bash
npm run build:vercel
npm run start:vercel
```

Node.js 24 disarankan dan dipilih lewat `engines` pada `package.json`. pnpm dikunci agar instalasi tidak tergantung versi bawaan image Vercel. Jalur Sites lama tetap menggunakan `pnpm dev`/`pnpm build` dan konfigurasi Vite; jangan memilihnya sebagai Build Command Vercel.

## Jika masih gagal

| Gejala log | Yang diperiksa |
|---|---|
| `cloudflare:workers`, Worker, atau `.next` tidak ditemukan | Gunakan source v2.2 utuh, preset Next.js, build `npm run build:vercel`, output `.next` |
| `package.json` tidak ditemukan | Root Directory salah atau ZIP dimasukkan sebagai folder bertingkat |
| Versi pnpm/lockfile tidak cocok | Pertahankan `pnpm-lock.yaml` dan Install Command yang tercantum |
| Room belum aktif | Pasangan URL/token Redis belum diisi pada environment deployment |
| Penyimpanan tidak dapat dihubungi | Token salah/read-only, URL bukan REST HTTPS, database tidak aktif, atau kuota penyedia habis |
| Bot tetap lokal | Periksa `GROQ_API_KEY` dan status `/api/bot`; hanya duel legacy memerlukan Redis |

## Referensi primer

Diperiksa 15 Oktober 2026:

- Next.js di Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Konfigurasi proyek: https://vercel.com/docs/project-configuration
- Package manager: https://vercel.com/docs/package-managers
- Node.js: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Header IP platform: https://vercel.com/docs/headers/request-headers
- Upstash REST: https://upstash.com/docs/redis/features/restapi
- Lua EVAL: https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval

Build dan uji lokal tidak sama dengan deployment ke akun Vercel Anda. Tidak ada kredensial Vercel/Upstash/Groq pengguna yang dipakai dalam verifikasi paket ini. Hasil v2.2 tercantum pada `QA_PORTRAIT.md`; riwayat v2.1 pada `QA_VERCEL.md`.
