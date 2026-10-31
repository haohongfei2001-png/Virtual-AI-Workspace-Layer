import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {directoryHarness,ordinary,C,D,P} from './fixtures/directory-owner.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {continuationSemanticFingerprint} from '../../src/data/native-observation-continuation.mjs';
import {digest} from '../../src/data/hash.mjs';
const setup=async(t,options)=>{const h=await directoryHarness(new MockIDBFactory(),options);t.after(()=>h.close());return h;};
test('private directory response → existing CAS → projection: coverage gap does not discard positive candidates',async t=>{
 const h=await setup(t),result=await h.observe();assert(result.ok,JSON.stringify(result));assert.deepEqual(result.coverage.gaps,['missing-inventory-status']);
 const facts=await h.native.read(h.scope),source=Object.values(facts.sources)[0];assert.equal(source.channel,'host-metadata');assert.equal(source.admission.evidenceClass,'directory-candidates');assert.deepEqual(source.admission.coverage,result.coverage);assert.equal(source.inventory.conversations,'partial');
 assert.deepEqual(facts.membership,{});assert.equal(facts.refs[C].nativeTitle,'原始标题 '+C);assert(!JSON.stringify(facts).includes('must-not-persist'));assert(!JSON.stringify(facts).includes('update_time'));
 h.base.close();const projection=await h.native.snapshot(h.scope);assert.equal(projection.unknown[0].id,C);assert.equal(projection.noProject.length,0);
 // Scoped retained metadata remains last-known after freshness expires.
 h.advance(60001);assert.equal((await h.native.snapshot(h.scope)).refs[0].freshness,'last-known');
});
test('DOM → metadata → DOM uses one canonical source and preserves prior membership, unseen rows and aliases',async t=>{
 const h=await setup(t);assert.equal((await h.dom()).state,'accepted');const before=await h.native.read(h.scope),sourceId=Object.keys(before.sources)[0];
 h.setPayload(ordinary([C,D]));assert((await h.observe()).ok);const middle=await h.native.read(h.scope);assert.deepEqual(Object.keys(middle.sources),[sourceId]);assert.deepEqual(middle.membership,before.membership);assert.deepEqual(middle.projects,before.projects);assert(middle.refs[C].nativeAliases.includes('DOM '+C));
 assert.equal((await h.dom()).state,'accepted');const final=await h.native.read(h.scope);assert.deepEqual(Object.keys(final.sources),[sourceId]);assert(final.refs[D]);assert.equal(final.sources[sourceId].channel,'host-dom');assert.equal((await h.native.snapshot(h.scope)).unknown.some(r=>r.id===D),true);
});
test('archive/project/member domains remain partial, and members never infer PROJECT or NONE',async t=>{
 const h=await setup(t);assert((await h.observe('archived')).ok);assert.equal(Object.values((await h.native.read(h.scope)).sources)[0].admission.coverage.domain.filter,'is_archived=true;is_starred=unspecified');
 h.setPayload(JSON.stringify({items:[{gizmo:{gizmo:{id:P,gizmo_type:'snorlax',display:{name:'原生项目'}}}}],cursor:null}));assert((await h.observe('projects')).ok);
 h.setPayload(JSON.stringify({items:[{id:D,title:'成员候选',gizmo_id:P}],cursor:null}));const result=await h.observe('members',P);assert(result.ok);assert.equal(result.coverage.domain.projectId,P);assert.equal(result.coverage.terminalObserved,true);
 const facts=await h.native.read(h.scope);assert.deepEqual(facts.membership,{});assert.equal(Object.values(facts.sources)[0].inventory.conversations,'partial');assert.equal((await h.native.snapshot(h.scope)).projects[0].members.length,0);
});
test('no registered production source means no read and no storage mutation',async t=>{const h=await setup(t,{registered:false});assert.equal((await h.observe()).reason,'directory-source-unregistered');assert.equal(h.calls,0);assert.equal(await h.native.version(h.scope),0);});
test('member target needs a current positive Project in the same scope before source read',async t=>{const h=await setup(t);assert.equal((await h.observe('members',P)).reason,'directory-project-unverified');assert.equal(h.calls,0);});
for(const mode of ['result-clone','context-clone'])test('private identity rejects '+mode,async t=>{const h=await setup(t,{mode});assert.equal((await h.observe()).reason,'untrusted-directory-result');assert.equal(await h.native.version(h.scope),0);});
for(const invalidation of ['scope','document','stop','provider-method','profile'])test('directory read cannot outlive '+invalidation,async t=>{
 let started,release;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r),h=await setup(t,{delay:async()=>{started();await wait;}});const task=h.observe();await ready;assert.equal(h.service.observations.isIdle(),false);
 if(invalidation==='scope')h.switchScope();if(invalidation==='document')h.service.observations.invalidateDocument('doc');if(invalidation==='stop')h.service.stop();if(invalidation==='provider-method')h.provider.directoryFor=()=>null;if(invalidation==='profile')h.profile.revision++;
 release();assert.equal((await task).ok,false);assert.equal(await h.native.version(h.scope),0);assert.equal(h.seen[0].options.signal.aborted,true);
});
test('deadline rejects hanging source; late completion never writes',async t=>{
 let started,release;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r),h=await setup(t,{manualDeadline:true,delay:async()=>{started();await wait;}});const task=h.observe();await ready;h.expire();assert.equal((await task).ok,false);release();await new Promise(r=>setTimeout(r,0));assert.equal(await h.native.version(h.scope),0);assert.equal(h.calls,1);assert.equal(h.service.observations.isIdle(),true);
});
test('serialized gate request cannot replay, and metadata cannot enqueue ACK continuation',async t=>{
 const h=await setup(t);let saved,gate;const apply=h.native.apply.bind(h.native);h.native.apply=async(scope,request,options)=>{saved=structuredClone(request);gate=h.service.observations.gate(scope,request);assert(gate);const other=new NativeRepository({baseRepository:h.base,hostObservationGate:()=>({...gate,continuation:{}})});await assert.rejects(other.apply(scope,request,options),/untrusted-native-continuation/);return apply(scope,request,options);};
 assert((await h.observe()).ok);assert.equal(gate.guard(),false);await assert.rejects(apply(h.scope,saved),/untrusted-native-source/);
});
test('post-commit revocation returns committed but never publishes stale success',async t=>{
 const h=await setup(t),apply=h.native.apply.bind(h.native);h.native.apply=async(...args)=>{const result=await apply(...args);h.switchScope();return result;};const result=await h.observe();assert.deepEqual(result,{ok:false,reason:'stale-after-commit',committed:true});assert((await h.native.read(h.scope)).refs[C]);
});
test('empty partial page does not delete, refresh or flip the prior source',async t=>{const h=await setup(t);assert.equal((await h.dom()).state,'accepted');const before=await h.native.read(h.scope);h.setPayload(ordinary([]));assert.equal((await h.observe()).replayed,true);assert.deepEqual(await h.native.read(h.scope),before);});
test('missing title cannot erase or renew an existing name, while a new nameless ID stays reachable',async t=>{
 const h=await setup(t);assert.equal((await h.dom()).state,'accepted');const before=await h.native.read(h.scope);h.setPayload(JSON.stringify({items:[{id:C},{id:D}],offset:0,limit:100,total:2}));assert((await h.observe()).ok);const after=await h.native.read(h.scope);assert.deepEqual(after.refs[C],before.refs[C]);assert.equal(after.refs[D].nativeTitle,null);assert.equal((await h.native.snapshot(h.scope)).unknown.some(r=>r.id===D),true);
});
test('first-page target pins request parameters; conflicting response offset cannot be admitted',async t=>{
 const h=await setup(t);h.setPayload(JSON.stringify({items:[{id:C,title:'wrong page'}],offset:100,limit:100,total:101}));assert.equal((await h.observe()).ok,false);assert.equal(await h.native.version(h.scope),0);assert.deepEqual(h.seen[0].context.request,{method:'GET',path:'/backend-api/conversations?offset=0&limit=100',maxBytes:1048576});assert(Object.isFrozen(h.seen[0].context.request));
});
async function seedPending(h){
 // Same fictional private ACK semantics as the existing continuation fixture;
 // commit through the actual repository instead of editing stored records.
 const facts=await h.native.read(h.scope),source=Object.values(facts.sources)[0],{generation,observedAt,validUntil}=source,sourceId=source.id;
 const request={operationId:'pending_fixture',expectedRevision:facts.revision,batch:{scopeKey:h.scope.key,sourceRevision:source.sourceRevision+1,observedAt,validUntil,projects:[],refs:[{id:C,nativeTitle:'ACK fixture',nativeUrl:'https://chatgpt.com/c/'+C,availability:'available'}],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}};
 const batch={sources:[{id:sourceId,generation,sourceRevision:1,observedAt,validUntil,channel:'host-evidence',codecVersion:1,profileId:h.profile.id,profileVersion:1}],events:[],coverage:[],hints:[{id:'anchor_fixture',sourceId,generation,sourceRevision:1,observedAt,conversationId:C,eventKey:'fixture_message',hintType:'observed-self-send',anchorVersion:1,messageId:'fixture_message',firstObservedAt:observedAt,candidateInterval:{from:new Date(Date.parse(observedAt)-1000).toISOString(),through:observedAt},clockBasis:'local-bounded',calibrationDueAt:validUntil,actorVerified:true,actorScopeKey:h.scope.key,ackWitness:{kind:'authenticated-message-readback',profileId:h.profile.id,profileVersion:1,semanticFingerprint:digest('fixture')}}]};
 const admission={profileId:h.profile.id,profileVersion:1,evidenceClass:'surface',semanticFingerprint:digest(request.batch),acceptedAt:observedAt},gate={channel:'host-dom',sourceId,generation,guard:()=>true,admission,continuation:{evidenceOperationId:'fixture_evidence',expectedEvidenceRevision:0,batch},continuationAdmission:{...admission,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(batch)}};
 const native=new NativeRepository({baseRepository:h.base,clock:()=>observedAt,hostObservationGate:(_scope,r)=>r===request?gate:null});assert((await native.apply(h.scope,request)).ok);return h.native.listContinuations(h.scope);
}
test('persistent pending evidence blocks directory source replacement without weakening ACK recovery',async t=>{
 const h=await setup(t);assert.equal((await h.dom()).state,'accepted');const pending=await seedPending(h),before=await h.native.read(h.scope);
 assert.equal((await h.observe()).reason,'pending-native-evidence');assert.deepEqual(await h.native.read(h.scope),before);assert.deepEqual(await h.native.listContinuations(h.scope),pending);
});
test('a pending ACK inserted after the directory check wins the native CAS',async t=>{
 const h=await setup(t);assert.equal((await h.dom()).state,'accepted');const list=h.native.listContinuations.bind(h.native);let inserted;
 h.native.listContinuations=async(...args)=>{const rows=await list(...args);h.native.listContinuations=list;inserted=await seedPending(h);return rows;};
 const result=await h.observe();assert.equal(result.reason,'revision-conflict');assert.deepEqual(await list(h.scope),inserted);const facts=await h.native.read(h.scope);assert.equal(Object.values(facts.sources)[0].channel,'host-dom');assert.equal(facts.refs[C].nativeTitle,'ACK fixture');
});
