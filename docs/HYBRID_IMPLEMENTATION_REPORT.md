# Nusantara Hybrid Bot Intelligence 4.0 — laporan implementasi

Tanggal: 16 Oktober 2026. Perubahan nyata tersedia di workspace source; tidak ada commit/push/deployment atau perubahan database produksi. Tidak memakai ZIP hotfix lama atau mengganti engine/board dari nol.

| Area | Status |
| --- | --- |
| Strategi lokal, persona, legal actions, memori save | Selesai dan teruji pada engine Node/skenario lokal |
| Endpoint Groq dan fallback tanpa Redis | Selesai dan teruji dengan mock provider; kualitas model live belum terverifikasi |
| Setup VS Bot 2–4, status ringkas, lobby bot | Diimplementasikan; TSX/build/browser/Android belum terverifikasi |
| Service bot online, lease/revision/pause/reconnect | Teruji dengan adapter kontrak in-memory; belum terverifikasi pada Supabase live |
| Migration, Edge Function dan scheduler | Disiapkan; belum dijalankan/divalidasi di PostgreSQL/Deno target |
| Kontrak `reason`/`aiComment` | Diperbaiki di source; blocker deployment belum dapat dinyatakan selesai tanpa typecheck/build |
| Peningkatan kompetitif | Benchmark tersedia; keunggulan statistik yang meyakinkan belum terbukti |

## 1. Audit source dan versi

Basis adalah workspace hasil pembaruan multiplayer sebelumnya. Tidak ada `.git`, remote/branch maupun checkout commit `bc90b2f`; package 2.11.1 tidak membuktikan identitas commit. `app/api/bot/route.ts` tidak ada pada basis ini dan dibuat sebagai endpoint advisor mandiri. Perubahan commit remote tidak dapat diverifikasi atau dipush. Detail audit awal: [HYBRID_AUDIT.md](HYBRID_AUDIT.md).

Engine v2, legacy v1, command dispatcher, ekonomi Nusa, 40 petak, stok bank, aturan lelang terbuka, sewa manual/otomatis, penjara, utang, kartu, barter/counteroffer, pembangunan merata dan save existing dipertahankan. Nilai internal sepuluh kali nominal tampilan tetap sama. Perubahan engine hanya metadata persona, nullable `aiComment`, pencatatan memori dan penghapusan memori dari snapshot publik. `chooseBot` baseline tetap tersedia untuk kompatibilitas/benchmark. Tidak ada difficulty selector baru atau hotseat baru.

## 2. Audit Supabase

Source lokal memakai Auth UUID per kursi, snapshot privat `mn_rooms`, membership `mn_members`, receipt `mn_commands`, revision hint `mn_room_updates`, quota persisten dan CAS RPC service-only. Voting, heartbeat/reconcile, pause/resume dan autosave sebelumnya dapat dikembangkan tanpa membuat engine/server kedua.

Akses project/database Supabase live, migration history, logs, RLS runtime, extensions, publication dan quota tidak tersedia. Tidak ada hasil audit live yang dikarang. Tidak ada migration diterapkan. Test store/HTTP lokal bukan bukti transaksi PostgreSQL/RLS live berhasil.

## 3. Audit Groq

Jalur lama terikat API room Redis/D1; bot lokal baru harus terpisah dari kebutuhan itu. Konfigurasi ENV dahulu dapat terlihat sebagai status AI tanpa membuktikan request provider sukses. Kandidat lokal terbatas; return hasil tidak memiliki tipe bersama dan beberapa cabang berbeda bentuk. `createGame()` belum mendeklarasikan `aiComment` walaupun runtime menulisnya.

Jalur baru: Game → kandidat/evaluasi lokal → `/api/bot` → advisor opsional → JSON schema/actionId → decision gate → validasi versi → engine. Untuk bot online, jalur ini berlangsung pada worker server, bukan browser host. Tidak ada secret Groq/Supabase diperiksa atau dicetak. Model/latensi/token/biaya Groq nyata belum diuji.

## 4. Root cause dan perbaikan TypeScript

Log TS2339 menunjukkan `reason` dibaca dari inferred union yang semua cabangnya tidak mendeklarasikan field tersebut. Commit yang menghasilkan log tidak tersedia untuk reproduksi. Source lokal sekarang menggunakan `BotDecisionResult` eksplisit di advisor, fallback dan endpoint. `reason?:BotReason` adalah enum diagnostik aman; `comment:string|null` dan metadata match/version/actor konsisten di semua cabang. Tidak ada `as any`, ignore directive atau pelonggaran strict untuk memperbaiki kontrak ini.

