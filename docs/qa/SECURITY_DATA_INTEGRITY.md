# Keamanan dan integritas data non-destruktif

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

**Security confidence: sedang; rubrik80/100, bukan sertifikasi keamanan.** Tidak ada exploit, transaksi finansial ganda, kebocoran secret atau bypass giliran yang confirmed dalam batas pengujian ini.

## Yang dijalankan

| Area | Status | Bukti |
|---|---|---|
| /api/online tanpa bearer |PASS penolakan|401, tidak menghasilkan aksi|
| /api/worker request tanpa protokol |PASS penolakan|409 sebelum token action; bukan bukti seluruh auth worker live|
| Private server module static |PASS untuk dua path|/lib/server/runtime.mjs dan /server-dist/...404|
| Fake actor/dice/saldo |PASS validator lokal|Whitelist field menolak input tak diizinkan; service suite|
| Salah giliran live |PASS|400, state tidak berubah|
| Replay request/same ID |PASS live terbatas|State4→5 sekali; isi berbeda ID sama409|
| Stale revision/game version |PASS|Live previous-version409; mock CAS tests|
| Negatif/NaN/Infinity/unsafe integer |PASS lokal|38 adversarial cases total,0fail; tidak dikirim agresif production|
| Gadai/bangun ilegal/uneven |PASS penolakan lokal|38cases termasuk unowned/incomplete/mortgaged/uneven|
| Uang/kartu/stok/owner |PASS benchmark|61.365 transisi; ledger delta persis, stock/card invariant|
| Cross-room/membership |PASS suite lokal|Tidak mengakses room pemain lain live; live cross-room NOT TESTED|
| XSS nama |Source guard + unit|requirePlayerName menolak<>/control; esc digunakan renderer. Payload eksekusi live tidak dicoba|
| Scan source secret heuristik |PASS terbatas|755 file teks; 0 candidate pola privat, nilai tidak dicetak|
| RLS/SQL live dan service role |BLOCKED|Tidak ada kredensial adminDB; hanya source migration ditinjau|

## Temuan arsitektur yang mendukung integritas

1. Auth diverifikasi pada backend melalui Supabase; body userId/playerId tidak menjadi identitas.
2. `validateOnlineAction` membatasi action/field dan validasi integer aman; trade context dari browser ditolak. Owner/turn/phase diputuskan reducer.
3. Online commit memakai expected revision/CAS dan receipt request hash. RNG server authority tidak berasal dari dadu kiriman klien.
4. Worker protocol memeriksa manifest, token, lease, match/version/actor dan legal candidate. Compute/provider tidak memegang transaksiDB selama menunggu.
5. Static graph tidak mengekspos server-dist; tidak ada dependency runtime produksi. Dua pemeriksaan404 bukan scan seluruh URL.
6. SQL source mengaktifkan RLS untuk room/members/commands/updates/rate limits; revoke dari anon/authenticated dan grant RPC commit/quota ke service_role. `security definer` menyetel search_path kosong. Penerapan live persis belum diverifikasi dengan katalogDB.
7. Auth/room responses memakai no-store dan service worker mengecualikan API. Config public berisi publishable/anon key yang memang boleh terlihat, bukan service-role secret.

## Risiko/batas tanpa klaim bug

- Bearer/refresh token tersimpan localStorage per perangkat: jika origin terkena XSS, token dapat dibaca. Ini model ancaman yang perlu mitigasi, bukan bukti XSS ditemukan. CSP belum diaudit penuh; tidak mengusulkan approval/deployment selama audit.
- Request auth guest publik memang diperlukan; rate limiting provider dan relay terhadap abuse lintasinstance belum diuji agresif.
- Tidak melakukan penetration test, bruteforce room, fuzz jaringan massal, injeksi destructive SQL, pencarian data pengguna lain, maupun uji biaya Groq massal.
- Tidak ada secret diprint/dibagikan. Trace berasal dari gameplay lokal/production tanpa login; pengujian Auth live menyimpan status/timing dan snapshot publik terpilih, bukan bearer/refresh token.
- Tiga risiko lintas sesi: refresh token rotating di browser tanpa Web Locks, event out-of-order saat reconnect panjang, dan receipt tertinggal melewati300 log. Unit coverage ada; proof live lengkap tidak ada.

Bukti: [security-local.json](evidence/security-local.json), [source scan](evidence/source-secret-scan.json), [integrity](evidence/integrity.json), [online live](evidence/multiplayer-advanced.json), suite-03/extra-suite-00/suite-15.
