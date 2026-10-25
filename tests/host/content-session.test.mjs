import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(overrides={}){
 let time=1000,id=0,bridge,context,adapterOptions,stops=0,planned=0;const presentations=[];const calls=[],listeners=new Set(),events=new Map(),timers=new Map();
 const document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding=()=>({documentToken:'doc',producerToken:'producer',browserDocumentId:'browser',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(time+20000).toISOString()});
 let respond=m=>m.type==='HOST_HELLO'?{binding:binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:m.type==='HOST_DOCUMENT_RENEW'?{ok:true,binding:binding()}:{ok:true,grants:[]};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m);return respond(m);}};
 const options={document,runtime,makeId:()=> 'client',now:()=>time,elapsedNow:()=>time,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key),adapterFactory:o=>(adapterOptions=o,{start:async()=>({}),inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false}),surfaceFactory:()=>({}),plansFactory:({bindingCurrent})=>({plan:()=>{assert.ok(bindingCurrent());planned++;return ['plan'];}}),controllerFactory:o=>{bridge=o.bridge;return {start:async c=>{context=c;await bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{stops++;bridge.revokeMount({mountId:'mount'});},showWorkspace:()=>{presentations.push('workspace');return true;},showReading:()=>{presentations.push('reading');return true;},showNativeReading:()=>{presentations.push('native-page');return true;}};}};
 const client=createHostContentSession({...options,...overrides});
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
 for(const mode of ['scope','binding']){const f=fixture();f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),...(mode==='binding'?{origin:'https://other.test'}:{})}}:{state:'unknown'});assert.equal(await f.client.start(),null);assert.equal(f.client.showWorkspace(),false);assert.equal(f.listeners.size,mode==='scope'?1:0);f.client.stop();assert.equal(f.listeners.size,0);assert.equal(f.events.size,0);}
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
test('ordinary workspace and reading presentation remain distinct without native plans or writes',async()=>{
 const f=fixture();await f.client.start();const listener=[...f.listeners][0],replies=[],before=f.calls.length;
 for(const mode of ['workspace','reading'])listener({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode},{id:'extension'},r=>replies.push(r));
 assert.deepEqual(replies,[{ok:true},{ok:true}]);assert.deepEqual(f.presentations,['workspace','reading']);assert.equal(f.calls.length,before);assert.equal(f.planned,0);f.client.stop();
});
test('current workspace check is read-only and keeps exact session authorization',async()=>{
 const f=fixture(),factory=f.options.controllerFactory;let checks=0,visible=true;
 f.options.controllerFactory=options=>({...factory(options),isWorkspacePresented:()=>{checks++;return visible;}});
 // Recreate with the wrapped controller before starting a session.
 const client=createHostContentSession(f.options);await client.start();
 const listener=[...f.listeners][0],message={type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode:'workspace-current'},replies=[];
 listener(message,{id:'extension'},r=>replies.push(r));visible=false;listener(message,{id:'extension'},r=>replies.push(r));
 assert.deepEqual(replies,[{ok:true},{ok:false}]);assert.equal(checks,2);assert.deepEqual(f.presentations,[]);
 for(const patch of [{producerToken:'wrong'},{extra:true},{routeEpoch:2}])listener({...message,...patch},{id:'extension'},r=>assert.deepEqual(r,{ok:false}));
 listener(message,{id:'other'},()=>assert.fail('wrong sender replied'));assert.equal(checks,2);
 client.stop();listener(message,{id:'extension'},()=>{});assert.equal(checks,2);assert.deepEqual(f.presentations,[]);
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
function snippetFixture(){
 const f=fixture();let epoch='node-1',reads=0;
 const anchor={refId:'C',messageId:'M',branchId:'B',text:'selected',bodyHash:'a'.repeat(64)};
 const client=createHostContentSession({...f.options,adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,selectionEpoch:()=>epoch,selectedSnippet:()=>{reads++;return {...anchor};}})});
 const message={type:'HOST_SNIPPET_SELECTION',documentToken:'doc',producerToken:'producer',routeEpoch:1,scopeGrantId:'scope-grant',phase:'capture',ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C'},selectionId:null};
 const request=(patch={},sender={id:'extension'})=>{let reply;[...f.listeners][0]?.({...message,...((patch.phase??message.phase)==='capture'?{expiresAt:new Date(7000).toISOString()}:{}),...patch},sender,value=>reply=value);return reply;};
 return {...f,client,message,request,anchor,setEpoch:value=>epoch=value,get reads(){return reads;}};
}
test('private content selection capture validates and releases one scope-bound ticket',async()=>{
 const f=snippetFixture();await f.client.start();const captured=f.request();assert.equal(captured.ok,true);assert.deepEqual(captured.anchor,f.anchor);
 assert.deepEqual(f.request({phase:'validate',selectionId:captured.selectionId}),{ok:true,anchor:f.anchor});
 assert.deepEqual(f.request({phase:'validate',selectionId:captured.selectionId,scopeGrantId:'other'}),{ok:false});
 assert.deepEqual(f.request({phase:'release',selectionId:captured.selectionId}),{ok:true});assert.deepEqual(f.request({phase:'validate',selectionId:captured.selectionId}),{ok:false});f.client.stop();
});
test('content selection rejects untrusted sender extra fields route mismatch and absent node epoch before reading',async()=>{
 const f=snippetFixture();await f.client.start();assert.equal(f.request({}, {id:'page'}),undefined);
 for(const patch of [{scope:'forged'},{routeEpoch:2},{producerToken:'other'},{ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C',text:'forged'}},{selectionId:'unexpected'}])assert.deepEqual(f.request(patch),{ok:false});
 assert.equal(f.reads,0);f.setEpoch(null);assert.deepEqual(f.request(),{ok:false});assert.equal(f.reads,0);f.client.stop();
});
test('content ticket expires on node replacement elapsed six seconds route change or stop',async()=>{
 for(const kind of ['node','expiry','route','stop']){const f=snippetFixture();await f.client.start();const captured=f.request();assert(captured.ok);
  if(kind==='node')f.setEpoch('replacement');if(kind==='expiry')await f.advance(6000);if(kind==='route')f.document.location.href+='other';if(kind==='stop')f.client.stop();
  assert.notEqual(f.request({phase:'validate',selectionId:captured.selectionId})?.ok,true);f.client.stop();
 }
});
test('expired queued snippet restore cannot scroll or switch native reading',async()=>{
 const f=fixture();let restores=0;const client=createHostContentSession({...f.options,adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,restoreSnippet:()=>{assert.deepEqual(f.presentations,['reading']);restores++;return {ok:true};}})});await client.start();
 const message={type:'HOST_SNIPPET_RESTORE',documentToken:'doc',producerToken:'producer',routeEpoch:1,scopeGrantId:'scope',ref:{id:'C',nativeUrl:'https://chatgpt.com/c/C'},anchor:{refId:'C',messageId:'M',branchId:'B',text:'selected',bodyHash:'a'.repeat(64)},expiresAt:new Date(1500).toISOString()},replies=[];
 const listener=[...f.listeners][0];for(const patch of [{expiresAt:new Date(1000).toISOString()},{expiresAt:new Date(8000).toISOString()},{routeEpoch:9}])listener({...message,...patch},{id:'extension'},r=>replies.push(r));assert.equal(restores,0);assert.deepEqual(f.presentations,[]);
 listener(message,{id:'extension'},r=>replies.push(r));assert.equal(restores,1);assert.deepEqual(f.presentations,['reading']);await f.advance(501);listener(message,{id:'extension'},r=>replies.push(r));assert.equal(restores,1);assert.equal(replies.at(-1).ok,false);client.stop();
});


test('native surface mutation callback only reaches the live document mount',async()=>{
 const f=fixture(),seen=[];const client=createHostContentSession({...f.options,surfaceFactory:()=>({surrenderChanged:records=>seen.push(records)})});await client.start();
 const records=[{type:'childList',target:{}}];f.adapterOptions.onSurfaceChange(records);assert.deepEqual(seen,[records]);client.stop();f.adapterOptions.onSurfaceChange(records);assert.equal(seen.length,1);
});

const nativePagePresentation=()=>({type:'HOST_PRESENT_SURFACE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mode:'native-page'});
test('explicit native-page presentation calls dual-surface reading only and does not plan or write',async()=>{
 const f=fixture();await f.client.start();const fn=[...f.listeners][0],before=f.calls.length;let reply;
 fn(nativePagePresentation(),{id:'extension'},r=>reply=r);assert.deepEqual(reply,{ok:true});assert.deepEqual(f.presentations,['native-page']);assert.equal(f.planned,0);assert.equal(f.calls.length,before);f.client.stop();
});
test('native-page rejects untrusted sender and malformed or stale binding tuples before controller',async()=>{
 const f=fixture();await f.client.start();const fn=[...f.listeners][0];let foreignReplies=0;
 fn(nativePagePresentation(),{id:'other'},()=>foreignReplies++);assert.equal(foreignReplies,0);
 for(const patch of [{documentToken:'other'},{producerToken:'other'},{routeEpoch:2},{grantId:'forged'},{mode:'native-page ',extra:true},{url:'https://chatgpt.com/'}]){let reply;fn({...nativePagePresentation(),...patch},{id:'extension'},r=>reply=r);assert.deepEqual(reply,{ok:false});}
 assert.deepEqual(f.presentations,[]);assert.equal(f.planned,0);f.client.stop();
});
for(const change of ['route','expiry','stop','replacement'])test('native-page old content authority cannot survive '+change,async()=>{
 const f=fixture();await f.client.start();const old=[...f.listeners][0];
 if(change==='route')f.document.location.href+='c/new';if(change==='expiry')await f.advance(20000);if(change==='stop')f.client.stop();if(change==='replacement')await f.client.start();
 old(nativePagePresentation(),{id:'extension'},()=>{});assert.deepEqual(f.presentations,[]);assert.equal(f.planned,0);f.client.stop();
});

for(const exit of ['stop','pagehide'])test('C2 ready cannot revive explicit '+exit,async()=>{const f=fixture({contextRecovery:true});await f.client.start();if(exit==='stop')f.client.stop();else f.events.get('pagehide')();const count=f.calls.length;f.client.contextPending();await f.client.contextReady();assert.equal(f.calls.length,count);assert.equal(f.client.showWorkspace(),false);});
test('C2 pending withdraws immediately and one completed receipt may start a fresh handshake',async()=>{const f=fixture({contextRecovery:true});await f.client.start();f.client.contextPending();assert.equal(f.client.showWorkspace(),false);assert.equal(f.listeners.size,0);await f.client.contextReady();assert.equal(f.client.showWorkspace(),true);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);f.client.stop();});
test('context wake is disabled by default and ordinary scope denial cannot wake it',async()=>{const f=fixture();await f.client.start();f.client.contextPending();const count=f.calls.length;await f.client.contextReady();assert.equal(f.calls.length,count);assert.equal(f.client.showWorkspace(),false);});
test('C2 initial ambiguous identity can await a newly completed receipt, malformed HELLO cannot',async()=>{for(const malformed of [false,true]){const f=fixture({contextRecovery:true});f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),...(malformed?{origin:'https://other.test'}:{})}}:{state:'ambiguous'});assert.equal(await f.client.start(),null);const count=f.calls.length;f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});await f.client.contextReady();assert.equal(f.calls.length>count,!malformed);assert.equal(f.client.showWorkspace(),!malformed);f.client.stop();}});