`createGame()` menginisialisasi `aiComment` dengan tipe nullable eksplisit. Game memakai tipe status/hasil advisor bersama. `tests/types/bot-contract.ts` menyediakan regresi compiler untuk `reason` dan `aiComment`, tetapi fixture ini belum dikompilasi karena TypeScript tidak tersedia. Raw provider body, headers, stack dan key tidak dikembalikan. Kegagalan provider mempertahankan aksi lokal.

## 5. Modul strategi lokal

- `analysis.mjs`: model transisi 40 petak memakai distribusi dadu dan kartu publik, posisi, expected rent, reserve dinamis, kelompok target, finance/development option dan valuasi aset. Cache dibatasi delapan entri; horizon pergerakan dibatasi. Model jail/doubles jangka panjang adalah pendekatan, bukan simulasi tepat.
- `candidates.mjs`: kandidat engine existing ditambah management, beberapa nominal lelang legal, barter/counteroffer dan penyelamatan utang. Semua kandidat disaring melalui command engine dengan deck unknown kanonis; simulasi legalitas tidak dipakai untuk mengintip hasil RNG/deck asli.
- `negotiation.mjs`: evaluasi pengirim/penerima yang benar, cash/cards/interest, kepemilikan hipotetis, liquidity dan ancaman monopoli lawan. Tawaran proaktif fokus kelompok; counteroffer maksimal dua tingkat rantai; cooldown/penolakan tersimpan mencegah spam dari bot baru.
- `strategy.mjs`: target planner benar-benar menambah valuasi/pilihan; ROI pembangunan membandingkan properti, roadmap tiga rumah, even building dan stok. Utang memakai pencarian terbatas width 5/depth 4 untuk kehilangan strategis rendah. Penjara mempertimbangkan mobilitas awal dan bahaya sewa akhir. Opsi di luar batas pencarian tetap dipilih ulang dari state terbaru.
- `memory.mjs`: observasi agresivitas tawaran publik, cooldown, penolakan, dan rantai counteroffer dapat diserialisasi. Memori tidak dibroadcast ke lawan. Tidak ada akses RNG masa depan/deck tersembunyi.

Evaluasi lelang membandingkan beberapa nominal dengan kemampuan/valuasi lawan yang terlihat dan observasi bid. Bobot penyelesaian lelang adalah heuristik terukur lewat benchmark, bukan probabilitas kemenangan terkalibrasi. Trade/ROI forecasting masih merupakan estimasi; tindakan legal tetap harus dinilai secara ekonomi.

## 6. Persona tetap

Semua persona berbagi generator, evaluator ekonomi, legal validator dan guardrail yang sama. Raka memberi bobot investasi/kelompok lebih besar; Bima memberi bobot negosiasi lebih besar; Sari memberi bobot risiko/blocking lebih besar dan horizon sedikit lebih panjang. Tidak ada tingkatan kesulitan tersembunyi.

Setup lokal selalu manusia + Raka, lalu Bima, lalu Sari sesuai total 2/3/4 peserta. Nama/persona bot tidak dapat diedit; pawn mengikuti identitas existing dan fallback unik bila pion pilihan manusia bertabrakan. Save lama mendapat persona default berdasarkan urutan bot tanpa mengubah saldo/aturan; nama save lama tidak dipaksa ditulis ulang. Schema engine tetap v2, field opsional `botMemory.version=1` kompatibel dengan validator/save existing.

## 7. Hybrid decision dan keamanan Groq

Local plan selalu tersedia lebih dahulu. Groq dilewati untuk keputusan mekanis, satu alternatif atau selisih utility jelas. Situasi kompleks dengan alternatif berdekatan mengirim ekonomi publik dan maksimal 12 kandidat yang sudah diberi skor. Tidak mengirim deck/seen, nama sebagai instruksi, prompt rahasia atau memori bot lain.

Respons harus JSON `{actionId}` dari kandidat; aksi ilegal atau downgrade ekonomi material ditolak. Toleransi utility dibatasi dalam unit internal. Timeout default 6,5 detik, budget, circuit breaker dan fallback mencegah game menunggu tanpa batas. Tidak ada retry tak terbatas atau pergantian model otomatis. Default model tetap sama; belum ada perbandingan 20b/120b live.

