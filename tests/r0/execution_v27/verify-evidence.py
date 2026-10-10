"""Verify executed-artifact provenance. Passing this does not turn capability FAIL into PASS."""
from pathlib import Path
import os, sys, json, hashlib, subprocess, tempfile, shutil

work=Path(os.environ.get('R0_WORKDIR','')).absolute()
if not os.environ.get('R0_WORKDIR') or not str(work).startswith('/tmp/vaiwl-r0-'):
    raise SystemExit('Dedicated /tmp/vaiwl-r0-* directory required')
source=work/'source';result=source/'docs/experiments/results/r0-executed-2026-10-11'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks=[]
def run(args,**kwargs):
    proc=subprocess.run(args,cwd=source,text=True,capture_output=True,check=True,**kwargs)
    return proc.stdout

for p in sorted((source/'tests/r0/execution_v27').glob('*.mjs')):
    run(['node','--check',str(p)])
for p in sorted((source/'experiments/r0/execution_v27').glob('*.mjs')):
    run(['node','--check',str(p)])
env=dict(os.environ,PYTHONPYCACHEPREFIX=str(work/'integrity-pycache'))
run([sys.executable,'-m','py_compile',str(source/'experiments/r0/execution_v27/timefacts.py'),str(source/'tests/r0/execution_v27/test_timefacts.py')],env=env)
checks.append({'id':'new-source-syntax','status':'PASS'})

inherited=json.loads((result/'inherited-source-verification.json').read_text())
for row in inherited['unchangedFiles']:
    assert sha(source/row['path'])==row['sha256'],row['path']
    assert run(['git','hash-object',row['path']]).strip()==row['blob'],row['path']
checks.append({'id':'inherited-source-byte-equality','status':'PASS','files':len(inherited['unchangedFiles'])})

packages={}
for name,builder in [('original','experiments/r0/mv3/build-probe.mjs'),('route','experiments/r0/execution_v27/build-variants.mjs')]:
    out=Path(tempfile.mkdtemp(prefix='integrity-'+name+'-',dir=work))
    run(['node',builder,str(out)])
    actual=work/('built-'+name)
    assert sorted(p.name for p in out.iterdir())==sorted(p.name for p in actual.iterdir())
    packages[name]={}
    for p in out.iterdir():
        assert sha(p)==sha(actual/p.name),p.name
        packages[name][p.name]=sha(p)
checks.append({'id':'loaded-package-reproducibility','status':'PASS','packages':packages,'rebuildWasNotAnotherBrowserRun':True})

one=json.loads((result/'chrome-attempt1.json').read_text())
two=json.loads((result/'chrome-attempt2.json').read_text())
assert sha(source/'tests/r0/execution_v27/run-chrome.mjs')==two['sourceHashes']['runner']
assert sha(source/'experiments/r0/execution_v27/host.html')==two['sourceHashes']['host']
reconstructed=work/'integrity-runner-attempt1.mjs';shutil.copyfile(source/'tests/r0/execution_v27/run-chrome.mjs',reconstructed)
run(['patch','-R','-s',str(reconstructed),str(result/'harness-corrections.patch')])
assert sha(reconstructed)==one['sourceHashes']['runner']
checks.append({'id':'executed-runner-versions-reconstructable','status':'PASS'})
assert two['counts']=={'PASS':19,'FAIL':4,'BLOCKED':1}
assert {r['id'].split('-')[0] for r in two['tests'] if r['status']=='FAIL'}=={'C08','C09','C14','C15'}
assert two['legacy']['pass']==18 and two['legacy']['fail']==0
assert two['externalPageRequests']==[] and two['pageErrors']==[]
assert all(r['status']=='PASS' for r in json.loads((result/'timefacts-attempt1.json').read_text())['tests'])
public=json.loads((result/'public-shell.json').read_text());assert public['httpStatus']==403 and public['status']=='BLOCKED' and not public['loginAttempted'] and public['messagesSent']==0
follow=json.loads((result/'lifecycle-followup.json').read_text());assert [r['status'] for r in follow['tests']]==['LIMITED','PASS','PASS']
checks.append({'id':'honest-result-classification','status':'PASS','featureFailuresRetained':4,'freezeBlocked':True,'publicHostBlocked':True})

allowed=['experiments/r0','tests/r0','docs/experiments/results/r0-executed-2026-10-11']
entries=[]
for prefix in allowed:
    for p in sorted((source/prefix).rglob('*')):
        if p.is_dir() or '__pycache__' in p.parts or p.suffix=='.pyc' or p.name in ['BUILD_MANIFEST.json','INTEGRITY_CHECKS.json']:
            continue
        assert not p.is_symlink(),p
        assert 'node_modules' not in p.parts,p
        entries.append({'path':str(p.relative_to(source)),'bytes':p.stat().st_size,'sha256':sha(p)})
manifest={'schema':'R0_EXECUTED_BUILD_MANIFEST_V1','baseDesignCommit':inherited['baseDesign'],'inheritedSourceCommit':inherited['inheritedFrom'],
          'data':'synthetic; public host request reached 403; no private export/account data',
          'loadedPackages':packages,'files':entries,'excludes':['this manifest','INTEGRITY_CHECKS.json','runtime caches/profiles/node_modules']}
(result/'BUILD_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
check_report={'scope':'Artifact integrity only; not product acceptance','status':'PASS','checks':checks,'manifestSha256':sha(result/'BUILD_MANIFEST.json'),'featureVerdict':'LIMITED','liveAuthenticatedChatGPT':'BLOCKED'}
(result/'INTEGRITY_CHECKS.json').write_text(json.dumps(check_report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'artifactIntegrity':'PASS','inheritedFiles':27,'manifestFiles':len(entries),'featureCounts':two['counts'],'liveAuthenticatedChatGPT':'BLOCKED'}))
