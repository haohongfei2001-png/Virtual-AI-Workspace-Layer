import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {digest} from '../../src/data/hash.mjs';

async function setup(account='A',conversationId='T0') {
 const frame={documentId:'free_page_document',documentLifecycle:'active',url:`https://vaiwl-hf.test/hf/${account}/c/${conversationId}`};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:'free_extension',getFrame:async()=>frame});
 const sender={id:'free_extension',tab:{id:1},frameId:0,...frame};let seq=0,leaseId;
 const call=async(type,extra={})=>service.broker.handle({v:1,clientId:'free_page_test',seq:++seq,type,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const binding=await call('BIND');assert.equal(binding.ok,true);leaseId=binding.leaseId;
 const header=async()=>{const result=await call('B23_FREE_HEADER');assert.equal(result.ok,true,JSON.stringify(result));return result.header;};
 const page=(head,ids)=>call('B23_FREE_PAGE',{revision:head.revision,offset:0,limit:500,ids,viewSession:head.viewSession,now:FIXTURE_NOW});
 return {service,call,header,page,scope:scopeOf(account),close:()=>service.close()};
}

test('MOCK_IDB Free HEADER/PAGE bind scope and native IDs; unavailable rows are explicitly omitted',async()=>{
 const h=await setup();try{
  const header=await h.header();assert.equal(header.scope,h.scope.key??(await h.service.native.read(h.scope)).scopeKey);
  assert.deepEqual(Object.keys(header.manifest.projectVersions),['P1','P2']);assert.equal(Object.keys(header.manifest.refVersions).length,604);
  assert.equal(Object.hasOwn(header.manifest.projectVersions,'W0'),false);
  const reply=await h.page(header,{projects:['P1','P2'],refs:['T0','T1','T2','T401']});assert.equal(reply.ok,true,JSON.stringify(reply));
  const page=reply.page;assert.equal(page.scope,header.scope);assert.equal(page.revision,header.revision);
  assert.deepEqual(page.selectedRefs,['T0','T1','T2','T401']);assert.deepEqual(page.omittedRefs,['T401']);
  assert.equal(page.refs.find(row=>row.id==='T0').membership,'NONE');assert.equal(page.refs.find(row=>row.id==='T0').nativeTitle,'从哪里开始');
  assert.equal(page.refs.find(row=>row.id==='T1').projectId,'P1');assert.equal(page.refs.find(row=>row.id==='T2').projectId,'P2');
  assert(page.projects.every(row=>row.members.length===0),'pages must not invent complete project membership');
  const spoof=await h.call('B23_FREE_HEADER',{scope:'other'});assert.equal(spoof.ok,false);
 }finally{h.close();}
});

test('MOCK_IDB legacy-only known ref gets version zero and UNKNOWN reachability, never a copied Pro title',async()=>{
 const h=await setup();try{
  await h.header();const {state}=await h.service.workspaces.read(h.scope);
  const added=await h.service.workspaces.ingest(h.scope,{operationId:'legacy_only',expectedRevision:state.revision,batch:{schema:'vaiwl-internal-evidence-v1',sources:[],events:[],coverage:[],refs:[{id:'legacy_only',nativeUrl:'https://vaiwl-hf.test/hf/A/c/legacy_only',projectId:null,nativeTitle:'旧原名',available:true}]}});
  assert.equal(added.ok,true,JSON.stringify(added));
  const head=await h.header();assert.equal(head.manifest.refVersions.legacy_only,0);
  const reply=await h.page(head,{projects:[],refs:['legacy_only']});assert.equal(reply.ok,true,JSON.stringify(reply));
  assert.equal(reply.page.refs[0].membership,'UNKNOWN');assert.equal(reply.page.refs[0].nativeTitle,null);assert.deepEqual(reply.page.omittedRefs,[]);
 }finally{h.close();}
});

test('MOCK_IDB native change invalidates old page revision and cannot mix title generations',async()=>{
 const h=await setup();try{
  const header=await h.header(),facts=await h.service.native.read(h.scope),old=facts.refs.T0;
  const changed=await h.service.native.apply(h.scope,{operationId:'rename',expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:2,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:[],refs:[{id:old.id,nativeTitle:'更新原名',nativeUrl:old.nativeUrl,availability:old.availability}],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
  assert.equal(changed.ok,true);const stale=await h.page(header,{projects:[],refs:['T0']});assert.equal(stale.ok,false);assert.equal(stale.reason,'snapshot-revision-changed');
  const fresh=await h.page(await h.header(),{projects:[],refs:['T0']});assert.equal(fresh.page.refs[0].nativeTitle,'更新原名');
 }finally{h.close();}
});

test('MOCK_IDB synthetic send hint is durable and idempotent without renewing observedAt or creating duplicate facts',async()=>{
 const h=await setup('A','new_test');try{
  await h.header();const send={conversationId:'new_test',messageId:'new_message',projectId:null,nativeTitle:'真正新原名'};
  const first=await h.call('B23_SYNTHETIC_SEND',send);assert.equal(first.ok,true,JSON.stringify(first));
  const before=await h.service.evidence.read(h.scope),stateBefore=(await h.service.workspaces.read(h.scope)).state,nativeBefore=await h.service.native.read(h.scope);
  const repeat=await h.call('B23_SYNTHETIC_SEND',send);assert.equal(repeat.ok,true,JSON.stringify(repeat));
  assert.deepEqual(await h.service.evidence.read(h.scope),before);assert.equal((await h.service.workspaces.read(h.scope)).state.revision,stateBefore.revision);assert.equal((await h.service.native.read(h.scope)).revision,nativeBefore.revision);
  const key=digest(['new_test','new_message']),hint=before.hints['hint_'+key];assert.equal(hint.hintType,'local-confirmed-send');assert.equal(hint.observedAt,FIXTURE_NOW);assert.equal(Object.hasOwn(hint,'sentAt'),false);
  const page=await h.page(await h.header(),{projects:[],refs:['new_test']});assert.equal(page.page.refs[0].membership,'NONE');assert.equal(page.page.refs[0].activityDecision.segment,0);
  const preference=await h.service.workspaces.command(h.scope,{operationId:'new_workset',expectedRevision:stateBefore.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['new_test'],current:'new_test'}}});assert.equal(preference.ok,true,JSON.stringify(preference));
 }finally{h.close();}
});

test('MOCK_IDB source observations cannot claim another conversation route',async()=>{
 const h=await setup();try{
  await h.header();const result=await h.call('B23_SYNTHETIC_SEND',{conversationId:'another_ref',messageId:'m',projectId:null,nativeTitle:'错误目标'});
  assert.equal(result.ok,false);assert.equal(result.reason,'synthetic-send-route-mismatch');assert.equal(Object.keys((await h.service.evidence.read(h.scope)).hints).length,0);
 }finally{h.close();}
});

test('MOCK_IDB a separately trusted fresh source can report complete inventory after old source revocation',async()=>{
 const h=await setup();try{
  await h.header();const facts=await h.service.native.read(h.scope);
  assert.equal((await h.service.native.invalidate(h.scope,{operationId:'revoke_old_inventory',expectedRevision:facts.revision,sourceId:'native_fixture_v1'})).ok,true);
  const {NativeRepository}=await import('../../src/data/native-repository.mjs');
  const fresh=new NativeRepository({baseRepository:h.service.repository,clock:()=>FIXTURE_NOW,observationGate:()=>({channel:'synthetic',sourceId:'fresh_inventory',generation:'fresh_generation'})});
  assert.equal((await fresh.apply(h.scope,{operationId:'fresh_inventory',expectedRevision:facts.revision+1,batch:{scopeKey:facts.scopeKey,sourceRevision:1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:[],refs:[{id:'T0',nativeTitle:'重新核验的原名',nativeUrl:facts.refs.T0.nativeUrl,availability:'available'}],membership:[{id:'T0',state:'NONE',projectId:null}],inventory:{projects:'complete',conversations:'complete',cursor:null}}})).ok,true);
  const head=await h.header();assert.equal(head.inventoryComplete,true);
  const page=await h.page(head,{projects:[],refs:['T0']});assert.equal(page.page.refs[0].nativeTitle,'重新核验的原名');
  assert.equal((await h.service.native.read(h.scope)).sources.native_fixture_v1.revoked,true);
 }finally{h.close();}
});
