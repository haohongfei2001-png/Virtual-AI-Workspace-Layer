import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {digest, stable} from '../../src/data/hash.mjs';
import {queueJob, budgetSummary} from '../../src/pro/jobs/index.mjs';
import {createSameDatabaseBillingStore, billingRootKey, billingOperationKey} from '../../src/pro/integration/billing-store.mjs';

const NOW = '2026-10-31T12:00:00.000Z';
const sourceScope = key => ({kind: 'verified-scope', key, serverIdentity: 'established', persistence: 'same-idb'});
const versions = scopeKey => ({scopeKey, authorizationEpoch: 1, sourceGeneration: {source_fixture: 1}, nativeFields: {c_fixture: 1},
  overlayRevision: 0, targets: {}, constraintRevision: 0, policyVersion: 'policy_fixture', evidenceDigest: digest('fixture_input')});
const binding = {modelProfileId: 'fixture_model', modelVersion: 'fixture_snapshot', promptVersion: 'fixture_prompt',
  outputSchemaVersion: 'vaiwl-pro-model-output/1', priceCardVersion: 'fixture_prices'};
const policy = (id, appliesTo, ceiling = 40000) => ({id, billingProfileId: 'billing_fixture', appliesTo, currency: 'USD', scale: 6, ceiling,
  window: {from: '2026-10-01T00:00:00.000Z', through: '2026-10-31T23:59:59.999Z'}, providerProfileId: 'openai-responses', pricingVersion: 'fixture_prices', revision: 1});
const policies = () => [policy('month', {kind: 'installation-total'}), {...policy('day', {kind: 'installation-total'}, 35000),
  window: {from: '2026-10-31T00:00:00.000Z', through: '2026-10-31T23:59:59.999Z'}},
  policy('scope_a', {kind: 'scope-sublimit', scopeKey: 'scope_a'}), policy('scope_b', {kind: 'scope-sublimit', scopeKey: 'scope_b'})];
const queued = (jobId, scopeKey) => queueJob({id: jobId, scope: sourceScope(scopeKey), versions: versions(scopeKey),
  inputFingerprint: digest([jobId, 'synthetic-only']), modelBinding: binding, processing: 'cloud'});
const reserve = (jobId, maximum = 30000) => ({type: 'RESERVE_JOB', jobId, reservationId: 'reservation_' + jobId, maximum,
  billingProfileId: 'billing_fixture', providerProfileId: 'openai-responses', currency: 'USD', priceCardVersion: 'fixture_prices',
  expectedBudgetRevisions: {month: 1, day: 1, scope_a: 1, scope_b: 1}});

