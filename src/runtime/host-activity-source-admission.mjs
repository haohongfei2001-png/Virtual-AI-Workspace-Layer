import {normalizedScope} from '../b1/identity.mjs';
import {evidenceSourceFamily} from './evidence-source-incarnation.mjs';
import {validateSendAckProfile} from './send-ack-admission.mjs';
import {validateHistoricalSendProfile} from './historical-send-profile.mjs';
/** Private read-composition policy over evidence already validated by the scoped
 * repository. A stored channel label, checksum or DOM profile never enables it.
 * Only explicitly configured owner profiles are admitted; default is deny-all.
 * Freshness, event validity and coverage remain the existing projector's job. */
export function createHostActivitySourceAdmission({sendAckProfile=null,historicalSendProfile=null}={}){
 const owners=[];
 if(sendAckProfile){const p=validateSendAckProfile(sendAckProfile);owners.push({profile:p,codecVersion:1});}
 if(historicalSendProfile){const p=validateHistoricalSendProfile(historicalSendProfile);owners.push({profile:p,codecVersion:2});}
 // Per-composition snapshot preparation keeps chain validation O(sources), not
 // O(sources²). The closure is local to this synchronous read, never cached.
 function forSources(scope,origin){
  const s=normalizedScope(scope),allowed=new Map();
  if(origin?.store==='evidence'&&s?.provider==='chatgpt'&&origin.sources){
   for(const {profile,codecVersion} of owners){try{const active=evidenceSourceFamily(origin.sources,profile,codecVersion).active;if(active)allowed.set(active.id,active);}catch{/* A malformed family provides no activity authority. */}}
  }
  return source=>!!source&&source.revoked===false&&allowed.get(source.id)===source;
 }
 const admit=(scope,source,origin)=>forSources(scope,origin)(source);
 return Object.freeze(Object.assign(admit,{forSources}));
}
