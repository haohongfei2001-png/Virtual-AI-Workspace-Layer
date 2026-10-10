"""v2.1 incremental simulation regression. No real ChatGPT or extension API.
Run: python docs/prototypes/v2/validation/test_v21.py
Needs Playwright and Chromium; CHROMIUM_PATH may override the local executable.
The unmodified v2 script supplies retained date/identity/edit tests, not old time semantics.
"""
import json,hashlib,time,os,importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'prototype-v2.1.html').read_text()
sp=importlib.util.spec_from_file_location('previous',Path(__file__).with_name('test_v2.py'))
old=importlib.util.module_from_spec(sp);sp.loader.exec_module(old)
snap,click,close,detail,row,topic=old.snap,old.click,old.close,old.detail,old.row,old.topic

def current_ids(p):return p.locator('#active-cards > article').evaluate_all('(a)=>a.map(x=>x.dataset.topic)')
def select_range(p,v):
    click(p,'[data-action=boardMenu]');click(p,f'[data-range="{v}"]')
def focus_topic(p,t):
    click(p,f'[data-topic-menu="{t}"]');click(p,f'#popover [data-focus="{t}"]')
def initial(p):
    s=snap(p);assert len(s['topics'])==91 and len(s['chats'])==345
    assert len(current_ids(p))==30
    assert p.locator('[data-topic=paia] .row').count()==4
    assert p.locator('[data-topic=previous-theme]').count()==0

def quiet_chrome(p):
    for sel in ['.count','.rowtime','.topicsource','.meta','.dates','#range-label','#host-source','[data-action=clock]']:
        assert p.locator(sel).count()==0,sel
    txt=p.locator('body').inner_text()
    for value in ['个主题','条对话','原生来源','区间内','覆盖不完整','2026-','America/','Asia/','普通聊天','paia 开发','产品想法']:
        assert value not in txt,value
    assert '第三方扩展' in txt
    assert p.locator('#toolbar').is_hidden()

def topic_exclusivity(p):
    seen=set()
    for k in range(20):
        p.evaluate('(k)=>{state.offset=k;state.view=k?"history":"topics";render()}',k)
        ids=set(current_ids(p));assert not ids&seen,(k,ids&seen);seen|=ids
    assert len(seen)==87 # 91 themes minus four unknown; all dated fixtures within 20 months

def paia_not_in_previous(p):
    assert 'paia' in current_ids(p)
    click(p,'[data-action=history]')
    assert snap(p)['state']['offset']==1
    assert current_ids(p)==['previous-theme']
    assert p.locator('[data-topic=paia]').count()==0
    # c1 contains an August event but neither c1 nor its parent reappears.
    assert p.locator('#board [data-open=c1]').count()==0
    assert row(p,'c1')['bucket']==0

def earlier_segments(p):
    click(p,'[data-action=history]');assert current_ids(p)==['previous-theme']
    click(p,'[data-action=prev]');assert current_ids(p)==['older-theme']
    click(p,'[data-action=next]');assert current_ids(p)==['previous-theme']
    click(p,'[data-action=latest]');assert 'paia' in current_ids(p)

def no_child_escape(p):
    initial_members={c['id'] for c in snap(p)['chats'] if 'paia' in c['placements']}
    focus_topic(p,'paia')
    while p.locator('[data-more=paia]').count():click(p,'[data-more=paia]')
    assert p.locator('[data-topic=paia] .row').count()==29
    assert p.locator('[data-open=c6]').count()==0
    click(p,'[data-expand="paia:older"]')
    while p.locator('[data-more="paia:older"]').count():click(p,'[data-more="paia:older"]')
    click(p,'[data-expand="paia:unknown"]')
    shown=set(p.locator('[data-topic=paia] .row').evaluate_all('(a)=>a.map(x=>x.dataset.drag)'))
    assert shown==initial_members and len(shown)==60
    assert p.locator('[data-topic=paia] .count,.rowtime,.meta,.topicsource').count()==0

def previous_parent_children(p):
    click(p,'[data-action=history]')
    expect(p.locator('[data-topic=previous-theme] [data-open=previous-new]')).to_be_visible()
    assert p.locator('#board [data-open=previous-old]').count()==0
    click(p,'[data-expand="previous-theme:older"]')
    expect(p.locator('[data-topic=previous-theme] [data-open=previous-old]')).to_be_visible()
    assert p.locator('[data-topic]').count()==1

def old_chat_kept(p):
    focus_topic(p,'paia');click(p,'[data-expand="paia:older"]');click(p,'#board [data-open=c6]')
    assert snap(p)['state']['current']=='c6' and topic(p,'paia')['bucket']==0
    expect(p.locator('#composer')).to_be_visible()
    assert p.locator('#host-source').count()==0
    click(p,'[data-action=topics]');expect(p.locator('#current [data-open=c6]')).to_be_visible()
    click(p,'[data-action=history]');assert 'paia' not in current_ids(p)
    expect(p.locator('#current [data-open=c6]')).to_be_visible()

