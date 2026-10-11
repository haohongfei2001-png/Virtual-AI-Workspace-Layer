#!/usr/bin/env python3
"""C1 screenshots and interactions in fresh headless Chrome with loaded MV3 and real IDB."""
import argparse,hashlib,json,os,platform,subprocess,sys,tempfile,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/b23'))
from native_ui_checks import NativeChecks

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--baseline',action='store_true');a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
 report={'argv':sys.argv,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests':[],'screenshots':[],'errors':[],'environment':{'macOS':subprocess.check_output(['sw_vers'],text=True),'node':subprocess.check_output(['node','-v'],text=True).strip(),'python':platform.python_version()},'scope':'synthetic-only actual MV3 / actual extension IndexedDB','startedAt':time.time()}
 def active(p):p.locator('html[data-vaiwl-hf-state="ACTIVE"]').wait_for(timeout=15000)
 def home(p):active(p);p.get_by_label('返回工作区',exact=True).click()
 def shot(p,name):p.screenshot(path=str(out/(name+'.png')));report['screenshots'].append(name+'.png')
 with tempfile.TemporaryDirectory(prefix='vaiwl-c1-native-') as tmp:
  build=Path(tmp)/'extension';subprocess.run(['node','simulator/build.mjs',str(build)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL);report['buildHashes']=json.loads((build/'build-hashes.json').read_text());report['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for d in ['src','simulator','tests/c1'] for f in (ROOT/d).rglob('*') if f.is_file() and f.suffix in ['.mjs','.css','.py','.html']}
  server=subprocess.Popen(['node','tests/b23/native-server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'48176'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   assert server.stdout.readline().startswith('B23 native test server ready')
   with sync_playwright() as pw:
    ctx=pw.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,chromium_sandbox=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1440,'height':1000},locale='zh-CN')
    ctx.set_default_timeout(5000);cdp=ctx.browser.new_browser_cdp_session();report['environment']['chrome']=cdp.send('Browser.getVersion');ext=cdp.send('Extensions.loadUnpacked',{'path':str(build)});report['extension']=ext
    import importlib.metadata
    report['environment']['playwright']=importlib.metadata.version('playwright')
    def page(ref='T0',width=1440):
     p=ctx.new_page();p.set_viewport_size({'width':width,'height':1000});p.on('pageerror',lambda e:report['errors'].append(str(e)));p.goto(f'http://127.0.0.1:48176/hf/A/c/{ref}?mode=mv3');active(p);p.evaluate("HF.control('stress',true)");active(p);return p
    def case(name,fn):
     p=page()
     try:report['tests'].append({'id':name,'status':'PASS','actual':fn(p)})
     except Exception as e:
      report['tests'].append({'id':name,'status':'FAIL','error':str(e),'trace':traceback.format_exc()});shot(p,name+'-failure')
     finally:p.close();(out/'results.partial.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    def visuals(p):
     home(p);shot(p,'desktop');p.get_by_label('展开旧窗口 城市声音档案',exact=True).first.click();shot(p,'history-expanded');p.evaluate("HF.control('theme','dark')");p.wait_for_timeout(200);shot(p,'dark');p.evaluate("HF.control('theme','light')");p.set_viewport_size({'width':430,'height':932});p.wait_for_timeout(200);shot(p,'narrow');p.set_viewport_size({'width':1440,'height':1000});p.wait_for_timeout(200)
     c=p.locator('.workspace [data-theme-id=W0]');clicks=0
     while c.get_by_label('显示更多近期窗口',exact=True).count():c.get_by_label('显示更多近期窗口',exact=True).click();clicks+=1;assert clicks<20
     assert c.locator('.row').count()==127;shot(p,'long-list');p.get_by_label('较早的30日',exact=True).click();shot(p,'empty-segment');assert p.locator('.workspace').get_attribute('data-segment')=='1';p.get_by_label('较早的30日',exact=True).click();shot(p,'older-segment');assert p.locator('.workspace [data-theme-id=W0]').count()==0
     c=NativeChecks(ctx,'mv3',ext,None,None,None,None,report);s=c.state(p);assert s['workspaceCount']==120 and s['refCount']==604;assert p.evaluate('HF.data().themes.length')==120 and p.evaluate('HF.data().refs.length')==604
     return {'stress':{'themes':120,'refs':604,'W0recent':126,'W0old':1,'W0unknown':1},'expansionClicks':clicks,'state':s}
    case('C1-real-screenshots-and-canonical-stress',visuals)
    def focus(p):
     home(p);b=p.get_by_label('展开旧窗口 城市声音档案',exact=True).first;b.focus();p.keyboard.press('Enter');assert p.evaluate("()=>{const root=[...document.querySelectorAll('[data-vaiwl-owned]')].find(n=>n.shadowRoot?.querySelector('.workspace'));return root.shadowRoot.activeElement?.getAttribute('aria-label')==='展开旧窗口 城市声音档案'}"),'local disclosure lost keyboard focus after render'
     p.keyboard.press('Enter');assert b.get_attribute('aria-expanded')=='false';return {'keyboardToggleTwice':True}
    case('C1-keyboard-local-disclosure-focus',focus)
    def selected(p):
     p.goto('http://127.0.0.1:48176/hf/A/c/L127?mode=mv3');active(p);assert p.locator('.themes [data-ref-id=L127][aria-current=page]').count()==1,'current member beyond preview is missing';return {'currentBeyondCapacity':True}
    case('C1-current-reference-outside-preview',selected)
    def context(p):
     home(p);p.get_by_label('主题操作 城市声音档案',exact=True).click();p.get_by_role('menuitem',name='查找此主题',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('T3');assert p.locator('.workspace [data-ref-id=T3]').count()==1;assert p.locator('.workspace [data-ref-id=T103]').count()==0;assert '旧窗口' not in p.locator('.search').inner_text();return {'unknownViaThemeSearch':True}
    case('C1-contextual-theme-search',context)
    if not a.baseline:
     def manual(p):
      home(p);p.get_by_label('主题操作 城市声音档案',exact=True).click();p.get_by_role('menuitem',name='编辑主题',exact=True).click();assert p.get_by_label('主题选择',exact=True).input_value()=='W0';p.get_by_label('主题名称',exact=True).fill('C1 人工研究');p.get_by_label('主题图标',exact=True).fill('◆');p.get_by_label('主题顺序',exact=True).fill('-1');p.get_by_role('button',name='保存主题',exact=True).click();p.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').filter(has_text='已保存').wait_for();shot(p,'manual-editor');p.get_by_label('窗口选择',exact=True).select_option('T0');p.get_by_label('派生标题',exact=True).fill('C1 人工标题');p.get_by_role('button',name='保存派生标题',exact=True).click();p.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').filter(has_text='已保存').wait_for();p.get_by_role('button',name='关闭管理',exact=True).click();assert p.locator('.workspace .card').first.get_attribute('data-theme-id')=='W0';assert p.locator('.workspace [data-ref-id=T0]').inner_text()=='C1 人工标题';p.reload();active(p);home(p);assert p.locator('.workspace .card').first.locator('h2').inner_text().endswith('C1 人工研究');assert p.locator('.workspace [data-ref-id=T0]').inner_text()=='C1 人工标题';return {'reloadManualTitleIconOrder':True}
     case('C1-contextual-human-assets-durable',manual)
     def privacy(p):
      for a in ['B','unknown','A']:
       p.evaluate('a=>HF.control("account",a)',a)
       if a=='unknown':p.wait_for_timeout(700);assert p.locator('[data-vaiwl-return]').count()==0 and p.locator('.workspace').count()==0
       else:active(p);home(p);assert ('C1 人工研究' in p.locator('.workspace').inner_text())==(a=='A')
      return {'A_B_unknown_A':True}
     case('C1-scope-isolation',privacy)
    ctx.close()
  except Exception as e:report['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
  finally:
   server.terminate();server.wait(timeout=5);report['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode}
 report['counts']={s:sum(t['status']==s for t in report['tests']) for s in ['PASS','FAIL']};report['endedAt']=time.time();(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report['counts']));return 1 if report['counts']['FAIL'] or report['errors'] else 0
if __name__=='__main__':raise SystemExit(main())
