/** Exact historical writer modules, loaded in memory; no checkout or production data.
 * Run directly to assert the NEW repair can detect legitimate old-writer changes.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {harness,A} from '../b23/contracts.mjs';
import {emptyState,reduceCommand} from '../../src/data/state.mjs';
import {createBackup} from '../../src/data/backup.mjs';
import {knownAnchorCursorKey} from '../../src/data/known-anchor-key.mjs';
const historicalSHA='531c146';
const root=new URL('../../',import.meta.url);
function historicalModule(path,replacements={}){
 const source=execFileSync('git',['show',`${historicalSHA}:${path}`],{cwd:root,encoding:'utf8'});
 const resolved=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,_quote,spec)=>`from ${JSON.stringify(replacements[spec]??new URL(spec,new URL(path,root)).href)}`);
 return 'data:text/javascript;base64,'+Buffer.from(resolved).toString('base64');
}
const oldStateURL=historicalModule('src/data/state.mjs');
const {WorkspaceRepository:OldWorkspaceRepository}=await import(historicalModule('src/data/repository.mjs',{'./state.mjs':oldStateURL}));
const {ScopeRepository:OldScopeRepository}=await import(historicalModule('src/b1/scope-repository.mjs'));
async function setup(){const h=await harness(new MockIDBFactory(),{seed:false});const oldBase=new OldScopeRepository({indexedDB:h.factory,databaseName:h.name}),old=new OldWorkspaceRepository({baseRepository:oldBase});let seq=0;
 const bundle=id=>{let state=emptyState(A);state.refs[id]={id,nativeUrl:'https://fixture.test/c/'+id,projectId:null,nativeTitle:'Historical backup title',available:true};state=reduceCommand(state,{type:'SET_TITLE',refId:id,title:'Historical human title'});return createBackup(state);};
 const restore=async id=>{const backup=bundle(id),preview=await old.previewRestore(A,backup),operationId='restore_'+id+'_'+(++seq);const result=await old.restoreBackup(A,{operationId,expectedRevision:preview.expectedRevision,bundle:backup,planHash:preview.planHash});assert.equal(result.ok,true,JSON.stringify(result));return operationId;};
 const undo=async targetOperationId=>{const result=await old.undo(A,{operationId:'undo_'+(++seq),expectedRevision:(await old.read(A)).state.revision,targetOperationId});assert.equal(result.ok,true,JSON.stringify(result));};
 const marker=async()=>{const db=await h.base.open();return new Promise((resolve,reject)=>{const tx=db.transaction('b23_states'),q=tx.objectStore('b23_states').get(knownAnchorCursorKey(h.base.scopeOrThrow(A).key));tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});};
 const drain=async()=>{for(let i=0;i<10;i++){const result=await h.repo.reconcileKnownReferences(A,{limit:2});assert.equal(result.ok,true,JSON.stringify(result));if(result.done)return result;}throw Error('unbounded-repair');};
 return {...h,oldBase,old,restore,undo,marker,drain,close(){oldBase.close();h.close();}};
}
export const knownAnchorRollbackCases=[
 ['completed marker survives old undo but missing B1 anchor is repaired',async()=>{const h=await setup();try{const operation=await h.restore('removed');await h.drain();const marker=await h.marker();await h.undo(operation);assert.equal((await h.repo.read(A)).state.refs.removed,undefined);assert(await h.base.get(A,'removed'));assert.deepEqual(await h.marker(),marker,'historical writer really does not update marker');await h.drain();assert((await h.repo.read(A)).state.refs.removed,'completed scan must detect old undo');}finally{h.close();}}],
 ['completed marker detects historical B1-only insert',async()=>{const h=await setup();try{await h.drain();const marker=await h.marker();assert((await h.oldBase.upsert({scope:A,ref:{conversationId:'old_insert',nativeUrl:'https://fixture.test/c/old_insert',projectId:null},operationId:'historical_insert',expectedRevision:0})).ok);assert.deepEqual(await h.marker(),marker);await h.drain();assert((await h.repo.read(A)).state.refs.old_insert,'B1 count witness must detect older writer inserts');}finally{h.close();}}],
 ['equal-count shared replacement from legal old restore and undo is detected',async()=>{const h=await setup();try{const operation=await h.restore('removed');await h.drain();const baseline=(await h.repo.read(A)).state,marker=await h.marker();await h.undo(operation);await h.restore('replacement');const changed=(await h.repo.read(A)).state;assert.equal(Object.keys(changed.refs).length,Object.keys(baseline.refs).length);assert.equal(changed.refs.removed,undefined);assert(changed.refs.replacement);assert(await h.base.get(A,'removed'));assert(await h.base.get(A,'replacement'));assert.deepEqual(await h.marker(),marker);await h.drain();const final=(await h.repo.read(A)).state;assert(final.refs.removed,'equal shared counts cannot authorize skipping reconciliation');assert(final.refs.replacement);}finally{h.close();}}],

 ['partial cursor detects old undo before its saved position',async()=>{const h=await setup();try{const operation=await h.restore('A');await h.restore('Z');const first=await h.repo.reconcileKnownReferences(A,{limit:1});assert.equal(first.ok,true);assert.equal(first.done,false);const marker=await h.marker();await h.undo(operation);assert.deepEqual(await h.marker(),marker);await h.drain();assert((await h.repo.read(A)).state.refs.A,'progress witness must rewind when old writer removes an already scanned anchor');}finally{h.close();}}],

];
export async function runKnownAnchorRollbackContracts(){const results=[];for(const [name,run] of knownAnchorRollbackCases){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}return {historicalSHA,evidence:'EXACT_OLD_WRITER_IN_MEMORY_MOCK_IDB',results};}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const report=await runKnownAnchorRollbackContracts();console.log(JSON.stringify(report,null,2));if(report.results.some(r=>r.status!=='PASS'))process.exitCode=1;}
