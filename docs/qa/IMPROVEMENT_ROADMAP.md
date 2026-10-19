# Roadmap update berikutnya

Audit tidak mengimplementasikan perbaikan berikut. Tidak mengubah model/engine/aturan/board, pairing, database atau deployment. Pengerjaan fix menunggu instruksi pengguna.

## HOTFIX

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|1|BUG / operasional|Pulihkan heartbeat dan kapasitas Termux QA-003|WorkerAlive=true,slot>0,dua manusia+bot bermain live; job/retry hanya commit sekali|
|2|BUG|Bersihkan footer shared modal QA-001|Receipt accepted/rejected/cancelled tidak memuat command lama, refresh/dismiss tidak mentransfer ulang|
|3|BUG|Tangani portrait pendek QA-002|Board/info/aksi tidak saling menutup pada360×480 enam peserta; modal dan keyboard bisa dijangkau|

## STABILITY

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|4|TECH DEBT|Perbaiki entrypoint test:online QA-004|Command resmi exit0 dari cleanclone Node24 tanpa alias global|
|5|TECH DEBT|Perbarui suite kontrak UI QA-005 dan telusuri test:bank suspected|Semua suite menyelesaikan cakupan yang tercatat; tidak hanya menghapus assertion|
|6|TECH DEBT|Sinkronkan rulepack/dokumen QA-006 dan catatan status historis|Nominal₦/unit jelas; status live tidak disamakan arsipREADME|
|7|PERFORMANCE|Soak1.000+aksi, snapshot cap, metrics bot/queue/DOM/heap/listener|Tak ada unbounded growth yang terukur; semua cap punya state/seed/action history|
|8|BUG verification|Complete live online auction, trade mortgaged/card/counter, pause/vote,host loss,90s reconnect sampai menang|Dua akun/perangkat,authoritative snapshot tetap sama; state tidak diaplikasi ulang|

## UX POLISH

| Prioritas | Kategori | Perubahan | Kriteria selesai |
|---|---|---|---|
|9|UX|Jelaskan status worker/bot sebelum pengguna menyiapkan room|Offline slot0 terlihat lebih awal; retry/pemulihan tidak membingungkan|
|10|UX|Petunjuk1menit tentang nama,₦,kamera,dadu,riwayat,barter|Pemain baru memahami aksi legal dan alasan saldo tanpa penjelasan tester|
|11|UX|Review ukuran sentuh,teks overview,kontras dan font scaling native|Diuji Android/iOS nyata,termasuk keyboard dan color-vision limitations|
|12|UX|Audit receipt/hasil lelang/utang dan back navigation lintas popup|Sudut pandang konsisten; konten scroll; konfirmasi selalu terjangkau|

## FUTURE ENHANCEMENTS

| Prioritas | Kategori | Usulan | Alasan |
|---|---|---|---|
|13|ENHANCEMENT|Ringkasan akhir dengan transaksi/aset penentu|Kemenangan lebih mudah dipahami; aturan menang tetap survivor terakhir|
|14|ENHANCEMENT|Panduan ringan trade/lelang dan tautan alasan pembayaran|Mengurangi kebingungan tanpa merombak papan|
|15|BALANCING|Eksperimen roster/seat/seed seimbang pada budget production|100 match budget4ms bukan bukti kekuatan relatif persona; jangan ubah model dari angka audit ini|
|16|TECH DEBT|Dashboard kesehatan worker dan alert heartbeat/operator|Mengurangi ketergantungan pada pemeriksaan manual tanpa mengekspos credential|

## Sepuluh rekomendasi utama

1. Pulihkan dan monitor worker Termux sebelum mempromosikan online bots.
2. Perbaiki footer receipt dan tambahkan browser regression accept/reject/cancel/counter.
3. Pastikan papan/aksi pada portrait pendek tetap terlihat.
4. Benahi command online test yang kehilangan loader.
5. Sinkronkan suite browser dengan fitur aktif dan tambahkan assertion yang menemukan QA-001.
6. Jalankan satu match online dua manusia+bot hingga pemenang,termasuk gangguan koneksi dan lease.
7. Lengkapi race lelang/barter/property-transfer dan pause/host-loss live pada room QA sendiri.
8. Jalankan soak dan metrik perangkat nyata; simpan snapshot setiap cap.
9. Perjelas pemilihan bot,₦,kamera dan alasan perubahan saldo dalam onboarding ringkas.
10. Perbarui rulepack nominal dan matriks source/frontend/backend/worker release.

Top3 dampak pengalaman: receipt bebas kontrol lama, bot online tersedia/terjelaskan, portrait pendek+keterbacaan kamera. Rekomendasi UX/ENHANCEMENT/BALANCING tidak dihitung sebagai bug confirmed.