for(const failure of ['ambiguous','transport'])test('C2 foreground '+failure+' withdraws and awaits only a new authorized handshake',async()=>{
 const f=fixture({contextRecovery:true});f.document.visibilityState='visible';await f.client.start();
 f.setResponse(m=>{if(m.type==='HOST_FOCUS'){if(failure==='transport')throw Error('worker-unavailable');return {state:'ambiguous'};}return m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true,grants:[]};});
 f.events.get('blur')();f.events.get('focus')();await drain();assert.equal(f.client.showWorkspace(),false);assert.equal(f.listeners.size,0);const before=f.calls.filter(m=>m.type==='HOST_HELLO').length;
 await f.advance(30000);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,before);
 f.client.contextPending();await f.client.contextReady();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,before+1);assert.equal(f.client.showWorkspace(),true);f.client.stop();
});
test('explicit stop after foreground denial still cancels all context wake eligibility',async()=>{
 const f=fixture({contextRecovery:true});f.document.visibilityState='visible';await f.client.start();f.setResponse(()=>({state:'ambiguous'}));f.events.get('blur')();f.events.get('focus')();await drain();f.client.stop();const count=f.calls.length;f.client.contextPending();await f.client.contextReady();assert.equal(f.calls.length,count);assert.equal(f.client.showWorkspace(),false);
});

