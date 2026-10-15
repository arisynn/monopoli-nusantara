# Monopoli Nusantara 2.1.0 — Vercel Ready

- Menambahkan build Next.js native, preset Vercel, Node 24, install pnpm terkunci, dan output `.next`.
- Memisahkan runtime Node/Vercel dari Cloudflare Workers; source tetap menyediakan jalur Sites/D1.
- Menambahkan penyimpanan room Upstash Redis melalui REST dan operasi Lua atomik. Data tidak disimpan pada memori sementara serverless.
- Vercel memakai nama tamu, kode room, token kursi, dan kuota berdasarkan IP platform. Tidak memerlukan header login ChatGPT.
- Mode lokal/bot lokal tetap tersedia tanpa database; status Groq hanya aktif jika penyimpanan room juga dikonfigurasi.
- Menambahkan batas masa simpan room, pemisahan environment, retry benturan kode, validasi request, dan lease AI yang diperiksa kepemilikannya.
- Cache service worker diperbarui, aset gambar v2 dipertahankan, aturan game dan dukungan save v1 tidak diubah.
- ZIP berisi source siap upload, `.env.example`, panduan deploy, dan tes. Vercel membangun outputnya sendiri.

Baca `DEPLOY_VERCEL.md` untuk langkah deploy dan `QA_VERCEL.md` untuk hasil pengujian. Tidak dilakukan publikasi ke akun Vercel atau perubahan situs live pada rilis ZIP ini.
