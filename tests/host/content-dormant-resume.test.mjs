import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let adapterReady=true,readerReady=true,dormant=true,controllerOptions,controllers=0,adapters=0,readerRevision=0,adapterRevision=0,scopeKey="scope_A",hello=0;const resumed=[];let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0,presentationMode="reading";const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 const normal=m=>m.type==='HOST_HELLO'?{binding:{...binding(),producerToken:'producer_'+(++hello)}}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 let respond=normal;const readiness=(kind)=>{const revision=kind==='adapter'?adapterRevision:readerRevision;return Object.freeze({isCurrent:()=>kind==='adapter'?adapterReady&&revision===adapterRevision:readerReady&&revision===readerRevision});};const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,identityReader:{read:async()=>({}),prepareIdle:()=>readerReady?readiness('reader'):null},makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapters++,adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>adapterReady?readiness('adapter'):null,prepareRecovery:()=>adapterReady?readiness('adapter'):null}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{controllers++;controllerOptions=o;bridge=o.bridge;return {presentationMode:()=>presentationMode,dormantReady:()=>dormant,resumeDormant:async c=>{resumed.push(c);return {id:'mount'};},start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
 return {normal,resumed,get controllers(){return controllers;},get adapters(){return adapters;},get controllerOptions(){return controllerOptions;},setDormant:value=>dormant=value,setScope:value=>scopeKey=value,setAdapterReady:value=>{adapterRevision++;adapterReady=value;},setReaderReady:value=>{readerRevision++;readerReady=value;},presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}


const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function ready(f){await f.client.start();await drain();assert.equal(typeof f.controllerOptions.onWake,'function');}

test('dormant wake performs fresh HELLO and same-scope REFRESH before installing producer-isolated callbacks',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);const original=f.context,before=f.calls.length;
 await f.controllerOptions.onWake();await drain();assert.deepEqual(f.calls.slice(before).map(m=>m.type),['HOST_HELLO','HOST_REFRESH']);
 assert.equal(f.resumed.length,1);assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.stops,0);
 const resumed=f.resumed[0];assert.equal(resumed.binding.producerToken,'producer_2');assert.notEqual(resumed.binding,original.binding);assert.notEqual(resumed.emit,original.emit);assert.notEqual(resumed.ingestionPass,original.ingestionPass);
 const numbered=f.calls.filter(m=>m.seq).map(m=>m.seq);assert(numbered.every((v,i)=>i===0||v>numbered[i-1]));
 await resumed.ingestionPass({phase:'start',passSeq:1,profileId:'fixture',profileVersion:1});assert.equal(f.calls.at(-1).producerToken,'producer_2');
});
test('slow HELLO never resumes early and concurrent wake requests are coalesced',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);const before=f.calls.length;f.setResponse(m=>m.type==='HOST_HELLO'?held.promise:f.normal(m));
 const first=f.controllerOptions.onWake();for(let i=0;i<10;i++)void f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,before+1);assert.equal(f.resumed.length,0);
 held.resolve({binding:{...f.binding(),producerToken:'fresh_producer'}});await first;await drain();assert.equal(f.resumed.length,1);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);
});
for(const scope of ['scope_B',undefined])test('wake rejects changed or absent scope '+scope,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);f.setScope(scope);await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,0);assert(f.stops>0);assert.equal(f.listeners.size,0);
});
for(const dependency of ['adapter','reader'])test('wake refuses initially pending '+dependency,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);const before=f.calls.length;(dependency==='adapter'?f.setAdapterReady:f.setReaderReady)(false);await f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,before);assert.equal(f.resumed.length,0);
});
for(const mode of ['adapter','reader','route','stop','event'])test('pending wake cannot resume after '+mode+' invalidation',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setResponse(m=>m.type==='HOST_HELLO'?held.promise:f.normal(m));const pending=f.controllerOptions.onWake();await drain();
 if(mode==='adapter'){f.setAdapterReady(false);f.setAdapterReady(true);}if(mode==='reader'){f.setReaderReady(false);f.setReaderReady(true);}if(mode==='route')f.document.location.href+='c/other';if(mode==='stop')f.client.stop();if(mode==='event')[...f.listeners][0]({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer_1',routeEpoch:1,mode:'reading'},{id:'extension'},()=>{});
 held.resolve({binding:{...f.binding(),producerToken:'fresh_producer'}});await pending;await drain();assert.equal(f.resumed.length,0);assert(f.stops>0);
});
test('expired old document lease can recover with fresh authorization without remounting',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);await f.advance(20001);assert.equal(f.client.prepareIdle(),null);await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,1);assert.equal(f.controllers,1);assert.equal(f.adapters,1);assert.equal(f.resumed[0].binding.producerToken,'producer_2');
});
test('non-dormant controller cannot initiate recovery',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);f.setDormant(false);const before=f.calls.length;await f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,before);assert.equal(f.resumed.length,0);
});
for(const patch of [{producerToken:'producer_1'},{browserDocumentId:'different_document'},{origin:'https://other.test'}])test('fresh HELLO refuses changed document or reused producer '+JSON.stringify(patch),async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),producerToken:'fresh',...patch}}:f.normal(m));await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,0);assert(f.stops>0);
});
test('a previously unrecorded scope cannot qualify for dormant recovery',async t=>{
 const f=fixture();t.after(()=>f.client.stop());f.setScope(undefined);await ready(f);const before=f.calls.length;await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,0);assert.equal(f.calls.length,before);
});
test('pending ordinary content IPC prevents a fresh dormant handshake',async t=>{
 const f=fixture(),held=deferred();t.after(()=>f.client.stop());await ready(f);f.setResponse(m=>m.type==='HOST_UI_WORKSPACE_ENTERED'?held.promise:f.normal(m));
 const pending=f.bridge.workspaceEntered({mountId:'mount'});await drain();const before=f.calls.length;await f.controllerOptions.onWake();await drain();assert.equal(f.calls.length,before);assert.equal(f.resumed.length,0);
 held.resolve({ok:true});await pending;
});

