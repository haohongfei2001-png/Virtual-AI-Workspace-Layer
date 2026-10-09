import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureScopeGate, FixtureProjection, validateFixtureObservation, fixtureRoute, scopeKey } from '../../experiments/r0/core.mjs';
import { witness, observation, SCOPE_A, SCOPE_B } from './samples.mjs';
import { mountFixtureNavigation } from '../../experiments/r0/shell.mjs';
const setup = (overrides = {}) => { const gate = new FixtureScopeGate(() => 1000); assert.equal(gate.bindFixture(witness(overrides)).ok, true); return { gate, token: gate.token() }; };
const accept = (gate, token, overrides) => validateFixtureObservation(gate, token, observation(token, overrides));

test('same-scope positive reference; metadata only, no body or assistant extraction', () => {
  const { gate, token } = setup();
  const result = accept(gate, token, { body: 'synthetic body must not be retained', draft: 'synthetic draft' });
  assert.equal(result.ok, true); assert.equal(result.reference.knownUserMessages, 1);
  assert.equal(result.reference.coverage, 'partial_user_metadata');
  assert.equal('body' in result.reference, false); assert.equal('draft' in result.reference, false);
});
test('unknown, malformed and non-fixture identity never issue tokens', () => {
  for (const override of [{ scope: null }, { status: 'ambiguous' }, { evidence: 'LIVE_HOST' }, { frame: 1 }, { document: '' }, { expiresAt: 1 }, { route: 'https://chatgpt.com/c/T0' }, { routeRevision: NaN }]) {
    const gate = new FixtureScopeGate(() => 1000); assert.equal(gate.bindFixture(witness(override)).ok, false); assert.equal(gate.token(), null);
  }
});
test('token copy, forgery and other gate tokens rejected', () => {
  const { gate, token } = setup(); assert.equal(gate.check({ ...token }).reason, 'unissued-token');
  assert.equal(setup().gate.check(token).reason, 'unissued-token');
});
test('A → B → A rejects both stale epochs and clears projection synchronously', () => {
  const { gate, token } = setup(); const store = new FixtureProjection(gate);
  assert.equal(store.add(token, accept(gate, token).reference).ok, true); assert.equal(store.view(token).length, 1);
  gate.invalidate('account-switch'); assert.deepEqual(store.view(token), []);
  gate.bindFixture(witness({ scope: SCOPE_B })); const b = gate.token();
  assert.equal(accept(gate, token).reason, 'stale-epoch'); assert.equal(accept(gate, b).ok, true);
  gate.bindFixture(witness()); const a2 = gate.token();
  assert.equal(accept(gate, token).reason, 'stale-epoch'); assert.equal(accept(gate, b).reason, 'stale-epoch'); assert.equal(accept(gate, a2).ok, true);
  store.dispose();
});
test('same account, other native organization is a distinct scope', () => {
  const { gate, token } = setup(); gate.bindFixture(witness({ scope: { ...SCOPE_A, organization: 'synthetic-work' } }));
  assert.notEqual(token.scope, gate.token().scope); assert.equal(gate.check(token).ok, false);
});
test('route, document, tab, history and resume rebinding revoke stale work', () => {
  for (const change of [{ route: 'https://r0.invalid/c/T1', routeRevision: 2 }, { document: 'synthetic-doc-2' }, { tab: 'synthetic-tab-2' }, { routeRevision: 3 }, {}]) {
    const { gate, token } = setup(); gate.bindFixture(witness(change)); assert.equal(accept(gate, token).reason, 'stale-epoch');
  }
});
test('expiry closes scope and clears cached projection', () => {
  let now = 1000; const gate = new FixtureScopeGate(() => now); gate.bindFixture(witness()); const token = gate.token();
  const store = new FixtureProjection(gate); store.add(token, accept(gate, token).reference); now = 20000;
  assert.deepEqual(store.view(token), []); assert.equal(gate.token(), null);
});
test('all route/body ownership fields independently reject mismatches', () => {
  const { gate, token } = setup();
  for (const key of ['scope', 'document', 'tab', 'frame', 'route', 'routeRevision', 'conversation', 'project', 'branch']) {
    assert.equal(accept(gate, token, { [key]: 'synthetic-wrong' }).reason, `observation-${key}`, key);
  }
  for (const overrides of [{ renderedRoots: 0 }, { renderedRoots: 2 }, { transitioning: true }]) assert.equal(accept(gate, token, overrides).reason, 'ambiguous-render');
});
test('mixed conversation, branch, duplicate ID, draft and role ambiguity rejected', () => {
  const { gate, token } = setup(); const base = observation(token).messages[0];
  for (const change of [{ conversation: 'T9' }, { branch: 'synthetic-old' }, { sent: false }, { role: 'tool' }, { id: '' }]) {
    assert.equal(accept(gate, token, { messages: [{ ...base, ...change }] }).reason, 'message-ownership');
  }
  assert.equal(accept(gate, token, { messages: [base, base] }).reason, 'message-ownership');
});
test('incomplete or huge observation fails closed; no invented history denominator', () => {
  const { gate, token } = setup();
  for (const messages of [null, Array(1001).fill({})]) assert.equal(accept(gate, token, { messages }).reason, 'invalid-messages');
  const ref = accept(gate, token, { messages: [] }).reference;
  assert.equal(ref.coverage, 'reference_only'); assert.equal('accountTotal' in ref, false);
});
test('canonical synthetic references reject external/shared/traversal/query routes', () => {
  for (const url of ['https://r0.invalid/share/T0', 'https://r0.invalid/c/T0?x=1', 'https://r0.invalid/c/T0#x', 'https://r0.invalid/c/a%2Fb', 'javascript:alert(1)', 'https://r0.invalid.evil/c/T0', 'https://name@r0.invalid/c/T0', 'https://r0.invalid/x/../c/T0', 'https://r0.invalid/c/T0?', 'https://r0.invalid/c/T0#', ' https://r0.invalid/c/T0']) assert.equal(fixtureRoute(url), null, url);
});
test('same verified scope aggregates ordinary/P1/P2 without mutating native refs', () => {
  const refs = [witness(), witness({ route: 'https://r0.invalid/p/P1/c/T1' }), witness({ route: 'https://r0.invalid/p/P2/c/T2' })].map(w => {
    const { gate, token } = setup(w); return accept(gate, token).reference;
  });
  const before = JSON.stringify(refs); const { gate, token } = setup(); const store = new FixtureProjection(gate);
  for (const ref of refs) assert.equal(store.add(token, ref).ok, true);
  assert.equal(store.view(token).length, 3); assert.equal(store.setDisplayTitle(token, 'T1', 'Synthetic alias', 0).ok, true);
  assert.equal(JSON.stringify(refs), before); assert.deepEqual(store.view(token).map(r => r.nativeProject), [null, 'P1', 'P2']);
});
test('cross-account/org and unvalidated references refused; native unknown never forged', () => {
  const { gate, token } = setup(); const store = new FixtureProjection(gate);
  for (const scope of [SCOPE_B, { ...SCOPE_A, organization: 'synthetic-work' }]) {
    const other = setup({ scope }); assert.equal(store.add(token, accept(other.gate, other.token).reference).reason, 'cross-scope');
  }
  assert.equal(store.add(token, { scope: token.scope, id: 'T0' }).reason, 'unvalidated-reference'); assert.equal(store.view(token).length, 0);
});
test('old candidate cannot overwrite manual revision or lock', () => {
  const { gate, token } = setup(); const store = new FixtureProjection(gate); store.add(token, accept(gate, token).reference);
  assert.equal(store.setDisplayTitle(token, 'T0', 'Synthetic manual', 0).ok, true);
  assert.equal(store.setDisplayTitle(token, 'T0', 'Late candidate', 0, 'candidate').reason, 'revision-conflict');
  assert.equal(store.setDisplayTitle(token, 'T0', 'Late candidate', 1, 'candidate').reason, 'manual-lock');
});
test('late asynchronous result rechecks epoch immediately before commit', async () => {
  const { gate, token } = setup(); const store = new FixtureProjection(gate); const ref = accept(gate, token).reference;
  let release; const delayed = new Promise(resolve => { release = resolve; }).then(() => store.add(token, ref));
  gate.bindFixture(witness({ scope: SCOPE_B })); release(); assert.equal((await delayed).reason, 'stale-epoch'); assert.deepEqual(store.view(gate.token()), []);
});
test('scope serialization cannot collide using delimiter characters', () => {
  assert.notEqual(scopeKey({ ...SCOPE_A, account: 'a|b', organization: 'c' }), scopeKey({ ...SCOPE_A, account: 'a', organization: 'b|c' }));
});
test('fresh token cannot revive an old source reference after A-B-A', () => {
  const { gate, token } = setup(); const old = accept(gate, token).reference;
  gate.bindFixture(witness({ scope: SCOPE_B })); gate.bindFixture(witness());
  const store = new FixtureProjection(gate);
  assert.equal(store.add(gate.token(), old).reason, 'stale-reference');
});
test('independent synthetic document scope change revokes its reference in another projection', () => {
  const active = setup(); const source = setup({ route: 'https://r0.invalid/p/P1/c/T1', document: 'synthetic-other-doc' });
  const ref = accept(source.gate, source.token).reference; const store = new FixtureProjection(active.gate);
  assert.equal(store.add(active.token, ref).ok, true); assert.equal(store.view(active.token).length, 1);
  source.gate.bindFixture(witness({ scope: SCOPE_B, document: 'synthetic-other-doc' }));
  assert.deepEqual(store.view(active.token), []); assert.equal(store.add(active.token, ref).reason, 'stale-reference');
});

