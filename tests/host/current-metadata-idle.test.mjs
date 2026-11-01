import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {parseConversationMetadata} from '../../src/host/conversation-metadata.mjs';
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture({enabled=true}={}){
 const time=Date.parse('2026-10-14T00:00:00Z'),conversationId='11111111-1111-1111-1111-111111111111',principalKey='principal_'+'a'.repeat(64),contextKey='context_'+'b'.repeat(64),abort=new AbortController();let reads=0;
 const context={scope:{key:'scope',accountId:principalKey,organizationId:contextKey},conversationId,messageIds:['m1'],bodyEpoch:3,providerProfile:'fixture_session',providerTransport:'worker-fixed-fetch',guard:()=>true,signal:abort.signal};
 const metadata=parseConversationMetadata({conversationId,principalId:'SELF',payload:JSON.stringify({id:conversationId,mapping:{n1:{id:'n1',parent:null,message:{id:'m1',author:{role:'user',id:'SELF'},create_time:time/1000}}}})});
 const response={principalKey,contextKey,expiresAt:new Date(time+60000).toISOString(),providerProfile:context.providerProfile,transport:context.providerTransport,metadata};
 const provider={readCurrentConversation(){reads++;return Promise.resolve(response);},acceptanceFor:()=>({...response,conversationId,profile:{id:'ack'},messages:[{messageId:'m1',mappingNodeId:'n1',lineage:metadata.messages[0].lineage}]}),historyFor:()=>({...response,conversationId,messages:[{messageId:'m1',branchId:'lineage_'+metadata.messages[0].lineage.fingerprint}]})};
 const observations={withCurrent:async(_,work)=>work(context)};let historyWork=async()=>{};
 const reader=createCurrentMetadataReader({observations,provider,enabled,now:()=>time,onHistorical:input=>historyWork(input)});
 return {reader,provider,observations,context,response,abort,reads:()=>reads,history:work=>historyWork=work};
}
test('idle is local and disabled is quiet while stopped never is',async()=>{const f=fixture({enabled:false});assert.equal(f.reader.isIdle(),true);await assert.rejects(f.reader.read('proof'));assert.equal(f.reader.isIdle(),true);assert.equal(f.reads(),0);f.reader.stop();assert.equal(f.reader.isIdle(),false);});
for(const outcome of ['resolve','reject'])test('read registers busy before first microtask and waits for owner '+outcome,async()=>{
 const f=fixture(),gate=deferred();f.observations.withCurrent=async(_,work)=>{await gate.promise;return work(f.context);};const pending=f.reader.read('proof'),checked=outcome==='reject'?assert.rejects(pending):pending;const initial=f.reader.isIdle();await flush();const waiting=f.reader.isIdle();gate[outcome](outcome==='reject'?Error('late-owner'):undefined);await checked;assert.equal(initial,false);assert.equal(waiting,false);assert.equal(f.reader.isIdle(),true);
});
for(const outcome of ['resolve','reject'])test('aborted provider remains counted after read settles until '+outcome,async()=>{
 const f=fixture(),gate=deferred();f.provider.readCurrentConversation=()=>gate.promise;
 // The reader captures the provider method at construction, so use an owner-controlled signal and a new reader.
 const reader=createCurrentMetadataReader({observations:f.observations,provider:f.provider,enabled:true});const pending=reader.read('proof'),checked=assert.rejects(pending);await flush();f.abort.abort();await checked;const waiting=reader.isIdle();gate[outcome](outcome==='reject'?Error('late-provider'):f.response);await flush();assert.equal(waiting,false);assert.equal(reader.isIdle(),true);
});
for(const outcome of ['resolve','reject'])test('owner race cannot hide a pending historical callback '+outcome,async()=>{
 const f=fixture(),gate=deferred(),cancel=deferred();let entered=false;f.history(async()=>{entered=true;await gate.promise;});
 f.observations.withCurrent=(_,work)=>Promise.race([work(f.context),cancel.promise]);const pending=f.reader.read('proof'),checked=assert.rejects(pending);await flush();assert.equal(entered,true);cancel.reject(Error('owner-timeout'));await checked;const waiting=f.reader.isIdle();gate[outcome](outcome==='reject'?Error('late-history'):undefined);await flush();assert.equal(waiting,false);assert.equal(f.reader.isIdle(),true);
});
for(const outcome of ['resolve','reject'])test('readback tracks reacquisition until '+outcome,async()=>{
 const f=fixture(),value=await f.reader.read('proof'),gate=deferred();f.observations.withCurrent=async(_,work)=>{await gate.promise;return work(f.context);};const pending=f.reader.withReadback(value,'proof','m1',()=>1),checked=outcome==='reject'?assert.rejects(pending):pending;const waiting=f.reader.isIdle();gate[outcome](outcome==='reject'?Error('late-proof'):undefined);await checked;assert.equal(waiting,false);assert.equal(f.reader.isIdle(),true);
});
for(const outcome of ['resolve','reject'])test('readback callback stays counted after owner race until '+outcome,async()=>{
 const f=fixture(),value=await f.reader.read('proof'),gate=deferred(),cancel=deferred();let entered=false;f.observations.withCurrent=(_,work)=>Promise.race([work(f.context),cancel.promise]);
 const pending=f.reader.withReadback(value,'proof','m1',async()=>{entered=true;await gate.promise;}),checked=assert.rejects(pending);await flush();assert.equal(entered,true);cancel.reject(Error('owner-timeout'));await checked;const waiting=f.reader.isIdle();gate[outcome](outcome==='reject'?Error('late-readback'):undefined);await flush();assert.equal(waiting,false);assert.equal(f.reader.isIdle(),true);
});
test('stop remains nonidle after late provider settles',async()=>{const f=fixture(),gate=deferred();f.provider.readCurrentConversation=()=>gate.promise;const reader=createCurrentMetadataReader({observations:f.observations,provider:f.provider,enabled:true});const pending=reader.read('proof'),checked=assert.rejects(pending);await flush();reader.stop();await checked;assert.equal(reader.isIdle(),false);gate.resolve(f.response);await flush();assert.equal(reader.isIdle(),false);});
