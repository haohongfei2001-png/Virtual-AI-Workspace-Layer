import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {evidenceHarness,evidenceRequest} from './evidence-contracts.mjs';
import {scopeOf} from '../../simulator/data.mjs';
const scope=scopeOf('A');
for(const otherRef of [false,true])test(`MOCK_IDB source observation cannot regress past untouched evidence (${otherRef?'different-ref batch':'source-only batch'})`,async()=>{
 const h=await evidenceHarness(new MockIDBFactory());try{
  assert.equal((await h.repo.apply(scope,evidenceRequest())).ok,true);const before=await h.repo.read(scope);
  const request=evidenceRequest('source_regression',1);Object.assign(request.batch.sources[0],{sourceRevision:2,observedAt:'2026-10-13T11:00:00Z'});
  request.batch.events=otherRef?[{...request.batch.events[0],id:'second',conversationId:'T1',messageId:'m2',sourceRevision:2,observedAt:'2026-10-13T11:00:00Z',sentAt:'2026-10-13T11:00:00Z'}]:[];
  const rejected=await h.repo.apply(scope,request);assert.equal(rejected.ok,false,'regressing source cannot poison an untouched valid partition');
  assert.deepEqual(await h.repo.read(scope),before,'root, source, pieces and recovery revision remain unchanged');
  assert.equal((await h.repo.page(scope,{ids:['T0']})).evidence.events.send.id,'send');
  request.batch.sources[0].observedAt='2026-10-13T12:00:00Z';
  const retry=await h.repo.apply(scope,request);assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(retry.replayed,false,'failed write leaves no successful operation receipt');
  assert.equal((await h.repo.read(scope)).events.send.id,'send');
 }finally{h.close();}
});