test('private ingestion scheduling uses bound transport and a six-second RPC without observation metadata',async()=>{
 const f=fixture();await f.client.start();const start={passSeq:1,phase:'start',profileId:'profile',profileVersion:1};assert.equal((await f.context.ingestionPass(start)).ok,true);assert.deepEqual(f.calls.at(-1),{v:1,type:'HOST_INGESTION_PASS',documentToken:'doc',producerToken:'producer',routeEpoch:1,...start});
 f.setResponse(()=>new Promise(()=>{}));const pending=f.context.ingestionPass({...start,passSeq:2}),rejected=assert.rejects(pending,/request-timeout/);await drain();await f.advance(6000);await rejected;
 f.setResponse(()=>({ok:true}));f.client.stop();const before=f.calls.length;assert.equal((await f.context.ingestionPass({...start,phase:'cancel'})).ok,true);assert.equal(f.calls.length,before+1,'bounded owner can retire a stopped private producer');await assert.rejects(f.context.ingestionPass({...start,phase:'end'}),/stale-content-session/);
});

function c2PresentationFixture(){
 const modes=[];let mode='workspace';
 const f=fixture({contextRecovery:true,controllerFactory:options=>{
  modes.push(options.initialMode);mode=options.initialMode;
  return {start:async()=>{await options.bridge.registerMount({handle:{id:'mount',regionEpoch:1}});return {id:'mount'};},stop:()=>{},presentationMode:()=>mode,showWorkspace:()=>{mode='workspace';return true;},showReading:()=>{mode='reading';return true;}};
 }});
 return {...f,modes};
}
for(const mode of ['reading','workspace'])for(const transition of ['restore','pending','denied','stop'])test('active BFCache retains '+mode+' through '+transition,async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();if(mode==='reading')assert.equal(f.client.showReading(),true);
  f.events.get('pagehide')({persisted:true});assert.equal(f.client.showWorkspace(),false);assert.equal(f.listeners.size,0);
  const before=f.calls.length;
  if(transition==='pending'){f.client.contextPending();await f.client.contextReady();assert.equal(f.calls.length,before);}
  if(transition==='stop')f.client.stop();
  if(transition==='denied')f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'ambiguous'}:{ok:true});
  f.events.get('pageshow')?.({persisted:true});await drain();
  if(transition==='stop'){await f.client.contextReady();assert.equal(f.calls.length,before);assert.deepEqual(f.modes,['workspace']);return;}
  if(transition==='pending'||transition==='denied'){
   assert.equal(f.client.showWorkspace(),false);assert.deepEqual(f.modes,['workspace']);const waiting=f.calls.length;await f.advance(1000);assert.equal(f.calls.length,waiting,'no autonomous authentication retry');
   f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});await f.client.contextReady();
  }
  assert.deepEqual(f.modes,['workspace',mode]);
  const count=transition==='denied'?3:2;assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,count);assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,count);
 }finally{f.client.stop();}
});
test('C2 changed route restores reading only after fresh HELLO REFRESH and mount',async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();const before=f.calls.length;f.document.location.href+='c/next';f.client.contextPending();assert.equal(f.client.showReading(),false);assert.equal(f.listeners.size,0);
  await f.client.contextReady();assert.deepEqual(f.calls.slice(before).filter(m=>['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT'].includes(m.type)).map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT']);assert.deepEqual(f.modes,['workspace','reading']);
 }finally{f.client.stop();}
});
for(const mode of ['reading','workspace'])test('C2 same route preserves '+mode+' through repeated pending',async()=>{
 const f=c2PresentationFixture();try{await f.client.start();if(mode==='reading')f.client.showReading();f.client.contextPending();f.client.contextPending();await f.client.contextReady();assert.deepEqual(f.modes,['workspace',mode]);}finally{f.client.stop();}
});
for(const exit of ['stop','pagehide','persisted-pagehide'])test('C2 pending '+exit+' prevents late READY revival',async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();f.client.contextPending();
  if(exit==='stop')f.client.stop();else{assert.equal(typeof f.events.get('pagehide'),'function','pending document must retain its lifecycle revocation listener');f.events.get('pagehide')({persisted:exit==='persisted-pagehide'});}
  const before=f.calls.length;await f.client.contextReady();assert.equal(f.calls.length,before);assert.equal(f.client.showWorkspace(),false);assert.deepEqual(f.modes,['workspace']);
 }finally{f.client.stop();}
});
test('C2 repeated READY never restarts already active presentation or handshake',async()=>{
 const f=c2PresentationFixture();try{await f.client.start();f.client.showReading();const before=f.calls.length;await f.client.contextReady();await f.client.contextReady();assert.equal(f.calls.length,before);assert.deepEqual(f.modes,['workspace']);}finally{f.client.stop();}
});
test('C2 READY burst shares one pending fresh authorization attempt',async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();f.client.showReading();f.client.contextPending();let resolveHello;f.setResponse(m=>m.type==='HOST_HELLO'?new Promise(resolve=>resolveHello=resolve):m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});
  const first=f.client.contextReady();await drain();const second=f.client.contextReady();await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,2);resolveHello({binding:f.binding()});await Promise.all([first,second]);assert.deepEqual(f.modes,['workspace','reading']);
 }finally{f.client.stop();}
});

