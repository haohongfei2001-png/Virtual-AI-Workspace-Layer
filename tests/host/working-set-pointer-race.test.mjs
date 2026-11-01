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
  prepend(...nodes){for(const n of nodes)n.parentNode=this;this.children.unshift(...nodes);}
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
 const documentEvents=new Map();
 doc={emit(type,event){for(const fn of documentEvents.get(type)??[])fn(event);},defaultView:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},crypto},addEventListener(type,fn){const handlers=documentEvents.get(type)??[];handlers.push(fn);documentEvents.set(type,handlers);},removeEventListener(){},createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){}},onHorizonRequest,onWorkingSetRequest,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

test('same-scope owner update holds original wrapped working-set anchor through pointerup',async()=>{const f=fixture('workspace',()=>null,null,async()=>({ok:true}));f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});const dto=projection();dto.workingSet={...page([row('one'),row('two')],2,0,24),currentRefId:'two'};f.nav.updateFrameProjection(dto);const original=f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one');const event={pointerId:1,composedPath:()=>[original,f.nav.roots().workspace.n]};f.doc.emit('pointerdown',event);f.nav.updateFrameProjection(structuredClone(dto));assert.equal(f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one'),original);f.doc.emit('pointerup',event);assert.equal(f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one'),original);await new Promise(r=>setTimeout(r,5));assert.notEqual(f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one'),original);f.nav.stop();});
test('working-set async mutation settlement must not replace an anchor while pointer remains down',async()=>{let resolve;const pending=new Promise(r=>resolve=r),f=fixture('workspace',()=>null,null,()=>pending);f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});const dto=projection();dto.workingSet={...page([row('one'),row('two')],2,0,24),currentRefId:'two'};f.nav.updateFrameProjection(dto);f.pane().querySelectorAll('button').find(n=>n.getAttribute('data-working-set-action')==='move-up'&&!n.disabled).click();const original=f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one');const event={pointerId:2,composedPath:()=>[original,f.nav.roots().workspace.n]};f.doc.emit('pointerdown',event);resolve({ok:true});await tick();assert.equal(f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one'),original);f.doc.emit('pointerup',event);f.nav.stop();});
const task=()=>new Promise(r=>setTimeout(r,5));
function workFixture(){let resolve;const pending=new Promise(r=>resolve=r),f=fixture('workspace',()=>null,null,()=>pending);f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});const dto=projection();dto.workingSet={...page([row('one'),row('two')],2,0,24),currentRefId:'two'};f.nav.updateFrameProjection(dto);return {...f,dto,resolve,start:()=>f.pane().querySelectorAll('button').find(n=>n.getAttribute('data-working-set-action')==='move-up'&&!n.disabled).click()};}
const anchor=f=>f.pane().querySelectorAll('[data-ref-id]').find(n=>n.getAttribute('data-ref-id')==='one');
const event=(f,node)=>({pointerId:42,key:'Enter',composedPath:()=>[node,f.nav.roots().workspace.n]});
for(const kind of ['pointer','keyboard'])test(`failed working-set settlement preserves ${kind} target until release then displays failure`,async()=>{const f=workFixture();f.start();const original=anchor(f),e=event(f,original);f.doc.emit(kind==='pointer'?'pointerdown':'keydown',e);f.resolve({ok:false});await tick();assert.equal(anchor(f),original);assert.equal(f.pane().querySelectorAll('[role="alert"]').length,0);f.doc.emit(kind==='pointer'?'pointerup':'keyup',e);assert.equal(anchor(f),original);await task();assert.notEqual(anchor(f),original);assert.equal(f.pane().querySelector('[role="alert"]').textContent,'工作集更新失败，请重试。');f.nav.stop();});
test('horizon success and failure settlement retain held anchor until safe paint',async()=>{for(const ok of [true,false]){let resolve;const pending=new Promise(r=>resolve=r),f=fixture('workspace',()=>null,()=>pending);f.nav.updateFrameProjection(projection());f.button('工作空间设置').click();const select=f.pane().querySelector('[aria-label="工作空间时间范围"]');select.value='14';select.onchange();const original=f.pane().querySelector('[data-ref-id]'),e=event(f,original);f.doc.emit('pointerdown',e);resolve({ok});await tick();assert.equal(f.pane().querySelector('[data-ref-id]'),original);f.doc.emit('pointerup',e);await task();assert.notEqual(f.pane().querySelector('[data-ref-id]'),original);assert.equal(f.pane().querySelector('[aria-label="工作空间时间范围"]').value,'30');if(!ok)assert(f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent==='时间范围更新失败，请重试。'));f.nav.stop();}});
test('queued owner pages and mutation paint merge into final latest order after pointerup',async()=>{const f=workFixture();f.start();const original=anchor(f),e=event(f,original);f.doc.emit('pointerdown',e);const first=structuredClone(f.dto);first.workingSet.items=[row('two'),row('one')];f.nav.updateFrameProjection(first);f.resolve({ok:true});await tick();const latest=structuredClone(first);latest.workingSet.items[0].displayTitle='Latest native two';f.nav.updateFrameProjection(latest);assert.equal(anchor(f),original);f.doc.emit('pointerup',e);assert.equal(anchor(f),original);await task();assert.deepEqual(f.pane().querySelectorAll('[data-ref-id]').map(n=>n.getAttribute('data-ref-id')),['two','one']);assert.equal(f.pane().querySelector('.window-title').textContent,'Latest native two');f.nav.stop();});
for(const mode of ['invalidate','stop','scope'])test(`queued paint and late mutation discarded by ${mode}`,async()=>{const f=workFixture();f.start();const original=anchor(f),e=event(f,original);f.doc.emit('pointerdown',e);f.nav.updateFrameProjection(structuredClone(f.dto));if(mode==='scope'){const next=projection();next.scope='scopeB';f.nav.updateFrameProjection(next);}else f.nav[mode]();const roots=f.nav.roots();f.resolve({ok:false});await tick();f.doc.emit('pointerup',e);await task();assert.equal(f.nav.roots(),roots);if(mode==='scope'){assert.equal(f.nav.status().scope,'scopeB');assert.equal(f.pane().querySelectorAll('[role="alert"]').length,0);assert.equal(f.pane().querySelectorAll('[data-ref-id]').some(n=>n.getAttribute('data-ref-id')==='one'),false);}else assert.equal(roots,null);f.nav.stop();});

