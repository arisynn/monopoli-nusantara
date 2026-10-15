# Verifikasi v2.3 — Papan 2D dan kamera

Tanggal: 15 Oktober 2026. Node 24.19.0; Next.js 16.3.4.

## Pemeriksaan yang dijalankan

- `npm test`: **87 tes lolos**. Mencakup engine v1/v2, 32 efek kartu, simulasi pertandingan lengkap, penyimpanan, dock portrait, koneksi, preferensi, dan kamera.
- Geometri 40 petak: urutan asli, empat sudut besar, luas perimeter tepat, tidak ada petak bertumpuk, hit testing sesuai ID, dan enam posisi pion berada di petak yang benar.
- Kamera: seluruh papan muat pada viewport sempit/pendek; pan dan zoom selalu berbatas; anchor zoom dipertahankan ketika tidak mencapai tepi; follow menjaga semua posisi pion tetap terlihat; resize mempertahankan pusat jelajah; minimap tidak melewati batas papan.
- Gesture memakai pengendali yang sama dengan UI: ketukan/jitter dapat memilih petak, drag/pinch tidak memilih, satu jari tersisa dapat melanjutkan pan, pembatalan/lost capture tidak menjadi tap, follow manual hanya pulih lewat resume eksplisit.
- Komponen SVG asli dirender untuk memeriksa 40 petak, 6 pion, nomor pemilik, hotel dan gadai; tidak ada elemen image/canvas dalam papan. Rasterisasi SVG aktual diperiksa secara visual untuk susunan, nama petak, dan penanda. Ini **bukan** screenshot browser.
- `npm run build:vercel`: build produksi Next.js dan TypeScript lolos. `node tests/vercel-build.test.mjs`: HTML, tujuh script awal, empat aset WebP UI, trace API tanpa import Workers, dan seluruh chunk klien tanpa renderer Three.js.

## Batas verifikasi

Kontrol browser yang didukung tidak tersedia. Belum ada pengujian layout browser nyata, sentuhan HP fisik, pinch pada Safari/Chrome mobile, keyboard virtual, FPS, konsumsi memori, atau service worker offline. Tes geometri dan komponen tidak menggantikan pemeriksaan perangkat tersebut. Papan tidak membutuhkan WebGL; klaim performa numerik tidak dibuat.

Layout portrait tetap memakai kontrak tinggi viewport v2.2: halaman utama terkunci, papan fleksibel, aksi dan navigasi tetap terlihat; panel detail panjang memiliki gulir sendiri. Matriks perangkat untuk pemeriksaan lanjutan: 320×568, 360×640, 390×844, 412×915; 2/4/6 pemain; browser bar terbuka/tertutup; rotasi; pan/pinch ke semua sudut; tap setelah drag; reconnect saat pion bergerak.

Rilis ini tidak mengubah engine, konten, API room, database, atau konfigurasi Vercel. Integrasi Redis/D1 memiliki hasil sebelumnya pada `QA_VERCEL.md` dan `QA_PORTRAIT.md`; deploy akun Vercel, Upstash live, Groq live, Supabase, dan multiplayer lintas perangkat tidak diuji dalam rilis ini. Tidak ada perubahan deployment live.

## Jalankan ulang

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm test
npm run build:vercel
node tests/vercel-build.test.mjs
```

Panduan deploy: `DEPLOY_VERCEL.md`. Cakupan aturan dan batas kesetaraan edisi resmi: `RULEPACK.md`.

## Pengemasan lokal

Workflow pengemasan/sinkronisasi Sites dihentikan oleh automatic approval review karena potensi pengiriman source/build ke layanan luar di luar permintaan ZIP. Build Vercel final dan pemeriksaan bundle telah selesai sebelum penghentian. Integrasi API D1/produksi Sites tidak dicatat sebagai lolos pada rilis ini. ZIP dibuat langsung dari snapshot source lokal; commit jarak jauh belum diperbarui. Tidak ada kebutuhan mengaktifkan layanan luar untuk menggunakan ZIP ini di Vercel.
