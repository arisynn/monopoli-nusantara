## Pembaruan 1.2.1 — Perbaikan integrasi guard

Paket ini memperbaiki pembacaan state, aktor/persona, validasi lelang, dan riwayat anti-loop. Aturan di `engine/` serta algoritma `.core.mjs` tetap byte-identik dengan ZIP masukan. Penilaian strategi memakai modul inti; bonus generik guard lama yang tumpang tindih sudah dilepas. Ini belum implementasi penuh masterplan V8 atau bukti target winrate.

Lihat [catatan patch dan verifikasi](docs/GUARD_FIX.md). Jalankan `npm test` (tanpa instalasi dependensi) untuk regresi guard dan `node lab/selftest.mjs` untuk pemeriksaan singkat. Saat mengintegrasikan bot ke host lain, panggil `recordBotMemory(next, before, actor, action)` **setelah** `command()` berhasil; lab sudah melakukannya. Hasil `runs/run-2026-*` dan pemeriksaan lama di bawah adalah arsip sebelum patch, bukan pengukuran versi ini.

## Pembaruan CLI V1.2 — Dua mode kemenangan + 5 event live

Menu **4 Standard**, **5 Tournament**, dan **6 Custom Benchmark** menawarkan:

- **1 — Sampai Bangkrut:** pertandingan berlanjut hingga engine menyatakan `phase=won` (satu pemain tersisa). Karena bot bisa mengalami loop, tetap ada batas pengaman 50.000 aksi (bisa disesuaikan lebih rendah) dan 60 menit. Jika batas pengaman atau loop menghentikan game, **tidak ada pemenang**.
- **2 — Berdasarkan Waktu:** atur durasi per match 1–60 menit. Saat waktu simulasi (di luar jeda menonton) habis, klasemen dihitung dari `worth()` bawaan engine: **kas + harga properti (nilai gadai bila tergadai) + nilai bangunan**. Juara adalah aset total tertinggi, **bukan sekadar uang tunai**. Bila kekayaan tertinggi seri, hasil `draw`, tanpa memilih kursi secara arbitrer. Jika ada satu pemain bertahan sebelum waktu habis, kemenangan alami bangkrut tetap dihormati.
- **Penghentian karena loop, action cap, error, atau Ctrl+C tidak otomatis dianggap menang pada mode manapun.**
- `summary.json` setiap match memiliki `victoryMode`, `winnerType` (`bankruptcy`, `net_worth`, `draw`, atau null), `winnerSeat`, dan `rankings` lengkap; `final-save.json` tetap state asli (tidak dipalsukan menjadi `won`).
- Live dashboard memakai maksimal **5 event terakhir**, menulis ulang layar terminal. Detail semua aksi dan keputusan masih tersimpan di file JSONL.

Contoh langsung tanpa menu:

```bash
node lab/benchmark.mjs --matches=1 --players=4 --victory-mode=timed --game-ms=60000 --max-actions=50000 --display=spectator --display-ms=65
node lab/benchmark.mjs --matches=1 --players=4 --victory-mode=bankruptcy --game-ms=3600000 --max-actions=50000 --display=performance
```

**Perhatian:** waktu benchmark bukan waktu simulasi dalam game. Tenggat adalah waktu komputasi pada perangkat, mengecualikan jeda spectator. Mode berdasarkan waktu cocok untuk peringkat pada perangkat sama, tetapi bukan pengukuran kekuatan mutlak antar-HP yang kecepatannya berbeda.

---

# NUSA MIND — Benchmark Lab V23 (satu ZIP)

**Sumber model:** `monopoli-nusantara-nusa-v23.zip`, NUSA V23.0 Chronos & Kairos. **Bukan** NUSA V24. Tidak ada model Gemini/Groq yang dipanggil dalam benchmark; semua aksi bot dihasilkan secara lokal. Folder ini adalah LAB untuk pengujian dan **bukan** source production pengganti Monopoli Nusantara.

## Termux Android

1. Simpan ZIP di Downloads, lalu jalankan:

   ```bash
   pkg update && pkg install nodejs unzip -y
   termux-setup-storage
   unzip ~/storage/downloads/NUSA_MIND_BENCHMARK_LAB_V23.zip -d ~
   cd ~/NUSA_MIND_BENCHMARK_LAB_V23
   bash nusa.sh
   ```

2. Pilih menu menggunakan angka. **Tidak perlu `npm install`**, internet, Supabase, ataupun token Groq. Disarankan Node.js **24+** (kebutuhan source game V23). Kode juga telah lolos tes dasar pada Node.js 22 di lingkungan pembuatan, tetapi versi tersebut bukan target resmi source.
3. Semua hasil tersimpan di `runs/` dalam folder lab. Beberapa pertandingan/turnamen panjang bisa memakan waktu, baterai, dan penyimpanan HP; jalankan `tmux` bila ingin sesi terminal tetap tersedia. Android masih dapat menghentikan proses background.

## Isi paket

