#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js belum terinstal. Jalankan di Termux: pkg install nodejs -y';exit 1
fi
v="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$v" -lt 24 ]; then
  echo "PERHATIAN: Node $(node -v) terdeteksi. Source V23 direkomendasikan Node.js 24+."
fi
run(){
  local mode delay status
  mode="$(node lab/settings.mjs get mode)" || mode=spectator
  delay="$(node lab/settings.mjs get delayMs)" || delay=65
  echo "Mode tampilan: $mode | Jeda visual: ${delay}ms | Maksimal 5 event terbaru."
  echo 'Mode Sampai Bangkrut: menang hanya jika tersisa 1 pemain. Mode Waktu: juara dihitung dari kekayaan jika waktu habis.'
  node lab/benchmark.mjs "$@" "--display=$mode" "--display-ms=$delay"
  status=$?
  echo
  echo "Benchmark selesai (kode $status). Detail pada folder runs/."
  return 0
}
ask(){
 local target="$1" prompt="$2" default="$3" result
 read -rp "$prompt [$default]: " result || return 1
 printf -v "$target" '%s' "${result:-$default}"
}
choose_goal(){
  echo;echo 'TUJUAN PERTANDINGAN:'
  echo ' 1) Sampai Bangkrut — tinggal satu pemain hidup; pemenang dari aturan game'
  echo ' 2) Berdasarkan Waktu — juara dari TOTAL KEKAYAAN saat waktu habis'
  read -rp 'Pilih mode [1]: ' goal || return 1
  case "${goal:-1}" in
    1) victorymode=bankruptcy;minutes=60
       echo 'Batas pengaman: 60 menit / match + batas maksimum aksi. Jika berhenti karena pengaman, belum ada pemenang.';;
    2) victorymode=timed
       ask minutes 'Durasi setiap match (menit, 1-60)' 10 || return 1
       if ! [[ "$minutes" =~ ^[0-9]+$ ]] || (( 10#$minutes < 1 || 10#$minutes > 60 ));then echo 'Durasi harus 1-60 menit.';return 1;fi;;
    *) echo 'Mode tidak dikenal.';return 1;;
  esac
}
while true; do
  echo
  echo '================================================'
  echo ' NUSA MIND BENCHMARK LAB — V23 / CLI V1.2'
  echo ' Engine | AI Models | Full Log | Live Dashboard'
  echo '================================================'
  echo ' 1) Selftest koneksi Engine + Model'
  echo ' 2) Smoke: 1 match, 2 bot'
  echo ' 3) Regression: 4 match, 4 bot'
  echo ' 4) Standard: 20 match, 4 bot (pilih mode menang)'
  echo ' 5) Tournament: 100 match, 6 bot (pilih mode menang)'
  echo ' 6) Custom Benchmark (sampai bangkrut / waktu)'
  echo ' 7) Analisis save bug NUSA (fixture)'
  echo ' 8) Lihat folder hasil'
  echo ' 9) Replay verifikasi match'
  echo '10) Pengaturan Live Dashboard'
  echo ' 0) Keluar'
  read -rp 'Pilih nomor: ' choice || break
  case "$choice" in
    1) node lab/selftest.mjs || true;;
    2) run --matches=1 --players=2 --max-actions=150 --game-ms=12000 --budget=12;;
    3) run --matches=4 --players=4 --max-actions=500 --game-ms=20000 --budget=16;;
    4) choose_goal && run --matches=20 --players=4 --max-actions=50000 --budget=24 "--victory-mode=$victorymode" "--game-ms=$((10#$minutes*60000))";;
    5) echo 'CATATAN: 100 match dapat sangat lama pada mode sampai bangkrut.'; choose_goal && run --matches=100 --players=6 --max-actions=50000 --budget=24 "--victory-mode=$victorymode" "--game-ms=$((10#$minutes*60000))";;
    6)
      ask matches 'Jumlah match (1-5000)' 20 || break
      ask players 'Pemain bot per match (2-6)' 4 || break
      ask maxactions 'Batas aksi per match (1-50000)' 50000 || break
      ask ms 'Budget berpikir per keputusan dalam ms (0-2600)' 24 || break
      choose_goal || continue
      echo 'Jika loop gadai-tebus ditemukan, sebaiknya hentikan match agar bot tidak menghabiskan waktu tanpa kemajuan.'
      read -rp 'Hentikan match saat loop? [Y/n]: ' stoponloop || break
      stoponloop=true
      if [[ "$stoponloop" =~ ^[Nn]$ ]];then stoponloop=false;fi
      run "--matches=$matches" "--players=$players" "--max-actions=$maxactions" "--budget=$ms" "--victory-mode=$victorymode" "--game-ms=$((10#$minutes*60000))" "--stop-on-loop=$stoponloop";;
    7) node lab/analyze-save.mjs fixtures/nusa-loop-mortgage-redeem.json || true;;
    8) echo 'Lokasi hasil:';pwd;ls -dt runs/* 2>/dev/null | head -12 || echo 'Belum ada hasil benchmark.';;
    9) read -rp 'Folder match (misalnya runs/RUN_ID/matches/match-0001): ' directory; node lab/replay.mjs "$directory" || true;;
    10)
       echo; echo 'Pilihan mode: 1) Spectator  2) Performance  3) Off'
       read -rp 'Pilih [1]: ' view_choice || break
       case "${view_choice:-1}" in
          1) view_mode=spectator;;
          2) view_mode=performance;;
          3) view_mode=off;;
          *) echo 'Mode tidak dikenal';continue;;
       esac
       if [ "$view_mode" = spectator ]; then
          ask view_ms 'Jeda tontonan tiap aksi (0-1000 ms, tidak mengurangi batas waktu simulasi)' 65 || break
       else view_ms=0;fi
       node lab/settings.mjs set "$view_mode" "$view_ms" || true;;
    0) echo 'Selesai.';exit 0;;
    *) echo 'Pilihan tidak dikenal.';;
  esac
done
