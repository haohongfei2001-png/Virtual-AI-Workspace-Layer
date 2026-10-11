import { normalizedScope } from '../b1/identity.mjs';
import { digest, stable } from './hash.mjs';
import { emptyState, validateState, TABLES, exact, id } from './state.mjs';
const ASSETS=['refs','workspaces','placements','identities','preferences'];
/** Explicit portable manual/reference backup, not an evidence or authorization transfer. */
export function assetState(state){validateState(state,state.scopeKey);const out={...state,sources:{},events:{},coverage:{},channel:'none'};return structuredClone(validateState(out,state.scopeKey));}
export function createBackup(state){const payload=assetState(state);return {format:'vaiwl-assets',version:1,payload,checksum:digest(payload)};}
export function parseBackup(bundle,scope){const s=normalizedScope(scope);if(!s)throw Error('unverified-scope');
 exact(bundle,['format','version','payload','checksum']);if(bundle.format!=='vaiwl-assets'||bundle.version!==1)throw Error('unsupported-backup-version');
 if(stable(bundle).length>17*1024*1024)throw Error('backup-too-large');
 if(typeof bundle.checksum!=='string'||digest(bundle.payload)!==bundle.checksum)throw Error('corrupt-backup');
 const state=validateState(bundle.payload,s.key);if(state.channel!=='none'||Object.keys(state.sources).length||Object.keys(state.events).length||Object.keys(state.coverage).length)throw Error('backup-evidence-denied');
 const keys={refs:['id','nativeUrl','projectId','nativeTitle','available'],workspaces:['id','name','icon','order','locked','owner','revision','aliases','seedIndex'],placements:['id','workspaceId','refId','excluded','order','locked','owner','revision'],identities:['id','title','aliases','locked','owner','revision'],preferences:['id','value','owner','revision']};
 for(const table of ASSETS)for(const row of Object.values(state[table]))if(Object.keys(row).some(k=>!keys[table].includes(k)))throw Error('backup-unknown-field');
 return structuredClone(state);
}
export function previewBackup(current,bundle,scope){validateState(current,current.scopeKey);const incoming=parseBackup(bundle,scope),next=structuredClone(current),summary={added:0,updated:0,keptHuman:0,keptNewer:0};
 for(const table of ASSETS)for(const [key,row] of Object.entries(incoming[table])){
  const live=next[table][key];
  if(table==='refs'){if(live&&(live.nativeUrl!==row.nativeUrl||live.projectId!==row.projectId))throw Error('native-reference-conflict');if(live)continue;}
  if(live&&stable(live)===stable(row))continue;
  if(live&&(live.owner==='human'||live.locked)){summary.keptHuman++;continue;}
  if(live&&row.owner!=='human'){summary.keptNewer++;continue;}
  next[table][key]=structuredClone(row);summary[live?'updated':'added']++;
 }
 // Mark restored artifacts as human intent and retain original backup revision only in its file.
 for(const table of ASSETS.filter(t=>t!=='refs'))for(const [key,row] of Object.entries(next[table]))if(stable(current[table][key]??null)!==stable(row)){row.owner='human';row.revision=current.revision+1;if('locked'in row)row.locked=true;}
 next.revision=current.revision+1;validateState(next,current.scopeKey);
 const planHash=digest({current,backup:bundle.checksum,next,summary});return {next,summary,planHash,expectedRevision:current.revision,evidenceImported:false};
}
/** Recover human patches after the checkpoint, without executing any original command. */
export function recoverAssets(checkpoint,logs,scopeKey){const state=structuredClone(validateState(checkpoint,scopeKey));let highWater=state.revision,restoredHumanChanges=0;
 for(const log of logs){if(log.scopeKey!==scopeKey||!Number.isSafeInteger(log.resultRevision)||log.resultRevision<1)throw Error('corrupt-operation-history');highWater=Math.max(highWater,log.resultRevision);}
 const later=logs.filter(l=>l.resultRevision>state.revision).sort((a,b)=>a.resultRevision-b.resultRevision);let revision=state.revision;
 for(const log of later){if(log.baseRevision!==revision||log.resultRevision!==revision+1||log.invalidatedBy)throw Error('recovery-journal-gap');
  if(log.actor==='human'){
   if(!Array.isArray(log.patch))throw Error('corrupt-human-history');
   for(const p of log.patch){exact(p,['table','key','before','after']);if(!TABLES.includes(p.table))throw Error('corrupt-human-history');id(p.key);
    if(stable(state[p.table][p.key]??null)!==stable(p.before))throw Error('recovery-human-conflict');
    if(p.after===null)delete state[p.table][p.key];else state[p.table][p.key]=structuredClone(p.after);restoredHumanChanges++;
   }
  }
  revision=log.resultRevision;state.revision=revision;validateState(state,scopeKey);
 }
 if(highWater>=Number.MAX_SAFE_INTEGER)throw Error('revision-exhausted');
 for(const source of Object.values(state.sources))source.revoked=true;
 state.revision=highWater+1;validateState(state,scopeKey);return {state,highWater,restoredHumanChanges};
}
