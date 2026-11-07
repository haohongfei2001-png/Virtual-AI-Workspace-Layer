import * as nativeIndex from './native-version-index.mjs';
const {validateNativeIndexRoot,verifyNativeIndexPiece,materializeNativeVersionIndex,nativeIndexKey}=nativeIndex;
import {NATIVE_PARTITION_FORMAT} from './native-partitions.mjs';

/** Select one page from this transaction's complete, freshly verified inventory.
 * No record, ID inventory, permission or validation result survives this call.
 * Every bucket and every global ordinal is checked, including outside the page.
 */
export function selectNativeIndexPage(root,scope,records,{offset=0,limit=500}={}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('invalid-native-page');
 records=[...records];
 const legacy=()=>{const manifest=materializeNativeVersionIndex(root,scope,records),projects=Object.keys(manifest.projects),refs=Object.keys(manifest.refs);return {projects:projects.slice(offset,offset+limit),refs:refs.slice(Math.max(0,offset-projects.length),Math.max(0,offset+limit-projects.length))};};
 // Ordinary input keeps the exact old validator, including getters/prototypes.
 // The optional query also keeps this standalone helper safe before integration.
 if(!nativeIndex.hasNativeIndexSnapshotProof?.(root,records))return legacy();
 validateNativeIndexRoot(root,scope);
 const byKey=new Map();for(const record of records){if(byKey.has(record.key))throw Error('duplicate-native-index-record');byKey.set(record.key,record);}
 const selected={projects:[],refs:[]};let expected=0,preceding=0,integerKey=false;
 // The full legacy manifest's exact JSON length, without allocating both maps.
 // Verified IDs contain only ASCII A-Z/a-z/0-9/_/-; versions are safe integers.
 let units=JSON.stringify({...root,format:NATIVE_PARTITION_FORMAT,projects:{},refs:{}}).length;
 for(const kind of ['projects','refs']){
  const buckets=Object.keys(root[kind]),count=buckets.reduce((sum,bucket)=>sum+root[kind][bucket].count,0);
  const first=Math.min(count,Math.max(0,offset-preceding)),last=Math.min(count,Math.max(0,offset+limit-preceding));
  const seen=new Uint8Array(count),keys=new Array(last-first);let orderError=false;
  for(const bucket of buckets){
   expected++;const pointer=root[kind][bucket],physicalKey=nativeIndexKey(root.scopeKey,kind,bucket,pointer.revision);
   const piece=verifyNativeIndexPiece(byKey.get(physicalKey),root,kind,bucket),names=Object.keys(piece.versions);
   for(let i=0;i<names.length;i++){
    const key=names[i],ordinal=piece.ordinals[i];
    if(ordinal>=count||seen[ordinal]){orderError=true;continue;}
    seen[ordinal]=1;if(ordinal>=first&&ordinal<last)keys[ordinal-first]=key;
    units+=key.length+String(piece.versions[key]).length+4;
    if(/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<4294967295)integerKey=true;
   }
  }
  if(orderError||seen.some(value=>value===0))throw Error('invalid-native-index-order');
  if(count)units--;selected[kind]=keys;preceding+=count;
 }
 if(byKey.size!==expected)throw Error('unexpected-native-index-record');
 if(units>16*1024*1024)throw Error('native-manifest-too-large');
 // Object.keys has a distinct integer-index ordering. Preserve the existing
 // materializer for that uncommon legacy shape rather than changing its order.
 if(integerKey)return legacy();
 return selected;
}
