import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../host/navigation-frame-calibration-entry.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// Independent owner oracle materializes every requested presentation window in
// one fresh DTO. It never reuses previous DTO rows and does not grant authority.
function response(query={},scope='scopeA',stamp='fresh'){
 const value=projection();value.scope=scope;value.groups.total=2;value.groups.hasMore=false;
 const make=(id,kind,offset=0,limit=5)=>page(Array.from({length:Math.min(limit,30-offset)},(_,n)=>({...row(`${id}_${kind}_${offset+n}`),nativeTitle:`${stamp} ${id} ${kind} ${offset+n}`,displayTitle:`${stamp} ${id} ${kind} ${offset+n}`})),30,offset,limit);
 for(const group of value.groups.items){group.name=group.nativeName=group.id;for(const kind of ['current','old','unknown'])group.lists[kind]=make(group.id,kind);}
 for(const w of query.rowWindows??[]){if(w.groupId===null)value.entries[w.list]={...make('entry',w.list,w.rowOffset,w.rowLimit),inventoryTotal:30};else value.groups.items.find(g=>g.id===w.groupId).lists[w.list]={...make(w.groupId,w.list,w.rowOffset,w.rowLimit),...(w.paged?{paged:true}:{})};}
 if(query.list){const groupId=query.groupId??null,p=make(groupId??'entry',query.list,query.rowOffset??0,query.rowLimit??5);value.selection={...p,groupId,list:query.list};if(groupId===null)value.entries[query.list]={...p,inventoryTotal:30};else value.groups.items.find(g=>g.id===groupId).lists[query.list]=p;}
 return value;
}
const card=(f,id)=>f.pane().querySelectorAll('[data-theme-id]').find(n=>n.getAttribute('data-theme-id')===id);
const control=(f,id,label)=>card(f,id).querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label);
const rows=(f,id,kind)=>card(f,id).querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id').startsWith(id+'_'+kind+'_'));
function setup(t){const calls=[];let hold=null,stamp='initial';const f=fixture('workspace',q=>{calls.push(structuredClone(q));return hold?hold(q):response(q,'scopeA',stamp);});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());return {f,calls,setStamp:v=>{stamp=v;},setHold:v=>{hold=v;}};}
async function expandRecent(f,id){control(f,id,'显示更多近期窗口').click();await tick();assert.equal(rows(f,id,'current').length,17);}
test('opening old five retains all seventeen recent rows from the same fresh response',async t=>{
 const {f,calls,setStamp}=setup(t);await expandRecent(f,'P2');setStamp('after-old');control(f,'P2','展开旧窗口 P2').click();await tick();assert.equal(rows(f,'P2','old').length,5);assert.equal(rows(f,'P2','current').length,17);
 assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('after-old')),'retained capacity must be freshly materialized, not cached rows');assert(calls.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});
test('another Project expansion and reading return preserve both earlier visible windows',async t=>{
 const {f,setStamp}=setup(t);await expandRecent(f,'P2');control(f,'P2','展开旧窗口 P2').click();await tick();setStamp('after-other');await expandRecent(f,'P1');assert.equal(rows(f,'P2','current').length,17);assert.equal(rows(f,'P2','old').length,5);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('after-other')));
 f.nav.enterReading();f.nav.showWorkspace();await tick();assert.equal(rows(f,'P2','current').length,17);assert.equal(rows(f,'P2','old').length,5);assert.equal(rows(f,'P1','current').length,17);
});
test('scope replacement rejects delayed old windows without mixing old rows or carrying their capacity',async t=>{
 const {f,calls,setHold}=setup(t);await expandRecent(f,'P2');let release;setHold(q=>new Promise(resolve=>{release=()=>resolve(response(q,'scopeA','late-A'));}));control(f,'P2','展开旧窗口 P2').click();await tick();
 f.nav.updateFrameProjection(response({},'scopeB','new-B'));release();await tick();assert.equal(rows(f,'P2','current').length,5);assert.equal(rows(f,'P2','old').length,0);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith('new-B')));
 setHold(()=>null);control(f,'P1','显示更多近期窗口').click();await tick();assert(!(calls.at(-1).rowWindows??[]).some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});


