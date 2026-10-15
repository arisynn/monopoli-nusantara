# QA v2.11.2 — Groq Bot Hotfix

## Pengujian yang selesai

- Tes otomatis dengan Node.js 22 + `--experimental-strip-types`: **151/151 lulus** ketika dua kelompok tes yang memerlukan React tidak dijalankan.
- Tes bot Groq 4/4 lulus, memakai fake HTTP untuk respons sukses, 401/429/500, error jaringan, respons ilegal, autentikasi server, dan validasi giliran.
- Satu tindakan hasil pilihan Groq berhasil dijalankan melalui `command()` engine: versi game bertambah, saldo dan kepemilikan properti berubah sesuai aturan.
- Lima berkas TS/TSX terkait lolos parsing/transpile sintaks dengan TypeScript terpasang secara global. Ini **bukan** `tsc --noEmit` atau Next.js build.

## Pengujian yang belum dapat dijalankan

- `tests/board-2d.test.mjs` dan `tests/portrait.test.mjs` gagal pada lingkungan pengujian karena dependensi `react` tidak terpasang, bukan karena assertion gameplay tidak lolos.
- `npm run build:vercel`, `tsc --noEmit`, serta pengujian di Vercel dan provider Groq sesungguhnya **belum** dijalankan.

## Batas pengujian

`GROQ_API_KEY` pengguna tidak tersedia. Nilai `groq:true` pada endpoint status hanya menandakan konfigurasi. Setelah deploy, indikator `Groq aktif` pada keputusan strategis dan Runtime Logs diperlukan untuk memastikan request sungguhan berhasil. Jika tidak ada Redis, rate limit API bot hanya per instance dan tidak boleh dianggap batas kuota global.
