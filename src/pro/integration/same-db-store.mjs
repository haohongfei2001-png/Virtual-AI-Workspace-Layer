import {digest, stable} from '../../data/hash.mjs';
import {emptyOverlay, validateOverlay} from '../domain/index.mjs';
import {proRootKey,proOperationKey,proRecord,unpackProRecord,emptyProRoot,validateProRoot,
  validateProJournal,validateProJournalChain,assertRegisteredProDatabase,PRO_STORAGE_REGISTRY} from './storage-registry.mjs';
export {proRootKey,proOperationKey} from './storage-registry.mjs';
const stores=['b23_states','b23_operations','b23_checkpoints','native_states','native_operations'];
const clone=value=>structuredClone(value);

/** All reads are queued on the caller's transaction. Missing root + retained
 * history/checkpoint is corruption, never an empty workspace. */
function readInTransaction(tx,scope,check,ready,fail) {
  const key=proRootKey(scope.key),q=tx.objectStore('b23_states').get(key);
  q.onsuccess=()=>{try{
    if(!check())return;
    if(!q.result){
      const checkpoint=tx.objectStore('b23_checkpoints').get(key),history=tx.objectStore('b23_operations').index('scopeKey').openCursor(key);
      let remaining=2;
      for(const probe of [checkpoint,history])probe.onsuccess=()=>{try{if(!check())return;if(probe.result)throw Error('pro-missing-root-with-history');if(!--remaining)ready(emptyProRoot(scope.key),[],null);}catch(e){fail(e.message);}};
      return;
    }
    const current=validateProRoot(unpackProRecord(q.result,key),scope.key),logs=[];
    if(!current.operationIds.length){ready(current,logs,q.result);return;}
    let remaining=current.operationIds.length;
    for(const id of current.operationIds){
      const opKey=proOperationKey(scope.key,id),request=tx.objectStore('b23_operations').get(opKey);
      request.onsuccess=()=>{try{
        if(!check())return;if(!request.result)throw Error('pro-missing-journal');
        logs.push(unpackProRecord(request.result,opKey));
        if(!--remaining){validateProJournalChain(current,logs);ready(current,logs,q.result);}
      }catch(e){fail(e.message);}};
    }
  }catch(e){fail(e.message);}};
}

/** Registered same-DB4 owner adapter. It never opens/upgrades a database and
 * cannot turn a serialized scope/receipt into authority. */
