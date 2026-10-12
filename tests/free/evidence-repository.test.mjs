import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {freeEvidenceCases,evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
for(const [name,action] of freeEvidenceCases)test('MOCK_IDB Free evidence '+name,async()=>{const h=await evidenceHarness(new MockIDBFactory());try{await action(h);}finally{h.close();}});
test('MOCK_IDB Free evidence quota failure is atomic',async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{h.factory.failNextPut=true;assert.equal((await h.repo.apply(scopeOf('A'),evidenceRequest())).ok,false);assert.equal((await h.repo.read(scopeOf('A'))).revision,0);assert.equal((await h.repo.apply(scopeOf('A'),evidenceRequest())).ok,true);}finally{h.close();}
});
