> Integrasi bot terbaru pada working tree: [NUSA V18 dan fondasi bersama](../INTEGRASI_NUSA_V18.md). UI dari pembaruan sebelumnya tetap dipertahankan.

> Pembaruan lokal belum dirilis: lobi dirapikan, popup lelang fokus pada harga/pemegang tawaran tanpa profil peserta atau animasi, simbol mata uang ₦, nama model kapital, dan minimum pembuka/kenaikan lelang ₦ 5. Catatan aktif: [UI_UPDATE_IN_PROGRESS.md](UI_UPDATE_IN_PROGRESS.md).

> Update 4.10.0: satu bank-indicator di board-stage, data dari state committed. bank-view.mjs merender details tertutup; ekspansi, scroll dan navigasi certificate dipertahankan. Bank tidak mengirim command. BoardView mengabaikan gesture dari kontrol data-action. Lihat RELEASE_4100.md.

> Update 4.9.1: propertyHero memakai mini-deed dengan data rulepack. Tombol certificate membuka property preview read-only. app.mjs menyimpan popup manual asal, matchId, dan scroll; close/Escape/Back mengembalikannya tanpa menyimpan popup otomatis lama atau memanggil ACK/aksi ekonomi. Konteks match yang berubah dibuang. Pemilih barter memisahkan tombol detail dari label checkbox; draft/tawaran masuk memakai tombol detail terpisah dari hapus. Klasifikasi density mencocokkan token class penuh agar mini-deed tidak keliru dianggap deed. Lihat RELEASE_491.md.

> Update 4.9.0: mobile portrait menjadi prioritas. `app.mjs` menetapkan data-density compact pada dialog umum dan preserved pada sertifikat/kartu/katalog. Hanya subtree lobi dan dialog compact diproses oleh lucide-icons.mjs; gameplay tetap memakai renderer sebelumnya. CSS tambahan dibatasi selector tersebut. server-dist adalah output privat native ESM untuk Vercel, bukan static output. Panduan deployment aktif: ../ENV_REQUIRED.md.

> Update 4.8.3: LocalSessionLease mengunci tab penulis lokal. storage.ts memakai envelope saveRevision dan CAS atomik; session.saved menyimpan revision terakhir yang sukses. APP_VERSION dipakai UI/health/build; hash output mencakup seluruh aset/modul. Lihat STABILITY_REPORT.md.

# Peta frontend — dasar 4.8.2 dengan update 4.9.0

Frontend memakai ES modules/CSS, bukan React/Next lama. `app/api` tetap backend Fetch handler. Hanya lobby dan gameplay menjadi layar penuh. Semua fitur lain dalam satu elemen `<dialog>` yang dimiliki aplikasi; kontrol pemilihan tidak memakai popup browser.

