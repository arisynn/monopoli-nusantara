# Verifikasi v2.2 — Portrait 2.5D

Tanggal: 15 Oktober 2026. Node 24.19.0; Next.js 16.3.4.

## Pemeriksaan otomatis

- `npm test`: 79 tes mesin permainan, penyimpanan, UI dock, kamera, cadangan, preferensi, dan koneksi.
- Tes lama tetap menjalankan 20 pertandingan v2 dan 12 pertandingan v1 sampai selesai, serta seluruh 32 efek kartu v2.
- Empat pertandingan seeded tambahan memeriksa ekspor/impor state yang benar-benar dilewati; transaksi barter dengan context opsional dapat disimpan dan dilanjutkan.
- Uji slot memastikan lima slot dan arsip terpisah dari autosave, penulisan berurutan tidak menimpa state terbaru dengan state lama, dan penghapusan tidak dibatalkan oleh salinan backend yang usang.
- Uji dock menjalankan handler tombol beli/lelang, lempar awal, lempar dadu, akhiri giliran, serta jalur pembuka setiap keputusan panjang. Kas tidak cukup dan pemain yang menunggu tidak dapat mengirim aksi pembelian/gerak.
- Uji kamera memakai proyeksi Three.js untuk memastikan bounding box papan masuk frustum pada area 304×150, 344×230, 374×354, 396×420, 414×460, 684×850, 430×180, dan 350×90, untuk sudut 2.5D dan atas. Ini uji geometri, bukan screenshot browser.
- `npm run build:vercel`: kompilasi produksi, TypeScript, prerender beranda, dan bundling API dinamis.
- `npm run test:vercel`: pemeriksaan HTML/aset/bundle dan 10 kelompok integrasi API Redis menggunakan fakeredis + Lua. Revision room diperiksa dari CREATE hingga START; token, otorisasi, CAS, retry, dan reconnect tetap diperiksa.

## Kontrak layout

Pada lebar ≤800 px, beranda dan gameplay dibatasi tinggi viewport aktif. Gameplay memakai baris kartu pemain, ruang papan fleksibel dengan minimum nol, dock aksi tetap, dan navigasi tetap. Area papan menyesuaikan ruang yang tersisa; tinggi minimum lama yang memaksa halaman memanjang telah dinonaktifkan. Safe area dihitung di dalam tinggi aplikasi, bukan ditambahkan ke luar.

Konten detail dapat digulir **di dalam panel**: formulir setup, aset, barter, riwayat, sertifikat, dan keputusan panjang. Jika pengguna memperbesar halaman lewat pinch-to-zoom aksesibilitas, ukuran layout tidak dipaksa mengikuti skala zoom.

## Batas verifikasi

Kontrol browser yang didukung tidak tersedia pada lingkungan ini. Belum dilakukan uji visual browser, sentuhan HP fisik, keyboard virtual, rotasi nyata, FPS/WebGL, pemakaian memori, atau offline service worker. Tidak ada klaim bahwa seluruh model HP telah diuji. Proyeksi kamera dan pemeriksaan source tidak menggantikan verifikasi tersebut.

Deployment pada akun Vercel, Redis Upstash live, Groq live, dan multiplayer lintas perangkat belum diuji. Tidak ada perubahan situs live pada rilis ZIP ini.

Matriks pemeriksaan perangkat yang masih perlu dijalankan: 320×568, 360×640, 390×844, 412×915; 2/4/6 pemain; portrait/rotasi; browser bar terbuka/tertutup; kartu, lelang, penjara, utang, barter, dan restore; keyboard saat mengedit nama/nominal; pemutusan koneksi dan reconnect.

## Jalankan ulang

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm test
npm run build:vercel
node tests/vercel-build.test.mjs
python -m venv .venv-qa
. .venv-qa/bin/activate
pip install 'fakeredis[lua]==2.40.0'
node tests/redis.test.mjs
```

Python hanya untuk fixture Redis dalam tes; deployment aplikasi tidak membutuhkannya. Batas kesetaraan edisi resmi tetap tercantum pada `RULEPACK.md`.
