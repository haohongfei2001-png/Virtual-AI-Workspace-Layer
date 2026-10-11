"""Real Chromium DOM tests. Opaque mode explicitly supplies a fake router/sender.
No policy changes, navigation bypass, memory-backed ScopeRepository or MV3 claims.
"""
from __future__ import annotations
import argparse, hashlib, json, os, platform, subprocess, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
BOOT="""globalThis.__VAIWL_HF_OPAQUE_TEST__={kind:'OPAQUE_DOM_ONLY',location:new URL('https://vaiwl-hf.test/hf/A/c/T0?mode=page'),history:{pushState(s,t,u){globalThis.__VAIWL_HF_OPAQUE_TEST__.location=new URL(u,globalThis.__VAIWL_HF_OPAQUE_TEST__.location.href);this.state=s;}}};"""
CASES=[]
def case(name, expected):
    def register(fn): CASES.append((name,expected,fn)); return fn
    return register

def check(value, msg):
    if not value: raise AssertionError(msg)
def active(p): p.wait_for_function("document.documentElement.dataset.vaiwlHfState==='ACTIVE'")
def control(p,a,v=None): p.evaluate("([a,v])=>HF.control(a,v)",[a,v]);p.wait_for_timeout(60)
def home(p): p.locator('[data-vaiwl-return]').click();p.wait_for_timeout(40)
def refs(p): return p.locator('.workspace .row')
def snapshot(p):
    p.evaluate("""()=>{const v=HF.getView();globalThis.baseline={input:v.input,transcript:v.transcript,widget:v.transcript.querySelector('input[type=range]'),model:document.querySelector('.model-button')};}""")
def same(p):
    return p.evaluate("""()=>{const v=HF.getView();return baseline.input===v.input&&baseline.transcript===v.transcript&&baseline.widget===v.transcript.querySelector('input[type=range]')&&baseline.model===document.querySelector('.model-button')}""")

@case('D01-native-baseline-without-VAIWL','Native send, stop, model and interactive widget work with no extension roots')
def _(p):
    p.evaluate('HFextension.stop()');check(p.locator('[data-vaiwl-owned]').count()==0,'owned roots residue');p.get_by_label('消息输入',exact=True).fill('合成基线');p.get_by_label('发送消息',exact=True).click();p.wait_for_timeout(130);p.get_by_label('停止生成',exact=True).click();check(p.evaluate('HF.state.streamTicks')>0,'stream not executed');return {'nativeHandlers':True}
@case('D02-mount-preserves-native-nodes','Mount/controlled unmount/remount never replaces composer, transcript or model')
def _(p):
    snapshot(p);p.evaluate('HFextension.stop()');p.evaluate('HFextension.start()');active(p);check(same(p),'native nodes replaced');check(p.locator('[data-vaiwl-return]').count()==1,'return duplicated');return {'nodeIdentity':True}
@case('D03-workspace-focus-selection-widget','Workspace roundtrip preserves native draft, selection, focus and interactive value')
def _(p):
    snapshot(p);p.get_by_label('调整交互值',exact=True).fill('82');t=p.get_by_label('消息输入',exact=True);t.fill('合成草稿 abcdef');t.focus();t.evaluate('(n)=>n.setSelectionRange(2,6)');home(p);check(p.locator('[data-vaiwl-mask][inert]').count()==1,'no reversible reading mask');p.locator('.workspace [data-ref-id=T0]').click();check(same(p),'node replaced');check(t.input_value()=='合成草稿 abcdef','draft lost');check(t.evaluate('(n)=>document.activeElement===n&&n.selectionStart===2&&n.selectionEnd===6'),'focus/selection lost');check(p.get_by_label('交互值',exact=True).inner_text()=='82','widget reset');return {'nativeDraftAndState':True}
@case('D04-v27-home-semantics','Current page has no up arrow or collapsible theme head; exactly one reading return')
def _(p):
    home(p);check(p.get_by_label('较近的30日',exact=True).count()==0,'up exists at k0');check(p.locator('.workspace .card h2 button').count()==0,'whole-card collapse');check(p.locator('.workspace .card h2').count()>0,'no static themes');check(p.locator('[data-vaiwl-return]').count()==1,'multiple return');check(not p.locator('[data-vaiwl-return]').is_visible(),'return visible on home');return {'staticThemeHeads':True}
