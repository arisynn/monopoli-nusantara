# Monopoli Nusantara v2.8 — Smart Gameplay Flow

Source diperbarui langsung dari `1-Monopoli_Nusantara_v2.7.zip`. Tidak ada commit, reset, push, atau deployment. Folder ZIP tidak membawa repository Git; `git status` di workspace juga tidak dapat membaca metadata Git yang valid. Perubahan dibandingkan terhadap byte source ZIP, bukan riwayat Git.

## Audit singkat dan keputusan arsitektur

- `lib/game.mjs`: command engine otoritatif, context/queue untuk kewajiban, validasi ekonomi, action ID + expectedVersion, bot, dan publicState sudah memadai. Queue ekonomi tersebut tetap terpisah dari UI.
- `Game.tsx`: state React, command lokal/API room, autosave, polling/revision guard, kunci klik, navigasi sheet, dan pemilihan kursi dipakai kembali. Sebelumnya keputusan perlu dibuka lewat detail giliran dan feedback transaksi tersebar.
- `Board.tsx`, `pawn-animation.mjs`: lintasan asli dan animasi SVG dipertahankan. Timer gerak sebelumnya memakai perkiraan durasi dadu; lastMove juga kehilangan lintasan menuju petak Masuk Penjara.
- `RuleActions.tsx`: lempar awal, minat stok bangunan, aset tergadai, kontrol lelang, dan klaim sewa manual digunakan tanpa mengganti aturan.
- `AssetManager`, `AssetActions`, `TradeWizard`, `TradeReview`, `HistoryPanel`, `SavePanel`, focus hook, format save, dan room client digunakan kembali. Tidak membuat sistem barter/aset/multiplayer baru.

## Implementasi

1. **Satu pemilih popup.** `gameplay-presentation.mjs` menghitung identitas keputusan dari state sah, bukan render/version umum. Urutan presentasi: serah perangkat → navigasi aktif → keputusan berwenang → event informasional. Satu boundary modal dipakai untuk keputusan, event, dan navigasi. Background game menjadi inert ketika modal aktif; dialog panel HP tidak diberi aria-modal bersamaan dengan popup.
2. **Keputusan dapat diminimalkan.** Membeli/lelang, kartu, barter/counter, utang, penjara, bangunan langka, penerimaan hipotek, dan kemenangan muncul otomatis bagi pemain yang relevan setelah animasi selesai. Menutup popup hanya menyimpan identitas presentasi yang diminimalkan. Kewajiban tetap di mesin dan dapat dibuka dari dock, detail giliran, atau tombol dalam panel Aset/Barter/Riwayat. Navigasi yang sedang dipakai tidak diganti event baru.
3. **Event dan quick notification.** Hook menyimpan antrean presentasi kecil, dengan watermark match/event/version. Jail, release, bankruptcy memakai event singkat yang dapat ditutup dan menghilang otomatis; bot tidak menunggu antrean ini. Kartu memakai ACK sah mesin, dengan jenis/teks/dampak aktual. Kemenangan menampilkan pemenang, putaran, saldo, jumlah properti/peserta, serta kebangkrutan terakhir. Transaksi sederhana digabung per update state dalam satu toast, dengan tautan Riwayat. Toast menunggu gerak, popup, dan event; transaksi tidak dieksekusi oleh timer animasi.
4. **Restore/reconnect.** UI mengambil baseline pada restore, pergantian pertandingan, kembali dari menu, koneksi pulih, dan polling setelah tab tersembunyi. Keputusan aktif dihitung lagi; log dan animasi lama tidak diputar ulang. Identitas lelang tidak berubah hanya karena penawar/harga berubah; tawaran balik memperoleh identitas baru.
5. **Dadu → pion → kejadian.** Board menunggu rolling selesai, menampilkan hasil sebentar, kemudian menjalankan lintasan. Efek dadu disembunyikan sebelum perjalanan dimulai. Animasi hanya dijalankan untuk move ID baru yang disetujui presenter; mount terlambat dan restore tidak memulai riwayat gerak. Perjalanan panjang dibatasi 2,6 detik (cepat 1,3 detik). Reduced motion langsung memakai posisi sah.
6. **Masuk penjara.** Metadata `lastMove.approach` menyimpan perjalanan menuju petak 30, lalu pion dipindahkan langsung ke penjara. Tiga kali kembar/kartu penjara tidak memakai lintasan palsu dari langkah sebelumnya. Log menyebut alasan masuk dan kejadian bebas. Ini metadata presentasi; uang, posisi akhir, dadu kembar, bonus START, dan urutan giliran tetap dihitung mesin.
7. **Properti dan sewa.** Popup beli menampilkan harga, saldo, sisa/kekurangan kas, pilihan beli/lelang dan akses aset. Sewa otomatis tetap otomatis; log menyebut pembayar/penerima/nominal. Sewa manual tetap memerlukan Tagih dari pemilik, dengan fase dan batas kedaluwarsa lama. UI tidak mengonversi manual menjadi otomatis.
8. **Aset dan barter.** Bangunan menunjukkan tingkat rumah/hotel, biaya dan perkiraan saldo; validasi set warna, pemerataan, stok, hipotek dan kas cadangan lelang tetap di mesin. Konfirmasi gadai/jual set lama dipertahankan. Barter masuk menggunakan TradeReview lengkap; counter tetap memakai wizard dan draf. Log barter sukses kini menyimpan pihak, properti/status gadai, uang dan kartu untuk ringkasan besar melalui Riwayat. Penolakan menjadi toast. Tidak ada pemindahan aset tambahan di UI.
9. **Utang/lelang/bangkrut.** Utang menjelaskan penerima, saldo, kewajiban/kekurangan serta akses aset/barter. END tetap ditolak mesin. Tombol bangkrut hanya tersedia ketika nilai likuidasi memang kurang, dan command memvalidasi ulang. Lelang tetap terbuka, dengan penawaran/cadangan kas/kontrol peserta lama; pilihan kursi manusia tidak meloncat hanya karena penawar berikutnya bot.
10. Cache service worker dan package dinaikkan ke v2.8. Tidak ada dependency atau aset gambar baru. Beranda dan geometri papan tidak didesain ulang.