async function fixture() {
  const factory = new MockIDBFactory(), name = 'pro_billing_fixture_' + crypto.randomUUID();
  const first = new ScopeRepository({indexedDB: factory, databaseName: name}), second = new ScopeRepository({indexedDB: factory, databaseName: name});
  const dbA = await first.open(), dbB = await second.open(), authorities = new WeakMap(), hook = {run: null};
  const mint = (scopeKey, admin = false) => { const token = Object.freeze({fixtureToken: crypto.randomUUID()}); authorities.set(token, {scope: sourceScope(scopeKey), admin, active: true}); return token; };
  const verifyAuthority = (token, intent) => {
    const grant = authorities.get(token);
    if (!grant?.active) throw Error('live-billing-authority-required');
    if (['CONFIGURE_POLICIES', 'RECONCILE_NO_CHARGE', 'RECONCILE_CHARGE'].includes(intent.action) && !grant.admin) throw Error('billing-admin-required');
    hook.run?.(token, intent);
    if (!grant.active) throw Error('live-billing-authority-required');
    return grant.scope;
  };
  const authA = mint('scope_a', true), authB = mint('scope_b', true);
  const create = connection => createSameDatabaseBillingStore({connection: async () => connection, verifyAuthority, enabled: true, clock: () => NOW});
  const storeA = create(dbA), storeB = create(dbB);
  let counter = 0;
  const execute = async (store, auth, command, expectedRevision = null, operationId = null) => {
    const expected = expectedRevision ?? (await store.read(auth)).revision;
    return store.transact(auth, {operationId: operationId ?? 'billing_op_' + (++counter), expectedRevision: expected, command});
  };
  const must = async promise => { const result = await promise; assert.equal(result.ok, true, result.reason); return result.value; };
  return {factory, name, first, second, dbA, dbB, mint, authorities, hook, authA, authB, storeA, storeB, create, execute, must,
    close() { first.close(); second.close(); }};
}
const initialize = f => f.must(f.execute(f.storeA, f.authA, {type: 'CONFIGURE_POLICIES', policies: policies()}));
async function seedJob(f, id = 'job_a', scopeKey = 'scope_a') {
  const store = scopeKey === 'scope_a' ? f.storeA : f.storeB, auth = scopeKey === 'scope_a' ? f.authA : f.authB;
  return f.must(f.execute(store, auth, {type: 'QUEUE_JOB', checkpoint: queued(id, scopeKey)}));
}
async function readRaw(db, storeName, key) {
  return new Promise((resolve, reject) => { const tx = db.transaction([storeName], 'readonly'), q = tx.objectStore(storeName).get(key);
    tx.oncomplete = () => resolve(q.result); tx.onabort = () => reject(tx.error); });
}
async function writeRaw(db, storeName, value) {
  return new Promise((resolve, reject) => { const tx = db.transaction([storeName], 'readwrite'); tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
}

test('billing adapter needs explicit enabled + live owner verifier, never opens another DB', async () => {
  const f = await fixture();
  try {
    let connections = 0;
    const disabled = createSameDatabaseBillingStore({connection: async () => { connections++; return f.dbA; }, verifyAuthority: () => sourceScope('scope_a')});
    await assert.rejects(disabled.read({}), /billing-integration-disabled/); assert.equal(connections, 0);
    assert.throws(() => createSameDatabaseBillingStore({connection: async () => f.dbA, enabled: true}), /billing-shared-owner-required/);
    await assert.rejects(f.storeA.read({...f.authA}), /live-billing-authority-required/);
    const session = f.mint('scope_a'); f.authorities.get(session).scope = {kind: 'browser-local-session', key: 'scope_a', persistence: 'memory', serverIdentity: 'not-established'};
    await assert.rejects(f.storeA.read(session), /billing-persistent-scope-required/);
    assert.equal(f.factory.databasesMap.size, 1); assert.equal(f.dbA.version, 4);
    assert.deepEqual([...f.dbA.objectStoreNames].sort(), ['refs', 'operations', 'b23_states', 'b23_operations', 'b23_checkpoints', 'b23_views', 'native_states', 'native_operations'].sort());
  } finally { f.close(); }
});

test('zero budget is the durable default; rejected reserve writes no root/journal change', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.storeA.read(f.authA)).revision, 0); assert.equal(await readRaw(f.dbA, 'b23_states', billingRootKey), undefined);
    await seedJob(f); const before = await f.storeA.read(f.authA);
    const rejected = await f.execute(f.storeA, f.authA, reserve('job_a'));
    assert.equal(rejected.ok, false); assert.equal(rejected.reason, 'budget-zero'); assert.deepEqual(await f.storeA.read(f.authA), before);
    const injected = queued('job_injected', 'scope_a'); injected.inputFingerprint = 'not-a-digest-or-an-authorized-body';
    const invalid = await f.execute(f.storeA, f.authA, {type: 'QUEUE_JOB', checkpoint: injected});
    assert.equal(invalid.ok, false); assert.equal(invalid.reason, 'invalid-job-digest'); assert.deepEqual(await f.storeA.read(f.authA), before);
  } finally { f.close(); }
});

test('A24 two connections/scopes atomically share installation day/month budgets under CAS', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await seedJob(f, 'job_b', 'scope_b');
    assert.notEqual(f.dbA, f.dbB); const expected = (await f.storeA.read(f.authA)).revision;
    const attempts = await Promise.all([
      f.execute(f.storeA, f.authA, reserve('job_a'), expected, 'reserve_a'),
      f.execute(f.storeB, f.authB, reserve('job_b'), expected, 'reserve_b'),
    ]);
    assert.equal(attempts.filter(result => result.ok).length, 1);
    assert.equal(attempts.find(result => !result.ok).reason, 'billing-revision-conflict');
    const state = await f.storeA.read(f.authA); assert.equal(budgetSummary(state.ledger, 'billing_fixture').reserved, 30000);
    const remaining = state.jobs.job_a.checkpoint.state === 'queued' ? {store: f.storeA, auth: f.authA, id: 'job_a'} : {store: f.storeB, auth: f.authB, id: 'job_b'};
    const noBudget = await f.execute(remaining.store, remaining.auth, reserve(remaining.id));
    assert.equal(noBudget.ok, false); assert.equal(noBudget.reason, 'budget-exceeded');
    await f.must(f.execute(remaining.store, remaining.auth, reserve(remaining.id, 5000)));
    assert.equal(budgetSummary((await f.storeB.read(f.authB)).ledger, 'billing_fixture').reserved, 35000);
  } finally { f.close(); }
});

