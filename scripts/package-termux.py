#!/usr/bin/env python3
"""Source + prepared web/backend outputs; never package local credentials."""
import hashlib
import json
import os
import re
import subprocess
import zipfile
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
ARCHIVE = OUT / f'NUSA_ONLINE_TERMUX_{VERSION}.zip'
SKIP = {'.git', 'node_modules', '.nusa-online', 'artifacts', '__pycache__', '.pytest_cache'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

files = {}
for base, dirs, names in os.walk(ROOT):
    dirs[:] = sorted(d for d in dirs if d not in SKIP)
    for name in sorted(names):
        p = Path(base) / name
        relative = p.relative_to(ROOT).as_posix()
        if name.startswith('.env') or name.endswith(('.log', '.pyc', '.tsbuildinfo')):
            continue
        if p.is_symlink():
            raise RuntimeError(f'Symlink excluded: {relative}')
        data = p.read_bytes()
        if p.suffix in {'.mjs', '.js', '.ts', '.json', '.md', '.txt', '.sql', '.sh', '.toml'}:
            text = data.decode('utf-8')
            if re.search(r'sb_secret_[A-Za-z0-9_-]{24,}', text) or re.search(r'gsk_[A-Za-z0-9]{30,}', text):
                raise RuntimeError(f'Possible embedded credential in {relative}; inspect without printing its value')
            for jwt in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{30,}', text):
                try:
                    payload = jwt.split('.')[1]
                    claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                except (ValueError, UnicodeDecodeError):
                    continue
                if claims.get('role') == 'service_role':
                    raise RuntimeError(f'Possible embedded admin JWT in {relative}; inspect without printing its value')
        files[relative] = data

manifest_source = (ROOT / 'lib/bot/model-manifest.mjs').read_text()
model_id = re.search(r"MODEL_MANIFEST_ID = '([^']+)'", manifest_source)[1]
model_files = json.loads(manifest_source.split('export const MODEL_FILES = ', 1)[1].rstrip().rstrip(';'))
for relative, expected in model_files.items():
    if digest(files[relative]) != expected:
        raise RuntimeError(f'Stale model manifest: {relative}')

baseline = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
tracked = set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', 'HEAD'], cwd=ROOT, text=True).splitlines())
changes = []
for name, data in files.items():
    if not name.startswith(('lib/', 'termux/', 'app/', 'frontend/', 'adapters/', 'supabase/')):
        continue
    before = subprocess.run(['git', 'show', f'HEAD:{name}'], cwd=ROOT, capture_output=True).stdout if name in tracked else None
    if before != data:
        changes.append({'file': name, 'baselineSha256': digest(before) if before is not None else None, 'sha256': digest(data)})

generated = {
    'MODEL_MANIFEST.json': {'id': model_id, 'release': 'v23.2-guard-finance-auction', 'files': model_files},
    'VERSION.json': {'app': VERSION, 'protocol': 1, 'modelManifest': model_id, 'baselineCommit': baseline, 'scope': 'Persistent trade result modals and transport-only receipt metadata; full backend/frontend/Termux source and prepared outputs', 'previousRelease': '4.11.5', 'modelUnchanged': True},
    'SOURCE_PATCHES.json': {'baselineCommit': baseline, 'note': '4.11.6 adds accepted/rejected/cancelled trade receipts through integration wrappers and the existing modal shell. Deploy matching frontend/backend and refresh the prepared Edge worker when used. Board, pawn assets, protected model and official engine are byte-identical to uploaded 4.11.5. No new migration, manifest or pairing change. Historical benchmarks remain fixtures', 'changes': changes},
}
for name, value in generated.items():
    files[name] = (json.dumps(value, indent=2) + '\n').encode()
files['INSTALL.md'] = files['docs/TERMUX_ONLINE.md']
files['PACKAGE_MANIFEST.json'] = (json.dumps({
    'release': f'{VERSION} Trade Result Receipts',
    'basisVersion': '4.11.5',
    'selfHash': 'Manifest and SHA256SUMS.txt excluded to avoid circular digests',
    'files': [
        {'path': name, 'bytes': len(data), 'sha256': digest(data)}
        for name, data in sorted(files.items())
        if name not in {'PACKAGE_MANIFEST.json', 'SHA256SUMS.txt'}
    ],
}, indent=2) + '\n').encode()
files['SHA256SUMS.txt'] = ''.join(f'{digest(data)}  {name}\n' for name, data in sorted(files.items())).encode()
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(files.items()):
        z.writestr(name, data)
with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None
    names = z.namelist()
    assert 'nusa-online.sh' in names and 'INSTALL.md' in names
    assert not any('.nusa-online/' in n or '/.env' in n or n.startswith('.env') for n in names)
checksum = digest(ARCHIVE.read_bytes())
ARCHIVE.with_suffix('.zip.sha256').write_text(f'{checksum}  {ARCHIVE.name}\n')
print(json.dumps({'archive': str(ARCHIVE), 'bytes': ARCHIVE.stat().st_size, 'files': len(files), 'sha256': checksum, 'modelManifest': model_id}, indent=2))
