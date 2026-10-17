import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFLINE_HISTORY_PROFILE as profile} from '../../src/runtime/historical-send-profile.mjs';
import {createHostHistoricalSendOwner} from '../../src/runtime/host-historical-send-owner.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';

// L only (MockIDBFactory): replacing worker-owned objects over the same repositories is a
// restart analogue, not Chrome service-worker termination or live host proof.
const C='33333333-3333-4333-8333-333333333333',NOW=Date.parse('2026-10-15T00:00:00Z');
const principal='offline_self',account='personal',OLD='2026-08-31T00:00:00Z',NEW='2026-10-14T23:00:00Z';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1',principal]),organizationId:'context_'+digest(['chatgpt-context-v1',principal,account])});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function payload(rows){return {conversation_id:C,history_semantics:profile.semantics,mapping:Object.fromEntries(rows.map(([id,sentAt],index)=>[id,{id,parent:index?rows[index-1][0]:null,message:{id,author:{role:'user',id:principal},create_time:NOW/1000,original_send:{author_id:principal,conversation_id:C,kind:'new-send',state:'committed',precision:'second',sent_at:sentAt},content:{parts:['PRIVATE_BODY_'+id]}}}]))};}
function harness(t){
 let wall=NOW,generation=0,activeOwner=null;const workers=[];
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'historical-restart'});
 const repo=new FreeEvidenceRepository({baseRepository:base,hostObservationGate:(s,r)=>activeOwner?.gate(s,r),clock:()=>new Date(wall).toISOString()});
 t.after(()=>{for(const worker of workers)worker.stop();base.close();});
 function start(rows,{authPrincipal=principal}={}){
  const run=++generation,abort=new AbortController();let valid=true,data=payload(rows),hold=null,conversationRequests=0;const requests=[];
  const context={scope,conversationId:C,messageIds:rows.map(([id])=>id),bodyEpoch:run,documentToken:'doc_'+run,producerToken:'producer_'+run,routeEpoch:run,providerProfile:profile.providerProfile,providerTransport:'worker-fixed-fetch',signal:abort.signal,guard:()=>valid&&run===generation};
  const provider=createSessionProvider({origin:'http://127.0.0.1:3210',now:()=>wall,profile:{currentConversationReadEnabled:true,historicalSendProfile:profile},fetch:async url=>{
   requests.push(url);let body;
   if(url.endsWith('/api/auth/session'))body={user:{id:authPrincipal},expires:new Date(NOW+3600000).toISOString(),accessToken:'PRIVATE_TOKEN_'+run};
   else if(url.endsWith('/check/v4-2023-04-27'))body={accounts:{personal:{account:{account_id:account,structure:'personal'}}}};
   else{conversationRequests++;body=structuredClone(data);if(hold)await hold;}
   const response=new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
  }});
  const owner=createHostHistoricalSendOwner({evidenceRepository:()=>repo,profileFor:id=>id===profile.id?profile:null,now:()=>wall});activeOwner=owner;
  const reader=createCurrentMetadataReader({provider,enabled:true,observations:{withCurrent:async(_proof,work)=>work(context)},now:()=>wall,onHistorical:input=>owner.consume(input)});
  const worker={provider,owner,reader,context,requests,get conversationRequests(){return conversationRequests;},setData(rows){data=payload(rows);context.messageIds=rows.map(([id])=>id);},hold:promise=>hold=promise,stop(){valid=false;abort.abort();reader.stop();owner.stop();}};workers.push(worker);return worker;
 }
 return {base,repo,start,tick:ms=>wall+=ms,page:()=>repo.page(scope,{ids:[C],limit:1})};
}
function assertStrictEvidence(evidence,expected){
 const events=Object.values(evidence.events);assert.equal(events.length,expected.length);assert.deepEqual(events.map(e=>[e.messageId,e.sentAt]).sort(),[...expected].sort());
 assert(events.every(e=>e.actorVerified===true&&e.actorScopeKey===scope.key));assert.equal(Object.keys(evidence.hints).length,0);assert.equal(Object.keys(evidence.coverage).length,0);
 assert(!JSON.stringify(evidence).includes('PRIVATE_'));assert(Object.values(evidence.sources).every(source=>source.codecVersion===2));
}
test('L replacement worker preserves immutable history and adds freshly authenticated original send exactly once',async t=>{
 const f=harness(t),first=f.start([['old_message',OLD]]);await first.reader.read('old_proof');const saved=await f.page(),oldEvent=structuredClone(Object.values(saved.evidence.events)[0]);first.stop();f.tick(120000);
 const second=f.start([['old_message',OLD],['fresh_message',NEW]]);assert.notEqual(second.owner,first.owner);assert.notEqual(second.provider,first.provider);assert.notEqual(second.reader,first.reader);
 const result=await second.reader.read('fresh_proof'),after=await f.page();assertStrictEvidence(after.evidence,[['old_message',OLD],['fresh_message',NEW]]);assert.deepEqual(after.evidence.events[oldEvent.id],oldEvent);
 assert.equal(second.requests.length,3,'replacement must authenticate session, account and fixed conversation anew');assert.equal(result.metadata.coverage,'observed-only');assert(!JSON.stringify(result).includes('original_send'));
 const immutable=structuredClone(after.evidence.events),revision=after.revision;
 for(let i=0;i<3;i++){f.tick(120000);await second.reader.read('fresh_proof');}
 const repeated=await f.page();assert.deepEqual(repeated.evidence.events,immutable,'reopening cannot renew observedAt, duplicate identity, or overwrite original time');assert.equal(repeated.revision,revision);assertStrictEvidence(repeated.evidence,[['old_message',OLD],['fresh_message',NEW]]);
});
test('L stopped worker late authenticated response cannot write beside its fresh replacement',async t=>{
 const f=harness(t),first=f.start([['old_message',OLD]]);await first.reader.read('old_proof');const old=structuredClone((await f.page()).evidence.events);
 const barrier=deferred();first.setData([['old_message',OLD],['stale_message',NEW]]);first.hold(barrier.promise);const pending=first.reader.read('old_proof'),rejected=assert.rejects(pending);for(let i=0;i<10&&first.conversationRequests<2;i++)await settle();assert.equal(first.conversationRequests,2);
 first.stop();await rejected;f.tick(1000);const replacement=f.start([['old_message',OLD],['fresh_message',NEW]]);await replacement.reader.read('fresh_proof');const beforeLate=await f.page();
 barrier.resolve();for(let i=0;i<5;i++)await settle();const afterLate=await f.page();assert.deepEqual(afterLate,beforeLate);assertStrictEvidence(afterLate.evidence,[['old_message',OLD],['fresh_message',NEW]]);for(const [id,event]of Object.entries(old))assert.deepEqual(afterLate.evidence.events[id],event);
 await assert.rejects(first.reader.read('old_proof'),/stopped/);
});
test('L old private historical authority and retired context cannot be replayed after restart',async t=>{
 const f=harness(t),first=f.start([['old_message',OLD]]);await first.reader.read('old_proof');first.setData([['old_message',OLD],['stale_message',NEW]]);
 const result=await first.provider.readCurrentConversation({conversationId:C,expectedPrincipalKey:scope.accountId,expectedContextKey:scope.organizationId}),history=first.provider.historyFor(result);assert(history);first.stop();
 const second=f.start([['old_message',OLD],['fresh_message',NEW]]);await second.reader.read('fresh_proof');const before=await f.page();
 await assert.rejects(first.owner.consume({history,context:first.context,guard:()=>true}),/stale-historical/);
 await assert.rejects(second.owner.consume({history,context:first.context,guard:first.context.guard}),/stale-historical/);
 assert.equal(second.provider.historyFor(result),null,'private provider authority cannot transfer to replacement object');assert.equal(second.provider.historyFor(structuredClone(result)),null);assert.deepEqual(await f.page(),before);
});
test('L restart with different authenticated principal cannot alter persisted original-scope history',async t=>{
 const f=harness(t),first=f.start([['old_message',OLD]]);await first.reader.read('old_proof');const before=await f.page();first.stop();
 const second=f.start([['old_message',OLD],['fresh_message',NEW]],{authPrincipal:'other_account'});await assert.rejects(second.reader.read('fresh_proof'));assert.deepEqual(await f.page(),before);assert.equal(second.conversationRequests,0,'principal mismatch must fail before conversation read');
});
