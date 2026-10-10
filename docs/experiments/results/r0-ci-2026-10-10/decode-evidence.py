"""Decode this workflow's four bounded evidence envelopes; no downloaded code runs."""
import base64
import gzip
import hashlib
import io
import json
import pathlib
import re
import sys

LIMIT = 262144
ALLOWED = {'environment.json', 'source-checks.json', 'browser-results.json', 'dependencies.txt'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def decode(log):
    require(len(log.encode()) <= 1048576, 'Log excerpt exceeds 1 MiB')
    starts, chunks, ends = {}, {}, set()
    for line in log.splitlines():
        # Timestamped runtime lines are distinct from echoed Python source.
        match = re.search(r'\bR0_EVIDENCE_BEGIN ([a-z-]+\.(?:json|txt)) (\d+) ([0-9a-f]{64})$', line)
        if match:
            name, size, digest = match.groups()
            require(name in ALLOWED and name not in starts and int(size) <= LIMIT, 'Invalid start')
            starts[name], chunks[name] = (int(size), digest), {}
            continue
        match = re.search(r'\bR0_EVIDENCE_CHUNK ([a-z-]+\.(?:json|txt)) (\d+) ([A-Za-z0-9+/=]+)$', line)
        if match:
            name, index, data = match.groups()
            index = int(index)
            require(name in starts and name not in ends and index == len(chunks[name]), 'Invalid chunk order')
            require(len(data) <= 1600 and (index + 1) * 1600 <= 400000, 'Invalid chunk size')
            chunks[name][index] = data
            continue
        match = re.search(r'\bR0_EVIDENCE_END ([a-z-]+\.(?:json|txt))$', line)
        if match:
            name = match.group(1)
            require(name in starts and name not in ends, 'Invalid end')
            ends.add(name)
    require(set(starts) == ALLOWED and ends == ALLOWED, 'Missing evidence envelope')
    decoded, verified = {}, []
    for name, (size, digest) in starts.items():
        encoded = ''.join(chunks[name][i] for i in range(len(chunks[name])))
        compressed = base64.b64decode(encoded, validate=True)
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as source:
            data = source.read(LIMIT + 1)
        require(len(data) == size and hashlib.sha256(data).hexdigest() == digest, 'Evidence length/digest mismatch')
        if name.endswith('.json'):
            json.loads(data)
        decoded[name] = data
        verified.append({'file': name, 'bytes': size, 'sha256': digest})
    return decoded, {'verified': verified, 'missing': []}


if __name__ == '__main__':
    require(len(sys.argv) == 3, 'Usage: decode-evidence.py LOG_EXCERPT OUTPUT_DIRECTORY')
    with pathlib.Path(sys.argv[1]).open('rb') as source:
        raw = source.read(1048577)
    require(len(raw) <= 1048576, 'Log excerpt exceeds 1 MiB')
    decoded, integrity = decode(raw.decode('utf-8'))
    out = pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for name, data in decoded.items():
        (out / name).write_bytes(data)
    (out / 'evidence-integrity.json').write_text(json.dumps(integrity, indent=2) + '\n')
    print(json.dumps(integrity, indent=2))