test('C2 route changing after pending still restores native reading on READY',async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();f.client.contextPending();f.document.location.href+='c/late-route';f.client.contextPending();const before=f.calls.length;
  await f.client.contextReady();assert.deepEqual(f.modes,['workspace','reading']);assert.deepEqual(f.calls.slice(before).filter(m=>['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT'].includes(m.type)).map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT']);
 }finally{f.client.stop();}
});
test('C2 ambiguous refresh retains reading intent while awaiting another external READY',async()=>{
 const f=c2PresentationFixture();try{
  await f.client.start();f.client.showReading();f.client.contextPending();f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'ambiguous'}:{ok:true});
  assert.equal(await f.client.contextReady(),null);assert.equal(f.client.showReading(),false);assert.deepEqual(f.modes,['workspace']);const before=f.calls.length;await f.advance(1000);assert.equal(f.calls.length,before,'scope denial must not schedule an automatic authorization retry');
  f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});await f.client.contextReady();assert.deepEqual(f.modes,['workspace','reading']);assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,3);assert.equal(f.calls.filter(m=>m.type==='HOST_REFRESH').length,3);
 }finally{f.client.stop();}
});

function recentFixture(overrides={}){
 const f=fixture({contextRecovery:true,...overrides});let scope='scope-a',documentId='browser',ack={state:'accepted',bodyProofId:'proof',localSeq:1};
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),browserDocumentId:documentId}}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:scope}:m.kind?ack:{ok:true,grants:[]});
 return {...f,get adapter(){return f.adapterOptions;},send:(id='c1',association='explicit-body-id')=>f.context.emit({kind:'current-object',localSeq:1,payload:{association,conversationId:id}}),scope:v=>{scope=v;},doc:v=>{documentId=v;},ack:v=>{ack=v;}};
}
test('recent body hint survives only same-document same-scope route rebind',async()=>{
 const f=recentFixture();await f.client.start();await f.send();const old=f.adapter;
 assert.equal(old.priorityConversationId(),'c1');f.document.location.href+='/projects';old.onRebindNeeded();await drain();
 assert.equal(old.priorityConversationId(),null);assert.equal(f.adapter.priorityConversationId(),'c1');f.client.stop();
});
for(const boundary of ['scope','document','stop','pending','pagehide'])test('recent body hint clears at '+boundary,async()=>{
 const f=recentFixture();await f.client.start();await f.send();assert.equal(f.adapter.priorityConversationId(),'c1');
 if(boundary==='scope'||boundary==='document'){if(boundary==='scope')f.scope('scope-b');else f.doc('other-doc');f.adapter.onRebindNeeded();await drain();}
 else if(boundary==='pending'){f.client.contextPending();await f.client.contextReady();}
 else {if(boundary==='stop')f.client.stop();else f.events.get('pagehide')({persisted:true});await f.client.start();}
 assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});
test('duplicate body ACK cannot renew recent hint and expiration cannot revive',async()=>{
 const f=recentFixture();await f.client.start();await f.send();await f.advance(29999);await f.send();assert.equal(f.adapter.priorityConversationId(),'c1');
 await f.advance(1);assert.equal(f.adapter.priorityConversationId(),null);await f.send();assert.equal(f.adapter.priorityConversationId(),null);
 await f.send('c2');assert.equal(f.adapter.priorityConversationId(),'c2');f.client.stop();
});
for(const mode of ['denied','proofless','url-only'])test('recent hint requires explicit acknowledged body: '+mode,async()=>{
 const f=recentFixture();await f.client.start();if(mode==='denied')f.ack({state:'rejected',bodyProofId:'proof'});if(mode==='proofless')f.ack({state:'accepted'});
 await f.send('c1',mode==='url-only'?'url-only':'explicit-body-id');assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});

for(const clock of ['wall','elapsed'])for(const change of ['deadline','rollback'])test('recent hint expires on '+clock+' '+change,async()=>{
 let wall=1000,elapsed=1000;const f=recentFixture({now:()=>wall,elapsedNow:()=>elapsed});await f.client.start();await f.send();
 if(clock==='wall')wall=change==='deadline'?31000:999;else elapsed=change==='deadline'?31000:999;
 assert.equal(f.adapter.priorityConversationId(),null);wall=1000;elapsed=1000;assert.equal(f.adapter.priorityConversationId(),null);await f.send();assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});
test('late body ACK after context withdrawal cannot repopulate recent hint',async()=>{
 const f=recentFixture();await f.client.start();let resolve;f.ack(new Promise(r=>resolve=r));const pending=f.send();const rejected=assert.rejects(pending,/stale-content-session/);await drain();f.client.contextPending();resolve({state:'accepted',bodyProofId:'proof'});await rejected;await f.client.contextReady();assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});

test('recent body hint rejects an ACK for another local sequence',async()=>{
 const f=recentFixture();await f.client.start();f.ack({state:'accepted',bodyProofId:'proof',localSeq:2});await f.send();assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});

const recentRouteId='11111111-1111-4111-8111-111111111111';
test('verified departing conversation route can prioritize fresh member inspection before body ACK',async()=>{
 const f=recentFixture();f.document.location.href+='c/'+recentRouteId;await f.client.start();assert.equal(f.adapter.priorityConversationId(),null);
 f.document.location.href='https://chatgpt.com/g/g-p-00000000000000000000000000000001/project';f.adapter.onRebindNeeded();await drain();assert.equal(f.adapter.priorityConversationId(),recentRouteId);f.client.stop();
});
for(const route of ['https://foreign.test/c/'+recentRouteId,'https://chatgpt.com/c/'+recentRouteId+'?temporary=true','https://chatgpt.com/c/bad','https://chatgpt.com/share/'+recentRouteId])test('departing unsupported route gives no inspection hint: '+route,async()=>{
 const f=recentFixture();f.document.location.href=route;await f.client.start();f.document.location.href='https://chatgpt.com/projects';f.adapter.onRebindNeeded();await drain();assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});
for(const boundary of ['scope','document','expired'])test('departing route cannot cross '+boundary,async()=>{
 const f=recentFixture();f.document.location.href+='c/'+recentRouteId;await f.client.start();if(boundary==='scope')f.scope('scope-b');else if(boundary==='document')f.doc('new-browser');else await f.advance(20000);
 f.document.location.href='https://chatgpt.com/projects';f.adapter.onRebindNeeded();await drain();assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});
