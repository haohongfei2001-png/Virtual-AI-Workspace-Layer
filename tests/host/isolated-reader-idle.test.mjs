import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedSessionReader} from '../../src/host/isolated-session-reader.mjs';

const origin='https://chatgpt.com',time=Date.parse('2026-10-14T00:00:00Z');
const session=()=>({user:{id:'user_7'},expires:'2026-10-14T01:00:00Z',accessToken:'OFFLINE_TOKEN'});
const accounts=()=>({accounts:{P:{account:{account_id:'P',structure:'personal'}}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function response(url,body){const value=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(value,'url',{value:url});return value;}
function fixture(fetch){return createIsolatedSessionReader({origin,now:()=>time,elapsedNow:()=>0,fetch});}
const goodResponse=url=>response(url,url.endsWith('/api/auth/session')?session():accounts());

test('successful identity reads expose frozen readiness and permanently revoke an earlier token',async()=>{
 let calls=0;const reader=fixture(async url=>{calls++;return goodResponse(url);});
 const initial=reader.prepareIdle();assert.ok(initial);assert.equal(Object.isFrozen(initial),true);assert.equal(initial.isCurrent(),true);
 const pending=reader.read();assert.equal(initial.isCurrent(),false);assert.equal(reader.prepareIdle(),null);
 assert.equal((await pending).principalId,'user_7');await settle();
 const completed=reader.prepareIdle();assert.ok(completed);assert.equal(completed.isCurrent(),true);assert.equal(initial.isCurrent(),false);
 const again=reader.read();assert.equal(completed.isCurrent(),false);await again;await settle();assert.ok(reader.prepareIdle());assert.equal(completed.isCurrent(),false);assert.equal(calls,4);
});

for(const mode of ['abort','deadline'])test(mode+' returns before hanging fetch settles but cannot report idle',async()=>{
 const hold=deferred(),controller=new AbortController(),calls=[];
 const reader=fixture((url,options)=>{calls.push({url,options});return hold.promise;});
 const token=reader.prepareIdle();assert.ok(token);
 const pending=reader.read({signal:controller.signal,timeoutMs:20});
 if(mode==='abort')controller.abort();
 await assert.rejects(pending,{message:mode==='abort'?'session-aborted':'request-timeout'});
 assert.equal(reader.prepareIdle(),null);assert.equal(token.isCurrent(),false);assert.equal(calls.length,1);assert.equal(calls[0].options.signal.aborted,true);
 hold.resolve(response(calls[0].url,session()));await settle();
 assert.ok(reader.prepareIdle());assert.equal(token.isCurrent(),false);assert.equal(calls.length,1);
});

test('aborted body read and its pending cancellation both prevent idle after public read returns',async()=>{
 const chunk=deferred(),cancel=deferred(),controller=new AbortController();let reads=0,cancels=0,released=0,fetches=0;
 const reader=fixture(async url=>{fetches++;return {status:200,redirected:false,url,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read(){reads++;return chunk.promise;},cancel(){cancels++;return cancel.promise;},releaseLock(){released++;}})}};});
 const token=reader.prepareIdle();assert.ok(token);const pending=reader.read({signal:controller.signal});await settle();assert.equal(reads,1);controller.abort();await assert.rejects(pending,{message:'session-aborted'});
 assert.equal(reader.prepareIdle(),null);assert.equal(cancels,0);
 chunk.resolve({done:true});await settle();assert.equal(cancels,1);assert.equal(released,0);assert.equal(reader.prepareIdle(),null);
 cancel.resolve();await settle();assert.equal(released,1);assert.ok(reader.prepareIdle());assert.equal(token.isCurrent(),false);assert.equal(fetches,1);
});

test('successful body decoding waits for cancellation settlement before accounts or idle',async()=>{
 const cancel=deferred();let reads=0,released=0,fetches=0;
 const reader=fixture(async url=>{fetches++;if(fetches>1)return goodResponse(url);return {status:200,redirected:false,url,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({async read(){return ++reads===1?{done:false,value:new TextEncoder().encode(JSON.stringify(session()))}:{done:true};},cancel:()=>cancel.promise,releaseLock(){released++;}})}};});
 const pending=reader.read();await settle();assert.equal(reads,2);assert.equal(fetches,1);assert.equal(released,0);assert.equal(reader.prepareIdle(),null);
 cancel.resolve();assert.equal((await pending).principalId,'user_7');await settle();assert.equal(released,1);assert.equal(fetches,2);assert.ok(reader.prepareIdle());
});

test('a fresh successful read cannot clear an older aborted transport still in flight',async()=>{
 const hold=deferred(),controller=new AbortController();let fetches=0,firstURL;
 const reader=fixture(url=>{if(++fetches===1){firstURL=url;return hold.promise;}return Promise.resolve(goodResponse(url));});
 const initial=reader.prepareIdle();assert.ok(initial);const first=reader.read({signal:controller.signal});controller.abort();await assert.rejects(first,{message:'session-aborted'});
 assert.equal((await reader.read()).principalId,'user_7');await settle();assert.equal(fetches,3);assert.equal(reader.prepareIdle(),null);
 hold.resolve(response(firstURL,session()));await settle();assert.ok(reader.prepareIdle());assert.equal(initial.isCurrent(),false);assert.equal(fetches,3);
});
