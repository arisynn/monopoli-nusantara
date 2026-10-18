# Audit loop gadai–tebus NUSA V23

Tanggal: 18 Oktober 2026. Repo: `https://github.com/arisynn/monopoli-nusantara.git`.
Commit yang diaudit: `af88d14a08815ee1d139bbf5a9b945a24126d348` (`v23`), aplikasi 4.11.0.

**Kesimpulan:** bug muncul dari interaksi scorer ekonomi bersama dan kebijakan pendanaan persona. Engine menerima transaksi yang sah, tetapi bot berulang kali membatalkan keputusan pendanaannya sendiri. Penyebab terkonfirmasi pada Kresna dan NUSA; bukan semata-mata budget berpikir kurang. Memperbaiki NUSA saja tidak menyelesaikan masalah lintas persona.

Status pekerjaan: repo sudah di-clone, bukti diinventarisasi, replay dan reproduksi selesai. Perubahan dalam audit ini hanya laporan, hasil audit JSON, dan skrip reproduksi; **belum ada patch gameplay, push, atau deployment**. Rencana implementasi ada di bawah.

Revisi cakupan yang disetujui: [Termux Online AI Worker](TERMUX_ONLINE_WORKER_PLAN.md). Rencana tersebut memasukkan fix loop ini ke integrasi Termux/PM2, dengan porting runtime dan patch perilaku model dipisahkan serta dicatat versinya.

## 1. Sumber dan kekuatan bukti

- ZIP pengguna: `NUSA_BENCHMARK_V23_RESULTS.zip`.
- SHA-256 ZIP: `59e989f118cd152546f872453f796cc96f05e92d42e150f7987d34255e99f39d`.
- Seluruh 72 entri `SHA256SUMS.txt` di paket cocok.
- Seluruh 38 file `models/bot/` identik dengan `lib/bot/` pada commit repo di atas. Salinan bot di `supabase/functions/monopoli-bots/_shared/lib/bot/` juga identik dengan sumber repo.
- 18 match memiliki `summary.json` dan state akhir. Ada dua match parsial; keduanya tidak dimasukkan ke denominator hasil akhir.
- **6.630 aksi** dari 18 match selesai direplay melalui engine lab dan engine production. Seluruh hash state sebelum/sesudah setiap aksi dan state akhir cocok persis.
- Reproduksi keputusan baru juga dilakukan: Kresna dengan clock dibekukan agar tidak kehabisan budget; NUSA lewat jalur search default dengan budget nyata 2.600 ms. Keduanya kembali menghasilkan enam aksi berselang-seling tanpa kemajuan fase/giliran.

Hasil mesin lengkap: [NUSA_V23_FINANCE_LOOP_RESULTS.json](NUSA_V23_FINANCE_LOOP_RESULTS.json).
Skrip: [audit-finance-loop.mjs](../../scripts/audit-finance-loop.mjs).

## 2. Hasil seluruh run

Nama run di tabel adalah bagian waktu dari folder `run-2026-10-18T…`.

| Run | Budget per keputusan | Match selesai / diminta | Parsial | Loop | Menang alami | Batas waktu / aksi |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `12-57-16-300Z` | 12 ms | 1 / 1 | 0 | 0 | 0 | 1 action cap |
| `12-57-32-875Z` | 24 ms | 7 / 20 | 1 | 5 | 2 | 0 |
| `12-58-59-653Z` | 2.600 ms | 8 / 20 | 1 | 4 | 1 | 3 time cap |
| `13-12-27-196Z` | 2.600 ms | 2 / 2 | 0 | 2 | 0 | 0 |
| **Total** | | **18 / 43** | **2** | **11** | **3** | **4** |

Sebanyak 11/18 match yang punya hasil akhir berhenti karena osilasi: **9 Kresna, 2 NUSA**. Ini statistik arsip tersebut, bukan estimasi tingkat kegagalan umum: seed/roster digunakan ulang, budget berbeda, dan dua run tidak lengkap. Hasil loop tidak boleh dihitung sebagai kemenangan.

