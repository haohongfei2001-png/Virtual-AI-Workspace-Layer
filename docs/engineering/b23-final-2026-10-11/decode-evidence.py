#!/usr/bin/env python3
"""Reconstruct exact executed raw records; base64 is transport encoding only."""
import argparse, base64, gzip, hashlib, io, json, tarfile
from pathlib import Path
EXPECTED = {
    'node-final.tap': (23149, 'a14f4d60bb4875517f9cd6cb24b3ac3d40de4eb9775999ba3f3c709928fe357c'),
    'browser-final.json': (17251, 'c8d434f49170d6425eb4b911abe72e9b169bb2067235badaa016cf785df09a95'),
    'failures-native.tar': (40960, '8bab6b7b06ceae25b81ac9087b8f624ae603714e080832ea832149b47831110a'),
}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out', required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parent;out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
    for name,(size,sha) in EXPECTED.items():
        parts=sorted((root/'raw-parts').glob(name+'.gz.b64.*'))
        if not parts:raise RuntimeError('missing raw parts: '+name)
        encoded=''.join(p.read_text(encoding='ascii').strip() for p in parts)
        raw=gzip.decompress(base64.b64decode(encoded,validate=True))
        if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=sha:raise RuntimeError('raw hash mismatch: '+name)
        (out/name).write_bytes(raw)
        if name.endswith('.tar'):
            with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
                for member in archive.getmembers():
                    if not member.isfile() or Path(member.name).name!=member.name:raise RuntimeError('unsafe evidence archive')
                    (out/member.name).write_bytes(archive.extractfile(member).read())
        print(name,sha,'verified')
    report=json.loads((out/'browser-final.json').read_text());assert report['counts']=={'PASS':49,'FAIL':0}
    print('Evidence integrity verified. This does not convert mock/DOM tests into native MV3 acceptance.')
if __name__=='__main__':main()
