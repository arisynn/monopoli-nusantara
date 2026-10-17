# NUSA MIND 4.9 — paket integrasi BOT SAJA

**Repository terbaru milik pengguna adalah source of truth. Jangan mengganti frontend, backend, game engine, database, package.json, desain, aset atau aturan dengan source lama.** Paket ini berisi modul bot, alat eksperimen opsional, tes referensi dan laporan. Tidak berisi frontend/backend pengganti.

## Status penting

Kode bot lokal, planner, negosiasi, simulasi, evaluator pembelajaran dan trainer sudah dibuat. Pada workspace asal suite terakhir lulus **372/372**. Itu bukan hasil pengujian terhadap frontend/backend terbaru pengguna. Integrasi ke repository tujuan belum diuji.

Benchmark final dan pelatihan ulang dihentikan atas permintaan pengguna. Artifact riset lama merupakan candidate; hash source-nya berbeda setelah perbaikan bunga barter dan stok rumah. Karena itu **payload/lib/bot/learned-model.mjs sengaja berisi null**. Artifact yang benar-benar dilatih tetap disertakan di research untuk pemeriksaan, jangan mengaktifkannya otomatis.

## Isi paket

- `payload/lib/bot/`: modul bot yang perlu DIGABUNGKAN dengan modul bot repository terbaru.
- `tooling/scripts/`: trainer, benchmark, provenance, detector loop dan promotion gate opsional.
- `reference-tests/`: tes strategi/pembelajaran dan tes online referensi; adaptasikan fixture ke backend tujuan.
- `research/`: bobot kandidat dan laporan eksperimen historis; bukan bukti source terbaru lebih unggul.
- `reports/`: status implementasi, bukti tes workspace asal dan peta kontrak.
- `BOT_ONLY.patch`: diff terhadap modul bot dasar 4.8.2. Ini referensi review; jangan force apply ke repository yang sudah berubah.
- `MANIFEST.json`: ukuran dan SHA-256 seluruh berkas paket.

## Urutan integrasi untuk AI

1. Audit repository TUJUAN terlebih dahulu: branch/commit bila tersedia, engine, command dispatcher, bentuk state, bot existing, worker, endpoint bot, scheduler online dan tes. Jangan menganggap struktur sama dengan source asal.
2. Buat checkpoint. Sebelum mengubah bot, bekukan `lib/` dari repository TUJUAN ke `benchmarks/pre-upgrade/lib/` untuk baseline lokal. Baseline hanya digunakan lab; jangan pernah menyalinnya kembali menimpa engine tujuan.
3. Cocokkan `reports/ENGINE_CONTRACT.json` dengan export engine/content sebenarnya. Adapter kecil lebih baik daripada mengganti engine. Jika ID pemain/properti, fase atau unit uang berbeda, sesuaikan adapter dan tes; jangan mengganti aturan atau nominal.
4. Review/diff setiap modul `payload/lib/bot/` terhadap bot tujuan. Pertahankan perubahan baru pengguna. Salin modul baru dan merge modul existing secara selektif. Jangan menghapus API persona, difficulty, save compatibility atau integrasi Groq yang masih dipakai.
5. Pastikan semua relative import menuju engine/content TUJUAN. `decideMind(state, actor, options)` mengembalikan **MindPlan**, bukan objek aksi langsung. Eksekusi melalui `plan.action` dan command dispatcher tujuan. `planDecision` juga menghasilkan plan; `chooseSmartBot` menghasilkan action.
6. Lokal: gunakan worker yang bisa dibatalkan. Cocokkan request ID, match ID, actor dan revision; buang hasil stale. Fallback lokal tetap wajib dan tidak memerlukan Groq/Supabase/Redis.
7. Online: hanya backend menjalankan bot. Pertahankan lease/lock, idempotency, revision CAS, pengecekan status room dan actor sebelum commit. Jangan memindahkan scheduler ke browser host. Pause/disconnect harus membuang rekomendasi stale. Bot tidak ikut vote/ready dan tidak menggantikan manusia offline.
8. Pastikan engine tujuan memanggil `recordBotMemory(next, previous, actor, action)` tepat sekali sesudah command sukses bila menggunakan memori modul ini. Jika sudah ada hook, gabungkan; jangan memanggil dua kali. Memori opsional harus serializable, aman untuk save lama, dan privat sebagaimana kebijakan existing.
9. Pertahankan kontrak response API tujuan. `contracts.ts` adalah referensi tipe bot; merge shared types. `reason` diagnostik aman bersifat opsional; jangan memakai any/ts-ignore untuk menutup masalah. Jangan memasukkan raw provider errors/API key ke client. Jangan menambah aiComment ke state tanpa mengecek kontrak engine/createGame/save.
10. Pertahankan Raka/Bima/Sari, empat pilihan model yang existing dan kapasitas room. Jangan mengubah UI pemilihnya jika tidak diperlukan untuk kompatibilitas.
11. Tooling opsional: merge isi `tooling/scripts/` ke `scripts/` tujuan. Harness sudah menunjuk `benchmarks/pre-upgrade/lib/bot/mind.mjs`. Jika baseline tujuan tidak punya export decideMind, adaptasikan wrapper baseline ke policy lamanya; jangan mengarang benchmark atau menggantinya dengan bot baru.
12. Tambahkan script npm secara selektif: `train:mind = node scripts/train-mind.mjs`, `benchmark:learning = node scripts/benchmark-learning.mjs`, `promote:mind = node scripts/promote-mind.mjs`. Jangan menimpa package.json/lockfile atau build Next/Vercel pengguna.
13. Audit bundler: worker dan semua modul baru harus ikut bundle/PWA precache existing. Jangan menyalin script build frontend lama. Untuk artifact berstatus promoted, build perlu memeriksa kecocokan source hash. Ubah cache publik secara aman tanpa menghapus save/Auth.

