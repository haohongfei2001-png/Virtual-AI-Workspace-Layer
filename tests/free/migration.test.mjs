import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { ScopeRepository } from '../../src/b1/scope-repository.mjs';
import { B23_STORES } from '../../src/data/schema.mjs';
import { NativeRepository } from '../../src/data/native-repository.mjs';
import { scopeOf } from '../../simulator/data.mjs';

test('MOCK_IDB v2 upgrade preserves roots, partitions and human logs; old reader cannot reopen v2', async () => {
  const factory = new MockIDBFactory();
  const old = await new Promise((resolve, reject) => {
    const request = factory.open('free_migration', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('refs', {keyPath: 'key'}).createIndex('scopeKey', 'scopeKey');
      database.createObjectStore('operations', {keyPath: 'key'});
      for (const name of B23_STORES) {
        const store = database.createObjectStore(name, {keyPath: 'key'});
        if (name === 'b23_operations') store.createIndex('scopeKey', 'payload.scopeKey');
        store.put({key: 'sentinel', payload: {human: name, projectId: null}});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let versionChanged = false;
  old.onversionchange = () => { versionChanged = true; old.close(); };
  const base = new ScopeRepository({indexedDB: factory, databaseName: 'free_migration'});
  try {
    const database = await base.open();
    assert.equal(database.version, 3);
    assert(versionChanged);
    for (const name of B23_STORES) {
      const row = await new Promise(resolve => {
        const request = database.transaction(name).objectStore(name).get('sentinel');
        request.onsuccess = () => resolve(request.result);
      });
      assert.deepEqual(row, {key: 'sentinel', payload: {human: name, projectId: null}});
    }
    const native = await new NativeRepository({baseRepository: base}).read(scopeOf('A'));
    assert.deepEqual(native.membership, {});
    await assert.rejects(new Promise((resolve, reject) => {
      const request = factory.open('free_migration', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }), /VersionError/);
  } finally { base.close(); }
});
