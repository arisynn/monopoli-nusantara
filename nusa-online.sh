#!/usr/bin/env bash
set -u
umask 077
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$TASK_ROOT" || exit 1
NUSA_APP_NAME=nusa-online-worker
ensure_node() {
 if ! command -v node >/dev/null 2>&1; then
  if command -v pkg >/dev/null 2>&1; then pkg install -y nodejs-lts || return 1; else echo 'Pasang Node.js 24+ terlebih dahulu.'; return 1; fi
 fi
 node -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Node.js 24+ diperlukan.");process.exit(1)}'
}
ensure_pm2() {
 command -v pm2 >/dev/null 2>&1 || npm install -g pm2@6.0.14 || return 1
}
start_worker() {
 ensure_node && ensure_pm2 || return 1
 node termux/manage.mjs verify || return 1
 node termux/manage.mjs validate || return 1
 if pm2 describe "$NUSA_APP_NAME" >/dev/null 2>&1; then pm2 restart "$NUSA_APP_NAME" --update-env; else pm2 start termux/ecosystem.config.cjs --only "$NUSA_APP_NAME"; fi
 pm2 save
}
case "${1:-}" in
 --start) start_worker; exit $?;;
 --stop) ensure_pm2 && pm2 stop "$NUSA_APP_NAME"; exit $?;;
 --selftest) ensure_node && node termux/manage.mjs verify && node termux/selftest.mjs; exit $?;;
esac
ensure_node || exit 1
while true; do
 cat <<'MENU'

NUSA ONLINE — TERMUX
1. Setup / pairing perangkat
2. Jalankan worker dengan PM2
3. Hentikan worker
4. Restart worker
5. Periksa koneksi Supabase/backend
6. Status worker dan room aktif
7. Monitor real-time (maksimal 5 event)
8. Lihat log lengkap
9. Pengaturan slot / budget / advisor
0. Keluar (worker tetap berjalan)
MENU
 read -r -p 'Pilih: ' choice || break
 case "$choice" in
  1) node termux/manage.mjs setup;;
  2|4) start_worker;;
  3) ensure_pm2 && pm2 stop "$NUSA_APP_NAME";;
  5) node termux/manage.mjs check;;
  6) node termux/manage.mjs status;;
  7) node termux/manage.mjs monitor;;
  8) node termux/manage.mjs logs;;
  9) node termux/manage.mjs settings;;
  0) break;;
  *) echo 'Pilihan tidak dikenal.';;
 esac
done
