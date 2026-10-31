import {digest} from '../../data/hash.mjs';
import {projectTopicGroups, searchProReferences} from '../projection/project.mjs';
import {createURLPolicy} from '../../host/url-policy.mjs';

export const PRO_FRAME_BYTES = 65536;
export const PRO_FRAME_PROTOCOL = 'vaiwl-pro-public/1';
const own = (o, k) => Object.hasOwn(o, k);
const rec = x => x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const list = x => Object.values(x ?? {});
const integer = (x, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= 0 && x <= max;
const text = (x, max = 1024) => typeof x === 'string' ? x.slice(0, max) : '';
const id = x => typeof x === 'string' && x.length > 0 && x.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(x) && !['__proto__', 'prototype', 'constructor'].includes(x);
const string = (x, max = 1024) => typeof x === 'string' && x.length <= max;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x);
const nullableId = x => x === null || id(x);
const ids = (x, max) => Array.isArray(x) && x.length <= max && x.every(id) && new Set(x).size === x.length;
const modes = ['native', 'pro-default-none', 'pro-cross-project'];
const panelKinds = ['reference', 'topic', 'records', 'settings', 'legacy-resolutions', 'project-choices', 'collect', 'suggestions', 'series', 'series-detail', 'series-edges'];
const pick = (x, keys) => Object.fromEntries(keys.filter(k => own(x ?? {}, k)).map(k => [k, structuredClone(x[k])]));
const control = x => ({mode: x?.mode === 'human' ? 'human' : 'auto', locked: x?.locked === true});
const membership = x => ({state: ['NONE', 'PROJECT'].includes(x?.state) ? x.state : 'UNKNOWN', ...(x?.state === 'PROJECT' && id(x.projectId) ? {projectId: x.projectId} : {})});
const page = (offset, total, count, limit) => ({offset, total, count, limit, hasMore: offset + count < total});
const emptyDisplay = scopeKey => ({scopeKey, topics: {}, titles: {}, placements: {}, constraints: {}, series: {}, legacyResolutions: {}, proposals: {}});

function checkSource(state, snapshot) {
  const scopeKey = snapshot?.versions?.scopeKey;
  if (!id(scopeKey) || state?.scopeKey !== scopeKey || snapshot.authorized === false) throw Error('unavailable-pro-scope');
  if (!Array.isArray(snapshot.references) || snapshot.references.length > 20000) throw Error('invalid-pro-references');
  const seen = new Set();
  for (const ref of snapshot.references) {
    if (!id(ref.id) || seen.has(ref.id) || !string(ref.nativeTitle, 2048) || typeof ref.available !== 'boolean' || !['NONE','PROJECT','UNKNOWN'].includes(ref.membership?.state)) throw Error('invalid-pro-reference');
    if (ref.scopeKey !== undefined && ref.scopeKey !== scopeKey || ref.scope !== undefined && ref.scope !== scopeKey) throw Error('cross-scope-pro-reference');
    if (ref.membership.state !== 'UNKNOWN' && !id(ref.membership.evidenceId) || ref.membership.state === 'PROJECT' && !id(ref.membership.projectId)) throw Error('membership-evidence-required');
    seen.add(ref.id);
  }
  for (const topic of list(state.topics)) if (topic.scopeKey !== scopeKey) throw Error('cross-scope-pro-topic');
}

/** A review hash is a comparison token, never authority. The worker compares it
 * with its current complete vector before creating a one-use human receipt. */
export function publicVersions(versions) {
  if (!id(versions?.scopeKey) || !integer(versions.authorizationEpoch) || !integer(versions.overlayRevision)) throw Error('invalid-pro-public-versions');
  return {scopeKey: versions.scopeKey, authorizationEpoch: versions.authorizationEpoch, overlayRevision: versions.overlayRevision, reviewId: digest(versions)};
}

export function publicStatus(status = {}) {
  const result = {
    authorized: status.authorized === true,
    entitlement: ['pro', 'active'].includes(status.entitlement) ? status.entitlement : 'free',
    processingMode: status.processingMode === 'local' ? 'local' : 'off',
    modelAvailability: status.modelAvailability === 'local-rules' ? 'local-rules' : 'unavailable',
    cloudBudget: 0,
    metadataOnly: true,
    positiveNone: status.positiveNone === 'available' ? 'available' : 'unavailable',
    persistence: ['same-idb', 'memory-only', 'session-only'].includes(status.persistence) ? status.persistence : status.persistence === 'memory' ? 'memory-only' : status.persistence === 'session' ? 'session-only' : 'unavailable',
    mode: ['native', 'pro-default-none', 'pro-cross-project'].includes(status.mode) ? status.mode : 'pro-default-none',
    selectedProjectIds: Array.isArray(status.selectedProjectIds) ? status.selectedProjectIds.filter(id).slice(0, 100) : [],
    segment: integer(status.segment) ? status.segment : 0,
    launchContext: status.launchContext ? {
      referenceId: text(status.launchContext.referenceId, 256),
      topicId: status.launchContext.topicId ?? null,
      seriesId: status.launchContext.seriesId ?? null,
      nativeProjectId: status.launchContext.nativeProjectId ?? null,
      nextReferenceId: status.launchContext.nextReferenceId ?? null,
      origin: text(status.launchContext.origin, 30),
    } : null,
  };
  checkStatus(result);
  return result;
}

