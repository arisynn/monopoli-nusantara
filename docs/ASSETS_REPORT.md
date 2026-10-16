# Monopoli Nusantara 4.8.2 — Aset Terpadu & Info Papan

Status: **selesai dan teruji lokal**, termasuk pembangunan berulang, pilihan jumlah bangunan, gadai otomatis, informasi semua petak dan ikon papan PNG baru. Supabase/Groq live, Android fisik dan deployment Vercel **belum terverifikasi**. Tidak mengubah engine, ekonomi atau aturan pajak existing.

## Audit dan penyebab yang ditemukan

Basis source aktif adalah delivered v4.8.1, bukan ZIP frontend lama. Workspace tidak mempunyai metadata Git, jadi tidak mengklaim commit/branch baru. Integritas dibandingkan terhadap ZIP v4.8.1: **57/57 file inti identik**, meliputi engine, content/angka, bot, shared timeline, server/API, adapter dan migrations.

- Bingkai pemilihan berasal dari rect tambahan pada tile terpilih. Rect ini sudah dihapus; fokus keyboard sementara dipertahankan untuk aksesibilitas. Dua kotak deck dekoratif di tengah juga dihapus.
- Pengujian awal berhasil membuka petak nonlokasi; kegagalan membuka total yang dilaporkan pengguna tidak berhasil direproduksi di Chromium lokal. Kekurangan yang terkonfirmasi: petak itu hanya mendapat teks umum, tidak mempunyai info pajak rinci atau katalog kartu. Sekarang setiap jenis mempunyai informasi khusus, dan ketukan seluruh 40 petak diuji.
- Ikon lama sebenarnya sudah PNG runtime, tetapi merupakan rasterisasi SVG lama. Kontennya kini diganti sepuluh ilustrasi PNG hasil generasi baru yang konsisten dengan gaya kartu retro. Master SVG ikon papan lama dihentikan; master baru PNG.
- Pembangunan sebelumnya berada di modul terpisah, dan BUILD menutup popup karena semua popup manual menahan timeline. Sekarang satu Aset Saya mempunyai tab Properti, Bangun, Gadai otomatis dan Digadai. Feedback transaksi aset milik tindakan sendiri dapat maju sementara panel tetap terbuka; keputusan/dadu/kartu/transaksi lain tetap dilindungi.
- Daftar panjang sebelumnya bisa memakai hampir seluruh tinggi layar. Popup kini maksimal `min(640px, viewport − 88px)`, footer tetap terjangkau, isi dapat digulir. Katalog deck mempunyai area scroll tambahan maksimal `min(42dvh, 360px)`.

## Implementasi

| Permintaan | Hasil teruji |
| --- | --- |
| Tanpa bingkai tile | Rect selected permanen dihapus, hit area 40 petak dan kamera tetap. |
| Tanpa kotak deck tengah | Hanya branding Nusantara sederhana di tengah; daftar melalui petak. |
| Info petak nonlokasi | Mulai, Penjara, Masuk Penjara, Parkir Bebas, pajak dan dua deck mendapat info khusus. Membuka info tidak menjalankan command. |
| Katalog Kesempatan/Dana Umum | Masing-masing 16 kartu dari DECKS, ikon kontekstual, judul dan teks asli. Ini daftar efek publik, bukan urutan deck atau kartu masa depan. |
| Aset/manajemen menyatu | Properti, kelompok warna, pembangunan, jual/gadai/tebus dan konfirmasi manual inline dalam satu Aset Saya. Sertifikat tetap info terpisah. Alias modul lama diarahkan ke panel yang sama untuk kompatibilitas. |
| Upgrade tanpa tutup | Panel, kelompok terbuka dan scroll dipertahankan. Saldo, bangunan, stok dan kontrol diperbarui setelah setiap transaksi. |
| Jumlah bangunan | Pemain memilih tambahan untuk satu kelompok. Perintah BUILD satu per satu, dibagi merata berdasarkan legalitas terkini, maksimal 15 niat per rencana. Preview bukan mutasi authoritative. |
| Gadai Otomatis | Target dana, daftar aset dan total penerimaan ditampilkan sebelum perintah dijalankan. Daftar/revision harus tetap cocok saat eksekusi dimulai. |
| Ikon papan | Sepuluh PNG transparan baru: Mulai, ?, peti, kereta, lampu, air, pajak, mobil, penjara, polisi. Tidak ada aset SVG di runtime. Geometri/teks/hit area papan tetap SVG dinamis agar tajam saat zoom. |
| Pajak jelas | Penghasilan **N 200**, Kemewahan **N 100**, tetap ke **Bank**, tanpa persentase kekayaan atau jackpot Parkir Bebas. Ditampilkan pada tile, info, settlement dan Aturan. |
| Cache | UI 4.8.2 dan cache `nusantara-classic-v482`; save/auth tidak dihapus. |

