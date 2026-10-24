import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createInitialAckRepairCases} from './initial-ack-idb-cases.mjs';
const cases=createInitialAckRepairCases(new MockIDBFactory());
assert.equal(cases.length,3);
for(const item of cases)test('L portable preparation, not D: '+item.name,async()=>{const result=await item.run();assert.equal(result.status,'PASS');assert.equal(result.metadataGETsOnResume,0);});
test('L initialization failure still deletes its isolated test database',async()=>{
 const storage=new MockIDBFactory(),deleted=[];
 const failing={open(){throw Error('injected-open-failure');},deleteDatabase(name){deleted.push(name);return storage.deleteDatabase(name);}};
 await assert.rejects(createInitialAckRepairCases(failing)[0].run());
 assert.equal(deleted.length,1);assert.match(deleted[0],/^initial_ack_repair_/);
});
