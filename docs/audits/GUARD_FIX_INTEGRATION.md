# Audit dan integrasi Guard Fix — official 4.11.2

Catatan historis 4.11.2. Untuk update performa 4.11.3, baca `ONLINE_SPEED_AUDIT.md`; file tes dengan nama tetap memuat hasil pengujian terbaru.

Input: `NUSA_MIND_BENCHMARK_LAB_V23_GUARD_FIX.zip`, lab 1.2.1, Stability Guard 2.0.0. Bukti checksum dan perbandingan source ada di `GUARD_FIX_INPUT_AUDIT.json`.

## Temuan audit

1. Seluruh 80 checksum pada manifest input cocok. Semua 17 berkas engine identik dengan paket benchmark hasil pengguna sebelumnya. Empat `.core.mjs` identik dengan model baseline official Git `af88d14`; ini bukan model strategi baru.
2. Suite input lulus 25/25 dan selftest delapan aksi lulus. Empat replay smoke input berhasil direproduksi, total 2.715 aksi sampai fase menang. Ini memverifikasi arsip lab tersebut, bukan bukti winrate atau hasil deployment official.
3. Guard input masih mempertahankan bid sah dalam kelipatan N1. Menyalinnya langsung akan berbenturan dengan ketetapan pengguna mengenai kelipatan N5. Integrasi official memakai minimum, kenaikan, dan pembulatan N5 dari `AUCTION_RULES`, termasuk state lelang lama.
4. Host lab memanggil pencatatan setelah `command()`. Official sudah memanggil hook memori di dalam `command()`, tepat sebelum `version++`. Guard input akan melewatkan catatan pada titik itu. Adapter official menerima versi transisi sukses yang sudah dicadangkan; engine tidak diubah dan tidak ada pemanggilan hook kedua.
5. Mengganti file official dengan wrapper dan `.core` lab akan menghapus perbaikan pendanaan sebelumnya. Integrasi mempertahankan scorer tebus, validasi gadai Kresna, dan rencana lanjutan gadai untuk pembelian/pembangunan. Konteks finance juga diberi `matchId` agar salinan memori pertandingan berbeda tidak menimbulkan tabu palsu.

## Perubahan yang diterapkan

- `lib/bot/stability-guard.mjs`: adapter aset/kelompok/persona yang benar, guard barter NUSA beserta pengecualian native, normalisasi bid, fallback legal sesuai fase, dan riwayat transaksi berdasarkan perubahan aset yang benar-benar terjadi.
- Riwayat gadai/tebus, bangun/jual disimpan per pemilik dan pertandingan. Resolusi pemesanan bangunan oleh pemain lain ikut tercatat untuk pemilik. Flip berulang dibatasi dalam jendela tiga serial giliran; likuidasi utang tetap tersedia. Pencatatan versi sama bersifat idempoten.
- Generator kandidat, keputusan akhir semua persona, dan entrypoint publik NUSA memakai guard. Helper, telemetry, array sinyal expert, afterstate, serta fungsi rollout tidak dibungkus secara generik. Tidak ada bonus strategi atau penambahan budget waktu dari guard.
- Backend worker memeriksa kebijakan guard terhadap state canonical ketika submit. Perangkat tidak dapat melewati guard hanya dengan mengirim aksi manual. Tidak ada request Supabase tambahan untuk mengevaluasi guard.
- Worker Termux, PM2, Groq opsional, protokol, dan aturan offline tetap menggunakan integrasi sebelumnya. Manifest model berubah, sehingga backend dan perangkat harus diperbarui dari paket yang sama. Schema migration 007 tidak berubah.

Di engine official, transisi hipotetis juga memanggil hook memori yang sudah ada, pada hasil clone terisolasi. Tes memeriksa bahwa histori tersebut tidak mengubah state pertandingan asal; kontrak ini berbeda dari engine lab yang mengharuskan pemanggilan hook oleh host.

## Verifikasi

Suite lengkap lulus **645/645**, tanpa tes dilewati; hasil ada di `../CLASSIC_TEST_RESULTS.json`. Regresi terarah lulus **67/67**, mencakup 25 skenario guard input yang disesuaikan dengan kontrak official, jendela flip antarserial, seluruh enam persona, pendanaan yang sudah diperbaiki, dan penolakan bypass guard pada submit worker. Typecheck dan pemeriksaan 598 modul source/output juga lulus. Sepuluh berkas engine dalam manifest identik dengan ZIP official 4.11.1 yang sudah dikirim.

Benchmark official terbaru ada di `TERMUX_GUARD_MODEL_BENCHMARK.json`: 1.464 aksi dan 340 bid, tanpa aksi ilegal atau pembalikan pendanaan yang terlarang. Satu simulasi selesai alami dan dua berhenti pada batas 500 aksi; tidak ada pemenang yang disimpulkan untuk simulasi yang dibatasi. Status PostgreSQL dan lifecycle PM2 sungguhan terbaru ada di `TERMUX_POSTGRES_RESULTS.json` dan `TERMUX_PM2_RESULTS.json`. Laporan benchmark 4.11.1 tetap disimpan sebagai hasil historis dengan manifest lamanya.

Pengujian PostgreSQL memakai database terisolasi. Harness kini memperbarui heartbeat manusia simulasi sebelum fase pengujian setelah setup SQL, karena setup paralel dapat melampaui lease pemain 35 detik. Batas lease dan kebijakan backend tidak dilonggarkan.

Belum ada deployment ke GitHub/server pengguna atau perubahan database online. Android fisik dan Supabase hosted Auth/Realtime tetap memerlukan pengujian staging. Ikuti `docs/TERMUX_ONLINE.md`, termasuk bagian pembaruan dari 4.11.1 dan aktivasi manifest baru.
