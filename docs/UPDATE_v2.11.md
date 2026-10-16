# Monopoli Nusantara v2.11 — Board Visual & Pawn Identity

## Basis dan batas perubahan

Melanjutkan source v2.10 yang telah tersedia, dalam folder v2.11 agar versi sebelumnya tetap utuh. Workspace berupa hasil ekstraksi tanpa repository Git yang valid; perubahan diperiksa lewat perbandingan berkas dengan v2.10. Tidak melakukan commit, reset, push atau deployment. Pekerjaan dibatasi pada board, artwork kartu, identitas nominal, dan pemilihan/penyajian pion.

## Implementasi

### Identitas Nusa

Monogram N dengan kaki bergelombang menggambarkan kepulauan. `public/assets/nusa.svg` dan font subset `nusa-symbol.woff` memakai geometri yang sama. Font hanya memuat karakter N, dan hanya diterapkan pada span/tspan simbol mata uang melalui `NusaText`/`SvgNusaText`. Huruf N pada nama pemain/kota tetap font biasa. Nominal board, HUD, kartu, riwayat, sertifikat, lelang dan panel terkait memakai simbol ini. Select native, input numerik, label aksesibilitas, clipboard dan data teks tetap dapat memakai N sebagai fallback.

`money`, `nusaText`, parser nominal, unit engine dan data tersimpan tidak diubah. Saldo 15.000 unit tetap ditampilkan 1.500 Nusa; pecahan 0,1 N tetap akurat. Tidak ada migrasi saldo, pembulatan, perubahan harga, rulepack maupun schema save.

### Artwork board dan kartu baru

- Sepuluh aset SVG orisinal berbingkai enamel untuk Mulai, penjara, masuk penjara, parkir, stasiun, energi, air, pajak, Kesempatan dan Dana Umum. Navy, krem, hijau dan emas mengikuti board existing.
- Kota memakai potongan ilustrasi regional existing dengan clipping eksplisit; nama, pita kelompok, harga, bangunan dan kepemilikan tetap terpisah. Geometri dan koordinat 40 petak tidak diubah.
- **Aset kartu lama `card-atlas.webp` dihapus dari rilis ini**, sesuai instruksi susulan. Tidak dipakai ulang. Kompas bintang Kesempatan dan kampung/kemakmuran Dana Umum merupakan artwork baru; keduanya digunakan pada petak, dua deck di tengah papan dan popup.
- `EventCard` menyatukan identitas deck, judul, isi dan dampak. Ilustrasi kecil berada pada header; konten dan tombol ACK existing tetap. Tidak mengeksekusi efek kartu melalui komponen visual.
- Badge GADAI dipindahkan ke bagian bawah ilustrasi supaya lebih terpisah dari anchor pion. Aturan gadai dan perhitungannya tidak diubah.

### Enam pion gambar

Pinisi, Komodo, Becak, Cenderawasih, Angklung dan Rumah Gadang. Masing-masing memiliki berkas SVG tersendiri dan bentuk berbeda, bukan variasi warna. Viewport transparan dengan anchor optik yang dinormalisasi; gambar tetap tegak pada semua sisi papan. Warna kursi dan nomor pemain dipertahankan melalui pedestal/badge; ring menandai pemain aktif. Pion aktif dirender paling atas. HUD tetap menggunakan tinggi kapsul existing.

Pion tunggal semua kursi memakai pusat geometris petak. Cluster 2–6 pion dihitung dari penghuni petak yang belum bangkrut, dengan urutan ID stabil, susunan simetris dan ukuran sesuai jumlah. Offset diputar mengikuti orientasi petak. Rendering, tujuan kamera, snap akhir dan rute animasi memakai helper yang sama. Rute merekonstruksi cluster awal dari event perpindahan dan snapshot akhir, melewati waypoint tengah petak, kemudian berhenti pada slot penghuni tujuan. Ukuran visual mengikuti cluster awal sebelum membesar saat berjalan dan mengecil ke slot tujuan jika ramai. Nama kota dirapatkan ke pita warna agar cluster tidak menutupi teks dua baris. Cabang approach/jump penjara tetap mengikuti event sah engine. Saat snapshot lain tiba selama animasi, posisi visual yang sedang berjalan diterapkan kembali agar tidak tersentak ke tujuan.

### Pemilihan, save dan room

