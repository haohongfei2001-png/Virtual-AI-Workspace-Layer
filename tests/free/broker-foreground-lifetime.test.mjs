import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentBindingBroker,fixtureScopeResolver} from '../../src/b1/document-binding-broker.mjs';
const url='http://127.0.0.1:38973/b1-fixture/A.html';
async function fixture(){
 const sender={id:'foreground_test',tab:{id:17},frameId:0,documentId:'doc_A',documentLifecycle:'active',url},counts={began:0,released:0},hooks={};let seq=0,leaseId,authorized=true;
 const run=async(name,value)=>hooks[name]?hooks[name]():value;
 const runtime={bind(){},beginForeground(id){assert.equal(id,leaseId);counts.began++;let released=false;return()=>{assert.equal(released,false,'release called twice');released=true;counts.released++;};},foreground:async()=>({calibration:Promise.resolve()}),notify:async()=>{},reconcileReferences:async()=>{}};
 const broker=createDocumentBindingBroker({extensionId:sender.id,getFrame:async()=>sender,resolveScope:async context=>authorized?fixtureScopeResolver(context):null,freeRuntime:runtime,repository:{upsert:async()=>run('upsert',{ok:true,record:{conversationId:'R',nativeUrl:url,projectId:null,revision:1}})},workspaceRepository:{version:async()=>run('version',{revision:1}),freeHeader:async()=>run('header',{scope:'fixture',revision:1}),fixtureObserve:async()=>run('observe',{ok:true})}});
 const call=(type,extra={},sequence=++seq)=>broker.handle({v:1,type,clientId:'client_A',seq:sequence,...(type==='BIND'?{}:{leaseId}),...extra},sender);
 const bound=await call('BIND');assert.equal(bound.ok,true);leaseId=bound.leaseId;assert.deepEqual(counts,{began:0,released:0});
 return {call,counts,hooks,revoke:()=>{authorized=false;}};
}
const cases=[['CHECK','version',{}],['B23_FREE_HEADER','header',{}],['B23_SYNTHETIC_SEND','observe',{conversationId:'R',messageId:'M',projectId:null,nativeTitle:'Native'}],['UPSERT_REF','upsert',{conversationId:'R',operationId:'write_R',expectedRevision:0}]];
for(const [type,hook,extra] of cases){
 test(`${type} success releases foreground exactly once`,async()=>{const h=await fixture();assert.equal((await h.call(type,extra)).ok,true);assert.deepEqual(h.counts,{began:1,released:1});});
 test(`${type} repository failure releases foreground exactly once`,async()=>{const h=await fixture();h.hooks[hook]=()=>{throw Error('injected-repository-failure');};const r=await h.call(type,extra);assert.equal(r.ok,false);assert.equal(r.reason,'injected-repository-failure');assert.deepEqual(h.counts,{began:1,released:1});});
 test(`${type} holds foreground until repository settles and final authority rejects`,async()=>{const h=await fixture();let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);h.hooks[hook]=async()=>{entered();await gate;return type==='CHECK'?{revision:1}:type==='B23_FREE_HEADER'?{scope:'fixture',revision:1}:{ok:true,record:{conversationId:'R',nativeUrl:url,projectId:null,revision:1}};};const pending=h.call(type,extra);await started;assert.deepEqual(h.counts,{began:1,released:0});h.revoke();release();assert.equal((await pending).ok,false);assert.deepEqual(h.counts,{began:1,released:1});});
}
test('replayed sequence is rejected before acquiring foreground ownership',async()=>{const h=await fixture();assert.equal((await h.call('CHECK',{},1)).ok,false);assert.deepEqual(h.counts,{began:0,released:0});});
