import { resolveTopicId, referenceInScope } from '../projection/project.mjs';
const clone = value=>structuredClone(value);
const plain = value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const id = value=>typeof value==='string'&&value.length>0&&value.length<=256&&!['__proto__','constructor','prototype'].includes(value);
const integer = value=>Number.isSafeInteger(value)&&value>=0;
export function validateLaunchContext(c,{scopeKey,documentEpoch}={}) {
  const keys=['id','scopeKey','sourceMode','topicId','seriesId','referenceId','nativeProjectId','viewSession','returnAnchor','origin','documentEpoch'];
  if(!plain(c)||Object.keys(c).length!==keys.length||keys.some(k=>!Object.hasOwn(c,k))||!id(c.id)||!id(c.scopeKey)||!id(c.referenceId)||!['native','pro-default-none','pro-cross-project'].includes(c.sourceMode)||!['topic','native-project','search','working-set','direct'].includes(c.origin)||!integer(c.documentEpoch))throw Error('invalid-launch-context');
  for(const key of ['topicId','seriesId','nativeProjectId'])if(c[key]!==null&&!id(c[key]))throw Error('invalid-launch-context');
  const v=c.viewSession,a=c.returnAnchor;
  if(!plain(v)||Object.keys(v).sort().join(',')!=='H,T,Z,policyRevision'||![7,14,30,60,90].includes(v.H)||!Number.isFinite(v.T)||!integer(v.policyRevision)||typeof v.Z!=='string')throw Error('invalid-view-session');
  try{new Intl.DateTimeFormat('en',{timeZone:v.Z});}catch{throw Error('invalid-view-timezone');}
  if(!plain(a)||Object.keys(a).sort().join(',')!=='cardId,openOldItems,refId,scrollOffset,segment,sidebarChoices'||!integer(a.segment)||!Number.isFinite(a.scrollOffset)||a.scrollOffset<0||a.scrollOffset>1e8)throw Error('invalid-return-anchor');
  for(const key of ['cardId','refId'])if(a[key]!==null&&!id(a[key]))throw Error('invalid-return-anchor');
  for(const key of ['openOldItems','sidebarChoices'])if(!Array.isArray(a[key])||a[key].length>2000||a[key].some(x=>!id(x))||new Set(a[key]).size!==a[key].length)throw Error('invalid-return-anchor');
  if(scopeKey!==undefined&&c.scopeKey!==scopeKey||documentEpoch!==undefined&&c.documentEpoch!==documentEpoch)throw Error('stale-launch-context');
  if(c.origin==='topic'&&c.topicId===null||c.origin==='native-project'&&c.nativeProjectId===null)throw Error('missing-launch-origin');
  return c;
}
export function buildLaunchContext(input,{state,snapshot,session,documentEpoch,selectedProjectIds=[]}) {
  const ref=snapshot.references.find(r=>r.id===input.referenceId);
  if(!ref||!ref.available||snapshot.authorized===false||snapshot.versions.scopeKey!==state.scopeKey)throw Error('reference-unavailable');
  const origin=input.origin??'direct',mode=input.sourceMode??'pro-default-none';
  let topicId=input.topicId??null;
  if(topicId!==null){
    topicId=resolveTopicId(state,topicId);
    if(!topicId||!referenceInScope(ref,mode,selectedProjectIds,snapshot.capabilities)||!Object.values(state.placements).some(p=>p.topicId===topicId&&p.conversationId===ref.id&&p.state==='included'))throw Error('topic-entry-unavailable');
  }
  if(input.seriesId!==null&&input.seriesId!==undefined){const s=state.series[input.seriesId];if(!s||s.topicId!==topicId||!s.entries.includes(ref.id))throw Error('series-entry-unavailable');}
  if(input.nativeProjectId!==null&&input.nativeProjectId!==undefined&&(ref.membership.state!=='PROJECT'||ref.membership.projectId!==input.nativeProjectId))throw Error('project-entry-unavailable');
  return clone(validateLaunchContext({id:input.id??'launch_'+globalThis.crypto.randomUUID().replaceAll('-',''),scopeKey:state.scopeKey,sourceMode:mode,topicId,seriesId:input.seriesId??null,referenceId:ref.id,nativeProjectId:input.nativeProjectId??null,viewSession:clone(session),returnAnchor:clone(input.returnAnchor??{cardId:topicId,refId:ref.id,segment:0,scrollOffset:0,openOldItems:[],sidebarChoices:[]}),origin,documentEpoch},{scopeKey:state.scopeKey,documentEpoch}));
}
/** Each entry is explicit, RAM-only and document-bound. No first-match ownership. */
export function createLaunchContextStore({scopeKey,documentEpoch}) {
  let active=null;const contexts=new Map();
  return Object.freeze({
    enter(context){validateLaunchContext(context,{scopeKey,documentEpoch});contexts.set(context.id,clone(context));active=context.id;return clone(context);},
    current(){return active===null?null:clone(contexts.get(active));},
    resume(contextId){const value=contexts.get(contextId);if(!value)throw Error('unknown-launch-context');validateLaunchContext(value,{scopeKey,documentEpoch});active=contextId;return clone(value);},
    returnToWorkspace(contextId=active){const value=contexts.get(contextId);if(!value)throw Error('unknown-launch-context');validateLaunchContext(value,{scopeKey,documentEpoch});active=null;return {mode:value.sourceMode,topicId:value.topicId,seriesId:value.seriesId,session:clone(value.viewSession),anchor:clone(value.returnAnchor)};},
    invalidate(){contexts.clear();active=null;},
    inheritToNewTab(contextId,{verified,scopeKey:nextScope,documentEpoch:nextEpoch}){if(verified!==true||nextScope!==scopeKey||!integer(nextEpoch))throw Error('unverified-tab-inheritance');const value=contexts.get(contextId);if(!value)throw Error('unknown-launch-context');return clone({...value,documentEpoch:nextEpoch});}
  });
}
export function nextSeriesEntry(series,refId,{direction='next'}={}) {
  if(!series.entries.includes(refId)||!['next','previous'].includes(direction))return null;
  const edges=series.edges.filter(e=>e.kind==='continuation'&&(direction==='next'?e.from===refId:e.to===refId));
  // A broken chain is a real gap; array adjacency must never manufacture an edge.
  if(edges.length!==1)return null;
  return direction==='next'?edges[0].to:edges[0].from;
}
