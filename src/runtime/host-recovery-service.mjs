import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
const kinds=['workspace','native','evidence'];
/** Explicit repair façade. Plans are short-lived RAM comparisons, not authority. */
export function createHostRecoveryService({ui,readService,workspaceRepository,onRecovered=null,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID(),planTTL=20000,maxPlans=64}={}){
 if(typeof ui?.withScope!=='function'||typeof readService?.freeRecoveryStatus!=='function'||typeof readService?.freeRecover!=='function'||!['read','recoveryStatus','recover'].every(k=>typeof workspaceRepository?.[k]==='function')||onRecovered!==null&&typeof onRecovered!=='function'||!Number.isInteger(planTTL)||planTTL<1||planTTL>20000||!Number.isInteger(maxPlans)||maxPlans<1||maxPlans>256)throw Error('invalid-host-recovery-service');
 const plans=new Map(),attempts=new Set();let stopped=false,scopeWork=0;
 // The RPC deadline may settle before authorization or repository work does.
 async function trackScope(work){scopeWork++;try{return await work();}finally{scopeWork--;}}
 const failure=()=>({ok:false,reason:'recovery-unavailable'});
 function stop(){if(stopped)return;stopped=true;plans.clear();for(const attempt of attempts){attempt.active=false;attempt.abort.abort();}attempts.clear();}
 async function handle(input,sender){
  if(stopped)return failure();
  let message;try{message=structuredClone(input);sender=structuredClone(sender);}catch{return {ok:false,reason:'invalid-recovery-request'};}
  const status=message?.type==='HOST_UI_RECOVERY_STATUS',release=message?.type==='HOST_UI_RECOVERY_RELEASE',keys=['v','type','grantId','mountId'];
  if(!exactHostRecord(message,status?keys:release?[...keys,'planIds']:[...keys,'kind','planId','operationId'])||message.v!==1||!tokenOK(message.grantId)||!tokenOK(message.mountId)||release&&(!Array.isArray(message.planIds)||message.planIds.length<1||message.planIds.length>3||!message.planIds.every(tokenOK)||new Set(message.planIds).size!==message.planIds.length)||!status&&!release&&(message.type!=='HOST_UI_RECOVER'||!kinds.includes(message.kind)||!tokenOK(message.planId)||!tokenOK(message.operationId)))return {ok:false,reason:'invalid-recovery-request'};
  const attempt={created:[],delivered:false,active:true,abort:new AbortController(),started:elapsedNow()};attempts.add(attempt);
  const live=()=>!stopped&&attempt.active&&!attempt.abort.signal.aborted&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000;
  try{const result=await withRequestDeadline(()=>trackScope(()=>ui.withScope({sender,grantId:message.grantId,mountId:message.mountId},async context=>{
   const guard=()=>live()&&context.isCurrent(),check=()=>{if(!guard())throw Error('recovery-authority-expired');};check();
   const options={guard,signal:attempt.abort.signal};
   const matches=p=>p.scopeKey===context.scope.key&&p.scopeGrantId===context.scopeGrantId&&p.grantId===message.grantId&&p.mountId===message.mountId;
   if(release){
    const selected=message.planIds.map(id=>plans.get(id)).filter(Boolean);
    if(selected.some(plan=>!matches(plan)))throw Error('invalid-recovery-plan');
    // Dismissal retires unused comparisons only. In-flight persistence remains
    // tracked until its original guarded operation actually settles.
    for(const id of message.planIds)if(!plans.get(id)?.pending)plans.delete(id);
    return {ok:true};
   }
   const time=elapsedNow();for(const [id,plan]of plans)if(!plan.pending&&plan.until<=time)plans.delete(id);
   if(status){
    let workspace;try{await workspaceRepository.read(context.scope,options);workspace={corrupt:false,recoverable:false};}catch{check();workspace=await workspaceRepository.recoveryStatus(context.scope,options);}check();
    const free=await readService.freeRecoveryStatus(context.scope,options);check();
    const source={workspace,native:free?.native,evidence:free?.evidence},output={},created=[];
    try{for(const kind of kinds){const value=source[kind];if(!value||typeof value.corrupt!=='boolean'||value.corrupt&&typeof value.recoverable!=='boolean')throw Error('invalid-recovery-status');
     let planId=null;const recoverable=value.corrupt===true&&value.recoverable===true;
     if(recoverable){if(typeof value.damagedHash!=='string'||!/^[0-9a-f]{64}$/.test(value.damagedHash)||plans.size>=maxPlans)throw Error('recovery-plan-capacity');planId=makeId();if(!tokenOK(planId)||plans.has(planId))throw Error('invalid-recovery-plan');plans.set(planId,{uiDocumentId:sender.documentId,parentDocumentId:context.parentFrame?.documentId,scopeKey:context.scope.key,scopeGrantId:context.scopeGrantId,grantId:message.grantId,mountId:message.mountId,kind,damagedHash:value.damagedHash,createdAt:elapsedNow(),until:elapsedNow()+planTTL,pending:null,operationId:null});created.push(planId);attempt.created.push(planId);}
     output[kind]={corrupt:value.corrupt,recoverable,planId};}
     check();return {ok:true,plans:output};
    }catch(error){for(const id of created)plans.delete(id);throw error;}
   }
   const plan=plans.get(message.planId);if(!plan||!matches(plan)||plan.kind!==message.kind||elapsedNow()<plan.createdAt||elapsedNow()>=plan.until)throw Error('invalid-recovery-plan');
   if(plan.pending){if(plan.operationId!==message.operationId)throw Error('recovery-plan-conflict');const result=await plan.pending;check();return result;}
   plan.operationId=message.operationId;plan.attempt=attempt;
   const repairGuard=()=>guard()&&plans.get(message.planId)===plan&&elapsedNow()<plan.until;
   const request={operationId:message.operationId,damagedHash:plan.damagedHash},repairOptions={guard:repairGuard,signal:attempt.abort.signal};
   plan.pending=(async()=>{try{
    if(!repairGuard())throw Error('recovery-authority-expired');
    const result=await (plan.kind==='workspace'?workspaceRepository.recover(context.scope,request,repairOptions):readService.freeRecover(context.scope,{...request,kind:plan.kind},repairOptions));
    if(!repairGuard()||result?.ok!==true)throw Error('recovery-failed');
    plans.delete(message.planId);try{await onRecovered?.(context.scope.key);}catch{}check();return {ok:true,kind:plan.kind};
   }catch(error){plans.delete(message.planId);throw error;}})();
   return await plan.pending;
  })),{timeoutMs:6000,now:elapsedNow,schedule,cancel});attempt.delivered=result?.ok===true;return result;}catch{return failure();}finally{if(!attempt.delivered)for(const id of attempt.created)plans.delete(id);attempt.active=false;attempt.abort.abort();attempts.delete(attempt);for(const [id,plan]of plans)if(plan.attempt===attempt)plans.delete(id);}
 }
 function revokeDocument(id){for(const [key,plan]of plans)if(plan.uiDocumentId===id||plan.parentDocumentId===id){plans.delete(key);plan.attempt?.abort.abort();}}
 // Local quietness only; retained user work blocks even after its TTL.
 function isIdle(){return !stopped&&scopeWork===0&&attempts.size===0&&plans.size===0;}
 return Object.freeze({handle,stop,isIdle,revokeDocument});
}
