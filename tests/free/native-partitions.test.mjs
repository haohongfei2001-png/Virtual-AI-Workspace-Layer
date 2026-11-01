import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { normalizedScope } from '../../src/b1/identity.mjs';
import { scopeOf } from '../../simulator/data.mjs';
import { digest } from '../../src/data/hash.mjs';
import { nativePartitionKey, NATIVE_PARTITION_FORMAT } from '../../src/data/native-partitions.mjs';
const scope = normalizedScope(scopeOf('A')), now = '2026-10-13T00:00:00Z';
function fixture() {
  const factory = new MockIDBFactory(), base = new ScopeRepository({indexedDB: factory, databaseName: 'partition'});
  let sourceId = 'first';
  const native = new NativeRepository({baseRepository: base, clock: () => now,
    observationGate: () => ({channel: 'synthetic', sourceId, generation: 'one'})});
  return {factory, base, native, source: value => {sourceId = value;}};
}
function request(revision, title = '原生名') {
  return {operationId: `op_${revision}`, expectedRevision: revision, batch: {scopeKey: scope.key, sourceRevision: revision + 1,
    observedAt: now, validUntil: '2026-10-14T00:00:00Z',
    projects: [{id: 'P1', nativeName: '原生项目', nativeUrl: 'https://vaiwl-hf.test/hf/A/project/P1', availability: 'available'}],
    refs: [{id: 'R1', nativeTitle: title, nativeUrl: 'https://vaiwl-hf.test/hf/A/c/R1', availability: 'available'}],
    membership: [{id: 'R1', state: 'PROJECT', projectId: 'P1'}], inventory: {projects: 'partial', conversations: 'partial', cursor: null}}};
}
async function row(base, key) {
  const db = await base.open();
  return new Promise(resolve => {const req = db.transaction('native_states').objectStore('native_states').get(key); req.onsuccess = () => resolve(req.result);});
}
test('native partition updates only changed pieces, fences pages and bounds retained generations', async () => {
  const {base, native} = fixture();
  try {
    for (let revision = 0; revision < 4; revision++) assert.equal((await native.apply(scope, request(revision, `标题${revision}`))).ok, true);
    assert.equal((await row(base, scope.key)).payload.format, NATIVE_PARTITION_FORMAT);
    assert.equal(await row(base, nativePartitionKey(scope.key, 'refs', 'R1', 1)), undefined);
    assert.equal(await row(base, nativePartitionKey(scope.key, 'refs', 'R1', 2)), undefined);
    assert.ok(await row(base, nativePartitionKey(scope.key, 'refs', 'R1', 3)));
    assert.ok(await row(base, nativePartitionKey(scope.key, 'refs', 'R1', 4)));
    const page = await native.page(scope, {offset: 1, limit: 1});
    assert.deepEqual(page.selectedRefs, ['R1']);
    assert.equal(page.facts.projects.P1.nativeName, '原生项目');
    await assert.rejects(native.page(scope, {revision: 1}), /snapshot-revision-changed/);
  } finally {base.close();}
});
test('damaged native root recovers all references, invalidates authority and permits separately gated re-observation', async () => {
  const {base, native, source} = fixture();
  try {
    assert.equal((await native.apply(scope, request(0))).ok, true);
    const db = await base.open(), damaged = {key: scope.key, payload: {broken: true}, checksum: 'bad'};
    await new Promise(resolve => {const tx = db.transaction('native_states', 'readwrite');tx.objectStore('native_states').put(damaged);tx.oncomplete = resolve;});
    await assert.rejects(native.read(scope), /corrupt-native-record/);
    const recovered = await native.recover(scope, {operationId: 'repair', damagedHash: digest(damaged)});
    assert.equal(recovered.ok, true); assert.equal(recovered.evidenceInvalidated, true);
    assert.equal(Object.keys((await native.read(scope)).refs).length, 1);
    assert.equal((await native.snapshot(scope)).refs.length, 0);
    assert.equal((await native.apply(scope, request(2))).reason, 'native-source-invalidated');
    source('separately_granted');
    assert.equal((await native.apply(scope, request(2))).ok, true);
    assert.equal((await native.snapshot(scope)).projects[0].members.length, 1);
  } finally {base.close();}
});
