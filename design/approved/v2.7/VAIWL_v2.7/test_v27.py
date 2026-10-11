"""Self-contained synthetic-only v2.7 interaction regression.
python test_v27.py --html prototype-v2.7.html --output validation
Requires Playwright and Chromium. Never opens ChatGPT or calls a model.
"""
from pathlib import Path
import argparse,hashlib,json,os,time,sys
from playwright.sync_api import sync_playwright,expect
P=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--html',type=Path,default=P/'prototype-v2.7.html');ap.add_argument('--output',type=Path,default=P/'validation');args=ap.parse_args()
OUT=args.output;OUT.mkdir(parents=True,exist_ok=True);HTML=args.html.read_text();CASES=[]
def case(fn):CASES.append(fn);return fn
def click(p,sel):
 # Never click through a dialog or a closed drawer.
 if p.locator('#modal').is_visible():
  for a in p.locator('#modal').locator(sel).all():
   if a.is_visible():a.click();return
 for a in p.locator(sel).all():
  if a.is_visible():a.click();return
 raise AssertionError('no visible target: '+sel)
def snap(p):return p.evaluate('__v24.snapshot()')
def debug(p):return p.evaluate('__v24.debug()')
def scene(p,k):p.evaluate('(k)=>setScenario(k)',k)
def ids(p,root='#active-cards'):return p.locator(root+' [data-topic]').evaluate_all('(es)=>es.map(e=>e.dataset.topic)')
def sidenames(p):return p.locator('#nav-scroll [data-side-topic]').evaluate_all('(es)=>es.map(e=>e.dataset.sideTopic)')
def side_open(p,k):return p.locator(f'#sidebar [data-nav-topic="{k}"]').get_attribute('aria-expanded')=='true'
def source(p):return p.evaluate('JSON.stringify(all().map(c=>({id:c.id,raw:c.raw,project:c.project,events:c.events,placements:members(c.id)})))')
def first(p):click(p,'#board [data-open=daily-t0-c0]')


# Applicable prior assertions retained; only changed control selectors updated.

@case
def distinct_monochrome_consistent_icons(p):
 v=p.locator('#board .topic-symbol').evaluate_all('(es)=>es.map(e=>({icon:e.dataset.icon,color:getComputedStyle(e.querySelector("svg")).color,size:e.querySelector("svg").getBoundingClientRect().width}))')
 assert len({x['icon'] for x in v})==6 and len({x['color'] for x in v})==len({x['size'] for x in v})==1
 for tid in ids(p):assert p.locator(f'#board [data-topic="{tid}"] .topic-symbol').get_attribute('data-icon')==p.locator(f'#sidebar [data-side-topic="{tid}"] .side-glyph').get_attribute('data-icon')


@case
def icon_edit_undo_and_facts(p):
 before=source(p);click(p,'#board [data-topic-menu=daily-t0]');click(p,'[data-pick-icon=daily-t0]');click(p,'[data-icon-topic=daily-t0][data-icon-value=code]')
 assert p.locator('#board [data-topic=daily-t0] .topic-symbol').get_attribute('data-icon')=='code'
 assert p.locator('#sidebar [data-side-topic=daily-t0] .side-glyph').get_attribute('data-icon')=='code';assert source(p)==before
 click(p,'[data-action=undo]');assert p.locator('#board [data-topic=daily-t0] .topic-symbol').get_attribute('data-icon')=='collection'


@case
def icon_stability_on_rename(p):
 p.evaluate("ws('daily-t0').name='写作也不改变既有图标';render()")
 assert p.locator('#board [data-topic=daily-t0] .topic-symbol').get_attribute('data-icon')=='collection'


@case
def no_empty_expansion(p):
 p.evaluate("state.account='B';render()");assert p.locator('#board [data-board-all]').count()==0


@case
def initial_side_only_recent_heads(p):
 assert sidenames(p)==['daily-t'+str(i) for i in range(6)]
 assert p.locator('#sidebar .side-children:visible').count()==0


@case
def auto_context_switch_vs_manual_expansion(p):
 first(p);p.evaluate("openChat('daily-t1-c0','daily-t1')");assert sidenames(p)[0]=='daily-t1' and not side_open(p,'daily-t0')
 click(p,'#sidebar [data-nav-topic=daily-t2]');p.evaluate("openChat('daily-t0-c0','daily-t0')");assert side_open(p,'daily-t2') and side_open(p,'daily-t0')


