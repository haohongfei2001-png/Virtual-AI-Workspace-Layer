import {allNativeKeys, nativeLifecycleSemantic, hasNativeLifecycle, lifecycleKind, applyNativeLifecycle, validateNativeLifecycleChange, nativeLifecycleMarker, verifyNativeLifecycleMarker} from './native-lifecycle.mjs';
import {continuationAckSourceFailure,continuationEvidenceSources} from './continuation-evidence-reader.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {freeEvidenceKey} from './free-evidence-partitions.mjs';
import {createNativeContinuation,validateNativeContinuation,continuationDirectoryKey,emptyContinuationDirectory,validateContinuationDirectory,updateContinuationDirectory,finishNativeContinuation,deferNativeContinuation,transitionContinuationDirectory,continuationEvidenceFingerprint} from './native-observation-continuation.mjs';
import {migrateNativeVersionIndex,prepareNativeVersionIndex} from './native-index-migration.mjs';
import {saveIndexedNativePieces} from './native-index-writer.mjs';
import {isNativeVersionIndexed,validateNativeIndexRoot,createNativeIndexRootRecordReader} from './native-version-index.mjs';
import {createNativeIndexReader} from './native-index-reader.mjs';
import {VerifiedRecordCache} from './verified-record-cache.mjs';
import { isNativePartitioned, validateNativeManifest, loadNativePieces, saveNativePieces, nativeHeader, nativeRecoveryKey, nativeCheckpointKey, nativeRecord } from './native-partitions.mjs';
import { emptyNativeFacts, validateNativeFacts, applyNativeObservations, invalidateNativeSource, hostNativeChannel } from './native-facts.mjs';
import { freeProjection } from './free-projection.mjs';
import { id } from './state.mjs';
import { digest } from './hash.mjs';

const record = (key, payload) => ({key, payload, checksum: digest(payload)});
function unpack(row) {
  if (!row || row.checksum !== digest(row.payload)) throw Error('corrupt-native-record');
  return row.payload;
}
const continuationMarkerKey=key=>JSON.stringify([key,'native-continuations','marker']);
function continuationDirectory(directoryRow,markerRow,scope,nativeMarkerRow){
  const witness=nativeMarkerRow?unpack(nativeMarkerRow).continuations:null;
  if(!directoryRow&&!markerRow){if(witness)throw Error('missing-native-continuation-directory');return null;}
  if(!directoryRow||!markerRow)throw Error('missing-native-continuation-directory');
  const directory=validateContinuationDirectory(unpack(directoryRow),scope),marker=unpack(markerRow);
  if(Object.keys(marker).sort().join(',')!=='directoryDigest,revision'||marker.revision!==directory.revision||marker.directoryDigest!==digest(directory))throw Error('native-continuation-directory-conflict');
  if(!witness||Object.keys(witness).sort().join(',')!=='directoryDigest,revision'||witness.revision!==directory.revision||witness.directoryDigest!==digest(directory))throw Error('native-continuation-root-witness-conflict');
  return directory;
}
function fence({guard = () => true, signal} = {}) {
  if (signal?.aborted || guard() !== true) throw Error('stale-binding');
}

/** Full root-envelope validation; marker and storage-key checks belong to the caller. */
export function validateNativeRootRecord(record,scope){
 const payload=unpack(record);
 if(isNativeVersionIndexed(payload))validateNativeIndexRoot(payload,scope);
 else if(isNativePartitioned(payload))validateNativeManifest(payload,scope);
 else validateNativeFacts(payload,scope);
 return payload;
}

