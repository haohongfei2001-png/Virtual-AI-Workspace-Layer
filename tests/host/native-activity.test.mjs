import test from 'node:test';import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runNativeActivityCase,activityProfile,A,B} from './native-activity-cases.mjs';
import {parseNativeActivityRows} from '../../src/runtime/native-activity-profile.mjs';
import {createHostNativeActivityOwner} from '../../src/runtime/host-native-activity-owner.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
test('native activity existing scoped CAS/reopen journey',async()=>assert.equal((await runNativeActivityCase(new MockIDBFactory())).status,'PASS'));
test('metadata parser distinguishes missing, null and invalid time without guessing units',()=>{const r=parseNativeActivityRows({profile:activityProfile,observedAt:'2026-10-22T00:00:00Z',items:[{conversationId:A},{conversationId:B,updateTime:null}]});assert.deepEqual(r.gaps.map(g=>g.reason),['missing-update-time','null-update-time']);assert.equal(r.times.length,0);for(const value of ['1720000000',Date.parse('2026-10-22T00:00:00Z'),-1,Infinity])assert.equal(parseNativeActivityRows({profile:activityProfile,observedAt:'2026-10-22T00:00:00Z',items:[{conversationId:A,updateTime:value}]}).gaps[0].reason,'invalid-update-time');});
function fixture(){let wall=1000,live=true,timer,elapsed=0;const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'self',organizationId:'personal'}),requests=[],repo={async page(){return {revision:0,evidence:{sources:{},hints:{}}};},async apply(s,r){requests.push(r);return {ok:true};}},p={...activityProfile},owner=createHostNativeActivityOwner({evidenceRepository:()=>repo,profileFor:()=>p,now:()=>wall,elapsedNow:()=>elapsed,schedule:f=>(timer=f,1),cancel(){}}),input={observation:{profileId:p.id,profileVersion:1,scopeKey:scope.key,observedAt:new Date(wall).toISOString(),items:[{conversationId:A}]},context:{scope,providerProfile:p.providerProfile},guard:()=>live};return {owner,repo,input,requests,p,expire(){elapsed=6000;timer();},revoke(){live=false;},back(){wall=0;}};}
for(const kind of ['scope','profile','stop','clock'])test('native activity fences '+kind+' after read',async()=>{const f=fixture();f.repo.page=async()=>{if(kind==='scope')f.revoke();if(kind==='profile')f.p.revision++;if(kind==='stop')f.owner.stop();if(kind==='clock')f.back();return {revision:0,evidence:{sources:{},hints:{}}};};await assert.rejects(f.owner.consume(f.input));assert.equal(f.requests.length,0);});
test('hung read times out with monotonic deadline and cannot publish late',async()=>{const f=fixture();let resolve;f.repo.page=()=>new Promise(r=>resolve=r);const pending=f.owner.consume(f.input);f.expire();await assert.rejects(pending,/timeout/);assert.equal(f.owner.isIdle(),false);resolve({revision:0,evidence:{sources:{},hints:{}}});await new Promise(r=>setImmediate(r));assert.equal(f.owner.isIdle(),true);assert.equal(f.requests.length,0);});
test('stop aborts hung read without waiting for timer',async()=>{const f=fixture();f.repo.page=()=>new Promise(()=>{});const pending=f.owner.consume(f.input);f.owner.stop();await assert.rejects(pending,/stale/);assert.equal(f.requests.length,0);});