@case
def manual_collapse_survives_rerender(p):
 first(p);click(p,'#sidebar [data-nav-topic=daily-t0]');p.evaluate('render()');assert not side_open(p,'daily-t0')
 expect(p.locator('#composer')).to_be_visible()


@case
def sidebar_disclosure_does_not_navigate(p):
 first(p);p.locator('#composer').fill('保留未发送的合成文字');before=source(p);click(p,'#sidebar [data-nav-topic=daily-t2]')
 assert snap(p)['state']['current']=='daily-t0-c0' and p.locator('#composer').input_value()=='保留未发送的合成文字' and source(p)==before


@case
def old_child_retains_current_parent(p):
 before=source(p);first(p);click(p,'#sidebar [data-nav-all=daily-t0]');click(p,'#sidebar [data-open=daily-t0-old0]')
 assert sidenames(p)[0]=='daily-t0' and p.locator('#sidebar [data-open=daily-t0-old0]').get_attribute('aria-current')=='page' and source(p)==before


@case
def desktop_sidebar_choice_retained(p):
 click(p,'#sidebar [data-action=nav]');first(p);expect(p.locator('#sidebar')).to_be_hidden();expect(p.locator('#navrail')).to_be_visible()
 click(p,'#navrail [data-action=nav]');assert p.locator('#sidebar').is_visible()
 click(p,'#sidebar [data-open=daily-t0-c1]');assert p.locator('#sidebar').is_visible()


@case
def narrow_user_can_keep_drawer(p):
 p.set_viewport_size({'width':390,'height':844});p.evaluate("narrowCloseOnSelect=false;render()")
 click(p,'#navrail [data-action=nav]');click(p,'#sidebar [data-nav-topic=daily-t0]');click(p,'#sidebar [data-open=daily-t0-c0]')
 assert snap(p)['state']['nav'] and p.locator('#sidebar').is_visible();click(p,'#nav-backdrop');expect(p.locator('#sidebar')).to_be_hidden()


@case
def narrow_default_closes_overlay_only(p):
 p.set_viewport_size({'width':390,'height':844});click(p,'#navrail [data-action=nav]');click(p,'#sidebar [data-nav-topic=daily-t0]');click(p,'#sidebar [data-open=daily-t0-c0]')
 assert not snap(p)['state']['nav'];expect(p.locator('#composer')).to_be_visible()


@case
def native_mode_same_editor_and_selection(p):
 first(p);p.locator('#composer').fill('只在模拟输入框保存');p.evaluate('window.editor=document.getElementById("composer");window.transcript=document.getElementById("transcript");editor.setSelectionRange(2,5)')
 click(p,'#sidebar [data-mode=native]');assert p.locator('#sidebar [data-side-topic]').count()==0
 click(p,'#sidebar [data-mode=derived]');assert p.evaluate('editor===document.getElementById("composer")&&transcript===document.getElementById("transcript")&&editor.selectionStart===2&&editor.selectionEnd===5')


@case
def multiparent_follows_clicked_reference(p):
 p.evaluate("db().placements['daily-t0-c0']=['daily-t0','daily-t1'];render()")
 click(p,'#board [data-topic=daily-t1] [data-open=daily-t0-c0]')
 assert debug(p)['accessTopic']=='daily-t1' and sidenames(p)[0]=='daily-t1'
 assert next(c for c in snap(p)['chats'] if c['id']=='daily-t0-c0')['placements']==['daily-t0','daily-t1']


@case
def ambiguous_global_reference_no_false_parent(p):
 p.evaluate("db().placements['daily-t0-c0']=['daily-t0','daily-t1'];openChat('daily-t0-c0')")
 assert debug(p)['accessTopic'] is None and p.locator('#composer').is_visible()


@case
def unknown_coverage_not_false_history(p):
 scene(p,'stress');s=snap(p);assert next(t for t in s['topics'] if t['id']=='uncertain-theme')['bucket'] is None
 assert next(c for c in s['chats'] if c['id']=='c10')['bucket'] is None


@case
def twenty_time_partitions_disjoint(p):
 scene(p,'stress');got=p.evaluate('''()=>{const out=[];for(let i=0;i<20;i++){state.offset=i;out.push(currentBucketTopics().map(t=>t.id))}return out}''')
 flat=[x for a in got for x in a];assert len(flat)==len(set(flat)) and 'paia' in got[0] and all('paia' not in x for x in got[1:])


