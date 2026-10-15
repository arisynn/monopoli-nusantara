# Monopoli Nusantara v2.5 — Dadu, pion & alur bermain

Peningkatan terfokus dari v2.4, tanpa mengganti arsitektur, papan 40 petak, atau aturan.

- Dadu penentuan giliran awal dijelaskan eksplisit: pion masih di Mulai sampai lemparan permainan sungguhan. Seri di nilai tertinggi mengulang, mengikuti engine yang sudah ada.
- Pergerakan pion diputar ulang **per petak** dari event `lastMove`, dengan jeda singkat agar tidak tertutup efek dadu. Ini tampilan saja, tidak memodifikasi hasil engine.
- Kamera mengikuti dengan *safe zone* (tidak mengunci pion persis di tengah setiap frame). Ini membuat perpindahan pion terasa nyata.
- Selama gerakan sedang berlangsung, tombol aksi berikutnya menunggu animasi dan progres tampil di dock/panel giliran, di luar area papan. Bot lokal juga menunggu supaya tidak melewatkan animasi.
- Gerakan loncat ke penjara, preferensi kurang gerak, dan tab browser tersembunyi langsung menyelesaikan animasi tanpa menahan permainan.
- Pembaruan cache PWA ke v2.5.

## Uji
`node --test tests/pawn-flow.test.mjs` menguji trayektori, kamera, sumber hasil gerakan, dan teks aturan awal. `npm test` untuk suite penuh setelah dependensi tersedia. Periksa visual juga di perangkat sebelum deployment produksi.
