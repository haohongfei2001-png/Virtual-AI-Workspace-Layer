import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';

const now=Date.parse('2026-10-14T00:00:00Z');
const frame={tabId:1,frameId:0,documentId:'doc',actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=url=>Object.assign({url,status:200,redirected:false},
 {headers:new Headers({'content-type':'application/json'}),body:new Response(JSON.stringify({user:{id:'self'},expires:new Date(now+60000).toISOString(),accessToken:'fixture-only'})).body});

test('EOF does not detach cancellation until body disposal has actually settled',async()=>{
 const cleanup=deferred(),entered=deferred(),owner=new AbortController();let fetches=0,signal,released=false;
 const provider=createSessionProvider({now:()=>now,fetch:async(url,options)=>{fetches++;signal=options.signal;let reads=0;return {url,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({
  async read(){return ++reads===1?{done:false,value:new TextEncoder().encode(JSON.stringify({user:{id:'self'},expires:new Date(now+60000).toISOString(),accessToken:'fixture-only'}))}:{done:true};},
  cancel(){entered.resolve();return cleanup.promise;},releaseLock(){released=true;}
 })}};}});
 const pending=provider.read({signal:owner.signal});await entered.promise;
 assert.equal(provider.isIdle(),false);assert.equal(signal.aborted,false);owner.abort();await assert.rejects(pending,/session-aborted/);
 assert.equal(signal.aborted,true,'EOF with pending disposal is still cancellable');assert.equal(provider.isIdle(),false);assert.equal(released,false);
 cleanup.resolve();await flush();assert.equal(provider.isIdle(),true);assert.equal(released,true);assert.equal(fetches,1,'cancellation prevents the next endpoint');
});

test('real identity provider abort cannot hide a fetch still running from scope idle',async()=>{
 const gate=deferred();let calls=0,target;
 const provider=createSessionProvider({now:()=>now,fetch:url=>{calls++;target=url;return gate.promise;}});
 const authority=createScopeAuthority({provider,profile:{id:'fixture',singlePersonalDefault:true},now:()=>now});
 const pending=authority.refresh(frame,'bind');await flush();assert.equal(calls,1);
 authority.invalidateAll();assert.equal((await pending).state,'unverified');await flush();
 const prematurelyIdle=authority.isIdle();
 gate.resolve(response(target));await flush();
 assert.equal(prematurelyIdle,false,'caller cancellation must not erase the provider transport work');
 assert.equal(authority.isIdle(),true);assert.equal(authority.peek(frame).state,'unverified');assert.equal(calls,1);
});

test('real current reader remains nonidle until aborted response cleanup settles',async()=>{
 const gate=deferred(),entered=deferred(),abort=new AbortController();let calls=0,released=false,historical=0;
 const provider=createSessionProvider({now:()=>now,profile:{currentConversationReadEnabled:true},fetch:async url=>{
  calls++;return {url,status:200,redirected:false,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({
   async read(){throw Error('fixture read failure');},cancel(){entered.resolve();return gate.promise;},releaseLock(){released=true;}
  })}};
 }});
 const context={scope:{accountId:'principal_'+'a'.repeat(64),organizationId:'context_'+'b'.repeat(64)},conversationId:'11111111-1111-1111-1111-111111111111',messageIds:['message'],bodyEpoch:1,providerProfile:'chatgpt-session-v1',providerTransport:'worker-fixed-fetch',guard:()=>true,signal:abort.signal};
 const reader=createCurrentMetadataReader({provider,enabled:true,now:()=>now,observations:{withCurrent:(_,work)=>work(context)},onHistorical:()=>{historical++;}});
 const pending=reader.read('proof'),rejected=assert.rejects(pending,/aborted/);await entered.promise;
 abort.abort();await rejected;await flush();const prematurelyIdle=reader.isIdle();
 assert.equal(released,false);gate.reject(Error('fixture cancel failure'));await flush();
 assert.equal(prematurelyIdle,false,'caller cancellation must not erase pending body cleanup');
 assert.equal(reader.isIdle(),true);assert.equal(released,true);assert.equal(calls,1);assert.equal(historical,0);
});

test('binding service sees fixed-provider transport after revoked refresh has returned',async t=>{
 const gate=deferred();let calls=0;
 const provider=createSessionProvider({now:()=>now,fetch:()=>{calls++;return gate.promise;}});
 const repository=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'fixed-provider-idle'});
 const service=createHostBindingService({extensionId:'ext',repository,provider,profile:{id:'fixture',singlePersonalDefault:true},now:()=>now,allowedURL:u=>u===frame.actualURL,getFrame:async()=>({documentId:frame.documentId,url:frame.actualURL,documentLifecycle:'active',parentFrameId:-1})});
 t.after(()=>{service.stop();repository.close();});
 const sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:frame.documentId,documentLifecycle:'active',url:frame.actualURL};
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);
 const {documentToken,producerToken,routeEpoch}=hello.binding;
 const pending=service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken,producerToken,routeEpoch},sender);
 await flush();assert.equal(calls,1);service.invalidate({tabId:1});
 assert.notEqual((await pending).state,'verified');await flush();
 const prematurelyIdle=service.isIdle();
 gate.reject(Error('fixture late transport failure'));await flush();
 assert.equal(prematurelyIdle,false);assert.equal(service.isIdle(),true);
 assert.equal(service.authority.scopeFor(frame),null);assert.equal(calls,1);
});

for(const end of ['abort','deadline'])test(`${end} identity drains a late response body before becoming idle`,async()=>{
 const fetchGate=deferred(),cancelGate=deferred(),timers=new Map();let calls=0,cancels=0,elapsed=0;
 const provider=createSessionProvider({now:()=>now,elapsedNow:()=>elapsed,fetch:()=>{calls++;return fetchGate.promise;}});
 const authority=createScopeAuthority({provider,profile:{id:'fixture',singlePersonalDefault:true},now:()=>now,elapsedNow:()=>elapsed,schedule:fn=>{const key=Symbol();timers.set(key,fn);return key;},cancel:key=>timers.delete(key)});
 const pending=authority.refresh(frame,'bind');await flush();assert.equal(calls,1);
 if(end==='abort')authority.invalidateAll();else{elapsed=6000;for(const fn of timers.values())fn();}
 assert.equal((await pending).state,'unverified');assert.equal(authority.isIdle(),false);
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('unread fixture bytes'));},cancel(){cancels++;return cancelGate.promise;}});
 fetchGate.resolve(new Response(body));await flush();
 const beforeCleanup={cancels,idle:authority.isIdle()};
 if(end==='abort')cancelGate.resolve();else cancelGate.reject(Error('fixture cleanup failure'));await flush();
 assert.deepEqual(beforeCleanup,{cancels:1,idle:false},'late response must enter tracked cleanup');
 assert.equal(authority.isIdle(),true);assert.equal(calls,1);assert.equal(authority.scopeFor(frame),null);
});
