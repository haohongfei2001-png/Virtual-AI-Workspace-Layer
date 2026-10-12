import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNativeFacts, applyNativeObservations, invalidateNativeSource, validateNativeFacts } from '../../src/data/native-facts.mjs';
import { freeProjection } from '../../src/data/free-projection.mjs';
import { scopeOf } from '../../simulator/data.mjs';

const scope = scopeOf('A');
const now = '2026-10-13T00:00:00Z';
const validUntil = '2026-10-14T00:00:00Z';
const authority = {scope, channel: 'synthetic', sourceId: 'fixture', generation: 'first', now};
const project = id => ({id, nativeName: '同名项目', nativeUrl: `https://vaiwl-hf.test/project/${id}`, availability: 'available'});
const ref = id => ({id, nativeTitle: `原生聊天 ${id}`, nativeUrl: `https://vaiwl-hf.test/c/${id}`, availability: 'available'});
const member = (id, state, projectId = null) => ({id, state, projectId});
function batch(sourceRevision = 1, values = {}) {
  return {scopeKey: emptyNativeFacts(scope).scopeKey, sourceRevision, observedAt: now, validUntil,
    projects: [], refs: [], membership: [], inventory: {projects: 'partial', conversations: 'partial', cursor: null}, ...values};
}
function seed() {
  return applyNativeObservations(emptyNativeFacts(scope), batch(1, {
    projects: [project('first'), project('second'), project('empty')],
    refs: [ref('inside'), ref('ordinary'), ref('uncertain')],
    membership: [member('inside', 'PROJECT', 'first'), member('ordinary', 'NONE'), member('uncertain', 'UNKNOWN')],
  }), authority);
}
const view = (facts, clock = now) => freeProjection(facts, {scope, now: clock});

test('FR-01/02 same-name native projects remain separate, including empty projects', () => {
  const projected = view(seed());
  assert.equal(projected.projects.length, 3);
  assert.equal(new Set(projected.projects.map(card => card.key)).size, 3);
  assert.deepEqual(projected.projects.map(card => card.members.map(row => row.id)), [['inside'], [], []]);
  assert.deepEqual(projected.noProject.map(row => row.id), ['ordinary']);
  assert.deepEqual(projected.unknown.map(row => row.id), ['uncertain']);
  assert.equal(new Set(projected.refs.map(row => row.id)).size, 3);
});

test('FR-02 atomic move, native rename and move out update one authoritative parent', () => {
  const original = seed(), before = structuredClone(original);
  const moved = applyNativeObservations(original, batch(2, {
    projects: [{...project('second'), nativeName: '原生改名'}],
    refs: [{...ref('inside'), nativeTitle: '原生新标题'}], membership: [member('inside', 'PROJECT', 'second')],
  }), authority);
  assert.deepEqual(original, before);
  const projected = view(moved);
  assert.deepEqual(projected.projects[0].members, []);
  assert.equal(projected.projects[1].members[0].displayTitle, '原生新标题');
  assert.equal(projected.projects[1].name, '原生改名');
  const removed = applyNativeObservations(moved, batch(3, {membership: [member('inside', 'NONE')]}), authority);
  assert.equal(view(removed).noProject.length, 2);
});

test('FR-02 missing membership is UNKNOWN, malformed null and missing project rejected', () => {
  const facts = applyNativeObservations(seed(), batch(2, {refs: [ref('unread')]}), authority);
  assert.equal(view(facts).unknown.find(row => row.id === 'unread').membership, 'UNKNOWN');
  for (const membership of [member('inside', null), member('inside', 'PROJECT'), member('inside', 'NONE', 'first'), member('inside', 'PROJECT', 'missing')]) {
    assert.throws(() => applyNativeObservations(facts, batch(3, {membership: [membership]}), authority));
  }
});

test('FR-01 pagination omission never deletes known records or proves time coverage', () => {
  const facts = applyNativeObservations(seed(), batch(2, {inventory: {projects: 'complete', conversations: 'complete', cursor: null}}), authority);
  assert.equal(view(facts).refs.length, 3);
  assert.equal(view(facts).projects.length, 3);
  assert.equal(facts.coverage, undefined);
  assert.throws(() => applyNativeObservations(facts, batch(3, {inventory: {projects: 'complete', conversations: 'partial', cursor: 'next'}}), authority), /unfinished/);
});