function publicItem(ref) {
  return {id: ref.id, nativeTitle: text(ref.nativeTitle, 2048), available: ref.available === true, membership: membership(ref.membership)};
}
function publicRow(row) {
  return {refId: row.refId, displayTitle: text(row.displayTitle, 2048), available: row.available === true,
    membership: membership(row.membership), context: row.context, titleDisplayPreference: row.titleDisplayPreference === 'derived' ? 'derived' : 'native'};
}
function seriesDisplay(s, {entries = [], edges = [], labels = [], detailsComplete = false} = {}) {
  return {id:s.id, topicId:s.topicId, title:text(s.title,200), entries:[...entries],
    edges:edges.map(e=>pick(e,['kind','from','to'])), labels:labels.map(l=>pick(l,['refId','sequence','source'])),
    totalEntries:s.entries.length, totalEdges:s.edges.length, detailsComplete};
}
function displayFor(state, refIds, topicIds, {proposalIds = [], seriesIds = null} = {}) {
  const result = emptyDisplay(state.scopeKey), rset = new Set(refIds), tset = new Set(topicIds);
  // Only the selected page/panel's local assets are sent. Journal, inverse,
  // evidence, excluded unrelated references and complete vectors stay private.
  for (const t of list(state.topics)) if (tset.has(t.id)) result.topics[t.id] = {
    id: t.id, name: text(t.name, 200), lifecycle: t.lifecycle, icon: text(t.icon, 40),
    nameControl: control(t.nameControl), membershipControl: control(t.membershipControl),
  };
  for (const [key, t] of Object.entries(state.titles ?? {})) if (rset.has(key)) result.titles[key] = {
    conversationId: key, title: t.title === null ? null : text(t.title, 200), displayPreference: t.displayPreference, control: control(t.control),
  };
  for (const [key, p] of Object.entries(state.placements ?? {})) if (rset.has(p.conversationId) && tset.has(p.topicId)) result.placements[key] = {
    conversationId: p.conversationId, topicId: p.topicId, role: p.role, state: p.state, control: control(p.control),
  };
  for (const [key, c] of Object.entries(state.constraints ?? {})) if (rset.has(c.refId) && ['exclude-topic', 'exclude-ai-processing'].includes(c.kind) && (!c.topicId || tset.has(c.topicId))) result.constraints[key] = pick(c, ['kind', 'refId', 'topicId']);
  // Summary windows never make a long series disappear. The explicit series
  // panel carries its own cursor; only a complete detail page is editable.
  const selectedSeries = seriesIds ?? Object.values(state.series ?? {}).filter(s=>tset.has(s.topicId)).slice(0,24).map(s=>s.id);
  for (const key of selectedSeries) { const s=state.series[key]; if(s)result.series[key]=seriesDisplay(s); }
  for (const [key, r] of Object.entries(state.legacyResolutions ?? {})) if (rset.has(r.refId)) result.legacyResolutions[key] = {
    refId: r.refId, status: r.status, candidates: r.candidates.filter(t => tset.has(t)).slice(0, 100),
    preservedPlacements: (r.preservedPlacements ?? []).filter(p => tset.has(p.workspaceId ?? p.topicId)).map(p => ({workspaceId: p.workspaceId ?? p.topicId, locked: p.locked === true || p.control?.locked === true})),
  };
  for (const key of proposalIds) {const r=state.proposals[key]; result.proposals[key] = {
    state: r.state, proposal: {id: r.proposal.id, planHash: r.proposal.planHash, kind: r.proposal.kind, summary: text(r.proposal.summary, 500), rationale: (r.proposal.rationale ?? []).slice(0, 8).map(x => text(x, 500))},
  };}
  return result;
}
function sourceItems(snapshot, refIds) {
  const wanted = new Set(refIds);
  return snapshot.references.filter(r => wanted.has(r.id)).map(publicItem).slice(0, 200);
}
function projectChoices(snapshot, native) {
  return (snapshot.projects ?? native?.groups?.items ?? []).slice(0, 24).map(p => ({id: p.id, name: text(p.nativeName ?? p.name, 200)}));
}

export function projectPublicPage({state, snapshot, view, status = {}, query = {}}) {
  checkSource(state,snapshot);
  const mode = query.mode ?? status.mode ?? view?.mode ?? 'pro-default-none', selectedProjectIds = query.selectedProjectIds ?? status.selectedProjectIds ?? [];
  const segment = query.segment ?? 0, offset = query.offset ?? 0, uncollectedOffset=query.inventoryOffsets?.uncollected??0, pendingOffset=query.inventoryOffsets?.pending??0;
  if(!integer(uncollectedOffset)||!integer(pendingOffset))throw Error('invalid-pro-public-query');
  let limit = query.limit ?? 8, rowLimit = query.rowLimit ?? 5;
  if (!['native', 'pro-default-none', 'pro-cross-project'].includes(mode) || !integer(segment) || !integer(offset) || !integer(limit, 24) || limit < 1 || !integer(rowLimit, 200) || rowLimit < 1) throw Error('invalid-pro-public-query');
  const p = mode === 'native' ? {groups: [], uncollected: [], pending: []} : projectTopicGroups(state, snapshot, {mode, selectedProjectIds});
  const dec = refId => snapshot.activityDecisions?.[refId]?.segment ?? snapshot.references.find(r => r.id === refId)?.activityDecision?.segment ?? null;
  const inSegment = k => k === segment || k === null && segment === 0;
  const groups = p.groups.filter(g => inSegment(g.segment)), uncollected = p.uncollected.filter(r => inSegment(dec(r.refId))), pending = segment === 0 ? p.pending : [];
  for (;;) {
    const chosen = groups.slice(offset, offset + limit), outGroups = chosen.map(g => ({
      topicId: g.topicId, name: text(g.name, 200), icon: text(g.icon, 40), segment: g.segment, empty: g.empty,
      current: [...g.current, ...g.undated].slice(0, rowLimit).map(publicRow), undated: [], old: g.old.slice(0, rowLimit).map(publicRow),
      windows: {current: page(0, g.current.length + g.undated.length, Math.min(rowLimit, g.current.length + g.undated.length), rowLimit), old: page(0, g.old.length, Math.min(rowLimit, g.old.length), rowLimit)},
    }));
    const outUncollected = uncollected.slice(uncollectedOffset, uncollectedOffset + rowLimit).map(publicRow), outPending = pending.slice(pendingOffset, pendingOffset + rowLimit).map(publicRow);
    const refIds = [...new Set([...outGroups.flatMap(g => [...g.current, ...g.old]), ...outUncollected, ...outPending].map(r => r.refId))], topicIds = outGroups.map(g => g.topicId);
    const reply = {kind: 'pro-frame-page', protocol: PRO_FRAME_PROTOCOL, versions: publicVersions(snapshot.versions),
      status: publicStatus({...status, mode, selectedProjectIds, segment}),
      view: {mode, native: view?.native ?? null},
      projection: {groups: outGroups, uncollected: outUncollected, pending: outPending, maxSegment: Math.max(0, ...p.groups.map(g => g.segment ?? 0), ...snapshot.references.map(r => dec(r.id) ?? 0)),
        windows: {uncollected: page(uncollectedOffset, uncollected.length, outUncollected.length, rowLimit), pending: page(pendingOffset, pending.length, outPending.length, rowLimit)}},
      display: displayFor(state, refIds, topicIds), items: sourceItems(snapshot, refIds), projects: projectChoices(snapshot, view?.native),
      page: page(offset, groups.length, chosen.length, limit)};
    try { return validatePublicProReply('view', reply); }
    catch (e) { if (!['pro-public-size','pro-public-complexity'].includes(e.message)) throw e; if (limit > 1) limit = Math.max(1, Math.floor(limit / 2)); else if (rowLimit > 1) rowLimit = Math.max(1, Math.floor(rowLimit / 2)); else throw e; }
  }
}