UI membedakan lokal, terkonfigurasi, consulting, hybrid berhasil dan fallback. API hanya menjadi penasihat untuk snapshot lokal dan tidak berwenang mengubah state room. Endpoint memeriksa origin, ukuran, bentuk snapshot dan aktor bot. Rate/budget per-instance tersedia; budget global serverless hanya persisten jika Supabase dikonfigurasi. Batas global tanpa backend persisten masih merupakan keterbatasan.

## 8. Eksekusi bot online

Host hanya dapat menambahkan persona unik berikutnya pada Waiting. Minimum dua manusia, maksimal tiga bot dan total enam/kapasitas room. Bot tidak memiliki UUID Auth palsu dan tidak menggantikan manusia disconnect. Manusia yang bergabung sesudah bot tetap mendapatkan kursi sahnya.

Worker memilih aktor pada starting/turn, lelang di luar giliran, penerimaan/counter barter, interest bangunan langka, debt/mortgage/card/jail dan klaim sewa manual. Browser Supabase tidak menjalankan `AI`/bot turn. Job persisten memakai lease pemilik, re-read snapshot setelah advisor, CAS revision, game version/matchId dan receipt unik. Groq tidak menahan transaksi. Commit ditolak bila pause, lease manusia, bot lease atau revision berubah.

Invocation dibatasi empat klaim dan budget waktu; trigger jobs/pg_net meneruskan pekerjaan, cron memulihkan wakeup hilang/worker crash. Job `blocked` kembali scheduled saat seluruh manusia aktif tersambung lagi. Lima kegagalan planner membuat job failed untuk intervensi operator. Tidak ada klaim orchestration target sudah berfungsi tanpa deployment staging.

## 9. Database/migration dan pause/recovery

Migration 002 menambah `mn_bot_jobs` dan `mn_bot_actions`, indeks job due, RLS tanpa grants browser, claim/release/wake RPC service-only, serta fenced bot commit pada RPC delapan parameter existing. Trigger hanya menambah pekerjaan pada state/status baru atau pemulihan blocked; heartbeat normal tidak mengirim pekerjaan bot berulang. Snapshot menyimpan memori privat; Realtime tetap hint revision.

Voting pause/resume, host transfer, presence dan lease hanya menghitung manusia aktif. Bot tidak voting/Ready, tidak bergerak saat pause, dan mengikuti fase terakhir saat resume. Toleransi disconnect tetap 90 detik sejak heartbeat terakhir; semua gameplay ditahan secara konservatif setelah lease 35 detik tidak segar. Engine existing tidak memiliki deadline gameplay, sehingga tidak ada timer lelang fiktif di-reset. Efek kartu/uang/kepemilikan tidak diputar ulang.

Tidak ada retensi otomatis atau penghapusan room. Semua manusia offline tetap dipulihkan melalui reconciler sebelum akses/aksi berikutnya. Snapshot schema room v1/engine v2 dipertahankan. Tidak ada migrasi identitas room Redis/D1 lama secara otomatis.

## 10. File yang berubah

Daftar lengkap ada pada [HYBRID_CHANGED_FILES.json](HYBRID_CHANGED_FILES.json), termasuk hash paket pada manifest artifact. Kelompok utama: `lib/bot/*`, `lib/groq.ts`, endpoint bot/game/online, `Game.tsx`, `OnlineRoomStatus.tsx`, worker/service/store Supabase, migration/function/scheduler, tes/benchmark/kontrak tipe, ENV contoh dan dokumentasi. Dependencies/lockfile, board/aset, ekonomi dan legacy engine tidak diganti.

## 11. Hasil tes engine

`npm run test:core`: **251/251 lulus**, 19 file, nol gagal. Mencakup regresi existing dan 56 tes baru: 18 strategi/persona/save, 15 advisor mock, 4 actual bot HTTP route dengan hosting adapter mock, dan 19 online bots dengan store kontrak.

Kasus strategis mencakup legal candidates multi-fase, properti gratis, menolak aset gratis ke lawan/pembayaran tanpa manfaat, arah barter, monopoli berbahaya, counteroffer, cooldown, reserve hotel/utang, planner mempengaruhi BUY, variasi tawaran/jump bid dan PASS, ROI/even build, collateral rendah sebelum membongkar monopoli, jail adaptif, private memory dan save roundtrip. Seluruh fitur engine existing tetap diuji suite lama. QA JSON: [QA_HYBRID_RESULTS.json](QA_HYBRID_RESULTS.json).

