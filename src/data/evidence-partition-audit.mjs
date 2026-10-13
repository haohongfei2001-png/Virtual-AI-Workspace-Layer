import {evidenceHeader,loadEvidencePieces,validateEvidenceManifest} from './free-evidence-partitions.mjs';

/** Complete atomic migration audit, retaining one payload batch and global IDs.
 * Schedule each next batch synchronously while the owner's IDB transaction is
 * live. A batch pass does not certify global counts, uniqueness or total size.
 */
export function auditEvidencePartitions(store,manifest,scope,fence,done,fail){
 const tables=['events','hints','coverage'],seen=Object.fromEntries(tables.map(t=>[t,new Set()])),hintEvents=new Set();
 let refs=[],offset=0,size=0,failed=false,finished=false;
 const reject=error=>{if(!failed&&!finished){failed=true;fail(error);}};
 const next=()=>{
  if(failed||finished)return;
  try{
   fence();
   if(offset===refs.length){
    const counts=Object.fromEntries(tables.map(t=>[t,seen[t].size]));
    if(tables.some(t=>counts[t]!==manifest.counts[t]))throw Error('free-evidence-count-mismatch');
    done({evidenceJSONLength:size,refCount:refs.length,counts});finished=true;return;
   }
   const ids=refs.slice(offset,offset+5000);offset+=ids.length;
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
      if(table==='hints'){
       const event=JSON.stringify([row.sourceId,row.eventKey]);
       if(hintEvents.has(event))throw Error('duplicate-free-hint-event');
       hintEvents.add(event);
      }
     }
     next();
    }catch(error){reject(error);}
   },reject);
  }catch(error){reject(error);}
 };
 try{fence();validateEvidenceManifest(manifest,scope);refs=Object.keys(manifest.refVersions);size=JSON.stringify(evidenceHeader(manifest,scope)).length;next();}catch(error){reject(error);}
}
