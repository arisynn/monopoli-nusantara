# Monopoli Nusantara — laporan implementasi Online Multiplayer

Status: **kode lokal dan migrasi siap ditinjau; integrasi Supabase live, build frontend, dan deployment belum terverifikasi. Bukan klaim production-ready.**

Source acuan: arsip `Monopoli_Nusantara_v2.11.1.zip` dari pengguna. Tidak ada checkout Git atau remote repository pada workspace; perubahan dikerjakan pada source hasil ekstraksi. Hotfix `GameNotice` sudah terdapat di ZIP dan dipertahankan.

## 1. Audit source code

- Aplikasi mempunyai jalur Next.js/Vercel serta Vinext/Cloudflare Sites. Adapter Redis/D1 dan engine bersama sudah tersedia; tidak perlu membuat engine baru.
- `lib/game.mjs` adalah engine schema v2, `lib/game-v1.mjs` mempertahankan save schema v1. Engine memproses giliran awal, dadu, gerakan, properti, sewa, bangunan/stok bank, gadai, lelang properti/bangunan, barter/tawaran balik, kartu, penjara, utang, kebangkrutan, dan kemenangan.
- API existing sudah memakai RNG server, snapshot publik tanpa deck, command ID, expected game version, dan CAS revision pada Redis/D1.
- Identitas online existing adalah token kursi yang di-hash; cocok untuk pemulihan browser yang memegang token, tetapi bukan identitas akun lintas perangkat. JOIN lama selalu membuat kursi baru selama lobby tersedia.
- Sinkronisasi existing menggunakan polling sekitar 1,8 detik, bukan Supabase Realtime. Redis mempunyai TTL default tujuh hari. D1 menyimpan JSON snapshot tanpa TTL pada adapter.
- Belum ada voting jeda, heartbeat persisten, auto-pause, unanimous resume, dan lifecycle eksplisit yang memenuhi permintaan.
- Pause lokal/UI tidak boleh digunakan sebagai otorisasi pause online. Restore browser juga perlu mengganti cache dengan snapshot server walaupun versi cache lebih tinggi.
- Audit input menemukan engine menerima beberapa indeks sebagai string. Validasi online sekarang memaksa tipe angka untuk penerima barter/petak/aset; validasi yang sama dipakai pada ACTION legacy tanpa mengubah engine bersama.

## 2. Audit Supabase dan hosting

- Tidak ada paket, konfigurasi, migration, atau koneksi Supabase pada source awal. Runtime lingkungan tidak menyediakan credentials/outbound identity untuk Supabase.
- Pemeriksaan resmi Sites berhasil mengenali Site existing `Monopoli Nusantara`; aksesnya masih terbatas kepada pemilik. Tidak ada perubahan audience/deployment.
- Tool database overview Sites mengonfirmasi binding **D1 `DB`**, dengan tabel **`rooms` dan `quotas`**. Daftar environment variables Site kosong ketika diperiksa. Ini bukan audit PostgreSQL Supabase.
- Struktur, RLS, grants, Auth providers, publication, logs, indexes, constraints, kuota paket dan data Supabase live **belum dapat diperiksa**. Tidak ada migrasi yang dijalankan pada database remote.

## 3. Fitur existing yang dipertahankan

Engine v1/v2, aturan C1009, ekonomi Nusa, nominal/modal, papan 40 petak, artwork/pion, animasi dadu/gerakan, kamera, aset/bangunan, kartu/deck, penjara, lelang, barter/tawaran balik, utang, kebangkrutan, simpanan lokal IndexedDB/localStorage, slot/ekspor/impor lokal dan hotfix notifikasi tetap dipakai. File engine dan desain papan tidak diubah.

Pilihan hotseat dihapus dari alur permainan baru. Save hotseat lama tetap dapat dimuat melalui engine dan kontrol lokal existing. VS Bot baru selalu satu manusia dan 1–5 bot lokal; tidak memerlukan backend. Adapter/Groq lama tetap tersedia untuk kompatibilitas room bot lama, tetapi setup VS Bot baru menjalankan bot lokal.

