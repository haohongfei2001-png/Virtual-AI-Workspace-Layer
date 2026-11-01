import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeRuntime} from '../../src/data/free-runtime.mjs';
import {emptyFreeEvidence,applyFreeEvidence} from '../../src/data/free-evidence.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const A=scopeOf('A'),B=scopeOf('B'),now='2026-10-13T12:00:00Z';
const key=scope=>normalizedScope(scope).key;
function harness(source=null){
 const evidence=new Map(),native=new Map(),snapshots=[],statuses=[],writes=[];let conflicts=0;
 const evidenceRepository={read:async scope=>structuredClone(evidence.get(key(scope))??emptyFreeEvidence(scope)),apply:async(scope,request,options)=>{
  assert.ok(options.guard());writes.push(['evidence',scope.accountId,request]);if(conflicts-->0)return {ok:false,reason:'revision-conflict'};
  const state=evidence.get(key(scope))??emptyFreeEvidence(scope);if(request.expectedRevision!==state.revision)return {ok:false,reason:'revision-conflict'};
  try{const next=applyFreeEvidence(state,{type:'OBSERVE_FREE_EVIDENCE',batch:request.batch},{scope,now,channel:'synthetic'});evidence.set(key(scope),next);return {ok:true,revision:next.revision};}catch(error){return {ok:false,reason:error.message};}
 }};
 const nativeRepository={read:async scope=>({revision:native.get(key(scope))?.revision??0}),snapshot:async scope=>{
  const refs=(native.get(key(scope))?.ids??['old']).map(id=>({id,scope:key(scope),displayTitle:id,membership:'NONE'}));return {scope:key(scope),refs,projects:[],noProject:refs,unknown:[]};
 },apply:async(scope,request,options)=>{assert.ok(options.guard());writes.push(['native',scope.accountId,request]);const current=native.get(key(scope))??{revision:0,ids:['old']};native.set(key(scope),{revision:current.revision+1,ids:[...new Set([...current.ids,...request.batch.ids])]});return {ok:true,revision:current.revision+1};}};
 const runtime=new FreeRuntime({nativeRepository,evidenceRepository,source,clock:()=>now,onSnapshot:s=>snapshots.push(s),onStatus:s=>statuses.push(s)});
 return {runtime,snapshots,statuses,writes,evidence,native,conflicts:n=>{conflicts=n;}};
}
function evidenceBatch(scope=A){return {sources:[{id:'source',generation:'one',sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',channel:'synthetic'}],events:[{id:'e',sourceId:'source',generation:'one',sourceRevision:1,observedAt:now,conversationId:'old',messageId:'m',branchId:'main',actorVerified:true,actorScopeKey:key(scope),role:'user',kind:'new-send',sendState:'committed',sentAt:now,precision:'second'}],hints:[],coverage:[]};}
test('runtime renders cache before slow calibration and then projects committed source updates',async()=>{
 let release;const h=harness({channel:'synthetic',read:()=>new Promise(resolve=>{release=resolve;})});const opened=await h.runtime.enter(A);
 assert.equal(opened.snapshot.refs[0].activity.segment,null);assert.equal(h.snapshots.filter(Boolean).length,1);assert.equal(h.writes.length,0);
 await Promise.resolve();release({evidenceBatch:evidenceBatch()});assert.equal((await opened.calibration).status,'complete');assert.equal(h.snapshots.at(-1).refs[0].activity.segment,0);
});
test('missing or explicitly unsupported source ends without infinite retries or fabricated data',async()=>{
 const h=harness();const opened=await h.runtime.enter(A);assert.equal((await opened.calibration).status,'unsupported');assert.equal(h.writes.length,0);
 let calls=0;const unsupported=harness({channel:'synthetic',read:async()=>{calls++;return {status:'unsupported',reason:'no-live-provider'};}});const result=await (await unsupported.runtime.enter(A)).calibration;assert.equal(result.status,'unsupported');assert.equal(result.requests,1);assert.equal(calls,1);
 assert.throws(()=>harness({channel:'production',read:async()=>({})}),/untrusted/);
});
test('scope switch cancels late reads and writes and does not expose old cache to unknown account',async()=>{
 let release;const h=harness({channel:'synthetic',read:()=>new Promise(resolve=>{release=resolve;})});const opened=await h.runtime.enter(A);await Promise.resolve();h.runtime.setScope(B);release({evidenceBatch:evidenceBatch()});assert.equal((await opened.calibration).status,'cancelled');assert.equal(h.writes.length,0);assert.equal(h.snapshots.at(-1),null);
 h.runtime.setScope(null);assert.equal((await h.runtime.trigger('foreground')).status,'unsupported');assert.equal(h.snapshots.at(-1),null);
});
test('CAS conflicts have two bounded retries without refetching upstream source',async()=>{
 let calls=0;const h=harness({channel:'synthetic',read:async()=>{calls++;return {evidenceBatch:evidenceBatch()};}});h.conflicts(2);const result=await (await h.runtime.enter(A)).calibration;
 assert.equal(result.status,'complete');assert.equal(h.writes.length,3);assert.equal(calls,1);assert.equal(h.snapshots.at(-1).refs[0].activity.segment,0);
 const failed=harness({channel:'synthetic',read:async()=>({evidenceBatch:evidenceBatch()})});failed.conflicts(3);const bad=await (await failed.runtime.enter(A)).calibration;assert.equal(bad.outcomes[0].reason,'bounded-free-cas-conflict');assert.equal(failed.writes.length,3);assert.equal(bad.requests,1);
});
test('native discovery remains displayed when independent evidence ingestion fails',async()=>{
 const bad=evidenceBatch();bad.events[0].actorVerified=false;
 const h=harness({channel:'synthetic',read:async()=>({nativeBatch:{ids:['new']},evidenceBatch:bad})});const result=await (await h.runtime.enter(A)).calibration;
 assert.equal(result.outcomes[0].status,'degraded');assert.deepEqual(h.snapshots.at(-1).refs.map(r=>r.id),['old','new']);assert.equal(h.evidence.size,0);
});
test('deduplicated response does not commit again, and old source revision triggers do not refetch',async()=>{
 let calls=0;const h=harness({channel:'synthetic',read:async()=>{calls++;return {evidenceBatch:evidenceBatch()};}});await (await h.runtime.enter(A)).calibration;await h.runtime.trigger('send',{objectIds:['old']});assert.equal(h.writes.length,1);
 await h.runtime.trigger('source',{sourceRevision:2});const before=calls;assert.equal((await h.runtime.trigger('source',{sourceRevision:2})).status,'unchanged');assert.equal(calls,before);
});
test('expiry refreshes cached decisions even when no source is available',async()=>{
 const h=harness();const initial=await h.runtime.enter(A);await initial.calibration;const count=h.snapshots.filter(Boolean).length;
 assert.equal((await h.runtime.trigger('expiry')).status,'unsupported');assert.equal(h.snapshots.filter(Boolean).length,count+1);
});
test('runtime integrates both real repository contracts in one mock IDB without leaking scopes',async()=>{
 const [{MockIDBFactory},{ScopeRepository},{NativeRepository},{FreeEvidenceRepository}]=await Promise.all([import('../b23/mock-idb.mjs'),import('../../src/b1/scope-repository.mjs'),import('../../src/data/native-repository.mjs'),import('../../src/data/free-evidence-repository.mjs')]);
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'runtime_'+crypto.randomUUID().replaceAll('-','')});
 const nativeRepository=new NativeRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'native',generation:'one'})});
 const evidenceRepository=new FreeEvidenceRepository({baseRepository:base,clock:()=>now,observationGate:()=>({channel:'synthetic',sourceId:'source',generation:'one'})});
 const runtime=new FreeRuntime({nativeRepository,evidenceRepository,clock:()=>now,source:{channel:'synthetic',read:async()=>({nativeBatch:{scopeKey:key(A),sourceRevision:1,observedAt:now,validUntil:'2026-10-14T00:00:00Z',projects:[],refs:[{id:'old',nativeTitle:'原生标题',nativeUrl:'https://fixture.test/c/old',availability:'available'}],membership:[{id:'old',state:'NONE',projectId:null}],inventory:{projects:'complete',conversations:'complete',cursor:null}},evidenceBatch:evidenceBatch()})}});
 try{const opened=await runtime.enter(A);assert.equal(opened.snapshot.refs.length,0);assert.equal((await opened.calibration).status,'complete');const ready=await runtime.read();assert.equal(ready.noProject[0].displayTitle,'原生标题');assert.equal(ready.noProject[0].activity.segment,0);runtime.setScope(B);assert.equal((await runtime.read()).refs.length,0);}finally{runtime.stop();base.close();}
});
