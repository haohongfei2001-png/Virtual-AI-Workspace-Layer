import {assertPreparedFreeSnapshot} from '../navigation/free-view.mjs';
/** Read-only projection of existing manually ordered references. Missing refs
 * remain visible; this function neither repairs nor reorders saved assets. */
export function projectFreeWorkingSet(current,request={}){
 const snapshot=assertPreparedFreeSnapshot(current?.snapshot);
 if(typeof current?.index?.byId!=='function')throw Error('missing-free-working-set-index');
 if(!request||Object.getPrototypeOf(request)!==Object.prototype||Reflect.ownKeys(request).some(key=>!['offset','limit'].includes(key)))throw Error('invalid-free-working-set-query');
 const {offset=0,limit=24}=request;
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>24)throw Error('invalid-free-working-set-query');
 const saved=snapshot.preferences?.workingSet?.value??{refs:[],current:null};
 const items=saved.refs.slice(offset,offset+limit).map(id=>{
  const row=current.index.byId(id);
  if(!row)return {id,available:false,displayTitle:'暂时无法打开的引用',nativeTitle:null,nativeUrl:null,membership:'UNKNOWN',projectId:null};
  if(row.id!==id||row.scope!==snapshot.scope)throw Error('cross-scope-free-working-set');
  return {id,available:row.available!==false,freshness:row.freshness??null,nativeTitle:row.nativeTitle??null,displayTitle:row.nativeTitle??'名称暂不可用',nativeUrl:row.nativeUrl??null,membership:row.membership,membershipFreshness:row.membershipFreshness??null,projectId:row.projectId??null,segment:(row.activityDecision??row.activity)?.segment??row.segment??null};
 });
 const result={items,total:saved.refs.length,offset,limit,hasMore:offset+items.length<saved.refs.length,currentRefId:saved.current??null};
 if(new TextEncoder().encode(JSON.stringify(result)).length>65536)throw Error('free-working-set-page-too-large');return result;
}
