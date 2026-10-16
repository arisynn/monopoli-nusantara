# Monopoli Nusantara 4.8.1 — UI Ringkas, Nusa & Properti

Status implementasi: **selesai dan teruji secara lokal** untuk ruang lingkup UI/aset/pembangunan/ledger/draft yang disetujui. Konektivitas Supabase live, perangkat Android fisik, Groq live dan deployment Vercel **belum terverifikasi**. Build Vercel lokal berhasil; ini bukan klaim deployment atau multiplayer production-ready.

## Audit dan penyebab masalah

Basis adalah source aktif v4.8, dengan provenance logic v4.6.1. Tidak ada metadata Git/branch pada workspace ini; nomor versi bukan bukti provenance. Tidak memakai ZIP source lama/hotfix sebagai pengganti. Bukti perubahan terhadap ZIP v4.8 terdapat pada `COMPACT_CHANGED_FILES.json`, dan integritas inti pada `COMPACT_CORE_INTEGRITY.json`.

- Riwayat gameplay masih satu baris sesudah caption petak. Belum ada baris transaksi terpisah atau ledger profil.
- Uang memakai badge absolut di luar kapsul. Ini diganti area tetap dalam kartu; sumbernya tetap transaksi engine, tanpa menghitung perubahan saldo frontend.
- Manajemen pembangunan hanya per petak. UI belum menunjukkan seluruh kelompok atau jalur barter untuk melengkapi set.
- Sejumlah select masih memakai pemilih native browser. Draft barter hanya ada pada memori UI dan mudah hilang ketika ditutup/refresh.
- Popup lama memakai ruang dekoratif besar, sementara X sudut dan tombol footer sama-sama mengambil ruang. Sertifikat masih berupa detail umum, belum kartu klasik ringkas.
- Aset lama di luar papan masih terhubung ke CSS/popup/precache. Pemakainya diganti dahulu; setelah itu file dihentikan dan precache dihitung dari file aktual.
- Status gagal mengambil config disamakan dengan belum dikonfigurasi. Sekarang kegagalan request, ENV tidak tersedia, identitas belum masuk dan koneksi room terputus dibedakan.
- Pada pengujian baru, baris aktivitas terlambat satu tahap saat finance head sudah memperlihatkan saldo. Renderer kini membaca `head.source` yang sedang ditampilkan, dengan larangan khusus saat diceRolling agar hasil tidak bocor.
- Regresi layout baru 320×568 sempat kelebihan tinggi dua piksel untuk dua baris kapsul. Margin diperbaiki dan seluruh matriks portrait diuji ulang sampai lulus.

Perbaikan dadu lama tetap: pip dekoratif, reveal sah sebelum movement, callback lama dibatalkan, pasangan baru tidak kembali ke angka log sebelumnya. Guard queue kosong tetap mencegah `Cannot read properties of undefined (reading 'kind')`. Penjara/kartu masih mengikuti identitas event/timeline existing; tidak membuat effect render baru yang memproses kartu atau pembayaran ulang.

## Implementasi

