// Test-package-only observation. No grants, arguments, IDs, URLs or payloads
// enter this ring; reads happen at the original owner decision points.
export function instrumentIdleWorkSource(source,kind){
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('idle-trace-anchor:'+kind);source=source.replace(before,after);};
 const setup=`const idleTrace=(stage,detail)=>{try{const rows=globalThis.__vaiwlFixtureIdleWork??=[];rows.push({at:Date.now(),stage,...detail});if(rows.length>256)rows.shift();}catch{}};`;
 if(kind==='service'){
  replace(' const activity={requests:0,background:0};',setup+'\n const activity={requests:0,background:0};');
  replace("async function track(kind,work){activity[kind]++;try{return await work();}finally{activity[kind]--;}}",`async function track(kind,work,label='INTERNAL',realm='internal'){activity[kind]++;idleTrace('work-start',{kind,label,realm,requests:activity.requests,background:activity.background});try{return await work();}finally{activity[kind]--;idleTrace('work-end',{kind,label,realm,requests:activity.requests,background:activity.background});}}`);
  replace("const handle=(message,sender)=>track('requests',()=>handleWork(message,sender));",`const handle=(message,sender)=>{
   const type=Object.getOwnPropertyDescriptor(message??{},'type')?.value;
   const protocol=Object.getOwnPropertyDescriptor(message??{},'protocol')?.value;
   const known=['HOST_HELLO','HOST_REFRESH','HOST_FOCUS','HOST_DOCUMENT_RENEW','HOST_INGESTION_PASS','HOST_UI_VIEW','HOST_UI_VALIDATE','HOST_UI_JOIN','HOST_UI_CONFIRM','HOST_UI_RENEW','HOST_UI_STATUS','HOST_UI_MOUNT','HOST_UI_SURFACE_STATE','HOST_UI_SURFACE_STATE_GET','HOST_UI_WORKSPACE_ENTERED','HOST_UI_IDLE_CHECK','HOST_UI_IDLE_RELEASE','HOST_UI_SAVE_VIEW','HOST_UI_RESUME','HOST_UI_CALIBRATION_ENTRY','HOST_UI_CURRENT_ENTRY'];
   const label=known.includes(type)?type:['vaiwl-host-observation/1','vaiwl-host-observation/2'].includes(protocol)?'OBSERVATION':'OTHER';
   const frame=Object.getOwnPropertyDescriptor(sender??{},'frameId')?.value,realm=frame===0?'parent':Number.isSafeInteger(frame)&&frame>0?'frame':'unknown';
   return track('requests',()=>handleWork(message,sender),label,realm);
  };`);
  replace('return quiet()&&ownersIdle(true)&&quiet();',`const result=quiet()&&ownersIdle(true)&&quiet();idleTrace('worker-close-guard',{result,requests:activity.requests,background:activity.background,refreshAttempts:refreshAttempts.size});return result;`);
  const owners="[authority,contextRecovery,...(typeof contextObserver?.isIdle==='function'?[contextObserver]:[]),continuations,nativeActivity,localUse,...(excludeUi?[]:[ui]),observations,ingestionPasses,currentMetadata,sendCandidates,firstSend,oldSendTerminal,backup,recovery,views]";
  replace(`return ${owners}.every(owner=>owner===null||owner.isIdle?.()===true);`,`const names=['authority','contextRecovery',...(typeof contextObserver?.isIdle==='function'?['contextObserver']:[]),'continuations','nativeActivity','localUse',...(excludeUi?[]:['ui']),'observations','ingestionPasses','currentMetadata','sendCandidates','firstSend','oldSendTerminal','backup','recovery','views'];return ${owners}.every((owner,i)=>{const idle=owner===null||owner.isIdle?.()===true;if(!idle)idleTrace('owner-busy',{owner:names[i],excludeUi});return idle;});`);
 }else if(kind==='ui'){
  replace(' let revocationEpoch=0,activeWork=0;',setup+'\n let revocationEpoch=0,activeWork=0;');
  replace('const quiet=()=>activeWork===1&&inFlight.size===1&&pending.size===0;',`const quiet=()=>{const result=activeWork===1&&inFlight.size===1&&pending.size===0;idleTrace('ui-close-guard',{result,activeWork,inFlight:inFlight.size,pending:pending.size});return result;};`);
 }else throw Error('invalid-idle-trace-kind');
 return source;
}
