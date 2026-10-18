# Perbaikan integrasi bot — Lab 1.2.1 / Guard 2.0.0

Lingkup patch adalah lapisan bot. Semua berkas `engine/` dan empat `.core.mjs` dibandingkan dengan ZIP masukan dan dipertahankan byte-identik. Ini belum perubahan strategi tiga rezim atau pencarian eksak V8.

## Perubahan

- Adapter menggabungkan definisi `BOARD` dengan kepemilikan, level, dan status gadai di `state.assets`. Grup 0, `out`, `build`, dan skala uang memakai kontrak engine.
- Guard menerima aktor dari argumen fungsi. Jika tidak diberikan, ia memakai keputusan aktif engine, termasuk penerima barter dan peserta lelang. Identitas memakai `botPersona`; nama tampilan tidak menimpa persona eksplisit.
- Lelang memakai `auction.amount`, minimum/kenaikan dari `AUCTION_RULES`, dan kas aktor sebenarnya. Bid yang sudah sah dipertahankan. Koreksi yang tidak terjangkau memilih alternatif sah, termasuk `PASS`.
- Keputusan akhir divalidasi melalui transisi engine yang terisolasi, tanpa mengonsumsi RNG pertandingan. Fallback mengikuti fase, termasuk `TRADE_REJECT`, `MORTGAGE_KEEP`, dan pilihan likuidasi saat utang.
- Riwayat anti-loop disimpan dalam `botMemory.players[id].stabilityGuard`, memiliki `matchId`, serial giliran, dan versi aksi sukses. Riwayat mengikuti clone/worker dan replay; tidak ada tracker global. Gadai untuk menebus aset lain tetap diperbolehkan. Likuidasi darurat tidak dihalangi tabu sukarela.
- Hook memeriksa perubahan aset yang benar-benar terjadi. Pemesanan bangunan yang selesai ketika pemain lain menjawab juga dicatat untuk pemilik bangunan. Callback guard pada versi yang sama tidak menggandakan catatan.
- Wrapper hanya memproses generator kandidat dan fungsi keputusan. Helper, afterstate, rollout, telemetry, dan array sinyal expert diteruskan tanpa transformasi generik. Guard tidak menambahkan bonus strategi atau mengubah anggaran waktu; penilaian dan broker native tetap berfungsi. Pengecualian barter tukar-monopoli dan pengurasan kas pada pengaman lama tetap tersedia.

## Kontrak host

```js
const before = state;
const plan = decidePersona(before, actor, options);
const next = command(before, actor, plan.action, rng);
recordBotMemory(next, before, actor, plan.action);
state = next;
```

Jangan panggil hook untuk proposal, aksi gagal, atau cabang simulasi. Host lab dan replay sudah memanggilnya di tempat yang benar. Metadata memori berubah sehingga replay historis dengan hash versi lama perlu memakai paket bot lamanya. Log lama disertakan sebagai arsip tanpa ditulis ulang.

## Verifikasi

Lingkungan: Node.js v24.19.0. Perintah lengkap dan hasil smoke tercatat di `PATCH_VERIFICATION.json` setelah pemeriksaan selesai.

```bash
npm test
node lab/selftest.mjs
node lab/benchmark.mjs --matches=2 --players=2 --victory-mode=bankruptcy --game-ms=45000 --max-actions=1200 --seed=20261018 --budget=50 --display=off --save-every=250 --run-id=guard-smoke-2p
node lab/benchmark.mjs --matches=2 --players=6 --victory-mode=bankruptcy --game-ms=45000 --max-actions=1500 --seed=20261018 --budget=50 --display=off --save-every=250 --run-id=guard-smoke-6p
node lab/replay.mjs runs/guard-smoke-2p/matches/match-0001
```

Uji mencakup lelang properti/bangunan, cash rendah, aktor di luar giliran, persona numerik, grup 0, barter masuk, proposal gagal, pengamatan worker, simulasi, pemisahan antarpertandingan/pemain, pengaman utang, pemesanan bangunan langka, state bid ilegal arsip, serta fixture loop asli.

Empat pertandingan smoke selesai secara alami: dua mode 2 pemain dan dua mode 6 pemain, tanpa aksi ilegal atau loop yang terdeteksi. NUSA menang satu dari dua pertandingan pada masing-masing mode; ukuran sampel ini hanya memeriksa alur permainan dan tidak memvalidasi target winrate 95% / >60%.

Manifest dua smoke di atas dibuat sebelum label benchmark diperbarui, sehingga masih menyebut 1.2.0. Hasilnya berasal dari guard yang diperbaiki; manifest/log tersebut tidak diubah. Run baru mencatat guard 2.0.0 dan benchmark 1.2.1 secara eksplisit.
