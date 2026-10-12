import {aggregateFreeActivity} from './free-activity.mjs';
import {finish,finishAsync} from './cooperate.mjs';
const versions=(header,kind)=>header.manifest[kind+'Versions'];
const sessionKey=header=>JSON.stringify([header.viewSession?.H,header.viewSession?.T,header.viewSession?.Z,header.viewSession?.policyRevision]);
function validateHeader(header){
 if(!header||typeof header.scope!=='string'||!Number.isSafeInteger(header.revision)||header.revision<0||!header.manifest)throw Error('invalid-free-header');
 for(const kind of ['project','ref']){const map=versions(header,kind);if(!map||typeof map!=='object'||Array.isArray(map))throw Error('invalid-free-manifest');}
}
/** A plan is tied to the exact authority, native and evidence revisions. */
export function planFreeReplica(prior,header){
 validateHeader(header);const same=prior?.header.scope===header.scope,full=!same;
 const perRefActivity=!full&&header.manifest.activityVersions&&prior.header.manifest.activityVersions;
 const refreshEvidence=full||(!perRefActivity&&prior.header.evidenceRevision!==header.evidenceRevision)||prior.header.activitySourceRevision!==header.activitySourceRevision||prior.header.visibilityRevision!==header.visibilityRevision||prior.header.evaluatedAt!==header.evaluatedAt||sessionKey(prior.header)!==sessionKey(header);
 // Project visibility can change without changing a member's own version.
 // UNKNOWN rows deliberately hide their former parent, so any project change
 // requires rechecking those rows as well as the changed project's known members.
 const projectChanges=new Set();
 if(!full){for(const id of Object.keys(versions(header,'project')))if(versions(prior.header,'project')[id]!==versions(header,'project')[id])projectChanges.add(id);
  for(const id of Object.keys(versions(prior.header,'project')))if(!Object.hasOwn(versions(header,'project'),id))projectChanges.add(id);}
 const dependentRef=id=>{if(!projectChanges.size)return false;const row=prior?.refs.get(id);return row?.membership==='UNKNOWN'||row?.membership==='PROJECT'&&projectChanges.has(row.projectId);};
 const changed=kind=>Object.keys(versions(header,kind)).filter(id=>full||refreshEvidence||(kind==='ref'&&dependentRef(id))||(kind==='project'&&prior.header.membershipWitnessRevision!==header.membershipWitnessRevision)||versions(prior.header,kind)[id]!==versions(header,kind)[id]||(kind==='ref'&&perRefActivity&&prior.header.manifest.activityVersions[id]!==header.manifest.activityVersions[id]));
 return {scope:header.scope,revision:header.revision,evidenceRevision:header.evidenceRevision,sessionKey:sessionKey(header),full,rebuild:!full&&prior.header.inventoryComplete!==header.inventoryComplete,projects:changed('project'),refs:changed('ref')};
}
export function freeReplicaRequests(plan,limit=1000){
 if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw Error('invalid-free-page-limit');
 const requests=[];let p=0,r=0;
 while(p<plan.projects.length||r<plan.refs.length){const projects=plan.projects.slice(p,p+limit);p+=projects.length;const refs=plan.refs.slice(r,r+limit-projects.length);r+=refs.length;requests.push({projects,refs});}
 return requests;
}
function* assemble(prior,header,pages,plan){
 validateHeader(header);
 if(plan.scope!==header.scope||plan.revision!==header.revision||plan.evidenceRevision!==header.evidenceRevision||plan.sessionKey!==sessionKey(header))throw Error('stale-free-plan');
 if(!plan.full&&prior?.header.scope!==header.scope)throw Error('cross-scope-free-replica');
 const projects=new Map(),refs=new Map(),seenProjects=new Set(),seenRefs=new Set(),omittedProjects=new Set(plan.full?[]:prior.omittedProjects),omittedRefs=new Set(plan.full?[]:prior.omittedRefs);let count=0;
 for(const [kind,target] of [['project',projects],['ref',refs]])for(const id of Object.keys(versions(header,kind))){
   const old=plan.full?null:prior[kind==='project'?'projects':'refs'].get(id);if(old)target.set(id,old);if(++count%512===0)yield;
 }
 for(const [kind,omitted] of [['project',omittedProjects],['ref',omittedRefs]])for(const id of omitted)if(!Object.hasOwn(versions(header,kind),id))omitted.delete(id);
 for(const page of pages){
   if(page.scope!==header.scope||page.revision!==header.revision||page.evidenceRevision!==undefined&&page.evidenceRevision!==header.evidenceRevision)throw Error('stale-free-page');
   for(const [kind,ids,target,seen,omitted] of [['project',page.omittedProjects??[],projects,seenProjects,omittedProjects],['ref',page.omittedRefs??[],refs,seenRefs,omittedRefs]])for(const id of ids){if(!Object.hasOwn(versions(header,kind),id))throw Error('unknown-free-tombstone');target.delete(id);omitted.add(id);seen.add(id);}
   for(const [kind,rows,target,seen] of [['project',page.projects,projects,seenProjects],['ref',page.refs,refs,seenRefs]]){
     if(!Array.isArray(rows))throw Error('invalid-free-page');
     for(const row of rows){if(row.scope!==header.scope||!Object.hasOwn(versions(header,kind),row.id))throw Error('cross-scope-or-unknown-free-row');
       if(kind==='ref'&&!['PROJECT','NONE','UNKNOWN'].includes(row.membership))throw Error('invalid-free-membership');
       const omitted=kind==='project'?omittedProjects:omittedRefs;if(seen.has(row.id)&&(omitted.has(row.id)||JSON.stringify(target.get(row.id))!==JSON.stringify(row)))throw Error('conflicting-free-page-row');omitted.delete(row.id);target.set(row.id,row);seen.add(row.id);if(++count%512===0)yield;
     }
   }
 }
 if(plan.projects.some(id=>!seenProjects.has(id))||plan.refs.some(id=>!seenRefs.has(id)))throw Error('incomplete-free-pages');
 if(projects.size+omittedProjects.size!==Object.keys(header.manifest.projectVersions).length||refs.size+omittedRefs.size!==Object.keys(header.manifest.refVersions).length)throw Error('incomplete-free-replica');
 const cards=new Map([...projects].map(([id,p])=>[id,{...p,members:[]}])) ,noProject=[],unknown=[];
 for(const row of refs.values()){
   if(row.membership==='PROJECT'){const card=cards.get(row.projectId);if(!card)throw Error('missing-free-project-dependency');card.members.push(row);}
   else if(row.membership==='NONE')noProject.push(row);else unknown.push(row);if(++count%512===0)yield;
 }
 if(header.inventoryComplete===true&&!unknown.length)for(const p of cards.values())p.membershipComplete=p.memberCount==null?(!Object.hasOwn(p,'membershipComplete')&&!Object.hasOwn(p,'membershipWitnessCurrent')):p.membershipWitnessCurrent===true&&p.memberCount===p.members.length&&p.members.every(r=>p.membershipWitness&&r.membershipWitness&&['sourceId','generation','sourceRevision'].every(k=>p.membershipWitness[k]===r.membershipWitness[k]));
 const snapshot=aggregateFreeActivity({...header,viewMode:'free',refs:[...refs.values()],projects:[...cards.values()],noProject,unknown});
 return {header,projects,refs,omittedProjects,omittedRefs,snapshot};
}
export function assembleFreeReplica(prior,header,pages,plan=planFreeReplica(prior,header)){return finish(assemble(prior,header,pages,plan));}
export function assembleFreeReplicaAsync(prior,header,pages,plan,guard){return finishAsync(assemble(prior,header,pages,plan),guard);}
