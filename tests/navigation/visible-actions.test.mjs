import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../host/navigation-frame-calibration-entry.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function setup(t,role='workspace',extra={}){const f=fixture(role,()=>null,null,null,{},extra);t.after(()=>f.nav.stop());f.nav.updateFrameProjection(projection(role));return f;}
const visibleText=node=>[node.textContent,...node.children.map(visibleText)].join('').trim();
for(const label of ['已保存片段','备份与导入','本地数据恢复','关闭设置'])test('workspace settings '+label+' has actual text, not only accessible name',t=>{
 const f=setup(t,'workspace',{onSnippetsRequest(){},onBackupRequest(){},onRecoveryRequest(){}});f.button('工作空间设置').click();const action=f.button(label);assert(action);assert.equal(visibleText(action),label);
});
test('sidebar snippets has a visible approved icon and tooltip; stopped entry cannot dispatch',t=>{
 let calls=0;const f=setup(t,'sidebar',{onSnippetsRequest:()=>calls++}),action=f.button('已保存片段');assert(action);assert.match(action.innerHTML,/<svg[^>]*aria-hidden="true"/);assert.equal(action.getAttribute('title'),'已保存片段');assert.equal(action.className,'square');assert.equal(action.parentNode.className,'toolbar sidebar-footer');action.click();assert.equal(calls,1);f.nav.stop();action.click();assert.equal(calls,1);
});
for(const [label,callback] of [['已保存片段','onSnippetsRequest'],['备份与导入','onBackupRequest'],['本地数据恢复','onRecoveryRequest']])test('settings '+label+' dispatches once and stale scope/closed controls are inert',t=>{
 let calls=0;const f=setup(t,'workspace',{[callback]:()=>calls++});f.button('工作空间设置').click();const original=f.button(label);original.click();assert.equal(calls,1);f.button('关闭设置').click();original.click();assert.equal(calls,1);
 f.button('工作空间设置').click();const prior=f.button(label);const next=projection();next.scope='scopeB';f.nav.updateFrameProjection(next);prior.click();assert.equal(calls,1);assert.equal(f.button(label),undefined);
});
function searchDTO(){const value=projection(),ref=row('current_chat');ref.snippetMatches=[{id:'selected_snippet',preview:'Saved text'}];value.current={refId:ref.id,projectId:null,nativeUrl:ref.nativeUrl};value.search={...page([ref],1,0,24),query:'Saved',projectId:null};return value;}
test('search snippet locate displays text and dispatches exact selected ID with pending and stop guards',async t=>{
 let release;const calls=[],f=setup(t,'workspace',{onSnippetLocateRequest:v=>{calls.push(v);return new Promise(resolve=>{release=resolve;});}});f.nav.updateFrameProjection({...searchDTO(),scope:'searchScope'});const action=f.button('定位片段');assert(action);assert.equal(visibleText(action),'定位片段');action.click();action.click();assert.deepEqual(calls,[{id:'selected_snippet'}]);assert.equal(action.disabled,true);f.nav.stop();release({ok:true});await tick();action.click();assert.equal(calls.length,1);
});