| File | Tanggung jawab |
| --- | --- |
| `frontend/app.mjs` | Dua layar, navigasi, event delegation, popup lifecycle, draft dan bindings |
| `frontend/session.mjs` | Intent lokal/online, autosave, timeline, worker bot, koneksi, retry config |
| `frontend/domain.mjs` | Hak kontrol, primary action, masking dadu, popup, guard manajemen |
| `frontend/popups.mjs` | Renderer sertifikat, kartu, aset, pembangunan, profil/ledger, barter dan keputusan |
| `frontend/asset-panel.mjs` | Satu panel Aset: portofolio, bangun berulang, gadai/tebus dan konfirmasi inline |
| `frontend/debt-advisor.mjs` | Rencana dana untuk lunasi otomatis: gadai di luar set lengkap dan likuidasi legal berbatas |
| `frontend/tile-info.mjs` | Info petak khusus, pajak tetap dan katalog 16 kartu publik/deck |
| `frontend/development.mjs` | Delapan kelompok warna, status pembangunan, biaya/sewa dan kesempatan barter |
| `frontend/economy-view.mjs` | Dua baris aktivitas, feedback kapsul, ledger per pemain dari log publik |
| `frontend/online-status.mjs` | Status konfigurasi/identitas/koneksi yang tidak menyamakan ENV dengan konektivitas |
| `frontend/selections.mjs` | Listbox HTML, keyboard, fokus dan adapter select tersembunyi |
| `frontend/trade-drafts.mjs` | Draft privat serializable, konteks counteroffer, cap 24 record, fallback memori |
| `frontend/card-icons.mjs` | Pemetaan eksplisit 16 + 16 kartu ke konteks PNG |
| `frontend/currency-view.mjs` | Normalisasi teks mata uang lama ke ₦; input tidak diubah |
| `frontend/board.mjs` | 40 petak dari BOARD, orientasi teks/bangunan, hit area, PNG pion, animasi |
| `frontend/board-camera.mjs` | Fit selebar layar, zoom dan clamp pada board 2D datar |
| `frontend/dice-view.mjs` | Pengacakan pip dekoratif, reveal sah, pembatalan callback usang |
| `frontend/art.mjs` | Avatar WebP per persona/manusia, sprite pion/kartu, ikon Lucide dan atlas PNG bangunan |
| `frontend/styles.css` | Portrait, desktop, safe area, popup compact dan reduced motion |
| `frontend/service-worker.js` | Cache publik per rilis; pembaruan menunggu seluruh tab aman, tanpa API/identitas/state room |
| `frontend/pwa.mjs` | Pemasangan PWA, petunjuk Safari, status jaringan, dan pembaruan dari Pengaturan |
| `frontend/cache-migration.mjs` | Cleanup worker/cache UI Nusantara lama, tanpa menyentuh save |
| `scripts/build-web.mjs` | Output dist terpisah, precache berdasarkan aset aktual, tanpa modul server |
| `scripts/diagnose-online.mjs` | Audit ENV lokal tanpa mencetak nilainya atau menghubungi Supabase |

`GameSession.state` authoritative. `view/head/model` hanya presentasi. Semua tindakan melalui `session.act(type,data)` dengan actor binding, pending guard, version dan backend validation. Jangan mengubah saldo/posisi/kartu melalui callback animasi. Online hanya mengirim intent; server menentukan RNG dan transaksi.

`ingestTimeline` memberi ID/watermark. Reconnect/refresh adalah baseline. Dadu rolling tidak menerima angka hasil pada widget maupun baris aktivitas. Reveal membatalkan timer lama, mempertahankan pasangan baru selama movement. Pion berjalan dari rute engine. Kejadian penjara/kartu tidak dipicu ulang hanya karena render. Observer kartu publik mendapat kontrol tutup, bukan ACK pemain lain.

Feedback kapsul hanya dari `head.finance`, bukan beda saldo dua snapshot. Node stabil untuk event sama; tidak ada badge di luar kartu. Baris aktivitas dapat memakai `head.source` setelah reveal agar tidak terlambat, sementara ledger persisten dibaca dari log publik yang dibatasi 300 kejadian oleh engine. Deduplikasi ID mencegah baris ganda tanpa menyimpan ledger ekonomi kedua.

Pembangunan memakai `assetPermission` + `managementError`/`canManage`, termasuk pembatasan dispatcher utang/lelang dan saldo yang dicadangkan. Tidak ada aturan “dua properti selalu cukup”: kelompok harus lengkap. Perintah aset tidak menutup panel. `assetPresentation` hanya membolehkan settlement milik tindakan aset sendiri, dengan match/revision/seat yang cocok, maju saat panel tertutup visual. Kontrol tetap disabled sampai head selesai. `assetPlan` memproses maksimal 15 perintah terpisah dan tidak masuk save; stok terbatas dapat memunculkan buildOffer/lelang existing. Panel pembangunan hanya memuat kelompok/aset milik pemain; kelompok yang belum lengkap memperlihatkan ringkasan jumlah yang masih kurang.