test('same route hint departure cannot renew its original deadline',async()=>{
 const f=recentFixture();f.document.location.href+='c/'+recentRouteId;await f.client.start();await f.send(recentRouteId);await f.advance(15000);
 f.document.location.href='https://chatgpt.com/projects';f.adapter.onRebindNeeded();await drain();assert.equal(f.adapter.priorityConversationId(),recentRouteId);await f.advance(15000);assert.equal(f.adapter.priorityConversationId(),null);f.client.stop();
});

for(const mode of ['reading','workspace'])for(const failure of ['ambiguous','transport'])test('foreground '+failure+' retains '+mode+' intent until fresh context handshake',async()=>{
 const f=c2PresentationFixture();try{
  f.document.visibilityState='visible';await f.client.start();if(mode==='reading')f.client.showReading();
  f.setResponse(m=>{if(m.type==='HOST_FOCUS'){if(failure==='transport')throw Error('worker-lost');return {state:'ambiguous'};}return m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true,grants:[]};});
  f.events.get('blur')();f.events.get('focus')();await drain();assert.equal(f.client.showReading(),false);assert.equal(f.listeners.size,0);
  const before=f.calls.length;await f.advance(1000);assert.equal(f.calls.length,before);
  await f.client.contextReady();assert.deepEqual(f.modes,['workspace',mode]);
  assert.deepEqual(f.calls.slice(before).filter(m=>['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT'].includes(m.type)).map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT']);
 }finally{f.client.stop();}
});

for(const contextRecovery of [false,true])test(`HELLO starts observation before unresolved identity and denial retains only RAM (C2=${contextRecovery})`,async()=>{
 const f=fixture(),phases=[];let resolve,stopped=0;
 const client=createHostContentSession({...f.options,contextRecovery,adapterFactory:()=>({start:async o=>{phases.push(o);},stop:()=>stopped++,inspect:()=>({ok:true})})});
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:new Promise(r=>resolve=r));
 const started=client.start();await drain();
 assert.equal(phases.length,1);assert.equal(phases[0].phase,'observation');assert.deepEqual(Object.keys(phases[0]).sort(),['binding','phase']);
 assert.deepEqual(f.calls.map(m=>m.type),['HOST_HELLO','HOST_REFRESH']);assert.equal(client.showWorkspace(),false);
 resolve({state:'unverified'});assert.equal(await started,null);assert.equal(stopped,0);assert.equal(client.localStatus(),'waiting');
 // In particular C3 must clear retained RAM on persisted pagehide too.
 f.events.get('pagehide')({persisted:true});assert.equal(stopped,1);assert.equal(client.showWorkspace(),false);client.stop();
});
test('verified promotion discards preauth observation before controller and never sends provisional packets',async()=>{
 const f=fixture(),order=[];const client=createHostContentSession({...f.options,adapterFactory:()=>({start:async o=>order.push(o.phase),stop:()=>order.push('discard'),inspect:()=>({ok:true})}),controllerFactory:()=>({start:async o=>{order.push('controller');assert.equal(typeof o.emit,'function');return {};},stop(){}})});
 await client.start();assert.deepEqual(order,['observation','discard','controller']);assert.deepEqual(f.calls.map(m=>m.type),['HOST_HELLO','HOST_REFRESH']);client.stop();
});
test('denied observation expires without retry, and genuine later READY creates fresh HELLO',async()=>{
 const f=fixture(),order=[];const client=createHostContentSession({...f.options,contextRecovery:true,adapterFactory:()=>({start:async()=>order.push('observe'),stop:()=>order.push('discard'),inspect:()=>({ok:true})})});
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:{state:'unverified'});await client.start();assert.deepEqual(order,['observe']);
 await f.advance(20000);assert.deepEqual(order,['observe','discard']);assert.equal(f.calls.length,2);assert.equal(client.localStatus(),'waiting');
 await client.contextReady();assert.deepEqual(order,['observe','discard','observe']);assert.deepEqual(f.calls.map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_HELLO','HOST_REFRESH']);
 client.contextPending();assert.equal(order.at(-1),'discard');client.stop();
});
test('exact document invalidation clears retained observer without starting identity',async()=>{
 const f=fixture();let stops=0;const client=createHostContentSession({...f.options,contextRecovery:true,adapterFactory:()=>({start:async()=>{},stop:()=>stops++,inspect:()=>({ok:true})})});
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:{state:'unverified'});await client.start();const listener=[...f.listeners][0];
 listener({type:'HOST_DOCUMENT_INVALIDATED'},{id:'other'});listener({type:'HOST_DOCUMENT_INVALIDATED',extra:true},{id:'extension'});assert.equal(stops,0);
 listener({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'});assert.equal(stops,1);assert.equal(f.calls.length,2);client.stop();
});

function observationBudgetFixture(options={}){
 const f=fixture(options);f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:'scope-budget'}:{ok:true,grants:[]});return f;
}
test('observation retry uses remaining proposal budget and cannot remember a late body',async t=>{
 const f=observationBudgetFixture();t.after(()=>f.client.stop());await f.client.start();let release,outcome='pending';
 f.setResponse(()=>new Promise(resolve=>release=resolve));
 const pending=f.context.emit({kind:'current-object',localSeq:1,payload:{association:'explicit-body-id',conversationId:'C'}},{deadlineAt:1100}).then(()=>{outcome='accepted';},error=>{outcome=error.message;});
 await drain();await f.advance(100);
 assert.equal(outcome,'request-timeout','retry must not get a new six-second transport window');
 release({state:'accepted',localSeq:1,bodyProofId:'late-proof'});await pending;await drain();
 assert.equal(f.adapterOptions.priorityConversationId(),null);
});

