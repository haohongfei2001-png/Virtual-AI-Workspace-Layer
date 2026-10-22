import {nativeDeleted} from './native-lifecycle.mjs';
import { validateNativeFacts, nativeWitnessActive, hostNativeChannel } from './native-facts.mjs';

// Host admission is validated by the native codec. TTL controls freshness,
// while explicit revocation, generation and scope still control readability.
function lastKnownWitness(row, facts, now) {
  const source = facts.sources[row?.sourceId], clock = Date.parse(now);
  return !!source && hostNativeChannel(source.channel) && !!source.admission && !source.revoked &&
    source.generation === row.generation && source.sourceRevision >= row.sourceRevision &&
    Date.parse(source.observedAt) <= clock && Date.parse(row.observedAt) <= clock;
}
const activeWitness = (row, facts, now) => nativeWitnessActive(row, facts, now) &&
  (!hostNativeChannel(facts.sources[row.sourceId].channel) || Date.parse(facts.sources[row.sourceId].observedAt) <= Date.parse(now));
const readableWitness = (row, facts, now) => activeWitness(row, facts, now) || lastKnownWitness(row, facts, now);

export function freeProjection(facts, {scope, now, knownState = null}) {
  validateNativeFacts(facts, scope);
  if (knownState && knownState.scopeKey !== facts.scopeKey) throw Error('cross-scope-known-refs');
  const projects = [], refs = [], noProject = [], unknown = [];
  const byProject = new Map();
  for (const project of Object.values(facts.projects)) {
    if (nativeDeleted(facts,'projects',project.id) || !readableWitness(project, facts, now) || project.availability !== 'available') continue;
    const card = {id: project.id, key: JSON.stringify([facts.scopeKey, project.id]),
      scope: facts.scopeKey, freshness: activeWitness(project, facts, now) ? 'current' : 'last-known', nativeName: project.nativeName, nativeAliases: project.nativeAliases ?? [], membershipWitness: {sourceId:project.sourceId,generation:project.generation,sourceRevision:project.sourceRevision}, membershipWitnessCurrent: activeWitness(project, facts, now) && project.sourceRevision === facts.sources[project.sourceId].sourceRevision, memberCount: project.memberCount ?? null, membershipComplete: false,
      name: project.nativeName ?? '名称暂不可用', nativeUrl: project.nativeUrl, members: []};
    projects.push(card);
    byProject.set(project.id, card);
  }
  for (const ref of Object.values(facts.refs)) {
    const active = activeWitness(ref, facts, now);
    if (nativeDeleted(facts,'refs',ref.id) || facts.sources[ref.sourceId].revoked || ref.availability === 'unavailable') continue;
    const observed = facts.membership[ref.id];
    const readable = (active || lastKnownWitness(ref, facts, now)) && ref.availability === 'available';
    const confirmed = observed && readableWitness(observed, facts, now) && readable;
    const state = confirmed && (observed.state !== 'PROJECT' || byProject.has(observed.projectId)) ? observed.state : 'UNKNOWN';
    const row = {id: ref.id, scope: facts.scopeKey, nativeUrl: ref.nativeUrl, freshness: readable ? (active ? 'current' : 'last-known') : 'unknown',
      nativeTitle: readable ? ref.nativeTitle : null, nativeAliases: readable ? ref.nativeAliases ?? [] : [],
      displayTitle: readable ? ref.nativeTitle ?? '名称暂不可用' : '名称暂不可用',
      membership: state, membershipFreshness: state === 'UNKNOWN' ? 'unknown' : active && activeWitness(observed, facts, now) && (state !== 'PROJECT' || byProject.get(observed.projectId).freshness === 'current') ? 'current' : 'last-known', membershipWitness: state === 'PROJECT' ? {sourceId:observed.sourceId,generation:observed.generation,sourceRevision:observed.sourceRevision} : null, membershipWitnessCurrent: state === 'PROJECT' && active && activeWitness(observed, facts, now) && byProject.get(observed.projectId).membershipWitnessCurrent && observed.sourceId === facts.projects[observed.projectId].sourceId && observed.sourceRevision === facts.projects[observed.projectId].sourceRevision, projectId: state === 'PROJECT' ? observed.projectId : null};
    refs.push(row);
    if (state === 'PROJECT') byProject.get(observed.projectId).members.push(row);
    else if (state === 'NONE') noProject.push(row);
    else unknown.push(row);
  }
  for (const ref of Object.values(knownState?.refs ?? {})) {
    if(nativeDeleted(facts,'refs',ref.id))continue;
    const native = facts.refs[ref.id];
    // Revoked metadata cannot publish titles or membership, but a separately
    // retained shared reference still has its original route. Keep explicit
    // unavailable tombstones hidden; never revive them through this fallback.
    if (native && (!facts.sources[native.sourceId].revoked || native.availability === 'unavailable')) continue;
    const row = {id: ref.id, scope: facts.scopeKey, nativeUrl: ref.nativeUrl,
      nativeTitle: null, displayTitle: '名称暂不可用', membership: 'UNKNOWN', projectId: null};
    refs.push(row);
    unknown.push(row);
  }
  for (const card of projects) {
    const project = facts.projects[card.id], source = facts.sources[project.sourceId];
    card.membershipComplete = card.membershipWitnessCurrent && card.memberCount !== null && source.inventory.conversations === 'complete' && project.sourceRevision === source.sourceRevision && card.members.length === card.memberCount && card.members.every(row => { const m = facts.membership[row.id]; return row.membershipWitnessCurrent && m.sourceId === project.sourceId && m.sourceRevision === project.sourceRevision; });
  }
  return {scope: facts.scopeKey, revision: facts.revision, viewMode: 'free',
    evidenceLevel: Object.keys(facts.sources).length ? 'synthetic' : 'none', projects, refs, noProject, unknown};
}
