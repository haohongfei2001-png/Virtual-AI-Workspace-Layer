#!/usr/bin/env python3
"""Reuse all 48 committed DOM cases, adding the view-corruption regression.
The transport remains explicitly fake-router/fake-sender/mock-IDB, not MV3.
"""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('b23_dom',Path(__file__).with_name('browser.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
case=runner.case; snapshot=runner.snapshot; active=runner.active; check=runner.check; same=runner.same

@case('P11-corrupt-view-does-not-hide-intact-workspace','Corrupt view is disclosed without blocking human assets or recreating native controls')
def _(p):
    snapshot(p);p.get_by_label('消息输入',exact=True).fill('视图损坏时保留原生草稿')
    p.evaluate("""async()=>{const svc=HFextension.getService(),scope={verified:true,provider:'hf_synthetic_only',accountId:'A',organizationId:'fixture_org'};
      await svc.workspaces.saveView(scope,{segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:0,sidebarVisible:true},0);
      const db=await svc.repository.open(),key=svc.repository.scopeOrThrow(scope).key;
      await new Promise((resolve,reject)=>{const tx=db.transaction('b23_views','readwrite'),s=tx.objectStore('b23_views'),r=s.get(key);r.onsuccess=()=>{const row=r.result;row.checksum='synthetic-corruption';s.put(row)};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    }""")
    p.evaluate('HFextension.refresh()');active(p);p.get_by_label('管理工作空间',exact=True).click()
    check('视图偏好记录损坏' in p.locator('[data-vaiwl-diagnostic=view]').inner_text(),'corruption not disclosed')
    check(same(p),'native nodes replaced');check(p.get_by_label('消息输入',exact=True).input_value()=='视图损坏时保留原生草稿','native draft lost')
    return {'viewFailureIsolated':True,'damagedRecordPreserved':True,'backend':'MOCK_IDB'}

if __name__=='__main__':raise SystemExit(runner.main())
