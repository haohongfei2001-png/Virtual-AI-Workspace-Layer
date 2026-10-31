import {digest,stable} from '../../data/hash.mjs';
import {exact,hash,uint,json,validateVersions,TABLE_KINDS} from '../domain/schema.mjs';
import {replayOverlayJournal} from '../migration/recovery.mjs';
import {PRO_STORAGE_REGISTRY,PRO_OVERLAY_NAMESPACE,PRO_RECOVERY_NAMESPACE,PRO_RECOVERY_READER,PRO_SEGMENTED_READER,PRO_RECOVERED_READER,
  proRootKey,proOperationKey,proRecoveryKey,proRecoveryHeadKey,proRecoveryReceiptKey,proHistoryKey,proRecord,unpackProRecord,emptyProRoot,
  validateProRoot,validateProJournal,validateProJournalChain,assertRegisteredProDatabase} from './storage-registry.mjs';
import {validateHistoryRecord,historyPointer} from './storage-history.mjs';

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
  if(!(p.format==='vaiwl-pro-root/1'&&[PRO_OVERLAY_NAMESPACE,PRO_RECOVERED_READER].includes(p.minimumReader)||p.format==='vaiwl-pro-root/2'&&[PRO_SEGMENTED_READER,PRO_RECOVERED_READER].includes(p.minimumReader))||p.state?.schema!==PRO_OVERLAY_NAMESPACE)throw Error('pro-recovery-reader-incompatible');
}
function validRoot(row,scopeKey) {try{return row&&validateProRoot(unpackProRecord(row,proRootKey(scopeKey)),scopeKey);}catch{return null;}}
function recoveryCheckpointWitness(prior,checkpoint,previous,sequence,current){
  return Boolean(prior&&previous&&checkpoint&&current&&previous.minimumReader===PRO_RECOVERED_READER&&
    current.sequence===sequence&&current.overlayRevision===previous.state.revision&&current.checksum===checkpoint.checksum&&prior.targetScopeKey===previous.targetScopeKey&&
    prior.repairedChecksum===checkpoint.checksum&&prior.receipt.sequence===sequence&&
    previous.sequence===sequence&&prior.receipt.overlayRevision===previous.state.revision);
}
function assertRecoveredHighWater(marker,repaired){
  if(marker&&(marker.sequence!==repaired.payload.sequence||marker.overlayRevision!==repaired.payload.state.revision||marker.checksum!==repaired.checksum))throw Error('pro-recovery-current-root-mismatch');
}

/** Pure reconstruction using the existing strict replay codec. There is no
 * permission, native action, model job or transport in a replayable patch.
 * Codec /1 retains every journal row; no implicit empty prefix is permitted.
 */
