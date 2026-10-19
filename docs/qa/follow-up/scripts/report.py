import pathlib,json,datetime,hashlib,subprocess
root=pathlib.Path(__file__).resolve().parents[4];q=root/'docs/qa/follow-up';e=q/'evidence'
def load(name):return json.loads((e/name).read_text())
commands=load('commands.json');reruns=load('rechecks.json');final=load('final-checks.json');latest={}
for r in commands+reruns+final:latest[r['command']]=r
assert all(r['exitCode']==0 for r in latest.values()), latest
modal=load('modal-browser.json');assert len(modal['checks'])==11 and not modal['errors'] and not any(c.get('failed') for c in modal['checks'])
games=load('browser-matches.json');assert len(games)==2 and all(not r['errors'] and r['status']=='action_limit' for r in games)
worker=load('worker-status-live.json');build=json.loads((root/'dist/build.json').read_text());core=json.loads((e/'upstream-generated/docs/CLASSIC_TEST_RESULTS.json').read_text());assert core['passed']==712
rows='\n'.join(f"| `{r['command']}` | PASS | {r['exitCode']} | {r['durationSeconds']} s | [{pathlib.Path(r['log']).name}](evidence/{pathlib.Path(r['log']).name}) |" for r in latest.values())
summary={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'branch':'fix/qa-stability-and-modals','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip(),'localBuild':build,'productionBuild':worker['productionBuild'],'productionDeployed':False,'pushed':False,'protectedModelFilesVerified':51,'confirmedIssuesFixedLocally':['QA-001','QA-002','QA-004','QA-005','QA-006'],'blockedOperationalIssues':['QA-003'],'latestCommandsPassed':len(latest),'latestCommandsFailed':0,'coreTestsPassed':core['passed'],'browserInfoScenarios':11,'shortBrowserMatches':len(games),'shortBrowserActions':sum(g['engineActions'] for g in games),'naturalFullMatchesAfterFix':0,'workerAlive':worker['diagnostics']['capabilities']['workerAlive']}
(e/'summary.json').write_text(json.dumps(summary,indent=2))
(q/'FIX_REPORT.md').write_text(f'''# Laporan lengkap perbaikan QA dan modal otomatis

**Lima temuan QA sudah diperbaiki pada source lokal. Satu temuan operasional masih BLOCKED: worker Termux production offline.** Notifikasi mengambang telah diganti modal bersama tanpa tombol Tutup, lalu menutup otomatis. Perubahan belum dipush, dimerge, atau dideploy; situs production masih menjalankan build lama.

Branch: `fix/qa-stability-and-modals`. Basis commit: `{summary['baseCommit']}`. Node24.19.0, Playwright1.58.2, Chromium145 Linux headless. Tanggal19Oktober2026 UTC. Build lokal `{build['build']}`, production `{worker['productionBuild']['build']}`, keduanya masih memakai label basis4.11.6; belum dibuat/publikasikan rilis baru.

## Permintaan yang diterapkan

| Jenis modal | Perilaku terbaru | Tombol |
|---|---|---|
|Gaji melewati Start/Mulai|Modal game bersama, nominal positif, menutup otomatis sekitar2,8detik|Tidak ada|
|Sewa diterima|Modal bersama, pemberi/properti jelas, burst sewa digabung, sekitar2,8detik|Tidak ada|
|Sewa/pajak dibayar|Modal bersama, nominal negatif, sekitar2,6detik|Tidak ada|
|Uang dari kartu|Modal bersama sesudah efek kartu dikomit, sekitar2,8detik|Tidak ada|
|Masuk/bebas penjara, hasil lelang, informasi kartu pemain lain|Modal bersama, waktu baca menurut panjang teks2,3–6,5detik|Tidak ada|
|Hasil barter diterima/ditolak/dibatalkan|Modal bersama, sudut pandang dan snapshot transaksi benar, waktu baca4,5–12detik|Tidak ada|
|Keputusan beli/lelang/barter/penjara/gadai/stok|Tetap menunggu keputusan legal pemain|Tombol aksi dipertahankan|
|Aset, aturan, pengaturan, informasi properti yang dibuka pemain, hasil akhir pertandingan|Tetap bisa dibaca/digunakan sampai pemain selesai|Kontrol navigasi/aksi tetap ada|

Timer berjalan setelah modal benar-benar ditampilkan, berhenti saat tab tersembunyi atau ditutup modal manual lain, dan melanjutkan sisa waktu saat terlihat kembali. Pembaruan state online tidak mengganti modal yang sedang dibaca. Timeout hanya mengakui informasi/receipt di sisi presentasi; tidak memanggil command game atau memproses uang lagi. Kartu yang membutuhkan penerapan efek tetap memakai alur ACK resmi; timer informasi tidak mengambil keputusan transaksi.

Contoh hasil: [gaji](evidence/modal-salary.png), [sewa masuk](evidence/modal-rent-income.png), [sewa keluar](evidence/modal-rent-payment.png), [pajak](evidence/modal-tax.png), [barter diterima](evidence/modal-trade-accepted.png), [barter ditolak](evidence/modal-trade-rejected.png), [barter dibatalkan](evidence/modal-trade-cancelled.png).

## Status setiap temuan audit

| ID / severity awal | Hasil | Perbaikan dan bukti |
|---|---|---|
|QA-001 P2, footer hasil barter stale|**FIXED LOCAL**|DOM footer dibersihkan saat modal tidak aktif. Modal informasi/receipt tidak membawa Terima/Tolak/Ajukan tawaran lama. Sebelas skenario khusus dan6skenario barter browser lulus. [Sebelum](../evidence/match-4-end.png), [sesudah](evidence/modal-trade-rejected.png).|
|QA-002 P2, papan portrait pendek tertutup kontrol|**FIXED LOCAL**|Slot papan mengambil ruang yang tersisa; ukuran persegi dibatasi lebar dan tinggi slot. Pada360×480 enam pemain:board198×198,y128–326,console400–480; sebelumnyaboard360×360,y128–488. KontrolBank dipusatkan di layar pendek dan menjadi ikon44px pada≤440px agar tidak menutup petak. [Sebelum](../evidence/mobile-360x480-font1.png), [sesudah](evidence/mobile-360x480-font1.png), [360×420](evidence/mobile-360x420-font1.png).|
|QA-003 P1, worker bot online offline|**BLOCKED OPERASIONAL; UI DIMIGASI**|UI memeriksa diagnostik sebelum mengaktifkan Tambahkan bot, menjelaskan unavailable dan menyediakan retry. Slot sedang sibuk tidak disamakan dengan worker mati; Termux sehat tidak diwajibkan punya schedulerEdge. Perangkat worker belum dapat dipulihkan tanpa aksesnya. [Diagnostik terbaru](evidence/worker-status-live.json).|
|QA-004 P2, commandtest:online kehilangan alias loader|**FIXED LOCAL**|Script resmi memakai loader yang sama dengan runtime test.84/84test online lulus melalui commandnpm yang semula gagal.|
|QA-005 P2, suite browser tertinggal kontrak aktif|**FIXED LOCAL**|AssertionBank, ikon illustrasi, profil nama wajib, hasil lelang/modal dan footer diperbarui. CakupanAllTiles usang diganti navigasi inventarisBank yang memang aktif, jumlah skenario dipertahankan. Kasus tab memakai RNG fixture lokal agar ACK kartu acak tidak disangka race save. Seluruh command final di tabel lulus.|
|QA-006 P3, nominal lelang dokumen lama|**FIXED LOCAL**|Rulepack kini menyebut pembuka/kenaikan₦5=50unit engine. Tidak mengubah aturan aktual.|
|Bank details restoration, Suspected sebelumnya|**Tidak terbukti sebagai bug game**|Test menunggu pemulihan detail pada animation frame;7skenarioBank lulus. Tidak menambal reducer/keuangan berdasarkan kegagalan harness.|

`FIXED LOCAL` berarti perbaikan ada pada branch ini dan terverifikasi lokal. Bug production belum dinyatakan hilang karena belum ada deployment.

## Perubahan source

- [auto-dismiss.mjs](../../../frontend/auto-dismiss.mjs):timer presentasi bersama, pause/resume, proteksi key popup lama, cleanup.
- [feedback.mjs](../../../frontend/feedback.mjs):notifikasi bertanda pemasukan/pengeluaran, agregasi/dedup, umur modal dihitung ketika sudah tampil.
- [session.mjs](../../../frontend/session.mjs):antrean informasi/receipt menahan bot lokal sampai informasi selesai, menjaga identitas modal saat update online, membersihkan timer saat dispose.
- [app.mjs](../../../frontend/app.mjs):memakai dialog game bersama, menyembunyikan penutup untuk informasi/receipt, membersihkan footer, memeriksa status bot.
- [popups.mjs](../../../frontend/popups.mjs):isi modal informasi memakai header/body dan komponen nominal game yang ada.
- [index.html](../../../frontend/index.html) dan [styles.css](../../../frontend/styles.css):toast lama dihapus; layout slot papan portrait dan Bank pendek ditangani tanpa mengubah ilustrasi/pion.
- [online-status.mjs](../../../frontend/online-status.mjs):membedakan konfigurasi, worker offline, worker sibuk, serta schedulerEdge vsTermux.
- Package/test scripts dan dokumentasi aktif diperbarui sesuai kontrak UI terbaru.

Tidak mengubah `lib/`,engine,rulepack implementasi,bobot/model bot,MODEL_MANIFEST,API/backend,Termux,pairing atau SQL. Seluruh51hash engine/model dan hash file manifest tetap cocok;protokol/wire state tidak berubah. Tidak ada artwork board/pion yang diganti. Fallback ukuran papan juga disediakan untuk browser yang belum memahami container-query units;perangkat lama belum diuji fisik.

## Hasil pengujian otomatis terbaru

**15 command berbeda:15PASS,0FAIL pada hasil akhir.** Percobaan gagal sebelum perbaikan harness tetap disimpan di commands.json/rechecks.json; tabel ini mengambil eksekusi terakhir percommand. `npm test` **712/712PASS**. Angka84online termasuk overlap dengan suite inti dan tidak dijumlahkan sebagai test unik tambahan.

| Command | Status | Exit | Durasi | Log |
|---|---|---|---|---|
{rows}

Durasi portrait final diukur dari start prosesNode sampai laporan ditulis (tidak memasukkan startupnpm). Durasi stability final memakai waktu pembuatan log sampai laporan, presisi sekitar1detik;lihat final-checks.json. Commandlain diukur wall-clocksubprocess.

Kelompok browser yang selesai:16gameplay/layout,92portrait/protection,21lelang,7stabilitas/tab,7Bank,41UI,6hasil barter,14room lokal,5PWA,22hold/batch. Hasil mockroom tetap dilabel lokal;tidak diklaim sebagai multiplayer production.

## Sebelas reproduksi modal melalui browser

Skenario gaji memakai ROLL lewat tombolUI pada fixture lokal legal yang melewatiMulai; sewa/pajak/jail/release dan kartu memakai reducer resmi. Hasil barter diterima/ditolak melalui kontrolUI, cancellation memakai update state hasil reducer untuk mewakili lawan. Semua memakai aplikasi/DOM asli, bukan hanya render string.

- Tidak ada button terlihat pada modal informasi atau receipt.
- Modal muncul dengan densitycompact dan shell yang sama dengan modal game lain.
- Penutupan otomatis terjadi; seluruh state game sebelum/sesudah penutupan identik pada11skenario.
- Snapshot ulang tidak menampilkan sewa dua kali.
- Barteraccepted/rejected/cancelled tidak membawa commandfooter lama.
- Testbarter browser juga mengecek unread receipt setelah refresh dan tidak replay sesudah diakui otomatis.

[Data11skenario](evidence/modal-browser.json). Waktu observasi setelah screenshot sekitar2,36–2,86detik untuk notifikasi pendek dan4,43–4,86detik untuk contoh barter; bukan janji durasi identik untuk teks yang lebih panjang. Unit timer memakai clockterkontrol untuk memeriksa hidden/pause/superseded-key tanpa menunggu real time.

## Gameplay regresi setelah perubahan

Dua match baru dimulai dari lobby lewatUI:2peserta melawanNUSA dan6peserta melawanKresna/Bima/Sari/NUSA/Arka. Masing-masing mencapai80dan81aksi engine, total**161aksi**, lalu dihentikan oleh capyang disengaja. **Tidak ada pemenang yang diklaim pada dua run ini.** ErrorJavaScript/API0. Durasi sekitar97,7dan83,9detik. [Hasil dan logaksi](evidence/browser-matches.json),trace `match-0-trace.zip` dan `match-4-trace.zip`.

Lima match penuh/100match headless pada audit awal merupakan baseline historis,sebelumperubahan ini;tidak dilaporkan ulang seolah dijalankan kembali setelah fix. Reducer/model tetap byte-identik dan suite712test dijalankan ulang.

## Mobile dan Bank

Viewport360×800,393×873,412×915 tetap memakai papan selebarviewport dan geometri yang sama. Shortportrait360×480 dan360×420 kini tidak overlap dengan aktivitas/console. Landscape800×360 tetap berfungsi. CSSfont150/200%juga diperiksa,sebagai simulasiCSS saja,bukan pembuktian fontscalingAndroid.

- [Geometri7konfigurasi](evidence/mobile-audit.json)
- [Geometri360×420](evidence/short-mobile-audit.json)
- Empat modalAset/Barter/Bank/Riwayat dibuka pada setiap konfigurasi dengan penutup terjangkau.
- Banktest mencakup6viewport termasuk360×420dan1280×800,sertifikat→kembali,detailsrestored,read-only state danpartialhistorysave;7skenario lulus.
- Screenshotproteksi board/card/certificate dibuat ulang;tidak ada baselinepixelreference lintasmesin yang dipaksakan. Tidak mengklaim pixelidentik di semua platform.

## Production, worker dan batas pekerjaan

Pada{worker['checkedAt']},diagnostikproduction masih `onlineBots:true`,providerTermux,`workerAlive:false`,`availableSlots:0`. `schedulerConfigured:false` bukan buguntukmodeTermux. Buildproduction tetap392170ce55b1d147. Pembacaan ini memakai guestQA baru dan endpointdiagnostik;tidak membuatroom,pairing,migrasi atau perintahworker.

Pemulihanworker perlu dilakukan pada perangkat yang sudah dipair:periksaPM2/heartbeat/log/aksesjaringan lewat menu `nusa-online.sh`,jalankan ulang worker yang sudahada tanpa menghapus konfigurasi,lalu uji satu room dua manusia+bot hingga pemenang. Instruksioperasional ada di [TERMUX_ONLINE.md](../../TERMUX_ONLINE.md). Tidak menjalankan enableSQL,pairingulang atau deploysebagai jalan pintas.

Tidak ada akses perangkatTermux/kredensialoperator dalam sesi ini. Karena itu QA-003tetapBLOCKEDdan tidak disebutFIXED. Tampilanstatusbaru mengurangi kebingungan dan menolak penambahanbot yang belumsiap;itu bukan pengganti workeraktif.

## Risiko dan tindak lanjut yang belum boleh diberiPASS

1. Deployment/push belum dilakukan;URLpublik belum memakai perbaikan ini.
2. Satu pertandinganliveonline hingga pemenang,denganbot,auction/voting/host-loss/90sreconnect belum diuji ulang karena worker tidakaktif.
3. Android/iOS fisik,virtualkeyboard,fontscalingnative dan colorblindness tetapbelum diuji;tidak ada redesignwarna/board.
4. Profilheap/listener/timer sesi24jam dan60FPS perangkatnyata belumdijalankan. Cleanup timer ditest,namun itu bukan bukti tanpa semua jenisleak.
5. Notifikasi umum yang belumdibaca tidak direplay dari seluruh riwayat setelahrefresh;baseline mencegah alertlama. Receiptbarter memiliki persistence perperangkat/kursi dan diuji ulang. Uang/ownership tetapdisimpan olehengine.
6. Timeout otomatis dapat menutup rincian panjang;waktubaca dibatasi12detik untukbarter. Rinciantransaksi tetapada diRiwayat/Bank.
7. Labelaplikasi masih4.11.6+basisperbaikan lokal;buildfingerprintbaru membedakanartefak. Releaseversion/publikasi belumdibuat.

Tidak memberikan skorproduction baru untukcodeyang belumdideploy. Skor79/100pada auditawal tetap catatanbaseline, bukanpenilaian perbaikan yang belumlive.

## Roadmap tersisa

**HOTFIX:**verifikasiOperatorTermuxdanhealth;review/publikasikanperubahanmelaluiprosesyang diotorisasi.  
**STABILITY:**smokelive2manusia+bothingga menang,lease/reconnect/host-loss/auction/barterrace,soak+metrik.  
**UXPOLISH:**ujiAndroid/iOS,keyboard/font/kontras;petunjukkamera dancara membaca₦;evaluasi waktu baca padausabilitytest.  
**FUTUREENHANCEMENTS:**ringkasantransaksi penentu kemenangan dan eksperimenbalancing seat/roster/budgetseimbang sebelum mengubahmodel.

Laporanbaseline tetap utuh di [QA_MASTER_REPORT.md](../QA_MASTER_REPORT.md). Artefak baru terpisah di follow-up/ agar FAILhistoris dan PASSsesudah perbaikan tidak tercampur. Data ringkas:[summary.json](evidence/summary.json).
''')
(q/'README.md').write_text('''# Perbaikan QA dan modal otomatis\n\nMulai dari [FIX_REPORT.md](FIX_REPORT.md). Perubahan berada pada branch `fix/qa-stability-and-modals`, belum dipush/deploy. Lima temuan diperbaiki lokal; worker Termux production masih offline.\n\nBukti ada di `evidence/`, script tambahan di `scripts/`. Hasil audit awal di direktori induk dipertahankan sebagai baseline. `evidence/commands.json` mencatat iterasi pertama, `rechecks.json` dan `final-checks.json` mencatat verifikasi lanjutan; `latest-commands.json` mengambil hasil akhir per command.\n\nSource patch hanya mencakup source/test/dokumentasi yang berubah, tanpa file model/engine. Artefak browser memakai profil QA terisolasi.\n''')
(e/'latest-commands.json').write_text(json.dumps(list(latest.values()),indent=2))
# Improve prose spacing while preserving inline code, hashes and source paths.
import re
words=['temuan','detik','skenario','file','hash','test','command','nominal','peserta','aksi','slot','viewport','konfigurasi','modal','match','pemenang','kartu','unit','unitdasar','tahun','FAIL','PASS']
f=q/'FIX_REPORT.md';parts=re.split(r'(```[\s\S]*?```|`[^`\n]*`)',f.read_text())
for i in range(0,len(parts),2):
 parts[i]=re.sub(r'(?<=\d)(?=(?:'+ '|'.join(words) +r')\b)',' ',parts[i])
 for old,new in [('Tanggal19Oktober2026','Tanggal 19 Oktober 2026'),('UI DIMIGASI','UI DIMANTAPKAN'),('4.11.6;','4.11.6;'),('seluruh51','seluruh 51'),('Seluruh51','Seluruh 51'),('PHP','PHP')]:parts[i]=parts[i].replace(old,new)
f.write_text(''.join(parts))
print(summary)
