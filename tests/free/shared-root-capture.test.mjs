import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {emptyState,reduceCommand} from '../../src/data/state.mjs';
import {PartitionedState,PARTITION_FORMAT,partitionKey,partitionUnpack} from '../../src/data/partitioned.mjs';
import {stable,digest} from '../../src/data/hash.mjs';
import {buildSharedRefDirectory} from '../../src/data/shared-ref-directory.mjs';
import {saveSharedDirectoryMutation} from '../../src/data/shared-directory-writer.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';

// Internal writer probes use a collecting transaction; the final recovery case
// exercises the real owner/repository with MockIDB and transaction rollback.
const scope=normalizedScope(scopeOf('A')),saver=new PartitionedState({});
function fixture(){
 const current=emptyState(scope);current.revision=1;
 current.refs.R={id:'R',nativeUrl:'https://fixture.test/c/R',nativeTitle:'Native R',projectId:null,available:true};
 current.identities.R={id:'R',title:'Human R',aliases:[],locked:true,owner:'human',revision:1};
 const piece={scopeKey:scope.key,refId:'R',revision:1,ref:current.refs.R,identity:current.identities.R,events:[],coverage:[],placements:[]};
 const manifest={format:PARTITION_FORMAT,generation:'capture_generation',scopeKey:scope.key,revision:1,channel:current.channel,sources:current.sources,workspaces:current.workspaces,preferences:current.preferences,refVersions:{R:1},humanRefs:['R'],units:stable(piece).length,changes:[]};
 const next=reduceCommand(current,{type:'SET_TITLE',refId:'R',title:'Changed human title'},'human');
 const patch=[{table:'identities',key:'R',before:current.identities.R,after:next.identities.R}];
 const built=buildSharedRefDirectory(manifest,scope),storage={manifest,pieces:new Map([['R',piece]]),directoryRecords:built.records};
 const rows=[],tx={objectStore(name){assert.equal(name,'b23_states');return {put:row=>rows.push(structuredClone(row))};}};
 return {current,next,patch,manifest,storage,root:built.root,rows,tx};
}
function save(f,capture){return saver.saveMutation(f.tx,f.storage,f.current,f.next,f.patch,'human',capture);}
function directory(f,writer){return saveSharedDirectoryMutation(f.tx,f.root,scope,f.storage,f.current,f.next,f.patch,'human',writer);}

test('default legacy writer still publishes checksummed root and reference piece',()=>{
 const f=fixture(),result=save(f),root=f.rows.find(row=>row.key===scope.key);
 assert(root);assert.deepEqual(partitionUnpack(root),result);assert.equal(root.checksum,digest(result));
 const piece=f.rows.find(row=>row.key===partitionKey(scope.key,'R',2,f.manifest.generation));
 assert.equal(partitionUnpack(piece).identity.title,'Changed human title');
});
test('internal capture receives one validated naked payload without publishing a legacy root',()=>{
 const f=fixture(),captured=[],result=save(f,payload=>captured.push(payload));
 assert.equal(captured.length,1);assert.equal(captured[0],result);assert.equal(result.format,PARTITION_FORMAT);
 assert(!f.rows.some(row=>row.key===scope.key));
 assert.equal(f.rows.length,1);assert.equal(partitionUnpack(f.rows[0]).identity.title,'Changed human title');
});
test('capture validates illegal metadata before calling the callback or publishing root',()=>{
 const f=fixture();f.next.preferences.compactRows={id:'compactRows',value:'invalid'};let called=false;
 assert.throws(()=>save(f,()=>{called=true;}));assert.equal(called,false);assert(!f.rows.some(row=>row.key===scope.key));
});
test('capture preserves invalid manifest size metadata rejection',()=>{
 const f=fixture();f.storage.manifest.units=128*1024*1024+1;let called=false;
 assert.throws(()=>save(f,()=>{called=true;}));assert.equal(called,false);assert(!f.rows.some(row=>row.key===scope.key));
});
test('capture retains the actual 16 MiB manifest boundary with otherwise valid change rows',()=>{
 const f=fixture(),refs=Array(2500).fill('r'.repeat(120));
 f.storage.manifest.changes=Array.from({length:64},()=>({revision:1,refs}));let called=false;
 assert.throws(()=>save(f,()=>{called=true;}),/state-too-large/);
 assert.equal(called,false);assert(!f.rows.some(row=>row.key===scope.key));
});
test('capture callback errors propagate to the transaction owner',()=>{
 const f=fixture();assert.throws(()=>save(f,()=>{throw Error('capture-failed');}),/capture-failed/);
 assert(!f.rows.some(row=>row.key===scope.key));
});
for(const mode of ['missing','duplicate','different-return'])test('directory rejects '+mode+' internal root capture',()=>{
 const f=fixture();
 const writer=(...args)=>{
  const capture=args.at(-1);assert.equal(typeof capture,'function');
  const payload=saver.saveMutation(...args.slice(0,-1),()=>{});
  if(mode!=='missing')capture(payload);
  if(mode==='duplicate')capture(payload);
  return mode==='different-return'?structuredClone(payload):payload;
 };
 assert.throws(()=>directory(f,writer),mode==='duplicate'?/duplicate-shared-root/:/missing-shared-root/);assert(!f.rows.some(row=>row.key===scope.key));
});
test('directory capture publishes only its actual checksummed root and preserves the piece',()=>{
 const f=fixture(),root=directory(f,saver.saveMutation.bind(saver));
 const stored=f.rows.filter(row=>row.key===scope.key);assert.equal(stored.length,1);
 assert.deepEqual(partitionUnpack(stored[0]),root);assert.notEqual(root.format,PARTITION_FORMAT);
 assert.equal(f.rows.filter(row=>row.payload.refId==='R').length,1);
});
test('directory owner writes remain recoverable after captured-root mutation and checksum corruption',async t=>{
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'capture_'+crypto.randomUUID()});t.after(()=>base.close());
 const owner=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate}),f=fixture();f.current.channel='synthetic';
 assert((await owner.initializePartitioned(scope,f.current)).ok);
 assert((await owner.migrateSharedDirectory(scope,{operationId:'migrate',expectedRevision:1})).ok);
 for(const revision of [2,3])assert((await owner.command(scope,{operationId:'title_'+revision,expectedRevision:revision,command:{type:'SET_TITLE',refId:'R',title:'Saved human '+revision}})).ok);
 assert.equal((await owner.read(scope)).state.identities.R.title,'Saved human 3');
 const db=await base.open();let bad;
 await new Promise((resolve,reject)=>{const tx=db.transaction('b23_states','readwrite'),store=tx.objectStore('b23_states'),q=store.get(scope.key);q.onsuccess=()=>{bad={...q.result,checksum:'0'.repeat(64)};store.put(bad);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 assert((await owner.recover(scope,{operationId:'recover_capture',damagedHash:digest(bad)})).ok);
 const recovered=(await owner.read(scope)).state;assert.equal(recovered.identities.R.title,'Saved human 3');assert.equal(recovered.refs.R.nativeTitle,'Native R');
});