export function planProRecovery(scopeKey,{root,checkpoint,journals,histories=[],priorRecovery=null,recoveryCurrent=null},expected) {
  validateVersions(expected);if(expected.scopeKey!==scopeKey)throw Error('pro-recovery-cross-scope');
  knownRootRow(root,scopeKey);knownRootRow(checkpoint,scopeKey);
  if(!priorRecovery&&[root,checkpoint].some(row=>row?.payload?.minimumReader===PRO_RECOVERED_READER))throw Error('pro-recovery-first-receipt-missing');
  const anchor=selectRecoveryAnchor(scopeKey,root,checkpoint,histories);
  if(anchor)return planSegmentedRecovery(scopeKey,{root,checkpoint,journals,anchor,priorRecovery,recoveryCurrent},expected);
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
  if(recoveryCurrent&&sequence!==recoveryCurrent.sequence)throw Error('pro-recovery-incomplete-history');
  if(!sequence)throw Error(root===null&&checkpoint===null?'pro-recovery-no-history':'pro-recovery-incomplete-history');
  if(records.some((r,i)=>r.sequence!==i+1)||new Set(records.map(r=>r.transaction.operationId)).size!==sequence)throw Error('pro-recovery-incomplete-history');
  const original=validRoot(root,scopeKey),previous=validRoot(checkpoint,scopeKey);
  // A missing last journal leaves a deceptively contiguous prefix. The live
  // root's high-water mark, or the previous-root checkpoint written in the
  // SAME atomic commit as one final successor, must positively prove the end.
  const rootWitness=original?.sequence===sequence;
  const checkpointWitness=previous?.sequence===sequence-1;
  const repairedCheckpointWitness=recoveryCheckpointWitness(priorRecovery,checkpoint,previous,sequence,recoveryCurrent);
  if(!rootWitness&&!checkpointWitness&&!repairedCheckpointWitness)throw Error('pro-recovery-high-water-unproven');
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
  const recovered=validateProRoot({...empty,minimumReader:PRO_RECOVERED_READER,sequence,state:replay.state,operationIds:records.map(r=>r.transaction.operationId)},scopeKey);
  validateProJournalChain(recovered,records);
  if(original&&stable({...original,minimumReader:PRO_RECOVERED_READER})!==stable(recovered))throw Error('pro-recovery-root-history-conflict');
  if(original&&stable({...original,minimumReader:PRO_RECOVERED_READER})===stable(recovered)&&previous&&!(original.minimumReader===PRO_RECOVERED_READER&&!recoveryCurrent))throw Error('pro-recovery-not-needed');
  const serialized=boundedJSON(recovered,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes,'pro-record-too-large');
  const repaired=proRecord(proRootKey(scopeKey),recovered,serialized),journalDigest=digest(envelopeDigests);
  assertRecoveredHighWater(recoveryCurrent,repaired);
  const planHash=digest({format:PRO_RECOVERY_NAMESPACE,scopeKey,expected,root,checkpoint,journalDigest,repairedChecksum:repaired.checksum,previousRepair:priorRecovery?digest(priorRecovery):null,recoveryCurrent});
  return {planHash,sequence,overlayRevision:recovered.state.revision,counts:countsFor(recovered.state),needsRevalidation:true,
    repaired,original:{root:clone(root),checkpoint:clone(checkpoint)},journalDigest};
}

/** Version 2 retains every old journal and full inverse, while a sealed page
 * supplies the same durable checkpoint boundary used by normal reads. A
 * missing/damaged current root must still be proved by the prior-root
 * high-water witness. An arbitrary newer history page is never trusted. */
