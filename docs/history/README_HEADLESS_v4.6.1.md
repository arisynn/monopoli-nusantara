# Monopoli Nusantara — Logic + Backend + Assets

Paket **v4.6.1** ini sengaja **tidak berisi tampilan frontend**. Tujuannya: membangun ulang UI tanpa menulis ulang engine, bot, ekonomi, save, dan multiplayer yang sudah ada.

**Untuk AI yang akan membangun UI: baca [AI_UI_INTEGRATION.md](AI_UI_INTEGRATION.md) sampai selesai terlebih dahulu**, kemudian [UI_REBUILD_BRIEF.md](UI_REBUILD_BRIEF.md) dan [docs/CONTRACTS.json](docs/CONTRACTS.json). Jangan menganggap paket ini sebagai aplikasi React/Next yang tinggal dijalankan.

## Isi paket

- Shared engine Monopoly 40 petak, C1009/Nusa, termasuk kompatibilitas save v1.
- NUSA MIND: empat model lokal, persona tetap Raka/Bima/Sari, worker browser opsional, Groq advisor dan guardrail.
- Backend room Supabase: Auth/authorization, CAS/revision, idempotency, voting, pause/resume, reconnect, job/lease worker bot, migrations/functions.
- Handler API `app/api/online`, `app/api/bot`, dan adapter legacy `app/api/game`. **Folder `app/api` hanya backend**, tanpa page/layout/React.
- Adapter Node standar yang baru ditambahkan, sehingga API dapat dijalankan tanpa Next.js.
- Semua **25 file statis/aset** dari `public/` sebelumnya, kecuali service worker frontend `sw.js`. Seluruh gambar, SVG, font Nusa dan pion dipertahankan identik byte.
- Modul integrasi tanpa tampilan: timeline event, matematika kamera/pion, finance formatting, storage, Auth/Realtime dan save parser. Modul ini tidak membuat DOM atau komponen UI.
- Tes headless, simulasi, scripts self-play/benchmark, frozen baseline dan laporan hasil sebelumnya.

**Tidak disertakan:** React components/hooks, TSX/JSX, CSS, halaman menu/gameplay lama, PWA/service worker, config build frontend, dependency React/Next, `node_modules`, cache build, dan file secret aktual. Source lengkap asli tidak dihapus atau diubah.

## Jalankan tanpa instalasi dependency

Gunakan **Node.js 24.x**. Engine, demo, tes dan backend Node memakai built-in JavaScript/Fetch/TypeScript stripping Node; tidak memerlukan React, Next, Redis atau Supabase hanya untuk bermain/simulasi lokal.

```bash
npm test
npm run demo
npm run selfplay -- --model=medium --seed=461 --max-actions=4000
npm start
```

`npm start` membuka **backend saja** di `http://127.0.0.1:8787`; `GET /health` memberi JSON. `/` tidak menampilkan halaman dan `/assets/*` tidak disajikan oleh adapter backend. UI baru perlu menyajikan aset sendiri dan menghubungkan API. Jangan menafsirkan halaman 404 root sebagai game rusak.

Jangan menjalankan `npm run dev`, `build:vercel`, atau script frontend dari dokumentasi historis: script itu memang tidak ada pada paket ini. UI baru bebas menggunakan React/Next/Vue/Svelte/native, selama kontraknya sama.

Pemeriksaan TypeScript semantik opsional memerlukan dependency pengembangan yang tercantum dalam `package.json`:

```bash
npm install --ignore-scripts
npm run typecheck
```

Instalasi ini tidak diperlukan untuk demo/tes headless. Compiler tidak tersedia pada lingkungan pembuatan paket, jadi `tsc` belum dinyatakan lulus. Paket tidak mewarisi lockfile frontend lama karena itu akan membawa graph React/Next yang sengaja dikeluarkan.

## Konfigurasi backend

`.env.example` hanya berisi nama variabel dan nilai placeholder. Node tidak otomatis membaca `.env` pada `npm start`. Masukkan variabel lewat environment/secret manager, atau gunakan kemampuan bawaan Node:

```bash
node --env-file=.env --experimental-strip-types --import ./adapters/node/aliases.mjs adapters/node/server.mjs
```

