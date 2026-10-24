import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runSharedReadContracts} from './shared-directory-read-contracts.mjs';
test('shared directory owner read contracts with mock IDB (not browser certification)',async()=>{const result=await runSharedReadContracts(new MockIDBFactory());assert.equal(result.checks.length,6);});
