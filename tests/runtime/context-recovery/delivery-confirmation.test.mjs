import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture,deferred,flush} from './fixture.mjs';

async function pendingDelivery(t){
 const f=createFixture(t);assert.equal((await f.run()).state,'ambiguous');await f.native();
 const frame=f.frame(),owner=f.documents.get(1).attemptOwner,started=f.clock.elapsedNow();
 const options={attemptOwner:owner,isCurrent:()=>true,remainingMs:()=>6000-(f.clock.elapsedNow()-started),authorize:({signal})=>f.authority.refresh(frame,'auth-change',signal)};
 const result=await f.recovery.run(frame,options);assert.equal(result.state,'verified');assert.equal(f.recovery.ownsDelivery(frame,owner),true);return {f,frame,owner,options,result};
}

test('unconfirmed delivery only accepts exact private producer, grant and document capability',async t=>{
 const {f,frame,owner,result}=await pendingDelivery(t);
 for(const wrongOwner of [{},structuredClone(owner),null])assert.equal(f.recovery.confirmDelivery(frame,wrongOwner,result.grant),false);
 assert.equal(f.recovery.confirmDelivery(frame,owner,structuredClone(result.grant)),false);
 for(const patch of [{tabId:2},{documentId:'wrong_document'},{frameId:1},{incognito:true},{actualURL:frame.actualURL+'?spoof'}])assert.equal(f.recovery.confirmDelivery({...frame,...patch},owner,result.grant),false);
 assert.equal(f.recovery.ownsDelivery(frame,owner),true);
 assert.equal(f.recovery.confirmDelivery(frame,owner,result.grant),true);assert.equal(f.recovery.ownsDelivery(frame,owner),false);assert.equal(f.recovery.confirmDelivery(frame,owner,result.grant),false);
});

test('pending delivery can be joined without a second identity read and join cancellation does not revoke original grant',async t=>{
 const {f,frame,owner,options,result}=await pendingDelivery(t);
 const abort=new AbortController();const joined=f.recovery.run(frame,{...options,signal:abort.signal});abort.abort();
 assert.notEqual((await joined).state,'verified');assert.equal(f.authority.peek(frame).grant,result.grant);assert.equal(f.recovery.ownsDelivery(frame,owner),true);assert.equal(f.identity.calls,1);
 const next=await f.recovery.run(frame,options);assert.equal(next.grant,result.grant);assert.equal(f.identity.calls,1);
 assert.equal(f.recovery.confirmDelivery(frame,owner,next.grant),true);
});

for(const invalidate of ['policy invalidation','authority revocation','receipt expiry','stop'])test('pending delivery cannot be confirmed after '+invalidate,async t=>{
 const {f,frame,owner,result}=await pendingDelivery(t);
 if(invalidate==='policy invalidation')f.invalidate();
 else if(invalidate==='authority revocation')f.authority.invalidate(frame.documentId);
 else if(invalidate==='receipt expiry')await f.clock.advance(60000);
 else f.stop();
 assert.equal(f.recovery.ownsDelivery(frame,owner),false);assert.equal(f.recovery.confirmDelivery(frame,owner,result.grant),false);assert.equal(f.authority.scopeFor(frame),null);
});

test('the pending-delivery fast path rejects a caller becoming stale before its next microtask',async t=>{
 const {f,frame,owner,options,result}=await pendingDelivery(t);let current=true;
 const joined=f.recovery.run(frame,{...options,isCurrent:()=>current});current=false;
 assert.notEqual((await joined).state,'verified');assert.equal(f.authority.peek(frame).grant,result.grant);assert.equal(f.identity.calls,1);
 assert.equal(f.recovery.confirmDelivery(frame,owner,result.grant),true);
});

test('the pending-delivery fast path rejects expiry between dispatch and delivery',async t=>{
 const {f,frame,options}=await pendingDelivery(t);
 const joined=f.recovery.run(frame,options);f.clock.setWall(f.clock.now()+60000);f.clock.setElapsed(f.clock.elapsedNow()+60000);
 assert.notEqual((await joined).state,'verified');assert.equal(f.authority.scopeFor(frame),null);assert.equal(f.identity.calls,1);
});
