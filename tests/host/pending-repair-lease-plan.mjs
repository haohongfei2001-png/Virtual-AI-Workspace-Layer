/** TEST ONLY finite preparation and read ledger. Production owns every reserve. */
import {assertPendingRepairBudget} from './existing-source-pending-repair-oracle.mjs';
const fail=reason=>{throw Error('PENDING_REPAIR_PRECONDITION_NOT_ESTABLISHED:'+reason);};
export function pendingRepairLeaseBounds(state){
 const values=[];let count=0;
 for(const table of ['projects','refs','membership'])for(const row of Object.values(state.native[table])){
  if(++count>512)fail('ROW_LIMIT');const source=state.native.sources[row.sourceId];
  if(!source||source.revoked||source.channel!=='host-dom')fail('NATIVE_SOURCE');
  for(const value of [row.validUntil,source.validUntil]){const time=Date.parse(value);if(!Number.isSafeInteger(time))fail('LEASE_TIME');values.push(time);}
 }
 if(!values.length)fail('EMPTY_NATIVE');return {earliest:Math.min(...values),latest:Math.max(...values)};
}
function budget(state,requests,attempts){const b=assertPendingRepairBudget(state.budget);if(b.requests!==requests||b.attemptCounts.length!==1||b.attemptCounts[0]!==attempts)fail('UNPLANNED_READ');return b;}
export function initialPendingRepairPlan(state,at){
 if(!Number.isSafeInteger(at))fail('CLOCK');if(state.continuations.some(p=>p.state==='pending-evidence'))fail('PRIOR_PENDING');
 const b=budget(state,3,1),lease=pendingRepairLeaseBounds(state),end=b.startedAt+30000;
 if(at<b.lastAt||end-at<12000||end+18000>=lease.earliest)fail('LEASE_HEADROOM');
 return {windowStartedAt:b.startedAt,windowEndsAt:end,leaseUntil:lease.earliest};
}
export async function waitPendingRepairBoundary(until,{now=Date.now,monotonicNow=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const wall=now(),start=monotonicNow();if(!Number.isSafeInteger(until)||!Number.isFinite(wall)||until-wall>60000)fail('WAIT_BOUND');const allowance=Math.max(0,until-wall)+1001;let prior=start;
 for(let i=0;i<10000;i++){const tick=monotonicNow(),at=now();if(!Number.isFinite(tick)||tick<prior||!Number.isFinite(at)||tick-start>allowance)fail('WAIT_CLOCK');prior=tick;if(at>until)return;if(tick-start>=allowance)fail('WAIT_DEADLINE');await sleep(Math.min(1000,Math.max(1,until-at+1),allowance-(tick-start)));}fail('WAIT_STALLED');
}
export async function preparePendingRepairLease({read,reload,now=Date.now,wait=waitPendingRepairBoundary}){
 let state=await read();try{return {plan:initialPendingRepairPlan(state,now()),reloaded:false};}catch(error){if(!error.message.endsWith(':LEASE_HEADROOM'))throw error;}
 if(state.continuations.some(p=>p.state==='pending-evidence'))fail('PRIOR_PENDING');
 const lease=pendingRepairLeaseBounds(state);await wait(lease.latest);await reload();state=await read();
 return {plan:initialPendingRepairPlan(state,now()),reloaded:true};
}
export function checkPendingRepairRead(plan,state,phase,at){
 const expected={FIRST:[3,1],SECOND:[6,2],CUT:[9,3],CORRUPT:[9,3],DRAIN:[3,1],REPEAT:[6,2],FINAL:[9,3]}[phase];if(!expected)fail('PHASE');const b=budget(state,...expected);
 const old=['FIRST','SECOND','CUT','CORRUPT'].includes(phase);
 if(old?b.startedAt!==plan.windowStartedAt:b.startedAt<=plan.windowEndsAt)fail('WINDOW_CHANGED');
 if(!Number.isSafeInteger(at)||at<b.lastAt)fail('CLOCK');
 if(phase==='DRAIN'){if(plan.nextWindowStartedAt!==undefined&&plan.nextWindowStartedAt!==b.startedAt)fail('WINDOW_CHANGED');plan.nextWindowStartedAt=b.startedAt;}
 if(['REPEAT','FINAL'].includes(phase)&&b.startedAt!==plan.nextWindowStartedAt)fail('WINDOW_CHANGED');
 const admissionMs={FIRST:12000,SECOND:6000,CUT:0,CORRUPT:18000,DRAIN:12000,REPEAT:6000,FINAL:0}[phase];
 const admissionAt=phase==='CORRUPT'?Math.max(at,plan.windowEndsAt+1):at;
 if(admissionAt+admissionMs>=plan.leaseUntil)fail('LEASE_HEADROOM');
 if(['FIRST','SECOND'].includes(phase)&&b.startedAt+30000-at<6000)fail('READ_WINDOW_HEADROOM');
 if(['DRAIN','REPEAT'].includes(phase)&&b.startedAt+30000-at<6000)fail('READ_WINDOW_HEADROOM');
 return b;
}
