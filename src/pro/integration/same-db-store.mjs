import {digest, stable} from '../../data/hash.mjs';
import {emptyOverlay, validateOverlay} from '../domain/index.mjs';
import {createProRecoveryAccess,readProRecoveryWriteFence,proRecoveryHeadForRoot} from './storage-recovery.mjs';
import {proRootKey,proOperationKey,proRecoveryKey,proRecord,unpackProRecord,emptyProRoot,validateProRoot,
  validateProJournal,validateProJournalChain,assertRegisteredProDatabase,PRO_STORAGE_REGISTRY,PRO_RECOVERED_READER} from './storage-registry.mjs';
import {createHistoryRecord,segmentedRoot,readHistorySegment,proveHistoricalJournal,assertHistoryJournal} from './storage-history.mjs';
export {proRootKey,proOperationKey} from './storage-registry.mjs';
const stores=['b23_states','b23_operations','b23_checkpoints','native_states','native_operations'];
const clone=value=>structuredClone(value);
// A worker-local policy/entitlement fence, supplied by the trusted owner. It
// never crosses RPC and cannot renew a grant or authorize asynchronous work.
function checkActionCurrent(verifyCurrent){
  if(verifyCurrent===undefined)return;
  if(typeof verifyCurrent!=='function')throw Error('invalid-pro-action-fence');
  const current=verifyCurrent();
  if(current?.then){try{Promise.prototype.then.call(current,()=>{},()=>{});}catch{}throw Error('async-pro-action-fence-denied');}
  if(current!==true)throw Error('pro-action-no-longer-current');
}

/** All reads are queued on the caller's transaction. Missing root + retained
 * history/checkpoint is corruption, never an empty workspace. */