test('a failing invalidation listener cannot skip later cleanup or admit a new binding', () => {
  const { gate, token } = setup(); let cleanup = false;
  const unsubscribe = gate.onInvalidate(() => { throw new Error('synthetic cleanup fault'); });
  gate.onInvalidate(() => { cleanup = true; });
  assert.equal(gate.bindFixture(witness({ scope: SCOPE_B })).reason, 'cleanup-failed');
  assert.equal(cleanup, true); assert.equal(gate.token(), null); assert.equal(gate.check(token).ok, false);
  unsubscribe(); assert.equal(gate.bindFixture(witness()).ok, true);
});
test('shell refuses forged, shared, credentials and malformed references before touching DOM', () => {
  const { gate, token } = setup();
  for (const url of ['https://r0.invalid/share/T0', 'https://name:password@r0.invalid/c/T0?x=1#y', 'not-a-url']) {
    const forged = { scope: token.scope, evidence: 'SYNTHETIC_WITNESS', url, nativeTitle: 'synthetic forged' };
    assert.equal(mountFixtureNavigation(null, gate, token, [forged]).reason, 'invalid-reference');
  }
});

test('expiry is checked at API boundaries, not an autonomous cleanup lease', () => {
  let now = 1000; const gate = new FixtureScopeGate(() => now); gate.bindFixture(witness());
  const token = gate.token(); let removed = false; gate.onInvalidate(() => { removed = true; });
  now = 20001; assert.equal(removed, false, 'No background timer is implemented or claimed');
  assert.equal(gate.check(token).reason, 'expired'); assert.equal(removed, true);
});
