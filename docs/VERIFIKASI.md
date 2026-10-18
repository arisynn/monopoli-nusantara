# Pemeriksaan paket (18 Oktober 2026)

Arsip pemeriksaan paket awal sebelum perbaikan guard. Untuk perubahan dan hasil versi 1.2.1, lihat [GUARD_FIX.md](GUARD_FIX.md) serta `PATCH_VERIFICATION.json`.

Paket sumber: `monopoli-nusantara-nusa-v23.zip` (aplikasi 4.11.0, NUSA V23 Chronos & Kairos, bukan V24).

- Semua **38 file** dari `lib/bot/` disalin byte-identik ke `models/bot/` (tidak diubah).
- Rules-only `engine/` memakai output `scripts/package-logic.py` bawaan source V23; 12 modul aturan yang diimpor ulang. Engine tidak mengimpor model.
- Dibandingkan engine terintegrasi asli untuk **80 keputusan state schema 2**, engine yang diekstrak dan adapter memori menghasilkan state identik pada setiap transisi. Ini pemeriksaan sampel, bukan pembuktian formal semua gameplay.
- `lab/selftest.mjs`: 8 aksi bot berhasil, 0 aksi ilegal.
- Dua simulasi **6 bot × 200 aksi**: 0 aksi ilegal; total **310** dan **297** event di `events.jsonl`, tidak ada event hilang/duplikat dibanding `eventId` akhir. Salah satu match replay SHA-256 seluruh transisi: PASS.
- Dua simulasi **4 bot × 200 aksi**: 0 aksi ilegal, rotasi kursi NUSA benar; replay transisi match kedua: PASS.
- Analisis fixture asli: gadai Malang 26x, tebus 25x; Stasiun Gambir gadai 7x, tebus 7x; gadai Lombok 1x. Detektor mengeluarkan peringatan pengulangan.
- Semua uji di atas dijalankan pada Node v22.16.0 milik lingkungan build; rekomendasi sumber aslinya adalah Node 24+.

Penting: 200 aksi pada tiap smoke QA diakhiri `action_cap` (bukan kemenangan), sesuai batas pengujian. Tidak dilakukan turnamen statistik 100+ pertandingan, klaim win rate, pengujian koneksi Groq, ataupun deployment produksi.