| Run | Match | Pelaku | Tile | Fase | Langkah loop yang memicu alert |
| --- | --- | --- | ---: | --- | --- |
| `12-57-32-875Z` | 0001 | Kresna | 5 | roll | 754–759 |
| `12-57-32-875Z` | 0002 | NUSA | 15 | buy | 224–229 |
| `12-57-32-875Z` | 0004 | Kresna | 25 | end | 85–90 |
| `12-57-32-875Z` | 0005 | Kresna | 12 | buy | 254–259 |
| `12-57-32-875Z` | 0007 | NUSA | 12 | buy | 325–330 |
| `12-58-59-653Z` | 0001 | Kresna | 5 | roll | 776–781 |
| `12-58-59-653Z` | 0002 | Kresna | 5 | end | 259–264 |
| `12-58-59-653Z` | 0004 | Kresna | 25 | end | 85–90 |
| `12-58-59-653Z` | 0008 | Kresna | 27 | buy | 250–255 |
| `13-12-27-196Z` | 0001 | Kresna | 5 | roll | 774–779 |
| `13-12-27-196Z` | 0002 | Kresna | 25 | end | 233–238 |

Sumber setiap baris: `runs/<run>/matches/match-<nomor>/actions.jsonl`, `decisions.jsonl`, dan `alerts.jsonl` di ZIP. JSON hasil audit menyertakan path match, langkah, aksi tercatat, recompute keputusan, dan perbandingan valuasi.

### Contoh kerugian nyata

Kresna, run `13-12-27-196Z`, match 0001, langkah 774–779:

```text
Kas internal 1246 → gadai tile 5 +1000 → 2246
                 → tebus tile 5 −1100 → 1146
                 → gadai +1000       → 2146
                 → tebus −1100       → 1046
                 → gadai +1000       → 2046
                 → tebus −1100       →  946
```

Tiga pasangan menghabiskan 300 unit internal = ₦30, dengan kepemilikan, bangunan, fase `roll`, dan giliran tetap sama. `version` bertambah karena setiap perintah sah. Jadi perubahan hash/version bukan bukti kemajuan game. Loop ini mengikis kas; tidak harus merupakan infinite loop matematis untuk merusak permainan.

### Save asli memperlihatkan loop yang lebih panjang

Fixture `fixtures/nusa-loop-mortgage-redeem.json` memiliki 159 event, termasuk **66 event gadai/tebus**, semuanya oleh NUSA (actor 3), pada ronde yang tercatat sebagai `turn=5` di event. Detail finansial berada pada `event.finance[]`, bukan `event.category`.

- Event 82–108: Malang (tile 16), 14 gadai dan 13 tebus.
- Event 109: gadai Lombok (tile 23).
- Event 110–133: Malang, 12 tebus dan 12 gadai lagi.
- Event 134–147: Stasiun Gambir (tile 5), 7 gadai dan 7 tebus.
- Total 32 tebus membayar bunga **2.950 unit = ₦295**. Dua gadai tetap terbuka di state akhir. Perubahan kas bersih rangkaian ini berbeda dari biaya bunga karena pokok gadai tersebut masih diterima.

Save akhirnya sudah memasuki lelang; ini bukan snapshot tepat sebelum loop. Riwayatnya membuktikan perilaku dan biaya, tetapi tidak menyediakan seluruh state/RNG sebelum setiap aksi seperti log benchmark. Angka ronde event juga berbeda makna dari `turnSerial`; jangan disamakan.

## 3. Temuan akar masalah

### F1 — P0: valuasi REDEEM memakai kas sebelum pembayaran

Lokasi: `lib/bot/strategy.mjs:54–56`, terkait `lib/bot/analysis.mjs:62–75`.

Scorer membuat `next` dengan `mortgaged:false`, tetapi tidak mengurangi `next.players[id].cash`. Setelah itu ia menghitung selisih `portfolioValue`, mengurangi biaya tebus dan penalti likuiditas.

