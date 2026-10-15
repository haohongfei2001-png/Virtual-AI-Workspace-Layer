import {installTreeWalkerDouble} from './tree-walker-double.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTAdapter} from '../../src/host/chatgpt-adapter.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
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
 return {adapter,document,documentListeners,binding,emitted,rebind,selectors,reading,composer,slot,setTime:v=>clock=v,trigger:()=>observer.cb([]),observer:()=>observer,start:emit=>adapter.start({binding,emit:emit??(async p=>{emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'r'};})})};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('formal context remains unbound without owner body proof; bounded proposals carry no scope',async()=>{const f=fixture(),context=await f.start();await tick();assert.equal(context.body.state,'unbound');assert.equal(context.route.conversationId,C);assert.equal(f.emitted.length,1);assert.equal(f.emitted[0].bodyProofId,null);assert.equal(f.emitted[0].routeEpoch,4);assert.equal(Object.hasOwn(f.emitted[0],'scope'),false);assert.deepEqual(f.emitted[0].payload.coverageClaims,[]);f.adapter.stop();});
test('legacy inspect fields refer to native nodes without mutation',async()=>{const f=fixture();await f.start();const result=f.adapter.inspect();assert.equal(result.ok,true);assert.equal(result.reading,f.reading);assert.equal(result.composer,f.composer);assert.equal(result.navigationSlot,f.slot);assert.equal(result.viewMask,'declarative-css');assert.deepEqual(result.historyMaskRoots,[result.history]);f.adapter.stop();});
test('ambiguous boundaries, occupied return slot and overlap reject mounting',async()=>{const f=fixture();await f.start();f.slot.textContent='native title';assert.equal(f.adapter.inspect().ok,false);f.slot.textContent='';f.selectors.set('main > form#composer',[f.composer,f.composer]);assert.equal(f.adapter.inspect().ok,false);f.selectors.set('main > form#composer',[f.composer]);f.composer.getBoundingClientRect=()=>({x:220,y:100,width:700,height:90});assert.equal(f.adapter.inspect().ok,false);f.adapter.stop();});
test('route change stops producer and requests owner rebind without minting epoch',async()=>{const f=fixture();await f.start();await tick();f.document.location.href='https://chatgpt.com/';f.trigger();await tick();assert.equal(f.emitted.length,1);assert.equal(f.rebind.length,1);assert.equal(f.observer().closed,true);assert.equal(f.adapter.inspect().ok,false);assert.deepEqual(await f.adapter.dispatchNative({}),{state:'blocked',reason:'stale-host-binding'});});
test('mutation bursts coalesce and late acknowledgement after stop cannot emit',async()=>{const f=fixture();let finish;await f.start(p=>{f.emitted.push(p);return new Promise(r=>finish=r);});for(let i=0;i<100;i++)f.trigger();await tick();assert.equal(f.emitted.length,1);f.adapter.stop();finish({state:'retry-after',delayMs:0});await tick();assert.equal(f.emitted.length,1);});
test('expiry rejects reads and actions; unsupported snippets and actions are explicit',async()=>{const f=fixture();await f.start();assert.equal(f.adapter.selectedSnippet({}),null);assert.equal((await f.adapter.activateNative('new-chat',{})).state,'blocked');assert.equal(f.adapter.restoreSnippet({},{}).ok,false);f.setTime(100000);await assert.rejects(f.adapter.readLoaded({},new AbortController().signal),/stale-host-binding/);assert.equal((await f.adapter.dispatchNative({})).state,'blocked');f.adapter.stop();});
test('fresh start uses owner epoch and old pending callback cannot affect new producer',async()=>{const f=fixture();let resolve;await f.start(()=>new Promise(r=>resolve=r));f.binding.routeEpoch=9;await f.start();await tick();resolve({state:'accepted'});await tick();assert.equal(f.emitted.length,1);assert.equal(f.emitted[0].routeEpoch,9);f.adapter.stop();});
test('safe ordinary href navigation is planned, never assigned by adapter',async()=>{const f=fixture();await f.start();const url=`https://chatgpt.com/c/44444444-4444-4444-8444-444444444444`;const plan=f.adapter.planNavigation({kind:'resolved',entity:'conversation',nativeId:'44444444-4444-4444-8444-444444444444',navigationURL:url,liveHandle:null});assert.equal(plan.mode,'href');assert.equal(plan.disposition,'new-tab-preserve-current');assert.ok(f.adapter.planKey(plan));assert.equal(f.adapter.nativeHref(url),url);assert.equal(f.adapter.nativeHref('https://evil.test/c/x'),null);assert.equal(f.adapter.currentURL(),`https://chatgpt.com/c/${C}`);f.adapter.stop();});

