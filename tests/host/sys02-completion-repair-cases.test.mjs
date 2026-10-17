import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createSys02CompletionRepairCases} from './sys02-completion-repair-cases.mjs';
// L portability only: this runner does not establish native IndexedDB or S.
for(const item of createSys02CompletionRepairCases(new MockIDBFactory()))test('MOCK_PORTABILITY_ONLY '+item.name,item.run);
