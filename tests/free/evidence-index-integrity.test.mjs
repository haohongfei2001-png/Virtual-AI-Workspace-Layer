import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
import {evidenceIndexKey,evidenceRecord,freeEvidenceKey,evidenceRecoveryKey} from '../../src/data/free-evidence-partitions.mjs';
import {validateEvidenceDirectoryRoot} from '../../src/data/evidence-ref-directory.mjs';
const scope=normalizedScope(scopeOf('A')),now='2026-10-13T00:00:00Z';
const source=n=>({id:'source',generation:'one',sourceRevision:n,observedAt:now,validUntil:'2026-10-14T00:00:00Z',channel:'synthetic'});
const row=(table,id,conversationId,n=1)=>{
 const common={id,sourceId:'source',generation:'one',sourceRevision:n,observedAt:now,conversationId};
 if(table==='events')return {...common,messageId:id,branchId:'main',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:'2026-08-01T00:00:00Z'};
 if(table==='hints')return {...common,eventKey:'send_'+id,hintType:'local-confirmed-send',validUntil:'2026-10-14T00:00:00Z',candidateInterval:null,actorVerified:true,actorScopeKey:scope.key};
 return {...common,from:'2026-08-01T00:00:00Z',through:'2026-08-02T00:00:00Z',completeness:'complete',branches:'all',gaps:[]};
};
async function fixture(table){
 const factory=new MockIDBFactory(),base=new ScopeRepository({indexedDB:factory,databaseName:'index-integrity'}),repo=new FreeEvidenceRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'source',generation:'one'})});
 const batch={sources:[source(1)],events:[],hints:[],coverage:[]};batch[table]=[row(table,'I1','R1'),row(table,'I2','R2')];
 assert.equal((await repo.apply(scope,{operationId:'seed',expectedRevision:0,batch})).ok,true);
 const db=await base.open();
 const snapshot=()=>new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),all={};for(const name of names){all[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){all[name].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve(all);tx.onabort=()=>reject(tx.error);});
 const corrupt=async(indexTable,mode)=>{
  const locator=indexTable==='hintEvents'?digest(['source','send_I1']):'I1',group=indexTable+'_'+digest(locator).slice(0,2),key=evidenceIndexKey(scope.key,group,1);
  await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),q=store.get(key);q.onsuccess=()=>{assert(q.result,'fixture-index-must-exist');const payload=structuredClone(q.result.payload);if(mode==='wrong-target')payload.refs[locator]='R2';else delete payload.refs[locator];store.put(evidenceRecord(key,payload));};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 };
 const legacy=()=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states');for(const key of [freeEvidenceKey(scope.key),evidenceRecoveryKey(scope.key)]){const q=store.get(key);q.onsuccess=()=>{assert(q.result);const payload=structuredClone(q.result.payload);delete payload.indexChecksums;store.put(evidenceRecord(key,payload));};}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const root=()=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').get(freeEvidenceKey(scope.key));tx.oncomplete=()=>resolve(q.result.payload);tx.onabort=()=>reject(tx.error);});
 const editRoots=transform=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states');for(const key of [freeEvidenceKey(scope.key),evidenceRecoveryKey(scope.key)]){const q=store.get(key);q.onsuccess=()=>{const payload=structuredClone(q.result.payload);transform(payload);store.put(evidenceRecord(key,payload));};}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 return {base,repo,snapshot,corrupt,legacy,root,editRoots};
}
for(const indexTable of ['events','coverage','hints','hintEvents'])for(const mode of ['wrong-target','missing-locator'])test(`migration rejects ${indexTable} ${mode} without changing any store`,async()=>{
 const h=await fixture(indexTable==='hintEvents'?'hints':indexTable);
 try{await h.corrupt(indexTable,mode);const before=await h.snapshot(),result=await h.repo.migrateRefDirectory(scope,{operationId:'migrate',expectedRevision:1});assert.equal(result.ok,false,'migration must reject an index that does not correspond to actual piece evidence');assert.deepEqual(await h.snapshot(),before,'no root, shadow, receipt, index or piece changes');}finally{h.base.close();}
});
for(const mode of ['wrong-target','missing-locator'])test(`indexed incremental event write cannot duplicate an ID through ${mode}`,async()=>{
 const h=await fixture('events');
 try{assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok,true);await h.corrupt('events',mode);const before=await h.snapshot();const result=await h.repo.apply(scope,{operationId:'duplicate',expectedRevision:2,batch:{sources:[source(2)],events:[row('events','I1','R2',2)],hints:[],coverage:[]}});assert.equal(result.ok,false,'wrong or missing locator must not authorize a second global event ID');assert.deepEqual(await h.snapshot(),before,'failed write must preserve every store');}finally{h.base.close();}
});
test('intact indexes migrate with complete facts preserved',async()=>{const h=await fixture('hints');try{const before=await h.repo.read(scope);assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok,true);assert.deepEqual(await h.repo.read(scope),{...before,revision:2});}finally{h.base.close();}});

