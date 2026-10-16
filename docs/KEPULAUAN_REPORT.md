# Monopoli Nusantara 4.7.1 — Kepulauan 2.5D

Implementasi frontend baru berdasarkan paket logic tanpa frontend v4.6.1, menggunakan sepuluh referensi terakhir yang disetujui. Penyesuaian final: hanya lobby dan gameplay sebagai layar penuh; semua fitur lain popup; tidak ada bottom tab gameplay dan tidak ada strip properti di bawah papan.

## Penyesuaian 2.5D sesuai mockup

Pada v4.7.1, papan datar diganti dengan meja ilustratif 2.5D: bidang trapesium (sisi belakang 86% lebar depan), alas batu berketebalan 28 unit, sisi berbayang, pita warna mengikuti bidang, dekorasi rim, serta rumah/hotel dengan sisi dan atap. Label properti menghadap pemain pada keempat sisi. Atlas pion transparan baru menampilkan enam identitas yang sama sebagai miniatur berdiri, dengan tapak dan bayangan. Lobby/profil/kapsul memakai sprite yang sama.

Ini rendering SVG/ilustrasi 2D dengan proyeksi, tanpa model/WebGL/physics. Polygon, kamera dan rute memakai transformasi yang sama. Engine tetap menggunakan posisi 0–39. Pemilihan tile mengikuti polygon nyata; proyeksi/invers diuji pada 360 titik interior seluruh petak. Enam regresi baru mencakup perspektif/bounds, invers ketukan, pita warna, gerak melewati GO/follow camera, urutan lapisan dan identitas sprite.

Inspeksi gambar papan dilakukan dari renderer SVG aktual pada ukuran besar dan 390 px; belum merupakan uji DOM atau screenshot halaman browser. Versi cache dinaikkan untuk paket aset baru, tanpa menghapus save.

## Audit source dan kontrak

Basis diverifikasi melalui SHA-256 ZIP `75f88c097e9356f6ebc6a602d3f04c5a744f1a26a87bf3416605e9e6d1f0689e`, struktur file dan implementasi aktual. Tidak ditemukan metadata commit/branch yang dapat diverifikasi. Nomor versi atau nama direktori lama tidak dipakai sebagai bukti source terbaru.

Paket basis berisi engine 40 petak C1009/Nusa, kompatibilitas engine v1, empat model NUSA MIND, tiga persona, advisor Groq, persistence, server room Supabase dan job bot. Paket itu memang tidak berisi halaman, CSS atau komponen frontend. Frontend baru dibangun terpisah dalam `frontend/` memakai native ES modules, tanpa mengambil frontend React lama.

**56 file `lib/`, handler API existing, Supabase dan schema database tetap identik byte** dengan basis. Bukti per file ada di `KEPULAUAN_CORE_INTEGRITY.json`. Dengan demikian tidak ada perubahan rulepack, ekonomi, strategi bot, otorisasi, migration, RLS, scheduler atau command engine pada update UI ini. Adapter Node mendapat static serving khusus output build; adapter Vercel baru meneruskan handler yang sama.

Kontrak `BotDecisionResult.reason` dan `aiComment` yang sudah ada dipertahankan. Tidak menggunakan any/ignore baru untuk menutupi error TS. Validasi TypeScript semantik tetap belum dapat dilakukan karena compiler tidak tersedia.

## Implementasi antarmuka

