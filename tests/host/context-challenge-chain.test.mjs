import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createHostContentSession} from '../../src/host/content-session.mjs';
import {createContextAssociationBridge} from '../../src/host/context-association.mjs';

const origin='https://chatgpt.com',C='11111111-1111-4111-8111-111111111111';
const url=origin+'/c/'+C;
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function event(){
 const listeners=new Set();
 return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
  emit:(...args)=>[...listeners].map(fn=>fn(...args))};
}
function deliver(target,message,sender){
 return new Promise(resolve=>{
  const pending=target.emit(message,sender,resolve).some(result=>result===true);
  if(!pending)resolve(undefined);
 });
}

/** The real browser bootstrap/owner, worker router, binding/authority, content
 * and fixed session provider are composed here. Only Chrome transport, DOM,
 * clock and network are doubles. Native events are the sole READY source;
 * neither contextReady nor authority.refresh is invoked by the test driver.
 * This is a Node/MOCK_IDB causality test, not a real-host or MV3 acceptance. */
function fixture(t){
 let time=Date.now(),timerId=0,opens=0,bodyReads=0,domBodyReads=0,surfaces=0;
 const timers=new Map(),documents=new Map(),frames=new Map(),trace=[],fetches=[],requestShapes=[];
 const provenance=new AsyncLocalStorage();
 t.mock.method(Date,'now',()=>time);
 t.mock.method(performance,'now',()=>time);
 const schedule=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:time+ms});return id;};
 const cancel=id=>timers.delete(id);
 const record=(type,extra={})=>trace.push({type,...provenance.getStore(),...extra});
 const response=()=>({url:origin+'/api/auth/session',status:403,redirected:false,
  headers:new Headers({'cf-mitigated':'challenge','content-type':'text/html'}),
  get body(){bodyReads++;throw Error('challenge-body-must-not-be-read');},
  text(){bodyReads++;throw Error('challenge-text-must-not-be-read');},
  json(){bodyReads++;throw Error('challenge-json-must-not-be-read');}});
 t.mock.method(globalThis,'fetch',(target,options)=>{
  // Any new endpoint fails locally: this fixture can never reach the network.
  const shape={target,options:Object.fromEntries(Object.entries(options).filter(([key])=>key!=='signal'))};
  requestShapes.push(shape);
  assert.equal(target,origin+'/api/auth/session');
  assert.deepEqual(shape.options,
   {method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
  assert.equal(options.signal.aborted,false);
  const entry={...provenance.getStore(),signal:options.signal,settled:false};
  record('fetch');fetches.push(entry);
  options.signal.addEventListener('abort',()=>record('abort',{...entry,signal:undefined,settled:entry.settled}),{once:true});
  // Intentionally allow a response after abort to exercise stale completions.
  return new Promise(resolve=>{entry.finish=()=>{entry.settled=true;resolve(response());};});
 });
 const chrome={
  runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
   getContexts:async()=>[],onMessage:event(),onConnect:event()},
  webNavigation:{getFrame:async({tabId})=>frames.get(tabId)??null,
   onCommitted:event(),onHistoryStateUpdated:event()},
  webRequest:Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(key=>[key,event()])),
  tabs:{get:async id=>({id,incognito:false}),onRemoved:event(),
   sendMessage:async(tabId,message,{documentId})=>{
    record(message.type,{tabId,documentId});
    assert(['HOST_CONTEXT_PENDING','HOST_CONTEXT_READY','HOST_CONTEXT_ASSOCIATE','HOST_DOCUMENT_INVALIDATED'].includes(message.type),
     'challenge must not invoke isolated identity fallback, UI or navigation');
    const page=documents.get(documentId);
    if(!page||page.closed)return;
    assert.equal(page.tabId,tabId);
    return deliver(page.runtime.onMessage,message,{id:'extension'});
   }}
 };
 const indexedDB=new MockIDBFactory(),open=indexedDB.open.bind(indexedDB);
 indexedDB.open=(...args)=>{opens++;return open(...args);};
 const worker=createHostWorkerRuntime({chrome,indexedDB,
  scopeProfile:{id:'c2-chain',singlePersonalDefault:false,browserRequestContext:true},
  serviceFactory:options=>createHostBindingService({...options,schedule,cancel})});
 async function addDocument(documentId,tabId=7){
  const windowEvents=new Map();
  const win={addEventListener:(name,fn)=>{if(!windowEvents.has(name))windowEvents.set(name,new Set());windowEvents.get(name).add(fn);},
   removeEventListener:(name,fn)=>windowEvents.get(name)?.delete(fn),
   getComputedStyle:()=>({display:'block',visibility:'visible'})};
  const document={location:{origin,href:url},defaultView:win,visibilityState:'visible',
   querySelectorAll:()=>[root]};
  const root={nodeType:1,isConnected:true,ownerDocument:document,parentElement:null,
   getAttribute:name=>name==='data-c'?C:null,getClientRects:()=>[{}],querySelectorAll:()=>[],
   get textContent(){domBodyReads++;throw Error('body-text-must-not-be-read');}};
  const sender={id:'extension',tab:{id:tabId,incognito:false},frameId:0,documentId,
   documentLifecycle:'active',url};
  const runtime={id:'extension',getURL:chrome.runtime.getURL,onMessage:event(),sendMessage:message=>
   provenance.run({...provenance.getStore(),tabId,documentId,producer:message.producerToken??null},async()=>{
    record(message.type);
    const reply=await deliver(chrome.runtime.onMessage,message,sender);
    record('reply',{requestType:message.type,state:reply?.state,reason:reply?.reason});
    assert.notEqual(reply?.state,'verified');
    return reply;
   })};
  const session=createHostContentSession({document,runtime,origin,contextRecovery:true,schedule,cancel,
   adapterFactory:()=>({start:async options=>{record('observation',{documentId,phase:options.phase});},stop(){}}),
   surfaceFactory:()=>{surfaces++;throw Error('unverified-surface');},
   controllerFactory:()=>{surfaces++;throw Error('unverified-controller');}});
  const bridge=createContextAssociationBridge({document,runtime,origin,
   profile:{id:'fixed-body',revision:1,currentBody:{rootSelector:'#reading',conversationIdAttribute:'data-c',messageSelector:'[data-message]',messageIdAttribute:'data-message'}},
   isOwnedMask:session.isOwnedMask,onPending:session.contextPending,
   onReady:()=>{void session.contextReady();},schedule,cancel});
  const page={tabId,documentId,runtime,session,closed:false,frame:{tabId,frameId:0,documentId,
   actualURL:url,documentLifecycle:'active',incognito:false},close(){
    for(const fn of [...(windowEvents.get('pagehide')??[])])fn({persisted:false});
    bridge.stop();session.stop();page.closed=true;
   }};
  frames.set(tabId,{documentId,url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1});
  documents.set(documentId,page);
  await session.start();await flush();
  assert.equal(session.localStatus(),'waiting');
  return page;
 }
 async function send(page,requestId){
  time+=10;
  const request={tabId:page.tabId,frameId:0,documentId:page.documentId,documentLifecycle:'active',
   initiator:origin,type:'xmlhttprequest',method:'GET',requestId,
   url:origin+'/backend-api/conversation/'+C,requestHeaders:[{name:'Chatgpt-Account-Id',value:'team'}]};
  provenance.run({requestId},()=>chrome.webRequest.onSendHeaders.emit(request));
  await flush();return request;
 }
 async function complete(request){
  provenance.run({requestId:request.requestId},()=>chrome.webRequest.onCompleted.emit({...request,statusCode:200,fromCache:false,requestHeaders:undefined}));
  await flush();
 }
 async function finish(index){assert(fetches[index]);fetches[index].finish();await flush();}
 async function advance(ms){
  time+=ms;
  for(const [id,timer]of [...timers])if(timer.at<=time&&timers.delete(id))timer.fn();
  await flush();
 }
 function closed(){
  // Assert again outside production catch boundaries: a rejected callback is
  // not evidence that an unwanted request or publication never happened.
  assert.deepEqual(requestShapes,fetches.map(()=>({target:origin+'/api/auth/session',options:
   {method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}}})));
  assert.equal(trace.some(e=>e.type.startsWith('HOST_')&&!['HOST_HELLO','HOST_REFRESH','HOST_CONTEXT_PENDING',
   'HOST_CONTEXT_READY','HOST_CONTEXT_ASSOCIATE','HOST_DOCUMENT_INVALIDATED'].includes(e.type)),false);
  assert.equal(trace.some(e=>e.type==='reply'&&e.state==='verified'),false);
  assert(fetches.every(e=>typeof e.producer==='string'&&e.producer.length>0));
  assert.equal(opens,0,'no old-account database may open');assert.equal(bodyReads,0);assert.equal(domBodyReads,0);assert.equal(surfaces,0);
  for(const page of documents.values()){
   assert.equal(worker.service.authority.scopeFor(page.frame),null);
   assert.notEqual(worker.service.authority.peek(page.frame).state,'verified');
   assert.equal(page.session.showWorkspace(),false);
  }
 }
 async function quiescent(){
  const before={fetches:fetches.length,ready:trace.filter(e=>e.type==='HOST_CONTEXT_READY').length,
   associations:trace.filter(e=>e.type==='HOST_CONTEXT_ASSOCIATE').length};
  await advance(30000);
  assert.deepEqual({fetches:fetches.length,ready:trace.filter(e=>e.type==='HOST_CONTEXT_READY').length,
   associations:trace.filter(e=>e.type==='HOST_CONTEXT_ASSOCIATE').length},before);
  closed();
 }
 t.after(async()=>{for(const page of documents.values())page.close();worker.stop();for(const fetch of fetches)if(!fetch.settled)fetch.finish();await flush();});
 return {addDocument,send,complete,finish,advance,closed,quiescent,fetches,trace,worker,
  async replace(page,documentId){
   page.close();
   frames.set(page.tabId,{documentId,url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1});
   chrome.webNavigation.onCommitted.emit({tabId:page.tabId,frameId:0,documentId,url,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1});await flush();
   return addDocument(documentId,page.tabId);
  }};
}

