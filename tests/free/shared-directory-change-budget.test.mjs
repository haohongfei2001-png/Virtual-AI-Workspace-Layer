import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedSharedChanges} from '../../src/data/shared-directory-writer.mjs';
import {replicaDelta} from '../../src/data/replica.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {partitionRecord} from '../../src/data/partitioned.mjs';
import {syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const refs=n=>Array.from({length:n},(_,i)=>'ref_'+i);
test('budget retains the newest contiguous whole rows and never mutates input',()=>{
 const changes=Array.from({length:20},(_,i)=>({revision:i+1,refs:refs(5000)})),before=structuredClone(changes),actual=boundedSharedChanges(changes);
 assert.deepEqual(actual,changes.slice(-4));assert.deepEqual(changes,before);assert.equal(actual.reduce((n,row)=>n+row.refs.length,0),20000);
});
test('one exact 20000-reference row survives and older rows cannot be partially kept',()=>{
 const changes=[{revision:1,refs:['old']},{revision:2,refs:refs(20000)}];assert.deepEqual(boundedSharedChanges(changes),changes.slice(1));
});
test('row cap applies independently to zero-reference revisions',()=>{
 const changes=Array.from({length:80},(_,i)=>({revision:i+1,refs:[]}));assert.deepEqual(boundedSharedChanges(changes),changes.slice(-64));assert.deepEqual(boundedSharedChanges([]),[]);
});
test('old replicas fall back to full validation while recent deltas remain complete',()=>{
 const changes=Array.from({length:6},(_,i)=>({revision:i+1,refs:refs(5000).map(ref=>ref+'_'+i)})),manifest={scopeKey:'scope',generation:'generation',revision:6,changes:boundedSharedChanges(changes)};
 assert.equal(replicaDelta({manifest:{...manifest,revision:1}},manifest),null);
 assert.deepEqual(replicaDelta({manifest:{...manifest,revision:2}},manifest),changes.slice(2).flatMap(row=>row.refs));
 assert.deepEqual(replicaDelta({manifest:{...manifest,revision:5}},manifest),changes[5].refs);
});
async function storeRows(db,name){return new Promise((resolve,reject)=>{const tx=db.transaction(name),q=tx.objectStore(name).openCursor(),rows=new Map();q.onsuccess=()=>{const c=q.result;if(c){rows.set(c.primaryKey,c.value);c.continue();}};tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error);});}
test('directory owner write bounds old hints without dropping facts human assets checkpoints or journal',async t=>{
 const scope=scopeOf('A'),state=emptyState(scope);state.revision=1;state.channel='synthetic';
 state.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'Native R',projectId:null,available:true};state.identities.R={id:'R',title:'Manual R',aliases:['kept'],owner:'human',locked:true,revision:1};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'change_budget_'+crypto.randomUUID()}),owner=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate});t.after(()=>base.close());
 assert((await owner.initializePartitioned(scope,state)).ok);assert((await owner.migrateSharedDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok);
 const db=await base.open(),stored=await storeRows(db,'b23_states'),root=stored.get(state.scopeKey);
 root.payload.revision=21;root.payload.changes=Array.from({length:20},(_,i)=>({revision:i+2,refs:refs(5000)}));
 await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').put(partitionRecord(state.scopeKey,root.payload));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const before=(await owner.read(scope)).state,journal=await storeRows(db,'b23_operations');
 const result=await owner.command(scope,{operationId:'rename',expectedRevision:21,command:{type:'SET_TITLE',refId:'R',title:'New manual title'}});assert(result.ok);
 const manifest=await owner.partitioned.manifest(scope),after=(await owner.read(scope)).state;
 assert.equal(manifest.changes.reduce((n,row)=>n+row.refs.length,0),15001);assert.deepEqual(manifest.changes.map(row=>row.revision),[19,20,21,22]);assert.deepEqual(manifest.changes.at(-1).refs,['R']);
 assert.deepEqual(after.refs,before.refs);for(const field of ['events','coverage','placements','sources','workspaces','preferences'])assert.deepEqual(after[field],before[field]);
 assert.equal(after.identities.R.title,'New manual title');assert.deepEqual(after.identities.R.aliases,[...before.identities.R.aliases,before.identities.R.title]);assert.deepEqual(manifest.humanRefs,['R']);
 const laterJournal=await storeRows(db,'b23_operations');for(const [key,row] of journal)assert.deepEqual(laterJournal.get(key),row);assert.equal(laterJournal.size,journal.size+1);
 const cp=(await storeRows(db,'b23_checkpoints')).get(state.scopeKey);assert.deepEqual(cp.payload,root.payload,'prior checkpoint remains exact, including its older hint summary');
 assert((await owner.undo(scope,{operationId:'undo',expectedRevision:22,targetOperationId:'rename'})).ok);assert.equal((await owner.read(scope)).state.identities.R.title,'Manual R');
});
test('oversized row terminates the suffix rather than skipping a gap or slicing refs',()=>{
 assert.deepEqual(boundedSharedChanges([{revision:1,refs:[]},{revision:2,refs:refs(20001)}]),[]);
 const rows=[{revision:1,refs:[]},{revision:2,refs:refs(20001)},{revision:3,refs:['new']}];assert.deepEqual(boundedSharedChanges(rows),rows.slice(2));
});
test('explicit migration bounds legacy hints but preserves audited facts and existing human journal',async t=>{
 const scope=scopeOf('A'),state=emptyState(scope);state.revision=1;state.channel='synthetic';state.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'R',projectId:null,available:true};state.identities.R={id:'R',title:'R',aliases:[],owner:'bootstrap',locked:false,revision:1};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'migration_budget_'+crypto.randomUUID()}),owner=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate});t.after(()=>base.close());
 assert((await owner.initializePartitioned(scope,state)).ok);assert((await owner.command(scope,{operationId:'human',expectedRevision:1,command:{type:'SET_TITLE',refId:'R',title:'Manual preserved'}})).ok);
 const db=await base.open(),root=(await storeRows(db,'b23_states')).get(state.scopeKey);root.payload.revision=21;root.payload.changes=Array.from({length:20},(_,i)=>({revision:i+2,refs:refs(5000)}));
 await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite');tx.objectStore('b23_states').put(partitionRecord(state.scopeKey,root.payload));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const before=(await owner.read(scope)).state,journal=await storeRows(db,'b23_operations');assert((await owner.migrateSharedDirectory(scope,{operationId:'migrate',expectedRevision:21})).ok);
 const after=(await owner.read(scope)).state;assert.deepEqual(after,{...before,revision:22});
 const manifest=await owner.partitioned.manifest(scope);assert.deepEqual(manifest.changes.map(row=>row.revision),[18,19,20,21,22]);assert.equal(manifest.changes.reduce((n,row)=>n+row.refs.length,0),20000);assert.deepEqual(manifest.changes.at(-1).refs,[]);
 const later=await storeRows(db,'b23_operations');for(const [key,row] of journal)assert.deepEqual(later.get(key),row);assert.equal(later.size,journal.size+1);
 assert.equal(replicaDelta({manifest:{...manifest,revision:16}},manifest),null);assert.deepEqual(replicaDelta({manifest:{...manifest,revision:21}},manifest),[]);
});
