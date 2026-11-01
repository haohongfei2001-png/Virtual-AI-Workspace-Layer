import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
const frame={tabId:1,frameId:0,documentId:'doc',actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
const identity=()=>({principalId:'self',expiresAt:new Date(1000000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'test',transport:'worker-fixed-fetch'});
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(context=false){let now=1000,id=0,read=async()=>identity(),verify=async()=>receipt;const timers=new Map(),receipt={id:'receipt',contextId:'personal',wall:1000,selectionEpoch:1};
 const auth=createScopeAuthority({provider:{read:()=>read()},profile:{id:'test',singlePersonalDefault:!context,browserRequestContext:context},contextObserver:{verify:()=>verify(),isCurrent:()=>true},now:()=>now,elapsedNow:()=>now,makeId:()=>`id_${++id}`,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:now+ms});return key;},cancel:key=>timers.delete(key)});
 return {auth,receipt,read:f=>read=f,verify:f=>verify=f,async deadline(){now+=6000;for(const [key,t]of [...timers])if(t.at<=now){timers.delete(key);t.fn();}await flush();}};
}
for(const method of ['refresh','revalidate'])for(const stage of ['identity','context'])for(const end of ['deadline','invalidate'])for(const outcome of ['resolve','reject'])test(`${method} ${stage} remains nonidle after ${end} until late ${outcome}`,async()=>{
 const f=fixture(stage==='context');if(method==='revalidate')assert.equal((await f.auth.refresh(frame,'bind')).state,'verified');
 const gate=deferred();if(stage==='identity')f.read(()=>gate.promise);else f.verify(()=>gate.promise);
 const task=method==='refresh'?f.auth.refresh(frame,'bind'):f.auth.revalidate(frame,null,{force:true});assert.equal(f.auth.isIdle(),false);await flush();
 if(end==='deadline')await f.deadline();else f.auth.invalidateAll();
 assert.equal((await task).state,'unverified');assert.equal(f.auth.isIdle(),false);
 if(outcome==='resolve')gate.resolve(stage==='identity'?identity():f.receipt);else gate.reject(Error('late'));
 await flush();assert.equal(f.auth.isIdle(),true);assert.equal(f.auth.peek(frame).state,'unverified');
});
test('scope idle accounts for queued work before its first microtask and remains network free',async()=>{const f=fixture(),gate=deferred();let calls=0;f.read(()=>{calls++;return gate.promise;});const task=f.auth.refresh(frame,'bind');f.auth.invalidateAll();for(let i=0;i<20;i++)assert.equal(f.auth.isIdle(),false);assert.equal(calls,0);await flush();assert.equal((await task).state,'unverified');assert.equal(f.auth.isIdle(),false);gate.resolve(identity());await flush();assert.equal(f.auth.isIdle(),true);assert.equal(calls,1);});
