/** TEST ONLY independent assertions for one existing-source pending repair.
 * No parser, reducer, continuation transition or production admission is used.
 */
import assert from 'node:assert/strict';
export const PENDING_REPAIR_LIMITS=Object.freeze({rpcMs:6000,readWindowMs:30000,maxGETs:12,maxReadAttempts:3,debuggerMs:20000,observationMs:15000});
export const PENDING_REPAIR_STAGES=Object.freeze(['SETUP','INITIAL_CONTEXT_AND_ASSETS','INITIAL_NATIVE_CONTEXT_SWITCH','FIRST_SEND_AND_ACK','FIRST_SEND_BUDGET','FIRST_SEND_NATIVE_INPUT','FIRST_SEND_ACK_READ','PRE_SECOND_BUDGET','PRE_SECOND_WORKSPACE_AUTHORITY','SECOND_NATIVE_INPUT','WORKER_LIFECYCLE','DEBUGGER_INSTALL','DEBUGGER_CONTROL','SECOND_SEND_AND_PENDING_CUT','CORRUPT_REBIND','UI_REPAIR','REPAIR_DRAIN','REPEATED_REBIND','FINAL_ACCEPTANCE']);
export const PENDING_REPAIR_ASSERTIONS=Object.freeze(['PENDING_REPAIR_SINGLE_CONTEXT_SWITCH','PENDING_REPAIR_BUDGET_CHECKSUM','PENDING_REPAIR_BUDGET_TIMESTAMPS','PENDING_REPAIR_BUDGET_REQUESTS','PENDING_REPAIR_BUDGET_ATTEMPTS','PENDING_REPAIR_PRIOR_AUTHORITY_REQUIRED','PENDING_REPAIR_WORKER_TARGET_REQUIRED','PENDING_REPAIR_FINAL_GRANT_FRESH','PENDING_REPAIR_REPEAT_GRANT_FRESH','J4-classic-package-root-required','J4-classic-entry-build-mismatch','J4-classic-runtime-build-mismatch','J4-classic-background-required','J4-unique-worker-target-required','J4-worker-lifecycle-target-mismatch','J4-production-drain-script-required','J4-production-drain-source-mismatch','J4-production-drain-breakpoint-unresolved','J4-production-drain-breakpoint-moved','J4-evidence-repository-script-required','J4-evidence-repository-source-mismatch','J4-evidence-repository-entry-required','J4-evidence-repository-entry-unresolved','J4-evidence-repository-breakpoint-moved']);
export function setPendingRepairStage(report,stage){if(!PENDING_REPAIR_STAGES.includes(stage))throw Error('invalid-pending-repair-stage');report.stage=stage;}
const values=table=>Object.values(table??{});
const hintFor=(state,messageId)=>values(state.evidence?.hints).filter(h=>h.messageId===messageId);
export function assertOriginalNativeSource(state,pending){
 const witness=pending.nativeWitness,source=state.native.sources[witness.sourceId];
 assert(source,'pending native source must exist');assert.equal(source.revoked,false);
 for(const field of ['generation','sourceRevision'])assert.equal(source[field],witness[field],'native source changed: '+field);
 for(const field of ['profileId','profileVersion','semanticFingerprint'])assert.equal(source.admission?.[field],witness[field],'native admission changed: '+field);
 assert.equal(source.channel,'host-dom');
}
export function assertExistingSourcePending({baseline,paused,messageId,firstMessageId,conversationId,title}){
 assert.equal(baseline.evidenceError,null);assert.equal(paused.evidenceError,null);
 assert.notEqual(baseline.native.refs[conversationId].nativeTitle,title,'the second native rename must be a real delta');
 assert.equal(paused.native.refs[conversationId].nativeTitle,title);
 const matching=paused.continuations.filter(p=>p.state==='pending-evidence'&&p.evidence?.batch.hints.some(h=>h.messageId===messageId));
 assert.equal(matching.length,1,'one actual joint pending required');const pending=matching[0];
 assert.equal(pending.format,'vaiwl-native-continuation-v2');assert.equal(pending.scopeKey,baseline.evidence.scopeKey);
 assert.notEqual(pending.nativeWitness.profileId,pending.admission.profileId);
 const first=hintFor(baseline,firstMessageId);assert.equal(first.length,1);const source=baseline.evidence.sources[pending.admission.sourceId];
 assert(source,'ACK predecessor must already be persisted, not missing initial source');
 assert.equal(source.id,first[0].sourceId);assert.equal(first[0].hintType,'observed-self-send');assert.equal(first[0].actorVerified,true);assert.equal(first[0].actorScopeKey,pending.scopeKey);assert.equal(first[0].ackWitness?.kind,'authenticated-message-readback');assert.equal(first[0].generation,source.generation);assert.equal(source.revoked,false);assert.equal(source.channel,'host-evidence');assert.equal(source.codecVersion,1);
 for(const field of ['generation','profileId','profileVersion'])assert.equal(source[field],pending.admission[field]);
 assert.deepEqual(paused.evidence.sources[source.id],source,'the pending ACK source has not committed its next revision');
 assert.equal(hintFor(paused,messageId).length,0);assert.equal(pending.evidence.batch.hints.length,1);
 const hint=pending.evidence.batch.hints[0];assert.equal(hint.conversationId,conversationId);assert.equal(hint.messageId,messageId);assert.equal(hint.sourceId,pending.admission.sourceId);assert.equal(hint.generation,pending.admission.generation);assert.equal(hint.actorScopeKey,pending.scopeKey);assert.equal(hint.actorVerified,true);assert.equal(hint.ackWitness.kind,'authenticated-message-readback');assert.equal(Object.hasOwn(hint,'sentAt'),false);
 assertOriginalNativeSource(paused,pending);return pending;
}
export function assertCorruptPending({state,pending,faultedStorageDigest}){
 assert.equal(state.evidenceError,'corrupt-free-evidence-record');assert.equal(state.evidence,null);
 assert.equal(state.evidenceStorageDigest,faultedStorageDigest,'no Evidence root/piece/index/receipt write while corrupt');
 assert.deepEqual(state.continuations.find(p=>p.operationId===pending.operationId),pending,'corrupt root must retain the exact payload');
 assertOriginalNativeSource(state,pending);
}
export function assertRetiredPending({before,state,pending,messageId,conversationId}){
 assert.equal(state.evidenceError,null);assertOriginalNativeSource(state,pending);
 for(const [id,source]of Object.entries(before.evidence.sources))assert.deepEqual(state.evidence.sources[id],{...source,revoked:true},'old source must remain stored and revoked');
 for(const table of ['events','hints','coverage'])for(const [id,row]of Object.entries(before.evidence[table]))assert.deepEqual(state.evidence[table][id],row,'repair must preserve old witness bytes');
 assert.equal(hintFor(state,messageId).length,0,'retired pending must not replay its ACK, even under a successor');
 const rows=state.continuations.filter(p=>p.operationId===pending.operationId);assert.equal(rows.length,1);const summary=rows[0];
 assert.equal(summary.state,'needs-revalidation');assert.equal(summary.reason,'source-revoked','native source-changed must not substitute for ACK retirement');
 for(const field of ['format','scopeKey','operationId','nativeRevision','payloadDigest','admission','nativeWitness'])assert.deepEqual(summary[field],pending[field],field+' must be retained');
 assert.equal(summary.evidenceOperationId,pending.evidence.operationId);assert.deepEqual(summary.targets,[conversationId]);assert.equal(Object.hasOwn(summary,'evidence'),false);
 assert(state.continuationChecksumsValid,'real continuation records must retain their checksums');
 assert.deepEqual(state.assets,before.assets);return summary;
}
export function assertPendingRepairBudget(value){
 assert(value?.checksumValid,'PENDING_REPAIR_BUDGET_CHECKSUM');assert(Number.isSafeInteger(value.startedAt)&&Number.isSafeInteger(value.lastAt)&&value.lastAt>=value.startedAt,'PENDING_REPAIR_BUDGET_TIMESTAMPS');
 assert(Number.isInteger(value.requests)&&value.requests>=1&&value.requests<=12,'PENDING_REPAIR_BUDGET_REQUESTS');
 assert(Array.isArray(value.attemptCounts)&&value.attemptCounts.length<=12&&value.attemptCounts.every(n=>Number.isInteger(n)&&n>=1&&n<=3),'PENDING_REPAIR_BUDGET_ATTEMPTS');return value;
}

