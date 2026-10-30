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
test('unconfirmed local asset settings explain the prerequisite and cannot dispatch; a fresh personal page enables them',t=>{
 let calls=0;const f=setup(t,'workspace',{onBackupRequest:()=>calls++,onRecoveryRequest:()=>calls++});
 f.nav.updateFrameProjection({...projection(),localAssetAccess:'confirmation-required'});f.button('工作空间设置').click();
 const previous=[];for(const label of ['备份与导入','本地数据恢复']){const action=f.button(label);previous.push(action);assert.equal(action.disabled,true);assert.equal(action.getAttribute('aria-describedby'),'vaiwl-local-assets-note');action.click();}assert.equal(calls,0);
 assert.match(visibleText(f.pane()),/确认本地空间后再使用备份或恢复/);
 const next={...projection(),scope:'confirmed-personal',localAssetAccess:'available'};f.nav.updateFrameProjection(next);f.button('工作空间设置').click();
 for(const action of previous)action.click();assert.equal(calls,0,'retired session controls remain inert');
 for(const label of ['备份与导入','本地数据恢复']){const action=f.button(label);assert.notEqual(action.disabled,true);action.click();}assert.equal(calls,2);
 assert.throws(()=>f.nav.updateFrameProjection({...next,localAssetAccess:'trust-me'}),/invalid-frame-local-assets/);
});
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

for(const eventType of ['pointerdown','compositionstart'])test('native management reply preserves an active '+eventType+' target until interaction completes',async t=>{
 const f=fixture('sidebar',()=>null,null,null,{}, {nativeSidebar:true});t.after(()=>f.nav.stop());
 const dto=projection('sidebar'),g=dto.groups.items[0],ref=g.lists.current.items[0];f.nav.updateFrameProjection(dto);f.button('侧栏项目 '+g.name).click();await tick();
 const target=f.pane().querySelector('[data-ref-id="'+ref.id+'"]');assert(target);
 const owned=f.nav.roots().sidebar.n,event={pointerId:7,composedPath:()=>[target,owned]};f.doc.handlers.get(eventType)(event);
 f.nav.setNativeManagement([{projectId:g.id,refIds:[ref.id]}]);
 assert.equal(f.pane().querySelector('[data-ref-id="'+ref.id+'"]'),target,'background management update replaced the in-flight target');
 assert.equal(f.pane().querySelector('.native-management-context'),null);
 f.doc.handlers.get(eventType==='pointerdown'?'pointerup':'compositionend')(event);
 await new Promise(resolve=>setTimeout(resolve,5));assert(f.pane().querySelector('.native-management-context'));
 assert.equal(f.pane().querySelectorAll('a').some(n=>n.dataset?.refId===ref.id),false);
});
test('scope invalidation clears a queued management presentation immediately',async t=>{
 const f=fixture('sidebar',()=>null,null,null,{}, {nativeSidebar:true});t.after(()=>f.nav.stop());const dto=projection('sidebar'),g=dto.groups.items[0];f.nav.updateFrameProjection(dto);
 f.doc.handlers.get('pointerdown')({pointerId:9,composedPath:()=>[f.nav.roots().sidebar.n]});
 f.nav.setNativeManagement([{projectId:g.id,refIds:[]}]);f.nav.invalidate('scope-revoked');assert.equal(f.nav.roots(),null);
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.nav.roots(),null);
});

for(const kind of ['enter-reading','show-native-page'])test('queued '+kind+' also consumes the latest management paint without losing the active target',async t=>{
 const f=fixture('sidebar',()=>null,null,null,{}, {nativeSidebar:true});t.after(()=>f.nav.stop());const dto=projection('sidebar'),g=dto.groups.items[0],ref=g.lists.current.items[0];f.nav.updateFrameProjection(dto);f.button('侧栏项目 '+g.name).click();await tick();
 const target=f.pane().querySelector('[data-ref-id="'+ref.id+'"]'),event={pointerId:17,composedPath:()=>[target,f.nav.roots().sidebar.n]};assert(target);f.doc.handlers.get('pointerdown')(event);
 f.nav.setNativeManagement([{projectId:g.id,refIds:[ref.id]}]);assert.equal(f.nav.present({kind}),true);assert.equal(f.pane().querySelector('[data-ref-id="'+ref.id+'"]'),target);
 f.doc.handlers.get('pointerup')(event);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.nav.view().mode,'reading');assert(f.pane().querySelector('.native-management-context'));assert.equal(f.pane().querySelectorAll('a').some(n=>n.dataset?.refId===ref.id),false);
});

