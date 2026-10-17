import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(t,options={}){
 const waits=new Map();let id=0,providerWait=null,time=0;const timers=new Map();
 const repository=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'idle-entry'});
 const service=createHostBindingService({...options,extensionId:'ext',repository,allowedURL:u=>u==='https://chatgpt.com/',getFrame:async({tabId})=>{if(waits.has(tabId))await waits.get(tabId);return {documentId:'doc'+tabId,url:'https://chatgpt.com/',documentLifecycle:'active',parentFrameId:-1};},provider:{read:async()=>{if(providerWait)await providerWait;return {principalId:'self',expiresAt:new Date(100000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'test',transport:'worker-fixed-fetch'};}},profile:{id:'test',singlePersonalDefault:true},now:()=>1000,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=Symbol();timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),makeId:()=> 'id_'+(++id)});
 const sender=tabId=>({id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'doc'+tabId,documentLifecycle:'active',url:'https://chatgpt.com/'});
 const hello=tabId=>service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender(tabId));
 t.after(()=>{service.stop();repository.close();});return {service,waits,hello,sender,holdProvider:p=>providerWait=p,async advance(ms){time+=ms;for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await drain();}};
}
test('service idle tracks every overlapping HELLO from entry until settlement',async t=>{
 const f=fixture(t),a=deferred(),b=deferred();assert.equal(f.service.isIdle(),true);f.waits.set(1,a.promise);f.waits.set(2,b.promise);
 const one=f.hello(1),two=f.hello(2);assert.equal(f.service.isIdle(),false);await drain();a.resolve();assert.equal((await one).ok,true);assert.equal(f.service.isIdle(),false);
 b.resolve();assert.equal((await two).ok,true);assert.equal(f.service.isIdle(),true);
});
test('service idle covers scope provider refresh and never starts its own request',async t=>{
 const f=fixture(t),hello=await f.hello(1),gate=deferred();f.holdProvider(gate.promise);
 const binding=hello.binding,refresh=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch},f.sender(1));
 for(let i=0;i<5;i++){await drain();assert.equal(f.service.isIdle(),false);}gate.resolve();assert.equal((await refresh).state,'verified');assert.equal(f.service.isIdle(),true);
});
test('failed browser check and private metadata rejection release activity counters',async t=>{
 const f=fixture(t),gate=deferred();f.waits.set(1,gate.promise);const work=f.hello(1);assert.equal(f.service.isIdle(),false);gate.reject(Error('browser-unavailable'));assert.equal((await work).ok,false);assert.equal(f.service.isIdle(),true);
 const metadata=f.service.readCurrentMetadata('unavailable');assert.equal(f.service.isIdle(),false);await assert.rejects(metadata,/current-metadata-unavailable/);assert.equal(f.service.isIdle(),true);
});
test('service stop never appears idle when maps or requests subsequently settle',async t=>{
 const f=fixture(t),gate=deferred();f.waits.set(1,gate.promise);const work=f.hello(1);await drain();f.service.stop();assert.equal(f.service.isIdle(),false);gate.resolve();await work;assert.equal(f.service.isIdle(),false);
});

for(const outcome of ['resolve','reject'])test('expired refresh retains browser work until late '+outcome,async t=>{
 const f=fixture(t),hello=await f.hello(1),gate=deferred();f.waits.set(1,gate.promise);
 const refresh=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken:hello.binding.documentToken,producerToken:hello.binding.producerToken,routeEpoch:hello.binding.routeEpoch},f.sender(1));
 // Exact wire shape excludes HELLO-only fields.
 await drain();await f.advance(6000);await refresh;assert.equal(f.service.isIdle(),false);
 gate[outcome](outcome==='reject'?Error('late-browser'):undefined);await drain();assert.equal(f.service.isIdle(),true);
});

for(const outcome of ['resolve','reject'])test('scope provider remains nonidle after refresh deadline until '+outcome,async t=>{
 const f=fixture(t),hello=await f.hello(1),gate=deferred();f.holdProvider(gate.promise);
 const refresh=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken:hello.binding.documentToken,producerToken:hello.binding.producerToken,routeEpoch:hello.binding.routeEpoch},f.sender(1));
 await drain();await f.advance(6000);await refresh;assert.equal(f.service.isIdle(),false);
 gate[outcome](outcome==='reject'?Error('late-provider'):undefined);await drain();assert.equal(f.service.isIdle(),true);
});
for(const outcome of ['resolve','reject'])test('continuation selection remains nonidle after bounded drain until '+outcome,async t=>{
 const profile={id:'offline',revision:1,urlPolicy:createURLPolicy()},f=fixture(t,{surfaceProfiles:new Map([[profile.id,profile]]),freeEvidenceRepository:{version:async()=>0,applyContinuation:async()=>({ok:true})}}),hello=await f.hello(1),gate=deferred();let entered=false;
 f.service.nativeRepository.listContinuations=()=>{entered=true;return gate.promise;};
 const refresh=f.service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken:hello.binding.documentToken,producerToken:hello.binding.producerToken,routeEpoch:hello.binding.routeEpoch},f.sender(1));
 for(let i=0;i<10&&!entered;i++)await drain();assert.equal(entered,true);await f.advance(1000);assert.equal((await refresh).state,'verified');assert.equal(f.service.isIdle(),false);
 gate[outcome](outcome==='reject'?Error('late-selection'):[]);await drain();assert.equal(f.service.isIdle(),true);
});
