import {digest} from '../data/hash.mjs';
import {tokenOK,isRecord} from '../b1/identity.mjs';
const CAPACITY=20000;
const fail=()=>{throw Error('evidence-source-incarnation-conflict');};
/** Persistence identity only, never authority. Inspect the entire reserved family
 * in one scoped, repository-validated source snapshot before choosing a member. */
export function evidenceSourceFamily(sources,profile,codecVersion){
 if(!isRecord(sources)||!tokenOK(profile?.id)||!Number.isSafeInteger(profile.revision)||profile.revision<1||![1,2].includes(codecVersion))fail();
 const entries=Object.entries(sources),base=(codecVersion===1?'host_ack_':'host_history_')+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
 if(entries.length>CAPACITY)throw Error('free-evidence-capacity');
 const family=new Map();
 for(const [key,row] of entries){
  if(!key.startsWith(base)&&!(typeof row?.id==='string'&&row.id.startsWith(base)))continue;
  const suffix=key.slice(base.length),incarnation=suffix===''?0:/^_r[1-9][0-9]*$/.test(suffix)?Number(suffix.slice(2)):NaN;
  if(!Number.isSafeInteger(incarnation)||incarnation<0||incarnation>=CAPACITY||family.has(incarnation)||row?.id!==key||row.channel!=='host-evidence'||row.codecVersion!==codecVersion||row.profileId!==profile.id||row.profileVersion!==profile.revision||row.generation!==generation+(incarnation?'_recovery_'+incarnation:'')||typeof row.revoked!=='boolean'||!Number.isSafeInteger(row.sourceRevision)||row.sourceRevision<1)fail();
  family.set(incarnation,row);
 }
 let active=null;
 for(let incarnation=0;incarnation<family.size;incarnation++){
  const row=family.get(incarnation);if(!row||active)fail();
  if(!row.revoked)active=row;
 }
 return {base,generation,count:entries.length,incarnations:family.size,active};
}
/** Allocate only as part of a fresh private owner request under existing CAS.
 * Ordinary TTL/restart reuses the active incarnation. No predecessor is changed. */
export function evidenceSourceIncarnation(sources,profile,codecVersion){
 const family=evidenceSourceFamily(sources,profile,codecVersion),active=family.active;
 if(active){if(active.sourceRevision===Number.MAX_SAFE_INTEGER)throw Error('free-evidence-revision-exhausted');return {sourceId:active.id,generation:active.generation,sourceRevision:active.sourceRevision+1,incarnation:family.incarnations-1};}
 if(family.count>=CAPACITY)throw Error('free-evidence-capacity');
 const incarnation=family.incarnations;
 return {sourceId:family.base+(incarnation?'_r'+incarnation:''),generation:family.generation+(incarnation?'_recovery_'+incarnation:''),sourceRevision:1,incarnation};
}
