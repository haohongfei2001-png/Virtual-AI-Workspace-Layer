/** Mock-IDB contract tests, not browser persistence/restart certification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createSharedHostReadBudget} from '../../src/runtime/shared-host-read-budget.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createFirstSendReadback} from '../../src/runtime/first-send-readback.mjs';
import {digest} from '../../src/data/hash.mjs';
const principalKey='principal_'+digest(['chatgpt-principal-v1','u']),contextKey='context_'+digest(['chatgpt-context-v1','u','p']),sourceDomain='http://127.0.0.1:3912';
const base={principalKey,contextKey,sourceDomain};
function fixture(){const indexedDB=new MockIDBFactory();let time=100000;const make=()=>{const repository=new ScopeRepository({indexedDB});return {repository,budget:createSharedHostReadBudget({repository,now:()=>time})};};return {indexedDB,make,advance:n=>time+=n};}
test('atomic shared 12-request cap survives competing instances and reopened repository',async()=>{
 const f=fixture(),a=f.make(),b=f.make();await a.repository.open();await b.repository.open();const outcomes=await Promise.allSettled(Array.from({length:20},(_,i)=>(i%2?a:b).budget.reserve({...base,attemptKey:'op:'+i})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,12);a.repository.close();b.repository.close();await assert.rejects(f.make().budget.reserve(base),/read-budget-exhausted/);
});
test('two retries persist across instance replacement, independently of other operation identities',async()=>{
 const f=fixture();for(let i=0;i<3;i++){const a=f.make();await a.budget.reserve({...base,attemptKey:'operation:one'});a.repository.close();}
 await assert.rejects(f.make().budget.reserve({...base,attemptKey:'operation:one'}),/retries-exhausted/);await f.make().budget.reserve({...base,attemptKey:'operation:two'});
});
test('window continuation never renews at 30 seconds; only later foreground work starts another',async()=>{
 const f=fixture(),{budget}=f.make(),ticket=await budget.reserve(base);f.advance(29999);await budget.reserve({...base,...ticket});f.advance(1);
 await assert.rejects(budget.reserve({...base,...ticket}),/exhausted/);const next=await budget.reserve(base);assert.notEqual(next.windowStartedAt,ticket.windowStartedAt);await assert.rejects(budget.reserve({...base,...ticket}),/exhausted/);
});
test('rollback, storage failure and pre-abort fail closed without resetting counters',async()=>{
 const f=fixture(),{budget}=f.make();await budget.reserve(base);f.advance(-1);await assert.rejects(budget.reserve(base),/exhausted/);f.advance(1);f.indexedDB.failNextPut=true;await assert.rejects(budget.reserve(base));const abort=new AbortController();abort.abort();await assert.rejects(budget.reserve({...base,signal:abort.signal}),/aborted/);
 for(let i=1;i<12;i++)await budget.reserve(base);await assert.rejects(budget.reserve(base),/exhausted/);
});
test('scope and source domains partition counters without storing raw operation IDs',async()=>{
 const f=fixture(),{budget,repository}=f.make();for(let i=0;i<12;i++)await budget.reserve({...base,attemptKey:'SECRET_OPERATION_'+i});await budget.reserve({...base,contextKey:'context_'+digest('other')});await budget.reserve({...base,sourceDomain:'https://chatgpt.com'});
 const db=await repository.open();const rows=[...db.meta.stores.get('b23_views').rows.values()];assert(!JSON.stringify(rows).includes('SECRET_OPERATION'));
});
test('operation GETs and all auth/account/detail GETs consume the same persisted cap',async()=>{
 const f=fixture(),{budget}=f.make();let calls=0;
 const fetch=async url=>{calls++;let payload;
 if(url.endsWith('/api/auth/session'))payload={user:{id:'u'},expires:'2099-01-01T00:00:00Z',accessToken:'secret'};
 else if(url.includes('/accounts/'))payload={accounts:{p:{account:{account_id:'p',structure:'personal'}}}};
 else if(url.includes('/native/first-send/'))payload={operationId:url.split('/').at(-1),messageId:'m',conversationId:'c',acceptanceState:'accepted',principalId:'u',contextId:'p'};
 else payload={conversation_id:url.split('/').at(-1),mapping:{}};
 const r=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;};
 const provider=createSessionProvider({origin:sourceDomain,fetch,readBudget:budget,profile:{currentConversationReadEnabled:true}}),rawMapping=createFirstSendReadback({origin:sourceDomain,fetch}),mapping=async input=>{await budget.reserve({...base,attemptKey:'operation:'+input.operationId});return rawMapping(input);};
 for(let i=0;i<3;i++){
  await mapping({operationId:'op'+i,principalKey,contextKey});
  // Empty metadata may be unsupported, but all three fixed requests must count.
  await provider.readCurrentConversation({conversationId:'33333333-3333-4333-8333-333333333333',expectedPrincipalKey:principalKey,expectedContextKey:contextKey}).catch(e=>assert.match(e.message,/metadata/));
 }
 assert.equal(calls,12);await assert.rejects(mapping({operationId:'next',principalKey,contextKey}),/exhausted/);assert.equal(calls,12);
});
test('failed network requests are never refunded and provider reconstruction does not reset retries',async()=>{
 const f=fixture();let calls=0;for(let i=0;i<4;i++){
 const {budget}=f.make(),p=createSessionProvider({origin:sourceDomain,readBudget:budget,fetch:async()=>{calls++;throw Error('offline');},profile:{currentConversationReadEnabled:true}});
 await assert.rejects(p.readCurrentConversation({conversationId:'33333333-3333-4333-8333-333333333333',expectedPrincipalKey:principalKey,expectedContextKey:contextKey}),i===3?/retries-exhausted/:/transport-failed/);
 }assert.equal(calls,3);
});

test('mapping-to-metadata continuation refuses a fresh window after rollover before any auth GET',async()=>{
 const {createCurrentMetadataReader}=await import('../../src/runtime/current-metadata-reader.mjs');
 const f=fixture(),{budget}=f.make(),ticket=await budget.reserve({...base,attemptKey:'operation:rollover'});f.advance(29999);
 await budget.reserve({...base,...ticket,attemptKey:'operation:rollover'});f.advance(1);
 let calls=0;const provider=createSessionProvider({origin:sourceDomain,readBudget:budget,fetch:async()=>{calls++;throw Error('offline');},profile:{currentConversationReadEnabled:true}});
 const context={guard:()=>true,signal:new AbortController().signal,conversationId:'33333333-3333-4333-8333-333333333333',bodyEpoch:1,messageIds:['m'],scope:{accountId:principalKey,organizationId:contextKey},providerProfile:'chatgpt-session-v1',providerTransport:'worker-fixed-fetch'};
 const reader=createCurrentMetadataReader({observations:{withCurrent:async(_proof,work)=>work(context)},provider,enabled:true});
 await assert.rejects(reader.read('proof',{budgetWindow:ticket.windowStartedAt}),/read-budget-exhausted/);assert.equal(calls,0);
 // Ordinary future foreground reads retain their existing default behavior.
 await assert.rejects(reader.read('proof'),/session-transport-failed/);assert.equal(calls,1);
 await assert.rejects(reader.read('proof',{budgetWindow:NaN}),/invalid-read-budget-window/);
});

test('corrupted persisted counter cannot silently reopen budget',async()=>{const f=fixture(),{budget,repository}=f.make();await budget.reserve(base);const db=await repository.open(),rows=db.meta.stores.get('b23_views').rows;const key=[...rows.keys()].find(k=>k.startsWith('host-read-budget:'));rows.get(key).payload.requests=0;await assert.rejects(f.make().budget.reserve(base),/invalid-host-read-budget-state/);});