## 12. Benchmark lokal

Run final: **306 pertandingan**, termasuk **270 evaluasi** (135 smart dan 135 baseline), paired seeds, rotasi seat, 2/3/4 pemain, tiga persona, tuning terpisah dan self-play/diagnostik. Tambahan **30 ablation terkontrol** memakai seed pembanding yang sama; semua 30 selesai. Simulasi mengganti tindakan manusia dengan policy untuk pengujian engine; bukan klaim room online membolehkan empat bot.

| Cohort | Smart | Baseline |
| --- | --- | --- |
| Semua evaluasi | 55/135 = 40,7% | 45/135 = 33,3% |
| 2 pemain | 17/30 = 56,7% | 15/30 = 50,0% |
| 3 pemain | 20/45 = 44,4% | 15/45 = 33,3% |
| 4 pemain | 18/60 = 30,0% | 15/60 = 25,0% |
| Raka | 19/45 = 42,2% | 15/45 = 33,3% |
| Bima | 19/45 = 42,2% | 15/45 = 33,3% |
| Sari | 17/45 = 37,8% | 15/45 = 33,3% |

Selisih +7,4 poin persentase; bootstrap per 15 kelompok seed memberi 95% interval **−4,2 sampai +19,2 poin**. Persona/seat dan baseline replay berkorelasi; raw Wilson/row-bootstrap di JSON hanya deskriptif. **Keunggulan kompetitif belum terbukti meyakinkan.** Hanya lima indeks seed per jumlah pemain; perlu evaluasi held-out yang lebih luas sebelum klaim kuat.

Nol aksi ilegal. 269/270 pertandingan evaluasi selesai di batas 2.500 aksi; satu replay diagnostik selesai pada aksi 3.338 dan hasil asli tetap dihitung unfinished/zero win. Tidak mengarang pemenang dari kekayaan. Median/p95 keputusan lokal **1,99/5,61 ms**, 37.560 sampel pada cloud desktop; bukan bukti performa Android. Hero bankrupt 79/135 versus baseline 90/135. Mean build 19,24 vs17,84; mean maksimum monopoli 3,59 vs3,16. Jumlah barter diterima adalah hitungan seluruh meja, bukan kualitas transaksi bot saja. Rasio harga lelang terhadap harga sertifikat rata-rata smart 0,876 versus baseline0,578; ini proxy harga, bukan return investasi.

Ablation enam game per varian belum menunjukkan kontribusi kausal yang meyakinkan: full/no_plan/no_trade masing-masing satu kemenangan, fixed_reserve/greedy_liquidation dua. Ini sinyal tuning lanjutan, bukan bukti setiap modul meningkatkan win rate. Penilaian kualitas barter/ROI otomatis secara penuh belum selesai. Artefak: `BOT_EVALUATION.json`, `BOT_ABLATION.json`, `BOT_BENCHMARK_ANALYSIS.json`, `BOT_TRUNCATED_REPLAY.json`; eksplorasi sebelumnya disimpan terpisah dan tidak dipakai sebagai hasil final.

## 13. Hasil Groq

Mock menguji tanpa ENV, konfigurasi vs sukses, simple skip, sukses JSON/usage, respons tidak valid/aksi di luar kandidat, HTTP401/403/429/500/503, timeout, network error, budget, circuit dan fallback aman. Actual endpoint lokal diuji lewat request/response dengan hosting/provider double. Tidak ada API Groq nyata dipanggil; tidak ada kualitas model, latency/token nyata atau biaya yang diklaim. Mock tidak membuktikan Hybrid lebih baik dari Local.

## 14. Hasil online

Tes lokal meliputi komposisi 2+0/2+1/2+3/3+3/6+0, host/capacity/waiting, human join sesudah bot, penolakan aksi bot palsu, satu commit saat worker concurrent, expiry lease/crash, snapshot berubah ketika advisor berlangsung, pause di tengah rekomendasi, voting/resume human-only, reconnect singkat menjadwalkan ulang, dan klaim sewa manual di luar giliran. Auth/RLS/SQL/Realtime/function/cron nyata belum diuji. Harness staging `tests/supabase-bots-live.test.mjs` disiapkan tetapi belum dijalankan.

## 15. TypeScript, lint dan build

