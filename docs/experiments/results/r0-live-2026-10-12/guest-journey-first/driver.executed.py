#!/usr/bin/env python3
"""R0 guest-only live increment, same newly owned Chrome, at most two extra sends.
Public receipts contain role/count/boolean evidence and synthetic prompts, no URL IDs,
account labels, credentials, internal API calls, HAR or arbitrary response contents.
"""
import json,time,sys,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];S=Path('/Users/hhf/Documents/Codex/VAIWL-Development/r0-guest-session-20261012-c73e')
OUT=ROOT/'docs/experiments/results/r0-live-2026-10-12/guest-journey-first';OUT.mkdir(exist_ok=False)
port,path=(S/'profile/DevToolsActivePort').read_text().splitlines()
r={'layer':'LIVE_HOST_GUEST','site':'https://chatgpt.com','account':'NOT_LOGGED_IN','loginRequired':False,'directInternalApiCalls':0,'additionalSyntheticSendAttempts':0,'tests':[],'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ['experiments/r0','tests/r0'] for p in (ROOT/d).rglob('*') if p.is_file() and '__pycache__' not in str(p)},'workerEvents':[],'realAccountHistory':'NOT_RUN','PAIA':'NOT_RUN_WAITING_AUTHORIZATION'}
def save(): (OUT/'results.partial.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
def case(name,fn):
 try:actual=fn();status='PASS'
 except Exception as e:actual={'errorType':type(e).__name__,'networkErrorCodes':__import__('re').findall(r'net::ERR_[A-Z_]+',str(e))};status='FAIL'
 r['tests'].append({'id':name,'status':status,'actual':actual});save();print(name,status,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.connect_over_cdp('ws://127.0.0.1:'+port+path,no_defaults=True);ctx=browser.contexts[0];p=ctx.pages[0];p.set_default_timeout(7000)
 inspect=lambda:p.evaluate((ROOT/'experiments/r0/structure.js').read_text())
 def guest():
  s=inspect();assert s['official'] and s['guestSignals']['login'] and not s['identityAttributeCandidates'];return s
 def message_ids():return p.evaluate("()=>[...document.querySelectorAll('main [data-message-role]')].map(n=>n.id)")
 def time_evidence():return p.evaluate("()=>({users:[...document.querySelectorAll('main [data-message-role=user]')].map(n=>({timeNodes:n.querySelectorAll('time[datetime]').length,timeAttributeNames:[...n.getAttributeNames(),...[...n.querySelectorAll('*')].flatMap(x=>x.getAttributeNames())].filter(x=>/timestamp|created-at|sent-at|datetime/.test(x))})),originalSendTime:'UNKNOWN',coverage:'UNKNOWN',browserObservationDoesNotBecomeSentAt:true})")
 def baseline():
  s=guest();assert s['messageRoleMarkers']=={'user':1,'assistant':1,'other':0};return {'actualOctaneRoleMarkers':s['roleAttributeFamilies'],'roles':s['messageRoleMarkers'],'time':time_evidence(),'nativeInspectorOnly':True}
 case('R0-02-actual-guest-message-roles-and-time-fields',baseline)
 # In-memory DOM references only, before mounting any probe; no draft/body collection.
 p.evaluate("globalThis.__r0NativeBaseline={main:document.querySelector('main'),input:document.querySelector('main textarea'),messages:[...document.querySelectorAll('main [data-message-role]')]}")
 native=lambda:p.evaluate("()=>({main:__r0NativeBaseline.main===document.querySelector('main'),input:__r0NativeBaseline.input===document.querySelector('main textarea'),priorMessages:__r0NativeBaseline.messages.every(n=>n.isConnected),ownedRoots:document.querySelectorAll('[data-vaiwl-owned]').length})")
 # Load only the experimental graph, then explicitly inject into this guest tab.
 cdp=browser.new_browser_cdp_session();ext=None;worker=None;tab=None
 def load():
  global ext,worker,tab
  build=S/'extension';ext=cdp.send('Extensions.loadUnpacked',{'path':str(build)});r['buildHashes']=json.loads((build/'SHA256.json').read_text())
  worker=next((w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/')),None)
  if worker is None:worker=ctx.wait_for_event('serviceworker',timeout=10000)
  tabs=worker.evaluate("async()=>{const tabs=await chrome.tabs.query({});return tabs.filter(t=>{try{return new URL(t.url).hostname==='chatgpt.com'}catch{return false}}).map(t=>t.id)}");assert len(tabs)==1;tab=tabs[0]
  worker.evaluate("async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['experiments/r0/content.js']});return true}",tab)
  result=health();assert result['bindingReason']=='unverified-scope' and result['trustedAccountScope'] is False and result['derivedContentEnabled'] is False;assert all(native()[k] for k in ['main','input','priorMessages']);return {'actualExtensionLoaded':True,'manualInjectionNoReload':True,'health':result,'native':native()}
 def current_worker():return next(w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/'))
 def health():return current_worker().evaluate("async id=>{const x=await chrome.scripting.executeScript({target:{tabId:id},func:()=>globalThis.__VAIWL_R0_PROBE__?.health()});return x[0].result}",tab)
 def ownership():return current_worker().evaluate("async id=>{const x=await chrome.scripting.executeScript({target:{tabId:id},func:()=>globalThis.__VAIWL_R0_PROBE__?.ownership()});return x[0].result}",tab)
 case('R0-04-real-MV3-content-worker-and-fail-closed',load)
 def second():
  guest();prompt='VAIWL R0 访客合成多轮测试（二）：请只回答 7+4 的结果，不包含其他内容。';r['additionalSyntheticSendAttempts']+=1
  stamp=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).fill(prompt);p.get_by_role('button',name='发送消息',exact=True).click();p.get_by_text('11',exact=True).first.wait_for(timeout=45000)
  s=guest();assert s['messageRoleMarkers']['user']==2 and s['messageRoleMarkers']['assistant']==2;assert p.get_by_text(prompt,exact=True).count()==1
  n=native();assert n['input'] and n['main'] and n['priorMessages'] and n['ownedRoots']==0;return {'syntheticPrompt':prompt,'expectedReplyVisible':True,'roles':s['messageRoleMarkers'],'browserObservedBeforeClickUtc':stamp,'notOriginalSendTime':True,'time':time_evidence(),'native':n,'probeHealth':health()}
 case('R0-02-04-real-second-guest-turn-with-probe',second)
 def third():
  guest();prompt='VAIWL R0 访客合成多轮测试（三）：请输出12行，每行只写“合成色彩测试”，不要包含其他内容。';r['additionalSyntheticSendAttempts']+=1
  p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).fill(prompt);p.get_by_role('button',name='发送消息',exact=True).click()
  # Observe the real native stop entry without adding another paid/tool request.
  stop_observed=False
  for _ in range(30):
   stop_observed=p.get_by_role('button',name='停止生成',exact=True).count()>0
   if stop_observed:break
   p.wait_for_timeout(100)
  p.locator('main [data-message-role=assistant]').nth(2).wait_for(timeout=45000)
  p.wait_for_function("document.querySelectorAll('main [data-message-role=assistant][data-message-complete]').length>=3",timeout=45000)
  s=guest();assert s['messageRoleMarkers']['user']==3 and s['messageRoleMarkers']['assistant']==3;return {'syntheticPrompt':prompt,'roles':s['messageRoleMarkers'],'nativeStopEntryObservedDuringGeneration':stop_observed,'time':time_evidence(),'native':native()}
 case('R0-02-04-real-third-guest-turn-and-stream-entry',third)
 def cold():
  before=health();session=ctx.new_cdp_session(p);events=[];session.on('ServiceWorker.workerVersionUpdated',lambda e:events.extend(e['versions']));session.send('ServiceWorker.enable');p.wait_for_timeout(150)
  running=[v for v in events if v.get('scriptURL','').startswith('chrome-extension://'+ext['id']+'/') and v.get('runningStatus')=='running'];assert running
  vid=running[-1]['versionId'];start=len(events);session.send('ServiceWorker.stopWorker',{'versionId':vid})
  for _ in range(50):
   if any(v.get('versionId')==vid and v.get('runningStatus')=='stopped' for v in events[start:]):break
   p.wait_for_timeout(100)
  assert any(v.get('versionId')==vid and v.get('runningStatus')=='stopped' for v in events[start:]);after=health();assert before['boot']!=after['boot'];assert after['bindingReason']=='unverified-scope'
  r['workerEvents']=[{'status':v.get('runningStatus'),'ownExperimentalWorker':True} for v in events if v.get('scriptURL','').startswith('chrome-extension://'+ext['id']+'/')]
  n=native();assert n['main'] and n['input'] and n['priorMessages'] and n['ownedRoots']==0;return {'beforeBoot':before['boot'],'afterBoot':after['boot'],'actualStoppedEvent':True,'noPageReload':True,'stillNoTrustedScope':True,'native':n}
 case('R0-04-actual-worker-stop-restart-and-native-preservation',cold)
 def menus():
  guest();p.get_by_role('button',name='添加文件等',exact=True).click();p.wait_for_timeout(100)
  gated=[n for n in ['创建图像。登录后使用。','深度研究。登录后使用。','添加文件。登录后使用。'] if p.get_by_role('button',name=n,exact=True).is_visible()]
  p.keyboard.press('Escape');p.wait_for_timeout(100);return {'nativeToolsPopoverOpened':True,'loginGatedTools':gated,'noToolInvoked':True,'native':native()}
 case('R0-00-04-native-tool-menu-guest-limit',menus)
 def responsive():
  session=ctx.new_cdp_session(p);session.send('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':False});p.wait_for_timeout(200);s=guest();layout=p.evaluate("()=>({viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,composerVisible:(()=>{const n=document.querySelector('main textarea'),r=n?.getBoundingClientRect();return !!(r&&r.width&&r.height)})()})");p.screenshot(path=str(S/'guest-narrow-private.png'));session.send('Emulation.clearDeviceMetricsOverride');session.send('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-color-scheme','value':'dark'}]});p.wait_for_timeout(200);p.screenshot(path=str(S/'guest-dark-private.png'));session.send('Emulation.setEmulatedMedia',{'features':[]});return {'nativeGuestOnly':True,'narrow':layout,'darkMediaEmulated':True,'noAccountSettingChanged':True}
 case('R0-00-04-native-narrow-dark',responsive)
 def stop_probe():
  o=ownership();assert o['originalNativeNodesConnected'] and o['composerUnchanged'] and o['ownedDOMRoots']==0
  stopped=current_worker().evaluate("async id=>{const x=await chrome.scripting.executeScript({target:{tabId:id},func:()=>globalThis.__VAIWL_R0_PROBE__?.stop()});return x[0].result}",tab);assert stopped['stopped'] and stopped['ownedDOMRoots']==0
  cdp.send('Extensions.uninstall',{'id':ext['id']});return {'probeStopped':True,'actualExtensionUninstalled':True,'native':native(),'ownership':o}
 case('R0-04-stop-and-uninstall-owned-probe',stop_probe)
 def refresh():
  ids=message_ids();before=guest();old=p.url;p.reload(wait_until='domcontentloaded',timeout=30000);p.locator('main [data-message-role=user]').nth(2).wait_for(timeout=15000)
  after=guest();assert after['messageRoleMarkers']['user']==3 and after['messageRoleMarkers']['assistant']==3
  return {'sameNativeRouteAfterRefresh':p.url==old,'sameVisibleMessageIds':message_ids()==ids,'rolesBefore':before['messageRoleMarkers'],'rolesAfter':after['messageRoleMarkers'],'timeAfterRefresh':time_evidence(),'persistedWithinThisAnonymousBrowserSessionOnly':True,'notAccountHistoryCoverage':True}
 case('R0-02-04-native-guest-refresh-stability',refresh)
 def routes():
  old=p.url;p.get_by_role('link',name='新聊天',exact=True).click();p.wait_for_timeout(200);home=guest();assert home['messageRoleMarkers']['user']==0
  p.go_back(wait_until='domcontentloaded',timeout=30000);p.locator('main [data-message-role=user]').nth(2).wait_for(timeout=10000);back=guest();assert back['messageRoleMarkers']['user']==3;return {'nativeNewChatRouteChanged':p.url==old,'homeHadNoMessages':True,'browserBackRecoveredOwnGuestMessages':True,'backRoles':back['messageRoleMarkers'],'noHistoryRewrite':True}
 case('R0-00-04-native-new-chat-and-browser-back',routes)
 p.screenshot(path=str(S/'guest-final-private.png'))
 r['endedAt']=time.time();r['counts']={s:sum(t['status']==s for t in r['tests']) for s in ['PASS','FAIL']};(OUT/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r['counts']),flush=True)
 # Reader disconnect only; owner controls final shutdown. No site credentials read.
