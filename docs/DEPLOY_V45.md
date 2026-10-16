> Panduan historis. Untuk perintah build/runtime dan status database terbaru gunakan [DEPLOY_483.md](DEPLOY_483.md).

# Deployment v4.5 — Board & Gameplay Experience

Source siap ditinjau dan tes lokal tersedia; build dan deployment belum berhasil dijalankan pada lingkungan ini. Folder workspace tetap bernama `Monopoli_Nusantara_v2.11.1`, tetapi package, label aplikasi dan metadata rilis kini 4.5.0. Jangan memakai nama folder atau nomor package sebagai bukti identitas commit. Tidak ada Git checkout/branch pada workspace ini.

1. Cocokkan source terbaru pada branch target dengan manifest/diff v4.5. Patch ini memakai source workspace Hybrid 4.0 sebagai baseline, bukan ZIP rilis awal atau commit remote yang belum tersedia. Pertahankan perubahan multiplayer/Groq lain yang tidak ada pada baseline tersebut.
2. Pada runner dengan dependensi tersedia, gunakan Node24 dan pnpm yang sudah ditentukan project. Jangan mengubah lockfile/dependency hanya untuk menghindari kegagalan lingkungan:

   ```bash
   pnpm install --frozen-lockfile
   npm run test:core
   npm run test:experience
   npm test
   npm run typecheck
   npm run lint
   npm run build:vercel
   ```

   Untuk Sites/Cloudflare, jalankan juga `npm run build` melalui workflow Sites existing. Tes TSX fixture memakai TypeScript terpasang atau Babel yang sudah tersedia, dengan hook/child stubs; bukan React DOM/browser. `tests/types/presentation-contract.ts` dan kontrak bot ikut full typecheck. Jangan promosi hanya berdasarkan parser/tes Node.
3. Deploy app/server dan Supabase Edge Function `monopoli-bots` dengan **shared engine v4.5 yang sama** bila bot online digunakan. Worker bundle lama tidak menghasilkan metadata ledger/reveal baru meskipun app sudah diperbarui. Kontrak command/RPC/revision, schema engine2, rulepack dan snapshot room1 tetap sama. Tidak ada migration SQL baru pada v4.5.
4. Pertahankan migrations001/002, Auth, membership/RLS, publication, heartbeat, pg_net/Vault/cron dan secret manager sesuai [DEPLOY_HYBRID.md](DEPLOY_HYBRID.md). Jangan menjalankan ulang CREATE SQL pada objek existing atau menghapus room. Bot online tetap default OFF sampai infrastruktur sebelumnya benar-benar diverifikasi. Root/source snapshot baru kompatibel dengan field tambahan pada JSON existing.
5. Jalankan tes Supabase staging existing dan checklist v4.5 pada dua/empat/enam akun/perangkat. Pastikan hanya `mn_room_updates` menjadi hint Realtime; metadata publik dikirim melalui snapshot otoritatif, bukan broadcast perintah ekonomi dari browser. Animasi tidak mengirim ACK ke semua peserta dan tidak menjadi persyaratan commit backend.
6. Metadata event bersifat aditif: `log.version`, actor, audience, dice/diceKind, revealed card, move, finance dan assetChanges. Save lama tetap dapat dibaca. Event historis tanpa ledger tidak diubah menjadi uang perkiraan; hanya histori teksnya ditampilkan. Jika fase kartu sudah terlewat dan payload lama tidak cukup, UI tidak menebak aktor/kartu. Deploy server/worker/frontend bersama untuk pengalaman lengkap.
7. PWA memakai cache `nusantara-v450`. Shell/unhashed JS/CSS network-first dengan offline fallback; aset `_next/static`/hash hex dapat memakai cache immutable. API/Auth/external origins/no-store tidak disimpan. Aktivasi hanya membersihkan cache UI `nusantara-v*` lama; tidak menyentuh IndexedDB/localStorage pertandingan atau server room.
8. Worker baru mengaktifkan diri tanpa reload paksa pertandingan. Saat controller berubah pada sesi yang telah memiliki controller, UI memberi informasi kecil melalui feedback existing dan tombol Settings **Simpan & muat tampilan terbaru**. Tombol menunggu simpan snapshot otoritatif sebelum reload. Pengguna versi lama mungkin perlu refresh setelah deployment; jangan meminta mereka menghapus seluruh site data.
9. Verifikasi versi **v4.5.0 — Board & Gameplay Experience** di Settings dan metadata halaman; footer menampilkan v4.5. Tidak ada commit SHA palsu. Pertahankan audience Site yang sudah ada; pembaruan kode tidak memerlukan perubahan akses.
10. Setelah build, staging dan QA perangkat lulus, publikasikan melalui pipeline hosting yang benar dengan source/commit yang cocok. Site existing masih versi1 saat audit, tanpa runtime ENV Supabase/Groq; tidak ada deployment v4.5 yang diklaim selesai pada pekerjaan ini. Jangan mengganti live site dengan paket yang belum dapat dibangun.

Rollback mempertahankan data pertandingan dan backend yang dapat membaca engine2/room1 serta bot memory1. Metadata tambahan dapat diabaikan client lama, tetapi orkestrasi bot existing harus tetap dipertahankan sampai room tersebut selesai/dijeda secara sah. Jangan menjalankan DROP, reset save, force push atau menghapus cache penyimpanan pertandingan.
