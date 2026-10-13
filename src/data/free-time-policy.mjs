import { instant, localDay } from '../navigation/projection.mjs';
export const FREE_HORIZONS = Object.freeze([7,14,30,60,90]);
export function createFreeViewSession({now,timeZone,H=30,policyRevision=0}) {
  if (!FREE_HORIZONS.includes(H) || typeof timeZone !== 'string' || !Number.isSafeInteger(policyRevision) || policyRevision<0) throw Error('invalid-free-policy');
  return Object.freeze({H,T:localDay(now,timeZone),Z:timeZone,policyRevision});
}
export function freeSegmentFor(value,session) {
  const n=instant(value); if(n===null)return null;
  const day=localDay(n,session.Z); return day>session.T?null:Math.floor((session.T-day)/session.H);
}
export function freeWindowFor(k,session) {
  if(!Number.isSafeInteger(k)||k<0)throw Error('invalid-segment');
  const end=session.T+1-session.H*k,fmt=n=>new Date(n*86400000).toISOString().slice(0,10);
  return {start:fmt(end-session.H),endExclusive:fmt(end)};
}
export function initialFreeTimePolicy({legacy=false,day=0}={}) {
  return {mode:legacy?'fixed':'auto',H:30,revision:0,lastChangedDay:day,lastEvaluatedDay:null,recommendation:null,confirmations:0,cooldownUntil:day};
}
export function setFreeHorizon(policy,H,day) {
  if(!FREE_HORIZONS.includes(H))throw Error('invalid-free-horizon');
  return {...policy,mode:'fixed',H,revision:policy.revision+1,lastChangedDay:day,recommendation:null,confirmations:0};
}
export function coolFreeTimePolicy(policy,day) {return {...policy,cooldownUntil:day+14,recommendation:null,confirmations:0};}
const loss=n=>2*Math.max(0,n-10)+Math.max(0,5-n);
/** Counts must cover distinct native Project IDs, never conversations or Pro overlays. */
export function evaluateFreeTimePolicy(policy,{day,counts,inventoryComplete,activityComplete,noProjectDominant=false,safeEntry=false,historyBrowsing=false}) {
  validateFreeTimePolicy(policy);
  if(!Number.isSafeInteger(day))throw Error('invalid-free-policy-day');
  if(policy.mode!=='auto'||!inventoryComplete||!activityComplete||noProjectDominant||day<policy.cooldownUntil)return policy;
  if(policy.recommendation!==null&&policy.confirmations>=2&&day-policy.lastChangedDay>=14&&safeEntry&&!historyBrowsing)
    return {...policy,H:policy.recommendation,revision:policy.revision+1,lastChangedDay:day,recommendation:null,confirmations:0,previousH:policy.H};
  // Applying a pending recommendation is not a new weekly sample. Do not
  // immediately write another decision and invalidate its short undo window.
  if(policy.previousH!==undefined&&policy.lastChangedDay===day)return policy;
  if(policy.lastEvaluatedDay!==null&&day-policy.lastEvaluatedDay<7)return policy;
  if(!FREE_HORIZONS.every(H=>Number.isSafeInteger(counts?.[H])&&counts[H]>=0)||FREE_HORIZONS.some((H,i)=>i&&counts[H]<counts[FREE_HORIZONS[i-1]]))throw Error('invalid-free-density');
  const ranked=[...FREE_HORIZONS].sort((a,b)=>loss(counts[a])-loss(counts[b])||(a===policy.H?-1:b===policy.H?1:0)||Math.abs(Math.log(a/policy.H))-Math.abs(Math.log(b/policy.H))||Math.abs(a-30)-Math.abs(b-30));
  let H=ranked[0];const oldLoss=loss(counts[policy.H]),threshold=counts[policy.H]===0&&counts[H]>0?1:Math.max(2,.25*oldLoss);
  if(FREE_HORIZONS.every(h=>counts[h]<5)||FREE_HORIZONS.every(h=>counts[h]>10)||oldLoss-loss(counts[H])<threshold)H=policy.H;
  const sameDirection=policy.recommendation!==null&&Math.sign(policy.recommendation-policy.H)===Math.sign(H-policy.H);
  const confirmations=H!==policy.H?(sameDirection?policy.confirmations+1:1):0;
  const next={...policy,lastEvaluatedDay:day,recommendation:H===policy.H?null:H,confirmations};
  if(confirmations>=2&&day-policy.lastChangedDay>=14&&safeEntry&&!historyBrowsing)return {...next,H,revision:policy.revision+1,lastChangedDay:day,recommendation:null,confirmations:0,previousH:policy.H};
  return next;
}
export function relocateFreeSegment({candidateDay},session) {
  return candidateDay===null||candidateDay===undefined?0:Math.max(0,Math.floor((session.T-candidateDay)/session.H));
}
export function validateFreeTimePolicy(policy) {
  const allowed=['mode','H','revision','lastChangedDay','lastEvaluatedDay','recommendation','confirmations','cooldownUntil','previousH'];
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(k=>!allowed.includes(k))||
    !['fixed','auto'].includes(policy.mode)||!FREE_HORIZONS.includes(policy.H)||!Number.isSafeInteger(policy.revision)||policy.revision<0||
    !Number.isSafeInteger(policy.lastChangedDay)||!(policy.lastEvaluatedDay===null||Number.isSafeInteger(policy.lastEvaluatedDay))||
    !(policy.recommendation===null||FREE_HORIZONS.includes(policy.recommendation))||!Number.isSafeInteger(policy.confirmations)||policy.confirmations<0||
    !Number.isSafeInteger(policy.cooldownUntil)||(policy.previousH!==undefined&&!FREE_HORIZONS.includes(policy.previousH)))throw Error('invalid-free-time-policy');
  return policy;
}

