import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runSharedLifecycleContracts} from './shared-directory-lifecycle-contracts.mjs';
test('shared service lifecycle contracts in mock IDB (not real browser evidence)',async()=>{
 const result=await runSharedLifecycleContracts(new MockIDBFactory());assert.equal(result.checks.length,7);
});