Draft memakai match, account/seat, lawan dan fingerprint tawaran masuk; nama bukan bukti identitas. Data input mentah tidak pernah disisipkan pada command. Auth token tidak masuk draft, URL, markup atau snapshot. Draft berbeda akun tidak digunakan untuk akun lain. Aset yang berpindah harus dihapus dari draft atau diperiksa kembali sebelum submit.

Avatar aktif memakai WebP terpisah untuk enam bot dan satu manusia. Pemetaan `playerAvatar` digunakan di seluruh tampilan; satu pertandingan tetap maksimal enam peserta. Pion/kartu mempertahankan atlas PNG, sedangkan bangunan memakai atlas PNG asli dan ikon UI memakai Lucide inline. Atlas avatar, glyph UI, dan logo mata uang lama sudah dihapus; atlas PNG bangunan asli tetap digunakan. Semua aset runtime aktif berada dalam `public/assets`; build dan precache memuat modul browser yang benar-benar terjangkau dari entrypoint, termasuk worker.

Popup menggunakan footer untuk keluar bila memiliki aksi. X hanya tampil bila tidak ada tombol footer. Jangan menutup keputusan engine dengan callback modal; keputusan tetap sah sampai command yang berwenang disimpan. Escape/Back hanya mengubah tampilan. Jaga 320×568, enam kapsul/two rows, scroll internal popup, tidak horizontal overflow, dan reduced motion.

Backend/migration/bot bukan tempat perubahan kosmetik. File integrasi/brief lama menjelaskan basis headless; panduan 2.5D dari 4.7 sudah historis. Referensi aktif dan provenance ada di `design/SOURCE_OF_TRUTH.json`.

Update terbaru: gadai otomatis lama telah dihapus. `assetPlan` menjalankan pembangunan atau pelunasan tagihan. Pelunasan memakai versi terbaru pada setiap langkah, berhenti saat panel ditutup/hidden/pause/state berubah, dan tidak diulang setelah jaringan gagal. Gadai manual/SELL_SET tetap dikonfirmasi inline. Lihat [GAMEPLAY_UPDATE.md](GAMEPLAY_UPDATE.md).

`mortgageAdvice` memakai optimisasi subset dana dengan biaya strategi dari potensi sewa publik, kedekatan posisi lawan, bunga tebus, set lengkap dan hampir lengkap. Set lengkap dikeluarkan seluruhnya jika aset di luar set cukup. Tidak melihat deck, RNG, atau memory bot; estimasinya bukan hasil permainan masa depan. Preview tidak mengeksekusi transaksi.

Bingkai selected tile dan dua kotak deck tengah telah dihapus. Fokus keyboard singkat tetap tersedia untuk aksesibilitas. Ikon petak khusus memakai aset PNG aktif; berkas master desain historis tidak ikut source aktif. SVG dipakai untuk geometri papan; gambar bangunan dirender dari atlas PNG transparan yang sama pada seluruh modul. `specialTileInfo` tidak pernah ACK/draw/roll/pay; membaca katalog atau info pajak tidak memproses efek. Popup memiliki header/footer tetap dan body yang scroll; tinggi umum dibatasi 80% viewport/maksimal 620px, popup compact 76%/maksimal 560px.


Papan menampilkan nominal sewa polos tanpa ₦ dan tanpa latar untuk properti milik pemain. Harga beli tetap di sertifikat/pembelian. Utilitas menampilkan pengali dadu; nominal akhir mengikuti hasil dadu dan aturan kartu. Saldo/transaksi tetap memakai ₦. Garis kepemilikan mengikuti pion; animasi hanya sekali saat pemilik berubah, menghormati reduced motion. Rumah 1–4 dan hotel memakai gambar tanpa badge teks.

Input nominal adalah native text input dengan `inputmode=numeric` untuk tawaran bulat atau `decimal` untuk barter/gadai, serta `enterkeyhint=done`. Nilai 0 dipilih saat fokus; nol di depan dibuang saat input dengan caret disesuaikan. Nilai kosong dan desimal parsial dipertahankan. `updateTradeBody`/`updateAssetBody` mempertahankan node input selama pembaruan yang kompatibel.
