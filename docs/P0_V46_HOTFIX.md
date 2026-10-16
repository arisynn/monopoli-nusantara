# Hotfix v4.5 sebelum NUSA MIND

Source aktual package 4.5.0; tidak ada .git, sehingga commit 82184e8/main dari log pengguna tidak bisa diverifikasi atau dibuat checkpoint commit. Snapshot sebelum perubahan: /workspace/v46-base.

- MobileDock menerima `s`; pemanggil keliru memakai `shown`. Diperbaiki `s={shown}` sehingga tetap menggunakan snapshot presentasi, bukan state otoritatif yang lebih awal.
- financeRows berasal dari JavaScript tanpa anotasi sehingga callback HistoryPanel kehilangan tipe. Kontrak input dan hasil ledger diberi JSDoc shared types, tanpa row:any.
- liveCardDecision menginferensikan seat hanya null dari default. Parameter diberi number|null dan kontrak event/game shared types.
- 54/54 tes presentasi v4.5 lulus setelah hotfix.
- npm run build:vercel gagal exit 127: next: not found. node_modules berisi direktori pnpm kosong. Percobaan jaringan default gagal menghubungi proxy; permintaan akses jaringan terhenti. Tidak mengubah lockfile, strictness, atau konfigurasi Vercel. Semantic TypeScript dan production build belum terverifikasi.
