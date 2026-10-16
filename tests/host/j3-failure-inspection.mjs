import {collectJ3FailureClosures} from './j3-failure-closures.mjs';
const bounded=async(task,ms)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('inspection-timeout')),ms);})]);}finally{clearTimeout(timer);}};
const acquire=async(factory,ms)=>{const task=Promise.resolve().then(factory);try{return await bounded(task,ms);}catch(error){void task.then(session=>bounded(session.detach(),ms)).catch(()=>{});throw error;}};
/** Called only after the original journey has failed. No target/world creation. */
export async function inspectJ3Failure({context,page,browser,extensionId,timeoutMs=1500}={}){
 const report={kind:'POST_FAILURE_FORMAL_PACKAGE_INSPECTION'};
 if(typeof extensionId!=='string'||!/^[a-p]{32}$/.test(extensionId)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>3000)return {...report,error:'invalid-inspection-options'};
 const origin='chrome-extension://'+extensionId;let pageSession,workerSession,pageDelegated=false,workerDelegated=false;
 const contexts=[];const created=({context:value})=>{if(contexts.length<64)contexts.push(value);};
 try{
  pageSession=await acquire(()=>context.newCDPSession(page),timeoutMs);pageSession.on('Runtime.executionContextCreated',created);
  await bounded(pageSession.send('Runtime.enable'),timeoutMs);
  const selected=contexts.filter(c=>c.auxData?.isDefault===false&&(c.origin===origin||c.name===origin));
  report.isolatedContextCount=selected.length;
  const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;
  report.matchingContexts=selected.map(c=>({id:Number.isSafeInteger(c.id)?c.id:null,name:typeof c.name==='string'?c.name.slice(0,160):null,origin:typeof c.origin==='string'?c.origin.slice(0,160):null,frameId:token(c.auxData?.frameId),type:['isolated','default','worker'].includes(c.auxData?.type)?c.auxData.type:null}));
  try{const tree=await bounded(pageSession.send('Page.getFrameTree'),timeoutMs);report.topFrameId=token(tree.frameTree?.frame?.id);}catch{report.topFrameId=null;}
  report.topFrameMatchingContextCount=report.topFrameId===null?null:report.matchingContexts.filter(c=>c.frameId===report.topFrameId).length;
  pageSession.off('Runtime.executionContextCreated',created);
  if(selected.length!==1){
   report.page={error:'isolated-context-unavailable'};
   // Diagnostic snapshots only: no selection, merging, or current-owner claim.
   if(selected.length>=2&&selected.length<=4){
    report.pageContexts=[];
    for(const value of report.matchingContexts){
     const row={contextId:value.id,frameId:value.frameId};report.pageContexts.push(row);
     if(value.id===null){row.inspection={error:'invalid-existing-context'};continue;}
     let isolated,closed=false;
     const detach=async()=>{if(closed)return;closed=true;if(isolated)try{await bounded(isolated.detach(),timeoutMs);}catch{}};
     try{
      isolated=await acquire(()=>context.newCDPSession(page),timeoutMs);
      const session={send:(method,params)=>closed?Promise.reject(Error('inspection-closed')):isolated.send(method,params),detach};
      row.inspection=await bounded(collectJ3FailureClosures(session,{executionContextId:value.id,timeoutMs}),Math.min(6000,timeoutMs*4));
     }catch{row.inspection={error:'context-inspection-unavailable'};}
     finally{await detach();}
    }
   }
  }
  else{pageDelegated=true;report.page=await collectJ3FailureClosures(pageSession,{executionContextId:selected[0].id,timeoutMs});}
 }catch{report.page={error:'page-inspection-unavailable'};}
 finally{if(pageSession&&!pageDelegated){pageSession.off('Runtime.executionContextCreated',created);try{await bounded(pageSession.detach(),timeoutMs);}catch{}}}
 try{
  workerSession=await acquire(()=>browser.newBrowserCDPSession(),timeoutMs);
  const targets=await bounded(workerSession.send('Target.getTargets'),timeoutMs);
  const matching=targets.targetInfos.filter(t=>t.type==='service_worker'&&t.url===origin+'/extension/worker.mjs');report.workerTargetCount=matching.length;
  if(matching.length!==1)report.worker={error:'worker-target-unavailable'};
  else{
   const attached=await bounded(workerSession.send('Target.attachToTarget',{targetId:matching[0].targetId,flatten:false}),timeoutMs);
   const nested=createNestedInspectionSession(workerSession,attached.sessionId,{timeoutMs});workerDelegated=true;
   report.worker=await collectJ3FailureClosures(nested,{timeoutMs});
  }
 }catch{report.worker={error:'worker-inspection-unavailable'};}
 finally{if(workerSession&&!workerDelegated)try{await bounded(workerSession.detach(),timeoutMs);}catch{}}
 return report;
}
/** Narrow nested CDP transport; no fallback to other targets or browser access. */
export function createNestedInspectionSession(parent,sessionId,{timeoutMs=1500}={}){
 if(typeof sessionId!=='string'||!sessionId)throw Error('missing-nested-session');let next=0,closed=false;const pending=new Map();
 const receive=event=>{if(event.sessionId!==sessionId||typeof event.message!=='string'||event.message.length>1000000)return;let value;try{value=JSON.parse(event.message);}catch{return;}const entry=pending.get(value.id);if(!entry)return;pending.delete(value.id);clearTimeout(entry.timer);value.error?entry.reject(Error('nested-inspection-unavailable')):entry.resolve(value.result);};
 parent.on('Target.receivedMessageFromTarget',receive);
 return {send(method,params={}){
  if(closed||!['Runtime.enable','Runtime.evaluate','Runtime.queryObjects','Runtime.callFunctionOn','Runtime.getProperties','Runtime.releaseObjectGroup'].includes(method))return Promise.reject(Error('nested-inspection-method-unavailable'));
  const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('nested-inspection-timeout'));},timeoutMs);pending.set(id,{resolve,reject,timer});Promise.resolve().then(()=>parent.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})})).catch(()=>{const item=pending.get(id);if(!item)return;pending.delete(id);clearTimeout(item.timer);reject(Error('nested-inspection-unavailable'));});});
 },async detach(){if(closed)return;closed=true;parent.off('Target.receivedMessageFromTarget',receive);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('nested-inspection-closed'));}pending.clear();try{await bounded(parent.send('Target.detachFromTarget',{sessionId}),timeoutMs);}catch{}try{await bounded(parent.detach(),timeoutMs);}catch{}}};
}
