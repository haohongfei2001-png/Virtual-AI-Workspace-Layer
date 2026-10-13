import {migrateNativeVersionIndex} from './native-index-migration.mjs';
import {saveIndexedNativePieces} from './native-index-writer.mjs';
import {NATIVE_INDEX_FORMAT,validateNativeIndexRoot} from './native-version-index.mjs';
import {createNativeIndexReader} from './native-index-reader.mjs';
import {VerifiedRecordCache} from './verified-record-cache.mjs';
import { isNativePartitioned, validateNativeManifest, loadNativePieces, saveNativePieces, nativeHeader, nativeRecoveryKey, nativeCheckpointKey, nativeRecord } from './native-partitions.mjs';
import { emptyNativeFacts, validateNativeFacts, applyNativeObservations, invalidateNativeSource } from './native-facts.mjs';
import { freeProjection } from './free-projection.mjs';
import { id } from './state.mjs';
import { digest } from './hash.mjs';

const record = (key, payload) => ({key, payload, checksum: digest(payload)});
function unpack(row) {
  if (!row || row.checksum !== digest(row.payload)) throw Error('corrupt-native-record');
  return row.payload;
}
function fence({guard = () => true, signal} = {}) {
  if (signal?.aborted || guard() !== true) throw Error('stale-binding');
}

