"""Build a rules-only distribution. Keep the integrated game source intact."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'Monopoli_Nusantara_Game_Logic'
OUT = ROOT / 'public'
STAGE = ROOT.parent / 'logic-package' / NAME
if STAGE.exists():
    shutil.rmtree(STAGE)
STAGE.mkdir(parents=True)
OUT.mkdir(parents=True, exist_ok=True)

entry = '''export * from './lib/game.mjs';
export {AUCTION_RULES, auctionMinimum} from './lib/content.mjs';
export {CURRENCY, parseNusa, nusaInput} from './lib/currency.mjs';
export {validateLocalState, serializeSave, parseSave} from './lib/save-format.mjs';
'''
(STAGE / 'index.mjs').write_text(entry)
compat = "// Legacy save metadata only; no bot policy or model.\nexport const validDifficulty = value => ['easy','medium','hard','hardcore'].includes(value);\n"
(STAGE / 'lib').mkdir()
(STAGE / 'lib/controller-compat.mjs').write_text(compat)

def adapt(source, text):
    if source.name in ['game.mjs', 'save-format.mjs']:
        old = "import {validDifficulty} from './bot/mind-config.mjs';"
        assert old in text
        text = text.replace(old, "import {validDifficulty} from './controller-compat.mjs';")
    if source.name == 'game.mjs':
        old = "import {recordBotMemory} from './bot/memory.mjs';\n"
        assert old in text
        text = text.replace(old, '')
        assert 'recordBotMemory(s,input,actor,a);' in text
        text = text.replace('recordBotMemory(s,input,actor,a);', '')
        old = "['raka','bima','sari','nusa','apex','kresna'].includes(p.botPersona)"
        assert old in text
        text = text.replace(old, "typeof p.botPersona==='string'&&p.botPersona.length>0&&p.botPersona.length<=64")
    if source.name in ['game.mjs', 'game-v1.mjs']:
        start = text.index('export function botCandidates(')
        end = text.index('export function publicState(', start)
        assert 'export function chooseBot(' in text[start:end]
        text = text[:start] + text[end:]
    return text

specifiers = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]''')
pending = [(ROOT / spec).resolve() for spec in specifiers.findall(entry)]
copied = set()
while pending:
    source = pending.pop()
    if source in copied:
        continue
    rel = source.relative_to(ROOT)
    if rel == Path('lib/controller-compat.mjs'):
        continue
    if rel.parts[0] != 'lib' or 'bot' in rel.parts or not source.is_file():
        raise RuntimeError(f'Unexpected engine dependency: {rel}')
    copied.add(source)
    target = STAGE / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    content = adapt(source, source.read_text())
    target.write_text(content)
    for spec in specifiers.findall(content):
        if not spec.startswith('.'):
            raise RuntimeError(f'External dependency: {rel}: {spec}')
        pending.append((source.parent / spec).resolve())

package = {
    'name': 'monopoli-nusantara-game-logic', 'version': '1.0.0',
    'private': True, 'type': 'module',
    'description': 'Standalone game rules and state transitions; no bot models or planners',
    'engines': {'node': '>=24'},
    'exports': {'.': './index.mjs', './lib/*': './lib/*'}, 'dependencies': {},
}
(STAGE / 'package.json').write_text(json.dumps(package, indent=2) + '\n')
(STAGE / 'README.md').write_text('''# Monopoli Nusantara — Logic Sistem Game

Engine aturan dan transisi state saja. Tidak berisi enam persona, model NUSA,
planner bot, frontend, atau layanan online. Bisa dipakai bersama dua sistem
bot terpisah; masing-masing menghasilkan action untuk engine yang sama.
Node.js 24+, tanpa npm install.

## Contoh satu aksi

Simpan sebagai `demo.mjs` di sebelah `index.mjs`, jalankan `node demo.mjs`:

```js
import {createGame, command, decisionActor, publicState} from './index.mjs';

let state = createGame({
  players: [
    {name: 'Sistem A', controller: 'bot', botPersona: 'sistem-a', pawn: 0},
    {name: 'Standalone', controller: 'bot', botPersona: 'standalone', pawn: 1},
  ],
  startingRoll: false,
  advisorEnabled: false,
});
const actor = decisionActor(state);
const view = publicState(state); // Kirim ke sistem bot pilihanmu.
const action = {type: 'ROLL'};   // Contoh respons, valid pada fase awal ini.
state = command(state, actor, {
  ...action,
  id: `action:${state.matchId}:${state.version}`,
  expectedVersion: state.version,
});
console.log({version: state.version, phase: state.phase});
```

`command(state, actor, action, rng)` mengembalikan state baru. Aksi ilegal
melempar exception dan tidak mengubah input. Simpan hasil hanya jika berhasil.
ID mencegah pengulangan aksi yang sama; expectedVersion menolak keputusan basi.
RNG default memakai Web Crypto dan rejection sampling tanpa bias. RNG opsional
untuk pengujian harus mengembalikan angka dalam rentang [0, 1). Host bertanggung
jawab atas penjadwalan, batas waktu dan fallback masing-masing sistem bot.

`publicState()` menyembunyikan urutan kartu, daftar ID aksi dan botMemory.
Engine tidak menjalankan AI atau membuat keputusan otomatis. `botPersona`
hanya label ID opsional untuk routing eksternal (1–64 karakter), boleh memakai
nama sistem/model baru. Parameter difficulty lama hanya metadata kompatibilitas.

## Aktor dan fase

- Gunakan `decisionActor(state)` untuk keputusan utama, bukan selalu state.turn.
- Pada lelang schema 2, peserta yang belum PASS dan bukan pemegang harga
  tertinggi boleh merespons. Pilih dari auction.participants, saring
  auction.passed dan auction.highest. command memeriksa legalitas akhir.
- Pada buildOffer, respons datang dari buildOffer.pending. Pada mode sewa
  manual, pemilik tagihan rentClaims dapat CLAIM_RENT di luar giliran.
- Trade, card, debt dan mortgage dapat menunggu pemain berbeda. Jalankan
  ulang pemilihan aktor setelah setiap state baru; berhenti pada phase 'won'.
- Untuk aksi yang salah, tangkap exception lalu minta bot memilih kembali;
  jangan mengulang action/ID yang sama tanpa batas. Model dan watchdog milik host.

## API aturan

- `createGame`, `command`, `decisionActor`, `publicState`.
- `BOARD`, `GROUPS`, `DECKS`, `RULEPACK`, `PAWNS`.
- `assets`, `complete`, `rent`, `worth`, `stock`, `managementError`,
  `canManage`, `canTrade`, `buildTargets`, `interest`, `redemption`.
- `serializeSave({state})`, `parseSave(text)`, `validateLocalState(state)`.
- `CURRENCY`, `money`, `parseNusa`, `nusaInput`, `auctionMinimum`.

Uang memakai integer: **10 unit internal = ₦1**. Schema 2 memakai pembuka
lelang minimal ₦5 (50 unit), kenaikan minimal ₦5; nominal tidak wajib kelipatan
lima. Maksimum 6 peserta per pertandingan. Save schema 1 memakai engine
historisnya, termasuk aturan historis lelang.

## Pemisahan dari aplikasi terintegrasi

Source aturan dipertahankan. Pada paket ini saja, fungsi pemilih aksi bot lama
botCandidates/chooseBot dihapus, pencatatan memori strategi dilepas, dan
validator difficulty dipisah menjadi controller-compat.mjs tanpa model.
Whitelist enam ID persona diganti validasi string sehingga label bot baru
bisa dipakai. Semua validator transaksi dan aturan permainan tetap aktif.
Folder lib tidak memerlukan file dari aplikasi asal. Modul data log/hasil
lelang dipertahankan karena dipakai engine. MANIFEST.json mencatat SHA-256
setiap file, kecuali manifest itu sendiri. Revisi paket 1.0.0 bukan nomor
rilis aplikasi penuh.
''')
files = sorted(p for p in STAGE.rglob('*') if p.is_file())
manifest = {
    'package': NAME, 'packageVersion': '1.0.0', 'scope': 'game-rules-only',
    'files': {str(p.relative_to(STAGE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
}
(STAGE / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = OUT / f'{NAME}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(STAGE.rglob('*')):
        if p.is_file():
            z.write(p, str(Path(NAME) / p.relative_to(STAGE)))
print(json.dumps({'zip': str(archive), 'sourceModules': len(copied), 'bytes': archive.stat().st_size, 'stage': str(STAGE)}))
