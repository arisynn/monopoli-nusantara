# Pembaruan urutan animasi dan aksi online

**Status: FIXED LOCAL, regresi lulus. Belum dipush, dimerge, atau dideploy.**

Tanggal: 19 Oktober 2026 UTC. Branch `fix/qa-stability-and-modals`, basis commit `6b237b4c7bc1cd133d74b7585ba011e1d8ba261c`. Build lokal `6ceda48468a89463`, label basis 4.11.6. Node 24.19.0, Chromium 145/Playwright 1.58.2, Linux headless. Ini lanjutan [perbaikan modal dan QA sebelumnya](../follow-up/FIX_REPORT.md).

## Perilaku yang diterapkan

Urutan visual online menjadi **dadu terkonfirmasi → hasil dadu → pion berjalan → tiba di petak → transaksi/peristiwa → notifikasi dan keputusan berikutnya**.

- Tombol transaksi, lempar berikutnya, shortcut Space, dan pemanggilan command session menunggu antrean presentasi. Kartu hanya boleh ACK ketika kartu aktif sudah sampai pada urutan pengungkapannya.
- Animasi jalan pada aplikasi browser selesai melalui callback frame terakhir BoardView. Timer perkiraan tidak lagi mendahului renderer. Mode reduced motion tetap dihormati; tanpa renderer, pengujian headless masih memakai timer presentasi.
- Snapshot realtime baru tetap diterima sebagai state authoritative dan dimasukkan antrean, tanpa memotong gerakan yang sedang tampil. Duplikasi snapshot tidak menggandakan gerakan/transaksi.
- Saat antrean padat, jeda dekoratif yang belum dimulai boleh dipersingkat. Langkah tidak dihapus; durasi jalan dan langkah aktif dipertahankan.
- Menu yang menutup papan menjeda gerakan dan timer secara konsisten. Notifikasi/receipt yang sedang dibaca menahan langkah baru sampai modalnya hilang otomatis. Pelunasan utang dan pengelolaan aset tetap dapat dimulai dari panel yang sesuai setelah presentasi selesai.
- Modal notifikasi tetap tanpa tombol Tutup sesuai permintaan sebelumnya.

Ini pengurutan presentasi **per klien**, bukan perubahan aturan/timing giliran di server atau penundaan worker global. Server tetap memvalidasi command, versi, kepemilikan giliran, dan idempotency seperti sebelumnya. Pemain lain bisa menerima versi baru lebih cepat; klien ini menampilkannya secara berurutan.

## Penyebab yang diperbaiki

**QA-007 — Keputusan online melewati animasi pion**  
Severity: P2. Status: Confirmed pada kontrak source sebelumnya; FIXED LOCAL sesudah regresi.

1. Pada mode online, lakukan ROLL yang mendarat pada properti kosong atau kartu sehingga keputusan manusia langsung tersedia di snapshot server.
2. Implementasi lama `adaptOnlineTimeline()` memanggil `settleConfirmed()` saat `humanDecisionReady()` bernilai true, sehingga dadu/gerak dapat langsung dilewati. `act()` juga memakai `force:true` untuk mengosongkan antrean saat klik.
3. Tombol/popup online membaca state server terbaru, sementara board menampilkan state presentasi yang lebih lama. Akibatnya keputusan dapat mendahului jalannya pion. Timer online juga dapat menyelesaikan langkah sebelum frame akhir renderer; saat menu terbuka, timer dapat berjalan sementara board dijeda.

**Expected:** keputusan, efek visual berikutnya, dan command lanjutan menunggu gerakan/urutan tampilan selesai.  
**Actual sebelumnya:** antrean dapat dikosongkan demi keputusan cepat; test lama bahkan mengharapkan kartu manusia melewati backlog.  
**Root cause verified:** pengosongan antrean pada jalur human-decision/input, perbedaan sumber state interaksi, dan pengecualian online pada penguncian presentasi.

**Perbaikan:** pertahankan antrean, gunakan state yang sedang disajikan untuk UI, kunci command pada head aktif, dan serahkan penyelesaian jalan kepada renderer. Root cause diperiksa pada source; bukti browser sesudah perbaikan tersimpan di bawah. Tidak mengklaim sudah menguji ulang build production dengan patch ini.

Source utama: [online-presentation.mjs](../../../lib/online-presentation.mjs), [session.mjs](../../../frontend/session.mjs), [app.mjs](../../../frontend/app.mjs). Test: [online-speed.test.mjs](../../../tests/online-speed.test.mjs), [frontend.test.mjs](../../../tests/frontend.test.mjs), [test-online-flow-browser.mjs](../../../scripts/test-online-flow-browser.mjs). Command baru: `npm run test:online:flow`.

## Bukti browser yang benar-benar dijalankan

[Data lengkap frame, command, dan hasil](evidence/browser/results.json). Empat skenario, masing-masing dua browser context independen dengan storage/identitas terpisah, viewport 360×844 dan 393×844:

| Skenario | Status | Pemeriksaan |
|---|---|---|
|Jalan → beli, klik/Space terlalu cepat, menu saat berjalan|PASS|Banyak posisi antara pada kedua klien; popup beli baru setelah posisi tujuan; tidak ada command tambahan saat bergerak; menu menahan posisi lalu animasi melanjutkan.|
|Dua gerakan dengan update realtime beruntun/berulang|PASS|Versi 1→3 melalui BUY dan ROLL legal reducer lokal; kedua klien melewati tujuan gerakan pertama lalu kedua, tanpa popup beli usang; state server akhir identik.|
|Gaji dan sewa setelah tiba, motion normal|PASS|Modal muncul setelah posisi akhir, tanpa tombol, lalu hilang otomatis tanpa perubahan state server.|
|Gaji dan sewa setelah tiba, reduced motion|PASS|Preferensi aksesibilitas dihormati; urutan efek/notifikasi tetap setelah posisi akhir, tanpa transaksi ulang.|

Backend pengujian memakai **service online authoritative asli**, dengan MemoryOnlineStore dan transport websocket lokal yang dikendalikan harness. Roster dibuat/join/ready/start melalui UI. Skenario dipercepat memakai fixture legal pada server lokal, kemudian kedua klien reload/resume dari baseline yang sama. Skenario burst memakai reducer resmi untuk meniru aksi lain yang sudah terkonfirmasi selama klien sedang memutar animasi. Tidak mengirim state/RNG fixture ke production.

Screenshot: [menu saat berjalan](evidence/browser/menu-during-walk-0.png), [beli sesudah tiba](evidence/browser/purchase-after-arrival-0.png), [burst selesai](evidence/browser/burst-completed-0.png), [gaji/sewa](evidence/browser/salary-rent-after-arrival-0.png), [reduced motion](evidence/browser/reduced-salary-rent-0.png). Trace: [host](evidence/browser/flow-0-trace.zip), [guest](evidence/browser/flow-1-trace.zip).

## Regresi terbaru

| Command | Hasil akhir | Bukti |
|---|---|---|
|`npm test`|PASS, 713/713|[log](evidence/core.log), [JSON](evidence/CLASSIC_TEST_RESULTS.json)|
|`npm run test:speed`|PASS, 20/20; overlap dengan suite inti|[log](evidence/speed-final.log)|
|`npm run test:online:flow`|PASS, 4 skenario dua sesi|[log](evidence/browser.log)|
|`npm run test:online:rooms`|PASS, 14 skenario browser lokal|[log](evidence/rooms.log), [JSON](evidence/ONLINE_ROOM_BROWSER_RESULTS.json)|
|`npm run test:browser`|PASS, 16 skenario|[log](evidence/gameplay-browser.log), [JSON](evidence/CLASSIC_BROWSER_RESULTS.json)|
|`npm run test:trade:results:browser`|PASS, 6 pemeriksaan|[log](evidence/trade-browser.log), [JSON](evidence/trade-browser/results.json)|
|`npm run typecheck`|PASS|[log](evidence/typecheck-final.log)|
|`npm run check:source`|PASS|[log](evidence/check-source-final.log)|
|`node scripts/verify-speed-model.mjs`|PASS, 51 hash engine/model tetap|[log](evidence/model-final.log)|
|`git diff --check`|PASS|[log](evidence/diff-check.log)|

Exit code dan durasi terukur pemeriksaan pendek tersedia di [final-checks.json](evidence/final-checks.json). Tidak menghitung test overlap sebagai test unik tambahan. Empat skenario alur ini bukan empat pertandingan penuh hingga pemenang; audit 5 pertandingan/100 headless sebelumnya tetap baseline historis.

Percobaan gagal tetap disimpan. Regresi awal mendeteksi penguncian `busy` yang terlalu luas hingga menghalangi pelunasan utang; implementasinya dikoreksi dan 6 test utang lulus. Ekspektasi test lama yang sengaja melewati animasi diperbarui menjadi assertion urutan dan penolakan ACK dini. Beberapa percobaan browser gagal karena pendeteksi label harness, pergantian match fixture saat request START masih berjalan, dan sekali halaman 404 saat rebuild dist berbarengan; fixture akhir diisolasi lewat reload/resume dan eksekusi akhir memakai build stabil. Kegagalan harness tersebut tidak diklaim sebagai bug production baru.

## Batas validasi

- Pengujian multiplayer di atas berjalan lokal; **bukan PASS untuk Supabase/RLS atau latensi jaringan production**.
- Worker Termux production masih tercatat offline pada laporan sebelumnya. Tidak memulihkan perangkat, pairing, atau konfigurasi. Match live dengan bot hingga pemenang tetap BLOCKED sampai worker tersedia.
- Refresh/reconnect mengikuti mekanisme existing: pulihkan snapshot terbaru tanpa replay seluruh riwayat animasi. Gap log/overflow antrean ekstrem masih dapat memakai pemulihan snapshot bawaan; pengujian ini membuktikan burst normal, bukan antrean tak terbatas.
- Tidak ada soak 24 jam, profiling frame di Android/iOS fisik, atau perubahan server untuk menyamakan waktu animasi semua peserta. Performa visual yang dilaporkan berasal dari Chromium headless.
- Engine, aturan, model/bobot, manifest, API/backend, Supabase, dan Termux tidak berubah. `lib/online-presentation.mjs` adalah lapisan presentasi; 51 file yang dilindungi tetap cocok.
- Production belum menerima perubahan ini. Tidak ada deployment/push/merge.

Tindak lanjut: review patch, publikasi saat diotorisasi, lalu smoke online dua manusia + bot pada worker sehat, termasuk kartu yang memindahkan pion, lelang, barter, dan reconnect di tengah gerakan.