## 4. Perubahan backend

- `/api/online`: konfigurasi publik terbatas, daftar room milik identitas, snapshot, CREATE/JOIN/READY/START, ACTION, HEARTBEAT, PAUSE_REQUEST/VOTE, RESUME_READY.
- `online-room.mjs`: lifecycle `waiting/playing/paused/finished`, kapasitas 2–6, pion eksklusif, identitas kursi, penahanan keputusan, voting dan resume.
- `online-service.mjs`: validasi intent, secure RNG, snapshot lengkap engine, hash request kanonis, persistent idempotency, retry CAS dengan validasi ulang, reconciler fairness sebelum menerima reconnect.
- `supabase-store.mjs`: REST Auth/PostgREST dengan timeout, secret server, query keanggotaan, transaksi melalui RPC. Tidak menambahkan dependency package saat instalasi lingkungan belum berhasil.
- CREATE room manusia pada API legacy dinonaktifkan secara default (HTTP 410). Flag server `ALLOW_LEGACY_ROOM_CREATION=true` hanya dipakai fixture tes kompatibilitas; jangan aktifkan pada deployment baru. Pemulihan/action room legacy existing tetap tersedia.
- RNG, saldo, pemilik aset, fase dan hasil transaksi tidak diterima dari client sebagai state tepercaya. Input aksi bertipe ketat; engine existing tetap menentukan hasil.

## 5. Database dan migration

File: `supabase/migrations/202610160001_persistent_online.sql`.

| Tabel | Fungsi |
| --- | --- |
| `mn_rooms` | Snapshot privat lengkap, revision dan timestamp; tanpa TTL room |
| `mn_members` | Auth user UUID ↔ kursi immutable, unique per identitas dan indeks kursi |
| `mn_commands` | Receipt permanen per identitas/request, hash intent, tipe dan revision |
| `mn_room_updates` | Penanda revision tanpa snapshot/deck/identitas untuk Realtime |
| `mn_rate_limits` | Counter jendela waktu untuk perintah, heartbeat dan entry |

RPC `mn_commit_room` mengunci row, memeriksa expected revision, menjaga kepemilikan kursi, dan menyimpan snapshot + membership + receipt + notification dalam satu transaksi. Advisory lock juga mencegah CREATE ganda untuk request sama yang menghasilkan kode random berbeda. Kesegaran lease untuk ACTION/START/resume diperiksa ulang dengan jam database ketika row terkunci.

Migration bersifat aditif, tidak menghapus tabel/data existing, dan dijalankan dalam transaction. Nama yang sudah ada menyebabkan gagal, bukan mengganti struktur diam-diam. **Audit schema target wajib dilakukan sebelum penerapan**, karena Supabase live belum tersedia. Migration tidak memindahkan room D1/Redis secara otomatis.

## 6. Perubahan frontend

- Dua pilihan baru: VS Bot dan Online Multiplayer.
- Buat/Gabung/Lanjutkan room, kapasitas, pemilihan pion, Ready, status host dan online/offline dalam lobby compact.
- Login/daftar email + kata sandi, identitas guest, tautkan guest ke akun, dan pemrosesan callback konfirmasi email. Token callback diverifikasi ke Auth lalu dihapus dari URL.
- Daftar room per identitas; kode baru delapan karakter. Kode room tidak membuktikan kepemilikan kursi.
- Realtime mengirim invalidation revision, lalu client mengambil snapshot terotorisasi. Recovery baseline mengganti cache browser; respons revision lama ditolak.
- Kapsul status pemain, panel voting/jeda kecil, Siap Lanjut semua pemain, serta indikator koneksi nonintrusif. Kontrol diintegrasikan tanpa menambah child yang merusak grid papan existing.
- Subscription, heartbeat, retry dan event listener dibersihkan ketika meninggalkan room. Identitas yang berubah di tab lain mengunci sesi tampilan lama.

