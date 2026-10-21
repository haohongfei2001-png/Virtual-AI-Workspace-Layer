import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOldCodecRefusal,assertManualStoresRetained,codecFixtureOperation} from './historical-codec-rollback.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {j4AssetBackup,J4_REF} from './fixtures/j4-assets.mjs';

test('same-schema old writer oracle requires the exact codec refusal after database opens',()=>{
 for(const method of ['read','header']){
  const expected={version:4,outcome:'threw',name:'Error',reason:'invalid-native-schema'};
  assertOldCodecRefusal(method,expected);
  for(const wrong of [{...expected,version:3},{...expected,name:'VersionError'},{...expected,reason:'stale-binding'},{...expected,reason:'native-root-revision-conflict'}])assert.throws(()=>assertOldCodecRefusal(method,wrong));
 }
 for(const method of ['apply','invalidate']){
  assertOldCodecRefusal(method,{version:4,outcome:'returned',value:{ok:false,reason:'invalid-native-schema'}});
  for(const value of [{ok:true},{ok:false,reason:'stale-binding'},{ok:false,reason:'revision-conflict'},{ok:false,reason:'invalid-native-schema',committed:true}])assert.throws(()=>assertOldCodecRefusal(method,{version:4,outcome:'returned',value}));
 }
});

test('fence installation preserves other-scope shared assets before the protected baseline is captured',()=>{
 const before={stores:['b23_states','native_states'],rows:{b23_states:[{key:'partition-scope',value:'human-a'},{key:'index-scope',value:'human-b'}],native_states:['old-codec']}};
 const after=structuredClone(before);after.rows.native_states=['new-codec'];assertManualStoresRetained(before,after);
 after.rows.b23_states[1].value='lost';assert.throws(()=>assertManualStoresRetained(before,after),/lifecycle fence changed shared store/);
});

test('compatibility fixture revokes the old incarnation, then legitimately seeds both root formats',async()=>{
 const priorChrome=globalThis.chrome,priorIDB=globalThis.indexedDB;
 globalThis.chrome={runtime:{getURL:path=>new URL('../../'+path,import.meta.url).href}};globalThis.indexedDB=new MockIDBFactory();
 try{for(const indexed of [false,true]){
  const scope={verified:true,provider:'hf_synthetic_only',accountId:'codec-test',organizationId:indexed?'index':'partition'},origin='http://127.0.0.1:48173',args={scope,origin,indexed};
  const seeded=await codecFixtureOperation({...args,action:'seed',bundle:j4AssetBackup(scope,origin)});assert.equal(seeded.version,4);
  const fenced=await codecFixtureOperation({...args,action:'fence'}),restored=await codecFixtureOperation({...args,action:'restored'});
  assert.equal(fenced.header.storageFormat,indexed?'vaiwl-native-version-index-v2':'vaiwl-native-partitions-v2');assert.deepEqual(restored.fence,fenced.fence);assert(!restored.projectedIds.includes(J4_REF));assert(restored.projectedIds.includes('codec-survivor'));
 }}finally{if(priorChrome===undefined)delete globalThis.chrome;else globalThis.chrome=priorChrome;if(priorIDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=priorIDB;}
});
