import { validateNativeFacts, nativeWitnessActive } from './native-facts.mjs';

export function freeProjection(facts, {scope, now, knownState = null}) {
  validateNativeFacts(facts, scope);
  if (knownState && knownState.scopeKey !== facts.scopeKey) throw Error('cross-scope-known-refs');
  const projects = [], refs = [], noProject = [], unknown = [];
  const byProject = new Map();
  for (const project of Object.values(facts.projects)) {
    if (!nativeWitnessActive(project, facts, now) || project.availability !== 'available') continue;
    const card = {id: project.id, key: JSON.stringify([facts.scopeKey, project.id]),
      scope: facts.scopeKey, nativeName: project.nativeName, nativeAliases: project.nativeAliases ?? [], membershipWitness: {sourceId:project.sourceId,generation:project.generation,sourceRevision:project.sourceRevision}, membershipWitnessCurrent: project.sourceRevision === facts.sources[project.sourceId].sourceRevision, memberCount: project.memberCount ?? null, membershipComplete: false,
      name: project.nativeName ?? '名称暂不可用', nativeUrl: project.nativeUrl, members: []};
    projects.push(card);
    byProject.set(project.id, card);
  }
  for (const ref of Object.values(facts.refs)) {
    const active = nativeWitnessActive(ref, facts, now);
    if (facts.sources[ref.sourceId].revoked || ref.availability === 'unavailable') continue;
    const observed = facts.membership[ref.id];
    const readable = active && ref.availability === 'available';
    const confirmed = observed && nativeWitnessActive(observed, facts, now) && readable;
    const state = confirmed && (observed.state !== 'PROJECT' || byProject.has(observed.projectId)) ? observed.state : 'UNKNOWN';
    const row = {id: ref.id, scope: facts.scopeKey, nativeUrl: ref.nativeUrl,
      nativeTitle: readable ? ref.nativeTitle : null, nativeAliases: readable ? ref.nativeAliases ?? [] : [],
      displayTitle: readable ? ref.nativeTitle ?? '名称暂不可用' : '名称暂不可用',
      membership: state, membershipWitness: state === 'PROJECT' ? {sourceId:observed.sourceId,generation:observed.generation,sourceRevision:observed.sourceRevision} : null, membershipWitnessCurrent: state === 'PROJECT' && observed.sourceId === facts.projects[observed.projectId].sourceId && observed.sourceRevision === facts.projects[observed.projectId].sourceRevision, projectId: state === 'PROJECT' ? observed.projectId : null};
    refs.push(row);
    if (state === 'PROJECT') byProject.get(observed.projectId).members.push(row);
    else if (state === 'NONE') noProject.push(row);
    else unknown.push(row);
  }
  for (const ref of Object.values(knownState?.refs ?? {})) {
    if (Object.hasOwn(facts.refs, ref.id)) continue;
    const row = {id: ref.id, scope: facts.scopeKey, nativeUrl: ref.nativeUrl,
      nativeTitle: null, displayTitle: '名称暂不可用', membership: 'UNKNOWN', projectId: null};
    refs.push(row);
    unknown.push(row);
  }
  for (const card of projects) {
    const project = facts.projects[card.id], source = facts.sources[project.sourceId];
    card.membershipComplete = card.memberCount !== null && source.inventory.conversations === 'complete' && project.sourceRevision === source.sourceRevision && card.members.length === card.memberCount && card.members.every(row => { const m = facts.membership[row.id]; return m.sourceId === project.sourceId && m.sourceRevision === project.sourceRevision; });
  }
  return {scope: facts.scopeKey, revision: facts.revision, viewMode: 'free',
    evidenceLevel: Object.keys(facts.sources).length ? 'synthetic' : 'none', projects, refs, noProject, unknown};
}
