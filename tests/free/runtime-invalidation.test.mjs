import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeRuntime} from '../../src/data/free-runtime.mjs';
import {emptyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const A=scopeOf('A'),B=scopeOf('B'),now='2026-10-13T12:00:00Z';
const scopeKey=scope=>normalizedScope(scope).key;
const batch=()=>({sources:[{id:'test_source',generation:'one',sourceRevision:1,channel:'synthetic',observedAt:now,validUntil:'2026-10-14T00:00:00Z'}],events:[],hints:[],coverage:[]});
function harness({publication='invalidation',source=null,failEvidence=false,forbidFullRead=true}={}){
 const counts={fullReads:0,headers:0,nativeWrites:0,evidenceWrites:0},changes=[],snapshots=[];let nativeRevision=0,evidenceRevision=0;
 const full=()=>{counts.fullReads++;if(forbidFullRead)throw Error('unexpected-full-read');};
 const nativeRepository={read:async()=>{full();return {revision:nativeRevision};},snapshot:async scope=>{full();return {scope:scopeKey(scope),refs:[],projects:[],noProject:[],unknown:[]};},header:async()=>{counts.headers++;return {revision:nativeRevision};},apply:async(_scope,_request,options)=>{assert.ok(options.guard());counts.nativeWrites++;return {ok:true,revision:++nativeRevision};}};
 const evidenceRepository={read:async scope=>{full();return {...emptyFreeEvidence(scope),revision:evidenceRevision};},header:async()=>{counts.headers++;return {revision:evidenceRevision};},apply:async(_scope,_request,options)=>{assert.ok(options.guard());if(failEvidence)return {ok:false,reason:'invalid-evidence'};counts.evidenceWrites++;return {ok:true,revision:++evidenceRevision};}};
 const runtime=new FreeRuntime({nativeRepository,evidenceRepository,source:source??{channel:'synthetic',read:async()=>({evidenceBatch:batch()})},clock:()=>now,...(publication===null?{}:{publication}),onChange:change=>changes.push(change),onSnapshot:snapshot=>snapshots.push(snapshot)});
 return {runtime,counts,changes,snapshots};
}
test('invalidation calibration commits via metadata headers without full repository reads',async()=>{
 const h=harness();h.runtime.setScope(A);const result=await h.runtime.trigger('scope');
 assert.equal(result.status,'complete');assert.equal(h.counts.evidenceWrites,1);assert.equal(h.counts.headers,1);assert.equal(h.counts.fullReads,0);assert.deepEqual(h.changes,[{scope:scopeKey(A),reason:'committed',deadlines:['2026-10-14T00:00:00Z']}]);assert.equal(h.snapshots.filter(Boolean).length,0);
 h.runtime.stop();
});
test('default snapshot publication still renders cache and committed updates',async()=>{
 const h=harness({publication:null,forbidFullRead:false});const entered=await h.runtime.enter(A);assert.ok(entered.snapshot);assert.equal((await entered.calibration).status,'complete');assert.equal(h.snapshots.filter(Boolean).length,2);assert.equal(h.counts.fullReads,4);assert.equal(h.changes.length,0);h.runtime.stop();
});
test('invalidation publishes successful native commit even when evidence fails',async()=>{
 const h=harness({failEvidence:true,source:{channel:'synthetic',read:async()=>({nativeBatch:{ids:['new'],validUntil:'2026-10-15T00:00:00Z'},evidenceBatch:batch()})}});h.runtime.setScope(A);const result=await h.runtime.trigger('scope');
 assert.equal(result.status,'degraded');assert.equal(h.counts.nativeWrites,1);assert.equal(h.counts.evidenceWrites,0);assert.equal(h.counts.fullReads,0);assert.deepEqual(h.changes,[{scope:scopeKey(A),reason:'committed',deadlines:['2026-10-15T00:00:00Z']}]);h.runtime.stop();
});
for(const action of ['switch','stop'])test(`invalidation ${action} suppresses late source writes and publication`,async()=>{
 let release,started;const start=new Promise(r=>started=r),reply=new Promise(r=>release=r);const h=harness({source:{channel:'synthetic',read:()=>{started();return reply;}}});h.runtime.setScope(A);const run=h.runtime.trigger('scope');await start;
 if(action==='switch')h.runtime.setScope(B);else h.runtime.stop();release({evidenceBatch:batch()});assert.equal((await run).status,'cancelled');assert.equal(h.counts.evidenceWrites,0);assert.equal(h.counts.fullReads,0);assert.equal(h.changes.length,0);h.runtime.stop();
});

for(const trigger of ['foreground','expiry','source'])test(`invalidation ${trigger} publishes dirty scope without full reads`,async()=>{
 const h=harness({source:{channel:'synthetic',read:async()=>({status:'unsupported'})}});h.runtime.setScope(A);assert.equal((await h.runtime.trigger(trigger)).status,'unsupported');assert.equal(h.counts.fullReads,0);assert.deepEqual(h.changes,[{scope:scopeKey(A),reason:trigger,deadlines:[]}]);h.runtime.stop();
});
test('deduplicated batch does not republish dirty state or reapply writes',async()=>{
 const h=harness();h.runtime.setScope(A);await h.runtime.trigger('scope');await h.runtime.trigger('send',{objectIds:['same']});assert.equal(h.counts.evidenceWrites,1);assert.equal(h.counts.fullReads,0);assert.equal(h.changes.length,1);h.runtime.stop();
});
