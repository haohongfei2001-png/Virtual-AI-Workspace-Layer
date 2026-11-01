import {digest} from '../data/hash.mjs';
import {hostNativeChannel} from '../data/native-facts.mjs';
/** Select persistence identity only. This never supplies observation authority.
 * A revoked or older-profile incarnation is never upgraded in place; only a
 * fresh owner-validated batch may create its successor in the existing CAS. */
export function nativeSourceIncarnation(sources,profile){
 const base='host_dom_'+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
 const count=Object.keys(sources).length;
 for(let incarnation=0;incarnation<20000;incarnation++){
  const sourceId=base+(incarnation?'_r'+incarnation:''),nextGeneration=generation+(incarnation?'_recovery_'+incarnation:'');
  const source=sources[sourceId];
  if(!source){if(count>=20000)throw Error('native-facts-capacity');return {sourceId,generation:nextGeneration,sourceRevision:1,requiresObservation:true};}
  const version=source.admission?.profileVersion;
  const historicalGeneration='profile_'+version+(incarnation?'_recovery_'+incarnation:'');
  if(source.id!==sourceId||!hostNativeChannel(source.channel)||source.admission?.profileId!==profile.id||!Number.isSafeInteger(version)||version<1||version>profile.revision||source.generation!==historicalGeneration||typeof source.revoked!=='boolean')throw Error('native-source-incarnation-conflict');
  // Retain old source/field witnesses verbatim. A supported profile revision
  // may publish newly observed fields under a separate source, not relabel
  // cached facts as observations made by the new parser.
  if(version<profile.revision)continue;
  if(source.revoked===false)return {sourceId,generation:nextGeneration,sourceRevision:source.sourceRevision+1,requiresObservation:false};
  if(source.revoked!==true)throw Error('native-source-incarnation-conflict');
 }
 throw Error('native-facts-capacity');
}