- `MN_HEADLESS_PORT`: default `8787`.
- `MN_HEADLESS_HOST`: default `127.0.0.1`.
- `MN_HEADLESS_ORIGIN`: origin publik yang sama dengan browser/front proxy, misalnya `http://localhost:5173` atau `https://game.example.com`. Default memakai host/port backend. Ini menentukan origin URL `Request` dan harus cocok dengan `Origin` frontend.
- Gunakan reverse proxy **same-origin** untuk `/api/*`. Tidak ada wildcard CORS atau bypass Auth pada adapter baru.
- Groq opsional: `GROQ_API_KEY`, `GROQ_MODEL`, timeout/budget. Key hanya di server.
- Supabase online memerlukan URL/public key dan service-role secret pada backend, Auth, migrations, Realtime, serta worker/scheduler jika bot online diaktifkan. Tanpa konfigurasi, API config mengembalikan `online:false`; bot lokal tetap berjalan.
- Redis/D1 hanya untuk adapter room legacy; bukan syarat VS Bot lokal atau room Supabase baru.

Dokumen `docs/DEPLOY_*` adalah panduan **historis dari source lengkap**: gunakan bagian backend/Supabase/worker-nya. Perintah build frontend atau package manager lama di sana bukan instruksi menjalankan paket headless ini. Tidak ada migration baru akibat pemisahan paket ini; jangan apply ulang migration secara buta pada database existing.

## Struktur penting

```text
lib/game.mjs                    engine v2 + delegasi kompatibilitas v1
lib/content.mjs                 BOARD, GROUPS, DECKS, RULEPACK
lib/currency.mjs                Nusa: 10 unit internal = N 1
lib/finance.mjs                 ledger, signed deltas, history text
lib/bot/                       empat model, persona, candidates, valuation, memory
lib/server/                    room/service/store/worker otoritatif
lib/groq.ts                    advisor server + kontrak fallback
lib/online-client.mjs           browser Auth/Realtime, tanpa UI
lib/storage.ts                 browser IndexedDB/localStorage, tanpa UI
lib/presentation-timeline.mjs   antrean event visual murni, tanpa renderer
app/api/                       fetch handlers server asli
adapters/node/                 resolver alias dan HTTP adapter baru
supabase/                      migrations, Edge Function, scheduler setup
public/                        aset asli, tanpa frontend renderer
examples/                      contoh engine lokal dan self-play tanpa layar
scripts/                       runner tes dan lab/benchmark
benchmarks/frozen-v45/          baseline pembanding; bukan engine aktif
```

Browser adapter seperti storage/Auth/Worker hanya boleh dipanggil dalam browser atau environment yang menyediakan API-nya. Mengimpor engine headless tidak mengharuskan DOM. Server hanya menggunakan engine/backend, bukan adapter storage browser.

## Hasil nyata pemisahan

- `npm test`: **266/266 lulus, 0 skipped**, termasuk engine, bot, service/API, concurrency, event timeline, save, serta tes adapter headless baru.
- Demo lokal menghasilkan state/roll/event tanpa frontend.
- Self-play Medium, seed `461`: **selesai dalam 457 aksi**, pemenang Bima. Ini satu smoke simulation, bukan bukti bahwa semua seed selesai atau bot lebih unggul.
- Modul engine/backend/bot, handler API dan aset yang disalin tidak diubah. Hash tersedia di `docs/HEADLESS_PROVENANCE.json`.
- Tes frontend tidak dibawa. Enam kasus frontend/PWA dari dua file campuran dipisahkan secara eksplisit; lihat `docs/HEADLESS_TEST_SELECTION.json`. Tidak ada tes UI yang dipalsukan sebagai lulus.
- Tidak ada live Supabase/Groq, deployment, atau tes listening socket yang berhasil dibuktikan dalam sandbox. API diuji langsung dengan Fetch handlers dan doubles. Node TypeScript stripping bukan semantic TypeScript.
- Laporan benchmark lama di `docs/MIND_*` tetap memiliki batas hasil aslinya. Pemisahan paket tidak menaikkan status bot atau kesiapan produksi.

Lihat `docs/HEADLESS_TEST_RESULTS.json` dan `docs/HEADLESS_VERIFICATION.json` untuk bukti dan batas verifikasi. Tidak ada perubahan database/aturan, reset Git, push, atau deployment.

## Mulai membuat UI baru

1. Jalankan tes paket untuk memastikan basisnya sehat.
2. Bangun UI dalam proyek/folder baru; jangan menimpa `lib/game.mjs`, `lib/bot`, `lib/server` atau migrations untuk menyesuaikan desain.
3. Sajikan file `public/` pada path yang sama, terutama `/assets/...`.
4. Sambungkan mode lokal ke `createGame`/`command`, mode online ke `/api/online` dengan identitas sah. Bedakan snapshot otoritatif dan state presentasi.
5. Jadikan **Menu Utama dan Gameplay saja sebagai layar penuh**. Aset, Barter, Riwayat, Profil, Room, Simpanan, Aturan dan keputusan memakai popup ringkas.
6. Jalankan checklist dalam panduan AI; validasi UI baru, perangkat, build framework dan Supabase staging sebelum rilis.
