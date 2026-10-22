import {digest} from '../data/hash.mjs';
import {hostNativeChannel} from '../data/native-facts.mjs';
/** Select persistence identity only. This never supplies observation authority.
 * A revoked incarnation stays revoked; only a fresh owner-validated batch may
 * create its successor, in the repository's existing revision CAS. */
export function nativeSourceIncarnation(sources,profile){
 const base='host_dom_'+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
 const count=Object.keys(sources).length;
 for(let incarnation=0;incarnation<20000;incarnation++){
  const sourceId=base+(incarnation?'_r'+incarnation:''),nextGeneration=generation+(incarnation?'_recovery_'+incarnation:'');
  const source=sources[sourceId];
  if(!source){if(count>=20000)throw Error('native-facts-capacity');return {sourceId,generation:nextGeneration,sourceRevision:1,requiresObservation:true};}
  if(source.id!==sourceId||!hostNativeChannel(source.channel)||source.generation!==nextGeneration||source.admission?.profileId!==profile.id||source.admission?.profileVersion!==profile.revision)throw Error('native-source-incarnation-conflict');
  if(source.revoked===false)return {sourceId,generation:nextGeneration,sourceRevision:source.sourceRevision+1,requiresObservation:false};
  if(source.revoked!==true)throw Error('native-source-incarnation-conflict');
 }
 throw Error('native-facts-capacity');
}
