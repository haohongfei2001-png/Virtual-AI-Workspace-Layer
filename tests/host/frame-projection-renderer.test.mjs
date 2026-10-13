import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../../src/navigation/navigation.mjs';
// Small DOM double exercises the existing renderer's event/data paths. Browser
// layout and screenshots remain separate real-MV3 acceptance.
function dom(){
 let doc;
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.style={};this.events={};this.isConnected=true;this.scrollTop=0;this.clientWidth=0;this.clientHeight=0;this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  hasAttribute(k){return k in this.attrs;}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.isConnected=false;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  cloneNode(){const n=new Element(this.tagName);n.attrs={...this.attrs};return n;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(){}
  click(){for(const fn of this.events.click??[])fn({button:0,preventDefault(){},composedPath:()=>[this]});}
  focus(){}
  getBoundingClientRect(){return {height:0,width:0};}
  matches(selector){const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return selector.startsWith('.')?(this.className??'').split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){const direct=selector.startsWith(':scope > ');if(direct)selector=selector.slice(9);const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);if(!direct)walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
 }
 doc={defaultView:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},crypto},addEventListener(){},removeEventListener(){},createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onHorizonRequest,onWorkingSetRequest,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
test('bounded DTO uses original names/order and always renders NONE/UNKNOWN entries',()=>{const f=fixture();f.nav.updateFrameProjection(projection());assert.deepEqual(f.pane().querySelectorAll('[data-theme-id]').map(n=>n.getAttribute('data-theme-id')),['P2','P1']);assert.ok(f.pane().querySelectorAll('.theme-name').some(n=>n.textContent==='Original P2'));assert.deepEqual(f.pane().querySelectorAll('[data-free-list]').map(n=>n.getAttribute('data-free-list')),['noProject','unknown']);assert.ok(f.button('显示更多近期窗口'));assert.ok(f.button('显示更多项目'));assert.equal(f.button('较早的30日').disabled,false);});
test('more/old/history issue bounded owner queries instead of treating preview as complete',async()=>{
 const calls=[],f=fixture('workspace',q=>{calls.push(q);return null;});f.nav.updateFrameProjection(projection());f.button('显示更多近期窗口').click();assert.deepEqual(calls[0],{role:'workspace',segment:0,offset:0,limit:24,groupId:'P2',list:'current',rowOffset:0,rowLimit:17});f.button('展开旧窗口 Original P2').click();assert.equal(calls[1].list,'old');f.button('显示更多项目').click();assert.equal(calls[2].offset,24);f.button('较早的30日').click();assert.equal(calls[3].segment,1);assert.equal(calls[3].offset,0);f.nav.stop();
});
test('owner selected rows replace bounded page and accurate total keeps more reachable',async()=>{
 const f=fixture('workspace',q=>{const dto=projection();dto.selection={groupId:q.groupId,list:q.list,...page(Array.from({length:17},(_,i)=>row(`page_${i}`)),1000,0,17)};return dto;});f.nav.updateFrameProjection(projection());f.button('显示更多近期窗口').click();await tick();assert.equal(f.pane().querySelectorAll('[data-ref-id]').filter(n=>n.getAttribute('data-ref-id').startsWith('page_')).length,17);assert.ok(f.button('显示更多近期窗口'));assert.ok(f.button('显示更多项目'));
});
test('sidebar expansion requests bounded group page; shared presentation intent remains owner-directed',()=>{const calls=[],f=fixture('sidebar',q=>calls.push(q));f.nav.updateFrameProjection(projection('sidebar'));f.button('侧栏主题 Original P2').click();assert.equal(calls[0].groupId,'P2');assert.equal(calls[0].rowLimit,5);f.button('查找已知项目与聊天').click();assert.deepEqual(f.intents.at(-1),{kind:'search-known',themeId:null});assert.ok(f.button('显示更多项目'));});
test('projection cannot enter unframed/full-snapshot path and wrong role is rejected',()=>{const f=fixture();assert.throws(()=>f.nav.updateFrameProjection({...projection(),completeSnapshot:true}),/invalid-frame-projection/);assert.throws(()=>f.nav.updateFrameProjection(projection('sidebar')),/invalid-frame-projection/);const doc=dom(),nav=createNavigation({document:doc,adapter:{status(){}}});assert.throws(()=>nav.updateFrameProjection(projection()),/invalid-frame-projection/);});
test('late page after scope replacement is discarded',async()=>{let finish;const f=fixture('workspace',()=>new Promise(r=>finish=r));f.nav.updateFrameProjection(projection());f.button('显示更多项目').click();f.nav.updateFrameProjection({...projection(),scope:'scopeB'});finish(projection());await tick();assert.equal(f.nav.status().scope,'scopeB');});
test('bounded DTO is rejected by ordinary snapshot update and unsolicited same-scope page fences pending replies',async()=>{let finish;const f=fixture('workspace',()=>new Promise(r=>finish=r));assert.throws(()=>f.nav.update(projection()),/frame-projection-requires-explicit-consumer/);f.nav.updateFrameProjection(projection());f.button('显示更多项目').click();const fresh=projection();fresh.groups.items[0].name='Fresh owner name';f.nav.updateFrameProjection(fresh);finish(projection());await tick();assert.ok(f.pane().querySelectorAll('.theme-name').some(n=>n.textContent==='Fresh owner name'));});
test('last-known card and rows append accessible labels without changing original names or ordering',()=>{
 const f=fixture(),dto=projection();dto.groups.items[0].freshness='last-known';dto.groups.items[0].lists.current.items[0].freshness='last-known';dto.groups.items[1].freshness='current';dto.entries.unknown.items[0].freshness='last-known';
 f.nav.updateFrameProjection(dto);
 assert.deepEqual(f.pane().querySelectorAll('[data-theme-id]').map(n=>n.getAttribute('data-theme-id')),['P2','P1']);
 const card=f.pane().querySelector('[data-theme-id="P2"]');assert.equal(card.querySelector('.theme-name').textContent,'Original P2');assert.equal(card.querySelector('h2').querySelector('.freshness-label').textContent,'上次确认');
 const link=card.querySelector('[data-ref-id="P2_0"]');assert.equal(link.querySelector('.window-title').textContent,'Native P2_0');assert.equal(link.getAttribute('title'),'Native P2_0');assert.equal(link.querySelector('.freshness-label').textContent,'上次确认');assert.equal(link.querySelector('.freshness-label').getAttribute('aria-hidden'),null);
 assert.equal(f.pane().querySelector('[data-theme-id="P1"]').querySelector('.freshness-label'),null);
 assert.equal(f.pane().querySelector('[data-ref-id="unknown"]').querySelector('.freshness-label').textContent,'上次确认');
 dto.groups.items[0].freshness='current';dto.groups.items[0].lists.current.items[0].freshness='current';dto.entries.unknown.items[0].freshness='current';f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelectorAll('.freshness-label').length,0);f.nav.stop();
});
test('sidebar last-known qualifier is included in the button accessible name and cleared across scope',()=>{
 const f=fixture('sidebar'),dto=projection('sidebar');dto.groups.items[0].freshness='last-known';f.nav.updateFrameProjection(dto);
 const button=f.button('侧栏主题 Original P2，上次确认');assert.ok(button);assert.equal(button.querySelector('.theme-name').textContent,'Original P2');assert.equal(button.querySelector('.freshness-label').textContent,'上次确认');
 f.nav.updateFrameProjection({...projection('sidebar'),scope:'scopeB'});assert.equal(f.pane().querySelectorAll('.freshness-label').length,0);assert.ok(f.button('侧栏主题 Original P2'));f.nav.stop();
});
test('bounded current IDs select loaded group and row without a full index',()=>{const f=fixture('sidebar'),dto=projection('sidebar');dto.current={nativeUrl:'https://chatgpt.com/c/P1_0',refId:'P1_0',projectId:'P1'};f.nav.updateFrameProjection(dto);assert.equal(f.nav.currentRef().id,'P1_0');assert.equal(f.button('侧栏主题 Original P1').getAttribute('aria-expanded'),'true');assert.equal(f.pane().querySelectorAll('[aria-current]').find(n=>n.getAttribute('data-ref-id')==='P1_0').getAttribute('aria-current'),'page');assert.equal(f.nav.view().segment,0);});
test('current can locate a loaded selection page, but absent refs are never invented',()=>{const f=fixture(),dto=projection();dto.current={nativeUrl:'https://chatgpt.com/c/selected',refId:'selected',projectId:'P1'};dto.selection={groupId:'P1',list:'current',...page([row('selected')],1000,5,5)};f.nav.updateFrameProjection(dto);assert.equal(f.nav.currentRef().id,'selected');f.nav.updateFrameProjection({...dto,current:{...dto.current,refId:'unloaded',projectId:'unloaded_project'}});assert.equal(f.nav.currentRef(),undefined);f.nav.updateFrameProjection(projection());assert.equal(f.nav.currentRef(),undefined);});
test('malformed current metadata cannot enter framed renderer',()=>{const f=fixture();for(const current of [null,{nativeUrl:'',refId:null,projectId:null},{nativeUrl:'https://chatgpt.com/',refId:[],projectId:null},{nativeUrl:'https://chatgpt.com/',refId:null,projectId:null,scope:'B'}])assert.throws(()=>f.nav.updateFrameProjection({...projection(),current}),/invalid-frame-current/);});

