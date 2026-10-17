/** Deterministic L fixture: real context observer, scope authority and recovery
 * strategy; Chrome, native HTTP completion, body association and identity edges
 * are synthetic. It does not access a browser, account, credentials or network.
 */
import {createBrowserRequestContext} from '../../../src/runtime/browser-request-context.mjs';
import {createScopeAuthority} from '../../../src/runtime/scope-authority.mjs';
import {createNoReceiptContextRecovery} from '../../../src/runtime/context-recovery/no-receipt-recovery.mjs';

export const ORIGIN='https://chatgpt.com';
export const CONVERSATION='33333333-3333-4333-8333-333333333333';
export const OTHER_CONVERSATION='44444444-4444-4444-8444-444444444444';
export const PERSONAL='synthetic-personal';
export const TEAM='synthetic-team';
export const C2_PROFILE=Object.freeze({id:'synthetic-context-recovery-c2',singlePersonalDefault:false,browserRequestContext:true});

export const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export function event(){
 const listeners=new Set();
 return {addListener:listener=>listeners.add(listener),removeListener:listener=>listeners.delete(listener),emit:value=>{for(const listener of [...listeners])listener(value);},get size(){return listeners.size;}};
}

export function createClock({wall=Date.parse('2026-10-18T00:00:00Z'),elapsed=1000,onAdvance=()=>{}}={}){
 const timers=new Map();let sequence=0;
 const now=()=>wall,elapsedNow=()=>elapsed;
 const schedule=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:elapsed+ms});return id;};
 const cancel=id=>timers.delete(id);
 function fire(){for(const [id,timer]of [...timers])if(timers.has(id)&&timer.at<=elapsed){timers.delete(id);timer.fn();}}
 return {now,elapsedNow,schedule,cancel,fire,get timers(){return timers.size;},
  async advance(ms,{runTimers=true}={}){wall+=ms;elapsed+=ms;if(runTimers){fire();onAdvance(ms);}await flush();},
  setWall:value=>{wall=value;},setElapsed:value=>{elapsed=value;}
 };
}

