import {digest,stable} from '../../data/hash.mjs';
import {exact,uint,hash,array} from '../domain/schema.mjs';
import {validateOverlay} from '../domain/index.mjs';
import {PRO_STORAGE_REGISTRY,PRO_HISTORY_FORMAT,PRO_SEGMENTED_READER,PRO_RECOVERED_READER,proRootKey,proHistoryKey,proRecord,
  validateProHistoryPointer,validateProRoot,validateProJournalChain,validateProJournal} from './storage-registry.mjs';

const bytes=value=>new TextEncoder().encode(stable(value)).length;
// A later explicit undo updates only status. The original receipt, inverse,
// source versions and operation fingerprint stay sealed in their history page.
export function immutableJournalDigest(row){const copy=structuredClone(row);delete copy.transaction.status;return digest(copy);}
export function historyPointer(row){const p=row.payload;return {number:p.number,sequence:p.sequence,revision:p.state.revision,visibleCount:p.visibleCount,checksum:row.checksum};}
export function validateHistoryRecord(row,scopeKey,pointer=null){
  exact(row,['key','payload','checksum']);hash(row.checksum);
  if(bytes(row)>PRO_STORAGE_REGISTRY.overlay.maximumHistoryBytes)throw Error('pro-history-capacity');
  const p=row.payload;exact(p,['format','scopeKey','targetScopeKey','number','startSequence','sequence','baseRevision','previous','operationIds','operationDigests','actors','visibleCount','state']);
  if(p.format!==PRO_HISTORY_FORMAT||p.scopeKey!==proRootKey(scopeKey)||p.targetScopeKey!==scopeKey||row.key!==proHistoryKey(scopeKey,p.number)||row.checksum!==digest(p))throw Error('pro-history-corrupt');
  uint(p.number);uint(p.startSequence);uint(p.sequence);uint(p.baseRevision);if(!p.number)throw Error('pro-history-corrupt');
  if(p.previous===null){if(p.number!==1||p.startSequence!==1||p.baseRevision!==0)throw Error('pro-history-chain-invalid');}
  else {validateProHistoryPointer(p.previous);if(p.number!==p.previous.number+1||p.startSequence!==p.previous.sequence+1||p.baseRevision!==p.previous.revision)throw Error('pro-history-chain-invalid');}
  array(p.operationIds,PRO_STORAGE_REGISTRY.overlay.maximumOperations);array(p.operationDigests,PRO_STORAGE_REGISTRY.overlay.maximumOperations).forEach(hash);
  array(p.actors,PRO_STORAGE_REGISTRY.overlay.maximumOperations);uint(p.visibleCount);
  if(p.actors.length!==p.operationIds.length||p.actors.some(actor=>!['human','automation','system'].includes(actor))||p.visibleCount!==(p.previous?.visibleCount??0)+p.actors.filter(actor=>actor!=='system').length)throw Error('pro-history-chain-invalid');
  if(!p.operationIds.length||p.operationDigests.length!==p.operationIds.length||p.sequence!==p.startSequence+p.operationIds.length-1||new Set(p.operationIds).size!==p.operationIds.length||p.operationIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw Error('pro-history-chain-invalid');
  validateOverlay(p.state);if(p.state.scopeKey!==scopeKey)throw Error('pro-history-cross-scope');
  if(pointer&&stable(historyPointer(row))!==stable(validateProHistoryPointer(pointer)))throw Error('pro-history-anchor-mismatch');
  return p;
}
export function createHistoryRecord(current,records){
  validateProRoot(current,current.targetScopeKey);validateProJournalChain(current,records);
  const scopeKey=current.targetScopeKey,number=(current.history?.number??0)+1;
  const p={format:PRO_HISTORY_FORMAT,scopeKey:proRootKey(scopeKey),targetScopeKey:scopeKey,number,
    startSequence:(current.history?.sequence??0)+1,sequence:current.sequence,baseRevision:current.history?.revision??0,
    previous:current.history??null,operationIds:[...current.operationIds],operationDigests:records.map(immutableJournalDigest),actors:records.map(r=>r.transaction.actor),
    visibleCount:(current.history?.visibleCount??0)+records.filter(r=>r.transaction.actor!=='system').length,state:structuredClone(current.state)};
  const row=proRecord(proHistoryKey(scopeKey,number),p);validateHistoryRecord(row,scopeKey);return row;
}
export function segmentedRoot(current,archive){
  validateHistoryRecord(archive,current.targetScopeKey);
  return validateProRoot({...current,format:'vaiwl-pro-root/2',minimumReader:current.minimumReader===PRO_RECOVERED_READER?PRO_RECOVERED_READER:PRO_SEGMENTED_READER,history:historyPointer(archive),operationIds:[]},current.targetScopeKey);
}
export function assertHistoryJournal(segment,row){
  validateProJournal(row,segment.targetScopeKey);const index=row.sequence-segment.startSequence;
  if(index<0||index>=segment.operationIds.length||segment.operationIds[index]!==row.transaction.operationId||segment.actors[index]!==row.transaction.actor||segment.operationDigests[index]!==immutableJournalDigest(row))throw Error('pro-history-journal-mismatch');
  return row;
}

/** All callbacks stay in the caller's existing IndexedDB transaction. No
 * database opening, authority creation, pruning or external work is involved. */
export function readHistorySegment(tx,scopeKey,pointer,check,ready,fail){
  const q=tx.objectStore('b23_checkpoints').get(proHistoryKey(scopeKey,pointer.number));
  q.onsuccess=()=>{try{if(!check())return;if(!q.result)throw Error('pro-missing-history-segment');ready(validateHistoryRecord(q.result,scopeKey,pointer),q.result);}catch(e){fail(e.message);}};
}
export function proveHistoricalJournal(tx,current,row,check,ready,fail){
  if(row.sequence>(current.history?.sequence??0)){const index=row.sequence-(current.history?.sequence??0)-1;if(current.operationIds[index]!==row.transaction.operationId){fail('pro-orphan-operation');return;}ready(row);return;}
  const visit=pointer=>readHistorySegment(tx,current.targetScopeKey,pointer,check,segment=>{
    try{if(row.sequence>=segment.startSequence){assertHistoryJournal(segment,row);ready(row);}else if(segment.previous)visit(segment.previous);else fail('pro-orphan-operation');}catch(e){fail(e.message);}
  },fail);
  if(!current.history){fail('pro-orphan-operation');return;}visit(current.history);
}
