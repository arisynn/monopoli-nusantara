# NUSA MIND 4.10 — panduan integrasi bot

Repository terbaru pengguna menjadi acuan. Gabungkan bot ini ke frontend/backend yang sudah diperbarui pengguna. Paket hanya membawa modul bot, alat latihan/benchmark, tes referensi, dan laporan. Tidak membawa engine, frontend, gambar, database, file ENV, atau backend pengganti.

## Perubahan yang diterapkan

- Adapter unit ekonomi C1009 untuk fitur pembelajaran dan kalkulator risiko; mata uang yang disimpan engine tidak diubah.
- Distribusi kebutuhan kas sepanjang satu/dua lemparan, termasuk pajak, kartu, gaji Mulai menurut jalur gerak, denda penjara dan dadu utilitas. CVaR menghitung pembagian atom probabilitas dengan benar. Ini model kartu publik dengan pengambilan independen, bukan rekonstruksi dek tersembunyi atau distribusi eksak dua putaran meja.
- Cadangan kas mengurangi risiko dengan agunan legal di luar monopoli; alpha risiko bergantung persona dan estimasi kekuatan publik.
- DP subset gadai terhadap fungsi biaya aditif, ditambah penyelamatan legal sebelum optimasi dan penyempurnaan pencarian terbatas. Timeout tidak menjadi alasan menyatakan bangkrut. DP ini bukan klaim optimum global seluruh kombinasi jual rumah/hotel.
- Alokasi pembangunan membandingkan tahap kelompok hingga empat rumah/hotel, menggunakan stok fisik dan pembangunan merata. Hanya aksi pertama yang dikomit; selanjutnya rencana dihitung ulang. Alokator ini terbatas, bukan solver global eksak semua kelompok.
- Barter menggunakan ID pemain absolut, biaya penerimaan gadai, proyeksi pembangunan kedua pihak dengan stok bersama, dua urutan kesempatan bangun, Pareto frontier, perlindungan hadiah beracun/pembayaran tanpa manfaat, serta konteks mengejar pemimpin.
- Memori opsional melacak preferensi kelompok dan respons konsesi publik. Cooldown penolakan mengikuti perubahan kepemilikan; counteroffer dibatasi dua kali. Pemodelan lawan tidak membaca persona/controller privat untuk menentukan nilai barter.
- Batas tawaran lelang memperhitungkan biaya peluang kas. Peserta yang PASS tetap dimodelkan dapat kembali setelah BID baru sesuai kontrak engine referensi.
- H3/X4 memakai rencana beberapa aksi, perbandingan skenario dan CRN per kejadian. Dadu gerak, dadu utilitas, respons kebijakan, serta pengacakan dunia simulasi menggunakan saluran terpisah. Pemangkasan X4 menjaga kandidat kontrol dan membandingkan ketidakpastian berpasangan.
- Model belajar schema 2: 88 fitur publik relatif terhadap pemain/lawan utama, termasuk risiko ekor; residual Tiny MLP opsional 0–32 unit; target TD(lambda) tanpa diskonto waktu; pembaruan policy AWR dengan anchor ke kebijakan pengambilan sampel.
- Trainer offline mempunyai league terbatas, checkpoint atomik, resume dengan pemeriksaan konfigurasi/source/protokol, batas sampel dalam memori, dan dukungan penghentian di antara pertandingan.

Empat kesulitan dan Raka/Bima/Sari tetap tersedia. Semua tingkat berbagi kepatuhan engine dan jalur penyelamatan. Belum ada bukti statistik bahwa urutan tingkat kesulitan selalu menghasilkan urutan win rate pada semua konfigurasi.

## Status bobot

`payload/lib/bot/learned-model.mjs` berisi `null`. File bobot pada `research/` adalah hasil latihan nyata tetapi masih **candidate**. Pilot kecil membuktikan alur latihan berjalan; kualitas prediksi/bermainnya belum lolos gate promosi. Jangan memasang bobot tersebut otomatis, terlebih jika source engine tujuan berbeda.

REINFORCE lama tetap tersedia untuk pembanding eksperimen; trainer baru menggunakan AWR. FastSim 128 byte tidak diterapkan karena tidak cukup mewakili fase engine. Estimasi kekuatan publik pada barter bukan probabilitas menang terkalibrasi. Adaptasi lintas pertandingan melalui Supabase dan deployment runner online tidak termasuk perubahan paket ini.

## Urutan integrasi