| Bagian rencana | Hasil |
| --- | --- |
| Dua baris informasi | Aksi dan aliran Nusa, tinggi tetap, di atas caption petak; ketuk membuka riwayat. ID/log publik dideduplikasi. Saat rolling, hasil dadu belum ditulis. |
| Identitas Nusa | PNG transparan N navy dengan dua ombak emas; master SVG pada `design/currency`. Dipakai di saldo, harga dan popup. TextContent/angka dan format simpanan tetap. Teks harga SVG papan tetap tipografi kecil yang tajam. |
| Kelola Properti | Aset → Bangun. Semua delapan kelompok warna, kepemilikan, bangunan, biaya, sewa kini/berikutnya; kelompok legal lebih dulu. Kurang properti/gadai/merata/saldo/stok/fase dijelaskan sesuai engine. |
| Barter dari set | Properti milik lawan dapat membuka draft ke pemiliknya. Tidak mengirim otomatis; draft lama pada target sama dipertahankan dan pilihan ditambah. Properti bank atau set yang telah dibangun tidak memberi akses barter ilegal. |
| Rumah/hotel | PNG kecil di strip kelompok, berputar dengan koordinat lokal tile pada empat sisi. Level dan aturan bank tidak berubah. |
| Kapsul | Enam hewan kepala–bahu, pion memanjang dan baris transaksi di dalam batas kapsul; tidak ada cash badge mengambang. Node event sama stabil pada render ulang. |
| Profil/ledger | Saldo, total aset, status dan transaksi publik pemain terpilih. Pembayaran antar pemain mempunyai kedua sisi yang tepat. Log tersimpan maksimum 300 kejadian; tidak mengaku sebagai ledger seluruh umur pertandingan. |
| Navigasi | Riwayat melalui info, profil melalui kapsul, Aset/Barter pada konsol, kamera pada header. Salinan akses tersebut di hamburger gameplay dihapus. Popup lain tetap dapat ditutup lewat footer/Back/Escape. |
| Pilihan game | Listbox HTML dalam modul game, termasuk keyboard/fokus/Escape; select native hanya adapter nilai tersembunyi. Tidak menambah prompt/confirm/alert. |
| Draft barter | Privat pada perangkat per match, account/seat, lawan dan fingerprint counteroffer. Bertahan setelah menutup, berpindah picker, refresh dan berpindah lawan. Raw input tidak masuk command; ownership/saldo divalidasi ulang. Draft dihapus hanya setelah tawaran berhasil atau tindakan kosongkan eksplisit. |
| Popup | Kartu retro kecil, sertifikat ringkas, profil horizontal dan modul lain dengan padding lebih padat. X disembunyikan bila ada tombol footer; exit footer tetap ada. |
| Cache | `nusantara-classic-v481`; precache aktual, tanpa referensi aset dihapus. Tidak menghapus save/auth pengguna. |

Perintah BUILD menutup panel agar urutan transaksi/keputusan bank existing tampil. UI tidak memotong buildOffer/lelang bangunan, tidak mengubah rulepack dan tidak membangun sekumpulan aset melalui satu mutasi buatan. Kelompok harus **lengkap**, bukan sembarang dua properti sewarna.

## Kartu dan aset

Deck engine tetap **16 Kesempatan + 16 Dana Umum**. Ada 16 ilustrasi kontekstual dalam satu PNG atlas, bukan pengurangan jumlah kartu atau pemilihan gambar acak. Pemetaan tiap idx, judul, teks, baris/kolom dan konteks dicatat dalam `CARD_ASSET_MAP.json` dan diuji untuk semua 32 kartu.

Contoh: mundur → panah kiri; maju → panah kanan/perjalanan; stasiun → kereta; penjara → jeruji; bebas penjara → kartu; dokter/rumah sakit → tas medis; pendidikan → buku; perbaikan → bangunan; pajak → dokumen; hadiah lomba → piala; ulang tahun → kado; uang → uang/koin. Nominal tidak dibakar ke PNG; UI membaca teks persis dari engine. Beberapa kartu satu konteks memakai ilustrasi sama secara sengaja.

Runtime kini **17 PNG, 1.343.637 byte**, termasuk atlas. Enam hewan: kucing, rubah, burung hantu, harimau, panda, kelinci. Enam pion panjang: biru, merah, hijau, emas, ungu, merah muda. Numeric IDs tetap 0–5 dan tidak mengubah save. Ikon UI menggunakan PNG mask atlas agar warna kontras tetap mengikuti tombol. Tidak menambah dependency animasi atau rendering berat.

**22 file runtime lama dihentikan**: 21 pada tahap cleanup, lalu atlas pion lama diganti sesuai instruksi berikutnya. Sepuluh PNG ikon papan yang masih cocok dipertahankan dengan hash identik. Master SVG ikon board/logo dan JSON glyph di `design` adalah sumber desain, bukan aset runtime yang diunduh game.

