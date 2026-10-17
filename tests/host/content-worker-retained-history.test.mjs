import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
import {createHostBrowserBootstrap} from '../../src/runtime/host-browser-bootstrap.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
// Real production owners/session/provider; explicit loopback Chrome/DOM and
// MOCK_IDB doubles. This is L evidence, not Chrome timing or full J4 acceptance.
const D='44444444-4444-4444-8444-444444444444';
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
 let restoreCalls=0,snippetReady=false;let actual={documentId:'doc',url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1},worker,bootstrap,requestId=0,principal='offline_self',nativeContext='team',completionPatch={},holdFocus=null,holdHello=null,afterFocus=null,holdLookup=false,releaseLookup;
 const document={visibilityState:'visible',location:{origin,href:url},draft:'UNSENT',addEventListener:(n,f)=>docEvents.set(n,f),removeEventListener:(n,f)=>{if(docEvents.get(n)===f)docEvents.delete(n);},defaultView:{addEventListener:(n,f)=>windowEvents.set(n,f),removeEventListener:(n,f)=>{if(windowEvents.get(n)===f)windowEvents.delete(n);}}};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,getContexts:async()=>[],onMessage:e.onMessage,onConnect:e.onConnect},webNavigation:{getFrame:async()=>{const captured={...actual};if(holdLookup){holdLookup=false;return new Promise(r=>releaseLookup=()=>r(captured));}return captured;},onCommitted:e.onCommitted,onHistoryStateUpdated:e.onHistoryStateUpdated},tabs:{get:async id=>({id,incognito:false}),onRemoved:e.onRemoved,sendMessage:async(tab,m,target)=>{sent.push(m.type);assert.equal(target.documentId,'doc');if(m.type==='HOST_CONTEXT_ASSOCIATE')return {challenge:m.challenge,actualURL:m.actualURL,conversationId:m.conversationId,association:'explicit-body-id'};if(m.type==='HOST_CONTEXT_PENDING')session.contextPending();if(m.type==='HOST_CONTEXT_READY')void session.contextReady();if(m.type==='HOST_DOCUMENT_INVALIDATED')contentEvents.emit(m,{id:'ext'},()=>{});return {ok:true};}},webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(n=>[n,e[n]]))};
 const indexedDB=new MockIDBFactory();
 const provider=()=>createSessionProvider({origin,fetch:async target=>{fetches.push(target);const value=target.endsWith('/api/auth/session')?{user:{id:principal},expires:new Date(Date.now()+3600000).toISOString(),accessToken:'OFFLINE_FAKE_TOKEN'}:{accounts:{personal:{account:{account_id:'personal',structure:'personal'}},team:{account:{account_id:'team',structure:'team'}}}};const r=new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:target});return r;}});
 const nativeGET=async()=>{const d={tabId:7,frameId:0,documentId:actual.documentId,documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'request_'+(++requestId),url:origin+'/backend-api/conversation/'+new URL(actual.url).pathname.split('/').at(-1),requestHeaders:[{name:'Chatgpt-Account-Id',value:nativeContext}]};e.onSendHeaders.emit(d);await settle();e.onCompleted.emit({...d,statusCode:200,fromCache:false,...completionPatch});await settle();};
 const makeBootstrap=()=>bootstrap=createHostBrowserBootstrap({chrome,origin,scopeProfile:profile});
 const startWorker=()=>worker=createHostWorkerRuntime({chrome,indexedDB,origin,scopeProfile:profile,browserBootstrap:bootstrap,provider:provider()});
 const runtime={id:'ext',getURL:chrome.runtime.getURL,onMessage:contentEvents,sendMessage:async m=>{const response=await worker.service.handle(m,sender);calls.push({type:m.type,response});if(m.type==='HOST_FOCUS'&&holdFocus){await holdFocus;}if(m.type==='HOST_HELLO'&&holdHello){await holdHello;}if(m.type==='HOST_FOCUS'&&afterFocus)afterFocus();return response;}};
 const session=createHostContentSession({document,runtime,contextRecovery:true,...contentTiming,adapterFactory:()=>({inspect:()=>({ok:true}),stop(){},hasNativeLayer:()=>false,snippetReady:()=>snippetReady,restoreSnippet:()=>{restoreCalls++;return {ok:true};}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:options=>{let active=false;const c={options,start:async context=>{c.binding=context.binding;const r=await options.bridge.registerMount({handle:{id:'mount_'+controllers.length,regionEpoch:1}});assert.equal(r.ok,true,JSON.stringify(r));active=true;return {id:'mount_'+controllers.length};},stop(){active=false;},presentationMode:()=>options.initialMode,showWorkspace:()=>active,showReading:()=>active};controllers.push(c);return c;}});
 t.after(()=>{session.stop();worker?.stop();bootstrap?.stop();});
 makeBootstrap();await nativeGET();startWorker();assert(await session.start());assert.equal(session.showWorkspace(),true);const initialScope=worker.service.authority.scopeFor({tabId:7,frameId:0,documentId:'doc',actualURL:url,documentLifecycle:'active',incognito:false});assert(initialScope);
 return {owner:()=>bootstrap.contextObserver,async retainedTransition({stale=false}={}){
  document.location.href=origin+'/c/'+D;
  if(!stale)actual={...actual,url:document.location.href};
  holdLookup=true;
  const d={tabId:7,frameId:0,documentId:actual.documentId,documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'request_'+(++requestId),url:origin+'/backend-api/conversation/'+D,requestHeaders:[{name:'Chatgpt-Account-Id',value:nativeContext}]};
  e.onSendHeaders.emit(d);await settle();
  actual={...actual,url:document.location.href};e.onHistoryStateUpdated.emit({...actual,tabId:7,frameId:0});
  releaseLookup();await settle();e.onCompleted.emit({...d,statusCode:200,fromCache:false});await settle();
  return {ready:session.showWorkspace(),receipt:await bootstrap.contextObserver.verify({tabId:7,frameId:0,documentId:'doc',actualURL:actual.url,documentLifecycle:'active',incognito:false}),sent:[...sent],calls:calls.map(c=>({type:c.type,state:c.response?.state,reason:c.response?.reason}))};
 },setAfterFocus:f=>afterFocus=f,session,document,calls,sent,fetches,controllers,initialScope,windowEvents,nativeGET,contentEvents,restoreCalls:()=>restoreCalls,setSnippetReady:v=>snippetReady=v,scope:()=>worker.service.authority.scopeFor({tabId:7,frameId:0,documentId:'doc',actualURL:url,documentLifecycle:'active',incognito:false}),setPrincipal:v=>principal=v,setNativeContext:v=>nativeContext=v,setCompletion:v=>completionPatch=v,holdFocus:p=>holdFocus=p,holdHello:p=>holdHello=p,advance:ms=>{wall+=ms;for(const[id,timer]of [...timers])if(timer.at<=wall){timers.delete(id);timer.fn();}},setActual:v=>actual=v,async restart(){worker.stop();makeBootstrap();if(nativeAfterRestart)await nativeGET();const n=sent.length;startWorker();assert.equal(sent.length,n,'bootstrap attach must not replay old READY');},async foreground(){windowEvents.get('blur')?.();windowEvents.get('focus')?.();await settle();},hellos:()=>calls.filter(c=>c.type==='HOST_HELLO').length};
}

test('actual worker/bootstrap/content control restores retained new-route request',async t=>{const f=await fixture(t);const result=await f.retainedTransition();assert.equal(result.receipt?.conversationId,D);assert.equal(result.ready,true);assert.equal(f.document.draft,'UNSENT');});
test('actual worker/bootstrap/content: old lookup across retained history loses recovery until independent GET',async t=>{
 const f=await fixture(t);const result=await f.retainedTransition({stale:true});
 console.log('CROSS_OWNER_RETAINED_OLD_SNAPSHOT',JSON.stringify({ready:result.ready,receiptPresent:!!result.receipt,sent:result.sent,calls:result.calls,draft:f.document.draft}));
 try{assert.equal(result.ready,true,'new current retained GET should establish fresh auth and a replacement surface');assert.equal(result.receipt?.conversationId,D);}finally{await f.nativeGET();assert.equal(f.session.showWorkspace(),true,'a genuinely new GET independently restores readiness');assert.equal(f.document.draft,'UNSENT');}
});
