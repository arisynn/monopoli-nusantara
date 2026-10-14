# Monopoli Nusantara

Web game properti 2.5D berbahasa Indonesia. Papan Three.js, antarmuka React, shared engine JavaScript, server Vinext/Cloudflare Workers, dan penyimpanan room D1.

## Fitur tersedia

- Hotseat 2–4 manusia; duel bot lokal; duel melalui Groq saat secret terpasang.
- Room privat 2–4 manusia, lobby siap, kursi bertoken, pemulihan sesi perangkat yang sama, state otoritatif di server.
- 40 petak, 28 sertifikat, 32 kartu, dadu kembar, penjara, sewa, pajak, lelang, gadai, bangunan merata, barter dan tawaran balik, utang/kebangkrutan/pemenang.
- Kamera seluruh papan, dari atas, ikuti pion, kunci, drag/orbit/zoom; fallback papan datar saat WebGL gagal. Efek suara, animasi cepat, reduced motion, serah giliran.
- Save lokal IndexedDB dengan salinan localStorage; service worker untuk cache shell setelah pemuatan awal. Offline perlu origin HTTPS dan cache yang telah terisi. Mode room dan Groq membutuhkan koneksi.

Baca `docs/RULEPACK.md` untuk adaptasi yang eksplisit dan batas versi pertama. Baca `docs/QA.md` untuk pemeriksaan yang benar-benar dijalankan.

## Pengembangan

Node.js >=22.13, pnpm 11.

```bash
pnpm install
pnpm dev
```

Di lingkungan Sites, gunakan helper setup/preview/build resmi. Manifest `.openai/hosting.json` memuat identitas Site dan binding D1 `DB`. Untuk deployment independen, buat identitas/config sendiri; jangan menggunakan project_id milik proyek ini.

```bash
node --test tests/game.test.mjs
pnpm exec tsc --noEmit
pnpm build
```

Migrations schema-only pada `drizzle/`; hosting Sites menerapkannya sebelum Worker terbit. Untuk backend di luar Sites, konfigurasikan D1 dan terapkan SQL migrations sebelum memakai API room. Endpoint CREATE membutuhkan header identitas yang diberikan platform; jangan mengekspos header tersebut dari proxy yang tidak dipercaya.

## Groq

Set secret runtime `GROQ_API_KEY` melalui konfigurasi server Sites. Opsional `GROQ_MODEL`, default `openai/gpt-oss-20b`. Jangan masukkan key ke frontend, git, atau hosting.json. Setelah menambah secret, terbitkan ulang versi Site agar konfigurasi aktif.

Gateway menerima kandidat tindakan dari engine dan hanya memilih actionId legal; snapshot tidak berisi urutan deck. Respons timeout 5,5 detik, key tidak tersedia, error provider, atau batas penggunaan memakai bot cadangan berlabel. Tidak ada integrasi Groq langsung dari browser. Batas server awal: 1.000 evaluasi Groq per hari per Site, 30 pembuatan room per identitas per hari. Batas ini konservatif dan dapat disesuaikan dengan anggaran nyata.

Groq belum dikonfigurasi atau diuji langsung pada versi rilis ini. UI secara jujur menawarkan bot lokal bila key tidak tersedia.

## Struktur

- `lib/content.mjs`: rulepack, sertifikat, deck, identitas pion.
- `lib/game.mjs`: validasi perintah, transaksi, resolusi kartu/utang, bot.
- `lib/groq.ts`: adapter server Groq, timeout, schema.
- `lib/storage.ts`: save lokal.
- `components/game/Board.tsx`: geometri asli, kamera, animasi, fallback.
- `components/game/Game.tsx`: lobby, HUD, panel, interaksi.
- `app/api/game/route.ts`: room, kursi, concurrency, server RNG, batas penggunaan.
- `db/schema.ts`, `drizzle/`: database.
- `tests/`: kasus aturan dan simulasi pertandingan.

## Keamanan dan konsistensi

API key hanya server. Token kursi random disimpan sebagai SHA-256 pada database. Snapshot publik menghapus deck dan daftar dedup. D1 compare-and-swap memeriksa revision saat commit; aksi membawa versi state dan command ID. Kas tidak boleh negatif; kreditur tidak menerima uang sebelum pembayaran benar-benar terjadi. Nama dan komentar dirender React sebagai teks.

Site diterbitkan privat untuk pemilik. Membagikan kode room saja tidak mengubah siapa yang dapat membuka Site. Ubah akses Site secara sengaja sebelum mengundang akun lain.
