# Monopoli Nusantara v4.5 — Board & Gameplay Experience

Implementasi dilakukan pada source workspace Hybrid terbaru, tanpa rewrite engine, perubahan ekonomi/strategi bot, atau penggunaan ZIP lama sebagai basis. Source/patch tersedia untuk review; **belum ada deployment v4.5**.

| Area | Status |
| --- | --- |
| Event/ledger, dedup, urutan presentasi | Selesai dan teruji dengan engine dan simulasi service/client |
| Dadu, pion, kartu, kapsul, riwayat, detailing board | Diimplementasikan; fixture JSX dan rendering SVG statis lulus, browser/Android belum terverifikasi |
| VS Bot/Hybrid/Supabase existing | Dipertahankan; suite regresi lokal lulus, live integration belum diverifikasi |
| TypeScript/lint/production build | Terhalang dependensi yang belum terpasang |
| PWA/versioning | Diimplementasikan dan diuji pada fixture service worker; update/install browser nyata belum diverifikasi |

## 1. Audit source terbaru

Workspace mempunyai board 40 petak, Nusa, pion SVG, VS Bot 2–4 dan persona Raka/Bima/Sari, Groq opsional, Supabase room/Auth/reconnect/persistent snapshot/pause/resume, lelang/barter, engine v1/v2 dan komponen presentasi existing. Source modulnya tersedia, tetapi ini tidak membuktikan infrastruktur live seluruhnya sudah aktif. `.git`/branch/commit tidak tersedia. Nama folder lama dipertahankan; package/release sekarang4.5.0, bukan bukti commit remote tertentu.

Audit resmi hosting mengonfirmasi Site existing versi 1, runtime ENV kosong (revision 0), database D1 binding DB dengan tabel rooms/quotas. Tidak ada koneksi Supabase/Groq live. Audience existing tidak diubah. Screenshot yang disebut dalam prompt tidak tersedia sebagai attachment gambar pada pesan ini; audit memakai source dan render SVG aktual. Detail awal: [V45_AUDIT.md](V45_AUDIT.md).

## 2. Akar masalah popup penjara

Engine mencatat jail/release satu kali per tindakan, dan collector existing sudah memakai watermark event ID. Masalah kode yang ditemukan adalah lifecycle presentasi: event jail/release bisa tertahan di antrean karena popup keputusan mendapat prioritas; state akhir dan perpindahan pion sudah tampil sementara event lama belum dikonsumsi. Akibatnya pemberitahuan masuk/keluar dapat muncul terlambat dan terasa berulang pada fase berikutnya. Bukan alasan untuk mengubah aturan penjara atau mengulang efek engine.

Antrean baru mengonsumsi event log unik secara berurutan: perpindahan/jump → kedatangan → event jail. Giliran berikutnya memakai decision key turnSerial untuk pilihan penjara, tanpa memproyeksikan event masuk lama. Release hanya dari event baru. Stale callback tidak bisa menghapus event berikutnya. Entry, gagal keluar, dadu kembar, bayar/kartu bebas, percobaan ketiga/utang dan kembali ke giliran jail memiliki regresi. Reproduksi perilaku perangkat asli belum dilakukan; perbaikan akar masalah urutan diuji pada engine/projector.

## 3. Akar masalah kartu multiplayer

Kartu ditampilkan melalui `gameplayDecision`/`canPresentDecision`, sehingga pembukaan kartu publik mengikuti izin aktor yang boleh ACK. Collector umum hanya memasukkan jail/release/bankrupt. Jika bot/aktor sudah ACK sebelum client lain mengambil snapshot, payload kartu historis lengkap juga belum tersedia.

Engine kini menempelkan kartu yang **sudah dibuka** pada log card, beserta ID/revision/actor/audience. Semua anggota room yang berhak menerima snapshot melihat event publik sama, termasuk ketika beberapa revision tiba sekaligus dan fase card sudah terlewat. Hanya pemilik keputusan yang masih valid mendapat tombol Jalankan kartu. Pengamat hanya melanjutkan presentasi lokal; tidak mengirim ACK game.

