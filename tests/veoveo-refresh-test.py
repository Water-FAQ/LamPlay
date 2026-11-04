"""Validate refresh failure paths without replacing the published catalog."""
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('refresh', ROOT / 'tools/refresh-veoveo-index.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

for data in [b'[]', b'not json', b'\x1f\x8bbroken']:
    try:
        module.validate(data)
        raise AssertionError('Invalid download was accepted')
    except (ValueError, EOFError):
        pass
rows = [{'id': i + 1, 'title': f'Title {i}', 'year': 2026} for i in range(100_000)]
assert len(module.validate(json.dumps(rows).encode())) == 100_000
rows[-1]['id'] = rows[0]['id']
try:
    module.validate(json.dumps(rows).encode())
    raise AssertionError('Duplicate ID accepted')
except ValueError:
    pass
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    target = directory / 'data/veoveo'
    target.mkdir(parents=True)
    old = target / '0.json'
    old.write_text('{"t:existing":[[1,2026]]}')
    before = old.read_bytes()
    with patch.object(module, 'ROOT', directory), patch.object(module.urllib.request, 'urlopen', side_effect=OSError('Synthetic unavailable origin')):
        try:
            module.main()
            raise AssertionError('Expected download error')
        except OSError:
            pass
    assert old.read_bytes() == before
print('PASS invalid/empty/truncated catalogs and duplicate IDs are rejected; failed fetch preserves published data')
