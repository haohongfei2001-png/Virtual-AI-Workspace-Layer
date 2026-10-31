import {exactHostRecord} from './contract.mjs';
import {METADATA_LIMITS as limits,metadataRecord as record,metadataOwn as own,nativeMetadataIdOK as validId,metadataCursorOK as cursorOK,createMetadataCandidates} from './metadata-candidates.mjs';

// Public-source templates awaiting an authorized current-host sample. These
// functions never fetch, manufacture a DOM locator, or produce an ingest proposal.
const encoder=new TextEncoder();

export const parseProjectSidebarMetadata=input=>parse(input,'sidebar');
export const parseProjectDetailMetadata=input=>parse(input,'detail');
export const parseProjectConversationListMetadata=input=>parse(input,'conversations');

function parse(input,kind){
 const keys=kind==='sidebar'?['payload','previousCursor']:kind==='detail'?['payload','projectId']:['payload','projectId','previousCursor'];
 if(!exactHostRecord(input,keys)||kind!=='sidebar'&&!validId(input.projectId,'project')||kind!=='detail'&&!cursorOK(input.previousCursor,kind==='sidebar'||input.previousCursor===0))throw Error('invalid-project-metadata-input');
 if(typeof input.payload!=='string')throw Error('invalid-project-json');
 const gaps=new Set(),rows=createMetadataCandidates(gaps),{add,discard}=rows;
 const domain=kind==='sidebar'?{kind:'projects-index',filter:'sidebar',sort:'unspecified'}:kind==='conversations'?{kind:'project-members',projectId:input.projectId,filter:'unspecified',sort:'unspecified'}:null;
 const page=kind==='detail'?null:{previousCursor:input.previousCursor,nextCursor:null,terminalObserved:false,upstreamSnapshotRevision:null};
 const result=()=>({protocol:'vaiwl-project-metadata-candidate/1',template:kind,state:gaps.size?'partial':'candidate',candidates:rows.values(),coverage:'observed-only',domain,page,gaps:[...gaps].map(reason=>({reason}))});
 if(input.payload.length>limits.inputBytes||encoder.encode(input.payload).length>limits.inputBytes){gaps.add('byte-limit');return result();}
 let value;try{value=JSON.parse(input.payload);}catch{throw Error('invalid-project-json');}
 if(!record(value))throw Error('invalid-project-json');
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
