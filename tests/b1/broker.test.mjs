import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentBindingBroker,fixtureURL,fixtureScopeResolver} from '../../src/b1/document-binding-broker.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const urls={A:'http://127.0.0.1:38973/b1-fixture/A.html',B:'http://127.0.0.1:38973/b1-fixture/B.html'};
function fixture(doc='doc_A',page='A',tabId=17){
 return {id:'extension_fixture_id',tab:{id:tabId},frameId:0,
   documentId:doc,documentLifecycle:'active',url:urls[page]};
}
function mk(){
 let now=100, seq=0;
 const current=new Map([[17,{url:urls.A,documentId:'doc_A',documentLifecycle:'active'}]]);
 const records=new Map(),calls=[];
 const repository={
   async upsert({scope,ref,operationId,expectedRevision,beforeCommit}){
     if(!beforeCommit())return {ok:false,reason:'stale-binding'};
     const key=scope.key+'|'+ref.conversationId,old=records.get(key),rev=old?.revision||0;
     if(rev!==expectedRevision)return {ok:false,reason:'revision-conflict'};
     const record={...ref,revision:rev+1};records.set(key,record);
     calls.push({operationId,scope:scope.key});return {ok:true,record};
   },
   async get(scope,id){return records.get(scope.key+'|'+id)||null;},
   async list(scope){return [...records.entries()].filter(([k])=>k.startsWith(scope.key+'|')).map(([,v])=>v);}
 };
 const broker=createDocumentBindingBroker({
   extensionId:'extension_fixture_id',getFrame:async({tabId})=>current.get(tabId),
   resolveScope:fixtureScopeResolver,repository,now:()=>now,
   makeId:()=> 'lease_'+(++seq)
 });
 const request=(type,seq,leaseId=null,extra={})=>({
   v:1,type,clientId:'client_A',seq,...(type==='BIND'?{}:{leaseId}),...extra
 });
 return {broker,current,records,calls,request,tick:t=>now+=t,repository};
}
test('B1: sender identity is independent of page-supplied scope and exact envelope',async()=>{
 const h=mk(),a=fixture();
 assert.equal(fixtureURL(urls.A),true);
 assert.equal(fixtureURL('https://chatgpt.com/'),false);
 assert.equal(normalizedScope({verified:true,provider:'test',accountId:'A',organizationId:'test'}).key,
   '["test","A","test"]');
 assert.equal((await h.broker.handle({...h.request('BIND',1),scope:'other'},a)).reason,'invalid-request');
 assert.equal((await h.broker.handle(h.request('BIND',1),{...a,frameId:1})).reason,'invalid-sender');
 assert.equal((await h.broker.handle(h.request('BIND',1),{...a,id:'bad'})).reason,'invalid-sender');
 assert.equal((await h.broker.handle(h.request('BIND',1),a)).ok,true);
});
test('B1: new browser-confirmed document supersedes old lease without waiting',async()=>{
 const h=mk(),a=fixture(),b=fixture('doc_B','B');
 const prior=await h.broker.handle(h.request('BIND',1),a);
 assert(prior.ok);
 h.current.set(17,{url:urls.B,documentId:'doc_B',documentLifecycle:'active'});
 const next=await h.broker.handle(h.request('BIND',2),b);
 assert(next.ok,'C09 failed if an unexpired old doc refuses verified new doc');
 assert.notEqual(next.leaseId,prior.leaseId);
 assert.equal((await h.broker.handle(h.request('CHECK',3,prior.leaseId),a)).ok,false);
 const wrote=await h.broker.handle(h.request('UPSERT_REF',3,next.leaseId,
    {conversationId:'c1',operationId:'o1',expectedRevision:0}),b);
 assert(wrote.ok);
 assert.equal((await h.broker.handle(h.request('GET_REF',4,next.leaseId,{conversationId:'c1'}),b)).record.revision,1);
 assert.equal((await h.broker.handle(h.request('GET_REF',5,next.leaseId,{conversationId:'c2'}),b)).record,null);
 assert.equal(h.calls[0].scope,'["synthetic_fixture","B","test_org"]');
});
test('B1: route invalidation revokes even same-document tokens',async()=>{
 const h=mk(),a=fixture(),v=await h.broker.handle(h.request('BIND',1),a);
 assert(v.ok);
 assert(h.broker.invalidate({tabId:17,frameId:0}));
 assert.equal((await h.broker.handle(h.request('CHECK',2,v.leaseId),a)).reason,'stale-binding');
 assert.equal((await h.broker.handle(h.request('BIND',3),a)).ok,true);
});
test('B1: wrong browser document and unknown scope fail closed',async()=>{
 const h=mk(),a=fixture();
 assert.equal((await h.broker.handle(h.request('BIND',1),fixture('doc_FAKE'))).reason,'not-current-document');
 const other=createDocumentBindingBroker({extensionId:'extension_fixture_id',
   getFrame:async()=>h.current.get(17),resolveScope:async()=>null,repository:h.repository});
 assert.equal((await other.handle(h.request('BIND',1),a)).reason,'unverified-scope');
});
test('B1: worker restart invalidates transient lease, not persisted reference',async()=>{
 const h=mk(),a=fixture();
 const v=await h.broker.handle(h.request('BIND',1),a);
 assert((await h.broker.handle(h.request('UPSERT_REF',2,v.leaseId,
 {conversationId:'kept',operationId:'once',expectedRevision:0}),a)).ok);
 const restarted=createDocumentBindingBroker({extensionId:'extension_fixture_id',
  getFrame:async()=>h.current.get(17),resolveScope:fixtureScopeResolver,repository:h.repository});
 assert.equal((await restarted.handle(h.request('GET_REF',3,v.leaseId,{conversationId:'kept'}),a)).reason,'stale-binding');
 const rebound=await restarted.handle(h.request('BIND',4),a);
 const retained=await restarted.handle(h.request('GET_REF',5,rebound.leaseId,{conversationId:'kept'}),a);
 assert.equal(retained.record.revision,1);
});
test('B1: scope change makes old records unreachable even if same native ID',async()=>{
 const h=mk(),a=fixture(),b=fixture('doc_B','B');
 const leaseA=await h.broker.handle(h.request('BIND',1),a);
 assert((await h.broker.handle(h.request('UPSERT_REF',2,leaseA.leaseId,
 {conversationId:'same',operationId:'once',expectedRevision:0}),a)).ok);
 h.current.set(17,{url:urls.B,documentId:'doc_B',documentLifecycle:'active'});
 const leaseB=await h.broker.handle(h.request('BIND',3),b);
 const readB=await h.broker.handle(h.request('GET_REF',4,leaseB.leaseId,{conversationId:'same'}),b);
 assert.equal(readB.record,null);
});
test('B1: lease expiry/replay and browser-confirmed same-document SPA route',async()=>{
 const h=mk(),a=fixture();
 const v=await h.broker.handle(h.request('BIND',1),a);
 assert.equal((await h.broker.handle(h.request('CHECK',1,v.leaseId),a)).reason,'stale-binding');
 h.tick(20001);
 assert.equal((await h.broker.handle(h.request('CHECK',2,v.leaseId),a)).reason,'stale-binding');
 // Chrome reports B even when MessageSender.url retains A for the same documentId.
 h.current.set(17,{url:urls.B,documentId:'doc_A',documentLifecycle:'active'});
 const next=await h.broker.handle(h.request('BIND',3),a);
 assert(next.ok,'same-document SPA B must bind from browser-confirmed route');
 assert.equal((await h.broker.handle(h.request('CHECK',4,v.leaseId),a)).reason,'stale-binding');
 assert.equal((await h.broker.handle(h.request('LIST_REFS',5,next.leaseId),a)).ok,true);
 h.current.set(17,{url:'http://127.0.0.1:40000/b1-fixture/B.html',documentId:'doc_A',documentLifecycle:'active'});
 assert.equal((await h.broker.handle(h.request('BIND',6),a)).reason,'not-current-document',
  'different port is a different security origin, even with matching documentId');
});
test('B1: delayed scope resolver cannot commit after navigation invalidates',async()=>{
 let release;
 const pending=new Promise(resolve=>release=resolve),url=urls.A,doc=fixture();
 const broker=createDocumentBindingBroker({extensionId:'extension_fixture_id',
  getFrame:async()=>({url,documentId:'doc_A',documentLifecycle:'active'}),
  resolveScope:async()=>{await pending;return fixtureScopeResolver({currentFrame:{url}});},
  repository:{get:async()=>null,list:async()=>[],upsert:async()=>({ok:true})}
 });
 const op=broker.handle({v:1,type:'BIND',clientId:'client_A',seq:1},doc);
 await Promise.resolve();broker.invalidate({tabId:17});release();
 assert.equal((await op).ok,false);
});

