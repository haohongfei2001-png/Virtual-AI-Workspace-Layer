import {createBrowserRequestContext,BROWSER_CONTEXT_DIAGNOSTICS} from '../../src/runtime/browser-request-context.mjs';
import {withRequestDeadline} from '../../src/data/request-deadline.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {BATCH,emptyReport,runWitness} from './runner.mjs';

export const PREVIOUS_PASSIVE_BATCH='vaiwl-local-context-observation-20261022-v1';
export const PREVIOUS_PASSIVE_V2_BATCH='vaiwl-local-context-observation-20261022-v2';
export const PREVIOUS_PASSIVE_V3_BATCH='vaiwl-local-context-observation-20261022-v3';
export const PASSIVE_BATCH='vaiwl-local-context-observation-20261022-v4';
export const SOURCE_BATCH='vaiwl-local-source-witness-20261022-v2';
export const SOURCE_MODE='BOUNDED_SOURCE_WITNESS';
const navigationKinds=new Set(['home','projects-index','shared-view','temporary','conversation','project-candidate','project','unsupported']);
const navigationPolicyReasons=new Set(['invalid-native-url','invalid-native-scheme','foreign-native-origin','native-port-not-allowed','ambiguous-native-encoding','invalid-native-encoding','ambiguous-native-path','unsupported-native-fragment','unsupported-native-query','conflicting-conversation-grammar','unknown-conversation-grammar','conflicting-project-grammar','invalid-project-grammar-result','unsupported-native-route']);
// Loaded only by the explicit development overlay, never the normal product build.
// Mode is selected only by this package's composition, never by an RPC/page.
// Legacy active and passive modes remain for their existing offline regressions.
export function installWitnessWorker(chrome,{passiveOnly=true,sourceWitness=false}={}){
 if(sourceWitness&&passiveOnly)throw Error('conflicting-witness-modes');
 const page=chrome.runtime.getURL('source-witness.html'),policy=createURLPolicy({origin:'https://chatgpt.com'});
 const batch=sourceWitness?SOURCE_BATCH:passiveOnly?PASSIVE_BATCH:BATCH,boundMode=passiveOnly||sourceWitness;
 let operation=null,locked=false,reserving=false;
 const allowed=sender=>sender?.id===chrome.runtime.id&&typeof sender.url==='string'&&sender.url.split('#')[0]===page;
 const passiveFields={mode:'PASSIVE_C2_ONLY',transport:'browser-passive-metadata-and-isolated-dom',requests:0,requestCountKnown:true,requestUpperBound:0,decodedBytes:0,previousBatchPreserved:true};
 const interrupted=()=>({...emptyReport('interrupted-no-retry'),schema:batch,state:'BLOCKED',unspent:false,requestCountKnown:passiveOnly,requests:passiveOnly?0:null,requestUpperBound:passiveOnly?0:12,decodedBytes:passiveOnly?0:null,elapsedMs:null,...(passiveOnly?passiveFields:sourceWitness?{mode:SOURCE_MODE,previousBatchPreserved:true}:{}),stages:{...Object.fromEntries(['identity','currentSpace','ordinary','archived','projects','members','finalIdentity'].map(k=>[k,{state:passiveOnly?'NOT_RUN':'PARTIAL',reason:passiveOnly?'passive-batch-no-active-reads':'execution-outcome-unknown'}])),...(boundMode?{nativeAssociation:{state:'PARTIAL',reason:'execution-outcome-unknown'}}:{})}});
 const unbound=(reason,elapsedMs=0)=>{const result=emptyReport(reason);result.state='BLOCKED';result.unspent=false;result.elapsedMs=elapsedMs;result.stages[boundMode?'nativeAssociation':'currentSpace']={state:'BLOCKED',reason};return result;};
 const get=async()=> (await chrome.storage.local.get(batch))[batch]??null;
 const save=value=>chrome.storage.local.set({[batch]:value});
 const previousRecords=()=>chrome.storage.local.get([BATCH,PREVIOUS_PASSIVE_BATCH,PREVIOUS_PASSIVE_V2_BATCH,PREVIOUS_PASSIVE_V3_BATCH,...(sourceWitness?[PASSIVE_BATCH]:[])]);
 const notStarted=reason=>({state:'NOT_RUN',reason,requests:0,unspent:true});
 async function priorIssue(){
  const records=await previousRecords(),activeRecord=records[BATCH],active=activeRecord?.result;
  // 90a006ac/4f35c12b persisted finished timeout results before unspent was
  // added. Interpret that exact terminal format read-only; never repair a
  // missing/reserved record or contradict an explicit unspent value.
  if(activeRecord?.state!=='finished'||active?.schema!==BATCH||active.state!=='BLOCKED'||active.reason!=='no-native-context-observed'||active.requests!==0||(Object.hasOwn(active,'unspent')&&active.unspent!==false))return 'previous-consumed-context-result-required';
  const passiveRecord=records[PREVIOUS_PASSIVE_BATCH],passive=passiveRecord?.result;
  if(passiveRecord?.state!=='finished'||passive?.schema!==PREVIOUS_PASSIVE_BATCH||passive.state!=='BLOCKED'||passive.reason!=='no-native-context-observed'||passive.unspent!==false||passive.mode!=='PASSIVE_C2_ONLY'||passive.requests!==0||passive.nativeObservation?.events!==0||passive.nativeObservation?.navigations!==0)return 'previous-consumed-passive-result-required';
  const v2Record=records[PREVIOUS_PASSIVE_V2_BATCH],v2=v2Record?.result;
  // The new permission follows the reported finished v2, not its exact event
  // timing. Counters are diagnostics, never authorization or an identity proof.
  if(v2Record?.state!=='finished'||v2?.schema!==PREVIOUS_PASSIVE_V2_BATCH||v2.state!=='BLOCKED'||v2.reason!=='no-native-context-observed'||v2.unspent!==false||v2.mode!=='PASSIVE_C2_ONLY'||v2.requests!==0)return 'previous-consumed-v2-result-required';
  const v3Record=records[PREVIOUS_PASSIVE_V3_BATCH],v3=v3Record?.result;
  // The consumed v3 did not record navigationStop. Do not reconstruct it or
  // require exact counters to authorize this separately approved observation.
  if(v3Record?.state!=='finished'||v3?.schema!==PREVIOUS_PASSIVE_V3_BATCH||v3.state!=='BLOCKED'||v3.reason!=='single-navigation-boundary'||v3.unspent!==false||v3.mode!=='PASSIVE_C2_ONLY'||v3.requests!==0)return 'previous-consumed-v3-result-required';
  if(sourceWitness){
   const v4Record=records[PASSIVE_BATCH],v4=v4Record?.result;
   // A consumed PASS is history only. The new batch must acquire its own fresh
   // browser receipt and DOM association; it cannot deserialize the old proof.
   if(v4Record?.state!=='finished'||v4?.schema!==PASSIVE_BATCH||v4.state!=='PARTIAL'||v4.reason!=='native-association-observed-identity-not-run'||v4.unspent!==false||v4.mode!=='PASSIVE_C2_ONLY'||v4.requests!==0||v4.stages?.nativeAssociation?.state!=='PASS')return 'previous-consumed-v4-result-required';
  }
  return null;
 }
 const target=async id=>{const tab=await chrome.tabs.get(id);if(tab.incognito!==false||!['home','conversation','project'].includes(policy.parse(tab.url).kind))throw Error('invalid-target');return tab;};
 const frameFor=async id=>{const [f,t]=await Promise.all([chrome.webNavigation.getFrame({tabId:id,frameId:0}),target(id)]);return {tabId:id,frameId:0,documentId:f.documentId,actualURL:f.url,documentLifecycle:f.documentLifecycle,incognito:t.incognito};};
 async function read(){const stored=await get();if(!stored)return notStarted(boundMode?(await priorIssue())??'not-started':'not-started');if(operation)return {state:operation.phase,reason:operation.phase==='WAITING_NATIVE'?'open-one-existing-chat-in-selected-tab':'bounded-check-running',unspent:false};if(reserving&&stored.state==='reserved')return {state:'PREPARING',reason:'reservation-being-installed',unspent:false};return stored.result??interrupted();}
 async function returnToObservedTab(){
  // A reopened result page can carry another tab's hash. Only the live owner
  // knows the bound tab; never let a page select a different observation target.
  const op=operation,current=()=>op&&operation===op&&!op.closed&&op.phase==='WAITING_NATIVE'&&performance.now()-op.preparedAt<120000;
  const unavailable={state:'UNAVAILABLE',reason:'observation-not-waiting-no-navigation'};
  if(!current())return unavailable;
  try{
   const selected=await withRequestDeadline(()=>target(op.tabId),{timeoutMs:3000});
   // Activating a discarded tab can reload it. This control only selects a
   // still-loaded tab; it never repairs the document or generates a new load.
   if(!current()||selected.discarded===true)return unavailable;
   const tab=await chrome.tabs.update(op.tabId,{active:true});
   if(!current()||tab.id!==op.tabId||tab.windowId!==selected.windowId)return unavailable;
   await chrome.windows.update(selected.windowId,{focused:true});
   return current()?{state:'TARGET_SHOWN'}:unavailable;
  }catch{return {state:'UNAVAILABLE',reason:'bound-tab-unavailable-no-retry'};}
 }
 async function arm(id){
  if(locked)return {state:'BLOCKED',reason:'busy-no-retry'};locked=true;
  try{
   if(await get())return await read();
   if(boundMode){
    // Prior consumed results stay read-only; this permission has its own key.
    const issue=await priorIssue();if(issue)return notStarted(issue);
   }
   const selected=await withRequestDeadline(()=>target(id),{timeoutMs:3000});
   if(boundMode&&policy.parse(selected.url).kind!=='home')return {state:'NOT_RUN',reason:'select-chatgpt-home-no-request',requests:0,unspent:true};
   const ready=await withRequestDeadline(()=>chrome.tabs.sendMessage(id,{type:'SOURCE_WITNESS_READY'},{frameId:0}),{timeoutMs:3000}).catch(()=>null);
   if(ready?.ready!==true)return {state:'NOT_RUN',reason:'new-chatgpt-tab-required-no-request',requests:0,unspent:true,help:'安装后新开 ChatGPT 首页，再从该标签的 VAIWL 入口打开验证页；无需刷新或重登。'};
   // Reserve durably before listeners/network. Worker loss never restarts this batch.
   reserving=true;await save({state:'reserved',result:null});
   const op={tabId:id,phase:'WAITING_NATIVE',abort:new AbortController(),observer:null,events:0,started:false,closed:false,navigation:null,navigationStop:null,requestStop:null,navigations:0,listeners:[],timer:null,preparedAt:performance.now(),preparationMs:null,counts:Object.fromEntries(BROWSER_CONTEXT_DIAGNOSTICS.map(k=>[k,0])),countsCapped:false};operation=op;reserving=false;
   const record=code=>{if(op.closed||!Object.hasOwn(op.counts,code))return;if(op.counts[code]<1000)op.counts[code]++;else op.countsCapped=true;};
   const finish=async result=>{
    if(op.closed)return;
    // Freeze diagnostics before stopping the observer; no late callback can
    // modify the saved result. These counters are not evidence or receipts.
    result={...result,schema:batch,unspent:false,...(passiveOnly?passiveFields:sourceWitness?{mode:SOURCE_MODE,previousBatchPreserved:true,requestCountKnown:result.requestCountKnown??Number.isInteger(result.requests),requestUpperBound:Number.isInteger(result.requests)?result.requests:12}:{}),nativeObservation:{schema:'bounded-c2-observation-v1',scope:'selected-tab-plural-detail-filter-only',events:Math.min(op.events,1000),countsCapped:op.countsCapped||op.events>1000,navigations:op.navigations,preparationMs:op.preparationMs??Math.max(0,Math.round(performance.now()-op.preparedAt)),counts:{...op.counts},...(op.navigationStop?{navigationStop:{...op.navigationStop}}:{}),...(op.requestStop?{requestStop:{...op.requestStop}}:{}),unmatchedTraffic:'NOT_OBSERVED',memoryCache:'NOT_DETERMINABLE'}};
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
      // This outer safety stop precedes the owner's exact request/document
      // matching. Retain only bounded diagnostics, never imply the rejected
      // callback is the admitted request or that an HTTP code proves a challenge.
      op.requestStop??={eventKind:name==='onErrorOccurred'?'error':name==='onBeforeRedirect'?'redirect':'completion',statusCode:Number.isInteger(details.statusCode)&&details.statusCode>=100&&details.statusCode<=599?details.statusCode:null,fromCache:typeof details.fromCache==='boolean'?details.fromCache:'unknown',requestMatch:'NOT_VERIFIED',challenge:'NOT_OBSERVED'};
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
     if(op.closed||op.abort.signal.aborted||!op.observer.isCurrent(frame,receipt))throw Error('binding-unavailable');
     if(passiveOnly){
      const result=emptyReport('native-association-observed-identity-not-run');result.state='PARTIAL';result.elapsedMs=Math.round(performance.now()-startedAt);
      result.stages.nativeAssociation={state:'PASS',reason:'fresh-request-and-current-dom-associated-only'};
      result.stages.currentSpace={state:'NOT_RUN',reason:'authenticated-roster-not-requested'};
      await finish(result);return;
     }
     enteredRunner=true;const result=await runWitness({frame,startedAt,contextObserver:op.observer,getFrame:()=>frameFor(id),signal:op.abort.signal});
     if(sourceWitness)result.stages.nativeAssociation={state:'PASS',reason:'fresh-request-and-current-dom-associated-only'};
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
    const route=policy.parse(d.url);
    if(route.kind!=='conversation'||op.navigation&&(op.navigation.documentId!==next.documentId||op.navigation.url!==next.url)){
     // Retain only the first stop's fixed categories. Never persist the URL,
     // parser result (which contains IDs), document ID or navigation details.
     // This adds no permission and does not relax any navigation boundary.
     op.navigationStop={eventKind:replacement?'commit':'history',routeKind:navigationKinds.has(route.kind)?route.kind:'unknown',policyReason:route.kind==='unsupported'?(navigationPolicyReasons.has(route.reason)?route.reason:'other-policy-rejection'):null,hadTarget:op.navigation!==null,boundary:route.kind!=='conversation'?'non-conversation':op.navigation.documentId!==next.documentId?'different-document':'different-url'};
     stop('single-navigation-boundary');return;
    }
    op.navigation=next;
    if(replacement)op.observer.invalidateCommitted(d);else op.observer.invalidateHistory(d);
   };
   listen(chrome.webNavigation.onCommitted,d=>navigate(d,true));
   listen(chrome.webNavigation.onHistoryStateUpdated,d=>navigate(d,false));
   listen(chrome.tabs.onRemoved,tabId=>{if(tabId===id)stop('target-closed');});
   op.timer=setTimeout(()=>stop('no-native-context-observed'),120000);
   // UI-only acknowledgment to the call that installed these listeners. Never
   // store it or return it from READ / another page's subsequent ARM.
   return {state:'WAITING_NATIVE',reason:'open-one-existing-chat-in-selected-tab',unspent:false,...(boundMode?{startedHere:true}:{})};
  }catch{if(operation){operation.abort.abort();operation.observer?.stop();for(const [e,f]of operation.listeners)e.removeListener(f);clearTimeout(operation.timer);operation=null;}return {state:'BLOCKED',reason:'preparation-failed-read-existing-result'};}finally{locked=false;reserving=false;}
 }
 chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(!allowed(sender)||!m||Object.getPrototypeOf(m)!==Object.prototype)return;
  let task;
  if(m.type==='SOURCE_WITNESS_READ'&&(boundMode?Object.keys(m).length===2&&m.batch===batch:Object.keys(m).length===1))task=read();
  else if(boundMode&&m.type==='SOURCE_WITNESS_RETURN'&&Object.keys(m).length===2&&m.batch===batch)task=returnToObservedTab();
  else if(boundMode&&m.type==='SOURCE_WITNESS_PREVIOUS'&&Object.keys(m).length===1)task=previousRecords().then(value=>({active:value[BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'},passive:value[PREVIOUS_PASSIVE_BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'},passiveV2:value[PREVIOUS_PASSIVE_V2_BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'},passiveV3:value[PREVIOUS_PASSIVE_V3_BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'},...(sourceWitness?{passiveV4:value[PASSIVE_BATCH]?.result??{state:'NOT_RUN',reason:'previous-result-not-available'}}:{})}));
  else if(m.type==='SOURCE_WITNESS_PREVIEW'&&Object.keys(m).length===2&&Number.isSafeInteger(m.tabId))task=target(m.tabId).then(t=>({state:'READY',origin:'https://chatgpt.com',route:policy.parse(t.url).kind,incognito:false,version:chrome.runtime.getManifest().version,profile:'current-Chrome-profile-user-confirmation-required',...(boundMode?{mode:sourceWitness?SOURCE_MODE:'PASSIVE_C2_ONLY',batch}:{})}));
  // The explicit batch is incompatible with the old two-key active ARM. A new
  // page served from disk must never arm a still-running old worker.
  else if(m.type==='SOURCE_WITNESS_ARM'&&Number.isSafeInteger(m.tabId)&&(boundMode?Object.keys(m).length===3&&m.batch===batch:Object.keys(m).length===2))task=arm(m.tabId);
  else return;
  Promise.resolve(task).then(reply,()=>reply({state:'BLOCKED',reason:'local-state-unavailable-no-retry'}));return true;
 });
}
if(typeof chrome!=='undefined')installWitnessWorker(chrome,{passiveOnly:false,sourceWitness:true});