export function createSameDatabaseStore({connection,verifyGrant,verifyInputFence,enabled=false}={}) {
  if([connection,verifyGrant,verifyInputFence].some(f=>typeof f!=='function'))throw Error('pro-shared-owner-required');
  const guard=(grant,signal,expectedScope=null)=>{
    if(!enabled)throw Error('pro-integration-disabled');if(signal?.aborted)throw Error('aborted');
    const scope=verifyGrant(grant);
    if(!scope||typeof scope.key!=='string'||scope.persistence!=='same-idb')throw Error('pro-persistent-scope-required');
    if(expectedScope!==null&&stable(scope)!==expectedScope)throw Error('pro-authority-scope-changed');
    return clone(scope);
  };
  async function read(grant,signal) {
    const scope=guard(grant,signal),identity=stable(scope),db=assertRegisteredProDatabase(await connection());guard(grant,signal,identity);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['b23_states','b23_operations','b23_checkpoints'],'readonly');let answer=null,failure=null;
      const fail=reason=>{failure=Error(reason);try{tx.abort();}catch{}};
      const check=()=>{try{guard(grant,signal,identity);return true;}catch(e){fail(e.message);return false;}};
      const abort=()=>fail('aborted');signal?.addEventListener('abort',abort,{once:true});
      readInTransaction(tx,scope,check,(current,records)=>{answer={state:current.state,sequence:current.sequence,records};},fail);
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);try{guard(grant,signal,identity);if(!answer)throw Error('pro-read-no-result');resolve(answer);}catch(e){reject(e);}};
      tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('pro-read-aborted'));};tx.onerror=()=>{};
    });
  }

  /** Enlist in a shared owner's already-open readwrite transaction. This is a
   * worker-local capability, not an RPC action. done means requests are queued;
   * ONLY the owner's tx.oncomplete may report a committed result. */
  function enlist(tx,grant,request,signal,done,fail) {
    let failed=false;
    const reject=reason=>{if(failed)return;failed=true;fail(reason);};
    try {
      if(tx.mode!=='readwrite')throw Error('pro-readwrite-transaction-required');assertRegisteredProDatabase(tx.db);
      const scope=guard(grant,signal),identity=stable(scope);
      const {operationId,fingerprint,expected,execute}=request;
      if(typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(operationId)||typeof execute!=='function')throw Error('invalid-pro-transaction');
      const expectedCopy=clone(expected),fp=digest(fingerprint),key=proRootKey(scope.key),opKey=proOperationKey(scope.key,operationId);
      const check=()=>{try{if(failed)return false;guard(grant,signal,identity);return true;}catch(e){reject(e.message);return false;}};
      readInTransaction(tx,scope,check,(current,logs,oldEnvelope)=>{
        try {
          if(!check())return;
          const prior=logs.find(row=>row.transaction.operationId===operationId);
          if(prior){if(prior.fingerprint!==fp){reject('operation-replay-conflict');return;}done({ok:true,value:clone(prior.transaction),replayed:true});return;}
          if(expectedCopy?.scopeKey!==scope.key||current.state.revision!==expectedCopy.overlayRevision)throw Error('overlay-revision-conflict');
          let entered=false;
          const fenced=()=>{
            try {
              if(entered)throw Error('pro-input-fence-reentered');entered=true;
              if(!check())return;
              const result=execute(clone(current.state),logs.map(clone));
              if(result?.then){if(result instanceof Promise)result.catch(()=>{});throw Error('async-pro-reducer-denied');}
              validateOverlay(result?.state);
              if(result.state.scopeKey!==scope.key||!result.transaction||result.transaction.operationId!==operationId)throw Error('invalid-pro-plan');
              const undo=result.undoneOperationId??null;
              if(undo!==null&&(typeof undo!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(undo)))throw Error('invalid-undo-operation');
              const sequence=current.sequence+1;
              const log=validateProJournal({format:'vaiwl-pro-journal/1',scopeKey:key,targetScopeKey:scope.key,sequence,fingerprint:fp,transaction:clone(result.transaction)},scope.key);
              if(log.transaction.base.overlayRevision!==current.state.revision||log.transaction.resultRevision!==result.state.revision)throw Error('pro-journal-root-mismatch');
              const next=validateProRoot({...current,sequence,state:clone(result.state),operationIds:[...current.operationIds,operationId]},scope.key,{state:false});
              const serializedNext=stable(next);
              if(new TextEncoder().encode(serializedNext).length>PRO_STORAGE_REGISTRY.overlay.maximumRootBytes)throw Error('pro-record-too-large');
              if(!check())return;
              // Fence the success event of every queued write, while abort can
              // still roll back the whole transaction (not only its reply).
              const put=(name,row)=>{const write=tx.objectStore(name).put(row),observe=write.onsuccess;write.onsuccess=event=>{try{if(check())observe?.(event);}catch(e){reject(e.message);}};};
              put('b23_checkpoints',oldEnvelope??proRecord(key,current));
              put('b23_states',proRecord(key,next,serializedNext));
              put('b23_operations',proRecord(opKey,log));
              if(undo){const target=logs.find(x=>x.transaction.operationId===undo);if(!target)throw Error('missing-undo-operation');target.transaction.status='undone';put('b23_operations',proRecord(proOperationKey(scope.key,undo),target));}
              if(!check())return;
              done({ok:true,value:clone(log.transaction),replayed:false});
            }catch(e){reject(e.message);}
          };
          const result=verifyInputFence(tx,scope,expectedCopy,check,fenced,reject);
          if(result?.then){if(result instanceof Promise)result.catch(()=>{});throw Error('async-pro-input-fence-denied');}
        }catch(e){reject(e.message);}
      },reject);
    }catch(e){reject(e.message);}
  }
  async function transact(grant,request,signal) {
    const scope=guard(grant,signal),identity=stable(scope),db=assertRegisteredProDatabase(await connection());guard(grant,signal,identity);
    return new Promise(resolve=>{
      let tx,outcome=null,finished=false;
      const fail=reason=>{if(finished)return;outcome={ok:false,reason};try{tx?.abort();}catch{}};
      const abort=()=>fail('aborted');
      try {
        tx=db.transaction(stores,'readwrite');signal?.addEventListener('abort',abort,{once:true});
        enlist(tx,grant,request,signal,result=>{outcome=result;},fail);
        tx.oncomplete=()=>{finished=true;signal?.removeEventListener('abort',abort);try{guard(grant,signal,identity);resolve(outcome??{ok:false,reason:'pro-no-result'});}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
        tx.onabort=()=>{finished=true;signal?.removeEventListener('abort',abort);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'pro-transaction-aborted'});};tx.onerror=()=>{};
      }catch(e){signal?.removeEventListener('abort',abort);fail(e.message);resolve({ok:false,reason:e.message});}
    });
  }
  return Object.freeze({read,transact,enlist});
}
/** Explicit test/immediate-session storage. It has no persistent medium. */
export function createMemoryOverlayStore({scopeKey,verifyGrant,verifyExpected}={}) {
  let state=emptyOverlay(scopeKey),records=[],sequence=0;
  const check=g=>{const s=verifyGrant(g);if(s.key!==scopeKey)throw Error('cross-scope');};
  return Object.freeze({
    async read(grant,signal){check(grant);if(signal?.aborted)throw Error('aborted');return clone({state,records,sequence});},
    async transact(grant,{operationId,fingerprint,expected,execute},signal){
      try {
        check(grant);if(signal?.aborted)throw Error('aborted');
        const fp=digest(fingerprint),prior=records.find(x=>x.transaction.operationId===operationId);
        if(prior)return prior.fingerprint===fp?{ok:true,value:clone(prior.transaction),replayed:true}:{ok:false,reason:'operation-replay-conflict'};
        verifyExpected(expected,state);
        const result=execute(clone(state),clone(records));validateOverlay(result.state);check(grant);
        if(result?.then)throw Error('async-pro-reducer-denied');
        const nextState=clone(result.state),nextRecords=clone(records),nextSequence=sequence+1;
        if(result.undoneOperationId){const target=nextRecords.find(x=>x.transaction.operationId===result.undoneOperationId);if(!target)throw Error('missing-undo-operation');target.transaction.status='undone';}
        nextRecords.push({format:'vaiwl-pro-journal/1',sequence:nextSequence,fingerprint:fp,transaction:clone(result.transaction)});
        state=nextState;records=nextRecords;sequence=nextSequence;
        return {ok:true,value:clone(result.transaction),replayed:false};
      }catch(e){return {ok:false,reason:e.message};}
    }
  });
}
