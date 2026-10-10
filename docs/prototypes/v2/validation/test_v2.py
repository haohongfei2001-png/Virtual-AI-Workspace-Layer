"""UI/calendar tests for VAIWL v2 fictional HTML. Not a ChatGPT/MV3 test.
Uses in-memory set_content. No file navigation, model, account or network needed.
"""
import json, hashlib, time, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'prototype-v2.html').read_text()
RESULTS=[]
def snap(p): return p.evaluate('window.__v2.snapshot()')
def click(p,s):
    modal=p.locator('#modal')
    if modal.count() and modal.evaluate('(x)=>x.open') and modal.locator(s).filter(visible=True).count():
        modal.locator(s).filter(visible=True).first.click()
    else: p.locator(s).filter(visible=True).first.click()
def close(p):
    if p.locator('#modal').evaluate('(x)=>x.open'): click(p,'[data-action=close]')
def rng(p,v):
    click(p,'[data-action=rangeMenu]');click(p,f'[data-range="{v}"]')
def row(p,c): return next(x for x in snap(p)['chats'] if x['id']==c)
def topic(p,c): return next(x for x in snap(p)['topics'] if x['id']==c)
def detail(p,c):
    p.evaluate('(id)=>detail(id)',c) # setup only, UI clicks tested in main journeys

def initial(p):
    s=snap(p); assert len(s['topics'])==88 and len(s['chats'])==339
    assert len([t for t in s['topics'] if t['status']=='active'])==30
    assert p.locator('#active-cards > article').count()==30
    assert p.locator('#history-cards').count()==0
    assert p.locator('[data-topic=paia] .row').count()==4

def date_example(p):
    for k,expected in [(0,['2026-09-10','2026-10-10']),(1,['2026-08-10','2026-09-09']),(2,['2026-07-10','2026-08-09'])]:
        r=p.evaluate('(k)=>__v2.windowOf("2026-10-10",1,k)',k)
        assert [r['start'],r['end']]==expected

def month_end(p):
    assert p.evaluate('__v2.windowOf("2026-03-31",1,0).start')=='2026-02-28'
    assert p.evaluate('__v2.windowOf("2026-03-31",1,1).start')=='2026-01-31'
    assert p.evaluate('__v2.windowOf("2026-03-31",1,1).end')=='2026-02-27'
    assert p.evaluate('__v2.subMonths("2026-03-31",2)')=='2026-01-31'

def leap(p):
    assert p.evaluate('__v2.windowOf("2024-02-29",12,0).start')=='2023-02-28'
    assert p.evaluate('__v2.windowOf("2024-03-31",1,0).start')=='2024-02-29'

def years(p):
    assert p.evaluate('__v2.windowOf("2026-10-10",3,0).start')=='2026-07-10'
    assert p.evaluate('__v2.windowOf("2026-10-10",3,1).end')=='2026-07-09'
    assert p.evaluate('__v2.windowOf("2026-10-10",12,0).start')=='2025-10-10'
    assert p.evaluate('__v2.windowOf("2026-10-10",12,1).end')=='2025-10-09'

def continuity(p):
    for d in ['2026-10-10','2026-03-31','2024-02-29','2026-01-01']:
      for m in [1,3,12]:
        windows=p.evaluate('([d,m])=>Array.from({length:30},(_,k)=>__v2.windowOf(d,m,k))',[d,m])
        for a,b in zip(windows,windows[1:]): assert a['start']==b['upper']

def timezones(p):
    iso='2026-09-10T02:00:00Z'
    assert p.evaluate('t=>__v2.localDay(t,"America/Chicago")',iso)=='2026-09-09'
    assert p.evaluate('t=>__v2.localDay(t,"Asia/Shanghai")',iso)=='2026-09-10'
    assert p.evaluate('__v2.localDay("2026-11-01T06:30:00Z","America/Chicago")')=='2026-11-01'
    assert p.evaluate('__v2.localDay("2026-11-01T07:30:00Z","America/Chicago")')=='2026-11-01'

def historical_existence(p):
    # c1 has August AND October sends; max(timestamp) alone would lose it in August.
    click(p,'[data-action=prev]'); assert row(p,'c1')['status']=='active'
    assert row(p,'c3')['status']=='outside'

def rejected_signals(p):
    base={'events':[],'complete':True}
    for role,quality,status,kind in [('assistant','verified_fixture','sent','new_send'),('user','verified_fixture','failed','new_send'),('user','verified_fixture','pending','new_send'),('user','verified_fixture','sent','rename'),('user','verified_fixture','sent','visit'),('user','verified_fixture','sent','reclassify')]:
      c={**base,'events':[{'role':role,'quality':quality,'state':status,'kind':kind,'sentAt':'2026-10-10T12:00:00Z'}]}
      assert p.evaluate('c=>__v2.evaluate(c)',c)=='outside'
    assert row(p,'c6')['status']=='outside' # recent assistant event does not activate