export function projectPublicPanel({state, snapshot, status = {}, kind, id: targetId = null, offset = 0, limit = 24, records = []}) {
  checkSource(state,snapshot);
  if (!panelKinds.includes(kind) || !integer(offset) || !integer(limit, kind==='series-detail'?200:100) || !limit) throw Error('invalid-pro-public-panel');
  if(['reference','topic','collect','series','series-detail','series-edges'].includes(kind)&&!id(targetId))throw Error('invalid-pro-public-panel');
  if(kind==='series-detail')return projectSeriesDetail({state,snapshot,status,seriesId:targetId,offset,limit});
  if(kind==='series-edges')return projectSeriesEdges({state,snapshot,status,seriesId:targetId,offset,limit});
  if(['settings','legacy-resolutions','project-choices'].includes(kind))return projectChoicePanel({state,snapshot,status,kind,offset,limit});
  let refIds = [], topicIds = [], total = 0, proposalIds=[], seriesIds=null;
  const topics = list(state.topics).filter(t => t.lifecycle === 'active');
  if (kind === 'reference') {
    refIds = snapshot.references.some(r => r.id === targetId) ? [targetId] : [];
    topicIds = topics.slice(offset, offset + limit).map(t => t.id); total = topics.length;
    const protectedTopics = new Set(list(state.placements).filter(p=>p.conversationId===targetId).map(p=>p.topicId));
    for (const c of list(state.constraints)) if(c.refId===targetId&&c.topicId)protectedTopics.add(c.topicId);
    for (const key of state.legacyResolutions?.[targetId]?.candidates??[])protectedTopics.add(key);
    if(protectedTopics.size>100)throw Error('pro-reference-relations-require-paging');
    topicIds=[...new Set([...protectedTopics,...topicIds])];
  } else if (kind === 'topic') {
    if (!state.topics[targetId]) throw Error('pro-topic-unavailable');
    const members = [...new Set(list(state.placements).filter(p => p.topicId === targetId && p.state === 'included').map(p => p.conversationId))];
    refIds = members.slice(offset, offset + limit); topicIds = [targetId, ...topics.filter(t => t.id !== targetId).slice(0, 23).map(t => t.id)]; total = members.length;
  } else if (kind === 'collect') {
    const eligible = snapshot.references.filter(r => r.available && (r.membership.state === 'NONE' && snapshot.capabilities?.positiveNone !== 'unavailable' || status.mode === 'pro-cross-project' && r.membership.state==='PROJECT' && status.selectedProjectIds?.includes(r.membership.projectId)));
    refIds = eligible.slice(offset, offset + limit).map(r => r.id); total = eligible.length; topicIds = topics.slice(0, 24).map(t => t.id);
  } else if(kind==='series') {
    if(!state.topics[targetId])throw Error('pro-topic-unavailable');
    limit=Math.min(limit,24);const all=list(state.series).filter(s=>s.topicId===targetId);
    topicIds=[targetId];seriesIds=all.slice(offset,offset+limit).map(s=>s.id);total=all.length;
  } else if(kind==='suggestions') {
    limit=Math.min(limit,24);const all=Object.keys(state.proposals??{});proposalIds=all.slice(offset,offset+limit);total=all.length;seriesIds=[];
  } else if(kind==='records') {
    limit=Math.min(limit,24);seriesIds=[];
  } else {
    topicIds = topics.slice(offset, offset + limit).map(t => t.id); total = topics.length;
  }
  const reply = {kind: 'pro-panel-page', protocol: PRO_FRAME_PROTOCOL, panel: kind, versions: publicVersions(snapshot.versions), status: publicStatus(status),
    display: displayFor(state, refIds, topicIds, {proposalIds,seriesIds}), items: sourceItems(snapshot, refIds), projects: [], page: page(offset, total, Math.min(limit, Math.max(0, total - offset)), limit)};
  if (kind === 'records') {const projected=projectPublicRecords({records,state,snapshot,offset,limit,maxBytes:PRO_FRAME_BYTES-new TextEncoder().encode(JSON.stringify(reply)).length-1024});reply.operations=projected.items;reply.page=projected.page;}
  return validatePublicProReply('view', reply);
}

function projectChoicePanel({state,snapshot,status,kind,offset,limit}) {
  const legacy=kind==='legacy-resolutions',project=kind==='project-choices',all=legacy?list(state.legacyResolutions).filter(r=>r.status==='primary-resolution-required'):project?snapshot.projects??[]:list(state.topics).filter(t=>t.lifecycle==='active');
  let cap=Math.min(limit,legacy||project?24:100);
  for(;;){
    // A just-resolved page may have disappeared. Rebase only its read cursor;
    // the subsequent per-reference command still has a fresh frozen review.
    const start=all.length?(offset<all.length?offset:Math.floor((all.length-1)/cap)*cap):0,selected=all.slice(start,start+cap),refIds=legacy?selected.map(r=>r.refId):[];
    const display=legacy||project?emptyDisplay(state.scopeKey):displayFor(state,[],selected.map(t=>t.id),{seriesIds:[]});
    if(legacy)for(const r of selected)display.legacyResolutions[r.refId]={refId:r.refId,status:r.status,candidates:[],preservedPlacements:[]};
    const reply={kind:'pro-panel-page',protocol:PRO_FRAME_PROTOCOL,panel:kind,versions:publicVersions(snapshot.versions),status:publicStatus(status),display,items:sourceItems(snapshot,refIds),projects:project?projectChoices({projects:selected}):[],page:page(start,all.length,selected.length,cap)};
    try{return validatePublicProReply('view',reply);}catch(error){if(!['pro-public-size','pro-public-complexity'].includes(error.message)||cap===1)throw error;cap=Math.max(1,Math.floor(cap/2));}
  }
}

function projectSeriesDetail({state,snapshot,status,seriesId,offset,limit}) {
  const s=state.series[seriesId];if(!s)throw Error('pro-series-unavailable');
  let complete=offset===0&&s.entries.length<=200&&s.edges.length<=400,cap=complete?Math.max(1,s.entries.length):Math.min(limit,100);
  for(;;){
    const entries=s.entries.slice(offset,offset+cap),selected=new Set(entries),edges=s.edges.filter(e=>selected.has(e.from)&&selected.has(e.to)),labels=s.labels.filter(l=>selected.has(l.refId));
    const display=displayFor(state,entries,[s.topicId],{seriesIds:[]});display.series[s.id]=seriesDisplay(s,{entries,edges,labels,detailsComplete:complete});
    const reply={kind:'pro-panel-page',protocol:PRO_FRAME_PROTOCOL,panel:'series-detail',versions:publicVersions(snapshot.versions),status:publicStatus(status),display,items:sourceItems(snapshot,entries),projects:[],page:page(offset,s.entries.length,entries.length,cap)};
    try{return validatePublicProReply('view',reply);}catch(error){if(!['pro-public-size','pro-public-complexity'].includes(error.message)||cap===1)throw error;complete=false;cap=Math.max(1,Math.floor(cap/2));}
  }
}

function projectSeriesEdges({state,snapshot,status,seriesId,offset,limit}) {
  const s=state.series[seriesId];if(!s)throw Error('pro-series-unavailable');
  let cap=Math.min(limit,100);
  for(;;){
    const edges=s.edges.slice(offset,offset+cap),entries=[...new Set(edges.flatMap(e=>[e.from,e.to]))],selected=new Set(entries),labels=s.labels.filter(l=>selected.has(l.refId));
    const display=displayFor(state,entries,[s.topicId],{seriesIds:[]});display.series[s.id]=seriesDisplay(s,{entries,edges,labels});
    const reply={kind:'pro-panel-page',protocol:PRO_FRAME_PROTOCOL,panel:'series-edges',versions:publicVersions(snapshot.versions),status:publicStatus(status),display,items:sourceItems(snapshot,entries),projects:[],page:page(offset,s.edges.length,edges.length,cap)};
    try{return validatePublicProReply('view',reply);}catch(error){if(!['pro-public-size','pro-public-complexity'].includes(error.message)||cap===1)throw error;cap=Math.max(1,Math.floor(cap/2));}
  }
}

