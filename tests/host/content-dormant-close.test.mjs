import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let adapterReady=true,readerReady=true,dormant=false,enterAllowed=true,settleHook=null,controllerOptions,controllers=0,adapters=0,readerRevision=0,adapterRevision=0,scopeKey="scope_A",hello=0;const resumed=[],closeEntries=[],settlements=[];let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const normal=m=>m.type==='HOST_HELLO'?{binding:{...binding(),producerToken:'producer_'+(++hello)}}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 let respond=normal;const readiness=(kind)=>{const revision=kind==='adapter'?adapterRevision:readerRevision;return Object.freeze({isCurrent:()=>kind==='adapter'?adapterReady&&revision===adapterRevision:readerReady&&revision===readerRevision});};const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,identityReader:{read:async()=>({}),prepareIdle:()=>readerReady?readiness('reader'):null},makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapters++,adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>adapterReady?readiness('adapter'):null,prepareRecovery:()=>adapterReady?readiness('adapter'):null}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{controllers++;controllerOptions=o;bridge=o.bridge;return {enterDormant(){closeEntries.push(true);if(!enterAllowed)return false;dormant=true;return true;},async settleDormant(options){settlements.push(options);if(settleHook)await settleHook(options);if(!options.isCurrent())return false;const result=await bridge.releaseIdleMount({handle:{id:'mount',regionEpoch:1},timeoutMs:options.timeoutMs});return result?.ok===true&&options.isCurrent();},dormantReady:()=>dormant,resumeDormant:async c=>{resumed.push(c);return {id:'mount'};},start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
 return {closeEntries,settlements,setEnterAllowed:value=>enterAllowed=value,setSettleHook:value=>settleHook=value,normal,resumed,get controllers(){return controllers;},get adapters(){return adapters;},get controllerOptions(){return controllerOptions;},setDormant:value=>dormant=value,setScope:value=>scopeKey=value,setAdapterReady:value=>{adapterRevision++;adapterReady=value;},setReaderReady:value=>{readerRevision++;readerReady=value;},presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}



const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ready(f){await f.client.start();await drain();assert.equal(typeof f.client.enterDormant,'function');}
const closes=f=>f.calls.filter(message=>message.type==='HOST_UI_IDLE_RELEASE');
// Local close orchestration only; a true result is not a browser shutdown guarantee.
test('explicit content close performs exact idle release without automatic entry or remount',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);assert.equal(f.closeEntries.length,0);assert.equal(closes(f).length,0);
 assert.equal(await f.client.enterDormant(),true);assert.equal(f.closeEntries.length,1);assert.equal(f.settlements.length,1);assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);
 assert.deepEqual(closes(f),[{v:1,type:'HOST_UI_IDLE_RELEASE',documentToken:'doc',producerToken:'producer_1',routeEpoch:1,mountId:'mount'}]);
 assert.equal(f.listeners.size,1,'native runtime listener remains available');
});
test('pending controller ACK settlement is single flight and blocks wake',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setSettleHook(()=>held.promise);
 const first=f.client.enterDormant();await drain();assert.equal(closes(f).length,0);assert.equal(await f.client.enterDormant(),false);assert.equal(f.closeEntries.length,1);
 const count=f.calls.length;await f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,count);assert.equal(f.resumed.length,0);
 held.resolve();assert.equal(await first,true);assert.equal(closes(f).length,1);
});
for(const dependency of ['adapter','reader'])test('nonready '+dependency+' prevents entering controller dormancy',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);(dependency==='adapter'?f.setAdapterReady:f.setReaderReady)(false);assert.equal(await f.client.enterDormant(),false);assert.equal(f.closeEntries.length,0);assert.equal(closes(f).length,0);
});
test('controller refusal leaves the session and frames in place',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);f.setEnterAllowed(false);assert.equal(await f.client.enterDormant(),false);assert.equal(f.settlements.length,0);assert.equal(closes(f).length,0);assert.equal(f.stops,0);assert.equal(f.controllers,1);
});
for(const mode of ['adapter','reader','runtime','native-send','show','route','stop'])test('ACK-wait '+mode+' interference permanently cancels close preparation',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setSettleHook(()=>held.promise);const pending=f.client.enterDormant();await drain();
 if(mode==='adapter'){f.setAdapterReady(false);f.setAdapterReady(true);}if(mode==='reader'){f.setReaderReady(false);f.setReaderReady(true);}
 if(mode==='runtime')[...f.listeners][0]({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer_1',routeEpoch:1,mode:'reading'},{id:'extension'},()=>{});
 if(mode==='native-send')f.adapterOptions.onFirstSendIntent({intentId:'during_close',operationId:'operation',messageId:'message',observedAt:new Date(1000).toISOString()},f.context.binding);
 if(mode==='show')f.client.showReading();if(mode==='route')f.document.location.href+='c/other';if(mode==='stop')f.client.stop();
 await drain();held.resolve();assert.equal(await pending,false);assert.equal(closes(f).length,0);assert.equal(f.controllers,1);if(mode!=='stop')assert.equal(f.stops,0);
 if(mode==='native-send')assert.equal(f.calls.filter(message=>message.type==='HOST_FIRST_SEND_INTENT').length,1,'close must not suppress fresh native intent');
});
test('worker busy rejects close without remount or loss of native listeners',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);f.setResponse(message=>message.type==='HOST_UI_IDLE_RELEASE'?{ok:false,reason:'ui-release-busy'}:f.normal(message));
 assert.equal(await f.client.enterDormant(),false);assert.equal(closes(f).length,1);assert.equal(f.controllers,1);assert.equal(f.stops,0);assert.equal(f.listeners.size,1);
});
test('late idle release response after deadline cannot turn failed close into success',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setResponse(message=>message.type==='HOST_UI_IDLE_RELEASE'?held.promise:f.normal(message));
 const pending=f.client.enterDormant();await drain();assert.equal(closes(f).length,1);await f.advance(6000);assert.equal(await pending,false);assert.equal(f.stops,0);assert.equal(f.controllers,1);
 held.resolve({ok:true});await drain();assert.equal(f.resumed.length,0);assert.equal(f.listeners.size,1);
});
test('unrelated RPC completing during ACK wait still invalidates the original close token',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setSettleHook(()=>held.promise);const pending=f.client.enterDormant();await drain();await f.bridge.workspaceEntered({mountId:'mount'});await drain();held.resolve();assert.equal(await pending,false);assert.equal(closes(f).length,0);
});

