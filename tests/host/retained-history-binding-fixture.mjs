/** Deterministic L-only harness, adapted from the existing binding-recovery
 * fixture. Real observer/service/authority/UI/VIEW/repositories; synthetic
 * Chrome, identity, body association and IDB. No browser or network access.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';

const ORIGIN='https://chatgpt.com',EXTENSION='fixture_extension';
const C='33333333-3333-4333-8333-333333333333';
const PERSONAL='fixture-personal',TEAM='fixture-team';
const UI_URL=`chrome-extension://${EXTENSION}/workspace.html`;
const C2_PROFILE={id:'fixture-c2-context-recovery',singlePersonalDefault:false,browserRequestContext:true};
const sha256=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expectedScope=(context,principal='fixture-principal')=>JSON.stringify([
 'chatgpt','principal_'+sha256(['chatgpt-principal-v1',principal]),'context_'+sha256(['chatgpt-context-v1',principal,context])
]);
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function event(){
 const listeners=new Set();
 return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:details=>{for(const fn of [...listeners])fn(details);},get size(){return listeners.size;}};
}
function clockFor(t){
 t.mock.timers.enable({apis:['setTimeout']});
 let wall=Date.parse('2026-10-18T00:00:00Z'),elapsed=1000,serial=0;
 const timers=new Map();
 return {
  now:()=>wall,elapsedNow:()=>elapsed,instant:ms=>{wall+=ms;elapsed+=ms;},
  schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},
  cancel:id=>timers.delete(id),get timers(){return timers.size;},
  async advance(ms){
   wall+=ms;elapsed+=ms;
   for(const [id,timer] of [...timers])if(timers.has(id)&&timer.at<=elapsed){timers.delete(id);timer.fn();}
   t.mock.timers.tick(ms);await flush();
  }
 };
}

async function fixture(t,{profile=C2_PROFILE}={}){
 const clock=clockFor(t),tabs=new Map(),webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'no-receipt-binding-'+crypto.randomUUID()});
 const workspace=new WorkspaceRepository({baseRepository:base,clock:()=>new Date(clock.now()).toISOString()});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>new Date(clock.now()).toISOString()});
 const surfaceProfile={id:'fixture-recovery-surface',revision:1,urlPolicy:createURLPolicy()};
 const notices=[],identity={principalId:'fixture-principal',contexts:[{id:PERSONAL,kind:'personal'},{id:TEAM,kind:'organization'}],reads:0,reader:null};
 let serial=0,worker=0,service=null,observer=null,frameReader=null,associationReader=null,associationCalls=0,frameCalls=0;
 const makeId=()=>`integration_${worker}_${++serial}`;
 function addTab(id,contextId=PERSONAL){
  const url=ORIGIN+'/c/'+C,sender={id:EXTENSION,tab:{id,incognito:false},frameId:0,documentId:'document_'+id,documentLifecycle:'active',url};
  const child={...sender,frameId:1,documentId:'ui_document_'+id,url:UI_URL};
  const tab={id,url,contextId,bodyId:C,sender,child,seq:0,localSeq:0,binding:null,mountId:null,grant:null};
  const realm=createContext({location:{protocol:'chrome-extension:'},Date:class extends Date{static now(){return clock.now();}},chrome:{runtime:{sendMessage:message=>service.handle(message,child)}}});
  runInContext('('+installJ4GrantObserver.toString()+')()',realm);
  const frame={url:()=>UI_URL,isDetached:()=>false,evaluate:fn=>Promise.resolve(runInContext('('+fn.toString()+')()',realm))};
  tab.realm=realm;tab.page={url:()=>tab.url,frames:()=>[frame]};tabs.set(id,tab);return tab;
 }
 const browserFrame=({tabId,frameId=0})=>{
  const tab=tabs.get(tabId);if(!tab)return null;
  return frameId===0?{documentId:tab.sender.documentId,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,url:tab.url}:
   frameId===1?{documentId:tab.child.documentId,documentLifecycle:'active',frameType:'sub_frame',parentFrameId:0,url:tab.child.url}:null;
 };
 const getFrame=async query=>{frameCalls++;return frameReader?frameReader(query):browserFrame(query);};
 const frameFor=(tabId=1)=>{const tab=tabs.get(tabId);return {tabId,frameId:0,documentId:tab.sender.documentId,parentDocumentId:null,actualURL:tab.url,documentLifecycle:'active',incognito:false};};
 const makeIdentity=()=>({principalId:identity.principalId,contexts:identity.contexts.map(row=>({...row})),expiresAt:new Date(clock.now()+3600000).toISOString(),providerProfile:'fixture-fixed-provider',transport:'worker-fixed-fetch'});
 function construct(){
  worker++;
  observer=createBrowserRequestContext({origin:ORIGIN,webRequest,getFrame,getTab:async id=>({id,incognito:false}),
   associatePage:async query=>{associationCalls++;if(associationReader)return associationReader(query);const tab=tabs.get(query.tabId);return {challenge:query.challenge,actualURL:tab.url,conversationId:tab.bodyId,association:'explicit-body-id'};},
   now:clock.now,elapsedNow:clock.elapsedNow,makeId,
   onInvalidate:details=>{notices.push({type:'HOST_CONTEXT_PENDING',...details});service?.invalidate(details);},
   onReady:details=>notices.push({type:'HOST_CONTEXT_READY',...details})});
  service=createHostBindingService({extensionId:EXTENSION,getFrame,contextObserver:observer,profile,
   allowedURL:value=>{try{return new URL(value).origin===ORIGIN;}catch{return false;}},
   provider:{read:async options=>{identity.reads++;return identity.reader?identity.reader(options):makeIdentity();}},
   uiURLs:{workspace:UI_URL,sidebar:`chrome-extension://${EXTENSION}/sidebar.html`},
   repository:base,workspaceRepository:workspace,freeEvidenceRepository:evidence,surfaceProfiles:new Map([[surfaceProfile.id,surfaceProfile]]),
   now:clock.now,elapsedNow:clock.elapsedNow,schedule:clock.schedule,cancel:clock.cancel,makeId});
 }
 function restart(){const stoppedAt=clock.now(),previous=service;service.stop();observer.stop();service=null;construct();return {stoppedAt,previous};}
 function stop(){service?.stop();observer?.stop();}
 addTab(1);construct();t.after(()=>{stop();base.close();});
 const packet=(tabId=1)=>{const {documentToken,producerToken,routeEpoch}=tabs.get(tabId).binding;return {documentToken,producerToken,routeEpoch};};
 const request=(type,extra={},tabId=1)=>{const tab=tabs.get(tabId);return service.handle({v:1,type,clientId:'fixture-client',seq:++tab.seq,...extra},tab.sender);};
 async function hello(tabId=1){const tab=tabs.get(tabId),result=await request('HOST_HELLO',{},tabId);assert.equal(result.ok,true,JSON.stringify(result));tab.binding=result.binding;tab.localSeq=0;return result;}
 const refresh=(tabId=1)=>request('HOST_REFRESH',packet(tabId),tabId);
 const details=({tabId=1,contextId=tabs.get(tabId).contextId,...extra}={})=>({tabId,frameId:0,documentId:tabs.get(tabId).sender.documentId,documentLifecycle:'active',initiator:ORIGIN,type:'xmlhttprequest',method:'GET',requestId:makeId(),url:ORIGIN+'/backend-api/conversation/'+C,requestHeaders:[{name:'ChatGPT-Account-ID',value:contextId}],...extra});
 async function native(options={},completion={}){const d=details(options);webRequest.onSendHeaders.emit(d);await flush();webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,requestHeaders:undefined,...completion});await flush();return d;}
 const childSend=(message,tabId=1)=>tabs.get(tabId).realm.chrome.runtime.sendMessage(message);
 async function mount(tabId=1){
  const tab=tabs.get(tabId),mountId=makeId(),nonce=makeId();
  assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...packet(tabId),mountId,regionEpoch:1},tab.sender)).ok,true);
  tab.mountId=mountId;
  const joining=childSend({v:1,type:'HOST_UI_JOIN',nonce,role:'workspace'},tabId);
  const confirming=service.handle({v:1,type:'HOST_UI_CONFIRM',...packet(tabId),mountId,regionEpoch:1,nonce,role:'workspace'},tab.sender);
  const [joined,confirmed]=await Promise.all([joining,confirming]);
  assert.equal(joined.ok,true,JSON.stringify(joined));assert.equal(confirmed.ok,true,JSON.stringify(confirmed));
  assert.deepEqual(joined.grant,confirmed.grant);tab.grant=joined.grant;await flush();return joined.grant;
 }
 async function observe(title,tabId=1){
  const tab=tabs.get(tabId),locator={profileId:surfaceProfile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const result=await service.handle({protocol:'vaiwl-host-observation/1',...packet(tabId),localSeq:++tab.localSeq,profileId:surfaceProfile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{
   candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:title,titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:tab.url,liveHandle:null},evidence:locator}],
   membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]
  }},tab.sender);
  assert.equal(result.state,'accepted',JSON.stringify(result));return result;
 }
 const view=(tabId=1,overrides={},sender=null)=>{
  const tab=tabs.get(tabId),message={v:1,type:'HOST_UI_VIEW',grantId:tab.grant?.id??'unissued_grant',mountId:tab.mountId??'unissued_mount',query:{},...overrides};
  return sender?service.handle(message,sender):childSend(message,tabId);
 };
 async function ready(tabId=1){
  for(let tries=0;tries<80;tries++){const result=await view(tabId);if(result.state!=='preparing')return result;await flush();}
  assert.fail('bounded actual VIEW preparation did not finish');
 }
 async function authorize(tabId=1){await hello(tabId);const result=await refresh(tabId);assert.equal(result.state,'verified',JSON.stringify(result));assert.equal(result.scopeKey,expectedScope(tabs.get(tabId).contextId,identity.principalId));return result;}
 return {clock,tabs,webRequest,notices,identity,base,workspace,evidence,addTab,frameFor,browserFrame,packet,request,hello,refresh,details,native,mount,observe,view,ready,authorize,restart,stop,makeIdentity,
  get service(){return service;},get observer(){return observer;},get associationCalls(){return associationCalls;},get frameCalls(){return frameCalls;},
  set frameReader(value){frameReader=value;},set associationReader(value){associationReader=value;}
 };
}


export {fixture,flush,deferred,ORIGIN,C,expectedScope};
