import {exactHostRecord} from './contract.mjs';
import {digest} from '../data/hash.mjs';
import {METADATA_LIMITS as limits,metadataRecord as record,metadataOwn as own,nativeMetadataIdOK as idOK,metadataCursorOK as cursorOK,createMetadataCandidates} from './metadata-candidates.mjs';

const encoder=new TextEncoder(),integer=n=>Number.isSafeInteger(n)&&n>=0;
const sourceVersion='vaiwl-server-directory-candidate/1';
const summaryKeys=['domainKey','pageOrdinal','mode','nextOffset','nextCursor','total','loadedIds','pageDigest','gapped'];
const domainKeys=new Set(['unspecified','true'].flatMap(archived=>['unspecified','true','false'].flatMap(starred=>['unspecified','updated'].map(sort=>`is_archived=${archived};is_starred=${starred}|${sort}`))));
const hashOK=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function summaryOK(s){
 if(!exactHostRecord(s,summaryKeys)||!domainKeys.has(s.domainKey)||!integer(s.pageOrdinal)||!['offset','cursor'].includes(s.mode)||s.nextOffset!==null&&!integer(s.nextOffset)||!cursorOK(s.nextCursor)||s.total!==null&&!integer(s.total)||typeof s.gapped!=='boolean'||!hashOK(s.pageDigest))return false;
 const ids=s.loadedIds;
 if(!Array.isArray(ids)||Object.getPrototypeOf(ids)!==Array.prototype||ids.length>limits.rows||Reflect.ownKeys(ids).length!==ids.length+1)return false;
 for(let i=0;i<ids.length;i++){const d=Object.getOwnPropertyDescriptor(ids,String(i));if(!d||!Object.hasOwn(d,'value')||!idOK(d.value,'conversation'))return false;}
 return new Set(ids).size===ids.length;
}
function field(root,key,valid){
 if(!Object.hasOwn(root,key))return {state:'missing'};
 const value=root[key];
 return value===null?{state:'null'}:valid(value)?{state:'value',value}:{state:'invalid'};
}

// Public templates only: exporter 8404ad9c6fbee732b2c37759550fd3f02d1543f7
// supplies offset/limit/total; the adopted PR16 decision supplies the archived
// filter candidate. Neither establishes host support, freshness or completeness.
export const parseConversationDirectoryMetadata=input=>parse(input,false);
export const parseArchivedConversationDirectoryMetadata=input=>parse(input,true);

/**
 * Pure page reduction, never a fetcher or a scan. request describes a candidate
 * request, not a verified server filter. priorPage accepts only the preceding
 * result's bounded summary; longer cursor cycles remain the future owner's job.
 * stopReason is null, budget, deadline or cancelled. No continuation is issued
 * after a gap. Raw field states remain available even when a page is unusable.
 */