for(const offset of [99,100,101])test('delayed observation timer checks original deadline at reply '+offset,async t=>{
 let clock=1000;const f=observationBudgetFixture({elapsedNow:()=>clock});t.after(()=>f.client.stop());await f.client.start();let release;
 f.setResponse(()=>new Promise(resolve=>release=resolve));
 const pending=f.context.emit({kind:'current-object',localSeq:1,payload:{association:'explicit-body-id',conversationId:'C'}},{deadlineAt:1100});
 const result=offset>=100?assert.rejects(pending,/request-timeout/):pending;await drain();clock+=offset;
 release({state:'accepted',localSeq:1,bodyProofId:'proof'});await result;
 assert.equal(f.adapterOptions.priorityConversationId(),offset<100?'C':null,'no late recent-hint side effect');
});
for(const deadlineAt of [NaN,Infinity,1000,999,7001])test('invalid or enlarged local observation budget is rejected before transport '+deadlineAt,async t=>{
 const f=observationBudgetFixture();t.after(()=>f.client.stop());await f.client.start();const before=f.calls.length;
 await assert.rejects(f.context.emit({kind:'current-object'},{deadlineAt}),/request-timeout/);assert.equal(f.calls.length,before);
});
test('microtask-delayed observation dispatch rechecks original deadline before sending',async t=>{
 let clock=1000;const f=observationBudgetFixture({elapsedNow:()=>clock});t.after(()=>f.client.stop());await f.client.start();const before=f.calls.length;
 const pending=f.context.emit({kind:'current-object'},{deadlineAt:1100});const rejected=assert.rejects(pending,/request-timeout/);clock=1100;await rejected;
 assert.equal(f.calls.length,before,'expired proposal must not leave content');
});
for(const clockAfter of [999,NaN,Infinity])test('observation reply with invalid elapsed clock cannot update recent '+clockAfter,async t=>{
 let clock=1000;const f=observationBudgetFixture({elapsedNow:()=>clock});t.after(()=>f.client.stop());await f.client.start();let release;
 f.setResponse(()=>new Promise(resolve=>release=resolve));const proposal={kind:'current-object',localSeq:1,payload:{association:'explicit-body-id',conversationId:'C'}};
 const pending=f.context.emit(proposal,{deadlineAt:1100}),rejected=assert.rejects(pending,/request-timeout/);await drain();assert.deepEqual(f.calls.at(-1),proposal,'local budget cannot be serialized into proposal');
 clock=clockAfter;release({state:'accepted',localSeq:1,bodyProofId:'proof'});await rejected;assert.equal(f.adapterOptions.priorityConversationId(),null);
});

for(const exit of ['restore','stop','leave'])test('C2 waiting BFCache restores only fresh READY eligibility: '+exit,async()=>{
 const f=fixture({contextRecovery:true});f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:{state:'ambiguous'});
 await f.client.start();assert.equal(f.client.localStatus(),'waiting');const before=f.calls.length;
 f.events.get('pagehide')({persisted:true});assert.equal(f.listeners.size,0,'retained observer and old capabilities cleared');
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:{...f.binding(),documentToken:'fresh-doc',producerToken:'fresh-producer'}}:m.type==='HOST_REFRESH'?{state:'verified'}:{ok:true});
 await f.client.contextReady();assert.equal(f.calls.length,before,'READY while suspended cannot authenticate');
 if(exit==='stop')f.client.stop();else if(exit==='leave')f.events.get('pagehide')?.({persisted:false});
 f.events.get('pageshow')?.({persisted:true});await drain();assert.equal(f.calls.length,before,'pageshow alone never authenticates a waiting document');
 await f.client.contextReady();
 if(exit==='restore'){assert.deepEqual(f.calls.slice(before).map(m=>m.type),['HOST_HELLO','HOST_REFRESH','HOST_UI_MOUNT']);assert.equal(f.context.binding.documentToken,'fresh-doc');assert.equal(f.client.showWorkspace(),true);}
 else{assert.equal(f.calls.length,before);assert.equal(f.client.showWorkspace(),false);}
 f.client.stop();
});

for(const exit of ['restore','stop','leave'])test('C2 pending notification during BFCache cannot wake before pageshow: '+exit,async()=>{
 const f=fixture({contextRecovery:true});await f.client.start();f.events.get('pagehide')({persisted:true});const before=f.calls.length;
 f.client.contextPending();await f.client.contextReady();assert.equal(f.calls.length,before,'late pending cannot erase document suspension');
 if(exit==='stop')f.client.stop();else if(exit==='leave')f.events.get('pagehide')?.({persisted:false});
 f.events.get('pageshow')?.({persisted:true});await drain();assert.equal(f.calls.length,before,'pending context still needs new READY after return');
 await f.client.contextReady();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,exit==='restore'?2:1);f.client.stop();
});

