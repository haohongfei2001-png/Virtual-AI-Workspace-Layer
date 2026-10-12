import {finish,finishAsync} from './cooperate.mjs';
import {dataProjection,dataProjectionAsync} from './evidence.mjs';
import {checkManifest,checkManifestAsync} from './partitioned.mjs';
import {stable} from './hash.mjs';
/** Replica pointers have no write authority. Commit only after the caller's final
 * scope/document/revision CHECK. Immutable old replicas are never edited in place.
 */
export function replicaDelta(prior,manifest){
 if(!prior||prior.manifest.scopeKey!==manifest.scopeKey||prior.manifest.generation!==manifest.generation||prior.manifest.revision>manifest.revision)return null;
 const from=prior.manifest.revision,logs=manifest.changes.filter(c=>c.revision>from);if(logs.length!==manifest.revision-from||logs.some((c,i)=>c.revision!==from+i+1))return null;
 return [...new Set(logs.flatMap(c=>c.refs))];
}
const context=(now,zone,size)=>JSON.stringify([now,zone,size]);
function add(state,b,workspaces=null){state.refs[b.refId]=b.ref;if(b.identity)state.identities[b.refId]=b.identity;for(const t of ['events','coverage','placements'])for(const r of b[t])if(t!=='placements'||!workspaces||workspaces.has(r.workspaceId))state[t][r.id]=r;}
function baseState(m,workspaces=m.workspaces){return {schema:2,scopeKey:m.scopeKey,revision:m.revision,channel:m.channel,refs:{},identities:{},events:{},coverage:{},placements:{},sources:m.sources,workspaces,preferences:m.preferences};}
function* prepare(prior,m,incoming,delta,now,zone,size,validated=false){
 if(!validated)checkManifest(m,m.scopeKey);yield;let count=0;const rows=delta?.length===0?prior.rows:new Map(),added=new Set();if(delta!==null&&delta.length)for(const [id,piece] of prior.rows){rows.set(id,piece);if(++count%512===0)yield;}
 if(delta)for(const id of delta)if(!Object.hasOwn(m.refVersions,id))rows.delete(id);
 for(const b of incoming){if(added.has(b.refId)||b.scopeKey!==m.scopeKey||b.ref?.id!==b.refId||b.revision!==m.refVersions[b.refId])throw Error('invalid-partition-reference');added.add(b.refId);rows.set(b.refId,b);}
 const ids=Object.keys(m.refVersions);yield;if(rows.size!==ids.length)throw Error('incomplete-partition-snapshot');for(const id of ids){if(rows.get(id)?.revision!==m.refVersions[id])throw Error('incomplete-partition-snapshot');if(++count%512===0)yield;}
 const incremental=delta!==null&&delta.length<=1000&&prior.context===context(now,zone,size)&&m.channel===prior.manifest.channel&&stable(m.sources)===stable(prior.manifest.sources);
 if(incremental&&!delta.length&&stable(m.workspaces)===stable(prior.manifest.workspaces))return {unchanged:true,manifest:m,prior};
 let state,affected=null,reuseIndex=false;
 if(incremental){
  affected=new Set();for(const w of new Set([...Object.keys(m.workspaces),...Object.keys(prior.manifest.workspaces)]))if(stable(m.workspaces[w]??null)!==stable(prior.manifest.workspaces[w]??null))affected.add(w);
  const refs=new Set(delta);for(const id of delta)for(const b of [prior.rows.get(id),rows.get(id)])for(const p of b?.placements??[])affected.add(p.workspaceId);
  for(const group of prior.snapshot.groups)if(affected.has(group.id))for(const id of group.members){refs.add(id);if(++count%512===0)yield;}
  // Include filtered-out themes too, so a human rename can make one visible.
  for(const group of prior.allGroups)if(affected.has(group.id))for(const id of group.members){refs.add(id);if(++count%512===0)yield;}
  state=baseState(m,Object.fromEntries([...affected].filter(id=>m.workspaces[id]).map(id=>[id,m.workspaces[id]])));
  for(const id of refs){const b=rows.get(id);if(b)add(state,b,affected);if(++count%512===0)yield;}
  reuseIndex=ids.length===prior.rows.size&&delta.every(id=>{const before=prior.rows.get(id),after=rows.get(id);return before&&after&&stable(before.ref)===stable(after.ref)&&['events','coverage','placements'].every(t=>stable(before[t])===stable(after[t]));})&&Object.keys(m.workspaces).length===Object.keys(prior.manifest.workspaces).length&&Object.values(m.workspaces).every(w=>w.order===prior.manifest.workspaces[w.id]?.order);
 }else{state=baseState(m);for(const id of ids){add(state,rows.get(id));if(++count%512===0)yield;}}
 return {manifest:m,rows,state,ids,affected,reuseIndex,context:context(now,zone,size),prior:incremental?prior:null};
}
function* complete(value,projected,view,size){
 if(value.unchanged){const {prior,manifest}=value;return {...prior,manifest,reuseIndex:true,snapshot:{...prior.snapshot,revision:manifest.revision,preferences:manifest.preferences,view:view.view?.value??null,viewRevision:view.view?.revision??0,diagnostics:view.diagnostics}};}
 const {manifest:m,rows,ids,affected,prior}=value,visible=w=>w.owner!=='bootstrap'||w.seedIndex<size;let count=0;
 const refsById=new Map();if(prior)for(const [id,ref] of prior.refsById){refsById.set(id,ref);if(++count%512===0)yield;}for(const r of projected.refs){refsById.set(r.id,r);if(++count%512===0)yield;}if(prior)for(const id of replicaDelta(prior,m))if(!rows.has(id))refsById.delete(id);
 const refs=[];for(const id of ids){const r=refsById.get(id);if(!r)throw Error('incomplete-partition-projection');refs.push(r);if(++count%512===0)yield;}
 let groups=projected.groups,objects;
 if(prior){const newGroups=new Map(projected.groups.map(g=>[g.id,g])),oldGroups=new Map(prior.allGroups.map(g=>[g.id,g]));groups=Object.values(m.workspaces).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(w=>affected.has(w.id)?newGroups.get(w.id):oldGroups.get(w.id));if(groups.some(g=>!g))throw Error('incomplete-partition-group');
  const placements={},identities={};for(const key of Object.keys(prior.snapshot.objects.placements)){placements[key]=prior.snapshot.objects.placements[key];if(++count%512===0)yield;}for(const key of Object.keys(prior.snapshot.objects.identities)){identities[key]=prior.snapshot.objects.identities[key];if(++count%512===0)yield;}
  for(const id of replicaDelta(prior,m)){for(const p of prior.rows.get(id)?.placements??[])delete placements[p.id];const b=rows.get(id);if(b?.identity)identities[id]=b.identity;else delete identities[id];for(const p of b?.placements??[])placements[p.id]=p;}
  objects={workspaces:m.workspaces,placements,identities,sources:m.sources};
 }else objects={workspaces:m.workspaces,placements:value.state.placements,identities:value.state.identities,sources:m.sources};
 const visibleGroups=groups.filter(visible),snapshot={...projected,refs,revision:m.revision,themes:visibleGroups,groups:visibleGroups,objects,preferences:m.preferences,view:view.view?.value??null,viewRevision:view.view?.revision??0,diagnostics:view.diagnostics};
 const reuseIndex=value.reuseIndex&&stable(visibleGroups.map(g=>g.id))===stable(prior.snapshot.groups.map(g=>g.id));
 return {manifest:m,rows,snapshot,refsById,allGroups:groups,reuseIndex,context:value.context};
}
export function assembleReplica(prior,m,incoming,delta,view,now,zone,size){const value=finish(prepare(prior,m,incoming,delta,now,zone,size));return finish(complete(value,value.unchanged?null:dataProjection(value.state,now,zone),view,size));}
export async function assembleReplicaAsync(prior,m,incoming,delta,view,now,zone,size,guard){await checkManifestAsync(m,m.scopeKey,guard);const value=await finishAsync(prepare(prior,m,incoming,delta,now,zone,size,true),guard),projected=value.unchanged?null:await dataProjectionAsync(value.state,now,zone,guard);return finishAsync(complete(value,projected,view,size),guard);}
