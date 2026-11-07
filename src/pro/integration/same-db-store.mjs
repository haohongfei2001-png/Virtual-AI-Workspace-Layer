import {digest, sha256, stable} from '../../data/hash.mjs';
import {emptyOverlay, validateOverlay} from '../domain/index.mjs';

/** Optional integration adapter. It NEVER opens or upgrades a database.
 * The shared owner supplies its existing connection and a synchronous-in-IDB
 * input fence. Not imported by Free or any production entry point in R1.
 * The namespace is deliberately invisible to legacy Free's journal reader;
 * codec registration, backup/GC and the minimum binary reader remain owner gates.
 */
export const proRootKey = scopeKey => JSON.stringify(['vaiwl-pro-overlay/1', scopeKey]);
export const proOperationKey = (scopeKey, id) => JSON.stringify([proRootKey(scopeKey), id]);
const stores = ['b23_states', 'b23_operations', 'b23_checkpoints', 'native_states', 'native_operations'];
const clone = value => structuredClone(value);
const MAX_BYTES = 16 * 1024 * 1024;
function envelope(key, payload, serialized=stable(payload)) { return {key, payload, checksum: sha256(serialized)}; }
function unpack(row, key) {
  if (!row || row.key !== key) throw Error('pro-corrupt-record');
  const serialized=stable(row.payload);
  if (new TextEncoder().encode(serialized).length > MAX_BYTES) throw Error('pro-record-too-large');
  if (row.checksum !== sha256(serialized)) throw Error('pro-corrupt-record');
  // IndexedDB get already returns an isolated structured clone. This adapter
  // keeps no cache/alias to it; callers cannot mutate the stored row by reference.
  return row.payload;
}
function root(scopeKey) {
  return {format:'vaiwl-pro-root/1', minimumReader:'vaiwl-pro-overlay/1', scopeKey:proRootKey(scopeKey),
    targetScopeKey:scopeKey, sequence:0, state:emptyOverlay(scopeKey), operationIds:[]};
}
function validateRootEnvelope(value, scopeKey) {
  if (value?.format !== 'vaiwl-pro-root/1' || value.minimumReader !== 'vaiwl-pro-overlay/1' ||
      value.scopeKey !== proRootKey(scopeKey) || value.targetScopeKey !== scopeKey ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !Array.isArray(value.operationIds) || value.operationIds.length > 10000 ||
      value.operationIds.length !== new Set(value.operationIds).size) throw Error('pro-reader-incompatible');
  if (value.state.scopeKey !== scopeKey) throw Error('pro-cross-scope-state');
  return value;
}
function validateRoot(value, scopeKey) {
  validateRootEnvelope(value,scopeKey);
  validateOverlay(value.state);
  return value;
}