test('late old ingestion callbacks never send under replacement producer authority',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);const old=f.context;await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,1);
 const before=f.calls.length;
 for(const phase of ['start','cancel'])try{await old.ingestionPass({phase,passSeq:1,profileId:'fixture',profileVersion:1});}catch{}
 await drain();const late=f.calls.slice(before).filter(message=>message.type==='HOST_INGESTION_PASS');assert(late.every(message=>message.producerToken===old.binding.producerToken));
 await f.resumed[0].ingestionPass({phase:'start',passSeq:2,profileId:'fixture',profileVersion:1});assert.equal(f.calls.at(-1).producerToken,'producer_2');
});
for(const callback of ['onFirstSendIntent','onOldSendOperation'])test(callback+' rejects missing producer and cannot relabel an old delayed intent',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await ready(f);const oldBinding=f.context.binding;await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,1);
 const type=callback==='onFirstSendIntent'?'HOST_FIRST_SEND_INTENT':'HOST_OLD_SEND_OPERATION',intent={intentId:'late_intent',observedAt:new Date(1000).toISOString()};
 const missingStart=f.calls.length;f.adapterOptions[callback](intent);await drain();assert.equal(f.calls.length,missingStart);
 const oldStart=f.calls.length;f.adapterOptions[callback](intent,oldBinding);await drain();assert(f.calls.slice(oldStart).filter(message=>message.type===type).every(message=>message.producerToken===oldBinding.producerToken));
 f.adapterOptions[callback]({...intent,intentId:'current_intent'},f.resumed[0].binding);await drain();assert.equal(f.calls.at(-1).type,type);assert.equal(f.calls.at(-1).producerToken,'producer_2');
});

