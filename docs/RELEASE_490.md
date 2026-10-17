# Laporan integrasi 4.9.0

Basis adalah source aktif Monopoli Nusantara **4.8.3 Stability**, bukan frontend/backend dari paket bot. README NUSA MIND BOT ONLY dibaca sebelum merge. `benchmarks/pre-upgrade/lib` adalah salinan byte-identik lib basis sebelum upgrade, khusus lab. Source engine/content, schema save 2, rulepack nusantara-c1009-2, worker client, server worker/room/service dan seluruh 17 berkas public tetap identik (lihat RELEASE_490_INTEGRITY.json).

## Implementasi

UI memprioritaskan mobile portrait: lobi centered dengan safe alignment agar layar pendek tetap dapat menggulir, dekorasi kartu geometris pastel, peserta dua kolom, form setup rapat, header/icon popup ringkas, footer menempel pada layout dialog dan scroll internal, tombol utama minimal 44px. Consequence gadai otomatis dipindah ke details yang dapat dibuka. Ada 25 glyph Lucide resmi inline, lisensi ISC dan provenance disertakan. Ikon identitas memakai ukuran tetap 20x20; aturan flex lama tidak lagi meregangkannya. Gameplay dan popup sertifikat/kartu/katalog dikecualikan lewat data-density preserved.

Perbandingan di viewport 390x844 menunjukkan tinggi lobi 550.89→372.39px (-32.4%), setup -15%, pengaturan -19.7%, aset -13.9%, penjara -19.6%, utang -24.4%. Pengukuran untuk fixture tertentu, bukan janji semua isi selalu muat tanpa scroll. Sepuluh PNG gameplay/kartu/sertifikat/katalog identik byte demi byte dalam lingkungan Chromium/font yang sama. Detail dan hash ada di PORTRAIT_VISUAL_COMPARISON.json; contoh visual di screenshots-490/.

Modul bot yang digabung: analysis, candidates, contracts, development, learned-model, learning, liquidation, memory, mind-config, mind, negotiation, probability, strategy. Export/state kontrak paket cocok dengan basis sehingga tidak perlu mengganti engine. API MindPlan/plan.action tetap; persona Raka/Bima/Sari, empat difficulty, default Medium, angka ekonomi dan otorisasi online tetap. Hook recordBotMemory sudah ada satu kali pada engine, tidak ditambahkan lagi. Lease, cancellation, revision CAS dan server-authoritative jobs dipertahankan.

`LEARNED_MODEL=null`. Source provenance saat integrasi: **63f883f3b9c768182149797a2c35ab9408326e820ec8aa2440a329b6d9e49740**. Berkas modul null SHA-256 dicatat dalam integrity/manifest; belum ada hash model runtime aktif. Model BOT_INTEGRATION_UNTRAINED.model.json adalah fixture lab dengan training.games=0, bukan bobot produksi. Artifact research asal adalah historis, hash-nya tidak menjadi bukti untuk source saat ini. Build kini menolak candidate/non-valid/promoted yang hash training/evidence-nya berbeda dari source. Jalur promote tetap memerlukan laporan holdout yang lolos gate.

## Bukti pengujian

- Baseline sebelum merge: 354/354 tes inti lulus.
- Sesudah merge: **388/388**, tanpa gagal/skip, termasuk referensi pembelajaran/online, guard artifact, konfigurasi modern/legacy, dan native Vercel entry.
- Typecheck, format check, production build dan pemeriksaan graph import/syntax lulus.
- Suite browser existing: **54/54** (16 umum, 18 compact, 5 plan, 8 aset, 7 stabilitas termasuk konflik autosave dua tab dan landscape kecil).
- Suite portrait tambahan **96/96** dicatat terpisah dalam PORTRAIT_BROWSER_RESULTS.json; mencakup lebar 320/360/390/430, pengurangan viewport form login, desktop setup dan perbandingan 10 PNG yang dilindungi.
- GameSession lokal asli tanpa DOM selesai untuk 2/3/4 peserta: 468/341/629 aksi; planner zero-search-budget, persist/load double dan Web Locks dimatikan hanya pada harness Node. Lock tab asli diuji pada browser stability.
- Smoke benchmark mesin asli: empat pertandingan foundation vs baseline ditambah empat control economic vs baseline, dua seed-cluster, dua kursi; seluruhnya selesai, tanpa aksi ilegal/failure. Delta paired foundation terhadap control **-0.25**, cluster bootstrap 95% **[-0.5, 0]**. Sampel terlalu kecil dan split tuning; tidak menunjukkan peningkatan kekuatan dan bukan evaluasi learned-search. Promotion=false sesuai gate; tidak ada perubahan bobot otomatis.