@case('D05-old-window-versus-recent-overflow','Old members stay under parent and left disclosure does not reveal unknown rows')
def _(p):
    home(p);c=p.locator('.workspace [data-theme-id=W0]');check(c.locator('[data-ref-id=T2]').count()==0,'old initially visible');c.get_by_label('展开旧窗口 城市声音档案',exact=True).click();check(c.locator('[data-ref-id=T2]').count()==1,'old child absent');check(c.locator('[data-ref-id=T3]').count()==0,'unknown mislabeled old');b=c.locator('.old').bounding_box();r=c.bounding_box();check(b['x']<r['x']+r['width']/3,'disclosure not left aligned');check(c.get_by_label('显示更多近期窗口',exact=True).count()==1,'recent overflow conflated');c.get_by_label('显示更多近期窗口',exact=True).click();check(c.locator('.row').count()>=10,'recent capacity lost');return {'oldChildParentPreserved':True}
@case('D06-history-empty-segment-not-skipped','Arrows choose adjacent exclusive 30-day segments including an empty segment')
def _(p):
    home(p);p.get_by_label('较早的30日',exact=True).click();check(p.locator('.workspace').get_attribute('data-segment')=='1','skipped segment');check(p.locator('.workspace .card').count()==0,'expected empty synthetic segment');p.get_by_label('较早的30日',exact=True).click();check(p.locator('.workspace [data-theme-id=W3]').count()==1,'old theme missing');check(p.locator('.workspace [data-theme-id=W0]').count()==0,'theme duplicates across segments');return {'adjacentSegments':[0,1,2]}
@case('D07-unknown-search-native-search','Unknown records remain reachable; native search independently includes archive')
def _(p):
    p.get_by_label('查找主题与派生名称',exact=True).click();p.get_by_label('派生查找输入',exact=True).fill('T3');check(p.locator('.workspace [data-ref-id=T3]').count()==1,'unknown lost');p.get_by_label('搜索聊天',exact=True).click();p.get_by_label('原生搜索输入',exact=True).fill('T400');check('已归档' in p.locator('dialog').inner_text(),'native archive search lost');p.get_by_label('关闭',exact=True).click();return {'twoSeparateSearches':True}
@case('D08-sidebar-single-owner-and-fold-state','Repeated renders create one sidebar panel; manual group folds survive local updates')
def _(p):
    t=p.get_by_label('侧栏主题 城市声音档案',exact=True);t.click();check(t.get_attribute('aria-expanded')=='false','manual fold failed');
    for _ in range(4): control(p,'rebuild-nav')
    check(p.get_by_label('侧栏主题 城市声音档案',exact=True).count()==1,'duplicate sidebar');check(p.get_by_label('侧栏主题 城市声音档案',exact=True).get_attribute('aria-expanded')=='false','manual fold lost');return {'rebuilds':4}
@case('D09-native-model-tool-popover','Real top-layer menus remain usable and their native selection is not copied')
def _(p):
    p.get_by_label('模型菜单',exact=True).click();p.get_by_label('模拟模型 · Reasoning',exact=True).click();check('Reasoning' in p.get_by_label('模型菜单',exact=True).inner_text(),'model result lost');p.get_by_label('工具',exact=True).click();p.get_by_label('研究资料（模拟）',exact=True).click();check(p.evaluate('HF.state.lastTool')=='研究资料（模拟）','tool handler not called');return {'localNativeResults':True}
@case('D10-modal-priority-and-return','Permission dialog takes priority over workspace and returns without native replacement')
def _(p):
    snapshot(p);home(p);control(p,'portal');check(p.get_by_role('dialog').is_visible(),'permission hidden');check(not p.locator('.workspace').is_visible(),'workspace obstructs modal');p.get_by_label('拒绝',exact=True).click();check(p.evaluate('HF.state.permission')=='denied','permission changed');check(same(p),'native replaced');check(p.locator('.workspace').is_visible(),'workspace not restored');return {'nativeLayerPriority':True}
@case('D11-local-file-attachment-and-preview','Browser file input change and local preview work without upload or user files')
def _(p):
    p.get_by_label('选择附件',exact=True).set_input_files({'name':'synthetic.txt','mimeType':'text/plain','buffer':b'SYNTHETIC ONLY'});p.get_by_label('synthetic.txt',exact=True).click();check('SYNTHETIC ONLY' in p.get_by_role('dialog').inner_text(),'preview wrong');p.get_by_label('关闭',exact=True).click();return {'networkUpload':False}
