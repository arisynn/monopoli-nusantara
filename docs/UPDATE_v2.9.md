# Monopoli Nusantara v2.9 — Compact UI dan notifikasi proporsional

Basis: source v2.8 yang telah dikerjakan pada sesi sebelumnya. Folder v2.8 dan arsipnya dipertahankan; implementasi ada di `Monopoli_Nusantara_v2.9`. Metadata Git workspace tidak valid sehingga perbandingan memakai berkas source, tanpa commit/reset/push/deployment.

## Prioritas susulan: toast terlalu tinggi

Penyebab yang ditemukan pada stylesheet v2.8: aturan mobile `.is-playing .toast` menetapkan `bottom:calc(170px + safe-area)` dengan specificity lebih tinggi daripada `.gameplay-toast { bottom:auto }`. Sementara itu `.gameplay-toast` menetapkan `top`. Kombinasi dua inset vertikal dengan tinggi otomatis dapat meregangkan kotak toast, yang kemudian dibatasi hingga 30dvh. Pesan pendek bisa tampak seperti panel tinggi.

Perbaikan:

- Constraint mobile lama dihapus. `GameNotice.tsx` menjadi komponen bersama untuk toast informasi, kesalahan dan status koneksi, dengan kelas khusus `game-notice` yang tidak mewarisi gaya modal/dock/toast lama.
- Ukuran mengikuti isi: `width:max-content`, maksimum viewport dikurangi 16 px, `height:auto`, tinggi 44–56 px, `bottom:auto` secara eksplisit, flex satu baris tanpa pertumbuhan. Ikon 16 px; pesan singkat tetap satu baris, pesan lebih panjang dibatasi dua baris.
- Posisi dekat tepi atas, di bawah header/safe area, sehingga terutama memakai area HUD. Wrapper tidak menangkap pointer; hanya tombol Detail/Riwayat/Coba/Tutup yang interaktif.
- Giliran biasa tetap notifikasi tanpa dialog, tanpa focus trap, tanpa action lock. Durasi giliran 2 detik, transaksi 3,2 detik (mode cepat maksimal 2,4 detik). Update giliran digabung agar tidak menumpuk nama lama. Ringkasan transaksi besar memiliki akses Riwayat; isi log asli tidak diubah. Kesalahan panjang dapat dibuka dalam dialog Detail terpisah; toast tetap kecil.
- Prompt Serah Perangkat adalah fitur opt-in yang memang meminta kesiapan pemain. Prompt tersebut kini kartu ringkas di area kontrol, tanpa pion besar atau scrim gelap yang menutupi papan. Pengaturan dan kebutuhan tombol Aku siap tetap tersedia. Ini berbeda dari notifikasi giliran biasa.

Ukuran tersebut merupakan aturan implementasi CSS, belum pengukuran screenshot/browser. Uji Android nyata masih diperlukan.

## Audit global dan hasil implementasi

| Permukaan | Temuan v2.8 | Penyempurnaan v2.9 |
| --- | --- | --- |
| Home | Identitas besar diulang setelah brand header; jarak antarmode lebar. | Judul tugas singkat, tiga mode asli langsung terlihat, resume dan status autosave tetap ada, spacing dipadatkan. |
| Setup lokal/bot | Padding dan keterangan berulang, CTA di bawah konten; bot disebut berulang. | Baris nama ringkas, kontrol jumlah pemain tetap nyaman, keterangan singkat, CTA sticky mengikuti viewport. Pilihan bot/difficulty dan kedua mode sewa tetap. |
| Buat/gabung room | Form membuat room dan gabung kode berurutan dalam satu layar. | Segmen Buat/Gabung menampilkan formulir yang relevan. Tautan room langsung membuka Gabung; Enter pada kode mengirim form sah. Draf nama/kode/aturan tetap di state. |
| Lobby | Judul/kode/penjelasan panjang mendahului kursi dan tindakan. | Kode salin, jumlah/status pemain dan kursi ringkas; informasi koneksi di details; tindakan siap/mulai dekat area interaksi. |
| Gameplay | HUD/dock/tab mengambil tinggi yang dapat dirapikan. | Tinggi/padding dikurangi per komponen, target tombol tetap sekitar 44–48 px. Papan/kamera/perjalanan tidak diubah. |
| Aset | Statistik kekayaan/stok mendahului daftar; setiap baris memuat saldo berulang. | Daftar/filter diprioritaskan, statistik tersedia lewat details, baris status/biaya ringkas. Utang menampilkan jual/gadai langsung bila sah; gadai tetap dikonfirmasi. Saldo hasil aksi tetap ada pada pengelolaan lengkap. |
| Barter/counter | Empat langkah wajib; daftar properti dan input berbagi scroll; tombol Lanjut berulang. | Satu composer dua sisi: lawan, properti, uang dan kartu. Daftar properti dibuka melalui selector sementara; counter mengunci lawan. Ringkasan dapat dibuka, biaya hipotek tetap terlihat jika ada. |
| Selector | Empat puluh petak harus ditelusuri melalui daftar panjang. | `SelectionView`: cari nama/status, pilih banyak, indikator aktif, filter pilihan dan Selesai sticky. Dipakai untuk properti barter, pindah aset dan browser seluruh petak. Tidak membuat modal di atas modal. |
| Riwayat | Metadata dan paragraf membuat baris tinggi. | Search/filter sejajar, baris transaksi ringkas dua baris; ketuk untuk membaca teks lengkap. Jenis, nomor dan putaran asli dipertahankan. Tidak menambah timestamp palsu. |
| Simpanan | Pembuka dekoratif, intro panjang dan slot seperti kartu besar. | Judul langsung, slot/list row ringkas; konfirmasi timpa/hapus, lima slot, arsip, JSON dan preview impor tetap tersedia. |
| Settings | Deskripsi dan tombol kembali berulang. | Kontrol ringkas, bantuan kamera dibuka saat perlu, autosave dinyatakan jelas, satu navigasi kembali di header dialog. |
| Panduan | Semua topik sekaligus dalam daftar panjang. | Pemilih tujuh topik langsung membuka isi relevan; acuan edisi tetap tersedia. |
| Popup gameplay | Padding/heading/sertifikat dan teks lelang dapat terlalu tinggi. | Dialog sesuai isi dengan batas viewport, header Kembali sticky, kartu/sertifikat/utang/hasil diringkas; penjelasan lelang/hipotek dibuka saat perlu. Kemenangan tetap memiliki ringkasan nyata. |

