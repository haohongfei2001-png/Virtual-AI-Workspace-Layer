import {validateCandidateMigration} from './candidate-presentation.mjs';
/** Client-local presentation state only; caller owns grant/scope and return authorization. */
export function createFrameCandidateMigration({reveal,restoreCandidates,now=Date.now}={}){
 if(typeof reveal!=='function'||typeof restoreCandidates!=='function'||typeof now!=='function')throw Error('invalid-candidate-migration-client');
 let pending=null,interrupted=false,applying=false;const consumed=new Set();
 const finish=entry=>{consumed.add(entry.dto.id);if(pending===entry)pending=null;};
 const expired=entry=>{const time=now();if(!Number.isFinite(time)||time<entry.lastTime||time-entry.started>=30000)return true;entry.lastTime=time;return false;};
 function offer(value){const dto=validateCandidateMigration(value);if(consumed.has(dto.id))return false;
  if(pending?.dto.id===dto.id){if(dto.projectId!==pending.dto.projectId||JSON.stringify(dto.presentation)!==JSON.stringify(pending.dto.presentation))return false;if(expired(pending)){finish(pending);return false;}pending.dto=dto;return true;}
  if(pending)finish(pending);
  // Never evict replay tombstones within a client session.
  if(consumed.size>=32)return false;const started=now();if(!Number.isFinite(started))return false;pending={dto,started,lastTime:started,restored:false};return true;
 }
 function apply(){const entry=pending;if(!entry||applying)return false;if(interrupted){finish(entry);return false;}if(expired(entry)){finish(entry);return false;}if(!entry.dto.ready)return false;applying=true;
  try{if(!entry.restored){entry.restored=true;restoreCandidates(entry.dto.presentation);}if(pending!==entry||expired(entry)||!entry.dto.ready)return false;
   const result=reveal({projectId:entry.dto.projectId,focus:entry.dto.presentation.focused&&entry.dto.focusAllowed&&!interrupted});
   if(pending!==entry)return false;if(result!==true)return false;finish(entry);return true;
  }catch{return false;}finally{applying=false;}
 }
 return Object.freeze({offer,apply,revoke(){if(pending)finish(pending);},interrupt(){interrupted=true;},clear(){pending=null;consumed.clear();interrupted=false;}});
}
