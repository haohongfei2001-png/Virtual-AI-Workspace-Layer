import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameCandidateMigration} from '../../src/host/frame-candidate-migration.mjs';
const dto=(id,extra={})=>({id,projectId:'native-project',presentation:{offset:32,scrollTop:137,focused:true},ready:true,focusAllowed:true,...extra});
function fixture(){const restored=[],revealed=[];const model=createFrameCandidateMigration({now:()=>1000,restoreCandidates:p=>restored.push(p),reveal:p=>{revealed.push(p);return true;}});return {model,restored,revealed};}
test('fresh mount without local activation still accepts a migration learned by the parent',()=>{
 const f=fixture();assert.equal(f.model.offer(dto('parent-action')),true);assert.equal(f.model.apply(),true);assert.equal(f.revealed.length,1);
});
test('explicit new activation clears prior interaction interruption only for its exact action id',()=>{
 const f=fixture();f.model.interrupt();assert.equal(f.model.beginActivation('new-action'),true);
 assert.equal(f.model.offer(dto('unrelated-action')),false);assert.equal(f.model.apply(),false);
 assert.equal(f.model.offer(dto('new-action')),true);assert.equal(f.model.apply(),true);assert.equal(f.revealed.length,1);assert.equal(f.revealed[0].focus,true);
});
test('new activation retains previously consumed and interrupted migration tombstones',()=>{
 const f=fixture();assert(f.model.offer(dto('completed')));assert(f.model.apply());assert(f.model.offer(dto('interrupted')));f.model.interrupt();assert.equal(f.model.apply(),false);
 assert.equal(f.model.beginActivation('fresh'),true);assert.equal(f.model.offer(dto('completed')),false);assert.equal(f.model.offer(dto('interrupted')),false);assert.equal(f.model.beginActivation('completed'),false);assert.equal(f.model.beginActivation('interrupted'),false);
 assert(f.model.offer(dto('fresh')));assert(f.model.apply());assert.equal(f.revealed.length,2);
});
test('replacement activation fences a prior action even before its migration first arrives',()=>{
 const f=fixture();assert(f.model.beginActivation('first'));assert(f.model.beginActivation('second'));
 assert.equal(f.model.offer(dto('first')),false);assert.equal(f.model.beginActivation('first'),false);
 assert(f.model.offer(dto('second')));assert(f.model.apply());assert.equal(f.revealed.length,1);
});
test('activation replacement terminates unready pending migration without restoring it',()=>{
 const f=fixture();assert(f.model.beginActivation('first'));assert(f.model.offer(dto('first',{ready:false,focusAllowed:false})));
 assert(f.model.beginActivation('second'));assert.equal(f.model.isPending('first'),false);assert.equal(f.model.offer(dto('first')),false);
 assert(f.model.offer(dto('second')));assert(f.model.apply());assert.equal(f.restored.length,1);
});
test('input after activation cancels even a first migration that arrives later',()=>{
 const f=fixture();assert(f.model.beginActivation('first'));f.model.interrupt();f.model.offer(dto('first'));assert.equal(f.model.apply(),false);assert.equal(f.model.isPending('first'),false);assert.deepEqual(f.restored,[]);assert.deepEqual(f.revealed,[]);
 assert.equal(f.model.beginActivation('first'),false);f.model.offer(dto('first'));assert.equal(f.model.apply(),false);
 assert(f.model.beginActivation('second'));assert(f.model.offer(dto('second')));assert(f.model.apply());assert.equal(f.revealed.length,1);
});
test('duplicate activation cannot erase interruption while its matching migration is pending',()=>{
 const f=fixture();assert(f.model.beginActivation('action'));assert(f.model.offer(dto('action',{ready:false,focusAllowed:false})));f.model.interrupt();assert.equal(f.model.beginActivation('action'),false);
 f.model.offer(dto('action'));assert.equal(f.model.apply(),false);assert.deepEqual(f.restored,[]);assert.deepEqual(f.revealed,[]);
});
test('malformed activation ids do not unlock interrupted state or replace a live action',()=>{
 const f=fixture();assert(f.model.beginActivation('action'));assert(f.model.offer(dto('action')));
 for(const id of [null,undefined,{},'',42,'bad id'])assert.equal(f.model.beginActivation(id),false);
 assert.equal(f.model.isPending('action'),true);f.model.interrupt();for(const id of ['',null,{}])assert.equal(f.model.beginActivation(id),false);assert.equal(f.model.apply(),false);assert.deepEqual(f.revealed,[]);
});
