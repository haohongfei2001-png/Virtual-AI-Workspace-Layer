/** Browser-compatible checkpoint contracts; caller supplies actual IDB or an explicitly labelled double. */
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {emptyState} from '../../src/data/state.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {syntheticEvidenceGate} from '../../simulator/persistent-seed.mjs';
import {digest,stable} from '../../src/data/hash.mjs';
const scope=scopeOf('A'),key=emptyState(scope).scopeKey;
const check=(value,message)=>{if(!value)throw Error(message);};
async function setup(indexedDB){
 const name='checkpoint_envelope_'+crypto.randomUUID(),base=new ScopeRepository({indexedDB,databaseName:name}),repo=new WorkspaceRepository({baseRepository:base,evidenceGate:syntheticEvidenceGate});
 const state=emptyState(scope);state.revision=1;state.channel='synthetic';
 state.sources.S={id:'S',channel:'synthetic',description:'Browser synthetic checkpoint',observedAt:'2026-10-11T04:00:00Z',trustLevel:'synthetic',revoked:false};
 state.workspaces.W={id:'W',name:'Original',icon:'◇',order:0,locked:true,owner:'human',revision:1};
 state.preferences.compactRows={id:'compactRows',value:false,owner:'human',revision:1};
 check((await repo.initializePartitioned(scope,state)).ok,'initialize');
 const raw=async store=>{const db=await base.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),q=tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});};
 const close=async()=>{base.close();await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=resolve;q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('delete-blocked'));});};
 return {repo,raw,close};
}
export function checkpointEnvelopeCases(indexedDB){return [
 {name:'IDB synchronously clones verified old checkpoint before impure reducer mutations',run:async()=>{
  const h=await setup(indexedDB);try{const before=await h.raw('b23_states');
   const result=await h.repo.mutate(scope,{operationId:'impure',expectedRevision:1,fingerprint:{test:'impure'},type:'SYNTHETIC_TEST',actor:'human',apply:current=>{
    current.sources.S.revoked=true;current.workspaces.W.name='Changed';current.preferences.compactRows.value=true;
    return {...current,revision:current.revision+1};
   }});check(result.ok,JSON.stringify(result));const checkpoint=await h.raw('b23_checkpoints'),root=await h.raw('b23_states');
   check(stable(checkpoint)===stable(before),'checkpoint-must-be-exact-prior-envelope');check(checkpoint.checksum===digest(checkpoint.payload),'checkpoint-checksum');
   check(root.checksum===digest(root.payload),'root-checksum');check(root.payload.sources.S.revoked&&root.payload.workspaces.W.name==='Changed'&&root.payload.preferences.compactRows.value,'new-root-mutation');
   return {status:'PASS'};
  }finally{await h.close();}
 }},
 {name:'IDB abort after provisional checkpoint put preserves both prior committed records',run:async()=>{
  const h=await setup(indexedDB);try{
   check((await h.repo.command(scope,{operationId:'first',expectedRevision:1,command:{type:'SET_PREFERENCE',id:'compactRows',value:true}})).ok,'first-command');
   const beforeRoot=await h.raw('b23_states'),beforeCheckpoint=await h.raw('b23_checkpoints'),controller=new AbortController();
   const result=await h.repo.mutate(scope,{operationId:'abort',expectedRevision:2,fingerprint:{test:'abort'},type:'SYNTHETIC_TEST',actor:'human',signal:controller.signal,apply:current=>{current.sources.S.revoked=true;controller.abort();return {...current,revision:current.revision+1};}});
   check(result.ok===false&&result.reason==='stale-binding','must-abort');check(stable(await h.raw('b23_states'))===stable(beforeRoot),'root-rollback');check(stable(await h.raw('b23_checkpoints'))===stable(beforeCheckpoint),'checkpoint-rollback');return {status:'PASS'};
  }finally{await h.close();}
 }}
];}
