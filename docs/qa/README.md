# Monopoli Nusantara QA — 19 Oktober 2026

Mulai dari [QA_MASTER_REPORT.md](QA_MASTER_REPORT.md). Bukti mentah, screenshot, trace dan hasil pertandingan ada di `evidence/`; script reproduksi ada di `scripts/`.

Branch: `qa/full-audit-2026-10-19`, commit source `6b237b4c7bc1cd133d74b7585ba011e1d8ba261c`. Perubahan hanya audit, tanpa fix/deploy/push.

Ringkasan mesin: [summary.json](evidence/summary.json). Daftar hash artefak: [ARTIFACT_MANIFEST.json](ARTIFACT_MANIFEST.json). Archive portable berisi laporan, script, JSON/log dan screenshot; trace Playwright tetap tersedia terpisah di direktori ini.

Trace utama bug barter: [match-4-trace.zip](evidence/match-4-trace.zip). Buka dengan Playwright trace viewer lokal. Hindari mengunggah trace ke layanan publik tanpa meninjau isinya.

Untuk mereproduksi, gunakan Node24, `npm ci --ignore-scripts`, `npm run build`, `npm start`; Playwright berada di luar dependency repo (`/tmp/nusa-qa-browser/node_modules/playwright`). Jalankan script dari root repo. Browser scripts mengakses localhost atau production sesuai nama/konstanta origin; pilih hanya scope yang diperlukan. Script online live membuat room QA sendiri dan tidak menghapus database.
