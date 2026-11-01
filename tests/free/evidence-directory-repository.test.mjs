import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness} from './evidence-contracts.mjs';
import {directoryCases} from './evidence-directory-contracts.mjs';
for(const [name,run] of directoryCases)test('MOCK_IDB directory '+name,async()=>{const h=await evidenceHarness(new MockIDBFactory());try{await run(h);}finally{h.close();}});
