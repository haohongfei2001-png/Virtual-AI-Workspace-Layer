import {VerifiedRecordCache} from './verified-record-cache.mjs';
import {freeEvidenceKey,evidenceRecoveryKey,evidenceRecord,unpackEvidence,isEvidencePartitioned,validateEvidenceManifest,evidenceHeader,loadEvidencePieces,saveEvidencePieces,evidenceTouchedRefs,loadEvidenceIndexes} from './free-evidence-partitions.mjs';
export {freeEvidenceKey} from './free-evidence-partitions.mjs';
import {emptyFreeEvidence,validateFreeEvidence,applyFreeEvidence} from './free-evidence.mjs';
import {digest} from './hash.mjs';
import {id} from './state.mjs';
const record=(key,payload)=>({key,payload,checksum:digest(payload)});
function unpack(row){if(!row||row.checksum!==digest(row.payload))throw Error('corrupt-free-evidence-record');return row.payload;}
function fence({guard=()=>true,signal}={}){if(signal?.aborted||guard()!==true)throw Error('stale-binding');}
function markerCheck(root,marker,revision){
 if(!root&&marker)throw Error('missing-free-evidence-root');
 if(revision&&!marker)throw Error('missing-free-evidence-marker');
 if(marker&&unpack(marker).revision!==revision)throw Error('free-evidence-root-revision-conflict');
}
/** Evidence shares the B1 database but never its native or Pro record keys. No export/restore grants. */
export class FreeEvidenceRepository {
 #rootCache=new VerifiedRecordCache();
 verifiedRoot(row,scope){return this.#rootCache.read(row,scope.key,(payload,record)=>{unpack(record);if(isEvidencePartitioned(payload))validateEvidenceManifest(payload,scope);else validateFreeEvidence(payload,scope);});}

 constructor({baseRepository,observationGate=null,clock=()=>new Date().toISOString()}){
  if(!baseRepository?.open||!baseRepository?.scopeOrThrow)throw Error('b1-repository-required');
  this.base=baseRepository;this.observationGate=observationGate;this.clock=clock;
 }
 async read(scope,options={}) { return (await this.query(scope,null,options)).evidence; }
 async header(scope,options={}) { return this.query(scope,{metadataOnly:true},options); }
 async page(scope,{revision=null,offset=0,limit=500,ids=null}={},options={}) {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>5000||ids!==null&&(!Array.isArray(ids)||ids.length>5000))throw Error('invalid-free-evidence-page');
  ids?.forEach(id);return this.query(scope,{revision,offset,limit,ids},options);
 }
 async query(scope,query,options={}) {
  const normalized=this.base.scopeOrThrow(scope),db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['native_states','native_operations'],'readonly');let value,error;
   const abort=failure=>{error=failure;try{tx.abort();}catch{}};
   const revoked=()=>abort(Error('stale-binding'));options.signal?.addEventListener('abort',revoked,{once:true});
   const states=tx.objectStore('native_states'),root=states.get(key);
   root.onsuccess=()=>{try{
    fence(options);const payload=root.result?this.verifiedRoot(root.result,normalized):emptyFreeEvidence(normalized);
    const manifest=isEvidencePartitioned(payload)?payload:null;
    const current=manifest?evidenceHeader(manifest,normalized):payload;
    if(query?.revision!==undefined&&query.revision!==null&&query.revision!==current.revision)throw Error('snapshot-revision-changed');
    const marker=tx.objectStore('native_operations').get(key);marker.onsuccess=()=>{try{fence(options);markerCheck(root.result,marker.result,current.revision);}catch(failure){abort(failure);}};
    // Header callers need authority and root metadata, not a ref inventory or pieces.
    // Keep the marker request in this transaction and resolve only after it succeeds.
    if(query?.metadataOnly){value={revision:current.revision,manifest,sources:current.sources};return;}
    const refs=manifest?Object.keys(manifest.refVersions):[...new Set(['events','hints','coverage'].flatMap(t=>Object.values(current[t]).map(r=>r.conversationId)))];
    const selectedRefs=query?.header?[]:query?(query.ids??refs.slice(query.offset,query.offset+query.limit)):refs;
    const done=evidence=>{value={revision:current.revision,...(query?.header?{manifest}:{}),evidence,selectedRefs,total:refs.length,nextOffset:query?Math.min(refs.length,(query.offset??0)+(query.limit??0)):refs.length};if(query&&!query.header&&JSON.stringify(value).length>16*1024*1024)throw Error('free-evidence-page-too-large');};
    if(manifest)loadEvidencePieces(states,manifest,normalized,selectedRefs,done,abort);
    else {const selected=new Set(selectedRefs),evidence={...current};for(const t of ['events','hints','coverage'])evidence[t]=Object.fromEntries(Object.entries(current[t]).filter(([,r])=>selected.has(r.conversationId)));done(evidence);}
   }catch(failure){abort(failure);}};
   tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(value);}catch(failure){reject(failure);}};
   tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);reject(error??tx.error??Error('free-evidence-read-aborted'));};
  });
 }
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
      const root = store.get(freeEvidenceKey(normalized.key)), shadow = store.get(evidenceRecoveryKey(normalized.key)), marker = ops.get(freeEvidenceKey(normalized.key));
      const key = JSON.stringify([freeEvidenceKey(normalized.key), operationId]), receipt = ops.get(key);
      receipt.onsuccess = () => {
        try {
          fence(options);
          if (receipt.result) {
            const prior = unpack(receipt.result);
            result = prior.kind === 'RECOVER_FREE_EVIDENCE' && prior.fingerprint === damagedHash ?
              {ok: true, replayed: true, revision: prior.revision, operationId} : {ok: false, reason: 'operation-replay-conflict'};
            return;
          }
          if (digest(root.result ?? null) !== damagedHash) throw Error('recovery-conflict');
          let intact = false;
          try { validateEvidenceManifest(unpack(root.result), normalized); intact = true; } catch {}
          if (intact) throw Error('intact-state-not-replaced');
          const manifest = validateEvidenceManifest(unpack(shadow.result), normalized);
          if (unpack(marker.result).revision !== manifest.revision) throw Error('free-evidence-root-revision-conflict');
          // Verify every referenced piece before publishing a recovered manifest.
          loadEvidenceIndexes(store,manifest,normalized,Object.keys(manifest.indexVersions),()=>loadEvidencePieces(store, manifest, normalized, Object.keys(manifest.refVersions), () => {
            try {
              fence(options);
              const next = structuredClone(manifest); next.revision++;
              for (const source of Object.values(next.sources)) source.revoked = true;

              validateEvidenceManifest(next, normalized);
              store.put(evidenceRecord(freeEvidenceKey(normalized.key), next)); store.put(evidenceRecord(evidenceRecoveryKey(normalized.key), next));
              ops.put(record(freeEvidenceKey(normalized.key), {revision: next.revision}));
              ops.put(record(key, {kind: 'RECOVER_FREE_EVIDENCE', fingerprint: damagedHash, revision: next.revision, operationId}));
              fence(options);
              result = {ok: true, revision: next.revision, operationId, evidenceInvalidated: true};
            } catch (failure) { abort(failure.message); }
          }, failure => abort(failure.message)),failure=>abort(failure.message));
        } catch (failure) { abort(failure.message); }
      };
      tx.oncomplete = () => { options.signal?.removeEventListener('abort', revoked); try { fence(options); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); } };
      tx.onabort = () => { options.signal?.removeEventListener('abort', revoked); resolve(result ?? {ok: false, reason: tx.error?.name ?? 'free-evidence-recovery-aborted'}); };
    });
  }

 async apply(scope,request,options={}){
  const normalized=this.base.scopeOrThrow(scope),authority=this.observationGate?.(normalized);
  if(authority?.channel!=='synthetic')throw Error('untrusted-free-evidence-source');
  id(authority.sourceId);id(authority.generation);
  if(!request.batch||!['sources','events','hints','coverage'].every(t=>Array.isArray(request.batch[t])))throw Error('invalid-free-evidence-batch');
  for(const row of request.batch.sources)if(row.id!==authority.sourceId||row.generation!==authority.generation)throw Error('free-evidence-source-gate-mismatch');
  for(const table of ['events','hints','coverage'])for(const row of request.batch[table])if(row.sourceId!==authority.sourceId||row.generation!==authority.generation)throw Error('free-evidence-source-gate-mismatch');
  const command={type:'OBSERVE_FREE_EVIDENCE',batch:request.batch};
  return this.mutate(normalized,request,command,options);
 }
 async invalidate(scope,request,options={}){
  id(request.sourceId);return this.mutate(scope,request,{type:'REVOKE_FREE_EVIDENCE_SOURCE',sourceId:request.sourceId},options);
 }
 async mutate(scope,{operationId,expectedRevision},command,options){
  const normalized=this.base.scopeOrThrow(scope);id(operationId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
  const fingerprint=digest({command,expectedRevision}),db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise(resolve=>{
   const tx=db.transaction(['native_states','native_operations'],'readwrite'),states=tx.objectStore('native_states'),operations=tx.objectStore('native_operations');let result;
   const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}};
   const revoked=()=>abort('stale-binding');options.signal?.addEventListener('abort',revoked,{once:true});
   const root=states.get(key);
   root.onsuccess=()=>{try{
    fence(options);const payload=root.result?this.verifiedRoot(root.result,normalized):emptyFreeEvidence(normalized);
    const manifest=isEvidencePartitioned(payload)?payload:null;
    const current=manifest?evidenceHeader(manifest,normalized):payload;
    const marker=operations.get(key);marker.onsuccess=()=>{try{
     fence(options);markerCheck(root.result,marker.result,current.revision);
     const operationKey=JSON.stringify([key,operationId]),receipt=operations.get(operationKey);
     receipt.onsuccess=()=>{try{
      fence(options);
      if(receipt.result){const prior=unpack(receipt.result);result=prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.revision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
      if(current.revision!==expectedRevision)throw Error('revision-conflict');
      let indexes={};
      const save=partial=>{try{
       const next=applyFreeEvidence(partial,command,{scope:normalized,now:this.clock(),channel:'synthetic'});fence(options);
       saveEvidencePieces(states,normalized,next,manifest,manifest?partial:null,indexes);operations.put(record(key,{revision:next.revision}));operations.put(record(operationKey,{fingerprint,revision:next.revision,operationId}));fence(options);
       result={ok:true,replayed:false,revision:next.revision,operationId};
      }catch(failure){abort(failure.message);}};
      if(manifest)evidenceTouchedRefs(states,manifest,normalized,command,(refs,loaded)=>{indexes=loaded;loadEvidencePieces(states,manifest,normalized,refs,save,failure=>abort(failure.message));},failure=>abort(failure.message));else save(current);
     }catch(failure){abort(failure.message);}};
    }catch(failure){abort(failure.message);}};
   }catch(failure){abort(failure.message);}};
   tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
   tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'free-evidence-write-aborted'});};
   tx.onerror=()=>{};
  });
 }
}
