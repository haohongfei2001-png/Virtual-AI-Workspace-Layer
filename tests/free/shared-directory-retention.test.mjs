import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {runSharedRetentionContracts} from './shared-directory-retention-contracts.mjs';

test('shared directory retention portable contracts',async t=>{
 const results=await runSharedRetentionContracts(new MockIDBFactory());
 assert.equal(results.length,11);
 for(const result of results)await t.test(result.name,()=>assert.equal(result.status,'PASS',result.error));
});