export class NativeRepository {
  #rootCache=new VerifiedRecordCache({maxEntries:3});
  #validateRoot(payload,record,scope){unpack(record);if(payload?.format===NATIVE_INDEX_FORMAT)validateNativeIndexRoot(payload,scope);else if(isNativePartitioned(payload))validateNativeManifest(payload,scope);else validateNativeFacts(payload,scope);}
  #rootContext(row,scope){
    if(typeof row?.checksum!=='string'||!/^[0-9a-f]{64}$/.test(row.checksum))throw Error('corrupt-native-record');
    return JSON.stringify([scope.key,row.checksum]);
  }
  verifiedRoot(row,scope){return this.#rootCache.read(row,this.#rootContext(row,scope),(payload,record)=>this.#validateRoot(payload,record,scope));}
  #rootWithCounts(row,scope){return this.#rootCache.readWithCounts(row,this.#rootContext(row,scope),(payload,record)=>this.#validateRoot(payload,record,scope),['projects','refs']);}
  #verifyCheckpoint(row,scope){
    if(row?.key!==nativeCheckpointKey(scope.key))throw Error('invalid-native-checkpoint-key');
    // A checkpoint is an alias of a formerly validated root, not a new proof.
    // Rekey only this envelope; cache hits still compare every newly read byte.
    return this.verifiedRoot({...row,key:scope.key},scope);
  }

  constructor({baseRepository, workspaceRepository = null, observationGate = null, hostObservationGate = null, clock = () => new Date().toISOString()}) {
    if (!baseRepository?.open || !baseRepository?.scopeOrThrow) throw Error('b1-repository-required');
    this.base = baseRepository;
    if(workspaceRepository&&workspaceRepository.base!==baseRepository)throw Error('shared-native-database-required');
    this.shared=workspaceRepository;
    this.observationGate = observationGate;
    this.hostObservationGate = hostObservationGate;
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
          if(payload?.format===NATIVE_INDEX_FORMAT){
            facts=nativeHeader(payload,normalized);const fail=failure=>{error=failure;transaction.abort();};
            createNativeIndexReader(transaction.objectStore('native_states'),payload,normalized,fail).all(manifest=>loadNativePieces(transaction.objectStore('native_states'),manifest,normalized,{projects:Object.keys(manifest.projects),refs:Object.keys(manifest.refs)},value=>{facts=value;},fail));
          } else if (isNativePartitioned(payload)) {
            const manifest = payload;
            loadNativePieces(transaction.objectStore('native_states'), manifest, normalized,
              {projects: Object.keys(manifest.projects), refs: Object.keys(manifest.refs)}, value => { facts = value; },
              failure => { error = failure; transaction.abort(); });
            facts = nativeHeader(manifest, normalized);
          } else facts = payload ?? emptyNativeFacts(normalized);
          const marker = transaction.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try {
              if (!request.result && marker.result) throw Error('missing-native-root');
              if (facts.revision && !marker.result) throw Error('missing-native-marker');
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
            if(value?.format===NATIVE_INDEX_FORMAT)createNativeIndexReader(tx.objectStore('native_states'),value,normalized,failure=>{error=failure;tx.abort();}).all(value=>{manifest=value;});
            else if (isNativePartitioned(value)) manifest = value;
            revision = (manifest ?? value).revision;
          }
          const marker = tx.objectStore('native_operations').get(normalized.key);
          marker.onsuccess = () => {
            try { if (marker.result ? unpack(marker.result).revision !== revision : revision !== 0) throw Error('native-root-revision-conflict'); }
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
      marker.onsuccess=()=>{try{fence(options);const value=root.result?this.verifiedRoot(root.result,normalized):null;revision=value?.revision??0;if(!value&&marker.result)throw Error('missing-native-root');if(marker.result?unpack(marker.result).revision!==revision:revision!==0)throw Error('native-root-revision-conflict');}catch(failure){error=failure;tx.abort();}};
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
          const counted=ids&&request.result&&request.result.payload?.format!==NATIVE_INDEX_FORMAT?this.#rootWithCounts(request.result,normalized):null;
          const payload = counted?.payload ?? (request.result ? this.verifiedRoot(request.result, normalized) : emptyNativeFacts(normalized));
          if(payload?.format===NATIVE_INDEX_FORMAT){
            if(revision!==null&&revision!==payload.revision)throw Error('snapshot-revision-changed');
            const total=['projects','refs'].reduce((sum,kind)=>sum+Object.values(payload[kind]).reduce((n,p)=>n+p.count,0),0);
            const reader=createNativeIndexReader(store,payload,normalized,fail),marker=tx.objectStore('native_operations').get(normalized.key);
            marker.onsuccess=()=>{try{if(unpack(marker.result).revision!==payload.revision)throw Error('native-root-revision-conflict');}catch(failure){fail(failure);}};
            const load=(manifest,selectedProjects,selectedRefs,lookup=null)=>loadNativePieces(store,manifest,normalized,{projects:selectedProjects,refs:selectedRefs},facts=>{
              result={revision:payload.revision,offset,total,nextOffset:Math.min(total,offset+limit),facts,selectedProjects,selectedRefs};
              if(JSON.stringify(result).length>16*1024*1024)fail(Error('native-page-too-large'));
            },fail,lookup);
            if(ids)load(reader.manifest,ids.projects,ids.refs,reader.lookup);
            else reader.all(manifest=>{const projects=Object.keys(manifest.projects),refs=Object.keys(manifest.refs);load(manifest,projects.slice(offset,offset+limit),refs.slice(Math.max(0,offset-projects.length),Math.max(0,offset+limit-projects.length)));});
            return;
          }
          if (!isNativePartitioned(payload)) {
            const all = payload;
            if (revision !== null && revision !== all.revision) throw Error('snapshot-revision-changed');
            const projects = ids?null:Object.keys(all.projects), refs = ids?null:Object.keys(all.refs), total = counted?counted.counts.projects+counted.counts.refs:(projects?.length??0)+(refs?.length??0);
            const selectedProjects = ids?.projects ?? projects.slice(offset, offset + limit);
            const selectedRefs = ids?.refs ?? refs.slice(Math.max(0, offset-projects.length), Math.max(0, offset+limit-projects.length));
            const facts = {...emptyNativeFacts(normalized),revision:all.revision,sources:all.sources};
            for (const key of selectedRefs) if (all.refs[key]) {facts.refs[key]=all.refs[key];if(all.membership[key])facts.membership[key]=all.membership[key];}
            const dependencies = Object.values(facts.membership).filter(row=>row.state==='PROJECT').map(row=>row.projectId);
            for (const key of [...selectedProjects,...dependencies]) if (all.projects[key]) facts.projects[key]=all.projects[key];
            const marker = tx.objectStore('native_operations').get(normalized.key);
            marker.onsuccess = () => {try {if(marker.result ? unpack(marker.result).revision!==all.revision||!request.result : all.revision!==0)throw Error('native-root-revision-conflict');}catch(failure){fail(failure);}};
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
            try { if (unpack(marker.result).revision !== manifest.revision) throw Error('native-root-revision-conflict'); }
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
          try {const value=unpack(root.result);if(value?.format===NATIVE_INDEX_FORMAT)validateNativeIndexRoot(value,normalized);else validateNativeManifest(value,normalized);intact=true;} catch {}
          if (intact) throw Error('intact-state-not-replaced');
          const shadowPayload=unpack(shadow.result),indexed=shadowPayload?.format===NATIVE_INDEX_FORMAT;
          const recoveryRoot=indexed?validateNativeIndexRoot(shadowPayload,normalized):validateNativeManifest(shadowPayload,normalized);
          const verifyAndRecover=manifest=>{
          if (unpack(marker.result).revision !== manifest.revision) throw Error('native-root-revision-conflict');
          // Verify every referenced piece before publishing a recovered manifest.
          loadNativePieces(store, manifest, normalized, {projects: Object.keys(manifest.projects), refs: Object.keys(manifest.refs)}, () => {
            try {
              fence(options);
              const next = structuredClone(recoveryRoot); next.revision++;
              for (const source of Object.values(next.sources)) source.revoked = true;
              next.changes = [];
              if(indexed)validateNativeIndexRoot(next,normalized);else validateNativeManifest(next, normalized);
              store.put(nativeRecord(normalized.key, next)); store.put(nativeRecord(nativeRecoveryKey(normalized.key), next));
              ops.put(record(normalized.key, {revision: next.revision}));
              ops.put(record(key, {kind: 'RECOVER_NATIVE', fingerprint: damagedHash, revision: next.revision, operationId}));
              fence(options);
              result = {ok: true, revision: next.revision, operationId, evidenceInvalidated: true};
            } catch (failure) { abort(failure.message); }
          }, failure => abort(failure.message));
          };
          if(indexed)createNativeIndexReader(store,recoveryRoot,normalized,failure=>abort(failure.message)).all(verifyAndRecover);else verifyAndRecover(recoveryRoot);
        } catch (failure) { abort(failure.message); }
      };
      tx.oncomplete = () => { options.signal?.removeEventListener('abort', revoked); try { fence(options); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); } };
      tx.onabort = () => { options.signal?.removeEventListener('abort', revoked); resolve(result ?? {ok: false, reason: tx.error?.name ?? 'native-recovery-aborted'}); };
    });
  }

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
    if (host ? host.channel!=='host-dom'||typeof host.guard!=='function'||host.guard()!==true : authority?.channel !== 'synthetic') throw Error('untrusted-native-source');
    const witness = {channel: authority.channel, sourceId: authority.sourceId, generation: authority.generation,...(host?{admission:host.admission}:{})};
    if(host){const original=options;options={...original,guard:()=>host.guard()===true&&(original.guard?.()??true)===true};}
    id(witness.sourceId);
    id(witness.generation);
    const apply=()=>this.mutate(normalized, request, {kind: 'APPLY_NATIVE_OBSERVATIONS', ...witness, batch: request.batch},
      current => applyNativeObservations(current, request.batch, {scope: normalized, ...witness, now: this.clock()}), options);
    const result=await apply();
    // The write transaction already reads and validates the shared root. Only a
    // legacy capacity boundary needs an out-of-transaction migration and one retry.
    if(this.shared&&result.reason==='native-shared-migration-required'){
      const migrated=await this.shared.migratePartitioned(normalized,options);
      if(!migrated.ok)throw Error(migrated.reason);
      fence(options);return apply();
    }
    return result;
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
    const fingerprint = digest({command, expectedRevision}), db = await this.base.open();
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
          const indexReader=payload?.format===NATIVE_INDEX_FORMAT?createNativeIndexReader(states,payload,normalized,failure=>abort(failure.message)):null;
          const manifest = indexReader?.manifest ?? (isNativePartitioned(payload) ? payload : null);
          const current = manifest ? nativeHeader(manifest, normalized) : payload ?? emptyNativeFacts(normalized);
          const marker = operations.get(normalized.key);
          marker.onsuccess = () => {
            try {
              check();
              if (!request.result && marker.result) throw Error('missing-native-root');
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
                      const publish=()=>{
                        try {check();if(indexReader)saveIndexedNativePieces(states,normalized,next,storage,command,indexReader,row=>this.#verifyCheckpoint(row,normalized),check,failure=>abort(failure.message));
                          else saveNativePieces(states, normalized, partial, next, storage, command,row=>this.#verifyCheckpoint(row,normalized));
                          // This exact envelope was verified above in the same CAS transaction.
                          // The reducer clones its input; only rekey the unchanged prior payload.
                          // saveNativePieces queued the older checkpoint GC read before this put.
                          if(payload?.revision)states.put({...request.result,key:nativeCheckpointKey(normalized.key)});
                          operations.put(record(normalized.key, {revision: next.revision}));
                          operations.put(record(operationKey, {fingerprint, revision: next.revision, operationId,...(command.channel==='host-dom'?{admission:structuredClone(command.admission)}:{})}));
                          check();result = {ok: true, replayed: false, revision: next.revision, operationId};
                        }catch(failure){abort(failure.message);}
                      };
                      if(this.shared&&command.batch){
                        const refs=command.batch.refs.map(row=>({...row,projectId:next.membership[row.id]?.state==='PROJECT'?next.membership[row.id].projectId:null}));
                        this.shared.registerNativeReferences(transaction,normalized,refs,'native_refs_'+digest(operationId),check,publish,failure=>abort(failure.message),{migrateLegacy:true});
                      }else publish();
                    } catch (failure) { abort(failure.message); }
                  };
                  if (manifest) {
                    const projects = new Set((command.batch?.projects ?? []).map(row => row.id));
                    for (const row of command.batch?.membership ?? []) if (row.state === 'PROJECT') projects.add(row.projectId);
                    const refs = new Set([...(command.batch?.refs ?? []).map(row => row.id), ...(command.batch?.membership ?? []).map(row => row.id)]);
                    loadNativePieces(states, manifest, normalized, {projects, refs}, save, failure => abort(failure.message),indexReader?.lookup??null);
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
