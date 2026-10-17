# Monopoli Nusantara v4.11.0 — Integrasi Enam Persona Bot & Popup Modal

**Basis:** Monopoli_v4.10.2.zip. **Sumber bot:** Nusa.zip (native engine/planner v4.11.0).

## Apa yang berubah

- Enam persona AI independen: Raka, Bima, Sari, NUSA, Arka/APEX, Kresna. Mereka **bukan** enam tingkat kesulitan. Empat tingkat difficulty yang tetap tersedia: Easy / Medium / Hard / Hardcore.
- UI VS Bot: dropdown pemilihan kesulitan bot diganti tombol dan dialog pilihan; pilihan persona memakai grid enam kartu, kesulitan memakai dialog tersendiri. Dialog kembali ke pengaturan setelah memilih. Mencegah duplikasi persona aktif.
- VS Bot mendukung 2–6 total pemain (1 manusia + maksimum 5 bot) sesuai mesin C1009 dan pion unik.
- Online: host dapat menentukan persona dan kesulitan bot saat menambah bot. Batas lama **maksimal 3 bot**, minimal 2 manusia, tetap dipertahankan; tidak mengubah status reconnect dan database.
- Engine sekarang menyimpan persona enam model; `persona-router.mjs` menjalankan kebijakan khusus NUSA, Kresna, atau Arka. Raka/Bima/Sari memakai NUSA MIND dengan tuning masing-masing. Jalur fallback local worker, server worker, dan groq.ts disesuaikan. Semua kandidat tetap divalidasi engine.
- Build web telah memasukkan modul subdirektori `lib/bot/nusa-v7/*.mjs`; bundle backend/Edge bisa mengimpor router terbaru.

## Pengaman bobot terlatih

`lib/bot/learned-model.mjs` disetel `LEARNED_MODEL=null`. Paket Nusa.zip **tidak berisi trained weights**, sementara bobot promosi v4.10.2 kehilangan validitas hash setelah modul/aturan strategi berubah. Menonaktifkan bobot mencegah model tidak terverifikasi berjalan dan memungkinkan build lolos tanpa memalsukan metrik pelatihan. Enam kebijakan rule-based/planner tetap aktif. Bobot baru harus dilatih dan dipromosikan dengan holdout evidence terpisah sebelum diaktifkan.

## Cara pakai

1. Ekstrak ZIP proyek ke direktori game kamu, sebaiknya ke folder baru dan backup game lama terlebih dahulu. Jangan menghapus `.env`, state, checkpoint, atau database game yang ada.
2. Node 22+ (source package memerlukan Node 24.x pada deployment sesuai `package.json`). Jalankan `npm run build`, `npm test`, dan opsional `npm run prepare:edge` sebelum deploy Supabase Edge.
3. Masuk lobby VS Bot → Atur permainan → klik nama bot → pilih salah satu dari enam kartu → pilih difficulty. Untuk room online, gunakan `Tambah Bot` sebelum pertandingan dimulai.
4. Untuk validasi cepat: `node --experimental-strip-types --test tests/ai-personas-integration.test.mjs`.

## Verifikasi pada lingkungan pengerjaan

- `node scripts/build-web.mjs`: **lolos** (build server dan browser).
- `node --experimental-strip-types --import ./adapters/node/aliases.mjs scripts/test-headless.mjs`: **484/484 lolos** sebelum penambahan tes persona tambahan.
- Tes baru persona: memastikan 6 id tetap tersimpan, kontrak 2–6 pemain, pilihan unik, tindakan legal, dan seleksi bot online.
- Browser rendering QA: **belum dapat dijalankan** di lingkungan ini karena browser memblokir navigasi localhost dan file URL. Uji di Chrome Android pada 320–430px saat integrasi akhir.
- Tidak ada deployment, migrasi Supabase, atau perubahan data pengguna dilakukan.

## Perlu dicatat

Ini integrasi source yang dapat dibangun dan dites lokal. Belum ada bukti uji statistik bahwa NUSA/Kresna/Arka lebih sering menang; benchmark keunggulan harus dilakukan terpisah.
