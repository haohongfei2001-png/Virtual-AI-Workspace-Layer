import {hostScaleFailureProgress} from './host-scale-progress.mjs';
/** Test-only, one startup wait, three opportunities. Never awaited by UI work.
 * Sampling perturbs the renderer/IDB: all timings in this run are diagnostic.
 */
export function createHostScaleProgressSampler({page,extensionId,records,now=()=>performance.now(),read=hostScaleFailureProgress}){
 const origin=now(),thresholds=[30000,20000,10000],used=new Set();let stopped=false,pending=null;
 const elapsed=()=>Math.max(0,now()-origin);
 const unique=()=>!page.isClosed()&&page.frames().filter(frame=>!frame.isDetached()&&frame.url()===`chrome-extension://${extensionId}/workspace.html`).length===1;
 function observe({remainingMs,preparing=false}){
  if(stopped||!preparing||!Number.isFinite(remainingMs)||remainingMs<=0)return;
  // If observations jump over several thresholds, retain skipped slots instead
  // of launching a burst of concurrent reads at the same instant.
  for(let slot=0;slot<thresholds.length;slot++){
   if(used.has(slot)||remainingMs>thresholds[slot])continue;used.add(slot);
   const row={slot,thresholdRemainingMs:thresholds[slot],triggerAtMs:elapsed(),remainingMs,status:'SCHEDULED',timingUse:'DIAGNOSTIC_ONLY'};records.push(row);
   if(pending){row.status='SKIPPED_IN_FLIGHT';continue;}
   try{if(!unique()){row.status='SKIPPED_NO_UNIQUE_FRAME';continue;}}catch{row.status='SKIPPED_FRAME_UNAVAILABLE';continue;}
   pending=row;
   // Do not join this promise to the surface readiness/deadline promise.
   void Promise.resolve().then(()=>{
    if(stopped)return null;
    row.startedAtMs=elapsed();return read(page,extensionId,{timeout:1000});
   }).then(result=>{
    if(stopped)return;
    row.finishedAtMs=elapsed();row.result=result;row.status='FINISHED';
   },()=>{if(!stopped){row.finishedAtMs=elapsed();row.status='DIAGNOSTIC_UNAVAILABLE';}}).finally(()=>{if(pending===row)pending=null;});
  }
 }
 function stop(){if(stopped)return;stopped=true;if(pending){pending.status='STOPPED_PENDING';pending.stoppedAtMs=elapsed();}pending=null;}
 return {observe,stop};
}