test('real owner READY chain ignores duplicate and older completion; a fresh receipt permits exactly one new challenge',async t=>{
 const f=fixture(t),page=await f.addDocument('doc-a');assert.equal(f.fetches.length,0);
 const older=await f.send(page,'older'),newer=await f.send(page,'newer');
 await f.complete(newer);assert.equal(f.fetches.length,1);assert.equal(page.session.localStatus(),'connecting');
 const before=f.trace.length;await f.complete(newer);await f.complete(older);
 assert.equal(f.fetches.length,1);assert.equal(f.trace.length,before);
 await f.finish(0);assert.equal(page.session.localStatus(),'verification-required');
 const blocked=f.trace.length;await f.complete(newer);await f.complete(older);
 assert.equal(f.fetches.length,1);assert.equal(f.trace.length,blocked);
 await f.complete(await f.send(page,'fresh'));assert.equal(f.fetches.length,2);
 assert.notEqual(f.fetches[0].producer,f.fetches[1].producer);
 assert.deepEqual(f.fetches.map(x=>[x.documentId,x.requestId]),[['doc-a','newer'],['doc-a','fresh']]);
 await f.finish(1);assert.equal(page.session.localStatus(),'verification-required');
 assert.equal(f.trace.filter(e=>e.type==='HOST_CONTEXT_ASSOCIATE').length,2,'one pre-auth metadata association per genuine receipt');
 await f.quiescent();
});

