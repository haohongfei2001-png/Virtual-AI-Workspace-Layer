/** Real worker provider/reader/history owner and MOCK_IDB; isolated principal proof stays isolated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createHostHistoricalSendOwner} from '../../src/runtime/host-historical-send-owner.mjs';
import {OFFLINE_HISTORY_PROFILE as profile} from '../../src/runtime/historical-send-profile.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
const C='33333333-3333-4333-8333-333333333333',NOW=Date.parse('2026-10-15T00:00:00Z'),OLD='2026-08-31T00:00:00Z';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','self']),organizationId:'context_'+digest(['chatgpt-context-v1','self','personal'])});
function fixture(t,{mutateResult=null,mutateHistory=null,mutateOnDetail=null,principal='self',account='personal',budgetError=null,status=200,elapsedCost=0}={}){
 let wall=NOW,elapsed=0,valid=true,owner;const calls=[],reservations=[],consumed=[];
 const abort=new AbortController(),calibrationAbort=new AbortController();
 const context={scope,conversationId:C,messageIds:['m'],bodyEpoch:1,documentToken:'document',producerToken:'producer',routeEpoch:1,providerProfile:profile.providerProfile,providerTransport:'isolated-fixed-fetch',signal:abort.signal};
 const original={...context};context.guard=()=>valid&&['scope','conversationId','bodyEpoch','documentToken','producerToken','routeEpoch','providerProfile','providerTransport'].every(k=>context[k]===original[k]);
 const data={conversation_id:C,history_semantics:profile.semantics,mapping:{n:{id:'n',parent:null,message:{id:'m',author:{role:'user',id:'self'},original_send:{author_id:'self',conversation_id:C,kind:'new-send',state:'committed',precision:'second',sent_at:OLD},content:{parts:['PRIVATE_BODY_NEVER_COPY']}}}}};
 const base=new ScopeRepository({indexedDB:new MockIDBFactory()}),repo=new FreeEvidenceRepository({baseRepository:base,hostObservationGate:(s,r)=>owner.gate(s,r),clock:()=>new Date(wall).toISOString()});
 const actualProvider=createSessionProvider({origin:'http://127.0.0.1:3210',now:()=>wall,elapsedNow:()=>elapsed,readBudget:{reserve:async options=>{reservations.push(options);if(budgetError)throw Error(budgetError);return {windowStartedAt:NOW};}},profile:{currentConversationReadEnabled:true,historicalSendProfile:profile},fetch:async(url,options)=>{
  calls.push({url,options});const path=new URL(url).pathname;
  const body=path==='/api/auth/session'?{user:{id:principal},expires:new Date(NOW+60000).toISOString(),accessToken:'PRIVATE_TOKEN_NEVER_COPY'}:path==='/backend-api/accounts/check/v4-2023-04-27'?{accounts:{[account]:{account:{account_id:account,structure:'personal'}}}}:data;
  if(path.startsWith('/backend-api/conversation/')){mutateOnDetail?.({context,abort,calibrationAbort});elapsed+=elapsedCost;}
  const response=new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const provider={readCurrentConversation:async args=>{const result=await actualProvider.readCurrentConversation(args);mutateResult?.(result);return result;},historyFor:result=>{const history=actualProvider.historyFor(result);return history&&mutateHistory?mutateHistory(history):history;}};
 owner=createHostHistoricalSendOwner({evidenceRepository:()=>repo,profileFor:id=>id===profile.id?profile:null,now:()=>wall});
 const reader=createCurrentMetadataReader({provider,enabled:true,observations:{withCurrent:async(proof,work)=>{assert.equal(proof,'proof');if(!context.guard())throw Error('stale-body-proof');const value=await work(context);if(!context.guard())throw Error('stale-body-proof');return value;}},now:()=>wall,onHistorical:async input=>{consumed.push({historyTransport:input.history.transport,principalTransport:input.context.providerTransport});return owner.consume(input);}});
 t.after(()=>{reader.stop();owner.stop();base.close();});
 return {reader,context,calls,reservations,consumed,calibrate:()=>reader.readCalibration('proof',{isCurrent:()=>valid,signal:calibrationAbort.signal}),events:async()=>Object.values((await repo.page(scope,{ids:[C],limit:1})).evidence.events),revoke:()=>{valid=false;abort.abort();},tick:ms=>{wall+=ms;}};
}
test('isolated principal can calibrate via fresh worker authentication and existing historical evidence owner',async t=>{
 const f=fixture(t),value=await f.calibrate();assert.equal(f.calls.length,3);assert.equal(f.reservations.length,3);
 assert.deepEqual(f.calls.map(c=>new URL(c.url).pathname),['/api/auth/session','/backend-api/accounts/check/v4-2023-04-27','/backend-api/conversation/'+C]);
 for(const reservation of f.reservations){assert.equal(reservation.principalKey,scope.accountId);assert.equal(reservation.contextKey,scope.organizationId);}
 assert.deepEqual(f.consumed,[{historyTransport:'worker-fixed-fetch',principalTransport:'isolated-fixed-fetch'}]);assert.equal(f.context.providerTransport,'isolated-fixed-fetch','principal proof transport must not be relabelled');
 const events=await f.events();assert.equal(events.length,1);assert.equal(events[0].sentAt,OLD);assert.equal(events[0].actorVerified,true);assert.equal(events[0].actorScopeKey,scope.key);
 assert(!JSON.stringify(value).includes('PRIVATE_'));assert.equal(value.metadata.coverage,'observed-only');
 await assert.rejects(f.reader.withReadback(value,'proof','m',()=>assert.fail('calibration cannot create live send ACK authority')));
 const before=JSON.stringify(events);f.tick(1000);await f.calibrate();assert.equal(JSON.stringify(await f.events()),before,'repeat calibration cannot renew original historical evidence');
});
test('isolated non-calibration ACK reader remains blocked before any network',async t=>{const f=fixture(t);await assert.rejects(f.reader.read('proof'));assert.equal(f.calls.length,0);assert.deepEqual(await f.events(),[]);});
for(const [field,value]of [['principalKey','principal_'+'f'.repeat(64)],['contextKey','context_'+'e'.repeat(64)],['providerProfile','foreign'],['transport','isolated-fixed-fetch'],['expiresAt',new Date(NOW).toISOString()]])test('fresh worker result rejects mismatched '+field,async t=>{
 const f=fixture(t,{mutateResult:result=>result[field]=value});await assert.rejects(f.calibrate());assert.equal(f.calls.length,3,'result rejection must follow actual worker read');assert.deepEqual(await f.events(),[]);assert.equal(f.consumed.length,0);
});
for(const [kind,options,expectedCalls]of [['principal',{principal:'other'},1],['context',{account:'other'},2],['unauthorized',{status:401},1]])test('worker '+kind+' failure cannot borrow isolated identity',async t=>{
 const f=fixture(t,options);await assert.rejects(f.calibrate());assert.equal(f.calls.length,expectedCalls);assert.deepEqual(await f.events(),[]);
});
for(const field of ['transport','principalKey','contextKey','providerProfile'])test('private historical association rejects '+field+' mismatch',async t=>{
 const f=fixture(t,{mutateHistory:history=>({...history,[field]:field==='transport'?'isolated-fixed-fetch':'foreign'})});await assert.rejects(f.calibrate());assert.equal(f.calls.length,3);assert.deepEqual(await f.events(),[]);assert.equal(f.consumed.length,0);
});
for(const field of ['bodyEpoch','routeEpoch','documentToken','producerToken','conversationId'])test('changed current '+field+' during worker read cannot persist history',async t=>{
 const f=fixture(t,{mutateOnDetail:({context})=>context[field]=typeof context[field]==='number'?context[field]+1:'changed'});await assert.rejects(f.calibrate());assert.equal(f.calls.length,3);assert.deepEqual(await f.events(),[]);
});
for(const channel of ['abort','calibrationAbort'])test(channel+' before metadata completion rejects calibration',async t=>{
 const f=fixture(t,{mutateOnDetail:state=>state[channel].abort()});await assert.rejects(f.calibrate());assert.equal(f.calls.length,3);assert.deepEqual(await f.events(),[]);
});
for(const error of ['read-budget-exhausted','read-budget-retries-exhausted'])test('shared '+error+' fails before fetch with no private fallback or retries',async t=>{
 const f=fixture(t,{budgetError:error});await assert.rejects(f.calibrate(),new RegExp(error));assert.equal(f.reservations.length,1);assert.equal(f.calls.length,0);assert.deepEqual(await f.events(),[]);
});
test('worker six-second deadline is unchanged for isolated-principal calibration',async t=>{
 const f=fixture(t,{elapsedCost:6000});await assert.rejects(f.calibrate(),/request-timeout/);assert.equal(f.calls.length,3);assert.deepEqual(await f.events(),[]);
});
for(const [label,expiresAt]of [['expired',new Date(NOW).toISOString()],['different-valid-expiry',new Date(NOW+59000).toISOString()]])test('historical '+label+' cannot be detached from worker result validity',async t=>{
 const f=fixture(t,{mutateHistory:history=>({...history,expiresAt})});await assert.rejects(f.calibrate());assert.equal(f.calls.length,3);assert.deepEqual(await f.events(),[]);assert.equal(f.consumed.length,0);
});
