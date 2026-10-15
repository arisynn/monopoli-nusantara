# Hotfix v2.11.1 — TS2322 GameNotice.message

Log Vercel dari commit e99d807 menunjukkan webpack berhasil dikompilasi, lalu TypeScript gagal pada Game.tsx baris 168 kolom 39 dan 194. Dua pemanggilan GameNotice mengirim elemen NusaText, sedangkan prop message bertipe string. Pemeriksaan sintaks sebelumnya tidak menangkap ketidakcocokan tipe ini.

## Perbaikan

- `components/game/Game.tsx`: mengirim `message={nusaText(err)}` dan `message={nusaText(toast)}`.
- `components/game/GameNotice.tsx`: mempertahankan `message:string` dan `title={message}`, lalu memakai `<NusaText text={message}/>` untuk konten visual.
- Tidak menonaktifkan pemeriksaan TypeScript atau melonggarkan tipe. Tidak mengubah gameplay, aset, ekonomi, room, atau konfigurasi build.
- `tests/board-visual-v211.test.mjs`: regresi kontrak pesan teks untuk kedua pemanggilan notifikasi.
- Package dan dokumentasi ditandai 2.11.1; source/artifact 2.11 sebelumnya tetap tersedia.

## Verifikasi

147 tes regresi lulus, 0 gagal. Parsing Babel terhadap 29 berkas TS/TSX dan smoke evaluasi JSX existing lulus. Pemeriksaan penggunaan serupa tidak menemukan prop lain yang diberi `=<NusaText...>`.

Compiler TypeScript dan dependency aplikasi tidak tersedia dalam workspace; build penuh, lint dan `tsc --noEmit` belum dapat dijalankan ulang. Tidak melakukan instalasi ulang. Parser Babel bukan pemeriksaan tipe. Jalankan ulang deployment Vercel untuk memverifikasi build lengkap.

## Cara menerapkan

Gunakan source ZIP 2.11.1 atau terapkan patch dua komponen di root repository 2.11:

```sh
git apply Monopoli_Nusantara_v2.11.1-hotfix.patch
```

Patch hanya memuat dua komponen terkait. Tidak memerlukan perubahan dependency, lockfile, environment variable, atau pengaturan Vercel. Source ZIP lengkap juga memuat versi package, tes dan dokumentasi terbaru.
