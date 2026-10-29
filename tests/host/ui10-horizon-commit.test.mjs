import {ui10HorizonCommitted,selectUi10Horizon} from './ui10-horizon-commit.mjs';
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

for(const outcome of ['success','failure'])test(`real renderer pending paint cannot fake H commit: ${outcome}`,async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),calls=[];const f=fixture('workspace',()=>null,args=>{calls.push(args);return pending;});
 try{f.nav.updateFrameProjection(projection());f.button('工作空间设置').click();const original=f.pane().querySelector('[aria-label="工作空间时间范围"]'),event={pointerId:42,composedPath:()=>[original,f.nav.roots().workspace.n]};
 f.doc.emit('pointerdown',event);original.value='7';original.onchange();
 const state=()=>{const current=f.pane().querySelector('[aria-label="工作空间时间范围"]');return {changes:1,replaced:current!==original,value:current.value,expected:'7',ariaDisabled:current.getAttribute('aria-disabled'),failed:f.pane().querySelectorAll('[role="status"]').some(n=>n.textContent.includes('时间范围更新失败'))};};
 assert.equal(state().value,'7');assert.equal(state().ariaDisabled,'false');assert.equal(ui10HorizonCommitted(state()),false,'old optimistic select must not pass');assert.equal(calls.length,1);
 f.doc.emit('pointerup',event);await new Promise(r=>setTimeout(r,5));assert.equal(state().replaced,true);assert.equal(state().ariaDisabled,'true');assert.equal(ui10HorizonCommitted(state()),false,'pending repaint is not commit');
 if(outcome==='success'){const dto=projection();dto.viewSession.H=7;dto.viewSession.policyRevision=1;f.nav.updateFrameProjection(dto);}resolve({ok:outcome==='success'});await tick();await new Promise(r=>setTimeout(r,5));assert.equal(ui10HorizonCommitted(state()),outcome==='success');assert.equal(calls.length,1);
 }finally{f.nav.stop();}
});
test('missing/duplicate events, same old node, wrong H, pending and failure never commit',()=>{const good={changes:1,replaced:true,value:'auto',expected:'auto',ariaDisabled:'false',failed:false};assert(ui10HorizonCommitted(good));for(const bad of [{changes:0},{changes:2},{replaced:false},{value:'30'},{ariaDisabled:'true'},{ariaDisabled:null},{failed:true}])assert.equal(ui10HorizonCommitted({...good,...bad}),false);});

for(const mode of ['committed','optimistic','pending','missing-event','duplicate-event','wrong-owner','owner-failure'])test(`actual browser wait function rejects false completion: ${mode}`,async()=>{
 const prior=globalThis.document;let listener,removed=false,selectCalls=0,waitMs;const original={value:'30',disabled:false,getAttribute:k=>k==='aria-label'?'工作空间时间范围':'false'};let current=original;
 const root={textContent:'',querySelector:selector=>selector==='.workspace'?{}:current,addEventListener:(type,fn)=>listener=fn,removeEventListener:(type,fn)=>{assert.equal(fn,listener);removed=true;}};globalThis.document={querySelectorAll:()=>[{shadowRoot:root}]};
 const frame={evaluateHandle:async fn=>{const r=fn();return {receipt:r,evaluate:async fn=>fn(r),dispose:async()=>{}};},evaluate:async(fn,args)=>fn({...args,receipt:args.receipt.receipt}),waitForFunction:async(fn,args,options)=>{waitMs=options.timeout;if(!fn({...args,receipt:args.receipt.receipt}))throw Error('bounded-test-timeout');}};
 const select=()=>({selectOption:async value=>{selectCalls++;original.value=value;if(mode!=='missing-event')listener({composedPath:()=>[original]});if(mode==='duplicate-event')listener({composedPath:()=>[original]});if(mode!=='optimistic')current={value:mode==='wrong-owner'?'30':value,disabled:false,getAttribute:()=>mode==='pending'?'true':'false'};if(mode==='owner-failure')root.textContent='时间范围更新失败';}});
 try{if(mode==='committed')await selectUi10Horizon(frame,select,'7');else await assert.rejects(selectUi10Horizon(frame,select,'7'),e=>{assert.equal(e.ui10HorizonDiagnostics.expected,'7');return true;});assert.equal(selectCalls,1);assert.equal(waitMs,6000);assert.equal(removed,true);}finally{globalThis.document=prior;}
});
