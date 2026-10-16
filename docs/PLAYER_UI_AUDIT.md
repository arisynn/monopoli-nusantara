# Audit Player Experience v4.6.1

Basis: source aktif di workspace sebelum tugas UI, disalin ke `/workspace/player-ui-base`. Package awal 4.6.0, tetapi isi implementasi juga diperiksa: `lib/bot/mind-*`, persona tetap, worker bot backend, Supabase room/pause/reconnect, board SVG 40 petak dan antrean presentasi v4.5 tersedia. Tidak ada metadata Git untuk memastikan branch atau commit. Tidak memakai ZIP v2.x atau hotfix lama. Tidak ada mockup/screenshot baru yang dapat dibuka dalam giliran ini; arah desain ditentukan dari source aktual.

## Temuan dan keputusan

| Temuan pada implementasi sebelumnya | Dampak | Perubahan |
| --- | --- | --- |
| Header, tab bawah, sidebar, mobile dock dan beberapa baris kontrol memakai jalur paralel | Fokus papan terpecah; fitur dan aksi berulang | Satu `play-table`; kapsul, toolbar papan dan konsol aksi. Fitur panjang memakai modal existing |
| Dadu `DiceRollFx` dirender dalam Board sebagai overlay | Area tengah papan tertutup ketika melempar | Pindahkan renderer ke `DiceTray` di konsol; hapus prop/renderer dadu dari Board |
| Tinggi HUD memakai beberapa aturan fixed menurut jumlah pemain | Bersaing dengan ruang papan pada layar pendek | CSS grid dengan baris kapsul alami dan area papan `minmax(0,1fr)` |
| Identitas aset lokal bisa mengikuti actor bot saat giliran bot | Panel dapat memilih identitas yang keliru | `playerSeat()` memilih manusia lokal; kursi online tetap terikat room |
| Penutupan dialog juga mereset pause lokal | Menutup fitur dapat melanjutkan permainan tanpa permintaan eksplisit | Close hanya menutup lapisan UI; resume tetap melalui kontrol yang sah |
| Akses kembali ke menu berlabel “Simpan” bergantung autosave sebelumnya | Sulit memastikan kegagalan persistence tertangani | Tunggu `saveGame()` dengan snapshot otoritatif; jika gagal tetap di game dan beri feedback |
| Akses root Aset/Barter/Riwayat berbeda dari popup | Presentasi dapat berlalu di balik panel | Root feature ikut menghentikan timer/renderer lokal; transaksi backend tetap independen |
| Full vote panel dapat tampil dua kali pada Room sheet | Duplikasi tombol yang membingungkan | Satu panel voting interaktif di Room |
| README dan SOURCE_SNAPSHOT masih menunjuk rilisan lama | Pemilihan source rentan keliru | Perbarui penanda 4.6.1 dan arsipkan metadata snapshot lama |

## Fondasi yang digunakan kembali

- `useGameplayPresentation` dan `presentation-timeline.mjs`: tidak diubah. Queue tetap menangani identitas event, version, baseline restore, urutan roll/result/move/event/finance dan deduplication.
- `BoardMap`, artwork 40 petak, pion, house/hotel/mortgage markers, kamera serta animasi perpindahan existing.
- `AssetManager`, `AssetActions`, `TradeWizard`, `SelectionView`, `AuctionPanel`, `EventCard`, `HistoryPanel`, `SavePanel`, `RulesPanel`, focus trap dan Android Back.
- Engine, ledger Nusa, local AI empat model, Raka/Bima/Sari, optional Groq, authoritative worker, Auth, CAS, lease, jobs, pause voting dan resume readiness.
- Tidak menambahkan dependency, RNG, transaksi atau state machine gameplay baru.

## Backend dan akses lingkungan

Tidak ada koneksi live Supabase, identitas project, konfigurasi secret aktif atau Groq yang dapat diverifikasi dalam lingkungan ini. Tidak menjalankan SQL, migrasi, deployment, request Groq, atau mutasi database. Audit backend dibatasi source/migrations/tests yang tersedia. Detail batas lama tetap tercatat pada laporan online, v4.5 dan NUSA MIND; pembaruan UI tidak mengubah status validasi live tersebut.

`UI_PRESERVED_COMPONENTS.json` membuktikan 36 berkas engine/backend/bot/presentasi/shared yang dipilih tetap identik byte terhadap snapshot sebelum tugas UI. Pembandingan source tidak membuktikan backend produksi bekerja.

## Batas audit visual

Chromium 154 tersedia tetapi gagal diluncurkan oleh sandbox (`SIGTRAP`, `setsockopt: Operation not permitted`). React DOM dan dependency build belum tersedia. Pengujian komponen memakai TSX asli yang ditransformasi oleh Babel existing, hook fixture dan child stubs; tidak mengukur layout, font, clipping, FPS, atau interaksi sentuh di browser. Breakpoint dan aturan layout diperiksa dari source, tetapi hasil pixel nyata masih memerlukan QA.