@case
def only_new_user_send_reactivates(p):
 scene(p,'stress');r=p.evaluate('''()=>{const c=chat('previous-new'),a=topicBucket('previous-theme');c.events.push(event('2026-10-10',{role:'assistant'}));c.events.push(event('2026-10-10',{kind:'edit'}));const b=topicBucket('previous-theme');c.events.push(event('2026-10-10',{id:'new-test-event'}));return [a,b,topicBucket('previous-theme'),childClass(chat('previous-old'),'previous-theme')]}''');assert r==[1,1,0,'older']


@case
def title_lock_alias_and_exclusion(p):
 click(p,'#board [data-detail=daily-t0-c0]');click(p,'[data-edit=daily-t0-c0]');p.locator('#titleInput').fill('我的固定名称');click(p,'[data-save-title=daily-t0-c0]')
 s=snap(p);assert s['stores']['A']['locks']['daily-t0-c0'] and 'PAIA 开发 1.0' in s['stores']['A']['aliases']['daily-t0-c0']
 p.evaluate("db().placements['daily-t0-c0']=['daily-t1'];db().excludes['daily-t0-c0']=['daily-t0'];render()")
 assert p.locator('#board [data-topic=daily-t0] [data-open=daily-t0-c0]').count()==0


@case
def account_switch_clears_context(p):
 first(p);p.evaluate("db().titles['daily-t0-c0']='A私有示例';render()")
 click(p,'#sidebar [data-action=settings]');click(p,'[data-action=account]');click(p,'[data-action=accountB]')
 assert debug(p)['accessTopic'] is None and 'A私有示例' not in p.locator('body').inner_text() and sidenames(p)==['team']


@case
def native_write_separate_consent_conflict(p):
 click(p,'#board [data-detail=daily-t0-c0]');click(p,'[data-rename=daily-t0-c0]');expect(p.locator('#execute')).to_be_disabled()
 click(p,'[data-action=conflict]');p.locator('#consent').check();click(p,'#execute');assert '未执行' in p.locator('#writeError').inner_text()
 assert snap(p)['stores']['A']['audit'][-1]['status']=='CONFLICT'


@case
def old_pin_not_active(p):
 p.evaluate("db().pins=['daily-h0'];render()");assert 'daily-h0' not in sidenames(p) and 'daily-h0' not in ids(p)
 click(p,'#sidebar [data-action=fixedShortcuts]');assert p.locator('#modal [data-focus=daily-h0]').count()==1


@case
def keyboard_and_aria(p):
 for b in p.locator('#sidebar [data-nav-topic]').all():assert p.locator('#'+b.get_attribute('aria-controls')).count()==1
 p.locator('#sidebar [data-nav-topic=daily-t0]').focus();p.keyboard.press('Enter');assert side_open(p,'daily-t0')
 assert p.locator('#sidebar [data-nav-topic=daily-t0]').evaluate('(e)=>e===document.activeElement')
 p.keyboard.press('Tab');p.keyboard.press('Enter');assert snap(p)['state']['view']=='chat'


@case
def multiple_widths_no_overflow(p):
 for w in [2048,1440,1100,800,640,390]:
  p.set_viewport_size({'width':w,'height':844});p.wait_for_timeout(40);assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),w
  assert len(ids(p))==6


def close(p):
 if p.locator('#modal').is_visible():click(p,'#modal [data-action=close]')


def native_more(p):click(p,'#sidebar [data-native-action=more]')


@case
def native_new_and_search_not_replaced_by_local_search(p):
 click(p,'#sidebar [data-native-action=new]');assert p.locator('#destination').count()==0 and '原生' in p.locator('#modal-title').inner_text();close(p)
 click(p,'#sidebar [data-native-action=search]');assert p.locator('#nativeSearchInput').is_visible() and not p.locator('#searchInput').count()
 p.locator('#nativeSearchInput').fill('仅原生');assert p.locator('[data-native-result=native-only-history]').is_visible()
 p.locator('#nativeSearchInput').fill('项目研究笔记');assert p.locator('[data-native-result=native-only-file]').is_visible()