Frontend TSX, layout akhir pada HP, accessibility/focus dan browser nyata **belum terverifikasi melalui build/render** di lingkungan ini.

## 7. Identitas dan keamanan

- Backend memverifikasi Bearer JWT melalui Supabase Auth `/auth/v1/user` untuk setiap request terlindungi. ID/nama dari body tidak menentukan pemilik kursi.
- Guest sah memiliki UUID Auth dan sesi browser persisten. Guest tanpa akun tertaut **tidak dijamin pulih lintas perangkat atau setelah data browser dihapus**. Email/password tertaut harus dikonfirmasi dan diuji pada perangkat kedua.
- Snapshot, deck, koneksi privat, dan receipts tidak diberikan sebagai akses tabel frontend. Hanya membership milik sendiri dan revision hint yang boleh dibaca authenticated client melalui RLS.
- RPC mutasi dan quota hanya diberikan kepada `service_role`; secret hanya dari runtime server. Endpoint konfigurasi mengembalikan URL dan anon/public key saja.
- Row lock/CAS + expected game version + receipt permanen menangani concurrent writes, retry dan replay. Request ID dengan isi berbeda ditolak; command ID engine diberi namespace identitas.
- Validasi origin, JSON/body streaming 16 KiB, kode random 40 bit, kuota CREATE/JOIN/perintah/read/heartbeat, dan error penyimpanan yang tidak membocorkan detail provider.
- Batas awal: CREATE 30 per identitas/24 jam; JOIN 20 per identitas/menit; entry 120 per identitas platform/IP bucket/menit; command dan read 120/menit; heartbeat 60/menit. Pada runtime tanpa sumber IP tepercaya, entry memakai bucket konservatif bersama. Ini bukan kapasitas Supabase yang telah diukur.
- Auth provider tetap perlu rate limits dan proteksi signup yang sesuai pada proyek target. CAPTCHA wajib proyek belum memiliki widget pada client ini; gunakan login akun atau integrasikan widget sebelum mewajibkan CAPTCHA untuk guest.

## 8. Status room

Implementasi lokal: create/join/idempotent rejoin, 2–6 manusia, kapasitas, pion unik, Ready/Start, administrasi host yang dapat berpindah, dan finished tersimpan. Host tidak dapat mengubah ekonomi, dadu atau hasil.

Tidak ada penghapusan room karena host pergi/semua offline. Room Supabase baru tidak memakai TTL. Retensi dan penghapusan akun/guest harus ditetapkan terpisah agar foreign key dan pemulihan kursi tidak rusak.

## 9. Autosave dan reconnect

Setiap intent sukses disimpan atomik sebelum respons. Snapshot privat berisi match/rulepack/schema version, seluruh deck, kartu aktif, queue/nested contexts, saldo, posisi, properti/bangunan/gadai/stok, jail, debt, auction/trade dan kemenangan. Realtime bukan penyimpanan.

Heartbeat HTTP setiap 20 detik memperbarui lease server. Realtime menyampaikan perubahan gameplay/keanggotaan/vote/status; heartbeat yang hanya menyegarkan waktu tidak memicu fanout notifikasi. Client memakai heartbeat sebagai fallback snapshot jika Realtime gagal. Banyak tab tidak membuat kursi baru; sampai delapan lease per identitas dibatasi pada snapshot.

Semua-client-offline ditangani melalui rekonsiliasi aman saat read/list/command/heartbeat berikutnya: periode kedaluwarsa diproses **sebelum** heartbeat baru menghidupkan koneksi. Tidak memerlukan browser tetap terbuka. Belum ada scheduler yang mematerialisasikan status saat room benar-benar tidak diakses.

## 10. Pause dan resume

