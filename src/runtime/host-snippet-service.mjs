import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
const fields=['refId','messageId','branchId','text','bodyHash'];
const token=v=>tokenOK(v)&&!['__proto__','constructor','prototype'].includes(v);
function anchor(value){if(!exactHostRecord(value,fields)||!['refId','messageId','branchId'].every(k=>token(value[k]))||typeof value.text!=='string'||!value.text.trim()||value.text.length>2000||typeof value.bodyHash!=='string'||!/^[a-f0-9]{64}$/.test(value.bodyHash))throw Error('invalid-anchor');return Object.freeze({...value});}
/** Worker owner only. Frames name a ref or saved asset; selected text is obtained
 * exclusively through the injected privileged content bridge. */
export function createHostSnippetService({ui,workspaceRepository,resolveView,selectionBridge,onChanged=null,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(typeof ui?.withScope!=='function'||typeof workspaceRepository?.command!=='function'||typeof resolveView!=='function'||typeof selectionBridge!=='function'||onChanged!==null&&typeof onChanged!=='function')throw Error('invalid-host-snippet-service');
 let stopped=false;const attempts=new Set(),busy=new Set(),failure=()=>({ok:false,reason:'snippet-unavailable'});
 async function handle(input,sender){
  if(stopped||!exactHostRecord(input,['v','type','grantId','mountId','operationId','expectedRevision','action','id']))return failure();
  let m;try{m=structuredClone(input);sender=structuredClone(sender);}catch{return failure();}
  if(m.v!==1||m.type!=='HOST_UI_SNIPPET'||!['save','remove'].includes(m.action)||!['grantId','mountId','operationId','id'].every(k=>token(m[k]))||!Number.isSafeInteger(m.expectedRevision)||m.expectedRevision<0)return failure();
  const attempt={active:true,started:elapsedNow(),abort:new AbortController()};attempts.add(attempt);let busyKey;
  const active=()=>{const at=elapsedNow();return !stopped&&attempt.active&&!attempt.abort.signal.aborted&&Number.isFinite(at)&&at>=attempt.started&&at-attempt.started<6000;};
  try{return await withRequestDeadline(()=>ui.withScope({sender,grantId:m.grantId,mountId:m.mountId},async context=>{
   let selectionId=null,ref=null;
   try{
    if(!['workspace','sidebar'].includes(context.role)||!active()||context.isCurrent()!==true)throw Error('stale');
    const view=await resolveView(context,m.mountId);
    const guard=()=>active()&&context.isCurrent()===true&&view?.isCurrent()===true;
    const check=()=>{if(!guard())throw Error('stale');};check();
    if(view.workspaceRevision!==m.expectedRevision)throw Error('revision-conflict');
    busyKey=context.scope.key;if(busy.has(busyKey))throw Error('busy');busy.add(busyKey);attempt.busyKey=busyKey;
    const old=structuredClone(view.preferences?.savedSnippets?.value??[]);
    if(!Array.isArray(old)||old.length>100||new Set(old.map(row=>row.id)).size!==old.length)throw Error('invalid-snippets');
    for(const row of old){if(!exactHostRecord(row,['id',...fields])||!token(row.id))throw Error('invalid-snippets');const {id,...data}=row;anchor(data);}
    let next;
    if(m.action==='remove'){if(!old.some(row=>row.id===m.id))throw Error('missing-snippet');next=old.filter(row=>row.id!==m.id);}
    else{
     if(old.length>=100)throw Error('snippet-capacity');ref=view.index?.byId(m.id);
     if(!ref||ref.id!==m.id||ref.scope!==context.scope.key||ref.available===false||typeof ref.nativeUrl!=='string'||!ref.nativeUrl)throw Error('unavailable-ref');
     ref=Object.freeze({...ref});
     const captured=await selectionBridge({context,ref,phase:'capture'});
     // Retain only a valid opaque handle for best-effort release, even if the
     // deadline expired while the capture was in flight.
     if(token(captured?.selectionId))selectionId=captured.selectionId;check();
     if(!exactHostRecord(captured,['selectionId','anchor'])||!selectionId)throw Error('invalid-selection');
     const selected=anchor(captured.anchor);if(selected.refId!==ref.id)throw Error('wrong-ref');
     const validated=await selectionBridge({context,ref,phase:'validate',selectionId});check();
     if(!exactHostRecord(validated,['ok','anchor'])||validated.ok!==true)throw Error('invalid-selection');const confirmed=anchor(validated.anchor);if(fields.some(k=>selected[k]!==confirmed[k]))throw Error('selection-changed');
     const id=makeId();if(!token(id)||old.some(row=>row.id===id))throw Error('invalid-id');next=[...old,{id,...selected}];
    }
    check();const result=await workspaceRepository.command(context.scope,{operationId:m.operationId,expectedRevision:m.expectedRevision,command:{type:'SET_PREFERENCE',id:'savedSnippets',value:next}},{actor:'human',guard,signal:attempt.abort.signal});check();
    if(result?.ok!==true||!Number.isSafeInteger(result.revision)||result.revision<0)throw Error('write-failed');
    try{Promise.resolve(onChanged?.(context.scope.key)).catch(()=>{});}catch{}if(!active()||context.isCurrent()!==true)throw Error('stale');return {ok:true,workspaceRevision:result.revision,savedSnippets:{total:next.length}};
   }finally{if(selectionId)try{Promise.resolve(selectionBridge({context,ref,phase:'release',selectionId})).catch(()=>{});}catch{}}
  }),{timeoutMs:6000,now:elapsedNow,schedule,cancel});}catch{return failure();}finally{attempt.active=false;attempt.abort.abort();attempts.delete(attempt);if(attempt.busyKey)busy.delete(attempt.busyKey);}
 }
 return Object.freeze({handle,stop(){stopped=true;for(const attempt of attempts){attempt.active=false;attempt.abort.abort();}busy.clear();}});
}