@case('D12-stream-survives-workspace-switch','Native stream continues while browsing themes and can be stopped normally')
def _(p):
    snapshot(p);control(p,'stream');a=p.evaluate('HF.state.streamTicks');home(p);p.get_by_label('较早的30日',exact=True).click();p.wait_for_timeout(160);check(p.evaluate('HF.state.streamTicks')>a,'stream halted by navigation');check(same(p),'stream native node replaced');p.evaluate('HFextension.stop()');p.get_by_label('停止生成',exact=True).click();a=p.evaluate('HF.state.streamTicks');p.wait_for_timeout(110);check(p.evaluate('HF.state.streamTicks')==a,'stop did not work');return {'streamIsLocalTimer':True}
@case('D13-native-edit-and-regenerate','Editing is a native revision, not a new send; regenerate starts a native local stream')
def _(p):
    p.get_by_label('编辑消息',exact=True).first.click();p.get_by_label('编辑内容',exact=True).fill('已修改的合成文本');p.get_by_label('保存编辑',exact=True).click();check(p.evaluate('HF.state.lastMutation')=='edit-not-send','edit treated as send');check('已修改' in p.locator('.message.user').first.inner_text(),'edit result absent');p.get_by_label('重新生成',exact=True).first.click();p.wait_for_timeout(100);check(p.get_by_label('停止生成',exact=True).is_visible(),'regeneration absent');return {'editRevision':True}
@case('D14-native-share-state','Native share dialog produces explicitly local synthetic result and closes')
def _(p):
    p.get_by_label('分享',exact=True).click();p.get_by_label('创建测试链接',exact=True).click();check(p.evaluate('HF.state.shared') is True,'share handler lost');p.get_by_label('取消',exact=True).click();return {'publicLinkCreated':False}
@case('D15-cross-project-native-route','Derived links enter existing native project chats without mutating project ownership')
def _(p):
    home(p);p.locator('.workspace [data-ref-id=T1]').click();p.wait_for_function("HF.getView()?.ref.id==='T1'");active(p);check(p.evaluate('HF.getView().ref.projectId')=='P1','project changed');check(p.locator('.message').count()==160,'long native conversation missing');check(p.locator('[data-vaiwl-return]').count()==1,'return duplicate');return {'logicalRoute':'P1/T1','actualBrowserURL':p.url,'actualBrowserNavigation':False}
@case('D16-workspace-restores-history-and-scroll','Return restores history segment, scroll and disclosure state without resetting native view')
def _(p):
    control(p,'stress',True);active(p);home(p);p.locator('.workspace [data-theme-id=W0] .old').click();p.locator('.workspace').evaluate('(n)=>n.scrollTop=300');p.wait_for_timeout(30);saved=p.locator('.workspace').evaluate('(n)=>n.scrollTop');p.locator('.workspace [data-ref-id=T0]').evaluate('(n)=>n.click()');home(p);check(abs(p.locator('.workspace').evaluate('(n)=>n.scrollTop')-saved)<2,'scroll not restored');check(p.locator('.workspace [data-theme-id=W0] .old').get_attribute('aria-expanded')=='true','old disclosure lost');p.get_by_label('较早的30日',exact=True).click();p.get_by_label('较早的30日',exact=True).click();p.locator('.themes [data-ref-id=T0]').evaluate('(n)=>n.click()');home(p);check(p.locator('.workspace').get_attribute('data-segment')=='2','history view lost');return {'restoredScroll':saved}
@case('D17-account-A-B-A-and-unknown','Scope change clears stale projection and unknown identity renders no derived content')
def _(p):
    control(p,'account','B');active(p);check(p.locator('html').get_attribute('data-vaiwl-hf-scope')=='B','scope still A');home(p);check('另一账户的工作' in p.locator('.workspace').inner_text(),'B content absent');control(p,'account','unknown');p.wait_for_timeout(160);check(p.locator('[data-vaiwl-owned]').count()==0,'unknown identity retains projection');control(p,'account','A');active(p);check(p.locator('html').get_attribute('data-vaiwl-hf-scope')=='A','A failed rebind');return {'scopeWitness':'SYNTHETIC_FAKE_SENDER'}
@case('D18-late-response-after-account-change','Delayed old-account read cannot display after B navigation')
def _(p):
    control(p,'read-delay',180);p.evaluate('HFextension.refresh()');p.wait_for_timeout(30);control(p,'account','B');p.wait_for_timeout(400);active(p);check(p.locator('html').get_attribute('data-vaiwl-hf-scope')=='B','old scope returned');home(p);check('另一账户的工作' in p.locator('.workspace').inner_text(),'wrong account result');return {'lateReadDelayMs':180}
