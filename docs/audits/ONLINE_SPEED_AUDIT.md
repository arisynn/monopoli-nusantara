# Online speed audit — 4.11.3

## Scope dan bukti

Baseline source adalah ZIP official 4.11.2 yang sudah dikirim. Data pertandingan XKL5BY56 (22 ronde, 174 aksi bot, 134 interval tanpa manusia; median 760 ms, P90 960 ms, maksimum 3.500 ms) berasal dari laporan pengguna. Log private pertandingan dan credential deployment tidak tersedia di lingkungan ini; angka produksi itu tidak diklaim sebagai hasil pengukuran ulang.

Semua 51 berkas pada manifest V23.2 dan berkas `model-manifest.mjs` dipertahankan byte-identik. Lihat `ONLINE_SPEED_MODEL_LOCK.json` dan jalankan `node scripts/verify-speed-model.mjs`. Rilis ini tidak memodifikasi algoritma persona, engine, aturan lelang, RNG, atau budget AI.

## Bottleneck yang ditemukan

1. `frontend/session.mjs` menahan semua input selama ada head presentasi atau versi visual belum sama dengan server. Saldo yang sudah dibayar server masih dapat menghasilkan popup penerimaan yang menghentikan antrean. Keputusan manusia menunggu efek bot sebelumnya.
2. `presentation-timeline.mjs` membuat langkah terpisah untuk roll/result/movement/arrival, setiap transaksi dan event. Durasi normal 900 + 450 ms untuk dadu, hingga 1.800 ms gerak, 1.000 ms per settlement. Session menambah 300 ms sesudah gerak dan memaksa event noninteraktif minimal 3.200 ms. Produksi commit 760 ms/aksi dapat tiba jauh lebih cepat daripada konsumsi visual tersebut.
3. Realtime memakai trailing debounce 100 ms yang direset tiap hint. Hint saat HTTP read berjalan dibuang. Status socket tidak dipakai untuk recovery aktif; HTTP heartbeat baru membaca state lagi hingga 20 detik kemudian. ACK channel berulang juga dapat memicu read yang tidak perlu.
4. Jalur worker melakukan tiga round trip database pada claim dan enam pada submit normal: auth, quota, claim; auth, quota, receipt, lease, get, commit. Region yang sudah dekat tidak menghilangkan akumulasi perjalanan serial ini.
5. Pump Termux dibangunkan dua kali ketika satu task selesai. Ini bisa menambah claim kosong. Histori event untuk lost submit ACK juga memakai versi sumber, padahal engine menandai event commit dengan `sourceVersion + 1`.

## Implementasi

**State visual dan state keputusan.** Online memakai `interactionState` canonical untuk tombol, form, lelang dan barter. Papan/dadu tetap memakai timeline. `pending`, validasi controller/seat, expectedVersion, ID request, serta pemeriksaan backend tidak dilewati. Hasil dadu tidak diprediksi: selama request berjalan, hanya frame dekoratif berlabel menunggu server yang tampil. Respons aksi dari koneksi lama tidak boleh membuka kembali room yang sudah ditinggalkan.

**Catch-up adaptif.** Presentasi normal tetap memakai durasi lama ketika tidak tertinggal. Jika dua versi visual menumpuk, antrean mencapai 20 langkah, atau berumur >1,8 detik saat snapshot masuk, langkah lama diselesaikan lewat reducer yang sama; ekor versi terbaru diberi budget total maksimal 700 ms. Pembayaran/aset tidak dihitung ulang atau dikirim lagi ke server. Bila manusia mempunyai keputusan, state terkonfirmasi disajikan langsung; kartu aktif tetap disimpan sebagai head interaktif dan menunggu ACK. Hasil permainan segera mengikuti snapshot canonical. Ringkasan transaksi yang digabung terlihat melalui aktivitas dan detail tetap ada di Riwayat.

**Sinkronisasi.** Leading read 25 ms tidak ditunda terus oleh burst. Jarak minimum read berbasis hint 550 ms memberi headroom di bawah batas 120 GET/menit. Revisi yang sudah diterima diabaikan. Hint yang tiba di tengah read menghasilkan satu follow-up; heartbeat yang sudah jatuh tempo tidak hilang. Respons ACTION yang sudah mencakup revisi hint menghindari GET kedua. Socket terputus memakai recovery read 3–5 detik, sementara lease pemain tetap diperbarui melalui heartbeat lama. Callback koneksi lama tidak boleh mengganti state atau membuka flag read koneksi baru.

**Worker/database.** Migration 008 menambah RPC backend-only yang memanggil otorisasi/kuota dan claim/lease lama. Siklus normal menjadi 2 + 4 round trip. Snapshot tetap diperiksa terhadap match, actor, status, pause, sourceVersion dan lease; commit lama tetap atomik dan memeriksa lease/revocation/CAS lagi. Tidak ada cache token worker, perubahan RLS, perpanjangan lease, atau penghapusan receipt. Scope room tetap berlaku. Tidak ada Edge fallback baru. Root `vercel.json` mempertahankan Singapore `sin1`.

