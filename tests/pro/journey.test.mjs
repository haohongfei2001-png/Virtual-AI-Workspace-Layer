import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createFixtureOwner} from './support/fixture-owner.mjs';
import {runContinuousJourney} from './support/continuous-journey.mjs';
import {createProController} from '../../src/pro/runtime/controller.mjs';
test('P0–P3 continuous journey through actual shared NativeRepository and six ports (MockIDB)',async()=>{
  const factory=new MockIDBFactory(),owner=await createFixtureOwner({indexedDB:factory,fixtureOnly:true}),controller=await createProController(owner);
  try{const result=await runContinuousJourney(owner,controller);assert.equal(result.status,'PASS');assert.equal(result.trace.length,11);assert.equal(factory.databasesMap.size,1);}finally{controller.destroy();}
});