Tidak semua kontrol dijadikan popup: pilihan kecil seperti pemain, topik, jumlah kartu dan aturan menggunakan kontrol langsung/native. Selector banyak properti menggantikan view pada satu modal bersama, bukan menambah lapisan dialog. Pilihan disimpan ke draf saat ditoggle; Back, Escape, scrim dan Selesai kembali ke composer dengan pilihan tersimpan.

## Navigasi dan keamanan transaksi

- Tombol Kembali terlihat pada modal. Selector kembali ke asalnya, sertifikat dari browser petak dapat kembali ke daftar, dan pengelolaan dapat memilih aset berikutnya di tempat yang sama.
- `useLayerBack` dan `layer-navigation.mjs` menambahkan satu entri history sementara pada URL yang sama ketika lapisan UI aktif. Android/browser Back menutup view teratas terlebih dahulu; penutupan lewat tombol/otomatis membersihkan entri tersebut. Tidak menyimpan token, draf, transaksi atau state pertandingan dalam history. Forward tidak dimaksudkan memulihkan view sementara yang sudah ditutup.
- Draf barter tetap per pertandingan/pemain/tawaran. Mengganti lawan mengosongkan sisi yang diminta saja. Pilihan kedaluwarsa tetap dapat dihapus; validasi kepemilikan, bangunan kelompok, uang, kartu, pihak aktif dan duplikasi diperiksa lagi sebelum kirim. Engine/API tetap memvalidasi transaksi akhir. Kunci submit ganda tetap ada.
- Sistem keputusan v2.8, prioritas popup, baseline restore/reconnect, kewajiban utang dan penguncian animasi tetap dipakai. Notifikasi ringkas tidak mengeksekusi command.

Perbaikan jumlah langkah yang dapat dilihat dari struktur kode: rangkaian empat halaman/baris tombol Lanjut barter diganti satu composer; berganti aset tidak mengharuskan kembali ke tab lalu membuka detail lagi; panduan langsung memilih topik. Ini bukan klaim peningkatan waktu/performa terukur.

## Komponen utama

- Baru: `GameNotice.tsx`, `SelectionView.tsx`, `RulesPanel.tsx`, `useLayerBack.ts`, `lib/quick-notice.mjs`, `lib/compact-ui.mjs`, `lib/layer-navigation.mjs`, `tests/compact-ui-v29.test.mjs`.
- Diubah: `Game.tsx`, `AssetManager.tsx`, `AssetActions.tsx`, `TradeWizard.tsx`, `TradeReview.tsx`, `HistoryPanel.tsx`, `SavePanel.tsx`, `RuleActions.tsx`, `useGameplayPresentation.ts`, `app/globals.css`.
- Metadata: cache service worker v29, package 2.9.0, script tes, ekspektasi source UI, README, petunjuk awal dan snapshot source.

Dipertahankan identik dengan v2.8: engine v1/v2, isi kartu/sertifikat, metadata lintasan, geometri/artwork papan, komponen Board/DiceRollFx/MobileDock, matematika kamera, helper keputusan, storage/format save, klien room, API/backend, bot dan lockfile. Dependency/devDependency dan aset gambar tidak ditambah. Hook presentasi hanya diubah pada ringkasan/durasi/antrean notifikasi.

