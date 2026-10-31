import {digest,stable} from '../../data/hash.mjs';
import {exact,hash,uint,json,validateVersions,TABLE_KINDS} from '../domain/schema.mjs';
import {replayOverlayJournal} from '../migration/recovery.mjs';
import {PRO_STORAGE_REGISTRY,PRO_OVERLAY_NAMESPACE,PRO_RECOVERY_NAMESPACE,
  proRootKey,proOperationKey,proRecoveryKey,proRecord,unpackProRecord,emptyProRoot,
  validateProRoot,validateProJournal,validateProJournalChain,assertRegisteredProDatabase} from './storage-registry.mjs';

const clone=value=>structuredClone(value),encoder=new TextEncoder();
const stores=['b23_states','b23_operations','b23_checkpoints','native_states','native_operations'];
const operationId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw Error('invalid-pro-recovery-operation');return value;};
const boundedJSON=(value,maximum,reason)=>{json(value);const serialized=stable(value);if(encoder.encode(serialized).length>maximum)throw Error(reason);return serialized;};
const fingerprintOf=value=>{boundedJSON(value,65536,'pro-recovery-fingerprint-too-large');return digest(value);};
const countsFor=state=>Object.fromEntries(Object.keys(TABLE_KINDS).map(table=>[table,Object.keys(state[table]).length]));

/** The rejected rows are preserved verbatim as structured JSON records. A
 * future codec, foreign scope or non-JSON damaged value cannot be safely
 * classified, so it is never overwritten by this reader. */
function knownRootRow(row,scopeKey) {
  if(row===null)return;
  boundedJSON(row,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes+4096,'pro-recovery-original-too-large');
  const p=row?.payload;
  if(row.key!==proRootKey(scopeKey)||p?.scopeKey!==proRootKey(scopeKey)||p?.targetScopeKey!==scopeKey||p?.state?.scopeKey!==scopeKey)throw Error('pro-recovery-cross-scope');
  if(p.format!=='vaiwl-pro-root/1'||p.minimumReader!==PRO_OVERLAY_NAMESPACE||p.state?.schema!==PRO_OVERLAY_NAMESPACE)throw Error('pro-recovery-reader-incompatible');
}
function validRoot(row,scopeKey) {try{return row&&validateProRoot(unpackProRecord(row,proRootKey(scopeKey)),scopeKey);}catch{return null;}}

/** Pure reconstruction using the existing strict replay codec. There is no
 * permission, native action, model job or transport in a replayable patch.
 * Codec /1 retains every journal row; no implicit empty prefix is permitted.
 */
