"""Refresh public lookup metadata; invalid downloads never replace the current index."""
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://raw.githubusercontent.com/lampac-nextgen/lampac/main/Core/data/veoveo.json'
MAX_BYTES = 100_000_000


def validate(data, previous=0):
    if data[:2] == b'\x1f\x8b':
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
            data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Catalog exceeds the allowed size')
    rows = json.loads(data)
    if not isinstance(rows, list) or len(rows) < max(100_000, previous * .9):
        raise ValueError('Catalog is empty, incomplete or unexpectedly smaller')
    ids = set()
    for row in rows:
        if not isinstance(row, dict) or isinstance(row.get('id'), bool) or not isinstance(row.get('id'), int) or row['id'] <= 0:
            raise ValueError('Invalid catalog identifier')
        if not any(isinstance(row.get(k), str) and row[k].strip() for k in ('title', 'originalTitle')):
            raise ValueError('Missing title')
        if row['id'] in ids:
            raise ValueError('Duplicate catalog identifier')
        ids.add(row['id'])
        if row.get('year') and (not isinstance(row['year'], int) or not 1800 <= row['year'] <= 2200):
            raise ValueError('Invalid year')
        if row.get('imdbId') and not isinstance(row['imdbId'], str):
            raise ValueError('Invalid external identifier')
    return rows


def main():
    target = ROOT / 'data/veoveo'
    old = target / 'status.json'
    previous = json.loads(old.read_text()).get('records', 0) if old.exists() else 0
    request = urllib.request.Request(URL, headers={'User-Agent': 'LamPlay-catalog-refresh/1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Download exceeds the allowed size')
    rows = validate(raw, previous)
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        source = directory / 'catalog.json'
        source.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
        output = directory / 'index'
        subprocess.run([sys.executable, str(ROOT / 'tools/build-veoveo-index.py'), str(source), str(output)], check=True)
        files = [output / f'{i}.json' for i in range(32)]
        if any(not json.loads(p.read_text()) for p in files):
            raise ValueError('Empty index shard')
        # No content changes: preserve the last publication date and avoid empty commits.
        changed = any(not (target / p.name).exists() or json.loads(p.read_text()) != json.loads((target / p.name).read_text()) for p in files)
        status = {'updated_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'records': len(rows), 'source': URL, 'sha256': hashlib.sha256(raw).hexdigest()}
        # All parsing and generation succeeds before any tracked file is touched.
        if changed:
            for p in files:
                (target / p.name).write_bytes(p.read_bytes())
        if changed or not old.exists():
            old.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Catalog updated' if changed else 'Catalog unchanged', len(rows))


if __name__ == '__main__':
    main()
