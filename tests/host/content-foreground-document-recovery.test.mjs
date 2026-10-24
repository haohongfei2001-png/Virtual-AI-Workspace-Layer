import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
import {createHostBrowserBootstrap} from '../../src/runtime/host-browser-bootstrap.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
// Real production owners/session/provider; explicit loopback Chrome/DOM and
// MOCK_IDB doubles. This is L evidence, not Chrome timing or full J4 acceptance.
const origin='http://127.0.0.1:3210',C='11111111-1111-4111-8111-111111111111',url=origin+'/c/'+C;
const profile={id:'offline-native-request-context',singlePersonalDefault:false,browserRequestContext:true};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
function event(){const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit(...args){for(const f of [...listeners])f(...args);}};}
async function fixture(t,{nativeAfterRestart=true,clocked=false,contentClock=false}={}){
 const originalNow=Date.now;let wall=originalNow();if(clocked){Date.now=()=>wall;t.after(()=>{Date.now=originalNow;});}
 const timers=new Map();let timerId=0;const contentTiming=contentClock?{now:()=>wall,elapsedNow:()=>wall,schedule:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:wall+ms});return id;},cancel:id=>timers.delete(id)}:{};
 const e=Object.fromEntries(['onMessage','onConnect','onCommitted','onHistoryStateUpdated','onRemoved','onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(n=>[n,event()]));
 const contentEvents=event(),windowEvents=new Map(),docEvents=new Map(),calls=[],sent=[],fetches=[],controllers=[];
 const sender={id:'ext',tab:{id:7,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url};
 let restoreCalls=0,snippetReady=false;let actual={documentId:'doc',url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1},worker,bootstrap,requestId=0,principal='offline_self',nativeContext='team',completionPatch={},holdFocus=null,holdHello=null,holdRefresh=null,afterFocus=null;
 const document={visibilityState:'visible',location:{origin,href:url},draft:'UNSENT',addEventListener:(n,f)=>docEvents.set(n,f),removeEventListener:(n,f)=>{if(docEvents.get(n)===f)docEvents.delete(n);},defaultView:{addEventListener:(n,f)=>windowEvents.set(n,f),removeEventListener:(n,f)=>{if(windowEvents.get(n)===f)windowEvents.delete(n);}}};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,getContexts:async()=>[],onMessage:e.onMessage,onConnect:e.onConnect},webNavigation:{getFrame:async()=>actual,onCommitted:e.onCommitted,onHistoryStateUpdated:e.onHistoryStateUpdated},tabs:{get:async id=>({id,incognito:false}),onRemoved:e.onRemoved,sendMessage:async(tab,m,target)=>{sent.push(m.type);assert.equal(target.documentId,'doc');if(m.type==='HOST_CONTEXT_ASSOCIATE')return {challenge:m.challenge,actualURL:m.actualURL,conversationId:m.conversationId,association:'explicit-body-id'};if(m.type==='HOST_CONTEXT_PENDING')session.contextPending();if(m.type==='HOST_CONTEXT_READY')void session.contextReady();return {ok:true};}},webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(n=>[n,e[n]]))};
 const indexedDB=new MockIDBFactory();
 const provider=()=>createSessionProvider({origin,fetch:async target=>{fetches.push(target);const value=target.endsWith('/api/auth/session')?{user:{id:principal},expires:new Date(Date.now()+3600000).toISOString(),accessToken:'OFFLINE_FAKE_TOKEN'}:{accounts:{personal:{account:{account_id:'personal',structure:'personal'}},team:{account:{account_id:'team',structure:'team'}}}};const r=new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:target});return r;}});
 const nativeGET=async()=>{const d={tabId:7,frameId:0,documentId:actual.documentId,documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'request_'+(++requestId),url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:nativeContext}]};e.onSendHeaders.emit(d);await settle();e.onCompleted.emit({...d,statusCode:200,fromCache:false,...completionPatch});await settle();};
 const makeBootstrap=()=>bootstrap=createHostBrowserBootstrap({chrome,origin,scopeProfile:profile});
 const startWorker=()=>worker=createHostWorkerRuntime({chrome,indexedDB,origin,scopeProfile:profile,browserBootstrap:bootstrap,provider:provider()});
 const runtime={id:'ext',getURL:chrome.runtime.getURL,onMessage:contentEvents,sendMessage:async m=>{const response=await worker.service.handle(m,sender);calls.push({type:m.type,response});if(m.type==='HOST_FOCUS'&&holdFocus){await holdFocus;}if(m.type==='HOST_HELLO'&&holdHello){await holdHello;}if(m.type==='HOST_REFRESH'&&holdRefresh){await holdRefresh;}if(m.type==='HOST_FOCUS'&&afterFocus)afterFocus();return response;}};
 const session=createHostContentSession({document,runtime,contextRecovery:true,...contentTiming,adapterFactory:()=>({start:async()=>({}),inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,snippetReady:()=>snippetReady,restoreSnippet:()=>{restoreCalls++;return {ok:true};}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{let active=false;const c={options,start:async context=>{c.binding=context.binding;const r=await options.bridge.registerMount({handle:{id:'mount_'+controllers.length,regionEpoch:1}});assert.equal(r.ok,true,JSON.stringify(r));active=true;return {id:'mount_'+controllers.length};},stop(){active=false;},presentationMode:()=>options.initialMode,showWorkspace:()=>active,showReading:()=>active};controllers.push(c);return c;}});
 t.after(()=>{session.stop();worker?.stop();bootstrap?.stop();});
 makeBootstrap();await nativeGET();startWorker();assert(await session.start());assert.equal(session.showWorkspace(),true);const initialScope=worker.service.authority.scopeFor({tabId:7,frameId:0,documentId:'doc',actualURL:url,documentLifecycle:'active',incognito:false});assert(initialScope);
 return {setAfterFocus:f=>afterFocus=f,session,document,calls,sent,fetches,controllers,initialScope,windowEvents,nativeGET,contentEvents,restoreCalls:()=>restoreCalls,setSnippetReady:v=>snippetReady=v,scope:()=>worker.service.authority.scopeFor({tabId:7,frameId:0,documentId:'doc',actualURL:url,documentLifecycle:'active',incognito:false}),setPrincipal:v=>principal=v,setNativeContext:v=>nativeContext=v,setCompletion:v=>completionPatch=v,holdFocus:p=>holdFocus=p,holdHello:p=>holdHello=p,holdRefresh:p=>holdRefresh=p,advance:ms=>{wall+=ms;for(const[id,timer]of [...timers])if(timer.at<=wall){timers.delete(id);timer.fn();}},setActual:v=>actual=v,async restart(){worker.stop();makeBootstrap();if(nativeAfterRestart)await nativeGET();const n=sent.length;startWorker();assert.equal(sent.length,n,'bootstrap attach must not replay old READY');},async foreground(){windowEvents.get('blur')?.();windowEvents.get('focus')?.();await settle();},hellos:()=>calls.filter(c=>c.type==='HOST_HELLO').length};
}
test('foreground must perform one fresh handshake when restarted worker already owns a genuine current native receipt',async t=>{
 const f=await fixture(t);await f.restart();await f.foreground();
 const facts={hellos:f.hellos(),ready:f.session.showWorkspace(),focus:f.calls.filter(c=>c.type==='HOST_FOCUS').at(-1)?.response,sent:f.sent,providerReads:f.fetches.length/2};
 console.log('FOREGROUND_FACTS',JSON.stringify(facts));
 assert.equal(f.hellos(),2,'stale transport must attempt one new HELLO despite pre-attach READY not being replayed');
 assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);assert.equal(f.document.location.href,url);assert.equal(f.document.draft,'UNSENT');
});
test('explicit fresh start proves existing production C2 owner can freshly authorize same unchanged native document',async t=>{
 const f=await fixture(t);await f.restart();await f.foreground();const before=f.hellos();await f.session.start();assert.equal(f.hellos(),before+1);assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);
});
test('cold worker without genuine native receipt remains ambiguous after fresh session and roster fetch',async t=>{
 const f=await fixture(t,{nativeAfterRestart:false});await f.restart();assert.equal(await f.session.start(),null);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);assert.equal(f.calls.filter(c=>c.type==='HOST_REFRESH').at(-1).response.state,'ambiguous');
});

