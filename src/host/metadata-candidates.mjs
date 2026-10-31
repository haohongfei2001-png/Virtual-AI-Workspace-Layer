import {createURLPolicy} from './url-policy.mjs';

export const METADATA_LIMITS=Object.freeze({inputBytes:1024*1024,rows:256,rowBytes:49152,cursor:2048});
export const metadataRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const metadataOwn=(value,key)=>metadataRecord(value)&&Object.hasOwn(value,key)?value[key]:undefined;
const encoder=new TextEncoder();
const policy=createURLPolicy({profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
export function nativeMetadataIdOK(value,entity){
 if(typeof value!=='string')return false;
 const parsed=policy.parse(entity==='project'?'/g/'+value+'/project':'/c/'+value);
 return parsed.kind===entity&&(parsed.projectId??parsed.conversationId)===value;
}
export const metadataCursorOK=(value,numeric=false)=>value===null||typeof value==='string'&&value.length>0&&value.length<=METADATA_LIMITS.cursor&&!/[\u0000-\u001f\u007f]/.test(value)||numeric&&Number.isSafeInteger(value)&&value>=0;

// Shared by raw-JSON metadata parsers only. These rows carry no authority,
// membership, timestamps or evidence. Conflicting duplicates stay excluded.
export function createMetadataCandidates(gaps){
 const rows=new Map(),conflicts=new Set();let bytes=0;
 function discard(entity,id,reason){
  gaps.add(reason);if(!nativeMetadataIdOK(id,entity))return;
  const key=entity+':'+id,prior=rows.get(key);
  if(prior){rows.delete(key);bytes-=encoder.encode(JSON.stringify(prior)).length;}conflicts.add(key);
 }
 function add(entity,id,name){
  if(!nativeMetadataIdOK(id,entity)){gaps.add('invalid-native-id');return;}
  const titleState=typeof name!=='string'||!name.trim()?'unavailable':name.length>200?'over-limit':'exact';
  if(titleState!=='exact')gaps.add(titleState==='over-limit'?'title-over-limit':'title-unavailable');
  const row={entity,nativeId:id,nativeTitle:titleState==='exact'?name:null,titleState},key=entity+':'+id;
  if(conflicts.has(key))return;
  const prior=rows.get(key),encoded=JSON.stringify(row),size=encoder.encode(encoded).length;
  if(prior){if(JSON.stringify(prior)!==encoded)discard(entity,id,'native-title-conflict');return;}
  if(bytes+size>METADATA_LIMITS.rowBytes){gaps.add('candidate-byte-limit');return;}
  rows.set(key,row);bytes+=size;
 }
 return {add,discard,values:()=>[...rows.values()]};
}