test('FR-04 projector cannot inspect Pro workspaces, placements or derived titles', () => {
  const facts = seed();
  for (const field of ['workspaces', 'placements', 'identities']) Object.defineProperty(facts, field, {
    get() { throw Error('Pro table read'); }, enumerable: false,
  });
  assert.equal(view(facts).refs[0].displayTitle, '原生聊天 inside');
  const missing = applyNativeObservations(seed(), batch(2, {refs: [{...ref('inside'), nativeTitle: null}]}), authority);
  assert.equal(view(missing).refs[0].displayTitle, '名称暂不可用');
});

test('FR-01/12 unavailable, unknown permission and expired observations differ', () => {
  const facts = applyNativeObservations(seed(), batch(2, {
    refs: [{...ref('ordinary'), availability: 'unavailable'}, {...ref('uncertain'), availability: 'unknown'}],
  }), authority);
  assert.equal(view(facts).refs.length, 2);
  assert.equal(view(facts).unknown[0].nativeTitle, null);
  const expired = view(seed(), validUntil);
  assert.equal(expired.refs.length, 3);
  assert.equal(expired.unknown.length, 3);
  assert(expired.refs.every(row => row.nativeTitle === null));
  assert.equal(expired.projects.length, 0);
});

test('FR-07 rereading another page does not renew old memberships or title validity', () => {
  const facts = applyNativeObservations(seed(), batch(2, {
    observedAt: '2026-10-13T12:00:00Z', validUntil: '2026-10-15T00:00:00Z',
  }), {...authority, now: '2026-10-13T12:00:00Z'});
  assert.equal(facts.membership.inside.validUntil, validUntil);
  assert.equal(view(facts, validUntil).unknown.length, 3);
});

test('FR-12 scope, generation, revocation and stale revisions fail closed', () => {
  const facts = seed();
  assert.throws(() => freeProjection(facts, {scope: scopeOf('B'), now}), /invalid-native-facts/);
  assert.throws(() => freeProjection(facts, {scope: null, now}), /unverified-scope/);
  assert.throws(() => applyNativeObservations(facts, batch(2, {scopeKey: 'other'}), authority), /cross-scope/);
  assert.throws(() => applyNativeObservations(facts, batch(1), authority), /stale-native-revision/);
  assert.throws(() => applyNativeObservations(facts, batch(2), {...authority, generation: 'other'}), /invalidated/);
  const revoked = invalidateNativeSource(facts, 'fixture', scope);
  assert.equal(view(revoked).refs.length, 0);
  assert.equal(view(revoked).projects.length, 0);
  assert.equal(Object.keys(revoked.refs).length, 3);
  assert.throws(() => applyNativeObservations(revoked, batch(2), authority), /invalidated/);
});

test('source labels cannot upgrade synthetic observations or choose a competing source', () => {
  assert.throws(() => applyNativeObservations(seed(), batch(2), {...authority, channel: 'production'}), /untrusted/);
  assert.throws(() => applyNativeObservations(seed(), batch(2, {refs: [ref('inside')]}), {...authority, sourceId: 'second'}), /source-conflict/);
});

test('invalid records reject entire batch, with no partial native mutation', () => {
  const facts = seed(), before = structuredClone(facts);
  for (const values of [
    {refs: [ref('duplicate'), ref('duplicate')]},
    {refs: [{...ref('unsafe'), nativeUrl: 'javascript:alert(1)'}]},
    {refs: [{...ref('bad'), sentAt: now}]},
    {membership: [member('missing', 'NONE')]},
    {refs: [ref('__proto__')]},
    {observedAt: validUntil},
    {validUntil: now},
  ]) assert.throws(() => applyNativeObservations(facts, batch(2, values), authority));
  assert.deepEqual(facts, before);
});

test('stored foreign witnesses and malformed native facts are rejected', () => {
  const facts = seed();
  facts.membership.inside.generation = 'forged';
  assert.throws(() => validateNativeFacts(facts, scope), /orphan-native-witness/);
});

test('FR-03 legacy references remain reachable without inferring NONE or importing Pro titles', () => {
  const facts = seed();
  const knownState = {scopeKey: facts.scopeKey, refs: {legacy: {id: 'legacy', nativeTitle: 'cached private name',
    nativeUrl: 'https://vaiwl-hf.test/c/legacy', projectId: null}}};
  const projected = freeProjection(facts, {scope, now, knownState});
  assert.equal(projected.refs.length, 4);
  assert.equal(projected.unknown.at(-1).id, 'legacy');
  assert.equal(projected.unknown.at(-1).nativeTitle, null);
  assert.equal(projected.noProject.length, 1);
  assert.throws(() => freeProjection(facts, {scope, now, knownState: {...knownState, scopeKey: 'other'}}), /cross-scope/);
});
