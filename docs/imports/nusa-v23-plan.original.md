# Rencana Master: NUSA V23.0 "CHRONOS & KAIROS — Temporal Initiative, Cashflow-Drift Clock & Stateful 2-Hop Execution"

Di **V22.0 ("Omniscient Cortex")**, NUSA sudah menguasai **Dimensi Ruang & Kepemilikan (*Spatial & Ownership Hypergraph*)**: membaca siapa punya apa, siapa butuh apa (`desireMatrix`), umpan *Trojan $2/3$*, *2-Hop Broker*, dan posisi pion di papan.

Namun, ada **satu dimensi logika baru** yang membedakan AI yang sekadar "pintar membaca papan" dari seorang **Grandmaster Tak Terkalahkan**: **Dimensi Waktu, Urutan Giliran, & Arus Kas Per Putaran (*Temporal Initiative & Cashflow-Drift Logic*)**.

Dalam Monopoli 6 pemain, **kapan** sesuatu terjadi dan **siapa yang jalan duluan** sama pentingnya dengan **apa** yang dimiliki:
1. *"Apakah jika permainan berjalan apa adanya tanpa barter lagi, aku akan menang sendiri karena uang sewaku paling deras, atau justru aku yang perlahan mati tergerus sewa Bima?"*
2. *"Jika aku melakukan barter dengan Si A di giliranku sekarang, berapa pemain yang akan melempar dadu sebelum giliran Si A tiba? Dan apakah pion Si A justru akan menginjak monopoliku yang baru kubangun 3 rumah sebelum Si A sempat sampai ke gilirannya sendiri?"*
3. *"Setelah aku berhasil membeli tanah umpan `Y` dari Si B (Langkah 1 dari 2-Hop Broker), bagaimana memastikan di detik berikutnya (masih di giliranku yang sama) aku langsung menukarkan `Y` ke Si A untuk mengambil tanah `X`, lalu langsung membangun rumah sebelum menekan `END`?"*

Berikut adalah **5 Logika Baru di NUSA V23.0 ("Chronos & Kairos")**:

---

## Pilar 1: *The Cashflow-Drift & Ruin Clock* (Logika Pembaca Arah Takdir Pertandingan)

Selama ini bot mengevaluasi posisi secara statis. Di **V23.0**, `board-graph.mjs` menghitung **Laju Arus Kas Bersih Per Putaran ($\Delta \text{Cash}_p / \text{Orbit}$)** dan **Jam Kematian (*Estimated Orbits to Ruin / ETTR*)** untuk ke-6 pemain:

$$\text{Drift}_p = \text{Gaji}_{\text{GO}} + \sum_{t \in \text{Milik } p} P(\text{Lawan Injak } t) \cdot \text{Sewa}(t) - \sum_{t \notin \text{Milik } p} P(p \text{ Injak } t) \cdot \text{Sewa}(t)$$

Dari rumus ini, NUSA secara otomatis mengubah **Postur Makro Pertandingan (`macroPosture`)** ke salah satu dari 3 mode:
1. **Mode `ATTRITION_LOCKDOWN` (Kita Punya $\text{Drift}$ Tertinggi & Positif):**
   * Secara matematis, setiap kali 6 pemain menyelesaikan 1 putaran papan, NUSA semakin kaya sementara lawan semakin miskin.
   * **Perubahan Logika:** NUSA menghentikan semua barter berisiko, memperketat embargo terhadap lawan #2 dan #3, memborong rumah di bank untuk mengunci stok 32 rumah, dan fokus menyita petak blokir (*hostage*).
2. **Mode `TEMPO_BREAKER` (Ada Lawan yang Punya $\text{Drift}$ Lebih Tinggi dari NUSA):**
   * Jika NUSA bermain pasif, NUSA **pasti kalah perlahan** tergerus waktu.
   * **Perubahan Logika:** NUSA otomatis melonggarkan batas *overpay* pada *Binary-Search Trade Solver* (rela membayar premi lebih tinggi atau mengeksekusi *First-Strike Mutual Swap*) demi mematahkan dominasi lawan dan menciptakan monopoli penyeimbang detik itu juga!