import {aggregateFreeActivity} from '../../src/data/free-activity.mjs';
test('undated project aggregates a proven member rank despite an unknown member first',()=>{
 const decision=n=>({basis:'undated',candidateDay:null,candidateTime:null,segment:null,...(n===null?{}:{nativeOrder:{sourceId:'s',domain:'d',batch:'b',rank:n}})}),refs=[['U',null],['A',0],['B',1]].map(([id,n])=>({id,scope:'scope',activityDecision:decision(n)})),snapshot={scope:'scope',refs,projects:[{id:'P2',scope:'scope',members:['B']},{id:'P1',scope:'scope',members:['U','A']}],noProject:[],unknown:[]};
 const result=aggregateFreeActivity(snapshot);assert.deepEqual(result.projects.map(p=>p.id),['P1','P2']);assert.equal(result.projects[0].activityDecision.candidateDay,null);
 refs[0].activityDecision=decision(0);refs[0].activityDecision.nativeOrder.domain='different';assert.equal(aggregateFreeActivity(snapshot).projects.find(p=>p.id==='P1').activityDecision.nativeOrder,undefined);
});
test('native owner authority is private request identity and ends at settlement',async()=>{
 const f=fixture();let saved;f.repo.apply=async(s,r)=>{saved=r;assert(f.owner.gate(s,r));assert.equal(f.owner.gate(s,structuredClone(r)),null);return {ok:true};};await f.owner.consume(f.input);assert.equal(f.owner.gate(f.input.context.scope,saved),null);
});

import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {assembleFreeReplica,planFreeReplica} from '../../src/data/free-replica.mjs';
test('source-only order batch withdrawal reloads cached activity at the same wall clock',async()=>{
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'test',organizationId:'personal'}),at='2026-10-22T01:00:00Z';
 const state={scopeKey:scope.key,revision:1,sources:{},events:{},coverage:{},refs:{[A]:{},[B]:{}},preferences:{}};
 const source={id:'source',revoked:false,generation:1,channel:'host-evidence',codecVersion:3,validUntil:'2026-10-22T01:01:00Z',orderDomain:'recent',orderBatch:'batch'};
 let stored={revision:1,sources:{source},hints:{},events:{},coverage:{}};
 const service=createFreeReadService({repository:{},clock:()=>at,workspaces:{partitioned:{async storageInfo(){return null;}},async partitionHeader(){return null;},async read(){return {state};}},native:{async header(){return {revision:1,manifest:{refs:{[A]:1,[B]:1},projects:{},sources:{}}};}},evidence:{async header(){return stored;}}});
 const header=await service.freeHeader(scope,{}),refs=[A,B].map(id=>({id,scope:scope.key,membership:'UNKNOWN',activityDecision:{basis:'undated',candidateDay:null,candidateTime:null,segment:null}}));
 const cached=assembleFreeReplica(null,header,[{scope:scope.key,revision:1,projects:[],refs}]);
 assert.deepEqual(planFreeReplica(cached,await service.freeHeader(scope,{})).refs,[]);
 stored={...stored,revision:2,sources:{source:{...source,orderDomain:null,orderBatch:null}}};
 const next=await service.freeHeader(scope,{});
 assert.deepEqual(next.manifest.activityVersions,header.manifest.activityVersions);
 assert.notEqual(next.activitySourceRevision,header.activitySourceRevision);
 assert.deepEqual(planFreeReplica(cached,next).refs.sort(),[A,B]);
});

