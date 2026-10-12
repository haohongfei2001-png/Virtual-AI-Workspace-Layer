#!/usr/bin/env python3
"""One explicitly authorized synthetic visitor send through the actual native UI.
Uses only this turn's fresh Chrome; no login, direct history API or response-body capture.
"""
import json,time,sys,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
S=Path('/Users/hhf/Documents/Codex/VAIWL-Development/r0-guest-session-20261012-c73e')
OUT=ROOT/'docs/experiments/results/r0-live-2026-10-12/guest-first-message.json'
assert not OUT.exists()
port,path=(S/'profile/DevToolsActivePort').read_text().splitlines()
prompt='VAIWL R0 访客合成测试：请只回答 2+3 的结果，不包含其他内容。'
r={'layer':'LIVE_HOST_GUEST','site':'https://chatgpt.com','account':'NOT_LOGGED_IN','baselineExtensionLoaded':False,'syntheticPrompt':prompt,'browserObservationTimeNotOriginalSendTime':True,'directInternalApiCalls':0,'sentCount':0,'result':'BLOCKED'}
with sync_playwright() as pw:
 b=pw.chromium.connect_over_cdp('ws://127.0.0.1:'+port+path,no_defaults=True);p=b.contexts[0].pages[0];p.set_default_timeout(5000)
 inspect=lambda:p.evaluate((ROOT/'experiments/r0/structure.js').read_text())
 r['before']=inspect();assert r['before']['official'] and r['before']['guestSignals']['login'] and r['before']['native']['composer']==1
 r['nativeComposerStructure']=p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).evaluate('(n)=>({tag:n.tagName,role:n.getAttribute("role"),attributeNames:n.getAttributeNames()})')
 r['observedBeforeNativeClickUtc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());t=time.monotonic()
 try:
  p.get_by_role('textbox',name='与 ChatGPT 聊天',exact=True).fill(prompt);p.get_by_role('button',name='发送消息',exact=True).click();r['sentCount']=1
  p.get_by_text('5',exact=True).first.wait_for(timeout=45000);r['expectedReplyVisible']=True;r['result']='OBSERVED_REPLY'
 except Exception as e:r['errorType']=type(e).__name__;r['expectedReplyVisible']=False
 r['nativeSendToObservationMs']=round((time.monotonic()-t)*1000,1);r['after']=inspect()
 r['knownSyntheticUserVisible']=p.get_by_text(prompt,exact=True).count()>0
 r['syntheticMessageAncestorStructure']=p.get_by_text(prompt,exact=True).first.evaluate('''n=>{const rows=[];for(let i=0;i<5&&n;i++,n=n.parentElement)rows.push({tag:n.tagName,attributeNames:n.getAttributeNames(),role:n.getAttribute('data-message-author-role')});return rows;}''') if r['knownSyntheticUserVisible'] else []
 r['possibleNativeRoleAttributes']=p.evaluate('''()=>{const keys=new Set();for(const n of document.querySelectorAll('main *'))for(const k of n.getAttributeNames())if(/author|message|timestamp|created-at|sent-at|datetime|turn/.test(k))keys.add(k);return [...keys].sort()}''')
 p.screenshot(path=str(S/'guest-first-message-private.png'))
 OUT.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False),flush=True)
 # Disconnect, never close the owning Chrome in this reader.
