/** L-only deterministic integration. Real observer/authority/strategy execute;
 * synthetic Chrome/request/identity/body edges are never LIVE or G evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFixture,deferred,flush,ORIGIN,CONVERSATION,OTHER_CONVERSATION,PERSONAL,TEAM} from './fixture.mjs';

const contextKey=(principal,context)=>'context_'+createHash('sha256').update(JSON.stringify(['chatgpt-context-v1',principal,context])).digest('hex');
const notVerified=result=>assert.notEqual(result?.state,'verified',JSON.stringify(result));
const noScope=(f,frame=f.frame())=>assert.equal(f.authority.scopeFor(frame),null);
function verified(f,result,context=TEAM,frame=f.frame()){
 assert.equal(result?.state,'verified',JSON.stringify(result));
 assert.equal(result.grant,f.authority.peek(frame).grant,'only the actual current authority grant may be returned');
 assert.equal(result.grant.context.contextKey,contextKey(f.identity.principalId,context),'independent SHA-256 oracle for selected synthetic context');
 assert(f.authority.sourceFor(frame));assert(Date.parse(result.grant.expiresAt)>f.clock.now());
 return result.grant;
}

test('new worker without context evidence stays closed and repeated runs perform zero identity reads',async t=>{
 const f=createFixture(t);
 for(let i=0;i<30;i++)notVerified(await f.run());
 assert.equal(f.authorizeCalls,0);assert.equal(f.identity.calls,0);noScope(f);
 assert.equal(f.recovery.isIdle(),true);
 await f.clock.advance(120000);
 assert.equal(f.authorizeCalls,0,'elapsed time does not retry missing evidence');
 assert.equal(f.identity.calls,0);assert.equal(f.clock.timers,0);
});

test('a single personal roster alone does not enable C3 in a C2-only profile',async t=>{
 const f=createFixture(t);f.identity.contexts=[{id:PERSONAL,kind:'personal'}];
 notVerified(await f.run());assert.equal(f.identity.calls,0);noScope(f);
});

test('new actual observer receipt recovers B with the actual grant then retires B for ordinary A refresh',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();
 const receipt=await f.verify();assert(receipt);
 const grant=verified(f,await f.run());
 assert.equal(grant.context.requestReceiptId,receipt.id);assert.equal(grant.context.selectionEpoch,receipt.selectionEpoch);
 assert.equal(f.authorizeCalls,1);assert.equal(f.identity.calls,1);
 const ordinary=verified(f,await f.run());
 assert.notEqual(ordinary,grant);
 assert.equal(f.authorizeCalls,2,'successful B must not suppress the existing ordinary authority path');
 assert.equal(f.identity.calls,2);assert.equal(f.recovery.isIdle(),true);
 assert.equal(f.clock.timers,0);
});

test('observer receipt arriving before the first recovery run remains usable without replaying notifications',async t=>{
 const f=createFixture(t);await f.native();assert(f.signals.some(row=>row.kind==='ready'));
 verified(f,await f.run());assert.equal(f.authorizeCalls,1);
});

test('failed authentication consumes one receipt and cannot loop until another real native request',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();f.identity.reader=async()=>{throw Error('session-transport-failed');};
 notVerified(await f.run());assert.equal(f.authorizeCalls,1);assert.equal(f.identity.calls,1);noScope(f);
 f.identity.reader=null;
 for(let i=0;i<20;i++)notVerified(await f.run());
 await f.clock.advance(1000);
 notVerified(await f.run());assert.equal(f.authorizeCalls,1);assert.equal(f.identity.calls,1);
 await f.native();verified(f,await f.run());
 assert.equal(f.authorizeCalls,2);assert.equal(f.identity.calls,2);
});

test('fresh request context outside the authenticated roster remains ambiguous and consumes no retries',async t=>{
 const f=createFixture(t);notVerified(await f.run());f.identity.contexts=[{id:PERSONAL,kind:'personal'}];await f.native({contextId:TEAM});
 notVerified(await f.run());noScope(f);assert.equal(f.identity.calls,1);
 for(let i=0;i<10;i++)notVerified(await f.run());
 assert.equal(f.identity.calls,1);
});

test('body association mismatch cannot use URL, title or request header as sufficient context evidence',async t=>{
 const f=createFixture(t);await f.native();f.documents.get(1).bodyId=OTHER_CONVERSATION;
 notVerified(await f.run());noScope(f);assert.equal(f.authorizeCalls,0);assert.equal(f.identity.calls,0);
});

for(const variant of ['extension-get','prefetch','cache','http-error','wrong-method','wrong-object','missing-header'])test(variant+' cannot manufacture a no-receipt recovery signal',async t=>{
 const f=createFixture(t);
 const patch=variant==='extension-get'?{initiator:'chrome-extension://synthetic-extension'}:
  variant==='prefetch'?{requestHeaders:[{name:'ChatGPT-Account-ID',value:TEAM},{name:'Sec-Purpose',value:'prefetch'}]}:
  variant==='wrong-method'?{method:'POST'}:
  variant==='wrong-object'?{conversationId:OTHER_CONVERSATION}:
  variant==='missing-header'?{requestHeaders:[]}:{};
 await f.native(patch,variant==='cache'?{fromCache:true}:variant==='http-error'?{statusCode:503}:{});
 assert.equal(await f.verify(),null);notVerified(await f.run());
 assert.equal(f.authorizeCalls,0);assert.equal(f.identity.calls,0);noScope(f);
 assert.equal(f.signals.some(row=>row.kind==='ready'),false);
});

test('page memory cache with no native request leaves an indistinguishable P/O selection blocked',async t=>{
 const f=createFixture(t),url=f.frame().actualURL;
 for(const context of [PERSONAL,TEAM,PERSONAL]){
  f.documents.get(1).contextId=context;
  assert.equal(f.frame().actualURL,url);notVerified(await f.run());
 }
 assert.equal(f.identity.calls,0);assert.equal(f.signals.length,0);noScope(f);
});

test('old receipt and serialized clone cannot be imported into a replacement observer',async t=>{
 const f=createFixture(t);await f.native();const receipt=await f.verify(),clone=structuredClone(receipt),oldFrame=f.frame();
 verified(f,await f.run());const oldGrant=f.authority.peek(oldFrame).grant;
 const old=f.restart();
 assert.equal(old.contextObserver.isCurrent(oldFrame,receipt),false);
 assert.equal(f.observer.isCurrent(oldFrame,receipt),false);assert.equal(f.observer.isCurrent(oldFrame,clone),false);
 assert.equal(await f.verify(),null);const reads=f.identity.calls;
 notVerified(await f.run());assert.equal(f.identity.calls,reads);noScope(f);
 await f.clock.advance(1);await f.native();const next=verified(f,await f.run());
 assert.notEqual(next.id,oldGrant.id);assert.notEqual(next.context.requestReceiptId,receipt.id);
});

test('continuous worker replacement never resumes a previous receipt or renews its lifetime',async t=>{
 const f=createFixture(t);let previous=null;
 for(let i=0;i<6;i++){
  if(i){f.restart();notVerified(await f.run());noScope(f);}
  const before=f.identity.calls;
  for(let j=0;j<4;j++)notVerified(await f.run());
  assert.equal(f.identity.calls,before);
  await f.clock.advance(1);await f.native();const grant=verified(f,await f.run());
  if(previous){assert.notEqual(grant.id,previous.id);assert.notEqual(grant.context.requestReceiptId,previous.context.requestReceiptId);}
  previous=grant;
 }
 assert.equal(f.identity.calls,6);assert.equal(f.authorizeCalls,6);
});

test('concurrent same-document recovery runs share one actual authority read and result',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred();f.identity.reader=()=>read.promise;
 const jobs=Array.from({length:40},()=>f.run());await flush();
 assert.equal(f.identity.calls,1);assert.equal(f.authorizeCalls,1);assert.equal(f.recovery.isIdle(),false);
 read.resolve(f.makeIdentity());const results=await Promise.all(jobs),grant=verified(f,results[0]);
 assert(results.every(result=>result.state==='verified'&&result.grant===grant));
 assert.equal(f.recovery.isIdle(),true);assert.equal(f.clock.timers,0);
});

test('one cancelled subscriber does not abort another subscriber sharing the same recovery',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred(),a=new AbortController(),b=new AbortController();f.identity.reader=()=>read.promise;
 const first=f.run({signal:a.signal}),second=f.run({signal:b.signal});await flush();
 assert.equal(f.identity.calls,1);a.abort();await flush();notVerified(await first);
 assert.equal(f.identity.signals.at(-1).aborted,false,'shared work belongs to the remaining subscriber');
 read.resolve(f.makeIdentity());verified(f,await second);assert.equal(f.identity.calls,1);
});

test('the last cancelled subscriber aborts shared work and consumed evidence is not refunded',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred(),a=new AbortController(),b=new AbortController();f.identity.reader=()=>read.promise;
 const first=f.run({signal:a.signal}),second=f.run({signal:b.signal});await flush();a.abort();await flush();b.abort();await flush();
 assert.equal(f.identity.signals.at(-1).aborted,true);notVerified(await first);notVerified(await second);
 read.resolve(f.makeIdentity());await flush();noScope(f);f.identity.reader=null;
 notVerified(await f.run());assert.equal(f.identity.calls,1);
});

test('a replacement producer cannot merge into an old producer flight or lose its new grant to a late reply',async t=>{
 // Evidence already exists, so this specifically proves that adding B gating
 // preserves the existing A authority path and its producer isolation.
 const f=createFixture(t);await f.native();const read=deferred();f.identity.reader=()=>read.promise;
 const first=f.run();await flush();assert.equal(f.identity.calls,1);
 f.documents.get(1).attemptOwner=Object.freeze({});f.identity.reader=null;
 const next=verified(f,await f.run());assert.equal(f.identity.calls,2);
 read.resolve(f.makeIdentity());notVerified(await first);await flush();
 assert.equal(f.authority.peek(f.frame()).grant,next);
});

test('two tabs with identical URLs and different selected contexts never share a receipt or grant',async t=>{
 const f=createFixture(t);f.addTab(2,{contextId:PERSONAL});
 for(const tabId of [1,2])notVerified(await f.run({tabId}));
 await Promise.all([f.native({tabId:1,contextId:TEAM}),f.native({tabId:2,contextId:PERSONAL})]);
 assert.equal(f.frame(1).actualURL,f.frame(2).actualURL);
 const [team,personal]=await Promise.all([f.run({tabId:1}),f.run({tabId:2})]);
 const a=verified(f,team,TEAM,f.frame(1)),b=verified(f,personal,PERSONAL,f.frame(2));
 assert.notEqual(a.scopeKey,b.scopeKey);assert.notEqual(a.id,b.id);assert.notEqual(a.context.requestReceiptId,b.context.requestReceiptId);
 const receipt=await f.verify(1);assert.equal(f.observer.isCurrent(f.frame(2),receipt),false);
 assert.equal(f.identity.calls,2);assert.equal(f.authorizeCalls,2);
});

test('same-URL selection change synchronously cancels old recovery before a delayed identity returns',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native({contextId:TEAM});const read=deferred();f.identity.reader=()=>read.promise;
 const old=f.run();await flush();assert.equal(f.identity.calls,1);const oldSignal=f.identity.signals.at(-1),url=f.frame().actualURL;
 await f.clock.advance(1);const pending=f.emitSend({contextId:PERSONAL});
 assert.equal(f.frame().actualURL,url);assert.equal(oldSignal.aborted,true,'selection revokes before asynchronous frame preparation');noScope(f);
 await flush();await f.complete(pending);f.identity.reader=null;
 const next=verified(f,await f.run(),PERSONAL);read.resolve(f.makeIdentity());notVerified(await old);await flush();
 assert.equal(f.authority.peek(f.frame()).grant,next,'late old completion cannot revoke or replace current personal grant');
 assert.equal(f.identity.calls,2);
});

test('conflicting simultaneous contexts have no safe winner and do not call identity provider',async t=>{
 const f=createFixture(t),a=await f.send({contextId:TEAM});await f.clock.advance(1);const b=await f.send({contextId:PERSONAL});
 await f.complete(a);await f.complete(b);assert.equal(await f.verify(),null);
 notVerified(await f.run());noScope(f);assert.equal(f.identity.calls,0);
 await f.clock.advance(1);await f.native({contextId:PERSONAL});verified(f,await f.run(),PERSONAL);
});

for(const variant of ['explicit-revocation','caller-abort','tab-closed','stop'])test(variant+' fences late work and cannot schedule a new recovery',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred(),controller=new AbortController();f.identity.reader=()=>read.promise;
 const frame=f.frame(),job=f.run({signal:controller.signal});await flush();assert.equal(f.identity.calls,1);
 if(variant==='explicit-revocation')f.invalidate();
 else if(variant==='caller-abort')controller.abort();
 else if(variant==='tab-closed')f.closeTab(1);
 else f.stop();
 read.resolve(f.makeIdentity());notVerified(await job);await flush();noScope(f,frame);
 await f.clock.advance(30000);assert.equal(f.identity.calls,1,'denial has no timer-driven retry');
 assert.equal(f.clock.timers,0);
});

test('changed producer fence while authorization is pending suppresses its late result',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred();f.identity.reader=()=>read.promise;let current=true;
 const job=f.run({isCurrent:()=>current});await flush();current=false;read.resolve(f.makeIdentity());
 notVerified(await job);noScope(f);assert.equal(f.identity.calls,1);
});

test('navigation while browser/body verification is awaiting cannot authorize the old route',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const body=deferred();let captured;
 f.associationReader=query=>{captured=query;return body.promise;};
 const job=f.run();await flush();assert(captured);assert.equal(f.identity.calls,0);
 f.navigate(1,OTHER_CONVERSATION);
 body.resolve({challenge:captured.challenge,actualURL:captured.actualURL,conversationId:CONVERSATION,association:'explicit-body-id'});
 notVerified(await job);assert.equal(f.identity.calls,0);noScope(f);
});

test('a cached scope grant is not reusable after the underlying 60-second context receipt expires',async t=>{
 const f=createFixture(t);await f.native();const receipt=await f.verify();verified(f,await f.run());
 await f.clock.advance(60000);assert.equal(f.observer.isCurrent(f.frame(),receipt),false);
 notVerified(await f.run());noScope(f);assert.equal(f.identity.calls,1,'expired receipt does not trigger reauthentication');
 await f.native();verified(f,await f.run());assert.equal(f.identity.calls,2);
});

test('a pending native GET completing at its original 6-second boundary provides no receipt',async t=>{
 const f=createFixture(t),request=await f.send();await f.clock.advance(6000);await f.complete(request);
 assert.equal(await f.verify(),null);notVerified(await f.run());assert.equal(f.identity.calls,0);
});

test('recovery shares the caller remaining budget and refuses a provider reply at the deadline',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred();f.identity.reader=()=>read.promise;
 const started=f.clock.elapsedNow(),job=f.run({remainingMs:()=>1700-(f.clock.elapsedNow()-started)});
 let settled=false;job.then(()=>{settled=true;});await flush();assert.equal(f.identity.calls,1);
 await f.clock.advance(1700);assert.equal(settled,true,'caller deadline must settle without waiting for provider');
 notVerified(await job);assert.equal(f.identity.signals.at(-1).aborted,true);noScope(f);
 read.resolve(f.makeIdentity());await flush();noScope(f);
 for(let i=0;i<8;i++)notVerified(await f.run());assert.equal(f.identity.calls,1,'deadline does not refund this receipt attempt');
});

for(const value of [0,-1,Number.NaN,Number.POSITIVE_INFINITY])test('invalid or exhausted remaining budget '+value+' cannot start authorization',async t=>{
 const f=createFixture(t);await f.native();let result;
 try{result=await f.run({remainingMs:()=>value});}catch{result=null;}
 notVerified(result);assert.equal(f.identity.calls,0);noScope(f);
});

for(const clock of ['wall','elapsed'])test(clock+' rollback during receipt verification cannot publish a grant',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const body=deferred();let captured;
 f.associationReader=query=>{captured=query;return body.promise;};const job=f.run();await flush();assert(captured);
 if(clock==='wall')f.clock.setWall(f.clock.now()-1);else f.clock.setElapsed(f.clock.elapsedNow()-1);
 body.resolve({challenge:captured.challenge,actualURL:captured.actualURL,conversationId:CONVERSATION,association:'explicit-body-id'});
 notVerified(await job);assert.equal(f.identity.calls,0);noScope(f);
});

test('a structural grant copy from an authorize callback is not the current authority grant',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const result=await f.run({authorize:async({signal})=>{
  const actual=await f.authority.refresh(f.frame(),'auth-change',signal);
  assert.equal(actual.state,'verified');return {state:'verified',grant:structuredClone(actual.grant)};
 }});
 notVerified(result);
});

test('explicitly proven C3 profile can recover from fresh identity without C2 traffic',async t=>{
 const f=createFixture(t,{profile:Object.freeze({id:'synthetic-proven-personal-c3',singlePersonalDefault:true,browserRequestContext:false})});
 f.identity.contexts=[{id:PERSONAL,kind:'personal'}];
 const grant=verified(f,await f.run(),PERSONAL);
 assert.equal(grant.context.kind,'single-personal-context');assert.equal(f.identity.calls,1);assert.equal(f.signals.length,0);
});

test('unproven production profile cannot be silently upgraded to C1 or C3',async t=>{
 const f=createFixture(t,{profile:Object.freeze({id:'chatgpt-context-unverified',singlePersonalDefault:false})});
 f.identity.contexts=[{id:PERSONAL,kind:'personal'}];
 notVerified(await f.run());noScope(f);
});

test('inspection reports state without exposing scope or evidence capability objects',async t=>{
 const f=createFixture(t);notVerified(await f.run());
 for(const phase of ['waiting','verified']){
  if(phase==='verified'){await f.native();verified(f,await f.run());}
  const snapshot=f.recovery.inspect(f.frame()),json=JSON.stringify(snapshot);
  assert(snapshot&&typeof snapshot==='object');
  for(const field of ['requestReceiptId','contextKey','principalKey','scopeKey','authorizedContextReceiptId'])assert(!json.includes(field),field);
  assert(!json.includes(TEAM));assert(!json.includes(f.identity.principalId));
 }
});

test('trusted replacement documents retire obsolete slots without exhausting a long-lived tab',async t=>{
 const f=createFixture(t,{maxDocuments:2});f.addTab(2);
 for(const tabId of [1,2])notVerified(await f.run({tabId}));
 for(let i=0;i<7;i++){
  const oldFrame=f.frame();f.navigate(1,CONVERSATION,{documentId:'replacement_document_'+i});
  notVerified(await f.run());
  assert.equal(f.recovery.inspect(oldFrame).state,'IDLE','old document slot is retired after verified replacement');
  await f.clock.advance(1);await f.native();verified(f,await f.run());
 }
 assert.equal(f.identity.calls,7);
});

for(const variant of ['authority-revoked','grant-expired','receipt-expired','last-subscriber-aborted','producer-no-longer-current'])test('authority-return to subscriber-delivery microtask gap rechecks '+variant,async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();
 if(variant==='receipt-expired')await f.clock.advance(59995);
 if(variant==='grant-expired')f.identity.expiresAt=new Date(f.clock.now()+5).toISOString();
 const controller=new AbortController();let current=true,mutated=false,checks=0;
 f.onAuthorityPeek=({result,authority})=>{
  if(result.state!=='verified'||mutated)return;
  checks++;mutated=true;
  // This fires after the strategy's first actual verified-authority read,
  // before its promise chain reaches final subscriber delivery. It does not
  // invent a receipt/result, replace the real authority, or alter production.
  queueMicrotask(()=>{
   if(variant==='authority-revoked')authority.invalidate(f.frame().documentId);
   else if(variant==='last-subscriber-aborted')controller.abort();
   else if(variant==='producer-no-longer-current')current=false;
   else {f.clock.setWall(f.clock.now()+5);f.clock.setElapsed(f.clock.elapsedNow()+5);}
  });
 };
 const result=await f.run({signal:controller.signal,isCurrent:()=>current});
 assert.equal(checks,1,'targeted first successful authority check was reached');notVerified(result);noScope(f);
 assert.equal(f.identity.calls,1);f.onAuthorityPeek=null;f.identity.expiresAt=null;current=true;
 for(let i=0;i<5;i++)notVerified(await f.run());
 assert.equal(f.identity.calls,1,'a grant never delivered successfully must not retire B or refund its receipt');
});

test('an external pending authority remains owned by its original operation after recovery subscriber cancellation',async t=>{
 const f=createFixture(t);await f.native();const read=deferred(),cancelled=new AbortController();f.identity.reader=()=>read.promise;
 const external=f.authority.refresh(f.frame(),'bind');await flush();
 assert.equal(f.identity.calls,1);assert.equal(f.authority.peek(f.frame()).state,'pending');
 const originalSignal=f.identity.signals[0],associations=f.associations.length;let authorizeCalls=0;
 const gate=f.run({signal:cancelled.signal,authorize:({signal})=>{
  authorizeCalls++;return f.authority.refresh(f.frame(),'focus',signal);
 }});
 await flush();cancelled.abort();await flush();
 assert.equal(authorizeCalls,0,'a pending external owner must not be joined through the authorization callback');
 assert.equal(f.associations.length,associations,'no competing body association is opened');
 assert.equal(originalSignal.aborted,false);
 read.resolve(f.makeIdentity());const granted=await external,gateResult=await gate;await flush();
 assert.equal(granted.state,'verified');notVerified(gateResult);
 assert.equal(f.authority.peek(f.frame()).grant,granted.grant,'cancelled gate has no cleanup ownership over the external grant');
 assert.equal(f.identity.calls,1);
});

test('external authority becoming pending during body preflight does not consume the B receipt',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const body=deferred(),read=deferred();let query,authorizeCalls=0;
 f.associationReader=value=>{query=value;return body.promise;};
 const gate=f.run({authorize:({signal})=>{authorizeCalls++;return f.authority.refresh(f.frame(),'focus',signal);}});
 await flush();assert(query,'the actual observer preflight is awaiting body association');assert.equal(f.identity.calls,0);
 f.identity.reader=()=>read.promise;const external=f.authority.refresh(f.frame(),'bind');await flush();
 assert.equal(f.authority.peek(f.frame()).state,'pending');assert.equal(f.identity.calls,1);
 body.resolve({challenge:query.challenge,actualURL:query.actualURL,conversationId:CONVERSATION,association:'explicit-body-id'});
 const paused=await gate;assert.equal(paused.state,'pending');assert.equal(authorizeCalls,0);
 // A failed external operation does not invalidate the separately current C2
 // receipt. That receipt must still have its first B authorization opportunity.
 read.reject(Error('session-transport-failed'));notVerified(await external);
 f.associationReader=null;f.identity.reader=null;const receipt=await f.verify();assert(receipt);
 const recovered=verified(f,await f.run());assert.equal(recovered.context.requestReceiptId,receipt.id);
 assert.equal(f.identity.calls,2);assert.equal(f.authorizeCalls,1);
});

test('the integration gate routes an owned B pending second waiter through independent cancellation',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred(),firstAbort=new AbortController(),secondAbort=new AbortController();f.identity.reader=()=>read.promise;
 const frame=f.frame(),owner=f.documents.get(1).attemptOwner;let policyCalls=0,bypassCalls=0;
 const gated=signal=>{
  if(f.recovery.ownsFlight(frame,owner)||!['verified','pending'].includes(f.authority.peek(frame).state)){
   policyCalls++;return f.run({frame,attemptOwner:owner,signal});
  }
  bypassCalls++;return f.authority.refresh(frame,'focus',signal);
 };
 const first=gated(firstAbort.signal);await flush();
 assert.equal(f.authority.peek(frame).state,'pending');assert.equal(f.recovery.ownsFlight(frame,owner),true);
 const second=gated(secondAbort.signal);await flush();
 assert.equal(policyCalls,2);assert.equal(bypassCalls,0,'same-owner pending must not bypass subscriber ownership');
 assert.equal(f.identity.calls,1);firstAbort.abort();await flush();notVerified(await first);
 assert.equal(f.identity.signals[0].aborted,false,'the remaining waiter keeps the shared B authorization alive');
 read.resolve(f.makeIdentity());verified(f,await second);assert.equal(f.identity.calls,1);
 assert.equal(f.recovery.ownsFlight(frame,owner),false,'successful delivery releases pending ownership');
});

test('flight ownership requires the exact private owner and exact live tab/document/URL',async t=>{
 const f=createFixture(t);notVerified(await f.run());await f.native();const read=deferred();f.identity.reader=()=>read.promise;
 const frame=f.frame(),owner=f.documents.get(1).attemptOwner,job=f.run();await flush();
 assert.equal(f.recovery.ownsFlight(frame,owner),true);
 for(const otherOwner of [Object.freeze({}),structuredClone(owner),null,undefined])assert.equal(f.recovery.ownsFlight(frame,otherOwner),false);
 for(const patch of [{tabId:2},{documentId:'other_document'},{actualURL:ORIGIN+'/c/'+OTHER_CONVERSATION},{frameId:2},{incognito:true},{documentLifecycle:'cached'}]){
  assert.equal(f.recovery.ownsFlight({...frame,...patch},owner),false,JSON.stringify(patch));
 }
 assert.equal(f.identity.calls,1,'ownership inspection does not invoke provider');
 read.resolve(f.makeIdentity());verified(f,await job);
 assert.equal(f.recovery.ownsFlight(frame,owner),false);
});
