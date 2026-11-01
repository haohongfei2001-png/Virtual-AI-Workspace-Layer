import {exactHostRecord} from './contract.mjs';
import {nativeMetadataIdOK} from './metadata-candidates.mjs';
import {parseConversationDirectoryMetadata,parseArchivedConversationDirectoryMetadata} from './conversation-directory-metadata.mjs';
import {parseProjectSidebarMetadata,parseProjectConversationListMetadata} from './project-metadata.mjs';
import {normalizedScope} from '../b1/identity.mjs';

// The first-page consumer is deliberately not a scanner. Only a package-owned
// source may provide the matching authenticated response to the privileged owner.
export function directoryTarget(value){
 if(!exactHostRecord(value,['kind','projectId'])||!['ordinary','archived','projects','members'].includes(value.kind)||(value.kind==='members'?!nativeMetadataIdOK(value.projectId,'project'):value.projectId!==null))throw Error('invalid-directory-target');
 return Object.freeze({...value});
}
export function directoryRequest(target){
 target=directoryTarget(target);
 const path=target.kind==='ordinary'?'/backend-api/conversations?offset=0&limit=100':target.kind==='archived'?'/backend-api/conversations?offset=0&limit=100&is_archived=true&order=updated':target.kind==='projects'?'/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0':'/backend-api/gizmos/'+target.projectId+'/conversations?cursor=0&limit=50';
 return Object.freeze({method:'GET',path,maxBytes:1048576});
}
export function directoryBatch(payload,{target,scope,urlPolicy,sourceRevision,observedAt,validUntil}={}){
 target=directoryTarget(target);const normalized=normalizedScope(scope);if(!normalized)throw Error('unverified-scope');
 const parsed=target.kind==='projects'?parseProjectSidebarMetadata({payload,previousCursor:null}):target.kind==='members'?parseProjectConversationListMetadata({payload,projectId:target.projectId,previousCursor:0}):(target.kind==='archived'?parseArchivedConversationDirectoryMetadata:parseConversationDirectoryMetadata)({payload,request:{offset:0,limit:100,cursor:null,sort:target.kind==='archived'?'updated':'unspecified',starred:'unspecified'},pageOrdinal:0,priorPage:null,stopReason:null});
 if(parsed.gaps.some(g=>['offset-conflict','limit-conflict'].includes(g.reason)))throw Error('directory-request-conflict');
 const projects=[],refs=[];
 for(const row of parsed.candidates){
  const path=row.entity==='project'?'/g/'+row.nativeId+'/project':'/c/'+row.nativeId,route=urlPolicy.parse(path);
  if(route.kind!==row.entity||(route.projectId??route.conversationId)!==row.nativeId)throw Error('directory-route-conflict');
  (row.entity==='project'?projects:refs).push({id:row.nativeId,[row.entity==='project'?'nativeName':'nativeTitle']:row.nativeTitle,nativeUrl:route.navigationURL,availability:'available'});
 }
 // Positive candidates survive coverage gaps. No membership, dates, deletion,
 // completeness or continuation is inferred, including at cursor:null.
 return {batch:{scopeKey:normalized.key,sourceRevision,observedAt,validUntil,projects,refs,membership:[],inventory:{projects:'partial',conversations:'partial',cursor:null}},
  coverage:{domain:parsed.domain,gaps:parsed.gaps.map(g=>g.reason),terminalObserved:parsed.page.terminalObserved},state:parsed.state};
}
