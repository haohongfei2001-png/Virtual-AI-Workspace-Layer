#!/usr/bin/env python3
"""B4 real isolated MV3 increment; no mock-IDB or fake sender."""
import argparse,hashlib,json,os,platform,subprocess,sys,tempfile,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/b23'))
from native_ui_checks import NativeChecks

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--browser',default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');ap.add_argument('--out',required=True);ap.add_argument('--baseline',action='store_true');ap.add_argument('--headed',action='store_true');ap.add_argument('--suite',choices=['all','core','lifecycle','timeout'],default='all');a=ap.parse_args()
 report={'startedAt':time.time(),'baseline':a.baseline,'argv':sys.argv,'tests':[],'workerEvents':[],'console':[],'realChatGPT':'NOT_RUN','fallback':False}
 def record(name,status,actual):report['tests'].append({'id':name,'status':status,'actual':actual})
 def active(pg,timeout=15000):pg.locator('html[data-vaiwl-hf-state="ACTIVE"],html[data-vaiwl-hf-state="NATIVE_LAYER"]').wait_for(state='attached',timeout=timeout)
 def manage(pg):active(pg);pg.get_by_label('管理工作空间',exact=True).click();pg.get_by_role('dialog',name='工作空间管理',exact=True).wait_for()
 def close(pg):pg.get_by_role('button',name='关闭管理',exact=True).click()
 def saved(pg):pg.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').filter(has_text='已保存').wait_for()
 def write(pg,title,ref='T0'):
  manage(pg);pg.get_by_label('窗口选择',exact=True).select_option(ref);pg.get_by_label('派生标题',exact=True).fill(title);pg.get_by_role('button',name='保存派生标题',exact=True).click();saved(pg);close(pg)
 with tempfile.TemporaryDirectory(prefix='vaiwl-b4-native-') as tmp:
  build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
  report['buildHashes']=json.loads((build/'build-hashes.json').read_text());report['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for d in ['src','simulator','tests/b4'] for f in (ROOT/d).rglob('*') if f.is_file() and f.suffix in ['.mjs','.py','.html','.css']}
  report['head']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();report['environment']={'macOS':subprocess.check_output(['sw_vers'],text=True),'node':subprocess.check_output(['node','--version'],text=True).strip(),'python':platform.python_version()}
  import importlib.metadata
  report['environment']['playwright']=importlib.metadata.version('playwright')
  server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'48175'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);ctx=None
  try:
   assert server.stdout.readline().startswith('B23 native test server ready')
   with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path=a.browser,headless=not a.headed,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000})
    ctx.set_default_timeout(10000);ctx.on('page',lambda pg:pg.on('pageerror',lambda e:report['console'].append({'url':pg.url,'error':str(e)})))
    browser=ctx.browser.new_browser_cdp_session();report['environment']['chrome']=browser.send('Browser.getVersion');ext=browser.send('Extensions.loadUnpacked',{'path':str(build)});report['extension']=ext
    url='http://127.0.0.1:48175/hf/A/c/T0?mode=mv3'
    def newpage():
     pg=ctx.new_page();pg.goto(url);active(pg);return pg
    def checks(pg):return NativeChecks(ctx,'mv3',ext,record,manage,saved,close,report)
    def identity(pg):
     pg.get_by_label('消息输入',exact=True).fill('B4 native draft sentinel');pg.evaluate("globalThis.b4Native={input:HF.getView().input,transcript:HF.getView().transcript,messages:[...HF.getView().transcript.querySelectorAll('[data-message-id]')]}")
    def unchanged(pg):
     result=pg.evaluate("()=>({input:b4Native.input===HF.getView().input,draft:b4Native.input.value==='B4 native draft sentinel',transcript:b4Native.transcript===HF.getView().transcript,messages:b4Native.messages.every((n,i)=>n===HF.getView().transcript.querySelectorAll('[data-message-id]')[i])})");assert all(result.values()),result;return result
    def probe(pg):
     pg.evaluate("()=>{document.documentElement.removeAttribute('data-hf-worker-probe');document.dispatchEvent(new Event('hf:test-worker-probe'));}")
     pg.locator('html[data-hf-worker-probe]').wait_for(state='attached');v=json.loads(pg.locator('html').get_attribute('data-hf-worker-probe'));assert v['ok'],v;return v
    def case(name,fn):
     if a.suite=='timeout' and 'held-reply' not in name:return
     if a.suite=='lifecycle' and 'hidden-visible' not in name:return
     if a.suite=='core' and 'hidden-visible' in name:return
     try:record(name,'PASS',fn())
     except Exception as e:record(name,'FAIL',{'error':str(e),'stack':traceback.format_exc()})
     finally:
      for pg in list(ctx.pages):
       if pg.url!='about:blank':pg.close()
    def lease():
     pg=newpage();identity(pg);before=probe(pg);c=checks(pg);c.content_eval(pg,"""(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.b4LeaseTrace=[];chrome.runtime.sendMessage=async m=>{const r=await original(m);if(m.type==='BIND')b4LeaseTrace.push({at:Date.now(),seq:m.seq,lease:r.leaseId,ok:r.ok});return r;};return true;})()""");start=time.time();pg.wait_for_timeout(22500)
     state=pg.locator('html').get_attribute('data-vaiwl-hf-state');assert state=='ACTIVE',{'elapsed':time.time()-start,'state':state,'reason':pg.locator('html').get_attribute('data-vaiwl-hf-reason')}
     write(pg,'B4 after actual lease expiry');pg.wait_for_timeout(42500);active(pg);leases=c.content_eval(pg,'b4LeaseTrace');assert len(leases)>=3 and all(r['ok'] for r in leases) and len({r['lease'] for r in leases})==len(leases),leases
     after=probe(pg);return {'elapsed':time.time()-start,'actualRenewals':leases,'before':before,'after':after,'native':unchanged(pg),'state':checks(pg).state(pg)}
    def cold():
     pg=newpage();identity(pg);before=probe(pg);session=ctx.new_cdp_session(pg);events=[]
     session.on('ServiceWorker.workerVersionUpdated',lambda e:(events.extend(e['versions']),report['workerEvents'].append({'at':time.time(),'data':e})));session.send('ServiceWorker.enable');pg.wait_for_timeout(200)
     running=[v for v in events if v.get('scriptURL','').startswith('chrome-extension://'+ext['id']+'/') and v.get('runningStatus')=='running'];assert running
     vid=running[-1]['versionId'];idx=len(events);session.send('ServiceWorker.stopWorker',{'versionId':vid})
     for _ in range(50):
      if any(v['versionId']==vid and v['runningStatus']=='stopped' for v in events[idx:]):break
      pg.wait_for_timeout(100)
     assert any(v['versionId']==vid and v['runningStatus']=='stopped' for v in events[idx:]),'no actual stopped event'
     stopped_at=len(events)
     for _ in range(80):
      if any(v['runningStatus']=='running' for v in events[stopped_at:]):break
      pg.wait_for_timeout(100)
     assert any(v['runningStatus']=='running' for v in events[stopped_at:]),'worker never auto-woke; test sent no wake probe/reload'
     active(pg);after=probe(pg);assert before['boot']!=after['boot'] and before['syntheticFrameDoc']==after['syntheticFrameDoc'];write(pg,'B4 after automatic cold reconnect')
     return {'before':before,'after':after,'events':events,'native':unchanged(pg),'state':checks(pg).state(pg)}
    def tabs():
     first=newpage();second=newpage();identity(first);manage(first);first.get_by_label('窗口选择',exact=True).select_option('T0');first.get_by_label('派生标题',exact=True).fill('B4 local unsaved intent')
     write(second,'B4 remote manual intent');first.wait_for_timeout(3500)
     rendered=first.locator('[data-vaiwl-owned]').all_text_contents();draft=first.get_by_label('派生标题',exact=True).input_value();assert 'B4 remote manual intent' in '\n'.join(rendered),'other tab state was not automatically observed';assert draft=='B4 local unsaved intent',draft
     first.get_by_role('button',name='保存派生标题',exact=True).click();status=first.locator('[data-vaiwl-owned="workspace-editor"] [role=status]');status.filter(has_text='另一标签页').wait_for();assert first.get_by_label('派生标题',exact=True).input_value()=='B4 local unsaved intent';assert checks(first).state(first)['identities']['T0']['title']=='B4 remote manual intent'
     conflict=status.inner_text();first.get_by_role('button',name='保存派生标题',exact=True).click();saved(first);assert checks(first).state(first)['identities']['T0']['title']=='B4 local unsaved intent';close(first)
     second.wait_for_timeout(3500);manage(second);second.get_by_label('窗口选择',exact=True).select_option('T0');assert second.get_by_label('派生标题',exact=True).input_value()=='B4 local unsaved intent';close(second)
     return {'conflict':conflict,'draftPreserved':draft,'native':unchanged(first),'state':checks(first).state(first)}
    case('B4-actual-20-second-lease-auto-reconnect',lease)
    case('B4-observed-worker-stop-auto-cold-reconnect-no-reload',cold)
    case('B4-cross-tab-update-draft-CAS-conflict-and-explicit-retry',tabs)
    if not a.baseline:
     def lifecycle():
      pg=newpage();pg.evaluate("HF.control('stress',true)");active(pg);identity(pg);manage(pg);pg.get_by_label('窗口选择',exact=True).select_option('T0');pg.get_by_label('派生标题',exact=True).fill('B4 hidden draft intent');other=ctx.new_page();other.goto('http://127.0.0.1:48175/control.html');other.bring_to_front();pg.wait_for_timeout(300)
      visibility=pg.evaluate('document.visibilityState');assert visibility=='hidden',{'actualVisibility':visibility,'note':'must test actual browser visibility, no JS property override'}
      assert pg.locator('[data-vaiwl-return]').count()==0
      pg.wait_for_timeout(21500);pg.bring_to_front();active(pg);assert pg.evaluate('document.visibilityState')=='visible';same=unchanged(pg);assert pg.get_by_label('派生标题',exact=True).input_value()=='B4 hidden draft intent';pg.get_by_role('button',name='保存派生标题',exact=True).click();saved(pg);close(pg)
      manage(pg);pg.get_by_label('窗口选择',exact=True).select_option('T1');pg.get_by_label('派生标题',exact=True).fill('B4 frozen draft intent');session=ctx.new_cdp_session(pg);session.send('Page.setWebLifecycleState',{'state':'frozen'});other.wait_for_timeout(21000);session.send('Page.setWebLifecycleState',{'state':'active'});active(pg);assert pg.get_by_label('派生标题',exact=True).input_value()=='B4 frozen draft intent';pg.get_by_role('button',name='保存派生标题',exact=True).click();saved(pg);close(pg);write(pg,'B4 after real freeze resume');same2=unchanged(pg)
      for account in ['B','unknown','A','B','A']:
       pg.evaluate('a=>HF.control("account",a)',account)
       if account=='unknown':pg.wait_for_timeout(500);assert pg.locator('[data-vaiwl-return]').count()==0 and 'B4 after real freeze resume' not in pg.locator('body').inner_text()
       else:
        active(pg);manage(pg);pg.get_by_label('窗口选择',exact=True).select_option('T0');v=pg.get_by_label('派生标题',exact=True).input_value();close(pg);assert (v=='B4 after real freeze resume')==(account=='A')
      pg.evaluate("HF.navigate('/hf/A/c/T1?mode=mv3')");active(pg);assert pg.evaluate('HF.getView().messages.length')==160;pg.evaluate("HF.navigate('/hf/A/c/T0?mode=mv3')");active(pg);assert pg.evaluate('HF.data().refs.length')==604 and pg.evaluate('HF.data().themes.length')==120
      state=checks(pg).state(pg);assert state['workspaceCount']==120 and state['refCount']==604
      return {'actualHidden':visibility,'hiddenForSeconds':21.5,'frozenForSeconds':21,'nativeAfterVisibility':same,'nativeAfterFreeze':same2,'actualHostThemes':120,'actualHostRefs':604,'longChatMessages':160,'state':state}
     def failure():
      pg=newpage();c=checks(pg);identity(pg)
      c.content_eval(pg,"""(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.b4Failure={original,count:0};chrome.runtime.sendMessage=async m=>{if(m.type==='CHECK'||m.type==='BIND'){b4Failure.count++;throw Error('B4 injected transport disconnect');}return original(m);};return true;})()""")
      pg.wait_for_timeout(10500);count=c.content_eval(pg,'b4Failure.count');assert 1<=count<=8,count
      assert pg.locator('[data-vaiwl-return]').count()==0;assert pg.locator('[data-vaiwl-owned="connection-status"]').count()==1
      feedback=pg.locator('[data-vaiwl-owned="connection-status"]').inner_text();c.content_eval(pg,'chrome.runtime.sendMessage=b4Failure.original;true');pg.get_by_role('button',name='重新连接派生工作空间',exact=True).click();active(pg)
      manage(pg);pg.get_by_label('窗口选择',exact=True).select_option('T0');pg.get_by_label('派生标题',exact=True).fill('B4 committed reply lost')
      c.content_eval(pg,"""(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.b4Lost={original,count:0};chrome.runtime.sendMessage=async m=>{const result=await original(m);if(m.type==='B23_COMMAND'){b4Lost.count++;throw Error('B4 injected loss AFTER actual commit');}return result;};return true;})()""")
      pg.get_by_role('button',name='保存派生标题',exact=True).click();pg.wait_for_timeout(3500);active(pg);unknown=pg.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').inner_text();assert '未确认' in unknown and '已保存' not in unknown,unknown
      assert c.content_eval(pg,'b4Lost.count')==1;assert c.state(pg)['identities']['T0']['title']=='B4 committed reply lost';c.content_eval(pg,'chrome.runtime.sendMessage=b4Lost.original;true');close(pg)
      manage(pg);c.content_eval(pg,"""(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.b4UndoLost={original,count:0};chrome.runtime.sendMessage=async m=>{const result=await original(m);if(m.type==='B23_UNDO'){b4UndoLost.count++;throw Error('B4 injected undo reply loss AFTER commit');}return result;};return true;})()""")
      pg.get_by_role('button',name='撤销上次修改',exact=True).click();pg.wait_for_timeout(3500);active(pg);undo_unknown=pg.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').inner_text();assert '未确认' in undo_unknown and '已保存' not in undo_unknown,undo_unknown
      assert c.content_eval(pg,'b4UndoLost.count')==1;assert c.state(pg)['identities']['T0']['title']!='B4 committed reply lost';c.content_eval(pg,'chrome.runtime.sendMessage=b4UndoLost.original;true');close(pg)
      return {'boundedAttempts':count,'failureFeedback':feedback,'unknownWriteFeedback':unknown,'undoUnknownFeedback':undo_unknown,'commandAndUndoSentOnce':True,'native':unchanged(pg),'state':c.state(pg)}
     def held_reply():
      pg=newpage();identity(pg);c=checks(pg)
      c.content_eval(pg,"""(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.b4Held={held:false,release:null,binds:[]};chrome.runtime.sendMessage=async m=>{const r=await original(m);if(m.type==='BIND')b4Held.binds.push({lease:r.leaseId,ok:r.ok});if(m.type==='CHECK'&&!b4Held.held){b4Held.held=true;return new Promise(resolve=>b4Held.release=()=>resolve(r));}return r;};return true;})()""")
      pg.wait_for_timeout(9500);trace=c.content_eval(pg,'({held:b4Held.held,binds:b4Held.binds})');assert trace['held'] and trace['binds'] and all(b['ok'] for b in trace['binds']),'held real CHECK reply did not time out/rebind: '+json.dumps(trace)
      active(pg);write(pg,'B4 later manual after timeout');c.content_eval(pg,'b4Held.release();true');pg.wait_for_timeout(500)
      assert c.state(pg)['identities']['T0']['title']=='B4 later manual after timeout'
      return {'actualHeldReplyTrace':trace,'lateReplyCannotOverwrite':True,'native':unchanged(pg),'state':c.state(pg)}
     case('B4-real-held-reply-timeout-rebind-and-late-response-fence',held_reply)
     case('B4-actual-hidden-visible-freeze-resume-and-SPA-scope',lifecycle)
     case('B4-bounded-failure-feedback-and-committed-lost-reply-no-replay',failure)
    ctx.close()
  except Exception as e:record('execution','FAIL',{'error':str(e),'stack':traceback.format_exc()})
  finally:
   if ctx:
    try:ctx.close()
    except Exception:pass
   server.terminate()
   try:server.wait(timeout=5)
   except subprocess.TimeoutExpired:server.kill();server.wait()
   report['server']={'exit':server.returncode,'stderr':server.stderr.read()};report['endedAt']=time.time();report['counts']={s:sum(t['status']==s for t in report['tests']) for s in ['PASS','FAIL','BLOCKED']};out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report['counts']))
 return 1 if report['counts']['FAIL'] else 0
if __name__=='__main__':raise SystemExit(main())
