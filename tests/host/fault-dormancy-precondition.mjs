/** Offline observer only. No preparation RPC, grant, freeze or close retry. */
export function createFaultDormancyRpcObserver(runtime,{limit=32,observeCurrent=false,conversationId=null,messageId=null,origin=null}={}){
 if(typeof runtime?.sendMessage!=='function'||!Number.isInteger(limit)||limit<2||limit>32)throw Error('fault-dormancy-observer-options');
 const original=runtime.sendMessage,events=[],bodyEvents=[];let sequence=0,dropped=0,bodySequence=0,bodyDropped=0,releasedBinding=null,wakeBinding=null;
 const record=event=>{if(events.length<limit)events.push(event);else dropped++;};
 const bodyRecord=event=>{if(bodyEvents.length<limit)bodyEvents.push(event);else bodyDropped++;};
 function observed(...args){
  const release=args[0]?.type==='HOST_UI_IDLE_RELEASE',id=release?++sequence:null;
  const current=observeCurrent&&args[0]?.protocol==='vaiwl-host-observation/2'&&args[0]?.kind==='current-observation',bodyId=current?++bodySequence:null,localSeq=current?args[0].localSeq:null;
  if(release){releasedBinding=['documentToken','producerToken','routeEpoch'].map(key=>args[0][key]);wakeBinding=null;record({sequence:id,direction:'request'});}
  const priorRelease=observeCurrent&&args[0]?.type==='HOST_HELLO'?releasedBinding:null;
  if(current){const body=args[0].payload?.body;bodyRecord({sequence:bodyId,direction:'request',eligible:!!wakeBinding&&['documentToken','producerToken','routeEpoch'].every((key,i)=>args[0][key]===wakeBinding[i])&&body?.association==='explicit-body-id'&&body.conversationId===conversationId&&Array.isArray(body.messageIds)&&body.messageIds.length===1&&body.messageIds[0]===messageId});}
  let result;try{result=Reflect.apply(original,this,args);}catch(error){if(release)record({sequence:id,direction:'throw'});if(current)bodyRecord({sequence:bodyId,direction:'throw'});throw error;}
  // Observe the original Promise; neither replace it nor wrap callback arguments.
  if(release&&result instanceof Promise)void result.then(value=>record({sequence:id,direction:'reply',ok:value?.ok===true}),()=>record({sequence:id,direction:'rejection'}));
  if(priorRelease&&result instanceof Promise)void result.then(value=>{const b=value?.binding;if(priorRelease===releasedBinding&&value?.ok===true&&b?.origin===origin&&typeof b.documentToken==='string'&&typeof b.producerToken==='string'&&b.producerToken!==priorRelease[1]&&Number.isSafeInteger(b.routeEpoch))wakeBinding=[b.documentToken,b.producerToken,b.routeEpoch];},()=>{});
  if(current&&result instanceof Promise)void result.then(value=>bodyRecord({sequence:bodyId,direction:'reply',matched:Number.isSafeInteger(localSeq)&&value?.localSeq===localSeq,state:['accepted','duplicate','rejected','retry-after'].includes(value?.state)?value.state:'invalid'}),()=>bodyRecord({sequence:bodyId,direction:'rejection'}));
  return result;
 }
 runtime.sendMessage=observed;
 return Object.freeze({snapshot:()=>({sequence,limit,dropped,current:runtime.sendMessage===observed,events:events.map(row=>({...row})),...(observeCurrent?{bodySequence,bodyDropped,bodyEvents:bodyEvents.map(row=>({...row}))}:{})}),restore(){if(runtime.sendMessage!==observed)throw Error('fault-dormancy-observer-replaced');runtime.sendMessage=original;}});
}

/** The v2 current-observation reply follows its awaited native-delta reader.
 * A calibration refusal is a different owner's reply and cannot end this work. */
