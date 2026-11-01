import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest_partitionRecord,manifest_partitionUnpackMeasured} from '../../src/data/partition-manifest.mjs';
import {stable} from '../../src/data/hash.mjs';
test('measured partition checksum returns exact canonical code units for this read',()=>{
 for(const payload of [{name:'中文😀\ud800',values:[1,-0,null,true,'"\\\n']},{'2':2,'10':10,a:{z:1,b:2}},Object.assign(Object.create(null),{b:'b',a:'a'})]){
  const row=manifest_partitionRecord('key',payload),measured=manifest_partitionUnpackMeasured(row);
  assert.equal(measured.payload,payload);assert.equal(measured.units,stable(payload).length);
 }
});
test('measured partition never trusts an old size or checksum after payload mutation',()=>{
 const row=manifest_partitionRecord('key',{name:'original',id:'row'});manifest_partitionUnpackMeasured(row);row.payload.name='mutated';row.units=1;
 assert.throws(()=>manifest_partitionUnpackMeasured(row),/corrupt-record/);assert.throws(()=>manifest_partitionUnpackMeasured(null),/corrupt-record/);
 const repaired=manifest_partitionRecord('key',row.payload);assert.equal(manifest_partitionUnpackMeasured(repaired).units,stable(row.payload).length);
});
