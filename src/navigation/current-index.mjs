import {finish,finishAsync} from '../data/cooperate.mjs';
/** Snapshot-scoped native-route lookup. Match the existing origin+pathname rule,
 * preserve first-match order, and discard the entire index when authority is invalidated.
 */
function* buildIndex(snapshot,groups){
 let count=0;const keys=new Map(),refs=new Map(),routes=new Map(),memberIds=new Set();
 const key=raw=>{if(keys.has(raw))return keys.get(raw);try{const u=new URL(raw),value=u.origin+u.pathname;keys.set(raw,value);return value;}catch{return null;}};
 for(const r of snapshot.refs){const k=key(r.nativeUrl);if(k&&!refs.has(k))refs.set(k,r);if(++count%512===0)yield;}
 for(const g of groups){for(const id of g.members){memberIds.add(id);if(++count%512===0)yield;}for(const rows of [g.current,g.old,g.unknown])for(const r of rows){const k=key(r.nativeUrl);if(!k)continue;if(!routes.has(k))routes.set(k,[]);const list=routes.get(k);if(!list.some(x=>x.group===g))list.push({group:g,ref:r});if(++count%512===0)yield;}}
 return Object.freeze({at(raw){const k=key(raw),r=refs.get(k),rows=routes.get(k)??[];return {ref:r,selected:rows[0]?.group,independent:r&&!memberIds.has(r.id)?r:null,inGroup:g=>rows.find(x=>x.group===g)?.ref};}});
}

export function currentIndex(snapshot,groups){return finish(buildIndex(snapshot,groups));}
export async function currentIndexAsync(snapshot,groups,guard){return finishAsync(buildIndex(snapshot,groups),guard);}