test('native link intent survives same-document rebind but needs matching acknowledged body',async()=>{
 const f=recentFixture();await f.client.start();const first=f.adapter;
 first.onNativeUse({actionId:'native_click',conversationId:'c2'},f.binding(),null);
 await f.send('c1');assert.equal(f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE').length,0);
 f.document.location.href+='/c/c2';first.onRebindNeeded();await drain();await f.send('c2');await drain();
 const used=f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE');assert.equal(used.length,1);assert.equal(used[0].proofId,'proof');assert.equal(used[0].actionId,'native_click');
 await f.send('c2');await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE').length,1);f.client.stop();
});
for(const boundary of ['scope','document','deadline','stop','pending','pagehide'])test('native local use cannot cross '+boundary,async()=>{
 const f=recentFixture();await f.client.start();f.adapter.onNativeUse({actionId:'native_click',conversationId:'c2'},f.binding(),null);
 if(boundary==='scope')f.scope('scope-b');if(boundary==='document')f.doc('other');if(boundary==='deadline')await f.advance(6000);
 if(boundary==='stop'){f.client.stop();await f.client.start();}else if(boundary==='pending'){f.client.contextPending();await f.client.contextReady();}else if(boundary==='pagehide'){f.events.get('pagehide')({persisted:true});f.events.get('pageshow')({persisted:true});await drain();}else {f.adapter.onRebindNeeded();await drain();}
 await f.send('c2');await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE').length,0);f.client.stop();
});
test('already-open native link use requires current proof and mismatched producer cannot report',async()=>{
 const f=recentFixture();await f.client.start();
 const intent={actionId:'native_click',conversationId:'c1'},proof={conversationId:'c1',bodyProofId:'proof'};
 f.adapter.onNativeUse(intent,{...f.binding(),producerToken:'wrong'},proof);await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE').length,0);
 f.adapter.onNativeUse(intent,f.binding(),proof);await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_NATIVE_LOCAL_USE').length,1);f.client.stop();
});

test('bounded layout preparation precedes HELLO and a stopped wait cannot reopen authority',async()=>{
 const f=fixture();let complete;const prepareDocument=()=>new Promise(resolve=>{complete=resolve;});
 const client=createHostContentSession({...f.options,prepareDocument});
 const pending=client.start();await drain();assert.equal(f.calls.length,0);client.stop();complete(true);assert.equal(await pending,null);assert.equal(f.calls.length,0);
 const failed=createHostContentSession({...f.options,prepareDocument:async()=>false});assert.equal(await failed.start(),null);assert.equal(f.calls.length,0);assert.equal(failed.localStatus(),'layout-failed');
 const before=f.calls.length;assert.equal(failed.localStatus(),'layout-failed');assert.equal(f.calls.length,before);
 const detailed=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{onFailure('layout-missing-reading');return false;}});await detailed.start();assert.equal(detailed.localStatus(),'layout-missing-reading');assert.equal(f.calls.length,before);
 const rejected=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{onFailure('PRIVATE_DETAIL');return false;}});await rejected.start();assert.equal(rejected.localStatus(),'layout-failed');
 f.options.document.location.href+='c/other';assert.equal(failed.localStatus(),'unavailable');f.options.document.location.href='https://chatgpt.com/';
 const ready=createHostContentSession({...f.options,prepareDocument:async()=>true});assert.deepEqual(await ready.start(),{id:'mount'});assert.equal(f.calls[0].type,'HOST_HELLO');ready.stop();
});
test('local layout loss uses one fresh same-scope handshake, never a recovery loop or strict-mode retry',async()=>{
 for(const local of [true,false]){
  const f=fixture();let terminated;const factory=f.options.controllerFactory;
  const client=createHostContentSession({...f.options,prepareDocument:local?async()=>true:null,controllerFactory:options=>{terminated=options.onTerminated;return factory(options);}});
  f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:'local-scope'}:{ok:true,grants:[]});
  await client.start();const first=f.calls.filter(m=>m.type==='HOST_HELLO').length;terminated('native-region-changed',{mode:'workspace'});await drain();
  assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,first+(local?1:0));
  if(local){terminated('native-region-changed',{mode:'workspace'});await drain();assert.equal(f.calls.filter(m=>m.type==='HOST_HELLO').length,first+1);}
  client.stop();
 }
});

test('terminated controller preserves its recorded fixed failure without new inspection or IPC',async()=>{
 const f=fixture(),factory=f.options.controllerFactory;let terminate,status='ready';
 const client=createHostContentSession({...f.options,controllerFactory:options=>{terminate=options.onTerminated;return {...factory(options),localStatus:()=>status};}});
 await client.start();assert.equal(client.localStatus(),'ready');
 status='surface-controller-absent';terminate('ui-frame-suspended');await drain();
 // Recovery can use the one existing fresh handshake; fail the final controller
 // with a non-retrying stop, then preserve its fixed reason.
 status='surface-controller-absent';terminate('ui-authority-revoked');
 const before=f.calls.length;assert.equal(client.localStatus(),'surface-ui-authority-revoked');assert.equal(f.calls.length,before);
 f.document.location.href+='c/other';assert.notEqual(client.localStatus(),'surface-ui-authority-revoked');client.stop();
});

// Real startup failures must remain diagnosable without retaining reply data.
test('initial transport refusal stays fail-closed with bounded private reason',async()=>{
 for(const [reply,expected] of [[{ok:false,reason:'invalidated-during-check'},'hello-invalidated-during-check'],[{ok:false,reason:'not-current-document'},'hello-not-current-document'],[{ok:false,reason:'PRIVATE_DETAIL'},'hello-invalid-binding'],[{ok:false,reason:'invalid-sender',private:'SECRET'},'hello-invalid-binding'],[{binding:{}},'hello-invalid-binding']]){
  const f=fixture();f.setResponse(()=>reply);assert.equal(await f.client.start(),null);assert.equal(f.client.localStatus(),expected);assert.equal(f.calls.length,1);assert.equal(f.client.showWorkspace(),false);assert.equal(f.listeners.size,0);await f.advance(30000);assert.equal(f.calls.length,1);
 }
 const f=fixture();f.setResponse(()=>Promise.reject(Error('PRIVATE_TRANSPORT_DETAIL')));assert.equal(await f.client.start(),null);assert.equal(f.client.localStatus(),'hello-transport-unavailable');assert.equal(f.calls.length,1);assert.equal(f.listeners.size,0);
});

test('a newly available initial layout gets one fresh reading startup, never an automatic failure loop',async()=>{
 const f=fixture();let ready=false,prepares=0,mode;const factory=f.options.controllerFactory;
 const client=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{prepares++;if(!ready)onFailure('layout-missing-historyList');return ready;},controllerFactory:o=>{mode=o.initialMode;return factory(o);}});
 await client.start();assert.equal(f.calls.length,0);ready=true;
 assert.deepEqual(await client.recoverLayout(),{id:'mount'});assert.equal(mode,'reading');assert.equal(prepares,2);assert.equal(f.calls[0].type,'HOST_HELLO');
 assert.equal(await client.recoverLayout(),null);client.stop();
 const failed=fixture({prepareDocument:async({onFailure})=>{onFailure('layout-missing-historyList');return false;}});
 await failed.client.start();await failed.client.recoverLayout();await failed.client.recoverLayout();assert.equal(failed.calls.length,0);assert.equal(failed.client.localStatus(),'layout-missing-historyList');failed.client.stop();
});
test('late Project or history rows share one fresh preparation; unsafe paint does not',async()=>{
 for(const reason of ['layout-project-rows','layout-history-row-order','layout-history-row-replaced','layout-history-row-unstable','layout-project-paint','layout-history-sibling-overlap']){
  const recoverable=['layout-project-rows','layout-history-row-order','layout-history-row-replaced','layout-history-row-unstable'].includes(reason);
  const f=fixture();let ready=false,prepares=0;
  const client=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{prepares++;if(!ready)onFailure(reason);return ready;}});
  await client.start();assert.equal(f.calls.length,0);ready=true;
  const result=await client.recoverLayout();assert.equal(!!result,recoverable);
  assert.equal(prepares,recoverable?2:1);assert.equal(await client.recoverLayout(),null);client.stop();
 }
});
test('layout recovery cannot resume an explicit stop, changed route or non-layout refusal',async()=>{
 for(const change of [f=>f.client.stop(),f=>{f.document.location.href+='c/other';}]){
  const f=fixture({prepareDocument:async({onFailure})=>{onFailure('layout-missing-historyList');return false;}});await f.client.start();change(f);assert.equal(await f.client.recoverLayout(),null);assert.equal(f.calls.length,0);f.client.stop();
 }
 const f=fixture({prepareDocument:async()=>true});f.setResponse(()=>({ok:false,reason:'denied'}));await f.client.start();const count=f.calls.length;assert.equal(await f.client.recoverLayout(),null);assert.equal(f.calls.length,count);f.client.stop();
});

