# Rencana peningkatan fondasi bot: cakupan gameplay lengkap

Status: rencana, belum diterapkan. Audit pada tahap ini hanya membaca source; tidak ada tes atau pertandingan yang dijalankan.

## Tujuan dan arti cakupan 100%

Fondasi bersama Raka, Bima, Sari, Nusa, Apex, dan Kresna harus merepresentasikan seluruh aturan gameplay aktif sebelum peningkatan bobot strategi. Target utamanya engine schema 2 dengan rulepack `nusantara-c1009-2`, mencakup preset digital dan classic. Save schema 1 tetap menggunakan adapter dan engine legacy tersendiri; perilaku schema 2 tidak diterapkan ke save lama.

Definisi selesai: setiap aturan pada engine aktif memiliki ID, rujukan source, representasi pada fondasi, serta pemeriksaan deterministik terhadap engine. Cakupan meliputi 13 fase, 26 jenis aksi, 40 petak, delapan kelompok warna, dan 32 kartu beserta urutan efek dan interupsinya. Perubahan rulepack harus memperbarui inventaris tersebut.

Legalitas dan akibat deterministik mengikuti engine. Probabilitas dadu, kartu tersembunyi, dan respons lawan memakai informasi publik dengan asumsi yang dinyatakan. Semua estimasi diberi batas horizon dan status kondisional. Skor kekuatan atau peluang menang heuristik tidak diperlakukan sebagai probabilitas terkalibrasi.

## Temuan audit yang menentukan prioritas

| Temuan | Bukti source | Tindakan yang direncanakan |
| --- | --- | --- |
| Utilitas biasa memakai lempar baru di engine, tetapi sebagian forecast/risk bot memakai dadu pergerakan | `lib/game.mjs:59`, `lib/bot/probability.mjs:65`, `lib/bot/risk.mjs:34` | Selaraskan forecast, risiko, dan ekspektasi tes ke engine sebelum tuning strategi |
| Semantik gerak/kartu diulang di beberapa kernel | `analysis.mjs` bagian `matrixFor`, `probability.mjs`, `risk.mjs` | Sediakan semantik transisi bersama; estimator boleh berbeda horizon tanpa berbeda aturan |
| Daftar kandidat bawaan merupakan seleksi heuristik | `game.mjs` bagian `botCandidates`, dibandingkan `command`, `canManage`, dan `canTrade` | Inventaris kemampuan diturunkan dari guard engine; seleksi kandidat dilakukan sesudah kemampuan diketahui |
| Proyeksi barter menyederhanakan penerimaan aset tergadai menjadi bayar bunga dan tetap tergadai | `negotiation.mjs` bagian `canonicalTradeDelta`; `game.mjs` bagian keputusan mortgage | Bandingkan cabang keep, langsung tebus, dan utang bunga sebelum proyeksi pembangunan |
| Allocator dapat menaikkan level dan mengurangi kas langsung pada proyeksi setelah barter | `allocation.mjs` bagian `allocateDevelopment` dan `postTradeDevelopment` | Validasi jalur melalui engine; berhenti atau bercabang ketika pembangunan memicu minat/lelang |
| Analisis dan scoring dapat menghabiskan budget sebelum strategi persona | `strategy.mjs` bagian `planDecision`; `persona-router.mjs` | Sediakan jalur mekanis cepat, batas kerja tiap tahap, serta waktu untuk persona dan validasi akhir |

Temuan ini berasal dari audit source, bukan pengukuran win rate atau bukti audit formal seluruh kombinasi state.

## 1. Buat kontrak gameplay yang dapat dilacak

Hasil: inventaris aturan yang dapat dibaca mesin dan matriks fase–aktor–aksi. Setiap entri mencatat kondisi legal, domain parameter, biaya, dampak, fase berikutnya, interupsi, pemulihan konteks, dan bukti pemeriksaannya. Status awal seluruh entri adalah belum diverifikasi.

Fase yang dicakup: `starting`, `roll`, `jail`, `buy`, `card`, `resolve`, `end`, `auction`, `buildOffer`, `mortgage`, `trade`, `debt`, dan `won`. `resolve` diselesaikan oleh engine; `won` menghentikan keputusan baru.

Seluruh jenis aksi:

```text
START_ROLL ROLL JAIL_PAY JAIL_CARD BUY AUCTION BID PASS
BUILD SELL SELL_SET MORTGAGE REDEEM BUILD_JOIN BUILD_DECLINE
ACK CLAIM_RENT MORTGAGE_KEEP MORTGAGE_REDEEM PAY BANKRUPT END
OFFER COUNTER TRADE_ACCEPT TRADE_REJECT
```

Domain seperti nominal bid, kombinasi aset barter, kartu penjara yang dipilih, dan ID klaim wajib dijelaskan. Planner memilih subset kandidat sesuai budget; kemampuan fondasi untuk mengenali suatu aksi tidak bergantung pada kandidat itu terpilih untuk dicari.

## 2. Sediakan pengetahuan gameplay bersama dari engine

