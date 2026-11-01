import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
import {evidenceIndexKey,evidenceRecord,freeEvidenceKey,evidenceRecoveryKey} from '../../src/data/free-evidence-partitions.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
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
 const damage=()=>new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),key=freeEvidenceKey(scope.key),q=store.get(key);q.onsuccess=()=>store.put({...q.result,checksum:'0'.repeat(64)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 return {base,repo,snapshot,corrupt,legacy,root,damage};
}

for(const format of ['partition','directory'])for(const indexTable of ['events','coverage','hints','hintEvents'])for(const mode of ['wrong-target','missing-locator'])test(`legacy ${format} recovery diagnosis rejects ${indexTable} ${mode} without writes`,async()=>{
 const h=await fixture(indexTable==='hintEvents'?'hints':indexTable);
 try{
  if(format==='directory')assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'directory',expectedRevision:1})).ok,true);
  await h.legacy();await h.corrupt(indexTable,mode);await h.damage();const before=await h.snapshot();
  const result=await freeRecoveryStatus(h.repo,scope,'evidence');assert.equal(result.corrupt,true);assert.equal(result.recoverable,false,'bad index/piece correspondence cannot advertise repair');assert.equal(result.recoveryReason,'free-evidence-index-content-mismatch');assert.deepEqual(await h.snapshot(),before,'diagnosis must preserve all eight stores');
 }finally{h.base.close();}
});
for(const format of ['partition','directory'])test(`intact legacy ${format} recovery shadow is recoverable with sources and facts unchanged`,async()=>{
 const h=await fixture('hints');try{
  if(format==='directory')assert.equal((await h.repo.migrateRefDirectory(scope,{operationId:'directory',expectedRevision:1})).ok,true);
  await h.legacy();const facts=await h.repo.read(scope);assert.equal(facts.sources.source.revoked,false);await h.damage();const before=await h.snapshot();
  const result=await freeRecoveryStatus(h.repo,scope,'evidence');assert.equal(result.corrupt,true);assert.equal(result.recoverable,true,JSON.stringify(result));assert.equal(result.recoveryReason,undefined);assert.deepEqual(await h.snapshot(),before,'no source revocation, repair writes or changed facts during diagnosis');
 }finally{h.base.close();}
});
