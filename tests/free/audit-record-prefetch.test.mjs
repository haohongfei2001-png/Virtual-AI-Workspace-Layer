import test from 'node:test';
import assert from 'node:assert/strict';
import {prefetchExactAuditRecords} from '../../src/data/audit-record-prefetch.mjs';
test('bounded prefetch rejects oversized duplicate and non-string key sets before any storage access',()=>{
 for(const keys of [null,['a','a'],[1],Array.from({length:5001},(_,i)=>String(i))]){
  let failure=null;prefetchExactAuditRecords(new Proxy({},{get(){assert.fail('invalid keys must not read storage');}}),keys,()=>{},()=>assert.fail('invalid keys accepted'),e=>failure=e);
  assert.match(failure?.message??'',/invalid-audit-keys/);
 }
});
test('unavailable bulk APIs return no certificate and leave exact reads to the caller',()=>{
 let done=false;prefetchExactAuditRecords({},['a'],()=>{},records=>{assert.equal(records,null);done=true;},assert.fail);assert(done);
});
