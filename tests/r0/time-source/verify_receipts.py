"""Offline verification of exact live snapshots, privacy shape and bounded recovery claims."""
import ast,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'docs/experiments/results/r0-time-source-2026-10-12'
runs=[json.loads((OUT/f'run-{i}/results.json').read_text()) for i in range(1,5)]
assert [r['nativeSends'] for r in runs]==[6,2,0,1] and all(r['ownChromeClosed'] for r in runs)
for i,r in enumerate(runs,1):
 for path,wanted in r['sourceHashes'].items():assert hashlib.sha256((OUT/f'run-{i}/executed'/('time-source-'+Path(path).name)).read_bytes()).hexdigest()==wanted,(i,path)
 assert r['directInternalAPICalls']==0 and not r['requestHeadersOrPayloadRead'] and not r['fullResponseOrHARStored']
 for c in r['conditions']:
  for k in ['initialProbeHealth','preUninstallHealth','refreshSampleProbeHealth','afterRefreshReinjectedProbeHealth']:
   if k in c:assert not c[k]['trustedAccountScope'] and not c[k]['derivedContentEnabled'] and not c[k]['dataStoreOpened']
refreshes=[x for c in runs[0]['conditions'] for x in c['checks'] if x['kind']=='independent-native-refresh'];assert len(refreshes)==3 and all(x['status']=='FAIL' and not x['actual']['ownSyntheticUserVisible'] for x in refreshes)
streams=[s for r in runs for c in r['conditions'] for s in c.get('messageStreams',[])];assert len(streams)==3 and all(s['parsedFrames']==14 and s['streamError'] is None for s in streams)
assert all('privateMessages' not in s and 'privateIds' not in s for s in streams)
assert runs[3]['conditions'][0]['checks'][0]['status']=='FAIL' and not runs[3]['conditions'][0]['checks'][0]['actual']['sameRouteAsOwnConversation']
assert len(runs[3]['conditions'][0]['messageStreams'][0]['schema'])==43
for p in OUT.rglob('*.json'):
 s=p.read_text();assert not re.search(r'Bearer\s+[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{30,}|https://chatgpt\.com/(?:c/|g/)|"(?:access_token|refresh_token|authorization|cookie|privateId|privateTimes)"\s*:',s),str(p)
for p in (ROOT/'tests/r0/time-source').glob('*.py'):ast.parse(p.read_text())
assert subprocess.check_output(['git','diff','--name-only','f151fb4e843f5fda7b9eab972aae11385a5d4947','--','src','simulator','design','package.json'],cwd=ROOT,text=True).strip()==''
print(json.dumps({'status':'PASS','actualTotalSends':9,'exactExecutedSourcesVerified':True,'nativeRefreshFailuresPreserved':3,'sameRouteRequiredForBackRecovery':True,'naturalNDJSONStreams':3,'framesPerStream':14,'noNativeIdentifierOrCredentialValuesInPublicReceipts':True,'noWholeResponseOrHARStored':True,'formalRuntimeUnchanged':True,'extraIDAssociationLive':'NOT_RUN_AUTO_REVIEW_REJECTED','limit':'privacy pattern scan and reducer schema checks, not universal privacy proof'}))
