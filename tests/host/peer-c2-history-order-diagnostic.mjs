import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createBrowserRequestContext} from '../../src/runtime/browser-request-context.mjs';

// L-only diagnosis of an existing fail-closed boundary. These are explicit
// browser-event/metadata/body doubles, never a Chrome event-order observation.
const origin='http://127.0.0.1:3210';
const oldId='33333333-3333-4333-8333-333333333333';
const newId='44444444-4444-4444-8444-444444444444';
const faults=[null,'history-document','history-target','history-frame','history-lifecycle','second-history','epoch-invalidation','deadline','final-document','final-route','conflicting-context','failed-response','cached-response','stopped-owner'];
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
function event(){
 const listeners=new Set();
 return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:value=>{for(const fn of listeners)fn(value);},size:()=>listeners.size};
}
export async function probePeerHistoryOrder({priorReceipt=false,order='history-first',lookup='current',fault=null}={}){
 if(typeof priorReceipt!=='boolean'||!['history-first','send-first'].includes(order)||!['current','old'].includes(lookup)||!faults.includes(fault)||order==='history-first'&&(lookup!=='current'||fault!==null))throw Error('invalid-peer-history-probe');
 const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 let actual={documentId:'fixture-document',frameType:'outermost_frame',documentLifecycle:'active',url:origin+'/c/'+oldId};
 let clock=1000,serial=0,hold=false,release=null,bodyAssociations=0;
 const signals=[];
 const owner=createBrowserRequestContext({webRequest,origin,now:()=>clock,elapsedNow:()=>clock,makeId:()=>`fixture_receipt_${++serial}`,
  getTab:async id=>({id,incognito:false}),getFrame:async()=>{const snapshot={...actual};if(hold){hold=false;return new Promise(resolve=>{release=()=>resolve(snapshot);});}return snapshot;},
  associatePage:async query=>{bodyAssociations++;return {challenge:query.challenge,actualURL:query.actualURL,conversationId:query.conversationId,association:'explicit-body-id'};},
  onInvalidate:()=>signals.push('PENDING'),onReady:()=>signals.push('READY')});
 const request=(id,conversation,context='fixture-team')=>({tabId:7,frameId:0,documentId:'fixture-document',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:id,url:origin+'/backend-api/conversation/'+conversation,requestHeaders:[{name:'Chatgpt-Account-Id',value:context}]});
 const frame=()=>({tabId:7,frameId:0,documentId:actual.documentId,documentLifecycle:'active',incognito:false,actualURL:actual.url});
 const finish=async details=>{webRequest.onCompleted.emit({...details,statusCode:200,fromCache:false});await settle();};
 let result;
 try{
  let oldReceipt=null;
  if(priorReceipt){const initial=request('initial',oldId);webRequest.onSendHeaders.emit(initial);await settle();await finish(initial);oldReceipt=await owner.verify(frame());assert.equal(oldReceipt?.conversationId,oldId,'warm control requires a genuine owner receipt');}
  signals.length=0;bodyAssociations=0;clock+=100;
  const next=request('next',newId),history={tabId:7,frameId:0,documentId:'fixture-document',documentLifecycle:'active',frameType:'outermost_frame',url:origin+'/c/'+newId};
  if(fault==='history-document')history.documentId='different-document';
  if(fault==='history-target')history.url=origin+'/c/'+oldId;
  if(fault==='history-frame')history.frameId=1;
  if(fault==='history-lifecycle')history.documentLifecycle='prerender';
  if(order==='history-first'){
   actual.url=origin+'/c/'+newId;owner.invalidateHistory(history);webRequest.onSendHeaders.emit(next);await settle();
  }else{
   if(lookup==='current')actual.url=origin+'/c/'+newId;
   hold=true;webRequest.onSendHeaders.emit(next);await settle();assert.equal(typeof release,'function','the first browser lookup must be held before history');
   actual.url=origin+'/c/'+newId;owner.invalidateHistory(history);
   if(fault==='second-history')owner.invalidateHistory(history);
   if(fault==='epoch-invalidation')owner.invalidateTab(7);
   if(fault==='conflicting-context'){webRequest.onSendHeaders.emit(request('conflict',newId,'fixture-other-context'));await settle();}
   release();await settle();
  }
  if(fault==='deadline')clock+=6000;
  if(fault==='final-document')actual.documentId='replacement-document';
  if(fault==='final-route')actual.url=origin+'/c/'+oldId;
  if(fault==='stopped-owner')owner.stop();
  webRequest.onCompleted.emit({...next,statusCode:fault==='failed-response'?503:200,fromCache:fault==='cached-response'});await settle();
  const current=await owner.verify(frame());
  result={priorReceipt,order,lookup,fault,newSelectionVerified:current?.conversationId===newId&&current?.contextId==='fixture-team',oldReceiptStillCurrent:oldReceipt!==null&&owner.isCurrent({...frame(),actualURL:origin+'/c/'+oldId},oldReceipt),signals:[...signals],bodyAssociations,classification:current?'NEW_NATIVE_RECEIPT':'NO_RECEIPT_FAIL_CLOSED'};
 }finally{owner.stop();release?.();await settle();}
 result.listenersReleased=Object.values(webRequest).every(value=>value.size()===0);
 return result;
}
export async function runPeerHistoryOrderMatrix(){
 const rows=[];
 for(const priorReceipt of [false,true])for(const schedule of [{order:'history-first',lookup:'current'},{order:'send-first',lookup:'current'},{order:'send-first',lookup:'old'}])rows.push(await probePeerHistoryOrder({priorReceipt,...schedule}));
 const source=await readFile(new URL('../../src/runtime/browser-request-context.mjs',import.meta.url));
 return {kind:'L_SYNTHETIC_PEER_HISTORY_ORDER_DIAGNOSTIC',acceptance:'NOT_ESTABLISHED',ciCause:'NOT_ESTABLISHED',ownerSourceSha256:createHash('sha256').update(source).digest('hex'),scope:'Original owner; explicit browser event/frame/body doubles; no browser, profile, network or owner modifications',rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await runPeerHistoryOrderMatrix(),null,2));
