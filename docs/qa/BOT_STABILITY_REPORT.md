# Stabilitas bot dan benchmark seeded

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**100 pertandingan, 61,365 aksi legal yang berhasil dikomit;99 pemenang normal,1 time limit,0 error,0 aksi ilegal,0 pelanggaran invariant,0 loop terdeteksi oleh signature12 kunjungan.** Jumlah100 memenuhi target awal; tidak ada cap yang dihitung sebagai kemenangan.

## Konfigurasi yang dapat diulang

Script [benchmark.mjs](scripts/benchmark.mjs) memanggil production `decidePersona`, `botActor`, `brokerIntentMetadata`, dan wrapper command resmi. Rulepack digital schema2, hardcore metadata, pemain2/3/4/5/6 berotasi; semua enam persona tercakup. Seed engine: `0x4e550000 + matchIndex * 997`, LCG32bit. Opening roll aktif pada indeks genap.

Batas per match:4000 aksi,20.000ms, planning budget4ms. Budget kecil sengaja membatasi biaya; sebagian jalur persona memakai economic floor bila budget habis. Browser asli memakai320ms untuk sebagian bot hardcore dan NUSA setidaknya2600ms, sehingga benchmark ini **bukan evaluasi penuh mutu strategi/search production**. RNG engine dapat diulang; clock CPU/timing dan fallback planner tidak deterministik, sehingga hasil menang tidak dijanjikan bit-identik pada mesin lain. CPU dibagi dengan browser/tests lain, khususnya akhir benchmark.

Total durasi compute teramati 691.76s; durasi per match, histogram aksi dan p50/p95/max decision tersedia pada JSON. Jadwal/timer browser dan latensi network tidak termasuk latency headless ini.

| Outcome | Jumlah |
|---|---|
| Pemenang engine normal |99|
| Batas waktu |1|
| Batas aksi |0|
| Error / illegal action |0|
| Repeated-state12 |0|

## Pemenang normal, bukan balancing claim

| Persona | Kemenangan normal |
|---|---|
| nusa | 19 |
| kresna | 20 |
| apex | 15 |
| raka | 21 |
| bima | 15 |
| sari | 9 |

Roster, seat, ukuran match dan budget tidak merupakan desain statistik win rate seimbang. Angka ini tidak membuktikan NUSA lebih lemah/kuat daripada persona lain dan tidak menjadi alasan mengganti bobot/model.

## Match yang belum berakhir

Index99, seed1314292111,6 peserta,862 aksi,20.006,7ms, stop=time_limit. Tidak ditetapkan pemenang berdasarkan wealth. Tidak ada error atau loop berulang yang memenuhi threshold. Karena hanya ringkasan state disimpan untuk match normal/cap dan full snapshot khusus kegagalan/loop, replay sampai titik identik bergantung timing planner. Perbaikan harness yang disarankan: snapshot otomatis pada seluruh cap untuk investigasi lebih dalam.

## Legalitas dan loop

- Seluruh aksi dilaksanakan oleh engine asli; exception langsung menandai error.
- Perubahan uang diverifikasi terhadap metadata finance setiap command, termasuk bunga, rent, gaji, pembelian, bangunan, trade dan bankruptcy.
- Stok bangunan, pemerataan, owner pemain out dan konservasi kartu diperiksa setiap aksi.
- Signature mencakup phase/turn, posisi/kas/jail/out semua pemain, assets, debt/trade/auction dan doubles. Dua belas kemunculan state ekonomi sama akan menyimpan state+32 aksi terakhir. Tidak ada yang terpicu. Ini heuristic, bukan bukti formal semua loop mustahil.
- Tidak ada rangkaian loop terkonfirmasi; karena itu tidak mengarang “state sebelum/sesudah loop”. Hambatan45s pada browser6 peserta adalah tombol stale UI QA-001, pulih setelah Tutup, bukan model loop.

## Integrasi persona/worker

Semua enam persona tampil pada UI/source dan benchmark. NUSA di browser memakai worker/anggaran lebih besar; cancellation memeriksa match/version/actor. Worker online revalidasi lease dan state setelah compute/provider sebelum commit. TestTermux67/67, termasuk compute threads untuk dua room, lost submit ACK retry, semua persona, protokol manifest dan rejection state stale.

Live Termux offline. Legalitas/stabilitas **online** untuk keenam persona BLOCKED; tidak ada klaim seluruh persona telah menyelesaikan match production. Groq GET configured, parsing/fallback diuji lokal, panggilan advisor eksternal tidak dipaksa. Semua 51 file dalam MODEL_MANIFEST dan file manifest sendiri tetap sesuai hash; tidak ada training, promosi, pergantian model, atau prepare:edge/deployment.

Skor bot lokal95/100: legalitas4/4, invariant4/4, progress4/4, outcome normal3/4, cakupan persona/roster4/4. Confidence untuk strategi full-budget dan live worker lebih rendah dari skor legalitas lokal.

Bukti: [benchmark.json](evidence/benchmark.json), [progress log](evidence/benchmark-progress.log), [Termux67 test](evidence/suite-15.log), [hash](evidence/integrity.json), [script](scripts/benchmark.mjs).
