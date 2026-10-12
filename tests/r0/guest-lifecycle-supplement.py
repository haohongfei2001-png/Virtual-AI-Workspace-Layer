#!/usr/bin/env python3
"""No-send supplemental real guest checks; preserves initial failed refresh receipts."""
import json,time,hashlib,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
S=Path('/Users/hhf/Documents/Codex/VAIWL-Development/r0-guest-session-20261012-c73e')
OUT=ROOT/'docs/experiments/results/r0-live-2026-10-12/guest-supplement'
OUT.mkdir(exist_ok=False)
port,path=(S/'profile/DevToolsActivePort').read_text().splitlines()
r={'layer':'LIVE_HOST_GUEST','additionalMessagesSent':0,'noInternalAPI':True,'tests':[],'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ['experiments/r0','tests/r0'] for p in (ROOT/d).glob('*') if p.is_file()}}
def save(): (OUT/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
def case(name,fn):
 try:actual=fn();status='PASS'
 except Exception as e:actual={'errorType':type(e).__name__,'networkCodes':re.findall(r'net::ERR_[A-Z_]+',str(e))};status='FAIL'
 r['tests'].append({'id':name,'status':status,'actual':actual});save();print(name,status,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.connect_over_cdp('ws://127.0.0.1:'+port+path,no_defaults=True);ctx=browser.contexts[0];p=next(x for x in ctx.pages if x.url.startswith('https://chatgpt.com/'));p.set_default_timeout(7000)
 def inspect():return p.evaluate((ROOT/'experiments/r0/structure.js').read_text())
 s=inspect();assert s['official'] and s['guestSignals']['login'] and s['messageRoleMarkers']['user']==0
 p.evaluate("globalThis.__r0Supplement={main:document.querySelector('main'),input:document.querySelector('main textarea'),events:[]};for(const type of ['visibilitychange','freeze','resume'])document.addEventListener(type,()=>__r0Supplement.events.push({type,visibility:document.visibilityState}));")
 def native():return p.evaluate("()=>({mainUnchanged:__r0Supplement.main===document.querySelector('main'),inputUnchanged:__r0Supplement.input===document.querySelector('main textarea'),ownedDOMRoots:document.querySelectorAll('[data-vaiwl-owned]').length})")
 def menu():
  p.get_by_role('button',name='添加文件等',exact=True).click();p.locator(':popover-open').wait_for()
  names=['创建图像。登录后使用。','深度研究。登录后使用。','添加文件。登录后使用。'];gated=[name for name in names if p.get_by_role('button',name=name,exact=True).is_visible()];assert len(gated)==3
  p.screenshot(path=str(S/'guest-tools-verified-private.png'));p.keyboard.press('Escape');p.wait_for_function("document.querySelectorAll(':popover-open').length===0");n=native();assert n['inputUnchanged'] and n['mainUnchanged'];return {'actualOpenPopover':True,'loginGatedTools':gated,'escapeClosed':True,'toolInvoked':False,'native':n,'correctsFirstRunWeakMenuObservation':True}
 case('R0-00-native-tools-real-popover-and-login-gates',menu)
 def model():
  button=p.locator('[data-header-wordmark][role=button]');assert button.count()==1;button.click();p.wait_for_function("document.querySelector('[data-header-wordmark]')?.getAttribute('aria-expanded')==='true'");p.screenshot(path=str(S/'guest-model-menu-private.png'));opened=p.locator(':popover-open').count();assert opened>=1
  p.keyboard.press('Escape');p.wait_for_function("document.querySelector('[data-header-wordmark]')?.getAttribute('aria-expanded')!=='true'");return {'nativeRoleButton':True,'nativeModelEntry':inspect()['native']['model'],'actualPopoverCount':opened,'openedAndClosed':True,'modelSelectionOrSettingChanged':False,'native':native()}
 case('R0-00-native-model-menu-role-button',model)
 # Reload already removed the native ephemeral transcript, before this supplement.
 case('R0-02-preserved-native-guest-refresh-limitation',lambda:{'originalRefreshAssertion':'FAIL_PRESERVED','currentVisibleRoles':inspect()['messageRoleMarkers'],'route':inspect()['route'],'durableGuestHistory':'NOT_DEMONSTRATED','extensionWasUninstalledBeforeOriginalRefresh':True,'originalSendTime':'UNKNOWN'})
 cdp=browser.new_browser_cdp_session();ext=cdp.send('Extensions.loadUnpacked',{'path':str(S/'extension')})
 worker=next((w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/')),None)
 if worker is None:worker=ctx.wait_for_event('serviceworker',timeout=10000)
 ids=worker.evaluate("async()=>{const ts=await chrome.tabs.query({});return ts.filter(t=>{try{return new URL(t.url).hostname==='chatgpt.com'}catch{return false}}).map(t=>t.id)}");assert len(ids)==1;tab=ids[0]
 worker.evaluate("async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['experiments/r0/content.js']})}",tab)
 def probe(name):
  worker=next(w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/'))
  return worker.evaluate("async ({id,name})=>{const x=await chrome.scripting.executeScript({target:{tabId:id},func:n=>globalThis.__VAIWL_R0_PROBE__?.[n](),args:[name]});return x[0].result}",{'id':tab,'name':name})
 def background():
  input=p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True);input.fill('VAIWL R0 合成未发送草稿');input.focus();p.evaluate("__r0Supplement.expectedDraft=document.querySelector('main textarea').value")
  control=ctx.new_page();control.goto('about:blank');cs=ctx.new_cdp_session(control);target=cs.send('Target.getTargetInfo')['targetInfo']['targetId'];cdp.send('Target.activateTarget',{'targetId':target});p.wait_for_function("document.visibilityState==='hidden'",timeout=7000)
  ps=ctx.new_cdp_session(p);pt=ps.send('Target.getTargetInfo')['targetInfo']['targetId'];cdp.send('Target.activateTarget',{'targetId':pt});p.wait_for_function("document.visibilityState==='visible'",timeout=7000);control.close()
  d=p.evaluate("()=>({events:__r0Supplement.events,draftUnchanged:document.querySelector('main textarea').value===__r0Supplement.expectedDraft,focused:document.activeElement===document.querySelector('main textarea')})");assert d['draftUnchanged'];assert any(x['visibility']=='hidden' for x in d['events']) and any(x['visibility']=='visible' for x in d['events']);h=probe('health');assert h['bindingReason']=='unverified-scope';return {'actualVisibilityEvents':d,'probe':h,'native':native(),'newMessagesSent':0}
 case('R0-04-real-background-return-preserves-native-draft',background)
 def freeze():
  ps=ctx.new_cdp_session(p);ps.send('Page.setWebLifecycleState',{'state':'frozen'});time.sleep(1);ps.send('Page.setWebLifecycleState',{'state':'active'});p.wait_for_timeout(100)
  actual=p.evaluate("()=>({freezeObserved:__r0Supplement.events.some(x=>x.type==='freeze'),resumeObserved:__r0Supplement.events.some(x=>x.type==='resume'),draftUnchanged:document.querySelector('main textarea').value===__r0Supplement.expectedDraft})");assert all(actual.values());h=probe('health');assert not h['derivedContentEnabled'] and not h['trustedAccountScope'];o=probe('ownership');assert o['originalNativeNodesConnected'] and o['composerUnchanged'];return {'actualLifecycleEvents':actual,'probeHealth':h,'ownership':o,'native':native(),'noRefresh':True}
 case('R0-04-actual-freeze-resume-unknown-scope',freeze)
 def detach():
  n=native();assert n['inputUnchanged'] and n['mainUnchanged'] and n['ownedDOMRoots']==0;o=probe('ownership');assert o['originalNativeNodesConnected'];stopped=probe('stop');assert stopped['stopped'];cdp.send('Extensions.uninstall',{'id':ext['id']});p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).fill('');return {'probeStopped':True,'actualUninstall':True,'ownUnsentSyntheticDraftRemoved':True,'native':native(),'finalStructure':inspect()}
 case('R0-04-final-stop-uninstall-native-retained',detach)
 r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL']};save();print(r['counts'],flush=True)
