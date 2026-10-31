import {normalizedScope} from '../../b1/identity.mjs';
import {digest,stable} from '../../data/hash.mjs';
import {parseBackup,previewBackup} from '../../data/backup.mjs';
import {overlayChanges,validateOverlay} from '../domain/index.mjs';
import {exact,json,KIND_TABLES,validateVersions} from '../domain/schema.mjs';
import {exportOverlayBackup,importOverlayBackup} from '../migration/recovery.mjs';
import {planLegacyMigration} from '../migration/legacy.mjs';
import {UNIFIED_MINIMUM_READER,PRO_STORAGE_REGISTRY} from './storage-registry.mjs';
import {BACKUP_MAX_BYTES} from '../../host/backup-transfer.mjs';
const clone=x=>structuredClone(x);
const check=(options={})=>{if(options.signal?.aborted||options.guard&&options.guard()!==true)throw Error('stale-binding');};
const scopeOf=value=>{const scope=normalizedScope(value);if(!scope)throw Error('unverified-scope');return scope;};
function size(value){if(new TextEncoder().encode(stable(value)).length>BACKUP_MAX_BYTES)throw Error('unified-backup-too-large');}
export function parseCompositeBackup(bundle,scope) {
  const s=scopeOf(scope);json(bundle);exact(bundle,['format','version','minimumReader','scopeKey','free','pro','checksum']);size(bundle);
  const {checksum,...payload}=bundle;
  if(bundle.format!=='vaiwl-unified-assets'||bundle.version!==1||bundle.minimumReader!==UNIFIED_MINIMUM_READER||
      bundle.scopeKey!==s.key||digest(payload)!==checksum)throw Error('invalid-unified-backup');
  parseBackup(bundle.free,s);
  importOverlayBackup(bundle.pro,{scopeKey:s.key});
  if(bundle.pro.legacyAssetsDigest!==bundle.free.checksum)throw Error('unified-backup-pair-mismatch');
  return clone(bundle);
}

/** Conservative explicit merge: exact existing rows are kept; disjoint assets
 * are added. Conflicts never silently overwrite human work or relax exclusions.
 * Callers may display this dry-run, but a conflicting plan cannot be committed. */
export function previewOverlayMerge(current,backup) {
  validateOverlay(current);const incoming=importOverlayBackup(backup,{scopeKey:current.scopeKey}).state;
  const next=clone(current),conflicts=[],summary={added:0,updated:0,keptHuman:0,keptNewer:0};
  for(const [kind,table] of Object.entries(KIND_TABLES))for(const [key,row] of Object.entries(incoming[table])){
    const live=current[table][key];
    if(live){if(stable(live)===stable(row)){summary.keptHuman++;continue;}
      conflicts.push({kind,key,currentDigest:digest(live),incomingDigest:digest(row)});continue;}
    next[table][key]=clone(row);summary.added++;
  }
  next.revision=current.revision+1;
  if(!conflicts.length){try{validateOverlay(next);}catch(error){conflicts.push({kind:'invariant',key:'overlay',reason:'incoming-assets-conflict-with-existing-constraints'});}}
  const patch=conflicts.length?[]:overlayChanges(current,next);
  return {state:conflicts.length?null:next,patch,summary,conflicts,needsRevalidation:true,
    planHash:digest({scopeKey:current.scopeKey,revision:current.revision,incoming:backup.checksum,patch,conflicts})};
}
const combineSummary=(a,b)=>Object.fromEntries(['added','updated','keptHuman','keptNewer'].map(key=>[key,a[key]+b[key]]));
const planHashFor=(free,pro,versions,bundle)=>digest({format:'vaiwl-unified-restore-plan/1',free:free.planHash,pro:pro.planHash,versions,bundle:bundle.checksum});
function restoreReadSet(state,patch){
  const reads=new Map(),topics=new Set(),refs=new Set();
  const add=(kind,key,value)=>reads.set(kind+':'+key,{kind,key,expectedAfterDigest:digest(value)});
  for(const p of patch)if(p.kind!=='proposal-record'){
    add(p.kind,p.key,p.after);if(p.kind==='topic')topics.add(p.key);
    for(const row of [p.before,p.after])if(row){if(row.topicId)topics.add(row.topicId);if(row.fromTopicId)topics.add(row.fromTopicId);if(row.toTopicId)topics.add(row.toTopicId);if(row.conversationId)refs.add(row.conversationId);if(row.refId)refs.add(row.refId);}
  }
  const selected=(table,predicate)=>Object.entries(state[table]).filter(([,row])=>predicate(row)).sort(([a],[b])=>a.localeCompare(b));
  // Use the same aggregate kinds understood by the domain's undo checker.
  // Later members/Series/exclusions must be visible in the undo preview, even
  // when none of the original restored rows was edited directly.
  for(const key of topics){
    add('topic-membership-set',key,selected('placements',p=>p.topicId===key));
    add('topic-series-set',key,selected('series',s=>s.topicId===key));
    add('topic-constraint-set',key,selected('constraints',c=>c.topicId===key||c.topicIds?.includes(key)));
    add('topic-redirect-set',key,selected('redirects',r=>r.fromTopicId===key||r.toTopicId===key));
  }
  for(const key of refs){add('reference-placement-set',key,selected('placements',p=>p.conversationId===key));add('reference-constraint-set',key,selected('constraints',c=>c.refId===key));}
  return [...reads.values()];
}
function transactionFor(plan,operationId,expected,provenance='explicit-backup-restore'){
  const inverse=plan.patch.filter(p=>p.kind!=='proposal-record').map(p=>({kind:p.kind,key:p.key,expectedAfterDigest:p.afterDigest,restoreValue:clone(p.before)}));
  const readSet=restoreReadSet(plan.state,plan.patch);
  return {operationId,actor:'human',provenance,base:clone(expected),planHash:plan.planHash,resultRevision:plan.state.revision,
    proposalId:null,patch:clone(plan.patch),inverse,inverseHash:digest({inverse,readSet}),readSet,status:'applied'};
}