test('B1: stale pending write is rejected at repository commit fence',async()=>{
 let proceed;const pending=new Promise(resolve=>proceed=resolve);let persisted=0;
 const f=fixture(),url=urls.A;
 const repository={async upsert({beforeCommit}){await pending;
   if(!beforeCommit())return {ok:false,reason:'stale-binding'};
   persisted++;return {ok:true,record:{conversationId:'late',nativeUrl:url,projectId:null,revision:1}};
 }};
 const broker=createDocumentBindingBroker({extensionId:'extension_fixture_id',
  getFrame:async()=>({url,documentId:'doc_A',documentLifecycle:'active'}),
  resolveScope:fixtureScopeResolver,repository});
 const bind=await broker.handle({v:1,type:'BIND',clientId:'client_A',seq:1},f);
 assert(bind.ok);
 const op=broker.handle({v:1,type:'UPSERT_REF',clientId:'client_A',seq:2,leaseId:bind.leaseId,
    conversationId:'late',operationId:'late_op',expectedRevision:0},f);
 await new Promise(resolve=>setTimeout(resolve,0));
 broker.invalidate({tabId:17,frameId:0});proceed();
 const outcome=await op;
 assert.equal(outcome.ok,false);
 assert.equal(persisted,0);
});
test('B1: an asynchronous stale read never returns a stored reference',async()=>{
 let proceed;const pending=new Promise(resolve=>proceed=resolve);
 const f=fixture(),url=urls.A;
 const repository={async get(){await pending;return {conversationId:'secret_synthetic',nativeUrl:url,projectId:null,revision:7};}};
 const broker=createDocumentBindingBroker({extensionId:'extension_fixture_id',
  getFrame:async()=>({url,documentId:'doc_A',documentLifecycle:'active'}),
  resolveScope:fixtureScopeResolver,repository});
 const bind=await broker.handle({v:1,type:'BIND',clientId:'client_A',seq:1},f);
 const op=broker.handle({v:1,type:'GET_REF',clientId:'client_A',seq:2,leaseId:bind.leaseId,
  conversationId:'secret_synthetic'},f);
 await new Promise(resolve=>setTimeout(resolve,0));
 broker.invalidate({tabId:17});proceed();
 const outcome=await op;
 assert.equal(outcome.reason,'stale-after-read');
 assert.equal(Object.hasOwn(outcome,'record'),false);
});

