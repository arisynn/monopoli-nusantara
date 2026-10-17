"""Build a source ZIP and SHA-256 manifest without runtime secrets or build output."""
import argparse
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text())['version']

def included(path):
    parts = path.relative_to(root).parts
    return not (
        any(p in {'node_modules', 'dist', 'server-dist', '.git', '__pycache__'} for p in parts)
        or (path.name.startswith('.env') and path.name != '.env.example')
        or path.suffix in {'.zip', '.log', '.tsbuildinfo', '.pyc'}
        or path.name == 'PACKAGE_MANIFEST.json'
    )

files = sorted(p for p in root.rglob('*') if p.is_file() and included(p))
secrets = []
if (root / '.env').exists():
    for line in (root / '.env').read_text().splitlines():
        name, sep, value = line.partition('=')
        if sep and any(x in name for x in ['TOKEN', 'API_KEY', 'SERVICE_ROLE_KEY', 'SECRET_KEY']) and len(value) > 15:
            secrets.append(value.encode())
entries = []
for path in files:
    data = path.read_bytes()
    if any(value in data for value in secrets) or re.search(rb'gsk_[A-Za-z0-9]{25,}', data):
        raise SystemExit('Secret detected in source file: ' + str(path.relative_to(root)))
    entries.append({'path': path.relative_to(root).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {
    'release': version + ' Multi-AI Persona Edition',
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'basisVersion': '4.10.2',
    'hashedFileCount': len(entries),
    'selfHash': 'Excluded to avoid a circular digest',
    'excluded': ['.env and private env files', 'node_modules', 'dist', 'server-dist', '.git', 'logs', 'ZIP files'],
    'files': entries,
}
manifest_path = root / 'PACKAGE_MANIFEST.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files + [manifest_path]:
        archive.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
print(json.dumps({'archive': str(args.output), 'files': len(entries) + 1, 'bytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))