const searchReply=(query,items,total=items.length)=>({...projection(),search:{...query,items,total,hasMore:query.offset+items.length<total}});
test('frame search requests owner inventory, shows waiting and uses bounded 24-row pages',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});
 assert.deepEqual(calls[0].search,{query:'',projectId:null,offset:0,limit:24});assert(f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent.includes('正在查找')));
 pending.shift()(searchReply(calls[0].search,[row('remote_only')],50));await tick();assert(f.pane().querySelector('[data-ref-id="remote_only"]'));assert(!f.pane().querySelector('[data-ref-id="P2_0"]'));
 f.button('显示更多查找结果').click();assert.equal(calls[1].search.offset,24);assert.equal(calls[1].search.limit,24);pending.shift()(searchReply(calls[1].search,[row('next')],50));await tick();assert(f.pane().querySelector('[data-ref-id="next"]'));assert(f.button('返回前页查找结果'));
});
test('search input bounds and late previous query never overwrite current result',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known',themeId:'P1'});const input=f.pane().querySelector('input');input.value='x'.repeat(220);input.oninput();assert.equal(calls[1].search.query.length,200);assert.equal(calls[1].search.projectId,'P1');pending[1](searchReply(calls[1].search,[row('new')]));await tick();pending[0](searchReply(calls[0].search,[row('old')]));await tick();assert(f.pane().querySelector('[data-ref-id="new"]'));assert(!f.pane().querySelector('[data-ref-id="old"]'));
});
test('close clears owner search query and late/background search cannot reopen it',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});f.button('关闭派生查找').click();assert.equal(calls[1].search,undefined);pending[0](searchReply(calls[0].search,[row('late')]));await tick();assert.equal(f.pane().querySelector('input'),null);f.nav.updateFrameProjection(searchReply(calls[0].search,[row('late')]));assert.equal(f.pane().querySelector('input'),null);assert(!f.pane().querySelector('[data-ref-id="late"]'));
});
test('scope replacement cancels old search and sidebar delegates without requesting inventory',async()=>{
 let finish;const f=fixture('workspace',()=>new Promise(r=>finish=r));f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});f.nav.updateFrameProjection({...projection(),scope:'B'});finish(searchReply({query:'',projectId:null,offset:0,limit:24},[row('A')]));await tick();assert.equal(f.nav.status().scope,'B');assert.equal(f.pane().querySelector('input'),null);
 const calls=[],side=fixture('sidebar',q=>calls.push(q));side.nav.updateFrameProjection(projection('sidebar'));side.button('查找已知项目与聊天').click();assert.deepEqual(calls,[]);assert.equal(side.intents.at(-1).kind,'search-known');
});
test('bounded search refinement uses the returned page limit for the next offset',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(resolve=>pending.push(resolve));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});
 pending.shift()(searchReply({...calls[0].search,limit:12},[row('bounded')],40));await tick();assert(f.pane().querySelector('[data-ref-id="bounded"]'));f.button('显示更多查找结果').click();assert.equal(calls[1].search.offset,12);
});
const workReply=(items,total=items.length,offset=0,limit=24)=>({...projection(),workingSet:{...page(items,total,offset,limit),currentRefId:items[0]?.id??null}});
test('working set uses owner saved order, unavailable states and bounded refined pagination',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});assert.deepEqual(calls[0].workingSet,{offset:0,limit:24});assert(f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent.includes('正在读取')));
 pending[0](workReply([row('saved_z'),{...row('saved_a'),available:false}],30,0,2));await tick();assert.deepEqual(f.pane().querySelectorAll('[data-ref-id]').map(n=>n.getAttribute('data-ref-id')),['saved_z','saved_a']);assert.equal(f.pane().querySelector('[data-ref-id="saved_a"]').getAttribute('aria-disabled'),'true');assert.equal(f.pane().querySelector('[data-ref-id="saved_z"]').getAttribute('data-working-set-current'),'true');assert.equal(f.button('编辑当前工作集'),undefined);f.button('显示更多工作集窗口').click();assert.deepEqual(calls[1].workingSet,{offset:2,limit:24});
});
test('working set close sends ordinary page and presentation, stale result never reopens',async()=>{
 let finish;const calls=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>finish=r);});f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});const old=finish;f.button('返回主题视图').click();assert.equal(calls.at(-1).workingSet,undefined);assert.deepEqual(f.intents.at(-1),{kind:'show-workspace'});old(workReply([row('stale')]));await tick();assert(!f.pane().querySelector('[data-ref-id="stale"]'));f.nav.updateFrameProjection(workReply([row('stale')]));assert(!f.pane().querySelector('[data-ref-id="stale"]'));
});
test('search and working set are mutually exclusive and old scope results are discarded',async()=>{
 const pending=[],calls=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});f.nav.present({kind:'search-known'});assert.equal(calls[1].workingSet,undefined);assert(calls[1].search);pending[0](workReply([row('old_work')]));await tick();assert(f.pane().querySelector('input'));f.nav.present({kind:'show-working-set'});assert.equal(calls[2].search,undefined);assert.equal(f.pane().querySelector('input'),null);f.nav.updateFrameProjection({...projection(),scope:'B'});pending[2](workReply([row('old_scope')]));await tick();assert.equal(f.nav.status().scope,'B');assert(!f.pane().querySelector('[data-ref-id="old_scope"]'));
});
test('sidebar working set only delegates, and malformed working set page is rejected',()=>{
 const calls=[],f=fixture('sidebar',q=>calls.push(q));f.nav.updateFrameProjection(projection('sidebar'));f.button('当前工作集').click();assert.deepEqual(calls,[]);assert.deepEqual(f.intents.at(-1),{kind:'show-working-set'});
 const w=fixture();w.nav.updateFrameProjection(projection());assert.throws(()=>w.nav.updateFrameProjection({...workReply([]),workingSet:{...workReply([]).workingSet,limit:25}}),/invalid-frame-working-set/);
});

