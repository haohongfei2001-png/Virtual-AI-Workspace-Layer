import {withRequestDeadline} from '../../../src/data/request-deadline.mjs';
import {observeHostScaleAdmission} from './host-scale-admission-observation.mjs';

// Test preparation only: never edits data, changes product budgets, or measures UI.
// Inventory samples are hints; only the unchanged full oracle admits measurement.
const admitted=value=>value?.status==='PASS_INDEX_AUDIT_ONLY'&&Number.isSafeInteger(value.revision)&&value.revision>=0&&Number.isSafeInteger(value.requestedRefs)&&value.requestedRefs>0&&value.distinctRefs===value.requestedRefs&&value.missingRefs===0&&value.unexpectedRefs===0&&value.duplicateRefs===0;
export async function prepareHostScaleAdmission({initialAudit,read,audit,now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),schedule=setTimeout,cancel=clearTimeout}){
 if(typeof read!=='function'||typeof audit!=='function')throw Error('invalid-admission-preparation');
 const started=now(),abort=new AbortController();let last=started;
 if(!Number.isFinite(started))throw Error('invalid-observation-clock');
 const result={status:'NOT_READY_AFTER_PREPARATION',ready:false,initialAudit,finalAudit:null,windowMs:30000,elapsedMs:0,observation:null,measurement:'NOT_RUN_BY_PREPARATION'};
 const check=()=>{const at=now();if(!Number.isFinite(at)||at<last)throw Error('invalid-observation-clock');last=at;if(abort.signal.aborted||at-started>=30000)throw Error('request-timeout');return 30000-(at-started);};
 if(admitted(initialAudit))return {...result,status:'READY_IMMEDIATE',ready:true,finalAudit:initialAudit};
 try{
  await withRequestDeadline(async()=>{
   result.observation=await observeHostScaleAdmission({now,sleep:async ms=>{check();await sleep(ms);check();},read:async()=>{const remainingMs=check();const value=await read({signal:abort.signal,remainingMs});check();return value;}});
   const remainingMs=check();const finalAudit=await audit({signal:abort.signal,remainingMs});check();result.finalAudit=finalAudit;
   // A different fixture cardinality cannot substitute for the requested scale.
   result.ready=admitted(finalAudit)&&finalAudit.requestedRefs===initialAudit?.requestedRefs;
   result.status=result.ready?'READY_AFTER_PREPARATION':'NOT_READY_AFTER_PREPARATION';
  },{timeoutMs:30000,now,schedule,cancel});
 }catch(error){result.ready=false;result.status=error?.message==='request-timeout'?'TIMED_OUT':'PREPARATION_FAILED';result.reason=error?.message??'admission-preparation-failed';}
 finally{abort.abort();const ended=now();result.elapsedMs=Number.isFinite(ended)&&ended>=started?ended-started:null;}
 return result;
}
