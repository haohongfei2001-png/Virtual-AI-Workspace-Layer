/** Logic/real-module-evaluation contracts only. No Chrome registration timing or
 * initial-install C2 success is inferred from these deterministic doubles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createHostBrowserBootstrap} from '../../src/runtime/host-browser-bootstrap.mjs';
import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
const origin='http://127.0.0.1:3210',C='11111111-1111-4111-8111-111111111111';
const scopeProfile={id:'offline-native-request-context',singlePersonalDefault:false,browserRequestContext:true};
const frame={tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',incognito:false,actualURL:origin+'/c/'+C};
const browserFrame={documentId:'doc',documentLifecycle:'active',frameType:'outermost_frame',url:frame.actualURL};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function event(name,order){const listeners=new Set();return {listeners,addListener(listener,...args){listeners.add(listener);order.push(['registered',name,args]);},removeListener:listener=>listeners.delete(listener),emit(...args){for(const listener of [...listeners])listener(...args);}};}
function fixture(t,{enabled=true,onRegister=null}={}){
 const order=[],calls={sent:[],invalidated:[],closed:[],stopped:0},events=Object.fromEntries(['onMessage','onConnect','onCommitted','onHistoryStateUpdated','onRemoved','onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event(name,order)]));
 if(onRegister)for(const [name,e]of Object.entries(events)){const add=e.addListener;e.addListener=(...args)=>{onRegister(name);return add(...args);};}
 const chrome={runtime:{id:'ext',getURL:path=>'chrome-extension://ext/'+path,getContexts:async()=>[],onMessage:events.onMessage,onConnect:events.onConnect},webNavigation:{getFrame:async()=>browserFrame,onCommitted:events.onCommitted,onHistoryStateUpdated:events.onHistoryStateUpdated},tabs:{get:async id=>({id,incognito:false}),onRemoved:events.onRemoved,sendMessage:async(tabId,message,target)=>{order.push(['sent',message.type]);calls.sent.push([tabId,message,target]);return {challenge:message.challenge,actualURL:message.actualURL,conversationId:message.conversationId,association:'explicit-body-id'};}},webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,events[name]]))};
 const profile=enabled?scopeProfile:{id:'chatgpt-context-unverified',singlePersonalDefault:false};
 const bootstrap=createHostBrowserBootstrap({chrome,origin,scopeProfile:profile});t.after(()=>bootstrap.stop());
 const service={handle:async()=>({ok:true}),connectPort:()=>false,invalidate:details=>{order.push(['invalidated',details]);calls.invalidated.push(details);},tabClosed:id=>calls.closed.push(id),stop:()=>calls.stopped++};
 let runtime,config;const indexedDB=new MockIDBFactory();
 const start=(options={})=>{runtime=createHostWorkerRuntime({chrome,indexedDB,origin,scopeProfile:profile,browserBootstrap:bootstrap,serviceFactory:args=>{config=args;return service;},...options});t.after(()=>runtime.stop());return runtime;};
 const details=(patch={})=>({tabId:7,frameId:0,documentId:'doc',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'r1',url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'},{name:'Authorization',value:'DO_NOT_RETAIN'}],...patch});
 const send=async(patch={})=>{const d=details(patch);events.onSendHeaders.emit(d);await flush();return d;};
 const finish=async details=>{events.onCompleted.emit({...details,statusCode:200,fromCache:false,requestHeaders:undefined});await flush();};
 return {chrome,bootstrap,owner:bootstrap.contextObserver,events,order,calls,service,indexedDB,start,send,finish,details,get config(){return config;},get runtime(){return runtime;}};
}
const principal={principalId:'user',contexts:[{id:'personal',kind:'personal'},{id:'team',kind:'organization'}],expiresAt:new Date(Date.now()+60000).toISOString(),providerProfile:'session',transport:'worker-fixed-fetch'};
const authority=(owner,identity=principal)=>createScopeAuthority({provider:{read:async()=>identity},profile:scopeProfile,contextObserver:owner,allowedURL:value=>new URL(value).origin===origin});

test('early receipt has no page association or scope before attachment; same owner later joins roster and body',async t=>{
 const f=fixture(t);await f.finish(await f.send());assert.equal(await f.owner.verify(frame),null);assert.equal((await authority(f.owner).refresh(frame,'bind')).state,'ambiguous');assert.deepEqual(f.calls.sent,[]);assert.deepEqual(f.calls.invalidated,[]);
 let constructing;f.start({serviceFactory:args=>{assert.equal(args.contextObserver,f.owner);constructing=args.contextObserver.verify(frame);assert.equal(f.events.onMessage.listeners.size,0);return f.service;}});
 assert.equal(await constructing,null,'verification begun before attach cannot cross into readiness');
 assert.deepEqual(f.calls.sent,[],'attach does not replay ready/pending notifications');
 for(const name of Object.keys(f.events))assert.equal(f.events[name].listeners.size,1,name+' has one listener');
 const auth=authority(f.owner),result=await auth.refresh(frame,'bind');assert.equal(result.state,'verified');assert.equal(result.grant.context.kind,'browser-request-context');
 assert.deepEqual(f.calls.sent.map(x=>x[1].type),['HOST_CONTEXT_ASSOCIATE']);
 assert.equal((await authority(f.owner,{...principal,contexts:[{id:'personal',kind:'personal'}]}).refresh(frame,'bind')).state,'ambiguous','browser receipt does not authorize a context outside the roster');
 f.chrome.tabs.sendMessage=async()=>({association:'explicit-body-id',conversationId:C,actualURL:frame.actualURL,challenge:'page-forged'});
 assert.equal((await authority(f.owner).refresh(frame,'bind')).state,'ambiguous','page-only declaration cannot complete association');
});

test('runtime fallback constructs exactly one owner and stop removes only its listeners once',async t=>{
 const f=fixture(t);f.bootstrap.stop();const outsiders=Object.values(f.events).map(e=>{const listener=()=>{};e.addListener(listener);return [e,listener];});
 f.start({browserBootstrap:null});const owner=f.config.contextObserver;assert(owner);assert.notEqual(owner,f.owner);for(const [e]of outsiders)assert.equal(e.listeners.size,2);
 f.runtime.stop();f.runtime.stop();assert.equal(f.calls.stopped,1);for(const [e,listener]of outsiders)assert.deepEqual([...e.listeners],[listener]);assert.equal(await owner.verify(frame),null);
});

for(const state of ['pending','complete'])for(const lifecycle of ['onCommitted','onHistoryStateUpdated','onRemoved'])test('pre-attach '+lifecycle+' invalidates '+state+' C2 receipt without later replay',async t=>{
 const f=fixture(t),details=await f.send();if(state==='complete')await f.finish(details);
 f.events[lifecycle].emit(lifecycle==='onRemoved'?7:{...frame,url:frame.actualURL});f.start();if(state==='pending')await f.finish(details);
 assert.equal(await f.owner.verify(frame),null);assert.deepEqual(f.calls.sent,[]);assert.deepEqual(f.calls.invalidated,[]);assert.deepEqual(f.calls.closed,[]);
});

test('late pre-attach frame answer cannot restore a document invalidated before service readiness',async t=>{
 const f=fixture(t);let release;f.chrome.webNavigation.getFrame=()=>new Promise(resolve=>release=resolve);const details=await f.send();f.events.onHistoryStateUpdated.emit({...frame,url:frame.actualURL});f.start();release(browserFrame);await f.finish(details);assert.equal(await f.owner.verify(frame),null);assert.deepEqual(f.calls.sent,[]);
});

test('live navigation invalidates the exact owner before the runtime handler and does not double invalidate',async t=>{
 const f=fixture(t);f.start();await f.finish(await f.send());const receipt=await f.owner.verify(frame);assert(receipt);f.calls.invalidated.length=0;f.calls.sent.length=0;f.order.length=0;
 f.events.onHistoryStateUpdated.emit({...frame,url:frame.actualURL});assert.equal(f.owner.isCurrent(frame,receipt),false);await flush();
 assert.deepEqual(f.calls.invalidated,[{tabId:7,documentId:'doc'},{tabId:7,preserveViewDocumentId:'doc'}]);
 assert.deepEqual(f.calls.sent.map(x=>x[1].type),['HOST_CONTEXT_PENDING','HOST_DOCUMENT_INVALIDATED']);
 assert.deepEqual(f.order.map(x=>x[0]),['invalidated','sent','invalidated','sent']);
});

test('switch revocation is synchronous, service precedes pending notification, and stopped completion stays inert',async t=>{
 const f=fixture(t);f.start();await f.finish(await f.send());const old=await f.owner.verify(frame);f.order.length=0;
 const d=f.details({requestId:'r2',requestHeaders:[{name:'Chatgpt-Account-Id',value:'personal'}]});f.events.onSendHeaders.emit(d);assert.equal(f.owner.isCurrent(frame,old),false);assert.deepEqual(f.order.slice(0,2).map(x=>x[0]),['invalidated','sent']);
 f.runtime.stop();const count=f.calls.sent.length;await f.finish(d);assert.equal(f.calls.sent.length,count);assert.equal(await f.owner.verify(frame),null);assert(Object.values(f.events).every(e=>e.listeners.size===0));
});

test('subframe and other-tab lifecycle events cannot invalidate the current document',async t=>{
 const f=fixture(t);await f.finish(await f.send());for(const name of ['onCommitted','onHistoryStateUpdated']){f.events[name].emit({...frame,frameId:2,url:frame.actualURL});f.events[name].emit({...frame,tabId:8,url:frame.actualURL});}f.events.onRemoved.emit(8);f.start();assert(await f.owner.verify(frame));
});

test('a stopped bootstrap is not reusable and a new worker owner does not inherit receipts',async t=>{
 const f=fixture(t);await f.finish(await f.send());f.bootstrap.stop();assert.throws(()=>f.bootstrap.claim({}),/not-available/);f.start({browserBootstrap:null});assert.equal(await f.config.contextObserver.verify(frame),null);assert.equal(await f.owner.verify(frame),null);
});

test('default disabled bootstrap needs no webRequest and cannot be attached under an enabled profile or other origin',t=>{
 const f=fixture(t,{enabled:false});assert.equal(f.owner,null);assert.equal(f.events.onSendHeaders.listeners.size,0);delete f.chrome.webRequest;
 assert.throws(()=>f.bootstrap.claim({chrome:f.chrome,origin,scopeProfile}),/config-mismatch/);assert.throws(()=>f.bootstrap.claim({chrome:f.chrome,origin:'https://chatgpt.com',scopeProfile:{}}),/config-mismatch/);
 f.start();assert.equal(f.config.contextObserver,null);assert.equal(f.events.onSendHeaders.listeners.size,0);assert.throws(()=>f.bootstrap.claim({}),/not-available/);
});


test('a second runtime cannot stop a bootstrap already claimed by the live runtime',async t=>{
 const f=fixture(t);f.start();await f.finish(await f.send());const receipt=await f.owner.verify(frame);assert(receipt);
 assert.throws(()=>f.start({serviceFactory:()=>assert.fail('rejected claimant constructed a service')}),/not-available/);
 assert.equal(f.calls.stopped,0);assert(f.owner.isCurrent(frame,receipt));for(const e of Object.values(f.events))assert.equal(e.listeners.size,1);
 f.events.onHistoryStateUpdated.emit({...frame,url:frame.actualURL});assert.equal(f.owner.isCurrent(frame,receipt),false);await flush();assert(f.calls.invalidated.some(x=>x.preserveViewDocumentId==='doc'));
});

for(const mismatch of ['origin','chrome','profile'])test('rejected '+mismatch+' claim preserves the unclaimed observer for its intended runtime',async t=>{
 const f=fixture(t);await f.finish(await f.send());const options=mismatch==='origin'?{origin:'https://chatgpt.com'}:mismatch==='chrome'?{chrome:{...f.chrome}}:{scopeProfile:{id:'disabled',singlePersonalDefault:false}};
 assert.throws(()=>f.start({...options,serviceFactory:()=>assert.fail('mismatched claimant constructed a service')}),/config-mismatch/);
 for(const name of ['onSendHeaders','onCompleted','onCommitted','onHistoryStateUpdated','onRemoved'])assert.equal(f.events[name].listeners.size,1,name);
 assert.equal(f.calls.stopped,0);f.start();assert(await f.owner.verify(frame));
});

test('exclusive claim prevents reentrant service construction from stealing the owner',async t=>{
 const f=fixture(t);f.start({serviceFactory:()=>{assert.throws(()=>f.start(),/not-available/);return f.service;}});await f.finish(await f.send());assert(await f.owner.verify(frame));for(const e of Object.values(f.events))assert.equal(e.listeners.size,1);assert.equal(f.calls.stopped,0);
});

for(const failure of ['service','repository'])test(failure+' construction failure disposes the early owner and lifecycle registrations',async t=>{
 const f=fixture(t);await f.finish(await f.send());assert.throws(()=>f.start(failure==='service'?{serviceFactory:()=>{throw Error('expected-service-failure');}}:{indexedDB:null}),failure==='service'?/expected-service-failure/:/indexeddb-unavailable/);assert(Object.values(f.events).every(e=>e.listeners.size===0));assert.equal(await f.owner.verify(frame),null);
});

for(const enabled of [true,false])test('packaged static module evaluation registers early before heavy graph; C2 enabled='+enabled,async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vaiwl-bootstrap-evaluation-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const out=join(dir,'package'),info=buildHost(out,enabled?{offlineOrigin:origin,offlineContext:true}:{}),record=[];
 const f=fixture(t,{enabled:false});f.bootstrap.stop();for(const [name,e]of Object.entries(f.events)){const add=e.addListener;e.addListener=(...args)=>{record.push('listener:'+name);return add(...args);};}
 const globals=['chrome','indexedDB','__hostEvaluation','__hostEvaluatedRuntime'],prior=Object.fromEntries(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 t.after(()=>{globalThis.__hostEvaluatedRuntime?.stop();for(const name of globals)if(prior[name])Object.defineProperty(globalThis,name,prior[name]);else delete globalThis[name];});
 globalThis.chrome=f.chrome;globalThis.indexedDB=f.indexedDB;globalThis.__hostEvaluation=path=>record.push(path);
 const hooks=registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);if(!url.startsWith(pathToFileURL(out+'/').href)||!url.endsWith('.mjs'))return result;const path=relative(out,fileURLToPath(url));let source=String(result.source);if(path==='extension/worker.mjs')source=source.replace('createHostWorkerRuntime({','globalThis.__hostEvaluatedRuntime=createHostWorkerRuntime({');return {...result,source:'globalThis.__hostEvaluation('+JSON.stringify(path)+');\n'+source};}});t.after(()=>hooks.deregister());
 await import(pathToFileURL(join(out,'extension/worker.mjs')).href);hooks.deregister();
 const firstHeavy=record.findIndex(path=>path.startsWith('src/')&&!['src/b1/identity.mjs','src/data/request-deadline.mjs','src/runtime/browser-request-context.mjs','src/runtime/host-browser-bootstrap.mjs'].includes(path));assert(firstHeavy>=0);assert(record.indexOf('listener:onCommitted')<firstHeavy);assert(record.indexOf('listener:onMessage')>firstHeavy);
 assert.equal(record.filter(x=>x==='listener:onSendHeaders').length,enabled?1:0);if(enabled)assert(record.indexOf('listener:onSendHeaders')<firstHeavy);
 for(const name of ['onCommitted','onHistoryStateUpdated','onRemoved','onMessage','onConnect'])assert.equal(record.filter(x=>x==='listener:'+name).length,1,name);
 const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
 for(const path of ['extension/browser-bootstrap.mjs','src/runtime/host-browser-bootstrap.mjs','src/runtime/browser-request-context.mjs']){assert(info.files[path]);assert(!manifest.web_accessible_resources[0].resources.includes(path),path+' is worker-only');}
 assert.deepEqual(manifest.permissions,enabled?['webNavigation','webRequest']:['webNavigation']);assert.equal(verifyHost(out).status,info.status);globalThis.__hostEvaluatedRuntime.stop();assert(Object.values(f.events).every(e=>e.listeners.size===0));
});

test('trusted history event revokes tab authorization without losing a genuine new-route pending GET',async t=>{
 const f=fixture(t);f.start();await f.finish(await f.send());const old=await f.owner.verify(frame);assert(old);const D='22222222-2222-4222-8222-222222222222',url=origin+'/c/'+D;
 f.chrome.webNavigation.getFrame=async()=>({...browserFrame,url});const next=f.details({requestId:'next',url:origin+'/backend-api/conversation/'+D});f.events.onSendHeaders.emit(next);
 f.events.onHistoryStateUpdated.emit({tabId:7,frameId:0,documentId:'doc',frameType:'outermost_frame',documentLifecycle:'active',url});assert.equal(f.owner.isCurrent(frame,old),false);assert(f.calls.invalidated.some(x=>x.tabId===7));
 await f.finish(next);assert.equal((await f.owner.verify({...frame,actualURL:url}))?.conversationId,D);
});