Semua perintah dicoba, hasilnya diblokir dependency:

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run typecheck` | `tsc: not found` |
| `npm run lint` | `eslint: not found` |
| `npm run build` | module `vinext/dist/cli.js` belum terpasang |
| `npm run build:vercel` | `next: not found` |

Instalasi terhenti pada akses jaringan dan tidak diulang. Parser native memeriksa sintaks 21 file `.ts`/`.mjs`; hasil [SYNTAX_CHECKS.json](SYNTAX_CHECKS.json) **bukan typecheck/TSX/build**. Lihat [BUILD_CHECKS.json](BUILD_CHECKS.json). Tidak ada deployment Vercel yang diklaim berhasil.

## 16. Hal yang belum selesai/terverifikasi

- Remote commit/branch sebenarnya belum tersedia; perubahan hanya pada source workspace.
- Build blocker belum dapat ditutup secara deployment karena full compiler/build belum berjalan.
- SQL/RLS/locking, Deno bundle, pg_net/Vault/cron, Auth/Realtime dan recovery lintas server pada project nyata belum terverifikasi. Bot online default OFF.
- UI/React browser, mobile Android, gameplay manual dan cache offline setelah deployment belum terverifikasi.
- Keunggulan kompetitif, manfaat Hybrid, kualitas model dan metrik kualitas ekonomi hasil nyata belum terbukti; benchmark lebih luas/tuning lanjutan diperlukan. Pencarian utang/horizon probabilitas dibatasi dan tidak optimal secara global.
- Tidak ada budget global serverless yang kuat tanpa penyimpanan persisten; tidak ada alert/console operator khusus untuk job failed. Ekstensi/kuota target belum diaudit.

## 17. Instruksi deployment

Ikuti [DEPLOY_HYBRID.md](DEPLOY_HYBRID.md): cocokkan checkout/branch, install dependencies pada runner yang bekerja, typecheck/test/lint/build, audit staging Supabase, review migration 001/002, deploy Edge Function, pasang secret lewat secret manager/Vault, aktifkan pg_net dan recovery cron, jalankan staging harness serta QA, baru enable flag bot online. Pertahankan backend legacy dan snapshot existing. Tidak ada operasi destruktif yang diperlukan atau dijalankan.

## 18. Checklist manual setelah staging

- [ ] VS Bot 2/3/4: urutan Raka/Bima/Sari, nama/persona tetap, tidak ada difficulty selector; pion unik sesuai preview.
- [ ] Main tanpa internet setelah cache terisi; selesaikan game, refresh dan save/load v1/v2/hotseat lama tanpa kehilangan saldo/aset.
- [ ] Status local/configured/consulting/hybrid/fallback ringkas, timeout tidak menahan papan, key tidak ada di network response/bundle/save.
- [ ] Properti gratis, tawaran merugikan, cash-only, monopoli kedua pihak, counteroffer dan penolakan berulang; tidak spam.
- [ ] Lelang properti/stok bangunan, pembangunan merata/stok bank, gadai/tebus, utang, jail, kartu dan kebangkrutan.
- [ ] Dua manusia tanpa bot; 2+1, 2+3, 3+3 dan enam manusia; minimal dua manusia dan kapasitas room benar.
- [ ] Bot hanya ditambahkan host pada Waiting; tidak ada persona keempat/duplikat atau bot mengganti manusia disconnect.
- [ ] Tutup browser host; worker tetap merespons selama lease seluruh manusia sah, lalu menahan keputusan ketika manusia absen.
- [ ] Worker crash/double invocation/retry/lease expiry dan lost wakeup pulih tanpa double action; browser JWT/fake actor/cash/dice ditolak.
- [ ] Disconnect <90 detik lalu reconnect di giliran bot, lelang, barter, klaim sewa dan utang; hak tidak hilang dan job berjalan lagi.
- [ ] Disconnect >90 detik/semua offline sampai esok hari: room persistent auto-pause saat rekonsiliasi, bukan reset.
- [ ] Voting mayoritas manusia aktif 2–6, duplicate/expiry/concurrent request; bot/bangkrut tidak dihitung dan manusia offline tetap electorate.
- [ ] Resume seluruh manusia aktif online+siap; satu orang belum siap/offline menghalangi; bot tidak perlu Ready.
- [ ] Pause saat Groq in-flight; stale result ditolak, auction/trade/debt/card/turn tidak diulang setelah resume.
- [ ] RLS outsider, private snapshot/job tables, service RPC grants, Realtime membership, production build dan multi-device Auth diverifikasi sebelum promosi.
