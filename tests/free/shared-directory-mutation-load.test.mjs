import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {partitionRecord} from '../../src/data/partitioned.mjs';
import {buildSharedRefDirectory} from '../../src/data/shared-ref-directory.mjs';
import {reduceCommand,changes} from '../../src/data/state.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {persistentSeed,syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
async function fixture(){const scope=normalizedScope(scopeOf('A')),base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'shared-mutation-adapter'}),owner=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate}),seed=persistentSeed(scope,'https://vaiwl-hf.test');assert((await owner.initializePartitioned(scope,seed)).ok);const manifest=await owner.partitioned.manifest(scope),built=buildSharedRefDirectory(manifest,scope),db=await base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states');built.records.forEach(row=>store.put(row));store.put(partitionRecord(scope.key,built.root));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});return {scope,owner,base,db,seed,built};}
for(const abort of [false,true])test('bounded shared mutation adapter '+(abort?'rolls back all staged writes':'preserves other Pro assets'),async()=>{
 const {scope,owner,base,db,seed,built}=await fixture(),ref=Object.keys(seed.refs)[0],command={type:'SET_TITLE',refId:ref,title:'新的人工名称'},gets=[];let loaded;
 await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states'),tracked={objectStore:name=>{assert.equal(name,'b23_states');return {get:key=>{gets.push(key);return store.get(key);},put:row=>store.put(row)};}};
 const fail=e=>{try{tx.abort();}catch{}reject(e);};
 owner.partitioned.loadSharedMutation(tracked,built.root,scope,{fingerprint:{command}},null,(current,storage)=>{try{loaded=Object.keys(current.refs);const next=reduceCommand(current,command,'human');owner.partitioned.saveSharedMutation(tx,storage,scope,current,next,changes(current,next));if(abort)tx.abort();}catch(e){fail(e);}},fail);
 tx.oncomplete=resolve;tx.onabort=()=>abort?resolve():reject(tx.error);
 });
 assert.deepEqual(loaded,[ref]);assert.equal(gets.length,2,'one directory bucket and one ref piece');const actual=(await owner.read(scope)).state;
 if(abort)assert.deepEqual(actual,seed);else {assert.equal(actual.identities[ref].title,command.title);assert.equal(actual.revision,2);for(const key of Object.keys(seed.identities).filter(id=>id!==ref))assert.deepEqual(actual.identities[key],seed.identities[key]);assert.deepEqual(actual.placements,seed.placements);assert.deepEqual(actual.workspaces,seed.workspaces);assert.deepEqual(actual.events,seed.events);}
 base.close();
});
test('shared mutation resolves global event locator before loading bounded references',async()=>{
 const {scope,owner,base,db,seed,built}=await fixture(),event=Object.values(seed.events)[0],other=Object.keys(seed.refs).find(id=>id!==event.conversationId),batch={schema:'vaiwl-internal-evidence-v1',sources:[],refs:[],events:[Object.fromEntries(Object.entries({...event,conversationId:other}).filter(([key])=>key!=='revoked'))],coverage:[]};let loaded;
 await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states');owner.partitioned.loadSharedMutation(tx,built.root,scope,{fingerprint:{batch}},null,current=>loaded=current,e=>{reject(e);tx.abort();});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 assert(loaded.refs[other]);assert(loaded.refs[event.conversationId]);assert.deepEqual(loaded.events[event.id],event);assert.throws(()=>reduceCommand(loaded,{type:'INGEST',batch},'evidence'),/evidence-id-conflict/);base.close();
});
for(const abort of [false,true])test('native shared anchors with directory root '+(abort?'roll back on caller failure':'preserve Pro assets'),async()=>{
 const {scope,owner,base,db,seed}=await fixture(),example=Object.values(seed.refs)[0],ref={id:'added_native',nativeUrl:example.nativeUrl.replace(/[^/]+$/,'added_native'),projectId:example.projectId,nativeTitle:'原生新增',availability:'available'};
 await new Promise((resolve,reject)=>{const tx=db.transaction(['b23_states','b23_checkpoints','b23_operations','refs'],'readwrite');let error;
 owner.registerNativeReferences(tx,scope,[ref],'native_directory_anchor',()=>{},value=>{assert.equal(value.added,1);if(abort)throw Error('caller-revoked');},e=>{error=e;tx.abort();});
 tx.oncomplete=resolve;tx.onabort=()=>abort&&error?.message==='caller-revoked'?resolve():reject(error??tx.error);
 });
 const actual=(await owner.read(scope)).state;if(abort)assert.deepEqual(actual,seed);else {assert(actual.refs[ref.id]);assert.deepEqual(actual.identities,seed.identities);assert.deepEqual(actual.placements,seed.placements);assert.equal(actual.revision,2);}
 base.close();
});
test('known anchor reconciliation reads shared directory and registers a missing B1 identity',async()=>{
 const {scope,owner,base,db,seed}=await fixture(),example=Object.values(seed.refs)[0],conversationId='backfill_directory',nativeUrl=example.nativeUrl.replace(/[^/]+$/,conversationId);
 await new Promise((resolve,reject)=>{const tx=db.transaction('refs','readwrite');tx.objectStore('refs').put({key:base.key(scope,conversationId),scopeKey:scope.key,conversationId,nativeUrl,projectId:example.projectId,revision:1});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const result=await owner.reconcileKnownReferences(scope,{limit:5000});assert(result.ok,result.reason);assert.equal(result.added,1);const actual=(await owner.read(scope)).state;assert(actual.refs[conversationId]);assert.deepEqual(actual.identities,seed.identities);assert.deepEqual(actual.placements,seed.placements);base.close();
});
