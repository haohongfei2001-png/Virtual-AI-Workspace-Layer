import { DATABASE_VERSION } from '../../src/data/schema.mjs';
import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
import { WorkspaceRepository } from '../../src/data/repository.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { emptyNativeFacts } from '../../src/data/native-facts.mjs';
import { persistentSeed, syntheticEvidenceGate } from '../../simulator/persistent-seed.mjs';
import { scopeOf } from '../../simulator/data.mjs';
import { digest } from '../../src/data/hash.mjs';
import { createFixtureService } from '../../simulator/service.mjs';

function check(condition, message) { if (!condition) throw Error(message); }
export async function runNativeContracts() {
  const scope = scopeOf('A'), now = '2026-10-13T00:00:00Z', results = [];
  const name = 'free_browser_' + crypto.randomUUID().replaceAll('-', '');
  const base = new ScopeRepository({indexedDB, databaseName: name});
  const otherBase = new ScopeRepository({indexedDB, databaseName: name});
  const authority = () => ({channel: 'synthetic', sourceId: 'fixture', generation: 'initial'});
  const native = new NativeRepository({baseRepository: base, observationGate: authority, clock: () => now});
  const other = new NativeRepository({baseRepository: otherBase, observationGate: authority, clock: () => now});
  const legacy = new WorkspaceRepository({baseRepository: base, evidenceGate: syntheticEvidenceGate});
  const batch = sourceRevision => ({scopeKey: emptyNativeFacts(scope).scopeKey, sourceRevision,
    observedAt: now, validUntil: '2026-10-14T00:00:00Z',
    projects: ['one', 'two'].map(id => ({id, nativeName: '同名原生项目', nativeUrl: `https://fixture.test/project/${id}`, availability: 'available'})),
    refs: ['member', 'ordinary', 'unknown'].map(id => ({id, nativeTitle: `原生 ${id}`, nativeUrl: `https://fixture.test/c/${id}`, availability: 'available'})),
    membership: [{id: 'member', state: 'PROJECT', projectId: 'one'}, {id: 'ordinary', state: 'NONE', projectId: null}],
    inventory: {projects: 'partial', conversations: 'partial', cursor: 'next'},
  });
  const run = async (name, action) => {
    try { await action(); results.push({name, status: 'PASS'}); }
    catch (error) { results.push({name, status: 'FAIL', error: error.message}); }
  };
  try {
    await run('REAL_IDB v2 upgrade closes old connection and preserves Pro root bytes', async () => {
      const seed = persistentSeed(scope, 'https://vaiwl-hf.test');
      const old = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 2);
        request.onupgradeneeded = () => {
          const database = request.result;
          database.createObjectStore('refs', {keyPath: 'key'}).createIndex('scopeKey', 'scopeKey');
          database.createObjectStore('operations', {keyPath: 'key'});
          for (const store of ['b23_states', 'b23_checkpoints', 'b23_views']) database.createObjectStore(store, {keyPath: 'key'});
          database.createObjectStore('b23_operations', {keyPath: 'key'}).createIndex('scopeKey', 'payload.scopeKey');
          request.transaction.objectStore('b23_states').put({key: seed.scopeKey, payload: seed, checksum: digest(seed)});
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      let closed = false;
      old.onversionchange = () => { closed = true; old.close(); };
      check((await base.open()).version === DATABASE_VERSION && closed, 'versionchange-not-observed');
      check(digest((await legacy.read(scope)).state) === digest(seed), 'legacy-root-changed');
      const denied = await new Promise(resolve => {
        const request = indexedDB.open(name, 2);
        request.onerror = () => resolve(request.error.name === 'VersionError');
        request.onsuccess = () => { request.result.close(); resolve(false); };
      });
      check(denied, 'old-reader-opened');
    });
    await run('REAL_IDB same-name projects and PROJECT/NONE/UNKNOWN survive reopen', async () => {
      const result = await native.apply(scope, {operationId: 'seed', expectedRevision: 0, batch: batch(1)});
      check(result.ok, JSON.stringify(result));
      base.close();
      const snapshot = await native.snapshot(scope);
      check(snapshot.projects.length === 2 && snapshot.projects[0].members.length === 1, 'project-mapping');
      check(snapshot.noProject.length === 1 && snapshot.unknown.length === 1, 'tri-state');
    });
    await run('REAL_IDB two connections serialize CAS with one winner', async () => {
      const results = await Promise.all([native.apply(scope, {operationId: 'first', expectedRevision: 1, batch: batch(2)}),
        other.apply(scope, {operationId: 'second', expectedRevision: 1, batch: batch(2)})]);
      check(results.filter(result => result.ok).length === 1, 'CAS-winners');
      check(results.filter(result => result.reason === 'revision-conflict').length === 1, 'CAS-conflict');
    });
    await run('REAL_IDB native rename and move are atomic and do not touch Pro assets', async () => {
      const before = digest((await legacy.read(scope)).state), update = batch(3);
      update.membership[0].projectId = 'two';
      update.refs[0].nativeTitle = '更新原名';
      check((await native.apply(scope, {operationId: 'move', expectedRevision: 2, batch: update})).ok, 'move-failed');
      const snapshot = await other.snapshot(scope);
      check(snapshot.projects[0].members.length === 0 && snapshot.projects[1].members[0].displayTitle === '更新原名', 'move-projection');
      check(digest((await legacy.read(scope)).state) === before, 'Pro-assets-changed');
    });
    await run('REAL_IDB revoked binding aborts after put without persisting a receipt', async () => {
      let checks = 0;
      const result = await native.apply(scope, {operationId: 'abort', expectedRevision: 3, batch: batch(4)},
        {guard: () => ++checks < 6});
      check(!result.ok, 'binding-accepted');
      check((await native.read(scope)).revision === 3, 'aborted-root-persisted');
    });
    await run('REAL_IDB scope isolation and durable source invalidation', async () => {
      check((await native.snapshot(scopeOf('B'))).refs.length === 0, 'cross-scope-read');
      check((await native.invalidate(scope, {operationId: 'revoke', expectedRevision: 3, sourceId: 'fixture'})).ok, 'revoke-failed');
      base.close();
      check((await native.snapshot(scope)).refs.length === 0, 'revocation-lost');
      check(Object.keys((await native.read(scope)).refs).length === 3, 'revocation-deleted-assets');
      const result = await native.apply(scope, {operationId: 'late', expectedRevision: 4, batch: batch(5)});
      check(result.reason === 'native-source-invalidated', 'late-source-revived');
    });
    await run('REAL_IDB broker-backed native fixture lists all permitted refs and original titles', async () => {
      const frame = {documentId: 'browser_fixture', documentLifecycle: 'active', url: `${location.origin}/hf/A/c/T0`};
      const service = createFixtureService({indexedDB, extensionId: 'fixture_extension', getFrame: async () => frame});
      const sender = {id: 'fixture_extension', tab: {id: 1}, frameId: 0, ...frame};
      try {
        const binding = await service.broker.handle({v: 1, type: 'BIND', clientId: 'fixture', seq: 1}, sender);
        check(binding.ok, JSON.stringify(binding));
        const result = await service.broker.handle({v: 1, type: 'B23_FREE_SNAPSHOT', clientId: 'fixture', seq: 2, leaseId: binding.leaseId}, sender);
        check(result.ok, JSON.stringify(result));
        check(result.snapshot.projects.length === 2 && result.snapshot.refs.length === 603, 'fixture-inventory');
        check(result.snapshot.noProject.find(ref => ref.id === 'T0').displayTitle === '从哪里开始', 'derived-title-leaked');
      } finally { service.close(); }
    });
  } finally { base.close(); otherBase.close(); }
  return {level: 'REAL_BROWSER_INDEXEDDB_SYNTHETIC_ONLY', results,
    pass: results.filter(result => result.status === 'PASS').length,
    fail: results.filter(result => result.status === 'FAIL').length,
    realChatGPT: 'NOT_RUN', nativeUI: 'NOT_RUN'};
}