for(const oldResponse of ['while-fresh-pending','after-fresh-challenge'])test('same document new receipt cancels old authentication without consuming new READY: '+oldResponse,async t=>{
 const f=fixture(t),page=await f.addDocument('doc-a');
 await f.complete(await f.send(page,'old-request'));assert.equal(f.fetches.length,1);
 await f.complete(await f.send(page,'fresh-request'));assert.equal(f.fetches.length,2);
 assert.equal(f.fetches[0].signal.aborted,true);assert.equal(f.fetches[1].signal.aborted,false);
 assert.notEqual(f.fetches[0].producer,f.fetches[1].producer);
 const before=f.trace.filter(e=>e.producer===f.fetches[1].producer).length;
 if(oldResponse==='while-fresh-pending'){
  await f.finish(0);assert.equal(page.session.localStatus(),'connecting');
  assert.equal(f.trace.filter(e=>e.producer===f.fetches[1].producer).length,before);
 }
 await f.finish(1);assert.equal(page.session.localStatus(),'verification-required');
 const after=f.trace.filter(e=>e.producer===f.fetches[1].producer).length;
 if(oldResponse==='after-fresh-challenge'){
  await f.finish(0);assert.equal(page.session.localStatus(),'verification-required');
  assert.equal(f.trace.filter(e=>e.producer===f.fetches[1].producer).length,after);
 }
 assert.equal(f.trace.filter(e=>e.type==='HOST_CONTEXT_READY').length,2);
 assert.equal(f.trace.filter(e=>e.type==='HOST_CONTEXT_ASSOCIATE').length,2);
 await f.quiescent();
});