## Gadai otomatis: cara memilih

Penasihat lokal memakai informasi publik dan validator MORTGAGE existing. Aset dengan bangunan dalam kelompok, sudah digadai, atau tidak berhak dikelola dikecualikan. Jika dana dari aset di luar set lengkap cukup, seluruh set lengkap dikeluarkan dari pilihan. Bila tidak cukup, UI menjelaskan bahwa sebagian set lengkap diperlukan.

Optimisasi subset mencari cakupan dana dengan perkiraan kerugian strategi rendah, mempertimbangkan penerimaan gadai, bunga pemulihan, sewa saat ini, posisi lawan dalam jangkauan dua dadu, set lengkap dan kelompok hampir lengkap. Tidak memakai RNG masa depan, susunan deck atau memori privat bot. Heuristik ini bantuan keputusan, bukan jaminan strategi optimal atau keuntungan pasti.

Pratinjau dibekukan pada daftar yang ditinjau selama rencana berjalan/selesai. Daftar tidak tiba-tiba diganti akibat aset sudah tergadai. Untuk rencana baru pemain menggunakan **Hitung rekomendasi baru** atau mengubah target. Daftar dan revision usang ditolak sebelum permintaan pertama; setiap gadai berikutnya divalidasi ulang oleh engine/backend.

## Keselamatan antrean dan presentasi

`GameSession.assetPlan` hanya niat UI sementara, tidak masuk autosave atau Supabase snapshot. `assetPresentation` mencocokkan match, revision, seat, jenis dan pemilik transaksi sebelum membolehkan head finansial maju di balik panel Aset. Ini tidak mengizinkan auto-ACK kartu, auto-roll atau pembayaran ulang pajak/sewa. Bot lokal tetap ditahan ketika panel manual terbuka.

Setiap langkah memakai `session.act` dengan UUID/requestId dan expectedVersion. Online mengirim satu intent BUILD/MORTGAGE, tidak mengirim saldo, hasil dadu, level akhir atau snapshot yang dipercaya server. Backend existing tetap memeriksa membership, phase, saldo, persediaan bank, building order dan revision.

Rencana berhenti ketika selesai, pemain menekan Hentikan, menutup/berpindah panel, halaman disembunyikan, pause/disconnect/reconnect, state berubah tak terduga, request gagal, atau stok memerlukan buildOffer/lelang. Keputusan bank tetap tampil melalui flow existing. Rencana tidak dilanjutkan otomatis setelah resume/refresh. Tindakan yang sudah sah tetap tersimpan; menghentikan sisa rencana tidak membatalkan transaksi yang telah dikirim/commit. Kegagalan tidak dicoba ulang secara buta dengan ID transaksi baru.

Pembangunan banyak **bukan satu transaksi batch atomik**. Ini serangkaian pembelian sah yang terpisah; bila kondisi berubah, hanya bagian yang sudah commit tetap berlaku. Tidak ada perubahan backend/RPC/migration yang diperlukan.

## Pajak modern dan kompatibilitas

Audit `BOARD` dan landing/payment engine mengonfirmasi angka tetap 2000/1000 internal unit, setara N 200/N 100. Tujuan `to:null` adalah Bank. UI tidak menghitung kekayaan, rumah/hotel atau memindahkan pajak ke Parkir Bebas. Pengujian dengan saldo besar dan bangunan tetap menghasilkan pungutan tetap sekali; replay ID sama tidak menggandakan pembayaran.

Nomor petak pengguna 5/39 adalah nomor satu-based; indeks engine 4/38. Tidak mengubah ekonomi atau angka save lama. Engine dan validator save/legacy tetap identik dengan rilis sebelumnya. Rangkaian baru diuji terhadap rulepack modern schema 2; kompatibilitas seluruh variasi save legacy secara visual belum diuji ulang dengan perangkat nyata.

## Berkas utama

- Baru: `frontend/asset-panel.mjs`, `frontend/mortgage-advisor.mjs`, `frontend/tile-info.mjs`, `scripts/test-assets-browser.mjs`, `design/board-icons-master.png`.
- Diubah: `frontend/app.mjs`, `session.mjs`, `development.mjs`, `popups.mjs`, `board.mjs`, `styles.css`, `service-worker.js`; sepuluh `public/assets/classic/*.png`; versi package/lock/build; tes/frontend dan suite browser existing; README/guide/provenance/manifest.
- Dihentikan: sepuluh master SVG lama pada `design/classic-icons`. Seluruh hasil runtime adalah 17 PNG; tujuh aset PNG lain dari v4.8.1 dipertahankan.
- Backend, bot, ekonomi, migration, shared timeline dan konfigurasi secret tidak berubah. Daftar/hash lengkap dalam `PACKAGE_MANIFEST.json`, diff pada `ASSETS_CHANGED_FILES.json`.