test('Project page away and back restores seventeen rows freshly from the owner',async t=>{
 let stamp='initial';const requests=[];
 const owner=q=>{const value=response(q,'scopeA',stamp);value.groups={...value.groups,items:value.groups.items.slice(q.offset??0,(q.offset??0)+1),total:2,offset:q.offset??0,limit:1,hasMore:(q.offset??0)===0};return value;};
 const f=fixture('workspace',q=>{requests.push(q);return owner(q);});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(owner({offset:0}));await expandRecent(f,'P2');
 f.button('显示更多项目').click();await tick();assert(card(f,'P1'));assert.equal(card(f,'P2'),undefined);stamp='returned-fresh';f.button('返回前页项目').click();await tick();
 assert.equal(rows(f,'P2','current').length,17);assert(rows(f,'P2','current').every(n=>n.querySelector('.window-title').textContent.startsWith(stamp)));assert(requests.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.rowLimit===17));
});

test('successful paged five fallback survives another list then preserves next and previous offsets',async t=>{
 const calls=[];let fallback=false;
 const f=fixture('workspace',q=>{
  calls.push(structuredClone(q));let effective=q;
  if(!fallback&&q.groupId==='P2'&&q.list==='current'&&q.rowLimit===17){fallback=true;effective={...q,rowLimit:5};}
  const value=response(effective,'scopeA','fresh-page');
  if(value.selection&&q.groupId==='P2'&&q.list==='current'&&(fallback||q.rowWindows?.some(w=>w.groupId==='P2'&&w.list==='current'&&w.paged)))value.selection.paged=true;
  return value;
 });t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());
 control(f,'P2','显示更多近期窗口').click();await tick();assert.equal(rows(f,'P2','current').length,5);assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');
 control(f,'P2','展开旧窗口 P2').click();await tick();assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');assert(calls.at(-1).rowWindows.some(w=>w.groupId==='P2'&&w.list==='current'&&w.paged===true&&w.rowLimit===5));
 control(f,'P2','显示更多近期窗口').click();await tick();assert.equal(calls.at(-1).rowOffset,5);assert.equal(calls.at(-1).rowLimit,5);assert.equal(rows(f,'P2','current')[0].getAttribute('data-ref-id'),'P2_current_5');
 control(f,'P2','返回前页 P2').click();await tick();assert.equal(calls.at(-1).rowOffset,0);assert.equal(calls.at(-1).rowLimit,5);assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');assert.equal(rows(f,'P2','current')[0].getAttribute('data-ref-id'),'P2_current_0');
});

// Search/workset pages deliberately omit unrelated expanded rows. Reading may
// receive a normal five-row owner refresh before the user takes the sole return.
for(const mode of ['search','workingSet'])for(const background of [false,true])test(`${mode} native reading return keeps its route then explicit close rematerializes expanded windows (background=${background})`,async t=>{
 const calls=[];let stamp='before';
 const f=fixture('workspace',q=>{
  calls.push(structuredClone(q));const dto=response(q,'scopeA',stamp);
  if(q.search)dto.search={...q.search,...page([row('P2_current_0')],1,0,24)};
  if(q.workingSet)dto.workingSet={...page([row('P2_current_0')],1,0,24),currentRefId:'P2_current_0'};
  return dto;
 },null,null,{nativeHref:u=>u,navigationPlan:r=>({targetKey:'target',uiGrantId:'grant',mountId:'mount',plan:{mode:'same-target',planRevision:1,target:{kind:'resolved',entity:'conversation',nativeId:r.id,navigationURL:r.nativeUrl}}})},{onDispatch:async()=>({state:'already-current'})});
 t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());await expandRecent(f,'P2');await expandRecent(f,'P1');
 f.nav.present({kind:mode==='search'?'search-known':'show-working-set'});await tick();
 if(mode==='search'){const input=f.pane().querySelector('input');input.value='specific title';input.oninput({});await tick();}
 const specialQuery=structuredClone(calls.at(-1));
 assert.equal(calls.at(-1).rowWindows,undefined,'special pages must not fetch unrelated expanded rows');
 f.pane().querySelector('[data-ref-id="P2_current_0"]').click();await tick();assert.equal(f.nav.view().mode,'reading');
 if(background)f.nav.updateFrameProjection(response({},'scopeA','background'));
 stamp='returned';const beforeReturn=calls.length;assert.equal(f.nav.workspaceEntered(),true);await tick();
 assert.equal(calls.length,beforeReturn,'four-square return must not reset the special-page query');
 const closeLabel=mode==='search'?'关闭已知查找':'返回主题视图';assert(f.button(closeLabel),'return retains the special-page exit');
 if(mode==='search')assert.equal(f.pane().querySelector('input').value,'specific title');
 if(background){
  const fresh=response(specialQuery,'scopeA','fresh-special');const items=[{...row('P2_current_0'),nativeTitle:'fresh returned result',displayTitle:'fresh returned result'}];
  if(mode==='search')fresh.search={...specialQuery.search,...page(items,1,0,24)};else fresh.workingSet={...page(items,1,0,24),currentRefId:'P2_current_0'};
  f.nav.updateFrameProjection(fresh);await tick();
 }
 assert(f.pane().querySelector('[data-ref-id="P2_current_0"]'),'fresh special-page result remains usable before explicit close');
 f.button(closeLabel).click();await tick();
 for(const id of ['P2','P1']){assert.equal(rows(f,id,'current').length,17);assert(rows(f,id,'current').every(n=>n.querySelector('.window-title').textContent.startsWith('returned')));}
 assert.equal(calls.at(-1).search,undefined);assert.equal(calls.at(-1).workingSet,undefined);
});

