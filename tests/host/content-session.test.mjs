import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
 let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 let respond=m=>m.type==='HOST_HELLO'?{binding:binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapterOptions=o,{inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{bridge=o.bridge;return {start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;}};}};
 const client=createHostContentSession(options);
 return {presentations,get adapterOptions(){return adapterOptions;},client,options,runtime,document,binding,calls,listeners,events,setResponse:f=>{respond=f;},get bridge(){return bridge;},get context(){return context;},get stops(){return stops;},get planned(){return planned;},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await drain();}};
}
test('production composition sequences HELLO REFRESH and mount with no page bridge; restart seq is monotonic',async()=>{
 const f=fixture();assert.deepEqual(await f.client.start(),{id:'mount'});assert.deepEqual(f.calls.slice(0,3).map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT']);assert.equal(f.client.showReading(),true);assert.equal(f.client.showWorkspace(),true);assert.equal(f.context.binding.documentToken,'doc');assert.equal(f.document.defaultView.client,undefined);
 f.client.stop();assert.equal(f.listeners.size,0);assert.equal(f.events.size,0);assert.equal(f.client.showWorkspace(),false);await f.client.start();assert.deepEqual(f.calls.filter(m=>m.seq).map(m=>m.seq),[1,2,3,4]);f.client.stop();
});
test('native plans require real extension sender and exact current binding, no mutation path',async()=>{
 const f=fixture();await f.client.start();const listener=[...f.listeners][0],message={type:'HOST_NATIVE_PLAN',documentToken:'doc',producerToken:'producer',routeEpoch:1,targets:[]},replies=[];
 listener(message,{id:'other'},x=>replies.push(x));listener({...message,producerToken:'bad'},{id:'extension'},x=>replies.push(x));listener({...message,extra:true},{id:'extension'},x=>replies.push(x));assert.equal(f.planned,0);
 listener(message,{id:'extension'},x=>replies.push(x));assert.deepEqual(replies,[['plan']]);f.client.stop();listener(message,{id:'extension'},x=>replies.push(x));assert.equal(f.planned,1);
});
test('stop cancels pending HELLO; late result cannot create surfaces or listeners',async()=>{
 const f=fixture();let resolve;f.setResponse(()=>new Promise(r=>resolve=r));const started=f.client.start();await drain();f.client.stop();assert.equal(await started,null);resolve({binding:f.binding()});await drain();assert.equal(f.listeners.size,0);assert.equal(f.calls.length,1);assert.equal(f.stops,0);
});
test('unverified scope and invalid binding fail closed before surface; pagehide tears down live session',async()=>{
 for(const mode of ['scope','binding']){const f=fixture();f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),...(mode==='binding'?{origin:'https://other.test'}:{})}}:{state:'unknown'});assert.equal(await f.client.start(),null);assert.equal(f.listeners.size,0);assert.equal(f.events.size,0);}
 const f=fixture();await f.client.start();f.events.get('pagehide')();assert.equal(f.listeners.size,0);assert.equal(f.client.showReading(),false);assert.equal(f.stops,1);
});
test('pending RPC deadline is six seconds and cannot revive after late response',async()=>{
 const f=fixture();f.setResponse(()=>new Promise(()=>{}));const started=f.client.start();await drain();await f.advance(6000);assert.equal(await started,null);assert.equal(f.events.size,0);
});
test('document renewal and scope revalidation precede UI status with one six-second budget',async()=>{
 const f=fixture();await f.client.start();let resolve;f.setResponse(m=>m.type==='HOST_DOCUMENT_RENEW'?new Promise(r=>resolve=r):m.type==='HOST_REFRESH'?{state:'verified'}:new Promise(()=>{}));const renewal=f.bridge.renewSession({handle:{id:'mount'},binding:f.binding()});const rejected=assert.rejects(renewal,/request-timeout/);await drain();await f.advance(4000);resolve({ok:true,binding:f.binding()});await drain();assert.equal(f.calls.at(-1).type,'HOST_UI_STATUS');await f.advance(2000);await rejected;f.client.stop();
});
test('SPA adapter rebind withdraws old surface and remounts without modifying native draft',async()=>{
 const f=fixture();f.document.draft='untouched';await f.client.start();const old=f.adapterOptions;f.document.location.href+='c/next';old.onRebindNeeded();assert.equal(f.stops,1);await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);assert.equal(f.client.showWorkspace(),true);assert.equal(f.document.draft,'untouched');old.onRebindNeeded();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);f.client.stop();
});
test('same-URL invalidation after replacement HELLO revokes it; old-listener bursts coalesce',async()=>{
 const f=fixture();await f.client.start();const old=[...f.listeners][0];old({type:'HOST_DOCUMENT_INVALIDATED'},{id:'other'});old({type:'HOST_DOCUMENT_INVALIDATED',extra:1},{id:'extension'});assert.equal(f.stops,0);
 const resolves=[];f.setResponse(m=>m.type==='HOST_HELLO'?new Promise(r=>resolves.push(r)):m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});
 for(let i=0;i<100;i++)old({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);
 const replacement=[...f.listeners][0];for(let i=0;i<100;i++)replacement({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,3);
 resolves[0]({binding:{...f.binding(),documentToken:'stale'}});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,1);
 resolves[1]({binding:{...f.binding(),documentToken:'fresh'}});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').at(-1).documentToken,'fresh');assert.equal(f.client.showWorkspace(),true);f.client.stop();assert.equal(f.listeners.size,0);
});
test('pagehide or explicit stop during queued rebind prevents automatic revival',async()=>{
 for(const mode of ['pagehide','stop']){const f=fixture();await f.client.start();f.adapterOptions.onRebindNeeded();if(mode==='pagehide')f.events.get('pagehide')();else f.client.stop();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,1);assert.equal(f.events.size,0);assert.equal(f.client.showReading(),false);}
});
test('failed replacement stops without self-retry',async()=>{
 const f=fixture();await f.client.start();f.setResponse(()=>({ok:false}));[...f.listeners][0]({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);await f.advance(30000);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);assert.equal(f.listeners.size,0);assert.equal(f.events.size,0);
});
test('trusted surface presentation dispatches only the two modes without native plans or writes',async()=>{
 const f=fixture();await f.client.start();const listener=[...f.listeners][0],replies=[],before=f.calls.length;
 for(const mode of ['workspace','reading'])listener({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode},{id:'extension'},r=>replies.push(r));
 assert.deepEqual(replies,[{ok:true},{ok:true}]);assert.deepEqual(f.presentations,['workspace','reading']);assert.equal(f.calls.length,before);assert.equal(f.planned,0);f.client.stop();
});
test('presentation rejects wrong sender, extra fields, invalid mode/binding and stale route, expiry or stop',async()=>{
 const message={type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode:'workspace'};
 const f=fixture();await f.client.start();const listener=[...f.listeners][0],replies=[];
 listener(message,{id:'other'},r=>replies.push(r));
 for(const patch of [{mode:'other'},{scope:'private'},{documentToken:'wrong'},{producerToken:'wrong'},{routeEpoch:2}])listener({...message,...patch},{id:'extension'},r=>replies.push(r));
 assert.equal(replies.length,5);assert(replies.every(r=>r.ok===false));assert.equal(f.presentations.length,0);f.client.stop();listener(message,{id:'extension'},()=>{});assert.equal(f.presentations.length,0);
 for(const change of [async x=>{x.document.location.href+='c/new';},async x=>x.advance(20000)]){const x=fixture();await x.client.start();const fn=[...x.listeners][0];await change(x);let response;fn(message,{id:'extension'},r=>response=r);assert.deepEqual(response,{ok:false});assert.equal(x.presentations.length,0);x.client.stop();}
});
test('old session presentation cannot act on replacement even with identical binding fields',async()=>{
 const f=fixture();await f.client.start();const old=[...f.listeners][0];await f.client.start();old({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode:'reading'},{id:'extension'},()=>{});assert.equal(f.presentations.length,0);f.client.stop();
});
test('renewal checks scope before exposing renewed UI and refuses unverified authority',async()=>{
 const f=fixture();await f.client.start();const start=f.calls.length;
 await f.bridge.renewSession({handle:{id:'mount'},binding:f.binding()});
 assert.deepEqual(f.calls.slice(start).map(m=>m.type),['HOST_DOCUMENT_RENEW','HOST_REFRESH','HOST_UI_STATUS']);
 f.setResponse(m=>m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:f.binding()}:{state:'unverified'});
 await assert.rejects(f.bridge.renewSession({handle:{id:'mount'},binding:f.binding()}),/scope-not-verified/);
 assert.equal(f.calls.at(-1).type,'HOST_REFRESH');f.client.stop();
});
test('slow scope revalidation consumes the remaining renewal budget',async()=>{
 const f=fixture();await f.client.start();let resolveDocument,resolveScope;
 f.setResponse(m=>m.type==='HOST_DOCUMENT_RENEW'?new Promise(r=>resolveDocument=r):m.type==='HOST_REFRESH'?new Promise(r=>resolveScope=r):new Promise(()=>{}));
 const rejected=assert.rejects(f.bridge.renewSession({handle:{id:'mount'},binding:f.binding()}),/request-timeout/);
 await drain();await f.advance(2000);resolveDocument({ok:true,binding:f.binding()});await drain();
 await f.advance(3000);resolveScope({state:'verified'});await drain();assert.equal(f.calls.at(-1).type,'HOST_UI_STATUS');
 await f.advance(1000);await rejected;f.client.stop();
});

test('workspace entered bridge uses current private binding and bounded RPC; stopped bridge cannot send',async()=>{
 const f=fixture();await f.client.start();const before=f.calls.length;assert.equal((await f.bridge.workspaceEntered({mountId:'mount'})).ok,true);assert.deepEqual(f.calls[before],{v:1,type:'HOST_UI_WORKSPACE_ENTERED',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'mount'});
 f.setResponse(()=>new Promise(()=>{}));const pending=f.bridge.workspaceEntered({mountId:'mount'}),rejected=assert.rejects(pending,/request-timeout/);await drain();await f.advance(6000);await rejected;f.client.stop();const count=f.calls.length;await assert.rejects(f.bridge.workspaceEntered({mountId:'mount'}));assert.equal(f.calls.length,count);
});
