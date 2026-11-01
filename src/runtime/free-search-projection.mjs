import {assertPreparedFreeSnapshot} from '../navigation/free-view.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {knownMatches,knownProjectMatches} from '../navigation/search.mjs';
/** Owner-only known-object search, over the complete existing prepared replica.
 * Query length is measured in JavaScript UTF-16 code units, capped at 200.
 * Saved snippet matches expose only bounded manual previews and opaque asset IDs.
 * Message/branch/hash anchors never cross the frame DTO. */
export function projectFreeSearch(current,request){
 const snapshot=assertPreparedFreeSnapshot(current?.snapshot);
 if(!request||Object.getPrototypeOf(request)!==Object.prototype||Reflect.ownKeys(request).some(key=>!['query','projectId','offset','limit'].includes(key)))throw Error('invalid-free-search-query');
 const {query,projectId=null,offset=0,limit=24}=request;
 if(typeof query!=='string'||query.length>200||projectId!==null&&(typeof projectId!=='string'||projectId.length<1||projectId.length>128)||!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>24)throw Error('invalid-free-search-query');
 if(projectId!==null&&!snapshot.groups.some(project=>project.id===projectId))throw Error('free-search-project-unavailable');
 const snippets=snapshot.preferences?.savedSnippets?.value??[],snippetMatches=new Map(),needle=query.trim().toLocaleLowerCase();
 if(!Array.isArray(snippets)||snippets.length>100)throw Error('invalid-free-search-snippets');
 for(const snippet of snippets){
  if(!tokenOK(snippet.id)||typeof snippet.text!=='string'||snippet.text.length>2000)throw Error('invalid-free-search-snippets');
  if(!snippet.text.toLocaleLowerCase().includes(needle))continue;
  if(!snippetMatches.has(snippet.refId))snippetMatches.set(snippet.refId,[]);
  snippetMatches.get(snippet.refId).push({id:snippet.id,preview:snippet.text.slice(0,160)});
 }
 const matches=knownMatches(snapshot,query,projectId),seen=new Set(),items=[];let total=0;
 for(const row of matches){
  if(seen.has(row.id))continue;seen.add(row.id);
  if(total>=offset&&items.length<limit)items.push({id:row.id,nativeTitle:row.nativeTitle??null,displayTitle:row.nativeTitle??'名称暂不可用',nativeUrl:row.nativeUrl??null,membership:row.membership,projectId:row.projectId??null,freshness:row.freshness??'unknown',...(snippetMatches.has(row.id)?{snippetMatches:snippetMatches.get(row.id)}:{})});
  total++;
 }
 // Preserve the existing conversation/snippet order, followed by matching
 // projects in owner order. Both kinds share one bounded pagination window.
 const projectSeen=new Set();
 for(const project of knownProjectMatches(snapshot,query,projectId)){
  if(projectSeen.has(project.id))continue;projectSeen.add(project.id);
  if(total>=offset&&items.length<limit)items.push({kind:'project',id:project.id,nativeName:project.nativeName??null,nativeUrl:project.nativeUrl??null,freshness:project.freshness??'unknown',available:project.available!==false});
  total++;
 }
 const result={query,projectId,items,total,offset,limit,hasMore:offset+items.length<total};
 if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('free-search-page-too-large');
 return result;
}