function retryClock(){let time=0,next=0;const timers=new Map(),issues=[];return {timers,issues,options:{elapsedNow:()=>time,scheduleRetry:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancelRetry:id=>timers.delete(id),onObservationIssue:i=>issues.push(i)},async advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);await t.fn();}await tick();}};}
test('explicit retry-after retains proposal identity and sequence then accepted suppresses duplicate surface',async()=>{const c=retryClock(),f=fixture(c.options),calls=[];await f.start(async p=>{calls.push(p);return calls.length===1?{state:'retry-after',localSeq:p.localSeq,delayMs:50}:{state:'accepted',localSeq:p.localSeq,receiptId:'ok'};});await tick();assert.equal(c.timers.size,1);f.trigger();await c.advance(50);assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);f.trigger();await tick();assert.equal(calls.length,2);assert.equal(c.timers.size,0);f.adapter.stop();});
test('retry budget is monotonic six seconds and stop clears timer',async()=>{const c=retryClock(),f=fixture(c.options);let calls=0;await f.start(async p=>{calls++;return {state:'retry-after',localSeq:p.localSeq,delayMs:50};});await tick();await c.advance(6000);assert.equal(calls,1);assert.equal(c.timers.size,0);assert.equal(c.issues.at(-1).reason,'host-observation-retry-budget');f.trigger();await tick();assert.equal(calls,1);await f.start(async p=>({state:'retry-after',localSeq:p.localSeq,delayMs:50}));await tick();assert.equal(c.timers.size,1);f.adapter.stop();assert.equal(c.timers.size,0);});
test('rejected or unknown ACK reports once and never mutation-replays identical proposal',async()=>{for(const mode of ['rejected','unknown','throw']){const c=retryClock(),f=fixture(c.options);let calls=0;await f.start(async p=>{calls++;if(mode==='throw')throw Error('lost');return {state:mode,localSeq:p.localSeq};});await tick();for(let i=0;i<10;i++)f.trigger();await tick();assert.equal(calls,1);assert.equal(c.timers.size,0);assert.equal(c.issues.length,1);f.adapter.stop();}});
test('retry observes route invalidation before any second emission',async()=>{const c=retryClock(),f=fixture(c.options);let calls=0;await f.start(async p=>{calls++;return {state:'retry-after',localSeq:p.localSeq,delayMs:50};});await tick();f.document.location.href='https://chatgpt.com/';await c.advance(50);assert.equal(calls,1);assert.equal(f.rebind.length,1);assert.equal(c.timers.size,0);});
test('binding renewal preserves observer, producer sequence and existing navigation plan',async()=>{
 const f=fixture();await f.start();await tick();const observer=f.observer();
 const target={kind:'resolved',entity:'conversation',nativeId:C,navigationURL:`https://chatgpt.com/c/${C}`,liveHandle:null};
 const plan=f.adapter.planNavigation(target),key=f.adapter.planKey(plan);
 const before=(await f.adapter.readLoaded({},new AbortController().signal))[0];f.setTime(90000);
 assert.equal(f.adapter.updateBinding({...f.binding,expiresAt:new Date(110000).toISOString()}),true);
 f.setTime(105000);const after=(await f.adapter.readLoaded({},new AbortController().signal))[0];
 assert.equal(after.localSeq,before.localSeq+1);assert.equal(after.producerToken,before.producerToken);assert.equal(after.routeEpoch,before.routeEpoch);assert.equal(f.observer(),observer);assert.notEqual(observer.closed,true);assert.equal(f.adapter.planKey(plan),key);
 f.trigger();await tick();assert.equal(f.emitted.length,1);f.adapter.stop();
});
test('binding renewal rejects every changed identity, excess lifetime and stale owner',async()=>{
 for(const patch of [{documentToken:'other'},{producerToken:'other'},{browserDocumentId:'other'},{routeEpoch:5},{origin:'https://other.test'},{expiresAt:new Date(20001).toISOString()},{expiresAt:new Date(0).toISOString()},{scope:'forged'}]){const f=fixture();await f.start();assert.throws(()=>f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString(),...patch}),/invalid-host-binding-renewal/);f.adapter.stop();}
 for(const change of [f=>f.setTime(100000),f=>f.adapter.stop(),f=>{f.document.location.href='https://chatgpt.com/';}]){const f=fixture();await f.start();change(f);assert.throws(()=>f.adapter.updateBinding({...f.binding,expiresAt:new Date(120000).toISOString()}),/stale-host-binding|host-rebind-required/);}
});

const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
function bodyFixture(options={}){const f=fixture({profile:LEGACY_SURFACE_PROFILE,...options}),root=f.reading;root.ownerDocument=f.document;root.parentElement=null;root.attrs={'data-conversation-id':C};root.style={display:'block',visibility:'visible'};root.getAttribute=k=>root.attrs[k]??null;root.getClientRects=()=>[{}];f.document.defaultView.getComputedStyle=n=>n.style;const makeMessage=id=>({ownerDocument:f.document,isConnected:true,parentElement:root,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:key=>key==='data-message-id'?id:null,get textContent(){throw Error('message-body-read');},get value(){throw Error('draft-read');}});root.children=[makeMessage('M1')];root.querySelectorAll=selector=>selector==='[data-message-id]'?root.children:[];root.contains=n=>{for(let current=n;current;current=current.parentNode??current.parentElement)if(current===root)return true;return false;};f.selectors.set('main > #reading',[root]);return {...f,makeMessage};}
test('configured body and surface share a monotonic producer queue with body first and independent dedupe',async()=>{const f=bodyFixture();await f.start();await settle();assert.deepEqual(f.emitted.map(p=>p.kind),['current-observation','surface-delta']);const [body,surface]=f.emitted;assert(body.localSeq<surface.localSeq);assert.equal(body.producerToken,surface.producerToken);assert.equal(body.payload.body.association,'explicit-body-id');assert.deepEqual(body.payload.body.messageIds,['M1']);assert.equal(body.bodyProofId,null);for(let i=0;i<20;i++)f.trigger();await settle();assert.equal(f.emitted.length,2);f.adapter.stop();});
test('body hidden unproven and restored remount emit fresh epochs without reading message text',async()=>{const f=bodyFixture();await f.start();await settle();f.reading.hidden=true;f.trigger();await settle();let bodies=f.emitted.filter(p=>p.kind==='current-observation');assert.equal(bodies.at(-1).payload.body.association,'unproven');assert.deepEqual(bodies.at(-1).payload.body.evidence.fieldPaths,['current-body-unproven']);f.reading.hidden=false;f.trigger();await settle();bodies=f.emitted.filter(p=>p.kind==='current-observation');assert.equal(bodies.at(-1).payload.body.association,'explicit-body-id');assert(bodies.at(-1).payload.body.regionEpoch>bodies.at(-2).payload.body.regionEpoch);const replacement={...f.reading};replacement.children=[];replacement.querySelectorAll=()=>[];f.selectors.set('main > #reading',[replacement]);f.trigger();await settle();bodies=f.emitted.filter(p=>p.kind==='current-observation');assert.deepEqual(bodies.at(-1).payload.body.messageIds,[]);assert(bodies.at(-1).payload.body.regionEpoch>bodies.at(-2).payload.body.regionEpoch);f.adapter.stop();});
test('renewal rechecks body while same surface stays deduplicated and message additions are fresh',async()=>{const f=bodyFixture();await f.start();await settle();const seq=f.emitted.at(-1).localSeq;f.adapter.updateBinding({...f.binding,expiresAt:new Date(20000).toISOString()});await settle();assert.equal(f.emitted.filter(p=>p.kind==='surface-delta').length,1);assert.equal(f.emitted.filter(p=>p.kind==='current-observation').length,2);assert(f.emitted.at(-1).localSeq>seq);f.reading.children.push(f.makeMessage('M2'));f.trigger();await settle();assert.deepEqual(f.emitted.at(-1).payload.body.messageIds,['M1','M2']);f.adapter.stop();});
test('pending body blocks surface concurrently and route stop discards its late acknowledgement',async()=>{const f=bodyFixture();let resolve;await f.start(p=>{f.emitted.push(p);return new Promise(r=>resolve=r);});await settle();assert.equal(f.emitted.length,1);assert.equal(f.emitted[0].kind,'current-observation');f.trigger();await settle();assert.equal(f.emitted.length,1);f.document.location.href='https://chatgpt.com/';f.trigger();resolve({state:'accepted',localSeq:f.emitted[0].localSeq});await settle();assert.equal(f.emitted.length,1);assert.equal(f.rebind.length,1);});
test('rejected body candidate does not starve the independent initial surface observation',async()=>{const f=bodyFixture();await f.start(async p=>{f.emitted.push(p);return {state:p.kind==='current-observation'?'rejected':'accepted',localSeq:p.localSeq};});await settle();assert.deepEqual(f.emitted.map(p=>p.kind),['current-observation','surface-delta']);f.adapter.stop();});