function memberState(role='workspace'){
 const dto=projection(role),group={...dto.groups.items[0],memberCount:0,lists:{current:page(),old:page(),unknown:page()}};
 dto.groups=page([group],1,0,24);dto.entries={noProject:{...page(),inventoryTotal:0},unknown:{...page(),inventoryTotal:0}};return {dto,group};
}
test('a project with no known displayable members explains discovery without claiming the native project is empty',t=>{
 const f=fixture();t.after(()=>f.nav.stop());const {dto,group}=memberState();f.nav.updateFrameProjection(dto);
 const card=f.pane().querySelector('.card'),note=card.querySelector('.members-empty');assert(note);assert.equal(visibleText(note),'尚未发现可显示的成员');assert.equal(note.tagName.toLowerCase(),'p');assert.equal(note.hasAttribute('tabindex'),false);
 const known={...row('discovered'),membership:'PROJECT',projectId:group.id};group.memberCount=1;group.lists.unknown=page([known]);f.nav.updateFrameProjection(dto);
 assert.equal(f.pane().querySelector('.members-empty'),null);assert(f.pane().querySelector('[data-ref-id="discovered"]'),'a later confirmed member replaces the note');
});
for(const kind of ['current','old','unknown'])test('known '+kind+' members never become a discovery-empty message after pagination or collapse',t=>{
 const f=fixture();t.after(()=>f.nav.stop());const {dto,group}=memberState();group.memberCount=7;group.lists[kind]=page([],7,7,5);f.nav.updateFrameProjection(dto);
 assert.equal(f.pane().querySelector('.members-empty'),null);if(kind==='old')assert(f.button('展开旧聊天 '+group.name),'collapsed old members remain known');else assert(f.button('返回前页 '+group.name),'an exhausted page retains its previous-page action');
});
test('a known count with filtered rows, an unknown count or an out-of-page current member does not claim no members were found',t=>{
 const f=fixture();t.after(()=>f.nav.stop());const {dto,group}=memberState();
 group.memberCount=2;f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelector('.members-empty'),null,'empty presentation lists cannot erase a positive inventory');
 delete group.memberCount;f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelector('.members-empty'),null,'an absent inventory count is not zero');
 group.memberCount=0;dto.current={nativeUrl:'https://chatgpt.com/c/outside',projectId:group.id,refId:'outside'};f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelector('.members-empty'),null,'the current member is positive evidence even outside its list window');
 delete dto.current;group.lists.current=page([],0,5,5);f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelector('.members-empty'),null,'an offset beyond an emptied page is not a fresh discovery result');
});
test('an effective selected member page and native management suppression cannot create the discovery-empty message',t=>{
 const main=fixture(),side=fixture('sidebar',()=>null,null,null,{}, {nativeSidebar:true});t.after(()=>{main.nav.stop();side.nav.stop();});
 const {dto,group}=memberState(),known={...row('known'),membership:'PROJECT',projectId:group.id};dto.selection={groupId:group.id,list:'current',...page([known])};main.nav.updateFrameProjection(dto);assert.equal(main.pane().querySelector('.members-empty'),null);assert(main.pane().querySelector('[data-ref-id="known"]'));
 const sidebar=memberState('sidebar');sidebar.group.memberCount=1;sidebar.group.lists.current=page([known]);side.nav.updateFrameProjection(sidebar.dto);side.nav.setNativeManagement([{projectId:sidebar.group.id,refIds:[known.id]}]);assert(side.pane().querySelector('.native-management-context'));assert.equal(side.pane().querySelector('.members-empty'),null);assert.equal(side.pane().querySelectorAll('a').some(n=>n.dataset?.refId===known.id),false,'the known duplicate is owned by native management');
});
