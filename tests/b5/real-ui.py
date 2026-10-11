#!/usr/bin/env python3
"""Actual MV3 asset download/upload and corrupt-state cold start; fresh synthetic profile only."""
import json,os,sys,tempfile,subprocess,time,traceback,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tests/b23'))
from native_ui_checks import NativeChecks
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
r={'argv':sys.argv,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests':[],'errors':[],'scope':'new isolated real Chrome MV3 / extension IndexedDB, synthetic host only'}
def active(p):p.locator('html[data-vaiwl-hf-state=ACTIVE]').wait_for(timeout=15000)
def manage(p):active(p);p.get_by_label('管理工作空间',exact=True).click()
def saved(p):p.locator('[data-vaiwl-owned=workspace-editor] > [role=status]').filter(has_text='已保存').wait_for()
def close(p):p.get_by_role('button',name='关闭管理',exact=True).click()
with tempfile.TemporaryDirectory(prefix='vaiwl-b5-') as temp:
 build=Path(temp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL);r['buildHashes']=json.loads((build/'build-hashes.json').read_text());r['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for d in ['src','simulator','tests/b5'] for f in (ROOT/d).rglob('*') if f.is_file() and '__pycache__' not in str(f)}
 server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'48177'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  assert server.stdout.readline().startswith('B23 native test server ready')
  with sync_playwright() as pw:
   ctx=pw.chromium.launch_persistent_context(str(Path(temp)/'profile'),executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,chromium_sandbox=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000},accept_downloads=True)
   ctx.set_default_timeout(7000);cdp=ctx.browser.new_browser_cdp_session();r['chrome']=cdp.send('Browser.getVersion');ext=cdp.send('Extensions.loadUnpacked',{'path':str(build)});r['extension']=ext
   p=ctx.new_page();p.on('pageerror',lambda e:r['errors'].append(str(e)));p.goto('http://127.0.0.1:48177/hf/A/c/T0?mode=mv3&size=120');active(p)
   checks=NativeChecks(ctx,'mv3',ext,None,None,None,None,r)
   def case(name,fn):
    try:r['tests'].append({'id':name,'status':'PASS','actual':fn()})
    except Exception as e:r['tests'].append({'id':name,'status':'FAIL','error':str(e),'trace':traceback.format_exc()});p.screenshot(path=str(out/(name+'-failure.png')))
    (out/'partial.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
   def backup():
    p.get_by_label('消息输入',exact=True).fill('B5 native draft sentinel');p.evaluate('globalThis.b5Nodes={input:HF.getView().input,transcript:HF.getView().transcript}')
    manage(p);p.get_by_label('窗口选择',exact=True).select_option('T0');p.get_by_label('派生标题',exact=True).fill('B5 portable human');p.get_by_role('button',name='保存派生标题',exact=True).click();saved(p)
    p.get_by_text('备份与恢复',exact=True).click()
    with p.expect_download() as downloaded:p.get_by_role('button',name='导出工作空间备份',exact=True).click()
    downloaded.value.save_as(out/'actual-download.json');bundle=json.load(open(out/'actual-download.json'));assert bundle['payload']['identities']['T0']['title']=='B5 portable human';assert len(bundle['payload']['refs'])==604 and len(bundle['payload']['workspaces'])==120;assert not bundle['payload']['events'] and not bundle['payload']['sources'];close(p)
    manage(p);p.get_by_label('窗口选择',exact=True).select_option('T0');p.get_by_label('派生标题',exact=True).fill('B5 newest must survive');p.get_by_role('button',name='保存派生标题',exact=True).click();saved(p);p.get_by_text('备份与恢复',exact=True).click()
    p.get_by_label('选择工作空间备份',exact=True).set_input_files(str(out/'actual-download.json'));before=checks.state(p);p.get_by_role('button',name='预览备份恢复',exact=True).click();p.locator('[data-backup-preview]').filter(has_text='保留当前人工修改').wait_for();assert checks.state(p)['revision']==before['revision'];p.screenshot(path=str(out/'backup-preview.png'))
    p.get_by_role('button',name='检查存储容量',exact=True).click();p.locator('[data-backup-preview]').filter(has_text='配额').wait_for();p.get_by_role('button',name='应用预览恢复',exact=True).click();saved(p);assert checks.state(p)['identities']['T0']['title']=='B5 newest must survive';p.get_by_role('button',name='撤销上次修改',exact=True).click();saved(p);assert checks.state(p)['identities']['T0']['title']=='B5 newest must survive';close(p)
    assert p.evaluate('b5Nodes.input===HF.getView().input&&b5Nodes.transcript===HF.getView().transcript&&b5Nodes.input.value==="B5 native draft sentinel"');return {'actualFileBytes':(out/'actual-download.json').stat().st_size,'newestHumanProtected':True,'dryRunReadonly':True,'nativeNodesAndDraftIntact':True,'state':checks.state(p)}
   case('B5-real-MV3-file-backup-preview-restore-undo',backup)
   def scoped():
    p.reload();active(p);assert checks.state(p)['identities']['T0']['title']=='B5 newest must survive'
    lease=checks.real_bind(p);assert lease['ok'];request={'v':1,'type':'B23_EXPORT_BACKUP','clientId':'native_acceptance_binding','seq':2,'leaseId':lease['leaseId']};ok=checks.content_eval(p,'chrome.runtime.sendMessage('+json.dumps(request)+')');assert ok['ok'] and ok['bundle']['payload']['identities']['T0']['title']=='B5 newest must survive'
    p.evaluate("HF.control('account','B')");active(p);stale=checks.content_eval(p,'chrome.runtime.sendMessage('+json.dumps({**request,'seq':3})+')');assert not stale['ok'] and 'bundle' not in stale
    p.evaluate("HF.control('account','unknown')");p.wait_for_timeout(500);assert p.locator('[data-vaiwl-owned=workspace-editor]').count()==0 and p.locator('[data-vaiwl-owned=asset-recovery]').count()==0 and p.locator('.workspace').count()==0
    p.evaluate("HF.control('account','A')");active(p);assert checks.state(p)['identities']['T0']['title']=='B5 newest must survive';return {'reloadRetained':True,'oldABindingNoBackupInB':stale,'unknownNoOwnedSensitiveUI':True}
   case('B5-real-reload-and-backup-binding-A-B-unknown-A',scoped)

   def corrupted():
    checks.worker().evaluate('''async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('vaiwl-hf-synthetic-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),s=tx.objectStore('b23_states'),q=s.get(JSON.stringify(['hf_synthetic_only','A','fixture_org']));q.onsuccess=()=>s.put({...q.result,checksum:'B5 intentional actual corruption'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});}finally{db.close();}}''')
    # New document plus actual worker termination, not merely a page reload.
    beforeBoot=checks.worker().evaluate('hfWorkerBoot');versions=[];pCDP=ctx.new_cdp_session(p);pCDP.on('ServiceWorker.workerVersionUpdated',lambda e:versions.extend(e.get('versions',[])));pCDP.send('ServiceWorker.enable');p.wait_for_timeout(200);prefix='chrome-extension://'+ext['id']+'/'
    current=[v for v in versions if v.get('scriptURL','').startswith(prefix) and v.get('runningStatus')=='running'];assert current
    version=current[-1]['versionId'];start=len(versions);pCDP.send('ServiceWorker.stopWorker',{'versionId':version})
    for _ in range(50):
     if any(v.get('versionId')==version and v.get('runningStatus')=='stopped' for v in versions[start:]):break
     p.wait_for_timeout(100)
    assert any(v.get('versionId')==version and v.get('runningStatus')=='stopped' for v in versions[start:]);p.reload();p.get_by_role('region',name='工作空间数据恢复',exact=True).wait_for(timeout=15000);assert p.locator('.workspace').count()==0;p.screenshot(path=str(out/'corrupt-cold-start.png'));p.get_by_role('button',name='恢复已核验人工资产',exact=True).click();active(p);afterBoot=checks.worker().evaluate('hfWorkerBoot');assert beforeBoot!=afterBoot;state=checks.state(p);assert state['identities']['T0']['title']=='B5 newest must survive';assert state['source']['revoked'];p.get_by_label('返回工作区',exact=True).click();assert p.locator('.workspace .card').count()==0;p.get_by_label('查找已知主题与窗口',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('B5 newest');assert p.locator('.workspace [data-ref-id=T0]').count()==1;p.screenshot(path=str(out/'recovered-assets-unknown.png'));return {'state':state,'beforeBoot':beforeBoot,'afterBoot':afterBoot,'realStoppedEvents':[v for v in versions[start:] if v.get('runningStatus')=='stopped']}
   case('B5-real-corrupt-worker-cold-start-explicit-recovery',corrupted)
   ctx.close()
 except Exception as e:r['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
 finally:server.terminate();server.wait(timeout=5);r['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode}
r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL']};(out/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['counts']);raise SystemExit(1 if r['counts']['FAIL'] or r['errors'] else 0)
