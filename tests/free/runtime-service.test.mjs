import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeRuntimeService} from '../../src/data/free-runtime-service.mjs';
import {scopeOf} from '../../simulator/data.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {emptyFreeEvidence,applyFreeEvidence} from '../../src/data/free-evidence.mjs';
const A=scopeOf('A'),B=scopeOf('B'),now='2026-10-13T12:00:00Z';
const key=scope=>normalizedScope(scope).key;
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function harness(sourceFor=null){
 const snapshots=[],statuses=[],calls=[],states=new Map(),timers=new Map();let time=now,sequence=0;
 const check=(scope,options)=>{assert.equal(options.guard(),true);assert.equal(options.signal.aborted,false);calls.push(scope.accountId);};
 const nativeRepository={header:async(scope,options)=>{check(scope,options);return {revision:0};},version:async(scope,options)=>{check(scope,options);return 0;},read:async(scope,options)=>{check(scope,options);return {revision:0};},apply:async(scope,_request,options)=>{check(scope,options);return {ok:true};},snapshot:async(scope,options)=>{check(scope,options);const row={id:'chat',scope:key(scope),nativeTitle:'scope '+scope.accountId,membership:'NONE'};return {scope:key(scope),refs:[row],projects:[],noProject:[row],unknown:[]};}};
 const evidenceRepository={read:async(scope,options)=>{check(scope,options);return states.get(key(scope))??emptyFreeEvidence(scope);},apply:async(scope,request,options)=>{check(scope,options);const state=states.get(key(scope))??emptyFreeEvidence(scope);if(request.expectedRevision!==state.revision)return {ok:false,reason:'revision-conflict'};const next=applyFreeEvidence(state,{type:'OBSERVE_FREE_EVIDENCE',batch:request.batch},{scope,now:time,channel:'synthetic'});states.set(key(scope),next);return {ok:true,revision:next.revision};}};
 const registry=new FreeRuntimeService({nativeRepository,evidenceRepository,sourceFor,clock:()=>time,onSnapshot:value=>snapshots.push(value),onStatus:value=>statuses.push(value),timers:{setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}}});
 return {registry,snapshots,statuses,calls,states,timers,clock:value=>{time=value;},fire:async()=>{const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();for(let i=0;i<30;i++)await Promise.resolve();}};
}
const bind=(h,id='doc',scope=A,extra={})=>h.registry.bind({bindingId:id,scope,guard:()=>true,...extra});
const emptyBatch=()=>({sources:[],events:[],hints:[],coverage:[]});
test('owner binding without configured source is explicit unsupported with no reads or polling',async()=>{
 const h=harness();assert.equal(bind(h).supported,false);const opened=await h.registry.foreground('doc');assert.equal(opened.snapshot,null);assert.equal((await opened.calibration).reason,'no-authorized-source');assert.equal((await h.registry.notify('doc','current')).status,'unsupported');assert.equal(h.registry.scheduleExpiry('doc','2026-10-13T12:10:00Z'),false);assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
});
test('page trust labels cannot inject a source, unknown identity and stale guard refuse binding',()=>{
 const h=harness();assert.throws(()=>h.registry.bind({bindingId:'bad',scope:{verified:true,accountId:'A'},guard:()=>true}),/unverified/);assert.throws(()=>bind(h,'bad',A,{guard:()=>false}),/unverified/);
 const bad=harness(()=>({channel:'production',read:async()=>({})}));assert.throws(()=>bind(bad),/untrusted/);assert.equal(bad.registry.bindings.size,0);
});
test('foreground returns cached native display before slow injected read and source remains owner-only',async()=>{
 const started=deferred();let release,request;const h=harness(()=>({channel:'synthetic',read:input=>{request=input;started.resolve();return new Promise(resolve=>{release=resolve;});}}));bind(h);const opened=await h.registry.foreground('doc');await started.promise;assert.equal(opened.snapshot.refs[0].nativeTitle,'scope A');assert.equal(request.scope.key,key(A));assert.ok(h.snapshots.some(s=>s.snapshot));release({evidenceBatch:emptyBatch()});assert.equal((await opened.calibration).status,'complete');assert.equal(h.states.get(key(A)).revision,1);
});
test('same binding account switch cancels old source and prevents late storage or snapshot publication',async()=>{
 const started=deferred();let release,oldSignal;const h=harness(({scope})=>scope.accountId==='A'?{channel:'synthetic',read:({signal})=>{oldSignal=signal;started.resolve();return new Promise(resolve=>{release=resolve;});}}:{channel:'synthetic',read:async()=>({status:'unsupported',reason:'no-B-provider'})});bind(h);const old=await h.registry.foreground('doc');await started.promise;bind(h,'doc',B);const marker=h.snapshots.length;release({evidenceBatch:emptyBatch()});assert.equal((await old.calibration).status,'cancelled');assert.equal(oldSignal.aborted,true);assert.equal(h.states.has(key(A)),false);assert.equal(h.snapshots.slice(marker).some(s=>s.scope===key(A)&&s.snapshot),false);
 const fresh=await h.registry.foreground('doc');assert.equal(fresh.snapshot.refs[0].nativeTitle,'scope B');assert.equal((await fresh.calibration).status,'unsupported');
});
test('external binding abort clears expiry timer and closes all future access',async()=>{
 const h=harness(()=>({channel:'synthetic',read:async()=>({status:'unsupported'})})),controller=new AbortController();bind(h,'doc',A,{signal:controller.signal});await (await h.registry.foreground('doc')).calibration;
 assert.equal(h.registry.scheduleExpiry('doc','2026-10-13T12:10:00Z'),true);assert.equal(h.timers.size,1);controller.abort();assert.equal(h.timers.size,0);assert.equal(h.registry.bindings.size,0);assert.equal(h.snapshots.at(-1).snapshot,null);assert.equal((await h.registry.notify('doc','send')).status,'cancelled');
});
test('expiry is a one-shot guarded wakeup and no-source bindings never inherit a timer',async()=>{
 let sourceCalls=0;const h=harness(()=>({channel:'synthetic',read:async()=>{sourceCalls++;return {status:'unsupported'};}}));bind(h);await (await h.registry.foreground('doc')).calibration;
 h.registry.scheduleExpiry('doc','2026-10-13T12:10:00Z');h.registry.scheduleExpiry('doc','2026-10-13T12:20:00Z');assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,600000);
 h.clock('2026-10-13T12:10:00Z');await h.fire();assert.equal(sourceCalls,2);assert.equal(h.timers.size,0);assert.equal(h.registry.scheduleExpiry('doc',now),false);
});
test('guard failure and stopAll cancel only affected lifetimes with no cross-document cache',async()=>{
 let active=true;const h=harness(()=>({channel:'synthetic',read:async()=>({status:'unsupported'})}));bind(h,'docA',A,{guard:()=>active});bind(h,'docB',B);await (await h.registry.foreground('docA')).calibration;await (await h.registry.foreground('docB')).calibration;active=false;
 assert.equal((await h.registry.notify('docA','foreground')).status,'cancelled');assert.equal(h.registry.bindings.has('docB'),true);assert.equal(h.snapshots.at(-1).snapshot,null);h.registry.stopAll();assert.equal(h.registry.bindings.size,0);
});
test('cached hint automatically schedules once and expired decision returns to undated without refreshing TTL',async()=>{
 const h=harness(()=>({channel:'synthetic',read:async()=>({status:'unsupported'})}));
 const state=emptyFreeEvidence(A),source={id:'s',generation:'one',sourceRevision:1,observedAt:now,validUntil:'2026-10-13T13:00:00Z',channel:'synthetic'};
 const hint={id:'h',sourceId:'s',generation:'one',sourceRevision:1,observedAt:now,validUntil:'2026-10-13T12:01:00Z',conversationId:'chat',eventKey:'send',hintType:'local-confirmed-send',candidateInterval:null,actorVerified:true,actorScopeKey:key(A)};
 h.states.set(key(A),applyFreeEvidence(state,{type:'OBSERVE_FREE_EVIDENCE',batch:{sources:[source],events:[],coverage:[],hints:[hint]}},{scope:A,now,channel:'synthetic'}));
 bind(h);const opened=await h.registry.foreground('doc');await opened.calibration;assert.equal(opened.snapshot.refs[0].activity.basis,'provisional');assert.equal(h.timers.size,1);
 h.clock('2026-10-13T12:01:01Z');await h.fire();assert.equal(h.snapshots.filter(s=>s.snapshot).at(-1).snapshot.refs[0].activity.basis,'undated');assert.equal(h.timers.size,0);assert.equal(h.states.get(key(A)).hints.h.validUntil,hint.validUntil);
});