Mengurangi biaya secara eksplisit tidak menyelesaikan masalah ini: `portfolioValue` juga mengandung `groupOption`, yang mengukur kemampuan membangun menggunakan **kas di state**. Artinya scorer menghitung potensi pembangunan seolah-olah uang tebus masih tersedia, termasuk untuk kelompok lain yang sudah dimiliki. Ini merupakan kesalahan state hipotetis yang terukur, bukan dugaan soal karakter model.

Perbandingan menggunakan analysis/reserve yang sama dan mengubah hanya state sesudah transaksi:

| Kasus | Tile | Score sekarang | Score dengan state transaksi nyata |
| --- | ---: | ---: | ---: |
| Kresna, run `12-57-32-875Z`, match 0001, step 755 | 5 | +4337,01 | −74,33 |
| NUSA, run sama, match 0002, step 225 | 15 | +1714,30 | −2563,95 |
| Kresna, run `12-58-59-653Z`, match 0008, step 250 | 27 | +771,31 | −2393,73 |

Ini perbandingan scorer, bukan hasil benchmark versi yang telah diperbaiki. Ada kasus lain yang tetap bernilai positif setelah koreksi, misalnya NUSA tile 12 step 326 (+879,88) dan Kresna tile 5 step 777 (+4628,54). **F1 harus diperbaiki, tetapi tidak cukup untuk menghapus seluruh loop.**

Cabang yang sama juga menangani `MORTGAGE_REDEEM` saat menerima properti gadai. Perbaikannya harus memperhitungkan transisi engine yang benar dan biaya lanjutan yang diselesaikan oleh transisi itu, tanpa menghitung pembayaran dua kali.

### F2 — P0: Kresna mempromosikan gadai tanpa memastikan tujuan pendanaannya

Lokasi: `lib/bot/kresna-policy.mjs:90`, `184–214`, `347–353`.

`needsFlashCapital` bersifat global: bernilai benar bila suatu kelompok belum mencapai sasaran modal, atau ada full set yang masih tergadai. Nilai itu tidak membuktikan bahwa gadai tertentu akan menghasilkan build/redeem yang dapat dijalankan dan menguntungkan.

- Pada fase roll/end, collateral pertama dipromosikan ke `topScore()+115`.
- Di scorer akhir, gadai di luar full set mendapat tambahan +360 ketika flag tersebut benar; cabang ini juga dapat berlaku di fase `buy`.
- Akibatnya score bersama −300 dapat berubah menjadi +60, mengalahkan `ROLL`, `END`, atau `AUCTION` yang berscore 0.
- Setelah kas naik, scorer bersama kembali memilih tebus. Sesudah tebus, kondisi kekurangan modal muncul lagi.

Reproduksi dengan clock tetap pada snapshot step 754 menghasilkan `MORTGAGE 5 → REDEEM 5` tiga kali. Mematikan lapisan persona pada snapshot awal membuat base memilih `ROLL`. Pada kasus `buy` step 251, base memilih `AUCTION`, tetapi persona memilih gadai tile 27.

### F3 — P0: NUSA tidak mempertahankan tujuan macro pendanaan antar-keputusan

Lokasi: `lib/bot/nusa-v7/council.mjs:144–164`, `788–797`; `reasoning.mjs:20–22`, `326–352`; `persona-router.mjs:74–84`.

Contoh run `12-57-32-875Z`, match 0002:

1. Step 224: kas 1992, target pembelian tile 27 berharga 2600. NUSA menambah kandidat `nusa-prebuy-mort-15`, macro `[MORTGAGE 15, BUY]`.
2. Gadai menaikkan kas menjadi 2992; pembelian sudah terjangkau.
3. Keputusan berikutnya dihitung ulang; base memilih `REDEEM 15`. Kas jatuh ke 1892 sehingga target pembelian kembali tidak terjangkau.
4. NUSA membuat gadai yang sama lagi.

Macro dibawa sebagai metadata kandidat dan dapat diikuti dalam sandbox search, tetapi tidak menjadi komitmen eksekusi pendanaan pada langkah berikutnya. Memory broker yang ada tidak menggantikan kebutuhan ini.

