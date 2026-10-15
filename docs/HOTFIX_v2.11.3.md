# Monopoli Nusantara v2.11.3 — TypeScript Build Hotfix

## Penyebab

Pada v2.11.2, komponen `components/game/Game.tsx` menulis
`created.aiComment = null` ketika VS Bot dimulai. Namun objek
hasil `createGame()` di `lib/game.mjs` hanya menyertakan `aiStatus`,
bukan properti `aiComment`. Inferensi tipe TypeScript kemudian gagal dengan
`TS2339: Property 'aiComment' does not exist ...` dalam `next build`.

## Perbaikan minimal

Tambahkan `aiComment: null` pada state awal yang dikembalikan oleh
`createGame()` agar properti tersedia dari awal dan seragam dengan
`aiStatus` yang sudah ada. Tidak ada perubahan alur Groq, Redis,
multiplayer, UI papan, aturan, harga, ataupun save schema.

Sertakan assertion regresi pada tes bot untuk memastikan state awal
selalu punya `aiComment`.

## Verifikasi

Jalankan:

```bash
npm test
npm run build:vercel
```

Pastikan kedua perintah sukses **di environment dengan dependencies
terpasang**. Jika mesin lokal tidak bisa memasang Next.js dan React,
hasil build production belum dapat diklaim lulus. Perubahan ini khusus
memperbaiki TS2339 yang terlihat pada log Vercel.

## Deployment

Sumber lengkap v2.11.3 menggantikan v2.11.2. Pastikan commit baru
ter-deploy, dan periksa log jika ada error baru setelah pemeriksaan tipe
berlanjut. Jangan masukkan rahasia `.env.local` ke repository atau ZIP.