// Passive trusted gestures below are explicit unit doubles, not browser/physical gesture evidence.
function sendFixture(){const f=bodyFixture(),editor={tagName:'TEXTAREA'},button={tagName:'BUTTON',type:'submit'};for(const node of [f.composer,editor,button])Object.assign(node,{ownerDocument:f.document,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false});f.composer.tagName='FORM';editor.form=button.form=f.composer;editor.parentElement=button.parentElement=f.composer;f.composer.contains=n=>n===editor||n===button;editor.contains=button.contains=()=>false;for(const n of [editor,button])for(const key of ['value','textContent','files'])Object.defineProperty(n,key,{get(){throw Error('private-native-content-read');}});f.selectors.set('#prompt-textarea',[editor]);f.selectors.set('main > form#composer > button[type="submit"]',[button]);return {...f,editor,button,click(){f.documentListeners.get('click')?.({type:'click',isTrusted:true,target:button,button:0,detail:1});}};}
function bodyAck(p){return {state:'accepted',localSeq:p.localSeq,receiptId:'unit-receipt',...(p.kind==='current-observation'?{bodyProofId:'accepted-body-proof',bodyEpoch:7}:{})};}
test('trusted send queues exact intent-only candidate with accepted owner proof and shared sequence',async()=>{const f=sendFixture();await f.start(async p=>{f.emitted.push(p);return bodyAck(p);});await settle();f.click();await settle();assert.deepEqual(f.emitted.map(p=>p.kind),['current-observation','surface-delta','send-candidate']);const candidate=f.emitted.at(-1);assert.equal(candidate.bodyProofId,'accepted-body-proof');assert.equal(candidate.producerToken,f.binding.producerToken);assert.equal(candidate.routeEpoch,f.binding.routeEpoch);assert(candidate.localSeq>f.emitted.at(-2).localSeq);assert.deepEqual(Object.keys(candidate.payload).sort(),['conversationId','evidence','intentId','messageId','observedAt','operationId','stage']);assert.equal(candidate.payload.conversationId,C);assert.equal(candidate.payload.stage,'intent');assert.equal(candidate.payload.messageId,null);assert.equal(candidate.payload.operationId,null);assert.deepEqual(candidate.payload.evidence.fieldPaths,['native-send-intent']);assert.equal(candidate.payload.evidence.sourceKind,'native-dom');assert.equal(candidate.payload.evidence.receiptId,null);assert.equal(candidate.payload.ackWitness,undefined);f.trigger();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,1);f.adapter.stop();});
test('click before accepted body proof is never backfilled into a later send',async()=>{const f=sendFixture();let release;await f.start(p=>{f.emitted.push(p);return p.kind==='current-observation'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p));});await settle();f.click();release();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);f.adapter.stop();});
test('send queue is bounded and uses one in-flight producer, never native re-clicks',async()=>{const f=sendFixture();let release;await f.start(p=>{f.emitted.push(p);if(p.kind==='surface-delta')return new Promise(r=>release=()=>r(bodyAck(p)));return Promise.resolve(bodyAck(p));});await settle();assert.deepEqual(f.emitted.map(p=>p.kind),['current-observation','surface-delta']);for(let i=0;i<60;i++)f.click();await settle();assert.equal(f.emitted.length,2);release();for(let i=0;i<8;i++)await settle();const sends=f.emitted.filter(p=>p.kind==='send-candidate');assert.equal(sends.length,32);assert.equal(new Set(sends.map(p=>p.payload.intentId)).size,32);assert(f.emitted.every((p,i)=>!i||p.localSeq>f.emitted[i-1].localSeq));f.adapter.stop();});
for(const mode of ['remount','hidden','conversation','route','stop'])test('queued intent is discarded after '+mode,async()=>{const f=sendFixture();let release;await f.start(p=>{f.emitted.push(p);return p.kind==='surface-delta'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p));});await settle();f.click();if(mode==='remount'){const replacement={...f.reading};f.selectors.set('main > #reading',[replacement]);}else if(mode==='hidden')f.reading.hidden=true;else if(mode==='conversation')f.reading.attrs['data-conversation-id']='44444444-4444-4444-8444-444444444444';else if(mode==='route')f.document.location.href='https://chatgpt.com/';else f.adapter.stop();f.trigger();release();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);f.adapter.stop();});
test('generic accepted observation receipt cannot substitute for a body proof',async()=>{const f=sendFixture();await f.start();await settle();f.click();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);f.adapter.stop();});

test('normal message append preserves captured intent before the next body observation, without upgrading to ACK',async()=>{const f=sendFixture();let release;await f.start(p=>{f.emitted.push(p);return p.kind==='surface-delta'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p));});await settle();f.click();f.reading.children.push(f.makeMessage('M2'));f.trigger();release();await settle();const sends=f.emitted.filter(p=>p.kind==='send-candidate');assert.equal(sends.length,1);assert.equal(sends[0].bodyProofId,'accepted-body-proof');assert.equal(sends[0].payload.stage,'intent');assert.equal(sends[0].payload.messageId,null);assert.equal(sends[0].payload.operationId,null);const appended=f.emitted.find(p=>p.kind==='current-observation'&&p.payload.body.messageIds.includes('M2'));assert(appended);assert(sends[0].localSeq<appended.localSeq);f.adapter.stop();});

