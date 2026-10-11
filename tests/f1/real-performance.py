#!/usr/bin/env python3
"""F1 real MV3/extension IDB scaling. Original 120/604 fixture preserved, additional refs appended."""
import sys,subprocess,os,json,tempfile,time,traceback,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
r={'argv':sys.argv,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests':[],'scope':'fresh isolated Chrome MV3 / actual extension IDB / synthetic appended fixture; no real user data','startedAt':time.time()}
SEED='''async size=>{
 const {ScopeRepository,WorkspaceRepository,persistentSeed,syntheticEvidenceGate,scopeOf,FIXTURE_NOW,placementId,validateState,dataProjection}=globalThis.__F1;
 const scope=scopeOf('A'),state=persistentSeed(scope,'http://127.0.0.1:48178'),original=dataProjection(state,FIXTURE_NOW,'Asia/Shanghai'),active=original.groups.filter(w=>w.segment===0).map(w=>w.id),base=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),repo=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate}),initialCounts={refs:Object.keys(state.refs).length,themes:Object.keys(state.workspaces).length};
 for(let i=604;i<size;i++){const id='F'+i;state.refs[id]={id,nativeUrl:'http://127.0.0.1:48178/hf/A/c/'+id,projectId:null,nativeTitle:'合成规模引用 '+i+' · 长中文压力边界',available:true};state.identities[id]={id,title:state.refs[id].nativeTitle,aliases:[],locked:false,owner:'bootstrap',revision:1};state.events['e_'+id]={...state.events.event_T0,id:'e_'+id,conversationId:id,messageId:id+'-u1'};state.coverage['c_'+id]={...state.coverage.coverage_T0,id:'c_'+id,conversationId:id};const workspaceId=active[i%active.length],pid=placementId(workspaceId,id);state.placements[pid]={id:pid,workspaceId,refId:id,excluded:false,order:i,locked:false,owner:'bootstrap',revision:1};}
 const attempted={refs:Object.keys(state.refs).length,themes:Object.keys(state.workspaces).length};
 try{validateState(state,state.scopeKey);}catch(e){return {status:'BLOCKED',reason:e.message,attempted,initialCounts,phase:'explicit current capacity validation before any database write',configuredTableLimit:20000,configuredStateBytes:16*1024*1024};}
 const start=performance.now(),write=await repo.initialize(scope,state);if(!write.ok)throw Error(JSON.stringify(write));const writeMs=performance.now()-start,t=performance.now(),snapshot=await repo.snapshot(scope,FIXTURE_NOW,'Asia/Shanghai'),snapshotMs=performance.now()-t;
 const counts={refs:snapshot.refs.length,themes:snapshot.groups.length},raw=(await repo.read(scope)).state;const protectedCount=Object.keys(raw.refs).length;base.close();return {status:'PERSISTED',writeMs,snapshotMs,counts,protectedCount,initialCounts};
}'''
server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'48178'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 assert server.stdout.readline().startswith('B23 native test server ready')
 with sync_playwright() as pw:
  for size in [1000,10000,100000]:
   with tempfile.TemporaryDirectory(prefix='vaiwl-f1-') as tmp:
    build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
    instrument="\nimport { ScopeRepository } from '../src/b1/scope-repository.mjs';\nimport { WorkspaceRepository } from '../src/data/repository.mjs';\nimport { persistentSeed, syntheticEvidenceGate } from './persistent-seed.mjs';\nimport { FIXTURE_NOW } from './data.mjs';\nimport { placementId, validateState } from '../src/data/state.mjs';\nimport { dataProjection } from '../src/data/evidence.mjs';\nglobalThis.__F1={ScopeRepository,WorkspaceRepository,persistentSeed,syntheticEvidenceGate,scopeOf,FIXTURE_NOW,placementId,validateState,dataProjection};\n"
    workerFile=build/'simulator/worker.mjs';workerFile.write_text(workerFile.read_text()+instrument);hashes=json.loads((build/'build-hashes.json').read_text());hashes['simulator/worker.mjs']=hashlib.sha256(workerFile.read_bytes()).hexdigest();(build/'build-hashes.json').write_text(json.dumps(hashes));r['instrumentation']='Temporary build-only static imports for privileged synthetic fixture seeding; same modules/service/IDB, no mock. Dynamic import was a driver defect. Production worker source unchanged.'
    ctx=pw.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,chromium_sandbox=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000});ctx.set_default_timeout(8000)
    cdp=ctx.browser.new_browser_cdp_session();r['chrome']=cdp.send('Browser.getVersion');extension=cdp.send('Extensions.loadUnpacked',{'path':str(build)});p=ctx.new_page()
    try:
     worker=next((w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+extension['id']+'/')),None)
     if worker is None:worker=ctx.wait_for_event('serviceworker',timeout=10000)
     seed=worker.evaluate(SEED,size);r['tests'].append({'id':'F1-real-'+str(size),'status':'BLOCKED' if seed['status']=='BLOCKED' else 'RUNNING','actual':seed,'buildHashes':json.loads((build/'build-hashes.json').read_text())});entry=r['tests'][-1]
     if seed['status']=='BLOCKED':continue
     assert seed['counts']=={'refs':size,'themes':120} and seed['protectedCount']==size and seed['initialCounts']=={'refs':604,'themes':120}
     p.goto('http://127.0.0.1:48178/hf/A/c/T0?mode=mv3&size=120');p.locator('html[data-vaiwl-hf-state=ACTIVE]').wait_for(timeout=15000);p.evaluate('globalThis.f1Native={input:HF.getView().input,transcript:HF.getView().transcript}')
     p.get_by_label('返回工作区',exact=True).click();times=[]
     for i in range(20):
      value=p.evaluate('''async i=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace')).shadowRoot,b=root.querySelector(i%2?'[aria-label="较近的30日"]':'[aria-label="较早的30日"]');if(!b||b.disabled)throw Error('adjacent-interval-unavailable');const start=performance.now();b.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-start;}''',i);times.append(value)
     p.get_by_label('查找主题与派生名称',exact=True).click();search=[]
     for i in range(10):
      value=p.evaluate('''async()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.search')).shadowRoot,input=root.querySelector('input'),t=performance.now();input.value='合成规模引用';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return {ms:performance.now()-t,rows:root.querySelectorAll('.search-results .row').length,more:!!root.querySelector('[aria-label="显示更多查找结果"]')};}''');assert value['rows']==24 and value['more'];search.append(value['ms'])
     p.get_by_label('消息输入',exact=True).fill('F1 untouched native draft');assert p.evaluate('f1Native.input===HF.getView().input&&f1Native.transcript===HF.getView().transcript&&f1Native.input.value==="F1 untouched native draft"');p.screenshot(path=str(out/('scale-'+str(size)+'.png')))
     percentile=lambda values:sorted(values)[int(.95*(len(values)-1))];nav95=percentile(times);search95=percentile(search);entry['actual'].update({'navigationMs':times,'searchFirstPaintMs':search,'navigationP95':nav95,'searchP95':search95,'nativeNodesAndDraftIntact':True});entry['status']='PASS' if nav95<150 and search95<300 else 'FAIL';entry['targets']={'navigationP95LessThan':150,'searchP95LessThan':300}
    except Exception as e:
     if r['tests'] and r['tests'][-1]['id']=='F1-real-'+str(size):r['tests'][-1].update({'status':'FAIL','error':str(e),'trace':traceback.format_exc()})
     else:r['tests'].append({'id':'F1-real-'+str(size),'status':'FAIL','error':str(e),'trace':traceback.format_exc()})
     try:p.screenshot(path=str(out/('failure-'+str(size)+'.png')))
     except:pass
    finally:ctx.close();(out/'partial.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(size,r['tests'][-1]['status'],flush=True)
except Exception as e:r['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
finally:server.terminate();server.wait(timeout=5);r['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode}
r['endedAt']=time.time();r['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for d in ['src','simulator','tests/f1'] for f in (ROOT/d).rglob('*') if f.is_file() and '__pycache__' not in str(f)};r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL','BLOCKED']};(out/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['counts']);raise SystemExit(1 if r['counts']['FAIL'] else 0)