export function planProRecovery(scopeKey,{root,checkpoint,journals},expected) {
  validateVersions(expected);if(expected.scopeKey!==scopeKey)throw Error('pro-recovery-cross-scope');
  knownRootRow(root,scopeKey);knownRootRow(checkpoint,scopeKey);
  if(!Array.isArray(journals)||journals.length>PRO_STORAGE_REGISTRY.overlay.maximumOperations)throw Error('pro-recovery-journal-capacity');
  let bytes=0;const records=[],envelopeDigests=[];
  for(const row of journals){
    const serialized=boundedJSON(row,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes+4096,'pro-recovery-journal-capacity');
    bytes+=encoder.encode(serialized).length;if(bytes>PRO_STORAGE_REGISTRY.recovery.maximumReplayBytes)throw Error('pro-recovery-journal-capacity');
    const log=validateProJournal(unpackProRecord(row,row.key),scopeKey);
    if(row.key!==proOperationKey(scopeKey,log.transaction.operationId))throw Error('pro-recovery-journal-key');
    records.push(log);envelopeDigests.push({key:row.key,digest:digest(row)});
  }
  records.sort((a,b)=>a.sequence-b.sequence);envelopeDigests.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  const sequence=records.length;
  if(!sequence)throw Error(root===null&&checkpoint===null?'pro-recovery-no-history':'pro-recovery-incomplete-history');
  if(records.some((r,i)=>r.sequence!==i+1)||new Set(records.map(r=>r.transaction.operationId)).size!==sequence)throw Error('pro-recovery-incomplete-history');
  const original=validRoot(root,scopeKey),previous=validRoot(checkpoint,scopeKey);
  // A missing last journal leaves a deceptively contiguous prefix. The live
  // root's high-water mark, or the previous-root checkpoint written in the
  // SAME atomic commit as one final successor, must positively prove the end.
  const rootWitness=original?.sequence===sequence;
  const checkpointWitness=previous?.sequence===sequence-1;
  if(!rootWitness&&!checkpointWitness)throw Error('pro-recovery-high-water-unproven');
  if(original&&original.sequence>sequence||previous&&previous.sequence>sequence)throw Error('pro-recovery-incomplete-history');
  // A recognizable rejected root index may contain a higher committed mark.
  // Never discard it solely because its envelope checksum is damaged.
  if(Number.isSafeInteger(root?.payload?.sequence)&&root.payload.sequence>sequence||
    Array.isArray(root?.payload?.operationIds)&&root.payload.operationIds.some(id=>!records.some(r=>r.transaction.operationId===id)))throw Error('pro-recovery-incomplete-history');
  const empty=emptyProRoot(scopeKey);
  let replay;
  if(previous){
    const prefix=records.slice(0,previous.sequence),proved=replayOverlayJournal({state:empty.state,sequence:0},prefix);
    if(stable(proved.state)!==stable(previous.state)||stable(previous.operationIds)!==stable(prefix.map(r=>r.transaction.operationId)))throw Error('pro-recovery-checkpoint-history-conflict');
    replay=replayOverlayJournal(proved,records.slice(previous.sequence));
  }else replay=replayOverlayJournal({state:empty.state,sequence:0},records);
  if(replay.sequence!==sequence)throw Error('pro-recovery-incomplete-history');
  const recovered=validateProRoot({...empty,sequence,state:replay.state,operationIds:records.map(r=>r.transaction.operationId)},scopeKey);
  validateProJournalChain(recovered,records);
  if(original&&stable(original)!==stable(recovered))throw Error('pro-recovery-root-history-conflict');
  if(original&&stable(original)===stable(recovered)&&previous)throw Error('pro-recovery-not-needed');
  const serialized=boundedJSON(recovered,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes,'pro-record-too-large');
  const repaired=proRecord(proRootKey(scopeKey),recovered,serialized),journalDigest=digest(envelopeDigests);
  const planHash=digest({format:PRO_RECOVERY_NAMESPACE,scopeKey,expected,root,checkpoint,journalDigest,repairedChecksum:repaired.checksum});
  return {planHash,sequence,overlayRevision:recovered.state.revision,counts:countsFor(recovered.state),needsRevalidation:true,
    repaired,original:{root:clone(root),checkpoint:clone(checkpoint)},journalDigest};
}

function unpackRecovery(row,scopeKey) {
  const key=proRecoveryKey(scopeKey);exact(row,['key','payload','checksum']);
  boundedJSON(row,PRO_STORAGE_REGISTRY.recovery.maximumRecordBytes,'pro-recovery-quarantine-capacity');
  if(row.key!==key||row.checksum!==digest(row.payload))throw Error('pro-recovery-quarantine-corrupt');
  const p=row.payload;exact(p,['format','scopeKey','targetScopeKey','fingerprint','receipt','original','journalDigest','repairedChecksum']);
  if(p.format!==PRO_RECOVERY_NAMESPACE||p.scopeKey!==key||p.targetScopeKey!==scopeKey)throw Error('pro-recovery-reader-incompatible');
  hash(p.fingerprint);hash(p.journalDigest);hash(p.repairedChecksum);exact(p.original,['root','checkpoint']);
  knownRootRow(p.original.root,scopeKey);knownRootRow(p.original.checkpoint,scopeKey);
  const r=p.receipt;exact(r,['operationId','planHash','sequence','overlayRevision','counts','needsRevalidation','processingMode']);
  operationId(r.operationId);hash(r.planHash);uint(r.sequence);uint(r.overlayRevision);exact(r.counts,Object.keys(TABLE_KINDS));Object.values(r.counts).forEach(uint);
  if(r.needsRevalidation!==true||r.processingMode!=='off')throw Error('pro-recovery-quarantine-corrupt');
  return p;
}

