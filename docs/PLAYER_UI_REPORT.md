# Monopoli Nusantara v4.6.1 — Player Experience

Implementasi UI telah dikerjakan langsung pada source NUSA MIND v4.6 yang sudah tersedia di workspace. Tidak memakai source ZIP lama. Belum ada deployment; source ini merupakan kandidat untuk validasi build dan staging.

## Hasil desain

Bottom navigation, sidebar gameplay dan jalur navigasi yang berulang dihapus dari render permainan. Layar memakai satu meja: identitas pemain, papan, lalu konsol aksi yang memuat dadu. Tema navy, krem dan emas, artwork, pion, Nusa serta papan 40 petak dipertahankan. Pada desktop, kapsul/konsol berada di samping papan; pada portrait berada di atas/bawah papan tanpa fixed bottom navigation.

| Kebutuhan | Akses baru |
| --- | --- |
| Lihat atau kelola aset | Ketuk kapsul pemain; Menu → Aset. Aset lawan hanya dapat dilihat |
| Barter dan tawaran balik | Tombol Barter di header; wizard/review existing tetap dipakai |
| Riwayat langkah dan transaksi | Ketuk baris aktivitas di bawah konsol; Menu → Riwayat |
| Pilihan giliran panjang, penjara, utang, klaim sewa | Tombol detail pada heading konsol; popup keputusan existing |
| Sertifikat properti | Ketuk petak atau label properti pada toolbar papan |
| Kamera | Dua ikon dekat label properti: seluruh papan dan ikuti pion; pan/pinch existing tetap ada |
| Percepat presentasi | Ikon saat presentasi berjalan; tidak mengeksekusi keputusan atau mengubah hasil |
| Room, voting dan resume | Menu → Room. Banner ringkas muncul saat ada jeda, vote atau keputusan tertahan |
| Simpanan, pengaturan dan aturan | Menu permainan |
| Kembali ke menu utama | Simpan & kembali; menunggu persistence lokal dan menangani kegagalan |

Semua fitur panjang memakai satu boundary modal existing dengan fokus keyboard, Escape, Android Back dan scroll internal. Kapsul menyajikan nama, saldo, giliran, bot/penjara/kebangkrutan, koneksi dan transaksi sah. Nama/saldo panjang memakai pemotongan visual; saldo lengkap tersedia pada label aksesibel dan portofolio. Tidak menampilkan rencana strategi privat bot di papan.

## Dadu, pion dan sinkronisasi

- `DiceTray` menjadi satu lokasi dadu di area UI. Board tidak lagi merender dadu atau menerima prop hasil dadu.
- Dua kubus CSS 3D proporsional memakai pantulan kecil yang dibatasi tray. Tidak ada lintasan lempar ke tengah papan, physics engine atau dependency baru.
- Hasil dan urutan tetap dikendalikan `useGameplayPresentation`/timeline existing: rolling → result → perpindahan → arrival → event → settlement. Selama rolling, orientasi kubus dan teks/ARIA tidak membocorkan pasangan hasil.
- Tombol commit tidak aktif selama lemparan, reveal, perpindahan atau settlement. Handler command lock existing tetap melindungi double click.
- Log publik terbaru yang sudah disajikan dapat ditampilkan sebagai dadu statis berlabel “Terakhir”. Save baru tidak diberi hasil fiktif. Refresh/reconnect melakukan baseline dan tidak menggulirkan kembali hasil lama.
- Root Aset/Barter/Riwayat dan menu menghentikan renderer/timer presentasi lokal. Ini tidak menahan transaksi backend, meminta ACK semua perangkat, atau mengubah fase otoritatif. Setelah panel ditutup, queue/baseline recovery existing melanjutkan penyajian.
- Reduced motion, animasi cepat, stale completion guard, deduplication dan urutan dari server tetap digunakan.
- Animasi pion, kamera, detail rumah/hotel/kepemilikan/gadai serta ledger Nusa tidak diganti.

## Bug integrasi yang diperbaiki

1. Identitas portofolio lokal tidak lagi mengikuti kursi bot ketika bot mendapat giliran. Kursi online selalu memakai binding room, terpisah dari pemilik aset yang dilihat.
2. Menutup modal tidak otomatis membatalkan pause lokal.
3. Akses fitur utama tidak memerlukan sidebar/tab bar terpisah. Draft barter masih berada di Game dan tidak hilang hanya karena berpindah popup.
4. Room sheet tidak menggandakan panel voting interaktif.
5. Kembali ke menu menunggu save snapshot otoritatif. Jika kedua penyimpanan perangkat gagal, pengguna tetap di game dengan feedback untuk membuat cadangan.
6. Aturan roster landscape lama dengan `!important` dibatasi ke layout legacy agar tidak menimpa grid baru. Pada landscape pendek, tiga kolom menjaga enam peserta tetap dalam dua baris.
7. Penanda versi aplikasi, judul dokumen, README dan metadata source diperbarui. Snapshot v2.11.1 lama disimpan sebagai arsip historis.

