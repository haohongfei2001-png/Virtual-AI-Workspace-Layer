import {digest,stable} from '../../data/hash.mjs';
import {validateOverlay} from '../domain/index.mjs';
import {KIND_TABLES,exact,array,json,uint,hash,id,oneOf,validateVersions} from '../domain/schema.mjs';

/** Sequential data replay. No model transport, grant, native effect or credential
 * can be expressed in this codec. Automatic patches are NOT skipped.
 */
export function replayOverlayJournal(checkpoint,records) {
  exact(checkpoint,['state','sequence']);uint(checkpoint.sequence);array(records,10000);
  validateOverlay(checkpoint.state);
  let state=structuredClone(checkpoint.state),sequence=checkpoint.sequence;
  const sequences=new Set(),operations=new Set();
  for(const row of records) {
    exact(row,['sequence','transaction'],['format','scopeKey','targetScopeKey','fingerprint']);uint(row.sequence);
    if(sequences.has(row.sequence))throw Error('journal-duplicate-sequence');
    sequences.add(row.sequence);
    if(row.format!==undefined&&row.format!=='vaiwl-pro-journal/1')throw Error('journal-format');
    if(row.targetScopeKey!==undefined&&row.targetScopeKey!==state.scopeKey)throw Error('journal-cross-scope');
    if(row.scopeKey!==undefined&&row.scopeKey!==JSON.stringify(['vaiwl-pro-overlay/1',state.scopeKey]))throw Error('journal-cross-scope');
    if(row.fingerprint!==undefined)hash(row.fingerprint);
    const tx=row.transaction;
    exact(tx,['operationId','actor','provenance','base','planHash','resultRevision','proposalId','inverse','patch','inverseHash','readSet','status'],['proposalIds']);
    id(tx.operationId);if(operations.has(tx.operationId))throw Error('journal-duplicate-operation');operations.add(tx.operationId);
    validateVersions(tx.base);hash(tx.planHash);hash(tx.inverseHash);uint(tx.resultRevision);array(tx.patch);array(tx.inverse);array(tx.readSet);
    oneOf(tx.status,['applied','undone','needs-revalidation']);
    if(tx.proposalId!==null)id(tx.proposalId);
    if(tx.proposalIds!==undefined)array(tx.proposalIds,40).forEach(id);
    json(tx);
  }
  const sorted=[...records].sort((a,b)=>a.sequence-b.sequence);
  for(const row of sorted) {
    if(row.sequence<=checkpoint.sequence)continue;
    if(row.sequence!==sequence+1)throw Error('journal-sequence-gap');
    const tx=row.transaction;
    if(tx.base.scopeKey!==state.scopeKey)throw Error('journal-cross-scope');
    if(!['human','automation','system'].includes(tx.actor))throw Error('journal-invalid-actor');
    if(tx.base.overlayRevision!==state.revision)throw Error('journal-base-revision-conflict');
    const registration=tx.actor==='system'&&tx.provenance==='proposal-registration';
    if(tx.resultRevision!==state.revision+(registration?0:1))throw Error('journal-result-revision-conflict');
    if(registration&&tx.patch.some(p=>p.kind!=='proposal-record'))throw Error('registration-overlay-write-denied');
    array(tx.patch);
    const next=structuredClone(state);
    for(const p of tx.patch) {
      exact(p,['kind','key','before','after','beforeDigest','afterDigest']);id(p.key);hash(p.beforeDigest);hash(p.afterDigest);
      const table=KIND_TABLES[p.kind];
      if(!table)throw Error('journal-non-overlay-effect');
      if(digest(next[table][p.key]??null)!==p.beforeDigest||digest(p.before)!==p.beforeDigest||digest(p.after)!==p.afterDigest)
        throw Error('journal-patch-conflict');
      if(p.after===null)delete next[table][p.key];else next[table][p.key]=structuredClone(p.after);
    }
    next.revision=tx.resultRevision;validateOverlay(next);state=next;sequence=row.sequence;
  }
  return {state,sequence};
}

function acceptedAssets(state) {
  const value=structuredClone(state);
  // Proposals are recomputable machine work. No persisted request or permission.
  value.proposals={};
  validateOverlay(value);return value;
}
export function exportOverlayBackup(state,{legacyAssetsDigest=null}={}) {
  validateOverlay(state);
  if(legacyAssetsDigest!==null)hash(legacyAssetsDigest);
  const payload={format:'vaiwl-pro-backup/1',scopeKey:state.scopeKey,state:acceptedAssets(state),legacyAssetsDigest};
  return {...payload,checksum:digest(payload)};
}
export function importOverlayBackup(value,{scopeKey}={}) {
  json(value);exact(value,['format','scopeKey','state','legacyAssetsDigest','checksum']);
  const {checksum,...payload}=value;
  if(value.legacyAssetsDigest!==null)hash(value.legacyAssetsDigest);
  if(value.format!=='vaiwl-pro-backup/1'||value.scopeKey!==scopeKey||value.state.scopeKey!==scopeKey||digest(payload)!==checksum)throw Error('invalid-pro-backup');
  validateOverlay(value.state);
  if(Object.keys(value.state.proposals).length)throw Error('backup-machine-work-denied');
  // The return value is data only. The owner must get a NEW live grant and CAS.
  return {state:structuredClone(value.state),needsRevalidation:true,processingMode:'off',jobs:[]};
}

export function previewBackupRestore(current,backup) {
  validateOverlay(current);
  const imported=importOverlayBackup(backup,{scopeKey:current.scopeKey});
  // An empty *view* can still contain hard exclusions, trash, Series or manual
  // ordering. Replacing those would discard user intent or relax processing.
  // A nonempty target needs its own reviewed merge; this is an empty-root import.
  if(Object.values(KIND_TABLES).some(table=>Object.keys(current[table]).length))
    throw Error('restore-requires-empty-target-or-explicit-merge');
  const state={...imported.state,revision:current.revision+1};
  const patch=[];
  for(const [kind,table] of Object.entries(KIND_TABLES))for(const key of new Set([...Object.keys(current[table]),...Object.keys(state[table])])) {
    const before=current[table][key]??null,after=state[table][key]??null;
    if(stable(before)!==stable(after))patch.push({kind,key,before,after,beforeDigest:digest(before),afterDigest:digest(after)});
  }
  return {state,patch,planHash:digest({scopeKey:current.scopeKey,revision:current.revision,patch}),needsRevalidation:true};
}
