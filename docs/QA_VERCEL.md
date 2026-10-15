# Verifikasi v2.1 — Vercel Ready

Tanggal: 15 Oktober 2026. Runtime pengujian Node.js 24.19.0, Next.js 16.3.4, pnpm 11.25.0.

## Lulus

- Instalasi pada salinan source dengan `node_modules` kosong menggunakan perintah persis `npx --yes pnpm@11.25.0 install --frozen-lockfile`. Lockfile tidak berubah; paket diambil dari cache paket lingkungan pengujian.
- `npm run build:vercel`: kompilasi webpack, pemeriksaan TypeScript, prerender beranda, dan bundling `/api/game` sebagai route dinamis. Tidak memerlukan Redis atau Groq pada tahap build.
- Pemeriksaan artefak produksi Next.js: HTML beranda, tombol utama, referensi hero, tujuh script terbundel, empat WebP, dan trace API tanpa impor `cloudflare:workers`/Wrangler/Miniflare.
- **10 kelompok pengujian Node/Redis** terhadap handler API dari bundle `.next`: konfigurasi/TTL, benturan kode, penyimpanan lintas instans adapter, compare-and-swap bersamaan, kuota atomik, pemisahan namespace, lease AI dan pelepasan oleh pemilik yang benar, redaksi error penyedia, status tanpa konfigurasi, dan alur permainan room.
- Alur room pada pengujian tersebut mencakup tamu tanpa header ChatGPT, create/join/ready/start, deck dan token tidak bocor, otorisasi kursi, dua aksi bersamaan, retry idempoten, reconnect, penolakan token salah/late join, AI cadangan, enam kursi, pemeriksaan origin/ukuran request, dan kuota tamu yang tidak bisa dilewati dengan memalsukan header ChatGPT.
- Adapter Redis diuji memakai **fakeredis 2.40.0 dan Lua/lupa**, yang menjalankan skrip Lua aplikasi. Ini emulator; tidak mengklaim pengujian database Upstash live.
- **9 kelompok integrasi API D1** tetap lulus setelah abstraksi penyimpanan diperkenalkan.
- Build Sites/Cloudflare dan smoke test bundle Workers juga lulus: SSR, gambar, script, route API, migrasi D1, dan pembuatan room. Pemilihan runtime Sites memakai loader khusus Vite; bundle Next.js tetap memakai runtime Node.

## Menjalankan ulang

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run build:vercel
node tests/vercel-build.test.mjs
# Fixture pengujian saja; Python bukan kebutuhan deployment Vercel:
python -m venv .venv-qa
. .venv-qa/bin/activate
pip install 'fakeredis[lua]==2.40.0'
node tests/redis.test.mjs
```

Untuk tes mesin permainan dan save: `pnpm test`. Mesin/aturan tidak diubah pada v2.1; 62 tes dan simulasi sebelumnya tercatat pada `QA.md`. Tes integrasi Sites: `node tests/api.test.mjs`. Smoke test Sites: `node tests/production.test.mjs` setelah build Sites.

## Belum diuji

- Deployment ke akun/domain Vercel pengguna, koneksi Upstash live, dan Groq live. Tidak ada akun atau secret tersebut yang diberikan.
- Interaksi browser/perangkat nyata, WebGL/FPS/sentuhan, offline service worker, dan multiplayer lintas perangkat. Tidak tersedia skill kontrol browser, sehingga tidak ada klaim pengujian visual langsung.
- Kesamaan seluruh wajah kartu/sertifikat C1009: batas audit v2 tetap berlaku, lihat `RULEPACK.md`.

Konfigurasi server eksternal harus diisi oleh pemilik deployment. Tanpa konfigurasi, aplikasi sengaja tetap menyediakan hotseat dan bot lokal, dengan room online ditampilkan sebagai belum aktif.