/** Only the same-DB owner constructs this capability with its existing opaque
 * grant guard and source fence. Preview is read-only; repair always needs a
 * separate explicit operation and the exact reviewed private plan hash. */
export function createProRecoveryAccess({connection,guard,verifyInputFence}) {
  async function run(grant,signal,write,work) {
    const scope=guard(grant,signal),identity=stable(scope),db=assertRegisteredProDatabase(await connection());guard(grant,signal,identity);
    return new Promise((resolve,reject)=>{
      let tx,answer,failed=null,finished=false;
      const fail=reason=>{if(finished||failed)return;failed=Error(reason);try{tx?.abort();}catch{}};
      const check=()=>{if(failed)return false;try{guard(grant,signal,identity);return true;}catch(e){fail(e.message);return false;}};
      const abort=()=>fail('aborted');
      try{
        tx=db.transaction(stores,write?'readwrite':'readonly');signal?.addEventListener('abort',abort,{once:true});
        tx.oncomplete=()=>{finished=true;signal?.removeEventListener('abort',abort);try{guard(grant,signal,identity);if(answer===undefined)throw Error('pro-recovery-no-result');resolve(answer);}catch(e){if(write)resolve({ok:false,reason:'stale-after-commit',committed:true});else reject(e);}};
        tx.onabort=()=>{finished=true;signal?.removeEventListener('abort',abort);reject(failed??tx.error??Error('pro-recovery-aborted'));};tx.onerror=()=>{};
        if(check())work({tx,scope,check,fail,done:value=>{answer=value;}});
      }catch(e){signal?.removeEventListener('abort',abort);fail(e.message);reject(e);}
    });
  }
  function fence(ctx,expected,ready) {
    try{
      validateVersions(expected);if(expected.scopeKey!==ctx.scope.key)throw Error('pro-recovery-cross-scope');
      let entered=false;const done=()=>{try{if(entered)throw Error('pro-input-fence-reentered');entered=true;if(ctx.check())ready();}catch(e){ctx.fail(e.message);}};
      const value=verifyInputFence(ctx.tx,ctx.scope,expected,ctx.check,done,ctx.fail);
      if(value?.then){try{Promise.prototype.then.call(value,()=>{},()=>{});}catch{}throw Error('async-pro-input-fence-denied');}
    }catch(e){ctx.fail(e.message);}
  }
  function readRecovery(ctx,ready) {
    const q=ctx.tx.objectStore('b23_states').get(proRecoveryKey(ctx.scope.key));q.onsuccess=()=>{try{if(ctx.check())ready(q.result?unpackRecovery(q.result,ctx.scope.key):null);}catch(e){ctx.fail(e.message);}};
  }
  function census(ctx,expected,ready) {
    const key=proRootKey(ctx.scope.key),root=ctx.tx.objectStore('b23_states').get(key),checkpoint=ctx.tx.objectStore('b23_checkpoints').get(key),journals=[];
    let remaining=3,bytes=0;const finish=()=>{if(--remaining)return;try{if(ctx.check())ready(planProRecovery(ctx.scope.key,{root:root.result??null,checkpoint:checkpoint.result??null,journals},expected));}catch(e){ctx.fail(e.message);}};
    for(const q of [root,checkpoint])q.onsuccess=()=>{if(ctx.check())finish();};
    // The primary key range also sees rows whose damaged scopeKey no longer
    // belongs to the secondary index. No journal is hidden by that corruption.
    const prefix=JSON.stringify([key]).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff');
    const q=ctx.tx.objectStore('b23_operations').openCursor(range);
    q.onsuccess=()=>{try{
      if(!ctx.check())return;const cursor=q.result;
      if(!cursor){finish();return;}
      if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix)){
        const row=cursor.value,serialized=boundedJSON(row,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes+4096,'pro-recovery-journal-capacity');
        bytes+=encoder.encode(serialized).length;if(journals.length>=PRO_STORAGE_REGISTRY.overlay.maximumOperations||bytes>PRO_STORAGE_REGISTRY.recovery.maximumReplayBytes)throw Error('pro-recovery-journal-capacity');
        journals.push(row);
      }
      cursor.continue();
    }catch(e){ctx.fail(e.message);}};
  }
  async function previewRecovery(grant,{expected},signal) {
    const expectedCopy=clone(expected);
    return run(grant,signal,false,ctx=>readRecovery(ctx,prior=>{
      if(prior){ctx.fail('pro-recovery-quarantine-occupied');return;}
      census(ctx,expectedCopy,plan=>fence(ctx,expectedCopy,()=>ctx.done({planHash:plan.planHash,sequence:plan.sequence,overlayRevision:plan.overlayRevision,counts:plan.counts,needsRevalidation:true})));
    }));
  }
  async function reconcileRecovery(grant,{operationId:id,requestFingerprint},signal) {
    try{operationId(id);const fingerprint=fingerprintOf(requestFingerprint);
      return await run(grant,signal,false,ctx=>readRecovery(ctx,prior=>{
        if(!prior||prior.receipt.operationId!==id){ctx.done(null);return;}
        if(prior.fingerprint!==fingerprint){ctx.fail('operation-replay-conflict');return;}
        ctx.done({ok:true,value:clone(prior.receipt),replayed:true});
      }));
    }catch(e){return {ok:false,reason:e.message};}
  }
  async function recover(grant,{operationId:id,expected,planHash,requestFingerprint},signal) {
    try{
      operationId(id);hash(planHash);validateVersions(expected);const expectedCopy=clone(expected),fingerprint=fingerprintOf(requestFingerprint===undefined?{planHash,expected:expectedCopy}:requestFingerprint);
      return await run(grant,signal,true,ctx=>readRecovery(ctx,prior=>{
        if(prior){
          if(prior.receipt.operationId!==id){ctx.fail('pro-recovery-quarantine-occupied');return;}
          if(prior.fingerprint!==fingerprint||prior.receipt.planHash!==planHash){ctx.fail('operation-replay-conflict');return;}
          ctx.done({ok:true,value:clone(prior.receipt),replayed:true});return;
        }
        census(ctx,expectedCopy,plan=>{
          if(plan.planHash!==planHash){ctx.fail('pro-recovery-plan-changed');return;}
          fence(ctx,expectedCopy,()=>{
            const receipt={operationId:id,planHash,sequence:plan.sequence,overlayRevision:plan.overlayRevision,counts:plan.counts,needsRevalidation:true,processingMode:'off'};
            const quarantine=proRecord(proRecoveryKey(ctx.scope.key),{format:PRO_RECOVERY_NAMESPACE,scopeKey:proRecoveryKey(ctx.scope.key),targetScopeKey:ctx.scope.key,fingerprint,receipt,original:plan.original,journalDigest:plan.journalDigest,repairedChecksum:plan.repaired.checksum});
            unpackRecovery(quarantine,ctx.scope.key);
            // The immutable add and both restored rows commit or abort together.
            // Journal rows and all native/shared/billing rows remain untouched.
            for(const [store,row,method] of [['b23_states',quarantine,'add'],['b23_checkpoints',plan.repaired,'put'],['b23_states',plan.repaired,'put']]){
              if(!ctx.check())return;const write=ctx.tx.objectStore(store)[method](row),observe=write.onsuccess;
              write.onsuccess=event=>{try{if(ctx.check())observe?.(event);}catch(e){ctx.fail(e.message);}};
            }
            if(ctx.check())ctx.done({ok:true,value:clone(receipt),replayed:false});
          });
        });
      }));
    }catch(e){return {ok:false,reason:e.message};}
  }
  return Object.freeze({previewRecovery,recover,reconcileRecovery});
}