def unknown(p):
    for c in [dict(events=[],complete=False),dict(events=[dict(role='user',state='sent',quality='unverified',sentAt='2026-10-01T12:00:00Z')],complete=True),dict(events=[dict(role='user',state='sent',quality='verified_fixture',sentAt='2026-11-01T12:00:00Z')],complete=True),dict(events=[dict(role='user',state='sent',quality='verified_fixture',sentAt='2026-10-01')],complete=True)]:
      assert p.evaluate('c=>__v2.evaluate(c)',c)=='unknown'
    assert topic(p,'u2')['status']=='unknown'
    click(p,'[data-action=unknown]');expect(p.locator('[data-topic=u2]')).to_be_visible()
    expect(p.locator('[data-open=c10]')).to_be_visible()

def active_partial(p):
    c=dict(events=[dict(role='user',state='sent',quality='verified_fixture',sentAt='2026-10-01T12:00:00Z')],complete=False)
    assert p.evaluate('c=>__v2.evaluate(c)',c)=='active'

def range_ui(p):
    before=[(c['id'],c['placements'],c['events'],c['native']) for c in snap(p)['chats']]
    for v in ['3','12','all','1']:
      rng(p,v)
      assert [(c['id'],c['placements'],c['events'],c['native']) for c in snap(p)['chats']]==before
    expect(p.locator('#range-label')).to_have_text('2026-09-10 — 2026-10-10')

def history_ui(p):
    click(p,'[data-action=history]'); assert p.locator('#history-cards > article').count()==55
    click(p,'#history-cards [data-open=h0c0]'); assert snap(p)['state']['current']=='h0c0'
    expect(p.locator('#current')).to_contain_text('区间外')
    click(p,'[data-action=topics]');assert not snap(p)['state']['view']=='chat'
    expect(p.locator('#current [data-open=h0c0]')).to_be_visible()
    assert topic(p,'h0')['status']=='outside'

def many_inside(p):
    click(p,'[data-focus=paia]')
    n=0
    while p.locator('[data-more=paia]').count():
      click(p,'[data-more=paia]');n+=1;assert n<10
    assert p.locator('[data-topic=paia] .row').count()==29
    click(p,'[data-expand="paia:outside"]')
    while p.locator('[data-more="paia:outside"]').count():click(p,'[data-more="paia:outside"]')
    click(p,'[data-expand="paia:unknown"]')
    assert p.locator('[data-topic=paia] .row').count()==60

def sources(p):
    assert {c['project'] for c in snap(p)['chats'] if 'paia' in c['placements']}=={'普通聊天','paia 开发','产品想法'}
    before=[c['project'] for c in snap(p)['chats']];rng(p,3)
    assert [c['project'] for c in snap(p)['chats']]==before

def fold(p):
    click(p,'[data-fold=paia]');expect(p.locator('#body-paia')).to_be_hidden()
    click(p,'[data-fold=paia]');expect(p.locator('#body-paia')).to_be_visible()
    click(p,'[data-action=collapseAll]');assert not p.locator('.topic .row:visible').count()
    click(p,'[data-action=collapseAll]');assert p.locator('.topic .row:visible').count()>0

def pins(p):
    click(p,'[data-action=history]');click(p,'[data-topic-menu=h0]');click(p,'[data-pin-topic=h0]')
    assert topic(p,'h0')['pinned'] and topic(p,'h0')['status']=='outside'
    assert p.locator('[data-topic=h0]').count()==1
    rng(p,3); assert topic(p,'h0')['pinned'];expect(p.locator('[data-topic=h0]')).to_be_visible()

def chatpin(p):
    detail(p,'h0c0');click(p,'[data-pin-chat=h0c0]')
    expect(p.locator('[data-topic=h0]')).to_be_visible()
    assert topic(p,'h0')['status']=='outside'

def preserve_host(p):
    click(p,'[data-open=c3]');p.locator('#composer').fill('历史也可以继续\n不要丢失。')
    p.evaluate('window.editorWitness=document.getElementById("composer");window.turnWitness=document.getElementById("transcript");editorWitness.setSelectionRange(2,5)')
    rng(p,3);click(p,'[data-action=prev]');click(p,'[data-mode=native]')
    assert p.evaluate('editorWitness===document.getElementById("composer") && turnWitness===document.getElementById("transcript")')
    expect(p.locator('#composer')).to_have_value('历史也可以继续\n不要丢失。')
    assert p.evaluate('editorWitness.selectionStart===2 && editorWitness.selectionEnd===5')
    click(p,'[data-mode=derived]');assert snap(p)['state']['current']=='c3'
    expect(p.locator('#current')).to_contain_text('区间外')

