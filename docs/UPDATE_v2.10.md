# Monopoli Nusantara v2.10 — Gameplay ringkas, lelang persisten, dan Nusa

Basis source v2.9 dipertahankan. Implementasi ada di folder v2.10, tanpa commit/reset/push/deployment. Metadata Git workspace tidak valid; perubahan dibandingkan terhadap berkas v2.9.

## Audit dan keputusan utama

- Feedback v2.9 masih menyajikan transaksi biasa sebagai notifikasi sementara, walaupun HUD/Riwayat sudah menjelaskannya. Permintaan terbaru mengganti kebijakan ini: kejadian rutin tetap di Riwayat dan visual papan; feedback yang memerlukan tindakan berada inline.
- Popup otomatis bergantung pada status `busy`; saat bid dikirim ia dapat hilang, walaupun identitas lelang sudah stabil. Ketika lelang berakhir, fase berubah dan dialog tertutup tanpa tahap hasil.
- Hasil lelang sebelumnya hanya teks pembelian/bangunan di log. UI tidak boleh menebak pemenang dari perubahan saldo. Ditambahkan metadata hasil pada titik settlement sah dalam engine.
- Kapsul mobile memakai deretan horizontal dengan ukuran besar. Diubah menjadi grid kecil adaptif, bukan memperkecil seluruh UI.
- Efek dadu menampilkan pola sementara 2/5 dan timing visual/gerak memakai konstanta terpisah. Kini memakai hasil aktual dan timing bersama.
- Ekonomi C1009 memakai integer yang umumnya sepuluh kali angka yang diinginkan untuk Nusa. Namun barter v2 mengizinkan satu unit dan bunga hipotek dapat menghasilkan pecahan Nusa. Membagi semua angka save lalu membulatkan tidak aman.

## Feedback dan popup

**Tidak lagi menjadi toast:** pergantian giliran, tiba/berjalan di kota, hasil dadu, pembelian, bangun, sewa/pajak/bonus START, uang diterima, dan barter sukses. Semua tetap tercatat pada Riwayat; saldo/kepemilikan langsung mengikuti state.

**Dipertahankan sebagai feedback inline:** kesalahan tindakan/transaksi, koneksi terputus dengan akses mencoba lagi, penolakan/pembatalan barter, dan pesan fungsi seperti simpan/cadangan. Satu pesan diprioritaskan pada sisi metadata dock mobile; desktop memakai baris status di atas papan. Area ini tidak fixed di atas papan, tidak memakai backdrop/focus trap, dan tidak memperbesar baris HUD. Pesan panjang dapat diketuk untuk detail atau Riwayat. Dialog aktif juga memiliki baris kesalahan/koneksi agar pesan tidak tersembunyi di belakangnya.

Toast kecil di luar pertandingan hanya dipakai untuk kesalahan/fungsi home/lobby seperti salin tautan. Kartu, penjara, utang, barter masuk, bangunan langka, kebangkrutan dan kemenangan tetap memakai keputusan/event yang relevan. Serah perangkat tetap opt-in; berbeda dari notifikasi giliran biasa.

Selector daftar panjang memakai header/tindakan tetap, dengan area daftar yang menggulir. Tema dan komponen v2.9 tetap digunakan.

## Lelang persisten dan hasil otoritatif

1. Lelang baru mendapat ID stabil. Bid, pass, pergantian scheduler bot, dan status sibuk memperbarui isi modul yang sama. ID/view/focus boundary tidak dibuat dari versi state atau penawar saat ini.
2. Panel memperlihatkan objek lelang, nominal tertinggi, penawar tertinggi, status peserta, input Nusa dan aksi sah. Pemain room tetap hanya mengendalikan kursinya; observer juga melihat lelang. Disconnected menonaktifkan transaksi tanpa menutup modul lelang.
3. Settlement engine menulis event `auctionResult` berisi auctionId, jenis, properti/lokasi bangunan, winner atau null, harga integer akhir dan peserta. Metadata tidak mengeksekusi transaksi tambahan. Berlaku untuk properti, stok bangunan, rangkaian lelang bank dan save legacy v1.
4. Presenter memproyeksikan hasil dari snapshot baru pada render yang sama dengan berakhirnya lelang. Konten live berubah menjadi hasil pada boundary modal yang sama, tanpa frame kosong. Hasil menyebut pemenang/properti/harga, atau tanpa pemenang. Ditutup setelah 2,2 detik (cepat 1,4 detik), atau Lanjut. Durasi ini hanya presentasi, bukan timer/batas lelang.
5. Timer hasil berjalan saat hasil terlihat. Hasil yang menunggu navigasi Aset tetap tersedia; rangkaian lelang dapat mengantrekan hasil tanpa menahan bot. Navigasi pendanaan atau menutup sementara atas tindakan pengguna tetap dimungkinkan; lelang yang belum selesai dapat dibuka kembali dari dock/detail.
6. Public snapshot membawa metadata hasil yang sama kepada seluruh client. Merge/version/revision guard existing menolak respons terlambat; action ID dan expectedVersion existing menjaga transaksi. Tidak mengganti API, Redis/D1, polling atau sistem room.
7. Reconnect/restore mengambil baseline: lelang aktif dibuka dari state terbaru, hasil historis tidak dianimasikan ulang. Hasil tetap ada di Riwayat. Metadata hasil baru divalidasi saat impor save.

