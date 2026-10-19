# Hasil gameplay browser dan integritas aturan

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

## Eksekusi nyata

Lima pertandingan VS Bot dimulai lewat UI, masing-masing 2–6 peserta. Nama, jumlah peserta, persona dan pengaturan cepat/reduced dipilih lewat tombol/input. Game pertama dimainkan di production; empat berikutnya lokal dengan build yang tujuh file publiknya byte-identik. Semua dadu production memakai RNG asli. Tidak ada state/RNG production diganti.

| Match | Lokasi | Peserta | Bot | Durasi | Klik UI / aksi engine | Stop awal | JS/network error |
|---|---|---|---|---|---|---|---|
| 0 | Production | 2 | nusa | 54.2s | 39 / 80 | action_limit | 0/0 |
| 1 | Lokal identik | 3 | apex, bima | 39.7s | 44 / 80 | action_limit | 0/0 |
| 2 | Lokal identik | 4 | kresna, bima, sari | 60.2s | 17 / 80 | action_limit | 0/0 |
| 3 | Lokal identik | 5 | apex, bima, sari, nusa | 47.6s | 42 / 80 | action_limit | 0/0 |
| 4 | Lokal identik | 6 | kresna, bima, sari, nusa, apex | 94.5s | 213 / 78 | no_progress_45s | 0/0 |

`action_limit` di sini sengaja membatasi tahap awal80 aksi, bukan pemenang. Match4 mencapai78 lalu automation berulang memilih tombol stale pada receipt QA-001. Log dan trace menyimpan rangkaian tersebut; itu bukan bukti model bot macet. Dua percobaan pemilihan persona yang sudah dipakai kursi lain ditolak UI dengan benar; harness diperbaiki memilih persona unik dan match diulang. Lihat browser-first-attempt.json.

## Kelanjutan autosave asli

Untuk sesi panjang, autosave yang benar-benar dihasilkan tahap awal di-resume dalam browser lokal terisolasi. Kepemilikan, kas, kartu, giliran dan RNG tidak diubah. Match0 menjadi kelanjutan lokal dari autosave production yang sebelumnya dimainkan; proses berikutnya tidak berjalan di production. Semua aksi setelah resume tetap melalui UI. Automation menutup receipt dengan Tutup sebelum mencari command, sehingga mengatasi QA-001 sebagai pemain manusia.

| Match | Versi awal → akhir | Klik UI tambahan | Durasi tambahan | Hasil | Pemenang |
|---|---|---|---|---|---|
| 0 | 80 → 588 | 327 | 499.0s | normal_winner | 1 (bot) |
| 1 | 80 → 383 | 96 | 227.8s | normal_winner | 1 (bot) |
| 2 | 80 → 880 | 279 | 569.6s | normal_winner | 2 (bot) |
| 3 | 80 → 719 | 249 | 511.0s | normal_winner | 4 (bot) |
| 4 | 78 → 605 | 65 | 375.7s | normal_winner | 3 (bot) |

Percobaan awal continuation mengandung timeout harness ketika modal baru muncul di antara pemeriksaan tombol dan klik. Itu disimpan di browser-continuations.json/browser-continuations-retry.json, tidak diklaim sebagai error game. Run final memakai retry untuk perubahan UI asinkron. Bila cap tetap tercapai, status cap tidak diubah menjadi kemenangan.

## Fixture akhir pertandingan legal

Lima fixture lokal tambahan: jumlah pemain2–6, dua survivor dan pemain lain sudah out. Satu survivor memiliki kelompok6/8/9 berhotel dengan stok sah; debtor hanya punya10 unit kas. ROLL reducer resmi menghasilkan mendarat6 dan utang sewa. Setelah resume lewat UI, manusia menyatakan bangkrut atau bot melikuidasi/bangkrut sendiri. Ini fixture akhir sah, **bukan lima pertandingan penuh dari saldo awal**.

| Fixture | Peserta awal | Hasil | Popup kemenangan |
|---|---|---|---|
| 0 | 2 | Manusia menang; winner seat 0 | PASS |
| 1 | 3 | Manusia kalah / bot menang; winner seat 2 | PASS |
| 2 | 4 | Manusia menang; winner seat 0 | PASS |
| 3 | 5 | Manusia kalah / bot menang; winner seat 4 | PASS |
| 4 | 6 | Manusia menang; winner seat 0 | PASS |

## Interaksi yang benar-benar dilakukan