test('live identity denial never triggers automatic fresh HELLO',async t=>{
 const f=await fixture(t);f.setPrincipal('other_self');await f.foreground();assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);
});
test('no C2 receipt permits one fresh check but never private UI or a self-retry loop',async t=>{
 const f=await fixture(t,{nativeAfterRestart:false});await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);for(let i=0;i<5;i++)await f.foreground();assert.equal(f.hellos(),2);
});
test('replacement browser document cannot recover old content or UI',async t=>{
 const f=await fixture(t);await f.restart();f.setActual({documentId:'replacement',url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1});await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);assert.equal(f.calls.filter(c=>c.type==='HOST_HELLO').at(-1).response.reason,'not-current-document');
});
test('a different newly authenticated principal cannot remount old presentation',async t=>{
 const f=await fixture(t);await f.restart();f.setPrincipal('other_self');await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.controllers.length,1);
});
test('second worker loss cannot exceed original one-shot recovery budget',async t=>{
 const f=await fixture(t);await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);
});
for(const mode of ['stop','pagehide','user-exit'])test(''+mode+' while old foreground result waits cannot revive',async t=>{
 const f=await fixture(t);await f.restart();let finish;f.holdFocus(new Promise(r=>finish=r));await f.foreground();if(mode==='stop')f.session.stop();else if(mode==='pagehide')f.windowEvents.get('pagehide')?.({persisted:false});else f.controllers[0].options.onTerminated('ui-user-exit');finish();await settle();assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),false);
});
test('in-flight old snippet restoration aborts once and does not replay on recovered session',async t=>{
 const f=await fixture(t),b=f.controllers[0].binding,replies=[];
 const m={type:'HOST_SNIPPET_RESTORE',documentToken:b.documentToken,producerToken:b.producerToken,routeEpoch:b.routeEpoch,scopeGrantId:'old-scope-grant',ref:{id:C,nativeUrl:url},anchor:{refId:C,messageId:'message',branchId:null,text:'selected',bodyHash:'hash'},expiresAt:new Date(Date.now()+6000).toISOString()};
 f.contentEvents.emit(m,{id:'ext'},r=>replies.push(r));assert.deepEqual(replies,[]);assert.equal(f.restoreCalls(),0);await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);assert.deepEqual(replies,[{ok:false}]);f.setSnippetReady(true);await new Promise(r=>setTimeout(r,80));assert.equal(f.restoreCalls(),0);assert.deepEqual(replies,[{ok:false}]);
});