export class NativeRepository {
  #rootCache=new VerifiedRecordCache({maxEntries:3});
  #readIndexRoot=createNativeIndexRootRecordReader();
  #validateRoot(_payload,record,scope){return validateNativeRootRecord(record,scope);}
  #rootContext(row,scope){
    if(typeof row?.checksum!=='string'||!/^[0-9a-f]{64}$/.test(row.checksum))throw Error('corrupt-native-record');
    return JSON.stringify([scope.key,row.checksum]);
  }
  verifiedRoot(row,scope){
    if(isNativeVersionIndexed(row?.payload))return this.#readIndexRoot(row,scope);
    return this.#rootCache.read(row,this.#rootContext(row,scope),(payload,record)=>this.#validateRoot(payload,record,scope));
  }
  #rootWithCounts(row,scope){return this.#rootCache.readWithCounts(row,this.#rootContext(row,scope),(payload,record)=>this.#validateRoot(payload,record,scope),['projects','refs']);}
  #verifyCheckpoint(row,scope){
    if(row?.key!==nativeCheckpointKey(scope.key))throw Error('invalid-native-checkpoint-key');
    // A checkpoint is an alias of a formerly validated root, not a new proof.
    // Rekey only this envelope; cache hits still compare every newly read byte.
    return this.verifiedRoot({...row,key:scope.key},scope);
  }

  constructor({baseRepository, workspaceRepository = null, observationGate = null, hostObservationGate = null, lifecycleGate = null, prepareInitialHostIndex = false, clock = () => new Date().toISOString()}) {
    if (!baseRepository?.open || !baseRepository?.scopeOrThrow) throw Error('b1-repository-required');
    this.base = baseRepository;
    if(workspaceRepository&&workspaceRepository.base!==baseRepository)throw Error('shared-native-database-required');
    this.shared=workspaceRepository;
    this.observationGate = observationGate;
    this.hostObservationGate = hostObservationGate;
    this.lifecycleGate = lifecycleGate;
    this.prepareInitialHostIndex = prepareInitialHostIndex === true;
    this.clock = clock;
  }

  async read(scope, options = {}) {
    const normalized = this.base.scopeOrThrow(scope), db = await this.base.open();
    fence(options);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['native_states', 'native_operations'], 'readonly');
      const request = transaction.objectStore('native_states').get(normalized.key);
      let facts, error;
      request.onsuccess = () => {
        try {
          const payload = request.result ? this.verifiedRoot(request.result, normalized) : null;
          if(isNativeVersionIndexed(payload)){
            facts=nativeHeader(payload,normalized);const fail=failure=>{error=failure;transaction.abort();};
            createNativeIndexReader(transaction.objectStore('native_states'),payload,normalized,fail).all(manifest=>loadNativePieces(transaction.objectStore('native_states'),manifest,normalized,allNativeKeys(manifest),value=>{facts=value;},fail));
          } else if (isNativePartitioned(payload)) {
            const manifest = payload;
            loadNativePieces(transaction.objectStore('native_states'), manifest, normalized,
              allNativeKeys(manifest), value => { facts = value; },
              failure => { error = failure; transaction.abort(); });
            facts = nativeHeader(manifest, normalized);
          } else facts = payload ?? emptyNativeFacts(normalized);
          const marker = transaction.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try {
              if (!request.result && marker.result) throw Error('missing-native-root');
              if (facts.revision && !marker.result) throw Error('missing-native-marker');
              verifyNativeLifecycleMarker(marker.result ? unpack(marker.result) : null, payload, request.result?.checksum);
              if (marker.result && unpack(marker.result).revision !== facts.revision) throw Error('native-root-revision-conflict');
            } catch (failure) { error = failure; transaction.abort(); }
          };
        } catch (failure) { error = failure; transaction.abort(); }
      };
      transaction.oncomplete = () => {
        try { fence(options); resolve(facts); } catch (failure) { reject(failure); }
      };
      transaction.onabort = () => reject(error ?? transaction.error ?? Error('native-read-aborted'));
    });
  }

  async header(scope, options = {}) {
    const normalized = this.base.scopeOrThrow(scope), db = await this.base.open();
    fence(options);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['native_states', 'native_operations']); let revision = 0, manifest = null, storageFormat = null, error;
      const request = tx.objectStore('native_states').get(normalized.key);
      request.onsuccess = () => {
        try {
          if (request.result) {
            const value = this.verifiedRoot(request.result, normalized);storageFormat=value.format??null;
            if(isNativeVersionIndexed(value))createNativeIndexReader(tx.objectStore('native_states'),value,normalized,failure=>{error=failure;tx.abort();}).all(value=>{manifest=value;});
            else if (isNativePartitioned(value)) manifest = value;
            revision = (manifest ?? value).revision;
          }
          const marker = tx.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try { verifyNativeLifecycleMarker(marker.result?unpack(marker.result):null,request.result?.payload,request.result?.checksum); if (marker.result ? unpack(marker.result).revision !== revision : revision !== 0) throw Error('native-root-revision-conflict'); }
            catch (failure) {error = failure;tx.abort();}
          };
        } catch (failure) {error = failure;tx.abort();}
      };
      tx.oncomplete = () => {try {fence(options);resolve({revision,manifest,storageFormat});} catch (failure) {reject(failure);}};
      tx.onabort = () => reject(error ?? tx.error ?? Error('native-read-aborted'));
    });
  }

  // Version is a root/marker fence, not an inventory or piece-integrity claim.
  // PAGE/HEADER continue to verify every bucket/piece required by their result.
  async version(scope, options = {}) {
    const normalized=this.base.scopeOrThrow(scope),db=await this.base.open();fence(options);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['native_states','native_operations']),root=tx.objectStore('native_states').get(normalized.key),marker=tx.objectStore('native_operations').get(normalized.key);let revision=0,error;
      marker.onsuccess=()=>{try{fence(options);const value=root.result?this.verifiedRoot(root.result,normalized):null;revision=value?.revision??0;verifyNativeLifecycleMarker(marker.result?unpack(marker.result):null,value,root.result?.checksum);if(!value&&marker.result)throw Error('missing-native-root');if(marker.result?unpack(marker.result).revision!==revision:revision!==0)throw Error('native-root-revision-conflict');}catch(failure){error=failure;tx.abort();}};
      tx.oncomplete=()=>{try{fence(options);resolve(revision);}catch(failure){reject(failure);}};
      tx.onabort=()=>reject(error??tx.error??Error('native-read-aborted'));
    });
  }

  async page(scope, {revision = null, offset = 0, limit = 500, ids = null} = {}, options = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw Error('invalid-native-page');
    if (ids !== null) {
      if (!ids || Object.keys(ids).some(key => !['projects','refs'].includes(key)) || !Array.isArray(ids.projects) || !Array.isArray(ids.refs) || ids.projects.length + ids.refs.length > 5000) throw Error('invalid-native-page');
      [...ids.projects,...ids.refs].forEach(id);
    }
    const normalized = this.base.scopeOrThrow(scope), db = await this.base.open();
    fence(options);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['native_states', 'native_operations']), store = tx.objectStore('native_states');
      let result, error;
      const fail = failure => { error = failure; try { tx.abort(); } catch {} };
      const request = store.get(normalized.key);
      request.onsuccess = () => {
        try {
          const counted=ids&&request.result&&!isNativeVersionIndexed(request.result.payload)?this.#rootWithCounts(request.result,normalized):null;
          const payload = counted?.payload ?? (request.result ? this.verifiedRoot(request.result, normalized) : emptyNativeFacts(normalized));
          if(isNativeVersionIndexed(payload)){
            if(revision!==null&&revision!==payload.revision)throw Error('snapshot-revision-changed');
            const total=['projects','refs'].reduce((sum,kind)=>sum+Object.values(payload[kind]).reduce((n,p)=>n+p.count,0),0);
            const reader=createNativeIndexReader(store,payload,normalized,fail),marker=tx.objectStore('native_operations').get(normalized.key);
            marker.onsuccess=()=>{try{verifyNativeLifecycleMarker(unpack(marker.result),payload,request.result?.checksum);if(unpack(marker.result).revision!==payload.revision)throw Error('native-root-revision-conflict');}catch(failure){fail(failure);}};
            const load=(manifest,selectedProjects,selectedRefs,lookup=null)=>loadNativePieces(store,manifest,normalized,{projects:selectedProjects,refs:selectedRefs},facts=>{
              result={revision:payload.revision,offset,total,nextOffset:Math.min(total,offset+limit),facts,selectedProjects,selectedRefs};
              if(JSON.stringify(result).length>16*1024*1024)fail(Error('native-page-too-large'));
            },fail,lookup);
            if(ids)load(reader.manifest,ids.projects,ids.refs,reader.lookup);
            else reader.select(offset,limit,selected=>load(reader.manifest,selected.projects,selected.refs,reader.lookup));
            return;
          }
          if (!isNativePartitioned(payload)) {
            const all = payload;
            if (revision !== null && revision !== all.revision) throw Error('snapshot-revision-changed');
            const projects = ids?null:Object.keys(all.projects), refs = ids?null:Object.keys(all.refs), total = counted?counted.counts.projects+counted.counts.refs:(projects?.length??0)+(refs?.length??0);
            const selectedProjects = ids?.projects ?? projects.slice(offset, offset + limit);
            const selectedRefs = ids?.refs ?? refs.slice(Math.max(0, offset-projects.length), Math.max(0, offset+limit-projects.length));
            const facts = {...emptyNativeFacts(normalized),format:all.format,...(hasNativeLifecycle(all)?{projectLifecycle:{},refLifecycle:{}}:{}),revision:all.revision,sources:all.sources};
            for (const key of selectedRefs) if (all.refs[key]) {facts.refs[key]=all.refs[key];if(all.membership[key])facts.membership[key]=all.membership[key];}
            if(hasNativeLifecycle(all))for(const key of selectedRefs)if(all.refLifecycle[key])facts.refLifecycle[key]=all.refLifecycle[key];
            const dependencies = Object.values(facts.membership).filter(row=>row.state==='PROJECT').map(row=>row.projectId);
            for (const key of [...selectedProjects,...dependencies]) {if (all.projects[key]) facts.projects[key]=all.projects[key];if(hasNativeLifecycle(all)&&all.projectLifecycle[key])facts.projectLifecycle[key]=all.projectLifecycle[key];}
            const marker = tx.objectStore('native_operations').get(normalized.key);
            marker.onsuccess = () => {try {verifyNativeLifecycleMarker(marker.result?unpack(marker.result):null,all,request.result?.checksum);if(marker.result ? unpack(marker.result).revision!==all.revision||!request.result : all.revision!==0)throw Error('native-root-revision-conflict');}catch(failure){fail(failure);}};
            result={revision:all.revision,offset,total,nextOffset:Math.min(total,offset+limit),facts,selectedProjects,selectedRefs};
            return;
          }
          const manifest = payload;
          if (revision !== null && revision !== manifest.revision) throw Error('snapshot-revision-changed');
          const projects = ids?null:Object.keys(manifest.projects), refs = ids?null:Object.keys(manifest.refs), total = counted?counted.counts.projects+counted.counts.refs:projects.length+refs.length;
          const projectSlice = ids?.projects ?? projects.slice(offset, offset + limit);
          const refSlice = ids?.refs ?? refs.slice(Math.max(0, offset - projects.length), Math.max(0, offset + limit - projects.length));
          const marker = tx.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try { verifyNativeLifecycleMarker(unpack(marker.result),manifest,request.result?.checksum); if (unpack(marker.result).revision !== manifest.revision) throw Error('native-root-revision-conflict'); }
            catch (failure) { fail(failure); }
          };
          loadNativePieces(store, manifest, normalized, {projects: projectSlice, refs: refSlice}, facts => {
            result = {revision: manifest.revision, offset, total, nextOffset: Math.min(total, offset + limit), facts,
              selectedProjects: projectSlice, selectedRefs: refSlice};
            if (JSON.stringify(result).length > 16 * 1024 * 1024) fail(Error('native-page-too-large'));
          }, fail);
        } catch (failure) { fail(failure); }
      };
      tx.oncomplete = () => { try { fence(options); resolve(result); } catch (failure) { reject(failure); } };
      tx.onabort = () => reject(error ?? tx.error ?? Error('native-read-aborted'));
    });
  }

  /** Repair a damaged root only from the current atomically saved recovery root.
   * Sources are revoked; this never restores a grant or overwrites manual B23 assets.
   */
  async recover(scope, {operationId, damagedHash}, options = {}) {
    const normalized = this.base.scopeOrThrow(scope), db = await this.base.open();
    id(operationId);
    if (typeof damagedHash !== 'string' || damagedHash.length !== 64) throw Error('invalid-damaged-hash');
    fence(options);
    return new Promise(resolve => {
      const tx = db.transaction(['native_states', 'native_operations'], 'readwrite'), store = tx.objectStore('native_states'), ops = tx.objectStore('native_operations');
      let result;
      const abort = reason => { result = {ok: false, reason}; try { tx.abort(); } catch {} };
      const revoked = () => abort('stale-binding');
      options.signal?.addEventListener('abort', revoked, {once: true});
      const root = store.get(normalized.key), shadow = store.get(nativeRecoveryKey(normalized.key)), marker = ops.get(normalized.key);
      const key = JSON.stringify([normalized.key, operationId]), receipt = ops.get(key);
      receipt.onsuccess = () => {
        try {
          fence(options);
          if (receipt.result) {
            const prior = unpack(receipt.result);
            result = prior.kind === 'RECOVER_NATIVE' && prior.fingerprint === damagedHash ?
              {ok: true, replayed: true, revision: prior.revision, operationId} : {ok: false, reason: 'operation-replay-conflict'};
            return;
          }
          if (digest(root.result ?? null) !== damagedHash) throw Error('recovery-conflict');
          let intact = false;
          try {const value=unpack(root.result);if(isNativeVersionIndexed(value))validateNativeIndexRoot(value,normalized);else validateNativeManifest(value,normalized);intact=true;} catch {}
          if (intact) throw Error('intact-state-not-replaced');
          const shadowPayload=unpack(shadow.result),indexed=isNativeVersionIndexed(shadowPayload);
          verifyNativeLifecycleMarker(unpack(marker.result),shadowPayload,shadow.result?.checksum);
          const recoveryRoot=indexed?validateNativeIndexRoot(shadowPayload,normalized):validateNativeManifest(shadowPayload,normalized);
          // A damaged indexed root must not authorize a legacy shadow merely
          // because its revision matches. This narrows recovery, never grants it.
          if(isNativeVersionIndexed(root.result?.payload)&&!indexed)throw Error('native-index-recovery-format-conflict');
          const verifyAndRecover=manifest=>{
          if (unpack(marker.result).revision !== manifest.revision) throw Error('native-root-revision-conflict');
          // Verify every referenced piece before publishing a recovered manifest.
          loadNativePieces(store, manifest, normalized, allNativeKeys(manifest), () => {
            try {
              fence(options);
              const next = structuredClone(recoveryRoot); next.revision++;
              for (const source of Object.values(next.sources)) source.revoked = true;
              next.changes = [];
              if(indexed)validateNativeIndexRoot(next,normalized);else validateNativeManifest(next, normalized);
              store.put(nativeRecord(normalized.key, next)); store.put(nativeRecord(nativeRecoveryKey(normalized.key), next));
              ops.put(record(normalized.key, {...unpack(marker.result),revision: next.revision,...nativeLifecycleMarker(next,digest(next))}));
              const receiptWrite = ops.put(record(key, {kind: 'RECOVER_NATIVE', fingerprint: damagedHash, revision: next.revision, operationId}));
              receiptWrite.onsuccess = () => { try { fence(options); } catch (failure) { abort(failure.message); } };
              fence(options);
              result = {ok: true, revision: next.revision, operationId, evidenceInvalidated: true};
            } catch (failure) { abort(failure.message); }
          }, failure => abort(failure.message));
          };
          if(indexed)createNativeIndexReader(store,recoveryRoot,normalized,failure=>abort(failure.message)).all(verifyAndRecover);else verifyAndRecover(recoveryRoot);
        } catch (failure) { abort(failure.message); }
      };
      tx.oncomplete = () => { options.signal?.removeEventListener('abort', revoked); try { fence(options); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); } };
      tx.onabort = () => { options.signal?.removeEventListener('abort', revoked); resolve(result?.ok === false ? result : {ok: false, reason: tx.error?.name ?? 'native-recovery-aborted'}); };
    });
  }

  async prepareVersionIndex(scope,request,options={}){return prepareNativeVersionIndex(this,scope,request,options);}
  async migrateVersionIndex(scope,request,options={}){return migrateNativeVersionIndex(this,scope,request,options);}

  async snapshot(scope, options = {}) {
    const facts = await this.read(scope, options);
    fence(options);
    return freeProjection(facts, {scope, now: this.clock(), knownState: options.knownState});
  }

  async apply(scope, request, options = {}) {
    const normalized = this.base.scopeOrThrow(scope);
    const host = this.hostObservationGate?.(normalized,request);
    const authority = host ?? this.observationGate?.(normalized);
    if(Object.hasOwn(request,'continuation'))throw Error('untrusted-native-continuation');
    request=structuredClone(request);
    if (host ? !hostNativeChannel(host.channel)||typeof host.guard!=='function'||host.guard()!==true : authority?.channel !== 'synthetic') throw Error('untrusted-native-source');
    if(host?.channel==='host-metadata'&&host.continuation)throw Error('untrusted-native-continuation');
    const witness = {channel: authority.channel, sourceId: authority.sourceId, generation: authority.generation,...(host?{admission:structuredClone(host.admission)}:{})};
    if(host){const original=options;options={...original,guard:()=>host.guard()===true&&(original.guard?.()??true)===true};}
    id(witness.sourceId);
    id(witness.generation);
    let continuation=null;
    if(host?.continuation){
      const admission=structuredClone(host.continuationAdmission);
      const ack=host.continuationAuthority;
      if(ack){
        if(typeof ack.guard!=='function'||ack.guard()!==true||ack.scopeKey!==normalized.key||ack.channel!=='host-evidence'||ack.profileId!==admission?.profileId||ack.profileVersion!==admission?.profileVersion)throw Error('native-continuation-ack-authority');
        const previous=options.guard;options={...options,guard:()=>previous()===true&&ack.guard()===true};
      }else if(!admission||admission.profileId!==witness.admission.profileId||admission.profileVersion!==witness.admission.profileVersion)throw Error('native-continuation-profile-mismatch');
      const nativeWitness=ack?{sourceId:witness.sourceId,generation:witness.generation,profileId:witness.admission.profileId,profileVersion:witness.admission.profileVersion,sourceRevision:request.batch.sourceRevision,semanticFingerprint:witness.admission.semanticFingerprint}:null;
      continuation=createNativeContinuation({scope:normalized,operationId:request.operationId,nativeRevision:request.expectedRevision+1,authority:{...witness,...(ack?{sourceId:ack.sourceId,generation:ack.generation}:{}),admission},proposal:structuredClone(host.continuation),now:this.clock(),nativeWitness});
    }
    const apply=()=>this.mutate(normalized, request, {kind: 'APPLY_NATIVE_OBSERVATIONS', ...witness, batch: request.batch,...(continuation?{continuation}:{})},
      current => applyNativeObservations(current, request.batch, {scope: normalized, ...witness, now: this.clock()}), options);
    const finish=async result=>{
      // The first observation is already durable. Reuse checked structural
      // migration while its original guard is live, before a finite stream grows.
      // Failure cannot undo that commit or change its receipt/revision. The owner
      // still performs its ordinary post-apply guard before acknowledging it.
      if(this.prepareInitialHostIndex===true&&host&&request.expectedRevision===0&&result.ok===true&&result.replayed===false&&result.revision===1){
        try{fence(options);await this.migrateVersionIndex(normalized,{operationId:'host_initial_index_'+digest([normalized.key,request.operationId]),expectedRevision:1},options);}catch{/* Keep the actual committed observation result. */}
      }
      return result;
    };
    const result=await apply();
    // The write transaction reads and validates the shared root. Host legacy
    // storage or a capacity boundary can require migration before one retry.
    if(this.shared&&result.reason==='native-shared-migration-required'){
      try{
      const migrated=await this.shared.migratePartitioned(normalized,options);
      if(!migrated.ok)throw Error(migrated.reason);
      fence(options);
      if(host){
        const indexed=await this.shared.migrateSharedDirectory(normalized,{operationId:'native_shared_directory_'+migrated.revision,expectedRevision:migrated.revision},options);
        if(!indexed.ok)throw Error(indexed.reason);
        fence(options);
      }
      return finish(await apply());
      }catch(error){return {ok:false,reason:error.message??'shared-migration-failed'};}
    }
    return finish(result);
  }

  /** Owner-only pending observations; reading these records grants no replay authority. */
  async listContinuations(scope,options={}){
    const normalized=this.base.scopeOrThrow(scope),db=await this.base.open();fence(options);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('native_operations'),store=tx.objectStore('native_operations'),request=store.get(continuationDirectoryKey(normalized.key)),marker=store.get(continuationMarkerKey(normalized.key)),nativeMarker=store.get(normalized.key);let rows=[],error;
      const fail=value=>{error=value;try{tx.abort();}catch{}};
      nativeMarker.onsuccess=()=>{try{
        fence(options);const directory=continuationDirectory(request.result,marker.result,normalized,nativeMarker.result);if(!directory)return;
        for(const [operationId,size]of Object.entries(directory.entries)){
          const receipt=store.get(JSON.stringify([normalized.key,operationId]));
          receipt.onsuccess=()=>{try{fence(options);const prior=unpack(receipt.result),row=validateNativeContinuation(prior.continuation,normalized);if(prior.operationId!==operationId||row.operationId!==operationId||prior.revision!==row.nativeRevision||new TextEncoder().encode(JSON.stringify(row)).length!==size)throw Error('native-continuation-directory-conflict');rows.push(row);}catch(failure){fail(failure);}};
        }
      }catch(failure){fail(failure);}};
      tx.oncomplete=()=>{try{fence(options);resolve(rows);}catch(failure){reject(failure);}};
      tx.onabort=()=>reject(error??tx.error??Error('native-continuation-read-aborted'));
    });
  }

  /** Terminal bookkeeping requires fresh owner authorization and a real evidence receipt. */
  markContinuationComplete(scope,input,options={}){return this.#markContinuation(scope,input,options,'complete');}
  markContinuationNeedsRevalidation(scope,input,options={}){return this.#markContinuation(scope,input,options,'needs-revalidation');}
  async #markContinuation(scope,input,options,mode){
    options={...options};
    if(typeof options.guard!=='function')throw Error('continuation-guard-required');
    if(mode==='needs-revalidation'&&options.currentProfile!==undefined&&typeof options.currentProfile!=='function')throw Error('invalid-continuation-current-profile');
    const normalized=this.base.scopeOrThrow(scope),request=structuredClone(input);
    if(!request||Object.keys(request).sort().join(',')!==(mode==='complete'?'evidenceRevision,expectedPayloadDigest,operationId':'expectedPayloadDigest,operationId')||(mode==='complete'&&(!Number.isSafeInteger(request.evidenceRevision)||request.evidenceRevision<1))||typeof request.expectedPayloadDigest!=='string'||!/^[0-9a-f]{64}$/.test(request.expectedPayloadDigest))throw Error('invalid-continuation-completion');
    id(request.operationId);fence(options);const db=await this.base.open();fence(options);
    return new Promise(resolve=>{
      const tx=db.transaction(['native_states','native_operations'],'readwrite'),states=tx.objectStore('native_states'),ops=tx.objectStore('native_operations');let result;
      const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}};
      const check=()=>fence(options),revoked=()=>abort('stale-binding');options.signal?.addEventListener('abort',revoked,{once:true});
      const ackRoot=states.get(freeEvidenceKey(normalized.key)),ackMarker=ops.get(freeEvidenceKey(normalized.key));
      const root=states.get(normalized.key),marker=ops.get(normalized.key),directoryRow=ops.get(continuationDirectoryKey(normalized.key)),queueMarker=ops.get(continuationMarkerKey(normalized.key)),operationKey=JSON.stringify([normalized.key,request.operationId]),receipt=ops.get(operationKey);
      receipt.onsuccess=()=>{try{
        check();const facts=this.verifiedRoot(root.result,normalized),nativeMarker=unpack(marker.result);
        verifyNativeLifecycleMarker(nativeMarker,facts,root.result?.checksum);if(nativeMarker.revision!==facts.revision)throw Error('native-root-revision-conflict');
        const directory=continuationDirectory(directoryRow.result,queueMarker.result,normalized,marker.result);
        if(!directory)throw Error('missing-native-continuation-directory');
        const prior=unpack(receipt.result),pending=validateNativeContinuation(prior.continuation,normalized);
        if(prior.operationId!==request.operationId||pending.operationId!==request.operationId||prior.revision!==pending.nativeRevision||pending.nativeRevision>facts.revision||pending.payloadDigest!==request.expectedPayloadDigest)throw Error('native-continuation-completion-conflict');
        const persist=(next)=>{const nextDirectory=transitionContinuationDirectory(directory,pending,next,normalized),witness={revision:nextDirectory.revision,directoryDigest:digest(nextDirectory)};
          check();ops.put(record(operationKey,{...prior,continuation:next}));ops.put(record(continuationDirectoryKey(normalized.key),nextDirectory));ops.put(record(continuationMarkerKey(normalized.key),witness));ops.put(record(normalized.key,{...nativeMarker,continuations:witness}));check();};
        const ackFailure=pending.nativeWitness?continuationAckSourceFailure(pending,continuationEvidenceSources(ackRoot.result,ackMarker.result,normalized)):null;
        const n=pending.nativeWitness,nativeSource=n?facts.sources[n.sourceId]:null;
        const nativeFailure=!n?null:!nativeSource?'missing-source':nativeSource.revoked?'source-revoked':nativeSource.channel!=='host-dom'||nativeSource.generation!==n.generation||nativeSource.sourceRevision!==n.sourceRevision||nativeSource.admission?.semanticFingerprint!==n.semanticFingerprint?'source-changed':nativeSource.admission?.profileId!==n.profileId||nativeSource.admission?.profileVersion!==n.profileVersion?'profile-changed':null;
        if(mode==='needs-revalidation'){
          if(pending.state!=='pending-evidence')throw Error('native-continuation-completion-conflict');
          const a=pending.nativeWitness??pending.admission,source=facts.sources[a.sourceId];
          // Live owner authority only; never accept a profile label from stored payload/request.
          // The guard keeps this profile current through every queued write and commit fence.
          const profile=options.currentProfile?.();check();
          if(options.currentProfile&&(!profile||!tokenOK(profile.id)||!Number.isSafeInteger(profile.revision)||profile.revision<1))throw Error('invalid-continuation-current-profile');
          const profileChanged=profile&&[a,pending.admission].some(w=>profile.id===w.profileId&&profile.revision!==w.profileVersion);
          const reason=!source?'missing-source':source.revoked?'source-revoked':source.generation!==a.generation||source.channel!=='host-dom'||pending.nativeWitness&&(source.sourceRevision!==a.sourceRevision||source.admission?.semanticFingerprint!==a.semanticFingerprint)?'source-changed':source.admission?.profileId!==a.profileId||source.admission?.profileVersion!==a.profileVersion||profileChanged?'profile-changed':ackFailure;
          if(!reason)throw Error('native-continuation-source-still-valid');
          persist(deferNativeContinuation(pending,{reason}));result={ok:true,replayed:false,operationId:request.operationId,state:'needs-revalidation',reason};return;
        }
        const replayed=pending.state==='complete';
        if(replayed){if(pending.evidenceRevision!==request.evidenceRevision||Object.hasOwn(directory.entries,request.operationId))throw Error('native-continuation-completion-conflict');}
        else if(pending.state!=='pending-evidence')throw Error('native-continuation-completion-conflict');
        const evidenceOperationId=replayed?pending.evidenceOperationId:pending.evidence.operationId;
        const evidence=ops.get(JSON.stringify([freeEvidenceKey(normalized.key),evidenceOperationId]));
        evidence.onsuccess=()=>{try{
          check();const proof=unpack(evidence.result);
          if(proof.kind!=='OBSERVE_HOST_CONTINUATION'||proof.operationId!==evidenceOperationId||proof.fingerprint!==continuationEvidenceFingerprint(pending,normalized)||proof.revision!==request.evidenceRevision)throw Error('native-continuation-evidence-receipt-conflict');
          // An operation receipt is not sufficient evidence that its data still
          // exists. Preserve the only durable pending payload if the ACK root
          // was lost or rolled back after the evidence commit.
          if(pending.nativeWitness)continuationEvidenceSources(ackRoot.result,ackMarker.result,normalized,{minimumRevision:proof.revision,requiredSourceId:pending.admission.sourceId});
          if(replayed){result={ok:true,replayed:true,operationId:request.operationId,evidenceRevision:pending.evidenceRevision};return;}
          if(nativeFailure||ackFailure){const reason=nativeFailure??ackFailure;persist(deferNativeContinuation(pending,{reason}));result={ok:true,replayed:false,operationId:request.operationId,state:'needs-revalidation',reason};return;}
          persist(finishNativeContinuation(pending,{evidenceRevision:proof.revision}));
          result={ok:true,replayed:false,operationId:request.operationId,evidenceRevision:proof.revision};
        }catch(failure){abort(failure.message);}};
      }catch(failure){abort(failure.message);}};
      tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{check();resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
      tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'native-continuation-completion-aborted'});};tx.onerror=()=>{};
    });
  }

  async applyLifecycle(scope, request, options = {}) {
    const normalized = this.base.scopeOrThrow(scope), admission = this.lifecycleGate?.(normalized, request);
    if (admission?.purpose !== 'native-lifecycle' || typeof admission.guard !== 'function' || admission.guard() !== true) throw Error('untrusted-native-lifecycle');
    const captured = structuredClone(request), change = validateNativeLifecycleChange(captured.change);
    const original = options;
    options = {...original, guard: () => admission.guard() === true && (original.guard?.() ?? true) === true};
    return this.mutate(normalized, captured, {kind:'OBSERVE_NATIVE_LIFECYCLE',lifecycle:change},
      current => validateNativeFacts(applyNativeLifecycle(current,change),normalized), options);
  }

  async invalidate(scope, request, options = {}) {
    id(request.sourceId);
    return this.mutate(scope, request, {kind: 'INVALIDATE_NATIVE_SOURCE', sourceId: request.sourceId},
      current => invalidateNativeSource(current, request.sourceId, scope), options);
  }

  async mutate(scope, {operationId, expectedRevision}, command, reduce, options) {
    const normalized = this.base.scopeOrThrow(scope);
    id(operationId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Error('invalid-revision');
    command=structuredClone(command);
    const fingerprint = command.kind==='OBSERVE_NATIVE_LIFECYCLE'?nativeLifecycleSemantic(command.lifecycle):digest({command, expectedRevision}), db = await this.base.open();
    fence(options);
    return new Promise(resolve => {
      const transaction = db.transaction(['native_states', 'native_operations', ...(this.shared?['b23_states','b23_operations','b23_checkpoints','refs']:[])], 'readwrite');
      const states = transaction.objectStore('native_states'), operations = transaction.objectStore('native_operations');
      const operationKey = JSON.stringify([normalized.key, operationId]);
      let result;
      const abort = reason => { result = {ok: false, reason}; try { transaction.abort(); } catch {} };
      const check = () => { fence(options); };
      const revoked = () => abort('stale-binding');
      options.signal?.addEventListener('abort', revoked, {once: true});
      const request = states.get(normalized.key);
      request.onsuccess = () => {
        try {
          check();
          const payload = request.result ? this.verifiedRoot(request.result, normalized) : null;
          const indexReader=isNativeVersionIndexed(payload)?createNativeIndexReader(states,payload,normalized,failure=>abort(failure.message)):null;
          const manifest = indexReader?.manifest ?? (isNativePartitioned(payload) ? payload : null);
          const current = manifest ? nativeHeader(manifest, normalized) : payload ?? emptyNativeFacts(normalized);
          const marker = operations.get(normalized.key);
          marker.onsuccess = () => {
            try {
              check();
              if (!request.result && marker.result) throw Error('missing-native-root');
              verifyNativeLifecycleMarker(marker.result?unpack(marker.result):null,payload,request.result?.checksum);
              if (marker.result && unpack(marker.result).revision !== current.revision) throw Error('native-root-revision-conflict');
              if (current.revision && !marker.result) throw Error('missing-native-marker');
              const receipt = operations.get(operationKey);
              receipt.onsuccess = () => {
                try {
                  check();
                  if (receipt.result) {
                    const prior = unpack(receipt.result);
                    result = prior.fingerprint === fingerprint ? {ok: true, replayed: true, revision: prior.revision, operationId} :
                      {ok: false, reason: 'operation-replay-conflict'};
                    return;
                  }
                  if (current.revision !== expectedRevision) throw Error('revision-conflict');
                  const save = (partial, storage = null) => {
                    try {
                      check();
                      const next = reduce(partial);
                      check();
                      if(next === partial){result={ok:true,replayed:true,revision:partial.revision,operationId};return;}
                      const publishNow=(directory=null)=>{
                        try {check();const savedRoot=indexReader?saveIndexedNativePieces(states,normalized,next,storage,command,indexReader,row=>this.#verifyCheckpoint(row,normalized),check,failure=>abort(failure.message)):
                          saveNativePieces(states, normalized, partial, next, storage, command,row=>this.#verifyCheckpoint(row,normalized),check,failure=>abort(failure.message));
                          // This exact envelope was verified above in the same CAS transaction.
                          // The reducer clones its input; only rekey the unchanged prior payload.
                          // saveNativePieces queued the older checkpoint GC read before this put.
                          if(payload?.revision)states.put({...request.result,key:nativeCheckpointKey(normalized.key)});
                          operations.put(record(normalized.key, {...(marker.result?unpack(marker.result):{}),revision: next.revision,...nativeLifecycleMarker(savedRoot,digest(savedRoot)),...(directory?{continuations:{revision:directory.revision,directoryDigest:digest(directory)}}:{})}));
                          operations.put(record(operationKey, {fingerprint, revision: next.revision, operationId,...(hostNativeChannel(command.channel)?{admission:structuredClone(command.admission)}:{}),...(command.continuation?{continuation:structuredClone(command.continuation)}:{})}));
                          if(directory){operations.put(record(continuationDirectoryKey(normalized.key),directory));operations.put(record(continuationMarkerKey(normalized.key),{revision:directory.revision,directoryDigest:digest(directory)}));}
                          check();result = {ok: true, replayed: false, revision: next.revision, operationId};
                        }catch(failure){abort(failure.message);}
                      };
                      const publish=()=>{
                        if(!command.continuation){publishNow();return;}
                        const queued=operations.get(continuationDirectoryKey(normalized.key)),queueMarker=operations.get(continuationMarkerKey(normalized.key));
                        queueMarker.onsuccess=()=>{try{check();const directory=continuationDirectory(queued.result,queueMarker.result,normalized,marker.result)??emptyContinuationDirectory(normalized);if(command.continuation.nativeRevision!==next.revision)throw Error('native-continuation-revision-mismatch');publishNow(updateContinuationDirectory(directory,command.continuation,normalized));}catch(failure){abort(failure.message);}};
                      };
                      if(this.shared&&command.batch){
                        const refs=command.batch.refs.map(row=>({...row,projectId:next.membership[row.id]?.state==='PROJECT'?next.membership[row.id].projectId:null}));
                        this.shared.registerNativeReferences(transaction,normalized,refs,'native_refs_'+digest(operationId),check,publish,failure=>abort(failure.message),{migrateLegacy:true,preferDirectory:hostNativeChannel(command.channel)});
                      }else publish();
                    } catch (failure) { abort(failure.message); }
                  };
                  if (manifest) {
                    const projects = new Set((command.batch?.projects ?? []).map(row => row.id));
                    for (const row of command.batch?.membership ?? []) if (row.state === 'PROJECT') projects.add(row.projectId);
                    const refs = new Set([...(command.batch?.refs ?? []).map(row => row.id), ...(command.batch?.membership ?? []).map(row => row.id)]);
                    const wanted={projects,refs};if(command.lifecycle){const table=lifecycleKind(command.lifecycle.kind);wanted[table]=[command.lifecycle.id];}
                    loadNativePieces(states, manifest, normalized, wanted, save, failure => abort(failure.message),indexReader?.lookup??null);
                  } else save(current);
                } catch (failure) { abort(failure.message); }
              };
            } catch (failure) { abort(failure.message); }
          };
        } catch (failure) { abort(failure.message); }
      };
      transaction.oncomplete = () => {
        options.signal?.removeEventListener('abort', revoked);
        try { check(); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); }
      };
      transaction.onabort = () => {
        options.signal?.removeEventListener('abort', revoked);
        resolve(result?.ok === false ? result : {ok: false, reason: transaction.error?.name ?? 'native-write-aborted'});
      };
      transaction.onerror = () => {};
    });
  }
}
