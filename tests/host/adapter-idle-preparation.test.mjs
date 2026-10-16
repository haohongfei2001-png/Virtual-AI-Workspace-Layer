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
function sendFixture(){const f=bodyFixture(),editor={tagName:'TEXTAREA'},button={tagName:'BUTTON',type:'submit'};for(const node of [f.composer,editor,button])Object.assign(node,{ownerDocument:f.document,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false});f.composer.tagName='FORM';editor.form=button.form=f.composer;editor.parentElement=button.parentElement=f.composer;f.composer.contains=n=>n===editor||n===button;editor.contains=button.contains=()=>false;for(const n of [editor,button])for(const key of ['value','textContent','files'])Object.defineProperty(n,key,{get(){throw Error('private-native-content-read');}});f.selectors.set('#prompt-textarea',[editor]);f.selectors.set('main > form#composer > button[type="submit"]',[button]);return {...f,editor,button,click(){f.documentListeners.get('click')?.({type:'click',isTrusted:true,target:button,button:0,detail:1});}};}
function bodyAck(p){return {state:'accepted',localSeq:p.localSeq,receiptId:'unit-receipt',...(p.kind==='current-observation'?{bodyProofId:'accepted-body-proof',bodyEpoch:7}:{})};}

// Offline DOM doubles: preparation observes readiness, never grants close or suspends listeners.
test('idle preparation is unavailable before start and while first emission is pending',async t=>{
 const f=fixture(),hold=deferred();t.after(()=>f.adapter.stop());
 assert.equal(f.adapter.prepareIdle(),null);
 await f.start(p=>{f.emitted.push(p);return hold.promise;});await settle();
 assert.equal(f.emitted.length,1);assert.equal(f.adapter.prepareIdle(),null);
 hold.resolve(bodyAck(f.emitted[0]));await settle();
 const token=f.adapter.prepareIdle();assert.ok(token);assert.equal(Object.isFrozen(token),true);assert.deepEqual(Object.keys(token),['isCurrent']);assert.equal(token.isCurrent(),true);
});
test('a new scan permanently revokes a token even when its unchanged work drains',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start();await settle();
 const token=f.adapter.prepareIdle(),observer=f.observer();assert.ok(token);
 f.trigger();assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareIdle(),null);await settle();
 const next=f.adapter.prepareIdle();assert.ok(next);assert.equal(next.isCurrent(),true);assert.equal(token.isCurrent(),false);assert.equal(f.observer(),observer);assert.notEqual(observer.closed,true);
});
test('renewal revokes old preparation without stopping native observation',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start();await settle();const token=f.adapter.prepareIdle();assert.ok(token);
 assert.equal(f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString()}),true);assert.equal(token.isCurrent(),false);await settle();assert.ok(f.adapter.prepareIdle());assert.equal(token.isCurrent(),false);
});
for(const reason of ['expiry','route','stop'])test('preparation rejects '+reason,async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start();await settle();const token=f.adapter.prepareIdle();assert.ok(token);
 if(reason==='expiry')f.setTime(100000);else if(reason==='route')f.document.location.href='https://chatgpt.com/';else f.adapter.stop();
 assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareIdle(),null);
});
test('ingestion start and late terminal notification must settle before preparation',async t=>{
 const f=fixture(),start=deferred(),end=deferred(),phases=[];t.after(()=>f.adapter.stop());
 const starting=f.start(undefined,{ingestionPass:message=>{phases.push(message.phase);return message.phase==='start'?start.promise:end.promise;}});
 await settle();assert.deepEqual(phases,['start']);assert.equal(f.adapter.prepareIdle(),null);
 start.resolve({ok:true});await starting;await settle();assert.deepEqual(phases,['start','end']);assert.equal(f.adapter.prepareIdle(),null);
 end.resolve({ok:true});await settle();assert.ok(f.adapter.prepareIdle());
});
test('retry keeps preparation unavailable until acknowledgement and queue drain',async t=>{
 const timers=new Map();let next=0,calls=0;
 const f=fixture({scheduleRetry:(fn)=>{const id=++next;timers.set(id,fn);return id;},cancelRetry:id=>timers.delete(id)});t.after(()=>f.adapter.stop());
 await f.start(p=>{calls++;return Promise.resolve(calls===1?{state:'retry-after',localSeq:p.localSeq,delayMs:50}:bodyAck(p));});await settle();
 assert.equal(timers.size,1);assert.equal(f.adapter.prepareIdle(),null);
 const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();await settle();assert.equal(calls,2);assert.ok(f.adapter.prepareIdle());
});
for(const method of ['loadedPages','loadedCandidatePages'])test(method+' iterator blocks preparation until explicitly closed',async t=>{
 const f=fixture();t.after(()=>f.adapter.stop());await f.start();await settle();const token=f.adapter.prepareIdle();assert.ok(token);
 const iterator=f.adapter[method](new AbortController().signal);assert.equal((await iterator.next()).done,false);
 assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareIdle(),null);await settle();assert.equal(f.adapter.prepareIdle(),null);
 await iterator.return();await settle();assert.ok(f.adapter.prepareIdle());assert.equal(token.isCurrent(),false);
});
test('late old emission remains pending across restart until its underlying promise settles',async t=>{
 const f=fixture(),old=deferred();t.after(()=>f.adapter.stop());await f.start(()=>old.promise);await settle();f.adapter.stop();await f.start();await settle();
 assert.equal(f.adapter.prepareIdle(),null);old.resolve({state:'accepted'});await settle();assert.ok(f.adapter.prepareIdle());
});
test('preparing does not remove native send observer or discard a subsequent intent',async t=>{
 const f=sendFixture(),send=deferred();t.after(()=>f.adapter.stop());
 await f.start(p=>{f.emitted.push(p);return p.kind==='send-candidate'?send.promise:Promise.resolve(bodyAck(p));});await settle();
 const token=f.adapter.prepareIdle(),listener=f.documentListeners.get('click');assert.ok(token);assert.equal(typeof listener,'function');
 f.click();assert.equal(token.isCurrent(),false);await settle();assert.equal(f.adapter.prepareIdle(),null);assert.equal(f.documentListeners.get('click'),listener);
 const candidate=f.emitted.at(-1);assert.equal(candidate.kind,'send-candidate');assert.equal(candidate.payload.stage,'intent');assert.equal(candidate.bodyProofId,'accepted-body-proof');
 send.resolve(bodyAck(candidate));await settle();assert.ok(f.adapter.prepareIdle());assert.equal(token.isCurrent(),false);assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,1);
});

test('native dispatch awaiting authorization stays pending across adapter restart',async t=>{
 const authorization=deferred();const f=bodyFixture({authorize:()=>authorization.promise});t.after(()=>f.adapter.stop());
 await f.start(async p=>bodyAck(p));await settle();const token=f.adapter.prepareIdle();assert.ok(token);
 const plan=f.adapter.planNavigation({kind:'resolved',entity:'conversation',nativeId:C,navigationURL:`https://chatgpt.com/c/${C}`,liveHandle:null});assert.equal(plan.mode,'same-target');
 const pending=f.adapter.dispatchNative({actionId:'idle-native-action',uiGrantId:'grant',mountId:'mount',planRevision:plan.planRevision,targetKey:f.adapter.planKey(plan)});
 await settle();assert.equal(token.isCurrent(),false);assert.equal(f.adapter.prepareIdle(),null);
 f.adapter.stop();await f.start(async p=>bodyAck(p));await settle();assert.equal(f.adapter.prepareIdle(),null);
 authorization.resolve(false);assert.equal((await pending).state,'blocked');await settle();assert.ok(f.adapter.prepareIdle());assert.equal(token.isCurrent(),false);
});