test('expired document transport with still-valid original C2 receipt recovers on foreground without any new native GET',async t=>{
 const f=await fixture(t,{clocked:true});const before=f.sent.length;f.advance(21000);await f.foreground();
 console.log('EXPIRY_FACTS',JSON.stringify({hellos:f.hellos(),ready:f.session.showWorkspace(),focus:f.calls.filter(c=>c.type==='HOST_FOCUS').at(-1)?.response,newMessages:f.sent.slice(before)}));
 assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);assert.equal(f.document.draft,'UNSENT');
});
test('expired C2 receipt cannot authorize recovery even after fresh fixed session/roster reads',async t=>{
 const f=await fixture(t,{clocked:true});f.advance(61000);await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);assert.equal(f.calls.filter(c=>c.type==='HOST_REFRESH').at(-1).response.state,'ambiguous');
});
for(const mode of ['stop','pagehide','replace'])test('held recovery HELLO cannot revive after '+mode,async t=>{
 const f=await fixture(t);await f.restart();let finish;f.holdHello(new Promise(r=>finish=r));await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);
 if(mode==='stop')f.session.stop();else if(mode==='pagehide')f.windowEvents.get('pagehide')?.({persisted:false});else {f.session.contextPending();f.holdHello(null);await f.session.contextReady();assert.equal(f.session.showWorkspace(),true);}
 const mounts=f.controllers.length;finish();await settle();assert.equal(f.controllers.length,mounts);assert.equal(f.session.showWorkspace(),mode==='replace');assert.equal(f.hellos(),mode==='replace'?3:2);
});
test('recovery HELLO keeps original six-second RPC deadline and rejects late reply',async t=>{
 const f=await fixture(t,{clocked:true,contentClock:true});await f.restart();let finish;f.holdHello(new Promise(r=>finish=r));await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);
 f.advance(5999);await settle();assert.equal(f.controllers.length,1);f.advance(1);await settle();assert.equal(f.session.showWorkspace(),false);assert.equal(f.controllers.length,1);finish();await settle();assert.equal(f.controllers.length,1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.hellos(),2);
});

test('newly observed different native context cannot inherit former Team presentation',async t=>{
 const f=await fixture(t);f.setNativeContext('personal');await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.controllers.length,1);assert.notEqual(f.scope()?.key,f.initialScope.key);
});
for(const patch of [{statusCode:503},{fromCache:true}])test('invalid new native GET does not restore scope '+JSON.stringify(patch),async t=>{
 const f=await fixture(t);f.setCompletion(patch);await f.restart();await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);assert.equal(f.scope(),null);assert.equal(f.calls.filter(c=>c.type==='HOST_REFRESH').at(-1).response.state,'ambiguous');
});
test('twenty duplicate foreground notifications during recovery cannot create another handshake',async t=>{
 const f=await fixture(t);await f.restart();let finish;f.holdHello(new Promise(r=>finish=r));await f.foreground();for(let i=0;i<20;i++)await f.foreground();assert.equal(f.hellos(),2);f.holdHello(null);finish();await settle();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);
});

