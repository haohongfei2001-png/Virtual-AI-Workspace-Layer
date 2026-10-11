#!/usr/bin/env python3
"""Real native URL/IndexedDB/MV3 acceptance. NO opaque page or fake-IDB fallback.
Runs only in an separately authorized environment allowing loopback and extensions.
The current cloud policy blocks it; supplied code is not a PASS claim.
"""
import argparse, json, os, subprocess, tempfile, time, traceback, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['db','page','mv3'],required=True);ap.add_argument('--browser',default='/usr/bin/chromium');ap.add_argument('--out',required=True);ap.add_argument('--port',type=int,default=48173);args=ap.parse_args()
    report={'level':'REAL_BROWSER_'+args.mode.upper()+'_SYNTHETIC_ONLY','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tests':[],'fallback':False,'realChatGPT':'NOT_RUN'}
    def record(name,status,detail):report['tests'].append({'id':name,'status':status,'actual':detail})
    def blocked(e):return 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(e) or 'disabled by the administrator' in str(e)
    with tempfile.TemporaryDirectory(prefix='vaiwl-b23-native-') as tmp:
        build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        report['buildHashes']=json.loads((build/'build-hashes.json').read_text())
        server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(args.port)},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            if not server.stdout.readline().startswith('B23 native test server ready'):raise RuntimeError('server-start-failed')
            with sync_playwright() as p:
                ctx=p.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path=args.browser,headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000})
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
                active(page);page.get_by_label('消息输入',exact=True).fill('SYNTHETIC native-state sentinel');page.evaluate('globalThis.before={input:HF.getView().input,transcript:HF.getView().transcript}')
                manage(page);page.get_by_label('窗口选择',exact=True).select_option('T0');page.get_by_label('派生标题',exact=True).fill('B23 durable title');page.get_by_role('button',name='保存派生标题',exact=True).click();saved(page);close(page)
                assert page.evaluate('before.input===HF.getView().input&&before.transcript===HF.getView().transcript&&before.input.value==="SYNTHETIC native-state sentinel"')
                record('native-components-after-write','PASS','Original input/transcript identity and draft retained; actual IndexedDB service')
                page.reload();assert title(page)=='B23 durable title';record('actual-page-reload-persistence','PASS','T0 human title retained')
                second=ctx.new_page();second.goto(url);assert title(second)=='B23 durable title';record('new-tab-persistence','PASS','Same profile/origin database, new tab')
                second.goto(origin+f'/hf/B/c/T0?mode={args.mode}');assert title(second)!='B23 durable title';second.goto(url);assert title(second)=='B23 durable title';record('actual-A-B-A-isolation','PASS','B cannot see A derived title')
                if args.mode=='page':
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
                            time.sleep(.1)
                        raise AssertionError('real worker did not reply')
                    before=probe(second);cdp=ctx.new_cdp_session(second);versions=[]
                    cdp.on('ServiceWorker.workerVersionUpdated',lambda e:versions.extend(e.get('versions',[])));cdp.send('ServiceWorker.enable');time.sleep(.3)
                    current=[v for v in versions if v.get('scriptURL','').startswith('chrome-extension://') and v.get('runningStatus')=='running']
                    assert current,'No real worker version observed';cdp.send('ServiceWorker.stopWorker',{'versionId':current[-1]['versionId']})
                    for _ in range(50):
                        if any(v.get('runningStatus')=='stopped' for v in versions):break
                        time.sleep(.1)
                    assert any(v.get('runningStatus')=='stopped' for v in versions),'Stop command alone is not termination proof'
                    second.reload();assert title(second)=='B23 durable title';after=probe(second);assert before['boot']!=after['boot'];assert after['workspaceCount']==120
                    record('actual-worker-stop-restart-persistence','PASS',{'before':before,'after':after,'trigger':'explicit synthetic page reload; NOT automatic recovery'})
                second.goto(origin+f'/hf/unknown/c/T0?mode={args.mode}');time.sleep(.7);assert second.locator('[data-vaiwl-return]').count()==0;record('unknown-scope-fail-closed','PASS','No derived workspace rendered')
                ctx.close()
        except Exception as e:record('execution','BLOCKED' if blocked(e) else 'FAIL',{'error':str(e),'traceback':traceback.format_exc()})
        finally:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill()
            report['endedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());report['counts']={s:sum(t['status']==s for t in report['tests']) for s in ['PASS','FAIL','BLOCKED']}
            out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report['counts']))
            if report['counts']['FAIL']:raise SystemExit(1)
            if report['counts']['BLOCKED']:raise SystemExit(2)
    if any(t['status']=='FAIL' for t in report['tests']):raise SystemExit(1)
if __name__=='__main__':main()
