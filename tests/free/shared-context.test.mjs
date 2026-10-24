import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {createFixtureService} from '../../simulator/service.mjs';
import {scopeOf,FIXTURE_NOW} from '../../simulator/data.mjs';
const scope=scopeOf('A');
async function serviceHarness(partitioned){
 const frame={documentId:'context_document',documentLifecycle:'active',url:'https://vaiwl-hf.test/hf/A/c/T0'},sender={id:'context_extension',tab:{id:1},frameId:0,...frame};let seq=0,leaseId;
 const service=createFixtureService({indexedDB:new MockIDBFactory(),extensionId:sender.id,getFrame:async()=>frame});
 const send=(type,extra={})=>service.broker.handle({v:1,type,clientId:'context_client',seq:++seq,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 leaseId=(await send('BIND')).leaseId;
 let state=(await service.workspaces.read(scope)).state;
 assert.equal((await service.workspaces.command(scope,{operationId:'human_title',expectedRevision:state.revision,command:{type:'SET_TITLE',refId:'T0',title:'保留人工作品'}})).ok,true);
 state=(await service.workspaces.read(scope)).state;assert.equal((await service.workspaces.command(scope,{operationId:'workset',expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['T9'],current:'T9'}}})).ok,true);
 if(partitioned)assert.equal((await service.workspaces.migratePartitioned(scope)).ok,true);
 const page=header=>send('B23_FREE_PAGE',{revision:header.revision,offset:0,limit:5000,ids:{projects:[],refs:['T0']},viewSession:header.viewSession,now:FIXTURE_NOW});
 return {service,send,page,close:()=>service.close()};
}
test('partialContext state and manifest are coherent in one transaction while a concurrent human edit queues',async()=>{
 const h=await harness(new MockIDBFactory());try{
  await h.command({type:'SET_TITLE',refId:'T0',title:'before'});await h.repo.migratePartitioned(A);const before=(await h.repo.read(A)).state;
  const original=h.repo.partitioned.loadMutation.bind(h.repo.partitioned);let write;
  h.repo.partitioned.loadMutation=(...args)=>{h.repo.partitioned.loadMutation=original;write=h.command({type:'SET_TITLE',refId:'T0',title:'after'});return original(...args);};
  const context=await h.repo.partitioned.partialContext(A,['T0']);assert.equal(context.state.revision,context.manifest.revision);assert.equal(context.state.revision,before.revision);assert.equal(context.state.scopeKey,context.manifest.scopeKey);assert.equal(context.state.identities.T0.title,'before');assert.equal(context.manifest.refVersions.T0,before.revision);
  assert.equal((await write).ok,true);assert.equal((await h.repo.read(A)).state.identities.T0.title,'after');assert.equal(context.state.identities.T0.title,'before');
 }finally{h.close();}
});
test('partitioned Free HEADER uses metadata without loading human preference ref pieces',async()=>{
 const h=await serviceHarness(true);try{assert.equal((await h.send('B23_FREE_HEADER')).ok,true);const before=(await h.service.workspaces.read(scope)).state;const p=h.service.workspaces.partitioned,original=p.loadMutation;let loads=0;p.loadMutation=()=>{loads++;throw Error('header-must-not-load-pieces');};
  const response=await h.send('B23_FREE_HEADER');p.loadMutation=original;assert.equal(response.ok,true,JSON.stringify(response));assert.equal(loads,0);assert.deepEqual(response.header.preferences,before.preferences);assert.equal(response.header.workspaceRevision,before.revision);assert.equal(Object.keys(response.header.manifest.refVersions).length,Object.keys(before.refs).length);
  assert.deepEqual((await h.service.workspaces.read(scope)).state,before);
 }finally{h.close();}
});
test('partitioned Free PAGE uses one partialContext and retains shared human metadata without another manifest read',async()=>{
 const h=await serviceHarness(true);try{const header=(await h.send('B23_FREE_HEADER')).header,before=(await h.service.workspaces.read(scope)).state,p=h.service.workspaces.partitioned,partial=p.partialContext.bind(p),manifest=p.manifest.bind(p);let calls=0;
  p.partialContext=(...args)=>{calls++;return partial(...args);};p.manifest=()=>{throw Error('page-must-not-read-separate-shared-manifest');};
  const result=await h.page(header);p.manifest=manifest;assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.equal(result.page.workspaceRevision,before.revision);assert.equal(result.page.refs.find(r=>r.id==='T0').nativeTitle,'从哪里开始');assert.equal(JSON.stringify(result.page).includes('保留人工作品'),false);
  const context=await partial(scope,['T0']);assert.deepEqual(context.state.preferences,before.preferences);assert.equal(context.state.identities.T0.title,'保留人工作品');assert(context.state.refs.T9,'working-set reference remains valid in partial context');assert.deepEqual((await h.service.workspaces.read(scope)).state,before);
 }finally{h.close();}
});
test('legacy partialContext returns null and Free HEADER/PAGE fallback preserves preferences and Pro assets',async()=>{
 const h=await serviceHarness(false);try{const before=(await h.service.workspaces.read(scope)).state;assert.equal(await h.service.workspaces.partitioned.partialContext(scope,['T0']),null);
  const response=await h.send('B23_FREE_HEADER');assert.equal(response.ok,true);assert.deepEqual(response.header.preferences,before.preferences);const result=await h.page(response.header);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.page.workspaceRevision,before.revision);assert.equal(result.page.refs.find(r=>r.id==='T0').nativeTitle,'从哪里开始');assert.deepEqual((await h.service.workspaces.read(scope)).state,before);
 }finally{h.close();}
});
