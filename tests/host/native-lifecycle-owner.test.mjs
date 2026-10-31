import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {digest} from '../../src/data/hash.mjs';
const url='https://chatgpt.com/',sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',documentLifecycle:'active',url};
const frame={tabId:1,frameId:0,documentId:'doc',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
async function setup(t,{registered=true,mode='completed',delay=null,manualDeadline=false,mutableProvider=false}={}){
 let seq=0,n=0,calls=0,principal='A',elapsed=0,timerId=0;const timers=new Map();const timerOptions=manualDeadline?{elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id)}:{};const time=Date.parse('2026-10-14T00:00:00Z');
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'lifecycle-owner-'+crypto.randomUUID()}),proofs=new WeakMap(),seen=[];
 // A worker-owned synthetic result source. This is not a ChatGPT endpoint or
 // production profile: only this fixture defines completed/cancelled semantics.
 const lifecycleProvider={async read(context,options){calls++;seen.push({context,options});if(delay)await delay(context,options);
   const result=Object.freeze({state:mode});
   if(mode==='completed'||mode==='wrong-target'||mode==='clone')proofs.set(result,Object.freeze({context,change:{kind:context.target.kind,id:mode==='wrong-target'?'OTHER':context.target.id,state:context.target.state,expectedVersion:context.expectedVersion,fenceId:context.fenceId,fenceVersion:context.fenceVersion,resultFingerprint:digest([context.target.operationId,context.target.kind,context.target.id,context.target.state]),profileId:context.profileId,profileVersion:context.profileVersion}}));
   return mode==='clone'?structuredClone(result):result;
  },lifecycleFor:result=>proofs.get(result)??null};if(!mutableProvider)Object.freeze(lifecycleProvider);
 const profile={id:'lifecycle-fixture',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:s=>s,projectId:({container})=>container}}),...(registered?{lifecycleProvider}:{})},profiles=new Map([[profile.id,profile]]);
 const service=createHostBindingService({extensionId:'ext',getFrame:async()=>({documentId:'doc',url,documentLifecycle:'active'}),allowedURL:u=>u===url,repository:base,provider:{read:async()=>({principalId:principal,expiresAt:new Date(time+60000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'session',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:profiles,now:()=>time,makeId:()=>`id_${++n}`,...timerOptions});
 t.after(()=>{service.stop();base.close();});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:++seq},sender),binding={...hello.binding,profileId:profile.id,profileVersion:profile.revision};assert(binding.documentToken);
 assert.equal((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:++seq,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch},sender)).state,'verified');
 const scope=service.authority.scopeFor(frame),native=service.nativeRepository;
 const observe=(operationId='D1',state='deletion-confirmed',kind='refs',id='C')=>service.observations.observeLifecycle(binding,sender,native,{operationId,state,kind,id});
 return {service,base,native,scope,binding,profiles,profile,observe,seen,advanceDeadline(){elapsed=6000;},expire(){elapsed=6000;for(const timer of [...timers.values()])if(timer.ms<=6000)timer.fn();},get calls(){return calls;},switchScope(){principal='B';service.invalidate({tabId:1});}};
}
test('worker result provider → private owner admission → actual repository, no body required',async t=>{
 const h=await setup(t);assert.equal((await h.observe()).ok,true);const first=await h.native.read(h.scope);assert.equal(first.refLifecycle.C.state,'deletion-confirmed');assert.deepEqual(first.refs,{});
 assert.equal((await h.observe()).replayed,true);assert.equal(await h.native.version(h.scope),first.revision);
 assert.equal((await h.observe('R1','existence-confirmed')).ok,true);const restored=await h.native.read(h.scope);assert.equal(restored.refLifecycle.C.state,'existence-confirmed');assert.equal(restored.refLifecycle.C.fenceId,first.refLifecycle.C.fenceId);
 assert.equal(h.seen[2].context.fenceVersion,first.refLifecycle.C.version);assert.equal(h.service.observations.isIdle(),true);assert.equal(h.calls,3);
 await assert.rejects(h.native.applyLifecycle(h.scope,{operationId:'fake',expectedRevision:restored.revision,change:{confirmed:true}}),/untrusted-native-lifecycle/);
});
for(const mode of ['cancelled','failed','unknown','clicked','absent','http-200','clone','wrong-target'])test('lifecycle rejects '+mode+' without writing',async t=>{
 const h=await setup(t,{mode}),result=await h.observe();assert.equal(result.ok,false);assert.equal(await h.native.version(h.scope),0);assert.equal(h.calls,1);
});
test('production profile without registered lifecycle semantics performs no read',async t=>{
 const h=await setup(t,{registered:false}),result=await h.observe();assert.equal(result.reason,'native-lifecycle-source-unregistered');assert.equal(h.calls,0);assert.equal(await h.native.version(h.scope),0);
});
for(const revoke of ['scope','profile','document','tab','stop'])test('lifecycle in-flight '+revoke+' invalidation cannot commit',async t=>{
 let release,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);const h=await setup(t,{delay:async()=>{started();await wait;}});
 const task=h.observe();await ready;assert.equal(h.service.observations.isIdle(),false);
 if(revoke==='scope')h.switchScope();if(revoke==='profile')h.profiles.set(h.profile.id,{...h.profile});if(revoke==='document')h.service.observations.invalidateDocument('doc');if(revoke==='tab')h.service.observations.invalidateTab(1);if(revoke==='stop')h.service.stop();
 release();assert.equal((await task).ok,false);assert.equal(await h.native.version(h.scope),0);assert.equal(h.seen[0].options.signal.aborted,true);
});
test('fence captured before existence read cannot be attached to a newer deletion',async t=>{
 let release,started,hold=false;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);const h=await setup(t,{delay:async c=>{if(hold&&c.target.state==='existence-confirmed'){started();await wait;}}});
 assert.equal((await h.observe()).ok,true);const first=await h.native.read(h.scope);hold=true;const task=h.observe('R1','existence-confirmed');await ready;
 // Another owner/connection commits a separately admitted deletion while this
 // owner's existence read is in flight; it must lose the same root CAS.
 const {NativeRepository}=await import('../../src/data/native-repository.mjs'),admissions=new WeakMap(),other=new NativeRepository({baseRepository:h.base,lifecycleGate:(_scope,request)=>admissions.get(request)});
 const request={operationId:'D2-other',expectedRevision:first.revision,change:{kind:'refs',id:'C',state:'deletion-confirmed',expectedVersion:first.refLifecycle.C.version,fenceId:null,fenceVersion:null,resultFingerprint:digest('D2'),profileId:h.profile.id,profileVersion:1}};
 admissions.set(request,{purpose:'native-lifecycle',guard:()=>true});assert.equal((await other.applyLifecycle(h.scope,request)).ok,true);release();
 assert.equal((await task).reason,'revision-conflict');const final=await h.native.read(h.scope);assert.equal(final.refLifecycle.C.fenceId,digest('D2'));assert.equal(final.refLifecycle.C.state,'deletion-confirmed');
});
test('re-reading D1 after R1 never deletes twice; old R1 cannot bind to D2',async t=>{
 const h=await setup(t);assert((await h.observe('D1')).ok);assert((await h.observe('R1','existence-confirmed')).ok);const restored=await h.native.read(h.scope);
 const oldDelete=await h.observe('D1');assert(oldDelete.replayed);assert.equal(await h.native.version(h.scope),restored.revision);assert.equal((await h.native.read(h.scope)).refLifecycle.C.state,'existence-confirmed');
 assert((await h.observe('D2')).ok);const deleted=await h.native.read(h.scope),oldRestore=await h.observe('R1','existence-confirmed');assert.equal(oldRestore.ok,false);assert.equal(oldRestore.reason,'operation-replay-conflict');assert.deepEqual(await h.native.read(h.scope),deleted);
});
test('post-commit revocation preserves committed marker and withholds old-scope publication',async t=>{
 const h=await setup(t),apply=h.native.applyLifecycle.bind(h.native);h.native.applyLifecycle=async(...args)=>{const result=await apply(...args);h.switchScope();return result;};
 const result=await h.observe();assert.deepEqual(result,{ok:false,reason:'stale-after-commit',committed:true});assert.equal((await h.native.read(h.scope)).refLifecycle.C.state,'deletion-confirmed');
});