- Lease dianggap hilang setelah 35 detik dari heartbeat server terakhir. Semua gameplay ditahan ketika **salah satu pemain aktif** absent, lebih konservatif daripada hanya menahan aktor keputusan kritis.
- Auto-pause jatuh pada **90 detik sejak heartbeat server terakhir**. Ini adalah ambang yang dapat dibuktikan backend, bukan pengukuran tepat waktu kabel/Wi-Fi terputus. Waktu auto-pause efektif disimpan pada deadline tersebut, termasuk setelah offline semalaman.
- Mayoritas: 2/2, 2/3, 3/4, 3/5, 4/6. Pemohon otomatis setuju. Electorate dibekukan saat voting dibuat; offline tetap dihitung; bangkrut sebelum voting dikecualikan. Jika roster aktif berubah karena bangkrut saat voting, voting dibatalkan agar hak spectator tidak ikut menentukan hasil.
- Satu suara per peserta, voting 60 detik, batas antar-pengajuan 90 detik (60+30), penolakan jika mayoritas tidak lagi mungkin. Hanya satu voting terbuka secara atomik.
- Resume hanya ketika seluruh pemain aktif terhubung dan siap pada siklus jeda yang sama. Ready yang lease-nya hilang dihapus sebelum heartbeat kembali; host tidak dapat memaksa resume. Request siklus lama tidak berlaku.
- Engine existing tidak mempunyai deadline gameplay/lelang. Karena itu tidak ditambahkan timer atau perubahan aturan; snapshot fase, antrian, penawaran dan keputusan tetap persis sama. Jika timer gameplay ditambahkan kelak, remaining duration perlu menjadi bagian snapshot sebelum diaktifkan online.

## 11. Hasil pengujian

Bukti terakhir: `docs/QA_ONLINE_RESULTS.json`, dihasilkan oleh `npm run test:core`. Runner memakai Node test isolation `none`, karena subprocess Node ditolak sandbox dan tidak boleh menjadi bukti tes yang semu.

Cakupan baru: service room, mock CAS/receipts, concurrency pembelian/join/accept barter, mayoritas 2–6, suara ganda/expiry/spam/voting bersamaan, spectator, resume/disconnect, reconnect, snapshot penuh semua fase khusus, Auth/session/callback, client Realtime protocol/cleanup, cache revision, serta handler HTTP aktual dengan adapter REST simulasi untuk 2/3/6 pemain.

Tes engine/save/kamera/source regression existing yang tidak membutuhkan React/TypeScript runtime juga dijalankan. Jumlah lulus aktual ada di JSON; jangan menyamakan mock CAS dengan pengujian lock PostgreSQL.

`npm test` penuh belum lulus di lingkungan ini: suite render `portrait` dan `board-2d` memerlukan dependency TypeScript/React yang belum terpasang. `npm run build:vercel` berhenti dengan `next: not found`. Tidak ada klaim TypeScript penuh atau TSX build lulus.

`tests/supabase-live.test.mjs` disiapkan untuk staging: real Auth, RLS, private snapshots, service-only RPC, CAS, idempotency, voting/resume, offline recovery dan delivery Realtime. Script ini **belum dijalankan** karena proyek/credentials Supabase tidak tersedia.

## 12. Keterbatasan lingkungan

Instalasi dependensi belum berhasil; permintaan eksekusi jaringan tambahan terhenti, dan koneksi exec sempat terputus saat konfigurasi lingkungan berubah. Pekerjaan source serta tes Node murni dapat dilanjutkan. Tidak mengulangi instalasi/browser yang gagal.

Tidak ada akses Supabase, PostgreSQL lokal, build frontend, browser QA, atau remote source checkout/commit. Source ZIP tidak memuat metadata Git. Laporan ini tidak mengklaim perubahan sudah tersinkron ke repository remote atau Site live.

## 13. Risiko dan pekerjaan yang belum terverifikasi

