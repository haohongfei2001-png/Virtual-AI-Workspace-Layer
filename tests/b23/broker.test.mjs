import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentBindingBroker, fixtureScopeResolver } from '../../src/b1/document-binding-broker.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(workspaces={}){
 const frame={documentId:'doc_A',url:'http://127.0.0.1:48173/b1-fixture/A.html',documentLifecycle:'active'};
 const sender={id:'ext_test',tab:{id:1},frameId:0,documentId:frame.documentId,documentLifecycle:'active',url:frame.url};let scopeOverride=null;
 const broker=createDocumentBindingBroker({extensionId:'ext_test',getFrame:async()=>({...frame}),resolveScope:async p=>scopeOverride??fixtureScopeResolver(p),repository:{},workspaceRepository:workspaces});
 let seq=0,lease;const message=(type,extra={})=>({v:1,type,clientId:'test',seq:++seq,...(type==='BIND'?{}:{leaseId:lease}),...extra});
 return {broker,frame,sender,message,setScope:x=>{scopeOverride=x;},async bind(){const result=await broker.handle(message('BIND'),sender);assert(result.ok);lease=result.leaseId;},call(type,extra){return broker.handle(message(type,extra),sender);}};
}
test('B23 broker rejects scope/actor and evidence injection in page commands',async()=>{
 const h=setup();await h.bind();const common={operationId:'op',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'w',name:'synthetic'}};
 assert.equal((await h.call('B23_COMMAND',{...common,scope:'B'})).reason,'invalid-request');
 assert.equal((await h.call('B23_COMMAND',{...common,actor:'candidate'})).reason,'invalid-request');
 assert.equal((await h.call('B23_COMMAND',{...common,command:{type:'INGEST',batch:{}}})).reason,'invalid-request');
 assert.equal((await h.call('B23_COMMAND',{...common,command:{type:'NATIVE_RENAME'}})).reason,'invalid-request');
});
test('B23 delayed snapshot never returns previous account data at unchanged URL',async()=>{
 const entered=deferred(),release=deferred(),h=setup({snapshot:async()=>{entered.resolve();await release.promise;return {syntheticSecret:'A'};}});await h.bind();
 const pending=h.call('B23_SNAPSHOT',{now:'2026-10-11T04:00:00Z',timeZone:'Asia/Tokyo',size:120});await entered.promise;
 h.setScope({verified:true,provider:'synthetic_fixture',accountId:'B',organizationId:'test_org'});release.resolve();
 const result=await pending;assert.equal(result.reason,'stale-after-workspace');assert.equal('snapshot'in result,false);
});
test('B23 browser invalidation aborts pending mutation and rejects result',async()=>{
 const entered=deferred(),release=deferred();let committed=false,signal;
 const h=setup({command:async(_s,_m,options)=>{signal=options.signal;entered.resolve();await release.promise;if(options.guard()&&!signal.aborted)committed=true;return {ok:committed};}});await h.bind();
 const pending=h.call('B23_COMMAND',{operationId:'op',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'w',name:'synthetic'}});await entered.promise;h.broker.invalidate({tabId:1});assert(signal.aborted);release.resolve();assert.equal((await pending).reason,'stale-after-workspace');assert.equal(committed,false);
});
test('B23 new document supersession aborts old mutation fence',async()=>{
 const entered=deferred(),release=deferred();let signal;const h=setup({command:async(_s,_m,o)=>{signal=o.signal;entered.resolve();await release.promise;return {ok:!signal.aborted};}});await h.bind();
 const pending=h.call('B23_COMMAND',{operationId:'op',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'w',name:'synthetic'}});await entered.promise;
 h.frame.documentId='doc_B';h.sender.documentId='doc_B';await h.bind();assert(signal.aborted);release.resolve();assert.equal((await pending).reason,'stale-after-workspace');
});
test('B23 command envelope passes human operation and abort signal but not mutable scope from page',async()=>{
 let observed;const h=setup({command:async(s,m,o)=>{observed={s,m,o};return {ok:true,revision:1};}});await h.bind();
 assert((await h.call('B23_COMMAND',{operationId:'op',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'w',name:'synthetic'}})).ok);
 assert.equal(observed.s.accountId,'A');assert.equal(observed.o.guard(),true);assert.equal(observed.o.signal.aborted,false);h.broker.tabClosed(1);assert(observed.o.signal.aborted);
});