## 4. Event presentation

`lib/presentation-timeline.mjs` dan hook existing `useGameplayPresentation` sekarang mengendalikan satu antrean visual: DiceRolling → DiceResult → PawnMoving → TileArrival → EventRevealing/FinancialSettlement → snapshot terbaru/keputusan. State ini hanya proyeksi, bukan engine kedua.

Identitas berasal dari matchId + log event ID; langkah finansial mempunyai ordinal stabil meskipun client menerima batch berbeda. Log menyertakan versi command, actor dan audience publik. Tidak ada timestamp client yang dipakai untuk menentukan hasil. Realtime tetap mengirim hint revision, snapshot backend tetap sumber fakta. Tidak ada transaksi berbasis broadcast UI atau ACK animasi semua perangkat.

Duplicate/stale revision diabaikan; pergantian match, restore, reconnect, background dan pause membaseline snapshot. Pause/catch-up dapat melewati presentasi tersisa yang transaksinya sudah sah, tanpa mengulangnya saat resume. Log window terlewat atau antrean >96 langkah memulihkan snapshot terbaru, bukan menebak event yang hilang. Server tidak menunggu client menyelesaikan animasi. Sebelum aksi, UI juga memeriksa versi view terhadap state aktual; ACK publik memeriksa identitas reveal saat klik sehingga tombol kartu lama tidak menjalankan reveal baru.

## 5. Animasi dadu

Dua cube CSS dengan enam sisi, ukuran persegi 58×58, perspektif dan tilt terbatas menggantikan bidang datar yang terlipat ekstrem. Gerak lempar/bounce dan putaran memakai transform, tanpa physics dependency. Hasil/total/aria-label aktual dan orientasi akhir hanya dipakai pada tahap reveal; rolling dekoratif tidak bergantung hasil engine.

Snapshot yang ditampilkan pada HUD, history dan papan tetap proyeksi sebelumnya sampai tahap yang sesuai. Nilai baru tidak bocor lewat skor lempar awal, label, saldo atau posisi pion. Dadu dan pion tidak lagi memakai timer lokal/remote/Board terpisah. Rerender tetap memakai ID roll yang sama; dadu gerak, lempar awal dan dadu utilitas dibedakan. Klik ganda dicegah oleh lock aksi/version/backend CAS. Reduced Motion mengikuti opsi pengguna dan preferensi perangkat.

Geometri/label/urutan diuji. Hasil CSS3D, browser compositor, easing dan rasa pantulan di Android belum dinilai pada perangkat nyata.

## 6. Animasi dan posisi pion

Layout deterministik existing dipertahankan: satu pion di pusat tile, cluster simetris 1–6, ukuran berkurang sesuai kepadatan, rotasi posisi mengikuti empat sisi. Tidak ada offset acak. Tes memeriksa semua 40 tile untuk 1–6 pemain, bounds dan jarak antar-pion.

Board baru mulai bergerak hanya ketika antrean mencapai PawnMoving, dengan posisi awal dikunci sebelum paint melalui layout effect. Route mengikuti path sah engine, termasuk mundur, Mulai dan kartu. Catmull-Rom tangents menjaga momentum melewati titik; tidak berhenti ease-in/out di setiap petak. Durasi berjalan dibatasi 1,8 detik normal/1,1 detik cepat untuk rute panjang. Direct jail memakai jump/fade pendek, tanpa membuat lintasan palsu. Approach ke petak 30 dan jump ke 10 tidak diputar dua kali.