## Hasil pengujian

**346/346 tes otomatis**, gagal 0, skipped 0, termasuk 80 tes frontend. Laporan aktual: `CLASSIC_TEST_RESULTS.json`. Kasus baru meliputi pajak tetap/replay, semua info khusus, tidak ada rim/deck tengah, validator build preview, pembangunan merata, gadai otomatis, daftar review usang/substitusi, stok habis/buildOffer, pause/hidden/close/revision, request gagal, dan intent online per revision.

**47 skenario browser Chromium lokal**:

- `CLASSIC_BROWSER_RESULTS.json`: 16 — portrait 320×568/360×640/390×844/430×932, 2/4/6 peserta, desktop, start ulang, reveal dadu, klik ganda, refresh dan reduced motion.
- `COMPACT_BROWSER_RESULTS.json`: 18 — pemilihan game, draft/counter, kartu/sertifikat, popup/footer, PNG empat sisi dan enam avatar/Nusa.
- `PLAN_BROWSER_RESULTS.json`: 5 — informasi/ledger, delapan kelompok, barter terisi, panel aset tetap terbuka setelah build, enam peserta/read-only, tiga status online dengan mock/retry.
- `ASSETS_BROWSER_RESULTS.json`: 8 — seluruh 40 petak dapat diketuk tanpa mutasi state, katalog 16+16 terbatas dan scroll, dua info pajak, single + tiga tambahan bangunan di panel sama, gadai otomatis melindungi set lengkap, serta konfirmasi/cancel/gadai/tebus manual inline.

TypeScript semantik lulus. Syntax/import graph **197 source/output modules**, 0 gagal. Production build dan `build:vercel` berhasil. Tidak ada script lint pada basis. Tiga smoke sesi VS Bot 2/3/4 peserta selesai (389/428/610 tindakan); ini pengujian orchestration dengan keputusan manusia disimulasikan planner lokal, **bukan benchmark kompetitif baru**. Bot tidak dimodifikasi.

Pengujian online menggunakan service/transport doubles dan snapshot authoritative simulasi. Tidak menguji Postgres/RLS/Realtime sungguhan. Tidak ada Supabase/Groq live, Android fisik atau deployment Vercel aktual. Bukti terstruktur: `ASSETS_VERIFICATION.json`. Paket diverifikasi CRC/hash dan dibangun dari hasil ekstraksi; bukti delivery terpisah agar tidak membuat hash diri sendiri.

## Deployment dan cek manual

Gunakan source 4.8.2, Node 24, framework Vercel **Other**, build `npm run build:vercel`, output `dist`, dan `vercel.json` existing. Atur ENV server di deployment yang benar. Tidak ada migration baru; jangan mengulang migration sembarang. Di lingkungan lokal ini ENV Supabase tetap tidak tersedia, jadi tidak mengklaim online telah tersambung.

- [ ] Sesudah deploy `/build.json` menunjukkan 4.8.2 dan cache baru terpasang; save lama tetap ada.
- [ ] Android portrait 2–6 peserta: seluruh petak dapat diketuk, tidak ada bingkai selection permanen atau kotak tengah, zoom tetap tajam.
- [ ] Katalog deck 16 kartu dapat digulir dengan footer tetap terlihat; tidak mengambil kartu dari daftar.
- [ ] Pajak N 200/N 100 sekali ke Bank; tidak ada biaya saat hanya membuka info; Parkir Bebas tanpa jackpot.
- [ ] Aset Saya: Bangun tetap dalam panel, tambah 1/beberapa bangunan, merata, stok/uang/rent diperbarui tanpa buka-tutup.
- [ ] Saldo kurang, set belum lengkap, gadai, stok terbatas dan hotel menjalankan alasan/keputusan yang sah.
- [ ] Gadai otomatis: periksa pilihan, target dana, total, set lengkap terlindungi, daftar lama ditolak; Hitung ulang untuk rencana baru.
- [ ] Gadai manual, batal konfirmasi, tebus dan jual bangunan/set tetap pada modul Aset dengan kontrol sah.
- [ ] Tutup/hidden/putus/pause saat antrean: sisa berhenti, commit yang sudah sah tetap tersimpan, refresh/resume tidak replay.
- [ ] Staging multi-device: revision berubah saat antrean, host disconnect, bot server, auto-pause 90 detik dan resume semua manusia siap.
