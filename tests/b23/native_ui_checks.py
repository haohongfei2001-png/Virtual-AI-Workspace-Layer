"""Incremental tests on real loopback pages and the loaded synthetic MV3 worker."""
import json
import time

STATE_READ = '''async account=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('vaiwl-hf-synthetic-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','refs'],'readonly'),key=JSON.stringify(['hf_synthetic_only',account,'fixture_org']);let state,native;
 const r=tx.objectStore('b23_states').get(key);r.onsuccess=()=>state=r.result?.payload;
 const n=tx.objectStore('refs').get(JSON.stringify([key,'T0']));n.onsuccess=()=>native=n.result;
 tx.oncomplete=()=>{if(!state){reject(Error('missing-real-state'));return;}resolve({scope:state.scopeKey,revision:state.revision,bootstrapCount:Object.values(state.workspaces).filter(w=>w.owner==='bootstrap').length,workspaceCount:Object.keys(state.workspaces).length,refCount:Object.keys(state.refs).length,humanWorkspaces:Object.values(state.workspaces).filter(w=>w.owner==='human'),identities:{T0:state.identities.T0,T1:state.identities.T1},placements:Object.values(state.placements).filter(p=>p.refId==='T0'),nativeT0:native,source:state.sources.fixture_v1});};tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}'''

