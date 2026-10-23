import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceController} from '../../src/host/surface-controller.mjs';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture({onWake=()=>false}={}){
 let time=1000,next=0,layer=false,occupied=false;const events=new Map(),timers=new Map(),mutations=[];
 const calls={disposed:0,suspended:0,renewed:0,confirmed:0,shown:0,messages:[],ended:[]};
 const win={addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},MutationObserver:class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){}}};
 const doc={defaultView:win,location:{href:'https://chatgpt.com/'},body:{},createElement(){return {dataset:{},style:{},events:{},setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}};
 const slot={isConnected:true,ownerDocument:doc,children:[],append(button){this.children.push(button);button.parent=this;},contains(node){return this.children.includes(node);}};
 const frames=['workspace','sidebar'].map(role=>({role,frame:{isConnected:true,ownerDocument:doc,contentWindow:{postMessage(data,origin){calls.messages.push({data,origin});}}}}));
 const binding={documentToken:'doc',producerToken:'producer',browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()};
 const inspection={ok:true,regionEpoch:1,navigationSlot:slot};
 const adapter={start:async()=>({binding}),stop(){},inspect:()=>occupied?{ok:false,reason:'native-content-occupies-return-slot'}:inspection,hasNativeLayer:()=>layer,updateBinding:()=>true};
 const surface={mount:async()=>({id:'mount',documentToken:'doc',regionEpoch:1}),frames:()=>frames,showWorkspace(){calls.shown++;},showReading(){},suspend(){calls.suspended++;},dispose(){calls.disposed++;},visibility:()=>({workspace:false,sidebar:false})};
 const bridge={registerMount:async()=>({ok:true}),confirmParent:async({role})=>{calls.confirmed++;return {ok:true,grant:{id:'grant_'+role,mountId:'mount',role,parentDocumentId:'parent',uiDocumentId:'ui_'+role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};}};
 const controller=createSurfaceController({document:doc,adapter,surface,bridge,extensionOrigin:'chrome-extension://ext',onWake,onTerminated:reason=>calls.ended.push(reason),now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 const message=(role,type='VAIWL_UI_JOIN',extra={},overrides={})=>{const event={origin:'chrome-extension://ext',source:frames.find(x=>x.role===role).frame.contentWindow,data:{type,role,...(type==='VAIWL_UI_JOIN'?{nonce:'nonce_'+role}:{}),...extra},...overrides};for(const fn of events.get('message')??[])fn(event);};
 return {controller,adapter,surface,bridge,calls,slot,frames,doc,timers,message,layer(v){layer=v;},occupied(v){occupied=v;},mutate(){for(const fn of mutations)fn();},async ready(){await controller.start({});message('workspace');message('sidebar');await flush();controller.showNativeReading();},advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}

// L: actual controller; browser surfaces and worker bridge are explicit doubles.
async function dormant(t,{busy=true}={}){
 const f=fixture();t.after(()=>f.controller.stop());await f.ready();assert.equal(f.controller.enterDormant(),true);
 const requestId=f.calls.messages.find(item=>item.data.type==='VAIWL_UI_IDLE').data.requestId;
 for(const role of ['workspace','sidebar'])f.message(role,'VAIWL_UI_IDLE_ACK',{requestId});assert.equal(f.controller.dormantReady(),true);
 if(busy){f.bridge.releaseIdleMount=async()=>({ok:false,reason:'ui-release-busy'});assert.equal(await f.controller.settleDormant({isCurrent:()=>true}),false);}
 f.advance(1000);
 f.adapter.start=()=>assert.fail('lease renewal must not restart adapter');f.bridge.renewSession=()=>assert.fail('no ordinary UI renewal');
 return f;
}
const renewed=binding=>({...binding,expiresAt:new Date(22000).toISOString()});

async function renewable(t){const f=await dormant(t);f.bridge.renewDormantBinding=async({binding})=>({ok:true,binding:renewed(binding)});assert.equal(await f.controller.renewDormantLease(),true);return f;}
test('cancelled busy close keeps original frames and only fresh dual JOIN restores authority',async t=>{
 const f=await renewable(t),frames=f.frames.map(item=>item.frame),confirmed=f.calls.confirmed,shown=f.calls.shown;
 let ready=0;f.bridge.cancelledCloseReady=()=>ready++;
 f.surface.rebind=()=>assert.fail('must not rebind');f.bridge.registerMount=()=>assert.fail('must not register again');
 assert.equal(f.controller.cancelDormantClose(),true);
 const idle=f.calls.messages.find(item=>item.data.type==='VAIWL_UI_IDLE').data.requestId,wakes=f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE');
 assert.equal(wakes.length,2);assert(wakes.every(item=>item.data.requestId===idle));assert.deepEqual(f.frames.map(item=>item.frame),frames);
 assert.equal(f.controller.showWorkspace(),false);assert.equal(f.controller.focusFrame('workspace'),false);assert.equal(f.calls.confirmed,confirmed);assert.equal(ready,0);
 f.message('workspace');await flush();assert.equal(f.controller.showWorkspace(),false);assert.equal(f.calls.confirmed,confirmed+1);assert.equal(ready,0);
 f.message('sidebar');await flush();assert.equal(f.calls.confirmed,confirmed+2);assert.equal(ready,1);assert.equal(f.calls.shown,shown,'dual JOIN resumes reading');assert.equal(f.controller.presentationMode(),'reading');assert.equal(f.controller.showWorkspace(),true);assert.equal(f.calls.disposed,0);
 assert.equal(f.controller.cancelDormantClose(),false,'consumed transition cannot resend WAKE');assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,2);
});
for(const reason of ['no-busy','not-renewed','renew-failed','expired','route','frame','stop'])test('cancel dormant close refuses '+reason,async t=>{
 const f=reason==='no-busy'?await dormant(t,{busy:false}):['not-renewed','renew-failed'].includes(reason)?await dormant(t):await renewable(t);
 if(reason==='renew-failed'){f.bridge.renewDormantBinding=async()=>({ok:false});assert.equal(await f.controller.renewDormantLease(),false);}
 if(reason==='expired')f.advance(20000);if(reason==='route')f.doc.location.href+='c/changed';if(reason==='frame')f.frames[0].frame.contentWindow={};if(reason==='stop')f.controller.stop();
 assert.equal(f.controller.cancelDormantClose(),false);assert.equal(f.calls.messages.filter(item=>item.data.type==='VAIWL_UI_WAKE').length,0);assert.equal(f.controller.showWorkspace(),false);
});

test('native layer during cancellation cannot strand successful dual grant notification',async t=>{
 const f=await renewable(t);let ready=0;f.bridge.cancelledCloseReady=()=>ready++;
 assert.equal(f.controller.cancelDormantClose(),true);f.layer(true);f.controller.suspend('native-layer');
 const shown=f.calls.shown;f.message('workspace');await flush();assert.equal(ready,0);
 f.message('sidebar');await flush();assert.equal(ready,1);assert.equal(f.calls.shown,shown);assert.equal(f.controller.showWorkspace(),false);
});

for(const joined of [null,'workspace','sidebar'])test('partial cancelled close destroys both frames before one guarded handoff '+joined,async t=>{
 const f=await renewable(t);let release=0,revoked=0,heldResolve;const held=new Promise(r=>heldResolve=r);
 f.surface.dispose=()=>{f.calls.disposed++;for(const item of f.frames)item.frame.isConnected=false;};
 f.bridge.revokeMount=()=>{revoked++;};f.bridge.releaseCancelledClose=async request=>{release++;assert.equal(request.isCurrent(),true);assert(f.frames.every(x=>!x.frame.isConnected));assert.equal(f.calls.disposed,1);assert.equal(revoked,0);await held;return true;};
 assert.equal(f.controller.cancelDormantClose(),true);if(joined){f.message(joined);await flush();}
 f.message(joined??'workspace','VAIWL_UI_SUSPEND');await flush();assert.equal(release,1);assert.equal(revoked,0);assert.equal(f.controller.showWorkspace(),false);assert.equal(f.slot.children.length,0);
 heldResolve();await flush();assert.equal(revoked,1);f.controller.stop();await flush();assert.equal(release,1);
});
for(const cause of ['connected-frame','user-exit','lease-expired'])test('cancelled close does not offer unsafe handoff '+cause,async t=>{
 const f=await renewable(t);let release=0,revoked=0;
 if(cause!=='connected-frame')f.surface.dispose=()=>{for(const item of f.frames)item.frame.isConnected=false;};
 f.bridge.revokeMount=()=>revoked++;f.bridge.releaseCancelledClose=()=>{release++;return true;};assert.equal(f.controller.cancelDormantClose(),true);
 if(cause==='lease-expired')f.advance(20000);else f.message('workspace',cause==='user-exit'?'VAIWL_UI_EXIT':'VAIWL_UI_SUSPEND');await flush();
 assert.equal(release,0);assert.equal(revoked,1);assert.equal(f.controller.showWorkspace(),false);
});

// L integration: actual content and controller, explicit Chrome/DOM/worker
// doubles. Unlike the layer tests, the real callback and RPC counters interact.
for(const cleanup of ['quiet','pending-cancel'])test('partial JOIN termination hands original mount through guarded release after '+cleanup,async t=>{
 const {createHostContentSession}=await import('../../src/host/content-session.mjs');
 const f=fixture();f.controller.stop();f.doc.location.origin='https://chatgpt.com';
 const calls=[];let hello=0,releases=0,controller,options,adapterStart,cancelOnStop=false,resolveCancel;const cancelDone=new Promise(resolve=>resolveCancel=resolve);
 const bound=()=>({documentToken:'doc',producerToken:'producer_'+hello,browserDocumentId:'parent',routeEpoch:1,origin:'https://chatgpt.com',expiresAt:new Date(21000).toISOString()});
 const runtime={id:'ext',getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener(){},removeListener(){}},sendMessage:async m=>{
  calls.push(m);
  if(m.type==='HOST_INGESTION_PASS'&&m.phase==='cancel')return cancelDone;
  if(m.type==='HOST_HELLO'){hello++;return {binding:bound()};}
  if(m.type==='HOST_REFRESH')return {state:'verified',scopeKey:'scope'};
  if(m.type==='HOST_DOCUMENT_RENEW')return {ok:true,binding:bound()};
  if(m.type==='HOST_UI_IDLE_RELEASE')return ++releases===1?{ok:false,reason:'ui-release-busy'}:{ok:true};
  if(m.type==='HOST_UI_CONFIRM')return {ok:true,grant:{id:'grant_'+m.role,mountId:'mount',role:m.role,parentDocumentId:'parent',uiDocumentId:'ui_'+m.role,scopeGrantId:'scope',expiresAt:new Date(21000).toISOString()}};
  return {ok:true};
 }};
 f.adapter.start=async o=>{adapterStart=o;return {binding:o.binding};};f.adapter.stop=()=>{if(cancelOnStop){cancelOnStop=false;return adapterStart.ingestionPass({phase:'cancel',passSeq:1,profileId:'surface',profileVersion:1});}};f.adapter.prepareIdle=f.adapter.prepareRecovery=()=>({isCurrent:()=>true});
 const mount=f.surface.mount;f.surface.mount=async(...args)=>{for(const x of f.frames)x.frame.isConnected=true;return mount(...args);};
 f.surface.dispose=()=>{f.calls.disposed++;for(const x of f.frames)x.frame.isConnected=false;};
 const session=createHostContentSession({document:f.doc,runtime,now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'client',identityReader:{read:async()=>({}),prepareIdle:()=>({isCurrent:()=>true})},adapterFactory:()=>f.adapter,surfaceFactory:()=>f.surface,plansFactory:()=>({}),controllerFactory:o=>{options=o;controller=createSurfaceController({...o,now:()=>1000,elapsedNow:()=>1000});return controller;}});
 t.after(()=>session.stop());await session.start();f.message('workspace');f.message('sidebar');await flush();session.showReading();
 const closing=session.enterDormant();await flush();
 const idle=f.calls.messages.find(x=>x.data.type==='VAIWL_UI_IDLE').data.requestId;
 f.message('workspace','VAIWL_UI_IDLE_ACK',{requestId:idle});f.message('sidebar','VAIWL_UI_IDLE_ACK',{requestId:idle});
 await closing;await flush();assert.equal(releases,1);assert.equal(hello,1);assert.equal(controller.showWorkspace(),false);
 f.message('workspace');await flush();assert.equal(controller.showWorkspace(),false);
 if(cleanup==='pending-cancel')cancelOnStop=true;
 f.message('sidebar','VAIWL_UI_SUSPEND');for(let i=0;i<4;i++)await flush();
 if(cleanup==='pending-cancel'){assert.equal(releases,1);assert.equal(hello,1);assert(f.frames.every(x=>!x.frame.isConnected));resolveCancel({ok:true});for(let i=0;i<4;i++)await flush();}
 assert.equal(releases,2);assert.equal(hello,2);assert.equal(options.initialMode,'reading');assert.equal(f.calls.disposed,1);
 const releaseIndex=calls.findLastIndex(m=>m.type==='HOST_UI_IDLE_RELEASE'),helloIndex=calls.findLastIndex(m=>m.type==='HOST_HELLO');assert(releaseIndex<helloIndex);
 assert.equal(calls[releaseIndex].producerToken,'producer_1');assert.equal(calls.filter(m=>m.type==='HOST_REFRESH').at(-1).producerToken,'producer_2');
 f.message('workspace');f.message('sidebar');await flush();assert.equal(controller.showWorkspace(),true);
});

for(const outcome of ['complete','deadline','reject','route','stop'])test('partial cleanup retains original six-second total and cannot revive after '+outcome,async t=>{
 const f=await renewable(t);let finish,reject,release=0,revoke=0,remaining;
 const pending=new Promise((resolve,fail)=>{finish=resolve;reject=fail;});
 f.adapter.stop=()=>pending;f.surface.dispose=()=>{for(const x of f.frames)x.frame.isConnected=false;};
 f.bridge.revokeMount=()=>revoke++;f.bridge.releaseCancelledClose=async request=>{release++;remaining=request.timeoutMs;return true;};
 assert.equal(f.controller.cancelDormantClose(),true);f.message('sidebar','VAIWL_UI_SUSPEND');await flush();
 assert(f.frames.every(x=>!x.frame.isConnected));assert.equal(release,0);assert.equal(revoke,0);
 if(outcome==='deadline'){f.advance(6000);await flush();assert.equal(revoke,1);finish(true);}
 else if(outcome==='reject')reject(Error('cleanup-failed'));
 else {f.advance(4000);if(outcome==='route')f.doc.location.href+='changed';if(outcome==='stop')f.controller.stop();finish(true);}
 await flush();assert.equal(release,outcome==='complete'?1:0);if(outcome==='complete')assert.equal(remaining,2000);assert.equal(revoke,1);
});
