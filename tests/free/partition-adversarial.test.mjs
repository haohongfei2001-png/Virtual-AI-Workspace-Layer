import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { harness, A } from '../b23/contracts.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { emptyNativeFacts } from '../../src/data/native-facts.mjs';
import { digest } from '../../src/data/hash.mjs';

const now = '2026-10-13T00:00:00Z';
function batch(revision, title = '原名') {
  return {scopeKey: emptyNativeFacts(A).scopeKey, sourceRevision: revision, observedAt: now, validUntil: '2026-10-14T00:00:00Z',
    projects: [], refs: [{id: 'tail', nativeTitle: title, nativeUrl: 'https://fixture.test/c/tail', availability: 'available'}],
    membership: [{id: 'tail', state: 'NONE', projectId: null}], inventory: {projects: 'partial', conversations: 'partial', cursor: null}};
}
async function setup() {
  const h = await harness(new MockIDBFactory());
  let sourceId = 'original';
  const native = new NativeRepository({baseRepository: h.base, clock: () => now,
    observationGate: () => ({channel: 'synthetic', sourceId, generation: 'initial'})});
  return {...h, native, changeSource: value => { sourceId = value; }};
}
async function corruptRoot(h) {
  const db = await h.base.open(), key = emptyNativeFacts(A).scopeKey;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('native_states', 'readwrite'), store = tx.objectStore('native_states'), request = store.get(key);
    let damagedHash;
    request.onsuccess = () => { const row = {...request.result, checksum: 'corrupted'}; damagedHash = digest(row); store.put(row); };
    tx.oncomplete = () => resolve(damagedHash); tx.onabort = () => reject(tx.error);
  });
}

test('MOCK_IDB recovered root keeps Pro assets and references but revokes source; only fresh privileged source revalidates', async () => {
  const h = await setup();
  try {
    const humanBefore = (await h.repo.read(A)).state;
    assert.equal((await h.native.apply(A, {operationId: 'seed', expectedRevision: 0, batch: batch(1)})).ok, true);
    const damagedHash = await corruptRoot(h);
    await assert.rejects(h.native.read(A), /corrupt-native-record/);
    const recovery = await h.native.recover(A, {operationId: 'recover', damagedHash});
    assert.equal(recovery.ok, true); assert.equal(recovery.evidenceInvalidated, true);
    assert.equal((await h.native.snapshot(A)).refs.length, 0);
    assert.equal(Object.keys((await h.native.read(A)).refs).length, 1);
    assert.deepEqual((await h.repo.read(A)).state, humanBefore);
    const denied = await h.native.apply(A, {operationId: 'old-source', expectedRevision: recovery.revision, batch: batch(2)});
    assert.equal(denied.reason, 'native-source-invalidated');
    h.changeSource('fresh_verified_source');
    assert.equal((await h.native.apply(A, {operationId: 'new-source', expectedRevision: recovery.revision, batch: batch(1, '重新核验原名')})).ok, true);
    assert.equal((await h.native.snapshot(A)).noProject[0].displayTitle, '重新核验原名');
    assert.equal((await h.native.recover(A, {operationId: 'recover', damagedHash})).replayed, true);
    assert.equal((await h.native.snapshot(A)).noProject[0].displayTitle, '重新核验原名');
  } finally { h.close(); }
});

test('MOCK_IDB revision-bound pagination refuses combining pages across native updates', async () => {
  const h = await setup();
  try {
    assert.equal((await h.native.apply(A, {operationId: 'seed', expectedRevision: 0, batch: batch(1)})).ok, true);
    const first = await h.native.page(A, {limit: 1});
    assert.equal(first.total, 1); assert.deepEqual(first.selectedRefs, ['tail']);
    assert.equal((await h.native.apply(A, {operationId: 'rename', expectedRevision: 1, batch: batch(2, '新名')})).ok, true);
    await assert.rejects(h.native.page(A, {revision: first.revision, offset: 1, limit: 1}), /snapshot-revision-changed/);
    await assert.rejects(h.native.page(A, {limit: 5001}), /invalid-native-page/);
  } finally { h.close(); }
});
