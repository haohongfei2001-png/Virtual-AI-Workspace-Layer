import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Shape only. Current-body and UI authority are independently checked by owners. */
export function isCurrentNavigationPlan(plan){
 if(!exactHostRecord(plan,['mode','target','bodyProofId','planRevision']))return false;const target=plan.target;
 return plan.mode==='same-target'&&tokenOK(plan.bodyProofId)&&Number.isSafeInteger(plan.planRevision)&&plan.planRevision>0&&exactHostRecord(target,['kind','entity','nativeId','navigationURL','liveHandle'])&&target.kind==='resolved'&&target.entity==='conversation'&&tokenOK(target.nativeId)&&typeof target.navigationURL==='string'&&target.navigationURL.length<=2048&&target.liveHandle===null;
}
export function isResolvedControlNavigationPlan(plan){
 if(!exactHostRecord(plan,['mode','target','control','planRevision'])||plan.mode!=='native-control'||!Number.isSafeInteger(plan.planRevision)||plan.planRevision<1)return false;
 const target=plan.target,control=plan.control,keys=['id','documentToken','routeEpoch','regionEpoch','controlKind'];
 return exactHostRecord(target,['kind','entity','nativeId','navigationURL','liveHandle'])&&target.kind==='resolved'&&['project','conversation'].includes(target.entity)&&tokenOK(target.nativeId)&&typeof target.navigationURL==='string'&&target.navigationURL.length<=2048&&exactHostRecord(control,keys)&&tokenOK(control.id)&&tokenOK(control.documentToken)&&Number.isSafeInteger(control.routeEpoch)&&control.routeEpoch>=0&&Number.isSafeInteger(control.regionEpoch)&&control.regionEpoch>=0&&control.controlKind===target.entity&&exactHostRecord(target.liveHandle,keys)&&keys.every(key=>target.liveHandle[key]===control[key]);
}
