import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createSharedHostReadBudget} from '../../src/runtime/shared-host-read-budget.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {directoryRequest} from '../../src/host/directory-batch.mjs';
import {digest} from '../../src/data/hash.mjs';
import {directoryHarness,ordinary,C,P} from './fixtures/directory-owner.mjs';
const start=Date.parse('2026-10-14T00:00:00Z'),origin='http://127.0.0.1:3912';
const profile={id:'session',structures:{personal:'personal',workspace:'organization'},directoryReadEnabled:true,currentConversationContextHeader:true,currentConversationRosterContext:true};
const target=Object.freeze({kind:'ordinary',projectId:null}),principalKey='principal_'+digest(['chatgpt-principal-v1','A']),contextKey='context_'+digest(['chatgpt-context-v1','A','personal']);
const context=Object.freeze({principalKey,contextKey,scopeKey:JSON.stringify(['chatgpt',principalKey,contextKey]),providerProfile:'session',target,request:directoryRequest(target)});
const session=(expires=start+60000)=>({user:{id:'A',name:'PRIVATE_NAME'},expires:new Date(expires).toISOString(),accessToken:'PRIVATE_TOKEN'});
const roster=()=>({accounts:{other:{account:{account_id:'other',structure:'workspace'}},personal:{account:{account_id:'personal',structure:'personal'}}}});
function fixture(t,{mutate=()=>{},budget=null,sourceProfile=profile,delay=null}={}){
 let wall=start,elapsed=0,allowed=true;const controller=new AbortController(),calls=[],reservations=[];
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'directory-provider-'+crypto.randomUUID()}),shared=budget??createSharedHostReadBudget({repository:base,now:()=>wall});t.after(()=>base.close());
 const readBudget={async reserve(input){reservations.push(input);return shared.reserve(input);}};
 const fetch=async(url,options)=>{calls.push({url,options});const n=calls.length,slot=(n-1)%5+1,state={body:slot===1||slot===4?session():slot===3?ordinary():roster(),status:200,mime:'application/json',url,headers:{}};await mutate(state,slot,{advance:n=>{elapsed+=n;},clock:n=>{wall+=n;},invalidate:()=>{allowed=false;},controller});if(delay)await delay(slot);const r=new Response(typeof state.body==='string'?state.body:JSON.stringify(state.body),{status:state.status,headers:{'content-type':state.mime,...state.headers}});Object.defineProperty(r,'url',{value:state.url});return r;};
 const make=()=>createSessionProvider({origin,fetch,now:()=>wall,elapsedNow:()=>elapsed,profile:sourceProfile,readBudget});const provider=make();
 return {base,calls,reservations,provider,make,controller,guard:()=>allowed,read:ctx=>provider.directoryProvider.read(ctx??context,{guard:()=>allowed,signal:controller.signal}),advance:n=>{wall+=n;elapsed+=n;}};
}
test('disabled source and insufficient packaged configuration make zero calls',async t=>{
 const f=fixture(t,{sourceProfile:{id:'session'}});await assert.rejects(f.read(),/directory-read-disabled/);assert.equal(f.calls.length,0);
 for(const options of [{profile,readBudget:null},{profile:{...profile,currentConversationContextHeader:false},readBudget:{reserve(){}}},{profile:{...profile,currentConversationRosterContext:false},readBudget:{reserve(){}}}])assert.throws(()=>createSessionProvider(options),/invalid-directory-source-profile/);
});
test('fixed five-GET chain reauthenticates exact non-first roster context before and after one page',async t=>{
 const f=fixture(t),result=await f.read(),proof=f.provider.directoryProvider.directoryFor(result);
 assert.deepEqual(result,{state:'candidate'});assert.equal(proof.context,context);assert.equal(proof.payload,ordinary());assert.equal(proof.expiresAt,new Date(start+60000).toISOString());
 assert.deepEqual(f.calls.map(c=>new URL(c.url).pathname+new URL(c.url).search),['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27',context.request.path,'/api/auth/session','/backend-api/accounts/check/v4-2023-04-27']);
 assert.equal(f.reservations.length,5);assert.deepEqual(f.reservations.map(r=>r.attemptKey),['directory:'+context.request.path,null,null,null,null]);assert(f.reservations.slice(1).every(r=>r.windowStartedAt===start));
 assert.equal(f.calls[2].options.headers['ChatGPT-Account-ID'],'personal');assert(f.calls.filter((_,i)=>[0,3].includes(i)).every(c=>!c.options.headers.Authorization));assert(f.calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'&&c.options.credentials==='include'&&c.options.signal.aborted));
 assert.equal(f.provider.directoryProvider.directoryFor(structuredClone(result)),null);assert.equal(f.make().directoryProvider.directoryFor(result),null);assert(!JSON.stringify(result).includes('PRIVATE'));f.controller.abort();assert.equal(f.provider.directoryProvider.directoryFor(result),null);
});
test('target or context substitution is refused before a session request',async t=>{
 const f=fixture(t);for(const patch of [{scopeKey:'different'},{providerProfile:'other'},{principalKey:'A'},{request:{...context.request,path:'/backend-api/conversation/'+C}},{request:{...context.request,maxBytes:8388608}},{target:{kind:'members',projectId:P}}])await assert.rejects(f.read({...context,...patch}),/invalid-directory-read-context/);assert.equal(f.calls.length,0);
});
for(const [stage,kind,count]of [[1,'principal',1],[2,'context',2],[4,'principal',4],[5,'context',5]])test('identity '+kind+' mismatch at stage '+stage+' discards directory without another request',async t=>{
 const f=fixture(t,{mutate(s,n){if(n===stage){if(kind==='principal')s.body.user.id='B';else delete s.body.accounts.personal;}}});await assert.rejects(f.read(),new RegExp('conversation-'+kind+'-conflict'));assert.equal(f.calls.length,count);
});
test('final context kind must agree and new shorter expiry limits private proof',async t=>{
 const bad=fixture(t,{mutate(s,n){if(n===5)s.body.accounts.personal.account.structure='workspace';}});await assert.rejects(bad.read(),/context-conflict/);
 const f=fixture(t,{mutate(s,n){if(n===4)s.body.expires=new Date(start+1000).toISOString();}}),result=await f.read();assert.equal(f.provider.directoryProvider.directoryFor(result).expiresAt,new Date(start+1000).toISOString());f.advance(1000);assert.equal(f.provider.directoryProvider.directoryFor(result),null);
});
for(const [label,mutate,reason]of [['challenge',s=>s.headers['cf-mitigated']='challenge','session-challenged'],['denied',s=>s.status=403,'session-unauthorized'],['html',s=>s.mime='text/html','invalid-session-mime'],['oversize',s=>s.body='x'.repeat(1048577),'session-response-too-large'],['redirect-target',s=>s.url=origin+'/other','invalid-session-response']])test('directory '+label+' stops before final authentication and is not retried',async t=>{
 const f=fixture(t,{mutate(s,n){if(n===3)mutate(s);}});await assert.rejects(f.read(),new RegExp(reason));assert.equal(f.calls.length,3);
});
test('invalidated guard or elapsed deadline prevents the next GET',async t=>{
 for(const [mode,reason]of [['invalidate','stale-directory-source'],['advance','request-timeout']]){const f=fixture(t,{mutate(s,n,controls){if(n===2)controls[mode](6000);}});await assert.rejects(f.read(),new RegExp(reason));assert.equal(f.calls.length,2);}
});
test('aborted ignored transport remains busy until drained and cannot emit follow-on GET',async t=>{
 let entered,release;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r),f=fixture(t,{delay:async n=>{if(n===1){entered();await wait;}}});const pending=f.read();await ready;f.controller.abort();await assert.rejects(pending,/session-aborted/);
 await assert.rejects(f.provider.directoryProvider.read(context,{guard:()=>true,signal:new AbortController().signal}),/directory-read-busy/);assert.equal(f.calls.length,1);release();await new Promise(r=>setImmediate(r));assert.equal(f.calls.length,1);
});
test('all five requests consume existing shared high-water; provider replacement cannot reset it',async t=>{
 const f=fixture(t);await f.read();await f.read();const next=f.make();await assert.rejects(next.directoryProvider.read(context,{guard:()=>true,signal:new AbortController().signal}),/read-budget-exhausted/);assert.equal(f.calls.length,12);
});
test('rejected attempts also spend the existing retry limit and never auto retry',async t=>{
 const f=fixture(t,{mutate(s){s.status=403;}});for(let i=0;i<3;i++)await assert.rejects(f.make().directoryProvider.read(context,{guard:()=>true,signal:new AbortController().signal}),/session-unauthorized/);await assert.rejects(f.read(),/read-budget-retries-exhausted/);assert.equal(f.calls.length,3);
});
test('real provider private proof enters original owner/CAS with fresh expiry cap',async t=>{
 const h=await directoryHarness(new MockIDBFactory());t.after(()=>h.close());const f=fixture(t,{mutate(s,n){if(n===4)s.body.expires=new Date(start+1000).toISOString();}});h.profile.directoryProvider=f.provider.directoryProvider;
 const result=await h.observe();assert(result.ok,JSON.stringify(result));const facts=await h.native.read(h.scope);assert.equal(facts.refs[C].validUntil,new Date(start+1000).toISOString());assert.equal(facts.refs[C].nativeTitle,'原始标题 '+C);assert.equal(f.calls.length,5);assert(!/PRIVATE_TOKEN|PRIVATE_NAME|must-not-persist/.test(JSON.stringify(facts)));assert.deepEqual(facts.membership,{});
});
test('fresh authentication expiring during repository work blocks CAS despite a longer old grant',async t=>{
 const h=await directoryHarness(new MockIDBFactory());t.after(()=>h.close());const f=fixture(t,{mutate(s,n){if(n===4)s.body.expires=new Date(start+1000).toISOString();}});h.profile.directoryProvider=f.provider.directoryProvider;const apply=h.native.apply.bind(h.native);h.native.apply=(...args)=>{h.advance(1000);return apply(...args);};assert.equal((await h.observe()).ok,false);assert.equal(await h.native.version(h.scope),0);
});

test('fresh credential expiry is checked before spending the next GET',async t=>{
 const f=fixture(t,{mutate(s,n,c){if(n===1)s.body.expires=new Date(start+1).toISOString();if(n===2)c.clock(1);}});await assert.rejects(f.read(),/session-expired/);assert.equal(f.calls.length,2);
});