| Bagian | Status dan perilaku |
| --- | --- |
| Lobby | Diimplementasikan; setup nama/pion/model/aturan dalam popup, pilihan VS Bot 2–4 peserta, create/join/resume room, roster hingga enam, Ready/host/start/tambah bot mengikuti kontrak backend |
| Gameplay | Diimplementasikan; papan menjadi fokus, kapsul dua baris, kamera overview/follow/pan/pinch, satu konsol dadu/tindakan, akses Properti Saya dan menu ringkas |
| Popup | Diimplementasikan untuk beli, sertifikat, aset/kelola/bangun/jual/gadai/tebus, barter/picker/counteroffer, lelang, kartu, penjara, utang, room/vote/resume, profil, riwayat, save, Auth, settings dan hasil akhir |
| Visual | Latar kepulauan blur dan atlas properti baru, logo/avatar/ikon SVG baru, tema putih/biru, tombol utama biru, aksen emas Nusa, enam identitas pion menggunakan atlas miniatur baru; SVG pion lama dan ikon khusus tetap tersedia |
| Board | Empat orientasi, kelompok warna terpisah dari strip kepemilikan, warna pemilik konsisten dengan kapsul, rumah/hotel/gadai, selected tile, penempatan pion deterministik |
| Dadu | Berada pada area konsol, bukan tengah papan; rolling menyembunyikan nilai di markup/label, reveal memakai hasil sah; identitas langkah mencegah restart akibat rerender |
| Pion | Rute/event engine, interpolasi transform, durasi mengikuti jarak; callback hanya menyelesaikan presentasi; reduced motion, fast mode dan baseline reconnect tersedia |
| Keuangan | Efek +/- dari finance records engine, saldo presentasi dan detail Riwayat konsisten; node kapsul/efek dipertahankan saat update koneksi, sehingga efek tidak dimulai ulang |

Tata letak menggunakan safe area, visual viewport, grid fleksibel, modal dengan scroll internal dan footer tindakan yang tetap terlihat. Mendukung keyboard/focus, Space untuk aksi utama, Escape dan Back untuk menutup popup. Kesesuaian visual akhir pada browser/perangkat nyata masih membutuhkan pengujian manual.

## Alur gameplay dan perbaikan integrasi

`GameSession` memisahkan authoritative state, public presentation view dan antrian timeline existing. Command online tidak dijalankan secara lokal. Request berisi intent, identitas sesi, requestId yang sama dengan action.id, dan expectedVersion; tidak mengirim dadu/saldo hasil lokal.

Dadu → hasil → pergerakan → kedatangan → kejadian/finance mengikuti timeline. Kejadian publik diterima semua client; kontrol kartu/trade tetap dibatasi pemilik keputusan. Queue menggunakan event ID dan cursor existing. Restore, refresh dan reconnect membuat baseline sehingga riwayat tidak diputar ulang.

Hal yang ditemukan selama implementasi dan diperbaiki:

- Snapshot public tidak boleh diproses lagi sebagai state engine lokal. Session online hanya mengirim intent dan menerima public snapshot.
- Kartu yang masih menunggu ACK setelah refresh perlu popup dari keputusan saat ini meskipun queue visual kosong.
- Menutup kartu interaktif harus mengingat key keputusan, agar popup yang sama tidak langsung terbuka lagi.
- Rent/pajak umumnya sudah dibukukan engine. Popup baru hanya konfirmasi visual, tidak mempunyai tombol PAY kedua. Utang yang belum dibayar tetap memakai perintah PAY yang sah.
- Sewa aturan klasik memerlukan akses CLAIM_RENT, termasuk di luar giliran pemilik. Akses kontekstual dan menu Tagih Sewa ditambahkan.
- Counteroffer harus membuka editor dengan arah aset/uang dibalik, tidak terkonversi kembali menjadi popup incoming trade. Input uang tidak valid tidak boleh diam-diam memakai nominal lama.
- Action manusia ditahan selama presentasi belum mengejar versi state. Klik roll ganda ditahan oleh pending guard; backend tetap memeriksa revision/idempotency.
- Hasil worker/advisor lokal yang terlambat dibuang setelah cover/pause/perubahan versi. Worker gagal memakai planner lokal; kegagalan berulang dibatasi dan menyediakan Coba Ulang.
- Kembali dari room playing ke lobby harus melepaskan konteks room aktif di UI, menyimpan identitas untuk resume, dan tidak menampilkan kontrol Start lobby yang salah.
- Static path dinormalisasi dengan benar; source/backend/secrets tidak disajikan. Build memeriksa kelengkapan precache sebelum service worker dipasang.