1. Periksa engine/content, dispatcher aksi, ID pemain, phase, worker, format save, integrasi Groq dan runner online pada repository tujuan. Cocokkan `reports/ENGINE_CONTRACT.json`.
2. Sebelum merge, bekukan `lib/` tujuan ke `benchmarks/pre-upgrade/lib/` atau lokasi baseline setara. Baseline hanya untuk eksperimen. Modul harness dalam paket sudah menunjuk lokasi ini.
3. Merge isi `payload/lib/bot/` ke `lib/bot/` tujuan. Pertahankan perubahan pengguna yang tidak terkait. Adapter `economyRules()` harus membaca konstanta internal engine tujuan; jangan menyalin nominal tampilan UI sebagai nominal simpanan.
4. `decideMind()` mengembalikan `MindPlan`; eksekusi `plan.action` melalui dispatcher engine. Kandidat dapat memuat `macro` opsional untuk simulasi. Macro bukan perintah engine dan bukan transaksi yang boleh langsung dipaksakan ke state.
5. Pertahankan `recordBotMemory(next, previous, actor, action)` tepat satu kali setelah command sukses. Field memori tambahan bersifat opsional dan serializable. Jika hook sudah ada, gabungkan tanpa menduplikasi pencatatan.
6. Worker lokal memeriksa request/match/actor/revision dan mendukung pembatalan. Runner online tetap memakai lease, CAS revision, idempotency, serta pemeriksaan pause/status sebelum komit. Jangan memindahkan eksekusi online ke browser host atau mengganti manusia disconnect dengan bot.
7. Merge `tooling/scripts/` ke `scripts/` jika ingin melatih/menguji. Jangan menimpa package.json atau sistem build tujuan. Tidak ada dependensi runtime npm baru. Tooling memerlukan Node 24 sebagaimana workspace referensi; sesuaikan dengan toolchain tujuan jika perlu.
8. Adaptasikan tes pada `reference-tests/`, lalu jalankan seluruh tes existing, TypeScript dan production build milik repository tujuan. Fixture Groq yang bergantung pada keputusan “hampir sama” perlu diperbarui sesuai skor baru; jangan melonggarkan pengaman provider.
9. Pastikan seluruh modul bot baru terbundel dan masuk cache publik PWA. Bangun ulang worker dan lakukan pembaruan cache menggunakan mekanisme deployment tujuan. Jangan menghapus save, Auth, atau data pertandingan untuk membersihkan cache.

## Perintah latihan di Node/Termux

Mulai kecil dan ukur kecepatan serta suhu perangkat. Jangan menjalankan worker pertandingan online yang harus terus tersedia dengan bergantung pada proses Termux yang bisa dihentikan Android.

```sh
node scripts/train-hybrid.mjs --games=16 --rounds=2 --batch=8 --hidden=16 --epochs=6 --players=2,3,4 --output=docs/MIND_HYBRID_TRAINING.json
```

Resume harus memakai konfigurasi yang sama persis dan source/protokol yang belum berubah:

```sh
node scripts/train-hybrid.mjs --games=16 --rounds=2 --batch=8 --hidden=16 --epochs=6 --players=2,3,4 --output=docs/MIND_HYBRID_TRAINING.json --resume=docs/MIND_HYBRID_TRAINING.checkpoint.json
```

Checkpoint disimpan setelah setiap pertandingan. SIGINT/SIGTERM meminta berhenti setelah pekerjaan sinkron yang sedang berjalan selesai; jika Android mematikan proses mendadak, checkpoint pertandingan sebelumnya tetap menjadi titik lanjut. Pelatihan tidak memasang bobot ke runtime.

## Benchmark dan promosi

Tuning fondasi analitik terhadap baseline sebelum merge:

```sh
node scripts/benchmark-hybrid.mjs --seeds=5 --players=2,4,6 --output=docs/MIND_HYBRID_TUNING.json
node scripts/benchmark-crn.mjs --batches=64 --draws=16
```

CRN probe hanya memakai satu posisi penjara. Perlu banyak posisi berbeda sebelum menyimpulkan pengurangan varians secara umum. Angka lima seed di atas untuk memeriksa alur dan mendeteksi masalah; bukan bukti kelulusan holdout besar.

Holdout analitik memakai rentang seed berbeda:

```sh
node scripts/benchmark-hybrid.mjs --seeds=500 --players=2,4,6 --split=holdout --seed-base=805306368 --output=docs/MIND_HYBRID_HOLDOUT.json
```

Jalankan eksperimen besar setelah mengukur biaya perangkat. Untuk menguji bobot, bandingkan policy saja dan gabungan search secara terpisah:

```sh
node scripts/benchmark-learning.mjs --model=docs/MIND_HYBRID_TRAINING.model.json --variants=foundation,learned-policy --seeds=34 --players=2,3,4 --workers=1 --split=holdout --seed-base=805406368 --output=docs/MIND_POLICY_HOLDOUT.json
node scripts/benchmark-learning.mjs --model=docs/MIND_HYBRID_TRAINING.model.json --variants=search,learned-search --seeds=34 --players=2,3,4 --workers=1 --split=holdout --seed-base=805506368 --budget=180 --nodes=480 --output=docs/MIND_SEARCH_HOLDOUT.json
```

Gate `promote-mind.mjs` tetap memerlukan bukti runtime yang cocok dengan bobot dan source. Jangan promosi jika interval keunggulan tidak positif, perbandingan belum cukup, ada aksi ilegal, atau pertandingan banyak macet. Angka minimum gate tooling bukan pengganti audit statistik dan target perangkat yang lebih ketat dalam laporan riset.

Saat action cap, timeout, loop, atau error, pertandingan tidak mempunyai pemenang buatan. Seluruh hasil tetap dilaporkan pada denominator yang dijadwalkan. CI dihitung per klaster seed dengan rotasi kursi, terpisah menurut jumlah peserta. Jangan memakai kekayaan saat batas aksi sebagai label kemenangan.

## Laporan integrasi yang perlu diserahkan

Catat commit/basis repository tujuan, kontrak yang diadaptasi, file yang di-merge, hasil tes/build, source/model/protocol hash, hasil benchmark beserta ketidakpastian, dan status model. Bedakan pengujian lokal atau mock dari layanan Supabase/Groq live. Hasil dari workspace referensi tidak membuktikan integrasi repository terbaru sudah lulus.
