/** TEST ONLY bounded projection of an already-read state; never authorizes work. */
import {assertPendingRepairBudget} from './existing-source-pending-repair-oracle.mjs';
const phases=['PREPARATION','FIRST','SECOND_CAPACITY','SECOND_SEND','CUT','CORRUPT','CORRUPT_WAITED','DRAIN','REPEAT','FINAL'];
const time=v=>Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000?v:null;
export function pendingRepairReadDiagnostic(state,phase,at){
 if(!phases.includes(phase))throw Error('pending-repair-diagnostic-phase');
 const out={phase,capturedAt:time(at),atomicity:'EXISTING_MULTI_READ_NOT_ATOMIC',budget:{status:'UNAVAILABLE'},leases:{status:'UNAVAILABLE'}};
 try{const b=assertPendingRepairBudget(state.budget);if(time(b.startedAt)===null||time(b.lastAt)===null)throw Error();out.budget={status:'AVAILABLE',checksumValid:true,startedAt:b.startedAt,lastAt:b.lastAt,requests:b.requests,attemptCounts:[...b.attemptCounts]};}catch{}
 try{
  const rows=['projects','refs','membership'].flatMap(k=>Object.values(state.native[k]));
  if(!rows.length||rows.length>512)throw Error();
  const sources=[],expires=[];
  for(const row of rows){const source=state.native.sources[row.sourceId];if(!source||source.revoked||source.channel!=='host-dom')throw Error();const a=time(Date.parse(source.validUntil)),b=time(Date.parse(row.validUntil));if(a===null||b===null)throw Error();sources.push(a);expires.push(b);}
  const earliest=Math.min(...sources,...expires);
  out.leases={status:'AVAILABLE',rowCount:rows.length,sourceExpiryMin:Math.min(...sources),sourceExpiryMax:Math.max(...sources),rowExpiryMin:Math.min(...expires),rowExpiryMax:Math.max(...expires),earliestExpiresAt:earliest,expired:out.capturedAt===null?null:at>=earliest};
 }catch{}
 return out;
}
export function assertPendingRepairAuthority(before,current,sameDocument,at){
 if(sameDocument!==true||!before||!current||!before.grant||!before.scopeGrant||current.grant!==before.grant||current.scopeGrant!==before.scopeGrant||current.scope!==before.scope||current.currentRef!==before.currentRef||!Number.isSafeInteger(at)||!Number.isSafeInteger(current.grantExpiresAt)||current.grantExpiresAt<=at)throw Error('PENDING_REPAIR_PRECONDITION_NOT_ESTABLISHED:PRIOR_AUTHORITY');
}