## Berkas perubahan

| Berkas | Peran |
| --- | --- |
| `lib/gameplay-presentation.mjs` (baru) | Identitas/otorisasi keputusan, watermark event, prioritas popup, dampak kartu dan kelayakan bangkrut. |
| `components/game/useGameplayPresentation.ts` (baru) | Antrean event/toast, baseline dan durasi presentasi. |
| `components/game/Game.tsx` | Integrasi popup tunggal, restore/reconnect, kontrol kontekstual, otorisasi, feedback dan ringkasan. |
| `components/game/Board.tsx`, `DiceRollFx.tsx`, `lib/pawn-animation.mjs` | Urutan animasi, gerak aktif, batas durasi, approach penjara. |
| `lib/game.mjs` | Metadata approach, log alasan masuk/bebas penjara dan ringkasan transaksi; aturan ekonomi tetap. |
| `components/game/MobileDock.tsx` | Status rolling/moving dan akses keputusan yang sesuai fase. |
| `components/game/AssetActions.tsx`, `AssetManager.tsx` | Tingkat bangunan dan saldo setelah aksi. |
| `app/globals.css` | Popup, kartu, toast, akses keputusan, ringkasan kemenangan, reduced motion. |
| `tests/gameplay-flow-v28.test.mjs` (baru) | 14 regresi presentasi dan integrasi mesin. |
| `tests/ui-refinement.test.mjs`, `tests/asset-trade-v26.test.mjs` | Ekspektasi efek dadu/shared modal/cache baru. |
| `public/sw.js`, `package.json`, `README.md`, `MULAI_DI_SINI.txt`, `SOURCE_SNAPSHOT.json`, dokumen ini | Metadata dan hasil verifikasi. |

Tetap dipertahankan: konten seluruh kartu/sertifikat, RuleActions, engine legacy v1, desain SVG papan, matematika kamera, API/backend Redis/D1, klien room, bot lokal/Groq, aturan sewa, queue ekonomi, penyimpanan/ekspor/impor, TradeWizard/TradeReview dan fitur aset lama. Lockfile dan isi dependencies/devDependencies tidak berubah.

## Pengujian yang dijalankan