- `engine/`: aturan game mandiri dan engine state transition, dari `scripts/package-logic.py` bawaan ZIP V23. Tidak mengimpor modul bot.
- `models/`: seluruh file model `lib/bot/` disalin tanpa mengubah algoritma; `models/game.mjs` adalah bridge kompatibilitas (pemilih aksi dasar dipindah keluar engine); pencatatan `recordBotMemory` dipanggil oleh host setelah aksi engine sukses.
- `lab/benchmark.mjs`: headless benchmark NUSA/Kresna/Arka/Raka/Bima/Sari 2–6 bot, perintah CLI, seed repeatable, validasi engine, deteksi loop.
- `lab/analyze-save.mjs`: audit log save JSON, termasuk fixture loop gadai–tebus.
- `lab/replay.mjs`: mengulangi semua aksi yang telah dicatat dengan RNG seed sama lalu membandingkan SHA-256 setiap state sebelum dan sesudah.
- `lab/selftest.mjs`: cek engine dan router model dapat memainkan aksi valid.
- `fixtures/nusa-loop-mortgage-redeem.json`: save game bug yang kamu kirim, tidak dimodifikasi.
- `nusa.sh`: menu interaktif Termux.

## Menu utama

1. Selftest engine dan model.
2. Smoke test 1 pertandingan 2 bot, batas 150 aksi.
3. Regression 4 pertandingan 4 bot, batas 500 aksi/pertandingan.
4. Standard 20 pertandingan 4 bot, batas 1200 aksi/pertandingan.
5. Tournament 100 pertandingan 6 bot, batas 2000 aksi/pertandingan.
6. Custom (jumlah match, pemain, aksi, budget).
7. Analisis ulang save asli NUSA yang looping.
8. Lihat lokasi output.
9. Replay dan verifikasi hasil match.
0. Keluar.

Perhatikan: **batas aksi atau waktu bukan bukti kemenangan**. Benchmark akan mencatat `action_cap`, `time_cap`, `detected_loop`, `illegal_action`, atau `finished` secara terpisah. Win hanya dicatat jika engine memasuki fase `won`.

## Benchmark CLI langsung (tanpa menu)

```bash
node lab/benchmark.mjs --matches=4 --players=4 --max-actions=1200 --game-ms=30000 --budget=24 --seed=12345
```

Pemilihan persona dan jumlah pertandingan:

```bash
node lab/benchmark.mjs --matches=6 --players=3 --bots=nusa,kresna,apex --max-actions=2000 --game-ms=60000 --budget=32 --run-id=nusa-compare
```

`--bots=` boleh memakai enam persona yang ada. Setiap match memakai seat rotation yang konsisten. `--seed=` dapat dipakai mengulang desain pertandingan tetapi algoritma yang berbasis waktu dapat membuat hasil berbeda; replay dari tindakan tercatat tetap menguji konsistensi aturan transisi yang sama.

### Ekspor log lengkap

Setiap pertandingan menghasilkan:

```text
runs/RUN_ID/
  manifest.json
  matches.jsonl
  summary.json
  report.md
  matches/match-0001/
    initial-state.json
    actions.jsonl       # setiap aksi, hash sebelum/sesudah, uang/aset, fase
    decisions.jsonl     # seluruh keputusan dan diagnostik model (termasuk kandidat)
    events.jsonl        # semua event publik, termasuk yang hilang dari state.log 300 terakhir
    alerts.jsonl        # jika detektor menemukan loop
    errors.jsonl        # jika ada kegagalan
    final-state.json
    final-save.json      # struktur ekspor kompatibel dengan save JSON
    summary.json
    checkpoints/state-000025.json ...
```

`events.jsonl` menangkap event *sebelum* mekanisme riwayat engine membuang event lama, sehingga riwayat lengkap dipertahankan. Bila membutuhkan **seluruh state lengkap setelah SETIAP aksi** (akan jauh lebih besar), tambahkan `--trace-full=true` agar dihasilkan `states.jsonl`. Default: state awal/akhir + checkpoint lengkap tiap 25 aksi (ubah dengan `--save-every=10`).

Output file `final-save.json` memakai format `monopoli-nusantara-save`, meski kapasitas log state dibatasi seperti game, event lengkap tetap berada di `events.jsonl`. Nilai uang memakai integer internal (10 unit = ₦1).

## Replay dan analisis bug

```bash
node lab/analyze-save.mjs fixtures/nusa-loop-mortgage-redeem.json
node lab/replay.mjs runs/RUN_ID/matches/match-0001
```

Detektor mengingatkan jika aksi `MORTGAGE` dan `REDEEM` terjadi bolak-balik pada properti yang sama dalam giliran yang sama. Hasil analisis save tersimpan di `runs/save-analysis/`. Detektor bersifat heuristik; perbaikan strategi NUSA bukan bagian paket ini. Secara default benchmark berhenti jika terdeteksi loop untuk menghindari menguras CPU/baterai (`--stop-on-loop=false` untuk tetap merekam seluruh jalur sampai cap).

## Batas dan integritas

- Benchmark **bukan uji online Supabase** dan tidak membuktikan Edge, Vercel, atau Termux worker production sudah terintegrasi.
- Tidak ada perbaikan algoritma NUSA dilakukan; bot V23 tetap berpotensi memiliki bug yang pernah terjadi.
- Paket model bukan V24, karena source V24 belum dikirim.
- Engine diekstrak terpisah dengan 12 modul bawaan source; pembuatannya memakai `scripts/package-logic.py` dari ZIP asal. Tidak ada perubahan kebijakan aturan inti, tetapi metadata memori AI kini dicatat dari host eksternal setelah aksi sah.
- `SHA256SUMS.txt` mencatat hash file paket. Simpan hasil run besar di penyimpanan terpisah dan jangan kirim kredensial saat melaporkan bug.
