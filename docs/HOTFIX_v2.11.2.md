# Hotfix v2.11.2 — Groq VS Bot

## Akar masalah

Versi 2.11.1 menampilkan menu “Lawan bot — tanpa internet” karena `/api/game?status=1` menetapkan `groq: !!store && !!GROQ_API_KEY`. `store` adalah Redis/room store, jadi Groq tidak diiklankan saat Redis absen, meski secret sudah diisi. Saat pemain memilih VS Bot, aplikasi juga mencoba CREATE room AI berbasis Redis, sehingga dua sistem yang berbeda terikat secara tidak sengaja.

## Perubahan terbatas bot

- Indikator Groq sekarang memeriksa keberadaan secret server terpisah dari status Redis. `groq:true` bukan healthcheck provider.
- VS Bot baru menggunakan game state lokal dan `/api/bot` untuk memilih tindakan legal dari Groq; Redis tidak diperlukan untuk keputusan bot. Room lama dan endpoint `/api/game` tetap dipertahankan.
- Server memvalidasi state game, giliran bot, ukuran payload, Origin, dan memilih hanya action dari daftar legal game engine; respons AI tidak menentukan dadu/ekonomi langsung.
- Mode bot lokal tetap berjalan jika konfigurasi tidak tersedia, Groq error 401/403/429, respons tidak valid, timeout, atau koneksi terputus. Status “Groq aktif” hanya muncul setelah benar-benar mendapat respons sah; “Groq terkonfigurasi” adalah status setup saja.
- Tombol **Periksa ulang Groq** tersedia di setup bot. Status penggunaan lokal dapat dibaca bahkan di panel compact.
- Quota Redis dipakai jika terkonfigurasi; tanpa Redis dipakai pembatasan best-effort per instance. Itu **bukan proteksi kuota global** pada serverless. Untuk deployment publik aktifkan rate limiting terpusat.
- Tidak mengubah board, pion, kartu, ekonomi, aturan permainan, maupun migrasi multiplayer.

## Konfigurasi dan uji manual

1. Buka Vercel Project → Settings → Environment Variables. Isi **`GROQ_API_KEY`** di environment yang dipakai URL sebenarnya (Production/Preview), opsional `GROQ_MODEL=openai/gpt-oss-20b`. Jangan gunakan `NEXT_PUBLIC_`.
2. **Redeploy** versi terbaru setelah mengubah env, perhatikan Root Directory dan Build Command dari `docs/DEPLOY_VERCEL.md`.
3. Buka `https://<domain>/api/game?status=1`. Kombinasi `groq:true` + `online:false` sekarang normal: Groq terkonfigurasi tetapi room Redis tidak ada. Jika `groq:false`, periksa scope env/redeploy.
4. Refresh aplikasi/PWA (bila perlu tutup-buka kembali) → Mode VS Bot → **Periksa ulang Groq** → mulailah duel.
5. Ketika hanya ada satu tindakan legal bot, tidak ada request Groq (menghemat kuota). Lanjutkan sampai muncul pilihan strategis seperti beli/lelang. Periksa status **Groq aktif** atau **Bot lokal cadangan** pada panel game.
6. Jika fallback, periksa Runtime Logs Vercel dan response error 401/429/timeout. Kode/status aman, kunci API tidak dicetak.
7. Periksa save permainan lokal dan room existing.

## Verifikasi dan batasan

Tes simulasi Groq dengan fake HTTP provider membuktikan keberhasilan, 401/429/500, respons ilegal, tanpa key, dan validasi giliran. Tidak ada pengujian menggunakan API key Groq atau deployment pengguna. Build Vercel, React DOM dan multi-device harus diverifikasi di lingkungan dengan node_modules/akses hosting.