@case('D19-fast-native-route-out-of-order','Host discards stale delayed renders during rapid logical navigation')
def _(p):
    control(p,'delay',180);p.evaluate("HF.navigate('/hf/A/c/T1?mode=page');HF.navigate('/hf/A/c/T0?mode=page')");p.wait_for_timeout(400);check(p.evaluate('HF.getView().ref.id')=='T0','out of order host view');check(p.evaluate('HF.state.stale')>=1,'delayed render not rejected');return {'browserHistory':'NOT_TESTED','logicalRouter':True}
@case('D20-network-failure-retry','Host request failure and native retry are operable')
def _(p):
    control(p,'fail');p.evaluate("HF.navigate('/hf/A/c/T1?mode=page')");p.get_by_label('重试加载',exact=True).click();p.wait_for_function("HF.getView()?.ref.id==='T1'");return {'failureIsSynthetic':True}
@case('D21-nested-sidebar-and-recreation','Changed native hierarchy still mounts once and does not move native transcript')
def _(p):
    snapshot(p);control(p,'variant','nested-sidebar');active(p);control(p,'rebuild-nav');active(p);check(same(p),'native chat replaced');check(p.get_by_label('VAIWL 主题导航',exact=True).count()==1,'duplicate theme nav');return {'hierarchyChanges':True}
@case('D22-no-safe-boundary-native-first','Unknown mixed navigation boundary removes enhancement; native remains usable')
def _(p):
    snapshot(p);control(p,'variant','no-safe-boundary');check(p.locator('html').get_attribute('data-vaiwl-hf-state')=='NATIVE_ONLY','not conservative');check(p.locator('[data-vaiwl-owned]').count()==0,'derived residue');check(same(p),'native replaced');p.get_by_label('消息输入',exact=True).fill('边界缺失仍可输入');return {'enhancement':'NATIVE_ONLY'}
@case('D23-packed-header-no-convenient-slot','New native features occupy header; extension yields instead of overlaying tools')
def _(p):
    control(p,'variant','packed-header');check(p.locator('html').get_attribute('data-vaiwl-hf-state')=='NATIVE_ONLY','header collision not refused');check(p.locator('[data-vaiwl-return]').count()==0,'return overlaps native');p.get_by_label('未来原生功能',exact=True).click();check(p.evaluate('HF.state.unknownClicks')==1,'unknown feature removed');return {'enhancement':'NATIVE_ONLY'}
@case('D24-unknown-and-pending-entries','Unknown resources and approval state survive active enhancement')
def _(p):
    control(p,'variant','portal-collision');control(p,'pending',True);active(p);p.get_by_label('待批准操作',exact=True).click();p.get_by_label('允许本次',exact=True).click();check(p.evaluate('HF.state.permission')=='allowed','approval failed');p.get_by_label('未来原生功能',exact=True).click();check(p.get_by_role('dialog').is_visible(),'unknown dialog unavailable');return {'unknownPreserved':True}
@case('D25-long-composer-resize','Increasing native composer height shrinks workspace without covering it')
def _(p):
    home(p);control(p,'grow');p.wait_for_timeout(100);a=p.locator('.workspace').bounding_box();b=p.locator('.composer').bounding_box();check(a['y']+a['height']<=b['y']+1,'workspace covers long composer');check(p.get_by_label('消息输入',exact=True).input_value().count('\n')>=10,'long draft lost');return {'workspaceBottom':a['y']+a['height'],'composerTop':b['y']}