export function faultCurrentObservationTerminal(snapshot,boundary){
 if(!snapshot||snapshot.current!==true||!Number.isSafeInteger(boundary)||boundary<0||!Number.isSafeInteger(snapshot.bodySequence)||snapshot.bodySequence<boundary||!Array.isArray(snapshot.bodyEvents))throw Error('fault-current-observer-lost');
 if(snapshot.bodyDropped!==0)throw Error('fault-current-observer-dropped');
 const rows=snapshot.bodyEvents.filter(row=>row.sequence>boundary),requests=rows.filter(row=>row.direction==='request');
 if(rows.some(row=>!Number.isSafeInteger(row.sequence)||row.sequence>snapshot.bodySequence)||new Set(requests.map(row=>row.sequence)).size!==requests.length)throw Error('fault-current-invalid-receipt');
 const terminals=[];
 for(const row of rows.filter(row=>row.direction!=='request')){
  if(!requests.some(request=>request.sequence===row.sequence)||rows.filter(other=>other.sequence===row.sequence&&other.direction!=='request').length!==1||row.direction!=='reply'||row.matched!==true||!['accepted','duplicate','rejected','retry-after'].includes(row.state))throw Error('fault-current-unmatched-reply');
  if(row.state!=='retry-after'&&requests.find(request=>request.sequence===row.sequence).eligible===true)terminals.push(row);
 }
 if(terminals.length>1)throw Error('fault-current-multiple-terminals');
 return terminals[0]?{kind:'CURRENT_OBSERVATION_TERMINAL',boundary,sequence:terminals[0].sequence,state:terminals[0].state}:null;
}

function releaseReceipt(snapshot,boundary){
 if(!snapshot||snapshot.current!==true||!Number.isSafeInteger(snapshot.sequence)||snapshot.sequence<boundary||!Array.isArray(snapshot.events))throw Error('fault-dormancy-observer-lost');
 if(snapshot.dropped!==0)throw Error('fault-dormancy-observer-dropped');
 const rows=snapshot.events.filter(row=>row.sequence>boundary),requests=rows.filter(row=>row.direction==='request');
 if(rows.some(row=>!Number.isSafeInteger(row.sequence)||row.sequence>snapshot.sequence))throw Error('fault-dormancy-invalid-receipt');
 if(requests.length>1)throw Error('fault-dormancy-multiple-releases');
 if(!requests.length){if(rows.length)throw Error('fault-dormancy-unmatched-reply');return null;}
 const request=requests[0],terminal=rows.filter(row=>row.direction!=='request');
 if(terminal.some(row=>row.sequence!==request.sequence)||terminal.length>1)throw Error('fault-dormancy-unmatched-reply');
 if(!terminal.length)return null;
 if(terminal[0].direction!=='reply'||terminal[0].ok!==true)throw Error('fault-dormancy-release-refused');
 return request.sequence;
}

/** One elapsed budget includes close, release and every actual frame's clear. */
export async function waitForSettledFaultDormancy({readSnapshot,readFrames,boundary,roles,startedAt,now=()=>performance.now(),timeoutMs=6000,onSample=()=>{}}){
 if(!Number.isSafeInteger(boundary)||boundary<0||!Array.isArray(roles)||!roles.includes('workspace')||new Set(roles).size!==roles.length||roles.some(role=>!['workspace','sidebar'].includes(role))||!Number.isFinite(startedAt)||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000)throw Error('fault-dormancy-precondition-options');
 let active=true,timer;
 const elapsed=()=>{const value=now()-startedAt;if(!active||!Number.isFinite(value)||value<0||value>=timeoutMs)throw Error('fault-dormancy-deadline');return value;};
 const remaining=timeoutMs-elapsed();
 try{return await Promise.race([new Promise((_,reject)=>{timer=setTimeout(()=>{active=false;reject(Error('fault-dormancy-deadline'));},remaining);}), (async()=>{
  while(true){
   elapsed();const snapshot=await readSnapshot();elapsed();const releaseSequence=releaseReceipt(snapshot,boundary);
   const frames=await readFrames();elapsed();
   if(!Array.isArray(frames)||frames.length!==roles.length||new Set(frames.map(row=>row.role)).size!==roles.length||frames.some(row=>!roles.includes(row.role)||row.present!==true||row.documentUnchanged!==true||row.mainCount!==1))throw Error('fault-dormancy-frame-changed');
   const cleared=frames.every(row=>row.empty===true&&row.lifecycle==='ui-idle');
   onSample({snapshot,frames,elapsedMs:elapsed(),releaseSequence});
   if(releaseSequence!==null&&cleared){
    // A drop or second release during frame reads cannot be hidden by an old sample.
    const final=await readSnapshot();elapsed();if(releaseReceipt(final,boundary)!==releaseSequence)throw Error('fault-dormancy-release-changed');
    return {status:'PASS_SETTLED_DORMANT_PRECONDITION',boundary,releaseSequence,roles:[...roles],frames,elapsedMs:elapsed(),snapshot:final};
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(20,timeoutMs-elapsed())));
  }
 })()]);}finally{active=false;clearTimeout(timer);}
}

