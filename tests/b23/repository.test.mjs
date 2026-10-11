import test from 'node:test';
import { MockIDBFactory } from './mock-idb.mjs';
import { repositoryCases, harness } from './contracts.mjs';
for(const [name,run] of repositoryCases)test('MOCK_IDB_NOT_NATIVE: '+name,async()=>{const h=await harness(new MockIDBFactory());try{await run(h);}finally{h.close();}});