test('owner async authority fences bounded header/version reads as well as source responses',async()=>{
 let valid=true,checks=0;const h=harness(()=>({channel:'synthetic',read:async()=>({status:'unsupported'})}));bind(h,'doc',A,{authorityCheck:async()=>{checks++;return valid;}});
 const repository=h.registry.bindings.get('doc').runtime.nativeRepository;
 assert.equal((await repository.header(A)).revision,0);assert.equal(await repository.version(A),0);assert.equal(checks,4);
 valid=false;await assert.rejects(repository.header(A),/stale-binding/);assert.equal(h.registry.bindings.size,0);assert.equal(h.snapshots.at(-1).snapshot,null);
});

test('owner may skip duplicate cached rendering while starting guarded calibration',async()=>{
 const started=deferred(),reply=deferred();const h=harness(()=>({channel:'synthetic',read:()=>{started.resolve();return reply.promise;}}));bind(h);
 const session={H:7,T:20739,Z:'UTC',policyRevision:2};const opened=await h.registry.foreground('doc',{readCached:false,session});
 assert.equal(opened.snapshot,null);assert.equal(h.calls.length,0);assert.equal(h.registry.bindings.get('doc').runtime.session,session);await started.promise;
 reply.resolve({status:'unsupported'});assert.equal((await opened.calibration).status,'unsupported');assert.equal(h.calls.length,0);h.registry.stopAll();
});
