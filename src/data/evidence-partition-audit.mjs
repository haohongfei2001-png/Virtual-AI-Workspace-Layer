import {prefetchExactAuditRecords} from './audit-record-prefetch.mjs';
import {evidenceHeader,loadEvidencePieces,validateEvidenceManifest,indexGroup,evidencePieceKey} from './free-evidence-partitions.mjs';
import {digest} from './hash.mjs';

/** Complete atomic migration audit, retaining one payload batch and global IDs.
 * Schedule each next batch synchronously while the owner's IDB transaction is
 * live. A batch pass does not certify global counts, uniqueness or total size.
 */
export function auditEvidencePartitions(store,manifest,scope,fence,done,fail,indexes=null){
 const tables=['events','hints','coverage'],seen=Object.fromEntries(tables.map(t=>[t,new Set()])),hintEvents=new Set();
 let refs=[],offset=0,size=0,failed=false,finished=false;
 const matched=new Map();
 const match=(table,key,ref)=>{
  if(!indexes)return;
  const group=indexGroup(table,key);
  if(!Object.hasOwn(indexes[group]??{},key)||indexes[group][key]!==ref)throw Error('free-evidence-index-content-mismatch');
  matched.set(group,(matched.get(group)??0)+1);
 };
 const reject=error=>{if(!failed&&!finished){failed=true;fail(error);}};
 const next=()=>{
  if(failed||finished)return;
  try{
   fence();
   if(offset===refs.length){
    const counts=Object.fromEntries(tables.map(t=>[t,seen[t].size]));
    if(tables.some(t=>counts[t]!==manifest.counts[t]))throw Error('free-evidence-count-mismatch');
    if(indexes&&Object.entries(indexes).some(([group,rows])=>Object.keys(rows).length!==(matched.get(group)??0)))throw Error('free-evidence-index-content-mismatch');
    done({evidenceJSONLength:size,refCount:refs.length,counts});finished=true;return;
   }
   const ids=refs.slice(offset,offset+5000);offset+=ids.length;
   prefetchExactAuditRecords(store,ids.map(ref=>evidencePieceKey(scope.key,ref,manifest.refVersions[ref])),fence,prefetched=>{
   loadEvidencePieces(store,manifest,scope,ids,evidence=>{
    if(failed||finished)return;
    try{
     fence();
     for(const table of tables)for(const [key,row] of Object.entries(evidence[table])){
      if(seen[table].has(key))throw Error('invalid-free-evidence-piece-index');
      size+=JSON.stringify(key).length+1+JSON.stringify(row).length+(seen[table].size?1:0);
      seen[table].add(key);
      if(seen[table].size>100000)throw Error('free-evidence-capacity');
      if(size>128*1024*1024)throw Error('free-evidence-too-large');
      match(table,key,row.conversationId);
      if(table==='hints'){
       const event=JSON.stringify([row.sourceId,row.eventKey]);
       if(hintEvents.has(event))throw Error('duplicate-free-hint-event');
       hintEvents.add(event);
       match('hintEvents',digest([row.sourceId,row.eventKey]),row.conversationId);
      }
     }
     next();
    }catch(error){reject(error);}
   },reject,null,prefetched);
   },reject);
  }catch(error){reject(error);}
 };
 try{fence();validateEvidenceManifest(manifest,scope);refs=Object.keys(manifest.refVersions);size=JSON.stringify(evidenceHeader(manifest,scope)).length;next();}catch(error){reject(error);}
}
