import test from 'node:test';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {lifecycleCases,lifecycleHarness} from './native-lifecycle-contracts.mjs';
for(const [name,run] of lifecycleCases)test('MOCK_IDB lifecycle '+name,async t=>{const h=await lifecycleHarness(new MockIDBFactory());t.after(h.close);await run(h);});