function readInTransaction(tx,scope,check,ready,fail) {
  const key=proRootKey(scope.key),q=tx.objectStore('b23_states').get(key);
  q.onsuccess=()=>{try{
    if(!check())return;
    if(!q.result){
      const checkpoint=tx.objectStore('b23_checkpoints').get(key),history=tx.objectStore('b23_operations').index('scopeKey').openCursor(key),recovery=tx.objectStore('b23_states').get(proRecoveryKey(scope.key));
      let remaining=5;
      for(const probe of [checkpoint,history,recovery])probe.onsuccess=()=>{try{if(!check())return;if(probe.result)throw Error('pro-missing-root-with-history');if(!--remaining)ready(emptyProRoot(scope.key),[],null);}catch(e){fail(e.message);}};
      const prefix=JSON.stringify([key,'history']).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff'),archive=tx.objectStore('b23_checkpoints').openCursor(range);
      archive.onsuccess=()=>{try{if(!check())return;const cursor=archive.result;if(!cursor){if(!--remaining)ready(emptyProRoot(scope.key),[],null);return;}if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix))throw Error('pro-missing-root-with-history');cursor.continue();}catch(e){fail(e.message);}};
      const repairPrefix=JSON.stringify([proRecoveryKey(scope.key)]).slice(0,-1)+',',repairRange=globalThis.IDBKeyRange?.bound(repairPrefix,repairPrefix+'\uffff'),repairs=tx.objectStore('b23_states').openCursor(repairRange);
      repairs.onsuccess=()=>{try{if(!check())return;const cursor=repairs.result;if(!cursor){if(!--remaining)ready(emptyProRoot(scope.key),[],null);return;}if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(repairPrefix))throw Error('pro-missing-root-with-history');cursor.continue();}catch(e){fail(e.message);}};
      return;
    }
    const current=validateProRoot(unpackProRecord(q.result,key),scope.key),logs=[];let recoveryFence;
    const load=()=>{
      if(!current.operationIds.length){validateProJournalChain(current,logs);ready(current,logs,q.result,recoveryFence);return;}
      let remaining=current.operationIds.length;
      for(const id of current.operationIds){
      const opKey=proOperationKey(scope.key,id),request=tx.objectStore('b23_operations').get(opKey);
      request.onsuccess=()=>{try{
        if(!check())return;if(!request.result)throw Error('pro-missing-journal');
        logs.push(unpackProRecord(request.result,opKey));
        if(!--remaining){validateProJournalChain(current,logs);ready(current,logs,q.result,recoveryFence);}
      }catch(e){fail(e.message);}};
      }
    };
    const proceed=()=>{if(current.history)readHistorySegment(tx,scope.key,current.history,check,load,fail);else load();};
    if(current.minimumReader===PRO_RECOVERED_READER)readProRecoveryWriteFence(tx,scope.key,current,check,fence=>{recoveryFence=fence;proceed();},fail);else proceed();
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

  async function historyRead(grant,signal,work){
    const scope=guard(grant,signal),identity=stable(scope),db=assertRegisteredProDatabase(await connection());guard(grant,signal,identity);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['b23_states','b23_operations','b23_checkpoints'],'readonly');let answer,failure=null;
      const fail=reason=>{if(failure)return;failure=Error(reason);try{tx.abort();}catch{}};
      const check=()=>{try{if(failure)return false;guard(grant,signal,identity);return true;}catch(e){fail(e.message);return false;}};
      const abort=()=>fail('aborted');signal?.addEventListener('abort',abort,{once:true});
      readInTransaction(tx,scope,check,(current,records)=>{try{work({tx,scope,current,records,check,fail,done:value=>{answer=value;}});}catch(e){fail(e.message);}},fail);
      tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);try{guard(grant,signal,identity);if(answer===undefined)throw Error('pro-history-no-result');resolve(clone(answer));}catch(e){reject(e);}};
      tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('pro-history-read-aborted'));};tx.onerror=()=>{};
    });
  }
  async function getOperation(grant,operationId,signal){
    if(typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(operationId))throw Error('invalid-history-operation-request');
    return historyRead(grant,signal,ctx=>{
      const active=ctx.records.find(r=>r.transaction.operationId===operationId);if(active){ctx.done(active);return;}
      const key=proOperationKey(ctx.scope.key,operationId),q=ctx.tx.objectStore('b23_operations').get(key);
      q.onsuccess=()=>{try{if(!ctx.check())return;if(!q.result){ctx.done(null);return;}const row=validateProJournal(unpackProRecord(q.result,key),ctx.scope.key);proveHistoricalJournal(ctx.tx,ctx.current,row,ctx.check,ctx.done,ctx.fail);}catch(e){ctx.fail(e.message);}};
    });
  }
  async function readHistory(grant,{offset=0,limit=100,visibleOnly=false}={},signal){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200||typeof visibleOnly!=='boolean')throw Error('invalid-pro-history-page');
    return historyRead(grant,signal,ctx=>{
      const active=ctx.records.filter(r=>!visibleOnly||r.transaction.actor!=='system');
      const total=visibleOnly?(ctx.current.history?.visibleCount??0)+active.length:ctx.current.sequence,selected=[];let skip=offset;
      const finish=()=>ctx.done({records:selected,total,offset,hasMore:offset+selected.length<total});
      if(offset>=total){finish();return;}
      const takeActive=[...active].sort((a,b)=>b.sequence-a.sequence);const count=Math.min(skip,takeActive.length);skip-=count;selected.push(...takeActive.slice(count,count+limit));
      const visit=pointer=>{
        if(selected.length>=limit||!pointer){finish();return;}
        readHistorySegment(ctx.tx,ctx.scope.key,pointer,ctx.check,segment=>{
          try{
            const available=segment.operationIds.filter((id,i)=>!visibleOnly||segment.actors[i]!=='system');
            if(skip>=available.length){skip-=available.length;visit(segment.previous);return;}
            const ids=available.reverse().slice(skip,skip+limit-selected.length);skip=0;
            let remaining=ids.length;const rows=[];
            if(!remaining){visit(segment.previous);return;}
            for(const id of ids){const key=proOperationKey(ctx.scope.key,id),q=ctx.tx.objectStore('b23_operations').get(key);q.onsuccess=()=>{try{
              if(!ctx.check())return;if(!q.result)throw Error('pro-missing-journal');rows.push(assertHistoryJournal(segment,validateProJournal(unpackProRecord(q.result,key),ctx.scope.key)));
              if(!--remaining){selected.push(...rows.sort((a,b)=>b.sequence-a.sequence));visit(segment.previous);}
            }catch(e){ctx.fail(e.message);}};}
          }catch(e){ctx.fail(e.message);}
        },ctx.fail);
      };visit(ctx.current.history??null);
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
      const {operationId,fingerprint,expected,execute,verifyCurrent}=request;
      if(typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(operationId)||typeof execute!=='function')throw Error('invalid-pro-transaction');
      const historyOperationIds=clone(request.historyOperationIds??[]);
      if(!Array.isArray(historyOperationIds)||historyOperationIds.length>100||new Set(historyOperationIds).size!==historyOperationIds.length||historyOperationIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw Error('invalid-history-operation-request');
      const expectedCopy=clone(expected),fp=digest(fingerprint),key=proRootKey(scope.key),opKey=proOperationKey(scope.key,operationId);
      const check=()=>{try{if(failed)return false;guard(grant,signal,identity);checkActionCurrent(verifyCurrent);return true;}catch(e){reject(e.message);return false;}};
      readInTransaction(tx,scope,check,(current,logs,oldEnvelope,savedRecoveryFence)=>{
        const continueWithRecovery=recoveryFence=>{
        const continueWithHistory=history=>{
        try {
          if(!check())return;
          const prior=history.find(row=>row.transaction.operationId===operationId);
          if(prior){if(prior.fingerprint!==fp){reject('operation-replay-conflict');return;}done({ok:true,value:clone(prior.transaction),replayed:true});return;}
          if(expectedCopy?.scopeKey!==scope.key||current.state.revision!==expectedCopy.overlayRevision)throw Error('overlay-revision-conflict');
          let entered=false;
          const fenced=()=>{
            try {
              if(entered)throw Error('pro-input-fence-reentered');entered=true;
              if(!check())return;
              const result=execute(clone(current.state),history.map(clone));
              if(result?.then){try{Promise.prototype.then.call(result,()=>{},()=>{});}catch{}throw Error('async-pro-reducer-denied');}
              validateOverlay(result?.state);
              if(result.state.scopeKey!==scope.key||!result.transaction||result.transaction.operationId!==operationId)throw Error('invalid-pro-plan');
              const undo=result.undoneOperationId??null;
              if(undo!==null&&(typeof undo!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(undo)))throw Error('invalid-undo-operation');
              const sequence=current.sequence+1;
              const log=validateProJournal({format:'vaiwl-pro-journal/1',scopeKey:key,targetScopeKey:scope.key,sequence,fingerprint:fp,transaction:clone(result.transaction)},scope.key);
              if(log.transaction.base.overlayRevision!==current.state.revision||log.transaction.resultRevision!==result.state.revision)throw Error('pro-journal-root-mismatch');
              const archive=current.operationIds.length>=PRO_STORAGE_REGISTRY.overlay.activeJournalWindow?createHistoryRecord(current,logs):null;
              const base=archive?segmentedRoot(current,archive):current;
              const next=validateProRoot({...base,...(recoveryFence?{minimumReader:PRO_RECOVERED_READER}:{}),sequence,state:clone(result.state),operationIds:[...base.operationIds,operationId]},scope.key,{state:false});
              const serializedNext=stable(next);
              if(new TextEncoder().encode(serializedNext).length>PRO_STORAGE_REGISTRY.overlay.maximumRootBytes)throw Error('pro-record-too-large');
              const nextEnvelope=proRecord(key,next,serializedNext),recoveryHead=proRecoveryHeadForRoot(scope.key,recoveryFence,next,nextEnvelope.checksum);
              if(!check())return;
              // Fence the success event of every queued write, while abort can
              // still roll back the whole transaction (not only its reply).
              const put=(name,row)=>{const write=tx.objectStore(name).put(row),observe=write.onsuccess;write.onsuccess=event=>{try{if(check()){observe?.(event);check();}}catch(e){reject(e.message);}};};
              put('b23_checkpoints',oldEnvelope??proRecord(key,current));
              if(archive){const write=tx.objectStore('b23_checkpoints').add(archive);write.onsuccess=()=>{check();};}
              put('b23_states',nextEnvelope);
              if(recoveryHead)put('b23_states',recoveryHead);
              put('b23_operations',proRecord(opKey,log));
              if(undo){const target=history.find(x=>x.transaction.operationId===undo);if(!target)throw Error('missing-undo-operation');target.transaction.status='undone';put('b23_operations',proRecord(proOperationKey(scope.key,undo),target));}
              if(!check())return;
              done({ok:true,value:clone(log.transaction),replayed:false});
            }catch(e){reject(e.message);}
          };
          const result=verifyInputFence(tx,scope,expectedCopy,check,fenced,reject);
          if(result?.then){try{Promise.prototype.then.call(result,()=>{},()=>{});}catch{}throw Error('async-pro-input-fence-denied');}
        }catch(e){reject(e.message);}
        };
        const history=[...logs],wanted=[...new Set([operationId,...historyOperationIds])].filter(id=>!history.some(r=>r.transaction.operationId===id));
        let remaining=wanted.length;
        if(!remaining){continueWithHistory(history);return;}
        for(const id of wanted){
          const lookupKey=proOperationKey(scope.key,id),q=tx.objectStore('b23_operations').get(lookupKey);
          q.onsuccess=()=>{try{
            if(!check())return;
            if(!q.result){if(historyOperationIds.includes(id))throw Error('missing-operation');if(!--remaining)continueWithHistory(history);return;}
            const row=validateProJournal(unpackProRecord(q.result,lookupKey),scope.key);
            proveHistoricalJournal(tx,current,row,check,verified=>{history.push(verified);if(!--remaining)continueWithHistory(history);},reject);
          }catch(e){reject(e.message);}};
        }
        };
        if(savedRecoveryFence!==undefined)continueWithRecovery(savedRecoveryFence);else readProRecoveryWriteFence(tx,scope.key,current,check,continueWithRecovery,reject);
      },reject);
    }catch(e){reject(e.message);}
  }
  async function transact(grant,request,signal) {
    const verifyCurrent=request.verifyCurrent;checkActionCurrent(verifyCurrent);
    const scope=guard(grant,signal),identity=stable(scope),db=assertRegisteredProDatabase(await connection());guard(grant,signal,identity);checkActionCurrent(verifyCurrent);
    return new Promise(resolve=>{
      let tx,outcome=null,finished=false;
      const fail=reason=>{if(finished)return;outcome={ok:false,reason};try{tx?.abort();}catch{}};
      const abort=()=>fail('aborted');
      try {
        tx=db.transaction(stores,'readwrite');signal?.addEventListener('abort',abort,{once:true});
        enlist(tx,grant,request,signal,result=>{outcome=result;},fail);
        tx.oncomplete=()=>{finished=true;signal?.removeEventListener('abort',abort);try{guard(grant,signal,identity);checkActionCurrent(verifyCurrent);resolve(outcome??{ok:false,reason:'pro-no-result'});}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
        tx.onabort=()=>{finished=true;signal?.removeEventListener('abort',abort);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'pro-transaction-aborted'});};tx.onerror=()=>{};
      }catch(e){signal?.removeEventListener('abort',abort);fail(e.message);resolve({ok:false,reason:e.message});}
    });
  }
  return Object.freeze({read,readHistory,getOperation,transact,enlist,...createProRecoveryAccess({connection,guard,verifyInputFence})});
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