function patchLabel(p, state, snapshot) {
  const after = p.after ?? p.before, nativeTitle = refId => snapshot.references.find(r => r.id === refId)?.nativeTitle ?? '已保存聊天';
  if (p.kind === 'placement' && after) return `${nativeTitle(after.conversationId)} → ${state.topics[after.topicId]?.name ?? '已保存主题'} · ${after.role === 'primary' ? '主收录' : '关联'}`;
  if (p.kind === 'derived-title' && after) return `${nativeTitle(after.conversationId)} → ${after.displayPreference === 'native' ? '持续显示原名' : after.title ?? '原名'}`;
  return `${p.after === null ? '移除：' : ''}${after?.name ?? after?.title ?? state.topics[p.key]?.name ?? ({constraint:'人工设置',series:'工作线',redirect:'主题来路'}[p.kind] ?? '整理内容')}`;
}
export function projectPublicRecords({records = [], state, snapshot, offset = 0, limit = 24, maxBytes = PRO_FRAME_BYTES}) {
  checkSource(state,snapshot);
  if(!integer(offset)||!integer(limit,100)||!limit||!integer(maxBytes,PRO_FRAME_BYTES)||maxBytes<1024)throw Error('invalid-pro-public-records');
  const all = records.map(r => r.transaction ?? r).filter(r => r.actor !== 'system').reverse();
  let cap=Math.min(limit,24),changeCap=200;
  for(;;){const items=all.slice(offset,offset+cap).map(r=>({operationId:r.operationId,actor:r.actor,status:r.status,
    changes:(r.patch??[]).slice(0,changeCap).map(p=>({kind:p.kind,key:p.key,label:text(patchLabel(p,state,snapshot),500)})),changesTruncated:(r.patch?.length??0)>changeCap}));
    const reply={kind:'pro-records-page',protocol:PRO_FRAME_PROTOCOL,items,page:page(offset,all.length,items.length,cap)};
    try{if(new TextEncoder().encode(JSON.stringify(reply)).length>maxBytes)throw Error('pro-public-size');return validatePublicProReply('view',reply);}catch(error){if(!['pro-public-size','pro-public-complexity'].includes(error.message))throw error;if(cap>1)cap=Math.max(1,Math.floor(cap/2));else if(changeCap>1)changeCap=Math.max(1,Math.floor(changeCap/2));else throw error;}
  }
}

/** One operation review window. Only a private worker-held preview can select
 * the operation; graph values, inverse data and the journal never leave here. */
export function projectPublicOperationReview({operation,state,snapshot,previewId,offset=0,limit=24}) {
  checkSource(state,snapshot);
  if(!id(previewId)||!id(operation?.operationId)||operation.base?.scopeKey!==state.scopeKey||!['human','automation'].includes(operation.actor)||!['applied','undone'].includes(operation.status)||!Array.isArray(operation.patch)||operation.patch.length>20000||!integer(offset)||offset>operation.patch.length||!integer(limit,100)||!limit)throw Error('invalid-pro-operation-review');
  let cap=limit;
  for(;;){
    const changes=operation.patch.slice(offset,offset+cap).map(p=>({kind:p.kind,key:p.key,label:text(patchLabel(p,state,snapshot),500)}));
    const reply={kind:'pro-operation-page',protocol:PRO_FRAME_PROTOCOL,versions:publicVersions(snapshot.versions),previewId,operationId:operation.operationId,actor:operation.actor,operationStatus:operation.status,changes,page:page(offset,operation.patch.length,changes.length,cap)};
    try{return validatePublicProReply('view',reply);}catch(error){if(!['pro-public-size','pro-public-complexity'].includes(error.message)||cap===1)throw error;cap=Math.max(1,Math.floor(cap/2));}
  }
}

export function projectPublicRows({state, snapshot, status = {}, topicId, lane = 'current', offset = 0, limit = 17}) {
  checkSource(state,snapshot);
  if (!['current', 'old'].includes(lane) || !integer(offset) || !integer(limit, 200) || !limit) throw Error('invalid-pro-public-rows');
  const p = projectTopicGroups(state, snapshot, {mode: status.mode ?? 'pro-default-none', selectedProjectIds: status.selectedProjectIds ?? []}), g = p.groups.find(x => x.topicId === topicId);
  if (!g) throw Error('pro-topic-unavailable');
  const all = lane === 'current' ? [...g.current, ...g.undated] : g.old;
  let cap = limit;
  for (;;) {
    const rows = all.slice(offset, offset + cap), refIds = rows.map(r => r.refId), reply = {kind: 'pro-rows-page', protocol: PRO_FRAME_PROTOCOL, versions: publicVersions(snapshot.versions), topicId, lane,
      items: sourceItems(snapshot, refIds), rows: rows.map(publicRow), display: displayFor(state, refIds, [topicId]), page: page(offset, all.length, rows.length, cap)};
    try { return validatePublicProReply('view', reply); } catch (e) { if (!['pro-public-size','pro-public-complexity'].includes(e.message) || cap === 1) throw e; cap = Math.max(1, Math.floor(cap / 2)); }
  }
}
export function projectPublicSearch({state, snapshot, status = {}, query = '', topicId = null, limit = 24}) {
  checkSource(state,snapshot);
  const items = searchProReferences(state, snapshot, query, {topicId, limit, mode: status.mode ?? 'pro-default-none', selectedProjectIds: status.selectedProjectIds ?? []}).map(r => ({...r, displayTitle: text(r.displayTitle, 1000), nativeTitle: text(r.nativeTitle, 1000), contexts: r.contexts.slice(0, 24)}));
  return validatePublicProReply('view', {kind: 'pro-search-page', protocol: PRO_FRAME_PROTOCOL, items, page: page(0, items.length, items.length, limit)});
}
export function projectPublicPreview({preview, previewId}) {
  if (!id(previewId)) throw Error('invalid-pro-preview-id');
  const reply = {kind: preview.kind === 'manual-series-plan' ? 'manual-series-plan' : 'pro-preview', protocol: PRO_FRAME_PROTOCOL, previewId,
    proposal: !!preview.proposal, conflicts: (preview.conflicts ?? []).slice(0, 100).map(c => pick(c, ['kind', 'reason', 'refId', 'conversationId', 'topicId', 'key'])),
    summary: text(preview.proposal?.summary ?? preview.summary, 1000)};
  for (const key of ['state', 'inverseHash', 'planHash', 'chosenPrimary', 'preservedAssetDigest']) if (own(preview, key)) reply[key] = preview[key];
  if (preview.expected) reply.expected = publicVersions(preview.expected);
  if (preview.patch) reply.changes = preview.patch.slice(0, 40).map(p => ({kind: p.kind, key: p.key, label: text(p.after?.name ?? p.after?.title ?? p.before?.name ?? p.before?.title ?? p.kind, 500)}));
  return validatePublicProReply('commit', reply);
}

