# Automated tests dan catatan command

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

Dependency development dipasang `npm ci --ignore-scripts`; tidak ada dependency runtime tambahan ke package.json/lockfile. Playwright dipasang di `/tmp/nusa-qa-browser` di luar repo, Chromium di cache user. Server lokal memakai npm start port8787. Browser suite menerima `MN_BROWSER_MODULE=/tmp/nusa-qa-browser/node_modules/playwright`, output diarahkan ke docs/qa/evidence. Perlu jaringan proxy untuk Node fetch: gunakan `--use-env-proxy` sebagaimana diagnose:deployment. Satu percobaan verify-integrity tanpa opsi proxy mendapat ECONNREFUSED, lalu rerun opsi proxy berhasil; itu bukan kegagalan production.

| Command | Hasil | Exit | Durasi | Log lengkap |
|---|---|---|---|---|
| `npm test` | PASS | 0 | 35.728s | [suite-00.log](evidence/suite-00.log) |
| `npm run typecheck` | PASS | 0 | 1.390s | [suite-01.log](evidence/suite-01.log) |
| `npm run check:source` | PASS | 0 | 0.577s | [suite-02.log](evidence/suite-02.log) |
| `npm run test:online` | FAIL | 1 | 0.669s | [suite-03.log](evidence/suite-03.log) |
| `npm run test:browser` | FAIL | 1 | 2.124s | [suite-04.log](evidence/suite-04.log) |
| `npm run test:portrait` | FAIL | 1 | 11.281s | [suite-05.log](evidence/suite-05.log) |
| `npm run test:auction` | FAIL | 1 | 64.361s | [suite-06.log](evidence/suite-06.log) |
| `npm run test:trade:results` | PASS | 0 | 0.641s | [suite-07.log](evidence/suite-07.log) |
| `npm run test:trade:results:browser` | PASS | 0 | 31.297s | [suite-08.log](evidence/suite-08.log) |
| `npm run test:hold:batch` | PASS | 0 | 0.593s | [suite-09.log](evidence/suite-09.log) |
| `npm run test:pwa:browser` | PASS | 0 | 6.749s | [suite-10.log](evidence/suite-10.log) |
| `npm run audit:dice` | PASS | 0 | 1.046s | [suite-11.log](evidence/suite-11.log) |
| `npm run diagnose:deployment -- --origin=https://monopoli-nusantara-eight.vercel.app` | PASS | 0 | 1.402s | [suite-12.log](evidence/suite-12.log) |
| `npm run test:stability` | FAIL | 1 | 33.900s | [suite-13.log](evidence/suite-13.log) |
| `npm run test:bank` | FAIL | 1 | 27.698s | [suite-14.log](evidence/suite-14.log) |
| `npm run test:termux` | PASS | 0 | 5.300s | [suite-15.log](evidence/suite-15.log) |
| `node --experimental-strip-types --import ./adapters/node/aliases.mjs --test --test-isolation=none tests/online.test.mjs tests/online-client.test.mjs tests/auth-proxy.test.mjs tests/online-api.test.mjs tests/online-bots.test.mjs` | PASS | 0 | 2.255s | [extra-suite-00.log](evidence/extra-suite-00.log) |
| `npm run test:hold:batch:browser` | PASS | 0 | 64.589s | [extra-suite-01.log](evidence/extra-suite-01.log) |
| `npm run test:online:rooms` | PASS | 0 | 65.896s | [extra-suite-02.log](evidence/extra-suite-02.log) |
| `node scripts/verify-speed-model.mjs` | PASS | 0 | 0.150s | [extra-suite-03.log](evidence/extra-suite-03.log) |

`npm test`: **710/710 PASS,0 skip**. Node test in-process dengan doubles tidak menguji browser/Supabase live. Exact command `npm run test:online` FAIL karena alias loader; rerun baris file sama dengan loader PASS. Kedua fakta tetap dicatat.

Suite browser `test:trade:results:browser`6 scenario PASS, `test:hold:batch:browser`PASS, `test:online:rooms`14 scenario PASS, PWA PASS. Suite browser/portrait/auction/stability/bank FAIL tidak ditutupi oleh PASS unit; cakupan parsialnya dijelaskan pada bug report. Dice100.000 roll baseline sum6–8=44,576% (ekspektasi44,444%); tidak ada bukti bias dari sampel itu. Ini audit statistik terbatas, bukan pembuktian semua sumber entropy.

## Script tambahan QA

Semua berada di docs/qa/scripts, tidak mengubah production source:

- benchmark.mjs:100 match seeded, invariant per transisi, bounded planning, summaryJSON.
- gameplay-browser.mjs:5start UI nyata; retry memilih persona yang belum digunakan.
- continue-browser.mjs:resume autosave asli dan aksi UI; state/status tersimpan, cap eksplisit.
- endgame-browser.mjs:5 fixture legal dengan bank history parsial agar ledger pembukaan jujur;3 manusia menang/2kalah.
- asset-trade-browser.mjs:hotel/gadai/tebus/hadiah, double-click build, receipt refresh/dismiss.
- repro-trade-footer.mjs:accept/reject menampilkan footer stale; penolakan command stale dan pemulihan.
- multiplayer-browser.mjs:dua sesi tamu dan UI live; multiplayer-advanced.mjs:aksi legal API sendiri/race dan penerimaan barter UI.
- mobile-audit.mjs:7 viewport/font configurations dan4modal per context.
- performance-browser.mjs:CDP/network/PWA offline produksi pada profil QA.
- security-local.mjs:38 kasus penolakan/integritas lokal.
- verify-integrity.mjs dan compare-production.mjs:hash51 file plus tujuh file production; GET aman dan penolakan unauth.
- scan-public.mjs:755 file teks,0 candidate private secret; tanpa membaca .env/credential.

Jalankan script dari root repo dengan Node24. Untuk semua script network Node gunakan --use-env-proxy. Script browser mengakses origin yang tertulis; yang bertanda production membuat identitas/room QA sendiri. Jangan mengulang live automation massal tanpa batas. Tidak ada npm install yang memodifikasi manifest proyek.

## Regression plan setiap bug

| Bug | Regression wajib | Lapisan |
|---|---|---|
|QA-001|Accepted/rejected/cancelled/counter:footer hanya dismissal; rAF gap no-popup; refresh/reconnect; dismiss tanpa versi/uang berubah|Browser nyata+unit dialog cache|
|QA-002|Rect board tidak berpotongan console/info di short portrait6p; modal/keyboard/rotate|Chromium+Android/iOS|
|QA-003|Healthy/offline/recovery worker,2 manusia+bot hingga menang; stale compute ditolak|Live staging/roomQA|
|QA-004|Exact npm command dari cleanclone Node24|CI|
|QA-005|Suite selesai semua skenario dan assertion mengikuti kontrak aktif; jangan menurunkan coverage|CI browser|
|QA-006|Nominal dokumen/rulepackUI sesuai konstanta dan fixedpoint|Review+contract ringan|

Invariant/script QA baru tidak mengubah expected aturan untuk membuat test lolos. Model file dan manifest diaudit lagi sesudah eksekusi. Generated laporan bawaan yang menimpa arsip docs disalin ke evidence/upstream-generated lalu arsip repo dipulihkan, sehingga perubahan akhir hanya docs/qa.