def disable_board(p):
    click(p,'[data-mode=native]');expect(p.locator('#toolbar')).to_be_hidden();assert p.locator('[data-topic]').count()==0
    assert p.locator('#board [data-open]').count()==339
    click(p,'[data-mode=derived]');assert p.locator('#active-cards > article').count()==30

def rename(p):
    before=row(p,'c4');detail(p,'c4');click(p,'[data-edit=c4]');p.locator('#titleInput').fill('人工修改 <script>danger</script>');click(p,'[data-save-title=c4]')
    after=row(p,'c4');assert before['native']==after['native'] and before['events']==after['events'];assert snap(p)['stores']['A']['locks']['c4']
    assert p.locator('script:has-text("danger")').count()==0
    click(p,'[data-action=undo]');assert row(p,'c4')['display']==before['display']

def correction(p):
    before=row(p,'c5');detail(p,'c5');click(p,'[data-assign=c5]')
    p.locator('[name=placement][value=paia]').uncheck();p.locator('[name=placement][value=jobs]').check();click(p,'[data-save-placement=c5]')
    after=row(p,'c5');assert after['placements']==['jobs'];assert after['events']==before['events'];assert after['project']==before['project']
    assert 'paia' in snap(p)['stores']['A']['excludes']['c5']
    click(p,'[data-action=undo]');assert row(p,'c5')['placements']==before['placements']

def search(p):
    click(p,'[data-action=search]');p.locator('#searchInput').fill('思想库消费级');assert p.locator('#results [data-open=c6]').count()==0
    p.locator('#searchAll').check();expect(p.locator('#results [data-open=c6]')).to_be_visible()
    click(p,'#results [data-open=c6]');assert row(p,'c6')['status']=='outside';expect(p.locator('#current')).to_contain_text('区间外')

def menus(p):
    click(p,'[data-action=rangeMenu]');p.keyboard.press('End');assert p.locator('[data-range=all]').evaluate('(e)=>e===document.activeElement')
    p.keyboard.press('Home');p.keyboard.press('ArrowDown');p.keyboard.press('Enter');assert snap(p)['state']['months']==3
    click(p,'[data-action=rangeMenu]');p.keyboard.press('Escape');expect(p.locator('#popover')).to_be_hidden();assert p.locator('#range-menu').evaluate('(e)=>e===document.activeElement')

def accounts(p):
    detail(p,'c4');click(p,'[data-edit=c4]');p.locator('#titleInput').fill('PRIVATE_CANARY');click(p,'[data-save-title=c4]')
    click(p,'[data-action=account]');click(p,'[data-action=accountB]')
    assert len(snap(p)['chats'])==1;assert 'PRIVATE_CANARY' not in p.locator('body').inner_text();assert not p.locator('#composer').count()
    click(p,'[data-action=account]');click(p,'[data-action=accountA]');assert row(p,'c4')['display']=='PRIVATE_CANARY'

def imports(p):
    p.evaluate('settings()');click(p,'[data-action=import]');click(p,'[data-action=confirmImport]');assert len(snap(p)['chats'])==341
    assert row(p,'c11')['status']=='unknown';p.evaluate('settings()');click(p,'[data-action=import]');assert not p.locator('[data-action=confirmImport]').count()

def write_gate(p):
    detail(p,'c4');click(p,'[data-rename=c4]');expect(p.locator('#execute')).to_be_disabled();p.locator('#consent').check();click(p,'#execute');assert snap(p)['stores']['A']['audit'][-1]['status']=='VERIFIED_SIMULATION'
    assert row(p,'c4')['status']=='active'

def write_conflict(p):
    detail(p,'c4');click(p,'[data-rename=c4]');click(p,'[data-action=conflict]');p.locator('#consent').check();click(p,'#execute')
    expect(p.locator('#writeError')).to_contain_text('不会覆盖');assert snap(p)['stores']['A']['audit'][-1]['status']=='CONFLICT'

def failure(p):
    click(p,'[data-open=c3]');p.locator('#composer').fill('故障不丢失');p.evaluate('window.w=document.getElementById("composer");settings()');click(p,'[data-action=fault]');assert snap(p)['state']['mode']=='native';assert p.evaluate('w===document.getElementById("composer")')
    click(p,'[data-action=recover]');expect(p.locator('#composer')).to_have_value('故障不丢失')