function parse(input,archived){
 if(!exactHostRecord(input,['payload','request','pageOrdinal','priorPage','stopReason']))throw Error('invalid-directory-input');
 const r=input.request;
 if(!exactHostRecord(r,['offset','limit','cursor','sort','starred'])||!integer(input.pageOrdinal)||!integer(r.limit)||r.limit<1||r.limit>limits.rows||!cursorOK(r.cursor)||r.offset!==null&&(!integer(r.offset)||r.cursor!==null)||!['unspecified','updated'].includes(r.sort)||!['unspecified',true,false].includes(r.starred)||![null,'budget','deadline','cancelled'].includes(input.stopReason)||input.priorPage!==null&&!summaryOK(input.priorPage))throw Error('invalid-directory-input');
 if(typeof input.payload!=='string')throw Error('invalid-directory-json');
 const mode=r.offset===null?'cursor':'offset';
 const domain={kind:'recent-list',filter:`is_archived=${archived?'true':'unspecified'};is_starred=${r.starred}`,sort:r.sort};
 const domainKey=domain.filter+'|'+domain.sort,gaps=new Set(),rows=createMetadataCandidates(gaps);
 const page={pageOrdinal:input.pageOrdinal,mode,previousCursor:r.cursor,nextCursor:null,nextOffset:null,returnedCount:0,terminalObserved:false,termination:'unknown',upstreamSnapshotRevision:null,fields:null,stopReason:input.stopReason};
 let pageDigest=digest([]),total=null;
 if(input.stopReason!==null)gaps.add('stopped-'+input.stopReason);
 const result=()=>{
  const candidates=rows.values();
  const envelope=()=>({protocol:'vaiwl-conversation-directory-candidate/1',sourceVersion,state:gaps.size?'partial':'candidate',domain,candidates,coverage:'observed-only',page,gaps:[...gaps].map(reason=>({reason})),
   summary:{domainKey,pageOrdinal:input.pageOrdinal,mode,nextOffset:page.nextOffset,nextCursor:page.nextCursor,total,loadedIds:candidates.map(row=>row.nativeId),pageDigest,gapped:gaps.size>0}});
  let output=envelope();
  // Row bounds alone do not bound the envelope: opaque multibyte cursors and
  // the preceding-page summary also count. Trimming is explicit and fail-closed.
  while(encoder.encode(JSON.stringify(output)).length>65536&&candidates.length){
   candidates.pop();gaps.add('output-byte-limit');page.terminalObserved=false;page.nextOffset=null;page.nextCursor=null;output=envelope();
  }
  return output;
 };
 if(input.payload.length>limits.inputBytes||encoder.encode(input.payload).length>limits.inputBytes){gaps.add('byte-limit');return result();}
 let value;try{value=JSON.parse(input.payload);}catch{throw Error('invalid-directory-json');}
 if(!record(value))throw Error('invalid-directory-json');
 const items=own(value,'items');if(!Array.isArray(items))throw Error('invalid-directory-items');
 const fields=page.fields={offset:field(value,'offset',integer),limit:field(value,'limit',n=>integer(n)&&n>0),total:field(value,'total',integer),cursor:field(value,'cursor',v=>typeof v==='string'&&cursorOK(v)),hasMissing:field(value,'has_missing_conversations',v=>typeof v==='boolean')};
 page.returnedCount=items.length;
 if(items.length>limits.rows)gaps.add('item-limit');
 if(items.length>r.limit)gaps.add('response-exceeds-limit');
 const rawIds=[];
 for(let i=0;i<Math.min(items.length,limits.rows);i++){
  const item=items[i];if(!record(item)){gaps.add('invalid-item');continue;}
  const id=own(item,'id');if(idOK(id,'conversation'))rawIds.push(id);
  const archiveFlag=own(item,'is_archived');
  if(archiveFlag!==undefined&&archiveFlag!==null&&typeof archiveFlag!=='boolean'){rows.discard('conversation',id,'invalid-archive-flag');continue;}
  if(archived&&archiveFlag===false){rows.discard('conversation',id,'archive-filter-conflict');continue;}
  // gizmo_id:null/absent never means NONE. update_time never means self-send.
  // Strip body/preview/author/account fields rather than retain raw records.
  rows.add('conversation',id,own(item,'title'));
 }
 const uniqueIds=[...new Set(rawIds)].sort();pageDigest=digest(uniqueIds);
 if(uniqueIds.length!==rawIds.length)gaps.add('duplicate-id');
 for(const [key,f]of Object.entries(fields))if(f.state==='invalid')gaps.add('invalid-'+key);
 if(fields.hasMissing.state!=='value')gaps.add('missing-inventory-status');
 else if(fields.hasMissing.value)gaps.add('server-reports-missing');
 if(fields.offset.state==='value'&&mode==='offset'&&fields.offset.value!==r.offset)gaps.add('offset-conflict');
 if(fields.limit.state==='value'&&fields.limit.value!==r.limit)gaps.add('limit-conflict');
 if(mode==='offset'){
  if(fields.offset.state!=='value')gaps.add('missing-offset');
  if(fields.limit.state!=='value')gaps.add('missing-limit');
  if(fields.total.state==='missing')gaps.add('missing-total');
 }
 total=fields.total.state==='value'?fields.total.value:null;
 const start=fields.offset.state==='value'?fields.offset.value:null;
 const end=start!==null&&Number.isSafeInteger(start+items.length)?start+items.length:null;
 if(start!==null&&end===null)gaps.add('offset-overflow');
 if(total!==null&&end!==null&&end>total)gaps.add('total-conflict');
 const cursor=fields.cursor;
 if(cursor.state==='value'&&cursor.value===r.cursor)gaps.add('repeated-cursor');
 if(cursor.state==='null')page.termination='cursor-null';
 else if(total!==null&&end===total)page.termination='reported-total-boundary';
 if(page.termination==='cursor-null'&&total!==null&&end!==null&&end<total||page.termination==='reported-total-boundary'&&cursor.state==='value')gaps.add('terminal-conflict');
 if(items.length===0&&page.termination==='unknown')gaps.add('empty-page-without-end');
 if(mode==='cursor'&&cursor.state==='missing')gaps.add('missing-cursor');
 if(mode==='offset'&&total===null&&cursor.state==='missing')gaps.add('unknown-termination');
 const prior=input.priorPage;
 if(prior!==null){
  if(prior.domainKey!==domainKey||prior.mode!==mode)gaps.add('prior-domain-conflict');
  if(prior.pageOrdinal+1!==input.pageOrdinal)gaps.add('page-ordinal-gap');
  if(prior.gapped)gaps.add('prior-page-gap');
  if(mode==='offset'?(prior.nextOffset===null||prior.nextOffset!==r.offset):(prior.nextCursor===null||prior.nextCursor!==r.cursor))gaps.add('continuation-conflict');
  if(total!==null&&prior.total!==null&&total!==prior.total)gaps.add('total-changed');
  if(uniqueIds.length&&prior.pageDigest===pageDigest)gaps.add('repeated-page');
  else if(uniqueIds.some(id=>prior.loadedIds.includes(id)))gaps.add('overlapping-page');
 }
 // An isolated later page has no continuity witness. This is not a full scan.
 else if(input.pageOrdinal!==0||mode==='offset'&&r.offset!==0||mode==='cursor'&&r.cursor!==null)gaps.add('prior-page-unavailable');
 if(gaps.size===0){
  // A numeric boundary is only a candidate end, not an explicit terminal marker.
  page.terminalObserved=page.termination==='cursor-null';
  if(page.termination==='unknown'){
   if(mode==='offset'&&items.length>0&&end!==null)page.nextOffset=end;
   if(cursor.state==='value')page.nextCursor=cursor.value;
  }
 }
 return result();
}