test('idle-release bridge cannot issue RPC outside a prepared close attempt',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);assert.equal((await f.bridge.releaseIdleMount({handle:{id:'mount'},timeoutMs:6000})).ok,false);assert.equal(closes(f).length,0);
});
test('worker success arriving after a new native event cannot certify the interrupted close',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setResponse(message=>message.type==='HOST_UI_IDLE_RELEASE'?held.promise:f.normal(message));const pending=f.client.enterDormant();await drain();assert.equal(closes(f).length,1);
 f.adapterOptions.onOldSendOperation({intentId:'fresh_operation',operationId:'operation',messageId:'message',observedAt:new Date(1000).toISOString(),bodyProofId:'body_proof'},f.context.binding);await drain();assert.equal(f.calls.at(-1).type,'HOST_OLD_SEND_OPERATION');
 held.resolve({ok:true});assert.equal(await pending,false);assert.equal(f.stops,0);assert.equal(f.listeners.size,1);assert.equal(f.controllers,1);
});

test('missing frame ACK fails close and replaces unusable frames once in native reading mode',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);
 f.setSettleHook(()=>{f.setDormant(false);throw Error('frame-ack-timeout');});
 assert.equal(await f.client.enterDormant(),false);for(let i=0;i<4;i++)await drain();
 assert.equal(f.controllers,2);assert.equal(f.adapters,2);assert.equal(f.stops,1);assert.equal(f.controllerOptions.initialMode,'reading');assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,2);
 assert.equal(closes(f).length,0,'missing ACK must not reach worker release');assert.equal(f.calls.filter(message=>['HOST_FIRST_SEND_INTENT','HOST_OLD_SEND_OPERATION'].includes(message.type)).length,0);
 for(let i=0;i<4;i++)await drain();assert.equal(f.controllers,2,'failure recovery cannot loop without another explicit operation');
});
test('busy worker after both ACKs keeps dormant frames and permits explicit retry without entering twice',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);let attempts=0;
 f.setResponse(message=>message.type==='HOST_UI_IDLE_RELEASE'?{ok:++attempts>1,...(attempts===1?{reason:'ui-release-busy'}:{})}:f.normal(message));
 assert.equal(await f.client.enterDormant(),false);await drain();assert.equal(f.controllers,1);assert.equal(f.stops,0);assert.equal(f.closeEntries.length,1);assert.equal(f.settlements.length,1);
 assert.equal(await f.client.enterDormant(),true);assert.equal(f.controllers,1);assert.equal(f.stops,0);assert.equal(f.closeEntries.length,1,'existing complete ACK state must be reused');assert.equal(f.settlements.length,2);assert.equal(attempts,2);
});