Papan memakai SVG untuk geometri, teks, transform/hit area dan crop image; seluruh ilustrasinya memakai PNG. Papan tidak diratakan menjadi screenshot agar nama, harga, indikator kepemilikan dan zoom tetap tajam serta mengikuti state. Tidak ada perspektif/3D.

## Audit online dan keamanan

`ONLINE_CONFIG_AUDIT.json` mencatat hasil lokal tanpa secret: `.env`, `.env.local`, `.env.production` tidak tersedia; `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` belum ada pada proses. Endpoint config aktual merespons HTTP 200 `{online:false,provider:'supabase'}`. Karena itu online lokal belum aktif. Tidak ada akses project Supabase live pada sesi ini.

Pemeriksaan source:

- `supabaseConfig` membutuhkan tiga variabel server dan URL HTTPS yang valid. Browser hanya menerima URL dan key publik; service role tetap server.
- Node runtime membaca process ENV; `.env` bukan otomatis. Vercel membaca environment settings per deployment. `vercel.json` memakai framework Other, Node 24/output dist, dengan rewrite API ke adapter existing.
- Auth redirect dikonsumsi melalui pemeriksaan user dan menghapus hash token; email signup/link menggunakan origin aplikasi. Site URL dan allowlist redirect **harus dicek pada dashboard project sebenarnya**, belum terverifikasi.
- Tiga migration existing tersedia. Source RLS membatasi membership/update hints; snapshot tidak dibuka sebagai tabel writable oleh anggota. RPC commit memakai revision, row locking dan receipts. Realtime hanya mengirim hint revision pada `mn_room_updates`, lalu client mengambil snapshot berotorisasi.
- Refresh/reconnect, heartbeat dan mekanisme auto-pause/resume existing dipertahankan. Recovery HTTP tetap ada jika Realtime gagal. Tidak mengubah room dari callback animasi, saldo dari UI atau bot dari host.
- Bot online tetap backend jobs/lease/recovery. Flag bot default false sampai worker staging diverifikasi. Groq tetap opsional dengan fallback lokal.

Tidak ada perubahan database/migration atau produksi. Audit source bukan pengujian RLS/Auth/Realtime live. Tidak meminta atau mencetak secret. Jalankan `npm run diagnose:online` pada runtime yang ingin didiagnosis; laporannya hanya boolean/shape, jangan mengirim nilai key.

## Validasi dan bukti

Hasil final dirangkum pada `COMPACT_VERIFICATION.json`, dengan laporan mentah:

- `CLASSIC_TEST_RESULTS.json`: **333/333**, gagal 0, skipped 0; engine, security, idempotency, revision, bot, Groq mock, save, room/backend serta frontend. Frontend subset 67 tes.
- `CLASSIC_BROWSER_RESULTS.json`: **16 skenario**; 320×568, 360×640, 390×844, 430×932 dengan 2/4/6 peserta, desktop, start ulang, pip reveal, klik ganda, angka baru tetap, refresh/reduced motion. Board pas lebar layar, tanpa horizontal overflow/scroll tindakan utama.
- `COMPACT_BROWSER_RESULTS.json`: **18 skenario**; pemilihan dalam game, draft per lawan/refresh/counter/submit, tiga popup kartu kontekstual, empat sertifikat, PNG rumah/hotel empat sisi, popup pendukung/footer, enam portrait dan logo Nusa idempotent. Semua 32 mapping juga diuji unit, bukan hanya tiga popup tersebut.
- `PLAN_BROWSER_RESULTS.json`: **5 skenario gabungan**; delapan kelompok, guard set lengkap, prefilled barter, satu BUILD setelah double-click, uang dalam kartu, ledger/profil/refresh, enam peserta/read-only, online belum dikonfigurasi/gagal/perlu masuk dengan mock dan retry.
- `CLASSIC_SESSION_SMOKE.json`: tiga sesi 2/3/4 peserta selesai, 389/428/610 tindakan. Human disimulasikan planner lokal dengan search budget nol; ini smoke orchestration, **bukan benchmark daya saing bot atau gameplay manusia**.
- TypeScript semantik lulus; syntax/import graph **190 source/output modules**, 0 kegagalan. `npm run build:vercel` dan build melalui `npm test` berhasil. Tidak ada script lint pada basis.
- Integritas: **57 file inti dibandingkan**, 56 identik terhadap delivered v4.8; satu perubahan `lib/pawns.mjs` hanya metadata gambar/nama warna. Game engine, content/ekonomi, algoritma bot, API/server, Supabase migrations/functions dan shared timeline identik dengan v4.8.

