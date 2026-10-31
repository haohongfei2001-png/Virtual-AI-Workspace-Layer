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
  getAttribute(k){return k==='data-focus-key'?this.dataset.focusKey??this.attrs[k]??null:this.attrs[k]??null;}
  hasAttribute(k){return k==='data-focus-key'?this.getAttribute(k)!==null:k in this.attrs;}
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
 const handlers=new Map();doc={handlers,defaultView:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},crypto},addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k),createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null,adapterOverride={},extra={}){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},...adapterOverride},onHorizonRequest,onWorkingSetRequest,...extra,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

// Actual createNavigation event handling with controlled owner response order.
const reply=(query,items=[])=>({...projection(),search:{...query,items,total:items.length,hasMore:false}});
test('same-context search results preserve the live input while context changes still replace it',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});
 f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});
 const input=f.pane().querySelector('input');pending[0](reply(calls[0].search));await tick();
 assert.equal(f.pane().querySelector('input'),input,'initial result must not replace the input');
 for(const value of ['a','ab','abc']){input.value=value;input.oninput();pending.at(-1)(reply(calls.at(-1).search,[row(value)]));await tick();assert.equal(f.pane().querySelector('input'),input);assert.equal(input.value,value);assert(f.pane().querySelector('[data-ref-id="'+value+'"]'));}
 const changed={...reply(calls.at(-1).search),compactRows:false};f.nav.updateFrameProjection(changed);assert.notEqual(f.pane().querySelector('input'),input,'changed presentation settings must use the full render path');
 const beforeScope=f.pane().querySelector('input');f.nav.updateFrameProjection({...changed,scope:'scopeB'});assert.notEqual(f.pane().querySelector('input'),beforeScope);
 const beforeRevoke=f.pane().querySelector('input');f.nav.invalidate();f.nav.updateFrameProjection({...changed,scope:'scopeB'});assert.notEqual(f.pane().querySelector('input'),beforeRevoke);assert.equal(f.pane().querySelector('input').value,'abc');f.nav.stop();
});
for(const order of ['initial-first','typed-first'])test('one early input survives '+order+' response order',async()=>{
 const calls=[],pending=[],f=fixture('workspace',q=>{calls.push(q);return new Promise(r=>pending.push(r));});
 f.nav.updateFrameProjection(projection());f.nav.present({kind:'search-known'});
 const input=f.pane().querySelector('input');assert.equal(input.disabled,undefined);input.value='一次输入不得丢失';input.oninput();assert.equal(calls.length,2);assert.equal(calls[1].search.query,'一次输入不得丢失');
 if(order==='initial-first'){pending[0](reply(calls[0].search,[row('old')]));await tick();assert.equal(f.pane().querySelector('input').value,'一次输入不得丢失');assert(!f.pane().querySelector('[data-ref-id="old"]'));}
 pending[1](reply(calls[1].search,[row('new')]));await tick();if(order==='typed-first'){pending[0](reply(calls[0].search,[row('old')]));await tick();}
 assert.equal(f.pane().querySelector('input').value,'一次输入不得丢失');assert(f.pane().querySelector('[data-ref-id="new"]'));assert(!f.pane().querySelector('[data-ref-id="old"]'));assert.equal(calls.length,2);f.nav.stop();
});

for(const change of ['typed','workspace-entry','none'])test('deferred search presentation respects newer input but survives passive entry: '+change,async t=>{
 const calls=[],f=fixture('workspace',q=>{calls.push(q);return reply(q.search);});t.after(()=>f.nav.stop());
 f.nav.updateFrameProjection(projection());
 if(change==='typed'){f.nav.present({kind:'search-known'});await tick();}
 const host=f.nav.roots().workspace.n;
 f.doc.handlers.get('pointerdown')({pointerId:1,composedPath:()=>[host]});
 f.nav.present({kind:'search-known'});
 if(change==='typed'){const input=f.pane().querySelector('input');input.value='newer query';input.oninput();await tick();}
 if(change==='workspace-entry')assert.equal(f.nav.workspaceEntered(),true);
 f.doc.handlers.get('pointerup')({pointerId:1});await new Promise(r=>setTimeout(r,10));await tick();
 assert.equal(f.pane().querySelector('input').value,change==='typed'?'newer query':'');
 assert.deepEqual(calls.map(q=>q.search.query),change==='typed'?['','newer query']:['']);
});