Ada penguat tambahan: kompatibilitas council di fase `buy` berfokus pada `BUY/AUCTION/MORTGAGE`, tetapi fallback yang sedang dipilih adalah `REDEEM`. Council mempertahankan fallback karena tidak menemukan alternatif kompatibel. Search menempatkan `REDEEM` pada `protectedTypes`, sehingga keluar sebagai `gear1_instant_reflex`.

Pada reproduksi melalui jalur default dengan budget 2.600 ms, keenam aksi tetap berselang-seling; nodes=0, reason bergantian `gear1_single_dominant_candidate` / `gear1_instant_reflex`. Menambah waktu tidak membuka evaluasi yang memang dilewati oleh aturan jalur tersebut.

### F4 — P0: belum ada guard finansial lintas persona

Lokasi: `lib/bot/candidates.mjs:42–47`, `memory.mjs:12–14`, `persona-router.mjs:12–16,80–84`, `mind.mjs:154`.

Generator memasukkan semua aksi manajemen legal; router memvalidasi legalitas lalu menjalankan guard negosiasi. Belum ada pemeriksaan pembalikan gadai/tebus yang menghabiskan bunga tanpa mencapai tujuan.

Guard negosiasi dan `blockedDevelopment` mengatasi masalah lain. Memory observasi NUSA juga bukan larangan pembalikan finansial. Early return `recordBotMemory` perlu diperhatikan: pada game tanpa NUSA aktif, transaksi gadai/tebus biasa dapat melewati pencatatan memory tersebut.

Semua persona melewati planner ekonomi yang sama: NUSA/Kresna/Apex melalui router strategis; Raka/Bima/Sari melalui `decideMind`. Karena itu F1 berpotensi memengaruhi seluruh persona. **Loop yang benar-benar diamati dalam match benchmark ini hanya Kresna dan NUSA**; tidak ada dasar untuk menyatakan semua enam persona sudah terbukti looping.

### F5 — engine: transaksi legal, bukan uang tercipta atau aksi ilegal

Lokasi: `lib/game.mjs:72–87,120–123,158`.

Engine menambah nilai gadai, membebankan biaya tebus, dan mempertahankan fase untuk aksi manajemen sesuai aturan. Tidak ditemukan perbedaan reducer lab versus production pada 6.630 aksi yang diverifikasi. Kerugian berasal dari keputusan bot berulang, bukan ketidakkonsistenan hasil transisi yang terlihat di arsip.

Menghapus hak gadai/tebus dari aturan manusia atau memaksa pergantian giliran setiap transaksi bukan perbaikan yang tepat. Guard perilaku bot sebaiknya ditempatkan di lapisan AI bersama.

## 4. Kelemahan benchmark dan observabilitas

1. **Cakupan enam persona tidak terjadi pada match empat pemain.** `lab/benchmark.mjs` memilih `identities[(i+index)%players]`. Dengan default enam identitas dan `players=4`, hanya NUSA/Kresna/Apex/Raka yang pernah dipilih; Bima/Sari terabaikan. Rotasi kursi berjalan, tetapi pool model terpotong. Tentukan jadwal roster eksplisit; jangan sekadar mengganti modulo tanpa menentukan keadilan lawan dan kursi.
2. **Detektor terlalu sempit.** Key memuat turnSerial/round/turn/tile, tetapi tidak actor pelaksana; actor alert diisi pemilik giliran. Ia hanya mendeteksi aksi berurutan pada tile yang sama setelah enam aksi. Pembalikan yang diselingi tile lain/transaksi lain dapat terlewat. Gunakan actor asli, histori per tile, dan kemajuan ekonomi yang relevan.
3. **State hash pasti berubah karena kas, version, log, dan memory.** Hash berguna untuk replay, bukan deteksi liveness tanpa fingerprint khusus.
4. **Kandidat diagnostik dimutasi oleh persona.** `topScore()+115` dapat terlihat dalam daftar yang awalnya sudah diurutkan tanpa urutan ulang daftar tersebut. Pisahkan `baseScore`, bonus persona, finalScore, dan provenance. `selectedBy=economic-floor` tidak berarti skor base benar, atau persona sama sekali tidak ikut menyusun kandidat.
5. **Tes sekarang melewatkan urutan berulang.** 71 tes terkait lulus pada baseline, sementara reproduksi multi-langkah tetap looping. Tes legalitas satu aksi tidak memverifikasi kelanjutan rencana.