def topic_pin_not_promotion(p):
    click(p,'[data-action=history]');click(p,'[data-topic-menu=previous-theme]');click(p,'[data-pin-topic=previous-theme]')
    assert topic(p,'previous-theme')['bucket']==1
    click(p,'[data-action=topics]')
    assert 'previous-theme' not in current_ids(p)
    expect(p.locator('#sidebar [data-focus=previous-theme]')).to_be_visible()
    click(p,'#sidebar [data-focus=previous-theme]');assert p.locator('#board [data-topic]').count()==1
    assert topic(p,'previous-theme')['bucket']==1

def child_pin_not_promotion(p):
    detail(p,'previous-old');click(p,'[data-pin-chat=previous-old]')
    assert 'previous-theme' not in current_ids(p)
    expect(p.locator('#sidebar [data-open=previous-old]')).to_be_visible()
    assert topic(p,'previous-theme')['bucket']==1
    click(p,'#sidebar [data-open=previous-old]');assert topic(p,'previous-theme')['bucket']==1

def unknown_no_false_history(p):
    assert topic(p,'uncertain-theme')['bucket'] is None
    click(p,'[data-action=history]');assert 'uncertain-theme' not in current_ids(p)
    click(p,'[data-action=unknown]');expect(p.locator('[data-topic=uncertain-theme]')).to_be_visible()
    assert p.locator('#unknown-cards > article').count()==4

def incomplete_latest(p):
    actual=p.evaluate('''()=>{
      const a={events:[event('2026-10-01')],complete:false};
      const b={events:[event('2026-08-01')],complete:false};
      const c={events:[event('2026-08-01')],complete:true,completeThrough:'2026-09-01'};
      return [conversationBucket(a),conversationBucket(b),conversationBucket(c)]
    }''')
    assert actual==[0,None,None]

def malformed_time(p):
    assert p.evaluate('''()=>["2026-09-10","2026-11-01T12:00:00Z","not-a-date","2026-02-30T12:00:00Z"].map(t=>conversationBucket({events:[event('2026-09-01',{sentAt:t})],complete:true}))''')==[None]*4

def non_send_no_move(p):
    before=[(t['id'],t['bucket']) for t in snap(p)['topics']]
    p.evaluate('''()=>{const c=chat('previous-new');for(const kind of ['visit','rename','pin','reclassify','import','edit']) c.events.push(event('2026-10-10',{kind}));c.events.push(event('2026-10-10',{role:'assistant'}));render()}''')
    assert [(t['id'],t['bucket']) for t in snap(p)['topics']]==before

def send_moves_whole_topic(p):
    old_ids={c['id'] for c in snap(p)['chats'] if 'previous-theme' in c['placements']}
    p.evaluate("chat('previous-new').events.push(event('2026-10-10',{id:'synthetic-new-confirmed'}));render()")
    assert topic(p,'previous-theme')['bucket']==0
    assert 'previous-theme' in current_ids(p)
    click(p,'[data-action=history]');assert 'previous-theme' not in current_ids(p)
    assert {c['id'] for c in snap(p)['chats'] if 'previous-theme' in c['placements']}==old_ids
    click(p,'[data-action=topics]');click(p,'[data-expand="previous-theme:older"]')
    expect(p.locator('[data-topic=previous-theme] [data-open=previous-old]')).to_be_visible()

def range_no_source_writes(p):
    before=[(c['id'],c['placements'],c['events'],c['native'],c['project']) for c in snap(p)['chats']]
    for v in ['3','12','all','1']:
        select_range(p,v)
        assert [(c['id'],c['placements'],c['events'],c['native'],c['project']) for c in snap(p)['chats']]==before

def all_once(p):
    select_range(p,'all');ids=current_ids(p)
    assert len(ids)==len(set(ids))==91
    assert p.locator('[data-action=prev],[data-action=next],[data-action=history]').count()==0

def three_month_unique(p):
    select_range(p,3);assert 'previous-theme' in current_ids(p) and 'older-theme' in current_ids(p)
    first=set(current_ids(p));click(p,'[data-action=history]');assert not set(current_ids(p))&first

def preserved_host(p):
    click(p,'[data-open=c3]');p.locator('#composer').fill('保留当前输入\n以及选区。')
    p.evaluate('window.ed=document.getElementById("composer");window.tr=document.getElementById("transcript");ed.setSelectionRange(2,5)')
    click(p,'[data-mode=native]');click(p,'[data-mode=derived]')
    assert p.evaluate('ed===document.getElementById("composer")&&tr===document.getElementById("transcript")&&ed.selectionStart===2&&ed.selectionEnd===5')
    click(p,'[data-action=topics]');click(p,'[data-action=history]');click(p,'#current [data-open=c3]')
    assert p.evaluate('ed===document.getElementById("composer")&&tr===document.getElementById("transcript")')
    expect(p.locator('#composer')).to_have_value('保留当前输入\n以及选区。')

