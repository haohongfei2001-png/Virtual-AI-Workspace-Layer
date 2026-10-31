import { aggregateFreeActivity } from '../../data/free-activity.mjs';
import { stable } from '../../data/hash.mjs';

const modes = ['native', 'pro-default-none', 'pro-cross-project'];
const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !['__proto__','constructor','prototype'].includes(value);
const number = (value,max=1_000_000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const records = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : [];
const membership = ref => ref?.membership?.state;
export function resolveTopicId(state, topicId) {
  if (!safeId(topicId)) throw Error('invalid-topic-id');
  const seen = new Set(); let id = topicId;
  while (state.redirects?.[id] || records(state.redirects).some(r => r.fromTopicId === id)) {
    if (seen.has(id) || seen.size > 2000) throw Error('redirect-cycle');
    seen.add(id);
    const redirect = state.redirects?.[id] ?? records(state.redirects).find(r => r.fromTopicId === id);
    if (!safeId(redirect.toTopicId)) throw Error('invalid-redirect');
    id = redirect.toTopicId;
  }
  return state.topics?.[id]?.lifecycle === 'active' ? id : null;
}
export function referenceInScope(ref, mode, selectedProjectIds = [], capabilities = null) {
  if (!ref || membership(ref) === 'UNKNOWN') return false;
  if (membership(ref) === 'NONE') return capabilities?.positiveNone !== 'unavailable';
  return mode === 'pro-cross-project' && membership(ref) === 'PROJECT' && selectedProjectIds.includes(ref.membership.projectId);
}
export function globalDisplayTitle(state, ref, { forceNative = false } = {}) {
  const title = state.titles?.[ref.id];
  if (forceNative || title?.displayPreference !== 'derived' || !title.title) return ref.nativeTitle;
  return title.title;
}
function checkSource(state, snapshot) {
  const key = snapshot.versions?.scopeKey ?? snapshot.scope?.key ?? snapshot.scopeKey;
  if (!key || key !== state.scopeKey || snapshot.authorized === false) throw Error('unavailable-pro-scope');
  if (!Array.isArray(snapshot.references) || snapshot.references.length > 20_000) throw Error('invalid-pro-references');
  const seen = new Set();
  for (const ref of snapshot.references) {
    if (!safeId(ref.id) || seen.has(ref.id) || !['NONE','PROJECT','UNKNOWN'].includes(membership(ref)) || typeof ref.nativeTitle !== 'string' || typeof ref.available !== 'boolean') throw Error('invalid-pro-reference');
    if (ref.scopeKey !== undefined && ref.scopeKey !== key || ref.scope !== undefined && ref.scope !== key) throw Error('cross-scope-pro-reference');
    if (membership(ref) !== 'UNKNOWN' && !safeId(ref.membership.evidenceId)) throw Error('membership-evidence-required');
    seen.add(ref.id);
  }
  for (const topic of records(state.topics)) if (topic.scopeKey !== key) throw Error('cross-scope-pro-topic');
}
function decisionFor(snapshot, ref) {
  // The owner passes an existing ActivityDecision, never model dates or topic timestamps.
  const d = snapshot.activityDecisions?.[ref.id] ?? ref.activityDecision;
  if (d) return d;
  return {objectKey:ref.id,evidenceRevision:0,basis:'undated',candidateDay:null,candidateTime:null,segment:null,reason:'no-valid-activity',nextCheck:null,validUntil:null};
}
function rowsFor(state, snapshot) {
  return snapshot.references.map(r => ({...r,scope:state.scopeKey,activityDecision:decisionFor(snapshot,r)}));
}
function pairExcluded(state, topicId, refId) {
  return records(state.constraints).some(c => c.kind === 'exclude-topic' && c.topicId === topicId && c.refId === refId);
}
export function projectTopicGroups(state, snapshot, {mode='pro-default-none', selectedProjectIds=[]} = {}) {
  checkSource(state,snapshot);
  if (!['pro-default-none','pro-cross-project'].includes(mode) || !Array.isArray(selectedProjectIds) || new Set(selectedProjectIds).size !== selectedProjectIds.length || selectedProjectIds.some(id=>!safeId(id))) throw Error('invalid-pro-scope-selection');
  const byRef = new Map(snapshot.references.map(r=>[r.id,r]));
  const topics = records(state.topics).filter(t=>t.lifecycle === 'active');
  const placements = records(state.placements).filter(p=>p.state === 'included' && state.topics[p.topicId]?.lifecycle === 'active' && referenceInScope(byRef.get(p.conversationId),mode,selectedProjectIds,snapshot.capabilities) && !pairExcluded(state,p.topicId,p.conversationId));
  const primary = new Map();
  for (const p of placements) if (p.role === 'primary') {
    if (primary.has(p.conversationId)) throw Error('multiple-active-primary');
    primary.set(p.conversationId,p.topicId);
  }
  const refs = rowsFor(state,snapshot);
  const base = {scope:state.scopeKey,refs,projects:[],noProject:[],unknown:[]};
  const makeProject = (t,onlyPrimary) => ({id:t.id,key:t.id,scope:state.scopeKey,membershipComplete:true,members:placements.filter(p=>p.topicId===t.id&&(!onlyPrimary||p.role==='primary')).map(p=>p.conversationId)});
  // Existing Free aggregation keeps precision, provisional history, native order and tie ordering.
  const activity = aggregateFreeActivity({...base,projects:topics.map(t=>makeProject(t,true))});
  const ordered = aggregateFreeActivity({...base,projects:topics.map(t=>makeProject(t,false))});
  const memberOrder = new Map(ordered.projects.map(p=>[p.id,p.members]));
  const all = new Map(topics.map(t=>[t.id,t]));
  const groups = activity.projects.map(a=>{
    const topic = all.get(a.id), members = memberOrder.get(a.id) ?? [];
    const current=[], old=[], undated=[];
    for (const r of members) {
      const edge=placements.find(p=>p.topicId===a.id&&p.conversationId===r.id);
      const row={refId:r.id,displayTitle:globalDisplayTitle(state,r),membership:structuredClone(r.membership),context:edge.role==='primary'?'primary-topic':'related-topic',available:r.available,titleDisplayPreference:state.titles?.[r.id]?.displayPreference??'native'};
      const segment=r.activityDecision.segment;
      if (segment===null || segment===undefined) undated.push(row);
      else if (a.segment!==null && segment>a.segment) old.push(row);
      else current.push(row);
    }
    return {topicId:topic.id,name:topic.name,icon:topic.icon,segment:a.segment,activityDecision:a.activityDecision,current,old,undated,rows:[...current,...undated],empty:!members.length};
  });
  const plain = ref => ({refId:ref.id,displayTitle:ref.nativeTitle,membership:structuredClone(ref.membership),context:membership(ref)==='UNKNOWN'?'pending':'uncollected',available:ref.available,titleDisplayPreference:'native'});
  const uncollected = snapshot.references.filter(r=>membership(r)==='NONE'&&!primary.has(r.id)).map(plain);
  const pending = snapshot.references.filter(r=>membership(r)==='UNKNOWN').map(plain);
  return {groups,uncollected,pending,primary};
}
export function projectProFrame({state,snapshot,native,mode='pro-default-none',role='workspace',session,segment=0,offset=0,limit=24,rowLimit=5,launchContext=null,selectedProjectIds=[]}) {
  if (!modes.includes(mode) || !native || native.protocol !== 'vaiwl-free-frame/1') throw Error('invalid-pro-projection');
  // Free's DTO is forwarded by identity. Pro names, membership and counters never enter it.
  if (mode === 'native') return {mode,native};
  if (!['workspace','sidebar'].includes(role)||!number(segment)||!number(offset)||!number(limit,24)||limit<1||!number(rowLimit,200)||rowLimit<1) throw Error('invalid-pro-page');
  if (!session || ![7,14,30,60,90].includes(session.H) || !Number.isFinite(session.T) || typeof session.Z!=='string' || !number(session.policyRevision)) throw Error('invalid-pro-view-session');
  if (launchContext && (launchContext.scopeKey!==state.scopeKey||launchContext.documentEpoch!==snapshot.versions.authorizationEpoch)) throw Error('stale-launch-context');
  const projected=projectTopicGroups(state,snapshot,{mode,selectedProjectIds});
  const groups=projected.groups.filter(g=>g.segment===segment||(g.segment===null&&segment===0));
  const cards=groups.slice(offset,offset+limit).map(g=>({kind:'topic',topicId:g.topicId,name:g.name,rows:g.rows.slice(0,rowLimit),hasMore:g.rows.length>rowLimit}));
  const refById=new Map(snapshot.references.map(r=>[r.id,r]));
  const uncollected=projected.uncollected.filter(r=>{const k=decisionFor(snapshot,refById.get(r.refId)).segment;return k===segment||(k==null&&segment===0);}).slice(offset,offset+Math.min(200,rowLimit));
  const overlay={protocol:'vaiwl-pro-frame/1',mode,role,versions:structuredClone(snapshot.versions),viewSession:structuredClone(session),segment,cards,uncollected,launchContext:launchContext?structuredClone(launchContext):null,partial:snapshot.partial===true||offset+cards.length<groups.length||projected.uncollected.length>uncollected.length};
  if(new TextEncoder().encode(stable(overlay)).length>65536)throw Error('pro-frame-page-too-large');
  return {mode,native,overlay};
}
export function searchProReferences(state,snapshot,query,{topicId=null,limit=24,mode='pro-default-none',selectedProjectIds=[]}={}) {
  checkSource(state,snapshot);
  if(typeof query!=='string'||query.length>200||!number(limit,200)||limit<1||!modes.includes(mode))throw Error('invalid-pro-search');
  const term=query.normalize('NFKC').trim().toLocaleLowerCase(),allEntries=records(state.placements),series=records(state.series);
  const eligible=ref=>mode!=='native'&&referenceInScope(ref,mode,selectedProjectIds,snapshot.capabilities);
  const edges=ref=>eligible(ref)?allEntries.filter(p=>p.conversationId===ref.id&&p.state==='included'&&state.topics?.[p.topicId]?.lifecycle==='active'&&!pairExcluded(state,p.topicId,ref.id)):[];
  return snapshot.references.filter(ref=>{
    const related=edges(ref);if(topicId&&!related.some(p=>p.topicId===topicId))return false;
    const title=eligible(ref)?state.titles?.[ref.id]:null,topics=related.map(p=>state.topics[p.topicId]);
    const texts=[ref.nativeTitle,...(ref.nativeAliases??[]),title?.title,...(title?.aliases??[]),...topics.flatMap(t=>[t.name,...t.aliases]),...(eligible(ref)?series.filter(s=>s.entries.includes(ref.id)&&related.some(p=>p.topicId===s.topicId)).map(s=>s.title):[])];
    return !term||texts.some(t=>typeof t==='string'&&t.normalize('NFKC').toLocaleLowerCase().includes(term));
  }).slice(0,limit).map(ref=>({refId:ref.id,displayTitle:globalDisplayTitle(state,ref,{forceNative:!eligible(ref)}),nativeTitle:ref.nativeTitle,available:ref.available,contexts:edges(ref).map(p=>({topicId:p.topicId,role:p.role}))}));
}
