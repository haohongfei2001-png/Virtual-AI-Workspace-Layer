import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runSharedBatchContracts} from './shared-directory-batch-contracts.mjs';
test('MOCK_IDB 5001-ref migration and recovery batch contracts',async()=>{const results=await runSharedBatchContracts(new MockIDBFactory());assert.equal(results.length,4,JSON.stringify(results));assert(results.every(r=>r.status==='PASS'),JSON.stringify(results));});