Popup penjara menggunakan identitas kejadian untuk masuk/keluar dan key keputusan untuk giliran penjara. Menutup popup tidak menjalankan command. Popup lelang menggunakan satu dialog yang diperbarui, bukan close/open tiap penawaran; hasil lelang tetap kejadian publik. Tidak ada timer lelang fiktif atau angka ekonomi dari mockup.

## Supabase, Groq dan keamanan

**Audit live tidak tersedia.** Tidak ada koneksi project Supabase, database produksi, Auth nyata, Realtime nyata, Edge Function deployed atau Groq key yang dipakai pada pekerjaan ini. Audit dilakukan pada source/migrations/adapters/tests existing, bukan klaim inspeksi infrastrukturnya.

Frontend terhubung ke Auth dan endpoint existing untuk create/join/Ready/start/action/heartbeat/vote/resume. Keanggotaan, kursi, revisi, persistence dan transaksi tetap diverifikasi backend. Tidak menambah tabel/migration atau menjalankan SQL produksi. Bot online tetap worker server dengan jobs/lease existing; tidak ikut voting atau readiness manusia. Menambah bot dibatasi lobby dan feature flag backend.

Static output tidak memuat modul `lib/server`, `lib/groq.ts`, ENV aktual atau token. Request Auth dikirim ke Supabase; hanya URL dan key publik yang diekspos endpoint config. Teks pemain/log di-escape. Impor JSON dibatasi ke pertandingan lokal. Room online tidak diekspor menjadi save lokal. Service worker tidak menyimpan API/Auth/state room, tidak menghapus IndexedDB/localStorage, dan cleanup dibatasi cache/worker Nusantara.

Groq lokal opsional dan hanya untuk keputusan yang ditandai kompleks. Status konfigurasi tidak berarti provider pernah berhasil. Respons melewati version/match/actor check dan local decision gate; kegagalan memakai lokal. Tes provider menggunakan mock, bukan evaluasi kualitas model live.

## Bukti pengujian

Lihat `QA_KEPULAUAN_RESULTS.json` untuk jumlah hasil akhir, `KEPULAUAN_SYNTAX_IMPORTS.json` untuk syntax/import, dan `KEPULAUAN_VERIFICATION.json` untuk rangkuman pemeriksaan.

- **313/313 tes otomatis lulus**: 266 tes core/backend yang dipertahankan dan 47 tes frontend. Tidak ada yang diskip.
- Tes frontend menjalankan renderer SVG/HTML aktual, GameSession aktual dan handler transport. Simulasi 2/4/6 session memakai service backend nyata dengan MemoryOnlineStore sebagai pengganti database. Meliputi urutan dadu/kartu, hak ACK, snapshot duplikat, reconnect baseline, voting/resume dan state tetap.
- Tes regresi meliputi pending card restore, rent/pajak tanpa double payment, manual rent, trade perspective/counteroffer, bot cancellation/fallback/retry, pengikatan kursi, stale snapshot, kegagalan save dan keamanan static output.
- Smoke sesi VS Bot dengan **2/3/4 peserta selesai**, masing-masing **389/428/610 tindakan**, seed 461. Menggunakan GameSession nyata, persistence double, tanpa DOM, dan keputusan manusia disimulasikan planner lokal. Ini bukan uji tap/layar atau benchmark kompetitif.
- Self-play core terpisah: seed 461, tiga persona, selesai **457 tindakan**, Bima menang. Tidak menyatakan peningkatan kecerdasan karena strategi tidak diubah.
- `npm run build` dan `npm run build:vercel` berhasil membuat output static. Perintah kedua pada source ini menjalankan native build baru, **bukan Next.js build** dan bukan deployment Vercel.
- Pemeriksaan native module syntax dan import source/output lulus; pemeriksaan ini tidak sama dengan semantic tsc.
- `npm run typecheck`: **belum lulus/terblokir**, `tsc: not found`. Tidak menonaktifkan strict atau mengklaim error TypeScript telah diperiksa semantik.
- Chromium gagal karena batas sandbox (`setsockopt: Operation not permitted`). Tidak dilakukan pengujian DOM/layout browser, screenshot halaman, FPS Android, atau tap manual. Pemeriksaan raster SVG papan hanya memeriksa struktur gambar, bukan screenshot frontend.
- Tidak ada script lint di paket basis. Tidak dilakukan deployment publik atau pengujian layanan live.

