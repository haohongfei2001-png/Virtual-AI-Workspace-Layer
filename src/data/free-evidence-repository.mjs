import {readContinuationForEvidence,continuationAckSourceFailure} from './continuation-evidence-reader.mjs';
import {continuationEvidenceFingerprint} from './native-observation-continuation.mjs';
import {saveDirectoryEvidence} from './evidence-directory-writer.mjs';
import {migrateEvidenceDirectory,prepareEvidenceDirectory} from './evidence-directory-migration.mjs';
import {auditEvidencePartitions} from './evidence-partition-audit.mjs';
import {EVIDENCE_DIRECTORY_FORMAT,validateEvidenceDirectoryRoot} from './evidence-ref-directory.mjs';
import {createEvidenceDirectoryReader} from './evidence-directory-reader.mjs';
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
/** Full root-envelope validation; marker and storage-key checks belong to the caller. */
export function validateFreeEvidenceRootRecord(record,scope){
 const payload=unpack(record);
 if(payload?.format===EVIDENCE_DIRECTORY_FORMAT)validateEvidenceDirectoryRoot(payload,scope);
 else if(isEvidencePartitioned(payload))validateEvidenceManifest(payload,scope);
 else validateFreeEvidence(payload,scope);
 return payload;
}
/** Evidence shares the B1 database but never its native or Pro record keys. No export/restore grants. */
export class FreeEvidenceRepository {
 #rootCache=new VerifiedRecordCache();
 #validateRoot(_payload,record,scope){return validateFreeEvidenceRootRecord(record,scope);}
 verifiedRoot(row,scope){return this.#rootCache.read(row,scope.key,(payload,record)=>this.#validateRoot(payload,record,scope));}
 #rootWithCounts(row,scope){return this.#rootCache.readWithCounts(row,scope.key,(payload,record)=>this.#validateRoot(payload,record,scope),['refVersions']);}

 constructor({baseRepository,observationGate=null,hostObservationGate=null,clock=()=>new Date().toISOString()}){
  if(!baseRepository?.open||!baseRepository?.scopeOrThrow)throw Error('b1-repository-required');
  this.base=baseRepository;this.observationGate=observationGate;this.hostObservationGate=hostObservationGate;this.clock=clock;
 }
 async prepareRefDirectory(scope,request,options={}) {return prepareEvidenceDirectory(this,scope,request,options);}
 async migrateRefDirectory(scope,request,options={}) {return migrateEvidenceDirectory(this,scope,request,options);}
 async read(scope,options={}) { return (await this.query(scope,null,options)).evidence; }
 async header(scope,options={}) { return this.query(scope,{metadataOnly:true,includeStorageFormat:options.includeStorageFormat===true},options); }
 async version(scope,options={}) { return (await this.query(scope,{rootOnly:true},options)).revision; }
 async page(scope,{revision=null,offset=0,limit=500,ids=null}={},options={}) {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>5000||ids!==null&&(!Array.isArray(ids)||ids.length>5000))throw Error('invalid-free-evidence-page');
  ids?.forEach(id);return this.query(scope,{revision,offset,limit,ids},options);
 }
 async query(scope,query,options={}) {
  const normalized=this.base.scopeOrThrow(scope),db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['native_states','native_operations'],'readonly');let value,error;
   const abort=failure=>{if(error)return;error=failure;try{tx.abort();}catch{}};
   const revoked=()=>abort(Error('stale-binding'));options.signal?.addEventListener('abort',revoked,{once:true});
   const states=tx.objectStore('native_states'),root=states.get(key);
   root.onsuccess=()=>{try{
    fence(options);const counted=query?.ids&&isEvidencePartitioned(root.result?.payload)?this.#rootWithCounts(root.result,normalized):null;
    const payload=counted?.payload??(root.result?this.verifiedRoot(root.result,normalized):emptyFreeEvidence(normalized));
    const indexed=payload?.format===EVIDENCE_DIRECTORY_FORMAT,manifest=indexed||isEvidencePartitioned(payload)?payload:null;
    const current=manifest?evidenceHeader(manifest,normalized):payload;
    if(query?.revision!==undefined&&query.revision!==null&&query.revision!==current.revision)throw Error('snapshot-revision-changed');
    const marker=tx.objectStore('native_operations').get(key);marker.onsuccess=()=>{try{fence(options);markerCheck(root.result,marker.result,current.revision);}catch(failure){abort(failure);}};
    if(query?.rootOnly){value={revision:current.revision};return;}
    // Root metadata is not an inventory-integrity certificate. Marker and final
    // authority fences still complete in this same readonly transaction.
    const reader=indexed?createEvidenceDirectoryReader(states,payload,normalized,abort):null;
    if(query?.metadataOnly){
     const done=complete=>{value={revision:current.revision,manifest:complete,sources:current.sources,...(query.includeStorageFormat?{storageFormat:payload.format,indexIntegrityBound:!!payload.indexChecksums}: {})};};
     // Existing HEADER consumers require refVersions; restore that contract.
     // This verifies directory inventory, not the evidence contents themselves.
     if(reader)reader.all(done);else done(manifest);return;
    }
    const select=complete=>{
     const refs=counted||indexed&&query?.ids?null:complete?Object.keys(complete.refVersions):[...new Set(['events','hints','coverage'].flatMap(t=>Object.values(current[t]).map(r=>r.conversationId)))];
     const total=counted?counted.counts.refVersions:refs?refs.length:Object.values(payload.directory).reduce((n,p)=>n+p.count,0);
     const selectedRefs=query?.header?[]:query?(query.ids??refs.slice(query.offset,query.offset+query.limit)):refs;
     const done=evidence=>{value={revision:current.revision,...(query?.header?{manifest:complete}:{}),evidence,selectedRefs,total,nextOffset:query?Math.min(total,(query.offset??0)+(query.limit??0)):total};if(query&&!query.header&&JSON.stringify(value).length>16*1024*1024)throw Error('free-evidence-page-too-large');};
     if(manifest)loadEvidencePieces(states,complete??manifest,normalized,selectedRefs,done,abort,reader?.lookupMany);
     else {const selected=new Set(selectedRefs),evidence={...current};for(const t of ['events','hints','coverage'])evidence[t]=Object.fromEntries(Object.entries(current[t]).filter(([,r])=>selected.has(r.conversationId)));done(evidence);}
    };
    if(reader&&!query?.ids)reader.all(select);else select(manifest);
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
      const abort = reason => { if(result?.ok===false)return;result = {ok: false, reason}; try { tx.abort(); } catch {} };
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
          try { const value=this.verifiedRoot(root.result,normalized);intact=isEvidencePartitioned(value)||value.format===EVIDENCE_DIRECTORY_FORMAT; } catch {}
          if (intact) throw Error('intact-state-not-replaced');
          const manifest = this.verifiedRoot(shadow.result, normalized),indexed=manifest.format===EVIDENCE_DIRECTORY_FORMAT;
          if(!indexed&&!isEvidencePartitioned(manifest))throw Error('invalid-free-evidence-manifest');
          // Never use a legacy shadow to roll back a recognizable directory root.
          if(root.result?.payload?.format===EVIDENCE_DIRECTORY_FORMAT&&!indexed)throw Error('evidence-directory-recovery-format-conflict');
          if (unpack(marker.result).revision !== manifest.revision) throw Error('free-evidence-root-revision-conflict');
          // Verify every referenced piece before publishing a recovered manifest.
          const verify=complete=>loadEvidenceIndexes(store,complete,normalized,Object.keys(complete.indexVersions),(indexes,{checksums})=>auditEvidencePartitions(store, complete, normalized, ()=>fence(options), () => {
            try {
              fence(options);
              const next = structuredClone(manifest); next.revision++;next.indexChecksums=checksums;
              for (const source of Object.values(next.sources)) source.revoked = true;

              if(indexed)validateEvidenceDirectoryRoot(next,normalized);else validateEvidenceManifest(next, normalized);
              store.put(evidenceRecord(freeEvidenceKey(normalized.key), next)); store.put(evidenceRecord(evidenceRecoveryKey(normalized.key), next));
              ops.put(record(freeEvidenceKey(normalized.key), {revision: next.revision}));
              const receiptWrite = ops.put(record(key, {kind: 'RECOVER_FREE_EVIDENCE', fingerprint: damagedHash, revision: next.revision, operationId}));
              receiptWrite.onsuccess = () => { try { fence(options); } catch (failure) { abort(failure.message); } };
              fence(options);
              result = {ok: true, revision: next.revision, operationId, evidenceInvalidated: true};
            } catch (failure) { abort(failure.message); }
          }, failure => abort(failure.message),indexes),failure=>abort(failure.message));
          if(indexed)createEvidenceDirectoryReader(store,manifest,normalized,failure=>abort(failure.message)).all(verify);else verify(manifest);
        } catch (failure) { abort(failure.message); }
      };
      tx.oncomplete = () => { options.signal?.removeEventListener('abort', revoked); try { fence(options); resolve(result); } catch { resolve({ok: false, reason: 'stale-after-commit', committed: true}); } };
      tx.onabort = () => { options.signal?.removeEventListener('abort', revoked); resolve(result?.ok === false ? result : {ok: false, reason: tx.error?.name ?? 'free-evidence-recovery-aborted'}); };
    });
  }

 async apply(scope,request,options={}){
  const normalized=this.base.scopeOrThrow(scope),host=this.hostObservationGate?.(normalized,request),authority=host??this.observationGate?.(normalized);
  if(host?(host.channel!=='host-evidence'||host.scopeKey!==normalized.key||typeof host.guard!=='function'||host.guard()!==true):authority?.channel!=='synthetic')throw Error('untrusted-free-evidence-source');
  // Gate admission belongs to the original object; persist one stable snapshot.
  request=structuredClone(request);
  id(authority.sourceId);id(authority.generation);
  if(host){id(host.profileId);if(!Number.isSafeInteger(host.profileVersion)||host.profileVersion<1)throw Error('invalid-host-evidence-profile');const original=options;options={...original,guard:()=>host.guard()===true&&(original.guard?.()??true)===true};}
  if(!request.batch||!['sources','events','hints','coverage'].every(t=>Array.isArray(request.batch[t])))throw Error('invalid-free-evidence-batch');
  for(const row of request.batch.sources)if(row.id!==authority.sourceId||row.generation!==authority.generation||(host&&(row.channel!=='host-evidence'||row.codecVersion!==(host.purpose==='historical-send'&&host.codecVersion===2?2:1)||row.profileId!==host.profileId||row.profileVersion!==host.profileVersion)))throw Error('free-evidence-source-gate-mismatch');
  for(const table of ['events','hints','coverage'])for(const row of request.batch[table])if(row.sourceId!==authority.sourceId||row.generation!==authority.generation||(host&&(host.purpose==='historical-send'&&host.codecVersion===2?table!=='events':table!=='hints'||row.ackWitness?.profileId!==host.profileId||row.ackWitness?.profileVersion!==host.profileVersion)))throw Error('free-evidence-source-gate-mismatch');
  const command={type:'OBSERVE_FREE_EVIDENCE',batch:request.batch};
  return this.mutate(normalized,request,command,options,host?{channel:'host-evidence',profileId:host.profileId,profileVersion:host.profileVersion,sourceId:host.sourceId,generation:host.generation}:null);
 }
 async applyContinuation(scope,request,options={}){
  const normalized=this.base.scopeOrThrow(scope),host=this.hostObservationGate?.(normalized,request);
  if(!host||host.channel!=='host-evidence'||host.purpose!=='native-continuation'||host.scopeKey!==normalized.key||typeof host.guard!=='function'||host.guard()!==true)throw Error('untrusted-native-continuation');
  const snapshot=structuredClone(request),authority={};
  if(Object.keys(snapshot).sort().join(',')!=='expectedRevision,nativeOperationId,operationId,payloadDigest')throw Error('invalid-native-continuation-request');
  id(snapshot.nativeOperationId);
  if(typeof snapshot.payloadDigest!=='string'||!/^[0-9a-f]{64}$/.test(snapshot.payloadDigest)||host.nativeOperationId!==snapshot.nativeOperationId||host.payloadDigest!==snapshot.payloadDigest)throw Error('native-continuation-authority-conflict');
  for(const key of ['scopeKey','sourceId','generation','profileId','profileVersion'])authority[key]=host[key];
  const guard=host.guard,original=options,callerGuard=options.guard??(()=>true);
  return this.mutate(normalized,snapshot,null,{...original,guard:()=>guard()===true&&callerGuard()===true},null,{request:snapshot,authority});
 }
 async invalidate(scope,request,options={}){
  id(request.sourceId);return this.mutate(scope,request,{type:'REVOKE_FREE_EVIDENCE_SOURCE',sourceId:request.sourceId},options);
 }
 async mutate(scope,{operationId,expectedRevision},command,options,host=null,continuation=null){
  command=structuredClone(command);host=host?structuredClone(host):null;continuation=continuation?structuredClone(continuation):null;
  const normalized=this.base.scopeOrThrow(scope);id(operationId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
  let fingerprint=continuation?null:digest({command,expectedRevision,...(host?{host}: {})});
  const db=await this.base.open(),key=freeEvidenceKey(normalized.key);fence(options);
  return new Promise(resolve=>{
   const tx=db.transaction(['native_states','native_operations'],'readwrite'),states=tx.objectStore('native_states'),operations=tx.objectStore('native_operations');let result;
   const abort=reason=>{if(result?.ok===false)return;result={ok:false,reason};try{tx.abort();}catch{}};
   const revoked=()=>abort('stale-binding');options.signal?.addEventListener('abort',revoked,{once:true});
   let continuationRecord=null,validateContinuationSource=null;
   const begin=()=>{const root=states.get(key);
   root.onsuccess=()=>{try{
    fence(options);const payload=root.result?this.verifiedRoot(root.result,normalized):emptyFreeEvidence(normalized);
    const indexed=payload?.format===EVIDENCE_DIRECTORY_FORMAT,manifest=indexed||isEvidencePartitioned(payload)?payload:null;
    const reader=indexed?createEvidenceDirectoryReader(states,payload,normalized,failure=>abort(failure.message)):null;
    const current=manifest?evidenceHeader(manifest,normalized):payload;
    const marker=operations.get(key);marker.onsuccess=()=>{try{
     fence(options);markerCheck(root.result,marker.result,current.revision);
     const operationKey=JSON.stringify([key,operationId]),receipt=operations.get(operationKey);
     receipt.onsuccess=()=>{try{
      fence(options);
      if(receipt.result){const prior=unpack(receipt.result);result=prior.fingerprint===fingerprint&&(!continuation||(prior.kind==='OBSERVE_HOST_CONTINUATION'&&prior.operationId===operationId&&Number.isSafeInteger(prior.revision)&&prior.revision>0&&prior.revision<=current.revision&&(continuationRecord.state!=='complete'||continuationRecord.evidenceRevision===prior.revision)))?{ok:true,replayed:true,revision:prior.revision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
      if(continuation){if(continuationRecord.state!=='pending-evidence')throw Error('missing-continuation-evidence-receipt');validateContinuationSource();const ackFailure=continuationAckSourceFailure(continuationRecord,current.sources);if(ackFailure)throw Error('native-continuation-'+ackFailure);}
      if(current.revision!==expectedRevision)throw Error('revision-conflict');
      if(manifest&&!manifest.indexChecksums)throw Error('evidence-index-integrity-required');
      let indexes={};
      const save=partial=>{try{
       const next=applyFreeEvidence(partial,command,{scope:normalized,now:continuationRecord?.admission.acceptedAt??this.clock(),channel:continuation?'host-evidence':host?.channel??'synthetic',historical:!!continuation,jointContinuation:!!continuationRecord?.nativeWitness});fence(options);
       const finish=()=>{try{fence(options);operations.put(record(key,{revision:next.revision}));operations.put(record(operationKey,{fingerprint,revision:next.revision,operationId,...(continuation?{kind:'OBSERVE_HOST_CONTINUATION'}:{})}));fence(options);result={ok:true,replayed:false,revision:next.revision,operationId};}catch(failure){abort(failure.message);}};
       if(reader)saveDirectoryEvidence(states,normalized,next,manifest,partial,indexes,reader,finish,failure=>abort(failure.message));else{saveEvidencePieces(states,normalized,next,manifest,manifest?partial:null,indexes);finish();}
      }catch(failure){abort(failure.message);}};
      if(manifest)evidenceTouchedRefs(states,manifest,normalized,command,(refs,loaded)=>{indexes=loaded;loadEvidencePieces(states,manifest,normalized,refs,save,failure=>abort(failure.message),reader?.lookupMany);},failure=>abort(failure.message),reader?.lookupMany);else save(current);
     }catch(failure){abort(failure.message);}};
    }catch(failure){abort(failure.message);}};
   }catch(failure){abort(failure.message);}};
   };
   if(continuation)readContinuationForEvidence(tx,normalized,continuation.request,continuation.authority,()=>fence(options),(record,validateSource)=>{continuationRecord=record;validateContinuationSource=validateSource;fingerprint=continuationEvidenceFingerprint(record,normalized);command=record.state==='pending-evidence'?{type:'OBSERVE_FREE_EVIDENCE',batch:record.evidence.batch}:null;begin();},failure=>abort(failure.message));else begin();
   tx.oncomplete=()=>{options.signal?.removeEventListener('abort',revoked);try{fence(options);resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
   tx.onabort=()=>{options.signal?.removeEventListener('abort',revoked);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'free-evidence-write-aborted'});};
   tx.onerror=()=>{};
  });
 }
}