function sparse(role='workspace',count=1){const dto=projection(role);dto.groups=page(dto.groups.items.slice(0,count),count,0,24);dto.entries.unknown={...page(Array.from({length:5},(_,i)=>({...row('U'+i),membership:'UNKNOWN'})),19),inventoryTotal:19};return dto;}
const unknownDisclosure=f=>f.pane().querySelector('[data-free-list="unknown"]').querySelector('.inventory-toggle');
test('sparse first home opens five UNKNOWN rows, +12 uses owner query; manual fold survives refresh, restore and private enrichment',async t=>{
 let saved;const calls=[],f=fixture('workspace',q=>{calls.push(q);const dto=sparse();dto.selection={...page(Array.from({length:q.rowLimit},(_,i)=>({...row('U'+i),membership:'UNKNOWN'})),19,0,q.rowLimit),groupId:null,list:'unknown'};return dto;},null,null,{}, {onViewChange:v=>{saved=structuredClone(v);}});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(sparse());assert.equal(unknownDisclosure(f).getAttribute('aria-expanded'),'true');assert.equal(f.pane().querySelector('[data-free-list="unknown"]').querySelectorAll('[data-ref-id]').length,5);
 f.button('显示更多其他已知聊天').click();await tick();assert.equal(calls.at(-1).rowLimit,17);unknownDisclosure(f).click();assert.equal(unknownDisclosure(f).getAttribute('aria-expanded'),'false');
 const layout=structuredClone(saved);delete layout.freeSession;f.nav.updateFrameProjection(sparse('workspace',0));assert.equal(unknownDisclosure(f).getAttribute('aria-expanded'),'false');
 const restored=fixture();t.after(()=>restored.nav.stop());restored.nav.restoreFrameView(layout);restored.nav.updateFrameProjection(sparse());assert.equal(unknownDisclosure(restored).getAttribute('aria-expanded'),'false');assert.deepEqual(saved.inventoryChoices,[['home',false]]);
});
test('initial multiple projects do not acquire sparse default when later projection shrinks; sidebar choice is independent',t=>{
 const f=fixture(),side=fixture('sidebar');t.after(()=>{f.nav.stop();side.nav.stop();});f.nav.updateFrameProjection(sparse('workspace',2));assert.equal(unknownDisclosure(f).getAttribute('aria-expanded'),'false');f.nav.updateFrameProjection(sparse());assert.equal(unknownDisclosure(f).getAttribute('aria-expanded'),'false');side.nav.updateFrameProjection(sparse('sidebar'));assert.equal(unknownDisclosure(side).getAttribute('aria-expanded'),'false');
});
for(const mode of ['new-tab-preserve-current','same-tab','native-control'])test('new-tab preview follows actual navigation plan: '+mode,t=>{
 const f=fixture('workspace',()=>null,null,null,{nativeHref:u=>u,navigationPlan:r=>({targetKey:'t',mountId:'m',uiGrantId:'g',plan:{mode:mode==='native-control'?mode:'href',planRevision:1,disposition:mode,target:{kind:'resolved',entity:'conversation',nativeId:r.id,navigationURL:r.nativeUrl}}})},{onDispatch:()=>{throw Error('preview must not dispatch');}});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(sparse());const a=f.pane().querySelector('[data-ref-id="U0"]');assert.equal(!!a.querySelector('.new-tab-notice'),mode==='new-tab-preserve-current');if(mode==='new-tab-preserve-current')assert.match(a.getAttribute('title'),/保留当前页面，在新标签打开/);
});

test('native management pauses only repeated IDs, keeps missing members and restores original choice',t=>{
 const f=fixture('sidebar',()=>null,null,null,{}, {nativeSidebar:true});t.after(()=>f.nav.stop());const dto=projection('sidebar'),g=dto.groups.items[0];g.lists.current.items.push({...row('retained'),membership:'P',projectId:g.id});f.nav.updateFrameProjection(dto);
 const rows=[...g.lists.current.items,...g.lists.unknown.items],first=rows[0];assert(first);
 f.nav.setNativeManagement([{projectId:g.id,refIds:[first.id]}]);assert(f.pane().querySelector('.native-management-context'));
 assert.equal(f.pane().querySelectorAll('a').some(n=>n.dataset?.refId===first.id),false);
 for(const r of rows.slice(1))assert(f.pane().querySelector('[data-ref-id="'+r.id+'"]'),'nonduplicate member retained');
 assert(f.pane().querySelector('[data-free-list="unknown"]'));
 f.nav.setNativeManagement([]);assert.equal(f.pane().querySelector('.native-management-context'),null);
 f.nav.setNativeManagement([{projectId:g.id,refIds:[first.id]}]);f.nav.updateFrameProjection({...dto,scope:'different'});assert.equal(f.pane().querySelector('.native-management-context'),null);
});
test('local data is one settings entry and invokes private extension action only on user activation',async t=>{
 let calls=0;const f=setup(t,'sidebar',{onLocalDataRequest:async()=>{calls++;return {ok:true};}});assert.equal(calls,0);const button=f.button('本地资料');assert(button);assert.equal(button.parentNode.tagName.toLowerCase(),'details');button.click();await tick();assert.equal(calls,1);
});