## 5. Rencana fix dan update

### Tahap A — hotfix bersama, prioritas P0

1. **Perbaiki transisi valuasi tebus** di `strategy.mjs`: gunakan `candidateState`/transisi engine yang sudah legal, sehingga kas, mortgage flag, dan efek wajib berikutnya konsisten. Pertahankan basis penilaian sebelum/sesudah yang jelas; jangan sekaligus memasukkan kas dalam portfolio lalu mengurangi cost lagi. Uji `REDEEM` biasa dan `MORTGAGE_REDEEM` transfer secara terpisah.
2. **Tambahkan guard finansial bersama** pada pemilihan kandidat dan setelah hasil persona/search. Jalur nonstrategis, `baseOnly`, worker fallback, serta pilihan learned policy harus tercakup. Guard akhir wajib memeriksa ulang alternatif agar tidak memilih kandidat terlarang yang sama.
3. **Catat intent dan histori per actor/tile** setelah command berhasil, termasuk game tanpa NUSA. Simpan metadata kecil/bounded di `botMemory`, kompatibel dengan save lama yang belum memiliki field baru.
4. **Blok pembalikan tanpa alasan ekonomi baru**, bukan larangan mutlak sepanjang giliran. Identifikasi konteks seperti turnSerial, target/obligasi pendanaan, kepemilikan, pembangunan, dan perubahan keputusan publik. Jangan menjadikan perubahan kas akibat bunga, version, atau log sebagai reset guard. Pembayaran utang wajib, perubahan kepemilikan, dan keputusan transfer gadai tetap harus berfungsi.
5. **Fallback sesuai fase:** pilih aksi legal yang menyelesaikan keputusan (`BUY/AUCTION`, `ROLL`, `END`, `BID/PASS`, dll.) ketika pendanaan kehilangan tujuan. Jangan memaksakan `END` saat utang atau melewati penyelamatan yang masih mungkin.

Tahap A tidak boleh diklaim selesai hanya karena satu scorer diganti: kasus dengan score tebus positif setelah koreksi membuktikan perlunya guard dan intent.

### Tahap B — perbaikan kebijakan, prioritas P0/P1

- **Kresna:** ganti bonus pendanaan global dengan route yang menyebut target, biaya, collateral, dan kelanjutan legal. Simulasikan route sampai tujuan; cek stok bangunan, bangun merata, kas cadangan, biaya bunga, serta manfaat terminal. Gadai tanpa route layak tidak mendapat bonus positif. Tambahkan penalti pembatalan route dan pembalikan collateral.
- **NUSA:** pertahankan macro finansial lintas pemanggilan. Setelah gadai untuk pembelian, evaluasi kelanjutan `BUY` terlebih dahulu dengan state terbaru; batalkan dengan alasan eksplisit jika kondisi berubah. Jangan menebus collateral hanya karena peringkat ulang mengabaikan tujuan awal. Terapkan hal sama untuk pendanaan redeem/build/trade/auction.
- **Council/search:** izinkan koreksi terhadap base finansial yang keliru di fase buy. Audit apakah `REDEEM` pantas menjadi protected/reflex dalam konteks pendanaan; jangan membuka seluruh search secara membabi buta. Bandingkan nilai route lengkap setelah bunga dan perubahan kapasitas pembangunan.
- **Route bersama di development.mjs:** walaupun tidak terbukti sebagai pemicu awal pada contoh utama, route finance→build juga memakai pola dispatch langkah pertama. Terapkan lifecycle intent/validasi yang sama agar tidak menyisakan kelas bug serupa.

### Tahap C — regression dan benchmark, prioritas P1