function selectRecoveryAnchor(scopeKey,root,checkpoint,histories){
  const original=validRoot(root,scopeKey),previous=validRoot(checkpoint,scopeKey),known=[original,previous].filter(Boolean),candidates=[];
  for(const row of histories){
    const p=validateHistoryRecord(row,scopeKey),pointer=historyPointer(row);
    const referenced=known.some(r=>r.history&&stable(r.history)===stable(pointer));
    const rollover=known.some(r=>p.sequence===r.sequence&&stable(p.state)===stable(r.state)&&stable(p.operationIds)===stable(r.operationIds)&&stable(p.previous)===stable(r.history??null));
    if(referenced||rollover)candidates.push(row);
  }
  for(const r of known)if(r.history&&!histories.some(row=>stable(historyPointer(row))===stable(r.history)))throw Error('pro-missing-history-segment');
  candidates.sort((a,b)=>b.payload.sequence-a.payload.sequence);
  if(!candidates.length&&(original?.history||previous?.history))throw Error('pro-recovery-history-anchor-unproven');
  return candidates[0]??null;
}
function planSegmentedRecovery(scopeKey,{root,checkpoint,journals,anchor,priorRecovery,recoveryCurrent},expected){
  const segment=validateHistoryRecord(anchor,scopeKey),pointer=historyPointer(anchor),baseSequence=segment.sequence;
  if(!Array.isArray(journals)||journals.length>PRO_STORAGE_REGISTRY.overlay.maximumOperations)throw Error('pro-recovery-journal-capacity');
  const records=[],envelopeDigests=[];let bytes=0;
  for(const row of journals){
    const serialized=boundedJSON(row,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes+4096,'pro-recovery-journal-capacity');bytes+=encoder.encode(serialized).length;
    if(bytes>PRO_STORAGE_REGISTRY.recovery.maximumReplayBytes)throw Error('pro-recovery-journal-capacity');
    const log=validateProJournal(unpackProRecord(row,row.key),scopeKey);
    if(row.key!==proOperationKey(scopeKey,log.transaction.operationId))throw Error('pro-recovery-journal-key');
    if(log.sequence<=baseSequence)continue;
    records.push(log);envelopeDigests.push({key:row.key,digest:digest(row)});
  }
  records.sort((a,b)=>a.sequence-b.sequence);envelopeDigests.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  const sequence=baseSequence+records.length,original=validRoot(root,scopeKey),previous=validRoot(checkpoint,scopeKey);
  if(recoveryCurrent&&sequence!==recoveryCurrent.sequence)throw Error('pro-recovery-incomplete-history');
  if(records.some((r,i)=>r.sequence!==baseSequence+i+1)||new Set(records.map(r=>r.transaction.operationId)).size!==records.length)throw Error('pro-recovery-incomplete-history');
  if(original?.sequence!==sequence&&previous?.sequence!==sequence-1&&!recoveryCheckpointWitness(priorRecovery,checkpoint,previous,sequence,recoveryCurrent))throw Error('pro-recovery-high-water-unproven');
  if(Number.isSafeInteger(root?.payload?.sequence)&&root.payload.sequence>sequence||original&&original.sequence>sequence||previous&&previous.sequence>sequence)throw Error('pro-recovery-incomplete-history');
  const indexed=new Set([...segment.operationIds,...records.map(r=>r.transaction.operationId)]);
  if(Array.isArray(root?.payload?.operationIds)&&root.payload.operationIds.some(id=>!indexed.has(id)))throw Error('pro-recovery-incomplete-history');
  const replay=replayOverlayJournal({state:segment.state,sequence:baseSequence},records);
  if(previous&&previous.sequence>=baseSequence){const prefix=records.filter(r=>r.sequence<=previous.sequence),proved=replayOverlayJournal({state:segment.state,sequence:baseSequence},prefix);if(stable(proved.state)!==stable(previous.state))throw Error('pro-recovery-checkpoint-history-conflict');}
  const recovered=validateProRoot({...emptyProRoot(scopeKey),format:'vaiwl-pro-root/2',minimumReader:PRO_RECOVERED_READER,
    history:pointer,sequence,state:replay.state,operationIds:records.map(r=>r.transaction.operationId)},scopeKey);
  validateProJournalChain(recovered,records);
  if(original&&stable({...original,minimumReader:PRO_RECOVERED_READER})!==stable(recovered))throw Error('pro-recovery-root-history-conflict');
  if(original&&stable({...original,minimumReader:PRO_RECOVERED_READER})===stable(recovered)&&previous&&!(original.minimumReader===PRO_RECOVERED_READER&&!recoveryCurrent))throw Error('pro-recovery-not-needed');
  const serialized=boundedJSON(recovered,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes,'pro-record-too-large'),repaired=proRecord(proRootKey(scopeKey),recovered,serialized);
  assertRecoveredHighWater(recoveryCurrent,repaired);
  const journalDigest=digest({anchor:anchor.checksum,records:envelopeDigests});
  const planHash=digest({format:PRO_RECOVERY_NAMESPACE,scopeKey,expected,root,checkpoint,journalDigest,repairedChecksum:repaired.checksum,previousRepair:priorRecovery?digest(priorRecovery):null,recoveryCurrent});
  return {planHash,sequence,overlayRevision:recovered.state.revision,counts:countsFor(recovered.state),needsRevalidation:true,
    repaired,original:{root:clone(root),checkpoint:clone(checkpoint)},journalDigest};
}

