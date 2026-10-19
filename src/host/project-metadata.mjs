import {exactHostRecord} from './contract.mjs';
import {createURLPolicy} from './url-policy.mjs';

// Public-source templates awaiting an authorized current-host sample. These
// functions never fetch, manufacture a DOM locator, or produce an ingest proposal.
const limits=Object.freeze({inputBytes:1024*1024,rows:256,rowBytes:49152,cursor:2048});
const encoder=new TextEncoder(),record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const policy=createURLPolicy({profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}});
const own=(value,key)=>record(value)&&Object.hasOwn(value,key)?value[key]:undefined;
const validId=(value,entity)=>{
 if(typeof value!=='string')return false;
 const parsed=policy.parse(entity==='project'?'/g/'+value+'/project':'/c/'+value);
 return parsed.kind===entity&&(parsed.projectId??parsed.conversationId)===value;
};
const cursorOK=(value,numeric)=>value===null||typeof value==='string'&&value.length>0&&value.length<=limits.cursor&&!/[\u0000-\u001f\u007f]/.test(value)||numeric&&Number.isSafeInteger(value)&&value>=0;

export const parseProjectSidebarMetadata=input=>parse(input,'sidebar');
export const parseProjectDetailMetadata=input=>parse(input,'detail');
export const parseProjectConversationListMetadata=input=>parse(input,'conversations');

function parse(input,kind){
 const keys=kind==='sidebar'?['payload','previousCursor']:kind==='detail'?['payload','projectId']:['payload','projectId','previousCursor'];
 if(!exactHostRecord(input,keys)||kind!=='sidebar'&&!validId(input.projectId,'project')||kind!=='detail'&&!cursorOK(input.previousCursor,kind==='sidebar'||input.previousCursor===0))throw Error('invalid-project-metadata-input');
 if(typeof input.payload!=='string')throw Error('invalid-project-json');
 const gaps=new Set(),rows=new Map(),conflicts=new Set();let bytes=0;
 const page=kind==='detail'?null:{previousCursor:input.previousCursor,nextCursor:null,terminalObserved:false,upstreamSnapshotRevision:null};
 const result=()=>({protocol:'vaiwl-project-metadata-candidate/1',template:kind,state:gaps.size?'partial':'candidate',candidates:[...rows.values()],coverage:'observed-only',page,gaps:[...gaps].map(reason=>({reason}))});
 if(input.payload.length>limits.inputBytes||encoder.encode(input.payload).length>limits.inputBytes){gaps.add('byte-limit');return result();}
 let value;try{value=JSON.parse(input.payload);}catch{throw Error('invalid-project-json');}
 if(!record(value))throw Error('invalid-project-json');
 function discard(entity,id,reason){
  gaps.add(reason);if(!validId(id,entity))return;
  const key=entity+':'+id,prior=rows.get(key);if(prior){rows.delete(key);bytes-=encoder.encode(JSON.stringify(prior)).length;}conflicts.add(key);
 }
 function add(entity,id,name){
  if(!validId(id,entity)){gaps.add('invalid-native-id');return;}
  const titleState=typeof name!=='string'||!name.trim()?'unavailable':name.length>200?'over-limit':'exact';
  if(titleState!=='exact')gaps.add(titleState==='over-limit'?'title-over-limit':'title-unavailable');
  const row={entity,nativeId:id,nativeTitle:titleState==='exact'?name:null,titleState},key=entity+':'+id;
  if(conflicts.has(key))return;
  const prior=rows.get(key),encoded=JSON.stringify(row),size=encoder.encode(encoded).length;
  if(prior){if(JSON.stringify(prior)!==encoded)discard(entity,id,'native-title-conflict');return;}
  if(bytes+size>limits.rowBytes){gaps.add('candidate-byte-limit');return;}
  rows.set(key,row);bytes+=size;
 }
 function project(gizmo,expectedId=null){
  if(!record(gizmo)){gaps.add('invalid-project-record');return;}
  const id=own(gizmo,'id');
  if(expectedId!==null&&id!==expectedId){gaps.add('project-identity-conflict');return;}
  // A generic gizmo, absent type or Custom GPT is not a confirmed Project.
  if(own(gizmo,'gizmo_type')!=='snorlax'){discard('project',id,'unsupported-project-type');return;}
  add('project',id,own(own(gizmo,'display'),'name'));
 }
 if(kind==='detail'){project(own(value,'gizmo'),input.projectId);return result();}
 const items=own(value,'items');if(!Array.isArray(items))throw Error('invalid-project-items');
 if(items.length>limits.rows)gaps.add('item-limit');
 for(let i=0;i<Math.min(items.length,limits.rows);i++){
  const item=items[i];if(!record(item)){gaps.add('invalid-item');continue;}
  if(kind==='sidebar'){project(own(own(item,'gizmo'),'gizmo'));continue;}
  const claimedProject=own(item,'gizmo_id');
  if(claimedProject!==undefined&&claimedProject!==null&&claimedProject!==input.projectId){discard('conversation',own(item,'id'),'conversation-project-conflict');continue;}
  // Even a matching gizmo_id remains unverified. Emit no PROJECT/NONE claim,
  // timestamp, author, preview, navigation plan or account metadata.
  add('conversation',own(item,'id'),own(item,'title'));
 }
 const cursor=own(value,'cursor');
 if(cursor===undefined)gaps.add('missing-cursor');
 else if(!cursorOK(cursor,kind==='sidebar'))gaps.add('invalid-cursor');
 else if(cursor!==null&&cursor===input.previousCursor)gaps.add('repeated-cursor');
 else{page.nextCursor=cursor;page.terminalObserved=cursor===null;}
 // This one page never proves complete inventory, absence, membership or a
 // cross-page snapshot. Its caller still owns document/scope/response freshness.
 return result();
}