for(const interference of ['first-send raw IPC','adapter pending'])test('missing ACK with '+interference+' must preserve pending native work instead of rebinding',async t=>{
 const f=fixture(),ack=deferred(),send=deferred();t.after(()=>f.client.stop());await ready(f);
 f.setSettleHook(async()=>{await ack.promise;f.setDormant(false);throw Error('frame-ack-timeout');});
 f.setResponse(message=>message.type==='HOST_FIRST_SEND_INTENT'?send.promise:f.normal(message));
 const closing=f.client.enterDormant();await drain();
 if(interference==='first-send raw IPC'){
  f.adapterOptions.onFirstSendIntent({intentId:'live_send',operationId:'operation',messageId:'message',observedAt:new Date(1000).toISOString()},f.context.binding);await drain();assert.equal(f.calls.at(-1).type,'HOST_FIRST_SEND_INTENT');
 }else f.setAdapterReady(false);
 ack.resolve();assert.equal(await closing,false);for(let i=0;i<3;i++)await drain();
 assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,1);assert.equal(closes(f).length,0);assert.equal(f.listeners.size,1);
 send.resolve({ok:true});f.setAdapterReady(true);for(let i=0;i<3;i++)await drain();assert.equal(f.controllers,1,'late drain cannot revive abandoned close fallback');assert.equal(f.stops,0);
});

for(const interference of ['raw IPC','adapter work'])for(const changedScope of [false,true])test('explicit wake after incomplete close waits for '+interference+' and '+(changedScope?'rejects changed scope':'recovers once in reading'),async t=>{
 const f=fixture(),ack=deferred(),send=deferred();t.after(()=>f.client.stop());await ready(f);
 f.setSettleHook(async()=>{await ack.promise;f.setDormant(false);throw Error('missing-frame-ack');});
 f.setResponse(message=>message.type==='HOST_FIRST_SEND_INTENT'?send.promise:f.normal(message));const closing=f.client.enterDormant();await drain();
 if(interference==='raw IPC')f.adapterOptions.onFirstSendIntent({intentId:'one_native_send',operationId:'operation',messageId:'message',observedAt:new Date(1000).toISOString()},f.context.binding);else f.setAdapterReady(false);
 await drain();ack.resolve();assert.equal(await closing,false);await drain();const wake=f.controllerOptions.onWake;
 await wake();await drain();assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,1,'explicit click during work must not reset active native tasks');
 send.resolve({ok:true});f.setAdapterReady(true);for(let i=0;i<3;i++)await drain();assert.equal(f.controllers,1);assert.equal(f.stops,0);assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,1,'draining work cannot automatically recover');
 if(changedScope)f.setScope('scope_B');const before=f.calls.length;await Promise.all([wake(),wake(),wake()]);for(let i=0;i<4;i++)await drain();
 assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,2,'only one fresh handshake may run');
 assert.deepEqual(f.calls.slice(before).filter(message=>['HOST_HELLO','HOST_REFRESH'].includes(message.type)).map(message=>message.type),['HOST_HELLO','HOST_REFRESH']);
 assert.equal(f.resumed.length,0,'incomplete frame ACK cannot use dormant resume');assert.equal(closes(f).length,0);
 if(changedScope){assert.equal(f.controllers,1,'different scope must be denied before constructing replacement UI');assert.equal(f.adapters,1);assert.equal(f.listeners.size,0);}else{assert.equal(f.controllers,2);assert.equal(f.adapters,2);assert.equal(f.controllerOptions.initialMode,'reading');assert.equal(f.stops,1);}
 assert.equal(f.calls.filter(message=>message.type==='HOST_FIRST_SEND_INTENT').length,interference==='raw IPC'?1:0,'recovery cannot replay a prior native intent');
 for(let i=0;i<3;i++)await drain();assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,2);
});
for(const refusedClose of [false,true])test('non-dormant wake without an entered incomplete close remains inert'+(refusedClose?' after refused entry':''),async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);if(refusedClose){f.setEnterAllowed(false);assert.equal(await f.client.enterDormant(),false);}
 const count=f.calls.length;await f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,count);assert.equal(f.controllers,1);assert.equal(f.stops,0);assert.equal(f.resumed.length,0);
});
test('complete ACK close retains same-controller fresh-authority resume path',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);assert.equal(await f.client.enterDormant(),true);await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,1);assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);assert.equal(f.resumed[0].binding.producerToken,'producer_2');
});
