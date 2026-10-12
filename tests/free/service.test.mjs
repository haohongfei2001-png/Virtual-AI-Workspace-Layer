import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIDBFactory } from '../b23/mock-idb.mjs';
import { createFixtureService } from '../../simulator/service.mjs';

test('MOCK_IDB broker-backed Free fixture maps 604 native refs without virtual themes', async () => {
  const frame = {documentId: 'free_document', documentLifecycle: 'active', url: 'https://vaiwl-hf.test/hf/A/c/T0'};
  const service = createFixtureService({indexedDB: new MockIDBFactory(), extensionId: 'fixture_extension', getFrame: async () => frame});
  const sender = {id: 'fixture_extension', tab: {id: 1}, frameId: 0, ...frame};
  const message = {v: 1, clientId: 'free_test', seq: 1, type: 'BIND'};
  try {
    const binding = await service.broker.handle(message, sender);
    assert.equal(binding.ok, true);
    const result = await service.broker.handle({...message, seq: 2, type: 'B23_FREE_SNAPSHOT', leaseId: binding.leaseId}, sender);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.snapshot.projects.length, 2);
    assert.equal(result.snapshot.refs.length, 603);
    assert.equal(result.snapshot.refs.find(ref => ref.id === 'T0').displayTitle, '从哪里开始');
    assert(result.snapshot.noProject.some(ref => ref.id === 'T0'));
    assert(result.snapshot.projects.find(project => project.id === 'P1').members.some(ref => ref.id === 'T1'));
    assert.equal(result.snapshot.projects.some(project => project.id === 'W0'), false);
  } finally { service.close(); }
});
