/** Actual owner, NativeRepository and MockIDB transactions; browser handshake and
 * scope grants are explicit doubles, not real browser/authentication evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const origin='https://chatgpt.com',scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'fixture',organizationId:'personal'});
function fixture(t){
 let time=1000,bound=true,notifications=0;
 const grant={id:'grant',scopeEpoch:1,expiresAt:new Date(21000).toISOString()},sender={tab:{id:1,incognito:false},frameId:0,documentId:'doc'};
 const profile={id:'coalescing',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:x=>x,projectId:({container})=>container}})};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'owner-coalescing'});
 const owner=createHostObservationOwner({handshake:{verify:async()=>bound,isBound:()=>bound,matchesFrame:()=>bound},authority:{peek:()=>({state:'verified',grant}),scopeFor:()=>scope},getFrame:async()=>({documentId:'doc',url:origin+'/',documentLifecycle:'active'}),profiles:new Map([[profile.id,profile]]),onAccepted:()=>notifications++,now:()=>time});
 const native=new NativeRepository({baseRepository:base,hostObservationGate:owner.gate,clock:()=>new Date(time).toISOString()});
 t.after(()=>{owner.stop();base.close();});
 const evidence=fieldPaths=>({profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths,receiptId:null});
 const candidate=(entity,id,title=id)=>({renderKey:entity+':'+id,entity,nativeTitle:title,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:origin+(entity==='project'?'/g/'+id+'/project':'/c/'+id),liveHandle:null},evidence:evidence(['history','href'])});
 const proposal=(seq,patch={})=>({protocol:'vaiwl-host-observation/1',documentToken:'document',producerToken:'producer',routeEpoch:1,localSeq:seq,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[candidate('project','p1'),candidate('project','p2'),candidate('conversation','c1')],membershipClaims:[{conversationId:'c1',asserted:'PROJECT',projectId:'p1',upstreamRevision:null,evidence:evidence(['members','current-project-route'])}],coverageClaims:[],detachedHandles:[],...patch}});
 return {native,owner,proposal,candidate,evidence,get notifications(){return notifications;},read:()=>native.read(scope),send:p=>owner.ingest(p,sender,native),advance(ms){time+=ms;grant.expiresAt=new Date(time+20000).toISOString();},revoke(){bound=false;}};
}
const accepted=async(f,p)=>{const result=await f.send(p);assert.equal(result.state,'accepted',JSON.stringify(result));return result;};
test('MOCK_IDB coalescing unchanged active rows ACK without renewing persisted source or row witnesses',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read();f.advance(1000);
 const p=f.proposal(2),ack=await accepted(f,p);assert.equal(typeof ack.receiptId,'string');assert.deepEqual(await f.read(),before);
 assert.equal((await f.send(p)).state,'duplicate');assert.equal((await f.send(f.proposal(1))).state,'rejected');assert.deepEqual(await f.read(),before);
});
test('MOCK_IDB coalescing masked UNKNOWN preserves exact PROJECT witness and fresh producer cannot renew it',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read();f.advance(1000);
 const p=f.proposal(1,{membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:f.evidence(['history'])}]});p.producerToken='replacement';
 await accepted(f,p);assert.deepEqual(await f.read(),before);
});
for(const change of ['rename','new-ref','membership'])test('MOCK_IDB coalescing must persist '+change,async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read(),p=f.proposal(2);
 if(change==='rename')p.payload.candidates[2].nativeTitle='renamed';if(change==='new-ref')p.payload.candidates.push(f.candidate('conversation','c2'));if(change==='membership')p.payload.membershipClaims[0].projectId='p2';
 await accepted(f,p);const after=await f.read();assert.equal(after.revision,before.revision+1);
 if(change==='rename')assert.equal(after.refs.c1.nativeTitle,'renamed');if(change==='new-ref')assert(after.refs.c2);if(change==='membership')assert.equal(after.membership.c1.projectId,'p2');
});
test('MOCK_IDB coalescing expired source still refreshes explicitly observed rows through real apply',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read();f.advance(20001);await accepted(f,f.proposal(2));const after=await f.read();assert.equal(after.revision,before.revision+1);assert(Date.parse(after.refs.c1.validUntil)>Date.parse(before.refs.c1.validUntil));
});
test('MOCK_IDB coalescing fresh source does not hide an expired individual row witness',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));f.advance(10000);
 await accepted(f,f.proposal(2,{candidates:[f.candidate('project','p2','changed')],membershipClaims:[]}));const before=await f.read();f.advance(10001);
 const source=Object.values(before.sources)[0];assert(Date.parse(source.validUntil)>21001);assert(Date.parse(before.refs.c1.validUntil)<=21001);
 await accepted(f,f.proposal(3,{candidates:[f.candidate('conversation','c1')],membershipClaims:[]}));const after=await f.read();assert.equal(after.revision,before.revision+1);assert(Date.parse(after.refs.c1.validUntil)>Date.parse(before.refs.c1.validUntil));assert.deepEqual(after.membership,before.membership,'unobserved membership TTL cannot be refreshed by a conversation title observation');
});
test('MOCK_IDB coalescing source revocation requires a new incarnation and only observed rows revalidate',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read(),old=Object.values(before.sources)[0];assert.equal((await f.native.invalidate(scope,{operationId:'revoke_source',expectedRevision:before.revision,sourceId:old.id})).ok,true);
 await accepted(f,f.proposal(2,{candidates:[f.candidate('conversation','c1')],membershipClaims:[]}));const after=await f.read();assert.equal(after.revision,before.revision+2);assert.notEqual(after.refs.c1.sourceId,old.id);assert.equal(after.sources[old.id].revoked,true);assert.deepEqual(after.membership,before.membership);
});
test('MOCK_IDB coalescing revision movement before no-op ACK retries without consuming producer sequence',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read(),version=f.native.version.bind(f.native),p=f.proposal(2);let calls=0;
 f.native.version=async(...args)=>{calls++;return (await version(...args))+1;};const result=await f.send(p);assert.equal(result.state,'retry-after',JSON.stringify(result));assert(calls>0);assert.deepEqual(await f.read(),before);
 f.native.version=version;await accepted(f,p);assert.deepEqual(await f.read(),before);
});
test('MOCK_IDB coalescing authority loss during final version fence cannot ACK or persist',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read(),version=f.native.version.bind(f.native);
 f.native.version=async(...args)=>{const result=await version(...args);f.revoke();return result;};assert.equal((await f.send(f.proposal(2))).state,'rejected');assert.deepEqual(await f.read(),before);
});
test('MOCK_IDB coalescing initial empty surface still establishes a durable partial source',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1,{candidates:[],membershipClaims:[]}));const result=await f.read();assert.equal(result.revision,1);assert.equal(Object.keys(result.sources).length,1);assert.deepEqual(Object.values(result.sources)[0].inventory,{projects:'partial',conversations:'partial',cursor:null});
});
test('MOCK_IDB coalescing row expiry during asynchronous version fence must persist its still-valid fresh observation',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read();f.advance(10000);
 const version=f.native.version.bind(f.native);let advanced=false;
 f.native.version=async(...args)=>{const result=await version(...args);if(!advanced){advanced=true;f.advance(10001);}return result;};
 await accepted(f,f.proposal(2));assert(advanced);const after=await f.read();
 assert.equal(after.revision,before.revision+1,'TTL decision made before await cannot authorize a stale no-op');
 assert(Date.parse(after.refs.c1.validUntil)>Date.parse(before.refs.c1.validUntil));
});
test('MOCK_IDB coalescing pure resolved no-op ACK does not send another data notification',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));assert.equal(f.notifications,1);await accepted(f,f.proposal(2));assert.equal(f.notifications,1,'no persisted or candidate change must not trigger another frame read');
});
for(const kind of ['semantic-change','expired-witness'])test('MOCK_IDB coalescing '+kind+' still notifies after persistence',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const p=f.proposal(2);if(kind==='semantic-change')p.payload.candidates[2].nativeTitle='changed';else f.advance(20001);
 await accepted(f,p);assert.equal(f.notifications,2);assert.equal((await f.read()).revision,2);
});
for(const kind of ['live-control','detached-handle'])test('MOCK_IDB coalescing '+kind+' keeps candidate notification without rewriting native facts',async t=>{
 const f=fixture(t);await accepted(f,f.proposal(1));const before=await f.read(),p=f.proposal(2);
 if(kind==='live-control')p.payload.candidates.push({renderKey:'candidate:live_new',entity:'project',nativeTitle:'New native Project entry',titleState:'exact',target:{kind:'live-control',control:{id:'live_new',documentToken:'document',routeEpoch:1,regionEpoch:1,controlKind:'project'},navigationURL:null},evidence:f.evidence(['projects','button'])});else p.payload.detachedHandles=['live_old'];
 await accepted(f,p);assert.deepEqual(await f.read(),before);assert.equal(f.notifications,2,'nonpersistent candidate changes remain reachable even when native rows coalesce');
});