const keys = {
  'pro-frame-page': ['kind','protocol','versions','status','view','projection','display','items','projects','page'],
  'pro-panel-page': ['kind','protocol','panel','versions','status','display','items','projects','page','operations'],
  'pro-rows-page': ['kind','protocol','versions','topicId','lane','items','rows','display','page'],
  'pro-search-page': ['kind','protocol','items','page'],
  'pro-records-page': ['kind','protocol','items','page'],
  'pro-operation-page': ['kind','protocol','versions','previewId','operationId','actor','operationStatus','changes','page'],
  'pro-preview': ['kind','protocol','previewId','proposal','conflicts','summary','state','inverseHash','planHash','chosenPrimary','preservedAssetDigest','expected','changes'],
  'manual-series-plan': ['kind','protocol','previewId','proposal','conflicts','summary','expected','changes','planHash'],
  'pro-result': ['kind','protocol','state','operationId','replayed','anchor','message','nativeLink'],
  'pro-status': ['kind','protocol','status'],
};
const permitted = {sharedSnapshot:['pro-status','pro-frame-page'],view:['pro-frame-page','pro-panel-page','pro-rows-page','pro-search-page','pro-records-page','pro-operation-page','pro-status'],commit:['pro-result','pro-preview','manual-series-plan'],evidence:['pro-result','pro-panel-page','pro-status'],navigation:['pro-result'],background:['pro-result','pro-status']};
const forbidden = new Set(['grant','grants','grantid','scopegrantid','intent','ticket','executionticket','credential','credentials','apikey','secret','password','authority','authorization','token','accesstoken','refreshtoken','binding','parentframe','evidencepack','metadataevidence','handlemap','privateindex','nativeindex','overlay','patch','inverse','readset','sourcegeneration','nativefields','targets']);
function shape(value,allowed,required=allowed){
  if(!rec(value)||Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!own(value,k)))throw Error('invalid-pro-public-shape');
}
function checkControl(value){shape(value,['mode','locked']);if(!['auto','human'].includes(value.mode)||typeof value.locked!=='boolean')throw Error('invalid-pro-public-control');}
function checkMembership(value){shape(value,value?.state==='PROJECT'?['state','projectId']:['state']);if(!['NONE','PROJECT','UNKNOWN'].includes(value.state)||value.state==='PROJECT'&&!id(value.projectId))throw Error('invalid-pro-public-membership');}
function checkItem(value){shape(value,['id','nativeTitle','available','membership']);if(!id(value.id)||typeof value.nativeTitle!=='string'||value.nativeTitle.length>2048||typeof value.available!=='boolean')throw Error('invalid-pro-public-item');checkMembership(value.membership);}
function checkRow(value){shape(value,['refId','displayTitle','available','membership','context','titleDisplayPreference']);if(!id(value.refId)||typeof value.displayTitle!=='string'||value.displayTitle.length>2048||typeof value.available!=='boolean'||!['primary-topic','related-topic','uncollected','pending'].includes(value.context)||!['derived','native'].includes(value.titleDisplayPreference))throw Error('invalid-pro-public-row');checkMembership(value.membership);}
function checkPage(value){shape(value,['offset','total','count','limit','hasMore']);if(!['offset','total','count','limit'].every(k=>integer(value[k]))||value.count>value.limit||typeof value.hasMore!=='boolean'||value.hasMore!==(value.offset+value.count<value.total))throw Error('invalid-pro-public-page');}
function checkStatus(value){
  shape(value,['authorized','entitlement','processingMode','modelAvailability','cloudBudget','metadataOnly','positiveNone','persistence','mode','selectedProjectIds','segment','launchContext']);
  if(typeof value.authorized!=='boolean'||!['pro','active','free'].includes(value.entitlement)||!['off','local'].includes(value.processingMode)||!['local-rules','unavailable'].includes(value.modelAvailability)||value.cloudBudget!==0||value.metadataOnly!==true||!['available','unavailable'].includes(value.positiveNone)||!['same-idb','memory-only','session-only','unavailable'].includes(value.persistence)||!modes.includes(value.mode)||!ids(value.selectedProjectIds,100)||!integer(value.segment))throw Error('invalid-pro-public-status');
  if(value.launchContext!==null){const c=value.launchContext;shape(c,['referenceId','topicId','seriesId','nativeProjectId','nextReferenceId','origin']);if(!id(c.referenceId)||!['topicId','seriesId','nativeProjectId','nextReferenceId'].every(k=>nullableId(c[k]))||!['topic','native-project','search','working-set','direct'].includes(c.origin)||c.origin==='topic'&&c.topicId===null||c.origin==='native-project'&&c.nativeProjectId===null||c.nextReferenceId!==null&&(c.topicId===null||c.seriesId===null||c.nextReferenceId===c.referenceId))throw Error('invalid-pro-public-launch');}
}
function checkDisplay(value){
  const allowed=['scopeKey','topics','titles','placements','constraints','series','legacyResolutions','proposals'];shape(value,allowed);if(!id(value.scopeKey))throw Error('invalid-pro-public-display');
  for(const k of allowed.filter(k=>k!=='scopeKey')){if(!rec(value[k])||Object.keys(value[k]).some(k=>!id(k)))throw Error('invalid-pro-public-display');if(Object.keys(value[k]).length>200)throw Error('pro-public-size');}
  for(const [key,t] of Object.entries(value.topics)){shape(t,['id','name','lifecycle','icon','nameControl','membershipControl']);if(t.id!==key||!string(t.name,200)||!string(t.icon,40)||!['proposed','active','redirected','trashed'].includes(t.lifecycle))throw Error('invalid-pro-public-topic');checkControl(t.nameControl);checkControl(t.membershipControl);}
  for(const [key,t] of Object.entries(value.titles)){shape(t,['conversationId','title','displayPreference','control']);if(t.conversationId!==key||!(t.title===null||string(t.title,200))||!['native','derived'].includes(t.displayPreference))throw Error('invalid-pro-public-title');checkControl(t.control);}
  for(const p of list(value.placements)){shape(p,['conversationId','topicId','role','state','control']);if(!id(p.conversationId)||!id(p.topicId)||!['primary','related'].includes(p.role)||!['included','dormant-native-membership','revalidation-needed'].includes(p.state))throw Error('invalid-pro-public-placement');checkControl(p.control);}
  for(const c of list(value.constraints)){shape(c,c.kind==='exclude-topic'?['kind','refId','topicId']:['kind','refId']);if(!['exclude-topic','exclude-ai-processing'].includes(c.kind)||!id(c.refId)||c.kind==='exclude-topic'&&!id(c.topicId))throw Error('invalid-pro-public-constraint');}
  for(const [key,s] of Object.entries(value.series)){
    shape(s,['id','topicId','title','entries','edges','labels','totalEntries','totalEdges','detailsComplete']);
    if(s.id!==key||!id(s.topicId)||!string(s.title,200)||!ids(s.entries,200)||!Array.isArray(s.edges)||!Array.isArray(s.labels)||!integer(s.totalEntries,2000)||!integer(s.totalEdges,4000)||typeof s.detailsComplete!=='boolean'||s.totalEntries<s.entries.length||s.totalEdges<s.edges.length)throw Error('invalid-pro-public-series');
    if(s.edges.length>400||s.labels.length>200)throw Error('pro-public-size');
    if(s.detailsComplete&&(s.entries.length!==s.totalEntries||s.edges.length!==s.totalEdges))throw Error('invalid-pro-public-series');
    const refs=new Set(s.entries);
    for(const e of s.edges){shape(e,['kind','from','to']);if(!['continuation','branch'].includes(e.kind)||!id(e.from)||!id(e.to)||!refs.has(e.from)||!refs.has(e.to)||e.from===e.to)throw Error('invalid-pro-public-series-edge');}
    const labeled=new Set();for(const l of s.labels){shape(l,['refId','sequence','source']);if(!id(l.refId)||!refs.has(l.refId)||labeled.has(l.refId)||!['human-confirmed','evidence-confirmed'].includes(l.source)||l.sequence!==null&&(!Array.isArray(l.sequence)||!l.sequence.length||l.sequence.length>12||!l.sequence.every(n=>integer(n))))throw Error('invalid-pro-public-series-label');labeled.add(l.refId);}
  }
  for(const [key,r] of Object.entries(value.legacyResolutions)){shape(r,['refId','status','candidates','preservedPlacements']);if(r.refId!==key||!['primary-resolution-required','resolved'].includes(r.status)||!ids(r.candidates,100)||!Array.isArray(r.preservedPlacements)||r.preservedPlacements.length>100)throw Error('invalid-pro-public-legacy');for(const p of r.preservedPlacements){shape(p,['workspaceId','locked']);if(!id(p.workspaceId)||typeof p.locked!=='boolean')throw Error('invalid-pro-public-legacy');}}
  for(const [key,r] of Object.entries(value.proposals)){shape(r,['state','proposal']);shape(r.proposal,['id','planHash','kind','summary','rationale']);const p=r.proposal;if(p.id!==key||!hash(p.planHash)||!['proposed','validated','awaiting-review','rejected','stale','applied'].includes(r.state)||!['existing-topic','new-topic','multi-topic','derived-title','topic-relation','series-plan','merge-plan','split-plan','unknown'].includes(p.kind)||!string(p.summary,500)||!Array.isArray(p.rationale)||p.rationale.length>8||p.rationale.some(x=>!string(x,500)))throw Error('invalid-pro-public-proposal');}
}
function checkChanges(items){if(!Array.isArray(items)||items.length>200)throw Error('invalid-pro-public-changes');for(const x of items){shape(x,['kind','key','label']);if(!id(x.key)||!id(x.kind)||!string(x.kind,80)||!string(x.label,500))throw Error('invalid-pro-public-change');}}
function checkOperation(op){shape(op,['operationId','actor','status','changes','changesTruncated']);if(!id(op.operationId)||!['human','automation'].includes(op.actor)||!['applied','undone'].includes(op.status)||typeof op.changesTruncated!=='boolean')throw Error('invalid-pro-public-operation');checkChanges(op.changes);}
function checkVersions(v){shape(v,['scopeKey','authorizationEpoch','overlayRevision','reviewId']);if(!id(v.scopeKey)||!hash(v.reviewId)||!integer(v.authorizationEpoch)||!integer(v.overlayRevision))throw Error('invalid-pro-public-versions');}
function checkAnchor(a){
  if(a===null)return;
  shape(a,['cardId','refId','segment','scrollOffset','openOldItems','sidebarChoices']);
  if(!nullableId(a.cardId)||!nullableId(a.refId)||!integer(a.segment)||typeof a.scrollOffset!=='number'||!Number.isFinite(a.scrollOffset)||a.scrollOffset<0||a.scrollOffset>1e8||!ids(a.openOldItems,2000)||!ids(a.sidebarChoices,2000))throw Error('invalid-pro-public-anchor');
}
function checkNativeLink(value){
  shape(value,['refId','url','disposition']);
  if(!id(value.refId)||!string(value.url,2048)||value.disposition!=='new-tab-preserve-current')throw Error('invalid-pro-native-link');
  let url,route;try{
    url=new URL(value.url);
    const approved=url.origin==='https://chatgpt.com'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(!approved||url.username||url.password)throw Error('origin');
    route=createURLPolicy({origin:url.origin}).parse(value.url);
  }catch{throw Error('invalid-pro-native-link');}
  if(route.kind!=='conversation'||route.conversationId!==value.refId||route.navigationURL!==value.url)throw Error('invalid-pro-native-link');
}
function checkPreview(v){
  if(!id(v.previewId)||typeof v.proposal!=='boolean'||!Array.isArray(v.conflicts)||v.conflicts.length>100||!string(v.summary,1000))throw Error('invalid-pro-public-preview');
  for(const c of v.conflicts){shape(c,['kind','reason','refId','conversationId','topicId','key'],['kind']);if(!id(c.kind)||!string(c.kind,80)||own(c,'reason')&&!string(c.reason,500)||['refId','conversationId','topicId','key'].some(k=>own(c,k)&&!id(c[k])))throw Error('invalid-pro-public-conflict');}
  if(own(v,'state')&&!['ready','conflict'].includes(v.state)||['inverseHash','planHash','preservedAssetDigest'].some(k=>own(v,k)&&!hash(v[k]))||own(v,'chosenPrimary')&&!nullableId(v.chosenPrimary))throw Error('invalid-pro-public-preview');
  if(own(v,'expected'))checkVersions(v.expected);
  if(own(v,'changes'))checkChanges(v.changes);
}