Gerak memakai rAF/atribut transform SVG; progress React hanya berubah per petak. Memoized view mencegah heartbeat/progress merender artwork ulang tanpa kebutuhan. Navigasi eksplisit dapat menahan animasi; visibilitas/reconnect membaseline tanpa replay. Callback movement memiliki ID dan watchdog lokal, bukan hak memodifikasi room. Tombol Lewati animasi hanya mengejar state sah; keputusan yang belum selesai tetap menunggu pemiliknya.

## 7. Detail board

Color strip kelompok tanah tetap utuh. Kepemilikan memakai rail samping/bawah berwarna pemain dan badge nomor terpisah dari strip kelompok. Rumah 1–4 berupa miniatur atap individual yang lebih besar; hotel memakai bangunan lebar merah dengan jendela. Gadai menurunkan kontras artwork, garis putus dan label GADAI. Pilihan tile memakai outline halus; posisi aktif mendapat penanda berbeda.

Harga, nama, pion dan status ditempatkan pada jalur terpisah. Semua marker ikut transform orientasi tile. Zoom/camera/40petak dan aset existing dipertahankan. Render statis source SVG diperiksa pada `Monopoli_Nusantara_v4.5-board-detail.png`; ini **bukan screenshot browser/mobile**. Rasterizer memakai PNG turunan dari atlas existing, tidak mengubah aset aplikasi; font rasterizer dapat berbeda dari browser.

## 8. Transaksi Nusa visual

`moneyData`/`assetData` hanya menambahkan metadata di titik engine yang memang sudah mengubah uang/aset. Tidak ada transfer ekonomi tambahan. Payload mencatat jenis, from/to bank atau pemain, amount internal, tile/kartu dan assetChanges yang relevan.

Sewa dan barter mempunyai debit/kredit konsisten; bank bukan pemain fiktif. Pembelian, lelang, Mulai, pajak, kartu/perbaikan, bangunan/jual, gadai/tebus/bunga, jail, PAY dan penyelesaian kebangkrutan dicatat. Utang yang belum dibayar tidak membuat animasi pembayaran. Hasil lelang mempunyai satu ledger pembayaran meskipun ada log buy/build dan auctionResult terpisah.

Kapsul menampilkan nominal bertanda ± secara singkat pada slot stabil, warna positif/negatif dan label aksesibel. Tinggi kartu tetap 44px; ruang antarbaris HUD disesuaikan tetap untuk efek, tanpa layout shift per transaksi. Perubahan saldo visual berasal dari ledger sah dan baru ditampilkan sesudah perjalanan/tahap yang relevan; tidak dihitung dari delta snapshot di client. Autosave, ekspor dan API selalu memakai snapshot otoritatif, **bukan saldo proyeksi sementara**.

## 9. Riwayat keuangan

Satu event menyimpan satu daftar ledger; tampilan terperinci menurunkan baris debit/kredit per pemain dari data tersebut. Filter/search existing dipertahankan, ditambah arah Bank/Pemain dan detail actor/recipient/jenis/amount/properti/kartu. Tidak ada popup per entri. Legacy text tetap dibaca tanpa menebak nominal. Batas log existing 300 event tetap dipertahankan; ini bukan arsip finansial tanpa batas atau ringkasan seluruh pertandingan sejak awal.

## 10. Perbaikan UX tambahan dan kompatibilitas

- Kartu publik dan hasil lelang masuk urutan visual yang sama; tidak ada popup keputusan yang memotong dadu/perjalanan. Auction identity tetap stabil selama bid; hasil muncul sebelum ditutup.
- Backend callback `takeRoom` tidak lagi bergantung pengaturan kecepatan/reduced motion, sehingga mengubah opsi visual tidak membangun ulang subscription atau memicu baseline reconnect tanpa kebutuhan.
- Tab lain/background tidak menumpuk presentasi lama. Pointer/control tetap milik kursi sah. Event privat dan bot memory dikeluarkan dari snapshot publik v2.
- Save lama tidak diwajibkan mempunyai metadata baru. Engine2, room v1, rulepack, Nusa dan bot memory v1 tidak diganti. Log lama tanpa payload cukup tidak dipaksa menjadi transaksi/kartu perkiraan; event baru memakai metadata lengkap setelah server/worker diperbarui.
- Package 4.5.0, metadata halaman, footer dan Settings diselaraskan. PWA `nusantara-v450` memperbarui shell/unhashed JS/CSS, mengisolasi cache sendiri, mengecualikan API/Auth dan mengabaikan kegagalan tulis cache agar respons jaringan sukses tetap digunakan. Penghapusan hanya cache UI lama, bukan pertandingan. Settings memberi reload setelah simpan; tidak ada reload paksa di tengah giliran.