// The DOM module never receives an inferred body authority from the adapter.
test('snippet composition exposes only freshly acknowledged body identity and revokes on route or stop',async()=>{
 let config,stops=0;const f=bodyFixture({snippetsFactory:c=>{config=c;return {stop:()=>stops++,selectedSnippet:()=>config.proof(),restoreSnippet:()=>({ok:config.guard()&&config.current()!==null})};}});
 let release;await f.start(p=>p.kind==='current-observation'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p)));await settle();
 assert.equal(config.current(),null);assert.equal(config.proof(),null);release();await settle();
 assert.deepEqual(config.proof(),{bodyProofId:'accepted-body-proof',conversationId:C,regionEpoch:1,messageIds:['M1']});
 assert.equal(f.adapter.selectedSnippet({}).conversationId,C);
 f.reading.children.push(f.makeMessage('M2'));assert.equal(config.proof(),null);assert.equal(config.current(),null);
 f.trigger();await settle();release();await settle();assert.deepEqual(config.proof().messageIds,['M1','M2']);
 f.document.location.href='https://chatgpt.com/';assert.equal(config.proof(),null);assert.equal(stops,1);assert.equal(f.adapter.selectedSnippet({}),null);assert.equal(f.adapter.restoreSnippet({},{}).ok,false);
});
test('snippet body callbacks expire and a prior generation stays revoked after restart',async()=>{
 const configs=[];const f=bodyFixture({snippetsFactory:c=>{configs.push(c);return {stop(){},selectedSnippet:()=>null,restoreSnippet:()=>({ok:false})};}});
 await f.start(bodyAck);await settle();const old=configs[0];assert(old.proof());f.setTime(100000);assert.equal(old.proof(),null);
 f.setTime(0);await f.start(bodyAck);await settle();assert.equal(old.proof(),null);assert(configs[1].proof());f.adapter.stop();assert.equal(configs[1].proof(),null);
});
test('document renewal cannot extend a snippet proof before the new body acknowledgement',async()=>{
 let config;const f=bodyFixture({snippetsFactory:c=>{config=c;return {stop(){},selectedSnippet:()=>null,restoreSnippet:()=>({ok:false})};}});
 let hold=false,release;await f.start(p=>hold&&p.kind==='current-observation'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p)));await settle();assert(config.proof());
 f.setTime(90000);hold=true;f.adapter.updateBinding({...f.binding,expiresAt:new Date(110000).toISOString()});await settle();
 f.setTime(100000);assert.equal(config.guard(),true);assert.equal(config.proof(),null);release();await settle();assert(config.proof());f.adapter.stop();
});

test('adapter forwards native dispatch hook with real discovered node and stops safely inside hook',async()=>{
 for(const stopInHook of [false,true]){
  let f,event,cancelEvent,clicks=0;f=fixture({onNativeDispatchCancelled:value=>{cancelEvent=value;},inputRisk:()=>({state:'clear',flags:[]}),authorize:()=>true,onNativeDispatch:value=>{event=value;if(stopInHook)f.adapter.stop();}});
  const root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>n===button,querySelectorAll:()=>[button]},button={tagName:'BUTTON',textContent:'Same',isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null,getClientRects:()=>[{}],matches:()=>false,click:()=>clicks++};
  f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();await tick();const proposals=await f.adapter.readLoaded(null),target=proposals.find(p=>p.kind==='surface-delta').payload.candidates[0].target,plan=f.adapter.planNavigation(target);
  assert.equal(plan.mode,'native-control');const command={actionId:'action',uiGrantId:'grant',mountId:'mount',planRevision:plan.planRevision,targetKey:f.adapter.planKey(plan)},result=await f.adapter.dispatchNative(command);
  assert.equal(cancelEvent,stopInHook?event:undefined);assert.equal(event.node,button);assert.equal(event.plan,plan);assert.equal(event.originalURL,f.document.location.href);assert.equal(clicks,stopInHook?0:1);assert.equal(result.state,stopInHook?'unconfirmed':'dispatched');f.adapter.stop();
 }
});

test('candidate identity proxy uses live discovery and rejects route, replacement and restart tokens',async()=>{
 const f=fixture(),root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>n===button,querySelectorAll:()=>[button]};let button={tagName:'BUTTON',textContent:'Same',isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null,click(){}};
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);assert.equal(f.adapter.captureCandidateIdentity({}),null);await f.start();
 const handle=()=>f.emitted.at(-1).payload.candidates[0].target.control;await tick();const h=handle(),token=f.adapter.captureCandidateIdentity(h);assert.ok(token);assert.equal(f.adapter.matchesCandidateIdentity(token,h),true);assert.equal(f.adapter.matchesCandidateIdentity({},h),false);
 button={...button};const proposals=await f.adapter.readLoaded(null),replacement=proposals[0].payload.candidates[0].target.control;assert.equal(f.adapter.matchesCandidateIdentity(token,replacement),false);
 const next=f.adapter.captureCandidateIdentity(replacement);f.document.location.href='https://chatgpt.com/';assert.equal(f.adapter.matchesCandidateIdentity(next,replacement),false);assert.equal(f.adapter.captureCandidateIdentity(replacement),null);
 await f.start();assert.equal(f.adapter.matchesCandidateIdentity(next,replacement),false);f.adapter.stop();assert.equal(f.adapter.matchesCandidateIdentity(next,replacement),false);
});