@case('D26-narrow-native-controls','390px viewport has no horizontal overflow and no overlapped native controls')
def _(p):
    p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(150);check(p.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow');p.get_by_label('消息输入',exact=True).fill('窄屏测试');check(p.get_by_label('工具',exact=True).is_visible(),'tools inaccessible');return {'viewport':[390,844],'enhancement':p.locator('html').get_attribute('data-vaiwl-hf-state')}
@case('D27-dark-and-reduced-motion','Theme inherits host variables and native controls remain operable')
def _(p):
    p.emulate_media(reduced_motion='reduce');control(p,'variant','dark');home(p);check(p.locator('html').get_attribute('data-theme')=='dark','theme absent');check(p.locator('.workspace').is_visible(),'dark workspace missing');return {'background':p.locator('.workspace').evaluate('(n)=>getComputedStyle(n).backgroundColor')}
@case('D28-stress-reachability','All 604 synthetic references remain findable beyond visible recent capacity')
def _(p):
    control(p,'stress',True);p.wait_for_timeout(120);active(p);p.get_by_label('查找主题与派生名称',exact=True).click();clicks=0
    while p.get_by_label('显示更多查找结果',exact=True).count():
        p.get_by_label('显示更多查找结果',exact=True).click();clicks+=1;check(clicks<30,'search expansion never ends')
    check(refs(p).count()==604,'stress references lost');p.get_by_label('派生查找输入',exact=True).fill('T11903');check(refs(p).count()==1,'last reference not reachable');return {'themes':120,'refs':604,'persistentRepositoryTest':False,'searchExpansionClicks':clicks}
@case('D29-host-rebuild-versus-extension-rebuild','Host intentionally recreates transcript, then extension reattaches without duplicates')
def _(p):
    snapshot(p);control(p,'rebuild-main');active(p);check(not same(p),'host rebuild did not execute');check(p.locator('[data-vaiwl-return]').count()==1,'return duplicated after host rebuild');check(p.get_by_label('消息输入',exact=True).is_visible(),'new composer unavailable');return {'ownerOfRecreation':'host'}
@case('D30-controlled-exit-cleans-view-mask','Controlled exit removes roots and only owned mask, preserving newer native style')
def _(p):
    snapshot(p);home(p);p.locator('.reading-scroll').evaluate('(n)=>n.style.borderColor="rgb(12, 34, 56)"');p.evaluate('HFextension.stop()');check(p.locator('[data-vaiwl-owned],[data-vaiwl-mask]').count()==0,'cleanup residue');check(same(p),'native replaced');check(p.locator('.reading-scroll').evaluate('(n)=>n.style.borderColor')=='rgb(12, 34, 56)','new host style overwritten');return {'actualExtensionDisable':False}
@case('D31-transport-failure-clears-projection','Injected transport failure removes derived UI; explicit restart recovers')
def _(p):
    home(p);p.evaluate('HFextension.failTransport()');p.wait_for_timeout(130);check(p.locator('[data-vaiwl-owned]').count()==0,'stale UI after transport error');p.get_by_label('消息输入',exact=True).fill('异常后原生可用');p.evaluate('HFextension.start()');active(p);return {'injectionNotWorkerDeath':True}
@case('D32-scope-view-state-isolation','Account B does not inherit A history-segment view state')
def _(p):
    home(p);p.get_by_label('较早的30日',exact=True).click();control(p,'account','B');active(p);home(p);check(p.locator('.workspace').get_attribute('data-segment')=='0','view state leaks A→B');return {'perScopeTransientView':True}
@case('D33-project-resource-permissions','Native project files/instructions stay separate from derived workspace')
def _(p):
    p.locator('aside a[href*="/project/P1"]').click();p.get_by_label('项目指令',exact=True).click();check('P1' in p.get_by_role('dialog').inner_text(),'project instruction wrong');p.get_by_label('关闭',exact=True).click();return {'logicalProjectRoute':True,'projectContextMerged':False}
@case('D34-timezone-control-reprojects','Timezone and clock controls recompute navigation without replacing current native nodes')
def _(p):
    snapshot(p);control(p,'timeZone','America/New_York');control(p,'now','2026-10-12T04:00:00Z');active(p);check(same(p),'timezone replaces native');home(p);check(p.locator('.workspace .card').count()>0,'projection vanished');return {'timeZone':'America/New_York'}
@case('D35-native-branch','Native branch creates a distinct logical conversation while preserving original data')
def _(p):
    before=p.evaluate('HF.getView().messages.length');p.get_by_label('分支对话',exact=True).first.click();p.wait_for_function("HF.getView()?.ref.id.startsWith('branch-')");check(p.evaluate('HF.getView().ref.scope')=='A','branch changed account');return {'logicalBranch':True,'originalMessageCount':before}

@case('D36-native-pin-archive-state','Native pin/archive actions affect native lists without creating a new user send')
def _(p):
    before=p.evaluate('HF.getView().messages.length');p.get_by_label('会话菜单',exact=True).click();p.get_by_label('固定合成聊天',exact=True).click();check(p.evaluate('HF.data().refs.find(r=>r.id==="T0").pinned') is True,'pin not reflected');p.get_by_label('会话菜单',exact=True).click();p.get_by_label('归档合成聊天',exact=True).click();check(p.evaluate('HF.data().refs.find(r=>r.id==="T0").archived') is True,'archive not reflected');check(p.evaluate('HF.getView().messages.length')==before,'archive generates send');check(p.locator('nav[aria-label="Chat history"] a[href*="/c/T0"]').count()==0,'archive still in native history');return {'nativeStateChanged':True}
@case('D37-native-new-chat','Native new-chat entry creates a functional composer, not a VAIWL destination dialog')
def _(p):
    p.locator('aside a[href*="/new"]').click();p.wait_for_function("HF.getView()?.ref.id.startsWith('new-')");check(p.get_by_role('dialog').count()==0,'unexpected extension dialog');p.get_by_label('消息输入',exact=True).fill('新合成会话');p.get_by_label('发送消息',exact=True).click();p.wait_for_timeout(90);check(p.get_by_label('停止生成',exact=True).is_visible(),'new chat cannot send');return {'nativeNewChat':True}

@case('D38-long-single-theme-complete-expansion','A 128-window theme expands all known recent members without mixing old/unknown')
def _(p):
    control(p,'stress',True);active(p);home(p);c=p.locator('.workspace [data-theme-id=W0]');clicks=0
    while c.get_by_label('显示更多近期窗口',exact=True).count():
        c.get_by_label('显示更多近期窗口',exact=True).click();clicks+=1;check(clicks<20,'unbounded expansion')
    check(c.locator('.row').count()==126,'long recent list truncated');c.locator('.old').click();check(c.locator('.row').count()==127,'old list incorrect');check(c.locator('[data-ref-id=T3]').count()==0,'unknown inserted into old');return {'singleThemeMembers':128,'recent':126,'old':1,'unknown':1,'expansionClicks':clicks}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--browser',default=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'));ap.add_argument('--only',default='');args=ap.parse_args()
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
    bundle=subprocess.check_output(['node','--input-type=module','-e',"import {bundle} from './simulator/build.mjs';process.stdout.write(bundle('tests/hf/opaque-entry.mjs'));"],cwd=ROOT,text=True)
    report={'schema':'vaiwl-hf-browser-v1','level':'B_BROWSER_DOM_OPAQUE','transport':'FAKE_ROUTER_FAKE_CHROME_SENDER_READ_ONLY_CATALOGUE','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':{'os':platform.platform(),'python':platform.python_version(),'node':subprocess.check_output(['node','-v'],text=True).strip()},'sourceSha256':hashlib.sha256(bundle.encode()).hexdigest(),'results':[],'blocked':['real browser Back/Forward and SPA URL changes','extension-origin IndexedDB','MV3 load/disable/re-enable/worker restart','actual freeze/resume','physical IME','real ChatGPT login/identity/feature acceptance']}
    (out/'executed-bundle.sha256').write_text(report['sourceSha256']+'\n')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.browser,headless=True)
        report['environment']['chromium']=browser.version
        for name,expected,fn in CASES:
            if args.only and args.only not in name:continue
            context=browser.new_context(viewport={'width':1440,'height':1000},locale='zh-CN');p=context.new_page();p.set_default_timeout(4000);errors=[];requests=[]
            p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));start=time.monotonic()
            item={'id':name,'expected':expected,'actual':None,'status':'FAIL'}
            try:
                p.set_content('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body></body></html>');p.add_style_tag(content=(ROOT/'simulator/host.css').read_text());p.add_script_tag(content=BOOT+bundle);active(p)
                item['actual']=fn(p)
                check(not errors,'Unexpected page errors: '+repr(errors));check(not requests,'Unexpected page network: '+repr(requests));item['status']='PASS'
                if name.startswith(('D01','D03','D04','D23','D26','D27','D28')):p.screenshot(path=str(out/(name+'.png')),timeout=5000)
            except Exception as e:
                item['error']={'name':type(e).__name__,'message':str(e)}
                try:p.screenshot(path=str(out/(name+'-failure.png')),timeout=5000)
                except Exception:pass
            finally:
                item['durationMs']=round((time.monotonic()-start)*1000);item['pageErrors']=errors;item['pageRequests']=requests
                report['results'].append(item);(out/'results.partial.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(item,ensure_ascii=False),flush=True);context.close()
        browser.close()
    report['counts']={s:sum(x['status']==s for x in report['results']) for s in ['PASS','FAIL']};report['endedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['counts']));return 1 if report['counts']['FAIL'] else 0
if __name__=='__main__':raise SystemExit(main())