Gunakan query dan validator engine yang sama untuk seluruh persona. Jika helper tambahan diperlukan, ekspor atau susun ulang helper tanpa mengubah semantik aturan. Hindari salinan formula harga, stok, bunga, dan guard pada setiap persona.

| Keluarga aturan | Cakupan wajib |
| --- | --- |
| Pembukaan dan giliran | Urutan kursi, lempar awal dan seri, pemain aktif/keluar, ronde dan turnSerial |
| Gerak dan penjara | Gaji melintasi Mulai ke depan, mundur, doubles dan lempar tambahan, tiga doubles, percobaan penjara ketiga, denda sebelum gerak, kartu bebas penjara |
| Properti dan sewa | Kota, monopoli tanah kosong, stasiun, utilitas dengan lempar baru, pengali kartu, gadai, pajak, sewa manual/otomatis dan kedaluwarsa klaim |
| Bangunan | Bangun/jual merata, larangan membangun pada kelompok tergadai, stok 32 rumah/12 hotel, pengembalian rumah saat hotel, batas memecah hotel dan SELL_SET |
| Lelang | Minimum dan kenaikan dari aturan bersama, nominal internal yang sah, bid terbuka, PASS dan masuk kembali, kas penawar tertinggi, target dan rangkaian lelang bangunan |
| Barter dan gadai | Kas/aset/kartu dua arah, counter dan pembatalan, larangan memindahkan kelompok berbangunan, validasi ulang saat menerima, bunga penerimaan dan pilihan tebus |
| Utang dan bangkrut | Debitur dapat berbeda dari pemilik giliran, likuidasi legal, pembayaran tepat satu kali, kondisi bangkrut, transfer ke kreditur atau antrean lelang bank |
| Kartu dan antrean | Seluruh 32 kartu, nearest/mundur/gerak absolut, pengali, perbaikan, pembayaran antarsemua pemain, kartu berantai, kartu penjara keluar/masuk deck |
| Interupsi dan pemulihan | Konteks sebelum barter/klaim/bangunan, utang bertingkat, mortgage setelah transfer, resume dan pemain bangkrut di tengah antrean |
| Batas runtime | Observasi publik, memori milik bot sendiri, versi state, idempotensi command, pembatalan, respons worker usang, save legacy |

Hak bertindak perlu dibedakan dari pemilik giliran. Engine memberi peluang tertentu untuk mengelola aset, menagih, menawar, dan barter di luar giliran. Scheduler menyediakan kesempatan yang dibatasi agar aksi opsional tidak membuat kewajiban atau giliran utama tertunda terus.

## 3. Selaraskan transisi dan proyeksi dengan engine

- Perbaiki mismatch utilitas beserta tes yang mengunci asumsi lama. Jadikan perilaku engine acuan.
- Gunakan semantik bersama untuk gerak, penjara, kartu, pajak, sewa, serta perubahan stok. Cache boleh dipakai kembali berdasarkan ketergantungan yang benar, termasuk aturan, kartu ditahan, dan keadaan penjara/doubles.
- Proyeksi deterministik menggunakan transisi engine. Hasil acak menggunakan cabang atau sampling publik yang dibatasi; dadu pergerakan dan dadu utilitas memiliki peristiwa acak terpisah.
- Jalur setelah barter menyelesaikan pilihan mortgage dan potensi utangnya sebelum mengasumsikan modal dapat dibangun.
- Rencana bangun berhenti atau bercabang pada `buildOffer`/lelang. Keberhasilan membeli bangunan dan pendapatan tambahannya tetap kondisional sampai transaksi selesai.
- Proyeksi utang mengikuti urutan pembayaran: pendapatan yang baru datang kemudian tidak dianggap tersedia untuk tagihan sebelumnya.
- Eksekusi hanya aksi pertama yang sah, lalu hitung ulang dari state terbaru. Jalur dibatalkan jika versi, aktor, kepemilikan, stok, atau konteks berubah.

## 4. Tingkatkan evaluasi ekonomi dan perencanaan

Semua evaluator menerima fakta keuangan yang konsisten: kas aktual, kas terikat, kewajiban pasti, cadangan risiko, sumber likuidasi yang dapat dicapai secara legal, biaya bunga/tebus, dan modal pembangunan tersisa. Pisahkan batas wajib engine dari preferensi cadangan kas persona.

Bandingkan hasil sebelum/sesudah aksi: pendapatan sewa, eksposur tagihan, kesiapan monopoli, biaya pendanaan, stok, dan penguatan lawan. Pertahankan skala skor yang kompatibel dengan bonus pakar persona.

Perluas rute yang sudah ada menjadi gadai aset terpisah → tebus kelompok → bangun, pilihan tingkat rumah/hotel, pembiayaan pembelian atau lelang, dan penyelamatan utang. Pencarian memiliki batas kedalaman, lebar, node, serta waktu. Prediksi barter mempertimbangkan pilihan kedua pihak dan riwayat penolakan; pencarian nominal tidak mengasumsikan penerimaan selalu monoton.

