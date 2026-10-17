# Monopoli Nusantara V4.11.0 — Multi-AI Persona Edition

**Tanggal:** 17 Oktober 2026  
**Source dasar:** Monopoli_v4.10.2.zip (diarsipkan, tidak ditimpa)  
**Cakupan:** Integrasi bot lokal dan room online, pemilihan persona, kompatibilitas penyimpanan. **Tanpa deployment** ke Vercel atau Supabase.

## Persona dan algoritma

| Karakter | `botPersona` | Kebijakan aktif |
| --- | --- | --- |
| ₦USA | `nusa` | Knowledge Bank 16 ahli dan Expert Council V7.2; optional selective scenario search via `decidePersona(...,{nusaMode:'search'})` (tidak aktif default karena belum terbukti meningkatkan win rate) |
| Arka | `apex` | Sonnet Monopoly Apex-inspired JavaScript policy **independen** di `lib/bot/apex-policy.mjs`. Bobot portofolio, completion, blocking, reserve, lelang dan bangun mengadaptasi gagasan Apex di atas engine Nusantara |
| Raka | `raka` | Bot investor legacy NUSA MIND |
| Bima | `bima` | Bot negosiasi legacy NUSA MIND |
| Sari | `sari` | Bot strategi defensif legacy NUSA MIND |

**Batasan penting:** Adaptasi JavaScript Apex **bukan port baris demi baris** dari `monopoly_apex.py` dan belum mempunyai uji kesetaraan keputusan Python/JavaScript. Solver simulasi Python berbeda dari game Nusantara (mata uang, gameplay 2–6 pemain, interaksi lelang/penjara/trade). Seluruh file Python yang diberikan pengguna disimpan **tanpa perubahan** di `docs/APEX_ORIGINAL_SOURCE/monopoly_apex.py` untuk pemeriksaan dan penyempurnaan port berikutnya. Tidak tepat menyebut port yang sekarang "Apex asli 100%". Penilaian untuk transaksi barter tetap memakai evaluator game yang aman; tidak seluruh strategi perdagangan Apex Python sudah dipindahkan.

## Router dan pengamanan

- `lib/bot/persona-router.mjs`: memilih **algoritma berdasarkan `players[actor].botPersona`**, bukan nama karakter atau level kesulitan.
- Pilihan ₦USA dan Apex selalu disaring terhadap kandidat legal dari native planner, dikonfirmasi oleh reducer engine. **Kesalahan pada expert diisolasi** lewat fallback ekonomi dari engine yang sama; tidak mengubah controller manusia.
- Input strategi berasal dari `observation()` yang tidak mengekspos urutan deck rahasia. `decidePersona` tidak mempelajari bobot dari pertandingan, tidak memanggil Supabase, dan tidak memerlukan Python.
- `lib/bot/mind.worker.mjs` dan fallback browser pada `lib/bot/mind-client.mjs` menggunakan router yang sama.
- `lib/server/bot-worker.mjs` menjalankan router yang sama untuk room online. Untuk `nusa` dan `apex`, advisor eksternal **tidak diperbolehkan mengganti algoritma**; pengaman transaksi job/revision/lease tetap digunakan.
- Source `lib/game.mjs` hanya ditambahkan whitelist nilai `botPersona`; aturan permainan, dadu, kartu, fisika papan, dan harga properti tidak diubah.

## Pemilihan karakter

- **VS Bot:** Pengaturan dapat memilih 1–3 bot unik dari lima karakter. Bawaan UI baru: ₦USA + Arka + Raka (untuk empat peserta), menyesuaikan jumlah peserta. Pengguna dapat mengganti karakter dan level. Pemain manusia tetap mengisi nama sendiri.
- **Room online:** Host dapat menambah bot dengan memilih ID persona dan kesulitan. Tetap maksimal **tiga bot**, minimal **dua manusia**, dan tidak boleh ada persona duplikat. Jika klien lama tidak mengirim `persona`, urutannya tetap Raka/Bima/Sari, menjaga kompatibilitas.
- **Simpan/load:** `botPersona` `nusa` dan `apex` terserialisasi. Save lama (Raka/Bima/Sari atau tanpa persona) tetap didukung tanpa migrasi format atau perubahan schemaVersion.
- **Mobile:** Selector karakter membungkus baris agar tidak overflow pada layar portrait. Seluruh papan, smart camera, animasi dadu, dan UI gameplay dipertahankan dari V4.10.2.

## Bukti tes dan batasannya

- `tests/multi-ai-personas.test.mjs` — 6 tes: 16 ahli terdaftar, pemilihan identitas unik, aksi legal/deterministik, save/load, informasi kartu privat, permainan headless 320 aksi, serta worker online ₦USA/Apex di room.
- Tes regresi lama: 26 tes kombinasi bot online/persona baru; 52 tes `mind-headless`; 103 tes frontend dan online client/API; 44 tes lama total (2 kegagalan awal diperbaiki/ditangani; salah satunya berasal dari runtime Node 22 tanpa TypeScript strip). Status final pada log pengujian terkini.
- Satu pertandingan 4 peserta, aturan penagihan sewa manual, seed 41911: **682 aksi**, selesai, **0 aksi ilegal**, ₦USA menang. Apex melakukan **1 override strategis** dari 122 keputusannya pada seed ini. Hasil ini adalah tes integrasi, **bukan benchmark kekuatan**; NUSA Council belum memilih override pada sampel ini.
- Build browser terselesaikan termasuk `lib/bot/nusa-v7/*.mjs` dalam `dist/precache.json`; build server native termasuk router dan semua dependensinya. Pemeriksaan `scripts/verify-web.mjs` sebelumnya: 447 modul tanpa import hilang.
- Tidak ada pengujian perangkat Android nyata, deployment Vercel, atau aktivasi Supabase pada tahap ini.

## Cara menjalankan (lingkungan Node yang memenuhi paket)

```sh
npm run build
npm run test:personas
npm run start
```

Buka website lokal sesuai petunjuk `README.md`, pilih **VS Bot → Atur permainan**, pilih ₦USA, Arka, atau karakter lama.

## Modul kunci

```text
lib/bot/persona-router.mjs
lib/bot/apex-policy.mjs
lib/bot/nusa-v7/{index,council,experts,situation,reasoning}.mjs
lib/bot/{mind.worker,mind-client,personas}.mjs
lib/server/{online-room,bot-worker}.mjs
frontend/{app,session,styles.css}
tests/multi-ai-personas.test.mjs
docs/APEX_ORIGINAL_SOURCE/monopoly_apex.py
```

## Keputusan rilis

Kandidat integrasi V4.11.0 **siap untuk pengujian manual lokal**, bukan otomatis dinyatakan siap dipasang pada game produksi/live sebelum QA Android dan uji kompatibilitas room online di staging. Tidak ada klaim tingkat kemenangan ≥75% atau kesetaraan Apex Python 100%.