## Cakupan yang dipertahankan

36 berkas terpilih engine, backend/server, bot, Supabase migrations/functions, ledger, penyimpanan, online client, timeline, presentation hook dan board artwork identik byte dengan snapshot sebelum tugas UI (`UI_PRESERVED_COMPONENTS.json`). Tidak ada perubahan aturan, ekonomi, board size, algoritma bot, Auth, authorization, API, transaksi, worker lease/CAS, scheduler, database atau migration. Fitur NUSA MIND dan riwayat benchmark sebelumnya tetap disertakan. Tidak ada benchmark kecerdasan baru karena algoritma tidak berubah; laporan ini tidak mengklaim peningkatan kekuatan bot.

## Hasil verifikasi

| Pemeriksaan | Hasil nyata |
| --- | --- |
| `npm run test:core` | **384/384 lulus, 23 berkas, 0 skipped** |
| `npm run test:ui` | **88/88 lulus, 0 skipped**; termasuk 34 tes baru antarmuka/interaksi |
| `npm test` | **391 lulus, 2 gagal dari 393**; dua suite renderer membutuhkan modul TypeScript yang belum tersedia |
| Parse sintaks app/lib/components | **88 berkas, 0 error**, parser Babel existing; bukan semantic TypeScript |
| `npm run typecheck` | Terhalang: `tsc: not found` |
| `npm run lint` | Terhalang: `eslint: not found` |
| `npm run build` | Terhalang: modul `vinext/dist/cli.js` tidak tersedia |
| `npm run build:vercel` | Terhalang: `next: not found` |
| Browser/perangkat | Chromium terpasang tetapi gagal launch oleh sandbox; tidak ada verifikasi pixel/React DOM/Android yang berhasil |
| Supabase/Groq live | Tidak terhubung; tidak ada request provider, migrasi atau deployment |

Bukti: `QA_PLAYER_UI_RESULTS.json`, `UI_TEST_RESULTS.json`, `UI_SYNTAX_CHECKS.json`, `UI_BUILD_CHECKS.json`.

Tes menjalankan shared engine sebenarnya, service/API dengan store/HTTP doubles, pure presentation timeline, dan TSX asli dalam element-tree fixture dengan hook/child stubs. Ini mencakup bot/gameplay, concurrency, authorization, barter, lelang, ledger, penjara, pause/resume, event/card ordering, double roll, serta simulasi **2/4/6 client** yang menerima hasil sama, duplicate/stale revisions dan baseline reconnect. Fixture TSX bukan React DOM; simulasi tersebut bukan koneksi live Supabase atau pengujian lintas perangkat.

Dua kegagalan `npm test`: renderer board pada `tests/board-2d.test.mjs` dan `tests/portrait.test.mjs`, keduanya gagal memuat `typescript`. Tidak dilewati atau dimatikan. Tes board/komponen alternatif menggunakan transformer existing lulus, tetapi tidak menggantikan pemeriksaan yang terhalang.

## Status dan risiko yang tersisa

- **Selesai dan teruji lokal:** penghapusan navigasi bawah, integrasi jalur fitur, console/tray dadu, action guards, binding identitas portofolio, close/pause behavior, penanganan save gagal, kontrak rendering dan timeline simulasi.
- **Selesai implementasi, belum terverifikasi di browser:** layout portrait/landscape/desktop, tipografi, ukuran sentuh, tray CSS 3D, clipping/safe area/keyboard, animasi uang dan modal saat game berjalan.
- **Belum tervalidasi:** semantic TypeScript, lint, production build/Vercel, FPS/performa Android, Supabase live/reconnect lintas perangkat, serta Groq live. Tidak dinyatakan production-ready.
- Pengaturan responsive memakai grid flex-height dan safe-area. Layar sangat pendek, nama/saldo panjang, enam peserta dan banner online perlu dicek visual; source rules tidak menjamin hasil pixel pada setiap perangkat.
- Source tanpa Git metadata: branch/commit remote dan kesetaraan dengan commit deployment tidak dapat dibuktikan. Tidak ada push, reset atau force push.
- Batas backend dan hasil benchmark NUSA MIND yang dicatat pada laporan sebelumnya tetap berlaku; UI ini tidak menaikkan status verifikasi backend atau klaim kompetitif.

