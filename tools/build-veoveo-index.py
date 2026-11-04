"""Build sharded lookup metadata from Lampac's public VeoVeo catalog (JSON or gzip).
Usage: python tools/build-veoveo-index.py catalog.json data/veoveo
No credentials or playback URLs are copied into the index.
"""
import gzip
import json
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_bytes()
if source[:2] == b'\x1f\x8b':
    source = gzip.decompress(source)
rows = json.loads(source)
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
shards = [{} for _ in range(32)]

def normal(value):
    return re.sub('[^a-zа-я0-9]+', ' ', str(value or '').lower().replace('ё', 'е')).strip()

def bucket(key):
    result = 0
    for char in key:
        result = (result * 31 + ord(char)) % 32
    return result

for row in rows:
    keys = ['t:' + normal(row.get(name)) for name in ('title', 'originalTitle') if normal(row.get(name))]
    if row.get('kinopoiskId'):
        keys.append('kp:' + str(row['kinopoiskId']))
    if row.get('imdbId'):
        keys.append('imdb:' + row['imdbId'])
    for key in dict.fromkeys(keys):
        values = shards[bucket(key)].setdefault(key, [])
        pair = [row['id'], row.get('year', 0)]
        if pair not in values:
            values.append(pair)
for number, shard in enumerate(shards):
    (output / (str(number) + '.json')).write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('Indexed', len(rows), 'records in', len(shards), 'shards')