## 11. File yang diubah

Daftar lengkap ada di [V45_CHANGED_FILES.json](V45_CHANGED_FILES.json). Utama: Game/Board/BoardMap/DiceRollFx/PlayerCapsules/HistoryPanel/hook presentasi; timeline/types/finance/version; metadata engine; CSS/PWA/layout/package; tes/QA/dokumentasi. Tidak ada perubahan dependency/lockfile, aset board asli, modul strategi/persona/Groq, service/store/worker bot atau migration SQL. Bukti file yang dipertahankan: [V45_PRESERVED_COMPONENTS.json](V45_PRESERVED_COMPONENTS.json).

## 12. Hasil tes dan performa

**305/305 tes lulus, 0 gagal, 0 skip, 21 file** melalui `npm run test:core`. Ini meliputi 251 regresi sebelumnya dan 54 pengujian baru: 46 engine/projector/service/PWA serta 8 fixture TSX. Lihat [QA_V45_RESULTS.json](QA_V45_RESULTS.json).

Cakupan baru: strict reveal/movement/finance ordering; batch cepat, late/duplicate update; kartu kedua deck pada 2/4/6 client; owner-only ACK/stale reveal; jail semua transisi, triple doubles; ledger semua jalur dan simulasi 800 aksi maksimum; concurrent roll/replay; simetri/bounds 40 tile × 1–6; pause/background/recovery; cache isolation/Auth exclusions/quota/offline. Fixture JSX menguji actual source dice/board/capsules/history/Game, termasuk double-click sebelum render dan save snapshot yang benar, dengan hook/child stubs. Ini bukan real React lifecycle atau DOM test.

Perbandingan source sebelum/sesudah memakai 6 paired seeds, 4 peserta, **3.282 aksi**: aturan, ekonomi, RNG, aset/deck/queue, teks log legacy dan pilihan baseline identik setelah metadata tambahan diabaikan. [V45_ENGINE_PARITY.json](V45_ENGINE_PARITY.json). Strategi Hybrid tidak dituning/dibenchmark ulang karena tidak berubah.

Parser existing memeriksa **80 file TS/TSX/MJS,0 syntax error**. CPU profile 2.000 ingest+drain enam pemain: median sekitar 0,003 ms / p95 0,010 ms; hanya core projector, bukan React/layout/GPU/FPS Android. [V45_SYNTAX_CHECKS.json](V45_SYNTAX_CHECKS.json), [V45_PERFORMANCE.json](V45_PERFORMANCE.json).

## 13. TypeScript/lint/build

Perintah dicoba: `npm run typecheck` → tsc tidak tersedia; lint → eslint tidak tersedia; build → vinext CLI belum terpasang; `npm run build:vercel` → next tidak tersedia. Instalasi tidak diulang. [V45_BUILD_CHECKS.json](V45_BUILD_CHECKS.json).

Tidak menonaktifkan strict atau memakai ignore directive. Shared presentation types dan fixture compiler disiapkan, kontrak reason/aiComment Hybrid tetap dipertahankan. Parser/transform fixture bukan semantic TypeScript atau production bundle. Build/deployment belum dapat dinyatakan lulus.

## 14. Hasil multiplayer