/** A drop-in repository for the existing chunked, live-grant Host backup
 * service. resolvePro is supplied by the packaged authorization owner and must
 * return its existing {store,grant,versions}; a scope-shaped object is not a grant.
 * Neither permission, job queues, provider keys nor installation billing enter
 * portable backups. In particular restore never zeros uncertain provider cost. */
export function createCompositeBackupRepository({workspaceRepository,resolvePro,onRestored=null}={}) {
  if(!workspaceRepository||!['exportBackup','previewRestore','restoreBackup','read','mutate'].every(k=>typeof workspaceRepository[k]==='function')||
      typeof resolvePro!=='function'||onRestored!==null&&typeof onRestored!=='function')throw Error('unified-backup-owner-required');
  async function context(scope,options){
    check(options);const owner=await resolvePro(scope,options);check(options);
    if(!owner||!['read','enlist'].every(k=>typeof owner.store?.[k]==='function'))throw Error('unified-backup-pro-owner-required');
    validateVersions(owner.versions);if(owner.versions.scopeKey!==scope.key)throw Error('unified-backup-cross-scope');
    return owner;
  }
  async function exportBackup(value,options={}) {
    const scope=scopeOf(value),owner=await context(scope,options);
    // Free revision is monotonic. Equal before/after snapshots prove the Pro
    // read fell within one stable Free snapshot, without an unbounded retry.
    for(let attempt=0;attempt<2;attempt++){
      const free=await workspaceRepository.exportBackup(scope,options),overlay=await owner.store.read(owner.grant,options.signal),after=await workspaceRepository.exportBackup(scope,options);check(options);
      if(free.checksum!==after.checksum)continue;
      const payload={format:'vaiwl-unified-assets',version:1,minimumReader:UNIFIED_MINIMUM_READER,scopeKey:scope.key,
        free,pro:exportOverlayBackup(overlay.state,{legacyAssetsDigest:free.checksum})};
      const result={...payload,checksum:digest(payload)};size(result);return result;
    }
    throw Error('unified-backup-concurrent-change');
  }
  async function previewRestore(value,input,options={}) {
    const scope=scopeOf(value);check(options);
    if(input?.format==='vaiwl-assets')return workspaceRepository.previewRestore(scope,input,options);
    const bundle=parseCompositeBackup(input,scope),owner=await context(scope,options),raw=await owner.store.read(owner.grant,options.signal);
    const versions={...clone(owner.versions),overlayRevision:raw.state.revision};
    const pro=previewOverlayMerge(raw.state,bundle.pro);
    if(pro.conflicts.length){const error=Error('pro-restore-explicit-conflict-resolution-required');error.conflicts=pro.conflicts;throw error;}
    const free=await workspaceRepository.previewRestore(scope,bundle.free,options);check(options);
    return {summary:combineSummary(free.summary,pro.summary),expectedRevision:free.expectedRevision,
      planHash:planHashFor(free,pro,versions,bundle),evidenceImported:false};
  }
  async function restoreBackup(value,request,options={}) {
    const scope=scopeOf(value);check(options);
    if(request.bundle?.format==='vaiwl-assets')return workspaceRepository.restoreBackup(scope,request,options);
    const bundle=parseCompositeBackup(request.bundle,scope),owner=await context(scope,options),raw=await owner.store.read(owner.grant,options.signal);
    const versions={...clone(owner.versions),overlayRevision:raw.state.revision};
    const pro=previewOverlayMerge(raw.state,bundle.pro);
    const free=await workspaceRepository.previewRestore(scope,bundle.free,options);check(options);
    const stale=pro.conflicts.length>0||free.expectedRevision!==request.expectedRevision||planHashFor(free,pro,versions,bundle)!==request.planHash;
    const operationId=request.operationId;
    const result=await workspaceRepository.mutate(scope,{operationId,expectedRevision:request.expectedRevision,
      fingerprint:{backup:bundle.free,proBackup:bundle.pro,planHash:request.planHash,expectedRevision:request.expectedRevision},
      type:'RESTORE_BACKUP',actor:'human',...options,
      enlist(tx,_scope,current,ready,fail){
        if(!current())return;
        if(stale){fail(pro.conflicts.length?'pro-restore-explicit-conflict-resolution-required':'restore-preview-changed');return;}
        owner.store.enlist(tx,owner.grant,{operationId,expected:versions,fingerprint:{unifiedBackup:bundle.checksum,planHash:request.planHash},execute(state){
          const fresh=previewOverlayMerge(state,bundle.pro);
          if(fresh.conflicts.length||fresh.planHash!==pro.planHash)throw Error('restore-preview-changed');
          return {state:fresh.state,transaction:transactionFor(fresh,operationId,versions)};
        }},options.signal,outcome=>{if(outcome.replayed){fail('unified-restore-orphan-receipt');return;}if(current())ready();},fail);
      },
      apply(current){const plan=previewBackup(current,bundle.free,scope);if(plan.planHash!==free.planHash)throw Error('restore-preview-changed');return plan.next;}
    });
    if(result?.ok&&!result.replayed){try{await onRestored?.(scope.key);}catch{}}
    return result;
  }
  async function previewLegacy(value,options={}) {
    const scope=scopeOf(value),owner=await context(scope,options),{state:legacy}=await workspaceRepository.read(scope,options),raw=await owner.store.read(owner.grant,options.signal);check(options);
    const plan=planLegacyMigration(legacy),backup=exportOverlayBackup(plan.state),merge=previewOverlayMerge(raw.state,backup);
    const empty=Object.values(KIND_TABLES).every(table=>Object.keys(raw.state[table]).length===0);
    const versions={...clone(owner.versions),overlayRevision:raw.state.revision};
    return {legacy,plan,merge,versions,owner,empty,planHash:digest({legacy:plan.report.sourceDigest,overlay:merge.planHash,versions})};
  }
  async function previewLegacyMigration(value,options={}) {
    const p=await previewLegacy(value,options);if(!p.empty)throw Error('legacy-migration-requires-empty-overlay');if(p.merge.conflicts.length)throw Error('legacy-migration-conflicts');return {planHash:p.planHash,expectedRevision:p.legacy.revision,summary:p.merge.summary,
      legacyCounts:{topics:p.plan.report.retainedTopicIds.length,placements:p.plan.report.retainedPlacementIds.length,titles:Object.keys(p.plan.state.titles).length,ambiguous:p.plan.report.ambiguousRefs.length},
      ambiguousRefs:p.plan.report.ambiguousRefs,retainedTopicIds:p.plan.report.retainedTopicIds,retainedPlacementIds:p.plan.report.retainedPlacementIds,sharedAssetsAction:'unchanged'};
  }
  async function migrateLegacy(value,{operationId,planHash,expectedRevision,requestFingerprint},options={}) {
    // Optional worker-local request identity supports receipt reconciliation
    // after a private preview is consumed. It is only hashed, never authority.
    let receiptFingerprint;
    if(requestFingerprint!==undefined){json(requestFingerprint);if(new TextEncoder().encode(stable(requestFingerprint)).length>65536)throw Error('migration-fingerprint-too-large');receiptFingerprint=clone(requestFingerprint);}
    const scope=scopeOf(value),p=await previewLegacy(scope,options);
    const stale=!p.empty||p.merge.conflicts.length>0||p.planHash!==planHash||p.legacy.revision!==expectedRevision;
    // A no-op shared reducer participates solely as a CAS fence. It advances
    // its revision and logs an empty human patch, leaving every shared asset.
    const result=await workspaceRepository.mutate(scope,{operationId,expectedRevision,fingerprint:{migrationPlan:planHash,backup:{payload:{refs:p.legacy.refs}},...(receiptFingerprint===undefined?{}:{requestFingerprint:receiptFingerprint})},type:'PRO_LEGACY_MIGRATION',actor:'human',...options,
      enlist(tx,_scope,current,ready,fail){if(!current())return;if(stale){fail('stale-migration-plan');return;}p.owner.store.enlist(tx,p.owner.grant,{operationId,expected:p.versions,fingerprint:receiptFingerprint===undefined?{migrationPlan:planHash}:receiptFingerprint,execute(state){
        const fresh=previewOverlayMerge(state,exportOverlayBackup(p.plan.state));if(fresh.conflicts.length||fresh.planHash!==p.merge.planHash)throw Error('stale-migration-plan');
        return {state:fresh.state,transaction:transactionFor(fresh,operationId,p.versions,'explicit-legacy-migration')};
      }},options.signal,result=>{if(result.replayed){fail('migration-orphan-receipt');return;}if(current())ready();},fail);},
      apply(current){if(digest(current)!==p.plan.report.sourceDigest)throw Error('stale-migration-plan');return {...current,revision:current.revision+1};}
    });
    if(result?.ok&&!result.replayed){try{await onRestored?.(scope.key);}catch{}}
    return result;
  }
  return Object.freeze({exportBackup,previewRestore,restoreBackup,previewLegacyMigration,migrateLegacy,registry:PRO_STORAGE_REGISTRY});
}
