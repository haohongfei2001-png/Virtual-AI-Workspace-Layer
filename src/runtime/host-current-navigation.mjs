import {createURLPolicy} from '../host/url-policy.mjs';
import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
const commandFields=['actionId','uiGrantId','mountId','planRevision','targetKey'];
const failure=()=>({ok:false,state:'blocked'});
/** RAM-only issued current-target plans. Presentation and page messages never authorize a dispatch. */
export function createHostCurrentNavigation({ui,observations,bridge,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof ui?.withScope!=='function'||typeof observations?.withCurrent!=='function'||[bridge,elapsedNow,schedule,cancel].some(x=>typeof x!=='function'))throw Error('invalid-current-navigation');
 const groups=new Map(),actions=new Map(),pending=new Map(),attempts=new Set();let stopped=false;
 const current=context=>{try{return context.isCurrent()===true;}catch{return false;}};
 const key=(context,grantId,mountId)=>JSON.stringify([context.scope.key,context.scopeGrantId,grantId,mountId,context.role]);
 const within=(start,ms)=>{const n=elapsedNow();return Number.isFinite(start)&&Number.isFinite(n)&&n>=start&&n-start<ms;};
 const live=e=>!stopped&&groups.get(e.key)===e&&within(e.created,30000)&&current(e.context);
 function prune(){for(const [k,e]of groups)if(!live(e))groups.delete(k);for(const [id,context]of actions)if(!current(context))actions.delete(id);}
 function register({context,grantId,mountId,navigation}={}){
  if(stopped||!context||!current(context)||typeof context.scope?.key!=='string'||!tokenOK(context.scopeGrantId)||!['workspace','sidebar'].includes(context.role)||!tokenOK(grantId)||!tokenOK(mountId)||!Array.isArray(navigation)||navigation.length>200)throw Error('invalid-current-registration');
  const rows=new Map(),refs=new Set(),policy=createURLPolicy({origin:new URL(context.parentFrame?.actualURL).origin});
  for(const row of navigation){
   if(!exactHostRecord(row,['refId','plan','targetKey']))throw Error('invalid-current-plan');
   const p=row.plan;if(!exactHostRecord(p,['mode','target','bodyProofId','planRevision']))throw Error('invalid-current-plan');const t=p.target;
   if(!exactHostRecord(row,['refId','plan','targetKey'])||!tokenOK(row.refId)||!tokenOK(row.targetKey)||rows.has(row.targetKey)||refs.has(row.refId)||!exactHostRecord(p,['mode','target','bodyProofId','planRevision'])||p.mode!=='same-target'||!tokenOK(p.bodyProofId)||!Number.isSafeInteger(p.planRevision)||p.planRevision<1||!exactHostRecord(t,['kind','entity','nativeId','navigationURL','liveHandle'])||t.kind!=='resolved'||t.entity!=='conversation'||t.nativeId!==row.refId||t.liveHandle!==null||typeof t.navigationURL!=='string'||t.navigationURL.length>2048||!policy.sameTarget(t.navigationURL,context.parentFrame?.actualURL)||policy.parse(t.navigationURL).conversationId!==row.refId)throw Error('invalid-current-plan');
   refs.add(row.refId);rows.set(row.targetKey,Object.freeze({refId:row.refId,targetKey:row.targetKey,bodyProofId:p.bodyProofId,planRevision:p.planRevision,navigationURL:t.navigationURL}));
  }
  prune();const k=key(context,grantId,mountId),created=elapsedNow();if(!Number.isFinite(created)||!groups.has(k)&&groups.size>=64)throw Error('current-plan-capacity');
  if(!rows.size){groups.delete(k);return true;}
  groups.set(k,{key:k,context,grantId,mountId,created,rows,binding:{...context.binding},parentFrame:{...context.parentFrame}});return true;
 }
 function authorize(command,parentFrame){
  if(!exactHostRecord(command,commandFields))return false;const e=pending.get(command.actionId),expected=e?.context.parentFrame;
  if(!e||!expected||expected.frameId!==0||parentFrame?.frameId!==0||['tabId','documentId','actualURL'].some(k=>parentFrame[k]!==expected[k])||commandFields.some(k=>command[k]!==e.command[k]))return false;
  try{return e.guard()===true;}catch{return false;}
 }
 async function handle(message,sender){
  if(stopped||!exactHostRecord(message,['v','type','grantId','mountId','actionId','planRevision','targetKey'])||message.v!==1||message.type!=='HOST_UI_DISPATCH_CURRENT'||!['grantId','mountId','actionId','targetKey'].every(k=>tokenOK(message[k]))||!Number.isSafeInteger(message.planRevision)||message.planRevision<1)return failure();
  const m={...message},a={active:true,started:elapsedNow()};attempts.add(a);
  const alive=()=>!stopped&&a.active&&within(a.started,6000);
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async context=>{
   prune();if(!alive()||!current(context))throw Error('current-navigation-expired');
   const e=groups.get(key(context,m.grantId,m.mountId)),row=e?.rows.get(m.targetKey);
   if(!e||!live(e)||['documentToken','producerToken','routeEpoch'].some(k=>e.binding[k]!==context.binding?.[k])||['tabId','frameId','documentId','actualURL'].some(k=>e.parentFrame[k]!==context.parentFrame?.[k])||!row||row.planRevision!==m.planRevision||actions.has(m.actionId)||actions.size>=1024)throw Error('current-plan-unavailable');
   actions.set(m.actionId,context);
   const command=Object.freeze({actionId:m.actionId,uiGrantId:m.grantId,mountId:m.mountId,planRevision:m.planRevision,targetKey:m.targetKey});
   const guard=()=>alive()&&current(context)&&live(e)&&e.rows.get(m.targetKey)===row;
   return observations.withCurrent(row.bodyProofId,async proof=>{
    if(!guard()||proof?.scope?.key!==context.scope.key||['documentToken','producerToken','routeEpoch'].some(k=>proof[k]!==context.binding?.[k])||proof.conversationId!==row.refId||typeof proof.guard!=='function'||proof.guard()!==true)throw Error('current-proof-conflict');
    const fresh=()=>{try{return guard()&&proof.guard()===true;}catch{return false;}};
    const entry={command,context,guard:fresh};pending.set(m.actionId,entry);a.pending=entry;a.actionId=m.actionId;
    const result=await bridge({context,command,guard:fresh,remainingMs:6000-(elapsedNow()-a.started)});
    if(!fresh()||!exactHostRecord(result,['state',...(Object.hasOwn(result??{},'actionId')?['actionId']:[]),...(Object.hasOwn(result??{},'reason')?['reason']:[])])||!['already-current','blocked','unconfirmed'].includes(result.state)||Object.hasOwn(result,'actionId')&&result.actionId!==m.actionId)throw Error('invalid-current-result');
    return {ok:true,state:result.state};
   });
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return failure();}finally{a.active=false;attempts.delete(a);if(a.pending&&pending.get(a.actionId)===a.pending)pending.delete(a.actionId);}
 }
 function stop(){stopped=true;groups.clear();actions.clear();pending.clear();for(const a of attempts)a.active=false;attempts.clear();}
 return Object.freeze({register,handle,authorize,stop});
}
