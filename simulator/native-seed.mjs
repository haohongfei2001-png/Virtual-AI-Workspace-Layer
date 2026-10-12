import { dataset, FIXTURE_NOW } from './data.mjs';
import { syntheticEvidenceGate } from './persistent-seed.mjs';
import { emptyNativeFacts } from '../src/data/native-facts.mjs';

export function syntheticNativeGate(scope) {
  return syntheticEvidenceGate(scope) === 'synthetic' ?
    {channel: 'synthetic', sourceId: 'native_fixture_v1', generation: 'fixture_generation_v1'} : null;
}

export function nativeSeed(scope, origin) {
  if (!syntheticNativeGate(scope)) throw Error('not-synthetic-scope');
  const data = dataset(scope.accountId, origin, 120);
  return {scopeKey: emptyNativeFacts(scope).scopeKey, sourceRevision: 1, observedAt: FIXTURE_NOW,
    validUntil: '2026-10-12T04:00:00Z',
    projects: data.projects.map(project => ({id: project.id, nativeName: project.name,
      nativeUrl: `${origin}/hf/${scope.accountId}/project/${project.id}`, availability: 'available'})),
    refs: data.refs.map(ref => ({id: ref.id, nativeTitle: ref.nativeTitle, nativeUrl: ref.nativeUrl,
      availability: ref.available ? 'available' : 'unavailable'})),
    membership: data.refs.map(ref => ({id: ref.id, state: ref.projectId === null ? 'NONE' : 'PROJECT', projectId: ref.projectId})),
    inventory: {projects: 'complete', conversations: 'complete', cursor: null},
  };
}