Frontend dan backend perlu dideploy bersama dari source ini agar semua room menghasilkan metadata hasil baru. Server build lama tidak dapat menciptakan metadata tersebut.

## HUD dan dadu

- Dua pemain memakai dua kolom, tiga memakai tiga kolom, empat memakai dua kolom, lima/enam memakai tiga kolom dalam dua baris. Landscape sempit memakai dua kolom. Target tiap kapsul sekitar 44 px; warna, nomor, nama, saldo dan penanda aktif tetap ada. Penjara/bot/keluar tetap terlihat atau dijelaskan lewat label aksesibilitas; tombol membuka aset seperti sebelumnya. Nama/saldo sangat panjang memiliki ellipsis dengan nilai lengkap pada label aksesibilitas/detail aset.
- Papan tidak digeser horizontal oleh daftar pemain. Geometri 40 petak, gestur, pan/zoom dan posisi token tidak diubah.
- Dadu memakai rotasi/pantulan CSS dengan transform, perspective dan bayangan ringan. Tidak memakai gambar baru, RNG visual atau physics engine. Titik dadu selalu berasal dari `dice` sah.
- Timing bersama: normal roll 700 ms + hasil 340 ms; cepat 300 + 180 ms; reduced 80 + 80 ms. Board menunggu rolling selesai dan hasil terlihat, kemudian memulai pion. Kasus tanpa lintasan juga menunggu hasil sebelum keputusan muncul. Lock aksi, ID dan expectedVersion tetap mencegah double roll. Respons room yang lambat tidak membuat angka visual baru; reconnect tidak memutar roll lama.
- Kelancaran visual/gerakan pada perangkat nyata belum diukur atau diverifikasi browser.

## Mata uang Nusa: penerapan aman

**Diterapkan sebagai denominasi fixed-point, bukan migrasi saldo:** 1 Nusa = 10 unit integer yang sudah disimpan mesin. `15000` tetap disimpan sebagai `15000`, tetapi ditampilkan `N 1.500`; penawaran `N 80` dikirim sebagai integer `800`.

- Formatter bersama melayani HUD, papan, sertifikat, harga/sewa/bangunan, barter, hipotek, pajak, kartu, hasil lelang, statistik dan log baru. Teks Rp dalam log/kartu dari save lama diterjemahkan saat ditampilkan, tanpa menulis ulang save lama.
- MoneyInput mengubah teks Nusa ke integer di batas input. Ketelitian 0,1 N melestarikan barter satu unit dan bunga hipotek lama. Lebih dari satu desimal, nonfinite dan nilai tidak aman ditolak; tidak ada pembulatan ekonomi tersembunyi. Field tidak memakai pemisah ribuan; tampilan harga memakai format Indonesia.
- Seluruh harga/rent/build/mortgage/tax dan efek numerik 32 kartu identik dengan v2.9, dibuktikan terhadap fixture baseline. Threshold dan strategi bot tidak dikonversi/diganti.
- Schema/rulepack dan nilai numerik save v1/v2 tetap. Impor/ekspor tidak membagi saldo. Payload multiplayer juga tetap integer lama. Tidak ada kebutuhan migrasi data atau konfirmasi konversi yang merusak pertandingan aktif.
- Migrasi fisik seluruh data menjadi integer Nusa tidak dilakukan karena akan memerlukan pembulatan/pecahan dan kontrak data baru. Ketelitian fixed-point memberi identitas Nusa sambil mempertahankan setiap hasil ekonomi.

## Berkas utama

| Berkas | Perubahan |
| --- | --- |
| `Game.tsx`, `InlineFeedback.tsx`, `MobileDock.tsx`, `quick-notice.mjs` | Prioritas popup dan feedback inline; filter kejadian rutin. |
| `AuctionPanel.tsx`, `useAuctionPresentation.ts`, `auction-presentation.mjs`, `RuleActions.tsx` | Sesi lelang, hasil, peserta dan kontrol sah. |
| `game.mjs`, `game-v1.mjs`, `save-format.mjs` | ID/hasil lelang otoritatif dan validasi metadata; perhitungan tetap. |
| `PlayerCapsules.tsx` | HUD adaptif 2–6 pemain. |
| `DiceRollFx.tsx`, `Board.tsx`, `dice-timing.mjs` | Presentasi hasil asli dan timing gerak bersama. |
| `currency.mjs`, `MoneyInput.tsx`, `content.mjs`, `TradeWizard.tsx`, `compact-ui.mjs`, `HistoryPanel.tsx`, `RulesPanel.tsx` | Denominasi/input Nusa dan kompatibilitas teks lama. |
| `BoardMap.tsx` | Teks bonus START menjadi Nusa; tidak mengubah geometri. |
| `app/globals.css` | Status inline, panel lelang, kapsul, selector dan efek dadu. |
| `tests/gameplay-v210.test.mjs`, `tests/fixtures/economy-v29.json` | Regresi baru dan baseline seluruh nilai ekonomi/kartu. |
| Tes source terdampak, package/cache, README/petunjuk/snapshot | Ekspektasi kebijakan baru dan metadata v2.10. |

