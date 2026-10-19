# Performance dan reliability

Node 24.19.0, Playwright 1.58.2 / Chromium 145 headless Linux; source 6b237b4c7bc1cd133d74b7585ba011e1d8ba261c, v4.11.6; build 392170ce55b1d147. Tanggal 19 Oktober 2026 UTC.

## Angka terukur

| Pengukuran | Hasil | Metode / batas |
|---|---|---|
| Lobby production fresh context |1.810s|Playwright goto→lobby, satu sampel, jaringan cloud|
| FCP fresh context |1.792s|PerformancePaintTiming|
| Slow network100KiB/s, latency150ms |4.558s lobby; FCP4.516s|CDP emulasi, satu sampel, bukan ponsel fisik|
| Setup click→modal visible |395.0ms cold; 407.3ms slow|Termasuk overhead Playwright/scroll/render, bukan EventTiming murni|
| Resource fresh profile |111 entries,671.654 byte transfer,1.220.048 byte decoded|Snapshot1s sesudah lobby; SW/background belum tentu seluruhnya selesai|
| Dist lokal |sekitar3,1MiB|Seluruh output statis, bukan bundle JS tunggal|
| JS heap fresh lobby |2.663.992 byte used;5.287.936 byte total|CDP Runtime.getHeapUsage, satu snapshot|
| DOM fresh lobby |491 node,57 JS event listener,3 documents|CDP Memory.getDOMCounters; includes browser documents|
| API live |n=87, median519.9ms, p95 774.1ms, max911.5ms|request.timing.responseEnd dari request start, termasuk HTTP Auth/reads/aksi; bukan khusus latency multiplayer|
| Backend diagnostik worker |551,0ms salah satu request|Auth65,2ms; quota210,4ms; capabilities275,1ms; satu request bukan statistik|
| Headless100 match |61.365 aksi,691,76s total compute|Budget kecil4ms, CPU berbagi browser/tests|

Screenshot dan data mentah: [performance.json](evidence/performance.json), [multiplayer-advanced.json](evidence/multiplayer-advanced.json), [production-browser-inspect.json](evidence/production-browser-inspect.json).

`performance.memory` pada tahap gameplay awal membulatkan heap menjadi10.000.000 byte; itu tidak digunakan untuk menyimpulkan penggunaan memori tetap atau bebas leak. Angka CDP di atas lebih tepat tetapi hanya untuk lobby. DOM match awal bertambah seiring owned assets/UI/log (contoh6peserta445→482nodes sebelum78 aksi); pertumbuhan kecil ini tidak membuktikan leak. Source log dibatasi300 event, bank40 recent, seen sekitar200ID; IndexedDB/save dan receipt queue punya kebijakan berbeda.

## Respons, offline dan sesi panjang

- PASS production offline lobby setelah service worker siap dan profil QA dikontrol; bukti performance-offline.png. API online tetap gagal saat offline dan tidak dicache. Suite PWA juga PASS.
- PASS reconnect singkat dua sesi, pemulihan authoritative state sesudah refresh. Reconnect90s/host transfer dan jaringan putus di tengah animasi belum diuji live.
- Animasi fast/reduced dipilih melalui UI untuk pertandingan panjang; uji ini tidak membuktikan60FPS mode animasi penuh.
- Run browser berlanjut ratusan aksi, dengan outcome dan cap ditulis terpisah pada gameplay report. Tidak ada sample CPU/frame/listener kontinu pada semua run; jangan menyatakan “tidak melambat setelah ratusan aksi” hanya dari terminal match.
- Tidak ada stress test production, FPS/raf benchmark, profiling rerender komponen atau sesi24jam. P95 bot headless ada per match; latensi pikir bot browser NUSA/full search tidak diinstrumentasi terpisah dari animasi.

## Rekomendasi PERFORMANCE

1. Tambahkan instrumentation development untuk waktu planner, queue presentasi, HTTP dan waktu kontrol kembali aktif, agar pengguna tahu apakah sedang berpikir/animasi/jaringan.
2. Jalankan soak satu tab1.000+aksi dengan CDP heap/DOM/listener/timer pada checkpoint dan forced GC hanya di lab; bandingkan setelah modal ditutup.
3. Ukur Core Web Vitals dan60FPS/long tasks pada Android kelas menengah serta Safari. Sampel cloud tunggal tidak cukup untuk target SLA.
4. Review waterfall111request dan precache saat startup; optimasi hanya setelah pengukuran perangkat. Tidak ada perubahan bundling yang dilakukan di audit.

Skor75/100 dari rubrik master: load4, jaringan lambat3, offline4, long-session telemetry2, heap/listener confidence2 (maks4 tiap kriteria). Ini mencerminkan performa dan kelengkapan bukti, bukan klaim leak ditemukan.
