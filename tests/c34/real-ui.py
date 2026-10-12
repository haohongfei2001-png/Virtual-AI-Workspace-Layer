#!/usr/bin/env python3
"""Actual MV3 manual working-set and selected-snippet journeys; fresh synthetic profile only."""
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
   def prefs(account='A'):
    return checks.worker().evaluate("""async account=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('vaiwl-hf-synthetic-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readonly'),q=tx.objectStore('b23_states').get(JSON.stringify(['hf_synthetic_only',account,'fixture_org']));q.onsuccess=()=>resolve(q.result.payload.preferences);q.onerror=()=>reject(q.error)});}finally{db.close();}}""",account)
   def workset():
    p.get_by_label('消息输入',exact=True).fill('C34 unsent draft');p.evaluate('globalThis.c34Nodes={input:HF.getView().input,transcript:HF.getView().transcript}')
    manage(p);p.get_by_text('工作集与片段',exact=True).click()
    for ref in ['T3','T0']:
     p.get_by_label('窗口选择',exact=True).select_option(ref);p.get_by_role('button',name='加入当前工作集',exact=True).click();saved(p)
    p.get_by_role('button',name='将所选窗口前移',exact=True).click();saved(p);assert prefs()['workingSet']['value']['refs']==['T0','T3'];close(p)
    assert p.evaluate('c34Nodes.input===HF.getView().input&&c34Nodes.transcript===HF.getView().transcript&&c34Nodes.input.value==="C34 unsent draft"')
    p.get_by_role('button',name='当前工作集',exact=True).click();assert p.locator('.working-set .row').count()==2;assert p.locator('.working-set [data-ref-id=T3]').count()==1;p.screenshot(path=str(out/'working-set.png'))
    tab=ctx.new_page();tab.goto(p.url);active(tab);tab.get_by_role('button',name='当前工作集',exact=True).click();assert tab.locator('.working-set .row').count()==2;tab.close()
    p.reload();active(p);p.get_by_role('button',name='当前工作集',exact=True).click();assert p.locator('.working-set .row').count()==2
    p.locator('.working-set [data-ref-id=T3]').click();active(p);assert p.evaluate('HF.getView().ref.id')=='T3';p.get_by_label('返回工作区',exact=True).click();assert p.locator('.working-set .row').count()==2
    return {'unknownReferenceAccessible':True,'actualReloadAndNewTab':True,'nativeNodesBeforeReloadIntact':True,'preferences':prefs()}
   case('C3-real-durable-working-set-order-and-lazy-return',workset)
   def snippet():
    p.goto('http://127.0.0.1:48177/hf/A/c/T0?mode=mv3&size=120');active(p)
    selected=p.evaluate("""()=>{const body=document.querySelector('[data-message-id=T0-m0] .message-body'),text=body.textContent,needle='合成研究问题',start=text.indexOf(needle);if(start<0)throw Error('fixture-text');const r=document.createRange();r.setStart(body.firstChild,start);r.setEnd(body.firstChild,start+needle.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(r);return selection.toString();}""");assert selected=='合成研究问题'
    manage(p);p.get_by_text('工作集与片段',exact=True).click();p.get_by_role('button',name='保存所选片段',exact=True).click();saved(p);close(p);assert prefs()['savedSnippets']['value'][0]['text']==selected
    p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill(selected);assert p.locator('[data-snippet-id]').count()==1;assert '未找到已知记录' not in p.locator('.search-results').inner_text(),'snippet match falsely reports no known results';p.screenshot(path=str(out/'snippet-search.png'))
    p.locator('[data-snippet-id]').click();assert p.get_by_label('消息输入',exact=True).is_visible();assert p.evaluate("()=>{const n=document.querySelector('[data-message-id=T0-m0]'),r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}");assert p.locator('.anchor-feedback').count()==0
    # A real synthetic host edit changes the verified body. The saved anchor must refuse stale positioning.
    p.get_by_role('button',name='编辑消息',exact=True).first.click();p.get_by_label('编辑内容',exact=True).fill('合成消息已经修改，旧片段不再匹配。');p.get_by_role('button',name='保存编辑',exact=True).click();p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill(selected);p.locator('[data-snippet-id]').click();p.locator('.anchor-feedback').filter(has_text='原生搜索').wait_for();p.screenshot(path=str(out/'changed-anchor-fallback.png'));return {'manualSelectedOnly':True,'uniqueAnchorInitiallyVerified':True,'changedNativeMessageFallsBack':True,'preferences':prefs()}
   case('C4-real-selected-snippet-search-and-safe-anchor',snippet)
   def isolation():
    p.evaluate("HF.control('account','B')");active(p);p.get_by_role('button',name='当前工作集',exact=True).click();assert p.locator('.working-set .row').count()==0;p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('合成研究问题');assert p.locator('[data-snippet-id]').count()==0
    p.evaluate("HF.control('account','unknown')");p.wait_for_timeout(500);assert p.locator('.workspace').count()==0
    p.evaluate("HF.control('account','A')");active(p);p.get_by_role('button',name='当前工作集',exact=True).click();assert p.locator('.working-set .row').count()==2;assert len(prefs()['savedSnippets']['value'])==1
    return {'A_B_unknown_A':True,'stress':checks.state(p)}
   case('C34-real-scoped-working-set-and-snippet',isolation)
   ctx.close()
 except Exception as e:r['tests'].append({'id':'execution','status':'FAIL','error':str(e),'trace':traceback.format_exc()})
 finally:server.terminate();server.wait(timeout=5);r['server']={'stdout':server.stdout.read(),'stderr':server.stderr.read(),'exit':server.returncode}
r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL']};(out/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(r['counts']);raise SystemExit(1 if r['counts']['FAIL'] or r['errors'] else 0)