@case
def separate_derived_search_keeps_unknown_access(p):
 click(p,'#sidebar [data-action=boardMenu]');click(p,'[data-find-topic=__global__]')
 assert p.locator('#modal-title').inner_text()=='查找主题与派生名称'
 p.locator('#searchInput').fill('待续');assert p.locator('#results [data-open=daily-t0-unknown]').is_visible()
 click(p,'#results [data-open=daily-t0-unknown]');assert p.locator('#sidebar [data-open=daily-t0-unknown]').is_visible()


@case
def keyboard_search_routes_are_distinct(p):
 p.keyboard.press('Control+k');assert p.locator('#nativeSearchInput').is_visible();close(p)
 p.keyboard.press('Alt+k');assert p.locator('#searchInput').is_visible() and p.locator('#nativeSearchInput').count()==0


@case
def retained_mock_native_nodes_survive_projection(p):
 first(p);p.evaluate('window.savedNative=[...document.querySelectorAll("#native-primary button,#native-account-slot button")];window.ed=document.getElementById("composer");window.tr=document.getElementById("transcript")')
 p.evaluate("db().titles['daily-t0-c0']='只改派生名';render();setRange(3);state.mode='native';render();state.mode='derived';render()")
 assert p.evaluate('savedNative.every(e=>e.isConnected)&&ed===document.getElementById("composer")&&tr===document.getElementById("transcript")')
 assert '只改派生名' not in p.locator('#host').inner_text()


@case
def native_entries_one_level_and_identity_retained(p):
 p.evaluate('window.nodesBefore=new Map([...document.querySelectorAll("[data-native-feature]")].map(e=>[e.dataset.nativeFeature,e]))')
 assert p.locator('#native-direct [data-native-feature=projects]').is_visible() and p.locator('#native-direct [data-native-feature=library]').is_visible()
 assert not p.locator('#sidebar [data-native-feature=images]').is_visible();native_more(p)
 assert set(p.locator('#sidebar [data-native-feature]:visible').evaluate_all('(es)=>es.map(e=>e.dataset.nativeFeature)'))=={'projects','library','images','gpts','plugins','work','codex','tasks'}
 native_more(p);p.evaluate('showPeriod(1)')
 assert p.evaluate('[...nodesBefore].every(([k,e])=>e===document.querySelector(`#sidebar [data-native-feature="${k}"]`))')


@case
def native_pins_do_not_follow_time_filters(p):
 native_more(p);click(p,'#sidebar [data-native-pin=images]');assert p.locator('#native-direct [data-native-feature=images]').is_visible()
 p.evaluate('showPeriod(2)');assert p.locator('#native-direct [data-native-feature=images]').is_visible()
 assert p.locator('#native-direct [data-native-feature=library]').is_visible()
 click(p,'#sidebar [data-native-pin=images]');assert p.locator('#native-more-items [data-native-feature=images]').count()==1


@case
def native_availability_and_new_unknown_entry(p):
 p.evaluate("__v26.setNativeFeature('images',{available:false});__v26.setNativeFeature('new-version-feature',{name:'新版原生功能'})")
 assert p.locator('#sidebar [data-native-feature=images]').count()==0 and p.locator('#native-direct [data-native-feature=new-version-feature]').is_visible()
 p.evaluate("__v26.setNativeFeature('library',{name:'Space'})")
 assert p.locator('#sidebar [data-native-feature=library]').inner_text().strip()=='Space'
 assert p.locator('#sidebar .native-name').all_inner_texts().count('Space')==1


@case
def attention_not_hidden_by_recency_or_fold(p):
 p.evaluate("__v26.setNativeFeature('tasks',{attention:true});showPeriod(12)")
 t=p.locator('#native-urgent [data-native-feature=tasks]');assert t.is_visible() and '待处理' in t.inner_text() and t.bounding_box()['y']<260
 click(p,'#sidebar [data-action=nav]');assert '待处理' in p.locator('#navrail [data-native-action=features]').get_attribute('aria-label')