/** Passive runtime replies only; original arguments, Promise and errors survive.
 * Opaque grant IDs stay in frame RAM and are never included in the report.
 */
export function observePendingRepairReplies(){
 if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage||globalThis.__pendingRepairReplies)return;
 const state={grant:null,scopeGrant:null,scope:null,currentRef:null,replyCount:0,recovery:null,views:[]};globalThis.__pendingRepairReplies=state;
 const original=chrome.runtime.sendMessage;
 chrome.runtime.sendMessage=function(...args){
  const result=Reflect.apply(original,this,args);
  try{if(result?.then)result.then(reply=>{try{
   state.replyCount=Math.min(1000000,state.replyCount+1);
   const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
   const grant=reply?.grant,id=grant?.id,scopeGrant=grant?.scopeGrantId;
   if(reply?.ok===true&&token(id)&&token(scopeGrant)){
    if(state.grant!==id){state.scope=null;state.currentRef=null;state.recovery=null;state.views=[];}
    state.grant=id;state.scopeGrant=scopeGrant;
   }
   if(args[0]?.type==='HOST_UI_RECOVERY_STATUS'&&reply?.ok===true)state.recovery={corrupt:reply.plans?.evidence?.corrupt===true,recoverable:reply.plans?.evidence?.recoverable===true};
   if(args[0]?.type==='HOST_UI_VIEW'&&reply?.ok===true&&reply.state==='ready'){
    const page=reply.page,scope=page?.scope,currentRef=page?.currentRef?.id,evidenceRevision=page?.evidenceRevision;
    if(typeof scope!=='string'||!/^\["chatgpt","principal_[0-9a-f]{64}","context_[0-9a-f]{64}"\]$/.test(scope)||typeof currentRef!=='string'||! /^[0-9a-f-]{36}$/i.test(currentRef)||typeof evidenceRevision!=='string'||evidenceRevision.length>128||!/^\d+:\d+$/.test(evidenceRevision))return;
    state.scope=scope;state.currentRef=currentRef;
    state.views.push({scope,currentRef,evidenceRevision});if(state.views.length>16)state.views.shift();
   }
  }catch{}},()=>{}).catch(()=>{});}catch{}
  return result;
 };
}

