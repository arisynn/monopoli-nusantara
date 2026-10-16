# Peta frontend Kepulauan

Source utama ialah `frontend/`, bukan komponen React versi lama. Backend dalam `app/api/` tetap handler Fetch dan tidak mengandung halaman Next.js. Tidak menyalin frontend lama ke source ini.

| File | Tanggung jawab |
| --- | --- |
| `frontend/app.mjs` | Dua layar, satu native dialog, event delegation, forms, focus, browser Back, slot save dan feedback |
| `frontend/session.mjs` | Adapter command lokal/intent online, autosave, timeline, worker lokal, subscription dan heartbeat |
| `frontend/domain.mjs` | Hak kontrol, tindakan utama, masking dadu, pemilihan popup, klaim sewa |
| `frontend/popups.mjs` | Renderer popup seluruh keputusan dan fitur pendukung |
| `frontend/board-depth.mjs` | Proyeksi/invers 2.5D, alas batu, pita kepemilikan, miniatur rumah/hotel dan dekorasi rim |
| `frontend/board.mjs` | SVG 40 petak dari BOARD existing, kepemilikan/gadai/bangunan, kamera dan animasi pion |
| `frontend/art.mjs` | Crest/logo, enam avatar, ikon UI dan crop atlas |
| `frontend/styles.css` | Tema terang, layout portrait dan desktop, popup scroll, safe area, reduced motion |
| `frontend/service-worker.js` | Cache aset/shell publik; tidak menyimpan API atau save |
| `frontend/cache-migration.mjs` | Cleanup khusus cache/worker UI Nusantara lama |
| `scripts/build-web.mjs` | Membuat dist terpisah dan manifest precache; strip storage.ts; tidak mengekspos modul server |
| `adapters/node/static.mjs` | Static root khusus dist, MIME dan penjagaan path |
| `api/index.ts` | Transport Vercel ke handler existing, body cap dan origin yang dipertahankan |

`GameSession.state` adalah snapshot authoritative. `model/view/head` hanya presentasi. Jangan menggunakan view untuk menghitung ulang pembayaran, kartu, dadu atau properti. Gunakan `session.act(type, data)` agar pending guard, actor binding dan version diperiksa. Online hanya mengirim intent plus requestId/action.id yang sama; command tidak dijalankan di client online.

Worker lokal di `lib/bot/mind-client.mjs` tetap melakukan perhitungan di luar main thread ketika browser mendukung. Rekomendasi terlambat dibuang saat match/version/generation berubah, popup menutupi, pause, unmount atau pindah layar. Bila worker gagal, planner ekonomi lokal menjadi fallback; kegagalan berulang dibatasi dan menyediakan Coba Ulang. Bot room diproses worker backend existing, tidak oleh session browser.

`ingestTimeline` existing memberi event ID dan log watermark. Restore/reconnect memakai baseline agar riwayat lama tidak diputar ulang. Observer melihat kartu publik dengan tombol tutup; hanya pemilik kartu yang dapat ACK. ACK adalah perintah engine sekali; menutup popup presentasi tidak menjalankan efek kartu. Setelah restore pada phase card, tombol ACK tetap tersedia walau queue visual kosong.

Dadu berada pada konsol UI. Saat rolling, hasil belum masuk markup/aria-label. Saat diceResult, nilai server/engine baru ditampilkan. Pion memakai rute sah dari event. Callback animasi hanya menyelesaikan langkah presentasi lokal. Tidak ada ACK animasi yang mengubah room atau menunggu semua client.

Saldo animasi memakai finance records engine. Kapsul tidak dibuat ulang seluruhnya pada heartbeat sehingga efek transaksi tidak restart. Lelang memakai satu node dialog selama proses; angka bid berasal dari AUCTION_RULES, bukan timer atau harga mockup. Harga contoh pada referensi tidak mengubah ekonomi.

State UI tambahan tidak dimasukkan ke snapshot gameplay. Nama/teks publik di-escape sebelum HTML. Auth token dikelola adapter existing, tidak masuk URL/markup/save game. Export/import dilarang untuk room online. Informasi strategi privat bot dan deck tidak masuk public snapshot atau broadcast.

Perubahan selanjutnya wajib menjaga minimal tap target, scroll internal popup, safe area, portrait 320–430 px, enam kapsul dalam dua baris, serta fokus keyboard. Semua popup perlu cek manual karena lingkungan ini belum dapat menjalankan browser.

Update 4.7.1: `projectBoard` mengubah titik logical ke scene trapesium 1000 unit. `unprojectBoard` menyediakan invers yang diuji untuk seluruh 40 petak. Semua polygon petak memakai proyeksi yang sama sehingga hit target SVG mengikuti bentuk yang tampak; tidak ada tilt CSS yang membuat hit area bergeser. Rute pion diproyeksikan pada tiap frame, follow camera memakai pusat tile terproyeksi. Lapisan objek diurutkan berdasarkan titik pijakan, termasuk selama pion berjalan. Pion dan bangunan tetap sprite/shape 2D menghadap pemain, tanpa model 3D.

`pawn-miniatures.webp` adalah atlas RGBA 3×2 dengan urutan numeric 0–5 sesuai `lib/pawns.mjs`: Pinisi, Komodo, Becak, Cenderawasih, Angklung, Rumah Gadang. `pawnArt` menampilkan crop yang sama pada lobby, kapsul dan profil. Tidak mengubah ID pada save/room. Cache shell dinaikkan menjadi v471 agar bundle/sprite baru dipasang bersama.