test('adapter drains all 256 long-title observations in bounded packets without cycling',async()=>{
 const f=fixture(),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>nodes};
 for(let i=0;i<256;i++){const id='11111111-1111-4111-8111-'+i.toString(16).padStart(12,'0');nodes.push({tagName:'A',textContent:'长'.repeat(200),isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/'+id:null});}
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);await f.start();for(let i=0;i<100;i++)await tick();
 assert(f.emitted.length>1);assert.equal(new Set(f.emitted.flatMap(p=>p.payload.candidates.map(c=>c.renderKey))).size,256);assert(f.emitted.every(p=>new TextEncoder().encode(JSON.stringify(p)).length<=65536));assert(f.emitted.every((p,i)=>!i||p.localSeq>f.emitted[i-1].localSeq));
 const count=f.emitted.length;f.trigger();for(let i=0;i<30;i++)await tick();assert.equal(f.emitted.length,count);const loaded=await f.adapter.readLoaded(null);assert(loaded.length>1);assert.equal(new Set(loaded.flatMap(p=>p.payload.candidates.map(c=>c.renderKey))).size,256);f.adapter.stop();
});

test('duplicate native history controls reach owner reduction as one conversation fact',async()=>{
 const {surfaceBatch}=await import('../../src/host/surface-batch.mjs');const f=fixture(),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>nodes},id='77777777-7777-4777-8777-777777777777';
 for(let i=0;i<2;i++)nodes.push({tagName:'A',textContent:'Native duplicate',isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/'+id:null});
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);await f.start();for(let i=0;i<10;i++)await tick();assert.equal(f.emitted.length,1);const p=f.emitted[0];assert.equal(p.payload.candidates.length,2);assert.notEqual(p.payload.candidates[0].target.liveHandle.id,p.payload.candidates[1].target.liveHandle.id);
 const batch=surfaceBatch(p,{scope:{verified:true,provider:'chatgpt',accountId:'test',organizationId:'personal'},binding:f.binding,profile:LEGACY_SURFACE_PROFILE,urlPolicy:createURLPolicy(),sourceRevision:1,observedAt:'2026-10-14T00:00:00Z',validUntil:'2026-10-14T00:01:00Z'});assert.equal(batch.refs.length,1);assert.equal(batch.refs[0].id,id);f.adapter.stop();
});

test('finite producer pass reaches 1000 loaded conversations and detects a tail rename without cycling',async()=>{
 const f=fixture(),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>nodes};
 for(let i=0;i<1000;i++){const id='11111111-1111-4111-8111-'+i.toString(16).padStart(12,'0');nodes.push({tagName:'A',textContent:'Native '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/'+id:null});}
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);await f.start();for(let i=0;i<150;i++)await tick();
 assert.equal(new Set(f.emitted.flatMap(p=>p.payload.candidates.map(c=>c.renderKey))).size,1000);assert(f.emitted.every(p=>p.payload.candidates.length<=256&&new TextEncoder().encode(JSON.stringify(p)).length<=65536));
 const count=f.emitted.length;f.trigger();for(let i=0;i<150;i++)await tick();assert.equal(f.emitted.length,count);
 nodes[999].textContent='Renamed tail';f.trigger();for(let i=0;i<150;i++)await tick();assert(f.emitted.slice(count).some(p=>p.payload.candidates.some(c=>c.nativeTitle==='Renamed tail')));
 const changed=f.emitted.length;f.trigger();for(let i=0;i<150;i++)await tick();assert.equal(f.emitted.length,changed);assert(f.emitted.every((p,i)=>!i||p.localSeq>f.emitted[i-1].localSeq));f.adapter.stop();
});
for(const mode of ['stop','root-replaced'])test('pending multi-page scan handles '+mode+' without emitting old tail',async()=>{
 const f=fixture();let nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>[...nodes]};
 for(let i=0;i<600;i++){const id='22222222-2222-4222-8222-'+i.toString(16).padStart(12,'0');nodes.push({tagName:'A',textContent:'Old '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/'+id:null});}
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);let release;
 await f.start(p=>{f.emitted.push(p);return f.emitted.length===1?new Promise(r=>release=()=>r({state:'accepted',localSeq:p.localSeq})):Promise.resolve({state:'accepted',localSeq:p.localSeq});});await tick();
 if(mode==='stop')f.adapter.stop();else{root.isConnected=false;root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>[...nodes]};nodes=[{...nodes[599],textContent:'Replacement tail',parentNode:root,parentElement:root}];f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);f.trigger();}
 release();for(let i=0;i<100;i++)await tick();
 if(mode==='stop')assert.equal(f.emitted.length,1);else{assert(f.emitted.slice(1).some(p=>p.payload.candidates.some(c=>c.nativeTitle==='Replacement tail')));assert(f.emitted.slice(1).every(p=>p.payload.candidates.every(c=>!c.nativeTitle.startsWith('Old '))));}f.adapter.stop();
});

test('continuous assistant text mutations do not starve loaded directory pages or hide body-ID changes',async t=>{
 const f=bodyFixture(),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>[...nodes]};
 for(let i=0;i<1000;i++){const id='55555555-5555-4555-8555-'+i.toString(16).padStart(12,'0');nodes.push({tagName:'A',textContent:'Native '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/'+id:null});}
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);
 t.after(()=>f.adapter.stop());
 let directoryVisits=0,directoryWalkers=0;const createWalker=f.document.createTreeWalker;
 f.document.createTreeWalker=(r,what)=>{const walker=createWalker(r,what);if(r!==root)return walker;directoryWalkers++;return {nextNode(){const n=walker.nextNode();if(n)directoryVisits++;return n;}};};
 const textNode={nodeType:3,parentNode:f.reading.children[0],parentElement:f.reading.children[0]};let surfaceCount=0;
 await f.start(p=>{f.emitted.push(p);if(p.kind==='surface-delta'){surfaceCount++;f.observer().cb([{type:'characterData',target:textNode}]);}return Promise.resolve(bodyAck(p));});for(let i=0;i<150;i++)await tick();
 t.diagnostic(JSON.stringify({directoryVisits,directoryWalkers,surfaceCount,uniqueIDs:new Set(f.emitted.filter(p=>p.kind==='surface-delta').flatMap(p=>p.payload.candidates.map(c=>c.renderKey))).size}));
 assert.equal(new Set(f.emitted.filter(p=>p.kind==='surface-delta').flatMap(p=>p.payload.candidates.map(c=>c.renderKey))).size,1000);assert(surfaceCount<30);
 const before=f.emitted.length;for(let i=0;i<20;i++)f.observer().cb([{type:'characterData',target:textNode}]);for(let i=0;i<100;i++)await tick();assert.equal(f.emitted.length,before);
 const message=f.makeMessage('M2');f.reading.children.push(message);f.observer().cb([{type:'childList',target:f.reading,addedNodes:[message],removedNodes:[]}]);await settle();assert(f.emitted.some(p=>p.kind==='current-observation'&&p.payload.body.messageIds.includes('M2')));f.adapter.stop();
});

test('content candidate listing reaches native IDless tail through bounded adapter pages',async()=>{
 const {createContentCandidates}=await import('../../src/host/content-candidates.mjs');let clicks=0;const f=fixture({inputRisk:()=>({state:'clear',flags:[]}),authorize:()=>true}),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>[...nodes]};
 for(let i=0;i<605;i++)nodes.push({tagName:'BUTTON',textContent:'Candidate '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null,getClientRects:()=>[{}],matches:()=>false,click:()=>{assert.equal(i,604);clicks++;}});
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();const owner=createContentCandidates({adapter:f.adapter,current:()=>true,showReading:()=>true,now:()=>0});
 const tail=await owner.listPage(576);assert.equal(tail.total,605);assert.equal(tail.items.length,29);assert.equal(tail.nextOffset,null);assert.equal(tail.items.at(-1).nativeTitle,'Candidate 604');
 const result=await owner.activate({candidate:tail.items.at(-1),actionId:'tail-action',uiGrantId:'grant',mountId:'mount',expiresAt:new Date(6000).toISOString()});assert.equal(result.state,'dispatched');assert.equal(clicks,1);owner.stop();f.adapter.stop();
});
test('both loaded iterators reject stop, abort and elapsed budget between pages',async()=>{
 for(const method of ['loadedPages','loadedCandidatePages'])for(const mode of ['stop','abort','deadline']){let elapsed=0;const f=fixture({elapsedNow:()=>elapsed}),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>nodes};for(let i=0;i<300;i++)nodes.push({tagName:'BUTTON',textContent:'Candidate '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null});f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();const controller=new AbortController(),iterator=f.adapter[method](controller.signal);assert.equal((await iterator.next()).done,false);if(mode==='stop')f.adapter.stop();if(mode==='abort')controller.abort();if(mode==='deadline')elapsed=6000;await assert.rejects(iterator.next(),/stale-host-loaded-read/);f.adapter.stop();}
});

