import { dataProjection } from './evidence.mjs';
import { checkManifest } from './partitioned.mjs';
/** A view replica, never write authority. Assemble off-DOM, then replace atomically.
 * Exact scope/generation/revision pointers are checked for EVERY row, including unchanged rows.
 */
export function replicaDelta(prior,manifest){
 if(!prior||prior.manifest.scopeKey!==manifest.scopeKey||prior.manifest.generation!==manifest.generation||prior.manifest.revision>manifest.revision)return null;
 const from=prior.manifest.revision,logs=manifest.changes.filter(c=>c.revision>from);if(logs.length!==manifest.revision-from||logs.some((c,i)=>c.revision!==from+i+1))return null;
 return [...new Set(logs.flatMap(c=>c.refs))];
}
export function assembleReplica(prior,manifest,incoming,delta,view,now,timeZone,size){
 checkManifest(manifest,manifest.scopeKey);const rows=delta===null?new Map():new Map(prior.rows);
 if(delta)for(const refId of delta)rows.delete(refId);
 const added=new Set();for(const b of incoming){if(added.has(b.refId)||b.scopeKey!==manifest.scopeKey||b.ref?.id!==b.refId||b.revision!==manifest.refVersions[b.refId])throw Error('invalid-partition-reference');added.add(b.refId);rows.set(b.refId,b);}
 const keys=Object.keys(manifest.refVersions);if(rows.size!==keys.length||keys.some(id=>rows.get(id)?.revision!==manifest.refVersions[id]))throw Error('incomplete-partition-snapshot');
 const state={schema:2,scopeKey:manifest.scopeKey,revision:manifest.revision,channel:manifest.channel,refs:{},identities:{},events:{},coverage:{},placements:{},sources:manifest.sources,workspaces:manifest.workspaces,preferences:manifest.preferences};
 for(const b of rows.values()){state.refs[b.refId]=b.ref;if(b.identity)state.identities[b.refId]=b.identity;for(const t of ['events','coverage','placements'])for(const r of b[t])state[t][r.id]=r;}
 const projected=dataProjection(state,now,timeZone),visible=w=>w.owner!=='bootstrap'||w.seedIndex<size;
 const snapshot={...projected,themes:projected.themes.filter(visible),groups:projected.groups.filter(visible),objects:{workspaces:state.workspaces,placements:state.placements,identities:state.identities,sources:state.sources},preferences:state.preferences,view:view.view?.value??null,viewRevision:view.view?.revision??0,diagnostics:view.diagnostics};
 return {manifest,rows,snapshot};
}
