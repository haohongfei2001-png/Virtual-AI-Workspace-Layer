#!/usr/bin/env python3
"""Check current fixed F1 receipts and runtime digests, without running Chrome.
Historical failed and diagnostic runs remain separate and immutable.
"""
import hashlib, json, re, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
E=ROOT/'docs/engineering/f1-recovery-2026-10-12'
def need(ok,message):
 if not ok:raise RuntimeError(message)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads((E/path).read_text())
def compiled(entry):return subprocess.check_output(['node','--input-type=module','-e',"import {bundle} from './simulator/build.mjs';process.stdout.write(bundle("+json.dumps(entry)+"));"],cwd=ROOT)
content=hashlib.sha256(compiled('simulator/content-entry.mjs')).hexdigest()
def runtime(report):
 selected={k:v for k,v in report.get('sourceHashes',{}).items() if k.startswith(('src/','simulator/')) and Path(k).suffix in {'.mjs','.js','.css','.html','.json'}}
 need(len(selected)>=30,'Insufficient runtime hash coverage')
 for path,expected in selected.items():need(sha(ROOT/path)==expected,'Changed runtime: '+path)
 builds=report.get('buildHashes',{})
 if not builds and report.get('tests'):builds=report['tests'][0].get('buildHashes',{})
 need(builds.get('content.js')==content,'Executed content bundle changed')
 for path in ['src/data/state.mjs','src/data/schema.mjs','src/data/hash.mjs']:
  need(builds.get(path)==sha(ROOT/path),'Executed safety kernel changed: '+path)
def accepted(path,count):
 r=read(path);need(r['counts']['PASS']==count and not r['counts']['FAIL'] and not r['counts'].get('BLOCKED',0),'Unexpected result: '+path);runtime(r);return r
ui={'regression-final/page.json':17,'regression-final/mv3.json':19,'regression-final/c1/results.json':10,'regression-final/b5/results.json':3,'regression-final/c34/results.json':3,'regression-final/c5/results.json':2,'regression-final/b4-core.json':5,'regression-final/b4-lifecycle.json':1}
for path,count in ui.items():accepted(path,count)
r=accepted('regression-final/db.json',1);a=r['tests'][0]['actual'];need(a['pass']==54 and not a['fail'] and len(a['results'])==54 and all(x['status']=='PASS' for x in a['results']),'Native IDB contracts incomplete')
r=accepted('native-partition-final/results.json',1);a=r['tests'][0]['actual'];need(a['actualExtensionIDB'] and len(a['cases'])==20 and all(c['status']=='PASS' for c in a['cases']),'Partition contracts incomplete')
dom=read('dom49-correct-driver/results.json');need(dom['counts']=={'PASS':49,'FAIL':0} and len(dom['results'])==49,'DOM49 incomplete');need(dom['sourceSha256']==hashlib.sha256(compiled('tests/b23/opaque-entry.mjs')).hexdigest(),'DOM bundle changed')
node=(E/'node-final.log').read_text();need(re.search(r'^(?:ℹ|#) tests 160$',node,re.M) and re.search(r'^(?:ℹ|#) pass 160$',node,re.M) and re.search(r'^(?:ℹ|#) fail 0$',node,re.M) and re.search(r'^(?:ℹ|#) skipped 0$',node,re.M),'Node full run incomplete')
metrics={}
for size,label in [(1000,'1k'),(10000,'10k'),(100000,'100k')]:
 r=accepted('performance-'+label+'-final/results.json',1);need(not r.get('experimentalCapacityProbe'),'Guard probe is not acceptance');a=r['tests'][0]['actual'];need(a['counts']=={'refs':size,'themes':120} and a['initialCounts']=={'refs':604,'themes':120} and a['protectedCount']==size,'Stress sample reduced');need(len(a['navigationMs'])==20 and len(a['searchFirstPaintMs'])==10,'Performance samples reduced');need(a['navigationP95']<150 and a['searchP95']<300 and a['nativeNodesAndDraftIntact'],'Performance threshold or ownership regression');metrics[label]={'navigationP95':a['navigationP95'],'searchP95':a['searchP95'],'privilegedDiagnosticSnapshotMs':a['snapshotMs']}