test('one atomic dispatch persists job marker and held charge; reopening only resumes checkpoints', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a')));
    const dispatched = await f.must(f.execute(f.storeA, f.authA, {type: 'DISPATCH_JOB', jobId: 'job_a'}));
    assert.equal(dispatched.detail.networkDispatched, false);
    f.first.close(); const replacement = new ScopeRepository({indexedDB: f.factory, databaseName: f.name}), db = await replacement.open();
    try {
      const reopened = f.create(db), freshAuth = f.mint('scope_a', true), before = await reopened.read(freshAuth);
      assert.equal(before.jobs.job_a.checkpoint.state, 'dispatched'); assert.equal(before.ledger.reservations.reservation_job_a.reservation.status, 'sent-uncertain');
      const recovered = await f.must(f.execute(reopened, freshAuth, {type: 'RECOVER_SCOPE'}));
      assert.equal(recovered.detail.automaticDispatch, false); assert.deepEqual(recovered.detail.actions.map(item => item.action), ['hold-and-reconcile']);
      const after = await reopened.read(freshAuth); assert.equal(after.jobs.job_a.checkpoint.state, 'outcome-unknown');
      assert.equal(budgetSummary(after.ledger, 'billing_fixture').uncertain, 30000);
      const noReplay = await f.execute(reopened, freshAuth, {type: 'DISPATCH_JOB', jobId: 'job_a'}); assert.equal(noReplay.ok, false);
    } finally { replacement.close(); }
  } finally { f.close(); }
});

test('settlement, result checkpoint and journal commit together, followed by explicit validation/commit', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a')));
    await f.must(f.execute(f.storeA, f.authA, {type: 'DISPATCH_JOB', jobId: 'job_a'}));
    await f.must(f.execute(f.storeA, f.authA, {type: 'COMPLETE_JOB', jobId: 'job_a', resultDigest: digest('fixture-result'), actualCharge: 1234, reportedExactChargeDecimal: '0.001234'}));
    let state = await f.storeA.read(f.authA); assert.equal(state.jobs.job_a.checkpoint.state, 'result-ready'); assert.equal(budgetSummary(state.ledger, 'billing_fixture').settled, 1234);
    await f.must(f.execute(f.storeA, f.authA, {type: 'ADVANCE_RESULT', jobId: 'job_a', event: {type: 'validate', currentVersions: versions('scope_a'), awaitingReview: true, proposalId: 'fixture_proposal'}}));
    await f.must(f.execute(f.storeA, f.authA, {type: 'ADVANCE_RESULT', jobId: 'job_a', event: {type: 'commit', operationId: 'overlay_commit_fixture'}}));
    state = await f.storeA.read(f.authA); assert.equal(state.jobs.job_a.checkpoint.state, 'committed');
    assert.equal(state.records.length, state.revision); assert.equal(state.records.at(-1).action, 'ADVANCE_RESULT');
  } finally { f.close(); }
});

test('unsent cancellation releases; cancellation after dispatch retains uncertain fee until explicit reconciliation', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a')));
    await f.must(f.execute(f.storeA, f.authA, {type: 'CANCEL_JOB', jobId: 'job_a', reason: 'user-cancelled'}));
    let state = await f.storeA.read(f.authA); assert.equal(state.jobs.job_a.checkpoint.state, 'cancelled'); assert.equal(budgetSummary(state.ledger, 'billing_fixture').reserved, 0);
    await seedJob(f, 'job_later'); await f.must(f.execute(f.storeA, f.authA, reserve('job_later')));
    await f.must(f.execute(f.storeA, f.authA, {type: 'DISPATCH_JOB', jobId: 'job_later'}));
    await f.must(f.execute(f.storeA, f.authA, {type: 'CANCEL_JOB', jobId: 'job_later', reason: 'scope-revoked'}));
    state = await f.storeA.read(f.authA); assert.equal(state.jobs.job_later.checkpoint.state, 'outcome-unknown'); assert.equal(budgetSummary(state.ledger, 'billing_fixture').uncertain, 30000);
    const nonAdmin = f.mint('scope_a', false);
    await assert.rejects(f.execute(f.storeA, nonAdmin, {type: 'RECONCILE_NO_CHARGE', jobId: 'job_later'}), /billing-admin-required/);
    await f.must(f.execute(f.storeA, f.authA, {type: 'RECONCILE_NO_CHARGE', jobId: 'job_later'}));
    state = await f.storeA.read(f.authA); assert.equal(state.jobs.job_later.checkpoint.state, 'cancelled'); assert.equal(budgetSummary(state.ledger, 'billing_fixture').uncertain, 0);
  } finally { f.close(); }
});

