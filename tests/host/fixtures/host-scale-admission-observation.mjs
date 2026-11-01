/** Diagnostic only. Fixed 30s window, six bounded reads; no admission/timing claim.
 * Inventory growth or a plateau never means that a producer finished its pass. */
export async function observeHostScaleAdmission({read,now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const start=now(),rows=[];if(!Number.isFinite(start))throw Error('invalid-observation-clock');
 let previous=start;
 for(let slot=0;slot<6;slot++){
  let at=now();if(!Number.isFinite(at)||at<previous)throw Error('invalid-observation-clock');previous=at;
  const wait=start+slot*5000-at;if(wait>0)await sleep(wait);
  at=now();if(!Number.isFinite(at)||at<previous)throw Error('invalid-observation-clock');previous=at;
  if(at>=start+30000)break;
  const result=await read();const finished=now();if(!Number.isFinite(finished)||finished<at)throw Error('invalid-observation-clock');previous=finished;
  rows.push({slot,startedAtMs:at-start,finishedAtMs:finished-start,result});
  if(finished>=start+30000)break;
 }
 return {evidence:'DIAGNOSTIC_BOUNDED_ADMISSION_OBSERVATION',acceptance:'NOT_ESTABLISHED',windowMs:30000,rows,completion:'NOT_INFERRED_FROM_INVENTORY'};
}
