/** Synthetic MockIDB contracts, not real Chrome scheduling or production authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
import {digest} from '../../src/data/hash.mjs';
const scope=scopeOf('A');
const send={conversationId:'T0',messageId:'retry_message',projectId:null,nativeTitle:'原生发送后的名称'};
const key=digest([send.conversationId,send.messageId]);
async function setup(){
 const frame={documentId:'send_retry_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:'send_retry_extension',getFrame:async()=>frame});
 const sender={id:'send_retry_extension',tab:{id:1},frameId:0,...frame};let seq=0,leaseId;
 const call=(type,extra={})=>service.broker.handle({v:1,clientId:'send_retry_client',seq:++seq,type,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const binding=await call('BIND');assert(binding.ok);leaseId=binding.leaseId;assert((await call('B23_FREE_HEADER')).ok);
 assert((await service.workspaces.partitioned.migrate(scope)).ok);
 return {service,call,close:()=>service.close(),partial:()=>service.workspaces.partitioned.partial(scope,['T0','T1']),send:()=>call('B23_SYNTHETIC_SEND',send)};
}
const event=(conversationId)=>({id:'send_'+key,sourceId:'fixture_v1',conversationId,messageId:send.messageId,branchId:'fixture_main',role:'user',kind:'new-send',sendState:'committed',sentAt:FIXTURE_NOW,precision:'millisecond',observedAt:FIXTURE_NOW});
async function assertOneSend(h){
 const state=await h.partial(),evidence=(await h.service.evidence.page(scope,{ids:['T0']})).evidence;
 assert.equal(Object.values(state.events).filter(e=>e.id==='send_'+key).length,1);
 assert.equal(state.events['send_'+key].conversationId,'T0');
 assert.equal(Object.values(evidence.hints).filter(e=>e.eventKey===key).length,1);
 assert.equal(evidence.hints['hint_'+key].observedAt,FIXTURE_NOW);
 return evidence;
}
for(const preferenceDependency of [false,true])test(`partitioned send rejects globally occupied event ID, preference dependency=${preferenceDependency}`,async()=>{
 const h=await setup();try{
  const before=await h.partial();assert((await h.service.workspaces.ingest(scope,{operationId:'occupy_send_id',expectedRevision:before.revision,batch:{schema:'vaiwl-internal-evidence-v1',refs:[],sources:[],events:[event('T1')],coverage:[]}})).ok);
  if(preferenceDependency){const state=await h.partial();assert((await h.service.workspaces.command(scope,{operationId:'include_collision_ref',expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['T1'],current:'T1'}}})).ok);}
  const revision=(await h.partial()).revision,nativeRevision=await h.service.native.version(scope);
  const result=await h.send();assert.equal(result.ok,false);assert.equal(result.reason,'evidence-id-conflict');
  const after=await h.partial();assert.equal(after.revision,revision);assert.equal(after.events['send_'+key].conversationId,'T1');
  assert.equal((await h.service.evidence.header(scope)).revision,0);assert.equal(await h.service.native.version(scope),nativeRevision);
 }finally{h.close();}
});
test('shared CAS conflict after partial read retries with one event and one hint',async()=>{
 const h=await setup();try{
  const ingest=h.service.workspaces.ingest.bind(h.service.workspaces);let raced=false;
  h.service.workspaces.ingest=async(s,command,options)=>{
   if(!raced&&command.operationId==='fixture_send_'+key){raced=true;const changed=await h.service.workspaces.command(s,{operationId:'race_shared_preference',expectedRevision:command.expectedRevision,command:{type:'SET_PREFERENCE',id:'compactRows',value:true}});assert(changed.ok,JSON.stringify(changed));}
   return ingest(s,command,options);
  };
  const first=await h.send();assert.equal(first.ok,false);assert.equal(first.reason,'revision-conflict');
  assert.equal((await h.service.evidence.header(scope)).revision,0);assert.equal((await h.partial()).events['send_'+key],undefined);
  assert.equal((await h.send()).ok,true);const evidence=await assertOneSend(h),revision=(await h.partial()).revision;
  assert.equal((await h.send()).ok,true);assert.deepEqual((await h.service.evidence.page(scope,{ids:['T0']})).evidence,evidence);assert.equal((await h.partial()).revision,revision);
 }finally{h.close();}
});
test('native CAS conflict after event and hint commits retries without duplicate or hint TTL renewal',async()=>{
 const h=await setup();try{
  const apply=h.service.native.apply.bind(h.service.native);let raced=false;
  h.service.native.apply=async(s,command,options)=>{
   if(!raced&&command.operationId==='fixture_native_send_'+key){raced=true;const page=await h.service.native.page(s,{ids:{projects:[],refs:['T1']}}),r=page.facts.refs.T1;
    const changed=await apply(s,{operationId:'race_native_title',expectedRevision:command.expectedRevision,batch:{scopeKey:page.facts.scopeKey,sourceRevision:page.facts.sources.native_fixture_v1.sourceRevision+1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z',projects:[],refs:[{id:r.id,nativeTitle:'并发更新',nativeUrl:r.nativeUrl,availability:r.availability}],membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}}});assert(changed.ok,JSON.stringify(changed));
   }return apply(s,command,options);
  };
  const first=await h.send();assert.equal(first.ok,false);assert.equal(first.reason,'revision-conflict');
  const evidence=await assertOneSend(h);assert.equal((await h.send()).ok,true);
  assert.deepEqual((await h.service.evidence.page(scope,{ids:['T0']})).evidence,evidence);
  const facts=(await h.service.native.page(scope,{ids:{projects:[],refs:['T0','T1']}})).facts;
  assert.equal(facts.refs.T0.nativeTitle,send.nativeTitle);assert.equal(facts.refs.T1.nativeTitle,'并发更新');
  const revision=(await h.partial()).revision,nativeRevision=facts.revision;
  assert.equal((await h.send()).ok,true);await assertOneSend(h);assert.equal((await h.partial()).revision,revision);assert.equal(await h.service.native.version(scope),nativeRevision);
 }finally{h.close();}
});
test('binding invalidation after scoped reads rejects all synthetic send writes',async()=>{
 const h=await setup();try{
  const before=await h.partial(),nativeRevision=await h.service.native.version(scope),page=h.service.native.page.bind(h.service.native);let invalidated=false;
  h.service.native.page=async(...args)=>{const result=await page(...args);if(!invalidated){invalidated=true;h.service.broker.invalidate({tabId:1,frameId:0});}return result;};
  const result=await h.send();assert.equal(result.ok,false);assert.match(result.reason,/stale|invalidated/);
  assert.equal((await h.partial()).revision,before.revision);assert.equal((await h.partial()).events['send_'+key],undefined);
  assert.equal((await h.service.evidence.header(scope)).revision,0);assert.equal(await h.service.native.version(scope),nativeRevision);
 }finally{h.close();}
});
for(const conflict of ['messageId','branchId','sourceId','revoked'])test(`same-ref ${conflict} conflict fails before hint/native writes`,async()=>{
 const h=await setup();try{
  const before=await h.partial(),row=event('T0'),sources=[];
  if(conflict==='sourceId'){
   row.sourceId='other_source';sources.push({id:'other_source',channel:'synthetic-test',observedAt:FIXTURE_NOW,description:'Independent synthetic event provenance'});
  }else if(conflict!=='revoked')row[conflict]='different_'+conflict;
  const inserted=await h.service.workspaces.ingest(scope,{operationId:'same_ref_collision',expectedRevision:before.revision,batch:{schema:'vaiwl-internal-evidence-v1',refs:[],sources,events:[row],coverage:[]}});assert(inserted.ok,JSON.stringify(inserted));
  if(conflict==='revoked'){
   const revoked=await h.service.workspaces.command(scope,{operationId:'revoke_existing_send',expectedRevision:inserted.revision,command:{type:'REVOKE_EVIDENCE',table:'events',id:row.id}});assert(revoked.ok,JSON.stringify(revoked));
  }
  const current=await h.partial(),nativeRevision=await h.service.native.version(scope);let hintWrites=0,nativeWrites=0;
  const evidenceApply=h.service.evidence.apply.bind(h.service.evidence),nativeApply=h.service.native.apply.bind(h.service.native);
  h.service.evidence.apply=(...args)=>{hintWrites++;return evidenceApply(...args);};
  h.service.native.apply=(...args)=>{nativeWrites++;return nativeApply(...args);};
  const result=await h.send();assert.equal(result.ok,false);assert.equal(result.reason,'evidence-id-conflict');
  assert.equal(hintWrites,0);assert.equal(nativeWrites,0);assert.equal((await h.service.evidence.header(scope)).revision,0);
  const after=await h.partial();assert.equal(after.revision,current.revision);assert.deepEqual(after.events[row.id],current.events[row.id]);
  assert.equal(await h.service.native.version(scope),nativeRevision);
 }finally{h.close();}
});
