// TEST ONLY. This source is bundled only into the disposable loopback journey.
// No production profile registers these fictional server result semantics.
import {createHostBindingService} from '../../../src/runtime/host-binding-service.mjs';
import {digest} from '../../../src/data/hash.mjs';
export const LIFECYCLE_TARGET='33333333-3333-4333-8333-333333333333';
export const lifecycleFingerprint=id=>digest(['loopback-lifecycle-result-v1',id]);
const operations=new Set(['cancel','http-only','wrong-target','delete','restore']);
const principal='user-host-fixture',contextId='account-host-team';
const expectedScope=JSON.stringify(['chatgpt','principal_'+digest(['chatgpt-principal-v1',principal]),'context_'+digest(['chatgpt-context-v1',principal,contextId])]);
export function lifecycleChange(result,context){
 if(!result||Object.keys(result).sort().join(',')!=='contextId,coversDeleteResultId,kind,operationId,principalId,resultId,state,targetId,version'||
    result.principalId!==principal||result.contextId!==contextId||context.scopeKey!==expectedScope||result.kind!=='refs'||result.targetId!==LIFECYCLE_TARGET||
    context.target.id!==result.targetId||context.target.kind!==result.kind||result.operationId!==context.target.operationId||
    !Number.isSafeInteger(result.version)||result.version<1||typeof result.resultId!=='string'||!/^result_[a-f0-9]{32}$/.test(result.resultId))return null;
 const state=result.state==='deleted'?'deletion-confirmed':result.state==='restored'?'existence-confirmed':null;
 if(!state||state!==context.target.state)return null;
 if(state==='deletion-confirmed'&&result.coversDeleteResultId!==null)return null;
 if(state==='existence-confirmed'&&(typeof result.coversDeleteResultId!=='string'||lifecycleFingerprint(result.coversDeleteResultId)!==context.fenceId))return null;
 return {kind:'refs',id:result.targetId,state,expectedVersion:context.expectedVersion,fenceId:context.fenceId,fenceVersion:context.fenceVersion,
  resultFingerprint:lifecycleFingerprint(result.resultId),profileId:context.profileId,profileVersion:context.profileVersion};
}
export function createLoopbackLifecycleService(options){
 const origin=options.identityOrigin,u=new URL(origin);
 if(u.origin!==origin||u.hostname!=='127.0.0.1'||u.protocol!=='http:')throw Error('lifecycle-fixture-only');
 const documents=new Map(),pending=new Map(),seen=new Set(),proofs=new WeakMap(),rows=[];
 const instanceId=crypto.randomUUID(); // Test-only realm identity, never authority.
 let service,live=true,activeRead=null,dropped=0;
 const record=row=>{if(rows.length<32)rows.push(row);else dropped++;};
 const frameOf=sender=>({tabId:sender.tab.id,frameId:0,documentId:sender.documentId,parentDocumentId:null,actualURL:sender.url,documentLifecycle:'active',incognito:false});
 const current=entry=>live&&performance.now()-entry.startedAt<6000&&documents.get(entry.sender.documentId)===entry.document&&service.handshake.isBound(entry.binding,entry.sender)&&
  service.authority.peek(entry.frame).grant===entry.grant&&service.authority.scopeFor(entry.frame)?.key===entry.scopeKey&&service.authority.sourceFor(entry.frame)===entry.source;
 const provider=Object.freeze({
  async read(context,{guard,signal}){
   const entry=activeRead;if(!entry||!current(entry)||!guard()||context.target.operationId!==entry.operationId)throw Error('stale-fixture-result');
   const response=await fetch(origin+'/native/lifecycle/result/'+entry.operationId,{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.floor(6000-(performance.now()-entry.startedAt))))])});
   if(!current(entry)||!guard()||response.status!==200||!response.headers.get('content-type')?.startsWith('application/json'))throw Error('invalid-fixture-result');
   const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
   try{for(;;){const part=await reader.read();if(!current(entry)||!guard())throw Error('stale-fixture-result');if(part.done)break;size+=part.value.byteLength;if(size>4096)throw Error('fixture-result-limit');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const result=JSON.parse(text),change=lifecycleChange(result,context),receipt=Object.freeze({parsed:true});
   if(change&&current(entry)&&guard())proofs.set(receipt,Object.freeze({context,change}));
   return receipt;
  },lifecycleFor:receipt=>proofs.get(receipt)??null,
 });
 const profiles=new Map([...options.surfaceProfiles].map(([id,p])=>[id,{...p,lifecycleProvider:provider}]));
 service=createHostBindingService({...options,surfaceProfiles:profiles});
 const handle=async(message,sender)=>{
  const result=await service.handle(message,sender);
  if(live&&result?.type==='HOST_BOUND'&&result.ok===true&&sender.frameId===0&&sender.documentLifecycle==='active'){
   const profile=[...profiles.values()][0],binding={...result.binding,profileId:profile.id,profileVersion:profile.revision};
   // Store only the actual browser sender and the original accepted reply.
   // Renewal preserves document object identity for an in-flight operation.
   const prior=documents.get(sender.documentId),same=prior&&prior.binding.producerToken===binding.producerToken;
   if(same)prior.binding=binding;else{if(documents.size>=8)documents.clear();documents.set(sender.documentId,{binding,sender:structuredClone(sender)});}
  }
  return result;
 };
 const relevant=d=>d.method==='POST'&&d.frameId===0&&Number.isSafeInteger(d.tabId)&&d.tabId>=0&&d.initiator===origin&&d.documentLifecycle==='active'&&
  d.url.startsWith(origin+'/native/lifecycle/action/')&&operations.has(d.url.slice((origin+'/native/lifecycle/action/').length));
 const started=d=>{
  if(!live||!relevant(d)||seen.has(d.requestId)||pending.size>=8)return;
  const document=documents.get(d.documentId);if(!document||document.sender.tab.id!==d.tabId)return;
  const sender=document.sender,binding=structuredClone(document.binding),frame=frameOf(sender),resolution=service.authority.peek(frame),scope=service.authority.scopeFor(frame);
  if(resolution.state!=='verified'||!scope)return;
  const entry={document,sender,binding,frame,grant:resolution.grant,scopeKey:scope.key,source:service.authority.sourceFor(frame),url:d.url,documentId:d.documentId,
   operationId:d.url.slice((origin+'/native/lifecycle/action/').length),startedAt:performance.now()};
  if(current(entry)){pending.set(d.requestId,entry);seen.add(d.requestId);if(seen.size>32)live=false;}
 };
 const completed=async d=>{
  const entry=pending.get(d.requestId);pending.delete(d.requestId);if(!entry)return;
  if(!relevant(d)||d.statusCode!==200||d.fromCache===true||d.url!==entry.url||d.documentId!==entry.documentId||d.tabId!==entry.sender.tab.id||!current(entry)||activeRead){record({operationId:entry.operationId,ok:false,reason:'retired-before-result'});return;}
  activeRead=entry;
  try{const result=await service.observations.observeLifecycle(entry.binding,entry.sender,service.nativeRepository,
   {id:LIFECYCLE_TARGET,kind:'refs',operationId:entry.operationId,state:entry.operationId==='restore'?'existence-confirmed':'deletion-confirmed'});
   record({...result,consumerOperationId:result.operationId??null,operationId:entry.operationId,elapsedMs:performance.now()-entry.startedAt});
  }catch{record({operationId:entry.operationId,ok:false,reason:'fixture-consumer-failed'});}
  finally{activeRead=null;}
 };
 const retired=d=>pending.delete(d.requestId),filter={urls:[origin+'/native/lifecycle/action/*']};
 const clearDocument=({tabId,documentId})=>{for(const [id,entry]of documents)if(entry.sender.tab.id===tabId&&(!documentId||id===documentId))documents.delete(id);for(const [id,entry]of pending)if(entry.sender.tab.id===tabId&&(!documentId||entry.sender.documentId===documentId))pending.delete(id);};
 chrome.webRequest.onBeforeRequest.addListener(started,filter);
 chrome.webRequest.onCompleted.addListener(completed,filter);
 chrome.webRequest.onErrorOccurred.addListener(retired,filter);
 chrome.webRequest.onBeforeRedirect.addListener(retired,filter);
 const snapshot=()=>({instanceId,rows:structuredClone(rows),dropped,pending:pending.size,active:!!activeRead,ownerIdle:service.observations.isIdle(),documents:documents.size});
 // Read-only diagnostics in the isolated test worker. No callable admission API.
 Object.defineProperty(globalThis,'__lifecycleFixtureSnapshot',{value:snapshot});
 return Object.freeze({...service,handle,invalidate(details){clearDocument(details);return service.invalidate(details);},tabClosed(tabId){clearDocument({tabId});return service.tabClosed(tabId);},stop(){live=false;pending.clear();documents.clear();for(const [event,fn]of [[chrome.webRequest.onBeforeRequest,started],[chrome.webRequest.onCompleted,completed],[chrome.webRequest.onErrorOccurred,retired],[chrome.webRequest.onBeforeRedirect,retired]])event.removeListener(fn);service.stop();}});
}
