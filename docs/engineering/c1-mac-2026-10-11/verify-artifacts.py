"""Read-only verification of final C1 evidence and executed runtime bytes."""
import hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((BASE/'SOURCE_AND_RUNS.json').read_text())
for path,digest in m['finalExecutableHashes'].items():assert sha(ROOT/path)==digest,path
for run in m['finalRuns']:
 r=json.loads((BASE/run['evidence']).read_text())
 assert r['counts']['PASS']==run['pass'] and r['counts'].get('FAIL',0)==0 and r['counts'].get('BLOCKED',0)==0
 for path,digest in r.get('sourceHashes',{}).items():assert sha(ROOT/path)==digest,(run['evidence'],path)
 if 'buildHashes' in r:assert r['buildHashes']==m['buildHashes'],run['evidence']
dom=json.loads((BASE/'dom-complete/results.json').read_text());bundle=subprocess.check_output(['node','--input-type=module','-e',"import {bundle} from './simulator/build.mjs';process.stdout.write(bundle('tests/b23/opaque-entry.mjs'));"],cwd=ROOT);assert hashlib.sha256(bundle).hexdigest()==dom['sourceSha256']
node=(BASE/'node-complete.log').read_text();assert all(x in node for x in ['# tests 121','# pass 121','# fail 0','# skipped 0'])
for line in (BASE/'SHA256SUMS.txt').read_text().splitlines():
 digest,path=line.split('  ',1);assert sha(BASE/path)==digest,path
print('All final executable, runtime/build/run and evidence SHA256 checks PASS')
