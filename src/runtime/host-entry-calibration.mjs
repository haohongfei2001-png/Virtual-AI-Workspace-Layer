import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
/** One opportunistic current-body read per entry. Provider owns durable network budgets. */
export function createHostEntryCalibration({ui,observations,reader,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||typeof observations?.currentProofForParent!=='function'||typeof reader?.readCalibration!=='function')throw Error('invalid-entry-calibration');
 let stopped=false,busy=null;
 async function handle(message,sender){
  const failure=()=>({ok:false,state:'unavailable'});
  if(stopped||busy||!exactHostRecord(message,['v','type','grantId','mountId','kind'])||message.v!==1||message.type!=='HOST_UI_CALIBRATION_ENTRY'||!tokenOK(message.grantId)||!tokenOK(message.mountId)||!['foreground','history'].includes(message.kind))return failure();
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;
  try{return await withRequestDeadline(()=>ui.withScope({grantId:message.grantId,mountId:message.mountId,sender},async context=>{
   if(context.role!=='workspace')return failure();
   const proof=observations.currentProofForParent(context);if(!proof)return failure();
   const isCurrent=()=>!stopped&&busy===attempt&&attempt.active&&!attempt.abort.signal.aborted&&Number.isFinite(elapsedNow())&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&context.isCurrent()===true&&observations.currentProofForParent(context)===proof;
   if(!isCurrent())return failure();
   await reader.readCalibration(proof,{isCurrent,signal:attempt.abort.signal});
   return isCurrent()?{ok:true,state:'checked-current'}:failure();
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return failure();}
  finally{attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}
 }
 function stop(){stopped=true;if(busy){busy.active=false;busy.abort.abort();}}
 return Object.freeze({handle,stop});
}