for(const format of ['partition','directory'])for(const indexTable of ['events','coverage','hints','hintEvents'])for(const mode of ['wrong-target','missing-locator'])test(`unbound legacy ${format} rejects ${indexTable} ${mode} atomically`,async()=>{
 const h=await fixture(indexTable==='hintEvents'?'hints':indexTable);
 try{
  if(format==='directory')assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'initial_directory',expectedRevision:1})).ok,true);
  await h.legacy();assert.equal(Object.hasOwn(await h.root(),'indexChecksums'),false);await h.corrupt(indexTable,mode);
  const before=await h.snapshot(),result=await h.repo.migrateRefDirectory(scope,{operationId:'seal_bad',expectedRevision:format==='directory'?2:1});
  assert.equal(result.ok,false,'full legacy audit must reject inconsistent locators independently of checksum bindings');assert.deepEqual(await h.snapshot(),before);
 }finally{h.base.close();}
});
test('valid legacy directory refuses writes until sealed, preserves bucket versions and then accepts new evidence',async()=>{
 const h=await fixture('events');
 try{
  assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'initial_directory',expectedRevision:1})).ok,true);await h.legacy();
  const prior=await h.root(),facts=await h.repo.read(scope),before=await h.snapshot();
  const request={operationId:'append_after_seal',expectedRevision:2,batch:{sources:[source(2)],events:[row('events','I3','R3',2)],hints:[],coverage:[]}};
  const refused=await h.repo.apply(scope,request);assert.equal(refused.ok,false);assert.equal(refused.reason,'evidence-index-integrity-required');assert.deepEqual(await h.snapshot(),before);
  const sealed=await h.repo.migrateRefDirectory(scope,{operationId:'seal_good',expectedRevision:2});assert.equal(sealed.ok,true,JSON.stringify(sealed));assert.equal(sealed.revision,3);
  const next=await h.root();assert.deepEqual(next.directory,prior.directory,'sealing must not rewrite directory bucket versions');assert.deepEqual(next.indexVersions,prior.indexVersions);assert.deepEqual(Object.keys(next.indexChecksums).sort(),Object.keys(next.indexVersions).sort());assert.deepEqual(await h.repo.read(scope),{...facts,revision:3});
  assert.equal((await h.repo.apply(scope,{...request,expectedRevision:3})).ok,true);const final=await h.repo.read(scope);assert.equal(final.revision,4);assert.equal(final.events.I3.conversationId,'R3');assert.deepEqual(final.events.I1,facts.events.I1);
 }finally{h.base.close();}
});

for(const format of ['partition','directory'])for(const value of [null,false])test(`${format} root rejects explicit indexChecksums ${value}`,async()=>{
 const h=await fixture('events');try{
  if(format==='directory')assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'initial',expectedRevision:1})).ok,true);
  await h.editRoots(root=>{root.indexChecksums=value;});const before=await h.snapshot();
  await assert.rejects(h.repo.header(scope),/invalid-free-evidence-index-checksums/);assert.deepEqual(await h.snapshot(),before);
 }finally{h.base.close();}
});
test('legacy directory sealing rejects a newly oversized root without modifying any store',async()=>{
 const h=await fixture('events');try{
  assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'initial',expectedRevision:1})).ok,true);await h.legacy();
  // Legacy counts metadata accepts additional fields. Preserve that contract:
  // do not shrink the size limit or add a new schema rejection for this test.
  const root=await h.root();root.counts.retainedMetadata='';const limit=16*1024*1024;
  const padding='x'.repeat(limit-8-stable(root).length);
  await h.editRoots(value=>{value.counts.retainedMetadata=padding;});
  const legacy=await h.root();assert.equal(stable(legacy).length,limit-8);assert.doesNotThrow(()=>validateEvidenceDirectoryRoot(legacy,scope));
  const before=await h.snapshot(),result=await h.repo.migrateRefDirectory(scope,{operationId:'seal_oversized',expectedRevision:2});
  assert.equal(result.ok,false,'new checksum map cannot publish an oversized root');assert.equal(result.reason,'free-evidence-too-large');assert.deepEqual(await h.snapshot(),before);
 }finally{h.base.close();}
});
