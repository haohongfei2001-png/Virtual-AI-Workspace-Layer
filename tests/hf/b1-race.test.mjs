import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentBindingBroker } from '../../src/b1/document-binding-broker.mjs';
const url='http://127.0.0.1/b1-fixture/A.html';
const sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',documentLifecycle:'active',url};
for(const kind of ['GET_REF','LIST_REFS']) test('B1 rejects account changed during '+kind+' without URL change',async()=>{
  let account='A',release,entered;
  const ready=new Promise(r=>entered=r), wait=new Promise(r=>release=r);
  const read=async()=>{entered();await wait;return {conversationId:'T0',nativeUrl:url,projectId:null,revision:1}};
  const broker=createDocumentBindingBroker({extensionId:'ext',getFrame:async()=>({documentId:'doc',url}),
    resolveScope:async()=>({verified:true,provider:'test',accountId:account,organizationId:'org'}),
    repository:{get:read,list:async()=>[await read()]}});
  const bound=await broker.handle({v:1,type:'BIND',clientId:'client',seq:1},sender);
  const req={v:1,type:kind,clientId:'client',seq:2,leaseId:bound.leaseId};
  if(kind==='GET_REF')req.conversationId='T0';
  const pending=broker.handle(req,sender);await ready;account='B';release();
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'stale-after-read');
});
