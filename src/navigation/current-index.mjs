import {finish,finishAsync} from '../data/cooperate.mjs';
/** Snapshot-scoped native-route lookup. Match the existing origin+pathname rule,
 * preserve first-match order, and discard the entire index when authority is invalidated.
 */
function* buildIndex(snapshot,groups){
 let count=0;const keys=new Map(),refs=new Map(),routes=new Map(),memberIds=new Set(),byId=new Map();
 const key=raw=>{if(keys.has(raw))return keys.get(raw);try{const u=new URL(raw),value=u.origin+u.pathname;keys.set(raw,value);return value;}catch{return null;}};
 for(const r of snapshot.refs){byId.set(r.id,r);const k=key(r.nativeUrl);if(k&&!refs.has(k))refs.set(k,r.id);if(++count%512===0)yield;}
 for(const g of groups){for(const id of g.members){memberIds.add(id);if(++count%512===0)yield;}for(const rows of [g.current,g.old,g.unknown])for(const r of rows){const k=key(r.nativeUrl);if(!k)continue;if(!routes.has(k))routes.set(k,[]);const list=routes.get(k);if(!list.some(x=>x.groupId===g.id))list.push({groupId:g.id,refId:r.id});if(++count%512===0)yield;}}
 // Conservative proof before reusing URL parsing/first-match routing. Titles and
 // activity may change, but ordering, membership and every route must still match.
 function* compatible(next,nextGroups){
  if(next.scope!==snapshot.scope)throw Error('cross-scope-index');
  if(next.refs.length!==snapshot.refs.length||nextGroups.length!==groups.length)return null;
  const nextRefs=new Map();let checked=0;
  for(let i=0;i<next.refs.length;i++){
   const a=snapshot.refs[i],b=next.refs[i];
   if(a.id!==b.id||a.nativeUrl!==b.nativeUrl)return null;
   nextRefs.set(b.id,b);if(++checked%512===0)yield;
  }
  for(let i=0;i<groups.length;i++){
   const a=groups[i],b=nextGroups[i];if(a.id!==b.id)return null;
   for(const table of ['members','current','old','unknown']){
    if(a[table].length!==b[table].length)return null;
    for(let j=0;j<a[table].length;j++){
     const x=a[table][j],y=b[table][j];
     if(table==='members'?x!==y:x.id!==y.id||x.nativeUrl!==y.nativeUrl)return null;
     if(++checked%512===0)yield;
    }
   }
  }
  return bind(nextRefs,nextGroups);
 }
 const bind=(referenceMap,groupList)=>{const groupMap=new Map(groupList.map(g=>[g.id,g]));return Object.freeze({
  rebindCompatibleAsync(next,nextGroups,guard){return finishAsync(compatible(next,nextGroups),guard);},
  byId(id){return referenceMap.get(id);},
  matches(raw,here){const a=key(raw),b=key(here);return a!==null&&b!==null&&a===b;},
  at(raw){const k=key(raw),r=referenceMap.get(refs.get(k)),entries=routes.get(k)??[];return {ref:r,selected:groupMap.get(entries[0]?.groupId),independent:r&&!memberIds.has(r.id)?r:null,inGroup:g=>referenceMap.get(entries.find(x=>x.groupId===g.id)?.refId)};},
  // Reuse immutable route/membership lookup only when the replica proved unchanged
  // reference identity, event/placement order and group order in the SAME scope.
  rebind(referenceMap,groupList,scope){if(scope!==snapshot.scope)throw Error('cross-scope-index');return bind(referenceMap,groupList);}
 });};return bind(byId,groups);
}

export function currentIndex(snapshot,groups){return finish(buildIndex(snapshot,groups));}
export async function currentIndexAsync(snapshot,groups,guard){return finishAsync(buildIndex(snapshot,groups),guard);}
