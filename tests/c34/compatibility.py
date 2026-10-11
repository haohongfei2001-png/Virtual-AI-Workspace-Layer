#!/usr/bin/env python3
"""C5 actual Chrome zoom, keyboard and edge geometry; isolated synthetic profile; fresh synthetic profile only."""
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
   def zoom_and_focus():
    p.get_by_label('消息输入',exact=True).fill('C5 native draft');p.evaluate('globalThis.c5Native={input:HF.getView().input,transcript:HF.getView().transcript}')
    tab=checks.worker().evaluate("async()=>{const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});if(tabs.length!==1)throw Error('isolated-active-tab');return tabs[0].id}")
    before=p.evaluate('({width:innerWidth,ratio:devicePixelRatio})');checks.worker().evaluate('id=>chrome.tabs.setZoom(id,2)',tab);p.wait_for_timeout(300);zoom=checks.worker().evaluate('id=>chrome.tabs.getZoom(id)',tab);assert zoom==2;after=p.evaluate('({width:innerWidth,ratio:devicePixelRatio})')
    p.get_by_label('返回工作区',exact=True).click();p.wait_for_timeout(200);boxes=p.locator('.workspace .card').evaluate_all('(ns)=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})');root=p.locator('.workspace').bounding_box();assert all(b['left']>=root['x']-1 and b['right']<=root['x']+root['width']+1 for b in boxes);assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),'200% horizontal page overflow'
    p.screenshot(path=str(out/'actual-chrome-200-percent.png'))
    button=p.locator('.workspace .card').first.get_by_role('button',name='主题操作 城市声音档案',exact=True);button.focus();p.keyboard.press('Enter');p.keyboard.press('ArrowDown');p.keyboard.press('Escape');assert p.evaluate("()=>[...document.querySelectorAll('[data-vaiwl-owned]')].some(n=>n.shadowRoot?.activeElement?.dataset.focusKey==='actions:W0')")
    p.locator('.workspace [data-ref-id=T0]').first.click();p.get_by_label('消息输入',exact=True).focus();assert p.evaluate('c5Native.input===HF.getView().input&&c5Native.transcript===HF.getView().transcript&&c5Native.input.value==="C5 native draft"')
    rects=p.evaluate("()=>[document.querySelector('[data-vaiwl-return]'),document.querySelector('.model-button')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})");assert rects[0]['right']<=rects[1]['left']+1,'return overlaps native model at real 200%'
    p.keyboard.press('Meta+k');p.get_by_label('原生搜索输入',exact=True).wait_for();p.get_by_role('button',name='关闭',exact=True).click();checks.worker().evaluate('id=>chrome.tabs.setZoom(id,1)',tab);p.wait_for_timeout(200);return {'actualBrowserZoom':zoom,'before':before,'after':after,'nativeNodesAndDraftIntact':True,'menuKeyboardFocus':True,'nativeShortcutRetained':True}
   case('C5-actual-200-percent-zoom-and-keyboard-native-ownership',zoom_and_focus)
   def edge_menu():
    p.get_by_label('返回工作区',exact=True).click();p.set_viewport_size({'width':900,'height':700});p.wait_for_timeout(150)
    # The locator scrolls the last real card into view; menu must stay inside the owned reading viewport.
    card=p.locator('.workspace .card').last;card.get_by_role('button',name='主题操作',exact=False).click();menu=p.get_by_role('menu');box=menu.bounding_box();area=p.locator('.workspace').bounding_box();p.screenshot(path=str(out/'menu-at-scroll-edge.png'));assert box['x']>=area['x']-1 and box['x']+box['width']<=area['x']+area['width']+1 and box['y']>=area['y']-1 and box['y']+box['height']<=area['y']+area['height']+1,'menu clipped outside workspace';p.keyboard.press('Escape');return {'menu':box,'workspace':area}
   case('C5-real-menu-at-scroll-viewport-edge',edge_menu)
   ctx.close()
 except Exception as e:r['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
 finally:server.terminate();server.wait(timeout=5);r['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode}
r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL']};(out/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['counts']);raise SystemExit(1 if r['counts']['FAIL'] or r['errors'] else 0)
