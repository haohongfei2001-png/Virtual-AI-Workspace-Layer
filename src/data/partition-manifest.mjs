import {finish,finishAsync} from './cooperate.mjs';
import {validateState,id,exact} from './state.mjs';
import {validatePreference} from './preferences.mjs';
import {stable,digest,sha256} from './hash.mjs';
export const manifest_PARTITION_FORMAT='vaiwl-partitioned-v1';
export const manifest_PAGE_SIZE=5000;
const MAX_REFS=100000,MAX_UNITS=128*1024*1024;
export const manifest_partitionKey=(scope,refId,revision,generation)=>JSON.stringify([scope,'ref-partition',generation,refId,revision]);
export const manifest_partitionRecord=(key,payload)=>({key,payload,checksum:digest(payload)});
export function manifest_partitionUnpack(row){if(!row||digest(row.payload)!==row.checksum)throw Error('corrupt-record');return row.payload;}
/** Same fresh checksum verification, with the canonical length from this read.
 * No supplied size or retained validation certificate is accepted. */
export function manifest_partitionUnpackMeasured(row){
 if(!row)throw Error('corrupt-record');
 const encoded=stable(row.payload);if(sha256(encoded)!==row.checksum)throw Error('corrupt-record');
 return {payload:row.payload,units:encoded.length};
}
export const manifest_isPartitioned=p=>p?.format===manifest_PARTITION_FORMAT;
export function manifest_headerState(m,preferences=m.preferences){return {schema:2,scopeKey:m.scopeKey,revision:m.revision,channel:m.channel,refs:{},events:{},coverage:{},identities:{},placements:{},sources:m.sources,workspaces:m.workspaces,preferences};}
function* manifestStructureChecks(m,scopeKey){let checked=0;
 exact(m,['format','generation','scopeKey','revision','channel','sources','workspaces','preferences','refVersions','humanRefs','units','changes']);
 if(m.format!==manifest_PARTITION_FORMAT||m.scopeKey!==scopeKey||!Number.isSafeInteger(m.units)||m.units<0||m.units>MAX_UNITS||!Array.isArray(m.changes)||m.changes.length>64)throw Error('invalid-partition-manifest');
 id(m.generation);const keys=Object.keys(m.refVersions);if(!Array.isArray(m.humanRefs)||m.humanRefs.length>MAX_REFS)throw Error('invalid-human-ref-index');const humans=new Set();for(const k of m.humanRefs){if(humans.has(k)||!Object.hasOwn(m.refVersions,k))throw Error('invalid-human-ref-index');humans.add(k);if(++checked%512===0)yield;}if(keys.length>MAX_REFS)throw Error('partition-capacity');
 for(const k of keys){id(k);const v=m.refVersions[k];if(!Number.isSafeInteger(v)||v<1||v>m.revision)throw Error('invalid-partition-version');if(++checked%512===0)yield;}
 validateState(manifest_headerState(m,{}),scopeKey);
 for(const [key,p] of Object.entries(m.preferences)){id(key);if(p?.id!==key)throw Error('invalid-state-row');validatePreference(p,{refs:m.refVersions},{exact,id,text:(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('invalid-text');}});}
 for(const c of m.changes){exact(c,['revision','refs']);if(!Number.isSafeInteger(c.revision)||c.revision<1||c.revision>m.revision||!Array.isArray(c.refs)||c.refs.length>20000)throw Error('invalid-partition-changes');for(const key of c.refs){id(key);if(++checked%512===0)yield;}}
 return m;
}
function* manifestChecks(m,scopeKey){yield* manifestStructureChecks(m,scopeKey);yield* manifestSize(m);return m;}
/** Count the SAME deterministic JSON code units without allocating a giant
 * sorted intermediate string on the renderer. Key order does not change length.
 */
function* manifestSize(value,capture=false){let units=0,visits=0;const stack=[{value}],active=new Set(),chunks=capture?[]:null;
 while(stack.length){const frame=stack.at(-1);
  if(frame.keys){
   if(frame.index>=frame.keys.length){if(capture)chunks.push(frame.array?']':'}');active.delete(frame.value);stack.pop();continue;}
   const index=frame.index++,key=frame.keys[index];if(capture&&index)chunks.push(',');
   if(!frame.array){const encodedKey=JSON.stringify(key)+':';units+=encodedKey.length;if(capture)chunks.push(encodedKey);}
   if(frame.array&&!Object.hasOwn(frame.value,key))continue;
   stack.push({value:frame.value[key]});
  }else{
   const v=frame.value;if(['function','symbol','bigint','undefined'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))throw Error('non-json-value');
   if(v&&typeof v==='object'){
    const array=Array.isArray(v);if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('non-json-object');
    if(active.has(v))throw Error('non-json-value');active.add(v);
    const keys=array?Array.from({length:v.length},(_,i)=>i):Object.keys(v);if(capture&&!array)keys.sort();
    units+=2+Math.max(0,keys.length-1);if(capture)chunks.push(array?'[':'{');Object.assign(frame,{keys,index:0,array});
   }else{const encoded=JSON.stringify(v);units+=encoded.length;if(capture)chunks.push(encoded);stack.pop();}
  }
  if(units>16*1024*1024)throw Error('state-too-large');if(++visits%512===0)yield;
 }
 return capture?chunks.join(''):units;
}
// Internal write path: preserve full structure and bounded JSON checks while using
// the same canonical encoding for the record limit and checksum.
export function manifest_manifestRecord(key,payload){
 finish(manifestStructureChecks(payload,key));const encoded=finish(manifestSize(payload,true));
 return {key,payload,checksum:sha256(encoded)};
}
export function manifest_checkManifest(m,scopeKey){return finish(manifestChecks(m,scopeKey));}
export async function manifest_checkManifestAsync(m,scopeKey,guard){return finishAsync(manifestChecks(m,scopeKey),guard);}