r=accepted('large-journeys-locator-boundaries/results.json',9);need(not r['targetedDiagnostic'],'Targeted diagnostic is not a full journey');cases={x['id']:x['actual'] for x in r['tests']}
a=cases['F1-100k-observed-worker-stop-auto-wake-no-refresh'];need(a['before']['boot']!=a['after']['boot'] and a['nativeNodesDraftIntact'] and a['manualTitleRestored'],'Worker boot/ownership proof missing');need(any(v.get('runningStatus')=='stopped' for v in r['workerEvents']),'Actual worker stop missing');need(a['before']['syntheticSenderDoc']==a['after']['syntheticSenderDoc'],'Worker recovery secretly reloaded page')
a=cases['F1-100k-account-A-B-unknown-A'];need(a['eachVerifiedAccount']==100000 and a['unknownNoSensitiveRoots'] and a['A_B_unknown_A'],'100k account scope proof missing')
a=cases['F1-100k-4x-renderer-long-chat-concurrent-input-and-navigation'];need(a['rendererCPUThrottle']==4 and max(a['nativeInput']['gaps'])<150 and all(a['nativeInput'][k] for k in ['input','draft','transcript','range','messages']) and a['nativeInput']['writeError'] is None and a['navigationP95']<150 and a['searchP95']<300,'4x stress failure');need(len(a['navigationMs'])==20 and len(a['searchMs'])==10,'4x sample count changed')
a=cases['F1-100k-native-corruption-checkpoint-plus-latest-human-recovery'];need(a['recovered']['throughActualRecoveryUI'] and a['latestHumanAndAllRefsPreserved'] and a['sourcesAndOldReceiptsInvalidated'] and a['replay']['reason']=='operation-invalidated-by-recovery','Recovery replay/assets regression')
b=r['boundedTransport'];need(b['requestDeadlineMs']==6000 and b['leaseMs']==20000 and b['pageSize']==5000 and b['maxPageBytes']<=16777216 and b['maxSuccessfulRpcMs']<6000,'Transport deadline, lease or wire guard changed')
for path in ['src/data/state.mjs','src/data/schema.mjs','src/data/hash.mjs']:
 old=subprocess.check_output(['git','show','e626e3a:'+path],cwd=ROOT);need(old==(ROOT/path).read_bytes(),'Original safety kernel modified: '+path)
need(sha(ROOT/'design/approved/v2.7/VAIWL_v2.7/prototype-v2.7.html')=='81fa9779e4bc98b6b67c348f72a32ee1fd99519833994af9ed95716126f7da4e','Approved prototype modified')
manifest=read('FINAL_SHA256.json');need(len(manifest['files'])>200,'Missing evidence inventory')
for path,expected in manifest['files'].items():need((ROOT/path).is_file() and sha(ROOT/path)==expected,'Changed artifact: '+path)
# The batch selected an obsolete read-only driver. Its original failures stay preserved;
# only the proper B23 DOM49 rerun supersedes that suite, not the other real tests.
failed=read('regression-final/dom/results.json');need(failed['counts']=={'PASS':0,'FAIL':38},'Lost wrong-driver failure original')
print(json.dumps({'status':'PASS','runtimeCommit':manifest['runtimeCommit'],'artifactCount':len(manifest['files']),'node':160,'nativeIDB':54,'nativePartitionIDB':20,'DOM_mockTransportAndIDB':49,'realUI':ui,'performance':metrics,'full100kMV3Journeys':9,'productionHost':'NOT_RUN','physicalWeakHardware':'NOT_RUN'},ensure_ascii=False,indent=2))