| Skenario | Status | Bukti / batas |
|---|---|---|
| Buka, nama, mode, roster, persona, mulai | PASS | Lima trace match0–4 |
| Dadu awal, roll gerak, end turn | PASS | Versi/log/dice nyata tiap match |
| Beli/tolak/lelang/pass | PASS | Match1/3 menolak; state log auction; auction suite sebagian dan UI nyata |
| Bid nominal valid/invalid | PASS lokal | test:auction sebelum assertion stale; invalid engine cases; belum bid realtime production |
| Barter manusia→bot | PASS transfer; FAIL UI | Hadiah₦100 ke Raka; saldo berkurang1000 unit sekali; receipt footer stale |
| Barter bot→manusia accept/reject | PASS transfer; FAIL UI | trade-footer-repro accept/reject dengan pertukaran properti+₦200 |
| Barter antar manusia live | PASS transfer/perspektif | Penerima melihat₦10 diterima, pengirim₦10 diberi; snapshot sama versi8 |
| Bangun merata hingga hotel | PASS | Double-click pesanan10: level5/5, kas15000→10000, bank rumah32 hotel10 |
| Gadai / tebus | PASS UI | Properti6:10000→10500→9950; bunga50; flag benar |
| Pembayaran sewa, pajak, gaji dan kartu | PASS engine; UI sesuai log | Benchmark ledger dan log pertandingan browser; kartu lokal otomatis setelah pembacaan |
| Penjara/keluar/kartu bebas | PASS engine; cakupan UI tergantung log | Cek aksi/event aktual di data browser; bukan semua jalur penjara diklik manual |
| Bangkrut dan menang manusia/bot | PASS fixture browser | Lima ending, pemenang engine dan popup; natural match di tabel continuation |
| Refresh receipt belum dibaca | PASS isi/snapshot | asset-trade-trade-refreshed.png; footer stale hilang setelah reload |
| Tutup receipt tidak mengulang transaksi | PASS | closeNoTransaction:true, resultNotRepeated:true pada asset-trade.json |
| Save dua tab Web Locks/CAS | PASS suite inti + browser tambahan | Jangan memakai test:stability yang FAIL sebagai bukti penuh |

## Audit rulepack dan invariant

Acuan utama: content.mjs / game.mjs, dokumen RULEPACK, catatan rilis4.11.5/4.11.6. Otomatisasi sewa digital, lelang terbuka, pembayaran kartu berurutan dan penjualan set sengaja diterapkan. Fixed point10 unit=₦1. Tidak menilai semua house rule sebagai pelanggaran Hasbro. Dokumen rulepack sudah menyatakan keterbatasan pembandingan28 sertifikat/32 kartu terhadap set fisik; PDF Hasbro tidak diunduh ulang pada audit ini, sehingga tidak ada klaim100% cocok set fisik.

Benchmark **100 match / 61,365 aksi** memeriksa setiap transisi:

- Kas integer aman dan tidak negatif; saldo sesudah identik saldo sebelum ditambah semua finance event baru.
- Owner valid, tidak ada aset milik pemain out; level0–5; aset tergadai tidak punya bangunan.
- Set bangunan satu owner, pemerataan level, stok aktual32 rumah/12 hotel dan stock(s) konsisten.
- Total32 kartu konservatif terhadap deck, kartu bebas di tangan dan kartu bebas yang sedang dibaca; tidak ada duplikasi index.
- Posisi0–39 dan pemenang hanya survivor tunggal.

Hasil: tidak ada pelanggaran invariant atau error reducer. Ini meliputi transaksi bank yang mengeluarkan/menyerap uang secara sah, sehingga total uang pemain tidak dipaksa tetap konstan. Double-click/retry online juga diuji terhadap versi/receipt; bukan hanya kesamaan saldo akhir.

Bukti utama: browser-matches.json, browser-continuations-final.json, browser-continuation-3-final.json, match-*-state.json, endgame-*-states.json, benchmark.json, security-local.json. Screenshot/trace bukan simulasi engine; benchmark headless dilabel terpisah.

Kelima match alami tersebut total **3.175 aksi engine** dari awal hingga state `won`; seluruh pemenang adalah bot dan manusia kalah. Kemenangan manusia dibuktikan oleh tiga fixture akhir tambahan. Popup pemenang untuk autosave terminal alami juga diperiksa lewat resume baca-saja: [natural-winners.json](evidence/natural-winners.json) dan `natural-*-winner-resumed.png`. Screenshot ini diberi label resumed agar tidak disamakan dengan tangkapan tepat saat transisi menang.
