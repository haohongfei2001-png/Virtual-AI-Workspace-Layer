import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentBindingBroker, fixtureScopeResolver } from '../../src/b1/document-binding-broker.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(version){
 const frame={documentId:'b4_doc',url:'http://127.0.0.1:48173/b1-fixture/A.html',documentLifecycle:'active'},sender={id:'b4_ext',tab:{id:1},frameId:0,...frame};let override=null,seq=0,lease;
 const broker=createDocumentBindingBroker({extensionId:'b4_ext',getFrame:async()=>({...frame}),resolveScope:async p=>override??fixtureScopeResolver(p),repository:{},workspaceRepository:{version}});
 const msg=type=>({v:1,type,clientId:'b4_client',seq:++seq,...(type==='BIND'?{}:{leaseId:lease})});
 return {broker,async bind(){const r=await broker.handle(msg('BIND'),sender);assert(r.ok);lease=r.leaseId;},check:()=>broker.handle(msg('CHECK'),sender),setScope:s=>override=s};
}
test('B4 CHECK returns only current fenced version metadata',async()=>{
 const h=setup(async(_scope,options)=>{assert(options.guard()&&!options.signal.aborted);return {revision:8,viewRevision:2,viewDiagnostic:null};});await h.bind();const r=await h.check();assert.equal(r.revision,8);assert.equal(r.viewRevision,2);assert.equal('snapshot' in r,false);
});
for(const kind of ['scope-switch','explicit-invalidation'])test('B4 delayed CHECK rejects '+kind+' without old revision metadata',async()=>{
 const entered=deferred(),release=deferred();const h=setup(async()=>{entered.resolve();await release.promise;return {revision:987,viewRevision:3};});await h.bind();const pending=h.check();await entered.promise;
 if(kind==='scope-switch')h.setScope({verified:true,provider:'synthetic_fixture',accountId:'B',organizationId:'test_org'});else h.broker.invalidate({tabId:1});release.resolve();const r=await pending;assert.equal(r.ok,false);assert.equal('revision' in r,false);assert.equal('viewRevision' in r,false);
});