Laporan JSON adalah bukti aktual. Penyesuaian fixture Groq lama menambah konteks kepemilikan yang benar-benar kompleks supaya masih menguji jalur advisor; guardrail tidak dilonggarkan. Browser memakai Chromium emulation, belum perangkat Android/iOS fisik. Tidak melakukan pelatihan final/holdout besar, promosi bobot, atau klaim keunggulan bot.

## Vercel, Supabase, Redis

URL pengguna https://monopoli-nusantara-eight.vercel.app merespons build 4.8.3 sukses, tetapi online/bot 500 FUNCTION_INVOCATION_FAILED (VERCEL_DIAGNOSIS_BEFORE.json). Import entry lama lewat Node biasa gagal pada alias @/lib, konsisten dengan kegagalan startup. Function Logs/ENV Vercel tidak tersedia untuk inspeksi, sehingga penyebab lengkap deployment lama belum dipastikan.

Entry baru api/index.mjs menggunakan server-dist native ESM privat yang dihasilkan build. Native Node HTTP test memverifikasi GET config, respons bot, penolakan operasi online tanpa login, dan tidak adanya secret pada response; tidak memakai alias loader runtime. Build menyertakan output privat ke function dan tidak mengekspos server/secret melalui dist. Runtime mendukung alias integrasi Vercel, key modern sb_publishable_/sb_secret_, dan anon/service-role legacy. Secret modern dikirim ke Supabase melalui apikey, bukan bearer token JWT palsu. ENV tidak lengkap menghasilkan diagnostik nama/kode aman.

Redis store dan tes adapter aktif dihapus; Node/Vercel tidak mengaktifkan store legacy walau ENV Redis lama masih ada. Salinannya hanya pada baseline beku. Database Redis eksternal tidak dihapus. Konfigurasi deploy ada di **../ENV_REQUIRED.md** dan **../.env.example**. Hanya tiga ENV Supabase wajib untuk online; VS Bot tidak memerlukan ENV.

Target Supabase **connectify**. Tiga migration mn_* telah diterapkan pada pekerjaan 4.8.3; tidak ada SQL/migration baru di rilis ini. Champagne untuk novel, tidak disentuh. Room legacy mp_rooms tidak dihapus.

**Verifikasi live sesudah push 44c7b40:** Vercel melaporkan deployment sukses; build publik 4.9.0 hash c919b2883362b5de, GET online config HTTP 200/online:true, GET bot HTTP 200/configured:true. Public config mengarah ke connectify; GET Auth settings HTTP 200 dengan anonymous_users=true dan email=true. Akses anonim ke mn_rooms ditolak (401/42501) sesuai tabel privat, tanpa baris dibuka. Tidak membuat akun/room atau mengubah data. Bukti: VERCEL_DIAGNOSIS_AFTER.json dan SUPABASE_DEPLOYED_READ_ONLY.json. Diagnosis memakai cache-buster agar respons deployment lama tidak terpakai.

**Belum diverifikasi live:** login/anonymous sign-in sebenarnya, Auth redirect origin, transaksi room, Realtime lintas perangkat dan scheduler bot online. Tidak memanggil Groq live; configured:true hanya menyatakan adanya konfigurasi provider. Pengujian lanjutan dua akun/perangkat tetap diperlukan. Perubahan ENV berikutnya memerlukan redeploy. MN_ONLINE_BOTS_ENABLED tetap false sampai worker staging tervalidasi.

## Penyesuaian lobi dan GitHub

Sesuai arahan lanjutan, lobi dibuat centered dengan safe center agar konten panjang tetap bisa digulir dari awal. Dekorasi berupa gradasi pastel dan dua kartu geometris CSS ringan, tanpa animasi atau aset unduhan baru. **6/6** QA khusus centering/scroll lulus dan dicatat di LOBBY_CENTERED_RESULTS.json. Gameplay serta sepuluh PNG yang dilindungi diperiksa kembali dan tetap identik.

Repo tujuan https://github.com/arisynn/monopoli-nusantara, branch main. Sebelum perubahan, HEAD f92d8cf (4.8.3) identik dengan basis lokal; tidak ada perubahan pengguna lain yang perlu digabung. Token autentikasi disimpan sementara di luar source/ZIP dan tidak dimasukkan ke commit.
