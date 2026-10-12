#!/usr/bin/env python3
"""Six bounded native guest sends; passive, frame-wise first-party metadata only.
No request payload/headers, cookies, authentication, full response, HAR, API fetch,
private page state or signed-in data. URLs/IDs/times used for equality stay in RAM.
"""
import argparse,base64,hashlib,json,re,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'experiments/r0/time-source'))
from fields import StreamReducer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3];PYROOT=ROOT/'experiments/r0/time-source'
arg=argparse.ArgumentParser();arg.add_argument('--session-dir',required=True);arg.add_argument('--output-dir',required=True);arg.add_argument('--allow-six-native-synthetic-sends',action='store_true');a=arg.parse_args();assert a.allow_six_native_synthetic_sends
S=Path(a.session_dir).resolve();O=Path(a.output_dir).resolve();assert not S.exists() and not O.exists() and ROOT not in S.parents and O.is_relative_to(ROOT/'docs/experiments/results');S.mkdir(mode=0o700);profile=S/'profile';profile.mkdir(mode=0o700);O.mkdir()
r={'layer':'LIVE_GUEST_TIME_SOURCE_SUPPLEMENT','base':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'maxNativeSends':6,'nativeSends':0,'directInternalAPICalls':0,'loginActions':0,'requestHeadersOrPayloadRead':False,'fullResponseOrHARStored':False,'conditions':[],'failures':[],'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ['experiments/r0/time-source','tests/r0/time-source'] for p in (ROOT/d).glob('*') if p.is_file()}}
def save(): (O/'results.partial.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
def safe_error(e):return {'type':type(e).__name__,'codes':re.findall(r'net::ERR_[A-Z_]+',str(e))}
config=subprocess.check_output(['scutil','--proxy'],text=True)
def item(k):
 m=re.search(r'^\s*'+k+r'\s*:\s*(\S+)',config,re.M);return m.group(1) if m else None
host,port=item('HTTPSProxy'),item('HTTPSPort');assert item('HTTPSEnable')=='1' and host in ('127.0.0.1','localhost','::1') and port.isdigit()
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';args=[chrome,'--user-data-dir='+str(profile),'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-sync','--window-size=1440,1000','--proxy-server=http://'+host+':'+port,'about:blank']
# Own private log cannot enter public evidence. It is never read by this driver.
log=open(S/'chrome-private.log','w');process=subprocess.Popen(args,stdout=log,stderr=log)
try:
 for _ in range(100):
  if (profile/'DevToolsActivePort').exists():break
  assert process.poll() is None;time.sleep(.1)
 port,path=(profile/'DevToolsActivePort').read_text().splitlines()
 with sync_playwright() as pw:
  browser=pw.chromium.connect_over_cdp('ws://127.0.0.1:'+port+path,no_defaults=True);ctx=browser.contexts[0];p=ctx.pages[0];p.set_default_timeout(7000)
  cdp=browser.new_browser_cdp_session();session=ctx.new_cdp_session(p);session.send('Network.enable')
  state={'active':None,'streams':{},'responses':[]};all_streams=[]
  def response(event):
   x=event['response'];u=urlsplit(x['url'])
   if u.scheme!='https' or u.hostname!='chatgpt.com':return
   active=state['active'];mime=x.get('mimeType','');kind='event-stream' if mime=='text/event-stream' else 'json-metadata-only' if 'json' in mime else 'document-metadata-only' if 'html' in mime else 'other-metadata-only'
   if active is not None:state['responses'].append({'kind':kind,'mimeType':mime,'status':x['status'],'phase':active['phase'],'bodyNotRead':kind!='event-stream'})
   if active is None or kind!='event-stream':return
   reducer=StreamReducer(active['marker'],active['observed']);entry={'phase':active['phase'],'marker':active['marker'],'reducer':reducer,'streamError':None};state['streams'][event['requestId']]=entry;all_streams.append(entry)
   try:
    answer=session.send('Network.streamResourceContent',{'requestId':event['requestId']});initial=answer.get('bufferedData','')
    if initial:reducer.feed(base64.b64decode(initial).decode('utf-8',errors='replace'))
   except Exception as e:entry['streamError']=safe_error(e)
  def data(event):
   entry=state['streams'].get(event['requestId']);chunk=event.get('data')
   if entry is None or not chunk:return
   if entry['reducer'].bytes>4*1024*1024:return
   entry['reducer'].feed(base64.b64decode(chunk).decode('utf-8',errors='replace'))
  session.on('Network.responseReceived',response);session.on('Network.dataReceived',data)
  # Read only exact HTTP Date response header, never all headers/authentication.
  http_dates=[]
  def date_header(resp):
   active=state['active']
   if active is None or urlsplit(resp.url).hostname!='chatgpt.com' or resp.request.resource_type not in ('document','fetch','xhr'):return
   try:v=resp.header_value('date');http_dates.append({'field':'HTTP Date','type':'HTTP-date' if v else 'missing','phase':active['phase'],'semantics':'response-origin-time-not-message-send-time','notOriginalSendTime':True})
   except Exception as e:r['failures'].append({'phase':'date-only-header','error':safe_error(e)})
  p.on('response',date_header)
  actual=p.goto('https://chatgpt.com',wait_until='domcontentloaded',timeout=30000);p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).wait_for(timeout=20000)
  r['environment']={'chrome':cdp.send('Browser.getVersion')['product'],'initialHTTP':actual.status,'freshProfile':True,'existingConfiguredProxyOnly':True,'noSecurityOverride':True,'python':sys.version.split()[0],'playwright':__import__('importlib.metadata',fromlist=['version']).version('playwright')}
  ext=None;tab=None;build=S/'extension';subprocess.run(['node','experiments/r0/build.mjs',str(build)],cwd=ROOT,check=True,capture_output=True);r['buildHashes']=json.loads((build/'SHA256.json').read_text())
  def guest():
   s=p.evaluate((ROOT/'experiments/r0/structure.js').read_text());assert s['official'] and s['guestSignals']['login'] and s['identityAttributeCandidates']==0;return s
  def fields(marker):return p.evaluate((PYROOT/'page-fields.js').read_text(),{'marker':marker})
  def load():
   nonlocal_dummy=None
   return cdp.send('Extensions.loadUnpacked',{'path':str(build)})
  def worker():return next(w for w in ctx.service_workers if w.url.startswith('chrome-extension://'+ext['id']+'/'))
  def inject():
   global tab
   w=worker();ids=w.evaluate("async()=>{const ts=await chrome.tabs.query({});return ts.filter(t=>{try{return new URL(t.url).hostname==='chatgpt.com'}catch{return false}}).map(t=>t.id)}");assert len(ids)==1;tab=ids[0];w.evaluate("async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['experiments/r0/content.js']})}",tab)
  def health():return worker().evaluate("async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>__VAIWL_R0_PROBE__.health()}))[0].result",tab)
  def stop():return worker().evaluate("async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>__VAIWL_R0_PROBE__.stop()}))[0].result",tab)
  def settle(marker,seconds=3):
   p.wait_for_timeout(int(seconds*1000));s=guest();return {'routeIsHome':p.url=='https://chatgpt.com/','ownSyntheticUserVisible':p.locator('main [data-message-role=user],main [data-message-author-role=user]').filter(has_text=marker).count()>0,'roles':s['messageRoleMarkers'],'fields':fields(marker)}
  def activate(marker,phase):state['active']={'marker':marker,'phase':phase,'observed':time.time()}
  def send(marker):
   guest();assert r['nativeSends']<6;prompt=marker+'：请只回答 3+4 的结果，不包含其他内容。';activate(marker,'native-send');r['nativeSends']+=1;save()
   p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).fill(prompt);p.get_by_role('button',name='发送消息',exact=True).click();p.get_by_text('7',exact=True).first.wait_for(timeout=45000);p.wait_for_timeout(600)
   s=settle(marker,.5);assert s['ownSyntheticUserVisible'];return s
  for mode in ['no-extension','probe-loaded','probe-uninstalled']:
   record={'condition':mode,'checks':[]};r['conditions'].append(record);save();p.goto('https://chatgpt.com',wait_until='domcontentloaded');p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).wait_for(timeout=15000);guest()
   if mode=='probe-loaded':
    ext=load();p.wait_for_timeout(500);inject();record['initialProbeHealth']=health();assert not record['initialProbeHealth']['trustedAccountScope']
   if mode=='probe-uninstalled':
    inject();record['preUninstallHealth']=health();record['stopResult']=stop();cdp.send('Extensions.uninstall',{'id':ext['id']});record['actualExtensionUninstalledBeforeSends']=True;ext=None
   record['initializationBeforeOwnMessage']=fields('VAIWL_TIME_NO_MESSAGE');stream_start=len(all_streams);response_start=len(state['responses']);date_start=len(http_dates)
   marker='VAIWL_TIME_'+mode.upper().replace('-','_')+'_RETURN'
   try:
    record['returnSampleBefore']=send(marker);old=p.url
    # Reopen own route in an additional tab, no hidden API. Never publish this URL.
    q=ctx.new_page();reply=q.goto(old,wait_until='domcontentloaded',timeout=30000);q.wait_for_timeout(2000);qs=q.evaluate((ROOT/'experiments/r0/structure.js').read_text());record['reopenOwnRoute']={'http':reply.status if reply else None,'roles':qs['messageRoleMarkers'],'ownMarkerVisible':q.locator('main [data-message-role=user],main [data-message-author-role=user]').filter(has_text=marker).count()>0,'fields':q.evaluate((PYROOT/'page-fields.js').read_text(),{'marker':marker})};q.close()
    activate(marker,'native-new-chat-and-back');p.get_by_role('link',name='新聊天',exact=True).click();p.wait_for_timeout(500);record['nativeNewChatNoOwnMessage']=not settle(marker,.1)['ownSyntheticUserVisible'];p.go_back(wait_until='domcontentloaded',timeout=30000);back=settle(marker);back['sameRouteAsOwnConversation']=p.url==old;record['checks'].append({'kind':'independent-native-new-chat-and-back','status':'PASS' if back['ownSyntheticUserVisible'] else 'FAIL','actual':back})
   except Exception as e:record['checks'].append({'kind':'return-sample','status':'FAIL','error':safe_error(e)})
   # Independent message after resetting to home, unaffected by the return check.
   p.goto('https://chatgpt.com',wait_until='domcontentloaded');p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).wait_for(timeout=15000)
   if mode=='probe-loaded':inject();record['refreshSampleProbeHealth']=health()
   marker='VAIWL_TIME_'+mode.upper().replace('-','_')+'_REFRESH'
   try:
    record['refreshSampleBefore']=send(marker);old=p.url;activate(marker,'native-refresh');p.reload(wait_until='domcontentloaded',timeout=30000);after=settle(marker);after['sameRouteAsOwnConversation']=p.url==old
    record['checks'].append({'kind':'independent-native-refresh','status':'PASS' if after['ownSyntheticUserVisible'] else 'FAIL','actual':after})
    if mode=='probe-loaded':inject();record['afterRefreshReinjectedProbeHealth']=health();record['manualInjectionBecauseNoAutomaticContentScript']=True
   except Exception as e:record['checks'].append({'kind':'refresh-sample','status':'FAIL','error':safe_error(e)})
   state['active']=None;record['naturalResponses']=state['responses'][response_start:];record['httpDateOnly']=http_dates[date_start:];record['messageStreams']=[{'phase':x['phase'],'streamError':x['streamError'],**x['reducer'].public()} for x in all_streams[stream_start:]]
   save();print(mode,json.dumps({'sends':r['nativeSends'],'checks':[(x['kind'],x['status']) for x in record['checks']],'streams':len(record['messageStreams'])}),flush=True)
  # Local cross-observation equality only, no raw identifiers/times exported.
  known={};relations=[]
  for entry in all_streams:
   for m in entry['reducer'].messages:
    if not m['privateId']:continue
    key=(m['role'],m['privateId']);times=m['privateTimes']
    if key in known:relations.append({'role':m['role'],'sameMessageIdAcrossObservations':True,'sameTimeFields':known[key]==times,'ownSyntheticMarker':m['ownSyntheticMarker'],'timeFieldNames':list(times)})
    else:known[key]=times
  r['messageTimeEqualityEvidence']=relations[:100];r['accountIdentity']='UNVERIFIED';r['historicalCoverage']='UNKNOWN';r['serverGeneratedVersusEchoedTime']='NOT_PROVEN_BY_RESPONSE_FIELD_ALONE';r['counts']={s:sum(x['status']==s for c in r['conditions'] for x in c['checks']) for s in ['PASS','FAIL']};r['completed']=True
  if ext is not None:stop();cdp.send('Extensions.uninstall',{'id':ext['id']})
  browser.close()
except Exception as e:r['failures'].append({'phase':'driver','error':safe_error(e)});r['completed']=False
finally:
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait()
 log.close();r['ownChromeClosed']=process.poll() is not None;(O/'results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'completed':r.get('completed'),'nativeSends':r['nativeSends'],'counts':r.get('counts'),'failures':r['failures']}),flush=True)
