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
function fixture(role='workspace',callback=()=>null){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
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
