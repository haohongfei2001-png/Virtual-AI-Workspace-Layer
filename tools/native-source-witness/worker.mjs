import {createBrowserRequestContext,BROWSER_CONTEXT_DIAGNOSTICS} from '../../src/runtime/browser-request-context.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {BATCH,emptyReport,runWitness} from './runner.mjs';

export const PASSIVE_BATCH='vaiwl-local-context-observation-20261022-v1';
// Loaded only by the explicit development overlay, never the normal product build.
// The shipped entry is passive. The original mode remains only for its existing
// offline tests; neither the page nor a runtime message can select that mode.
export function installWitnessWorker(chrome,{passiveOnly=true}={}){
 const page=chrome.runtime.getURL('source-witness.html'),policy=createURLPolicy({origin:'https://chatgpt.com'});
 const batch=passiveOnly?PASSIVE_BATCH:BATCH;
 let operation=null,locked=false,reserving=false;
 const allowed=sender=>sender?.id===chrome.runtime.id&&typeof sender.url==='string'&&sender.url.split('#')[0]===page;
 const passiveFields={mode:'PASSIVE_C2_ONLY',transport:'browser-passive-metadata-and-isolated-dom',requests:0,requestCountKnown:true,requestUpperBound:0,decodedBytes:0,previousBatchPreserved:true};
 const interrupted=()=>({...emptyReport('interrupted-no-retry'),schema:batch,state:'BLOCKED',unspent:false,requestCountKnown:passiveOnly,requests:passiveOnly?0:null,requestUpperBound:passiveOnly?0:12,decodedBytes:passiveOnly?0:null,elapsedMs:null,...(passiveOnly?passiveFields:{}),stages:{...Object.fromEntries(['identity','currentSpace','ordinary','archived','projects','members','finalIdentity'].map(k=>[k,{state:passiveOnly?'NOT_RUN':'PARTIAL',reason:passiveOnly?'passive-batch-no-active-reads':'execution-outcome-unknown'}])),...(passiveOnly?{nativeAssociation:{state:'PARTIAL',reason:'execution-outcome-unknown'}}:{})}});
 const unbound=(reason,elapsedMs=0)=>{const result=emptyReport(reason);result.state='BLOCKED';result.unspent=false;result.elapsedMs=elapsedMs;result.stages[passiveOnly?'nativeAssociation':'currentSpace']={state:'BLOCKED',reason};return result;};
 const get=async()=> (await chrome.storage.local.get(batch))[batch]??null;
 const save=value=>chrome.storage.local.set({[batch]:value});
 const target=async id=>{const tab=await chrome.tabs.get(id);if(tab.incognito!==false||!['home','conversation','project'].includes(policy.parse(tab.url).kind))throw Error('invalid-target');return tab;};
 const frameFor=async id=>{const [f,t]=await Promise.all([chrome.webNavigation.getFrame({tabId:id,frameId:0}),target(id)]);return {tabId:id,frameId:0,documentId:f.documentId,actualURL:f.url,documentLifecycle:f.documentLifecycle,incognito:t.incognito};};
 async function read(){const stored=await get();if(!stored)return {state:'NOT_RUN',reason:'not-started',unspent:true};if(operation)return {state:operation.phase,reason:operation.phase==='WAITING_NATIVE'?'open-one-existing-chat-in-selected-tab':'bounded-check-running',unspent:false};if(reserving&&stored.state==='reserved')return {state:'PREPARING',reason:'reservation-being-installed',unspent:false};return stored.result??interrupted();}
 async function arm(id){
  if(locked)return {state:'BLOCKED',reason:'busy-no-retry'};locked=true;
  try{
   if(await get())return await read();
   if(passiveOnly){
    const previousRecord=(await chrome.storage.local.get(BATCH))[BATCH],previous=previousRecord?.result;
    if(previousRecord?.state!=='finished'||previous?.schema!==BATCH||previous.state!=='BLOCKED'||previous.reason!=='no-native-context-observed'||previous.requests!==0)return {state:'NOT_RUN',reason:'previous-consumed-context-result-required',requests:0,unspent:true};
   }
   const selected=await withRequestDeadline(()=>target(id),{timeoutMs:3000});
   if(passiveOnly&&policy.parse(selected.url).kind!=='home')return {state:'NOT_RUN',reason:'select-chatgpt-home-no-request',requests:0,unspent:true};
   const ready=await withRequestDeadline(()=>chrome.tabs.sendMessage(id,{type:'SOURCE_WITNESS_READY'},{frameId:0}),{timeoutMs:3000}).catch(()=>null);
   if(ready?.ready!==true)return {state:'NOT_RUN',reason:'new-chatgpt-tab-required-no-request',requests:0,unspent:true,help:'安装后新开 ChatGPT 首页，再从该标签的 VAIWL 入口打开验证页；无需刷新或重登。'};
   // Reserve durably before listeners/network. Worker loss never restarts this batch.
   reserving=true;await save({state:'reserved',result:null});
   const op={tabId:id,phase:'WAITING_NATIVE',abort:new AbortController(),observer:null,events:0,started:false,closed:false,navigation:null,navigations:0,listeners:[],timer:null,preparedAt:performance.now(),preparationMs:null,counts:Object.fromEntries(BROWSER_CONTEXT_DIAGNOSTICS.map(k=>[k,0])),countsCapped:false};operation=op;reserving=false;
   const record=code=>{if(op.closed||!Object.hasOwn(op.counts,code))return;if(op.counts[code]<1000)op.counts[code]++;else op.countsCapped=true;};
   const finish=async result=>{
    if(op.closed)return;
    // Freeze diagnostics before stopping the observer; no late callback can
    // modify the saved result. These counters are not evidence or receipts.
    result={...result,schema:batch,unspent:false,...(passiveOnly?passiveFields:{}),nativeObservation:{schema:'bounded-c2-observation-v1',scope:'selected-tab-plural-detail-filter-only',events:Math.min(op.events,1000),countsCapped:op.countsCapped||op.events>1000,navigations:op.navigations,preparationMs:op.preparationMs??Math.max(0,Math.round(performance.now()-op.preparedAt)),counts:{...op.counts},unmatchedTraffic:'NOT_OBSERVED',memoryCache:'NOT_DETERMINABLE'}};
    op.closed=true;op.abort.abort();clearTimeout(op.timer);op.observer?.stop();for(const [event,fn]of op.listeners)event.removeListener(fn);try{await save({state:'finished',result});}finally{if(operation===op)operation=null;}
   };
   const stop=reason=>{if(op.started){op.abort.abort();return;}void finish(unbound(reason));};
   const preparing=()=>{if(op.closed)return false;if(!op.started&&performance.now()-op.preparedAt>=120000){stop('no-native-context-observed');return false;}return true;};
   const webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>{
    const map=new Map(),event=chrome.webRequest[name];
    return [name,{addListener(fn,filter,extra){const wrapper=details=>{
     if(details.tabId!==id||!preparing())return;
     if(++op.events>1000){stop('native-event-limit');return;}
     if(details.frameId===0&&details.initiator==='https://chatgpt.com'&&details.method==='GET'&&details.type==='xmlhttprequest'&&
       (name==='onErrorOccurred'||name==='onBeforeRedirect'||name==='onCompleted'&&details.statusCode!==200)){
      record(name==='onErrorOccurred'?'native-request-failed':name==='onBeforeRedirect'?'native-request-redirected':'completion-http-rejected');stop('native-request-refused-or-failed');return;
     }
     fn(details);
    };map.set(fn,wrapper);extra?event.addListener(wrapper,filter,extra):event.addListener(wrapper,filter);},removeListener(fn){const wrapper=map.get(fn);if(wrapper)event.removeListener(wrapper);map.delete(fn);}}];
   }));
   const run=async()=>{
    if(op.started||!preparing())return;op.preparationMs=Math.max(0,Math.round(performance.now()-op.preparedAt));op.started=true;op.phase='RUNNING';clearTimeout(op.timer);
    let enteredRunner=false,preflightReason='frame-unavailable-no-request';const startedAt=performance.now();
    try{
     const {frame,receipt}=await withRequestDeadline(async()=>{const frame=await frameFor(id);if(op.closed||op.abort.signal.aborted)throw Error('preparation-retired');preflightReason='current-body-association-unproven-no-request';const receipt=await op.observer.verify(frame,{signal:op.abort.signal});if(!receipt||op.closed||op.abort.signal.aborted)throw Error('binding-unavailable');return {frame,receipt};},{timeoutMs:6000});
     if(passiveOnly){
      if(op.closed||op.abort.signal.aborted||!op.observer.isCurrent(frame,receipt))throw Error('binding-unavailable');
      const result=emptyReport('native-association-observed-identity-not-run');result.state='PARTIAL';result.elapsedMs=Math.round(performance.now()-startedAt);
      result.stages.nativeAssociation={state:'PASS',reason:'fresh-request-and-current-dom-associated-only'};
      result.stages.currentSpace={state:'NOT_RUN',reason:'authenticated-roster-not-requested'};
      await finish(result);return;
     }
     enteredRunner=true;const result=await runWitness({frame,startedAt,contextObserver:op.observer,getFrame:()=>frameFor(id),signal:op.abort.signal});
     await finish(result);
    }catch{await finish(enteredRunner?interrupted():unbound(preflightReason,Math.round(performance.now()-startedAt)));}
   };
   op.observer=createBrowserRequestContext({webRequest,getTab:n=>chrome.tabs.get(n),getFrame:q=>chrome.webNavigation.getFrame(q),origin:'https://chatgpt.com',conversationRequestContext:'conversation-detail-plural-v1',maxDocuments:2,maxRequests:8,
    associatePage:({tabId,documentId,...query})=>chrome.tabs.sendMessage(tabId,{type:'HOST_CONTEXT_ASSOCIATE',...query},{documentId}),
    onReady:()=>{void run();},onInvalidate:()=>{if(op.started)op.abort.abort();},onDiagnostic:record});
   const listen=(event,fn)=>{event.addListener(fn);op.listeners.push([event,fn]);};
   const navigate=(d,replacement)=>{
    if(d.tabId!==id||d.frameId!==0||!preparing())return;
    if(op.navigations<1000)op.navigations++;else op.countsCapped=true;
    const next={documentId:d.documentId,url:d.url};
    if(op.started){op.abort.abort();return;}
    if(policy.parse(d.url).kind!=='conversation'||op.navigation&&(op.navigation.documentId!==next.documentId||op.navigation.url!==next.url)){stop('single-navigation-boundary');return;}
    op.navigation=next;
    if(replacement)op.observer.invalidateCommitted(d);else op.observer.invalidateHistory(d);
   };
   listen(chrome.webNavigation.onCommitted,d=>navigate(d,true));
   listen(chrome.webNavigation.onHistoryStateUpdated,d=>navigate(d,false));
   listen(chrome.tabs.onRemoved,tabId=>{if(tabId===id)stop('target-closed');});
   op.timer=setTimeout(()=>stop('no-native-context-observed'),120000);
   return {state:'WAITING_NATIVE',reason:'open-one-existing-chat-in-selected-tab',unspent:false};
  }catch{if(operation){operation.abort.abort();operation.observer?.stop();for(const [e,f]of operation.listeners)e.removeListener(f);clearTimeout(operation.timer);operation=null;}return {state:'BLOCKED',reason:'preparation-failed-read-existing-result'};}finally{locked=false;reserving=false;}
 }
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(!allowed(sender)||!m||Object.getPrototypeOf(m)!==Object.prototype)return;
  let task;
  if(m.type==='SOURCE_WITNESS_READ'&&Object.keys(m).length===1)task=read();
  else if(passiveOnly&&m.type==='SOURCE_WITNESS_PREVIOUS'&&Object.keys(m).length===1)task=chrome.storage.local.get(BATCH).then(value=>value[BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'});
  else if(m.type==='SOURCE_WITNESS_PREVIEW'&&Object.keys(m).length===2&&Number.isSafeInteger(m.tabId))task=target(m.tabId).then(t=>({state:'READY',origin:'https://chatgpt.com',route:policy.parse(t.url).kind,incognito:false,version:chrome.runtime.getManifest().version,profile:'current-Chrome-profile-user-confirmation-required',...(passiveOnly?{mode:'PASSIVE_C2_ONLY',batch:PASSIVE_BATCH}:{})}));
  // The explicit batch is incompatible with the old two-key active ARM. A new
  // page served from disk must never arm a still-running old worker.
  else if(m.type==='SOURCE_WITNESS_ARM'&&Number.isSafeInteger(m.tabId)&&(passiveOnly?Object.keys(m).length===3&&m.batch===PASSIVE_BATCH:Object.keys(m).length===2))task=arm(m.tabId);
  else return;
  Promise.resolve(task).then(reply,()=>reply({state:'BLOCKED',reason:'local-state-unavailable-no-retry'}));return true;
 });
}
if(typeof chrome!=='undefined')installWitnessWorker(chrome);