// Diagnostic data is never acceptance evidence. No implicit stringification,
// accessor failure, unbounded error stack or late read may change the report.
const safeGet=(value,key)=>{try{return value?.[key];}catch{return undefined;}};
export function pendingDiagnosticText(value,maxBytes=512){
 if(typeof value!=='string')return {text:null,truncated:value!==undefined&&value!==null};
 const encoder=new TextEncoder();let text='',bytes=0;
 for(const char of value.slice(0,maxBytes)){const size=encoder.encode(char).length;if(bytes+size>maxBytes)break;text+=char;bytes+=size;}
 return {text,truncated:text.length!==value.length};
}
export function pendingDiagnosticError(error){
 if(safeGet(error,'name')==='AssertionError'||safeGet(error,'code')==='ERR_ASSERTION'){const raw=safeGet(error,'message'),head=typeof raw==='string'?raw.slice(0,160):null,label=head?.split('\n',1)[0];return {name:'AssertionError',message:'pending-repair-assertion-failed',stack:null,truncated:true,omitted:'assertion-diff',...(PENDING_REPAIR_ASSERTIONS.includes(label)?{assertionLabel:label}:{})};}
 const message=pendingDiagnosticText(safeGet(error,'message')),stack=pendingDiagnosticText(safeGet(error,'stack'),1024);
 const name=safeGet(error,'name');return {name:['Error','TypeError','RangeError','SyntaxError','TimeoutError','AssertionError','AggregateError'].includes(name)?name:'Error',message:message.text??'unreadable-error',stack:stack.text,truncated:message.truncated||stack.truncated};
}
export function appendPendingDiagnostic(report,field,error,stage=null){
 const row={...(stage?{stage:pendingDiagnosticText(stage,80).text??'unknown'}:{}),...pendingDiagnosticError(error)};
 const rows=report[field]??(report[field]=[]);if(rows.length<16)rows.push(row);else report[field+'Dropped']=(report[field+'Dropped']??0)+1;
 if(row.truncated)report[field+'Truncated']=true;
}
export async function pendingDiagnosticDeadline(run,{timeoutMs=1000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const start=now(),deadline=start+timeoutMs,abort=new AbortController();let timer,active=true;
 const expired=()=>Error('pending-repair-diagnostic-deadline');
 const check=()=>{const at=now();if(!active||!Number.isFinite(at)||at<start||at>=deadline)throw expired();};
 try{
  check();const result=await Promise.race([Promise.resolve().then(()=>{check();return run(abort.signal);}),new Promise((_,reject)=>{timer=schedule(()=>{active=false;abort.abort();reject(expired());},timeoutMs);})]);
  check();return result;
 }finally{active=false;abort.abort();if(timer!==undefined)cancel(timer);}
}
export function summarizePendingRepairFailure(state,expected=null){
 let truncated=false;const text=(value,max=128)=>{const result=pendingDiagnosticText(value,max);truncated||=result.truncated;return result.text;};
 const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const revoked=value=>{const raw=safeGet(value,'revoked');return typeof raw==='boolean'?raw:null;};
 const witness=value=>({sourceId:text(safeGet(value,'sourceId')),generation:text(safeGet(value,'generation')),profileId:text(safeGet(value,'profileId')),profileVersion:integer(safeGet(value,'profileVersion')),sourceRevision:integer(safeGet(value,'sourceRevision')),semanticFingerprint:text(safeGet(value,'semanticFingerprint'),64)});
 const operation=text(safeGet(expected,'operationId')),all=safeGet(state,'continuations'),rows=[],continuationCount=Array.isArray(all)?integer(safeGet(all,'length')):null;
 if(continuationCount!==null){const count=Math.min(continuationCount,256);truncated||=continuationCount>256;for(let i=0;i<count;i++){const row=safeGet(all,i);if(row)rows.push(row);}}
 const current=operation?rows.find(row=>safeGet(row,'operationId')===operation):rows.find(row=>safeGet(row,'state')==='pending-evidence');
 const origin=expected??current,originalWitness=witness(safeGet(origin,'nativeWitness'));
 const native=safeGet(state,'native'),source=safeGet(safeGet(native,'sources'),originalWitness.sourceId),admission=safeGet(source,'admission');
 const actualWitness={sourceId:text(safeGet(source,'id')),generation:text(safeGet(source,'generation')),profileId:text(safeGet(admission,'profileId')),profileVersion:integer(safeGet(admission,'profileVersion')),sourceRevision:integer(safeGet(source,'sourceRevision')),semanticFingerprint:text(safeGet(admission,'semanticFingerprint'),64)};
 const sourceId=text(safeGet(safeGet(origin,'admission'),'sourceId')),ack=safeGet(safeGet(safeGet(state,'evidence'),'sources'),sourceId);
 const result={scopeMatches:typeof safeGet(origin,'scopeKey')==='string'&&safeGet(state,'scopeKey')===safeGet(origin,'scopeKey'),continuationCount,selectedOperationId:text(safeGet(current,'operationId')),expectedOperationId:operation,operationMatched:!!operation&&safeGet(current,'operationId')===operation,currentState:text(safeGet(current,'state'),64),currentReason:text(safeGet(current,'reason'),64),expectedPayloadDigest:text(safeGet(origin,'payloadDigest'),64),currentPayloadDigest:text(safeGet(current,'payloadDigest'),64),originalNativeWitness:originalWitness,currentNativeWitness:actualWitness,nativeSourcePresent:!!source,nativeSourceRevoked:revoked(source),nativeSourceChannel:text(safeGet(source,'channel'),32),nativeMismatchFields:Object.keys(originalWitness).filter(field=>originalWitness[field]!==actualWitness[field]),ACKSource:{id:sourceId,present:!!ack,revoked:revoked(ack),generation:text(safeGet(ack,'generation')),profileId:text(safeGet(ack,'profileId')),profileVersion:integer(safeGet(ack,'profileVersion'))},evidenceError:text(safeGet(state,'evidenceError'),128),evidenceStorageDigest:text(safeGet(state,'evidenceStorageDigest'),64),assetDigest:text(safeGet(safeGet(state,'assets'),'hash'),64)};
 return {...result,truncated};
}
export async function capturePendingRepairFailure(report,read,expected,options={}){
 if(typeof read!=='function'){report.failureSnapshot={status:'NOT_AVAILABLE_BEFORE_INSPECTOR'};return;}
 try{const value=await pendingDiagnosticDeadline(read,{timeoutMs:1000,...options});report.failureSnapshot={status:'READ_ONLY_DIAGNOSTIC',...summarizePendingRepairFailure(value,expected)};}
 catch(error){report.failureSnapshot={status:'UNAVAILABLE',error:pendingDiagnosticError(error)};}
}

export function observePendingWorkerVersions(trace,event){
 const input=safeGet(event,'versions');if(!Array.isArray(input))return;
 const count=safeGet(input,'length');if(!Number.isSafeInteger(count)||count<0)return;
 const omitted=Math.max(0,count-64);trace.seen+=omitted;trace.dropped+=omitted;
 for(let i=omitted;i<count;i++){
  const value=safeGet(input,i),row={sequence:++trace.seen};
  for(const [field,bytes]of [['versionId',128],['scriptURL',512],['runningStatus',32],['targetId',128]]){const result=pendingDiagnosticText(safeGet(value,field),bytes);row[field]=result.text;trace.truncated||=result.truncated;}
  trace.events.push(row);if(trace.events.length>64){trace.events.shift();trace.dropped++;}
 }
 trace.truncated||=trace.dropped>0;
}