- Migrasi SQL belum dieksekusi/diparse PostgreSQL; grants/RLS/RPC locking, Auth guest/link email, dan protocol Realtime perlu tes staging nyata.
- Frontend belum dikompilasi/dibuka pada perangkat. Penyatuan status, dialog lelang dan kesiapan pada layar kecil memerlukan QA visual.
- Room lama D1/Redis tidak otomatis memperoleh identitas Supabase, voting atau retensi baru. Tetap gunakan backend dan token existing; jangan menghapus datanya. Redis lama tetap memiliki TTL konfigurasi lama. Migrasi pertandingan lama perlu proses claim identitas dan snapshot privat terotorisasi tersendiri; jangan mengimpor snapshot publik browser sebagai state otoritatif.
- Auth/session client menggunakan REST dan protocol Realtime terbatas tanpa SDK dependency baru. Pertahankan kontrak dan tes staging saat upgrade Supabase; gunakan SDK resmi bila dependency environment sudah dapat diubah dan diverifikasi.
- Heartbeat mempunyai detection latency dan timer browser latar dapat ditangguhkan OS. Ini sengaja menghasilkan hold/auto-pause, bukan penalti/kehilangan aset.
- Tidak ada jaminan recovery untuk guest yang kehilangan browser tanpa menautkan akun; tidak ada fitur mengganti identitas pemilik kursi melalui nama/kode.
- Tidak ada pengukuran throughput/kuota/harga Supabase aktual. Snapshot heartbeat masih ditulis secara CAS; evaluasi beban nyata sebelum optimasi penyimpanan presence terpisah.

## 14. Deployment

Ikuti `docs/DEPLOY_SUPABASE.md`. Audit skema target dan backup dahulu; terapkan migration pada staging, siapkan Auth/redirect URLs dan runtime secrets, jalankan tes staging + full frontend checks, baru terapkan pada environment tujuan.

Tidak ada deployment atau perubahan database produksi pada sesi ini. Akses Site existing masih terbatas; undangan teman/audience harus diatur secara sengaja sesudah validasi, tanpa mengubah akses secara diam-diam.

## 15. Checklist manual setelah deployment staging

- [ ] Buat/gabung room 2, 3, 6 manusia pada perangkat berbeda; kapasitas/pion/Ready konsisten; host saja Start.
- [ ] Akun yang sama dari banyak tab/perangkat tetap satu kursi; nama sama pada akun lain tidak mengambil kursi.
- [ ] Guest ditautkan email, konfirmasi email, login perangkat kedua, pulih ke kursi/aset yang sama.
- [ ] Host offline: admin berpindah tanpa mengubah kursi, dadu, aset atau giliran; room tetap ada.
- [ ] Refresh tepat sesudah roll/beli/accept barter; retry request ID sama tidak mengulang uang/aset.
- [ ] Uji semua mayoritas, Tolak, suara ganda, timeout, dua pengajuan sekaligus; offline tetap dihitung; bangkrut tidak voting.
- [ ] Putus koneksi singkat dan melewati 90 detik heartbeat; hold keputusan lelang/barter/giliran; tidak ada auto-pass/auto-reject.
- [ ] Semua offline, tutup semua browser, kembali esok hari: Paused dengan deck, posisi, kas/aset dan fase yang sama.
- [ ] Resume memerlukan semua aktif siap; satu offline/belum siap menghalangi; disconnect menghapus ready; host tidak dapat memaksa.
- [ ] Jeda pada lelang properti/bangunan, tawaran balik, kartu, jail, debt, mortgage decision dan starting roll; keputusan tidak diulang.
- [ ] Matikan WebSocket saja, pulihkan snapshot via heartbeat, hidupkan kembali; tidak ada rollback/event transaksi ulang/subscription ganda.
- [ ] Akun luar room tidak membaca snapshot/notifikasi room lain atau menjalankan RPC; request dadu/saldo palsu ditolak.
- [ ] VS Bot 1–5 bot, save/load lama v1/v2 dan hotseat lama; nominal Nusa/papan/kamera/animasi tetap benar.
- [ ] Tampilan 320–430 px: papan tetap fokus, lobby padat, panel jeda/feedback mudah diakses, keyboard/form tidak menutup tombol.
