import {digest, sha256, stable} from '../../data/hash.mjs';
import {DATABASE_VERSION} from '../../data/schema.mjs';
import {emptyOverlay, validateOverlay} from '../domain/index.mjs';
import {exact, id, uint, hash, array, json, validateVersions, KIND_TABLES} from '../domain/schema.mjs';

/** Registered codecs in DB4's existing stores. Namespace ownership is separate
 * from account authority: none of these functions can issue a live grant. */
export const PRO_OVERLAY_NAMESPACE = 'vaiwl-pro-overlay/1';
export const PRO_BILLING_NAMESPACE = 'vaiwl-pro-billing/1';
export const PRO_RECOVERY_NAMESPACE = 'vaiwl-pro-recovery/1';
export const UNIFIED_MINIMUM_READER = 'vaiwl-unified-r1/1';
export const PRO_STORAGE_REGISTRY = Object.freeze({
  databaseVersion: 4,
  minimumReader: UNIFIED_MINIMUM_READER,
  overlay: Object.freeze({namespace: PRO_OVERLAY_NAMESPACE, stores: Object.freeze(['b23_states','b23_checkpoints','b23_operations']),
    maximumRootBytes: 16 * 1024 * 1024, maximumOperations: 10000, backup: 'data-only-scope-assets',
    retention: 'retain-root-checkpoint-all-journal-and-inverse', downgrade: 'legacy-free-ignores-namespace'}),
  billing: Object.freeze({namespace: PRO_BILLING_NAMESPACE, stores: Object.freeze(['b23_states','b23_operations']),
    maximumRootBytes: 8 * 1024 * 1024, maximumOperations: 10000, maximumJobs: 1000,
    backup: 'never-import-permissions-or-reset-installation-cost',
    retention: 'retain-all-including-uncertain-dispatch', downgrade: 'legacy-free-ignores-namespace'}),
  recovery: Object.freeze({namespace: PRO_RECOVERY_NAMESPACE, stores: Object.freeze(['b23_states']),
    maximumRecordBytes: 34 * 1024 * 1024, maximumReplayBytes: 64 * 1024 * 1024,
    maximumSnapshotsPerScope: 1, backup: 'private-quarantine-not-a-portable-asset',
    retention: 'retain-original-root-checkpoint-and-exact-repair-receipt', downgrade: 'legacy-free-ignores-namespace'})
});
export const proRootKey = scopeKey => JSON.stringify([PRO_OVERLAY_NAMESPACE, scopeKey]);
export const proOperationKey = (scopeKey, operationId) => JSON.stringify([proRootKey(scopeKey), operationId]);
export const proRecoveryKey = scopeKey => JSON.stringify([PRO_RECOVERY_NAMESPACE, scopeKey]);
const encoder = new TextEncoder();
export const proRecord = (key, payload, serialized=stable(payload)) => ({key,payload,checksum:sha256(serialized)});
export function unpackProRecord(row,key) {
  exact(row,['key','payload','checksum']);
  const serialized=stable(row.payload);
  if(row.key!==key||row.checksum!==sha256(serialized))throw Error('pro-corrupt-record');
  if(encoder.encode(serialized).length>PRO_STORAGE_REGISTRY.overlay.maximumRootBytes)throw Error('pro-record-too-large');
  return row.payload;
}
export function assertRegisteredProDatabase(db) {
  if(db?.version!==DATABASE_VERSION||DATABASE_VERSION!==PRO_STORAGE_REGISTRY.databaseVersion||
      ['b23_states','b23_operations','b23_checkpoints','native_states','native_operations'].some(name=>!db.objectStoreNames.contains(name)))
    throw Error('pro-unregistered-storage');
  return db;
}
export function emptyProRoot(scopeKey) {
  return {format:'vaiwl-pro-root/1',minimumReader:PRO_OVERLAY_NAMESPACE,scopeKey:proRootKey(scopeKey),
    targetScopeKey:scopeKey,sequence:0,state:emptyOverlay(scopeKey),operationIds:[]};
}
export function validateProRoot(root,scopeKey,{state=true}={}) {
  exact(root,['format','minimumReader','scopeKey','targetScopeKey','sequence','state','operationIds']);
  if(root.format!=='vaiwl-pro-root/1'||root.minimumReader!==PRO_OVERLAY_NAMESPACE||root.scopeKey!==proRootKey(scopeKey)||
      root.targetScopeKey!==scopeKey)throw Error('pro-reader-incompatible');
  uint(root.sequence);array(root.operationIds,PRO_STORAGE_REGISTRY.overlay.maximumOperations);
  if(root.sequence!==root.operationIds.length||new Set(root.operationIds).size!==root.operationIds.length)throw Error('pro-journal-index-invalid');
  for(const operationId of root.operationIds)if(typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(operationId))throw Error('pro-journal-operation-invalid');
  if(root.state?.scopeKey!==scopeKey)throw Error('pro-cross-scope-state');
  if(state)validateOverlay(root.state);
  return root;
}
export function validateProJournal(row,scopeKey) {
  exact(row,['format','scopeKey','targetScopeKey','sequence','fingerprint','transaction']);
  if(row.format!=='vaiwl-pro-journal/1'||row.scopeKey!==proRootKey(scopeKey)||row.targetScopeKey!==scopeKey)throw Error('pro-journal-cross-scope');
  uint(row.sequence);hash(row.fingerprint);
  const t=row.transaction;
  exact(t,['operationId','actor','provenance','base','planHash','resultRevision','proposalId','inverse','patch','inverseHash','readSet','status'],['proposalIds']);
  id(t.operationId);id(t.provenance);validateVersions(t.base);hash(t.planHash);hash(t.inverseHash);uint(t.resultRevision);
  if(t.base.scopeKey!==scopeKey)throw Error('pro-journal-cross-scope');
  if(!['human','automation','system'].includes(t.actor)||!['applied','undone','needs-revalidation'].includes(t.status))throw Error('pro-journal-transaction-invalid');
  if(t.proposalId!==null)id(t.proposalId);if(t.proposalIds!==undefined){array(t.proposalIds,40).forEach(id);if(new Set(t.proposalIds).size!==t.proposalIds.length)throw Error('pro-journal-proposal-invalid');}
  array(t.patch);array(t.inverse);array(t.readSet);json(t);
  const seen=new Set();
  for(const p of t.patch){
    exact(p,['kind','key','before','after','beforeDigest','afterDigest']);id(p.key);hash(p.beforeDigest);hash(p.afterDigest);
    if(!KIND_TABLES[p.kind]||seen.has(p.kind+':'+p.key)||digest(p.before)!==p.beforeDigest||digest(p.after)!==p.afterDigest)throw Error('pro-journal-patch-invalid');
    seen.add(p.kind+':'+p.key);
  }
  if(t.inverseHash!==digest({inverse:t.inverse,readSet:t.readSet}))throw Error('pro-journal-inverse-invalid');
  const original=new Map(t.patch.filter(p=>p.kind!=='proposal-record').map(p=>[p.kind+':'+p.key,p])),inverseKeys=new Set();
  for(const inverse of t.inverse){
    exact(inverse,['kind','key','expectedAfterDigest','restoreValue']);id(inverse.key);hash(inverse.expectedAfterDigest);
    const key=inverse.kind+':'+inverse.key,p=original.get(key);
    if(!p||inverseKeys.has(key)||inverse.expectedAfterDigest!==p.afterDigest||stable(inverse.restoreValue)!==stable(p.before))throw Error('pro-journal-inverse-patch-mismatch');
    inverseKeys.add(key);
  }
  // The isolated initialization fixture predates production registration and
  // has no human undo. Every actual human/automation receipt is complete.
  if(t.actor!=='system'&&inverseKeys.size!==original.size)throw Error('pro-journal-incomplete-inverse');
  const readKinds=['topic-membership-set','topic-series-set','reference-placement-set','topic-constraint-set','reference-constraint-set','topic-redirect-set'],readKeys=new Set();
  for(const read of t.readSet){
    exact(read,['kind','key','expectedAfterDigest']);id(read.key);hash(read.expectedAfterDigest);const key=read.kind+':'+read.key;
    if(!KIND_TABLES[read.kind]&&!readKinds.includes(read.kind)||readKeys.has(key))throw Error('pro-journal-read-set-invalid');readKeys.add(key);
  }
  if(t.actor==='system'&&t.provenance==='proposal-registration'){
    if(t.resultRevision!==t.base.overlayRevision||t.patch.some(p=>p.kind!=='proposal-record')||t.inverse.length||t.readSet.length)throw Error('pro-journal-registration-invalid');
  }else if(t.resultRevision<=t.base.overlayRevision)throw Error('pro-journal-revision-invalid');
  return row;
}
export function validateProJournalChain(root,records) {
  if(records.length!==root.operationIds.length)throw Error('pro-missing-journal');
  records.sort((a,b)=>a.sequence-b.sequence);
  for(let i=0;i<records.length;i++){
    const r=validateProJournal(records[i],root.targetScopeKey);
    if(r.sequence!==i+1||r.transaction.operationId!==root.operationIds[i]||
        i>0&&r.transaction.base.overlayRevision!==records[i-1].transaction.resultRevision)throw Error('pro-journal-chain-invalid');
  }
  if(records.length&&records.at(-1).transaction.resultRevision!==root.state.revision)throw Error('pro-journal-root-mismatch');
  return records;
}

/** Retention is deliberately lossless for codec /1. Its complete journal is the
 * replay/idempotency index and holds current inverse dependencies. A generic GC
 * must never delete these rows because a Free scope does not reference them.
 * Capacity is a write refusal, never permission to drop undo or uncertain cost. */
export function proRetentionDecision(key) {
  let parsed;try{parsed=JSON.parse(key);}catch{return null;}
  if(!Array.isArray(parsed))return null;
  const root=typeof parsed[0]==='string'&&parsed[0].startsWith('[')?(()=>{try{return JSON.parse(parsed[0]);}catch{return null;}})():parsed;
  if(!Array.isArray(root)||![PRO_OVERLAY_NAMESPACE,PRO_BILLING_NAMESPACE,PRO_RECOVERY_NAMESPACE].includes(root[0]))return null;
  return Object.freeze({action:'retain',namespace:root[0],reason:root[0]===PRO_BILLING_NAMESPACE?'installation-cost-and-dispatch-history':root[0]===PRO_RECOVERY_NAMESPACE?'original-corruption-evidence-and-repair-receipt':'assets-recovery-inverse-and-operation-replay'});
}
