import {nativeKinds,nativeLifecycleMarker,verifyNativeLifecycleMarker} from './native-lifecycle.mjs';
import {buildNativeVersionIndex,isNativeVersionIndexed} from './native-version-index.mjs';
import {isNativePartitioned,nativeRecord,nativeUnpack,nativeRecoveryKey,nativeCheckpointKey,nativePartitionKey} from './native-partitions.mjs';
import {auditNativePartitions} from './native-partition-audit.mjs';
import {digest} from './hash.mjs';
import {id} from './state.mjs';
// One private, replaceable pure-build candidate per owner. This is not an audit
// certificate: publication still rereads root bytes and audits every live piece
// in the final RW transaction. Preserve key order too: it determines ordinals.
// No caller can supply or mutate the candidate.
const preparedBuilds=new WeakMap();
function buildFor(payload,scope){return buildNativeVersionIndex({...payload,revision:payload.revision+1,changes:[{revision:payload.revision+1,...Object.fromEntries(nativeKinds(payload).map(kind=>[kind,[]]))}]},scope);}
export async function prepareNativeVersionIndex(owner,scope,{expectedRevision},{guard=()=>true,signal=null}={}){
 const normalized=owner.base.scopeOrThrow(scope);
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
 const fence=()=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');},db=await owner.base.open();fence();
 return new Promise(resolve=>{
  const tx=db.transaction(['native_states','native_operations'],'readonly'),root=tx.objectStore('native_states').get(normalized.key),marker=tx.objectStore('native_operations').get(normalized.key);let result,candidate;
  const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}},onRevoke=()=>abort('stale-binding');signal?.addEventListener('abort',onRevoke,{once:true});
  marker.onsuccess=()=>{try{
   fence();const payload=root.result?owner.verifiedRoot(root.result,normalized):null;
   if(!payload)throw Error('missing-native-root');
   verifyNativeLifecycleMarker(nativeUnpack(marker.result),payload,root.result.checksum);if(nativeUnpack(marker.result).revision!==payload.revision)throw Error('native-root-revision-conflict');
   if(payload.revision!==expectedRevision)throw Error('revision-conflict');
   if(isNativeVersionIndexed(payload)){result={ok:true,prepared:false,alreadyIndexed:true};return;}
   if(!isNativePartitioned(payload))throw Error('native-index-migration-requires-partitioned-root');
   const encoded=JSON.stringify(payload),prior=preparedBuilds.get(owner);
   if(prior?.encoded===encoded){result={ok:true,prepared:false};return;}
   candidate={encoded,built:buildFor(payload,normalized)};fence();result={ok:true,prepared:true};
  }catch(error){abort(error.message);}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',onRevoke);try{fence();if(candidate)preparedBuilds.set(owner,candidate);resolve(result);}catch(error){resolve({ok:false,reason:error.message});}};
  tx.onabort=()=>{signal?.removeEventListener('abort',onRevoke);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'native-index-preparation-aborted'});};tx.onerror=()=>{};
 });
}
/** Explicit owner migration only. No observation grant or external native action. */
export async function migrateNativeVersionIndex(owner,scope,{operationId,expectedRevision},{guard=()=>true,signal=null}={}){
 const normalized=owner.base.scopeOrThrow(scope);id(operationId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('invalid-revision');
 const fence=()=>{if(signal?.aborted||guard()!==true)throw Error('stale-binding');},fingerprint=digest({kind:'MIGRATE_NATIVE_VERSION_INDEX',expectedRevision}),db=await owner.base.open();fence();
 return new Promise(resolve=>{
  const tx=db.transaction(['native_states','native_operations'],'readwrite'),store=tx.objectStore('native_states'),ops=tx.objectStore('native_operations'),operationKey=JSON.stringify([normalized.key,operationId]);let result,consumedBuild;
  const abort=reason=>{result={ok:false,reason};try{tx.abort();}catch{}},onRevoke=()=>abort('stale-binding');signal?.addEventListener('abort',onRevoke,{once:true});
  const root=store.get(normalized.key),marker=ops.get(normalized.key),checkpoint=store.get(nativeCheckpointKey(normalized.key)),receipt=ops.get(operationKey);
  receipt.onsuccess=()=>{try{
   fence();const payload=root.result?owner.verifiedRoot(root.result,normalized):null;
   if(!payload)throw Error('missing-native-root');verifyNativeLifecycleMarker(nativeUnpack(marker.result),payload,root.result.checksum);if(nativeUnpack(marker.result).revision!==payload.revision)throw Error('native-root-revision-conflict');
   if(receipt.result){const prior=nativeUnpack(receipt.result);result=prior.kind==='MIGRATE_NATIVE_VERSION_INDEX'&&prior.fingerprint===fingerprint?{ok:true,replayed:true,revision:prior.revision,operationId}:{ok:false,reason:'operation-replay-conflict'};return;}
   if(payload.revision!==expectedRevision)throw Error('revision-conflict');
   if(isNativeVersionIndexed(payload)){result={ok:true,alreadyIndexed:true,revision:payload.revision,operationId};return;}
   if(!isNativePartitioned(payload))throw Error('native-index-migration-requires-partitioned-root');
   auditNativePartitions(store,payload,normalized,fence,()=>{try{
    // Structural migration changes no native piece versions. Record that fact
    // so the next write need not reconcile every unchanged legacy ID.
    fence();const prepared=preparedBuilds.get(owner),built=prepared?.encoded===JSON.stringify(payload)?prepared.built:buildFor(payload,normalized);
    if(built===prepared?.built)consumedBuild=prepared;
    for(const record of built.records){fence();store.put(record);}
    const rootRecord=nativeRecord(normalized.key,built.root);
    // Retire only native versions referenced by the superseded old checkpoint.
    // Its corrupt bytes must never authorize deletion; retain them for diagnosis.
    let old=null;try{if(checkpoint.result?.key===nativeCheckpointKey(normalized.key))old=owner.verifiedRoot({...checkpoint.result,key:normalized.key},normalized);}catch{}
    if(isNativePartitioned(old))for(const kind of nativeKinds(old))for(const [key,version] of Object.entries(old[kind]))if(version!==payload[kind][key]){fence();store.delete(nativePartitionKey(normalized.key,kind,key,version));}
    store.put({...root.result,key:nativeCheckpointKey(normalized.key)});store.put(rootRecord);store.put({...rootRecord,key:nativeRecoveryKey(normalized.key)});
    ops.put(nativeRecord(normalized.key,{...nativeUnpack(marker.result),revision:built.root.revision,...nativeLifecycleMarker(built.root,rootRecord.checksum)}));ops.put(nativeRecord(operationKey,{kind:'MIGRATE_NATIVE_VERSION_INDEX',fingerprint,revision:built.root.revision,operationId}));fence();result={ok:true,revision:built.root.revision,operationId};
   }catch(error){abort(error.message);}},error=>abort(error.message));
  }catch(error){abort(error.message);}};
  tx.oncomplete=()=>{signal?.removeEventListener('abort',onRevoke);if(consumedBuild&&preparedBuilds.get(owner)===consumedBuild)preparedBuilds.delete(owner);try{fence();resolve(result);}catch{resolve({ok:false,reason:'stale-after-commit',committed:true});}};
  tx.onabort=()=>{signal?.removeEventListener('abort',onRevoke);resolve(result?.ok===false?result:{ok:false,reason:tx.error?.name??'native-index-migration-aborted'});};tx.onerror=()=>{};
 });
}
