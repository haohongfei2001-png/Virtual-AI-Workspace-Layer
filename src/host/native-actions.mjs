/** Owner-issued plans only. No URL fallback, simulated acknowledgement or replay. */
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9_-]+$/.test(v);
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const riskKey=r=>r&&['clear','unsaved','unknown'].includes(r.state)&&Array.isArray(r.flags)&&r.flags.every(v=>['composer','attachment','upload','generation','voice','canvas'].includes(v))?JSON.stringify([r.state,[...new Set(r.flags)].sort()]):null;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function createNativeActions({discovery,urlPolicy,currentURL,bodyProof=()=>null,inputRisk=()=>({state:'unknown',flags:[]}),authorize=()=>false,beforeDispatch=()=>{},now=()=>performance.now()}={}){
 if(typeof discovery?.getNode!=='function'||typeof urlPolicy?.parse!=='function'||typeof currentURL!=='function'||[bodyProof,inputRisk,authorize,beforeDispatch,now].some(f=>typeof f!=='function'))throw Error('invalid-native-actions');
 const plans=new Map(),certificates=new WeakMap(),actions=new Map();let revision=0;const nonce=crypto.randomUUID().replaceAll('-','');
 const validHandle=h=>exact(h,['id','documentToken','routeEpoch','regionEpoch','controlKind'])&&id(h.id)&&id(h.documentToken)&&Number.isSafeInteger(h.routeEpoch)&&h.routeEpoch>=0&&Number.isSafeInteger(h.regionEpoch)&&h.regionEpoch>=0&&['project','conversation','new-project','new-chat','native-search'].includes(h.controlKind);
 function planNavigation(target,risk=inputRisk()){
  const planRevision=++revision,unavailable=reason=>Object.freeze({mode:'unavailable',reason,planRevision});
  const riskAtIssue=riskKey(risk),actualRisk=riskKey(inputRisk());if(!riskAtIssue||riskAtIssue!==actualRisk)return unavailable('input-risk-changed');
  let chosen;try{chosen=structuredClone(target);}catch{return unavailable('invalid-native-target');}
  let handle=null,route=null;
  if(chosen?.kind==='resolved'){
   if(!exact(chosen,['kind','entity','nativeId','navigationURL','liveHandle'])||!['project','conversation'].includes(chosen.entity)||!id(chosen.nativeId)||typeof chosen.navigationURL!=='string')return unavailable('invalid-native-target');
   route=urlPolicy.parse(chosen.navigationURL);if(route.kind!==chosen.entity||(route.conversationId??route.projectId)!==chosen.nativeId)return unavailable('native-target-mismatch');
   if(chosen.liveHandle!==null&&!validHandle(chosen.liveHandle))return unavailable('invalid-native-handle');handle=chosen.liveHandle;
   if(handle&&handle.controlKind!==chosen.entity)return unavailable('native-control-kind-mismatch');
  }else if(chosen?.kind==='live-control'){
   if(!exact(chosen,['kind','control','navigationURL'])||chosen.navigationURL!==null||!validHandle(chosen.control))return unavailable('invalid-native-target');handle=chosen.control;
  }else return unavailable('invalid-native-target');
  const issuedURL=currentURL(),proof=bodyProof();let plan,node=null;
  if(chosen.kind==='resolved'&&chosen.entity==='conversation'&&urlPolicy.sameTarget(issuedURL,chosen.navigationURL)&&proof?.conversationId===chosen.nativeId&&id(proof.bodyProofId))plan={mode:'same-target',target:chosen,bodyProofId:proof.bodyProofId,planRevision};
  else if(handle&&(node=discovery.getNode(handle)))plan={mode:'native-control',target:chosen,control:handle,planRevision};
  else if(chosen.kind==='resolved')plan={mode:'href',target:chosen,disposition:risk.state==='clear'?'same-tab':'new-tab-preserve-current',planRevision};
  else return unavailable('stale-native-handle');
  freeze(plan);const targetKey='plan_'+nonce+'_'+planRevision;const entry={plan,targetKey,risk:riskAtIssue,url:issuedURL,node,expiresAt:now()+30000};
  if(plans.size>=256)plans.delete(plans.keys().next().value);plans.set(targetKey,entry);certificates.set(plan,targetKey);return plan;
 }
 function planKey(plan){const key=certificates.get(plan);return key&&plans.get(key)?.plan===plan?key:null;}
 const blocked=reason=>({state:'blocked',reason});
 function valid(entry){
  if(plans.get(entry.targetKey)!==entry||now()>=entry.expiresAt||currentURL()!==entry.url||riskKey(inputRisk())!==entry.risk)return false;
  if(entry.plan.mode==='same-target'){const proof=bodyProof();return proof?.conversationId===entry.plan.target.nativeId&&proof?.bodyProofId===entry.plan.bodyProofId&&urlPolicy.sameTarget(currentURL(),entry.plan.target.navigationURL);}
  if(entry.plan.mode==='native-control')return discovery.getNode(entry.plan.control)===entry.node&&entry.node?.isConnected===true;
  return true;
 }
 async function dispatchNative(dto){
  if(!exact(dto,['actionId','uiGrantId','mountId','planRevision','targetKey'])||!id(dto.actionId)||!id(dto.uiGrantId)||!id(dto.mountId)||typeof dto.targetKey!=='string'||!Number.isSafeInteger(dto.planRevision))return blocked('invalid-navigation-command');
  if(actions.has(dto.actionId))return blocked('action-already-used');if(actions.size>=1024)return blocked('action-capacity');
  const entry=plans.get(dto.targetKey);if(!entry||entry.plan.planRevision!==dto.planRevision)return blocked('unknown-navigation-plan');
  const command=Object.freeze({...dto});actions.set(dto.actionId,true);
  try{
   if(await authorize(command)!==true)return blocked('unauthorized-navigation');
   if(!valid(entry))return blocked('stale-navigation-plan');
   if(entry.plan.mode==='href')return blocked('renderer-default-required');
   await beforeDispatch(entry.plan);
   if(await authorize(command)!==true)return blocked('unauthorized-navigation');
   if(!valid(entry))return blocked('stale-navigation-plan');
   if(entry.plan.mode==='same-target')return {state:'already-current',actionId:dto.actionId};
   // Marked before every await: a lost acknowledgement cannot trigger a second click.
   entry.node.click();return {state:'dispatched',actionId:dto.actionId};
  }catch{return {state:'unconfirmed',reason:'native-dispatch-unconfirmed'};}
 }
 return Object.freeze({planNavigation,planKey,dispatchNative});
}
