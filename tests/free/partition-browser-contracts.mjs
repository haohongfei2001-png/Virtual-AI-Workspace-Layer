import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { emptyNativeFacts } from '../../src/data/native-facts.mjs';
import { freeProjection } from '../../src/data/free-projection.mjs';
import { scopeOf } from '../../simulator/data.mjs';

const now = '2026-10-13T00:00:00Z';
const assert = (value, message) => { if (!value) throw Error(message); };
const elapsed = start => Math.round((performance.now() - start) * 100) / 100;
export async function runPartitionBenchmark({size, distribution}) {
  const scope = scopeOf('A'), name = 'free_scale_' + crypto.randomUUID();
  const base = new ScopeRepository({indexedDB, databaseName: name});
  const otherBase = new ScopeRepository({indexedDB, databaseName: name});
  const gate = () => ({channel: 'synthetic', sourceId: 'scale', generation: 'one'});
  const native = new NativeRepository({baseRepository: base, observationGate: gate, clock: () => now});
  const other = new NativeRepository({baseRepository: otherBase, observationGate: gate, clock: () => now});
  let revision = 0;
  const batch = (sourceRevision, refs = [], projects = [], membership = []) => ({scopeKey: emptyNativeFacts(scope).scopeKey,
    sourceRevision, observedAt: now, validUntil: '2026-10-14T00:00:00Z', refs, projects, membership,
    inventory: {projects: 'partial', conversations: 'partial', cursor: null}});
  const ref = i => ({id: `c${i}`, nativeTitle: `原生中文会话 ${i}`, nativeUrl: `https://fixture.test/c/c${i}`, availability: 'available'});
  const project = i => ({id: `p${i}`, nativeName: `原生项目 ${i}`, nativeUrl: `https://fixture.test/project/p${i}`, availability: 'available'});
  const results = {size, distribution, evidence: 'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY'};
  try {
    const started = performance.now();
    for (let offset = 0; offset < size; offset += 2000) {
      const refs = [], projects = [], membership = [];
      if (distribution === 'single-project' && offset === 0) projects.push(project(0));
      for (let i = offset; i < Math.min(size, offset + 2000); i++) {
        refs.push(ref(i));
        const grouped = distribution === 'single-project' || i % 2 === 0;
        if (distribution !== 'single-project' && grouped) projects.push(project(i));
        membership.push({id: `c${i}`, state: grouped ? 'PROJECT' : 'NONE', projectId: grouped ? `p${distribution === 'single-project' ? 0 : i}` : null});
      }
      const write = await native.apply(scope, {operationId: `seed${offset}`, expectedRevision: revision, batch: batch(revision + 1, refs, projects, membership)});
      assert(write.ok, `seed:${JSON.stringify(write)}`); revision++;
    }
    results.seedMs = elapsed(started);
    let start = performance.now();
    const facts = await native.read(scope);
    results.fullReadMs = elapsed(start);
    assert(Object.keys(facts.refs).length === size, 'missing-refs');
    start = performance.now();
    const projection = freeProjection(facts, {scope, now});
    results.projectionMs = elapsed(start);
    assert(projection.refs.length === size, 'projection-missing-refs');
    assert(projection.refs.some(row => row.id === `c${size - 1}`), 'unreachable-tail');
    assert(projection.unknown.length === 0, 'invented-unknown-members');
    assert(projection.noProject.length === (distribution === 'single-project' ? 0 : Math.floor(size / 2)), 'none-mismatch');
    assert(projection.projects.length === (distribution === 'single-project' ? 1 : Math.ceil(size / 2)), 'project-mismatch');
    start = performance.now();
    const tailPage = await native.page(scope, {revision, offset: size + projection.projects.length - 50, limit: 50});
    results.tailPageMs = elapsed(start);
    assert(tailPage.selectedRefs.includes(`c${size - 1}`), 'page-tail-unreachable');
    assert(tailPage.selectedRefs.length === 50 && Object.keys(tailPage.facts.refs).length === 50, 'page-unbounded');
    start = performance.now();
    const change = batch(revision + 1, [{...ref(size - 1), nativeTitle: '尾部增量原名'}]);
    const winner = await Promise.all([
      native.apply(scope, {operationId: 'tail', expectedRevision: revision, batch: change}),
      other.apply(scope, {operationId: 'other', expectedRevision: revision, batch: change}),
    ]);
    results.concurrentIncrementalMs = elapsed(start);
    assert(winner.filter(value => value.ok).length === 1 && winner.filter(value => value.reason === 'revision-conflict').length === 1, 'CAS-winners');
    revision++;
    assert((await native.snapshot(scopeOf('B'))).refs.length === 0, 'cross-scope');
    const refreshed = await other.read(scope);
    assert(refreshed.refs[`c${size - 1}`].nativeTitle === '尾部增量原名', 'tail-not-updated');
    assert(Object.keys(refreshed.refs).length === size, 'incremental-lost-untouched');
    const revoked = await native.invalidate(scope, {operationId: 'revoke', expectedRevision: revision, sourceId: 'scale'});
    assert(revoked.ok, 'revoke-failed');
    base.close();
    assert((await native.snapshot(scope)).refs.length === 0, 'revoke-disclosed-cached');
    results.status = 'PASS';
  } catch (error) { results.status = 'FAIL'; results.error = error.stack; }
  finally {
    base.close(); otherBase.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
  }
  return results;
}