@case
def dot_is_unchanged_placeholder_not_topic_icon(p):
 d=p.locator('#native-primary [data-native-action=dot]');p.evaluate('window.dotNode=document.querySelector("#native-primary [data-native-action=dot]")')
 p.evaluate("db().topicIcons['daily-t0']='pen';render();showPeriod(4)")
 assert p.evaluate('dotNode===document.querySelector("#native-primary [data-native-action=dot]")') and d.locator('[data-avatar-status=placeholder]').count()==1
 click(p,'#native-primary [data-native-action=dot]');assert '头像与名称' in p.locator('#modal').inner_text();close(p)
 p.evaluate('__v24.setDotAvailable(false)');assert p.locator('#native-primary [data-native-action=dot]').is_hidden()


@case
def native_account_separate_from_extension_settings(p):
 click(p,'#native-account-slot [data-native-action=account]');labels=p.locator('#modal [data-native-subaction]').all_inner_texts()
 assert all(x in labels for x in ['设置','个性化与记忆','数据控制','归档聊天','订阅与用量','切换账户','帮助']) and 'VAIWL 设置' not in labels
 close(p);click(p,'#sidebar [data-action=settings]');assert '原型设置' in p.locator('#modal-title').inner_text()


@case
def host_tool_and_action_menus_remain_separate(p):
 first(p);before=source(p);click(p,'#host [data-native-action=tools]')
 assert set(p.locator('#modal [data-native-subaction]').all_inner_texts())>={'添加文件','Canvas','深度研究','连接应用'};close(p)
 click(p,'#host [data-native-action=conversation]');assert set(p.locator('#modal [data-native-subaction]').all_inner_texts())>={'分享','重命名','归档','移入 Project','删除'};close(p)
 assert source(p)==before and p.locator('#host [data-native-action=voice]').count()==1 and p.locator('#host [data-native-action=model]').count()==1


@case
def focus_preserved_on_native_disclosure(p):
 b=p.locator('#sidebar [data-native-action=more]');b.focus();p.keyboard.press('Enter')
 assert b.evaluate('(e)=>e===document.activeElement') and b.get_attribute('aria-expanded')=='true'
 click(p,'#board [data-action=periodDown27]');b=p.locator('#board [data-action=periodUp27]');assert b.get_attribute('aria-label') and b.inner_text()==''


@case
def fixed30_boundaries_and_no_calendar_drift(p):
 import datetime
 for today in ['2026-10-10','2026-03-31','2024-02-29','2026-01-01']:
  rows=p.evaluate('(t)=>Array.from({length:15},(_,k)=>windowOf(t,1,k))',today)
  for i,w in enumerate(rows):
   assert (datetime.date.fromisoformat(w['upper'])-datetime.date.fromisoformat(w['start'])).days==30
   if i:assert w['upper']==rows[i-1]['start']
 w=p.evaluate("windowOf('2026-10-10',1,0)");assert (w['start'],w['end'])==('2026-09-11','2026-10-10')
 assert p.evaluate("bucketForDay('2026-09-10')")==1 and p.evaluate("bucketForDay('2026-09-11')")==0
@case
def actual30_changes_sample_visibility_without_deleting(p):
 scene(p,'stress');s=snap(p);assert len(s['topics'])==91 and len(s['chats'])==345
 pa=[c for c in s['chats'] if 'paia' in c['placements']];assert len(pa)==60
 assert next(c for c in pa if c['id']=='c2')['bucket']==1 and sum(c['bucket']==0 for c in pa)==27
@case
def vertical_period_buttons_latest_has_no_up(p):
 before=source(p);assert p.locator('#board [data-action=periodUp27]').count()==0
 assert p.locator('#board [data-action=periodDown27]').inner_text()==''
 assert p.locator('#board [data-action=periodEarlier],#board [data-action=periodNear]').count()==0
 click(p,'[data-action=periodDown27]');assert snap(p)['state']['offset']==1 and ids(p)==['daily-h0']
 assert p.locator('[data-action=periodUp27]').bounding_box()['y']<p.locator('[data-action=periodDown27]').bounding_box()['y']
 click(p,'[data-action=periodDown27]');assert snap(p)['state']['offset']==2 and len(ids(p))==9
 click(p,'[data-action=periodUp27]');click(p,'[data-action=periodUp27]');assert snap(p)['state']['offset']==0
 assert p.locator('[data-action=periodUp27]').count()==0 and before==source(p)