3. **Mode `APEX_EXECUTIONER` (Ada Lawan dengan Jam Kematian $\text{ETTR} \le 2.0$ Putaran):**
   * NUSA mendeteksi ada pemain yang akan bangkrut dalam 1–2 putaran, lalu memfokuskan konstruksi rumah tepat di jalur dadu pemain tersebut (agar bangkrut ke tangan NUSA, bukan ke pemain lain!).

---

## Pilar 2: *Turn-Order Initiative & First-Strike Window* (Logika Urutan Kursi 6 Pemain)

Dalam aturan resmi `lib/game.mjs`, seorang pemain **hanya bisa membangun rumah secara reguler pada gilirannya sendiri** (`phase === 'roll' | 'end' | 'jail'`). Lawan yang menerima properti dari barter di giliran NUSA **tidak bisa membangun rumah sampai giliran mereka sendiri tiba!**

NUSA V23.0 mengeksploitasi celah waktu ini dengan menghitung **Jarak Urutan Giliran (`turnDistance(actor, rivalId)`)**:

1. **Eksploitasi *First-Strike Ambush Window* pada Barter:**
   * Bayangkan urutan giliran kursi adalah: $\text{NUSA} \rightarrow \text{P1} \rightarrow \text{P2} \rightarrow \text{P3} \rightarrow \text{Lawan X}$.
   * Jika NUSA melakukan barter di gilirannya (`phase === 'end'`) dengan **Lawan X** (yang berjarak 4 giliran lagi), NUSA bisa **langsung membangun 3 rumah detik itu juga**.
   * Artinya, pion **P1, P2, dan P3** akan melempar dadu melewati monopoli 3-rumah NUSA *sebelum* Lawan X mendapat giliran!
   * Lebih mematikan lagi: jika **pion Lawan X sendiri sedang berada $5\text{–}9$ petak di belakang monopoli baru NUSA**, maka saat giliran Lawan X tiba, Lawan X harus melempar dadu terlebih dahulu (`phase === 'roll'`) dan berpeluang besar menginjak monopoli 3-rumah NUSA hingga terkuras uangnya *sebelum sempat membangun di tanah yang baru kita berikan!*
2. **Skala Darurat Intersepsi Berbasis Urutan Kursi (`Seat-Urgency Interdiction`):**
   * Jika Lawan A sudah memegang $2/3$ warna berbahaya dan Lawan B memegang petak ke-3:
   * Apabila **giliran Lawan A adalah tepat setelah NUSA (`turnDistance === 1`)**, maka urgensi NUSA untuk merebut petak ke-3 itu dari Lawan B melonjak ke **Status Darurat Mutlak** (NUSA berani membayar premi ekstra ke Lawan B agar petak itu tidak jatuh ke Lawan A di giliran berikutnya).

---

## Pilar 3: *Stateful Same-Turn 2-Hop Broker Executor* (Eksekutor Rantai Barter Tanpa Putus)

Di V22.0, NUSA sudah bisa merencanakan *2-Hop Broker* ("Beli umpan `Y` dari Si B, lalu tukar `Y` ke Si A demi petak monopoli `X`"). Namun, saat Langkah 1 berhasil (`TRADE_ACCEPT` oleh Si B), mesin permainan kembali ke `phase === 'end'` di giliran NUSA.

Di **V23.0**, kita menambahkan **Detektor Penyelesaian Rantai Instan (`readyStep2BrokerChains`)**:
* Setiap kali NUSA berada di `phase === 'end'` dan masih memiliki sisa kuota barter (`roundTradeCount < 3`), `board-graph.mjs` memeriksa apakah di tangan NUSA saat ini terdapat petak umpan berkeinginan sangat tinggi (`desire >= 65` oleh pemegang kunci monopoli NUSA, termasuk umpan `Y` yang baru saja dibeli dari Si B 1 detik yang lalu).
* Jika ada, NUSA memberi prioritas tertinggi (**Skor Kandidat `+495`**) untuk **langsung menembakkan `OFFER` Langkah ke-2 kepada Si A**, menebus/membangun 3 rumah pada monopoli yang baru lengkap, baru kemudian menutup giliran (`END`)!

---

## Pilar 4: *Dead-Weight Capital Liquidation* ("Ubah Tanah Mati Jadi Modal Perang")

