import {prefetchExactAuditRecords} from './audit-record-prefetch.mjs';
import {exact} from './state.mjs';
import {manifest_PAGE_SIZE,manifest_partitionUnpack,manifest_partitionKey} from './partition-manifest.mjs';
/** Complete checkpoint/migration audit, never a daily inventory shortcut. */
export function auditSharedPartitions(owner,tx,manifest,fence,done,fail){
 const refs=Object.keys(manifest.refVersions),seen=new Set(),store=tx.objectStore('b23_states');let units=0,offset=0,failed=false;
 const reject=e=>{if(!failed){failed=true;fail(e);}};
 const next=()=>{if(failed)return;try{
  fence();if(offset===refs.length){if(units!==manifest.units)throw Error('shared-partition-units-mismatch');done();return;}
  const selected=refs.slice(offset,offset+manifest_PAGE_SIZE);offset+=selected.length;
  prefetchExactAuditRecords(store,selected.map(id=>manifest_partitionKey(manifest.scopeKey,id,manifest.refVersions[id],manifest.generation)),fence,prefetched=>{
  owner.partitioned.loadPieces(tx,manifest,selected,(pieces,measuredUnits)=>{if(failed)return;try{
   fence();if(!Number.isSafeInteger(measuredUnits)||measuredUnits<0)throw Error('invalid-shared-audit-size');units+=measuredUnits;const locators=[];for(const piece of pieces.values()){
    for(const table of ['events','coverage'])for(const event of piece[table]){
     const unique=JSON.stringify([table,event.id]);if(seen.has(unique))throw Error('duplicate-shared-evidence-id');seen.add(unique);locators.push({table,id:event.id,refId:piece.refId});
    }
   }
   let pending=locators.length;if(!pending){next();return;}
   for(const expected of locators){const key=JSON.stringify([manifest.scopeKey,'evidence-ref',expected.table,expected.id]),q=store.get(key);q.onsuccess=()=>{if(failed)return;try{
    fence();if(q.result?.key!==key)throw Error('invalid-evidence-locator');const p=manifest_partitionUnpack(q.result);exact(p,['scopeKey','table','id','refId']);if(p.scopeKey!==manifest.scopeKey||p.table!==expected.table||p.id!==expected.id||p.refId!==expected.refId)throw Error('invalid-evidence-locator');if(!--pending)next();
   }catch(e){reject(e);}};}
  }catch(e){reject(e);}},reject,true,prefetched);
  },reject);
 }catch(e){reject(e);}};next();
}