test('manual horizon is opt-in workspace-only with five legal options and trusted loaded anchor',async()=>{
 const calls=[],f=fixture('workspace',()=>null,async q=>{calls.push(q);return {ok:true,segment:1,viewSession:{H:7}};});const dto=projection();dto.current={nativeUrl:'https://chatgpt.com/c/P1_0',refId:'P1_0',projectId:'P1'};f.nav.updateFrameProjection(dto);const select=f.pane().querySelector('select');assert.deepEqual(select.children.map(n=>n.getAttribute('value')),['7','14','30','60','90']);assert.equal(select.value,'30');select.value='7';select.onchange();await tick();assert.deepEqual(calls,[{H:7,segment:0,anchorRefId:'P1_0'}]);assert.equal(f.nav.view().segment,0);assert.equal(f.pane().querySelector('select').value,'30','owner must publish new DTO');const legacy=fixture();legacy.nav.updateFrameProjection(projection());assert.equal(legacy.pane().querySelector('select'),null);const side=fixture('sidebar',()=>null,async()=>({ok:true}));side.nav.updateFrameProjection(projection('sidebar'));assert.equal(side.pane().querySelector('select'),null);
});
test('pending horizon blocks duplicate calls and failure preserves view with retry status',async()=>{
 let resolve;const calls=[],f=fixture('workspace',()=>null,q=>{calls.push(q);return new Promise(r=>resolve=r);});f.nav.updateFrameProjection(projection());const original=f.pane().querySelector('select');original.value='14';original.onchange();assert.equal(f.pane().querySelector('select').disabled,true);original.value='60';original.onchange();assert.equal(calls.length,1);assert.equal(calls[0].anchorRefId,null);resolve({ok:false});await tick();assert.equal(f.pane().querySelector('select').disabled,false);assert.equal(f.pane().querySelector('select').value,'30');assert(f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent.includes('失败')));assert.equal(f.nav.view().segment,0);
});
test('invalid horizon is ignored and late scope response cannot change new scope',async()=>{
 let resolve;const calls=[],f=fixture('workspace',()=>null,q=>{calls.push(q);return new Promise(r=>resolve=r);});f.nav.updateFrameProjection(projection());const select=f.pane().querySelector('select');select.value='999';select.onchange();assert.equal(calls.length,0);select.value='90';select.onchange();f.nav.updateFrameProjection({...projection(),scope:'B'});resolve({ok:false});await tick();assert.equal(f.nav.status().scope,'B');assert.equal(f.pane().querySelector('select').disabled,false);assert(!f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent.includes('失败')));
});
test('manual horizon failure never changes an existing native input node or draft',async()=>{const f=fixture('workspace',()=>null,async()=>{throw Error('denied');}),native=f.doc.createElement('textarea');native.value='UNSENT NATIVE DRAFT';f.doc.body.append(native);f.nav.updateFrameProjection(projection());const select=f.pane().querySelector('select');select.value='60';select.onchange();await tick();assert.equal(f.doc.body.children.includes(native),true);assert.equal(native.value,'UNSENT NATIVE DRAFT');assert.equal(native.isConnected,true);});
for(const role of ['workspace','sidebar'])test(role+' keeps page-external current chat independently reachable without changing page counts',()=>{
 const f=fixture(role),dto=projection(role);dto.current={nativeUrl:'https://chatgpt.com/c/ref27',refId:'ref27',projectId:null};dto.currentRef={...row('ref27'),available:true,membership:'UNKNOWN',segment:9};const total=dto.entries.unknown.total;f.nav.updateFrameProjection(dto);
 assert.equal(f.nav.currentRef().id,'ref27');const context=f.pane().querySelector('[aria-label="当前聊天"]');assert(context);assert.equal(context.getAttribute('data-current-membership'),'UNKNOWN');assert.equal(context.querySelector('[data-ref-id="ref27"]').getAttribute('aria-current'),'page');assert.equal(dto.entries.unknown.total,total);assert.equal(f.nav.view().segment,0);
 const next={...dto,current:{nativeUrl:'https://chatgpt.com/c/ref28',refId:'ref28',projectId:null},currentRef:{...dto.currentRef,id:'ref28',nativeUrl:'https://chatgpt.com/c/ref28',nativeTitle:'Native ref28',displayTitle:'Native ref28'}};f.nav.updateFrameProjection(next);assert.equal(f.pane().querySelector('[data-ref-id="ref27"]'),null);assert.equal(f.pane().querySelector('[data-ref-id="ref28"]').getAttribute('aria-current'),'page');
 f.nav.updateFrameProjection({...projection(role),scope:'other'});assert.equal(f.nav.currentRef(),undefined);assert.equal(f.pane().querySelector('[data-ref-id="ref28"]'),null);
});
test('current fallback does not duplicate an already displayed row and rejects mismatched owner identity',()=>{
 const f=fixture(),dto=projection();dto.current={nativeUrl:'https://chatgpt.com/c/unknown',refId:'unknown',projectId:null};dto.currentRef={...row('unknown'),available:true,membership:'UNKNOWN'};f.nav.updateFrameProjection(dto);assert.equal(f.pane().querySelectorAll('[data-ref-id="unknown"]').length,1);assert.equal(f.pane().querySelector('[aria-label="当前聊天"]'),null);
 assert.throws(()=>f.nav.updateFrameProjection({...dto,currentRef:{...dto.currentRef,id:'wrong'}}),/invalid-frame-current-ref/);assert.throws(()=>f.nav.updateFrameProjection({...dto,currentRef:{...dto.currentRef,membership:'NONE',projectId:'P'}}),/invalid-frame-current-ref/);
 f.nav.invalidate();assert.equal(f.nav.currentRef(),undefined);
});