test('an independent document READY neither wakes nor replaces a challenged peer',async t=>{
 const f=fixture(t),first=await f.addDocument('doc-a'),second=await f.addDocument('doc-b',8);
 await f.complete(await f.send(first,'request-a'));await f.finish(0);
 const firstBefore=f.trace.filter(e=>e.documentId==='doc-a').length;
 await f.complete(await f.send(second,'request-b'));assert.equal(f.fetches.length,2);await f.finish(1);
 assert.equal(f.trace.filter(e=>e.documentId==='doc-a').length,firstBefore);
 assert.deepEqual(f.fetches.map(x=>x.documentId),['doc-a','doc-b']);
 assert.equal(first.session.localStatus(),'verification-required');assert.equal(second.session.localStatus(),'verification-required');
 await f.quiescent();
});

for(const order of ['before-new-ready','after-new-ready','after-new-challenge'])test('replaced document cannot revive from old challenge response '+order,async t=>{
 const f=fixture(t),old=await f.addDocument('doc-old');
 const oldRequest=await f.send(old,'old-request');await f.complete(oldRequest);
 assert.equal(f.fetches.length,1);assert.equal(f.fetches[0].signal.aborted,false);
 const fresh=await f.replace(old,'doc-new');assert.equal(f.fetches[0].signal.aborted,true);
 assert.equal(f.fetches.length,1);assert.equal(fresh.session.localStatus(),'waiting');
 if(order==='before-new-ready'){await f.finish(0);assert.equal(fresh.session.localStatus(),'waiting');}
 await f.complete(await f.send(fresh,'new-request'));assert.equal(f.fetches.length,2);
 const before=f.trace.filter(e=>e.documentId==='doc-new').length;
 if(order==='after-new-ready'){
  await f.finish(0);assert.equal(fresh.session.localStatus(),'connecting');
  assert.equal(f.trace.filter(e=>e.documentId==='doc-new').length,before);
 }
 await f.finish(1);assert.equal(fresh.session.localStatus(),'verification-required');
 const after=f.trace.filter(e=>e.documentId==='doc-new').length;
 if(order==='after-new-challenge'){
  await f.finish(0);assert.equal(fresh.session.localStatus(),'verification-required');
  assert.equal(f.trace.filter(e=>e.documentId==='doc-new').length,after);
 }
 await f.complete(oldRequest);assert.equal(f.fetches.length,2);
 assert.deepEqual(f.fetches.map(x=>[x.documentId,x.requestId]),[['doc-old','old-request'],['doc-new','new-request']]);
 assert.equal(old.session.localStatus(),'unavailable');await f.quiescent();
});