Sering kali di pertengahan permainan, NUSA memegang 2–4 petak tanah terisolasi yang:
* Bukan bagian dari grup yang ingin dimonopoli NUSA,
* Bukan petak kunci penahan monopoli lawan (*non-hostage* karena grupnya sudah terpecah $1\text{–}1\text{–}1$ atau dikuasai pemain lemah), dan
* Bukan umpan *broker* untuk pemegang kunci NUSA.

Petak seperti ini adalah **Modal Mati (*Dead-Weight Asset*)**—hanya menghasilkan sewa receh $\text{N } 60\text{–}140$ sementara uang sebanyak $\text{N } 1.200\text{–}2.400$ terkubur di dalamnya.

Di **V23.0**, pakar baru **`deadWeightLiquidator`** bekerja secara aktif:
* Ketika NUSA membutuhkan modal tunai untuk:
  1. Melompat ke **3 rumah** di monopoli milik NUSA, atau
  2. Menyiapkan **Kas Akuisisi Tunai (*Pure-Cash Buyout Warchest*)** untuk membeli petak ke-3 dari lawan yang mata duitan,
* NUSA secara proaktif menawarkan *Dead-Weight Asset* tersebut kepada lawan *underdog* yang sedang memegang banyak kas tunai dengan harga **$100\%$ hingga $135\%$ dari harga kartu** (dicari secara eksak lewat *Binary Search*). Lawan senang karena mendapat properti tanpa memberi NUSA monopoli, sementara NUSA mendapatkan suntikan uang tunai segar untuk langsung membangun 3 rumah!

---

## Pilar 5: *Pre-End Next-Player Lookahead* ("Inspeksi Pion Berikutnya Sebelum Klik `END`")

Sebelum NUSA menekan tombol `END` untuk mengakhiri gilirannya:
* NUSA menginspeksi **siapa pemain yang akan melempar dadu tepat setelah ini (`nextTurnPlayer`)** dan **di petak mana pionnya berdiri sekarang**.
* Jika pion pemain berikutnya berada tepat $5\text{–}9$ langkah di belakang salah satu grup monopoli NUSA yang:
  * Masih memiliki 1 petak tergadai (`mortgaged`), atau
  * Baru memiliki $1\text{–}2$ rumah padahal kas + cadangan gadai NUSA cukup untuk menaikkan petak puncak (*Apex Tile*) ke 3 rumah,
* Maka kandidat `END` langsung dikenai penalti, dan NUSA memaksa eksekusi **`REDEEM` / `BUILD` Sergapan Tepat Waktu (*Just-In-Time Ambush*)** sebelum menyerahkan dadu ke pemain berikutnya!

---

## Ringkasan Matriks Peningkatan NUSA V22.0 $\rightarrow$ V23.0

| Kapabilitas Kecerdasan | NUSA V22.0 (*Omniscient Cortex*) | NUSA V23.0 (*Chronos & Kairos*) |
| :--- | :--- | :--- |
| **Pembacaan Arah Pertandingan** | Skor kekayaan & peluang menang statis | **Cashflow-Drift ($\Delta \text{Cash}/\text{Orbit}$) & Jam Kematian (`ETTR`)** |
| **Adaptasi Postur Strategi** | Bobot tetap per fase (*acquisition/contested*) | **3 Postur Dinamis (`ATTRITION_LOCKDOWN`, `TEMPO_BREAKER`, `APEX_EXECUTIONER`)** |
| **Kalkulasi Urutan Kursi** | Belum membedakan jarak giliran lawan | **Turn-Order Initiative & First-Strike Swap Ambush Window** |
| **Eksekusi Rantai 2-Hop Broker** | Merencanakan Langkah 1 & 2 di simulasi | **Stateful Step-1 $\rightarrow$ Step-2 Instant Execution di Giliran yang Sama** |
| **Manajemen Tanah Menganggur** | Hanya digadaikan (`MORTGAGE` $50\%$) saat butuh kas | **Dead-Weight Liquidation (Dijual $100\%\text{–}135\%$ ke Underdog Jadi Modal Rumah)** |
| **Disiplin Sebelum Klik `END`** | Berhenti jika cadangan kas di bawah ambang standar | **Pre-End Next-Player Lookahead (Sergapan Tepat di Depan Pion Berikutnya)** |