Simulasi menjalankan shared engine, actual room service dan adapter kontrak storage untuk2/4/6 anggota: semua menerima revealed card/ledger sama; pengamat tidak boleh ACK; duplicate ACK/roll tidak menggandakan versi/uang. Suite bot online existing tetap lulus untuk lease, pause/resume, stale advisor, concurrent execution dan reconnect. Semua ini **simulasi lokal**, bukan Supabase live/RLS/PostgreSQL/Realtime di perangkat berbeda.

Tidak ada migration atau perubahan produksi dijalankan. Panduan [DEPLOY_V45.md](DEPLOY_V45.md) menjelaskan deployment app dan Edge Function bersama, fondasi migrations 001/002 yang sudah ada, serta QA staging. Site live belum diperbarui.

## 15. Belum dapat diverifikasi

Semantic TypeScript, lint lengkap, Next/Vinext production build, bundling Edge Function, CSS3D/ReactDOM/focus aktual, FPS/memory Android, Supabase live, latency antarperangkat, cache install/update browser dan deployment. Foto perangkat terbaru tidak tersedia. Source menggunakan fail-safe bounded queue/snapshot recovery, tetapi timing/easing, keterbacaan six-player HUD dan house/hotel saat zoom out tetap perlu QA visual nyata. Offline cold-open membutuhkan shell/aset yang berhasil tercache pada origin/response hosting yang mengizinkan cache. Tidak ada klaim production-ready.

## 16. Checklist manual setelah staging

- [ ] Periksa Settings v4.5.0, metadata halaman dan cache baru; reload setelah simpan tidak menghapus slot/room.
- [ ] Roll awal, normal, utility dan doubles: tidak ada angka/score/posisi/riwayat baru sebelum reveal; pion bergerak setelah dadu selesai.
- [ ] Klik ganda, keyboard cepat, respons terlambat dan dua tab akun sama hanya menghasilkan satu command sah.
- [ ] Jalur Mulai, mundur, kartu pindah, tile 30 → jail 10, triple doubles dan Reduced Motion/OS preference benar.
- [ ] Satu/enam pion pada semua sisi, zoom/follow/explore dan cluster tidak menutupi nama/harga; owner rail berbeda dari color group.
- [ ] Rumah 1/2/3/4, hotel, gadai, tile aktif/selected terbaca pada portrait 320–430 px serta landscape.
- [ ] Kesempatan/Dana Umum muncul pada semua peserta; hanya aktor mempunyai ACK. Kartu bot tetap terlihat walau fase berubah cepat.
- [ ] Jail entry sekali, giliran jail berikutnya hanya pilihan; pay/card/doubles/third-attempt debt menghasilkan satu release.
- [ ] Sewa debit/kredit, bank income/tax, pembelian/lelang, build/sell, mortgage/interest/redemption, barter, PAY/bankruptcy tepat dan tidak ada efek uang ulang saat reconnect.
- [ ] Riwayat detail memakai pihak/nominal yang benar; ekspor/save saat uang masih bergerak menyimpan saldo/aset otoritatif.
- [ ] Lelang tidak close/open pada setiap bid; hasil/pembayaran sekali. Barter/counteroffer hanya pihak berwenang.
- [ ] Dua/empat/enam perangkat, manusia+bot online, host disconnect, missed/duplicate Realtime dan fast revision mempertahankan urutan/catch-up.
- [ ] Pause saat dice/pawn/card/finance, resume keputusan tertunda dan seluruh offline sampai esok hari tidak mengulang transaksi/event lama.
- [ ] Settings/navigation/background/unmount selama animasi tidak merestart roll, membocorkan hasil atau membocorkan subscription.
- [ ] Offline warm shell/cache-update, cache penuh, Auth redirect dan load save lama diuji tanpa Clear Site Data.
- [ ] Typecheck, full suites, lint, production build serta Supabase staging lulus sebelum promosi; shared worker engine ikut diterbitkan, audience hosting tidak berubah.
