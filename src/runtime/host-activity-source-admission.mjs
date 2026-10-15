import {normalizedScope} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {validateSendAckProfile} from './send-ack-admission.mjs';
import {validateHistoricalSendProfile} from './historical-send-profile.mjs';
/** Private read-composition policy over evidence already validated by the scoped
 * repository. A stored channel label, checksum or DOM profile never enables it.
 * Only explicitly configured owner profiles are admitted; default is deny-all.
 * Freshness, event validity and coverage remain the existing projector's job. */
export function createHostActivitySourceAdmission({sendAckProfile=null,historicalSendProfile=null}={}){
 const owners=[];
 if(sendAckProfile){const p=validateSendAckProfile(sendAckProfile);owners.push({profile:p,codecVersion:1,sourceId:'host_ack_'+digest(p.id).slice(0,32)});}
 if(historicalSendProfile){const p=validateHistoricalSendProfile(historicalSendProfile);owners.push({profile:p,codecVersion:2,sourceId:'host_history_'+digest(p.id).slice(0,32)});}
 return (scope,source,origin)=>{
  const s=normalizedScope(scope);
  if(origin?.store!=='evidence'||!s||s.provider!=='chatgpt'||!source||source.channel!=='host-evidence'||source.revoked!==false)return false;
  return owners.some(({profile:p,codecVersion,sourceId})=>source.codecVersion===codecVersion&&source.id===sourceId&&source.profileId===p.id&&source.profileVersion===p.revision&&source.generation==='profile_'+p.revision);
 };
}
