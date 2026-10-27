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
  click(){const event={button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},composedPath:()=>[this]};for(const fn of this.events.click??[])fn(event);return event;}
  focus(){let root=this;while(root.parentNode)root=root.parentNode;root.activeElement=this;}
  getBoundingClientRect(){return {height:0,width:0};}
  matches(selector){const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return selector.startsWith('.')?(this.className??'').split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){const direct=selector.startsWith(':scope > ');if(direct)selector=selector.slice(9);const out=[];const walk=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);if(!direct)walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
 }
 const handlers=new Map(),winHandlers=new Map();doc={handlers,winHandlers,defaultView:{setTimeout,clearTimeout,addEventListener(type,fn){if(!winHandlers.has(type))winHandlers.set(type,new Set());winHandlers.get(type).add(fn);},removeEventListener(type,fn){winHandlers.get(type)?.delete(fn);},crypto},addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k),createElement:tag=>new Element(tag)};doc.body=new Element('body');return doc;
}
const row=id=>({id,nativeTitle:`Native ${id}`,displayTitle:`Native ${id}`,nativeUrl:`https://chatgpt.com/c/${id}`,membership:'NONE',projectId:null,segment:0});
const page=(items=[],total=items.length,offset=0,limit=5)=>({items,total,offset,limit,hasMore:offset+items.length<total});
function projection(role='workspace'){
 const group=id=>({id,name:`Original ${id}`,nativeName:`Original ${id}`,segment:0,nativeUrl:null,lists:{current:page([row(`${id}_0`)],1000),old:page([row(`${id}_old`)],30),unknown:page()}});
 return {protocol:'vaiwl-free-frame/1',role,scope:'scopeA',completeSnapshot:false,segment:0,viewSession:{H:30,T:20000,Z:'UTC',policyRevision:0},navigation:{hasNewer:false,hasOlder:true,maxSegment:8},groups:page([group('P2'),group('P1')],100,0,24),entries:{noProject:{...page(),inventoryTotal:10},unknown:{...page([row('unknown')]),inventoryTotal:1}},selection:null};
}
function fixture(role='workspace',callback=()=>null,onHorizonRequest=null,onWorkingSetRequest=null,adapterOverride={},extra={}){const doc=dom(),intents=[];const nav=createNavigation({document:doc,surface:{role,root:doc.body,...(extra.nativeSidebar?{scrollOwner:'native-nav'}:{})},adapter:{currentURL:()=>'',isCurrent:()=>false,status(){},...adapterOverride},onHorizonRequest,onWorkingSetRequest,...extra,onProjectionRequest:callback,onPresentationRequest:v=>intents.push(v)});const pane=()=>nav.roots()[role].shadow;return {doc,nav,pane,intents,button:label=>pane().querySelectorAll('button').find(n=>n.getAttribute('aria-label')===label)};}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('segment calibration waits for successful projection and reports accepted segment',async()=>{
 const held=deferred(),calls=[],f=fixture('workspace',()=>held.promise,null,null,{}, {onCalibrationEntry:v=>calls.push(v)});f.nav.updateFrameProjection(projection());
 f.button('较早的30日').click();assert.equal(calls.length,0);held.resolve({...projection(),segment:1,navigation:{hasNewer:true,hasOlder:true,maxSegment:8}});await drain();assert.equal(calls.length,1);assert.equal(calls[0].kind,'history');f.nav.stop();
});
test('failed projection produces no calibration',async()=>{
 const calls=[],f=fixture('workspace',()=>Promise.reject(Error('offline')),null,null,{}, {onCalibrationEntry:v=>calls.push(v)});f.nav.updateFrameProjection(projection());f.button('较早的30日').click();await drain();assert.equal(calls.length,0);f.nav.stop();
});
test('superseded projection reply cannot schedule calibration',async()=>{
 const pending=[deferred(),deferred()],calls=[];let n=0;const f=fixture('workspace',()=>pending[n++].promise,null,null,{}, {onCalibrationEntry:v=>calls.push(v)});f.nav.updateFrameProjection(projection());f.button('较早的30日').click();f.button('较早的30日').click();pending[0].resolve({...projection(),segment:1,navigation:{hasNewer:true,hasOlder:true,maxSegment:8}});await drain();assert.equal(calls.length,0);pending[1].resolve({...projection(),segment:1,navigation:{hasNewer:true,hasOlder:true,maxSegment:8}});await drain();assert.equal(calls.length,1);f.nav.stop();
});

for(const start of [0,2])test(`explicit period navigation from ${start} starts at top only after its accepted reply`,async t=>{
 const held=deferred(),f=fixture('workspace',()=>held.promise);t.after(()=>f.nav.stop());
 f.nav.updateFrameProjection({...projection(),segment:start,navigation:{hasNewer:start>0,hasOlder:true,maxSegment:8}});f.nav.roots().workspace.scroller.scrollTop=430;
 f.button(start?'较近的30日':'较早的30日').click();assert.equal(f.nav.roots().workspace.scroller.scrollTop,430);
 held.resolve({...projection(),segment:start?start-1:1,navigation:{hasNewer:true,hasOlder:true,maxSegment:8}});await drain();assert.equal(f.nav.roots().workspace.scroller.scrollTop,0);
 f.nav.roots().workspace.scroller.scrollTop=170;f.nav.updateFrameProjection({...projection(),segment:1,navigation:{hasNewer:true,hasOlder:true,maxSegment:8}});assert.equal(f.nav.roots().workspace.scroller.scrollTop,170,'ordinary same-period refresh preserves position');
});
test('failed or superseded period navigation cannot discard the current scroll position',async t=>{
 const held=deferred(),f=fixture('workspace',()=>held.promise);t.after(()=>f.nav.stop());f.nav.updateFrameProjection(projection());f.nav.roots().workspace.scroller.scrollTop=430;
 f.button('较早的30日').click();f.nav.updateFrameProjection(projection());held.resolve({...projection(),segment:1});await drain();assert.equal(f.nav.roots().workspace.scroller.scrollTop,430);
 const failed=fixture('workspace',()=>Promise.reject(Error('offline')));t.after(()=>failed.nav.stop());failed.nav.updateFrameProjection(projection());failed.nav.roots().workspace.scroller.scrollTop=270;failed.button('较早的30日').click();await drain();assert.equal(failed.nav.roots().workspace.scroller.scrollTop,270);
});
