# Multiplayer dan realtime

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Dua sesi browser independen benar-benar tersedia dan dipakai.** Setiap context mendapat identitas tamu sendiri melalui UI production. Tidak menggunakan akun/room pemain lain. Room QA yang pernah dibuat tercatat pada JSON; room bermain tidak dihapus. Percobaan LEAVE setelah start ditolak server sesuai aturan saat ini, sehingga room tersisa memakai mekanisme presence/expiry normal. Tidak ada database/save/pairing yang dihapus.

## Pengujian live

| Skenario | Status | Hasil teramati |
|---|---|---|
| Guest login dua identitas | PASS | /api/auth200, cookie/storage terpisah |
| Host buat room, guest join kode | PASS | Kapasitas3 dipilih lewat dropdown UI; kode milik QA |
| Ready, start | PASS | Kedua siap, host start, board dua sesi |
| Unready | NOT TESTED live | Ada coverage service lokal, tidak diklaim browser live |
| Dadu, pion, beli, pergantian giliran | PASS terbatas | Putaran awal dua manusia dan log uang terlihat di dua sesi |
| Server snapshot sama | PASS | Sesudah barter kedua GET state sama, hostVersion=guestVersion=8 |
| Realtime WebSocket | PASS terbatas | Host16 dan guest14 pesan pada koneksi awal, guest2 pada koneksi sesudah refresh; socket error0. Isi frame/token tidak disimpan |
| Lelang realtime lengkap | NOT TESTED | Keputusan lelang/browser lokal ada; belum diklaim live |
| Barter dua manusia | PASS transaksi/perspektif | Host memberi100 unit=₦10; guest menerima; tepat satu receipt |
| Popup hasil barter live | FAIL UI | Penerima membawa footer lama; QA-001. Rincian jumlah/perspektif benar |
| Barter dengan bot live | BLOCKED | Worker offline; tambah bot ditolak preflight |
| Dua request identik hampir bersamaan | PASS | Dua respons sukses versi5; state dari4 hanya menjadi5, dadu3+5 satu roll |
| Request ID sama, payload berbeda | PASS |409 “ID permintaan sudah dipakai untuk isi berbeda.” |
| Request terlambat versi sebelumnya | PASS |409 “State berubah…” |
| Pemain bukan giliran mengirim ROLL | PASS |400 “Belum waktunya melempar.” |
| Refresh lalu Resume | PASS | Identitas tetap, authoritative state pulih; tidak menyalin cache sebagai authority |
| Offline/reconnect singkat | PASS terbatas |4 detik offline lalu reconnect; bukan pembuktian timeout lease35s/disconnect90s |
| Pause/resume/voting | NOT TESTED live | Service tests dan14 skenario browser lokal ada |
| Host disconnect/transfer | NOT TESTED live | Logika/service tests ada; tidak menunggu presence timeout production |
| Pemain bangkrut/keluar, pemenang online | NOT TESTED live | Fixture lokal ending tidak menggantikan ini |
| Dua tab identitas sama | NOT TESTED live | Suite lokal CAS/Web Locks/identity ada |
| Event berulang/terbalik | NOT TESTED live | Unit contract ada; jaringan production tidak disabotase |
| Retry setelah respons timeout hilang | NOT TESTED live | Duplikat bersamaan live diuji; hilang ACK worker diuji lokal |

## Worker dan kompatibilitas

Production config menyatakan `onlineBots:true`, tetapi preflight terautentikasi mengembalikan:

```json
{"workerProvider":"termux","workerAlive":false,"availableSlots":0,"workerConfigured":true,"schedulerConfigured":false,"schemaVersion":7}
```

`schedulerConfigured:false` tidak otomatis bug pada mode Termux; scheduler Edge berbeda dari heartbeat worker perangkat. Kegagalan utama adalah workerAlive:false dan slot0. UI berhasil menghindari memulai room dengan bot yang tidak dapat bekerja. Penyebab infrastruktur lebih dalam dan versi proses Termux BLOCKED.

## Authority, CAS dan idempotency

Source memvalidasi identitas Supabase dari bearer di server, memetakan user ke seat, memeriksa membership/lease/status, mem-whitelist action field dan memakai expectedVersion. Request digest mengikat requestId pada isi. Store commit memakai revision CAS dan receipts. Worker claim/submit memiliki lease dan revalidasi match/version/actor sebelum commit; client tidak dapat memasang saldo atau dadu sendiri.

Bukti kuat live adalah versi4→5 untuk dua request roll identik, penolakan salah giliran/stale version/payload berubah, serta state dua sesi yang sama setelah transfer. Ini tidak membuktikan RLS SQL live seluruhnya benar atau semua kemungkinan interleaving bebas masalah.

## Bukti dan batas automation

- [Live gameplay dua sesi](evidence/multiplayer-live.json), screenshot online-host-gameplay.png / online-guest-gameplay.png.
- [Race, authority, barter, worker](evidence/multiplayer-advanced.json), screenshot advanced-*.png.
- Log script `multiplayer-progress.log`, `multiplayer-advanced-progress.log`.
- Percobaan harness pertama gagal pada native select tersembunyi; kedua pada selector numerik tanpa kutip; percobaan berikut menilai ready sebelum response selesai. Semua disimpan sebagai attempt, tidak dianggap bug game. Iterasi advanced awal membuka profil karena UI presentasi tertinggal state authoritative; harness akhir memakai API sah untuk opening, lalu UI penerimaan barter.
- `test:online:rooms`:14 skenario browser **lokal** memakai MemoryOnlineStore, auth test, socket fixture; PASS65.896s. Itu bukan Supabase live.
- `test:online` literal FAIL karena loader, rerun file sama dengan loader PASS. `npm test`710/710 merupakan in-process/local coverage, bukan710 transaksi production.

**Skor reliability:70/100 pada rubrik master.** Dua manusia dapat bermain pada jalur yang diuji; rekomendasi publik dengan bot online menunggu pemulihan worker dan satu match live hingga pemenang.