test('popover toggle rescans deferred native changes and stop removes its listener',async()=>{
 const f=fixture(),button={tagName:'BUTTON',textContent:'Before',isConnected:true,ownerDocument:f.document,getAttribute:()=>null},root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>n===button,querySelectorAll:()=>[button]};button.parentNode=root;Object.assign(button,visibleDirectoryNode(f.document,root));f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();await settle();assert.equal(f.emitted.at(-1).payload.candidates[0].nativeTitle,'Before');
 button.textContent='Changed while masked';const toggle=f.documentListeners.get('toggle');assert.equal(typeof toggle,'function');toggle();await settle();assert.equal(f.emitted.at(-1).payload.candidates[0].nativeTitle,'Changed while masked');const count=f.emitted.length;toggle();await settle();assert.equal(f.emitted.length,count);f.adapter.stop();assert.equal(f.documentListeners.has('toggle'),false);toggle();await settle();assert.equal(f.emitted.length,count);
});

test('trusted native preparation refreshes restored reading proof before later send, never creates intent itself',async()=>{
 const f=sendFixture();await f.start(p=>{f.emitted.push(p);return bodyAck(p);});await settle();f.reading.hidden=true;f.trigger();await settle();assert.equal(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.association,'unproven');
 f.reading.hidden=false;f.documentListeners.get('pointerdown')({type:'pointerdown',isTrusted:true,target:f.button,button:0});await settle();assert.equal(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.association,'explicit-body-id');assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);
 f.click();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,1);f.adapter.stop();assert.equal(f.documentListeners.has('pointerdown'),false);
});
test('binding renewal cannot make an expired body proof eligible for a trusted send',async()=>{
 const f=sendFixture();let hold=false,release;await f.start(p=>{f.emitted.push(p);return hold&&p.kind==='current-observation'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p));});await settle();f.setTime(90000);hold=true;f.adapter.updateBinding({...f.binding,expiresAt:new Date(110000).toISOString()});await settle();f.setTime(100000);f.click();release();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);f.adapter.stop();
});

test('queued send expires with the proof captured at the gesture even when transport is renewed',async()=>{
 const f=sendFixture();let release;await f.start(p=>{f.emitted.push(p);return p.kind==='surface-delta'?new Promise(r=>release=()=>r(bodyAck(p))):Promise.resolve(bodyAck(p));});await settle();f.setTime(90000);f.click();f.adapter.updateBinding({...f.binding,expiresAt:new Date(110000).toISOString()});f.setTime(100000);release();await settle();assert.equal(f.emitted.filter(p=>p.kind==='send-candidate').length,0);f.adapter.stop();
});


test('both loaded iterators recheck expiry and cancellation before declaring their final packet complete',async()=>{
 for(const method of ['loadedPages','loadedCandidatePages'])for(const mode of ['stop','abort','deadline']){
  let elapsed=0;const f=fixture({elapsedNow:()=>elapsed});await f.start();
  const controller=new AbortController(),iterator=f.adapter[method](controller.signal);
  assert.equal((await iterator.next()).done,false);
  if(mode==='stop')f.adapter.stop();if(mode==='abort')controller.abort();if(mode==='deadline')elapsed=6000;
  await assert.rejects(iterator.next(),/stale-host-loaded-read/);f.adapter.stop();
 }
});


test('candidate scan rejects directory mutation before identity cleanup or publishing mixed pages',async()=>{
 const {createContentCandidates}=await import('../../src/host/content-candidates.mjs');
 for(const count of [1,300]){
  const f=fixture(),nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>nodes.includes(n),querySelectorAll:()=>nodes};
  for(let i=0;i<count;i++)nodes.push({tagName:'BUTTON',textContent:'Candidate '+i,isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null});
  f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();await tick();
  let scans=0,upgrades=0,changed=false;
  const adapter={...f.adapter,async *loadedCandidatePages(){for await(const packet of f.adapter.loadedCandidatePages()){yield packet;if(!changed){changed=true;nodes[0].textContent='Renamed';f.trigger();}}}};
  const owner=createContentCandidates({adapter,current:()=>true,showReading:()=>true,onScan:()=>scans++,isUpgraded:()=>{upgrades++;return false;}});
  await assert.rejects(owner.listPage(),/stale-host-loaded-read/);assert.equal(scans,0);assert.equal(upgrades,0);
  const page=await owner.listPage();assert.equal(page.total,count);assert.equal(page.items[0].nativeTitle,'Renamed');assert.equal(scans,1);assert.equal(upgrades,count);
  owner.stop();f.adapter.stop();
 }
});

test('loaded candidate snapshot remains usable during unrelated body text changes',async()=>{
 const f=fixture();await f.start();await tick();const iterator=f.adapter.loadedPages();assert.equal((await iterator.next()).done,false);
 f.observer().cb([{type:'characterData',target:{parentNode:f.reading}}]);
 assert.equal((await iterator.next()).done,true);f.adapter.stop();
});


test('directory mutation requests native surrender before scanning while unrelated body text does not',async()=>{
 const changes=[],f=fixture({onSurfaceChange:records=>changes.push(records)});await f.start();await tick();
 f.observer().cb([{type:'characterData',target:{parentNode:f.reading}}]);await tick();assert.equal(changes.length,0);
 const records=[{type:'characterData',target:f.selectors.get(LEGACY_SURFACE_PROFILE.regions.history)[0]}];const callback=f.observer().cb;callback(records);assert.equal(changes.length,1);assert.equal(changes[0],records);f.adapter.stop();callback(records);assert.equal(changes.length,1);
});

for(const mode of ['plan-expiry','late-authorization'])test('adapter native action uses monotonic '+mode+' despite wall clock rollback',async()=>{
 let elapsed=100,authorizations=0,clicks=0;const f=fixture({elapsedNow:()=>elapsed,inputRisk:()=>({state:'clear',flags:[]}),authorize:async()=>{if(++authorizations===2&&mode==='late-authorization'){elapsed=6100;f.setTime(2000);}return true;}});
 const root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>n===button,querySelectorAll:()=>[button]},button={tagName:'BUTTON',textContent:'Same',isConnected:true,ownerDocument:f.document,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:()=>null,getClientRects:()=>[{}],matches:()=>false,click:()=>clicks++};
 f.setTime(5000);f.selectors.set(LEGACY_SURFACE_PROFILE.regions.projects,[root]);await f.start();await tick();const proposals=await f.adapter.readLoaded(null),target=proposals.find(p=>p.kind==='surface-delta').payload.candidates[0].target,plan=f.adapter.planNavigation(target);
 assert.equal(plan.mode,'native-control');if(mode==='plan-expiry'){elapsed=30100;f.setTime(2000);}
 const command={actionId:'deadline',uiGrantId:'grant',mountId:'mount',planRevision:plan.planRevision,targetKey:f.adapter.planKey(plan)};
 assert.equal((await f.adapter.dispatchNative(command)).reason,'stale-navigation-plan');assert.equal(clicks,0);assert.equal((await f.adapter.dispatchNative(command)).reason,'action-already-used');f.adapter.stop();
});