export function createSameDatabaseStore({connection, verifyGrant, verifyInputFence, enabled=false}={}) {
  if (typeof connection !== 'function' || typeof verifyGrant !== 'function' || typeof verifyInputFence !== 'function')
    throw Error('pro-shared-owner-required');
  const guard = (grant, signal) => {
    if (!enabled) throw Error('pro-integration-disabled');
    if (signal?.aborted) throw Error('aborted');
    const scope = verifyGrant(grant);
    if (!scope || typeof scope.key !== 'string' || scope.persistence !== 'same-idb') throw Error('pro-persistent-scope-required');
    return scope;
  };

  async function read(grant, signal) {
    const scope = guard(grant, signal), db = await connection();
    guard(grant, signal);
    return new Promise((resolve,reject) => {
      const tx = db.transaction(['b23_states','b23_operations'], 'readonly');
      const key = proRootKey(scope.key), request = tx.objectStore('b23_states').get(key);
      let current, logs = [], failure = null;
      const fail = error => {failure=error;try {tx.abort();} catch {}};
      request.onsuccess = () => {
        try {
          guard(grant, signal);
          current = request.result ? validateRoot(unpack(request.result,key),scope.key) : root(scope.key);
          for (const id of current.operationIds) {
            const opKey=proOperationKey(scope.key,id), q=tx.objectStore('b23_operations').get(opKey);
            q.onsuccess=()=>{try {if(!q.result)throw Error('pro-missing-journal');logs.push(unpack(q.result,opKey));}catch(e){fail(e);}};
          }
        } catch(e) {fail(e);}
      };
      tx.oncomplete=()=>{try {guard(grant,signal);logs.sort((a,b)=>a.sequence-b.sequence);resolve({state:current.state,sequence:current.sequence,records:logs});}catch(e){reject(e);}};
      tx.onabort=()=>reject(failure??tx.error??Error('pro-read-aborted'));
      tx.onerror=()=>{};
    });
  }

  /** Execute is trusted, synchronous pure code, never a JSON patch supplied by UI/model.
   * The owner checks native/evidence roots IN THIS transaction before execute.
   * On any abort both overlay and journal remain at the preceding root.
   */
  async function transact(grant, request, signal) {
    const scope=guard(grant,signal);
    const {operationId, fingerprint, expected, execute}=request;
    if(typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(operationId)||typeof execute!=='function')throw Error('invalid-pro-transaction');
    const expectedCopy=clone(expected), fp=digest(fingerprint), db=await connection();
    guard(grant,signal);
    return new Promise(resolve=>{
      const tx=db.transaction(stores,'readwrite'), key=proRootKey(scope.key), opKey=proOperationKey(scope.key,operationId);
      let outcome=null, completed=false;
      const fail=reason=>{if(completed)return;outcome={ok:false,reason};try{tx.abort();}catch{}};
      const check=()=>{try{guard(grant,signal);return true;}catch(e){fail(e.message);return false;}};
      const revoke=()=>fail('aborted');signal?.addEventListener('abort',revoke,{once:true});
      const lookup=tx.objectStore('b23_operations').get(opKey);
      lookup.onsuccess=()=>{
        if(!check())return;
        try {
          if(lookup.result){const old=unpack(lookup.result,opKey);outcome=old.fingerprint===fp?{ok:true,value:old.transaction,replayed:true}:{ok:false,reason:'operation-replay-conflict'};return;}
          const sr=tx.objectStore('b23_states').get(key);
          sr.onsuccess=()=>{
            if(!check())return;
            try {
              const current=sr.result?validateRoot(unpack(sr.result,key),scope.key):root(scope.key);
              if(expectedCopy.scopeKey!==scope.key||current.state.revision!==expectedCopy.overlayRevision)throw Error('overlay-revision-conflict');
              const logs=[];
              const finish=()=>{
                try {
                  if(!check())return;
                  verifyInputFence(tx,scope,expectedCopy,check,()=>{
                    try {
                      if(!check())return;
                      const result=execute(clone(current.state),logs.map(clone));
                      if(result?.then)throw Error('async-pro-reducer-denied');
                      const proposedState=result.state,proposedTransaction=result.transaction,undoneOperationId=result.undoneOperationId??null;
                      validateOverlay(proposedState);
                      if(proposedState.scopeKey!==scope.key||!proposedTransaction||proposedTransaction.operationId!==operationId)throw Error('invalid-pro-plan');
                      if(undoneOperationId!==null&&(typeof undoneOperationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(undoneOperationId)))throw Error('invalid-undo-operation');
                      const sequence=current.sequence+1;
                      const log={format:'vaiwl-pro-journal/1',scopeKey:key,targetScopeKey:scope.key,sequence,fingerprint:fp,transaction:clone(proposedTransaction)};
                      // Validate output once, then detach it before calling any
                      // owner fence again. A verifier cannot alter a retained
                      // execute result after validation or after checksuming.
                      const next={...current,sequence,state:clone(proposedState),operationIds:[...current.operationIds,operationId]};
                      validateRootEnvelope(next,scope.key);
                      const serializedNext=stable(next);
                      if(new TextEncoder().encode(serializedNext).length>MAX_BYTES)throw Error('pro-record-too-large');
                      if(!check())return;
                      // Reuse the already verified previous envelope. execute
                      // received a separate clone, so checkpoint stays exact.
                      tx.objectStore('b23_checkpoints').put(sr.result??envelope(key,current));
                      tx.objectStore('b23_states').put(envelope(key,next,serializedNext));
                      tx.objectStore('b23_operations').put(envelope(opKey,log));
                      if(undoneOperationId){
                        const prior=logs.find(x=>x.transaction.operationId===undoneOperationId);
                        if(!prior)throw Error('missing-undo-operation');
                        prior.transaction.status='undone';
                        tx.objectStore('b23_operations').put(envelope(proOperationKey(scope.key,undoneOperationId),prior));
                      }
                      if(!check())return;
                      outcome={ok:true,value:clone(log.transaction),replayed:false};
                    }catch(e){fail(e.message);}
                  },fail);
                }catch(e){fail(e.message);}
              };
              if(!current.operationIds.length){finish();return;}
              let remaining=current.operationIds.length;
              for(const id of current.operationIds){
                const k=proOperationKey(scope.key,id),q=tx.objectStore('b23_operations').get(k);
                q.onsuccess=()=>{try{if(!check())return;if(!q.result)throw Error('pro-missing-journal');logs.push(unpack(q.result,k));if(!--remaining)finish();}catch(e){fail(e.message);}};
              }
            }catch(e){fail(e.message);}
          };
        }catch(e){fail(e.message);}
      };
      tx.oncomplete=()=>{completed=true;signal?.removeEventListener('abort',revoke);try{guard(grant,signal);resolve(outcome??{ok:false,reason:'pro-no-result'});}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
      tx.onabort=()=>{completed=true;signal?.removeEventListener('abort',revoke);resolve(outcome?.ok===false?outcome:{ok:false,reason:tx.error?.name??'pro-transaction-aborted'});};
      tx.onerror=()=>{};
    });
  }
  return Object.freeze({read,transact});
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