import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
async function serviceFixture(t){
 let service,elapsed=0,serial=0,hold=null,reads=0;const timers=new Map(),at=1000;
 const frame={tabId:1,frameId:0,documentId:'activity_doc',parentDocumentId:null,actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'activity_service_'+crypto.randomUUID()}),evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>new Date(at).toISOString(),hostObservationGate:(s,r)=>service.activityAdmission(s,r)});
 const privateProof={},provider={async read(){return {principalId:'test',expiresAt:new Date(100000).toISOString(),contexts:[{id:'test-context',kind:'personal'}],providerProfile:activityProfile.providerProfile,transport:'worker-fixed-fetch'};},async withNativeActivity(proof,consume){assert.equal(proof,privateProof);reads++;const scope=service.authority.scopeFor(frame);if(hold)await hold;return consume({observation:{profileId:activityProfile.id,profileVersion:1,scopeKey:scope.key,observedAt:new Date(at).toISOString(),items:[{conversationId:A,updateTime:0}]},signal:new AbortController().signal,isCurrent:()=>true});}};
 service=createHostBindingService({extensionId:'test',repository:base,freeEvidenceRepository:evidence,provider,nativeActivityProfile:activityProfile,profile:{id:'offline-activity-test',singlePersonalDefault:true},getFrame:async()=>({documentId:frame.documentId,url:frame.actualURL,documentLifecycle:'active'}),allowedURL:u=>u==='https://chatgpt.com/',now:()=>at,elapsedNow:()=>elapsed,makeId:()=> 'activity_'+(++serial),schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)});
 t.after(()=>{service.stop();base.close();});
 return {service,evidence,frame,privateProof,get reads(){return reads;},hold(p){hold=p;},async bind(){assert.equal((await service.authority.refresh(frame,'bind')).state,'verified');return service.authority.scopeFor(frame);},expire(){elapsed=6000;for(const [id,x]of [...timers])if(x.at<=elapsed){timers.delete(id);x.fn();}}};
}
test('binding service admits private native activity only with its current scope',async t=>{
 const f=await serviceFixture(t);await assert.rejects(f.service.consumeNativeActivity(f.privateProof,f.frame),/unverified/);assert.equal(f.reads,0);
 const scope=await f.bind();assert((await f.service.consumeNativeActivity(f.privateProof,f.frame)).ok);const before=await f.evidence.read(scope);assert.equal(Object.keys(before.hints).length,2);
 let release;f.hold(new Promise(r=>release=r));const late=f.service.consumeNativeActivity(f.privateProof,f.frame);await new Promise(r=>setImmediate(r));f.service.invalidate({tabId:1,documentId:f.frame.documentId});release();await assert.rejects(late,/stale|unverified/);assert.equal((await f.evidence.read(scope)).revision,before.revision);
});
test('binding service retains nonidle on a hung provider and rejects its late callback',async t=>{
 const f=await serviceFixture(t),scope=await f.bind();let release;f.hold(new Promise(r=>release=r));const pending=f.service.consumeNativeActivity(f.privateProof,f.frame);await new Promise(r=>setImmediate(r));assert.equal(f.service.isIdle(),false);f.expire();await assert.rejects(pending,/timeout/);assert.equal(f.service.isIdle(),false);release();await new Promise(r=>setImmediate(r));assert.equal(f.service.isIdle(),true);assert.equal((await f.evidence.read(scope)).revision,0);
});

test('cancelled activity apply remains nonidle through late rejection with an invalid gate',async()=>{
 const f=fixture(),controller=new AbortController();f.input.context.signal=controller.signal;
 let entered,reject,request;const ready=new Promise(r=>entered=r),wait=new Promise((_,r)=>reject=r);
 f.repo.apply=async(s,r)=>{request=r;assert(f.owner.gate(s,r));entered();return wait;};
 const pending=f.owner.consume(f.input);await ready;controller.abort();await assert.rejects(pending,/stale/);
 try{assert.equal(f.owner.isIdle(),false);assert.equal(f.owner.gate(f.input.context.scope,request),null);}
 finally{reject(Error('late-storage-failure'));await new Promise(r=>setImmediate(r));}
 assert.equal(f.owner.isIdle(),true);assert.equal(f.requests.length,0);
});

import {runLocalUseCase} from './native-activity-cases.mjs';
import {LOCAL_USE_PROFILE} from '../../src/runtime/native-activity-profile.mjs';
test('local recent use persists separately through existing scoped CAS/reopen',async()=>assert.equal((await runLocalUseCase(new MockIDBFactory())).status,'PASS'));
test('local use profile cannot consume server updateTime, missing action or future use',()=>{
 for(const item of [{conversationId:A,updateTime:1},{conversationId:A,usedAt:'2026-10-22T00:00:00Z'},{conversationId:A,usedAt:'2026-10-23T00:00:00Z',actionKey:'click'}])assert.throws(()=>parseNativeActivityRows({profile:LOCAL_USE_PROFILE,observedAt:'2026-10-22T00:00:00Z',items:[item]}));
});