## Pengujian setelah merge

- Jalankan tes existing dahulu, lalu adaptasikan tes referensi. Pertahankan test runner dan test doubles backend tujuan.
- Uji barter gratis menguntungkan; hadiah tanah digadai dengan bunga yang menyebabkan insolvensi; arah uang kedua pihak; ancaman monopoli; beberapa counteroffer.
- Uji bangun merata/stok bank; gadai/jual lebih dari empat langkah; reserve kas; lelang off-turn; penjara/kartu; save/load lama.
- Uji model legal, tanpa informasi tersembunyi, batal/timeout/fallback; worker offline dan UI tetap responsif.
- Uji retry/concurrent jobs, pause, disconnect, reconnect, state revision berubah saat model menghitung. Model tidak boleh mengubah state langsung.
- Typecheck, lint bila tersedia dan production build menggunakan script repository tujuan. Jangan mengklaim Supabase/Groq live dari mock.

## Latih dan evaluasi ulang di source tujuan

Sesudah integrasi stabil:

```sh
npm run train:mind -- --games=72 --rounds=4 --batch=12 --seed-base=730000 --bundle=true
npm run benchmark:learning -- --model=docs/MIND_LEARNING_TRAINING.model.json --seeds=34 --players=2,3,4 --workers=2 --split=holdout --seed-base=1200000
```

Eksperimen di atas menguji kontribusi POLICY. Untuk promosi runtime Hardcore diperlukan bukti KOMBINASI search dan learning dengan seed lain:

```sh
npm run benchmark:learning -- --model=docs/MIND_LEARNING_TRAINING.model.json --variants=search,learned-search --budget=180 --nodes=480 --seeds=34 --players=2,3,4 --workers=2 --split=holdout --seed-base=1300000 --output=docs/MIND_RUNTIME_EVALUATION.json
npm run promote:mind -- --model=docs/MIND_LEARNING_TRAINING.model.json --report=docs/MIND_RUNTIME_EVALUATION.json
```

Jangan meloloskan promosi apabila gate gagal. Model menggunakan pembelajaran mesin kecil dan prior ekonomi, bukan kecerdasan umum bebas kode. Kemenangan benchmark harus berasal dari engine sesungguhnya, bukan penetapan pemenang berdasarkan kekayaan saat action cap.

## Laporan akhir integrasi yang wajib dibuat AI

Sebutkan basis repository tujuan, perbedaan kontrak, file yang benar-benar digabung, hasil tes/build, status model dan hash, hasil benchmark beserta interval ketidakpastian, serta batasan live Supabase/Groq. Bedakan selesai-teruji, belum diverifikasi dan belum selesai. Jangan mengganti frontend/backend pengguna dengan file dari paket lain.
