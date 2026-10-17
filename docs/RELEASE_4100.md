# 4.10.0 — Bank Nusantara & NUSA MIND 4.10

Basis: repository `arisynn/monopoli-nusantara`, commit `5b3ddd8517a66f24f87c58f48a54c61dded3341e` (4.9.1).

## Bank pada papan

Satu tombol kecil berikon Lucide menampilkan **Nusa beredar**, yaitu jumlah uang tunai seluruh pemain. Tombol ditambatkan pada ruang kosong di tengah papan dan mengikuti kamera. Saat ruang itu keluar viewport karena mengikuti pion/zoom, tombol ikut tersembunyi; tombol kamera overview menampilkannya lagi. Tata letak petak, pion dan kontrol giliran tetap.

Popup Bank Nusantara menampilkan total perputaran dan pokok gadai aktif. Rincian tertutup secara default: arus keluar/masuk bank, transfer antarpemain dan kategori; aset tergadai; persediaan rumah/hotel/properti; serta 40 transfer terakhir. Sertifikat dapat dibuka dari daftar gadai/properti lalu Kembali/Escape/Back, tanpa command atau kehilangan ekspansi dan posisi gulir.

Bank adalah catatan ekonomi dari aturan sekarang. Tidak ada batas kas bank, inflasi, bunga dinamis, pajak baru atau perubahan harga. Aset tergadai tetap milik pemain; pokok gadai adalah piutang bank, bukan properti bebas milik bank. Angka tebus mengikuti `redemption` (pokok + bunga yang berlaku).

## Sumber data dan kompatibilitas

Field `bankEconomy` bersifat tambahan pada state schema 2 dan disimpan bersama state lokal/online yang sudah ada. `note()` mencatat metadata finance yang benar-benar dikomit oleh reducer. Agregat tidak bergantung pada log presentasi yang dibatasi 300 entri. Hanya 40 transfer terakhir yang disimpan secara terperinci, sehingga ukuran riwayat tetap terbatas. Field `bank` stok rumah/hotel tetap seperti sebelumnya.

- Modal awal menjadi pembukaan peredaran; tidak dihitung sebagai perputaran transaksi.
- Sewa/barter uang adalah transfer antarpemain; tidak menerbitkan atau menarik Nusa.
- Gadai/gaji/kartu positif/penjualan bangunan mengalir dari bank ke pemain; pembelian/pajak/bangun/tebus/bunga/denda/kartu negatif sebaliknya.
- Likuidasi dan pembayaran harta bangkrut dicatat menurut perpindahan kas sebenarnya.
- Tawaran, bid, utang belum terbayar, aksi ditolak, preview dan ACK tanpa transfer tidak menambah perputaran.
- Idempotency command/receipt dan CAS online tetap milik mekanisme existing; retry tidak menambah transaksi lagi.
- Pada save schema 2 lama, ledger dimulai dari saldo saat aksi berikutnya dan ditandai parsial beserta ronde awalnya. Riwayat lama tidak direkayasa. Kondisi kas/gadai/stok tetap aktual.
- Save schema 1 tetap dapat dimuat oleh engine lama. Popup memberi informasi kas/gadai/stok saat ini; riwayat bank memerlukan pertandingan schema 2 baru. Engine lama tidak diganti.

Tidak ada SQL/migration baru, Redis, dependency produksi atau ENV baru. Backend tetap menyimpan snapshot JSON yang sama. API/Auth/RLS/Realtime tidak diubah.

## Integrasi bot

Panduan sumber: `docs/bot-v410-package/README_UNTUK_AI.md`. Paket asli telah diperiksa terhadap `MANIFEST.json`: semua digest cocok. Modul runtime dan tooling digabung ke repository terbaru; engine/backend/frontend tidak disalin dari paket. Baseline tujuan dibekukan di `benchmarks/pre-v410/lib/`; harness paket mengarah ke baseline ini. Nama internal policy `frozen-490` dari paket dipertahankan demi kompatibilitas tooling, tetapi sumber baseline yang dipakai adalah **target 4.9.1**, bukan reference 4.9.0.