function validateRecoveryPointer(pointer,scopeKey){
  exact(pointer,['number','key','operationId','checksum']);uint(pointer.number);operationId(pointer.operationId);hash(pointer.checksum);
  if(!pointer.number||pointer.key!==(pointer.number===1?proRecoveryKey(scopeKey):proRecoveryReceiptKey(scopeKey,pointer.operationId)))throw Error('pro-recovery-head-invalid');
  return pointer;
}
function recoveryPointer(row,scopeKey,payload=unpackRecovery(row,scopeKey)){
  return validateRecoveryPointer({number:payload.number??1,key:row.key,operationId:payload.receipt.operationId,checksum:row.checksum},scopeKey);
}
function unpackRecovery(row,scopeKey) {
  const key=proRecoveryKey(scopeKey);exact(row,['key','payload','checksum']);
  boundedJSON(row,PRO_STORAGE_REGISTRY.recovery.maximumRecordBytes,'pro-recovery-quarantine-capacity');
  if(row.checksum!==digest(row.payload))throw Error('pro-recovery-quarantine-corrupt');
  const p=row.payload,appended=p.format===PRO_RECOVERY_READER;
  exact(p,['format','scopeKey','targetScopeKey','fingerprint','receipt','original','journalDigest','repairedChecksum',...(appended?['number','previous']:[])]);
  if(!(p.format===PRO_RECOVERY_NAMESPACE||appended)||p.scopeKey!==key||p.targetScopeKey!==scopeKey)throw Error('pro-recovery-reader-incompatible');
  hash(p.fingerprint);hash(p.journalDigest);hash(p.repairedChecksum);exact(p.original,['root','checkpoint']);
  knownRootRow(p.original.root,scopeKey);knownRootRow(p.original.checkpoint,scopeKey);
  const r=p.receipt;exact(r,['operationId','planHash','sequence','overlayRevision','counts','needsRevalidation','processingMode']);
  operationId(r.operationId);hash(r.planHash);uint(r.sequence);uint(r.overlayRevision);exact(r.counts,Object.keys(TABLE_KINDS));Object.values(r.counts).forEach(uint);
  if(r.needsRevalidation!==true||r.processingMode!=='off')throw Error('pro-recovery-quarantine-corrupt');
  if(appended){uint(p.number);validateRecoveryPointer(p.previous,scopeKey);if(p.number<2||p.previous.number!==p.number-1||row.key!==proRecoveryReceiptKey(scopeKey,r.operationId))throw Error('pro-recovery-history-invalid');}
  else if(row.key!==key)throw Error('pro-recovery-quarantine-corrupt');
  return p;
}
function unpackRecoveryHead(row,scopeKey){
  exact(row,['key','payload','checksum']);boundedJSON(row,PRO_STORAGE_REGISTRY.recovery.maximumHeadBytes,'pro-recovery-head-capacity');
  const p=row.payload;exact(p,['format','minimumReader','scopeKey','targetScopeKey','latest','current']);
  if(row.key!==proRecoveryHeadKey(scopeKey)||row.checksum!==digest(p)||p.scopeKey!==proRecoveryKey(scopeKey)||p.targetScopeKey!==scopeKey)throw Error('pro-recovery-head-corrupt');
  if(p.format!=='vaiwl-pro-recovery-head/1'||p.minimumReader!==PRO_RECOVERY_READER)throw Error('pro-recovery-reader-incompatible');
  validateRecoveryPointer(p.latest,scopeKey);exact(p.current,['sequence','overlayRevision','checksum']);uint(p.current.sequence);uint(p.current.overlayRevision);hash(p.current.checksum);return p;
}

/** Every post-repair overlay writer must advance this marker in the SAME
 * transaction. The /3 minimum reader prevents older writers omitting it. */