def native_unfiltered(p):
    before=[(c['id'],c['native'],c['project']) for c in snap(p)['chats']]
    click(p,'[data-action=history]');click(p,'[data-mode=native]')
    assert p.locator('#board [data-open]').count()==345
    assert p.locator('[data-topic]').count()==0
    assert [(c['id'],c['native'],c['project']) for c in snap(p)['chats']]==before

def source_kept_not_displayed(p):
    assert {c['project'] for c in snap(p)['chats'] if 'paia' in c['placements']}=={'普通聊天','paia 开发','产品想法'}
    focus_topic(p,'paia');assert '原生来源' not in p.locator('#board').inner_text()
    click(p,'#board [data-open=c3]');assert 'paia 开发' not in p.locator('#host').inner_text()

def search_old(p):
    click(p,'[data-action=search]');p.locator('#searchInput').fill('思想库消费级');assert not p.locator('#results [data-open=c6]').count()
    p.locator('#searchAll').check();click(p,'#results [data-open=c6]')
    assert snap(p)['state']['current']=='c6';assert topic(p,'paia')['bucket']==0

def menu_keyboard(p):
    click(p,'[data-action=boardMenu]');p.keyboard.press('End');assert p.locator('[data-range=all]').evaluate('(e)=>e===document.activeElement')
    p.keyboard.press('Escape');expect(p.locator('#popover')).to_be_hidden()
    assert p.locator('[data-action=boardMenu]').evaluate('(e)=>e===document.activeElement')

def updated_clock(p):
    click(p,'.top [data-action=settings]');click(p,'[data-action=clock]');p.locator('#today').fill('2026-11-30');click(p,'[data-action=saveClock]')
    # The old fixture certifies through Oct 10 only; no invented "inactive in November".
    assert topic(p,'paia')['bucket'] is None
    assert p.locator('[data-action=clock],#range-label').count()==0

def rendering(p):
    p.screenshot(path=str(ROOT/'validation/v21-current.png'))
    focus_topic(p,'paia');click(p,'[data-expand="paia:older"]');p.screenshot(path=str(ROOT/'validation/v21-paia.png'))
    click(p,'[data-action=topics]');click(p,'[data-action=history]');p.screenshot(path=str(ROOT/'validation/v21-previous.png'))
    click(p,'[data-mode=native]');p.screenshot(path=str(ROOT/'validation/v21-native.png'))

def dark_narrow(p):
    click(p,'.top [data-action=settings]');click(p,'[data-action=theme]');assert p.locator('html').get_attribute('data-theme')=='dark'
    p.set_viewport_size({'width':390,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
    p.screenshot(path=str(ROOT/'validation/v21-dark-narrow.png'))
    click(p,'[data-open=c3]');expect(p.locator('#composer')).to_be_visible()
    assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')

RETAIN=['date_example','month_end','leap','years','continuity','timezones','rename','correction','accounts','write_gate','write_conflict','failure','reduced_motion','browser_zoom_equivalent']
TESTS=[('retained_'+n,getattr(old,n)) for n in RETAIN]+[(f.__name__,f) for f in [initial,quiet_chrome,topic_exclusivity,paia_not_in_previous,earlier_segments,no_child_escape,previous_parent_children,old_chat_kept,topic_pin_not_promotion,child_pin_not_promotion,unknown_no_false_history,incomplete_latest,malformed_time,non_send_no_move,send_moves_whole_topic,range_no_source_writes,all_once,three_month_unique,preserved_host,native_unfiltered,source_kept_not_displayed,search_old,menu_keyboard,updated_clock,rendering,dark_narrow]]
if __name__=='__main__':
 results=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for name,fn in TESTS:
   ctx=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Tokyo');p=ctx.new_page();errors=[];requests=[]
   p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));p.set_default_timeout(2500)
   started=time.time()
   try:
    p.set_content(HTML,wait_until='domcontentloaded');fn(p);assert not errors,errors;assert not requests,requests
    r={'name':name,'status':'PASS'}
   except Exception as e:
    r={'name':name,'status':'FAIL','error':repr(e)};p.screenshot(path=str(ROOT/f'validation/v21-failed-{name}.png'))
   r.update(seconds=round(time.time()-started,3),page_errors=errors,page_requests=requests);results.append(r);print(name,r['status'],r.get('error',''),flush=True);ctx.close()
  version=browser.version;browser.close()
 report={'prototype_sha256':hashlib.sha256((ROOT/'prototype-v2.1.html').read_bytes()).hexdigest(),'browser':version,'evidence':'PROTOTYPE_SIMULATION','method':'page.set_content, fixed synthetic date; no real ChatGPT','tests':results,'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results)}
 (ROOT/'validation/test-results-v21.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print('RESULT',report['passed'],report['failed'])
 raise SystemExit(1 if report['failed'] else 0)
