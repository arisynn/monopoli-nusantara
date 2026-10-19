#!/usr/bin/env python3
"""Read benchmark ZIP data only. Never import or execute its model/engine files."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive')
parser.add_argument('--output', default='docs/audits/DICE_4115_AUDIT.json')
parser.add_argument('--count', type=int, default=100000)
args = parser.parse_args()
archive = Path(args.archive)
root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='nusa-dice-audit-') as folder, zipfile.ZipFile(archive) as z:
    names = set(z.namelist())
    event_files = sorted(n for n in names if n.endswith('/events.jsonl'))
    if not event_files:
        raise ValueError('No benchmark events.jsonl files found.')
    cmd = ['node', str(root / 'scripts/audit-dice.mjs'), '--output', args.output,
           '--count', str(args.count), '--source',
           'Historical uploaded benchmark; seeded simulations with repeated seeds, not production online CSPRNG evidence.']
    seeds = []
    for index, name in enumerate(event_files):
        base = name.rsplit('/', 1)[0]
        for leaf in ['initial-state.json', 'events.jsonl', 'final-state.json']:
            key = base + '/' + leaf
            if key not in names:
                continue
            if z.getinfo(key).file_size > 32 * 1024 * 1024:
                raise ValueError('Input exceeds 32 MiB.')
            target = Path(folder) / f'{index}-{leaf}'
            target.write_bytes(z.read(key))
            cmd.extend(['--input', str(target)])
        summary = base + '/summary.json'
        if summary in names:
            seeds.append(json.loads(z.read(summary)).get('seed'))
    subprocess.run(cmd, cwd=root, check=True)
    output = root / args.output
    report = json.loads(output.read_text())
    report['provenance'] = {'archive': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                            'eventFiles': len(event_files), 'summarySeeds': dict(collections.Counter(seeds))}
    report['limits'].append('Benchmark seeds repeat across matches. Treat log confidence intervals as descriptive; independent-roll assumptions are not established for this archive.')
    output.write_text(json.dumps(report, indent=2) + '\n')