Modul baru: economy, risk, allocation, concessions dan scenario-random. Integrasi mempertahankan dispatcher `plan.action`, satu hook memory per command sukses, pemeriksaan worker request/match/actor/revision, serta lease/CAS/idempotency/pause runner online. Macro tetap metadata simulasi, bukan aksi yang dikomit sekaligus. Tidak ada bobot riset di runtime; `LEARNED_MODEL === null`. Tidak ada latihan atau promosi bobot otomatis.

Penyesuaian lokal:

- Adapter ekonomi tetap memakai konstanta C1009 dan satuan internal. N1 = 10 unit engine.
- Kandidat `BUILD`, `BUILD_JOIN`, serta `BID` bangunan harus menyisakan cadangan kas `ceil(clamp(analysis.reserve, N50, N200))`. Komitmen lelang lain ikut dicadangkan jika relevan.
- Proyeksi alokasi dan jalur pembiayaan mempertahankan batas yang sama pada setiap awalan pembangunan. Strategi menilai ulang setelah satu aksi.
- Guard berlaku pada semua persona/kesulitan dan kandidat yang bisa dipilih advisor. Aturan pembangunan manusia tidak dibatasi oleh kebijakan bot.
- Ini minimum setelah pengeluaran **pembangunan**, bukan maksimum tabungan, batas pengeluaran untuk semua jenis aksi, atau jaminan saldo setelah membayar sewa/pajak/utang.

Pada fixture pembangunan dengan kas N570, bot M2/H3/X4 membangun empat kali, menyisakan N170 lalu memilih lempar dadu. Bot tetap bisa membangun ketika layak dan berhenti sebelum menghabiskan cadangan.

Tes lama mengenai stok rumah disesuaikan dengan alokator v4.10: rute pendek yang benar-benar bisa dibangun diperbolehkan, sedangkan gadai untuk milestone yang stoknya tidak cukup tetap dilarang. Fixture timeout Groq memakai pilihan yang benar-benar memicu konsultasi; pengaman provider tidak dilonggarkan.

## Validasi dan batas bukti

Hasil pengujian rilis tersimpan dalam JSON masing-masing. Hasil paket referensi tidak dihitung sebagai hasil integrasi ini.

- `CLASSIC_TEST_RESULTS.json`: 455/455 inti, frontend/session, save, layanan online dengan double, worker dan pengaman provider.
- `BANK_BROWSER_RESULTS.json`: portrait 320/360/390/430, viewport pendek, desktop, detail sertifikat, navigasi kembali dan save lama.
- `PORTRAIT_410_BROWSER_RESULTS.json`: regresi popup portrait dan tampilan yang dipertahankan. Screenshot tidak dibandingkan pixel dengan 4.9.1 karena satu indikator papan sengaja ditambahkan.
- `AUCTION_BROWSER_RESULTS.json`: 16 skenario roster, re-entry, transisi pembayaran dan reset bid.
- `MIND_LEARNING_BROWSER_RESULTS.json`: worker schema-2 nyata off-thread dan eksekusi lokal ketika browser offline. Candidate supplied hanya untuk tes, runtime tetap null.
- TypeScript, format, build produksi dan import graph diperiksa terpisah.
- `RELEASE_4100_INTEGRITY.json`: rulepack, mata uang, engine legacy, perhitungan sewa, renderer sertifikat penuh, SVG petak/pion dan seluruh aset publik sama dengan basis.

Benchmark smoke `MIND_410_SMOKE.json` memakai satu seed berotasi kursi. Enam kandidat pada 2/4 kursi selesai tanpa aksi ilegal. Enam pertandingan stress 6 kursi mencapai batas total 12 detik sebelum selesai; tidak diberi pemenang buatan. Satu pemeriksaan lanjutan 6 kursi dengan batas 60 detik (`MIND_410_SIX_SEAT.json`) selesai dalam 2.089 aksi tanpa aksi ilegal. Pengukuran ini berjalan di CPU cloud, bukan Android. Tidak ada kesimpulan peningkatan win rate atau urutan kekuatan kesulitan; holdout besar dan promosi model tetap belum dilakukan.

Browser menggunakan Chromium emulation, bukan perangkat fisik. Pengujian online memakai store kontrak in-memory untuk retry/CAS/pause/persistensi, bukan room Supabase multi-perangkat yang hidup. Tidak ada akun, room atau data produksi yang dibuat untuk QA. Diagnosis deployment hanya membaca build/configuration endpoint; configured bukan bukti inferensi Groq live.
