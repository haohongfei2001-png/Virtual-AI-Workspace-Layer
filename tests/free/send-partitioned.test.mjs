import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf} from '../../simulator/data.mjs';
async function setup(conversationId='T1',partitioned=true){
 const frame={documentId:'send_document',documentLifecycle:'active',url:`https://vaiwl-hf.test/hf/A/c/${conversationId}`},sender={id:'send_extension',tab:{id:1},frameId:0,...frame};
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame});let seq=0,leaseId;
 const call=(type,extra={})=>service.broker.handle({v:1,type,clientId:'send_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 leaseId=(await call('BIND')).leaseId;assert.equal((await call('B23_FREE_HEADER')).ok,true);
 if(partitioned)assert.equal((await service.workspaces.migratePartitioned(scopeOf('A'))).ok,true);
 return {service,call,frame,scope:scopeOf('A'),conversationId};
}
for(const scenario of [{name:'existing project',id:'T1',projectId:'P1'},{name:'new chat known project',id:'new_project_chat',projectId:'P1'},{name:'move between known projects',id:'T1',projectId:'P2'}])test(`partitioned send ${scenario.name} uses only explicit native ref page and shared partial read`,async()=>{
 const h=await setup(scenario.id);try{
  const originalNative=h.service.native.read.bind(h.service.native),originalShared=h.service.workspaces.read.bind(h.service.workspaces),page=h.service.native.page.bind(h.service.native),seen=[];
  const before=await originalNative(h.scope),title=before.refs[scenario.id]?.nativeTitle??'新的原生名';
  h.service.native.read=()=>{throw Error('unexpected-full-native-read');};h.service.workspaces.read=()=>{throw Error('unexpected-full-shared-read');};
  h.service.native.page=(scope,query,options)=>{seen.push(query.ids);return page(scope,query,options);};
  const request={conversationId:scenario.id,messageId:'message_one',projectId:scenario.projectId,nativeTitle:title};
  const result=await h.call('B23_SYNTHETIC_SEND',request);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(seen,[{projects:[],refs:[scenario.id]}]);
  const facts=await originalNative(h.scope);assert.equal(facts.membership[scenario.id].projectId,scenario.projectId);assert.equal(facts.refs[scenario.id].nativeTitle,title);
  const beforeReplay=await originalShared(h.scope),evidenceBefore=await h.service.evidence.read(h.scope);const replay=await h.call('B23_SYNTHETIC_SEND',request);assert.equal(replay.ok,true,JSON.stringify(replay));
  assert.deepEqual((await originalShared(h.scope)).state,beforeReplay.state);assert.deepEqual(await h.service.evidence.read(h.scope),evidenceBefore);
 }finally{h.service.close();}
});
test('legacy shared state retains fallback while synthetic native observation remains bounded',async()=>{
 const h=await setup('T1',false);try{
  const original=h.service.workspaces.read.bind(h.service.workspaces);let reads=0;h.service.workspaces.read=(...args)=>{reads++;return original(...args);};h.service.native.read=()=>{throw Error('unexpected-full-native-read');};
  const result=await h.call('B23_SYNTHETIC_SEND',{conversationId:'T1',messageId:'legacy_send',projectId:'P1',nativeTitle:'旧结构标题'});assert.equal(result.ok,true,JSON.stringify(result));assert(reads>0);assert.equal(await h.service.workspaces.partitioned.manifest(h.scope),null);
 }finally{h.service.close();}
});
test('wrong route or page-supplied scope is rejected before any send reads',async()=>{
 const h=await setup();try{
  h.service.native.page=()=>{throw Error('must-not-read');};h.service.workspaces.partitioned.partialContext=()=>{throw Error('must-not-read');};
  const result=await h.call('B23_SYNTHETIC_SEND',{conversationId:'T2',messageId:'wrong',projectId:'P1',nativeTitle:'wrong'});assert.equal(result.ok,false);assert.equal(result.reason,'synthetic-send-route-mismatch');
  const spoof=await h.call('B23_SYNTHETIC_SEND',{scope:'B',conversationId:'T1',messageId:'wrong_scope',projectId:'P1',nativeTitle:'wrong'});assert.equal(spoof.ok,false);
 }finally{h.service.close();}
});
test('account invalidation after bounded read prevents shared/native/evidence send writes',async()=>{
 const h=await setup();try{
  const before=(await h.service.workspaces.read(h.scope)).state,nativeBefore=await h.service.native.read(h.scope),evidenceBefore=await h.service.evidence.read(h.scope),page=h.service.native.page.bind(h.service.native);
  h.service.native.page=async(...args)=>{const result=await page(...args);h.frame.url=h.frame.url.replace('/hf/A/','/hf/B/');h.service.broker.invalidate({tabId:1});return result;};
  const result=await h.call('B23_SYNTHETIC_SEND',{conversationId:'T1',messageId:'late',projectId:'P2',nativeTitle:'must not write'});assert.equal(result.ok,false);assert.match(result.reason,/stale|binding/);
  assert.deepEqual((await h.service.workspaces.read(h.scope)).state,before);assert.deepEqual(await h.service.native.read(h.scope),nativeBefore);assert.deepEqual(await h.service.evidence.read(h.scope),evidenceBefore);
 }finally{h.service.close();}
});
