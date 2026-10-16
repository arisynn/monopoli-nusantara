# Audit dan riset NUSA MIND v4.6

Basis: workspace package 4.5.0, /workspace/v46-base; source lama tidak dipakai sebagai pengganti. Tidak ada Git metadata, sehingga main/82184e8 dari log Vercel tidak dapat diverifikasi. Baseline bot/engine v4.5 dikunci di benchmarks/frozen-v45 beserta SHA-256; bukan bot baru yang diubah agar menjadi pembanding lemah.

## Temuan nyata dan urutan prioritas

Skor = dampak (1–5) × frekuensi (1–5) × keyakinan (1–5) / biaya relatif (1–5). Frekuensi adalah perkiraan audit, bukan statistik populasi.

|Temuan/kasus|Lokasi pemicu v4.5|Skor|Tindakan dan bukti|
|---|---|---:|---|
|Prop MobileDock salah nama, snapshot visual tidak diterima|Game JSX / MobileDock s|125|s={shown}; fixture TSX memeriksa state tetap masked|
|financial rows kehilangan tipe|finance.mjs → HistoryPanel|80|JSDoc shared ledger result, tanpa any pada row|
|seat default null terlalu sempit|liveCardDecision → hook|80|kontrak number/null eksplisit; tes ACK stale dan pengamat dipertahankan|
|Siklus lelang bangunan tanpa pemenang|candidates BUILD / score BUILD_JOIN / PASS|100|snapshot self-play 10.000 aksi; memori fingerprint ekonomi mencegah ulang; 4 model maju dalam <=32 aksi|
|Pencarian berat akan memblok UI|Game effect planDecision sinkron|100|module Web Worker + abort/terminate/watchdog; actual worker-thread test|
|Provider yang mengabaikan AbortSignal bisa menggantung|groq await fetch/text|80|Promise.race terhadap abort; mock transport tidak pernah selesai tetap fallback|
|Worker backend menunggu decide tanpa batas|runBotWorker await decide|80|deadline independen + fallback lokal; mock hung advisor tetap satu commit|
|Private event dapat ikut log advisor|strategyView slice log tanpa audience filter|60|filter public sebelum observation; tes data privat tidak berpengaruh|
|Satu policy untuk semua bot|chooseSmartBot / setup|50|empat algoritma; 12 kombinasi persona/level diuji|
|Estimasi agresivitas terlalu cepat yakin dari satu bid|auctionCompetition weight .3|30|prior shrink n/(n+8); ablation no_opponent tersedia; manfaat win rate belum terbukti|
|Rollout tick-bid tidak menyelesaikan lelang dalam horizon|eksperimen awal X4|60|distribusi jump-bid legal dari rulepack; tidak mengganti aturan engine|
|Rollout sedikit sampel bisa mengalahkan baseline karena noise|eksperimen awal X4 win 3/11 vs baseline 5/12|60|complete paired batches + uncertainty promotion margin; hasil lemah tetap disimpan|
|Horizon kartu/penjara masih aproksimasi|analysis Markov position-only|20|X4 sampling ulang deck publik dan engine transitions; evaluator terminal tetap aproksimasi, belum model probabilitas menang terkalibrasi|
|Proposal barter dibatasi top-3 target/3 donor|negotiationCandidates|15|validator dan direction tests dipertahankan; proposal combinatorial penuh belum diimplementasikan|
|Debt beam depth-4 bisa melewatkan kombinasi likuidasi panjang|debtPlan|15|fallback langkah demi langkah dan simulasi dipertahankan; optimalitas global tidak diklaim|
|Belum ada bukti ladder/keunggulan statistik|benchmark lama hanya satu policy|40|laboratorium paired seeds/rotasi/CI/trace/ablation; hasil final dilaporkan apa adanya|

## Siklus eksperimen dan keputusan

1. Kontrak P0 → perbaikan semantik → 54 tes presentasi lulus. Build terhalang dependency, bukan diberi label hijau.
2. Isolasi search → actual module worker di thread terpisah → parent tetap responsif; Android browser belum diuji.
3. Deadline provider/job → transport tidak pernah resolve → fallback dan single commit teruji.
4. Privasi → deck dibalik, memori lawan/log privat diubah → hasil deterministic node-budget identik.
5. X4 awal → 57 game eksplorasi: 55 selesai, 0 ilegal, win X4 rendah → jump-bid dan paired uncertainty gate; hasil eksplorasi tidak dihapus.
6. Diagnostic seed lama → satu kasus 10.000 aksi → menemukan loop produksi M2/frozen opponent → fingerprint failed-development + regresi lintas model.
7. Full vs short rollout → operational profiler dan pertandingan paired terpisah; lihat MIND_SELECT_*.json, tidak dipromosikan hanya karena algoritma populer.

Tiga mekanisme spesifik tambahan: complete-round pairing agar deadline tidak memberikan sampel lebih banyak ke satu kandidat; promotion margin berdasarkan selisih hasil berpasangan agar noise tidak mudah mengalahkan baseline; failed-development fingerprint agar bot tidak mengulang lelang langka tanpa perubahan ekonomi. Ini rancangan domain ini, bukan klaim kebaruan ilmiah.

## Source dan Supabase/Groq

Engine 40 petak, Nusa, schema2/rulepack nusantara-c1009-2, game-v1 compatibility, visual timeline/ledger/PWA, fixed personas dan API advisory existing dipertahankan. Room mengikat identitas Auth ke kursi; snapshots privat, Realtime hanya hint, CAS/receipts, lease bot/job, pause mayoritas manusia dan resume semua manusia tetap menjadi fondasi.

Environment resmi revision29: connected, policy enforced, observations current; secrets/runtime variables/outbound identities kosong. Tidak ada koneksi Supabase/Groq callable yang ditemukan. Tidak ada query produksi, migrasi live, RLS live, Auth live atau request Groq sungguhan yang dijalankan. Hasil online adalah service/store/worker contract simulations, bukan verifikasi PostgreSQL/Realtime produksi.

Groq: server-only optional advisor, flag per match/room default false; ENV hanya menunjukkan configured. Existing safe enum reason, stateVersion/matchId/actor, structured actionId, quota/circuit breaker dipertahankan. Tidak mengganti model atau biaya akun secara diam-diam.
