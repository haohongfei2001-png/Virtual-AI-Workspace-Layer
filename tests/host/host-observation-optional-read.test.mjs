import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {currentObservation} from '../../src/host/current-observation-batch.mjs';
function combined(h,title='Real native title'){
 const surface=h.surface(title),body={...surface,kind:'current-object',payload:{conversationId:'C',messageIds:['M','new-message'],association:'explicit-body-id',regionEpoch:2,evidence:{profileId:'surface',profileVersion:1,sourceKind:'native-dom',regionEpoch:2,fieldPaths:['current-body-explicit-id','current-body-message-ids'],receiptId:null}}};
 return currentObservation(body,surface.payload);
}
test('unchanged native semantics accept new body proof when optional metadata read exhausts budget, without native write',async t=>{
 let fail=false,callbacks=0;
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn),onNativeDelta:()=>{callbacks++;if(fail)throw Error('read-budget-exhausted');}});
 assert.equal((await h.ingest(h.surface())).state,'accepted');const before=await h.native.read(h.scope),evidence=await h.free.read(h.scope);let writes=0;const apply=h.native.apply.bind(h.native);h.native.apply=(...args)=>{writes++;return apply(...args);};fail=true;
 const proposal=combined(h),result=await h.ingest(proposal);
 assert.equal(result.state,'accepted','independent valid body proof must survive optional read-budget failure');assert.equal(callbacks,2);assert.equal(writes,0);assert.equal(typeof result.bodyProofId,'string');
 assert.deepEqual(await h.native.read(h.scope),before);assert.deepEqual(await h.free.read(h.scope),evidence);assert.deepEqual(await h.native.listContinuations(h.scope),[]);
 await h.observations.withCurrent(result.bodyProofId,context=>{assert.deepEqual(context.messageIds,['M','new-message']);assert.equal(context.guard(),true);});
 assert.equal((await h.ingest(proposal)).state,'duplicate');assert.equal(callbacks,2);assert.equal(writes,0);
});
test('optional metadata failure cannot hide body guard revocation',async t=>{
 let revoke=false,h;
 h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn),onNativeDelta:()=>{if(revoke){h.revoke();throw Error('read-budget-exhausted');}}});
 assert.equal((await h.ingest(h.surface())).state,'accepted');const before=await h.native.read(h.scope);let writes=0;const apply=h.native.apply.bind(h.native);h.native.apply=(...args)=>{writes++;return apply(...args);};revoke=true;
 const result=await h.ingest(combined(h));assert.equal(result.state,'rejected');assert.equal(writes,0);assert.deepEqual(await h.native.read(h.scope),before);assert.equal((await h.free.read(h.scope)).revision,0);await assert.rejects(h.observations.withCurrent('proof_2',()=>assert.fail('revoked proof must be inaccessible')));
});
test('changed native semantics with claimed joint failure never fall back to native-only write',async t=>{
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn)});h.disableAck();assert.equal((await h.ingest(h.surface())).state,'accepted');h.resumeAck();
 const before=await h.native.read(h.scope),evidence=await h.free.read(h.scope);let writes=0;h.native.apply=async()=>{writes++;return {ok:false,reason:'revision-conflict'};};
 const result=await h.ingest(combined(h,'Changed native title'));assert.equal(result.state,'rejected');assert.equal(writes,1,'joint failure gets exactly one apply, no fallback');assert.deepEqual(await h.native.read(h.scope),before);assert.deepEqual(await h.free.read(h.scope),evidence);assert.deepEqual(await h.native.listContinuations(h.scope),[]);
});

for(const kind of ['document','tab'])test('optional failure cannot accept deleted '+kind+' body while outer binding remains valid',async t=>{
 let invalidate=false,h;
 h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn),onNativeDelta:()=>{if(invalidate){if(kind==='document')h.observations.invalidateDocument('doc');else h.observations.invalidateTab(1);throw Error('read-budget-exhausted');}}});
 assert.equal((await h.ingest(h.surface())).state,'accepted');const before=await h.native.read(h.scope);invalidate=true;
 const result=await h.ingest(combined(h));assert.equal(result.state,'rejected');assert.deepEqual(await h.native.read(h.scope),before);assert.equal((await h.free.read(h.scope)).revision,0);await assert.rejects(h.observations.withCurrent('proof_2',()=>assert.fail('deleted proof cannot authorize')));
 // invalidateDocument/Tab did not revoke the fixture's authority/handshake.
 assert.equal((await h.updateBody(['fresh'])).state,'accepted');
});

test('fresh handshake refusal after optional failure rejects even with live outer guard and body',async t=>{
 const {createHostObservationOwner}=await import('../../src/runtime/host-observation-owner.mjs');
 const h=await createJointObservationFixture({indexedDB:new MockIDBFactory(),after:fn=>t.after(fn),onNativeDelta:()=>{}});assert.equal((await h.ingest(h.surface())).state,'accepted');
 const before=await h.native.read(h.scope);let verify=true,afterFailureChecks=0,writes=0,optionalCalls=0;
 const grant={id:'fresh-grant',scopeEpoch:1,expiresAt:'2026-10-14T00:01:00Z',principal:{providerProfile:'provider',transport:'worker-fixed-fetch'}};
 const owner=createHostObservationOwner({handshake:{verify:async()=>{if(!verify)afterFailureChecks++;return verify;},isBound:()=>true,matchesFrame:()=>true},authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>h.scope},getFrame:async()=>({url:'https://host.test/c/C',documentId:'doc'}),profiles:new Map([['surface',h.profile]]),now:()=>Date.parse('2026-10-14T00:00:00Z'),makeId:()=> 'fresh-proof',onNativeDelta:()=>{optionalCalls++;verify=false;throw Error('read-budget-exhausted');}});t.after(()=>owner.stop());
 const repository={page:(...args)=>h.native.page(...args),apply:async()=>{writes++;assert.fail('unchanged native facts must not be written');}};
 const result=await owner.ingest(combined(h),{tab:{id:1}},repository);assert.equal(result.state,'rejected');assert.equal(optionalCalls,1);assert.equal(afterFailureChecks,1,'optional catch must perform a fresh handshake');assert.equal(writes,0);assert.deepEqual(await h.native.read(h.scope),before);assert.equal((await h.free.read(h.scope)).revision,0);
});