## File dan assets

Daftar per file: `KEPULAUAN_CHANGED_FILES.json` dan manifest paket root. Frontend berada dalam `frontend/`; perubahan build/transport di `scripts/build-web.mjs`, `adapters/node/static.mjs`, `adapters/node/server.mjs`, `api/index.ts`, `vercel.json`, `package.json` dan `tsconfig.json`. Tes di `tests/frontend.test.mjs`; runner dan assertion paket disesuaikan untuk frontend baru.

Aset publik aktif berjumlah 22. `ASSET_MANIFEST.json` mencatat hash dan status retained/new/replaced serta enam aset lama yang dihapus dari source aktif. Tiga atlas/ilustrasi baru adalah hasil generasi gambar khusus untuk UI, bukan salinan tampilan mockup. Atlas baru memakai path berbeda agar cache lama tidak menampilkan atlas gelap.

## Deployment dan verifikasi manual tersisa

Ikuti README root untuk Node 24 dan konfigurasi Vercel Other. Build menghasilkan `dist/` yang boleh dipublikasikan; jangan jadikan seluruh repo sebagai static root. Backend membutuhkan ENV server dan migration/worker Supabase existing bila online diaktifkan. Tidak ada migration baru dari update UI ini. Default bot online tetap OFF hingga staging worker/scheduler lolos tes.

Checklist setelah deployment staging:

- [ ] Android portrait 320×568, 360×640, 390×844 dan 430×932; dua/empat/enam kapsul, safe area, keyboard input dan scroll internal popup.
- [ ] Tidak ada tab bawah atau strip properti; tombol utama dan Properti Saya mudah dijangkau; semua menu dapat ditutup dengan Back/Escape.
- [ ] Coba VS Bot 2/3/4 peserta, seluruh model, offline setelah cache pertama, fast/reduced motion dan kembali dari background.
- [ ] Lempar normal/kembar/penjara/utility: hasil tidak bocor sebelum reveal, pion mulai setelah reveal, tidak ada roll ganda.
- [ ] Beli/lelang/build/stok/gadai/tebus/jual, rumah/hotel di empat sisi, beberapa pion satu petak, zoom/camera.
- [ ] Barter dan counteroffer kedua arah dengan uang/properti/kartu; input nominal salah; peserta observer tidak mendapat tombol pihak lain.
- [ ] Rent/pajak/GO/kartu/utang: saldo dan riwayat tepat, efek tidak duplikat setelah popup, heartbeat, reconnect atau restore.
- [ ] Kartu Kesempatan/Dana Umum di perangkat berbeda; satu efek sah; popup masuk/keluar penjara sekali dan keputusan giliran tetap tersedia.
- [ ] Supabase 2/4/6 manusia serta campuran bot: Auth/room/Ready/start, host offline, worker retry/lease, vote manusia saja, 90 detik auto-pause, seluruh manusia siap untuk resume.
- [ ] Semua client offline semalam, rejoin dengan akun yang sama, state/assets/debt/auction/trade tetap; snapshot lama tidak menimpa versi baru.
- [ ] Browser reload/PWA upgrade tidak menampilkan UI lama atau menghapus save; cross-device guest dipahami berbeda dari akun permanen.
- [ ] Semantic TypeScript, Vercel deploy function bundling dan logs, RLS/Realtime/worker staging serta Groq provider aktual diverifikasi sebelum klaim production-ready.