const KEY='__vaiwlFaultDormancyObserver';
const bounded=async(work,ms=1500)=>{let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fault-dormancy-observation-timeout')),ms);})]);}finally{clearTimeout(timer);}};

/** Install only into the exact extension's already loaded top isolated world. */
export async function installFaultDormancyPrecondition({context,page,extensionId,observeCurrent=false,conversationId=null,messageId=null}){
 if(!/^[a-p]{32}$/.test(extensionId??''))throw Error('fault-dormancy-extension-id');
 const session=await context.newCDPSession(page),worlds=new Map();let world=null,worldChanged=false,installed=false,closed=false,closeTask=null,baseline=null,startedAt=null;
 const receipt={status:'NOT_RUN',scope:'SETTLED_DORMANT_WAKE_ONLY',oldAbortCause:'NOT_ESTABLISHED',deadlineMs:6000,observer:observeCurrent?'PASSIVE_ISOLATED_RELEASE_AND_CURRENT_REPLY':'PASSIVE_ISOLATED_IDLE_RELEASE_ONLY',observerRestored:false};
 const created=event=>worlds.set(event.context.id,event.context),destroyed=event=>{worlds.delete(event.executionContextId);if(event.executionContextId===world)worldChanged=true;},cleared=()=>{worlds.clear();if(world!==null)worldChanged=true;};
 session.on('Runtime.executionContextCreated',created);session.on('Runtime.executionContextDestroyed',destroyed);session.on('Runtime.executionContextsCleared',cleared);
 const checkWorld=()=>{if(worldChanged||closed||world===null||!worlds.has(world))throw Error('fault-dormancy-world-changed');};
 const evaluate=async(expression,contextId=world)=>{const result=await bounded(()=>session.send('Runtime.evaluate',{expression,contextId,returnByValue:true,awaitPromise:true}));if(result.exceptionDetails)throw Error('fault-dormancy-isolated-evaluation');return result.result?.value;};
 const snapshot=async()=>{checkWorld();const value=await evaluate(`globalThis.${KEY}?.snapshot()`);checkWorld();return value;};
 const mounted=()=>{
  const frames=page.frames().flatMap(frame=>['workspace','sidebar'].flatMap(role=>frame.url()===`chrome-extension://${extensionId}/${role}.html`?[{role,frame}]:[]));
  if(!frames.some(row=>row.role==='workspace')||new Set(frames.map(row=>row.role)).size!==frames.length||frames.some(row=>row.frame.isDetached()||row.frame.parentFrame()!==page.mainFrame()))throw Error('fault-dormancy-role-missing');
  return frames.sort((a,b)=>a.role.localeCompare(b.role));
 };
 const frameState=frame=>frame.evaluate(()=>{const mains=document.querySelectorAll('body > main');return {timeOrigin:performance.timeOrigin,role:document.body?.dataset.frameRole??null,mainCount:mains.length,empty:mains.length===1&&mains[0].childNodes.length===0,lifecycle:document.documentElement.dataset.vaiwlFrameLifecycle??null};});
 let frames=[];
 async function readFrames(){
  checkWorld();const current=mounted();if(current.length!==frames.length||current.some((row,i)=>row.role!==frames[i].role||row.frame!==frames[i].frame))throw Error('fault-dormancy-role-changed');
  const rows=await Promise.all(frames.map(async row=>{const value=await frameState(row.frame);return {role:row.role,present:true,documentUnchanged:value.timeOrigin===row.timeOrigin&&value.role===row.role,mainCount:value.mainCount,empty:value.empty,lifecycle:value.lifecycle};}));checkWorld();return rows;
 }
 function close(){
  if(closeTask)return closeTask;
  closeTask=(async()=>{try{if(installed&&!worldChanged){checkWorld();const restored=await evaluate(`(()=>{const observer=globalThis.${KEY};if(!observer)return false;observer.restore();delete globalThis.${KEY};return true;})()`);if(restored!==true)throw Error('fault-dormancy-restore-failed');receipt.observerRestored=true;}}finally{closed=true;session.off('Runtime.executionContextCreated',created);session.off('Runtime.executionContextDestroyed',destroyed);session.off('Runtime.executionContextsCleared',cleared);await bounded(()=>session.detach());}})();return closeTask;
 }
 try{
  await bounded(()=>session.send('Runtime.enable'));const matches=[];
  for(const candidate of worlds.values())if(candidate.auxData?.isDefault===false&&await evaluate(`window===top&&globalThis.chrome?.runtime?.id===${JSON.stringify(extensionId)}`,candidate.id)===true)matches.push(candidate.id);
  if(matches.length!==1)throw Error('fault-dormancy-isolated-world-not-unique');world=matches[0];checkWorld();
  await evaluate(`(()=>{if(Object.hasOwn(globalThis,${JSON.stringify(KEY)}))throw Error('observer-already-present');globalThis.${KEY}=(${createFaultDormancyRpcObserver.toString()})(chrome.runtime,${JSON.stringify({observeCurrent,conversationId,messageId,origin:observeCurrent?new URL(page.url()).origin:null})});return true;})()`);installed=true;
  frames=await Promise.all(mounted().map(async row=>{const value=await frameState(row.frame);if(value.role!==row.role||value.mainCount!==1||!Number.isFinite(value.timeOrigin))throw Error('fault-dormancy-frame-shape');return {...row,timeOrigin:value.timeOrigin};}));
  receipt.roles=frames.map(row=>row.role);
  return Object.freeze({receipt,async currentBoundary(){if(!observeCurrent)throw Error('fault-current-observer-disabled');const value=await snapshot();faultCurrentObservationTerminal(value,value.bodySequence);return value.bodySequence;},async waitCurrent({boundary,startedAt:entryStarted}){
   if(!observeCurrent||!Number.isFinite(entryStarted))throw Error('fault-current-observer-options');
   const remaining=()=>{const left=6000-(performance.now()-entryStarted);if(left<=0||left>6000)throw Error('fault-current-observation-deadline');return left;};
   return bounded(async()=>{for(;;){remaining();const value=await snapshot();remaining();const terminal=faultCurrentObservationTerminal(value,boundary);if(terminal)return {...terminal,elapsedMs:6000-remaining(),snapshot:value};await new Promise(resolve=>setTimeout(resolve,Math.min(20,remaining())));}},remaining());
  },async arm(){if(startedAt!==null)throw Error('fault-dormancy-already-armed');await readFrames();const before=await snapshot();if(before?.current!==true||before.dropped!==0||!Number.isSafeInteger(before.sequence))throw Error('fault-dormancy-observer-lost');baseline=before.sequence;startedAt=performance.now();Object.assign(receipt,{status:'ARMED',boundary:baseline});},remaining(){if(startedAt===null)throw Error('fault-dormancy-not-armed');const left=6000-(performance.now()-startedAt);if(left<=0)throw Error('fault-dormancy-deadline');return left;},async wait(){if(startedAt===null)throw Error('fault-dormancy-not-armed');try{const result=await waitForSettledFaultDormancy({readSnapshot:snapshot,readFrames,boundary:baseline,roles:receipt.roles,startedAt,onSample:sample=>{receipt.lastSample=sample;}});Object.assign(receipt,result);return result;}catch(error){receipt.status='FAIL';receipt.reason=error.message;throw error;}},close});
 }catch(error){try{await close();}catch{}throw error;}
}