| Pengujian | Kriteria penerimaan |
| --- | --- |
| Snapshot 11 alert arsip + save asli | Tidak ada pembalikan berulang tanpa kemajuan; tujuan finansial dilanjutkan atau dibatalkan dengan alasan |
| Tebus dan kapasitas build | Score memakai kas sesudah pembayaran; kasus numerik F1 tidak lagi memakai valuasi sintetis yang terlalu tinggi |
| Enam persona | Roster eksplisit mencakup NUSA/Kresna/Apex/Raka/Bima/Sari; hasil per persona, lawan, dan kursi tercatat |
| Budget 24 / 180 / 2.600 ms dan fallback 0 ms | Guard tetap aktif saat deadline habis, `baseOnly`, dan worker fallback |
| Game tanpa NUSA | Memory finansial dan guard tetap bekerja untuk persona lain |
| Siklus A→B→A, sela transaksi/tile lain | Detektor dan guard menangkap siklus yang tidak sekadar enam aksi berurutan |
| Kasus sah | Gadai untuk utang, beli, lelang, dan build berhasil; tebus setelah pemasukan/perubahan obligasi sah tetap bisa dilakukan |
| Save/load dan online | Intent bounded terserialisasi; retry version/idempotency tidak menduplikasi histori; state lama tetap bisa dibaca |
| Pertandingan panjang | Nol osilasi finansial terdeteksi, nol aksi ilegal; cap/error tidak diberi pemenang; durasi dan alasan berhenti dilaporkan |

Mulai dari replay snapshot dan tes urutan deterministik; lanjut benchmark seed tetap dengan rotasi seimbang. Laporkan juga biaya bunga sia-sia, jumlah pembatalan route, aksi per turnSerial, kemajuan fase, fallback reason, serta waktu keputusan. Jangan menjadikan “semua match harus selesai” sebagai satu-satunya syarat: pertandingan sah bisa mencapai batas waktu.

### Tahap D — distribusi update

- Ubah sumber kebenaran `lib/`; jangan mengedit salinan `_shared` secara manual.
- Jalankan tes relevan, typecheck/build sesuai perubahan, lalu `npm run prepare:edge` dan periksa paritas source/generated tree.
- Repackage lab dari sumber yang sama setelah perbaikan; update versi model/benchmark, manifest commit, dan checksum. Cantumkan versi guard/scorer serta jadwal roster pada manifest.
- Bedakan replay baseline arsip dari pengujian versi yang diubah: setelah memory atau keputusan berubah, hash lama tidak otomatis menjadi oracle untuk state AI baru. Validasi invariants aturan serta log versi baru secara tersendiri.
- Jalankan pemeriksaan integrasi local worker/Edge pada artifact yang akan dirilis. Audit ini belum memanggil Supabase atau layanan online nyata.

## 6. Validasi yang sudah dijalankan

```bash
node scripts/audit-finance-loop.mjs \
  /workspace/benchmark-evidence/NUSA_MIND_BENCHMARK_LAB_V23 \
  docs/audits/NUSA_V23_FINANCE_LOOP_RESULTS.json

node --test tests/nusa-v23.test.mjs tests/bot-strategy.test.mjs \
  tests/bot-foundation.test.mjs tests/bot-construction-reserve.test.mjs
```

Hasil: replay lab dan production **18/18 match, 6.630/6.630 aksi PASS**; reproduksi baru **NUSA dan Kresna kembali looping**; tes existing **71 PASS, 0 FAIL** pada Node 24.19.0. Skrip audit sengaja melaporkan bug yang ada tanpa menganggap kondisi looping sebagai perbaikan yang lulus.

Batas kesimpulan: tidak ada pengujian deployment/browser/live Supabase, belum ada benchmark versi perbaikan, dan tidak ada klaim bahwa semua persona sudah terbukti looping. Bukti cukup kuat untuk memprioritaskan pembenahan scorer serta guard/intent pendanaan di lapisan bersama, dilanjutkan perbaikan khusus Kresna dan NUSA.