@case
def no_main_card_collapsing_but_sidebar_remains(p):
 assert p.locator('#board [data-fold],#board .topiclabel').count()==0
 before=source(p);p.locator('#board #topic-heading-daily-t0').click()
 assert p.locator('#board [data-topic=daily-t0] .rowmain:visible').count()==5
 click(p,'#sidebar [data-action=boardMenu]');assert '只看主题' not in p.locator('#popover').inner_text();p.keyboard.press('Escape')
 click(p,'#sidebar [data-nav-topic=daily-t0]');assert side_open(p,'daily-t0');click(p,'#sidebar [data-nav-topic=daily-t0]');assert not side_open(p,'daily-t0') and source(p)==before
@case
def old_disclosure_left_and_only_older(p):
 c=p.locator('#board [data-topic=daily-t0]');btn=c.locator('[data-board-all]');box=c.bounding_box();b=btn.bounding_box()
 assert b['x']+b['width']/2<box['x']+box['width']*.3 and btn.inner_text()==''
 btn.focus();p.keyboard.press('Enter');btn=c.locator('[data-board-all]');assert btn.evaluate('(e)=>e===document.activeElement')
 assert set(p.locator('#past-daily-t0 [data-open]').evaluate_all('(es)=>es.map(e=>e.dataset.open)'))=={'daily-t0-old0','daily-t0-old1'}
 assert p.locator('#past-daily-t0 [data-open=daily-t0-unknown]').count()==0
 first(p);sb=p.locator('#sidebar [data-nav-all=daily-t0]');assert sb.bounding_box()['x']<100 and sb.inner_text()==''
@case
def all_paia_members_can_still_be_reached(p):
 scene(p,'stress')
 while p.locator('#board [data-active-more=paia]').count():click(p,'#board [data-active-more=paia]')
 assert p.locator('#board [data-topic=paia] .rowmain:visible').count()==27
 click(p,'#board [data-board-all=paia]')
 while p.locator('#board [data-board-rest-more=paia]').count():click(p,'#board [data-board-rest-more=paia]')
 assert p.locator('#board [data-topic=paia] .rowmain:visible').count()==56
 click(p,'#board [data-topic-menu=paia]');click(p,'[data-find-topic=paia]');assert p.locator('#results [data-open]').count()==60
@case
def only_one_reading_return_and_no_sidebar_copy(p):
 assert p.locator('#workspace-return27').is_hidden();first(p)
 r=p.locator('#workspace-return27');assert r.is_visible() and r.inner_text()==''
 assert p.locator('#sidebar [data-action=workspaceHome],#navrail [data-action=workspaceHome]').count()==0
 for w in [1440,800,390]:
  p.set_viewport_size({'width':w,'height':844});assert r.is_visible()
  rb=r.bounding_box();model=p.locator('#host .mock-model').bounding_box();assert rb['x']+rb['width']<=model['x']+1
 click(p,'#workspace-return27');assert p.locator('#board-scroll').is_visible() and r.is_hidden()
@case
def return_restores_history_and_draft(p):
 click(p,'[data-action=periodDown27]');click(p,'#board [data-open=daily-h0-c0]')
 p.locator('#composer').fill('仍未发送的文字');p.evaluate('window.ed=document.getElementById("composer");window.tr=document.getElementById("transcript");ed.setSelectionRange(1,3)')
 click(p,'#workspace-return27');assert snap(p)['state']['offset']==1 and ids(p)==['daily-h0']
 click(p,'#board [data-open=daily-h0-c0]');assert p.evaluate('ed===document.getElementById("composer")&&tr===document.getElementById("transcript")&&ed.selectionStart===1&&ed.selectionEnd===3')
 assert p.locator('#composer').input_value()=='仍未发送的文字'
@case
def native_surface_has_same_single_return(p):
 first(p);click(p,'#sidebar [data-native-feature=projects]')
 assert p.locator('#native-surface').is_visible() and p.locator('#workspace-return27').is_visible()
 assert p.locator('#native-surface [data-action=workspaceHome]').count()==0
 click(p,'#workspace-return27');assert p.locator('#board-scroll').is_visible()
@case
def interactive_native_fixture_keeps_state(p):
 first(p);p.evaluate('__v27.mountInteractiveFixture27()');p.locator('#native-slider27').fill('72')
 p.evaluate('window.island=document.getElementById("interactive-fixture27");window.ed=document.getElementById("composer");window.tr=document.getElementById("transcript")')
 click(p,'#sidebar [data-nav-all=daily-t0]');click(p,'#sidebar [data-nav-topic=daily-t1]');click(p,'#workspace-return27');first(p)
 assert p.evaluate('island===document.getElementById("interactive-fixture27")&&ed===document.getElementById("composer")&&tr===document.getElementById("transcript")')
 assert p.locator('#native-slider27').input_value()=='72' and p.locator('#native-output27').inner_text()=='72'