**Instrumentasi.** Browser: Auth wait, HTTP, span backend, klik ke state, Realtime hint ke state, kedalaman antrean, catch-up, receipt ke snapshot visual, durasi langkah, DOM render dan kesempatan frame berikutnya. Server: trace, monotonic total dan durasi IO pada `_performance`/`Server-Timing`; metadata room menyimpan awal commit sebagai penghubung trace. Worker: antrean berdasarkan clock database, compute thread, submit, commit dan claim ke ACK, dengan log lengkap yang tetap berotasi. Monitor CLI tetap lima event. Sampel lokal dibatasi 512 dan tidak diunggah dengan RPC tambahan. Waktu satu arah lintas perangkat tidak disimpulkan dari clock yang belum diselaraskan.

## Pengujian

Suite proyek mencakup regresi baru untuk 2–6 pemain, kesetaraan saldo/aset/log setelah catch-up, prioritas keputusan manusia, dadu sebelum respons, double click, burst Realtime, read bersamaan/reconnect, late action response, quota, pencabutan worker, scope, lease, receipt dan model lock. Hasil lengkap ada di `../CLASSIC_TEST_RESULTS.json`.

`TERMUX_POSTGRES_RESULTS.json` memuat tes PostgreSQL 17 terisolasi: migration 001–008 yang relevan, deny RPC baru untuk anon/authenticated, dua room dan enam persona, claim bersamaan, lost ACK, expiry/recovery, 180 iterasi penjadwalan, 154 aksi bot, 34 bid, dan revoke. Seluruh pemeriksaan lulus. PM2 sungguhan lulus start/restart/stop terhadap backend HTTP mock; lihat `TERMUX_PM2_RESULTS.json`.

`ONLINE_SPEED_BROWSER_RESULTS.json` berasal dari Chromium nyata dengan DOM, GameSession dan DiceView, 2–6 pemain serta reduced motion. Server mock ditahan 180 ms, tidak menampilkan hasil sebelum respons, satu aksi untuk double click, ekonomi canonical tetap sama. Pada baseline, receipt pajak yang sudah terbayar langsung di-ack harness; ini membuat baseline lebih cepat daripada pengguna yang harus menutupnya sendiri.

`ONLINE_SPEED_BENCHMARK.json` memuat replay virtual-clock 174 commit per roster pada cadence 760 ms. Timeline 4.11.2 dibekukan dengan provenance di `benchmarks/online-speed-4112`; engine/dependency ekonomi sama. Benchmark server menjalankan service sesungguhnya dengan controlled 8 ms per perjalanan database; ini bukan pengukuran Supabase/Vercel live. Setiap replay berakhir dengan ledger, aset, hasil dan log canonical yang identik.

Angka P50/P95 final ada pada tabel hasil di bawah serta JSON sumbernya. Histori canonical tetap memiliki batas bawaan engine; mode cepat tidak menghapus event tambahan dan tidak mengarang event yang sudah terpotong saat offline. Hasil ini belum pengujian Android fisik, thermal load, WAN, atau hosted Supabase Auth/Realtime.

## Aktivasi

Ikuti `../ONLINE_SPEED_UPDATE.md`: migration 008 lebih dahulu, update GitHub dan deploy Vercel, muat frontend/PWA baru, lalu update Termux untuk mendapat telemetry terbaru. Worker lama masih kompatibel karena model/protokol sama. Tidak ada deployment, push GitHub, atau perubahan database online pengguna yang dilakukan oleh proses pembuatan ZIP.

## Hasil P50/P95 final

Angka dalam milidetik. Browser memakai respons mock 180 ms; hasil berikut mengukur komponen, bukan latency WAN produksi.

| Metrik Chromium (12 skenario total) | 4.11.2 P50 | 4.11.2 P95 | 4.11.3 P50 | 4.11.3 P95 |
| --- | ---: | ---: | ---: | ---: |
| Klik → state terkonfirmasi | 184.1 | 187.9 | 186.1 | 193.1 |
| Respons server → input siap | 2332.9 | 2338.2 | 2.4 | 5.3 |
| Klik → input siap | 2515.0 | 2520.6 | 186.2 | 193.1 |

| Receipt → snapshot visual, replay 174 commit/roster | 4.11.2 P50 | 4.11.2 P95 | 4.11.3 P50 | 4.11.3 P95 |
| --- | ---: | ---: | ---: | ---: |
| 2 pemain | 12220.0 | 36500.0 | 700.0 | 1520.0 |
| 3 pemain | 5810.0 | 19500.0 | 0.0 | 1520.0 |
| 4 pemain | 23170.0 | 47630.0 | 0.0 | 1520.0 |
| 5 pemain | 11580.0 | 31910.0 | 700.0 | 1520.0 |
| 6 pemain | 8330.0 | 51590.0 | 700.0 | 1520.0 |

Backend terkontrol, 8 ms per round trip DB dan 18 sampel/mode: P50 **75.2 → 50.4 ms**, P95 **83.3 → 51.2 ms**. Round trip normal **9 → 6**. Query/validasi internal database tetap dijalankan; penghematan ini adalah jumlah perjalanan REST, bukan klaim pengurangan semua query SQL.

Verifikasi akhir: **664/664** tes, **611** modul source/output tanpa kegagalan, typecheck lulus, 12 skenario Chromium lulus, PostgreSQL dan lifecycle PM2 lulus. Selftest/checksum hasil ekstraksi ZIP dijalankan pada tahap pengemasan.