## Deployment

1. Gunakan ZIP **v4.6.1 Player Experience** penuh atau terapkan patch hanya pada basis workspace NUSA MIND v4.6 yang cocok. Jangan menerapkan patch ke v2.x atau source lain secara paksa. Daftar perubahan ada di `UI_CHANGED_FILES.json`.
2. Di CI/environment dengan akses dependency, gunakan Node 24 dan pnpm 11.25.0 sesuai lockfile: `pnpm install --frozen-lockfile`. Tidak mengganti lockfile/versi dependency untuk menyembunyikan error.
3. Jalankan `npm run typecheck`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run build:vercel`; jalur Sites/Cloudflare juga menjalankan `npm run build` melalui environment hosting yang sudah benar. Perbaiki error semantik/bundling jika ditemukan sebelum promosi.
4. Pembaruan UI ini **tidak membutuhkan migration** atau redeploy worker bot. Pertahankan backend/Supabase dan secret existing. Jika NUSA MIND sebelumnya belum dideploy, ikuti `DEPLOY_V46.md` dan verifikasi worker/scheduler di staging; jangan menganggap kebutuhan lama sudah terpenuhi oleh ZIP ini.
5. Cache UI baru `nusantara-v461`; hanya cache aset lama yang diganti. Tidak menghapus IndexedDB/localStorage/save. Aplikasi tidak memaksa reload pertandingan; opsi “Simpan & muat tampilan terbaru” existing menangani pembaruan.
6. Deploy ke staging, jalankan checklist di bawah, kemudian deploy melalui alur repository/hosting yang biasa digunakan. Tidak ada URL deployment baru dari pekerjaan ini.

## Checklist manual sebelum rilis

- [ ] Portrait 320×568, 360×640, 390×844 dan 412×915: 2/4/6 pemain, papan terlihat, konsol/tombol utama tidak terpotong. Periksa safe-area dan address bar berubah.
- [ ] Landscape 568×320/667×375 dan desktop: roster, saldo, board, menu dan konsol tidak bertumpuk. Periksa orientasi berubah saat pion bergerak.
- [ ] Nama panjang dan saldo besar: label tetap dapat diakses melalui portofolio; Nusa tidak berubah satuan.
- [ ] Buka/tutup Aset, Barter, Riwayat, Simpanan, Aturan, Pengaturan dan Room; kembali dari sertifikat, selector, manage dan counteroffer. Escape/Android Back/fokus keyboard bekerja.
- [ ] Satu manusia vs Raka/Bima/Sari; buka aset saat giliran bot; bot tidak dapat dikendalikan dan kembali berjalan setelah popup ditutup. Cek empat model AI existing dan fallback Groq.
- [ ] Lempar cepat/double click, dadu kembar, utility roll, penjara dan starting roll: tidak ada hasil/total lebih awal atau gerakan sebelum reveal. Dadu hanya di tray.
- [ ] Gerakan melewati Mulai, kartu, penjara, lompatan dan saldo: urutan/cause-effect benar, transaksi visual sekali dan riwayat sesuai ledger.
- [ ] Dua perangkat dengan room 2/4/6 peserta dan bot online: pair dadu sama, kartu publik terlihat, kontrol privat hanya pemilik hak, lelang stabil, barter aman.
- [ ] Buka popup saat event datang; tutup dan pastikan presentasi/keputusan tertunda tetap tersedia. Jangan menunggu ACK seluruh client untuk commit server.
- [ ] Disconnect sebelum/selama/setelah roll/transfer; reconnect dan refresh tidak replay dadu/transaksi lama. Validasi snapshot dan aset tetap sama.
- [ ] Pause voting dan disconnect >90 detik; bot berhenti; resume hanya semua manusia aktif online/siap. Menutup popup tidak membatalkan pause.
- [ ] Reduced motion/percepat/animasi cepat, suara, pan/pinch/follow: periksa di Android kelas menengah dan ukur frame/performa sebenarnya.
- [ ] Save/load dan kegagalan storage: “Simpan & kembali” tidak mengklaim berhasil saat persistence gagal. Update PWA tidak menghapus save dan version menunjukkan 4.6.1.

Daftar berkas lengkap, hash source dan validasi ZIP/patch disertakan dalam manifest artefak. Bukti historis v4.5/v4.6 tetap tersimpan terpisah dan tidak ditimpa oleh hasil UI.
