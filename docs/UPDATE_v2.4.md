# Monopoli Nusantara — update v2.4

Pembaruan ini meneruskan v2.3 tanpa mengganti palet, tata letak utama, atau aturan game.

## Perubahan
- Area papan kini bebas tombol zoom, status, minimap, dan tip mengambang. Gunakan gesture; tombol mode tampilan tetap di bawah papan.
- Animasi dadu tampil sebentar di tengah papan. Selalu membaca dadu hasil engine; tidak membuat hasil acak sendiri.
- Pion SVG berwarna dengan penanda nomor dan animasi ringan pada pion aktif.
- Barter: popup multi-pilih properti dengan pencarian; berlaku untuk tawaran baru dan tawaran balik.
- Aset: ringkasan portofolio, popup cari aset, dan dialog tindakan cepat; sertifikat tetap dapat dibuka.
- Papan/ikon memakai vektor, bukan gambar baru yang tidak dibutuhkan.
- Cache PWA dinaikkan ke v24 agar aset UI baru dapat dimuat di instalasi lama.

## Cara uji lokal
1. Gunakan Node.js 24 dan `corepack pnpm install --frozen-lockfile`.
2. Jalankan `pnpm test`, lalu `pnpm build:vercel` dan `pnpm dev:vercel`.
3. Coba permainan lokal: mulai, lempar, perbesar dengan cubit, buka Aset > Pilih kota > Kelola, kemudian Barter > pilih properti.
4. Cek juga room online dan layar kecil pada perangkat asli.

**Catatan pengujian pembuatan:** uji engine dan uji regresi berbasis source code dilakukan, sedangkan build produksi dan uji browser tidak dapat dijalankan di lingkungan perakitan yang tidak menyediakan dependensi maupun akses instalasi.
