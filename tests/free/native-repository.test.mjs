import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { harness, A, B } from '../b23/contracts.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
import { emptyNativeFacts } from '../../src/data/native-facts.mjs';

const now = '2026-10-13T00:00:00Z';
const gate = () => ({channel: 'synthetic', sourceId: 'native_fixture', generation: 'first'});
function request(expectedRevision = 0, operationId = 'observe') {
  return {operationId, expectedRevision, batch: {
    scopeKey: emptyNativeFacts(A).scopeKey, sourceRevision: expectedRevision + 1, observedAt: now,
    validUntil: '2026-10-14T00:00:00Z', projects: [],
    refs: [{id: 'T0', nativeTitle: '真实结构的合成标题', nativeUrl: 'https://vaiwl-hf.test/hf/A/c/T0', availability: 'available'}],
    membership: [{id: 'T0', state: 'NONE', projectId: null}],
    inventory: {projects: 'partial', conversations: 'partial', cursor: null},
  }};
}
async function setup() {
  const fixture = await harness(new MockIDBFactory());
  return {...fixture, native: new NativeRepository({baseRepository: fixture.base, observationGate: gate, clock: () => now})};
}

test('MOCK_IDB native facts share the B1 database and preserve all Pro assets byte-for-byte', async () => {
  const fixture = await setup();
  try {
    const before = (await fixture.repo.read(A)).state;
    assert.equal((await fixture.native.apply(A, request())).ok, true);
    fixture.close();
    assert.equal((await fixture.native.snapshot(A)).noProject[0].displayTitle, '真实结构的合成标题');
    assert.deepEqual((await fixture.repo.read(A)).state, before);
    assert.equal(fixture.factory.databasesMap.size, 1);
    assert.equal((await fixture.native.read(B)).revision, 0);
  } finally { fixture.close(); }
});

test('MOCK_IDB native CAS and idempotent receipts survive two connections', async () => {
  const fixture = await setup();
  const otherBase = new ScopeRepository({indexedDB: fixture.factory, databaseName: fixture.name});
  const other = new NativeRepository({baseRepository: otherBase, observationGate: gate, clock: () => now});
  try {
    const results = await Promise.all([fixture.native.apply(A, request()), other.apply(A, request(0, 'other'))]);
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(results.filter(result => result.reason === 'revision-conflict').length, 1);
    const winner = results[0].ok ? 'observe' : 'other';
    assert.equal((await other.apply(A, request(0, winner))).replayed, true);
    const conflict = request(0, winner);
    conflict.batch.refs[0].nativeTitle = 'changed replay';
    assert.equal((await other.apply(A, conflict)).reason, 'operation-replay-conflict');
  } finally { otherBase.close(); fixture.close(); }
});

test('MOCK_IDB source gate is privileged; revocation survives reopen without deleting facts', async () => {
  const fixture = await setup();
  try {
    const denied = new NativeRepository({baseRepository: fixture.base});
    await assert.rejects(denied.apply(A, request()), /untrusted-native-source/);
    await fixture.native.apply(A, request());
    assert.equal((await fixture.native.invalidate(A, {sourceId: 'native_fixture', expectedRevision: 1, operationId: 'revoke'})).ok, true);
    fixture.close();
    assert.equal((await fixture.native.snapshot(A)).refs.length, 0);
    assert.equal(Object.keys((await fixture.native.read(A)).refs).length, 1);
    assert.equal((await fixture.native.apply(A, request(2, 'late'))).reason, 'native-source-invalidated');
  } finally { fixture.close(); }
});

test('MOCK_IDB quota and binding loss roll back native root and receipt atomically', async () => {
  const fixture = await setup();
  try {
    fixture.factory.failNextPut = true;
    assert.equal((await fixture.native.apply(A, request())).ok, false);
    assert.equal((await fixture.native.read(A)).revision, 0);
    const controller = new AbortController();
    let checks = 0;
    const aborted = await fixture.native.apply(A, request(), {signal: controller.signal, guard: () => {
      if (++checks === 5) controller.abort();
      return !controller.signal.aborted;
    }});
    assert.equal(aborted.ok, false);
    assert.equal((await fixture.native.read(A)).revision, 0);
    assert.equal((await fixture.native.apply(A, request())).ok, true);
  } finally { fixture.close(); }
});

test('MOCK_IDB missing native root with history is corruption, never a fresh empty account', async () => {
  const fixture = await setup();
  try {
    await fixture.native.apply(A, request());
    const database = await fixture.base.open();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('native_states', 'readwrite');
      transaction.objectStore('native_states').delete(emptyNativeFacts(A).scopeKey);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    await assert.rejects(fixture.native.read(A), /missing-native-root/);
    assert.equal((await fixture.native.apply(A, request(0, 'overwrite'))).reason, 'missing-native-root');
    assert.equal((await fixture.repo.read(A)).state.revision, 1);
  } finally { fixture.close(); }
});
