#!/usr/bin/env python3
"""Existing accepted suites, one sequential headless batch; distinct new Profiles.
No paid services, CI, daily browser, default-profile CDP or changed assertions.
"""
import sys,subprocess,json,time,signal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
py=str(ROOT/'.venv/bin/python')
commands=[
 ('DOM49',[py,'tests/hf/browser.py','--browser',chrome,'--out',str(out/'dom')]),
 *[(mode,[py,'tests/b23/real-browser.py','--mode',mode,'--port',str(48172+i),'--browser',chrome,'--out',str(out/(mode+'.json'))]) for i,mode in enumerate(['db','page','mv3'])],
 ('C1',[py,'tests/c1/real-ui.py','--out',str(out/'c1')]),
 ('B5',[py,'tests/b5/real-ui.py',str(out/'b5')]),
 ('C34',[py,'tests/c34/real-ui.py',str(out/'c34')]),
 ('C5',[py,'tests/c34/compatibility.py',str(out/'c5')]),
 ('B4core',[py,'tests/b4/real-mv3.py','--suite','core','--out',str(out/'b4-core.json')]),
 ('B4lifecycle',[py,'tests/b4/real-mv3.py','--suite','lifecycle','--out',str(out/'b4-lifecycle.json')])]
results=[]
for name,command in commands:
 print(name,'START',flush=True);start=time.time()
 with (out/(name+'.log')).open('w') as log:
  process=subprocess.Popen(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
  try:code=process.wait(timeout=600)
  except subprocess.TimeoutExpired:
   process.send_signal(signal.SIGINT)
   try:process.wait(timeout=30)
   except subprocess.TimeoutExpired:process.kill();process.wait()
   code=124
 results.append({'suite':name,'command':command,'exitCode':code,'elapsed':time.time()-start})
 (out/'batch.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(name,'PASS' if code==0 else 'FAIL',flush=True)
raise SystemExit(1 if any(x['exitCode'] for x in results) else 0)
