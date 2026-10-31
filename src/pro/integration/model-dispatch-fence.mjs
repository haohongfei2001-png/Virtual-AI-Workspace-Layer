import {digest,stable} from '../../data/hash.mjs';
import {checkActivityVersionFence} from '../../data/activity-version-fence.mjs';
import {validateVersions} from '../domain/index.mjs';
import {proRootKey,unpackProRecord,validateProRoot,PRO_RECOVERED_READER} from './storage-registry.mjs';
import {readProRecoveryWriteFence} from './storage-recovery.mjs';

/** Paid dispatch is admitted in the SAME DB4 transaction as its reservation
 * transition. A source or human edit during earlier asynchronous model setup
 * cannot authorize sending a retired snapshot. No new database/store/grant. */
export function productionModelDispatchFence(session) {
  return (tx,scope,checkpoint,check,ready,fail)=>{
    try {
      const v=checkpoint.inputVersions;validateVersions(v);
      if(scope.key!==session.context.scope.key||v.scopeKey!==scope.key||!session.live()||
          !session.dispatchCurrent?.()||stable(v)!==stable(session.dispatchVersions))throw Error('stale-model-input');
      const current=()=>check()&&session.live()&&session.dispatchCurrent();
      checkActivityVersionFence(tx,session.context.scope,{nativeRevision:v.nativeFields.nativeRoot,evidenceRevision:v.nativeFields.evidenceRoot},current,()=>{
        const key=proRootKey(scope.key),queries=[tx.objectStore('b23_states').get(scope.key),tx.objectStore('b23_states').get(key),tx.objectStore('b23_checkpoints').get(key)];let pending=queries.length;
        for(const q of queries)q.onsuccess=()=>{if(--pending)return;try{
          if(!current())throw Error('model-authority-expired');
          const shared=queries[0].result,overlay=queries[1].result;
          if(shared&&(shared.key!==scope.key||shared.checksum!==digest(shared.payload)))throw Error('pro-shared-root-corrupt');
          if((shared?.payload?.revision??0)!==v.nativeFields.workspaceRoot)throw Error('pro-shared-root-changed');
          if(!overlay&&queries[2].result)throw Error('pro-missing-root-with-history');
          const proRoot=overlay?validateProRoot(unpackProRecord(overlay,key),scope.key):null,revision=proRoot?.state.revision??0;
          if(revision!==v.overlayRevision||revision!==v.constraintRevision)throw Error('stale-model-input');
          const dispatch=()=>{if(current())ready();else fail('model-authority-expired');};
          if(proRoot?.minimumReader===PRO_RECOVERED_READER)readProRecoveryWriteFence(tx,scope.key,proRoot,current,dispatch,fail);else dispatch();
        }catch(e){fail(e.message);}};
      },fail);
    }catch(e){fail(e.message);}
  };
}