Pemangkasan kandidat menjaga aksi wajib, jalan keluar fase, opsi bertahan hidup, dan keragaman aksi ekonomi. Aksi legal yang dinilai buruk secara ekonomi tetap dapat dikenali sebagai legal; kebijakan strategi menentukan apakah ia layak dipilih.

## 5. Integrasikan ke enam persona dan kendalikan biaya berpikir

Pertahankan kontrak `planDecision`/`decidePersona`, identitas persona, serta field kandidat yang digunakan model saat ini. Informasi tambahan masuk sebagai field opsional dan kontrak berversi agar lampiran pembaruan Nusa berikutnya dapat diintegrasikan tanpa menimpa fondasi bersama.

Context keputusan diteruskan ke analisis, proyeksi, negosiasi, dan adapter persona. Jalur mekanis mengambil keputusan murah; pekerjaan opsional hanya menggunakan sisa budget. Sediakan cadangan waktu untuk strategi persona, validasi akhir, dan fallback.

Semua keluaran akhir melewati guard yang sama. Catat proposal persona yang ditolak, exception, budget habis, dan fallback secara terpisah. Kesalahan model tidak hilang dari laporan hanya karena fallback berhasil mengeluarkan aksi legal.

Source lokal dan salinan Edge disinkronkan sesudah implementasi. Perubahan ini tidak memerlukan perubahan aturan permainan atau database; deployment merupakan tahap terpisah.

## 6. Verifikasi cepat sesuai batas pengguna

Tidak ada turnamen, training, pengukuran win rate, atau rangkaian pertandingan. Hindari menjalankan suite gabungan yang diam-diam berisi banyak game, termasuk kasus 20 game pada `tests/classic.test.mjs`.

### Pemeriksaan aturan langsung

Gunakan skenario deterministik singkat per aturan/jenis aksi, termasuk batas legal/ilegal dan efek berikutnya. Gunakan atau perbaiki fixture yang sudah ada; ini tidak menjalankan pertandingan tambahan atau search mendalam.

Prioritas kasus langka: utilitas reroll, 32 efek kartu, tiga doubles, denda penjara lalu utang, klaim sewa kedaluwarsa, pemesanan bangunan langka, hotel dengan rumah bank kurang, PASS yang direset bid baru, barter saat lelang, transfer aset tergadai, counter berganti arah, dan kebangkrutan ke pemain/bank.

Inventaris mencatat mana yang sudah diperiksa dan mana yang belum. Persentase cakupan berasal dari daftar aturan dan bukti semantik, bukan sekadar jumlah baris kode yang dilalui.

### Tepat satu flash game

- Enam persona dalam satu match dengan seed tetap, memakai router dan scheduler produksi.
- Gunakan pembukaan dan preset classic agar alur klaim manual ikut berpeluang muncul; preset digital diperiksa melalui skenario langsung.
- Budget target 24 ms/keputusan, batas 600 aksi atau 30 detik; proses/worker dapat dihentikan agar pekerjaan sinkron tidak melewati batas total tanpa kendali.
- Catat keputusan setiap persona, fase yang benar-benar terjadi, aksi, waktu, fallback, dan alasan berhenti.
- Syarat smoke check: semua persona sempat bertindak, nol exception/no-action pada state yang memerlukan keputusan, nol proposal akhir persona ilegal, dan nol command permainan yang ditolak engine. Penolakan kandidat hipotetis di sandbox dicatat terpisah.
- Periksa kas tidak negatif dan integer, kepemilikan valid, stok konsisten, serta kemajuan state. Jika ada kegagalan, simpan checkpoint untuk reproduksi langsung tanpa memulai turnamen.
- Jika cap tercapai, laporkan game terpotong. Pemenang hanya dilaporkan ketika engine mencapai `won`.

Satu game membuktikan kelancaran pada alur yang sempat terjadi. Klaim cakupan gameplay 100% baru dipakai setelah seluruh entri aturan selesai dipetakan, direpresentasikan, dan diperiksa; kombinasi state dan strategi yang belum diperiksa tetap disebutkan.

## Urutan implementasi dan hasil yang diserahkan

1. Inventaris aturan, versi yang didukung, dan matriks fase–aktor–aksi.
2. Adapter pengetahuan gameplay dan perbaikan ketidaksesuaian aturan yang ditemukan.
3. Proyeksi engine, urutan kewajiban, serta interupsi/resume yang konsisten.
4. Evaluator, kandidat, dan rute perencanaan yang memakai kontrak tersebut.
5. Integrasi enam persona, pembagian budget, guard akhir, dan sinkronisasi Edge.
6. Build/typecheck singkat, pemeriksaan aturan langsung, satu flash game, dan laporan cakupan aktual.

Hasil akhir berupa source fondasi bersama, dokumentasi kontrak untuk update model berikutnya, matriks aturan dengan status bukti, dan satu laporan flash game. Seluruh tahap implementasi pada dokumen ini masih berstatus rencana.
