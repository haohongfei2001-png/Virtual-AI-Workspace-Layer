import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {A,B} from '../b23/contracts.mjs';
import {nativeRecord,nativePartitionKey} from '../../src/data/native-partitions.mjs';
const scope=normalizedScope(A),otherScope=normalizedScope(B),NOW='2026-10-13T00:00:00Z';
async function fixture(){
 const factory=new MockIDBFactory(),name='index_prepare_'+crypto.randomUUID(),base=new ScopeRepository({indexedDB:factory,databaseName:name});
 const make=base=>new NativeRepository({baseRepository:base,clock:()=>NOW,observationGate:()=>({channel:'synthetic',sourceId:'fixture',generation:'one'})}),native=make(base),workspace=new WorkspaceRepository({baseRepository:base});
 async function seed(s){return native.apply(s,{operationId:'seed',expectedRevision:0,batch:{scopeKey:s.key,sourceRevision:1,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',projects:[{id:'P',nativeName:'Native P',nativeUrl:'https://fixture.test/project/P',availability:'available',memberCount:1}],refs:[{id:'C',nativeTitle:'Native C',nativeUrl:'https://fixture.test/c/C',availability:'available'}],membership:[{id:'C',state:'PROJECT',projectId:'P'}],inventory:{projects:'complete',conversations:'complete',cursor:null}}});}
 assert.equal((await seed(scope)).ok,true);const stores=factory.databasesMap.get(name).stores,rows=stores.get('native_states').rows;
 return {factory,name,base,native,workspace,make,seed,rows,dump:()=>structuredClone([...stores].map(([n,s])=>[n,[...s.rows]])),prepare:(s=scope,options={})=>native.prepareVersionIndex(s,{expectedRevision:1},options),migrate:(options={})=>native.migrateVersionIndex(scope,{operationId:'index',expectedRevision:1},options)};
}
test('preparation is read-only, repeated bytes are not rebuilt, final migration preserves facts and human assets',async()=>{
 const h=await fixture();try{const revision=(await h.workspace.read(A)).state.revision;assert.equal((await h.workspace.command(A,{operationId:'human',expectedRevision:revision,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Preserve Pro'}})).ok,true);const facts=await h.native.read(scope),human=(await h.workspace.read(A)).state,before=h.dump();assert.deepEqual(await h.prepare(),{ok:true,prepared:true});assert.deepEqual(h.dump(),before);assert.deepEqual(await h.prepare(),{ok:true,prepared:false});assert.deepEqual(h.dump(),before);assert.equal((await h.migrate()).ok,true);assert.deepEqual(await h.native.read(scope),{...facts,revision:2});assert.deepEqual((await h.workspace.read(A)).state,human);assert.deepEqual(await h.native.prepareVersionIndex(scope,{expectedRevision:2}),{ok:true,prepared:false,alreadyIndexed:true});}finally{h.base.close();}
});
test('same revision legally rechecksummed root change cannot publish stale prepared source metadata',async()=>{
 const h=await fixture();try{assert.equal((await h.prepare()).prepared,true);const row=structuredClone(h.rows.get(scope.key));row.payload.sources.fixture.validUntil='2026-10-15T00:00:00Z';h.rows.set(scope.key,nativeRecord(scope.key,row.payload));const fresh=await h.native.read(scope);assert.equal((await h.migrate()).ok,true);assert.deepEqual(await h.native.read(scope),{...fresh,revision:2});assert.equal((await h.native.read(scope)).sources.fixture.validUntil,'2026-10-15T00:00:00Z');}finally{h.base.close();}
});
for(const defect of ['checksum','missing'])test('prepared root never exempts current piece '+defect+' from audit or rollback',async()=>{
 const h=await fixture();try{await h.prepare();const key=nativePartitionKey(scope.key,'refs','C',1);if(defect==='missing')h.rows.delete(key);else h.rows.get(key).checksum='bad';const before=h.dump(),r=await h.migrate();assert.equal(r.ok,false);assert.deepEqual(h.dump(),before);}finally{h.base.close();}
});
test('same owner different scope and different owner same scope cannot share prepared candidates',async()=>{
 const h=await fixture();let peerBase;try{await h.prepare();peerBase=new ScopeRepository({indexedDB:h.factory,databaseName:h.name});const peer=h.make(peerBase);assert.equal((await peer.prepareVersionIndex(scope,{expectedRevision:1})).prepared,true);assert.equal((await h.seed(otherScope)).ok,true);assert.equal((await h.prepare(otherScope)).prepared,true);const a=await h.native.read(scope),b=await h.native.read(otherScope);assert.equal((await h.migrate()).ok,true);assert.deepEqual(await h.native.read(scope),{...a,revision:2});assert.deepEqual(await h.native.read(otherScope),b);}finally{peerBase?.close();h.base.close();}
});
test('prepare rejects stale CAS and authority, abort does not install candidate',async()=>{
 const h=await fixture();try{const before=h.dump();assert.equal((await h.native.prepareVersionIndex(scope,{expectedRevision:0})).reason,'revision-conflict');await assert.rejects(h.prepare(scope,{guard:()=>false}),/stale-binding/);const signal=AbortSignal.abort();await assert.rejects(h.prepare(scope,{signal}),/stale-binding/);let checks=0;assert.equal((await h.prepare(scope,{guard:()=>++checks<3})).ok,false);assert.deepEqual(h.dump(),before);assert.equal((await h.prepare()).prepared,true,'aborted candidate must not be published');}finally{h.base.close();}
});
test('prepared migration still requires final CAS and final guard, failures leave stores unchanged',async()=>{
 const h=await fixture();try{await h.prepare();const before=h.dump();assert.equal((await h.native.migrateVersionIndex(scope,{operationId:'wrong',expectedRevision:0})).reason,'revision-conflict');let checks=0;const r=await h.migrate({guard:()=>++checks<5});assert.equal(r.ok,false);assert.deepEqual(h.dump(),before);assert.equal((await h.migrate()).ok,true);}finally{h.base.close();}
});
test('prepared migration signal cancellation refuses without writes and may explicitly retry',async()=>{
 const h=await fixture();try{await h.prepare();const before=h.dump();await assert.rejects(h.migrate({signal:AbortSignal.abort()}),/stale-binding/);assert.deepEqual(h.dump(),before);assert.equal((await h.migrate()).ok,true);}finally{h.base.close();}
});
test('same checksum and revisions with reordered root keys publishes fresh ordinal order',async()=>{
 const h=await fixture();try{
  const second=await h.native.apply(scope,{operationId:'second',expectedRevision:1,batch:{scopeKey:scope.key,sourceRevision:2,observedAt:NOW,validUntil:'2026-10-14T00:00:00Z',projects:[{id:'Q',nativeName:'Native Q',nativeUrl:'https://fixture.test/project/Q',availability:'available',memberCount:1}],refs:[{id:'D',nativeTitle:'Native D',nativeUrl:'https://fixture.test/c/D',availability:'available'}],membership:[{id:'D',state:'PROJECT',projectId:'Q'}],inventory:{projects:'complete',conversations:'complete',cursor:null}}});assert.equal(second.ok,true);
  assert.equal((await h.native.prepareVersionIndex(scope,{expectedRevision:2})).prepared,true);
  const rows=h.factory.databasesMap.get(h.name).stores.get('native_states').rows,original=structuredClone(rows.get(scope.key)),payload=structuredClone(original.payload);
  payload.projects=Object.fromEntries(Object.entries(payload.projects).reverse());payload.refs=Object.fromEntries(Object.entries(payload.refs).reverse());
  const reordered=nativeRecord(scope.key,payload);assert.equal(reordered.checksum,original.checksum,'canonical checksum deliberately cannot distinguish order');assert.equal(reordered.payload.revision,original.payload.revision);rows.set(scope.key,reordered);
  const expectedProjects=Object.keys(payload.projects),expectedRefs=Object.keys(payload.refs);assert.notDeepEqual(expectedProjects,Object.keys(original.payload.projects));assert.notDeepEqual(expectedRefs,Object.keys(original.payload.refs));const before=await h.native.read(scope);
  const result=await h.native.migrateVersionIndex(scope,{operationId:'reordered-index',expectedRevision:2});assert.equal(result.ok,true,JSON.stringify(result));
  const header=await h.native.header(scope);assert.deepEqual(Object.keys(header.manifest.projects),expectedProjects);assert.deepEqual(Object.keys(header.manifest.refs),expectedRefs);const after=await h.native.read(scope);assert.deepEqual(after,{...before,revision:3});
 }finally{h.base.close();}
});