for(const change of ['scope','segment','session'])test(`special-page window memory cannot survive changed ${change}`,async t=>{
 const {f,calls}=setup(t);await expandRecent(f,'P2');f.nav.present({kind:'search-known'});await tick();f.nav.enterReading();
 const dto=response({},change==='scope'?'scopeB':'scopeA','new-context');
 if(change==='segment'){dto.segment=1;dto.navigation.hasNewer=true;}
 if(change==='session')dto.viewSession={...dto.viewSession,T:dto.viewSession.T+1};
 f.nav.updateFrameProjection(dto);const before=calls.length;f.nav.workspaceEntered();await tick();
 assert.equal(calls.length,before);assert.equal(f.nav.view().capacities.size,0);
 if(change!=='scope'){f.button('关闭已知查找').click();await tick();assert(!(calls.at(-1).rowWindows??[]).some(w=>w.rowLimit===17));}
 assert.equal(rows(f,'P2','current').length,5);
});
test('special-page return still accepts the existing byte-bounded five-row pagination fallback',async t=>{
 let search=false;const calls=[];
 const f=fixture('workspace',q=>{calls.push(q);if(q.search){search=true;return {...response(),search:{...q.search,...page([],0,0,24)}};}
  const effective=search?{...q,rowWindows:q.rowWindows?.map(w=>({...w,rowLimit:5,paged:true}))}:q;
  return response(effective);
 });t.after(()=>f.nav.stop());f.nav.updateFrameProjection(response());await expandRecent(f,'P2');f.nav.present({kind:'search-known'});await tick();f.nav.enterReading();f.nav.workspaceEntered();await tick();
 f.button('关闭已知查找').click();await tick();
 assert.equal(rows(f,'P2','current').length,5);assert.equal(control(f,'P2','显示更多近期窗口').textContent,'下一页');
 control(f,'P2','展开旧窗口 P2').click();await tick();assert.equal(calls.at(-1).rowWindows[0].rowLimit,5);assert.equal(calls.at(-1).rowWindows[0].paged,true);
});

test('current Project outside the page is expanded with members and explicit collapse survives fresh DTOs',async t=>{
 const value=projection('sidebar'),selected=value.groups.items.shift();value.groups=page(value.groups.items,1,0,24);selected.segment=3;
 value.currentProject=selected;value.current={nativeUrl:'https://chatgpt.com/c/P2_0',refId:'P2_0',projectId:'P2'};
 const calls=[],f=fixture('sidebar',query=>{calls.push(query);return structuredClone(value);});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(value);
 const toggle=f.button('侧栏项目 Original P2');assert.equal(toggle.getAttribute('aria-expanded'),'true');assert(f.pane().querySelectorAll('[data-ref-id]').some(n=>n.getAttribute('data-ref-id')==='P2_0'));
 toggle.click();assert.equal(f.button('侧栏项目 Original P2').getAttribute('aria-expanded'),'false');f.nav.updateFrameProjection(structuredClone(value));assert.equal(f.button('侧栏项目 Original P2').getAttribute('aria-expanded'),'false');
 f.button('侧栏项目 Original P2').click();await tick();assert.equal(calls.at(-1).groupId,'P2');assert.equal(f.button('侧栏项目 Original P2').getAttribute('aria-expanded'),'true');
 const invalid=structuredClone(value);invalid.current.projectId='P1';assert.throws(()=>f.nav.updateFrameProjection(invalid),/invalid-frame-current-project/);
});


