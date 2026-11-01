import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,deferred,flush,C2_PROFILE} from './fixture.mjs';

async function readyB(t,options){const f=createFixture(t,options);assert.equal((await f.run()).state,'ambiguous');await f.native();return f;}

test('independent: a late shorter subscriber deadline detaches only that subscriber',async t=>{
 const f=await readyB(t),read=deferred();f.identity.reader=()=>read.promise;
 const first=f.run();await flush();await f.clock.advance(100);
 const second=f.run({remainingMs:()=>50});await flush();await f.clock.advance(50);
 assert.notEqual((await second).state,'verified');assert.equal(f.identity.signals[0].aborted,false);
 read.resolve(f.makeIdentity());assert.equal((await first).state,'verified');assert.equal(f.identity.calls,1);assert.equal(f.clock.timers,0);
});

test('independent: joining later with more time never extends the original flight deadline',async t=>{
 const f=await readyB(t),read=deferred();f.identity.reader=()=>read.promise;
 const first=f.run({remainingMs:()=>150});await flush();await f.clock.advance(100);
 const second=f.run({remainingMs:()=>6000});await flush();await f.clock.advance(50);
 assert.notEqual((await first).state,'verified');assert.notEqual((await second).state,'verified');assert.equal(f.identity.signals[0].aborted,true);
 read.resolve(f.makeIdentity());await flush();assert.equal(f.authority.scopeFor(f.frame()),null);assert.equal(f.identity.calls,1);assert.equal(f.clock.timers,0);
});

test('independent: the 129th subscriber cannot cancel the first 128 accepted subscribers',async t=>{
 const f=await readyB(t),read=deferred();f.identity.reader=()=>read.promise;
 const requests=Array.from({length:128},()=>f.run());await flush();const overflow=await f.run();
 assert.equal(overflow.reason,'context-recovery-capacity');assert.equal(f.identity.signals[0].aborted,false);assert.equal(f.identity.calls,1);
 read.resolve(f.makeIdentity());const results=await Promise.all(requests);assert(results.every(result=>result.state==='verified'));
 assert(results.every(result=>result.grant===results[0].grant));assert.equal(f.clock.timers,0);
});

test('independent: invalidation preserves consumed receipt until fresh native evidence',async t=>{
 const f=await readyB(t),read=deferred();f.identity.reader=()=>read.promise;
 const request=f.run();await flush();f.invalidate();assert.notEqual((await request).state,'verified');
 read.resolve(f.makeIdentity());await flush();f.identity.reader=null;
 for(let i=0;i<3;i++)assert.equal((await f.run()).reason,'context-recovery-new-evidence-required');
 assert.equal(f.identity.calls,1);await f.clock.advance(1);await f.native();assert.equal((await f.run()).state,'verified');assert.equal(f.identity.calls,2);
});

for(const changed of ['id','browserRequestContext','singlePersonalDefault'])test('independent: changed packaged '+changed+' rejects and cleans an in-flight B grant',async t=>{
 const profile={...C2_PROFILE},f=await readyB(t,{profile}),read=deferred();f.identity.reader=()=>read.promise;
 const request=f.run();await flush();profile[changed]=changed==='id'?'other-profile':!profile[changed];read.resolve(f.makeIdentity());
 assert.notEqual((await request).state,'verified');assert.equal(f.authority.scopeFor(f.frame()),null);assert.equal((await f.run()).reason,'context-profile-changed');assert.equal(f.identity.calls,1);
});

test('independent: external pending which starts immediately before authorize is neither claimed nor revoked',async t=>{
 const f=await readyB(t),body=deferred(),read=deferred();let q;
 f.associationReader=query=>{q=query;return body.promise;};
 const policy=f.run();await flush();f.identity.reader=()=>read.promise;
 const external=f.authority.refresh(f.frame(),'auth-change');await flush();
 body.resolve({challenge:q.challenge,actualURL:q.actualURL,conversationId:q.conversationId,association:'explicit-body-id'});
 assert.equal((await policy).state,'pending');f.recovery.invalidate({tabId:1,documentId:f.frame().documentId});
 assert.equal(f.identity.signals[0].aborted,false);f.associationReader=null;read.resolve(f.makeIdentity());
 const granted=await external;assert.equal(granted.state,'verified');assert.equal(f.authority.peek(f.frame()).grant,granted.grant);assert.equal(f.identity.calls,1);
});