export function createFixture(t,{profile=C2_PROFILE,maxDocuments=128,clock=null}={}){
 // BrowserRequestContext intentionally owns its existing request-deadline
 // implementation; mock its default setTimeout instead of changing production.
 t.mock.timers.enable({apis:['setTimeout']});
 clock??=createClock({onAdvance:ms=>t.mock.timers.tick(ms)});
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 const documents=new Map(),signals=[],associations=[];let serial=0,generation=0,authorizeCalls=0,active=true,frameReader=null,tabReader=null,associationReader=null,onAuthorityPeek=null;
 let contextObserver,authority,recovery;
 const identity={principalId:'synthetic-principal',contexts:[{id:PERSONAL,kind:'personal'},{id:TEAM,kind:'organization'}],expiresAt:null,reader:null,calls:0,signals:[]};
 const makeIdentity=()=>({principalId:identity.principalId,contexts:identity.contexts.map(value=>({...value})),expiresAt:identity.expiresAt??new Date(clock.now()+3600000).toISOString(),providerProfile:'synthetic-fixed-identity',transport:'worker-fixed-fetch'});
 const provider={read:async options=>{identity.calls++;identity.signals.push(options.signal);return identity.reader?identity.reader(options):makeIdentity();}};
 function addTab(tabId,{documentId='document_'+tabId,conversationId=CONVERSATION,contextId=TEAM,incognito=false}={}){
  documents.set(tabId,{documentId,conversationId,contextId,incognito,url:ORIGIN+'/c/'+conversationId,bodyId:conversationId,current:true,attemptOwner:Object.freeze({})});return frame(tabId);
 }
 function frame(tabId=1){const d=documents.get(tabId);return {tabId,frameId:0,documentId:d.documentId,parentDocumentId:null,actualURL:d.url,documentLifecycle:'active',incognito:d.incognito};}
 function browserFrame(tabId=1){const d=documents.get(tabId);return d?{documentId:d.documentId,frameType:'outermost_frame',documentLifecycle:'active',parentFrameId:-1,url:d.url}:null;}
 const getFrame=async query=>frameReader?frameReader(query):browserFrame(query.tabId);
 const getTab=async tabId=>tabReader?tabReader(tabId):({id:tabId,incognito:documents.get(tabId)?.incognito});
 const associatePage=async query=>{
  associations.push({...query});if(associationReader)return associationReader(query);
  const d=documents.get(query.tabId);if(!d?.current||!d.bodyId)return null;
  return {challenge:query.challenge,actualURL:d.url,conversationId:d.bodyId,association:'explicit-body-id'};
 };
 function construct(){
  generation++;
  contextObserver=createBrowserRequestContext({origin:ORIGIN,webRequest,getFrame,getTab,associatePage,now:clock.now,elapsedNow:clock.elapsedNow,makeId:()=>`native_${generation}_${++serial}`,
   onInvalidate:details=>{signals.push({kind:'invalidate',...details});recovery?.invalidate(details);authority?.invalidate(details.documentId);},
   onReady:details=>signals.push({kind:'ready',...details})});
  authority=createScopeAuthority({provider,profile,contextObserver,now:clock.now,elapsedNow:clock.elapsedNow,schedule:clock.schedule,cancel:clock.cancel,makeId:()=>`scope_${generation}_${++serial}`});
  const actualAuthority=authority,policyAuthority=Object.freeze({...actualAuthority,peek(frame){
   const result=actualAuthority.peek(frame);onAuthorityPeek?.({frame,result,authority:actualAuthority});return result;
  }});
  recovery=createNoReceiptContextRecovery({profile,contextObserver,authority:policyAuthority,now:clock.now,elapsedNow:clock.elapsedNow,schedule:clock.schedule,cancel:clock.cancel,maxDocuments});
 }
 function restart(){const old={contextObserver,authority,recovery};recovery.stop();authority.invalidateAll();contextObserver.stop();for(const d of documents.values())d.attemptOwner=Object.freeze({});construct();return old;}
 function stop(){if(!active)return;active=false;recovery.stop();authority.invalidateAll();contextObserver.stop();}
 addTab(1);construct();t.after(stop);
 const details=({tabId=1,contextId=documents.get(tabId)?.contextId,conversationId=documents.get(tabId)?.conversationId,requestId=`request_${generation}_${++serial}`,...patch}={})=>({tabId,frameId:0,documentId:documents.get(tabId)?.documentId,documentLifecycle:'active',initiator:ORIGIN,type:'xmlhttprequest',method:'GET',requestId,url:ORIGIN+'/backend-api/conversation/'+conversationId,requestHeaders:[{name:'ChatGPT-Account-ID',value:contextId}],...patch});
 function emitSend(options={}){const d=details(options);webRequest.onSendHeaders.emit(d);return d;}
 async function send(options={}){const d=emitSend(options);await flush();return d;}
 async function complete(d,patch={}){webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,requestHeaders:undefined,...patch});await flush();}
 async function native(options={},completion={}){const d=await send(options);await complete(d,completion);return d;}
 function authorize(f,authorityAtCall,{signal,remainingMs}){authorizeCalls++;return authorityAtCall.refresh(f,'auth-change',signal);}
 function run(options={}){
  const {tabId=1,frame:chosen=frame(tabId),signal,authorize:customAuthorize,isCurrent,remainingMs,attemptOwner=documents.get(chosen.tabId)?.attemptOwner,...extra}=options;
  const started=clock.elapsedNow(),authorityAtCall=authority;
  return recovery.run(chosen,{signal,attemptOwner,authorize:customAuthorize??(options=>authorize(chosen,authorityAtCall,options)),remainingMs:remainingMs??(()=>6000-(clock.elapsedNow()-started)),isCurrent:isCurrent??(()=>active&&documents.get(chosen.tabId)?.current===true&&documents.get(chosen.tabId)?.documentId===chosen.documentId&&documents.get(chosen.tabId)?.url===chosen.actualURL&&documents.get(chosen.tabId)?.attemptOwner===attemptOwner),...extra});
 }
 return {clock,webRequest,documents,identity,provider,makeIdentity,signals,associations,frame,browserFrame,getFrame,getTab,addTab,details,emitSend,send,complete,native,run,restart,stop,
  get observer(){return contextObserver;},get authority(){return authority;},get recovery(){return recovery;},get authorizeCalls(){return authorizeCalls;},get generation(){return generation;},
  set frameReader(value){frameReader=value;},set tabReader(value){tabReader=value;},set associationReader(value){associationReader=value;},
  set onAuthorityPeek(value){onAuthorityPeek=value;},
  async verify(tabId=1){return contextObserver.verify(frame(tabId));},
  invalidate(tabId=1){const d=documents.get(tabId);recovery.invalidate({tabId,documentId:d.documentId});authority.invalidate(d.documentId);},
  closeTab(tabId){recovery.forgetTab(tabId);authority.invalidateTab(tabId);contextObserver.invalidateTab(tabId);documents.delete(tabId);},
  navigate(tabId,conversationId,{documentId=null,notify=true}={}){const d=documents.get(tabId);d.url=ORIGIN+'/c/'+conversationId;d.conversationId=conversationId;d.bodyId=conversationId;if(documentId!==null)d.documentId=documentId;if(notify){const details={tabId,frameId:0,...browserFrame(tabId)};if(documentId===null)contextObserver.invalidateHistory(details);else contextObserver.invalidateCommitted(details);}}
 };
}
