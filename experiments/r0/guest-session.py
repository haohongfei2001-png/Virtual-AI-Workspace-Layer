#!/usr/bin/env python3
"""Standard native Chrome baseline; new Profile and only its own CDP.
No login automation, stealth flags, certificate overrides or protected-history APIs.
Read-only capture is allowlisted structure; guest sends require explicit current grant.
"""
import argparse,json,os,re,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ROOT=Path(__file__).resolve().parents[2]
def emit(v):print(json.dumps(v,ensure_ascii=False),flush=True)
def configured_proxy():
 config=subprocess.check_output(['scutil','--proxy'],text=True)
 def item(k):
  m=re.search(r'^\s*'+k+r'\s*:\s*(\S+)',config,re.M);return m.group(1) if m else None
 host,port=item('HTTPSProxy'),item('HTTPSPort')
 if item('HTTPSEnable')!='1' or host not in ['127.0.0.1','localhost','::1'] or not port or not port.isdigit():raise ValueError('NO_EXISTING_LOOPBACK_PROXY')
 return 'http://'+('['+host+']' if host=='::1' else host)+':'+port
p=argparse.ArgumentParser();p.add_argument('--session-dir',required=True);p.add_argument('--use-configured-loopback-proxy',action='store_true');a=p.parse_args()
session=Path(a.session_dir).resolve()
if session.exists() or session==ROOT or ROOT in session.parents:raise ValueError('NEW_PRIVATE_DIRECTORY_OUTSIDE_REPOSITORY_REQUIRED')
session.mkdir(mode=0o700);profile=session/'profile';profile.mkdir(mode=0o700)
args=[CHROME,'--user-data-dir='+str(profile),'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-sync','--window-size=1440,1000','about:blank']
if a.use_configured_loopback_proxy:args.insert(-1,'--proxy-server='+configured_proxy())
log=open(session/'chrome-private.log','w');process=subprocess.Popen(args,stdout=log,stderr=log)
try:
 for _ in range(100):
  if (profile/'DevToolsActivePort').exists():break
  if process.poll() is not None:raise RuntimeError('OWN_CHROME_EXITED')
  time.sleep(.1)
 port,path=(profile/'DevToolsActivePort').read_text().splitlines();endpoint='ws://127.0.0.1:'+port+path
 with sync_playwright() as pw:
  browser=pw.chromium.connect_over_cdp(endpoint,no_defaults=True);context=browser.contexts[0];page=context.pages[0];page.set_default_timeout(5000)
  version=browser.new_browser_cdp_session().send('Browser.getVersion')['product'];http=None;error=None;codes=[]
  try:
   response=page.goto('https://chatgpt.com',wait_until='domcontentloaded',timeout=30000);http=response.status if response else None
  except Exception as e:error=type(e).__name__;codes=re.findall(r'net::ERR_[A-Z_]+',str(e))
  emit({'state':'GUEST_NATIVE_BASELINE','headful':True,'freshProfile':True,'standardChromeLaunch':True,'noPlaywrightDefaultFlags':True,'website':'https://chatgpt.com','initialHttpStatus':http,'navigationErrorType':error,'networkErrorCodes':codes,'existingSystemLoopbackProxyUsed':a.use_configured_loopback_proxy,'chrome':version,'extensionLoaded':False,'loginRequired':False,'ownCDPOnly':True,'sessionDir':str(session)})
  for line in sys.stdin:
   try:
    q=json.loads(line);cmd=q.get('command')
    if cmd=='close':emit({'state':'CLOSED_OWN_GUEST_CHROME'});break
    if cmd=='observe':emit({'state':'STRUCTURE_ONLY','observation':page.evaluate((ROOT/'experiments/r0/structure.js').read_text())});continue
    # Sending is deliberately not reachable through arbitrary text or generic clicks.
    # Native guest readiness and the fixed approved synthetic catalogue will be
    # implemented only after this exact live baseline becomes reachable.
    raise ValueError('UNSUPPORTED_COMMAND')
   except Exception as e:emit({'state':'COMMAND_REFUSED_OR_FAILED','errorType':type(e).__name__,'networkErrorCodes':re.findall(r'net::ERR_[A-Z_]+',str(e))})
  browser.close()
finally:
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait()
 log.close()
