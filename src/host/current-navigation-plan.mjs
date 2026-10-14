import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Shape only. Current-body and UI authority are independently checked by owners. */
export function isCurrentNavigationPlan(plan){
 const target=plan?.target;
 return exactHostRecord(plan,['mode','target','bodyProofId','planRevision'])&&plan.mode==='same-target'&&tokenOK(plan.bodyProofId)&&Number.isSafeInteger(plan.planRevision)&&plan.planRevision>0&&exactHostRecord(target,['kind','entity','nativeId','navigationURL','liveHandle'])&&target.kind==='resolved'&&target.entity==='conversation'&&tokenOK(target.nativeId)&&typeof target.navigationURL==='string'&&target.navigationURL.length<=2048&&target.liveHandle===null;
}