// Free's existing DTO remains a display-only value. Check every nested field so
// a valid Free top-level key cannot become an arbitrary-object escape hatch.
const freshness = x => x===null||['current','last-known','revalidation-needed','unknown'].includes(x);
const nullableText = (x,max) => x===null||string(x,max);
function checkNativeRow(r,{search=false,working=false}={}){
  if(search&&r.kind==='project'){
    shape(r,['kind','id','nativeName','nativeUrl','freshness','available']);if(!id(r.id)||!nullableText(r.nativeName,2048)||!nullableText(r.nativeUrl,4096)||!freshness(r.freshness)||typeof r.available!=='boolean')throw Error('invalid-pro-native-row');return;
  }
  const allowed=['id','available','freshness','nativeTitle','displayTitle','nativeUrl','membership','membershipFreshness','projectId','segment',...(search?['snippetMatches']:[])];
  shape(r,allowed,search?['id','nativeTitle','displayTitle','nativeUrl','membership','projectId','freshness']:working?['id','available','displayTitle','nativeTitle','nativeUrl','membership','projectId']:allowed);
  if(!id(r.id)||!nullableText(r.nativeTitle,2048)||!string(r.displayTitle,2048)||!nullableText(r.nativeUrl,4096)||!['NONE','PROJECT','UNKNOWN'].includes(r.membership)||!nullableId(r.projectId)||own(r,'available')&&typeof r.available!=='boolean'||own(r,'freshness')&&!freshness(r.freshness)||own(r,'membershipFreshness')&&!freshness(r.membershipFreshness)||own(r,'segment')&&r.segment!==null&&!integer(r.segment))throw Error('invalid-pro-native-row');
  if(own(r,'snippetMatches')){if(!Array.isArray(r.snippetMatches)||r.snippetMatches.length>100)throw Error('invalid-pro-native-row');for(const s of r.snippetMatches){shape(s,['id','preview']);if(!id(s.id)||!string(s.preview,160))throw Error('invalid-pro-native-row');}}
}
function checkNativeWindow(w,checkItem,{extra=[],requiredExtra=[],limit=200}={}){
  shape(w,['items','total','offset','limit','hasMore',...extra],['items','total','offset','limit','hasMore',...requiredExtra]);
  if(!Array.isArray(w.items)||w.items.length>limit||!integer(w.total)||!integer(w.offset)||!integer(w.limit,200)||!w.limit||w.items.length>w.limit||typeof w.hasMore!=='boolean'||w.hasMore!==(w.offset+w.items.length<w.total))throw Error('invalid-pro-native-window');
  w.items.forEach(checkItem);
  if(own(w,'paged')&&w.paged!==true||own(w,'inventoryTotal')&&!integer(w.inventoryTotal))throw Error('invalid-pro-native-window');
}
function checkNativeGroup(g){
  shape(g,['id','nativeName','name','freshness','nativeUrl','segment','memberCount','lists']);
  if(!id(g.id)||!nullableText(g.nativeName,2048)||!string(g.name,2048)||!freshness(g.freshness)||!nullableText(g.nativeUrl,4096)||g.segment!==null&&!integer(g.segment)||!integer(g.memberCount))throw Error('invalid-pro-native-group');
  shape(g.lists,['current','old','unknown']);for(const w of Object.values(g.lists))checkNativeWindow(w,checkNativeRow,{extra:['paged']});
}
function checkNativePage(n,scopeKey){
  const required=['compactRows','protocol','role','scope','revision','workspaceRevision','evidenceRevision','viewRevision','viewSession','segment','timePolicy','navigation','groups','entries','selection','inventory','completeSnapshot'];
  shape(n,[...required,'currentProject','current','currentRef','search','workingSet','presentation','localAssetAccess'],required);
  const evidenceRevision=integer(n.evidenceRevision)||typeof n.evidenceRevision==='string'&&/^\d{1,16}:\d{1,16}$/u.test(n.evidenceRevision)&&n.evidenceRevision.split(':').every(v=>integer(Number(v)));
  if(n.protocol!=='vaiwl-free-frame/1'||n.completeSnapshot!==false||typeof n.compactRows!=='boolean'||!['workspace','sidebar'].includes(n.role)||n.scope!==scopeKey||!['revision','workspaceRevision','viewRevision','segment'].every(k=>integer(n[k]))||!evidenceRevision)throw Error('invalid-pro-native-page');
  if(n.viewSession!==null){const v=n.viewSession;shape(v,['H','T','Z','policyRevision']);if(![7,14,30,60,90].includes(v.H)||typeof v.T!=='number'||!Number.isFinite(v.T)||!string(v.Z,100)||!integer(v.policyRevision))throw Error('invalid-pro-native-page');}
  shape(n.timePolicy,['mode','H','revision']);if(!['fixed','auto'].includes(n.timePolicy.mode)||![7,14,30,60,90].includes(n.timePolicy.H)||!integer(n.timePolicy.revision))throw Error('invalid-pro-native-page');
  shape(n.navigation,['hasNewer','hasOlder','maxSegment']);if(typeof n.navigation.hasNewer!=='boolean'||typeof n.navigation.hasOlder!=='boolean'||!integer(n.navigation.maxSegment))throw Error('invalid-pro-native-page');
  checkNativeWindow(n.groups,checkNativeGroup,{limit:24});
  shape(n.entries,['noProject','unknown']);for(const w of Object.values(n.entries))checkNativeWindow(w,checkNativeRow,{extra:['inventoryTotal','paged'],requiredExtra:['inventoryTotal']});
  if(n.selection!==null){checkNativeWindow(n.selection,checkNativeRow,{extra:['groupId','list','paged'],requiredExtra:['groupId','list']});if(!nullableId(n.selection.groupId)||!['current','old','unknown','noProject'].includes(n.selection.list))throw Error('invalid-pro-native-page');}
  shape(n.inventory,['projects','refs','omittedProjects','omittedRefs','complete']);if(!integer(n.inventory.projects)||!integer(n.inventory.refs)||typeof n.inventory.complete!=='boolean'||['omittedProjects','omittedRefs'].some(k=>n.inventory[k]!==null&&!integer(n.inventory[k])))throw Error('invalid-pro-native-page');
  if(own(n,'currentProject'))checkNativeGroup(n.currentProject);
  if(own(n,'current')){shape(n.current,['nativeUrl','refId','projectId']);if(!nullableText(n.current.nativeUrl,4096)||!nullableId(n.current.refId)||!nullableId(n.current.projectId))throw Error('invalid-pro-native-page');}
  if(own(n,'currentRef')&&n.currentRef!==null)checkNativeRow(n.currentRef);
  if(own(n,'search')){checkNativeWindow(n.search,r=>checkNativeRow(r,{search:true}),{extra:['query','projectId'],requiredExtra:['query','projectId'],limit:24});if(!string(n.search.query,200)||!nullableId(n.search.projectId))throw Error('invalid-pro-native-page');}
  if(own(n,'workingSet')){checkNativeWindow(n.workingSet,r=>checkNativeRow(r,{working:true}),{extra:['currentRefId'],requiredExtra:['currentRefId'],limit:24});if(!nullableId(n.workingSet.currentRefId))throw Error('invalid-pro-native-page');}
  if(own(n,'presentation')){shape(n.presentation,['revision','intent']);if(!integer(n.presentation.revision))throw Error('invalid-pro-native-page');const i=n.presentation.intent;shape(i,i?.kind==='search-known'?['kind','themeId']:['kind']);if(!['show-workspace','enter-reading','show-native-page','search-known','show-working-set'].includes(i.kind)||i.kind==='search-known'&&!nullableId(i.themeId))throw Error('invalid-pro-native-page');}
  if(own(n,'localAssetAccess')&&!['available','confirmation-required'].includes(n.localAssetAccess))throw Error('invalid-pro-native-page');
}
function assertJSON(value) {
  let count = 0; const seen = new WeakSet();
  function walk(v, depth) {
    if (++count > 8192 || depth > 16) throw Error('pro-public-complexity');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || seen.has(v) || (!Array.isArray(v) && !rec(v))) throw Error('invalid-pro-public-json');
    seen.add(v); const ds = Object.getOwnPropertyDescriptors(v);
    if (Array.isArray(v) && (Object.getPrototypeOf(v) !== Array.prototype || v.length > 8192 || Reflect.ownKeys(ds).length !== v.length + 1)) throw Error('invalid-pro-public-json');
    for (const key of Reflect.ownKeys(ds)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = ds[key]; if (typeof key !== 'string' || !own(d, 'value') || !d.enumerable || ['__proto__','prototype','constructor'].includes(key)) throw Error('invalid-pro-public-json');
      if(Array.isArray(v)&&(!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=v.length))throw Error('invalid-pro-public-json');
      const normalized = key.replace(/[_-]/g, '').toLowerCase();
      if (forbidden.has(normalized) || ['references','refs','activities'].includes(key) && Array.isArray(d.value) || key === 'completeSnapshot' && d.value !== false || key === 'context' && !['primary-topic','related-topic','uncollected','pending'].includes(d.value)) throw Error('pro-private-public-field');
      walk(d.value, depth + 1);
    } seen.delete(v);
  }
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > PRO_FRAME_BYTES) throw Error('pro-public-size');
}
/** Validate before use on both worker and frame. Action-specific top-level
 * shapes and bounded display maps prevent an accidental full model projection. */
