import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
const C='33333333-3333-4333-8333-333333333333';
// Minimal visible directory DOM for discovery; these remain offline doubles.
function visibleDirectoryNode(document,parentElement=null){return {ownerDocument:document,parentElement,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null};}
function fixture(options={}){
 let observer,clock=0;const listeners=new Map(),emitted=[],rebind=[];
 const node=(x,y,width,height)=>({textContent:'',children:[],contains:()=>false,querySelectorAll:()=>[],getBoundingClientRect:()=>({x,y,width,height}),isConnected:true});
 const history=node(0,50,200,500),reading=node(220,70,700,400),header=node(220,0,700,60),composer=node(220,480,700,90),slot=node(220,0,40,40);
 const selectors=new Map([['aside nav[aria-label="Chat history"]',[history]],['main > header',[header]],['main > section[aria-label="Conversation"]',[reading]],['main > form#composer',[composer]],['main > header > .navigation-slot',[slot]]]);
 const documentListeners=new Map();
 const document={addEventListener:(t,f)=>documentListeners.set(t,f),removeEventListener:t=>documentListeners.delete(t),location:{href:`https://chatgpt.com/c/${C}`},documentElement:{dataset:{}},querySelectorAll:s=>selectors.get(s)??[],querySelector:()=>null,defaultView:{getComputedStyle:n=>n.style??{display:'block',visibility:'visible'},crypto,MutationObserver:class{constructor(cb){observer=this;this.cb=cb;}observe(){}disconnect(){this.closed=true;}},addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)}};
 installTreeWalkerDouble(document);
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'browser-doc',routeEpoch:4,origin:'https://chatgpt.com',expiresAt:new Date(100000).toISOString()};
 const adapter=createChatGPTAdapter({document,profile:{...LEGACY_SURFACE_PROFILE,currentBody:undefined},now:()=>clock,onRebindNeeded:v=>rebind.push(v),...options});
 return {adapter,document,documentListeners,binding,emitted,rebind,selectors,reading,composer,slot,setTime:v=>clock=v,trigger:()=>observer.cb([]),observer:()=>observer,start:(emit,extra={})=>adapter.start({binding,...extra,emit:emit??(async p=>{emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'r'};})})};
}

const settle=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function bodyFixture(options={}){const f=fixture({profile:LEGACY_SURFACE_PROFILE,...options}),root=f.reading;root.ownerDocument=f.document;root.parentElement=null;root.attrs={'data-conversation-id':C};root.style={display:'block',visibility:'visible'};root.getAttribute=k=>root.attrs[k]??null;root.getClientRects=()=>[{}];f.document.defaultView.getComputedStyle=n=>n.style;const makeMessage=id=>({ownerDocument:f.document,isConnected:true,parentElement:root,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:key=>key==='data-message-id'?id:null,get textContent(){throw Error('message-body-read');},get value(){throw Error('draft-read');}});root.children=[makeMessage('M1')];root.querySelectorAll=selector=>selector==='[data-message-id]'?root.children:[];root.contains=n=>{for(let current=n;current;current=current.parentNode??current.parentElement)if(current===root)return true;return false;};f.selectors.set('main > #reading',[root]);return {...f,makeMessage};}
function sendFixture(options={}){const f=bodyFixture(options),editor={tagName:'TEXTAREA'},button={tagName:'BUTTON',type:'submit'};for(const node of [f.composer,editor,button])Object.assign(node,{ownerDocument:f.document,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false});f.composer.tagName='FORM';editor.form=button.form=f.composer;editor.parentElement=button.parentElement=f.composer;f.composer.contains=n=>n===editor||n===button;editor.contains=button.contains=()=>false;for(const n of [editor,button])for(const key of ['value','textContent','files'])Object.defineProperty(n,key,{get(){throw Error('private-native-content-read');}});f.selectors.set('#prompt-textarea',[editor]);f.selectors.set('main > form#composer > button[type="submit"]',[button]);return {...f,editor,button,click(){f.documentListeners.get('click')?.({type:'click',isTrusted:true,target:button,button:0,detail:1});}};}
function bodyAck(p){return {state:'accepted',localSeq:p.localSeq,receiptId:'unit-receipt',...(p.kind==='current-observation'?{bodyProofId:'accepted-body-proof',bodyEpoch:7}:{})};}


// A recovery snapshot proves local quiescence only, never fresh authorization.
test('expired quiescent adapter exposes recovery readiness but no idle or read authority',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());assert.equal(f.adapter.prepareRecovery(),null);await f.start();await settle();f.setTime(100000);
 assert.equal(f.adapter.prepareIdle(),null);const token=f.adapter.prepareRecovery();assert.ok(token);assert.equal(token.isCurrent(),true);assert(Object.isFrozen(token));
 await assert.rejects(f.adapter.readLoaded({}),/stale-host-binding/);assert.equal((await f.adapter.dispatchNative({})).state,'blocked');assert.equal(token.isCurrent(),false);
});
for(const mode of ['stop','route','schedule'])test('recovery snapshot rejects '+mode+' and never certifies pending work',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start();await settle();const token=f.adapter.prepareRecovery();assert.ok(token);
 if(mode==='stop')f.adapter.stop();else if(mode==='route')f.document.location.href='https://chatgpt.com/';else f.trigger();assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareRecovery(),null);
 if(mode==='schedule'){await settle();assert.ok(f.adapter.prepareRecovery());assert.equal(token.isCurrent(),false);}
});
test('expiry cannot bypass a still pending raw emit',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.adapter.stop());await f.start(()=>held.promise);await settle();f.setTime(100000);assert.equal(f.adapter.prepareRecovery(),null);held.resolve({state:'accepted'});await settle();assert.equal(f.adapter.prepareIdle(),null);
});
for(const kind of ['first','old'])test(kind+' send observer cannot relabel a reentrant old gesture with the new binding',async t=>{
 const received=[],profile={...LEGACY_SURFACE_PROFILE,[kind==='first'?'firstSend':'oldSendTerminal']:{origin:'https://chatgpt.com',operationAttribute:'data-operation',messageAttribute:'data-message'}};
 const f=sendFixture({profile,[kind==='first'?'onFirstSendIntent':'onOldSendOperation']:(intent,binding)=>received.push({intent,binding})});t.after(()=>f.adapter.stop());
 f.document.location.origin='https://chatgpt.com';f.document.location.pathname=kind==='first'?'/':'/c/'+C;if(kind==='first')f.document.location.href='https://chatgpt.com/';
 f.composer.getAttribute=key=>key==='data-operation'?'operation_1':key==='data-message'?'message_1':null;
 await f.start(bodyAck);await settle();f.click();await settle();assert.equal(received.length,1);assert.equal(received[0].binding.producerToken,'producer');
 let restarted=false,restarting;const original=f.composer.getAttribute;
 f.composer.getAttribute=key=>{if(key==='data-operation'&&!restarted){restarted=true;restarting=f.start(bodyAck,{binding:{...f.binding,producerToken:'new_producer'}});}return original(key);};
 f.click();await restarting;await settle();assert(received.every(entry=>entry.binding.producerToken==='producer'),'old synchronous gesture must not receive new producer authority');
 const priorCount=received.length;f.click();await settle();assert.equal(received.length,priorCount+1);assert.equal(received.at(-1).binding.producerToken,'new_producer');assert.equal(received[0].binding.producerToken,'producer');
});