const currentConversationTarget=()=>({kind:'resolved',entity:'conversation',nativeId:C,navigationURL:`https://chatgpt.com/c/${C}`,liveHandle:null});
test('production default body proof enables same-target only after exact current owner ACK',async()=>{
 const f=bodyFixture();let release;await f.start(p=>p.kind==='current-observation'?new Promise(resolve=>release=()=>resolve(bodyAck(p))):Promise.resolve(bodyAck(p)));await settle();
 assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');release();await settle();const plan=f.adapter.planNavigation(currentConversationTarget());assert.equal(plan.mode,'same-target');assert.equal(plan.bodyProofId,'accepted-body-proof');assert(f.adapter.planKey(plan));f.adapter.stop();assert.equal(f.adapter.planNavigation(currentConversationTarget()).mode,'unavailable');
});
for(const patch of [{bodyEpoch:undefined},{bodyEpoch:-1},{bodyEpoch:1.5},{bodyEpoch:NaN},{bodyEpoch:Number.MAX_SAFE_INTEGER+1},{bodyProofId:undefined},{state:'rejected'}])test('production default same-target rejects incomplete or rejected body ACK '+JSON.stringify(patch),async()=>{
 const f=bodyFixture();await f.start(async p=>({...bodyAck(p),...patch}));await settle();assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');f.adapter.stop();
});
test('production default does not infer body proof from route or body discovery alone',async()=>{
 const f=bodyFixture();await f.start();await settle();assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');f.adapter.stop();
});
for(const change of ['message-ids','same-id-root-replacement','hidden-body'])test('current URL alone cannot retain same-target after '+change,async()=>{
 const f=bodyFixture();await f.start(async p=>bodyAck(p));await settle();assert.equal(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');
 if(change==='message-ids')f.reading.children.push(f.makeMessage('M2'));
 if(change==='same-id-root-replacement'){const replacement={...f.reading};f.selectors.set('main > #reading',[replacement]);}
 if(change==='hidden-body')f.reading.hidden=true;
 assert.equal(f.adapter.currentURL(),currentConversationTarget().navigationURL);assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');f.adapter.stop();
});
test('binding renewal does not extend original same-target ACK lifetime before a new accepted observation',async()=>{
 const f=bodyFixture();let accepted=false;await f.start(async p=>{if(p.kind==='current-observation'){if(accepted)return {state:'rejected',localSeq:p.localSeq};accepted=true;}return bodyAck(p);});await settle();assert.equal(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');
 f.setTime(99999);assert(f.adapter.updateBinding({...f.binding,expiresAt:new Date(119999).toISOString()}));f.setTime(100000);assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');await settle();assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');f.adapter.stop();
});
for(const change of ['stop','body-replacement','new-generation'])test('delayed owner ACK cannot promote stale same-target after '+change,async()=>{
 const f=bodyFixture();let release,first=true;await f.start(p=>{if(p.kind==='current-observation'&&first){first=false;return new Promise(resolve=>release=()=>resolve(bodyAck(p)));}return Promise.resolve({state:'rejected',localSeq:p.localSeq});});await settle();
 if(change==='stop')f.adapter.stop();
 if(change==='body-replacement')f.selectors.set('main > #reading',[{...f.reading}]);
 if(change==='new-generation'){f.adapter.stop();await f.start();}
 release();await settle();assert.notEqual(f.adapter.planNavigation(currentConversationTarget()).mode,'same-target');f.adapter.stop();
});
test('same-target dispatch rechecks production body fingerprint after authorization yields',async()=>{
 let authorizeResolve;const f=bodyFixture({authorize:()=>new Promise(resolve=>authorizeResolve=resolve)});await f.start(async p=>bodyAck(p));await settle();const plan=f.adapter.planNavigation(currentConversationTarget());assert.equal(plan.mode,'same-target');
 const pending=f.adapter.dispatchNative({actionId:'current-action',uiGrantId:'grant',mountId:'mount',planRevision:plan.planRevision,targetKey:f.adapter.planKey(plan)});await settle();f.reading.children.push(f.makeMessage('M2'));authorizeResolve(true);assert.equal((await pending).state,'blocked');f.adapter.stop();
});
test('explicit bodyProof override remains available to existing integrations',async()=>{
 const f=bodyFixture({bodyProof:()=>({conversationId:C,bodyProofId:'explicit-proof',bodyEpoch:9})});await f.start();await settle();const plan=f.adapter.planNavigation(currentConversationTarget());assert.equal(plan.mode,'same-target');assert.equal(plan.bodyProofId,'explicit-proof');f.adapter.stop();
});
test('owned reading presentation mask does not publish inherited-hidden messages as an empty body or renew proof',async()=>{
 let masked=false;const f=fixture({profile:LEGACY_SURFACE_PROFILE,isOwnedMask:n=>masked&&n===f.reading});
 const message={ownerDocument:f.document,isConnected:true,parentElement:f.reading,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:k=>k==='data-message-id'?'m1':null};
 Object.assign(f.reading,{ownerDocument:f.document,parentElement:null,style:{display:'block',visibility:'visible'},getClientRects:()=>[{}],getAttribute:k=>k==='data-conversation-id'?C:null,querySelectorAll:()=>[message],contains:n=>n===message});
 f.selectors.set('main > #reading',[f.reading]);
 await f.start(async p=>{f.emitted.push(p);return {state:'accepted',localSeq:p.localSeq,receiptId:'r',...(p.kind==='current-observation'?{bodyProofId:'proof',bodyEpoch:1}:{})};});
 for(let i=0;i<10;i++)await tick();
 assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').map(p=>p.payload.body.messageIds),[['m1']]);
 masked=true;f.reading.style.visibility=message.style.visibility='hidden';f.trigger();for(let i=0;i<10;i++)await tick();
 assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').map(p=>p.payload.body.messageIds),[['m1']]);
 masked=false;f.reading.style.visibility=message.style.visibility='visible';f.trigger();for(let i=0;i<10;i++)await tick();
 assert.equal(f.emitted.filter(p=>p.kind==='current-observation').length,1);
 message.style.visibility='hidden';f.trigger();for(let i=0;i<10;i++)await tick();
 assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.messageIds,[],'native hidden change still invalidates current messages');
 f.adapter.stop();
});
test('masked binding renewal emits no body proof and native remount cannot inherit the old body epoch',async()=>{
 let masked=false;const f=bodyFixture({isOwnedMask:n=>masked&&n===f.reading});await f.start(p=>{f.emitted.push(p);return bodyAck(p);});await settle();const initial=f.emitted.find(p=>p.kind==='current-observation');masked=true;f.reading.style.visibility='hidden';f.reading.children[0].style.visibility='hidden';f.setTime(90000);f.adapter.updateBinding({...f.binding,expiresAt:new Date(110000).toISOString()});await settle();assert.equal(f.emitted.filter(p=>p.kind==='current-observation').length,1);
 const replacement={...f.reading,style:{display:'block',visibility:'visible'},children:[]};replacement.querySelectorAll=()=>[];f.selectors.set('main > #reading',[replacement]);f.trigger();await settle();const latest=f.emitted.filter(p=>p.kind==='current-observation').at(-1);assert(latest.payload.body.regionEpoch>initial.payload.body.regionEpoch);assert.deepEqual(latest.payload.body.messageIds,[]);f.adapter.stop();
});
test('route change under owned presentation mask stops producer rather than retaining current authority',async()=>{
 let masked=false;const f=bodyFixture({isOwnedMask:n=>masked&&n===f.reading});await f.start(p=>{f.emitted.push(p);return bodyAck(p);});await settle();masked=true;f.reading.style.visibility='hidden';f.reading.children[0].style.visibility='hidden';const count=f.emitted.length;f.document.location.href='https://chatgpt.com/';f.trigger();await settle();assert.equal(f.rebind.length,1);assert.equal(f.emitted.length,count);assert.equal(f.adapter.inspect().ok,false);
});
test('message replacement while masked is observed freshly on release, never cached as old IDs',async()=>{
 let masked=false;const f=bodyFixture({isOwnedMask:n=>masked&&n===f.reading});await f.start(p=>{f.emitted.push(p);return bodyAck(p);});await settle();masked=true;f.reading.style.visibility='hidden';f.reading.children=[f.makeMessage('M2')];f.reading.children[0].style.visibility='hidden';f.trigger();await settle();assert.equal(f.emitted.filter(p=>p.kind==='current-observation').length,1);masked=false;f.reading.style.visibility=f.reading.children[0].style.visibility='visible';f.trigger();await settle();assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.messageIds,['M2']);f.adapter.stop();
});
for(const mutation of ['childList','data-message-id'])test('masked native body '+mutation+' synchronously surrenders before publishing fresh body',async()=>{
 let masked=false,released=0;const f=bodyFixture({isOwnedMask:n=>masked&&n===f.reading,onSurfaceChange:records=>{if(!records.length)return;released++;masked=false;f.reading.style.visibility='visible';for(const n of f.reading.children)n.style.visibility='visible';}});
 await f.start(p=>{f.emitted.push(p);return bodyAck(p);});await settle();const initial=f.emitted.find(p=>p.kind==='current-observation');masked=true;f.reading.style.visibility='hidden';const old=f.reading.children[0],next=f.makeMessage('M2');next.style.visibility='hidden';f.reading.children=[next];
 const record=mutation==='childList'?{type:'childList',target:f.reading,addedNodes:[next],removedNodes:[old]}:{type:'attributes',attributeName:'data-message-id',target:next};
 f.observer().cb([record]);assert.equal(masked,false);assert.equal(released,1);await settle();const latest=f.emitted.filter(p=>p.kind==='current-observation').at(-1);assert.notEqual(latest,initial);assert.deepEqual(latest.payload.body.messageIds,['M2']);f.adapter.stop();
});