export function enableFreeAutoTimePolicy(policy,day) {
  validateFreeTimePolicy(policy);
  if(!Number.isSafeInteger(day))throw Error('invalid-free-policy-day');
  return {...policy,mode:'auto',revision:policy.revision+1,lastEvaluatedDay:null,recommendation:null,confirmations:0,lastChangedDay:day};
}
/** Build actual N(H) from unique native Projects; unknown samples never count as inactive. */
export function freeProjectDensity(snapshot,session,{inventoryComplete=false,membershipComplete=false}={}) {
  const unique=new Map(snapshot.projects.map(p=>[p.id,p]));
  const projects=[...unique.values()],counts=Object.fromEntries(FREE_HORIZONS.map(H=>[H,0]));
  let activityComplete=membershipComplete;
  for(const p of projects){
    const d=p.activityDecision??p.activity;
    if(!d||!['exact','interval'].includes(d.basis)||!Number.isSafeInteger(d.candidateDay)||d.candidateDay>session.T){activityComplete=false;continue;}
    let firstDay=d.candidateDay,lastDay=d.candidateDay;
    if(d.basis==='interval'){
      const from=instant(d.sentInterval?.from),through=instant(d.sentInterval?.through);
      if(from===null||through===null||from>through){activityComplete=false;continue;}
      firstDay=localDay(from,session.Z);lastDay=localDay(through,session.Z);
      if(lastDay>session.T||lastDay!==d.candidateDay){activityComplete=false;continue;}
    }
    for(const H of FREE_HORIZONS){
      const earliestInside=session.T-firstDay<H,latestInside=session.T-lastDay<H;
      if(earliestInside!==latestInside)activityComplete=false;
      // Count only guaranteed positives; uncertain ranges cannot certify N(H).
      if(earliestInside)counts[H]++;
    }
  }
  const projectMembers=new Set(projects.flatMap(p=>p.members.map(r=>typeof r==='string'?r:r.id)));
  return {counts,inventoryComplete,activityComplete,noProjectDominant:snapshot.noProject.length>projectMembers.size};
}