Ketuk gambar pion pada baris nama di setup untuk memilih dari grid enam opsi. Pemilihan langsung kembali ke setup dengan nama dan pilihan tersimpan. Pemilihan pion yang dipakai pemain lokal lain menukar identitas keduanya, sehingga tidak duplikat; keterangan pertukaran terlihat. Bot mendapat pion yang tersedia.

Di lobby, tombol Pilih pion memakai dialog existing yang sama. Pion peserta lain ditandai nama dan tidak dapat dipilih. Field opsional `pawn` diteruskan pada CREATE/JOIN dan READY existing; tidak ada endpoint atau protokol room pengganti. Server mengautentikasi kursi, melarang perubahan setelah START, mengecek eksklusivitas dan menyimpan dengan commit/revision guard existing. Jika pilihan awal JOIN sudah terpakai, server memberikan pion kosong; pilihan aktual terlihat di lobby dan dapat diganti.

Field `player.pawn` sudah ada pada versi lama; kini dihormati saat createGame dan diteruskan melalui publicState/save existing. Save lama dengan indeks normal tetap terbaca. Field yang tidak ada menggunakan fallback nomor kursi tanpa menulis ulang save. Nilai pion korup di luar katalog ditolak saat impor. Bukan perubahan aturan ekonomi atau schema data. Deploy frontend dan backend bersamaan agar opsi lobby tervalidasi pada server terbaru.

## Berkas utama

| Area | Berkas |
|---|---|
| Board, layering, animasi | `components/game/BoardMap.tsx`, `Board.tsx`; `lib/board-camera.mjs`, `pawn-layout.mjs`, `pawn-animation.mjs` |
| Katalog dan pemilihan pion | `lib/pawns.mjs`; `components/game/PawnPicker.tsx`, `AssetArt.tsx`, `Game.tsx`, `PlayerCapsules.tsx`, `RuleActions.tsx` |
| Penyimpanan dan room | `lib/game.mjs`, `lib/save-format.mjs`, `app/api/game/route.ts` |
| Simbol dan kartu | `components/game/NusaText.tsx`, `EventCard.tsx`; `public/assets/nusa.svg`, `nusa-symbol.woff`, `board/*.svg`, `tokens/*.svg` |
| Integrasi nominal visual | `HistoryPanel`, `MobileDock`, `AuctionPanel`, `AssetActions`, `AssetManager`, `TradeReview`, `TradeWizard`, `SelectionView`, `RulesPanel`, `InlineFeedback` |
| Styling dan cache | `app/globals.css`, `public/sw.js` (cache v211) |
| Generator, tes, dokumentasi | `scripts/create-board-assets.py`; `tests/board-visual-v211.test.mjs`, adaptasi tes aset/build existing; `docs/ASSET_PROMPTS.json`, README, petunjuk, snapshot |

Daftar perubahan dan hash lengkap tersedia pada `SOURCE_SNAPSHOT.json`. Tidak menambah dependency aplikasi. Generator artwork memakai Python/fontTools hanya ketika aset ingin dibuat ulang; aset hasilnya sudah disertakan. WOFF dipilih karena encoder WOFF2 tidak tersedia; tidak memasang encoder tambahan.

## Bagian lama yang dipertahankan

Aturan, harga, ekonomi, validasi aset/barter, kepemilikan, bot, giliran, lemparan dadu, kamera/pinch/pan/follow, riwayat, save slots/restore, rent auto/manual, popup keputusan, feedback HUD dan lelang persisten v2.10. Hosting Next/Redis dan Vinext/D1 serta autentikasi/optimistic concurrency tetap menggunakan jalur existing. Ilustrasi regional dan aset lama selain kartu tetap disertakan.

## Verifikasi yang benar-benar dijalankan

