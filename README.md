# Monopoli Nusantara v4.5 — Board & Gameplay Experience

**Status v4.5:** urutan dadu → pion → kejadian → transaksi visual kini memakai satu antrean presentasi; event kartu/ledger berasal dari shared engine. Detail board, kapsul dan riwayat diperkuat tanpa mengubah aturan atau strategi bot. [Laporan v4.5](docs/V45_REPORT.md) · [Deployment](docs/DEPLOY_V45.md) · [QA](docs/QA_V45_RESULTS.json). Build/TypeScript penuh, Supabase live dan Android/browser belum terverifikasi.

Web game properti 2D berbahasa Indonesia. v4.5 melanjutkan fondasi Hybrid Intelligence 4.0 dan Supabase; laporan lama tetap disimpan sebagai riwayat verifikasi. Papan SVG, antarmuka React, shared engine JavaScript, server Next.js/Vercel + Upstash Redis, serta jalur Vinext/Cloudflare Workers + D1.

v2.11 menyempurnakan board: monogram Nusa, artwork spesial dan kartu yang baru, enam pion SVG berbeda yang bisa dipilih, serta cluster pion simetris. Aset kartu lama dihapus. Nilai ekonomi, aturan, kamera, dadu dan Smart Gameplay Flow v2.10 dipertahankan.

**Hotfix 2.11.1:** memperbaiki TS2322 pada dua prop `GameNotice.message`. Pesan tetap string; rendering Nusa dilakukan di komponen notifikasi. [Detail hotfix](docs/HOTFIX_v2.11.1.md).

**Riwayat verifikasi v2.11 (sebelum pembaruan Hybrid):** 147 tes regresi + 7 tes kamera lulus; sintaks 29 berkas TS/TSX diperiksa dengan parser Babel. TypeScript penuh, build, lint, React DOM/Android dan room live belum terverifikasi. Lihat [perubahan, kompatibilitas dan checklist v2.11](docs/UPDATE_v2.11.md).

## Fitur tersedia

- Gameplay HP portrait menggunakan tinggi layar aktif; kapsul pemain memakai grid adaptif 2–6 pemain. Setup, aset, barter, riwayat, dan keputusan panjang menggunakan panel yang dapat digulir. Beranda dapat digulir pada layar pendek.
- Papan SVG 40 petak dengan empat sudut besar dan pita warna klasik. Dua tampilan: Seluruh papan dan Dekat/Ikuti pemain. Geser dan pinch zoom langsung pada papan tanpa tombol, minimap, atau label yang menutupi petak. Jelajah manual tetap aktif sampai tombol Ikuti pemain ditekan.
- Lima slot save lokal, arsip permainan sebelumnya, ekspor/impor JSON tervalidasi, serta pengaturan yang diingat di perangkat.

- Dua mode baru: VS Bot (2–4 peserta: manusia + Raka/Bima/Sari, tanpa difficulty selector) dan Online Multiplayer (2–6 peserta, minimal dua manusia, maksimal tiga bot unik setelah worker diverifikasi). Save hotseat lama dan adapter bot/Groq lama dipertahankan untuk kompatibilitas.
- Jalur online baru: Supabase Auth, kursi per UUID, snapshot privat persisten, transaksi atomik, revision hints Realtime, reconnect, voting mayoritas, auto-pause dan resume semua aktif siap. Belum tervalidasi pada Supabase live.
- Pion SVG orisinal dapat dipilih di setup/lobby, lalu konsisten pada board dan HUD. Kartu Kesempatan/Dana Umum memakai artwork baru; ilustrasi regional existing dipakai pada kota.
- Aturan dasar C1009: lempar awal, lelang terbuka, lelang stok bangunan langka, barter saat utang/di luar giliran, pilihan langsung tebus aset tergadai, dan opsi klaim sewa manual.
- 40 petak, 28 sertifikat, 32 kartu, dadu kembar, penjara, sewa, pajak, lelang, gadai, bangunan merata, barter dan tawaran balik, utang/kebangkrutan/pemenang.
- Papan tidak memakai WebGL atau Three.js. Teks, ikon spesial, bangunan dan pion tetap vektor saat diperbesar; strip kota memakai ilustrasi WebP existing. Efek suara, animasi cepat, reduced motion, serah giliran tetap tersedia.
- Save lokal IndexedDB dengan salinan localStorage; service worker untuk cache shell setelah pemuatan awal. Offline perlu origin HTTPS dan cache yang telah terisi. Mode room dan Groq membutuhkan koneksi.