test('current member outside row window stays inside its expanded owning theme',async t=>{
 const value=projection('sidebar'),selected=value.groups.items[0];
 value.current={nativeUrl:'https://chatgpt.com/c/current-away',refId:'current-away',projectId:selected.id};
 value.currentRef={...row('current-away'),available:true,membership:'PROJECT',projectId:selected.id};
 const f=fixture('sidebar',()=>structuredClone(value));t.after(()=>f.nav.stop());f.nav.updateFrameProjection(value);
 const group=f.pane().querySelectorAll('.group').find(n=>n.querySelectorAll('[data-ref-id]').some(r=>r.getAttribute('data-ref-id')==='current-away'));
 assert(group,'current row is in the owning expanded theme, not detached after all groups');
 assert.equal(f.pane().querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id')==='current-away').length,1);
 f.button('侧栏项目 '+selected.name).click();f.nav.updateFrameProjection(structuredClone(value));
 assert.equal(f.button('侧栏项目 '+selected.name).getAttribute('aria-expanded'),'false');
 assert.equal(f.pane().querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id')==='current-away').length,1,'collapsed theme keeps current conversation reachable');
});

test('current theme leads sidebar without reordering the owner page or overriding manual fold',async t=>{
 const value=projection('sidebar');value.current={nativeUrl:'https://chatgpt.com/c/P1_0',refId:'P1_0',projectId:'P1'};
 const f=fixture('sidebar',()=>structuredClone(value));t.after(()=>f.nav.stop());f.nav.updateFrameProjection(value);
 const heads=()=>f.pane().querySelectorAll('.theme-toggle');
 assert.deepEqual(heads().map(n=>n.getAttribute('aria-label')),['侧栏项目 Original P1','侧栏项目 Original P2']);
 assert.equal(heads()[0].getAttribute('data-current-project'),'true');assert.equal(heads()[1].getAttribute('data-current-project'),'false');
 assert.deepEqual(value.groups.items.map(g=>g.id),['P2','P1'],'projection is not mutated');
 heads()[0].click();f.nav.updateFrameProjection(structuredClone(value));assert.equal(heads()[0].getAttribute('aria-expanded'),'false');
 value.current={nativeUrl:'https://chatgpt.com/c/P2_0',refId:'P2_0',projectId:'P2'};f.nav.updateFrameProjection(value);
 assert.equal(heads()[0].getAttribute('aria-label'),'侧栏项目 Original P2');assert.equal(heads()[1].getAttribute('data-current-project'),'false');
});

for(const membership of ['UNKNOWN','NONE'])test(`standalone ${membership} current chat leads sidebar once, without changing membership or inventory`,async t=>{
 const value=projection('sidebar'),ref={...row('standalone'),available:true,membership,projectId:null},kind=membership==='UNKNOWN'?'unknown':'noProject';
 value.current={nativeUrl:ref.nativeUrl,refId:ref.id,projectId:null};value.currentRef=ref;
 value.entries[kind]={...page([ref,row('other')],2,0,5),inventoryTotal:2};
 const f=fixture('sidebar',()=>structuredClone(value));t.after(()=>f.nav.stop());f.nav.updateFrameProjection(value);
 if(membership==='UNKNOWN')f.button('其他已知聊天').click();
 const check=()=>{const list=f.pane().querySelector('.themes');assert.equal(list.children[0].getAttribute('class'),'current-context');assert.equal(list.children[0].getAttribute('data-current-membership'),membership);assert.equal(list.querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id')===ref.id).length,1);assert(list.querySelectorAll('[data-ref-id]').some(n=>n.getAttribute('data-ref-id')==='other'));};
 check();f.nav.updateFrameProjection(structuredClone(value));check();assert.equal(value.entries[kind].total,2);
});
