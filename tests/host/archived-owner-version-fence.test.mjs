import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {historicalSource,OLD_HOST_COMMIT} from './historical-package.mjs';
import {createJointObservationFixture} from './joint-observation-fixture.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {DATABASE_VERSION} from '../../src/data/schema.mjs';
import {j4AssetBackup} from './fixtures/j4-assets.mjs';
async function dump(db){return new Promise((resolve,reject)=>{const names=[...db.objectStoreNames],tx=db.transaction(names),rows={};for(const name of names){rows[name]=[];const q=tx.objectStore(name).openCursor();q.onsuccess=()=>{const c=q.result;if(c){rows[name].push({key:c.key,value:c.value});c.continue();}};}tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});}
for(const afterEvidence of [false,true])test('actual archived owner is version fenced before any writer, evidence='+afterEvidence,async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-owner-fence-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await historicalSource(fileURLToPath(new URL('../..',import.meta.url)),OLD_HOST_COMMIT,join(dir,'source'));
 const [{ScopeRepository:OldBase},{NativeRepository:OldNative}]=await Promise.all(['src/b1/scope-repository.mjs','src/data/native-repository.mjs'].map(p=>import(pathToFileURL(join(dir,'source',p)))));
 const factory=new MockIDBFactory(),databaseName='owner-fence',oldBase=new OldBase({indexedDB:factory,databaseName});t.after(()=>oldBase.close());
 const oldDb=await oldBase.open();assert.equal(oldDb.version,3);
 const stores=[...oldDb.objectStoreNames];await new Promise((resolve,reject)=>{const tx=oldDb.transaction(stores,'readwrite');for(const name of stores)tx.objectStore(name).put({key:'historical-sentinel',payload:{human:'preserve '+name}});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const beforeUpgrade=await dump(oldDb);
 const h=await createJointObservationFixture({indexedDB:factory,databaseName,after:fn=>t.after(fn)}),db=await h.base.open();
 assert.equal(db.version,DATABASE_VERSION);assert.equal(db.name,oldDb.name);assert.equal(oldBase.connection,null);assert.deepEqual(await dump(db),beforeUpgrade);
 await assert.rejects(oldBase.open(),e=>e.name==='VersionError');
 h.disableDrain();assert.equal((await h.ingest(h.surface())).state,'accepted');const pending=await h.native.listContinuations(h.scope);assert.equal(pending.length,1);
 if(afterEvidence){const original=h.native.markContinuationComplete;h.native.markContinuationComplete=async()=>{throw Error('OFFLINE_STOP_BEFORE_COMPLETE');};try{assert.equal((await h.recover()).state,'pending');}finally{h.native.markContinuationComplete=original;}}
 const workspace=new WorkspaceRepository({baseRepository:h.base}),bundle=j4AssetBackup(h.scope,'https://host.test'),preview=await workspace.previewRestore(h.scope,bundle);
 assert.equal((await workspace.restoreBackup(h.scope,{operationId:'manual-assets',expectedRevision:preview.expectedRevision,planHash:preview.planHash,bundle})).ok,true);
 const before=await dump(db),manual=(await workspace.read(h.scope)).state,evidence=await h.free.read(h.scope),native=await h.native.read(h.scope),old=new OldNative({baseRepository:oldBase});
 const calls=[()=>old.listContinuations(h.scope),()=>old.invalidate(h.scope,{operationId:'old-invalidate',expectedRevision:native.revision,sourceId:pending[0].nativeWitness.sourceId},{guard:()=>true}),()=>old.markContinuationComplete(h.scope,{operationId:pending[0].operationId,expectedPayloadDigest:pending[0].payloadDigest,evidenceRevision:1},{guard:()=>true}),()=>old.markContinuationNeedsRevalidation(h.scope,{operationId:pending[0].operationId,expectedPayloadDigest:pending[0].payloadDigest},{guard:()=>true})];
 for(const call of calls){await assert.rejects(call,e=>e.name==='VersionError');assert.deepEqual(await dump(db),before);assert.deepEqual((await workspace.read(h.scope)).state,manual);assert.deepEqual(await h.native.listContinuations(h.scope),pending);assert.deepEqual(await h.free.read(h.scope),evidence);}
 assert.equal((await h.recover()).state,'complete');const complete=await h.free.read(h.scope);assert.equal(complete.revision,1);if(afterEvidence)assert.deepEqual(complete,evidence);assert.equal((await h.recover()).state,'idle');assert.deepEqual(await h.free.read(h.scope),complete);assert.deepEqual((await workspace.read(h.scope)).state,manual);
});
