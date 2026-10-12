#!/usr/bin/env python3
"""Own one fresh visible Chrome for manual login and scoped read-only R0.
No daily profile, existing CDP, credential reads, HAR, screenshots, internal API,
network interception, login automation or real-content mutations.
Browser operations pause at LOGIN_GATE; stdin accepts only explicit local commands.
"""
import argparse, json, os, sys, subprocess, re
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
def emit(value):print(json.dumps(value,ensure_ascii=False),flush=True)
def page_kind(page):
 u=urlsplit(page.url)
 if u.scheme!='https' or u.hostname!='chatgpt.com':return 'OFFICIAL_LOGIN_REDIRECT_OR_OTHER_PAGE_NOT_INSPECTED'
 if u.path=='/':return 'CHATGPT_HOME'
 if u.path.startswith('/c/'):return 'CHATGPT_CONVERSATION'
 if u.path.startswith('/g/'):return 'CHATGPT_GPT_OR_PROJECT'
 return 'CHATGPT_OTHER'
def main():
 p=argparse.ArgumentParser();p.add_argument('--session-dir',required=True);p.add_argument('--use-configured-loopback-proxy',action='store_true');a=p.parse_args()
 session=Path(a.session_dir).resolve();repo=Path(__file__).resolve().parents[2]
 if session.exists() or session==repo or repo in session.parents:raise ValueError('NEW_PRIVATE_DIRECTORY_OUTSIDE_REPOSITORY_REQUIRED')
 session.mkdir(parents=True,mode=0o700);os.chmod(session,0o700)
 (session/'SESSION_NOTICE.txt').write_text('Dedicated VAIWL R0 clean-account Chrome profile. Authentication belongs only to this profile. Never copy or publish profile files. No automatic login or background collection.\n')
 proxy=None
 if a.use_configured_loopback_proxy:
  config=subprocess.check_output(['scutil','--proxy'],text=True)
  def item(k):
   m=re.search(r'^\s*'+k+r'\s*:\s*(\S+)',config,re.M);return m.group(1) if m else None
  host,port=item('HTTPSProxy'),item('HTTPSPort')
  if item('HTTPSEnable')!='1' or host not in ['127.0.0.1','localhost','::1'] or not port or not port.isdigit():raise ValueError('NO_EXISTING_CONFIGURED_LOOPBACK_PROXY')
  proxy={'server':'http://'+('['+host+']' if host=='::1' else host)+':'+port}
 with sync_playwright() as pw:
  context=pw.chromium.launch_persistent_context(str(session/'profile'),executable_path=CHROME,headless=False,chromium_sandbox=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--window-size=1440,1000'],viewport=None,proxy=proxy)
  page=context.pages[0] if context.pages else context.new_page();page.set_default_timeout(5000)
  http=None;error=None;network_errors=[]
  try:
   response=page.goto('https://chatgpt.com',wait_until='domcontentloaded',timeout=45000);http=response.status if response else None
  except Exception as e:error=type(e).__name__;network_errors=re.findall(r'net::ERR_[A-Z_]+',str(e))
  version=context.browser.new_browser_cdp_session().send('Browser.getVersion')
  emit({'state':'LOGIN_GATE','headful':True,'freshProfile':True,'website':'https://chatgpt.com','initialHttpStatus':http,'navigationErrorType':error,'networkErrorCodes':network_errors,'existingSystemLoopbackProxyUsed':bool(proxy),'chrome':version['product'],'extensionLoaded':False,'automaticBrowserOperationsPaused':True,'credentialsNeverRequested':True,'sessionDir':str(session)})
  # No page reads/polling while a human signs in. No raw URLs or login fields logged.
  clean_confirmed=False
  for line in sys.stdin:
   try:
    request=json.loads(line);cmd=request.get('command')
    if cmd=='close':context.close();emit({'state':'CLOSED_OWN_TEST_CHROME'});return
    if cmd=='status':emit({'state':'MANUAL_LOGIN_PAUSED','pageKind':page_kind(page),'cleanScopeConfirmed':clean_confirmed});continue
    if cmd=='confirm-clean-scope':
     if request.get('humanConfirmed') is not True:raise ValueError('HUMAN_SCOPE_CONFIRMATION_REQUIRED')
     clean_confirmed=True;emit({'state':'CLEAN_SCOPE_CONFIRMED_FOR_READ_ONLY','productionIdentityStillUnverified':True});continue
    if cmd=='observe':
     if not clean_confirmed:raise ValueError('LOGIN_AND_CLEAN_SCOPE_GATE')
     if urlsplit(page.url).hostname!='chatgpt.com' or urlsplit(page.url).scheme!='https':raise ValueError('EXACT_OFFICIAL_HOST_ONLY')
     source=repo/'experiments/r0/structure.js'
     if not source.exists():raise ValueError('READ_ONLY_PROBE_NOT_BUILT')
     emit({'state':'STRUCTURE_ONLY','observation':page.evaluate(source.read_text())});continue
    raise ValueError('UNSUPPORTED_LOCAL_COMMAND')
   except Exception as e:emit({'state':'COMMAND_REFUSED_OR_FAILED','errorType':type(e).__name__})
  # A real EOF ends our test session; no background collection continues.
  context.close()
if __name__=='__main__':main()