test('B1: a same-document SPA route change never exposes old async reads',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const current={url:urls.A,documentId:'doc_A',documentLifecycle:'active'};
 const broker=createDocumentBindingBroker({
  extensionId:'extension_fixture_id',getFrame:async()=>({...current}),
  resolveScope:fixtureScopeResolver,
  repository:{get:async()=>{await pending;return {conversationId:'A_only',
    nativeUrl:urls.A,projectId:null,revision:1}},list:async()=>[],upsert:async()=>({ok:true})}
 });
 const sender=fixture();
 const bound=await broker.handle({v:1,type:'BIND',clientId:'client_A',seq:1},sender);
 assert(bound.ok);
 const delayed=broker.handle({v:1,type:'GET_REF',clientId:'client_A',seq:2,
   leaseId:bound.leaseId,conversationId:'A_only'},sender);
 await new Promise(resolve=>setTimeout(resolve,0));
 current.url=urls.B;release();
 const result=await delayed;
 assert.equal(result.reason,'stale-after-read');
 assert.equal(Object.hasOwn(result,'record'),false);
 const switched=await broker.handle({v:1,type:'BIND',clientId:'client_A',seq:3},sender);
 assert(switched.ok,'browser-confirmed SPA B must accept stale sender.url A');
});

test('worker notification target revalidates document, lease lifetime and account',async()=>{
 const h=mk(),sender=fixture();
 const first=await h.broker.handle(h.request('BIND',1),sender);
 assert.deepEqual(await h.broker.notificationTarget(first.leaseId),{tabId:17,documentId:'doc_A'});
 assert.equal(await h.broker.notificationTarget('unknown'),null);
 h.current.set(17,{url:urls.B,documentId:'doc_A',documentLifecycle:'active'});
 assert.equal(await h.broker.notificationTarget(first.leaseId),null);
 assert.equal(h.broker.debug().active,0);
 const second=await h.broker.handle(h.request('BIND',2),fixture('doc_A','B'));
 h.tick(20001);assert.equal(await h.broker.notificationTarget(second.leaseId),null);
});

test('ordinary heartbeat remains usable after notification deadline integration',async()=>{
 const h=mk(),sender=fixture(),bound=await h.broker.handle(h.request('BIND',1),sender);
 const current=await h.broker.handle(h.request('CHECK',2,bound.leaseId),sender);
 assert.equal(current.ok,true);assert.equal(current.type,'CURRENT');
});