Batas: browser emulasi lokal, tanpa Android fisik, sesi lintas perangkat internet, Supabase live, Groq live atau deploy Vercel. Konfigurasi online pada tes browser memakai mock yang diberi label. Skenario multi-client memakai service/transport doubles, tidak menguji PostgreSQL/RLS/Realtime sungguhan. Benchmark bot lama disimpan sebagai sejarah; update ini tidak mengklaim peningkatan strategi baru.

## Deployment

1. Pakai source ZIP 4.8.1 dan Node 24, bukan frontend v2.11/ZIP hotfix.
2. Vercel framework Other; `npm run build:vercel`; output dist; pertahankan `vercel.json` dan folder api/app/lib.
3. Atur ENV server Supabase pada environment deployment yang benar. Tidak memakai `NEXT_PUBLIC_` untuk service role. Groq opsional, Redis tidak dibutuhkan VS Bot/Supabase room baru.
4. Periksa Auth Site URL/redirect, guest/email, migration yang sudah diterapkan, permission/RLS dan publikasi Realtime di staging. Ikuti `DEPLOY_SUPABASE.md`/`DEPLOY_HYBRID.md`; jangan mengeksekusi ulang migration sembarang.
5. Redeploy lalu pastikan `/build.json` versi 4.8.1, config online benar dan cache shell terbaru terpasang. Save lokal tidak perlu dihapus.
6. Jalankan tes Supabase live hanya terhadap project staging yang benar dan lingkungan terotorisasi, kemudian uji lintas perangkat sebelum menandai online siap produksi.

## Checklist manual

- [ ] Android portrait kecil/besar: 2, 3, 4, 6 peserta; ukuran huruf, ketuk tile, pan/zoom, kembali overview.
- [ ] Enam hewan/pion jelas, tidak terpotong; beberapa pion dalam satu tile; rumah/hotel pada empat sisi.
- [ ] Dadu lama tidak muncul kembali; selama shuffle tidak ada hasil di HUD/riwayat; reveal → pion → efek.
- [ ] Buka setiap jenis kartu dan sertifikat; nominal dari engine, gambar sesuai konteks; owner-only ACK; tanpa X menutupi footer.
- [ ] Aksi/Nusa dua baris, ketuk riwayat, pembayaran ke bank dan antar pemain; feedback tetap di dalam kapsul.
- [ ] Klik profil sendiri/lawan: ledger yang tepat, lawan read-only, refresh tidak menambah transaksi/animasi.
- [ ] Aset → Bangun: seluruh warna; kurang satu, digadai, bank habis, merata, hotel, kas kurang, utang/lelang, serta buildOffer existing.
- [ ] Barter dari kelompok: lawan/properti tepat; draft bertahan tutup/refresh, kembali picker, pindah lawan, tawar balik, explicit submit.
- [ ] Online staging: Auth benar, create/join/ready, 2/4/6 klien, kepemilikan kursi, host disconnect, pause vote, 90 detik, semua manusia siap resume, reconnect tanpa replay.
- [ ] Online bot staging: scheduler/lease, pause saat pekerjaan, revision berubah, worker recovery, tanpa host browser.
- [ ] Cache sesudah redeploy/offline awal: versi benar dan save lama tetap terbaca; reduced motion nyaman.

Daftar file lengkap dan hash terdapat di `PACKAGE_MANIFEST.json`; diff rilis di `COMPACT_CHANGED_FILES.json`. Bukti screenshot lokal disertakan terpisah bersama laporan keluaran, bukan artwork runtime game.