export function validatePublicProReply(action, value) {
  assertJSON(value);
  if (!rec(value) || value.protocol !== PRO_FRAME_PROTOCOL || !permitted[action]?.includes(value.kind) || !keys[value.kind] || Object.keys(value).some(k => !keys[value.kind].includes(k))) throw Error('invalid-pro-public-reply');
  const required=keys[value.kind].filter(k=>!['operations','state','inverseHash','planHash','chosenPrimary','preservedAssetDigest','expected','changes','operationId','replayed','anchor','message','nativeLink'].includes(k));
  if(required.some(k=>!own(value,k)))throw Error('invalid-pro-public-reply');
  if(own(value,'versions'))checkVersions(value.versions);
  if(own(value,'status'))checkStatus(value.status);
  if(own(value,'display')){checkDisplay(value.display);if(value.display.scopeKey!==value.versions?.scopeKey)throw Error('cross-scope-pro-display');}
  if (own(value,'items') && (!Array.isArray(value.items) || value.items.length > 200)) throw Error('invalid-pro-public-items');
  if(own(value,'page'))checkPage(value.page);
  if(['pro-frame-page','pro-panel-page','pro-rows-page'].includes(value.kind))for(const item of value.items)checkItem(item);
  if(own(value,'projects')){if(!Array.isArray(value.projects)||value.projects.length>100)throw Error('invalid-pro-public-projects');for(const item of value.projects){shape(item,['id','name']);if(!id(item.id)||!string(item.name,200))throw Error('invalid-pro-public-project');}}
  if(own(value,'projection')){
    const p=value.projection;shape(p,['groups','uncollected','pending','maxSegment','windows']);if(!Array.isArray(p.groups)||p.groups.length>24||!Array.isArray(p.uncollected)||p.uncollected.length>200||!Array.isArray(p.pending)||p.pending.length>200||!integer(p.maxSegment))throw Error('invalid-pro-public-projection');
    for(const g of p.groups){shape(g,['topicId','name','icon','segment','empty','current','undated','old','windows']);if(!id(g.topicId)||!string(g.name,200)||!string(g.icon,40)||g.segment!==null&&!integer(g.segment)||typeof g.empty!=='boolean')throw Error('invalid-pro-public-group');for(const lane of ['current','old','undated']){if(!Array.isArray(g[lane])||g[lane].length>200)throw Error('invalid-pro-public-rows');g[lane].forEach(checkRow);}shape(g.windows,['current','old']);checkPage(g.windows.current);checkPage(g.windows.old);}
    p.uncollected.forEach(checkRow);p.pending.forEach(checkRow);shape(p.windows,['uncollected','pending']);checkPage(p.windows.uncollected);checkPage(p.windows.pending);
  }
  if(own(value,'rows')){if(!Array.isArray(value.rows)||value.rows.length>200)throw Error('invalid-pro-public-rows');value.rows.forEach(checkRow);}
  if(own(value,'operations')){if(value.panel!=='records'||!Array.isArray(value.operations)||value.operations.length>24)throw Error('invalid-pro-public-operations');value.operations.forEach(checkOperation);}
  if(value.kind==='pro-panel-page'&&(!panelKinds.includes(value.panel)||value.panel==='records'&&!own(value,'operations')))throw Error('invalid-pro-public-panel');
  if(value.kind==='pro-panel-page'&&value.panel==='legacy-resolutions'){
    const rows=list(value.display.legacyResolutions);
    if(rows.length!==value.page.count||value.page.limit>24||value.page.offset+value.page.count>value.page.total||rows.some(r=>r.status!=='primary-resolution-required'||r.candidates.length||r.preservedPlacements.length)||Object.keys(value.display).some(k=>!['scopeKey','legacyResolutions'].includes(k)&&Object.keys(value.display[k]).length)||value.projects.length||value.items.some(r=>!own(value.display.legacyResolutions,r.id)))throw Error('invalid-pro-public-legacy-page');
  }
  if(value.kind==='pro-panel-page'&&value.panel==='project-choices'&&(value.projects.length!==value.page.count||value.page.limit>24||value.page.offset+value.page.count>value.page.total||value.items.length||Object.keys(value.display).some(k=>k!=='scopeKey'&&Object.keys(value.display[k]).length)))throw Error('invalid-pro-public-project-page');
  if(value.kind==='pro-rows-page'&&(!id(value.topicId)||!['current','old'].includes(value.lane)))throw Error('invalid-pro-public-rows');
  if(value.kind==='pro-records-page')value.items.forEach(checkOperation);
  if(value.kind==='pro-operation-page'){
    if(!id(value.previewId)||!id(value.operationId)||!['human','automation'].includes(value.actor)||!['applied','undone'].includes(value.operationStatus))throw Error('invalid-pro-operation-review');
    checkChanges(value.changes);const p=value.page;
    if(p.total>20000||!p.limit||p.limit>100||p.offset>p.total||p.count!==value.changes.length||p.offset+p.count>p.total||new Set(value.changes.map(c=>JSON.stringify([c.kind,c.key]))).size!==p.count)throw Error('invalid-pro-operation-review');
  }
  if(value.kind==='pro-search-page')for(const item of value.items){shape(item,['refId','displayTitle','nativeTitle','available','contexts']);if(!id(item.refId)||!string(item.displayTitle,1000)||!string(item.nativeTitle,1000)||typeof item.available!=='boolean'||!Array.isArray(item.contexts)||item.contexts.length>24)throw Error('invalid-pro-public-search');for(const c of item.contexts){shape(c,['topicId','role']);if(!id(c.topicId)||!['primary','related'].includes(c.role))throw Error('invalid-pro-public-search');}}
  if(own(value,'view')){shape(value.view,['mode','native']);if(!modes.includes(value.view.mode)||value.view.mode!==value.status.mode)throw Error('invalid-pro-public-view');if(value.view.native!==null)checkNativePage(value.view.native,value.versions.scopeKey);}
  if(['pro-preview','manual-series-plan'].includes(value.kind))checkPreview(value);
  if(value.kind==='pro-result'){
    if(own(value,'state')&&!['applied','arrived','dispatched','unknown','blocked','returned','registered','ready','paused','cancelled','unavailable','unchanged','already-current','unconfirmed','native-link'].includes(value.state)||own(value,'operationId')&&!id(value.operationId)||own(value,'replayed')&&typeof value.replayed!=='boolean'||own(value,'message')&&!string(value.message,1000))throw Error('invalid-pro-public-result');
    if(own(value,'anchor'))checkAnchor(value.anchor);
    if(own(value,'nativeLink')){if(action!=='navigation'||value.state!=='native-link')throw Error('invalid-pro-native-link');checkNativeLink(value.nativeLink);}else if(value.state==='native-link')throw Error('invalid-pro-native-link');
  }
  return structuredClone(value);
}
