#!/usr/bin/env python3
"""Real native URL/IndexedDB/MV3 acceptance. NO opaque page or fake-IDB fallback.
Runs only in an separately authorized environment allowing loopback and extensions.
The current cloud policy blocks it; supplied code is not a PASS claim.
"""
import argparse, json, os, subprocess, tempfile, time, traceback, hashlib, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from native_ui_checks import NativeChecks
ROOT=Path(__file__).resolve().parents[2]
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['db','page','mv3'],required=True);ap.add_argument('--browser',default='/usr/bin/chromium');ap.add_argument('--out',required=True);ap.add_argument('--port',type=int,default=48173);args=ap.parse_args()
    report={'level':'REAL_BROWSER_'+args.mode.upper()+'_SYNTHETIC_ONLY','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tests':[],'fallback':False,'realChatGPT':'NOT_RUN','console':[],'workerEvents':[],'commands':[],'argv':sys.argv}
    def record(name,status,detail):report['tests'].append({'id':name,'status':status,'actual':detail})
    def blocked(e):return 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(e) or 'disabled by the administrator' in str(e)
    with tempfile.TemporaryDirectory(prefix='vaiwl-b23-native-') as tmp:
        build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        report['testedGitHead']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        report['sourceHashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for directory in ['src','simulator','tests/b23'] for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in str(p)}
        report['buildHashes']=json.loads((build/'build-hashes.json').read_text())
        ctx=None
        report['isolation']={'profile':str(Path(tmp)/'profile'),'headless':True,'temporaryBuild':str(build),'origin':f'http://127.0.0.1:{args.port}'}
        server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(args.port)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            if not server.stdout.readline().startswith('B23 native test server ready'):raise RuntimeError('server-start-failed')
            with sync_playwright() as p:
                ctx=p.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path=args.browser,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000})
                ctx.on('page',lambda pg:(pg.on('console',lambda m:report['console'].append({'url':pg.url,'type':m.type,'text':m.text})),pg.on('pageerror',lambda e:report['console'].append({'url':pg.url,'type':'pageerror','text':str(e)}))))
                ctx.set_default_timeout(15000);page=ctx.new_page();bcdp=ctx.browser.new_browser_cdp_session();report['environment']=bcdp.send('Browser.getVersion')
                if args.mode=='mv3':
                    try:report['extension']=bcdp.send('Extensions.loadUnpacked',{'path':str(build)})
                    except Exception as e:record('MV3-load','BLOCKED' if blocked(e) else 'FAIL',str(e));return
                origin=f'http://127.0.0.1:{args.port}'
                url=origin+('/__b23tests__/native.html' if args.mode=='db' else f'/hf/A/c/T0?mode={args.mode}')
                try:page.goto(url,wait_until='domcontentloaded')
                except Exception as e:record('native-URL','BLOCKED' if blocked(e) else 'FAIL',str(e));return
                if args.mode=='db':
                    page.locator('html[data-b23-native-done="true"]').wait_for(state='attached',timeout=180000)
                    result=json.loads(page.locator('#result').inner_text());record('native-IDB-contracts','PASS' if result['fail']==0 else 'FAIL',result)
                    if result['fail']:raise AssertionError('native DB contracts failed')
                    return
                def active(pg):pg.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state='attached')
                def manage(pg):active(pg);pg.get_by_label('管理工作空间',exact=True).click();pg.get_by_role('dialog',name='工作空间管理',exact=True).wait_for()
                def saved(pg):pg.get_by_role('status').filter(has_text='已保存').wait_for()
                def close(pg):pg.get_by_role('button',name='关闭管理',exact=True).click()
                def title(pg):manage(pg);pg.get_by_label('窗口选择',exact=True).select_option('T0');value=pg.get_by_label('派生标题',exact=True).input_value();close(pg);return value
                checks=NativeChecks(ctx,args.mode,report.get('extension'),record,manage,saved,close,report)
                active(page);page.get_by_label('消息输入',exact=True).fill('SYNTHETIC native-state sentinel');page.evaluate('globalThis.before={input:HF.getView().input,transcript:HF.getView().transcript}')
                manage(page);page.get_by_label('窗口选择',exact=True).select_option('T0');page.get_by_label('派生标题',exact=True).fill('B23 durable title');page.get_by_role('button',name='保存派生标题',exact=True).click();saved(page);close(page)
                assert page.evaluate('before.input===HF.getView().input&&before.transcript===HF.getView().transcript&&before.input.value==="SYNTHETIC native-state sentinel"')
                record('native-components-after-write','PASS','Original input/transcript identity and draft retained; actual IndexedDB service')
                checks.create_assets(page)
                page.reload();assert title(page)=='B23 durable title';record('actual-page-reload-persistence','PASS','T0 human title retained');checks.verify_assets(page,'reload')
                second=ctx.new_page();second.goto(url);assert title(second)=='B23 durable title';record('new-tab-persistence','PASS','Same profile/origin database, new tab');checks.verify_assets(second,'new-tab')
                second.goto(origin+f'/hf/B/c/T0?mode={args.mode}');assert title(second)!='B23 durable title';checks.isolate_b(second);second.goto(url);assert title(second)=='B23 durable title';record('actual-A-B-A-isolation','PASS','B cannot see A derived title')
                checks.multi_tab_cas(page,second)
                if args.mode=='page':
                    checks.queued_human_after_real_delayed_read(second)
                    result=second.evaluate('''async()=>{const {ScopeRepository}=await import('/src/b1/scope-repository.mjs');const {WorkspaceRepository}=await import('/src/data/repository.mjs');const {scopeOf}=await import('/simulator/data.mjs');const first=HFextension.service.workspaces,base=new ScopeRepository({indexedDB,databaseName:'vaiwl-hf-synthetic-v1'}),other=new WorkspaceRepository({baseRepository:base}),scope=scopeOf('A'),revision=(await first.read(scope)).state.revision;const results=await Promise.all([first.command(scope,{operationId:'real_tab_cas1',expectedRevision:revision,command:{type:'SET_TITLE',refId:'T1',title:'CAS 1'}}),other.command(scope,{operationId:'real_tab_cas2',expectedRevision:revision,command:{type:'SET_TITLE',refId:'T1',title:'CAS 2'}})]);base.close();return results}''')
                    assert sum(r.get('ok') is True for r in result)==1 and sum(r.get('reason')=='revision-conflict' for r in result)==1
                    record('actual-native-IDB-two-connection-CAS','PASS',result)
                else:
                    def probe(pg):
                        pg.evaluate("document.documentElement.removeAttribute('data-hf-worker-probe');document.dispatchEvent(new Event('hf:test-worker-probe'))")
                        for _ in range(60):
                            raw=pg.locator('html').get_attribute('data-hf-worker-probe')
                            if raw:
                                value=json.loads(raw);assert value.get('ok'),value;return value
                            pg.wait_for_timeout(100)
                        raise AssertionError('real worker did not reply')
                    before=probe(second);old_binding=checks.real_bind(second);assert old_binding['ok'],old_binding
                    cdp=ctx.new_cdp_session(second);versions=[]
                    cdp.on('ServiceWorker.workerVersionUpdated',lambda e:(versions.extend(e.get('versions',[])),report['workerEvents'].append({'at':time.time(),'event':'ServiceWorker.workerVersionUpdated','data':e})));cdp.send('ServiceWorker.enable');second.wait_for_timeout(300)
                    prefix=f"chrome-extension://{report['extension']['id']}/"
                    current=[v for v in versions if v.get('scriptURL','').startswith(prefix) and v.get('runningStatus')=='running']
                    assert current,'No real worker version observed';version_id=current[-1]['versionId'];start_index=len(versions)
                    report['commands'].append({'at':time.time(),'method':'ServiceWorker.stopWorker','versionId':version_id});cdp.send('ServiceWorker.stopWorker',{'versionId':version_id})
                    # Pump the sync Playwright event loop; Python sleep starves CDP callbacks.
                    for _ in range(50):
                        if any(v.get('versionId')==version_id and v.get('runningStatus')=='stopped' for v in versions[start_index:]):break
                        second.wait_for_timeout(100)
                    assert any(v.get('versionId')==version_id and v.get('runningStatus')=='stopped' for v in versions[start_index:]),'Stop command alone is not termination proof'
                    # A real content message wakes the stopped worker BEFORE any reload.
                    after_cold=probe(second);assert before['boot']!=after_cold['boot'],{'before':before,'after':after_cold}
                    stale=checks.stale_lease(second,old_binding);assert not stale['ok'] and 'snapshot' not in stale,stale
                    checks.verify_assets_storage_after_cold=checks.state(second);assert checks.verify_assets_storage_after_cold['identities']['T0']['title']=='B23 durable title'
                    new_binding=checks.content_eval(second,"chrome.runtime.sendMessage({v:1,type:'BIND',clientId:'native_acceptance_binding',seq:3})");assert new_binding['ok'] and new_binding['leaseId']!=old_binding['leaseId'],new_binding
                    record('actual-worker-cold-message-restart-old-lease-denied','PASS',{'before':before,'afterColdMessage':after_cold,'staleLease':stale,'newBinding':new_binding,'state':checks.verify_assets_storage_after_cold})
                    second.reload();assert title(second)=='B23 durable title';after=probe(second);assert before['boot']!=after['boot'];assert after['workspaceCount']==121
                    record('actual-worker-stop-restart-persistence','PASS',{'before':before,'after':after,'afterColdMessage':after_cold,'stoppedEvents':[v for v in versions[start_index:] if v.get('versionId')==version_id and v.get('runningStatus')=='stopped'],'trigger':'real content probe wakes worker before reload; UI rebind then verified by explicit reload; NOT automatic UI recovery'})
                if args.mode=='mv3':checks.verify_assets(second,'worker-restart')
                checks.corrupt_view_ui(second)
                page.screenshot(path=str(Path(args.out).with_suffix('.png')),full_page=True)
                checks.delayed_old_binding(second)
                second.goto(origin+f'/hf/unknown/c/T0?mode={args.mode}');second.wait_for_timeout(700);assert second.locator('[data-vaiwl-return]').count()==0;record('unknown-scope-fail-closed','PASS','No derived workspace rendered')
                ctx.close()
        except Exception as e:record('execution','BLOCKED' if blocked(e) else 'FAIL',{'error':str(e),'traceback':traceback.format_exc()})
        finally:
            if ctx:
                try:ctx.close()
                except Exception:pass  # Playwright's driver may already have closed on context-manager exit.
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait(timeout=5)
            report['server']={'exitCode':server.returncode,'stdout':server.stdout.read(),'stderr':server.stderr.read()}
            report['endedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());report['counts']={s:sum(t['status']==s for t in report['tests']) for s in ['PASS','FAIL','BLOCKED']}
            out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report['counts']))
            if report['counts']['FAIL']:raise SystemExit(1)
            if report['counts']['BLOCKED']:raise SystemExit(2)
    if any(t['status']=='FAIL' for t in report['tests']):raise SystemExit(1)
if __name__=='__main__':main()