test('atomic budget tightening cancels unsent reservations; dispatched amount remains held', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a', 10000)));
    await f.must(f.execute(f.storeA, f.authA, {type: 'DISPATCH_JOB', jobId: 'job_a'}));
    await seedJob(f, 'job_b', 'scope_b'); await f.must(f.execute(f.storeB, f.authB, reserve('job_b', 10000)));
    const changed = {...policies()[0], ceiling: 15000, revision: 2};
    await f.must(f.execute(f.storeA, f.authA, {type: 'CONFIGURE_POLICIES', policies: [changed]}));
    const state = await f.storeB.read(f.authB);
    assert.equal(state.jobs.job_a.checkpoint.state, 'dispatched'); assert.equal(state.jobs.job_b.checkpoint.state, 'cancelled');
    assert.deepEqual(budgetSummary(state.ledger, 'billing_fixture'), {currency: 'USD', reserved: 0, uncertain: 10000, settled: 0, blocked: false, limitScope: 'this-installation-only'});
  } finally { f.close(); }
});

test('quota failure during journal write rolls back preceding root/job/ledger write', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); const before = await f.storeA.read(f.authA), original = f.dbA.transaction.bind(f.dbA);
    f.dbA.transaction = (stores, mode) => {
      const tx = original(stores, mode), objectStore = tx.objectStore.bind(tx);
      tx.objectStore = name => {
        const store = objectStore(name);
        if (mode === 'readwrite' && name === 'b23_operations') store.put = () => tx.enqueue(() => { throw Object.assign(Error('QuotaExceededError'), {name: 'QuotaExceededError'}); });
        return store;
      };
      return tx;
    };
    const result = await f.execute(f.storeA, f.authA, reserve('job_a'), before.revision, 'quota_reserve'); f.dbA.transaction = original;
    assert.equal(result.ok, false); assert.equal(result.reason, 'QuotaExceededError');
    assert.deepEqual(await f.storeA.read(f.authA), before);
    assert.equal(await readRaw(f.dbA, 'b23_operations', billingOperationKey('quota_reserve')), undefined);
  } finally { f.close(); }
});

test('live authority is rechecked inside transaction; serialized authority/cross-scope jobs never write', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a'))); const before = await f.storeA.read(f.authA);
    const cross = await f.execute(f.storeB, f.authB, {type: 'DISPATCH_JOB', jobId: 'job_a'}); assert.equal(cross.ok, false); assert.equal(cross.reason, 'cross-scope-job-denied');
    f.hook.run = (auth, intent) => { if (intent.action === 'DISPATCH_JOB' && intent.phase === 'inside-transaction' && intent.job) f.authorities.get(auth).active = false; };
    const revoked = await f.execute(f.storeA, f.authA, {type: 'DISPATCH_JOB', jobId: 'job_a'}, before.revision, 'revoked_dispatch');
    assert.equal(revoked.ok, false); assert.equal(revoked.reason, 'live-billing-authority-required'); f.hook.run = null;
    const fresh = f.mint('scope_a', true); assert.deepEqual(await f.storeA.read(fresh), before);
    await assert.rejects(f.storeA.transact({...fresh}, {operationId: 'forged', expectedRevision: before.revision, command: {type: 'RECOVER_SCOPE'}}), /live-billing-authority-required/);
  } finally { f.close(); }
});

