import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {emptyNativeFacts} from '../../src/data/native-facts.mjs';
import {digest} from '../../src/data/hash.mjs';
const now='2026-10-13T00:00:00Z';
const request=()=>({operationId:'register_native',expectedRevision:0,batch:{scopeKey:emptyNativeFacts(A).scopeKey,sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'new_native_ref',nativeTitle:'新增原生聊天',nativeUrl:'https://vaiwl-hf.test/hf/A/c/new_native_ref',availability:'available'}],membership:[{id:'new_native_ref',state:'NONE',projectId:null}],inventory:{projects:'partial',conversations:'partial',cursor:null}}});
async function setup(partitioned){const h=await harness(new MockIDBFactory());await h.command({type:'SET_TITLE',refId:'T0',title:'必须保留的Pro人工标题'});if(partitioned)assert.equal((await h.repo.migratePartitioned(A)).ok,true);return {...h,native:new NativeRepository({baseRepository:h.base,workspaceRepository:h.repo,observationGate:()=>({channel:'synthetic',sourceId:'native_shared',generation:'first'}),clock:()=>now})};}

for(const partitioned of [false,true]){
 test(`MOCK_IDB native shared reference supports workset/snippet and keeps Pro assets (${partitioned?'F1 partitions':'legacy root'})`,async()=>{
  const h=await setup(partitioned);try{
   const before=(await h.repo.read(A)).state;
   const result=await h.native.apply(A,request());assert.equal(result.ok,true,JSON.stringify(result));
   const state=(await h.repo.read(A)).state;assert.equal(state.revision,before.revision+1);
   for(const field of ['identities','placements','workspaces','preferences'])assert.deepEqual(state[field],before[field],field);
   assert.equal(state.refs.new_native_ref.nativeTitle,'新增原生聊天');assert.equal((await h.base.get(A,'new_native_ref')).nativeUrl,'https://vaiwl-hf.test/hf/A/c/new_native_ref');
   assert.equal((await h.native.snapshot(A)).noProject[0].id,'new_native_ref');
   const workset=await h.repo.command(A,{operationId:'new_workset',expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['new_native_ref'],current:'new_native_ref'}}});assert.equal(workset.ok,true,JSON.stringify(workset));
   const snippet=await h.repo.command(A,{operationId:'new_snippet',expectedRevision:workset.revision,command:{type:'SET_PREFERENCE',id:'savedSnippets',value:[{id:'s',refId:'new_native_ref',messageId:'m',branchId:'b',text:'人工选择的片段',bodyHash:digest('人工选择的片段')}]}});assert.equal(snippet.ok,true,JSON.stringify(snippet));
   assert.equal((await h.native.apply(A,request())).replayed,true);assert.equal((await h.repo.read(A)).state.revision,snippet.revision);
  }finally{h.close();}
 });
 test(`MOCK_IDB native publication failure rolls back shared refs/metadata/receipts (${partitioned?'F1 partitions':'legacy root'})`,async()=>{
  const h=await setup(partitioned);try{
   const before=(await h.repo.read(A)).state,db=await h.base.open(),original=db.transaction.bind(db);
   let injected=false;
   db.transaction=(stores,mode)=>{const tx=original(stores,mode),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='native_states'&&mode==='readwrite'){const put=store.put.bind(store);store.put=value=>{if(!injected){injected=true;throw Error('injected-native-publication-failure');}return put(value);};}return store;};return tx;};
   const failed=await h.native.apply(A,request());db.transaction=original;
   assert.equal(injected,true);assert.equal(failed.ok,false);assert.equal(failed.reason,'injected-native-publication-failure');
   assert.deepEqual((await h.repo.read(A)).state,before);assert.equal(await h.base.get(A,'new_native_ref'),null);assert.equal((await h.native.read(A)).revision,0);
   const retried=await h.native.apply(A,request());assert.equal(retried.ok,true,JSON.stringify(retried));assert.equal(retried.replayed,false);
  }finally{h.close();}
 });
}
