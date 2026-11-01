import {isCurrentNavigationPlan,isResolvedControlNavigationPlan} from '../host/current-navigation-plan.mjs';
import {createURLPolicy} from '../host/url-policy.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
const commandFields=['actionId','uiGrantId','mountId','planRevision','targetKey'];
const failure=()=>({ok:false,state:'blocked'});
/** RAM-only issued resolved navigation plans. Presentation and page messages never authorize a dispatch. */
export function createHostCurrentNavigation({ui,observations,bridge,onConfirmedUse=null,urlPolicy=null,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||typeof observations?.withCurrent!=='function'||[bridge,elapsedNow,schedule,cancel].some(x=>typeof x!=='function'))throw Error('invalid-current-navigation');
 const groups=new Map(),actions=new Map(),pending=new Map(),attempts=new Set(),arrivals=new Map();let stopped=false;
 const current=context=>{try{return context.isCurrent()===true;}catch{return false;}};
 const key=(context,grantId,mountId)=>JSON.stringify([context.scope.key,context.scopeGrantId,grantId,mountId,context.role]);
 const within=(start,ms)=>{const n=elapsedNow();return Number.isFinite(start)&&Number.isFinite(n)&&n>=start&&n-start<ms;};
 const live=e=>!stopped&&groups.get(e.key)===e&&within(e.created,30000)&&current(e.context);
 const nativeUses=new Set();
 // Called only after the service authenticates an isolated content message.
 // The fresh current-body proof supplies scope/object identity; an action ID
 // supplies deduplication only, never authority or a successful send.
 async function nativeUse({actionId,proofId,binding,parentFrame}){
  if(stopped||!onConfirmedUse||!tokenOK(actionId)||!tokenOK(proofId)||nativeUses.has(actionId)||nativeUses.size>=1024)return false;
  try{return await observations.withCurrent(proofId,async proof=>{
   if(stopped||nativeUses.has(actionId)||nativeUses.size>=1024||proof.tabId!==parentFrame.tabId||proof.browserDocumentId!==parentFrame.documentId||['documentToken','producerToken','routeEpoch'].some(k=>proof[k]!==binding[k])||!proof.guard())return false;
   nativeUses.add(actionId);
   await onConfirmedUse({scope:proof.scope,conversationId:proof.conversationId,actionId:'native_'+actionId,guard:()=>!stopped&&proof.guard(),signal:proof.signal});return true;
  });}catch{return false;}
 }
 function prune(){for(const [id,a]of arrivals)if(stopped||a.action.cancelled||!within(a.started,6000))arrivals.delete(id);for(const [k,e]of groups)if(!live(e))groups.delete(k);for(const [id,action]of actions)if(!current(action.context))actions.delete(id);}
 function register({context,grantId,mountId,navigation}={}){
  if(stopped||!context||!current(context)||typeof context.scope?.key!=='string'||!tokenOK(context.scopeGrantId)||!['workspace','sidebar'].includes(context.role)||!tokenOK(grantId)||!tokenOK(mountId)||!Array.isArray(navigation)||navigation.length>200)throw Error('invalid-current-registration');
  const rows=new Map(),refs=new Set(),policy=urlPolicy??createURLPolicy({origin:new URL(context.parentFrame?.actualURL).origin});
  for(const row of navigation){
   const project=Object.hasOwn(row??{},'projectId'),field=project?'projectId':'refId',entity=project?'project':'conversation';
   if(!exactHostRecord(row,[field,'plan','targetKey']))throw Error('invalid-current-plan');
   const id=row[field],p=row.plan,same=isCurrentNavigationPlan(p),native=isResolvedControlNavigationPlan(p);if(!same&&!native)throw Error('invalid-current-plan');const t=p.target;
   if(!tokenOK(id)||!tokenOK(row.targetKey)||rows.has(row.targetKey)||refs.has(entity+':'+id)||t?.nativeId!==id||t?.entity!==entity)throw Error('invalid-current-plan');
   if(!same&&!native||same&&(project||!policy.sameTarget(t.navigationURL,context.parentFrame?.actualURL))||native&&(p.control.documentToken!==context.binding?.documentToken||p.control.routeEpoch!==context.binding?.routeEpoch))throw Error('invalid-current-plan');
   const parsed=policy.parse(t.navigationURL);if(parsed.kind!==entity||(parsed.conversationId??parsed.projectId)!==id)throw Error('invalid-current-plan');
   refs.add(entity+':'+id);rows.set(row.targetKey,Object.freeze({entity,refId:id,targetKey:row.targetKey,mode:p.mode,bodyProofId:same?p.bodyProofId:null,planRevision:p.planRevision,navigationURL:t.navigationURL}));
  }
  prune();const k=key(context,grantId,mountId),created=elapsedNow();if(!Number.isFinite(created)||!groups.has(k)&&groups.size>=64)throw Error('current-plan-capacity');
  if(!rows.size){groups.delete(k);return true;}
  groups.set(k,{key:k,context,grantId,mountId,created,rows,binding:{...context.binding},parentFrame:{...context.parentFrame}});return true;
 }
 // A native-control dispatch is only an intent. Match its later current-body
 // proof in the same scope/tab/document before recording local use. Discovery,
 // refresh and unrelated body observations have no matching intent.
 async function observe(proofId){
  if(!onConfirmedUse||stopped)return false;prune();if(!arrivals.size)return false;
  try{return await observations.withCurrent(proofId,async proof=>{
   for(const [id,a]of arrivals){
    if(proof.scope?.key!==a.scopeKey||proof.tabId!==a.tabId||proof.browserDocumentId!==a.documentId||proof.conversationId!==a.refId||!proof.guard())continue;
    a.proofId=proofId;if(!a.settled)return false;
    arrivals.delete(id);
    const guard=()=>!stopped&&!a.action.cancelled&&within(a.started,6000)&&proof.guard();
    if(!guard())return false;
    await onConfirmedUse({scope:proof.scope,conversationId:a.refId,actionId:id,guard,signal:proof.signal});return true;
   }
   return false;
  });}catch{return false;}
 }
 function authorize(command,parentFrame){
  if(!exactHostRecord(command,commandFields))return false;const e=pending.get(command.actionId),expected=e?.context.parentFrame;
  if(!e||!expected||expected.frameId!==0||parentFrame?.frameId!==0||['tabId','documentId','actualURL'].some(k=>parentFrame[k]!==expected[k])||commandFields.some(k=>command[k]!==e.command[k]))return false;
  try{return e.guard()===true;}catch{return false;}
 }
 async function cancelAction(message,sender){
  if(stopped||!exactHostRecord(message,['v','type','grantId','mountId','actionId','planRevision','targetKey'])||message.v!==1||message.type!=='HOST_UI_CANCEL_NAVIGATION'||!['grantId','mountId','actionId','targetKey'].every(k=>tokenOK(message[k]))||!Number.isSafeInteger(message.planRevision)||message.planRevision<1)return failure();
  const m={...message},started=elapsedNow();let active=true;const alive=()=>active&&!stopped&&within(started,6000);
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async context=>{
   prune();const k=key(context,m.grantId,m.mountId),e=groups.get(k),row=e?.rows.get(m.targetKey),action=actions.get(m.actionId);
   if(!alive()||!e||!live(e)||!current(context)||row?.planRevision!==m.planRevision||action&&(action.key!==k||action.targetKey!==m.targetKey||action.planRevision!==m.planRevision)||!action&&actions.size>=1024)return failure();
   // A tombstone also fences cancel-before-dispatch delivery. Never delete it
   // to enable replay, and never claim an already completed click was undone.
   arrivals.delete(m.actionId);if(action)action.cancelled=true;else actions.set(m.actionId,{context,key:k,targetKey:m.targetKey,planRevision:m.planRevision,cancelled:true});
   const command={actionId:m.actionId,uiGrantId:m.grantId,mountId:m.mountId,planRevision:m.planRevision,targetKey:m.targetKey};
   const guard=()=>alive()&&current(context)&&live(e);
   const result=await bridge({context,command,mode:'cancel',guard,remainingMs:6000-(elapsedNow()-started)});
   return guard()&&result?.state==='cancelled'?{ok:true,state:'cancelled'}:failure();
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return failure();}finally{active=false;}
 }
 async function handle(message,sender){
  if(stopped||!exactHostRecord(message,['v','type','grantId','mountId','actionId','planRevision','targetKey'])||message.v!==1||!['HOST_UI_DISPATCH_CURRENT','HOST_UI_DISPATCH_NATIVE'].includes(message.type)||!['grantId','mountId','actionId','targetKey'].every(k=>tokenOK(message[k]))||!Number.isSafeInteger(message.planRevision)||message.planRevision<1)return failure();
  const m={...message},a={active:true,started:elapsedNow()};attempts.add(a);
  const alive=()=>!stopped&&a.active&&within(a.started,6000);
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async context=>{
   prune();if(!alive()||!current(context))throw Error('current-navigation-expired');
   const e=groups.get(key(context,m.grantId,m.mountId)),row=e?.rows.get(m.targetKey);
   if(!e||!live(e)||['documentToken','producerToken','routeEpoch'].some(k=>e.binding[k]!==context.binding?.[k])||['tabId','frameId','documentId','actualURL'].some(k=>e.parentFrame[k]!==context.parentFrame?.[k])||!row||(m.type==='HOST_UI_DISPATCH_CURRENT')!==(row.mode==='same-target')||row.planRevision!==m.planRevision||actions.has(m.actionId)||actions.size>=1024)throw Error('current-plan-unavailable');
   const action={context,key:e.key,targetKey:m.targetKey,planRevision:m.planRevision,cancelled:false};actions.set(m.actionId,action);
   const command=Object.freeze({actionId:m.actionId,uiGrantId:m.grantId,mountId:m.mountId,planRevision:m.planRevision,targetKey:m.targetKey});
   const guard=()=>!action.cancelled&&alive()&&current(context)&&live(e)&&e.rows.get(m.targetKey)===row&&['documentToken','producerToken','routeEpoch'].every(k=>e.binding[k]===context.binding?.[k])&&['tabId','frameId','documentId','actualURL'].every(k=>e.parentFrame[k]===context.parentFrame?.[k]);
   const execute=async proof=>{
    if(!guard()||proof&&(proof.scope?.key!==context.scope.key||['documentToken','producerToken','routeEpoch'].some(k=>proof[k]!==context.binding?.[k])||proof.conversationId!==row.refId||typeof proof.guard!=='function'||proof.guard()!==true))throw Error('current-proof-conflict');
    const fresh=()=>{try{return guard()&&(!proof||proof.guard()===true);}catch{return false;}};
    const entry={command,context,guard:fresh};pending.set(m.actionId,entry);a.pending=entry;a.actionId=m.actionId;a.nativeAttempt=row.mode==='native-control';
    let arrival=null;
    if(onConfirmedUse&&row.mode==='native-control'&&row.entity==='conversation'){
     // New intent supersedes a previous unresolved intent in this same tab.
     for(const [id,old]of arrivals)if(old.tabId===context.parentFrame.tabId)arrivals.delete(id);
     arrival={scopeKey:context.scope.key,tabId:context.parentFrame.tabId,documentId:context.parentFrame.documentId,refId:row.refId,action,started:a.started,settled:false,proofId:null};arrivals.set(m.actionId,arrival);
    }
    const result=await bridge({context,command,mode:row.mode,navigationURL:row.navigationURL,guard:fresh,remainingMs:6000-(elapsedNow()-a.started)});
    const states=row.mode==='same-target'?['already-current','blocked','unconfirmed']:['dispatched','blocked','unconfirmed'];
    const valid=exactHostRecord(result,['state',...(Object.hasOwn(result??{},'actionId')?['actionId']:[]),...(Object.hasOwn(result??{},'reason')?['reason']:[])])&&states.includes(result.state)&&(!Object.hasOwn(result,'actionId')||result.actionId===m.actionId);
    if(arrival){
     if(valid&&['dispatched','unconfirmed'].includes(result.state)&&!action.cancelled){arrival.settled=true;if(arrival.proofId)await observe(arrival.proofId);}
     else arrivals.delete(m.actionId);
    }
    if(!fresh())return a.nativeAttempt?{ok:true,state:'unconfirmed'}:failure();
    if(!valid)throw Error('invalid-current-result');
    if(result.state==='already-current'&&proof&&onConfirmedUse){
     try{await onConfirmedUse({scope:proof.scope,conversationId:row.refId,actionId:m.actionId,guard:fresh,signal:proof.signal});}catch{/* A local recency write never repeats or undoes a native action. */}
    }
    return {ok:true,state:result.state};
   };
   return row.mode==='same-target'?observations.withCurrent(row.bodyProofId,execute):execute(null);
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return a.nativeAttempt?{ok:true,state:'unconfirmed'}:failure();}finally{a.active=false;attempts.delete(a);if(a.pending&&pending.get(a.actionId)===a.pending)pending.delete(a.actionId);}
 }
 function stop(){stopped=true;groups.clear();actions.clear();pending.clear();arrivals.clear();nativeUses.clear();for(const a of attempts)a.active=false;attempts.clear();}
 return Object.freeze({register,handle,cancelAction,authorize,observe,nativeUse,stop});
}