Baca `docs/RULEPACK.md` untuk adaptasi yang eksplisit dan batas verifikasi v2. Baca `docs/QA_BOARD_2D.md` untuk pemeriksaan dasar kamera, serta `docs/UPDATE_v2.4.md` untuk peningkatan UX dan batas pengujian perangkat nyata.

## Deploy Vercel

Gunakan `vercel.json` yang disertakan. Framework **Next.js**, Node **24.x**, build `npm run build:vercel`, output `.next`. Panduan lengkap dan environment variables: [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md). VS Bot tidak memerlukan database. Room online baru memerlukan Supabase; lihat panduan di atas. Upstash/D1 dipertahankan untuk room legacy. Groq opsional untuk VS Bot tanpa database; bot lokal tetap mandiri.

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run dev:vercel
# Produksi: npm run build:vercel && npm run start:vercel
```

## Pengembangan Sites / Cloudflare

Node.js 24, pnpm 11.25.0.

```bash
pnpm install
pnpm dev
```

Di lingkungan Sites, gunakan helper setup/preview/build resmi. Manifest `.openai/hosting.json` memuat identitas Site dan binding D1 `DB`. Untuk deployment independen, buat identitas/config sendiri; jangan menggunakan project_id milik proyek ini.

```bash
pnpm test
node tests/api.test.mjs
node tests/production.test.mjs # sesudah build
pnpm exec tsc --noEmit
pnpm build
```

Migrations schema-only pada `drizzle/`; hosting Sites menerapkannya sebelum Worker terbit. Untuk backend di luar Sites, konfigurasikan D1 dan terapkan SQL migrations sebelum memakai API room. Pada Sites, CREATE membutuhkan header identitas yang diberikan platform. Jalur Vercel memakai tamu dan pembatasan berbasis IP dari Vercel; tidak mempercayai header identitas ChatGPT.

## Groq

Set secret runtime `GROQ_API_KEY` melalui konfigurasi server Vercel atau Sites. Opsional `GROQ_MODEL`, default `openai/gpt-oss-20b`. Jangan masukkan key ke frontend, git, atau hosting.json. Setelah menambah secret, terbitkan ulang versi Site agar konfigurasi aktif.

Endpoint `/api/bot` terpisah dari room Redis/D1. Local Engine menghitung kandidat legal, risiko, valuasi dan keputusan dasar; Groq hanya diminta untuk alternatif strategis yang berdekatan, lalu melewati economic decision gate. Timeout default 6,5 detik (ENV 1,5–9 detik), circuit breaker dan fallback lokal. Batas baru default 100 request/hari, maksimal 10/menit per instance/model dan 12/menit per sumber di endpoint. Budget harian memakai Supabase jika tersedia, atau penghitung instance yang tidak menjamin batas global serverless. Tidak ada request provider langsung dari browser.

Status membedakan lokal, terkonfigurasi, sedang dipanggil, sukses hybrid dan fallback. ENV bukan bukti provider berhasil. Tidak ada API Groq sungguhan dipanggil dalam QA ini; mock menguji kontrak/error, bukan kualitas model. Lihat `docs/DEPLOY_HYBRID.md` untuk konfigurasi worker/budget yang terpisah.

## Struktur

- `lib/game-v1.mjs`, `lib/content-v1.mjs`: mesin beku untuk save lama.
- `components/game/AssetArt.tsx`, `RuleActions.tsx`: gambar UI dan keputusan aturan baru.
- `lib/content.mjs`: rulepack, sertifikat, deck, identitas pion.
- `lib/game.mjs`: validasi perintah, transaksi, resolusi kartu/utang, bot.
- `lib/bot/`: persona, analisis publik, valuasi, negosiasi, kandidat legal, memori dan scoring.
- `lib/groq.ts`: advisor server, kontrak bersama, timeout, circuit dan decision gate.
- `app/api/bot/route.ts`: advisor VS Bot tanpa Redis/Supabase.
- `lib/server/bot-worker.mjs`, `supabase/functions/monopoli-bots/`: eksekusi bot otoritatif dengan job/lease persisten.
- `lib/storage.ts`, `lib/save-format.mjs`: autosave, slot, arsip, validasi cadangan.
- `lib/board-camera.mjs`, `components/game/useGameViewport.ts`: posisi tetap dan ukuran viewport.
- `components/game/MobileDock.tsx`: aksi utama dalam area ringkas.
- `lib/room-client.mjs`: pembatalan request, revision, timeout, reconnect.
- `components/game/Board.tsx`, `BoardMap.tsx`: kamera berbatas, gesture, animasi pion, dan SVG papan.
- `components/game/Game.tsx`: lobby, HUD, panel, interaksi.
- `app/api/game/route.ts`: room, kursi, concurrency, server RNG, batas penggunaan.
- `lib/server/`: runtime Node/Sites serta adapter room Redis/D1.
- `vercel.json`: instalasi dan build Vercel yang eksplisit.
- `db/schema.ts`, `drizzle/`: database.
- `tests/`: kasus aturan dan simulasi pertandingan.

## Keamanan dan konsistensi

API key hanya server. Room baru memakai Supabase Auth UUID dan service-only RPC/CAS; membership dan revision hint dilindungi RLS, snapshot dan memori bot tetap privat. Pada room legacy, token kursi random disimpan sebagai SHA-256 pada database. Snapshot publik menghapus deck, daftar dedup dan memori strategi bot. D1 atau skrip Lua Redis memeriksa revision saat commit; aksi membawa versi state dan command ID. Kas tidak boleh negatif; kreditur tidak menerima uang sebelum pembayaran benar-benar terjadi. Nama dan komentar dirender React sebagai teks.

Publikasi Sites sebelumnya privat untuk pemilik. Membagikan kode room saja tidak mengubah siapa yang dapat membuka Site. Ubah akses Site secara sengaja sebelum mengundang akun lain.

Deployment Vercel mengikuti pengaturan akses proyek Vercel Anda. Data room D1 tidak otomatis berpindah ke Redis.


## Pembaruan terfokus v2.4 (UI tanpa rombak total)

- Papan 2D 40 petak tetap sama. Kontrol zoom, minimap, label status dan petunjuk mengambang dihilangkan agar petak tidak tertutupi. Cubit dua jari atau gulir untuk zoom; geser untuk menjelajah. Tombol **Seluruh papan** dan **Ikuti pemain** tetap berada di luar papan.
- Lempar dadu mendapat animasi singkat di tengah papan, menggunakan hasil dadu game yang sesungguhnya (efek grafis tidak mempengaruhi RNG). Dihormati pengaturan **Kurangi gerakan**.
- Pion di papan tampil sebagai figur vektor berwarna dengan nomor dan gerakan langkah demi langkah. Tidak perlu memuat gambar baru untuk pion atau petak papan.
- Di tab **Barter**, pilih properti melalui popup ringkas dengan pencarian dan pilihan multi-aset; berlaku juga untuk tawaran balik.
- Di tab **Aset**, daftar panjang diringkas. Pilih kota melalui popup pencarian dan buka menu pengelolaan langsung tanpa harus menggulir sertifikat.
- Logika aturan, pengambilan keputusan bot, struktur data dan penyimpanan tidak diubah.

Pengujian source code: jalankan `npm run test` dan `npm run build:vercel` setelah dependensi terinstal melalui `pnpm install`; pengujian fitur di browser tetap diperlukan.


## Pembaruan v2.5: Pion bergerak & lemparan penentu giliran

Lemparan pembuka memilih pemain pertama (pion tidak berjalan). Setelah itu, dadu permainan menggerakkan pion satu per satu dengan kamera mengekor tanpa mengunci pion di tengah; aksi berikutnya menunggu perjalanan selesai. Baca `docs/UPDATE_v2.5.md`.