class NativeChecks:
    def __init__(self, ctx, mode, extension, record, manage, saved, close, report):
        self.ctx, self.mode, self.extension = ctx, mode, extension
        self.record, self.manage, self.saved, self.close = record, manage, saved, close
        self.report = report
        self.workspace_id = None
        self.native_before = None

    def worker(self):
        prefix = 'chrome-extension://' + self.extension['id'] + '/'
        workers = [w for w in self.ctx.service_workers if w.url.startswith(prefix)]
        assert workers, 'No Playwright target for loaded MV3 worker'
        return workers[-1]

    def state(self, page, account='A'):
        target = self.worker() if self.mode == 'mv3' else page
        result = target.evaluate(STATE_READ, account)
        assert result['refCount'] == 604, result
        assert result['workspaceCount'] >= 120, result
        return result

    def action(self, page, label):
        page.get_by_role('status').filter(has_text='已保存').evaluate('(n)=>n.textContent=""') if page.get_by_role('status').filter(has_text='已保存').count() else None
        page.get_by_role('button', name=label, exact=True).click()
        self.saved(page)

    def create_assets(self, page):
        self.native_before = self.state(page)['nativeT0']
        page.get_by_label('调整交互值', exact=True).fill('73')
        page.get_by_label('工具', exact=True).click()
        page.get_by_role('button', name='研究资料（模拟）', exact=True).click()
        page.evaluate('''()=>{
         const v=HF.getView(),nodes=HF.getNodes();globalThis.nativeBaseline={input:v.input,form:v.form,transcript:v.transcript,messages:[...v.transcript.querySelectorAll('[data-message-id]')],range:v.transcript.querySelector('input[type=range]'),reading:nodes.reading,header:nodes.header,tool:v.tool,model:nodes.header.querySelector('.model-button').textContent,text:JSON.stringify(v.messages),catalog:JSON.stringify(HF.data().refs.map(r=>[r.id,r.nativeTitle,r.projectId])),projects:JSON.stringify(HF.data().projects)};
        }''')
        self.manage(page)
        page.get_by_label('新主题名称', exact=True).fill('Mac isolated workspace')
        self.action(page, '创建主题')
        self.workspace_id = page.get_by_label('主题选择', exact=True).input_value()
        assert self.workspace_id.startswith('W_'), self.workspace_id
        page.get_by_label('主题名称', exact=True).fill('Mac durable workspace')
        page.get_by_label('主题图标', exact=True).fill('◆')
        self.action(page, '保存主题')
        page.get_by_label('窗口选择', exact=True).select_option('T0')
        self.action(page, '加入窗口')
        joined = self.state(page)
        assert any(p['workspaceId'] == self.workspace_id and not p['excluded'] for p in joined['placements'])
        page.get_by_label('目标主题', exact=True).select_option('W1')
        self.action(page, '移动窗口')
        moved = self.state(page)
        assert any(p['workspaceId'] == self.workspace_id and p['excluded'] for p in moved['placements'])
        assert any(p['workspaceId'] == 'W1' and not p['excluded'] for p in moved['placements'])
        self.action(page, '撤销上次修改')
        restored = self.state(page)
        assert any(p['workspaceId'] == self.workspace_id and not p['excluded'] for p in restored['placements'])
        assert not any(p['workspaceId'] == 'W1' and not p['excluded'] for p in restored['placements'])
        self.close(page)
        native = page.evaluate('''()=>{const b=nativeBaseline,v=HF.getView(),n=HF.getNodes();return {input:b.input===v.input,form:b.form===v.form,transcript:b.transcript===v.transcript,messageNodes:b.messages.every((x,i)=>x===v.transcript.querySelectorAll('[data-message-id]')[i]),reading:b.reading===n.reading,header:b.header===n.header,draft:v.input.value==='SYNTHETIC native-state sentinel',range:b.range===v.transcript.querySelector('input[type=range]')&&b.range.value==='73',tool:b.tool===v.tool,messages:b.text===JSON.stringify(v.messages),nativeTitlesAndProjects:b.catalog===JSON.stringify(HF.data().refs.map(r=>[r.id,r.nativeTitle,r.projectId])),projects:b.projects===JSON.stringify(HF.data().projects),model:b.model===n.header.querySelector('.model-button').textContent};}''')
        assert all(native.values()), native
        self.record('native-create-rename-icon-place-move-undo', 'PASS', {'joined':joined,'moved':moved,'restored':restored})
        self.record('native-input-messages-tool-interaction-identity', 'PASS', native)
        self.verify_assets(page, 'after-manual-edits')

    def verify_assets(self, page, stage):
        s = self.state(page)
        assert s['workspaceCount'] == 121 and s['bootstrapCount'] == 120 and s['refCount'] == 604, s
        w = next(w for w in s['humanWorkspaces'] if w['id'] == self.workspace_id)
        assert w['name'] == 'Mac durable workspace' and w['icon'] == '◆' and w['locked'], w
        assert any(p['workspaceId'] == self.workspace_id and not p['excluded'] and p['locked'] for p in s['placements']), s
        assert s['identities']['T0']['title'] == 'B23 durable title' and s['identities']['T0']['locked']
        assert s['nativeT0'] == self.native_before
        self.manage(page)
        page.get_by_label('主题选择', exact=True).select_option(self.workspace_id)
        assert page.get_by_label('主题名称', exact=True).input_value() == w['name']
        assert page.get_by_label('主题图标', exact=True).input_value() == w['icon']
        self.close(page)
        self.record('native-assets-'+stage, 'PASS', s)

    def isolate_b(self, page):
        b = self.state(page, 'B')
        assert self.workspace_id not in [w['id'] for w in b['humanWorkspaces']]
        assert b['identities']['T0']['title'] != 'B23 durable title'
        assert b['workspaceCount'] == 120
        self.record('native-workspace-placement-B-isolation', 'PASS', b)

    def multi_tab_cas(self, first, second):
        # Both dialogs obtain the same actual persisted revision before simultaneous writes.
        first.reload(); second.reload()
        self.manage(first); self.manage(second)
        revision = self.state(first)['revision']
        for pg, value in [(first, 'Native concurrent first'), (second, 'Native concurrent second')]:
            pg.get_by_label('窗口选择', exact=True).select_option('T1')
            pg.get_by_label('派生标题', exact=True).fill(value)
        at = int(time.time()*1000)+500
        expression = '''at=>{const b=[...document.querySelectorAll('[data-vaiwl-owned="workspace-editor"] button')].find(b=>b.textContent==='保存派生标题');setTimeout(()=>{document.documentElement.dataset.nativeCasStarted=String(Date.now());b.click();},Math.max(0,at-Date.now()));}'''
        first.evaluate(expression, at); second.evaluate(expression, at)
        for pg in [first, second]:
            pg.wait_for_function("()=>[...document.querySelectorAll('[role=status]')].some(n=>n.textContent.includes('已保存')||n.textContent.includes('另一标签页'))")
        statuses = [pg.locator('[data-vaiwl-owned="workspace-editor"] [role=status]').inner_text() for pg in [first,second]]
        assert sum('已保存' in s for s in statuses) == 1 and sum('另一标签页' in s for s in statuses) == 1, statuses
        state = self.state(second)
        assert state['revision'] == revision+1
        winner = 'Native concurrent first' if '已保存' in statuses[0] else 'Native concurrent second'
        assert state['identities']['T1']['title'] == winner
        starts = [pg.locator('html').get_attribute('data-native-cas-started') for pg in [first,second]]
        for pg in [first,second]: self.close(pg)
        self.record('native-two-tabs-UI-CAS-and-failure-status', 'PASS', {'baseRevision':revision,'statuses':statuses,'startTimes':starts,'winner':winner,'persisted':state})

    def queued_human_after_real_delayed_read(self, page):
        page.evaluate("""()=>{const b=HFextension.service.workspaces,original=b.snapshot.bind(b);globalThis.nativeHold={original,held:false,release:null};b.snapshot=async(...args)=>{const result=await original(...args);if(!nativeHold.held){nativeHold.held=true;return new Promise(resolve=>nativeHold.release=()=>resolve(result));}return result;};void HFextension.refresh();}""")
        page.wait_for_function('()=>globalThis.nativeHold?.held===true')
        page.evaluate("void HFextension.command({type:'SET_TITLE',refId:'T1',title:'Native newer human wins'}).then(r=>globalThis.nativeQueuedResult=r,e=>globalThis.nativeQueuedResult={error:e.message})")
        before=self.state(page)
        assert before['identities']['T1']['title']!='Native newer human wins'
        page.evaluate('()=>{nativeHold.release();HFextension.service.workspaces.snapshot=nativeHold.original;}')
        page.wait_for_function('()=>globalThis.nativeQueuedResult!==undefined')
        result=page.evaluate('nativeQueuedResult');assert result.get('ok'),result
        after=self.state(page);assert after['identities']['T1']['title']=='Native newer human wins'
        self.manage(page);page.get_by_label('窗口选择',exact=True).select_option('T1')
        assert page.get_by_label('派生标题',exact=True).input_value()=='Native newer human wins'
        self.close(page)
        self.record('native-delayed-real-read-then-new-human-command','PASS',{'queuedResult':result,'before':before,'after':after})

    def corrupt_view_ui(self, page):
        target=self.worker() if self.mode=='mv3' else page
        damaged=target.evaluate("""async()=>{
         const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('vaiwl-hf-synthetic-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
         try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readwrite'),store=tx.objectStore('b23_views'),key=JSON.stringify(['hf_synthetic_only','A','fixture_org']),r=store.get(key);let row;
         r.onsuccess=()=>{row=r.result??{key,payload:{revision:1,value:{segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:0,sidebarVisible:true}}};row.checksum='native-ui-intentional-corruption';store.put(row);};tx.oncomplete=()=>resolve(row);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
        }""")
        page.reload();self.manage(page)
        warning=page.locator('[data-vaiwl-diagnostic="view"]').inner_text();assert '视图偏好记录损坏' in warning
        page.get_by_label('消息输入',exact=True).evaluate("n=>{n.value='corrupt-view-sentinel';globalThis.corruptViewNodes={input:n,transcript:HF.getView().transcript};}")
        page.get_by_label('窗口选择',exact=True).select_option('T0')
        assert page.get_by_label('派生标题',exact=True).input_value()=='B23 durable title'
        self.action(page,'保存派生标题');self.close(page)
        assert page.evaluate("()=>corruptViewNodes.input===HF.getView().input&&corruptViewNodes.transcript===HF.getView().transcript&&corruptViewNodes.input.value==='corrupt-view-sentinel'")
        target=self.worker() if self.mode=='mv3' else page
        preserved=target.evaluate("""async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('vaiwl-hf-synthetic-v1');r.onsuccess=()=>resolve(r.result);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views'),r=tx.objectStore('b23_views').get(JSON.stringify(['hf_synthetic_only','A','fixture_org']));let row;r.onsuccess=()=>row=r.result;tx.oncomplete=()=>resolve(row);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}""")
        assert preserved==damaged
        self.verify_assets(page,'corrupt-view-reload')
        self.record('native-corrupt-view-UI-diagnostic-draft-and-byte-preservation','PASS',{'warning':warning,'damagedRow':damaged,'bytesPreserved':True})

    def content_context(self, page):
        session = self.ctx.new_cdp_session(page)
        contexts = []
        session.on('Runtime.executionContextCreated', lambda e: contexts.append(e['context']))
        session.send('Runtime.enable')
        for context in contexts:
            if context.get('auxData',{}).get('isDefault'): continue
            result = session.send('Runtime.evaluate', {'contextId':context['id'],'expression':"typeof chrome?.runtime?.sendMessage === 'function'",'returnByValue':True})
            if result.get('result',{}).get('value'):
                self.report.setdefault('contentContexts',[]).append(context)
                return session, context['id']
        raise AssertionError('Real extension content execution context missing: '+json.dumps(contexts))

    def content_eval(self, page, expression):
        session, context = self.content_context(page)
        try:
            result = session.send('Runtime.evaluate', {'contextId':context,'expression':expression,'returnByValue':True,'awaitPromise':True})
            assert 'exceptionDetails' not in result, result
            return result['result'].get('value')
        finally: session.detach()

    def real_bind(self, page):
        return self.content_eval(page, "chrome.runtime.sendMessage({v:1,type:'BIND',clientId:'native_acceptance_binding',seq:1})")

    def stale_lease(self, page, bound, seq=2):
        message={'v':1,'type':'B23_SNAPSHOT','clientId':'native_acceptance_binding','seq':seq,'leaseId':bound['leaseId'],'now':'2026-10-11T04:00:00Z','timeZone':'UTC','size':120}
        return self.content_eval(page, 'chrome.runtime.sendMessage('+json.dumps(message)+')')

    def delayed_old_binding(self, page):
        # Hold the real native snapshot reply AFTER it has been read, never fabricate a reply.
        if self.mode == 'page':
            page.evaluate('''()=>{const b=HFextension.service.workspaces,original=b.snapshot.bind(b);globalThis.nativeHold={original,held:false,release:null};b.snapshot=async(...args)=>{const result=await original(...args);if(!nativeHold.held){nativeHold.held=true;return new Promise(resolve=>nativeHold.release=()=>resolve(result));}return result;};void HFextension.refresh();}''')
            page.wait_for_function('()=>globalThis.nativeHold?.held===true')
        else:
            self.content_eval(page, '''(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);globalThis.nativeHold={original,held:false,release:null};chrome.runtime.sendMessage=async m=>{const result=await original(m);if(m.type==='B23_SNAPSHOT'&&result.ok&&!nativeHold.held){nativeHold.held=true;return new Promise(resolve=>nativeHold.release=()=>resolve(result));}return result;};return true;})()''')
            page.evaluate("HF.control('timeZone','UTC')")
            for _ in range(100):
                if self.content_eval(page, 'globalThis.nativeHold?.held===true'): break
                page.wait_for_timeout(50)
            else: raise AssertionError('No actual worker snapshot held')
        page.evaluate("HF.control('account','unknown')")
        if self.mode == 'page':
            page.evaluate('()=>{nativeHold.release();HFextension.service.workspaces.snapshot=nativeHold.original;}')
        else:
            self.content_eval(page, 'nativeHold.release();chrome.runtime.sendMessage=nativeHold.original;true')
        page.wait_for_timeout(500)
        assert page.locator('[data-vaiwl-return]').count() == 0
        assert page.locator('[data-vaiwl-owned="workspace-editor"]').count() == 0
        assert 'Mac durable workspace' not in page.locator('body').inner_text()
        assert 'B23 durable title' not in page.locator('body').inner_text()
        if self.mode == 'mv3':
            unknown=self.real_bind(page);assert not unknown['ok'] and 'snapshot' not in unknown
            self.record('native-unknown-content-to-worker-binding-denied','PASS',unknown)
        self.record('native-real-delayed-old-response-after-unknown', 'PASS', 'Actual native storage reply delayed by driver; generation change rejects its render; no sensitive derived DOM')