for(const mode of ['repaint','scope'])test(`retired working-set controls cannot mutate after ${mode}`,async()=>{
 const calls=[],f=fixture('workspace',()=>null,null,async request=>{calls.push(request);return {ok:true};});
 f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});
 const dto=projection();dto.workingSet={...page([row('one'),row('two')],2,0,24),currentRefId:'two'};f.nav.updateFrameProjection(dto);
 const old=f.pane().querySelectorAll('button').find(n=>n.getAttribute('data-working-set-action')==='remove');assert(old);
 const next=structuredClone(dto);if(mode==='scope')next.scope='scopeB';f.nav.updateFrameProjection(next);
 old.click();await tick();assert.deepEqual(calls,[]);
 const current=f.pane().querySelectorAll('button').find(n=>n.getAttribute('data-working-set-action')==='remove');assert(current);current.click();await tick();assert.deepEqual(calls,[{action:'remove',refId:'one'}]);f.nav.stop();
});

test('workspace entry after native reading retains working-set route and order',()=>{const f=fixture('workspace',()=>null,null,async()=>({ok:true}));f.nav.updateFrameProjection(projection());f.nav.present({kind:'show-working-set'});const dto=projection();dto.workingSet={...page([row('two'),row('one')],2,0,24),currentRefId:'two'};f.nav.updateFrameProjection(dto);f.nav.enterReading(false);assert.equal(f.nav.workspaceEntered(),true);assert.equal(f.nav.view().worksetOpen,true);assert.deepEqual(f.pane().querySelectorAll('[data-ref-id]').map(n=>n.getAttribute('data-ref-id')),['two','one']);f.nav.stop();});