def clock_ui(p):
    click(p,'[data-action=clock]');p.locator('#today').fill('2026-03-31');p.locator('#zone').select_option('Asia/Shanghai');click(p,'[data-action=saveClock]')
    expect(p.locator('#range-label')).to_contain_text('2026-02-28 — 2026-03-31')
    click(p,'[data-action=prev]');expect(p.locator('#range-label')).to_contain_text('2026-01-31 — 2026-02-27')

def allhistory(p):
    rng(p,'all');assert p.locator('#active-cards > article').count()==88
    assert p.locator('[data-action=prev]').is_disabled();assert p.locator('[data-action=next]').is_disabled()
    assert all(c['status']=='all' for c in snap(p)['chats'])

def dark(p):
    click(p,'.top [data-action=settings]');click(p,'[data-action=theme]');assert p.locator('html').get_attribute('data-theme')=='dark'
    click(p,'[data-open=c3]');p.screenshot(path=str(ROOT/'validation/chat-dark.png'))

def narrow(p):
    p.set_viewport_size({'width':390,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
    click(p,'[data-open=c3]');expect(p.locator('#composer')).to_be_visible();assert p.evaluate('document.documentElement.scrollWidth<=innerWidth');p.screenshot(path=str(ROOT/'validation/chat-narrow.png'))

def screenshots(p):
    p.screenshot(path=str(ROOT/'validation/topics-desktop.png'))
    click(p,'[data-focus=paia]');click(p,'[data-expand="paia:outside"]');p.screenshot(path=str(ROOT/'validation/paia-expanded.png'))
    click(p,'[data-open=c6]');p.screenshot(path=str(ROOT/'validation/history-chat.png'))
    click(p,'[data-mode=native]');p.screenshot(path=str(ROOT/'validation/native-restored.png'))

def workset(p):
    click(p,'[data-open=c3]');p.evaluate('settings()');click(p,'[data-action=saveSession]');rng(p,12);click(p,'[data-action=prev]');click(p,'[data-action=workset]');assert p.locator('#board .row').count()==3
    p.evaluate('settings()');click(p,'[data-action=restore]');assert len(snap(p)['stores']['A']['tabs'])==3

def reduced_motion(p):
    p.emulate_media(reduced_motion='reduce');click(p,'[data-fold=paia]');click(p,'[data-fold=paia]');expect(p.locator('#body-paia')).to_be_visible()

def browser_zoom_equivalent(p):
    # 200% effective CSS width only: not a full physical browser zoom/IME certificate.
    p.set_viewport_size({'width':720,'height':500});click(p,'[data-open=c3]');assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')

TESTS=[(n,f) for n,f in list(globals().items()) if n in ['initial','date_example','month_end','leap','years','continuity','timezones','historical_existence','rejected_signals','unknown','active_partial','range_ui','history_ui','many_inside','sources','fold','pins','chatpin','preserve_host','disable_board','rename','correction','search','menus','accounts','imports','write_gate','write_conflict','failure','clock_ui','allhistory','dark','narrow','screenshots','workset','reduced_motion','browser_zoom_equivalent']]
if __name__=='__main__':
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for name,fn in TESTS:
   if os.environ.get('ONLY') and name not in os.environ['ONLY'].split(','):continue
   ctx=browser.new_context(viewport={'width':1440,'height':1000});p=ctx.new_page();errors=[];requests=[]
   p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));p.set_default_timeout(3500)
   started=time.time()
   try:
    p.set_content(HTML,wait_until='domcontentloaded');fn(p)
    assert not errors,errors;assert not requests,requests
    r={'name':name,'status':'PASS','page_errors':errors,'page_requests':requests}
   except Exception as e:
    r={'name':name,'status':'FAIL','error':str(e),'page_errors':errors,'page_requests':requests};p.screenshot(path=str(ROOT/f'validation/failed-{name}.png'))
   r['seconds']=round(time.time()-started,3);RESULTS.append(r);print(name,r['status'],r.get('error','')[:180],flush=True);ctx.close()
  version=browser.version;browser.close()
 report={'prototype_sha256':hashlib.sha256((ROOT/'prototype-v2.html').read_bytes()).hexdigest(),'browser':version,'evidence':'PROTOTYPE_SIMULATION','method':'in-memory page.set_content','tests':RESULTS,'passed':sum(r['status']=='PASS' for r in RESULTS),'failed':sum(r['status']=='FAIL' for r in RESULTS)}
 (ROOT/'validation/test-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('RESULT',report['passed'],report['failed'])
