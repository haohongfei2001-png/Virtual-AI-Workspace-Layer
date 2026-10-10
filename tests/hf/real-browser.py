"""Loopback/page-origin and genuine MV3 gates. No opaque fallback in this runner.
Exit 2 = environment BLOCKED; exit 1 = executed assertion failure; 0 = tests passed.
Only own fresh profile, own loopback server, synthetic data. No policy modification.
"""
from __future__ import annotations
import argparse,json,os,socket,subprocess,tempfile,time,platform
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--browser',default=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'));ap.add_argument('--mode',choices=['page','mv3'],default='mv3');args=ap.parse_args()
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
    report={'level':'B_REAL_BROWSER_'+args.mode.upper(),'mode':args.mode,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':{'python':platform.python_version(),'os':platform.platform()},'results':[], 'notRun':['real ChatGPT login','physical IME','freeze/resume','extension disable/re-enable in graphical manager']}
    with tempfile.TemporaryDirectory(prefix='vaiwl-hf-real-') as tmp:
        tmp=Path(tmp);build=tmp/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        server=subprocess.Popen(['node','simulator/server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        base=f'http://127.0.0.1:{port}';url=base+'/hf/A/c/T0?mode='+args.mode
        def record(id,status,actual):report['results'].append({'id':id,'status':status,'actual':actual})
        try:
            assert server.stdout.readline().startswith('Synthetic host only:'),'server did not start'
            with sync_playwright() as pw:
                context=pw.chromium.launch_persistent_context(str(tmp/'profile'),executable_path=args.browser,headless=True,ignore_default_args=['--disable-extensions'],viewport={'width':1440,'height':1000},args=['--enable-unsafe-extension-debugging'])
                context.set_default_timeout(10000);page=context.new_page();cdp=context.new_cdp_session(page);browser_cdp=context.browser.new_browser_cdp_session();report['environment']['chrome']=cdp.send('Browser.getVersion')
                report['buildSha256']=json.loads((build/'build-hashes.json').read_text())
                loaded=False;navigation=False
                if args.mode=='mv3':
                    try:
                        result=browser_cdp.send('Extensions.loadUnpacked',{'path':str(build)});loaded=True;record('M01-load-real-MV3','PASS',result)
                    except Exception as e:
                        text=str(e);status='BLOCKED' if any(x in text.lower() for x in ['administrator','not found','not supported','unknown method']) else 'FAIL';record('M01-load-real-MV3',status,text)
                try:
                    page.goto(url,wait_until='domcontentloaded');navigation=True;record('N01-loopback-browser-navigation','PASS',{'url':page.url})
                except Exception as e:
                    text=str(e);record('N01-loopback-browser-navigation','BLOCKED' if 'ERR_BLOCKED_BY_ADMINISTRATOR' in text else 'FAIL',text)
                if navigation and (args.mode=='page' or loaded):
                    page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=20000)
                    page.evaluate("globalThis.nativeBefore={input:HF.getView().input,transcript:HF.getView().transcript}")
                    page.get_by_label('消息输入',exact=True).fill('SYNTHETIC REAL BROWSER DRAFT')
                    page.locator('[data-vaiwl-return]').click();page.locator('.workspace [data-ref-id=T0]').click()
                    assert page.evaluate('nativeBefore.input===HF.getView().input&&nativeBefore.transcript===HF.getView().transcript')
                    assert page.get_by_label('消息输入',exact=True).input_value()=='SYNTHETIC REAL BROWSER DRAFT'
                    record('N02-native-node-workspace-roundtrip','PASS',{'realDOM':True})
                    page.locator('[data-vaiwl-return]').click();page.locator('.workspace [data-ref-id=T1]').click();page.wait_for_url('**/hf/A/c/T1*');page.go_back();page.wait_for_url('**/hf/A/c/T0*');page.go_forward();page.wait_for_url('**/hf/A/c/T1*')
                    record('N03-real-browser-back-forward','PASS',{'url':page.url})
                    if args.mode=='page':
                        retained=page.evaluate('async()=>{HFextension.stop();HFextension.start();return true}')
                        page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached")
                        record('N04-page-origin-B1-reopen','PASS',{'rebound':retained,'extensionOrigin':False})
                    else:
                        def worker_probe():
                            page.evaluate("document.documentElement.removeAttribute('data-hf-worker-probe');document.dispatchEvent(new Event('hf:test-worker-probe'))")
                            for _ in range(30):
                                raw=page.locator('html').get_attribute('data-hf-worker-probe')
                                if raw:
                                    result=json.loads(raw)
                                    assert result.get('ok') is True and isinstance(result.get('boot'),str),result
                                    return result
                                time.sleep(.1)
                            raise AssertionError('Real MV3 worker did not reply to synthetic read-only probe')
                        before=worker_probe()
                        assert before['persistedRef'] and before['revision']>=1, before
                        worker=next((w for w in context.service_workers if w.url.endswith('/simulator/worker.mjs')),None) or context.wait_for_event('serviceworker')
                        versions=[]
                        cdp.on('ServiceWorker.workerVersionUpdated',lambda e:versions.extend(e['versions']))
                        cdp.send('ServiceWorker.enable');page.wait_for_timeout(150)
                        version=next(v for v in reversed(versions) if v.get('scriptURL')==worker.url and v.get('runningStatus')=='running')
                        cdp.send('ServiceWorker.stopWorker',{'versionId':version['versionId']});page.wait_for_timeout(400)
                        assert any(v.get('runningStatus')=='stopped' for v in versions),'no real service worker stop event'
                        page.reload()
                        page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=20000)
                        after=worker_probe()
                        assert before['boot']!=after['boot'], 'Worker boot witness unchanged after real stop'
                        assert after['persistedRef'] and after['revision']==before['revision'], 'Extension-origin IDB lost after real worker stop'
                        lastStop=max(i for i,v in enumerate(versions) if v.get('runningStatus')=='stopped')
                        assert any(v.get('runningStatus')=='running' for v in versions[lastStop+1:]),'no worker restart event'
                        record('M02-worker-stop-restart-and-IDB-rebind','PASS',{
                            'workerEvents':[{k:v.get(k) for k in ['runningStatus','versionId']} for v in versions],
                            'workerBootChanged':True,'realExtensionOriginIDBReused':True,
                            'syntheticRecordRevision':after['revision']})
                    if args.mode=='mv3':
                        # Real browser route notifications, not opaque test-double navigation.
                        page.evaluate("HF.control('account','B')")
                        page.wait_for_url('**/hf/B/c/T0*')
                        try:
                            page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=3500)
                        except Exception as error:
                            record('M03-B-diagnostic','FAIL',{'error':str(error),
                                'dom':page.evaluate('({url:location.href,state:document.documentElement.dataset.vaiwlHfState,reason:document.documentElement.dataset.vaiwlHfReason,scope:document.documentElement.dataset.vaiwlHfScope,account:HF.state.account,rootCount:document.querySelectorAll("[data-vaiwl-owned]").length})'),
                                'probe':worker_probe()})
                            raise
                        assert page.evaluate('document.documentElement.dataset.vaiwlHfScope')=='B'
                        bthemes=page.locator('.workspace').text_content()
                        assert '另一账户的工作' in bthemes and '独立出版计划' not in bthemes, 'A-owned theme leaked into B workspace'
                        page.evaluate("HF.control('account','A')")
                        page.wait_for_url('**/hf/A/c/T0*')
                        page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=10000)
                        assert page.evaluate('document.documentElement.dataset.vaiwlHfScope')=='A'
                        athemes=page.locator('.workspace').text_content()
                        assert '独立出版计划' in athemes and '另一账户的工作' not in athemes, 'B-owned theme leaked into A workspace'
                        record('M03-real-SPA-A-B-A-scope-rebinding','PASS',{'scopeRoundTrip':True,'crossScopeThemeIsolation':True,'realHistoryEvents':True})
                        page.evaluate("HF.control('variant','no-safe-boundary')")
                        page.locator('html[data-vaiwl-hf-state="NATIVE_ONLY"]').wait_for(state="attached",timeout=6000)
                        assert page.get_by_label('消息输入',exact=True).count()==1
                        record('M04-real-MV3-unsafe-native-boundary-fallback','PASS',{'nativeInputRetained':True})
                        page.evaluate("HF.control('variant','baseline')")
                        page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=10000)
                        page.evaluate("HF.control('account','unknown')")
                        page.wait_for_url('**/hf/unknown/c/T0*')
                        page.locator('html[data-vaiwl-hf-state="WAITING"]').wait_for(state="attached",timeout=10000)
                        assert page.locator('[data-vaiwl-owned]').count()==0
                        record('M05-unknown-account-fails-closed','PASS',{'visibleProjection':False,'realAccountWitness':False})
                        page.evaluate("HF.control('account','A')")
                        page.wait_for_url('**/hf/A/c/T0*')
                        page.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(state="attached",timeout=10000)
                    page.screenshot(path=str(out/'real-browser.png'))
                context.close()
        except Exception as e:record('EXECUTION','FAIL',str(e))
        finally:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
    states=[r['status'] for r in report['results']];report['status']='FAIL' if 'FAIL' in states else 'BLOCKED' if 'BLOCKED' in states else 'PASS';report['endedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return {'PASS':0,'FAIL':1,'BLOCKED':2}[report['status']]
if __name__=='__main__':raise SystemExit(main())