// The runtime reply can settle before rpc/track deliver it to the foreground
// handler. A newer explicit start in that microtask gap owns its own budget.
// Schedule only caller lifecycle activity; do not patch production promises,
// clocks, authority or responses. These adjacent positions straddle the final
// rpc live check and the outer foreground callback in the actual call chain.
for(const turns of [6,7])test('settled old foreground reply cannot spend replacement recovery budget at microtask '+turns,async t=>{
 const f=await fixture(t);await f.restart();let replacement;
 f.setAfterFocus(()=>{
  let remaining=turns;
  const replace=()=>{if(remaining--===0){f.setAfterFocus(null);replacement=f.session.start();}else queueMicrotask(replace);};
  queueMicrotask(replace);
 });
 await f.foreground();assert(replacement,'explicit replacement must actually run in the reply-settlement gap');await replacement;await settle();
 assert.equal(f.hellos(),2,'only initial and explicit replacement HELLO have run');assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);
 await f.restart();await f.foreground();
 assert.equal(f.hellos(),3,'the old reply must not spend the explicit replacement session recovery budget');assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);
 await f.restart();await f.foreground();assert.equal(f.hellos(),3,'replacement still owns only one automatic recovery');assert.equal(f.session.showWorkspace(),false);
});

for(const mode of ['fresh-context','no-context','changed-principal'])test('foreground transport rejection performs only a fresh same-scope check: '+mode,async t=>{
 const f=await fixture(t,{nativeAfterRestart:mode!=='no-context'});await f.restart();if(mode==='changed-principal')f.setPrincipal('other_self');
 let reject;f.holdFocus(new Promise((_,r)=>reject=r));await f.foreground();reject(Error('extension-port-closed'));await settle();
 assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),mode==='fresh-context');assert.equal(f.document.draft,'UNSENT');
 if(mode==='fresh-context')assert.equal(f.scope().key,f.initialScope.key);
 for(let i=0;i<3;i++)await f.foreground();assert.equal(f.hellos(),2,'transport failure cannot acquire another recovery attempt');
});
test('foreground transport timeout uses original deadline then one fresh handshake without accepting late result',async t=>{
 const f=await fixture(t,{clocked:true,contentClock:true});await f.restart();let finish;f.holdFocus(new Promise(r=>finish=r));await f.foreground();
 f.advance(5999);await settle();assert.equal(f.hellos(),1);f.advance(1);await settle();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),true);
 finish();await settle();assert.equal(f.hellos(),2);assert.equal(f.scope().key,f.initialScope.key);assert.equal(f.document.draft,'UNSENT');
});
for(const mode of ['stop','pagehide','user-exit'])test('late foreground transport rejection cannot revive after '+mode,async t=>{
 const f=await fixture(t);await f.restart();let reject;f.holdFocus(new Promise((_,r)=>reject=r));await f.foreground();
 if(mode==='stop')f.session.stop();else if(mode==='pagehide')f.windowEvents.get('pagehide')?.({persisted:false});else f.controllers[0].options.onTerminated('ui-user-exit');
 reject(Error('extension-port-closed'));await settle();assert.equal(f.hellos(),1);assert.equal(f.session.showWorkspace(),false);assert.equal(f.document.draft,'UNSENT');
});
for(const phase of ['reject-then-ready','ready-before-reject'])test('C2 handshake port loss waits for genuine context notification: '+phase,async t=>{
 const f=await fixture(t,{nativeAfterRestart:false});await f.restart();let reject;f.holdHello(new Promise((_,r)=>reject=r));await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);
 f.holdHello(null);if(phase==='ready-before-reject')await f.nativeGET();
 reject(Error('Could not establish connection. Receiving end does not exist.'));await settle();
 if(phase==='reject-then-ready'){assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);await f.nativeGET();await settle();}
 assert.equal(f.hellos(),3);assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);assert.equal(f.document.draft,'UNSENT');
});

test('C2 REFRESH transport loss after a new binding withdraws until a fresh native READY',async t=>{
 const f=await fixture(t,{clocked:true});await f.restart();let reject;f.holdRefresh(new Promise((_,r)=>reject=r));await f.foreground();assert.equal(f.hellos(),2);assert.equal(f.session.showWorkspace(),false);
 f.holdRefresh(null);reject(Error('extension-port-closed'));await settle();assert.equal(f.session.showWorkspace(),false);assert.equal(f.hellos(),2);
 // A genuinely later request must have a strictly later wall clock. Same-ms
 // receipts are deliberately rejected by the owner and can never produce READY.
 const readyBefore=f.sent.filter(type=>type==='HOST_CONTEXT_READY').length;f.advance(1);
 await f.nativeGET();await settle();assert.equal(f.sent.filter(type=>type==='HOST_CONTEXT_READY').length,readyBefore+1);assert.equal(f.hellos(),3);assert.equal(f.session.showWorkspace(),true);assert.equal(f.scope().key,f.initialScope.key);assert.equal(f.document.draft,'UNSENT');
});