test('original six-second deadline retires a hanging source and rejects its late proof',async t=>{
 let release,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r),h=await setup(t,{manualDeadline:true,delay:async()=>{started();await wait;}});
 const task=h.observe();await ready;h.expire();const result=await task;assert.equal(result.ok,false);assert.equal(h.seen[0].options.signal.aborted,true);assert.equal(await h.native.version(h.scope),0);
 release();await new Promise(r=>setTimeout(r,0));assert.equal(await h.native.version(h.scope),0);assert.equal(h.calls,1);assert.equal(h.service.observations.isIdle(),true);
});
test('revocation immediately before the storage admission writes nothing',async t=>{
 const h=await setup(t),apply=h.native.applyLifecycle.bind(h.native);h.native.applyLifecycle=async(...args)=>{h.switchScope();return apply(...args);};
 assert.equal((await h.observe()).ok,false);assert.equal(await h.native.version(h.scope),0);
});

for(const phase of ['page','source','admission'])test('in-place lifecycle profile revision change at '+phase+' cannot commit',async t=>{
 let h;h=await setup(t,{delay:phase==='source'?async()=>{h.profile.revision=2;}:null});
 if(phase==='page'){const page=h.native.page.bind(h.native);h.native.page=async(...args)=>{const result=await page(...args);h.profile.revision=2;return result;};}
 if(phase==='admission'){const apply=h.native.applyLifecycle.bind(h.native);h.native.applyLifecycle=async(...args)=>{h.profile.revision=2;return apply(...args);};}
 const db=await h.base.open(),dump=()=>structuredClone([...db.meta.stores].map(([name,store])=>[name,[...store.rows]])),before=dump();
 assert.equal((await h.observe()).ok,false);assert.equal(h.calls,phase==='page'?0:1);assert.equal(await h.native.version(h.scope),0);assert.deepEqual(dump(),before);
});

for(const mutation of ['profile-id','read','lifecycleFor'])test('lifecycle owner pins '+mutation+' across its first await',async t=>{
 const h=await setup(t,{mutableProvider:true}),page=h.native.page.bind(h.native);let replacementCalls=0;
 h.native.page=async(...args)=>{const result=await page(...args);if(mutation==='profile-id')h.profile.id='renamed-profile';else h.profile.lifecycleProvider[mutation]=()=>{replacementCalls++;return null;};return result;};
 assert.equal((await h.observe()).ok,false);assert.equal(h.calls,0);assert.equal(replacementCalls,0);assert.equal(await h.native.version(h.scope),0);
});

test('delayed deadline after known commit retains only the committed fact',async t=>{
 const h=await setup(t,{manualDeadline:true}),apply=h.native.applyLifecycle.bind(h.native);
 h.native.applyLifecycle=async(...args)=>{const result=await apply(...args);assert(result.ok);h.advanceDeadline();return {ok:false,reason:'stale-after-commit',committed:true};};
 const result=await h.observe();assert.equal(result.ok,false);assert.equal(result.committed,true);assert.equal((await h.native.read(h.scope)).refLifecycle.C.state,'deletion-confirmed');
});