export async function runPartitionRecovery() {
  const {digest} = await import('../../src/data/hash.mjs');
  const scope = scopeOf('A'), name = 'free_recovery_' + crypto.randomUUID();
  const base = new ScopeRepository({indexedDB, databaseName: name});
  let sourceId = 'before_recovery';
  const native = new NativeRepository({baseRepository: base, observationGate: () => ({channel: 'synthetic', sourceId, generation: 'first'}), clock: () => now});
  const batch = sourceRevision => ({scopeKey: emptyNativeFacts(scope).scopeKey, sourceRevision, observedAt: now, validUntil: '2026-10-14T00:00:00Z',
    projects: [], refs: [{id: 'r', nativeTitle: '恢复引用', nativeUrl: 'https://fixture.test/c/r', availability: 'available'}],
    membership: [{id: 'r', state: 'NONE', projectId: null}], inventory: {projects: 'partial', conversations: 'partial', cursor: null}});
  const report = {name: 'root corruption recovery invalidates source and preserves reference', evidence: 'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY'};
  try {
    assert((await native.apply(scope, {operationId: 'seed', expectedRevision: 0, batch: batch(1)})).ok, 'seed');
    const db = await base.open();
    const damagedHash = await new Promise((resolve, reject) => {
      const tx = db.transaction('native_states', 'readwrite'), store = tx.objectStore('native_states'), root = store.get(emptyNativeFacts(scope).scopeKey);
      let hash;
      root.onsuccess = () => { const row = {...root.result, checksum: 'broken'}; hash = digest(row); store.put(row); };
      tx.oncomplete = () => resolve(hash); tx.onabort = () => reject(tx.error);
    });
    const result = await native.recover(scope, {operationId: 'recover', damagedHash});
    assert(result.ok && result.evidenceInvalidated, 'recover-not-invalidated');
    base.close();
    assert((await native.snapshot(scope)).refs.length === 0, 'recovered-authority-exposed');
    assert(Object.keys((await native.read(scope)).refs).length === 1, 'lost-reference');
    assert((await native.apply(scope, {operationId: 'old', expectedRevision: result.revision, batch: batch(2)})).reason === 'native-source-invalidated', 'old-authority-replayed');
    sourceId = 'fresh_authority';
    assert((await native.apply(scope, {operationId: 'new', expectedRevision: result.revision, batch: batch(1)})).ok, 'fresh-authority-rejected');
    assert((await native.snapshot(scope)).noProject.length === 1, 'revalidation-missing');
    assert((await native.recover(scope, {operationId: 'recover', damagedHash})).replayed, 'recovery-replay');
    assert((await native.snapshot(scope)).noProject.length === 1, 'recovery-replay-erased-fresh-state');
    report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.error = error.stack; }
  finally { base.close(); await new Promise(resolve => { const request = indexedDB.deleteDatabase(name); request.onsuccess = resolve; request.onerror = resolve; }); }
  return report;
}