- **100 tes lulus, 0 gagal** pada sembilan berkas aturan, klasik, storage, save, room client, pemeriksaan source UI, lintasan dan regresi v2.8. Termasuk simulasi 20 pertandingan bot 2–6 pemain dalam dua mode sewa, empat pertandingan untuk validasi save, semua 32 kartu, barter/counter/hipotek, debt/resume dan idempotensi transaksi.
- **7 tes kamera/gesture lulus**, tanpa render React: geometri 40 petak, pan, zoom, follow, resize, tap, pinch/cancel.
- `node --check` lulus untuk engine, helper presentasi, lintasan, hook TypeScript (strip syntax Node), dan service worker. Ini bukan typecheck TypeScript atau kompilasi TSX.
- Tes awal v2.8 menemukan identitas lelang ikut berubah karena actor penawaran. Implementasi diperbaiki; suite akhir lulus. Runner test default tidak menghasilkan eksekusi tes yang lengkap di lingkungan ini; menggunakan `--test-isolation=none` berhasil.

Perintah tes tanpa dependency UI:

```sh
node --experimental-strip-types --test --test-isolation=none \
 tests/game.test.mjs tests/classic.test.mjs tests/storage.test.mjs \
 tests/save-format.test.mjs tests/room-client.test.mjs \
 tests/ui-refinement.test.mjs tests/pawn-flow.test.mjs \
 tests/asset-trade-v26.test.mjs tests/gameplay-flow-v28.test.mjs
node --test --test-isolation=none \
 --test-name-pattern='40 classic tiles|pan clamps|zoom keeps|follow keeps|resizing preserves|tap selects|pinch zooms' \
 tests/board-2d.test.mjs
```

### Kendala dan batas verifikasi

Instalasi sebelumnya berhenti pada akses registry EPERM; permintaan jaringan lanjutan terinterupsi. Sesuai arahan pengguna, instalasi tidak diulang pada kelanjutan pekerjaan. TypeScript, React dan Next tidak tersedia di node_modules atau sebagai compiler global. Maka tsc, lint, build Next/Vinext, portrait/render React, tes DOM/browser dan multiplayer live **belum diverifikasi**. Tes helper prioritas/otorisasi bukan pengganti pengujian modal DOM. Paket ini tidak dinyatakan siap produksi.

Risiko tersisa ada pada integrasi TSX/browser, responsivitas/fokus/scroll, timing animasi nyata dan backend online live. Antrean visual sengaja tidak disimpan dalam save; keputusan sah disimpan oleh engine. Jika banyak update terlewat, UI mengikuti state room terbaru dan tidak mencoba memutar seluruh histori pergerakan. Save v1 tetap menggunakan aturan/metadata engine v1.

## Checklist manual setelah deployment

1. HP 320–430 px dan desktop, 2/6 pemain: popup muat, scroll/fokus/Escape, satu modal aktif, dock/tab tidak menutupi papan. Coba reduced motion dan animasi cepat.
2. Lempar awal, biasa/kembar/tiga kembar, lewat START, petak penjara dan kartu perpindahan: hasil dadu → lintasan → keputusan, tidak ada popup tujuan sebelum tiba atau gerak lama setelah restore.
3. Beli dengan cukup/kurang kas, lelang terbuka, pass lalu ikut lagi, aset untuk mendanai penawaran, rumah/hotel langka, pemerataan bangunan dan kas cadangan.
4. Dua mode sewa: otomatis tanpa konfirmasi; manual menunggu Tagih pemilik dan kedaluwarsa pada waktu yang benar. Uji klaim yang menyebabkan utang.
5. Utang: tutup popup, buka aset/barter, gadai/jual, kembali dan PAY; akhir giliran tetap terkunci. Bangkrut hanya jika nilai likuidasi kurang, lalu periksa settlement/pemenang.
6. Barter multi-properti/uang/kartu/aset tergadai, tolak, counter, persetujuan, draf setelah navigasi, dan ketukan berulang. Aset/saldo hanya berpindah sekali; ringkasan transaksi tersedia di Riwayat.
7. Bot: kartu/penjara/event informasional tidak menahan bot. Hotseat: serah perangkat tidak menumpuk dengan keputusan.
8. Dua browser/perangkat: tawaran/penawaran serentak, kursi yang tidak berwenang, jaringan putus/pulih, tab tersembunyi, reload saat buy/card/trade/debt/auction/mortgage; keputusan pulih tanpa replay log lama.
9. Autosave, slot/ekspor/impor save v1/v2, service worker v28 dan mode offline. Jalankan tsc, seluruh npm test dan build sesuai target hosting ketika dependency tersedia.
