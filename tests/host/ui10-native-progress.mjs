import {writeFileSync,renameSync} from 'node:fs';
// Hosted run 39551617583 completed 56/64 visits in 820248ms.
// 22 minutes covers the ~16-minute ingestion projection plus 8 visual cells.
// Only its CI job gets 25 minutes; cleanup hard-stop remains 15 seconds.
export const UI10_NATIVE_DEADLINE_MS=22*60*1000;
/** Synthetic harness metadata only; no DOM, account, query, or response bodies. */
export function createUi10NativeProgress({report,output,now=Date.now,schedule=setTimeout,cancel=clearTimeout,log=console.log,onTimeout=()=>{},sample=()=>({}),deadlineMs=UI10_NATIVE_DEADLINE_MS}){
 if(!(deadlineMs>0&&deadlineMs<=UI10_NATIVE_DEADLINE_MS))throw Error('invalid-ui10-overall-deadline');
 const started=now();let timedOut=false,finished=false;report.finalized=false;
 function persist(){const temporary=output+'.checkpoint';writeFileSync(temporary,JSON.stringify(report,null,2));renameSync(temporary,output);}
 function checkpoint(phase,{index=null,requests=null,remaining=null,waitMs=null}={}){
  if(!/^[a-z-]+$/.test(phase))throw Error('invalid-ui10-phase');
  for(const value of [index,requests,remaining,waitMs])if(value!==null&&(!Number.isInteger(value)||value<0))throw Error('invalid-ui10-progress-counter');
  const counters=sample();for(const [key,value] of Object.entries(counters))if(!['session','accounts','currentDetail','nativeRoute','nativeMove'].includes(key)||!Number.isInteger(value)||value<0)throw Error('invalid-ui10-network-counter');
  const entry={phase,index,requests,remaining,waitMs,network:counters,elapsedMs:Math.max(0,now()-started)};
  report.progress={...entry,deadlineMs,timedOut};report.checkpoints??=[];report.checkpoints.push(entry);
  // Fixed bounded journal; visits/checks retain their own complete exact counts.
  if(report.checkpoints.length>512)report.checkpoints.shift();
  persist();log('UI10_NATIVE_PROGRESS '+JSON.stringify(entry));return entry;
 }
 const timer=schedule(()=>{if(finished)return;timedOut=true;report.status='FAIL_OVERALL_DEADLINE';report.error='ui10-overall-deadline';report.progress={...report.progress,timedOut:true};report.timeoutNetwork=sample();persist();log('UI10_NATIVE_DEADLINE '+JSON.stringify(report.progress));onTimeout();},deadlineMs);
 checkpoint('setup');
 return {checkpoint,persist,get timedOut(){return timedOut;},finish(){finished=true;cancel(timer);if(timedOut)report.status='FAIL_OVERALL_DEADLINE';report.finalized=true;persist();}};
}
/** Final evidence gate is shared with tests, so an emitter exception cannot yield PASS. */
export function finalizeUi10NativeVisualEvidence({report,captures,emit,timedOut=false}){
 if(report.fixtureStable&&report.productSourceStable&&captures.length===2){
  try{emit(captures);report.initialVisualLogStatus='EMITTED_NOT_VISUALLY_REVIEWED';}
  catch(e){report.initialVisualLogStatus='FAILED';report.initialVisualLogError=String(e);report.status='FAIL_VISUAL_LOG';}
 }else report.initialVisualLogStatus='NOT_EMITTED_INCOMPLETE_OR_UNSTABLE';
 if(timedOut)report.status='FAIL_OVERALL_DEADLINE';
 else if(report.status==='PENDING_FINAL_VERIFICATION')report.status=report.initialVisualLogStatus==='EMITTED_NOT_VISUALLY_REVIEWED'?'PASS_PACKAGED_POPULATED_SUBCONTRACT_ONLY':'FAIL_VISUAL_LOG';
 return report.status==='PASS_PACKAGED_POPULATED_SUBCONTRACT_ONLY';
}
