import {validateState,placementId} from '../../data/state.mjs';
import {digest,stable} from '../../data/hash.mjs';
import {emptyOverlay,validateOverlay,exclusionKey} from '../domain/index.mjs';

/** Pure dry-run codec. The caller owns same-IDB root CAS and binary reader fencing.
 * It neither upgrades DB4 nor overwrites a shared legacy root.
 */
export function planLegacyMigration(legacy,{explicitPrimary={},humanRefs=[]}={}) {
  validateState(legacy,legacy.scopeKey);
  const original=digest(legacy),state=emptyOverlay(legacy.scopeKey);
  const control=(row,locked=row.locked)=>({mode:row.owner==='human'?'human':'automatic',locked:!!locked,revision:row.revision??0,lastHumanOperation:null});
  const report={format:'vaiwl-pro-migration-report/1',sourceDigest:original,sourceSchema:2,sourceRevision:legacy.revision,
    retainedTopicIds:[],retainedPlacementIds:[],ambiguousRefs:[],excludedPairs:[],sharedAssetsDigest:digest({refs:legacy.refs,preferences:legacy.preferences,humanRefs}),
    sharedAssetsAction:'leave-original-shared-assets-untouched',notes:['Legacy workspace locks preserve name/icon protection; membership is not implicitly frozen.']};
  for(const w of Object.values(legacy.workspaces)) {
    state.topics[w.id]={id:w.id,scopeKey:legacy.scopeKey,name:w.name,aliases:[...(w.aliases??[])],icon:w.icon,intent:null,
      nameControl:control(w),membershipControl:{mode:'automatic',locked:false,revision:w.revision??0,lastHumanOperation:null},lifecycle:'active',createdBy:'legacy',revision:w.revision??0};
    report.retainedTopicIds.push(w.id);
  }
  state.presentation.topicOrder={kind:'legacy-order',order:Object.fromEntries(Object.values(legacy.workspaces).map(w=>[w.id,w.order])),revision:legacy.revision};
  state.presentation.placementOrder={kind:'legacy-order',order:Object.fromEntries(Object.values(legacy.placements).map(p=>[p.id,p.order])),revision:legacy.revision};
  const byRef=new Map();
  for(const p of Object.values(legacy.placements)) {
    report.retainedPlacementIds.push(p.id);
    if(p.excluded) {
      const key=exclusionKey(p.workspaceId,p.refId);
      state.constraints[key]={kind:'exclude-topic',refId:p.refId,topicId:p.workspaceId,revision:p.revision??0,operationId:'legacy_migration'};
      report.excludedPairs.push([p.refId,p.workspaceId]);continue;
    }
    if(!byRef.has(p.refId))byRef.set(p.refId,[]);byRef.get(p.refId).push(p);
  }
  for(const [refId,placements] of byRef) {
    const primary=explicitPrimary[refId]??(placements.length===1?placements[0].workspaceId:null);
    if(primary!==null&&!placements.some(p=>p.workspaceId===primary))throw Error('legacy-explicit-primary-invalid');
    if(placements.length>1&&primary===null) {
      const preservedPlacements=structuredClone(placements);
      state.legacyResolutions[refId]={refId,originalPlacementIds:placements.map(p=>p.id),preservedAssetDigest:digest(preservedPlacements),
        candidates:placements.map(p=>p.workspaceId),status:'primary-resolution-required',chosenPrimary:null,preservedPlacements};
      report.ambiguousRefs.push(refId);
    }
    for(const p of placements) {
      const pending=placements.length>1&&primary===null,role=pending||p.workspaceId===primary?'primary':'related';
      state.placements[placementId(p.workspaceId,p.refId)]={conversationId:p.refId,topicId:p.workspaceId,role,
        activityContribution:role==='primary'?'primary-only':'none',state:pending?'revalidation-needed':'included',
        control:control(p),constraintRefs:[],evidenceIds:[],revision:p.revision??0};
    }
  }
  for(const n of Object.values(legacy.identities))state.titles[n.id]={conversationId:n.id,title:n.title,aliases:[...n.aliases],
    displayPreference:'derived',control:control(n),evidenceIds:[],revision:n.revision??0};
  state.revision=legacy.revision;
  validateOverlay(state);
  if(digest(legacy)!==original)throw Error('legacy-mutated');
  report.targetDigest=digest(state);report.planHash=digest({sourceDigest:original,targetDigest:report.targetDigest,sharedAssetsDigest:report.sharedAssetsDigest});
  return {state,report};
}

/** Refuse a reader that cannot preserve all overlay asset kinds. */
export function assertOverlayReader(reader) {
  if(reader!=='vaiwl-pro-overlay/1')throw Error('pro-reader-incompatible');
  return true;
}

export function verifyMigrationPlan(legacy,plan) {
  validateState(legacy,legacy.scopeKey);
  if(plan?.state?.scopeKey!==legacy.scopeKey)throw Error('migration-scope-mismatch');
  if(digest(legacy)!==plan.report.sourceDigest||digest(plan.state)!==plan.report.targetDigest||
     digest({sourceDigest:plan.report.sourceDigest,targetDigest:plan.report.targetDigest,sharedAssetsDigest:plan.report.sharedAssetsDigest})!==plan.report.planHash)
    throw Error('stale-migration-plan');
  validateOverlay(plan.state);return true;
}
