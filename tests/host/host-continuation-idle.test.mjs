import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostContinuationOwner} from '../../src/runtime/host-continuation-owner.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'a',organizationId:'personal'});
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){const native={listContinuations:async()=>[],markContinuationComplete:async()=>({ok:true}),markContinuationNeedsRevalidation:async()=>({ok:true})},evidence={version:async()=>0,applyContinuation:async()=>({ok:true})};return {native,owner:createHostContinuationOwner({nativeRepository:native,evidenceRepository:evidence}),args:{scope,guard:()=>true,profileId:'test',profileVersion:1}};}
for(const stage of ['verify','list'])for(const outcome of ['resolve','reject'])test(`continuation abort keeps ${stage} ${outcome} counted after busy is released`,async()=>{
 const f=fixture(),gate=deferred(),abort=new AbortController();if(stage==='list')f.native.listContinuations=()=>gate.promise;
 const task=f.owner.drain({...f.args,signal:abort.signal,...(stage==='verify'?{verify:()=>gate.promise}:{})});assert.equal(f.owner.isIdle(),false);await flush();abort.abort();assert.equal((await task).state,'cancelled');assert.equal(f.owner.isIdle(),false);
 f.native.listContinuations=async()=>[];assert.equal((await f.owner.drain(f.args)).state,'idle');assert.equal(f.owner.isIdle(),false);
 if(outcome==='resolve')gate.resolve(stage==='verify'?true:[]);else gate.reject(Error('late'));await flush();assert.equal(f.owner.isIdle(),true);
});
test('continuation empty cache and invalid request cause no retained busy state',async()=>{const f=fixture();assert.equal(f.owner.isIdle(),true);assert.equal((await f.owner.drain({})).state,'cancelled');assert.equal(f.owner.isIdle(),true);assert.equal((await f.owner.drain(f.args)).state,'idle');assert.equal(f.owner.isIdle(),true);});
