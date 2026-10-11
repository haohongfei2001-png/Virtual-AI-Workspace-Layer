#!/usr/bin/env python3
"""Verify the fixed final evidence, never rerun browsers or rewrite receipts."""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
E=ROOT/'docs/engineering/f1-mac-2026-10-12'
def need(condition,message):
 if not condition:raise RuntimeError(message)
def read(path):return json.loads((E/path).read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def check_runtime(report):
 hashes=report.get('sourceHashes',{});need(bool(hashes),'Missing runtime source hashes')
 selected={k:v for k,v in hashes.items() if k.startswith(('src/','simulator/')) and Path(k).suffix in {'.mjs','.js','.css','.html','.json'}}
 need(len(selected)>=20,'Insufficient runtime source coverage')
 for path,expected in selected.items():need(sha(ROOT/path)==expected,'Runtime changed since evidence: '+path)
reports={
 'regression/page.json':17,'regression/mv3.json':19,
 'final-journeys/c1/results.json':10,'final-journeys/b5/results.json':3,
 'final-journeys/c34/results.json':3,'final-journeys/c5/results.json':2,
 'final-journeys/b4-core.json':5,'final-journeys/b4-lifecycle.json':1}
for path,n in reports.items():
 r=read(path);need(r['counts']['PASS']==n and r['counts']['FAIL']==0 and r['counts'].get('BLOCKED',0)==0,path+' result differs');check_runtime(r)
r=read('regression/db.json');a=r['tests'][0]['actual'];need(a['pass']==54 and a['fail']==0 and len(a['results'])==54,'Native IDB missing 54 individual results');need(all(x['status']=='PASS' for x in a['results']),'Native IDB case failure');check_runtime(r)
r=read('regression/dom/results.json');need(r['counts']=={'PASS':49,'FAIL':0},'DOM result mismatch (mock layer remains explicitly distinct)')
node=(E/'regression/0.log').read_text();need(re.search(r'^# tests 135$',node,re.M) is not None and re.search(r'^# fail 0$',node,re.M) is not None,'Node 135 results missing')
r=read('after-index/results.json');need(r['counts']=={'PASS':2,'FAIL':0,'BLOCKED':1},'Do not hide 100k BLOCKED');check_runtime(r)
for case in r['tests'][:2]:
 n=int(case['id'].split('-')[-1]);actual=case['actual'];need(actual['counts']=={'refs':n,'themes':120} and actual['initialCounts']=={'refs':604,'themes':120},'Stress sample reduced');need(actual['navigationP95']<150 and actual['searchP95']<300 and actual['nativeNodesAndDraftIntact'],'Performance assertions weakened')
r=read('capacity-final-units/results.json');a=r['tests'][0]['actual'];need(r['counts']=={'PASS':0,'FAIL':0,'BLOCKED':1} and a['attempted']['refs']==100000 and a['existingHumanAssetsIntact'],'Capacity refusal/human preservation evidence missing');need(a['configuredStateJsonCodeUnits']==16777216,'Capacity units misstated');check_runtime(r)
original=ROOT/'design/approved/v2.7/VAIWL_v2.7/prototype-v2.7.html';need(sha(original)=='81fa9779e4bc98b6b67c348f72a32ee1fd99519833994af9ed95716126f7da4e','Approved prototype changed')
manifest=json.loads((E/'SHA256.json').read_text());need(len(manifest['files'])>200,'Evidence manifest incomplete')
for path,expected in manifest['files'].items():
 p=ROOT/path;need(p.is_file() and sha(p)==expected,'Evidence changed: '+path)
print(json.dumps({'status':'PASS','runtimeAndEvidenceFiles':len(manifest['files']),'node':135,'nativeIDB':54,'domMockLayer':49,'page':17,'mv3':19,'realUI':{'C1':10,'B5':3,'C34':3,'C5':2,'B4core':5,'B4lifecycle':1},'performance':{'1000':'PASS','10000':'PASS','100000':'BLOCKED'},'productionHost':'NOT_RUN'},ensure_ascii=False,indent=2))
