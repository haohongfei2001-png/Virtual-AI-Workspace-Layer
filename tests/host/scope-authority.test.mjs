import test from 'node:test';import assert from 'node:assert/strict';import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {HOST_CONFIG} from '../../extension/config.mjs';
const frame={tabId:1,frameId:0,documentId:'doc',parentDocumentId:null,actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
const identity=()=>({principalId:'userA',expiresAt:new Date(1000000).toISOString(),contexts:[{id:'personalA',kind:'personal'}],providerProfile:'session_v1',transport:'worker-fixed-fetch'});
function setup(options={}){let time=1000,n=0,calls=0,answer=identity();const auth=createScopeAuthority({provider:{read:async()=>{calls++;return answer;}},profile:{id:'personal_v1',singlePersonalDefault:true},now:()=>time,makeId:()=>`id_${++n}`,...options});return {auth,get calls(){return calls;},set answer(v){answer=v;},advance(ms){time+=ms;}};}
test('default startup without a context contract performs no identity read on any supported page or restart',async()=>{
 for(const readOverride of [false,true]){
  let reads=0;const read=async()=>{reads++;return identity();};
  const make=()=>setup({profile:HOST_CONFIG.scopeProfile,provider:{read},...(readOverride?{readIdentity:read}:{})}).auth;
  let auth=make();
  for(const path of ['/', '/c/12345678-1234-4234-8234-123456789abc', '/g/g-p-12345678123442348234123456789abc/project']){
   const current={...frame,actualURL:HOST_CONFIG.origin+path};
   for(const reason of ['bind','focus','expiry','auth-change'])assert.equal((await auth.refresh(current,reason)).state,'ambiguous');
   assert.equal(auth.scopeFor(current),null);assert.equal(auth.isIdle(),true);
   auth.invalidateAll();auth=make();
  }
  assert.equal(reads,0,'neither worker nor isolated identity reader may run without C2/C3');
 }
});
test('C3 requires fixed semantics and authentic personal roster; peek stays network-free',async()=>{const h=setup();assert.equal(h.auth.peek(frame).state,'unverified');const result=await h.auth.refresh(frame,'bind');assert.equal(result.state,'verified');for(let i=0;i<50;i++)assert.equal(h.auth.peek(frame).grant.id,result.grant.id);assert.equal(h.calls,1);assert.equal(h.auth.scopeFor(frame).key,result.grant.scopeKey);assert(!JSON.stringify(result).includes('userA'));});
test('50 concurrent refreshes share one provider call and result',async()=>{const h=setup();const results=await Promise.all(Array.from({length:50},()=>h.auth.refresh(frame,'bind')));assert.equal(h.calls,1);assert(results.every(r=>r.grant.id===results[0].grant.id));});
for(const [name,contexts,enabled]of [['multi',[{id:'A',kind:'personal'},{id:'B',kind:'organization'}],true],['unknown',[{id:'A',kind:'unknown'}],true],['organization',[{id:'A',kind:'organization'}],true],['unproven-profile',[{id:'A',kind:'personal'}],false]])test('does not guess context '+name,async()=>{const h=setup({profile:{id:'p',singlePersonalDefault:enabled}});h.answer={...identity(),contexts};assert.equal((await h.auth.refresh(frame,'bind')).state,'ambiguous');assert.equal(h.auth.scopeFor(frame),null);});
test('expiry, route mismatch and incognito prohibit cache scope',async()=>{const h=setup();await h.auth.refresh(frame,'bind');assert.equal(h.auth.scopeFor({...frame,actualURL:'https://chatgpt.com/c/other'}),null);assert.equal(h.auth.scopeFor({...frame,incognito:true}),null);h.advance(60000);assert.equal(h.auth.scopeFor(frame),null);assert.equal(h.calls,1);});
test('auth change removes old grant immediately and rejects its delayed result',async()=>{let release;const h=setup({provider:{read:()=>new Promise(r=>release=r)}});const pending=h.auth.refresh(frame,'bind');await Promise.resolve();h.auth.invalidate('doc');assert.equal(h.auth.peek(frame).state,'unverified');release(identity());assert.equal((await pending).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);});
test('two principals produce distinct namespaces without changing previous immutable grant',async()=>{const h=setup(),a=await h.auth.refresh(frame,'bind');h.answer={...identity(),principalId:'userB'};const pending=h.auth.refresh(frame,'auth-change');assert.equal(h.auth.scopeFor(frame),null);const b=await pending;assert.notEqual(a.grant.scopeKey,b.grant.scopeKey);assert(Object.isFrozen(a.grant));});
test('abort and duplicate roster fail closed',async()=>{const h=setup();assert.equal((await h.auth.refresh(frame,'bind',AbortSignal.abort())).state,'unverified');assert.equal(h.calls,0);h.answer={...identity(),contexts:[{id:'A',kind:'personal'},{id:'A',kind:'personal'}]};assert.equal((await h.auth.refresh(frame,'bind')).state,'unverified');});

function renewalFixture(){
 let time=1000,n=0,calls=0,answer=identity(),read=null;const timers=new Map();
 const profile={id:'personal_v1',singlePersonalDefault:true};
 const auth=createScopeAuthority({provider:{read:args=>{calls++;return read?read(args):Promise.resolve(answer);}},profile,now:()=>time,elapsedNow:()=>time,makeId:()=>`renew_${++n}`,schedule:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
 return {auth,profile,get calls(){return calls;},set answer(v){answer=v;},set read(v){read=v;},advance(ms){time+=ms;},fire(){for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('revalidation keeps far proof network-free and coalesces near-expiry reads without hiding valid grant',async()=>{
 const h=renewalFixture(),old=(await h.auth.refresh(frame,'bind')).grant,bytes=JSON.stringify(old);
 await Promise.all(Array.from({length:50},()=>h.auth.revalidate(frame)));assert.equal(h.calls,1);
 h.advance(50000);let release;h.read=()=>new Promise(r=>release=r);
 const jobs=Array.from({length:50},()=>h.auth.revalidate(frame));await Promise.resolve();assert.equal(h.calls,2);assert.equal(h.auth.peek(frame).grant,old);
 release(identity());const results=await Promise.all(jobs),next=results[0].grant;
 assert(results.every(x=>x.grant===next));assert.equal(next.id,old.id);assert.equal(next.scopeEpoch,old.scopeEpoch);assert.equal(next.principal.sessionGeneration,old.principal.sessionGeneration);assert.equal(next.context.selectionEpoch,old.context.selectionEpoch);assert.notEqual(next.principal.id,old.principal.id);assert.equal(next.context.rosterReceiptId,next.principal.id);assert.equal(Date.parse(next.expiresAt),111000);assert.equal(Date.parse(next.principal.verifiedAt),51000);assert.equal(JSON.stringify(old),bytes);assert(Object.isFrozen(next)&&Object.isFrozen(next.principal)&&Object.isFrozen(next.context));
});
test('revalidation caps proof to actual session expiration',async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');h.advance(50000);h.answer={...identity(),expiresAt:new Date(53000).toISOString()};assert.equal(Date.parse((await h.auth.revalidate(frame)).grant.expiresAt),53000);});
for(const [name,change]of [
 ['principal',x=>({...x,principalId:'userB'})],['context',x=>({...x,contexts:[{id:'other',kind:'personal'}]})],['multi',x=>({...x,contexts:[...x.contexts,{id:'org',kind:'organization'}]})],['organization',x=>({...x,contexts:[{id:'personalA',kind:'organization'}]})],['unknown',x=>({...x,contexts:[{id:'personalA',kind:'unknown'}]})],['duplicate',x=>({...x,contexts:[...x.contexts,...x.contexts]})],['signed-out',()=>null],['provider-profile',x=>({...x,providerProfile:'other'})],['unknown-transport',x=>({...x,transport:'page-claimed'})],['expired-session',x=>({...x,expiresAt:new Date(51000).toISOString()})]
])test('revalidation revokes immediately on '+name,async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');h.advance(50000);h.answer=change(identity());assert.equal((await h.auth.revalidate(frame)).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);assert.equal((await h.auth.revalidate(frame)).state,'unverified');assert.equal(h.calls,2);});
for(const field of ['id','singlePersonalDefault'])test('revalidation rejects changed packaged profile '+field,async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');h.advance(50000);h.profile[field]=field==='id'?'different':false;assert.equal((await h.auth.revalidate(frame)).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);});
for(const kind of ['old-expiry','late-deadline','timer-timeout','revoke','abort','auth-change'])test('pending revalidation never restores revoked authorization: '+kind,async()=>{
 const h=renewalFixture();await h.auth.refresh(frame,'bind');h.advance(kind==='old-expiry'?55000:50000);let release;h.read=()=>new Promise(r=>release=r);const abort=new AbortController(),pending=h.auth.revalidate(frame,abort.signal);await Promise.resolve();
 let replacement;
 if(kind==='old-expiry'){h.advance(5000);assert.equal(h.auth.scopeFor(frame),null);}
 if(kind==='late-deadline')h.advance(6000);
 if(kind==='timer-timeout'){h.advance(6000);h.fire();await Promise.resolve();}
 if(kind==='revoke')h.auth.invalidate(frame.documentId);
 if(kind==='abort')abort.abort();
 if(kind==='auth-change'){h.read=null;replacement=(await h.auth.refresh(frame,'auth-change')).grant;}
 release(identity());assert.equal((await pending).state,'unverified');
 if(replacement)assert.equal(h.auth.peek(frame).grant,replacement);else assert.equal(h.auth.scopeFor(frame),null);
});
test('revalidation accepts neither wrong route nor expired grant and abort fails closed before fetch',async()=>{
 const h=renewalFixture();await h.auth.refresh(frame,'bind');assert.equal((await h.auth.revalidate({...frame,actualURL:'https://chatgpt.com/c/other'})).state,'unverified');assert.equal(h.calls,1);
 assert.equal((await h.auth.revalidate(frame,AbortSignal.abort())).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);assert.equal(h.calls,1);
 await h.auth.refresh(frame,'bind');h.advance(60000);assert.equal((await h.auth.revalidate(frame)).state,'unverified');assert.equal(h.calls,2);
});

test('provider failure invalidates without retry',async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');h.advance(50000);h.read=()=>Promise.reject(Error('offline'));assert.equal((await h.auth.revalidate(frame)).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);assert.equal(h.calls,2);});
test('forced far-expiry revalidation bypasses cache while preserving same identity grant and epoch',async()=>{const h=renewalFixture(),old=(await h.auth.refresh(frame,'bind')).grant;h.advance(1000);const result=await h.auth.revalidate(frame,undefined,{force:true});assert.equal(h.calls,2);assert.equal(result.grant.id,old.id);assert.equal(result.grant.scopeEpoch,old.scopeEpoch);assert.equal(result.grant.context.selectionEpoch,old.context.selectionEpoch);assert.notEqual(result.grant.principal.id,old.principal.id);assert(Date.parse(result.grant.expiresAt)>Date.parse(old.expiresAt));await h.auth.revalidate(frame);await h.auth.revalidate(frame,undefined,{force:false});assert.equal(h.calls,2);});
test('concurrent forced and ordinary revalidations share one far-expiry read',async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');let finish;h.read=()=>new Promise(r=>finish=r);const first=h.auth.revalidate(frame,undefined,{force:true}),jobs=Array.from({length:30},(_,i)=>h.auth.revalidate(frame,undefined,{force:i%2===0}));await Promise.resolve();assert.equal(h.calls,2);finish(identity());const results=await Promise.all([first,...jobs]);assert(results.every(r=>r.grant===results[0].grant));});
for(const kind of ['principal','context','failure'])test('forced far-expiry '+kind+' revokes old identity without retry',async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');if(kind==='principal')h.answer={...identity(),principalId:'other'};if(kind==='context')h.answer={...identity(),contexts:[{id:'other',kind:'personal'}]};if(kind==='failure')h.read=()=>Promise.reject(Error('offline'));assert.equal((await h.auth.revalidate(frame,undefined,{force:true})).state,'unverified');assert.equal(h.auth.scopeFor(frame),null);assert.equal(h.calls,2);});
for(const kind of ['abort','timeout'])test('forced read '+kind+' settles and late provider cannot revive',async()=>{const h=renewalFixture();await h.auth.refresh(frame,'bind');let finish,signal;h.read=args=>{signal=args.signal;return new Promise(r=>finish=r);};const controller=new AbortController(),pending=h.auth.revalidate(frame,controller.signal,{force:true});await Promise.resolve();if(kind==='abort')controller.abort();else{h.advance(6000);h.fire();}assert.equal((await pending).state,'unverified');assert.equal(signal.aborted,true);assert.equal(h.auth.scopeFor(frame),null);finish(identity());await Promise.resolve();assert.equal(h.auth.scopeFor(frame),null);assert.equal(h.calls,2);});