// SYS05 deterministic mechanism probe only: no browser timings or real-S claim.
function sys05Directory(f,size=32){
 const nodes=[],root={...visibleDirectoryNode(f.document),isConnected:true,contains:n=>{for(let current=n;current;current=current.parentNode??current.parentElement)if(current===root)return true;return false;},querySelectorAll:()=>nodes};
 for(let i=0;i<size;i++)nodes.push({tagName:'A',textContent:'Native '+i,isConnected:true,...visibleDirectoryNode(f.document,root),parentNode:root,getAttribute:k=>k==='href'?'https://chatgpt.com/c/55555555-5555-4555-8555-'+i.toString(16).padStart(12,'0'):null});
 f.selectors.set(LEGACY_SURFACE_PROFILE.regions.history,[root]);
 let visits=0,walkers=0;const original=f.document.createTreeWalker;
 f.document.createTreeWalker=(r,what)=>{const walker=original(r,what);if(r!==root)return walker;walkers++;return {nextNode(){const n=walker.nextNode();if(n)visits++;return n;}};};
 return {nodes,root,counts:()=>({visits,walkers})};
}
for(const faithful of [false,true])test('SYS05 settled token scan characterization '+(faithful?'recursive':'direct-child'),async t=>{
 const f=bodyFixture();t.after(()=>f.adapter.stop());if(!faithful)f.reading.contains=n=>f.reading.children.includes(n);
 const d=sys05Directory(f),message=f.reading.children[0],text={nodeType:3,parentNode:message,parentElement:message};
 await f.start(p=>{f.emitted.push(p);return Promise.resolve(bodyAck(p));});await settle();const before=d.counts(),emitted=f.emitted.length;
 for(let i=0;i<3;i++){f.observer().cb([{type:'characterData',target:text}]);await settle();}
 const after=d.counts();t.diagnostic(JSON.stringify({faithful,before,after,extraVisits:after.visits-before.visits,extraWalkers:after.walkers-before.walkers,extraPackets:f.emitted.length-emitted}));
 assert.equal(after.visits-before.visits,0);assert.equal(f.emitted.length,emitted);
 // Same-ID assistant token changes preserve the accepted body ID set; ACK ID additions must still be observed.
 const ack=f.makeMessage('USER-ACK');f.reading.children.push(ack);f.observer().cb([{type:'childList',target:f.reading,addedNodes:[ack],removedNodes:[]}]);await settle();
 assert.deepEqual(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.messageIds,['M1','USER-ACK']);
 d.nodes[31].textContent='Native title updated';f.observer().cb([{type:'characterData',target:{nodeType:3,parentNode:d.nodes[31],parentElement:d.nodes[31]}}]);await settle();
 assert(f.emitted.filter(p=>p.kind==='surface-delta').some(p=>p.payload.candidates.some(c=>c.nativeTitle==='Native title updated')));
 f.reading.hidden=true;f.observer().cb([{type:'attributes',attributeName:'hidden',target:f.reading}]);await settle();assert.equal(f.emitted.filter(p=>p.kind==='current-observation').at(-1).payload.body.association,'unproven');
});
test('SYS05 settled assistant token-only changes must not traverse directory',async t=>{
 const f=bodyFixture();t.after(()=>f.adapter.stop());const d=sys05Directory(f),message=f.reading.children[0],text={nodeType:3,parentNode:message,parentElement:message};
 await f.start();await settle();const before=d.counts();f.observer().cb([{type:'characterData',target:text}]);await settle();const after=d.counts();
 assert.equal(after.visits-before.visits,0,'body-only characterData must not start a directory traversal');
});