Penyimpanan, klien/server room, API, bot policy, rules angka, harga, aset gambar, dependency dan lockfile dipertahankan. File engine berubah pada presentasi teks dan metadata settlement, bukan formula atau aturan transaksi.

## Pengujian yang benar-benar dijalankan

- **133 tes lulus, 0 gagal** pada sebelas berkas aturan, classic, storage, save, room-client, source UI, pawn-flow, barter, v2.8/v2.9 dan v2.10. Termasuk 19 tes baru untuk Nusa, auction lifecycle/results, baseline reconnect, legacy, bank/building auctions, snapshot/dedupe, HUD dan dadu.
- **7 tes geometri/gesture kamera lulus**, tanpa render React.
- **Perbandingan empat pertandingan penuh terhadap engine v2.9:** 2 pemain digital 566 transisi; 2 pemain classic 598; 6 pemain digital 587; 6 pemain classic 647. Total 2.398 transisi dengan action bot, saldo, properti/bangunan, dadu, fase, putaran dan pemenang yang sama. Kedua engine memakai seed identik. Perbedaan metadata/log diabaikan dalam proyeksi ekonomi.
- Syntax check Node lulus untuk modul ekonomi/presentasi/currency/timing/save, hook TS lewat Node, dan service worker. Ini bukan kompilasi TSX atau typecheck.
- Percobaan suite awal mendapati tujuh ekspektasi lama yang masih mewajibkan toast transaksi/giliran, teks Rp dan struktur dadu lama. Ekspektasi diperbarui sesuai permintaan baru; suite akhir lulus. Tes aturan numerik tetap lulus.

Reproduksi suite tanpa dependency UI:

```sh
node --experimental-strip-types --test --test-isolation=none \
 tests/game.test.mjs tests/classic.test.mjs tests/storage.test.mjs \
 tests/save-format.test.mjs tests/room-client.test.mjs tests/ui-refinement.test.mjs \
 tests/pawn-flow.test.mjs tests/asset-trade-v26.test.mjs tests/gameplay-flow-v28.test.mjs \
 tests/compact-ui-v29.test.mjs tests/gameplay-v210.test.mjs
```

### Keterbatasan

TypeScript/TSX, lint, Next/Vinext build, render DOM/Chromium/Android, dan room/backend multiplayer live belum diverifikasi. TypeScript/Next tidak tersedia; instalasi yang sebelumnya terhambat EPERM tidak diulang. Tes identity/projection/markup bukan pembuktian DOM tidak remount. Tes layout memeriksa konfigurasi CSS/grid, bukan screenshot atau kenyamanan terukur. Tidak ada klaim siap produksi.

## Checklist manual setelah deployment

1. Pastikan giliran, roll, tiba di kota, beli, sewa, bonus START dan barter sukses tidak memunculkan toast gameplay. Kesalahan, penolakan barter dan koneksi tampil satu baris di HUD; ketuk untuk detail/coba lagi.
2. Lelang manusia/bot/room: popup tidak berkedip saat mengirim bid/pass atau berubah penawar; input dan fokus stabil, highest dan peserta diperbarui. Akses Aset lalu kembali; kewajiban lelang tetap ada.
3. Final lelang: pemenang, properti dan harga benar, hasil terlihat singkat sebelum lanjut. Uji tanpa penawaran, stok rumah/hotel dan beberapa aset bank berurutan. Ulangi ketukan; saldo/ownership hanya berubah sekali.
4. Dua perangkat: penawaran bersamaan, respons terlambat, spectator/keluar, putus koneksi selama lelang, reconnect aktif dan reconnect setelah selesai. Hasil sama pada semua client yang tersinkron, sejarah tersedia tanpa replay lama.
5. HUD 2–6 pemain pada 320/360/390/430 px dan landscape, nama/saldo panjang: tidak ada page overflow horizontal; warna/nomor/aktif/penjara/keluar jelas; papan tetap dominan.
6. Dadu normal/cepat/reduced, kembar/extra, gagal/bebas penjara, tiga kembar, bot, latency room dan reconnect. Pastikan hasil aktual berhenti terbaca, lalu pion bergerak, baru keputusan; double tap tidak double roll.
7. Nusa: modal N 1.500, START N 200, denda N 50, input lelang N 80, barter 0,1 N, bunga pecahan, kartu/perbaikan, pajak/hipotek dan statistik. Uji keyboard desimal Android, nilai kosong/tidak valid dan tanpa pemisah ribuan.
8. Impor/restore save v1/v2 dan room lama: saldo integer/data tidak berubah, teks tampil Nusa, aturan versi asal tetap. Ekspor/impor dan slot tetap berfungsi.
9. Selector panjang: hanya daftar menggulir, header/tindakan terlihat; Back dan draf v2.9 tetap. Jalankan tsc, npm test penuh dan build target hosting ketika dependency tersedia.