export function readProRecoveryWriteFence(tx,scopeKey,current,check,ready,fail){
  const store=tx.objectStore('b23_states'),q=store.get(proRecoveryHeadKey(scopeKey));
  q.onsuccess=()=>{try{
    if(!check())return;
    if(q.result){const head=unpackRecoveryHead(q.result,scopeKey);if(current.minimumReader!==PRO_RECOVERED_READER||head.current.sequence!==current.sequence||head.current.overlayRevision!==current.state.revision||head.current.checksum!==digest(current))throw Error('pro-recovery-current-root-mismatch');ready(head);return;}
    if(current.minimumReader===PRO_RECOVERED_READER)throw Error('pro-recovery-head-missing');
    const legacy=store.get(proRecoveryKey(scopeKey));legacy.onsuccess=()=>{try{
      if(!check())return;const payload=legacy.result?unpackRecovery(legacy.result,scopeKey):null;
      if(payload&&payload.receipt.sequence>current.sequence)throw Error('pro-recovery-current-root-mismatch');
      const prefix=JSON.stringify([proRecoveryKey(scopeKey)]).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff'),retained=store.openCursor(range);
      retained.onsuccess=()=>{try{
        if(!check())return;const cursor=retained.result;
        if(!cursor){ready(payload?{format:'vaiwl-pro-recovery-head/1',minimumReader:PRO_RECOVERY_READER,scopeKey:proRecoveryKey(scopeKey),targetScopeKey:scopeKey,latest:recoveryPointer(legacy.result,scopeKey,payload),current:{sequence:current.sequence,overlayRevision:current.state.revision,checksum:digest(current)}}:null);return;}
        if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix))throw Error('pro-recovery-head-missing');cursor.continue();
      }catch(e){fail(e.message);}};
    }catch(e){fail(e.message);}};
  }catch(e){fail(e.message);}};
}
export function proRecoveryHeadForRoot(scopeKey,fence,root,checksum=digest(root)){
  if(!fence)return null;
  if(root.minimumReader!==PRO_RECOVERED_READER)throw Error('pro-recovery-minimum-reader-required');
  const row=proRecord(proRecoveryHeadKey(scopeKey),{...clone(fence),current:{sequence:root.sequence,overlayRevision:root.state.revision,checksum}});unpackRecoveryHead(row,scopeKey);return row;
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
    const scopeKey=ctx.scope.key,store=ctx.tx.objectStore('b23_states'),legacy=store.get(proRecoveryKey(scopeKey)),head=store.get(proRecoveryHeadKey(scopeKey));let remaining=2;
    const complete=current=>{
      const prefix=JSON.stringify([proRecoveryKey(scopeKey)]).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff'),q=store.openCursor(range),entries=new Map();
      q.onsuccess=()=>{try{
        if(!ctx.check())return;const cursor=q.result;
        if(!cursor){
          if(!head.result&&entries.size)throw Error('pro-recovery-head-missing');
          if(current){
            if(entries.size!==current.pointer.number-1)throw Error('pro-recovery-history-incomplete');
            let previous=recoveryPointer(current.legacyRow,scopeKey,current.legacyPayload);
            for(let number=2;number<=current.pointer.number;number++){const entry=entries.get(number);if(!entry||stable(entry.previous)!==stable(previous))throw Error('pro-recovery-history-mismatch');previous=entry.pointer;}
            if(stable(previous)!==stable(current.pointer))throw Error('pro-recovery-head-mismatch');
          }
          ready(current);return;
        }
        if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix)&&cursor.primaryKey!==proRecoveryHeadKey(scopeKey)){
          const payload=unpackRecovery(cursor.value,scopeKey),pointer=recoveryPointer(cursor.value,scopeKey,payload);
          if(pointer.number<2||entries.has(pointer.number))throw Error('pro-recovery-history-mismatch');
          entries.set(pointer.number,{pointer,previous:payload.previous});
        }
        cursor.continue();
      }catch(e){ctx.fail(e.message);}};
    };
    const inspect=()=>{try{
      if(!ctx.check()||--remaining)return;
      const first=legacy.result?unpackRecovery(legacy.result,scopeKey):null;
      if(!head.result){
        // /1 had no head. An appended /2 receipt without a head must never be
        // mistaken for that legacy case and silently fork the repair history.
        complete(first?{row:legacy.result,payload:first,pointer:recoveryPointer(legacy.result,scopeKey,first),legacyRow:legacy.result,legacyPayload:first,current:null}:null);return;
      }
      const savedHead=unpackRecoveryHead(head.result,scopeKey),pointer=savedHead.latest;if(!first)throw Error('pro-recovery-first-receipt-missing');
      const done=row=>{const payload=unpackRecovery(row,scopeKey);if(stable(recoveryPointer(row,scopeKey,payload))!==stable(pointer)||savedHead.current.sequence<payload.receipt.sequence)throw Error('pro-recovery-head-mismatch');complete({row,payload,pointer,legacyRow:legacy.result,legacyPayload:first,current:savedHead.current});};
      if(pointer.number===1){done(legacy.result);return;}
      const q=store.get(pointer.key);q.onsuccess=()=>{try{if(!ctx.check())return;if(!q.result)throw Error('pro-recovery-receipt-missing');done(q.result);}catch(e){ctx.fail(e.message);}};
    }catch(e){ctx.fail(e.message);}};
    legacy.onsuccess=inspect;head.onsuccess=inspect;
  }
  function readRecoveryReceipt(ctx,current,id,ready){
    if(!current){ready(null);return;}
    const verify=(row,payload)=>{
      const target=recoveryPointer(row,ctx.scope.key,payload);
      if(target.number>current.pointer.number){ctx.fail('pro-recovery-orphan-receipt');return;}
      const visit=(pointer,knownRow=null,knownPayload=null)=>{
        const inspect=record=>{try{
          if(!ctx.check())return;if(!record)throw Error('pro-recovery-receipt-missing');const value=knownPayload??unpackRecovery(record,ctx.scope.key);
          if(stable(recoveryPointer(record,ctx.scope.key,value))!==stable(pointer))throw Error('pro-recovery-history-mismatch');
          if(pointer.number===target.number){if(stable(pointer)!==stable(target))throw Error('pro-recovery-orphan-receipt');ready(payload);return;}
          if(!value.previous)throw Error('pro-recovery-orphan-receipt');visit(value.previous);
        }catch(e){ctx.fail(e.message);}};
        if(knownRow){inspect(knownRow);return;}const q=ctx.tx.objectStore('b23_states').get(pointer.key);q.onsuccess=()=>inspect(q.result);
      };visit(current.pointer,current.row,current.payload);
    };
    if(current.legacyPayload.receipt.operationId===id){verify(current.legacyRow,current.legacyPayload);return;}
    const q=ctx.tx.objectStore('b23_states').get(proRecoveryReceiptKey(ctx.scope.key,id));q.onsuccess=()=>{try{if(!ctx.check())return;if(!q.result){ready(null);return;}verify(q.result,unpackRecovery(q.result,ctx.scope.key));}catch(e){ctx.fail(e.message);}};
  }
  function census(ctx,expected,recoveryState,ready) {
    const key=proRootKey(ctx.scope.key),root=ctx.tx.objectStore('b23_states').get(key),checkpoint=ctx.tx.objectStore('b23_checkpoints').get(key),journals=[],histories=[];
    let remaining=2,bytes=0;
    const scan=()=>{
      let floor;try{knownRootRow(root.result??null,ctx.scope.key);knownRootRow(checkpoint.result??null,ctx.scope.key);floor=selectRecoveryAnchor(ctx.scope.key,root.result??null,checkpoint.result??null,histories)?.payload.sequence??0;}catch(e){ctx.fail(e.message);return;}
      const prefix=JSON.stringify([key]).slice(0,-1)+',',range=globalThis.IDBKeyRange?.bound(prefix,prefix+'\uffff');
      const q=ctx.tx.objectStore('b23_operations').openCursor(range);
      q.onsuccess=()=>{try{
        if(!ctx.check())return;const cursor=q.result;
        if(!cursor){ready(planProRecovery(ctx.scope.key,{root:root.result??null,checkpoint:checkpoint.result??null,journals,histories,priorRecovery:recoveryState?.payload??null,recoveryCurrent:recoveryState?.current??null},expected));return;}
        if(typeof cursor.primaryKey==='string'&&cursor.primaryKey.startsWith(prefix)){
          const row=cursor.value;
          // Sealed archived data remains on disk. Recovery of the active root
          // starts at the positively witnessed checkpoint; historical pages are
          // independently verified when browsed or used for undo/idempotency.
          if(!Number.isSafeInteger(row?.payload?.sequence)||row.payload.sequence>floor){
            const serialized=boundedJSON(row,PRO_STORAGE_REGISTRY.overlay.maximumRootBytes+4096,'pro-recovery-journal-capacity');
            bytes+=encoder.encode(serialized).length;if(journals.length>=PRO_STORAGE_REGISTRY.overlay.maximumOperations||bytes>PRO_STORAGE_REGISTRY.recovery.maximumReplayBytes)throw Error('pro-recovery-journal-capacity');
            journals.push(row);
          }
        }
        cursor.continue();
      }catch(e){ctx.fail(e.message);}};
    };
    const rootsReady=()=>{
      if(--remaining)return;
      try{
        const known=[validRoot(root.result,ctx.scope.key),validRoot(checkpoint.result,ctx.scope.key)].filter(Boolean),numbers=new Set();
        for(const r of known){if(r.history)numbers.add(r.history.number);if(r.operationIds.length>=PRO_STORAGE_REGISTRY.overlay.activeJournalWindow)numbers.add((r.history?.number??0)+1);}
        if(!numbers.size){scan();return;}let pending=numbers.size;
        for(const number of numbers){const q=ctx.tx.objectStore('b23_checkpoints').get(proHistoryKey(ctx.scope.key,number));q.onsuccess=()=>{try{if(!ctx.check())return;if(q.result)histories.push(q.result);if(!--pending)scan();}catch(e){ctx.fail(e.message);}};}
      }catch(e){ctx.fail(e.message);}
    };
    for(const q of [root,checkpoint])q.onsuccess=()=>{if(ctx.check())rootsReady();};
  }
  async function previewRecovery(grant,{expected},signal) {
    const expectedCopy=clone(expected);
    return run(grant,signal,false,ctx=>readRecovery(ctx,prior=>{
      census(ctx,expectedCopy,prior,plan=>fence(ctx,expectedCopy,()=>ctx.done({planHash:plan.planHash,sequence:plan.sequence,overlayRevision:plan.overlayRevision,counts:plan.counts,needsRevalidation:true})));
    }));
  }
  async function reconcileRecovery(grant,{operationId:id,requestFingerprint},signal) {
    try{operationId(id);const fingerprint=fingerprintOf(requestFingerprint);
      return await run(grant,signal,false,ctx=>readRecovery(ctx,current=>readRecoveryReceipt(ctx,current,id,prior=>{
        if(!prior||prior.receipt.operationId!==id){ctx.done(null);return;}
        if(prior.fingerprint!==fingerprint){ctx.fail('operation-replay-conflict');return;}
        ctx.done({ok:true,value:clone(prior.receipt),replayed:true});
      })));
    }catch(e){return {ok:false,reason:e.message};}
  }
  async function recover(grant,{operationId:id,expected,planHash,requestFingerprint},signal) {
    try{
      operationId(id);hash(planHash);validateVersions(expected);const expectedCopy=clone(expected),fingerprint=fingerprintOf(requestFingerprint===undefined?{planHash,expected:expectedCopy}:requestFingerprint);
      return await run(grant,signal,true,ctx=>readRecovery(ctx,current=>readRecoveryReceipt(ctx,current,id,prior=>{
        if(prior){
          if(prior.fingerprint!==fingerprint||prior.receipt.planHash!==planHash){ctx.fail('operation-replay-conflict');return;}
          ctx.done({ok:true,value:clone(prior.receipt),replayed:true});return;
        }
        census(ctx,expectedCopy,current,plan=>{
          if(plan.planHash!==planHash){ctx.fail('pro-recovery-plan-changed');return;}
          fence(ctx,expectedCopy,()=>{
            const receipt={operationId:id,planHash,sequence:plan.sequence,overlayRevision:plan.overlayRevision,counts:plan.counts,needsRevalidation:true,processingMode:'off'};
            const quarantine=proRecord(current?proRecoveryReceiptKey(ctx.scope.key,id):proRecoveryKey(ctx.scope.key),{format:current?PRO_RECOVERY_READER:PRO_RECOVERY_NAMESPACE,scopeKey:proRecoveryKey(ctx.scope.key),targetScopeKey:ctx.scope.key,
              ...(current?{number:current.pointer.number+1,previous:clone(current.pointer)}:{}),fingerprint,receipt,original:plan.original,journalDigest:plan.journalDigest,repairedChecksum:plan.repaired.checksum});
            const payload=unpackRecovery(quarantine,ctx.scope.key),head=proRecord(proRecoveryHeadKey(ctx.scope.key),{format:'vaiwl-pro-recovery-head/1',minimumReader:PRO_RECOVERY_READER,scopeKey:proRecoveryKey(ctx.scope.key),targetScopeKey:ctx.scope.key,latest:recoveryPointer(quarantine,ctx.scope.key,payload),current:{sequence:plan.sequence,overlayRevision:plan.overlayRevision,checksum:plan.repaired.checksum}});
            unpackRecoveryHead(head,ctx.scope.key);
            // The immutable receipt, bounded current pointer and both restored
            // rows commit or abort together. All prior evidence is retained.
            for(const [store,row,method] of [['b23_states',quarantine,'add'],['b23_states',head,'put'],['b23_checkpoints',plan.repaired,'put'],['b23_states',plan.repaired,'put']]){
              if(!ctx.check())return;const write=ctx.tx.objectStore(store)[method](row),observe=write.onsuccess;
              write.onsuccess=event=>{try{if(ctx.check()){observe?.(event);ctx.check();}}catch(e){ctx.fail(e.message);}};
            }
            if(ctx.check())ctx.done({ok:true,value:clone(receipt),replayed:false});
          });
        });
      })));
    }catch(e){return {ok:false,reason:e.message};}
  }
  return Object.freeze({previewRecovery,recover,reconcileRecovery});
}