test('operation ID+same original payload is idempotent; changed payload conflicts', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); const revision = (await f.storeA.read(f.authA)).revision, command = reserve('job_a');
    const first = await f.execute(f.storeA, f.authA, command, revision, 'same_reserve'); assert.equal(first.ok, true);
    const replay = await f.execute(f.storeB, f.authA, command, revision, 'same_reserve'); assert.equal(replay.ok, true); assert.equal(replay.replayed, true); assert.deepEqual(replay.value, first.value);
    const changed = await f.execute(f.storeA, f.authA, {...command, maximum: 1}, revision, 'same_reserve'); assert.equal(changed.ok, false); assert.equal(changed.reason, 'billing-operation-replay-conflict');
    assert.equal(budgetSummary((await f.storeA.read(f.authA)).ledger, 'billing_fixture').reserved, 30000);
  } finally { f.close(); }
});

test('fixed namespace preserves Free rows and excludes billing journal from actual scope index', async () => {
  const f = await fixture();
  try {
    const freePayload = {scopeKey: 'scope_a', fixtureSentinel: 'unchanged'};
    const freeState = {key: 'scope_a', payload: freePayload, checksum: digest(freePayload)};
    const freeOp = {...freeState, key: 'free_fixture_operation'};
    await writeRaw(f.dbA, 'b23_states', freeState); await writeRaw(f.dbA, 'b23_operations', freeOp);
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a')));
    assert.deepEqual(await readRaw(f.dbA, 'b23_states', 'scope_a'), freeState); assert.deepEqual(await readRaw(f.dbA, 'b23_operations', 'free_fixture_operation'), freeOp);
    const count = await new Promise(resolve => { const tx = f.dbA.transaction(['b23_operations'], 'readonly'), q = tx.objectStore('b23_operations').index('scopeKey').count('scope_a'); tx.oncomplete = () => resolve(q.result); });
    assert.equal(count, 1);
    const state = await f.storeA.read(f.authA); assert.ok(state.records.every(log => log.scopeKey === billingRootKey));
    assert.equal(stable(state).includes('fixtureToken'), false); assert.equal(stable(state).includes('apiKey'), false);
  } finally { f.close(); }
});

test('corrupt or forward-incompatible root fails closed without resetting balances', async () => {
  const f = await fixture();
  try {
    await initialize(f); await seedJob(f); await f.must(f.execute(f.storeA, f.authA, reserve('job_a')));
    const good = await readRaw(f.dbA, 'b23_states', billingRootKey), corrupt = structuredClone(good); corrupt.payload.ledger.reservations.reservation_job_a.reservation.maxCharge = 0;
    await writeRaw(f.dbA, 'b23_states', corrupt);
    await assert.rejects(f.storeA.read(f.authA), /billing-corrupt-record/); assert.deepEqual(await readRaw(f.dbA, 'b23_states', billingRootKey), corrupt);
    const forward = structuredClone(good); forward.payload.minimumReader = 'future-reader'; forward.checksum = digest(forward.payload);
    await writeRaw(f.dbA, 'b23_states', forward);
    await assert.rejects(f.storeA.read(f.authA), /billing-reader-incompatible/); assert.deepEqual(await readRaw(f.dbA, 'b23_states', billingRootKey), forward);
  } finally { f.close(); }
});

test('missing billing root cannot reset a retained uncertain charge or replay its orphan receipt', async () => {
  const f=await fixture();try{
    await initialize(f);await seedJob(f);await f.must(f.execute(f.storeA,f.authA,reserve('job_a')));
    const request={operationId:'last_dispatch_receipt',expectedRevision:(await f.storeA.read(f.authA)).revision,command:{type:'DISPATCH_JOB',jobId:'job_a'}};
    assert.equal((await f.storeA.transact(f.authA,request)).ok,true);
    await new Promise(resolve=>{const tx=f.dbA.transaction('b23_states','readwrite');tx.objectStore('b23_states').delete(billingRootKey);tx.oncomplete=resolve;});
    const log=await readRaw(f.dbA,'b23_operations',billingOperationKey(request.operationId));
    await assert.rejects(()=>f.storeA.read(f.authA),/billing-missing-root-with-history/);
    assert.equal((await f.storeA.transact(f.authA,request)).reason,'billing-missing-root-with-history');
    const fresh=await f.storeA.transact(f.authA,{operationId:'cannot_reset_budget',expectedRevision:0,command:{type:'CONFIGURE_POLICIES',policies:policies()}});
    assert.equal(fresh.ok,false);assert.equal(fresh.reason,'billing-missing-root-with-history');
    assert.equal(await readRaw(f.dbA,'b23_states',billingRootKey),undefined);assert.deepEqual(await readRaw(f.dbA,'b23_operations',billingOperationKey(request.operationId)),log);
  }finally{f.close();}
});