@case
def native_new_flags_not_in_saved_chat(p):
 first(p);assert p.locator('#host [data-native-action=temporary]').count()==0
 click(p,'#host [data-native-action=tools]');assert '上传音频' in p.locator('#modal').inner_text();close(p)
 click(p,'#host [data-native-action=conversation]');assert '固定聊天' in p.locator('#modal').inner_text()
@case
def day_math_dst_is_local_date_not_hours(p):
 vals=p.evaluate("[localDay('2026-03-08T06:30:00Z','America/New_York'),localDay('2026-03-09T03:30:00Z','America/New_York'),windowOf('2026-03-08',1,0)]")
 assert vals[0]==vals[1]=='2026-03-08';assert vals[2]['start']=='2026-02-07'
@case
def unknown_native_entries_and_model_relayout_not_owned(p):
 first(p);p.evaluate('window.input27=document.getElementById("composer");window.originalDot=document.querySelector("#native-primary [data-native-action=dot]")')
 p.evaluate("__v26.setNativeFeature('host-future',{name:'宿主新功能'});__v26.setNativeFeature('tasks',{attention:true});showPeriod(7)")
 assert p.locator('#native-direct [data-native-feature=host-future]').is_visible() and p.locator('#native-urgent [data-native-feature=tasks]').is_visible()
 assert p.evaluate('input27===document.getElementById("composer")&&originalDot===document.querySelector("#native-primary [data-native-action=dot]")')
@case
def visual_regression_views(p):
 for k in ['daily','small','heavy','stress']:
  scene(p,k);p.mouse.move(1,1);p.screenshot(path=str(OUT/f'v27-{k}.png'))
 scene(p,'daily');first(p);p.mouse.move(1,1);p.screenshot(path=str(OUT/'v27-chat.png'))
 click(p,'#workspace-return27');click(p,'#board [data-board-all=daily-t0]');p.mouse.move(1,1);p.screenshot(path=str(OUT/'v27-expanded.png'))
 click(p,'[data-action=periodDown27]');p.mouse.move(1,1);p.screenshot(path=str(OUT/'v27-previous.png'))
 p.set_viewport_size({'width':390,'height':844});p.emulate_media(reduced_motion='reduce');p.evaluate("state.theme='dark';showPeriod(0)")
 first(p);p.mouse.move(1,1);p.screenshot(path=str(OUT/'v27-mobile-chat.png'))
 click(p,'#navrail [data-action=nav]');p.mouse.move(1,1);p.screenshot(path=str(OUT/'v27-dark-drawer.png'));assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')

reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 for fn in CASES:
  if os.environ.get('ONLY') and fn.__name__ not in os.environ['ONLY'].split(','):continue
  ctx=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Shanghai');p=ctx.new_page();errors=[];requests=[]
  p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));p.set_default_timeout(2000);start=time.monotonic()
  try:
   p.set_content(HTML,wait_until='domcontentloaded');fn(p);assert not errors,errors;assert not requests,requests;r={'test':fn.__name__,'status':'PASS'}
  except Exception as e:
   r={'test':fn.__name__,'status':'FAIL','error':repr(e)}
   try:p.screenshot(path=str(OUT/f'failed-{fn.__name__}.png'))
   except Exception:pass
  r.update(seconds=round(time.monotonic()-start,3),page_errors=errors,page_requests=requests);reports.append(r);print(fn.__name__,r['status'],r.get('error',''),flush=True);ctx.close()
 version=browser.version;browser.close()
r={'evidence':'PROTOTYPE_SIMULATION','source_sha256':hashlib.sha256(args.html.read_bytes()).hexdigest(),'browser':version,'method':'Playwright page.set_content; independent synthetic contexts; no real ChatGPT','tests':reports,'passed':sum(x['status']=='PASS' for x in reports),'failed':sum(x['status']=='FAIL' for x in reports)}
(OUT/'test-results-v27.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('RESULT',r['passed'],r['failed']);sys.exit(bool(r['failed']))
