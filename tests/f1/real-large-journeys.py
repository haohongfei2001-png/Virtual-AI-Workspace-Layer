#!/usr/bin/env python3
"""Full-scale synthetic MV3 journeys. Owned new headless Profile/CDP only; no daily Chrome.
Build-only privileged fixture/corruption/timing hooks do not relax runtime bounds or authority.
"""
import ast,sys,os,json,time,tempfile,subprocess,traceback,hashlib,platform,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tests/b23'))
from native_ui_checks import NativeChecks
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
SEED=next(ast.literal_eval(n.value) for n in ast.parse((ROOT/'tests/f1/real-performance.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SEED' for t in n.targets))
INPUT_ONLY='--input-only' in sys.argv[2:]
r={'targetedDiagnostic':INPUT_ONLY,'argv':sys.argv,'startedAt':time.time(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests':[],'workerEvents':[],'errors':[],'scope':'actual extension IndexedDB / fresh headless Chrome / 100000 accessible synthetic refs / no real ChatGPT'}
r['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for d in ['src','simulator','tests/f1'] for f in (ROOT/d).rglob('*') if f.is_file() and '__pycache__' not in str(f)}
r['environment']={'macOS':subprocess.check_output(['sw_vers'],text=True),'node':subprocess.check_output(['node','--version'],text=True).strip(),'python':platform.python_version()}
import importlib.metadata
r['environment']['playwright']=importlib.metadata.version('playwright')
server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'48178'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);ctx=None
try:
 assert server.stdout.readline().startswith('B23 native test server ready')
 with tempfile.TemporaryDirectory(prefix='vaiwl-f1-large-') as tmp,sync_playwright() as pw:
  build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
  cases=build/'tests/f1/native-partition-cases.mjs';cases.parent.mkdir(parents=True);shutil.copyfile(ROOT/'tests/f1/native-partition-cases.mjs',cases)
  shutil.copyfile(ROOT/'src/data/replica.mjs',build/'src/data/replica.mjs')
  wf=build/'simulator/worker.mjs';s=wf.read_text();hook="service.broker.handle(message,sender).then(reply,()=>reply({ok:false,reason:'service-failed'}));";assert hook in s
  s=s.replace(hook,"const started=performance.now();service.broker.handle(message,sender).then(value=>{globalThis.__F1Trace.push({type:message.type,ms:performance.now()-started,bytes:new TextEncoder().encode(JSON.stringify(value)).length,ok:value?.ok,reason:value?.reason});if(__F1Trace.length>500)__F1Trace.shift();reply(value)},()=>reply({ok:false,reason:'service-failed'}));",1)
  wf.write_text(s+"\nimport {ScopeRepository} from '../src/b1/scope-repository.mjs';\nimport {WorkspaceRepository} from '../src/data/repository.mjs';\nimport {persistentSeed,syntheticEvidenceGate} from './persistent-seed.mjs';\nimport {FIXTURE_NOW} from './data.mjs';\nimport {placementId,validateState} from '../src/data/state.mjs';\nimport {dataProjection} from '../src/data/evidence.mjs';\nimport {partitionedCases} from '../tests/f1/native-partition-cases.mjs';\nglobalThis.__F1Trace=[];globalThis.__F1={ScopeRepository,WorkspaceRepository,persistentSeed,syntheticEvidenceGate,scopeOf,FIXTURE_NOW,placementId,validateState,dataProjection,partitionedCases};\n")
  r['buildHashes']={str(f.relative_to(build)):hashlib.sha256(f.read_bytes()).hexdigest() for f in build.rglob('*') if f.is_file()};r['instrumentation']='temporary build static fixture imports, original native contracts, privileged test corruption and RPC timings only; no production guard/deadline/lease edits'
  ctx=pw.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,chromium_sandbox=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000},accept_downloads=True);ctx.set_default_timeout(12000)
  cdp=ctx.browser.new_browser_cdp_session();r['environment']['chrome']=cdp.send('Browser.getVersion');ext=cdp.send('Extensions.loadUnpacked',{'path':str(build)});r['extension']=ext
  worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker',timeout=10000)
  def current_worker():
   rows=[w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/')];assert rows;return rows[-1]
  def active(p,timeout=25000):p.locator('html[data-vaiwl-hf-state=ACTIVE]').wait_for(timeout=timeout)
  def page(account='A',ref='T0'):
   p=ctx.new_page();p.on('pageerror',lambda e:r['errors'].append(str(e)));p.goto('http://127.0.0.1:48178/hf/'+account+'/c/'+ref+'?mode=mv3&size=120&f1Refs=100000');active(p);return p
  def manage(p):active(p);p.get_by_label('管理工作空间',exact=True).click();p.get_by_role('dialog',name='工作空间管理',exact=True).wait_for()
  def close(p):p.get_by_role('button',name='关闭管理',exact=True).click()
  def saved(p):p.locator('[data-vaiwl-owned=workspace-editor] > [role=status]').filter(has_text='已保存').wait_for()
  def action(p,label):
   p.locator('[data-vaiwl-owned=workspace-editor] > [role=status]').evaluate('(n)=>n.textContent=""');p.get_by_role('button',name=label,exact=True).click();saved(p)
  def repository(script,arg=None):
   return current_worker().evaluate("async arg=>{const {ScopeRepository,WorkspaceRepository,syntheticEvidenceGate,scopeOf}=__F1;const base=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),repo=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate}),scope=scopeOf(arg?.account??'A');try{return await (async()=>{"+script+"})();}finally{base.close();}}",arg)
  def piece(ref='F99999',account='A'):
   return repository("const header=await repo.partitionHeader(scope),p=await repo.partitionPage(scope,{revision:header.manifest.revision,offset:0,ids:[arg.ref]});return {meta:{revision:header.manifest.revision,count:Object.keys(header.manifest.refVersions).length,humanRefs:header.manifest.humanRefs,preferences:header.manifest.preferences},piece:p.pieces[0]};",{'ref':ref,'account':account})
  def case(name,fn):
   if INPUT_ONLY and name not in ['F1-native-partition-migration-backup-recovery-contracts','F1-100k-4x-renderer-long-chat-concurrent-input-and-navigation']:return
   try:r['tests'].append({'id':name,'status':'PASS','actual':fn()})
   except Exception as e:
    r['tests'].append({'id':name,'status':'FAIL','error':str(e),'trace':traceback.format_exc(),'feedback':[pg.locator('[data-vaiwl-owned=workspace-editor] > [role=status]').all_text_contents() for pg in ctx.pages]})
    for i,p in enumerate(ctx.pages):
     try:p.screenshot(path=str(OUT/(name+'-failure-'+str(i)+'.png')))
     except:pass
   for pg in ctx.pages:
    if pg.locator('[data-vaiwl-owned=workspace-editor]').count():
     try:close(pg)
     except:pass
   for pg in list(ctx.pages):
    if pg is not globals().get('p') and pg.url!='about:blank':pg.close()
   (OUT/'partial.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(name,r['tests'][-1]['status'],flush=True)
  def contracts():
   rows=worker.evaluate("async()=>{const out=[];for(const c of __F1.partitionedCases(indexedDB)){try{await c.run();out.push({name:c.name,status:'PASS'})}catch(e){out.push({name:c.name,status:'FAIL',error:e.message,stack:e.stack})}}return out;}");assert len(rows)==17 and all(x['status']=='PASS' for x in rows),rows;return {'actualExtensionIDB':True,'cases':rows}
  case('F1-native-partition-migration-backup-recovery-contracts',contracts)
  seed=worker.evaluate(SEED,{'size':100000,'partitioned':True});assert seed['counts']=={'refs':100000,'themes':120} and seed['protectedCount']==100000 and seed['initialCounts']=={'refs':604,'themes':120};r['seed']=seed
  if INPUT_ONLY:r['BSeed']=current_worker().evaluate(SEED,{'size':100000,'partitioned':True,'account':'B'})
  p=page();checks=NativeChecks(ctx,'mv3',ext,None,None,None,None,r)
  def far_navigation():
   assert p.evaluate('HF.data().refs.length')==100000
   p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('合成规模引用 99999');link=p.locator('.search-results [data-ref-id=F99999]');assert link.count()==1;href=link.get_attribute('href');assert 'f1Refs=100000' in href;link.click();active(p);p.wait_for_function('HF.getView()?.ref.id==="F99999"');assert p.locator('[data-message-id=F99999-m0]').count()==1;assert p.get_by_label('消息输入',exact=True).is_visible();assert p.locator('[data-vaiwl-return]').count()==1
   manage(p);assert p.get_by_label('窗口选择',exact=True).input_value()=='F99999';options=p.get_by_label('窗口选择',exact=True).locator('option').count();assert options<=201;p.get_by_label('派生标题',exact=True).fill('F1 far manual intent');action(p,'保存派生标题');close(p);p.screenshot(path=str(OUT/'100k-far-native-reading.png'))
   p.reload();active(p);manage(p);assert p.get_by_label('派生标题',exact=True).input_value()=='F1 far manual intent';close(p)
   q=page(ref='F99999');manage(q);assert q.get_by_label('派生标题',exact=True).input_value()=='F1 far manual intent';close(q);q.close()
   return {'actualNativeRef':'F99999','messagesVisible':True,'nativeCatalogue':100000,'initialEditorOptions':options,'reloadAndNewTabPreserved':True,'data':piece()}
  case('F1-100k-far-native-navigation-manual-refresh-new-tab',far_navigation)
  def tabs():
   q=page(ref='F99999');manage(p);p.get_by_label('派生标题',exact=True).fill('F1 local unsaved 100k');manage(q);q.get_by_label('派生标题',exact=True).fill('F1 remote saved 100k');action(q,'保存派生标题');close(q)
   p.wait_for_timeout(3500);assert p.get_by_label('派生标题',exact=True).input_value()=='F1 local unsaved 100k';action_button=p.get_by_role('button',name='保存派生标题',exact=True);action_button.click();status=p.locator('[data-vaiwl-owned=workspace-editor] > [role=status]');status.filter(has_text='另一标签页').wait_for();conflict=status.inner_text();assert piece()['piece']['identity']['title']=='F1 remote saved 100k';action(p,'保存派生标题');close(p);assert piece()['piece']['identity']['title']=='F1 local unsaved 100k';q.close()
   race=repository("const rev=(await repo.partitionHeader(scope)).manifest.revision,b2=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),r2=new WorkspaceRepository({baseRepository:b2,evidenceGate:syntheticEvidenceGate});try{return await Promise.all([repo.command(scope,{operationId:'native_race_1',expectedRevision:rev,command:{type:'SET_TITLE',refId:'F99998',title:'race one'}}),r2.command(scope,{operationId:'native_race_2',expectedRevision:rev,command:{type:'SET_TITLE',refId:'F99998',title:'race two'}})]);}finally{b2.close();}");assert sum(x['ok'] for x in race)==1 and next(x for x in race if not x['ok'])['reason']=='revision-conflict'
   # Wait until the actual client has observed this deliberately external CAS write,
   # before starting an unrelated human move at the next test stage.
   manage(p);p.get_by_label('查找已知窗口',exact=True).fill('F99998');p.get_by_label('窗口选择',exact=True).select_option('F99998');winner='race one' if race[0]['ok'] else 'race two'
   for _ in range(40):
    if p.get_by_label('派生标题',exact=True).input_value()==winner:break
    p.wait_for_timeout(100)
   assert p.get_by_label('派生标题',exact=True).input_value()==winner;close(p)
   return {'unsavedIntentPreserved':True,'explicitRetryRequired':True,'feedback':conflict,'independentNativeConnections':race}
  case('F1-100k-multi-tab-human-conflict-native-CAS',tabs)
  def move_backup():
   manage(p);p.get_by_label('主题选择',exact=True).select_option(piece()['piece']['placements'][0]['workspaceId']);p.get_by_label('目标主题',exact=True).select_option('W119');action(p,'移动窗口');assert any(x['workspaceId']=='W119' and not x['excluded'] for x in piece()['piece']['placements']);action(p,'撤销上次修改');assert not any(x['workspaceId']=='W119' and not x['excluded'] for x in piece()['piece']['placements']);p.get_by_text('工作集与片段',exact=True).click();action(p,'加入当前工作集');p.get_by_text('备份与恢复',exact=True).click()
   with p.expect_download() as dl:p.get_by_role('button',name='导出工作空间备份',exact=True).click()
   path=OUT/'100k-manual-backup.json';dl.value.save_as(path);bundle=json.loads(path.read_text());assert bundle['payload']['identities']['F99999']['title']=='F1 local unsaved 100k';assert not bundle['payload']['events'] and not bundle['payload']['sources'];assert 'F99999' in bundle['payload']['preferences']['workingSet']['value']['refs'];before=piece()['meta']['revision'];p.get_by_label('选择工作空间备份',exact=True).set_input_files(str(path));p.get_by_role('button',name='预览备份恢复',exact=True).click();p.locator('[data-backup-preview]').filter(has_text='保留当前人工修改').wait_for();assert piece()['meta']['revision']==before;action(p,'应用预览恢复');action(p,'撤销上次修改');close(p)
   return {'farMoveUndo':True,'humanBackupBytes':path.stat().st_size,'backupHumanRefs':list(bundle['payload']['refs']),'dryRunReadOnly':True,'restoreUndo':True,'data':piece()}
  case('F1-100k-far-move-undo-manual-backup-dry-run-restore',move_backup)
  def cold():
   p.get_by_label('消息输入',exact=True).fill('100k cold native draft');p.evaluate('globalThis.f1Nodes={input:HF.getView().input,transcript:HF.getView().transcript,messages:[...document.querySelectorAll("[data-message-id]")]}')
   def probe():
    p.evaluate("()=>{document.documentElement.removeAttribute('data-hf-worker-probe');document.dispatchEvent(new Event('hf:test-worker-probe'))}");p.locator('html[data-hf-worker-probe]').wait_for();v=json.loads(p.locator('html').get_attribute('data-hf-worker-probe'));assert v['ok'];return v
   before=probe();session=ctx.new_cdp_session(p);events=[];session.on('ServiceWorker.workerVersionUpdated',lambda e:events.extend(e['versions']));session.send('ServiceWorker.enable');p.wait_for_timeout(200);versions=[v for v in events if v.get('scriptURL','').startswith('chrome-extension://'+ext['id']+'/') and v.get('runningStatus')=='running'];assert versions;vid=versions[-1]['versionId'];idx=len(events);session.send('ServiceWorker.stopWorker',{'versionId':vid})
   for _ in range(100):
    if any(v['versionId']==vid and v['runningStatus']=='stopped' for v in events[idx:]):break
    p.wait_for_timeout(100)
   assert any(v['versionId']==vid and v['runningStatus']=='stopped' for v in events[idx:]);stop_index=len(events)
   for _ in range(150):
    if any(v['runningStatus']=='running' for v in events[stop_index:]):break
    p.wait_for_timeout(100)
   assert any(v['runningStatus']=='running' for v in events[stop_index:]),'no auto-wake (no manual probe/reload sent)';active(p);after=probe();assert before['boot']!=after['boot'] and before['syntheticFrameDoc']==after['syntheticFrameDoc'];assert p.evaluate('f1Nodes.input===HF.getView().input&&f1Nodes.transcript===HF.getView().transcript&&f1Nodes.input.value==="100k cold native draft"');assert piece()['piece']['identity']['title']=='F1 local unsaved 100k';r['workerEvents']+=events;return {'before':before,'after':after,'events':events,'nativeNodesDraftIntact':True,'manualTitleRestored':True}
  case('F1-100k-observed-worker-stop-auto-wake-no-refresh',cold)
  def lease():
   checks.content_eval(p,"(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.f1Lease=[];chrome.runtime.sendMessage=async m=>{const reply=await original(m);if(m.type==='BIND')f1Lease.push({at:Date.now(),lease:reply.leaseId,ok:reply.ok});return reply;};return true;})()")
   p.wait_for_timeout(23000);active(p);trace=checks.content_eval(p,'f1Lease');assert trace and all(x['ok'] for x in trace) and len({x['lease'] for x in trace})==len(trace);assert piece()['meta']['count']==100000;return {'actualLeaseRenewals':trace,'allRefsRetained':100000}
  case('F1-100k-actual-20-second-lease-auto-rebind',lease)
  def isolation():
   result=current_worker().evaluate(SEED,{'size':100000,'partitioned':True,'account':'B'});assert result['counts']['refs']==100000;p.evaluate("HF.control('account','B')");active(p);manage(p);p.get_by_label('查找已知窗口',exact=True).fill('F99999');p.get_by_label('窗口选择',exact=True).select_option('F99999');assert p.get_by_label('派生标题',exact=True).input_value()!='F1 local unsaved 100k';close(p);assert piece(account='B')['piece']['identity']['title']!='F1 local unsaved 100k';p.evaluate("HF.control('account','unknown')");p.wait_for_timeout(700);assert p.locator('.workspace').count()==0 and p.locator('[data-vaiwl-return]').count()==0;assert not p.locator('[data-vaiwl-owned]').count();assert p.evaluate('HF.data().refs.length')==0;p.evaluate("HF.control('account','A')");active(p);assert piece()['piece']['identity']['title']=='F1 local unsaved 100k';return {'A_B_unknown_A':True,'eachVerifiedAccount':100000,'unknownNoSensitiveRoots':True,'BSeed':result}
  case('F1-100k-account-A-B-unknown-A',isolation)
  def slow_input():
   # Renderer throttling is a controlled stress model, not a physical low-end Mac claim.
   q=page(ref='T1');assert q.locator('[data-message-id]').count()==160
   session=ctx.new_cdp_session(q);session.send('Emulation.setCPUThrottlingRate',{'rate':4});profile='--profile-input' in sys.argv[2:]
   if profile:session.send('Profiler.enable');session.send('Profiler.start')
   q.get_by_label('消息输入',exact=True).fill('100k long native draft');q.get_by_label('调整交互值',exact=True).fill('73')
   q.evaluate('globalThis.f1Long={input:HF.getView().input,transcript:HF.getView().transcript,range:HF.getView().transcript.querySelector("input[type=range]"),messages:[...document.querySelectorAll("[data-message-id]")]};globalThis.f1InputGaps=[];globalThis.f1LastTick=performance.now();globalThis.f1Timer=setInterval(()=>{const t=performance.now();f1InputGaps.push(t-f1LastTick);f1LastTick=t;},16)')
   write_error=None
   try:manage(p);p.get_by_label('派生标题',exact=True).fill('100k latest concurrent input probe');action(p,'保存派生标题')
   except Exception as e:write_error=str(e)
   finally:
    if p.locator('[data-vaiwl-owned=workspace-editor]').count():close(p)
   q.wait_for_timeout(3500)
   observed=q.evaluate('(()=>{clearInterval(f1Timer);const v=HF.getView();return {gaps:f1InputGaps,input:f1Long.input===v.input,draft:v.input.value==="100k long native draft",transcript:f1Long.transcript===v.transcript,range:f1Long.range===v.transcript.querySelector("input[type=range]")&&f1Long.range.value==="73",messages:f1Long.messages.every((n,i)=>n===document.querySelectorAll("[data-message-id]")[i])};})()');observed['writeError']=write_error;r['nativeInputMeasurements']=observed
   if profile:(OUT/'native-input-cpu-profile.json').write_text(json.dumps(session.send('Profiler.stop')['profile']))
   assert all(observed[k] for k in ['input','draft','transcript','range','messages']);assert max(observed['gaps'])<150,{'maxGapMs':max(observed['gaps']),'rate':4};assert write_error is None,write_error
   q.get_by_label('返回工作区',exact=True).click();nav=[]
   for i in range(20):
    nav.append(q.evaluate('''async i=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace')).shadowRoot,b=root.querySelector(i%2?'[aria-label="较近的30日"]':'[aria-label="较早的30日"]'),t=performance.now();if(!b||b.disabled)throw Error('no adjacent interval');b.click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-t;}''',i))
   q.get_by_label('查找主题与派生名称',exact=True).click();search=[]
   for i in range(10):
    search.append(q.evaluate('''async()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.search')).shadowRoot,input=root.querySelector('input'),t=performance.now();input.value='合成规模引用';input.dispatchEvent(new Event('input',{bubbles:true}));if(root.querySelectorAll('.search-results .row').length!==24)throw Error('unbounded search DOM');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-t;}'''))
   p95=lambda rows:sorted(rows)[int(.95*(len(rows)-1))];data={'rendererCPUThrottle':4,'nativeInput':observed,'navigationMs':nav,'navigationP95':p95(nav),'searchMs':search,'searchP95':p95(search)};assert data['navigationP95']<150 and data['searchP95']<300,data;q.screenshot(path=str(OUT/'100k-4x-long-chat.png'));session.send('Emulation.setCPUThrottlingRate',{'rate':1});q.close();return data
  case('F1-100k-4x-renderer-long-chat-concurrent-input-and-navigation',slow_input)
  def recovery():
   # Last committed edit is newer than the saved checkpoint; corrupt the actual root row.
   latest=repository("const rev=(await repo.partitionHeader(scope)).manifest.revision;return repo.command(scope,{operationId:'latest_before_native_damage',expectedRevision:rev,command:{type:'SET_TITLE',refId:'F99999',title:'100k latest human must survive recovery'}});");assert latest['ok']
   status=repository("const key=(await repo.partitionHeader(scope)).manifest.scopeKey,db=await base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states'),q=store.get(key);q.onsuccess=()=>store.put({...q.result,checksum:'native_actual_corruption'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});return repo.recoveryStatus(scope);");assert status['recoverable'] and status['restoredHumanChanges']>0
   # Exercise the real recovery UI/protocol, not a privileged repair followed by a
   # fixed wait for the old error screen's lease to expire.
   p.get_by_role('region',name='工作空间数据恢复',exact=True).wait_for(timeout=12000)
   p.get_by_role('button',name='恢复已核验人工资产',exact=True).click();active(p)
   result=repository("const logs=await repo.history(scope);return logs.find(x=>x.type==='RECOVER');");assert result and result['revision']>latest['revision'];result={**result,'ok':True,'throughActualRecoveryUI':True}
   assert result['ok'];data=piece();assert data['meta']['count']==100000 and data['piece']['identity']['title']=='100k latest human must survive recovery';no_evidence=repository("const m=(await repo.partitionHeader(scope)).manifest;return {sourcesRevoked:Object.values(m.sources).every(s=>s.revoked),preference:m.preferences.workingSet.value,revision:m.revision};");assert no_evidence['sourcesRevoked'];assert 'F99999' in no_evidence['preference']['refs'];p.wait_for_timeout(3500);active(p);p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('100k latest human must survive recovery');assert p.locator('.search-results [data-ref-id=F99999]').count()==1;p.screenshot(path=str(OUT/'100k-recovered-human-unknown-evidence.png'));replay=repository("return repo.command(scope,{operationId:'latest_before_native_damage',expectedRevision:arg.rev,command:{type:'SET_TITLE',refId:'F99999',title:'100k latest human must survive recovery'}});",{'rev':latest['revision']-1});assert replay['reason']=='operation-invalidated-by-recovery';return {'status':status,'recovered':result,'latestHumanAndAllRefsPreserved':True,'sourcesAndOldReceiptsInvalidated':True,'noEvidence':no_evidence,'replay':replay}
  case('F1-100k-native-corruption-checkpoint-plus-latest-human-recovery',recovery)
  r['transportTraceAfterLastBoot']=current_worker().evaluate('__F1Trace');assert all(x['ms']<6000 for x in r['transportTraceAfterLastBoot'] if x['ok']);pages=[x for x in r['transportTraceAfterLastBoot'] if x['type']=='B23_PARTITION_PAGE'];assert pages and all(x['bytes']<=16*1024*1024 for x in pages);r['boundedTransport']={'maxPageBytes':max(x['bytes'] for x in pages),'maxSuccessfulRpcMs':max(x['ms'] for x in r['transportTraceAfterLastBoot'] if x['ok']),'requestDeadlineMs':6000,'leaseMs':20000,'pageSize':5000}
  ctx.close();ctx=None
except (Exception,KeyboardInterrupt) as e:r['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
finally:
 if ctx:
  try:ctx.close()
  except:pass
 server.terminate();server.wait(timeout=5);r['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode};r['endedAt']=time.time();r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL','BLOCKED']};(OUT/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['counts'])
raise SystemExit(1 if r['counts']['FAIL'] or r['errors'] else 0)
