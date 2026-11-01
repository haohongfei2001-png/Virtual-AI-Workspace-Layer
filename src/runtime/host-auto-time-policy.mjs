import {instant,localDay} from '../navigation/projection.mjs';
import {createFreeViewSession,validateFreeTimePolicy,freeProjectDensity,evaluateFreeTimePolicy} from '../data/free-time-policy.mjs';

const integer=value=>Number.isSafeInteger(value)&&value>=0;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const issued=new WeakSet();
function exactInventory(rows,versions,scope){
 if(!Array.isArray(rows)||!record(versions)||rows.length!==Object.keys(versions).length)return null;
 const result=new Map();
 for(const row of rows){
  if(!record(row)||typeof row.id!=='string'||!row.id||row.scope!==scope||result.has(row.id)||!Object.hasOwn(versions,row.id)||!integer(versions[row.id]))return null;
  result.set(row.id,row);
 }
 return result;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
/** Privileged complete-replica input only. This does not authorize a write: the
 * caller must retain its scope guard and atomically compare all three revisions. */
export function prepareHostAutoTimePolicy(snapshot,{now,timeZone}={}){
 try{
  const at=instant(now);
  if(at===null||!snapshot||typeof snapshot.scope!=='string'||!snapshot.scope||snapshot.inventoryComplete!==true||!snapshot.activityFreshness||snapshot.activityFreshness.evaluatedAt!==snapshot.evaluatedAt)return null;
  const evaluated=instant(snapshot.evaluatedAt);
  if(evaluated===null||at<evaluated||at-evaluated>=6000)return null;
  const saved=snapshot.preferences?.freeTimePolicy?.value;
  if(!saved||validateFreeTimePolicy(saved).mode!=='auto')return null;
  const session=createFreeViewSession({now,timeZone,H:saved.H,policyRevision:saved.revision});
  // The safe entry may advance the local date, but cannot reinterpret activity
  // in another timezone or adopt a policy older than the displayed session.
  if(snapshot.viewSession?.Z!==timeZone||!integer(snapshot.viewSession?.policyRevision)||saved.revision<snapshot.viewSession.policyRevision||saved.revision===snapshot.viewSession.policyRevision&&saved.H!==snapshot.viewSession.H)return null;
  if(localDay(evaluated,timeZone)!==session.T)return null;
  if(saved.lastChangedDay>session.T||saved.lastEvaluatedDay!==null&&saved.lastEvaluatedDay>session.T)return null;
  if(!integer(snapshot.workspaceRevision)||!integer(snapshot.revision)||typeof snapshot.evidenceRevision!=='string'||! /^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(snapshot.evidenceRevision))return null;
  const [workspaceRevision,evidenceRevision]=snapshot.evidenceRevision.split(':').map(Number);
  if(!integer(workspaceRevision)||!integer(evidenceRevision)||workspaceRevision!==snapshot.workspaceRevision)return null;
  const projects=exactInventory(snapshot.projects,snapshot.manifest?.projectVersions,snapshot.scope),refs=exactInventory(snapshot.refs,snapshot.manifest?.refVersions,snapshot.scope);
  if(!projects||!refs||!Array.isArray(snapshot.unknown)||snapshot.unknown.length||!Array.isArray(snapshot.noProject))return null;
  if(['omittedProjects','omittedRefs'].some(k=>snapshot[k]!==undefined&&(!Array.isArray(snapshot[k])||snapshot[k].length)))return null;
  const members=new Set();
  for(const p of projects.values()){
   if(p.membershipComplete!==true||!Array.isArray(p.members)||p.memberCount!==p.members.length)return null;
   for(const member of p.members){const id=typeof member==='string'?member:member?.id,row=refs.get(id);
    if(!row||members.has(id)||row.membership!=='PROJECT'||row.projectId!==p.id)return null;
    members.add(id);
   }
  }
  const none=new Set();
  for(const member of snapshot.noProject){const id=typeof member==='string'?member:member?.id,row=refs.get(id);if(!row||none.has(id)||members.has(id)||row.membership!=='NONE'||row.projectId!==null)return null;none.add(id);}
  if(members.size+none.size!==refs.size)return null;
  // A complete source/row deadline set is supplied by the replica owner, not
  // inferred from a header or a visible subset. Deadlines already expired at
  // evaluation were already excluded by projection and do not become fresh.
  if(!Array.isArray(snapshot.activityFreshness.deadlines))return null;
  let until=evaluated+6000;
  for(const value of snapshot.activityFreshness.deadlines){const deadline=instant(value);if(deadline===null)return null;if(deadline>evaluated)until=Math.min(until,deadline);}
  if(until<=at)return null;
  for(const row of [...projects.values(),...refs.values()])for(const value of [(row.activityDecision??row.activity)?.validUntil,(row.activityDecision??row.activity)?.nextCheck]){
   if(value===null||value===undefined)continue;
   const deadline=instant(value);if(deadline===null||deadline<=at)return null;until=Math.min(until,deadline);
  }
  const density=freeProjectDensity(snapshot,session,{inventoryComplete:true,membershipComplete:true});
  if(!density.activityComplete)return null;
  const policy=evaluateFreeTimePolicy(saved,{...density,day:session.T,safeEntry:true,historyBrowsing:false});
  if(JSON.stringify(policy)===JSON.stringify(saved))return null;
  const proposal=freeze({policy:structuredClone(policy),previousPolicy:structuredClone(saved),viewSession:createFreeViewSession({now,timeZone,H:policy.H,policyRevision:policy.revision}),expectedRevision:workspaceRevision,expectedActivityVersions:{nativeRevision:snapshot.revision,evidenceRevision},evaluatedAt:new Date(at).toISOString(),validUntil:new Date(until).toISOString()});
  issued.add(proposal);return proposal;
 }catch{return null;}
}
/** Same-RAM proposal only. Version/source changes still require the repository's
 * atomic expectedActivityVersions fence; this checks time without rereading data. */
export function hostAutoTimePolicyFresh(proposal,{now}={}){
 try{if(!issued.has(proposal))return false;const at=instant(now),from=instant(proposal.evaluatedAt),until=instant(proposal.validUntil);return at!==null&&at>=from&&at<until&&localDay(at,proposal.viewSession.Z)===proposal.viewSession.T;}catch{return false;}
}