test('frame working-set actions are link siblings, workspace-only, and never add unavailable references',()=>{
 const f=fixture('workspace',()=>null,null,async()=>({ok:true})),dto=projection();dto.entries.unknown.items[0].available=false;f.nav.updateFrameProjection(dto);
 const add=f.button('加入工作集');assert(add);assert.equal(add.parentNode.tagName,'div');assert.equal(add.parentNode.querySelector('a').querySelector('button'),null);assert.equal(f.pane().querySelector('[data-ref-id="unknown"]').parentNode.querySelectorAll('[data-working-set-action]').filter(n=>n.getAttribute('data-working-set-ref')==='unknown').length,0);
 const side=fixture('sidebar',()=>null,null,async()=>({ok:true}));side.nav.updateFrameProjection(projection('sidebar'));assert.equal(side.button('加入工作集'),undefined);
});
test('frame working-set action sends only ID/action, blocks duplicates and presents retryable error',async()=>{
 const calls=[];let resolve;const f=fixture('workspace',()=>null,null,args=>{calls.push(args);return new Promise(r=>resolve=r);});f.nav.updateFrameProjection(projection());const add=f.button('加入工作集');add.click();add.click();assert.deepEqual(calls,[{action:'add',refId:'P2_0'}]);assert(f.pane().querySelectorAll('[data-working-set-action]').every(n=>n.disabled));resolve({ok:false,reason:'revision-conflict'});await tick();assert.equal(f.pane().querySelector('[role="alert"]').textContent,'工作集更新失败，请重试。');assert(f.pane().querySelectorAll('[data-working-set-action]').every(n=>!n.disabled));
});
test('unavailable saved rows retain remove/move actions and first row cannot move up',async()=>{
 const calls=[],f=fixture('workspace',()=>workReply([row('first'),{...row('missing'),available:false,nativeUrl:null}]),null,async args=>{calls.push(args);return {ok:true};});f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});await tick();const actions=f.pane().querySelectorAll('[data-working-set-action]');assert.equal(actions.length,4);assert.equal(actions.find(n=>n.getAttribute('data-working-set-ref')==='first'&&n.getAttribute('data-working-set-action')==='move-up').disabled,true);const remove=actions.find(n=>n.getAttribute('data-working-set-ref')==='missing'&&n.getAttribute('data-working-set-action')==='remove');remove.click();await tick();assert.deepEqual(calls,[{action:'remove',refId:'missing'}]);assert.equal(f.pane().querySelector('[data-ref-id="missing"]').getAttribute('aria-disabled'),'true');
});
test('late working-set errors after scope switch or stop cannot repaint stale state',async()=>{
 for(const stop of [false,true]){let resolve;const f=fixture('workspace',()=>null,null,()=>new Promise(r=>resolve=r));f.nav.updateFrameProjection(projection());f.button('加入工作集').click();if(stop)f.nav.stop();else f.nav.updateFrameProjection({...projection(),scope:'new_scope'});resolve({ok:false});await tick();if(!stop)assert.equal(f.pane().querySelector('[role="alert"]'),null);else assert.equal(f.nav.status().state,'STOPPED');}
});

test('editing a later working-set page accepts refreshed page zero; failure keeps original page usable',async()=>{for(const ok of [true,false]){let f;f=fixture('workspace',q=>workReply([row(q.workingSet.offset?'later':'first')],50,q.workingSet.offset,24),null,async()=>{if(ok)f.nav.updateFrameProjection(workReply([row('refreshed')],49,0,24));return {ok};});f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});await tick();f.button('显示更多工作集窗口').click();await tick();assert(f.pane().querySelector('[data-ref-id="later"]'));f.button('从工作集移除').click();await tick();assert(f.pane().querySelector(ok?'[data-ref-id="refreshed"]':'[data-ref-id="later"]'));}});
