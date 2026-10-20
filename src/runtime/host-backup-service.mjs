import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {BACKUP_TYPES,BACKUP_MAX_BYTES,BACKUP_CHUNK_BYTES,BACKUP_TRANSFER_TTL,BACKUP_MAX_TRANSFERS,backupByteLengthOK,encodeBackupChunk,decodeBackupChunk} from '../host/backup-transfer.mjs';
const extras=[[],['transferId','index'],['byteLength'],['transferId','index','data'],['transferId'],['transferId','planId','operationId'],['transferId']];
/** User-driven human-asset transfer. All bundles/plans stay in bounded worker RAM. */
export function createHostBackupService({ui,workspaceRepository,onRestored=null,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(typeof ui?.withScope!=='function'||!['exportBackup','previewRestore','restoreBackup'].every(k=>typeof workspaceRepository?.[k]==='function')||onRestored!==null&&typeof onRestored!=='function')throw Error('invalid-host-backup-service');
 const transfers=new Map(),attempts=new Set();let stopped=false,scopeWork=0;
 // The RPC deadline may settle before authorization or repository work does.
 async function trackScope(work){scopeWork++;try{return await work();}finally{scopeWork--;}}
 const failure=()=>({ok:false,reason:'backup-unavailable'});
 function liveTransfer(t){const now=elapsedNow();try{return !stopped&&transfers.get(t.id)===t&&Number.isFinite(now)&&now>=t.created&&now<t.until&&t.isCurrent()===true;}catch{return false;}}
 // Retire only this transfer's restore owner; keep in-flight accounting until settle.
 function retire(t){if(transfers.get(t.id)!==t)return;transfers.delete(t.id);t.restoreAttempt?.abort.abort();}
 function info(t){return {ok:true,transferId:t.id,byteLength:t.length,chunkBytes:BACKUP_CHUNK_BYTES,chunkCount:Math.ceil(t.length/BACKUP_CHUNK_BYTES)};}
 function stop(){stopped=true;transfers.clear();for(const a of attempts){a.active=false;a.abort.abort();}attempts.clear();}
 async function handle(input,sender){
  if(stopped)return failure();let m;try{m=structuredClone(input);sender=structuredClone(sender);}catch{return failure();}
  const kind=BACKUP_TYPES.indexOf(m?.type),base=['v','type','grantId','mountId'];if(kind<0||!exactHostRecord(m,[...base,...extras[kind]])||m.v!==1||!tokenOK(m.grantId)||!tokenOK(m.mountId)||extras[kind].includes('transferId')&&!tokenOK(m.transferId)||kind===2&&!backupByteLengthOK(m.byteLength)||[1,3].includes(kind)&&(!Number.isSafeInteger(m.index)||m.index<0)||kind===5&&(!tokenOK(m.planId)||!tokenOK(m.operationId)))return failure();
  const a={active:true,abort:new AbortController(),started:elapsedNow(),created:null};attempts.add(a);
  const active=()=>!stopped&&a.active&&!a.abort.signal.aborted&&Number.isFinite(elapsedNow())&&elapsedNow()>=a.started&&elapsedNow()-a.started<6000;
  try{const result=await withRequestDeadline(()=>trackScope(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async c=>{
   const guard=()=>active()&&c.isCurrent()===true,check=()=>{if(!guard())throw Error('backup-expired');};check();
   for(const t of transfers.values())if(!liveTransfer(t))retire(t);
   const matches=t=>t.scopeKey===c.scope.key&&t.scopeGrantId===c.scopeGrantId&&t.grantId===m.grantId&&t.mountId===m.mountId;
   let t;
   if(kind===0||kind===2){
    if(transfers.size>=BACKUP_MAX_TRANSFERS)throw Error('capacity');const id=makeId();if(!tokenOK(id)||transfers.has(id))throw Error('invalid-id');const created=elapsedNow();
    t={id,uiDocumentId:sender.documentId,parentDocumentId:c.parentFrame?.documentId,scopeKey:c.scope.key,scopeGrantId:c.scopeGrantId,grantId:m.grantId,mountId:m.mountId,isCurrent:c.isCurrent,created,until:created+BACKUP_TRANSFER_TTL,direction:kind===0?'export':'upload',length:kind===2?m.byteLength:0,bytes:null,next:0,plan:null,pending:null};transfers.set(id,t);a.created=t;
    if(kind===0){const bundle=await workspaceRepository.exportBackup(c.scope,{guard:()=>guard()&&liveTransfer(t),signal:a.abort.signal});check();if(!liveTransfer(t))throw Error('transfer-expired');const text=JSON.stringify(bundle);if(typeof text!=='string'||text.length>BACKUP_MAX_BYTES)throw Error('oversize');t.bytes=new TextEncoder().encode(text);if(!backupByteLengthOK(t.bytes.length))throw Error('oversize');t.length=t.bytes.length;}else t.bytes=new Uint8Array(t.length);
    check();return info(t);
   }
   t=transfers.get(m.transferId);if(!t||!matches(t)||!liveTransfer(t))throw Error('invalid-transfer');
   const transferGuard=()=>guard()&&liveTransfer(t),fence=()=>{if(!transferGuard())throw Error('transfer-expired');};
   if(kind===6){retire(t);return {ok:true};}
   if(kind===1){if(t.direction!=='export'||!t.bytes||m.index>=Math.ceil(t.length/BACKUP_CHUNK_BYTES))throw Error('invalid-chunk');return {ok:true,transferId:t.id,index:m.index,data:encodeBackupChunk(t.bytes.subarray(m.index*BACKUP_CHUNK_BYTES,Math.min(t.length,(m.index+1)*BACKUP_CHUNK_BYTES)))};}
   if(kind===3){if(t.direction!=='upload'||m.index>t.next||m.index>=Math.ceil(t.length/BACKUP_CHUNK_BYTES))throw Error('invalid-chunk');const chunk=decodeBackupChunk(m.data),offset=m.index*BACKUP_CHUNK_BYTES,expected=Math.min(BACKUP_CHUNK_BYTES,t.length-offset);if(chunk.length!==expected)throw Error('invalid-chunk');if(m.index<t.next){for(let i=0;i<chunk.length;i++)if(t.bytes[offset+i]!==chunk[i])throw Error('chunk-conflict');}else{if(t.plan||t.pending)throw Error('transfer-busy');t.bytes.set(chunk,offset);t.next++;}return {ok:true,transferId:t.id,index:m.index};}
   if(t.direction!=='upload'||t.next!==Math.ceil(t.length/BACKUP_CHUNK_BYTES))throw Error('incomplete-upload');
   if(kind===4){
    if(t.pending)throw Error('transfer-busy');if(t.plan)return {ok:true,transferId:t.id,planId:t.plan.id,summary:{...t.plan.summary},evidenceImported:false};
    const marker={};t.pending=marker;
    try{const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(t.bytes)),plan=await workspaceRepository.previewRestore(c.scope,bundle,{guard:transferGuard,signal:a.abort.signal});fence();const keys=['added','updated','keptHuman','keptNewer'];if(!exactHostRecord(plan.summary,keys)||!keys.every(k=>Number.isSafeInteger(plan.summary[k])&&plan.summary[k]>=0)||plan.evidenceImported!==false||typeof plan.planHash!=='string'||!/^[0-9a-f]{64}$/.test(plan.planHash)||!Number.isSafeInteger(plan.expectedRevision)||plan.expectedRevision<0)throw Error('invalid-plan');const id=makeId();if(!tokenOK(id))throw Error('invalid-plan');t.plan={id,bundle,planHash:plan.planHash,expectedRevision:plan.expectedRevision,summary:{...plan.summary}};return {ok:true,transferId:t.id,planId:id,summary:{...plan.summary},evidenceImported:false};}finally{if(t.pending===marker)t.pending=null;}
   }
   if(!t.plan||m.planId!==t.plan.id)throw Error('invalid-plan');
   if(t.pending){if(t.operationId!==m.operationId||!(t.pending instanceof Promise))throw Error('restore-conflict');const result=await t.pending;check();return result;}
   t.operationId=m.operationId;const plan=t.plan;t.restoreAttempt=a;
   t.pending=(async()=>{try{const result=await workspaceRepository.restoreBackup(c.scope,{operationId:m.operationId,expectedRevision:plan.expectedRevision,bundle:plan.bundle,planHash:plan.planHash},{guard:transferGuard,signal:a.abort.signal});fence();if(result?.ok!==true)throw Error('restore-failed');transfers.delete(t.id);try{await onRestored?.(c.scope.key);}catch{}check();return {ok:true};}catch(error){transfers.delete(t.id);throw error;}})();return await t.pending;
  })),{timeoutMs:6000,now:elapsedNow,schedule,cancel});a.created=null;return result;}catch{return failure();}finally{a.active=false;a.abort.abort();attempts.delete(a);if(a.created)transfers.delete(a.created.id);for(const [id,t]of transfers)if(t.restoreAttempt===a)transfers.delete(id);}
 }
 function revokeDocument(id){for(const t of transfers.values())if(t.uiDocumentId===id||t.parentDocumentId===id)retire(t);}
 // Local quietness only; retained user work blocks even after its TTL.
 function isIdle(){return !stopped&&scopeWork===0&&attempts.size===0&&transfers.size===0;}
 return Object.freeze({handle,stop,isIdle,revokeDocument});
}