test('fresh wake accepts restarted identity authority through the real isolated reader challenge chain',async t=>{
 const {createIsolatedSessionReader}=await import('../../src/host/isolated-session-reader.mjs');
 let heldFetch=null;const fetches=[],reader=createIsolatedSessionReader({origin:'https://chatgpt.com',now:()=>1000,elapsedNow:()=>1000,fetch:async url=>{
  fetches.push(url);if(heldFetch)await heldFetch.promise;
  const value=url.endsWith('/api/auth/session')?{user:{id:'offline_user'},expires:new Date(100000).toISOString(),accessToken:'PRIVATE_OFFLINE_TOKEN'}:{accounts:{P:{account:{account_id:'P',structure:'personal'}}}};
  const response=new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const f=fixture({identityReader:reader});t.after(()=>f.client.stop());f.document.defaultView.top=f.document.defaultView;await ready(f);
 const challenge=(binding,authorityEpoch)=>({type:'HOST_IDENTITY_CHALLENGE',challenge:'challenge_'+binding.producerToken,providerId:'chatgpt-session-v1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,authorityEpoch,actualURL:f.document.location.href,expiresAt:new Date(6000).toISOString(),timeoutMs:5000});
 const dispatch=message=>{let reply;[...f.listeners][0](message,{id:'extension'},value=>reply=value);assert.deepEqual(reply,{ok:true});};
 dispatch(challenge(f.context.binding,17));for(let i=0;i<5;i++)await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_IDENTITY_RESULT').length,1);
 const refresh=deferred();heldFetch=deferred();f.setResponse(message=>{
  if(message.type==='HOST_REFRESH'){dispatch(challenge({...f.binding(),producerToken:'producer_2'},1));return refresh.promise;}
  if(message.type==='HOST_IDENTITY_RESULT'&&message.producerToken==='producer_2'){assert.equal(message.authorityEpoch,1);assert.equal(message.ok,true);refresh.resolve({state:'verified',scopeKey:'scope_A'});return {ok:true};}
  return f.normal(message);
 });
 const waking=f.controllerOptions.onWake();for(let i=0;i<3;i++)await drain();assert.equal(f.resumed.length,0);assert.equal(reader.prepareIdle(),null);
 const pendingFetch=heldFetch;heldFetch=null;pendingFetch.resolve();await waking;await drain();assert.equal(f.resumed.length,1);assert.equal(f.controllers,1);assert.equal(fetches.length,4);
 const results=f.calls.filter(m=>m.type==='HOST_IDENTITY_RESULT');assert.deepEqual(results.map(m=>[m.producerToken,m.authorityEpoch]),[['producer_1',17],['producer_2',1]]);assert(!JSON.stringify(results).includes('PRIVATE_OFFLINE_TOKEN'));
});

for(const outcome of ['settled','timeout'])test('verified REFRESH preceding held identity RESULT waits within original wake budget: '+outcome,async t=>{
 const reader={prepareIdle:()=>Object.freeze({isCurrent:()=>true}),read:async()=>({principalId:'offline_user',expiresAt:new Date(100000).toISOString(),contexts:[{id:'P',kind:'personal'}],providerProfile:'chatgpt-session-v1',transport:'isolated-fixed-fetch'})};
 const f=fixture({identityReader:reader}),hello=deferred(),result=deferred();t.after(()=>f.client.stop());f.document.defaultView.top=f.document.defaultView;await ready(f);
 f.setResponse(message=>{
  if(message.type==='HOST_HELLO')return hello.promise;
  if(message.type==='HOST_REFRESH'){
   let dispatched;[...f.listeners][0]({type:'HOST_IDENTITY_CHALLENGE',challenge:'reordered_result',providerId:'chatgpt-session-v1',documentToken:'doc',producerToken:'fresh_producer',routeEpoch:1,authorityEpoch:1,actualURL:f.document.location.href,expiresAt:new Date(11000).toISOString(),timeoutMs:6000},{id:'extension'},reply=>dispatched=reply);
   assert.deepEqual(dispatched,{ok:true});return {state:'verified',scopeKey:'scope_A'};
  }
  if(message.type==='HOST_IDENTITY_RESULT')return result.promise;
  return f.normal(message);
 });
 const waking=f.controllerOptions.onWake();await drain();await f.advance(4000);hello.resolve({binding:{...f.binding(),producerToken:'fresh_producer'}});for(let i=0;i<3;i++)await drain();
 assert.equal(f.calls.filter(message=>message.type==='HOST_IDENTITY_RESULT').length,1);assert.equal(f.resumed.length,0);assert.equal(f.stops,0);
 if(outcome==='settled'){
  await f.advance(1000);assert.equal(f.resumed.length,0);result.resolve({ok:true});await waking;assert.equal(f.resumed.length,1);assert.equal(f.stops,0);
 }else{
  await f.advance(1999);assert.equal(f.resumed.length,0);assert.equal(f.stops,0);await f.advance(1);await waking;assert.equal(f.resumed.length,0);assert(f.stops>0);
  result.resolve({ok:true});await drain();assert.equal(f.resumed.length,0);
 }
});
test('reentrant ordinary RPC from prepareRecovery cancels preparation before fresh HELLO',async t=>{
 let f,pending;const held=deferred();f=fixture({adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,prepareIdle:()=>Object.freeze({isCurrent:()=>true}),prepareRecovery:()=>{pending=f.bridge.workspaceEntered({mountId:'mount'});return Object.freeze({isCurrent:()=>true});}})});t.after(()=>f.client.stop());await ready(f);
 f.setResponse(message=>message.type==='HOST_UI_WORKSPACE_ENTERED'?held.promise:f.normal(message));const helloCount=f.calls.filter(message=>message.type==='HOST_HELLO').length;
 await f.controllerOptions.onWake();await drain();assert.equal(f.calls.filter(message=>message.type==='HOST_HELLO').length,helloCount);assert.equal(f.calls.at(-1).type,'HOST_UI_WORKSPACE_ENTERED');assert.equal(f.resumed.length,0);
 held.resolve({ok:true});await pending;
});

for(const early of [false,true])test('denied dormant scope can recover only after READY with a fresh handshake '+early,async t=>{
 const f=fixture({contextRecovery:true});t.after(()=>f.client.stop());await ready(f);const old=f.context;let denied=false;
 f.setResponse(message=>{if(message.type==='HOST_REFRESH'&&!denied){denied=true;if(early)void f.client.contextReady();return {state:'ambiguous'};}return f.normal(message);});
 await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,0,'old dormant mount never resumes under denied authority');assert(f.stops>0);
 if(!early){assert.equal(f.controllers,1);const calls=f.calls.length;await f.advance(1000);assert.equal(f.calls.length,calls,'no automatic handshake without a READY signal');await f.client.contextReady();await drain();}
 assert.equal(f.controllers,2,'READY must remain usable after denied scope');assert.equal(f.controllerOptions.initialMode,'reading','fresh mount preserves dormant reading intent');assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,3);assert.equal(f.context.binding.producerToken,'producer_3');assert.equal(f.context.binding.browserDocumentId,old.binding.browserDocumentId);
 await assert.rejects(old.emit({}),/stale-content-session/);
});
test('explicit stop after denied dormant scope disarms later READY',async()=>{
 const f=fixture({contextRecovery:true});await ready(f);f.setResponse(m=>m.type==='HOST_REFRESH'?{state:'ambiguous'}:f.normal(m));await f.controllerOptions.onWake();await drain();f.client.stop();const before=f.calls.length;await f.client.contextReady();assert.equal(f.calls.length,before);assert.equal(f.controllers,1);
});

for(const stage of ['HOST_HELLO','HOST_REFRESH'])for(const early of [false,true])test('C2 dormant '+stage+' transport loss waits for fresh READY '+early,async t=>{
 const f=fixture({contextRecovery:true});t.after(()=>f.client.stop());await ready(f);const old=f.context;let failed=false;
 f.setResponse(message=>{if(message.type===stage&&!failed){failed=true;if(early)void f.client.contextReady();throw Error('Receiving end does not exist');}return f.normal(message);});
 await f.controllerOptions.onWake();await drain();assert.equal(f.resumed.length,0,'lost transport cannot resume old mount');assert(f.stops>0);
 if(!early){assert.equal(f.controllers,1);const count=f.calls.length;await f.advance(1000);assert.equal(f.calls.length,count,'transport failure does not schedule another request');await f.client.contextReady();await drain();}
 assert.equal(f.controllers,2,'a later genuine context notification must remain usable');assert.equal(f.controllerOptions.initialMode,'reading');
 assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,3);assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,stage==='HOST_HELLO'?2:3);
 await assert.rejects(old.emit({}),/stale-content-session/);
});
for(const mode of ['stop','pagehide','user-exit'])test('C2 dormant transport loss cannot bypass '+mode,async t=>{
 const f=fixture({contextRecovery:true}),held=deferred();t.after(()=>f.client.stop());await ready(f);const old=f.controllerOptions;
 f.setResponse(m=>m.type==='HOST_HELLO'?held.promise.then(()=>{throw Error('port closed');}):f.normal(m));const pending=old.onWake();await drain();
 if(mode==='stop')f.client.stop();else if(mode==='pagehide')f.events.get('pagehide')?.({persisted:false});else old.onTerminated('ui-user-exit');
 held.resolve();await pending;await drain();const count=f.calls.length;await f.client.contextReady();await drain();assert.equal(f.calls.length,count);assert.equal(f.controllers,1);assert.equal(f.resumed.length,0);
});
for(const stage of ['HOST_HELLO','HOST_REFRESH'])test('C2 dormant '+stage+' timeout preserves six-second total budget and rejects late success',async t=>{
 const f=fixture({contextRecovery:true}),held=deferred();t.after(()=>f.client.stop());await ready(f);
 let captured;f.setResponse(m=>{if(m.type===stage){captured=m;return held.promise;}return f.normal(m);});
 const pending=f.controllerOptions.onWake();await drain();await f.advance(5999);assert.equal(f.stops,0);assert.equal(f.resumed.length,0);
 await f.advance(1);await pending;assert.equal(f.controllers,1);assert(f.stops>0);assert.equal(f.resumed.length,0);
 held.resolve(f.normal(captured));await drain();assert.equal(f.controllers,1);assert.equal(f.resumed.length,0);
 f.setResponse(f.normal);await f.client.contextReady();await drain();assert.equal(f.controllers,2);assert.equal(f.controllerOptions.initialMode,'reading');
});
for(const response of [{ok:false,reason:'invalid-host-document'},{binding:{}},null])test('C2 dormant malformed/negative HELLO remains terminal '+JSON.stringify(response),async t=>{
 const f=fixture({contextRecovery:true});t.after(()=>f.client.stop());await ready(f);f.setResponse(m=>m.type==='HOST_HELLO'?response:f.normal(m));
 await f.controllerOptions.onWake();await drain();assert(f.stops>0);const count=f.calls.length;f.setResponse(f.normal);await f.client.contextReady();await drain();assert.equal(f.calls.length,count);assert.equal(f.controllers,1);assert.equal(f.resumed.length,0);
});
test('C2 dormant HELLO four seconds leaves only two seconds for REFRESH transport',async t=>{
 const f=fixture({contextRecovery:true}),hello=deferred(),refresh=deferred();t.after(()=>f.client.stop());await ready(f);
 f.setResponse(m=>m.type==='HOST_HELLO'?hello.promise:m.type==='HOST_REFRESH'?refresh.promise:f.normal(m));
 const pending=f.controllerOptions.onWake();await drain();await f.advance(4000);hello.resolve({binding:{...f.binding(),producerToken:'fresh_producer'}});await drain();
 assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,2);await f.advance(1999);assert.equal(f.stops,0);await f.advance(1);await pending;
 assert(f.stops>0);assert.equal(f.resumed.length,0);refresh.resolve({state:'verified',scopeKey:'scope_A'});await drain();assert.equal(f.resumed.length,0);
 f.setResponse(f.normal);await f.client.contextReady();await drain();assert.equal(f.controllers,2);assert.equal(f.controllerOptions.initialMode,'reading');
});