test('leaving a failed Project preparation starts a fresh reading bind only on a different route',async()=>{
 let ready=false,mode;const f=fixture(),factory=f.options.controllerFactory;
 const client=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{if(!ready)onFailure('layout-project-main');return ready;},controllerFactory:o=>{mode=o.initialMode;return factory(o);}});
 f.document.location.href+='g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/project';
 await client.start();assert.equal(f.calls.length,0);assert.equal(await client.recoverRoute(),null);
 ready=true;f.document.location.href='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
 assert.deepEqual(await client.recoverRoute(),{id:'mount'});assert.equal(mode,'reading');assert.equal(f.calls[0].type,'HOST_HELLO');
 const count=f.calls.length;assert.equal(await client.recoverRoute(),null);assert.equal(f.calls.length,count);client.stop();
});
test('route recovery does not revive explicit stop, hidden document or rejected identity',async()=>{
 for(const block of ['stop','hidden','unsupported']){
  const f=fixture({prepareDocument:async({onFailure})=>{onFailure('layout-project-main');return false;}});await f.client.start();
  f.document.location.href='https://chatgpt.com/c/33333333-3333-4333-8333-333333333333';
  if(block==='stop')f.client.stop();if(block==='hidden')f.document.visibilityState='hidden';if(block==='unsupported')f.document.location.href='https://chatgpt.com/settings';
  assert.equal(await f.client.recoverRoute(),null);assert.equal(f.calls.length,0);f.client.stop();
 }
 const f=fixture({prepareDocument:async()=>true});f.setResponse(()=>({ok:false,reason:'denied'}));await f.client.start();
 f.document.location.href+='c/33333333-3333-4333-8333-333333333333';const count=f.calls.length;
 assert.equal(await f.client.recoverRoute(),null);assert.equal(f.calls.length,count);f.client.stop();
});

test('settled titlebar ambiguity allows one fresh preparation but never accepts a still-ambiguous layout',async()=>{
 for(const reason of ['layout-ambiguous-header','layout-ambiguous-navigationSlot']){
  for(const settled of [true,false]){
   const f=fixture();let ready=false,prepares=0;
   const client=createHostContentSession({...f.options,prepareDocument:async({onFailure})=>{prepares++;if(!ready)onFailure(reason);return ready;}});
   await client.start();assert.equal(f.calls.length,0);ready=settled;
   assert.equal(!!await client.recoverLayout(),settled);assert.equal(prepares,2);
   if(!settled)assert.equal(f.calls.length,0,'ambiguous layout never reaches HELLO');
   assert.equal(await client.recoverLayout(),null);assert.equal(prepares,2);client.stop();
  }
 }
});

test('native history reorder rebuilds once after transport recovery and checks the same scope',async()=>{
 const f=fixture(),factory=f.options.controllerFactory;let control,preparations=0;
 const client=createHostContentSession({...f.options,prepareDocument:async()=>{preparations++;return true;},controllerFactory:o=>{control=o;return factory(o);}});
 f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:'local-scope'}:{ok:true,grants:[]});
 await client.start();control.onTerminated('ui-frame-suspended',{mode:'reading'});await drain();
 assert.equal(preparations,2,'existing transport recovery was spent');
 control.onFailure('surface-unsafe-native-history-list-row-order');control.onTerminated('native-region-changed',{mode:'reading'});await drain();
 assert.equal(preparations,3);assert.equal(control.initialMode,'reading');
 control.onFailure('surface-unsafe-native-history-list-row-order');control.onTerminated('native-region-changed',{mode:'reading'});await drain();
 assert.equal(preparations,3,'failed replacement cannot reuse either recovery budget');client.stop();
});

test('history change during mount awaits a fresh proof once; strict, hidden, unsafe and changed scope stay closed',async()=>{
 for(const scenario of ['reorder','replaced','strict','hidden','unsafe','scope-change']){
  const f=fixture(),factory=f.options.controllerFactory;let mounts=0,preparations=0;
  if(scenario==='hidden')f.document.visibilityState='hidden';
  f.setResponse(m=>m.type==='HOST_HELLO'?{binding:f.binding()}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:scenario==='scope-change'&&mounts?'other':'local-scope'}:{ok:true,grants:[]});
  const client=createHostContentSession({...f.options,prepareDocument:scenario==='strict'?null:async()=>{preparations++;return true;},controllerFactory:o=>{
   const controller=factory(o);return {...controller,start:async c=>{mounts++;if(mounts===1){o.onFailure('surface-unsafe-native-history-list-'+(scenario==='unsafe'?'row-gap':scenario==='replaced'?'row-replaced':'row-order'));o.onTerminated('mount-unavailable',{mode:'reading'});return null;}return controller.start(c);}};
  }});
  await client.start();await drain();
  assert.equal(mounts,['reorder','replaced'].includes(scenario)?2:1,scenario);
  if(scenario==='scope-change')assert.equal(preparations,2,'replacement revalidates but cannot mount another scope');
  if(['strict','hidden','unsafe','scope-change'].includes(scenario))assert.equal(client.showWorkspace(),false,scenario);
  client.stop();
 }
});
