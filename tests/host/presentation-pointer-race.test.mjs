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
  focus(){let root=this;while(root.parentNode)root=root.parentNode;root.activeElement=this;}
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
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null,options={}){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},...options,adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},...options.adapter},onHorizonRequest,onWorkingSetRequest,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};


// Isolated renderer contract: this does not attribute historical Chrome popup
// failures to presentation messages or claim native event delivery coverage.
for(const intent of [{kind:'show-working-set'},{kind:'search-known',themeId:null},{kind:'show-workspace'}])test('async presentation '+intent.kind+' retains held anchor until pointer release',async()=>{
 const f=fixture();f.nav.updateFrameProjection(projection());f.nav.showWorkspace();
 const original=f.pane().querySelector('[data-ref-id]'),owner=f.nav.roots().workspace.n,event={pointerId:17,composedPath:()=>[original,owner]};
 try{
  f.doc.emit('pointerdown',event);await Promise.resolve();f.nav.present(intent);
  assert.ok(f.pane().querySelector('[data-ref-id]')===original,'async presentation must not detach the browser activation target while pointer is held');
  f.doc.emit('pointerup',event);assert.ok(f.pane().querySelector('[data-ref-id]')===original,'retain target until click/default action task completes');
  await new Promise(r=>setTimeout(r,5));assert.ok(f.pane().querySelector('[data-ref-id]')!==original,'the requested presentation may render after release');
 }finally{f.nav.stop();}
});

const task=()=>new Promise(r=>setTimeout(r,5));
const held=f=>{const node=f.pane().querySelector('[data-ref-id]'),event={pointerId:4,composedPath:()=>[node,f.nav.roots().workspace.n]};f.doc.emit('pointerdown',event);return {node,event};};
test('only latest pending presentation runs after release and starts one owner query',async()=>{
 const queries=[],f=fixture('workspace',q=>{queries.push(q);return null;});try{f.nav.updateFrameProjection(projection());f.nav.showWorkspace();const {node,event}=held(f);
 f.nav.present({kind:'search-known',themeId:'P1'});f.nav.present({kind:'show-workspace'});f.nav.present({kind:'show-working-set'});assert.equal(queries.length,0);assert.ok(f.pane().querySelector('[data-ref-id]')===node);
 f.doc.emit('pointerup',event);await task();assert.equal(queries.length,1);assert.deepEqual(queries[0].workingSet,{offset:0,limit:24});assert.equal(f.pane().querySelector('input'),null);assert.equal(f.nav.view().worksetOpen,true);
 }finally{f.nav.stop();}
});
for(const change of ['scope','invalidate','stop'])test('queued presentation is discarded by '+change,async()=>{
 const queries=[],f=fixture('workspace',q=>{queries.push(q);return null;});try{f.nav.updateFrameProjection(projection());f.nav.showWorkspace();const {event}=held(f);f.nav.present({kind:'search-known',themeId:'P1'});
 if(change==='scope')f.nav.updateFrameProjection({...projection(),scope:'B'});else f.nav[change]();const roots=f.nav.roots();f.doc.emit('pointerup',event);await task();assert.equal(queries.length,0);assert.equal(f.nav.roots(),roots);if(change==='scope')assert.equal(f.pane().querySelector('input'),null);
 }finally{f.nav.stop();}
});
test('queued DTO applies before final presentation and search focuses the final rendered input',async()=>{
 const queries=[],f=fixture('workspace',q=>{queries.push(q);return null;});try{f.nav.updateFrameProjection(projection());f.nav.showWorkspace();const {event}=held(f);
 const dto=projection();dto.segment=2;dto.navigation.hasNewer=true;dto.groups.offset=24;f.nav.updateFrameProjection(dto);f.nav.present({kind:'show-working-set'});f.nav.present({kind:'search-known',themeId:'P1'});
 assert.equal(f.nav.view().segment,0);f.doc.emit('pointerup',event);await task();assert.equal(f.nav.view().segment,2);assert.equal(queries.length,1);assert.equal(queries[0].segment,2);assert.equal(queries[0].offset,24);assert.deepEqual(queries[0].search,{query:'',projectId:'P1',offset:0,limit:24});assert.equal(f.pane().activeElement,f.pane().querySelector('input'));
 }finally{f.nav.stop();}
});

// Controlled task ordering exercises the local renderer race. It does not
// claim that a real browser or the historical Linux failure used this order.
for(const finish of ['click','deadline','cancel','hidden','stop','scope'])test('deferred local paint respects native pointer reservation through '+finish,()=>{
 let dispatches=0,releases=0,serial=0;const timers=new Map();
 const f=fixture('workspace',()=>null,null,null,{adapter:{currentURL:()=>'',nativeHref:u=>u,navigationPlan:r=>({targetKey:'target',uiGrantId:'grant',mountId:'mount',plan:{mode:'native-control',planRevision:1,target:{kind:'resolved',entity:'conversation',nativeId:r.id,navigationURL:r.nativeUrl}}})},onDispatch:()=>{dispatches++;return new Promise(()=>{});},onUndoTimePolicyRequest:async()=>({ok:true}),onNativeInteractionStart:()=>()=>{releases++;}});
 f.doc.defaultView.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;};f.doc.defaultView.clearTimeout=id=>timers.delete(id);
 const fire=predicate=>{const entry=[...timers].find(([,v])=>predicate(v.ms));assert(entry);timers.delete(entry[0]);entry[1].fn();};
 const flush=()=>{for(const [id,timer]of [...timers])if(timer.ms===0&&timers.has(id)){timers.delete(id);timer.fn();}};
 try{
 f.nav.updateFrameProjection(projection());f.nav.showWorkspace();f.nav.showTimePolicyNotice({id:'local-paint',expiresAt:new Date(Date.now()+500).toISOString()});
 const a=f.pane().querySelector('[data-ref-id]'),event={isTrusted:true,isPrimary:true,button:0,pointerId:11,composedPath:()=>[a,f.nav.roots().workspace.n]};
 f.doc.emit('pointerdown',event);for(const fn of a.events.pointerdown)fn(event);
 fire(ms=>ms>0&&ms<1000);f.doc.emit('pointerup',event);f.doc.emit('lostpointercapture',event);flush();
 assert.ok(f.pane().querySelector('[data-ref-id]')===a,'pointerup/lost capture must not repaint before a later click task');
 if(finish==='click'){a.click();assert.equal(dispatches,1);flush();}
 if(finish==='deadline'){fire(ms=>ms===1000);flush();assert.notEqual(f.pane().querySelector('[data-ref-id]'),a);a.click();}
 if(finish==='cancel'){f.doc.emit('pointercancel',event);flush();a.click();}
 if(finish==='hidden'){f.doc.visibilityState='hidden';f.doc.emit('visibilitychange',{});}
 if(finish==='stop'){f.nav.stop();a.click();}
 if(finish==='scope'){f.nav.updateFrameProjection({...projection(),scope:'other'});a.click();}
 assert.equal(releases,1);assert.equal(dispatches,finish==='click'?1:0);assert.equal([...timers.values()].filter(t=>t.ms===1000).length,0);
 }finally{f.nav.stop();}
});