## Verifikasi

- **114 tes lulus, 0 gagal**, pada sepuluh berkas aturan, klasik, storage/save, klien room, source UI, lintasan, v2.8 dan compact v2.9. Termasuk 14 tes baru selector/draf, transaksi/counter/hipotek/kartu, Back/history sementara, notifikasi giliran, ringkasan transaksi dan pencegahan regresi CSS top/bottom.
- **7 tes matematika kamera/gesture lulus**: 40 petak, pan/zoom/follow, resize dan pointer gestures.
- Pemeriksaan sintaks Node lulus untuk helper compact, history controller, quick notice, hook navigasi/presentasi TypeScript melalui Node dan service worker. Ini bukan kompilasi TSX/typecheck.
- Pengecekan identitas berkas fondasi dan dependency/lockfile dilakukan terhadap v2.8. Integritas ZIP diperiksa saat pengemasan.

Perintah tes yang dijalankan:

```sh
node --experimental-strip-types --test --test-isolation=none \
 tests/game.test.mjs tests/classic.test.mjs tests/storage.test.mjs \
 tests/save-format.test.mjs tests/room-client.test.mjs tests/ui-refinement.test.mjs \
 tests/pawn-flow.test.mjs tests/asset-trade-v26.test.mjs \
 tests/gameplay-flow-v28.test.mjs tests/compact-ui-v29.test.mjs
node --test --test-isolation=none \
 --test-name-pattern='40 classic tiles|pan clamps|zoom keeps|follow keeps|resizing preserves|tap selects|pinch zooms' \
 tests/board-2d.test.mjs
```

### Belum terverifikasi

TypeScript/TSX, lint, build Next/Vinext, render React/DOM, screenshot, Android/Chromium nyata, multiplayer/backend live belum dijalankan: dependency proyek/kompiler tidak tersedia. Instalasi sebelumnya terhambat EPERM; sesuai instruksi tidak diulang. Tes CSS adalah pemeriksaan aturan source dan bukan bukti ukuran hasil render. Tes Back menggunakan history tiruan, bukan browser Android. Tidak ada klaim siap produksi atau performa/UX terukur.

Risiko yang masih perlu diuji adalah cascade/responsivitas nyata, fokus/scroll setelah pergantian selector, riwayat browser ketika menutup beberapa view cepat, virtual keyboard/safe area, serta perubahan state room ketika draf/selector sedang terbuka.

## Checklist manual setelah deployment

1. **Notifikasi dahulu:** HP 320/360/390/430 px, Giliran Raka dan pesan satu baris harus berupa toast kecil; tidak memanjang vertikal, tidak menjadi dialog, hilang singkat, dan aksi dadu tetap tersedia. Uji pesan transaksi panjang, error Detail/Tutup, koneksi Coba, serta mode cepat/reduced motion.
2. **Serah Perangkat:** opsi mati tidak menghentikan giliran dengan popup. Opsi aktif menampilkan prompt ringkas dengan Aku siap, tanpa menutup papan dengan panel tinggi.
3. Home/setup/lobby: nama panjang, 2–6 pemain, kedua bot difficulty, kedua mode sewa, Create/Join, kode via tautan/Enter, siap/mulai. Form tidak meluber ketika keyboard terbuka; nama/kode tetap saat kembali dari panduan.
4. Selector: cari properti/status, pilih beberapa, filter Dipilih, Selesai, Escape, scrim dan Android Back. Pilihan tersimpan; hanya satu modal aktif; footer terjangkau. Pilih aset lain dan sertifikat dari daftar 40 petak lalu kembali.
5. Barter: uang Rp1, kartu, multi-properti, hipotek, counter lawan terkunci, ganti lawan, draf lintas tab, pilihan yang berubah pemilik/bangunan, klik Kirim berulang. Ringkasan seluruh properti dan biaya tetap bisa dibaca.
6. Aset: filter, bangun merata/hotel, stok langka, gadai/konfirmasi, jual saat utang, saldo/cadangan lelang. Semua keputusan aktif tetap dapat dilanjutkan.
7. Riwayat: filter/search, perluas teks, nama/nominal/urutan jelas. Save: lima slot, timpa/hapus/batal, arsip, ekspor/impor/save v1/v2. Settings dan semua topik panduan dapat dibuka/kembali.
8. Gameplay v2.8: urutan dadu–pion–kejadian, kartu perpindahan, START/kembar/penjara, dua mode sewa, lelang, utang/bangkrut/menang. Papan, zoom, kamera dan pion tetap berfungsi.
9. Dua browser: putus/sambung, tab tersembunyi, tawaran saat selector terbuka, aksi serentak, restore/reload keputusan. Jalankan tsc, npm test penuh dan build sesuai target hosting ketika dependency tersedia.