- **146 tes lulus, 0 gagal**: 12 berkas aturan, classic, storage, save, room-client, UI, pawn-flow, aset/barter, gameplay v2.8/v2.9/v2.10 serta board v2.11. Termasuk 13 tes baru: aset, pusat tunggal, cluster semua orientasi, urutan dan eliminasi, pertukaran lokal, pilihan lobby, save/publicState, endpoint rute dan kompatibilitas.
- **7 tes kamera/geometri lulus**: perimeter 40 petak, pan, pinch, zoom, resize, tap/drag dan follow. Kasus full React render dari suite board belum dijalankan karena dependency React/TypeScript tidak tersedia.
- Tes route memakai implementasi `app/api/game/route.ts` sebenarnya setelah stripping TypeScript oleh Node. Hosting adapter/Groq diganti stub, store memakai CAS in-memory. CREATE/JOIN, pilihan sama/invalid/unauthorized, dua pilihan bersamaan, READY tanpa field baru, START, GET reconnect dan larangan mengganti sesudah START lulus. Ini **bukan** tes Redis/D1 live atau dua perangkat.
- Babel parser yang tersedia di tooling lingkungan memeriksa **29 berkas TS/TSX**, termasuk route dan seluruh komponen game. Pemeriksaan sintaks modul `.mjs` yang berubah serta service worker lulus. Parser/transpiler bukan `tsc --noEmit`.
- Smoke evaluasi JSX standalone: 32 kartu, HUD enam pemain, dock pembelian/lelang/utang, aksi aset dan picker. Memakai runtime JSX kecil untuk evaluasi konten, bukan React DOM atau browser.
- 17 SVG lolos parsing XML; font WOFF memiliki satu glyph N. Aset vektor dan monogram diperiksa lewat render Inkscape. Renderer tersebut tidak mendukung WebP regional pada preview standalone, sehingga bukan verifikasi penuh board/browser.
- Tidak ada instalasi ulang dependency atau percobaan Chromium. TypeScript penuh, lint, build Next/Vinext, React DOM, mobile Android dan backend multiplayer live **belum terverifikasi**, karena dependency aplikasi tidak tersedia. Tidak mengklaim siap produksi.

Reproduksi tes tanpa dependency UI (Node 24):

```sh
node --experimental-strip-types --test --test-isolation=none \
 tests/game.test.mjs tests/classic.test.mjs tests/storage.test.mjs \
 tests/save-format.test.mjs tests/room-client.test.mjs tests/ui-refinement.test.mjs \
 tests/pawn-flow.test.mjs tests/asset-trade-v26.test.mjs tests/gameplay-flow-v28.test.mjs \
 tests/compact-ui-v29.test.mjs tests/gameplay-v210.test.mjs tests/board-visual-v211.test.mjs
```

## Checklist manual setelah deployment

1. HP portrait 320/360/390/430 px: papan tetap dominan, semua 40 petak dapat dipilih; nama/harga, pemilik, rumah/hotel dan badge GADAI terbaca. Periksa crop ilustrasi kota, keempat sudut dan zoom maksimum.
2. Pilih keenam pion lokal, termasuk pertukaran pilihan terpakai; kembali/Android Back tidak menghapus nama/pilihan. Uji 2 dan 6 pemain serta lawan bot.
3. Periksa satu pion setiap kursi tepat di tengah pada keempat sisi dan sudut. Kumpulkan 2–6 pion di satu petak; cek ring aktif, badge, jarak dan keterbacaan pada kamera dekat serta overview. Ukuran visual tetap perlu dinilai langsung pada HP.
4. Lempar normal/kembar, lewat START, mundur karena kartu, berpindah karena kartu, masuk/bebas penjara: gambar tidak melompat sebelum dadu selesai, endpoint rapi, keputusan muncul sesudah perjalanan. Uji cepat/reduced motion, pinch/pan dan resize saat berjalan.
5. Kesempatan dan Dana Umum: artwork baru sama pada petak, deck board dan popup; judul, isi, nominal, dampak serta ACK terbaca, tanpa artwork lama. Efek hanya sekali.
6. Simbol Nusa: nominal kecil/besar/pecahan pada board, HUD, kartu, riwayat dan detail properti; nonaktifkan pemuatan font untuk memeriksa fallback N. Nama berhuruf N tidak memakai glyph mata uang. Input/select native dan ekspor tetap teks aman.
7. Dua perangkat room: pilih pion bersamaan, cek penolakan duplikat, ubah pion sendiri, ready/START, reconnect lobby dan permainan. Semua client melihat identitas sama. Deploy API bersama frontend.
8. Restore save v1/v2, ekspor/impor dan slot: pion serta saldo tidak berubah; versi lama tanpa pawn menggunakan fallback. Refresh setelah update untuk memastikan service worker v211 dan artwork baru terpakai, lalu cek offline yang cache-nya sudah terisi.
9. Jalankan TypeScript penuh, lint, semua tes React/build target hosting saat dependency tersedia. Lanjutkan checklist regresi v2.10 untuk lelang persisten, feedback HUD, barter dan utang.
