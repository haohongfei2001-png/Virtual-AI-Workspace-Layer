import {modernExpectedWorld} from './expected/modern.mjs';
import assert from 'node:assert/strict';
import {J4_SEND_C,J4_MIXED_TITLE} from './fixtures/j4-interruption.mjs';
import {J4_REF} from './fixtures/j4-assets.mjs';
import {ensureJ4Workspace} from './j4-evidence-interruption.mjs';
import {currentJ4Grant,waitJ4Grant} from './j4-joint-interruption.mjs';

const key=scope=>JSON.stringify([scope.provider,scope.accountId,scope.organizationId]);
const values=table=>Object.values(table??{});
export async function pollJ4EvidenceRecovery(read,label,{now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const started=now(),deadline=started+15000;let last=started,active=true,timer,sleepTimer;
 const timeout=()=>Error('J4-evidence-recovery-timeout:'+label);
 const check=()=>{const at=now();if(!active||!Number.isFinite(at)||at<last||at>=deadline)throw timeout();last=at;return at;};
 if(!Number.isFinite(started)||!Number.isFinite(deadline))throw timeout();
 try{
  const expired=new Promise((_,reject)=>{timer=schedule(()=>{active=false;reject(timeout());},15000);});
  const work=(async()=>{while(true){
   check();const value=await read();check();if(value)return value;
   await new Promise(resolve=>{sleepTimer=schedule(resolve,Math.min(50,deadline-check()));});sleepTimer=undefined;
  }})();
  const result=await Promise.race([work,expired]);check();return result;
 }finally{active=false;cancel(timer);if(sleepTimer!==undefined)cancel(sleepTimer);}
}
const poll=pollJ4EvidenceRecovery;

// Independent oracle: repair invalidates sources, not immutable witness rows.
export function assertJ4EvidenceRevoked(before,after){
 assert.equal(after.scopeKey,before.scopeKey);
 for(const [id,source]of Object.entries(before.sources))assert.deepEqual(after.sources[id],{...source,revoked:true});
 for(const table of ['events','hints','coverage'])for(const [id,row]of Object.entries(before[table]))assert.deepEqual(after[table][id],row);
 for(const row of [...values(before.events),...values(before.hints)])assert.equal(after.sources[row.sourceId]?.revoked,true);
}
export function assertJ4CurrentHistory(before,after,bodyIds,nativeRows){
 assertJ4EvidenceRevoked(before,after);
 const wanted=new Set(bodyIds),originals=new Map(nativeRows.map(row=>[row.id,row]));
 assert(wanted.size>0&&wanted.size<=4,'bounded-current-body-required');
 const fresh=values(after.events).filter(row=>!Object.hasOwn(before.events,row.id));
 assert(fresh.length>0,'fresh-current-body-history-required');
 assert.equal(fresh.length,wanted.size,'one-fresh-witness-per-current-body-message');
 assert.equal(new Set(fresh.map(row=>row.messageId)).size,fresh.length);
 for(const row of fresh){
  assert(wanted.has(row.messageId),'history-outside-current-body');
  assert.equal(row.conversationId,J4_SEND_C);assert.equal(row.sentAt,originals.get(row.messageId)?.at);
  assert.equal(row.precision,'millisecond');assert.equal(row.role,'user');assert.equal(row.kind,'new-send');assert.equal(row.sendState,'committed');
  assert.equal(row.actorVerified,true);assert.equal(row.actorScopeKey,after.scopeKey);
  const source=after.sources[row.sourceId];assert(source&&!Object.hasOwn(before.sources,source.id));
  assert.equal(source.revoked,false);assert.equal(source.channel,'host-evidence');assert.equal(source.codecVersion,2);assert.equal(row.generation,source.generation);
 }
 // An ordinary reopen has no new local intent. It must not move or copy old ACKs.
 assert.deepEqual(after.hints,before.hints);
 return fresh;
}
export function assertJ4RecoveryView(view,{scope,revision,segment}){
 assert(view,'actual-production-view-response-required');assert.equal(view.scope,scope);
 assert.equal(view.currentRef,J4_SEND_C);assert.equal(view.currentRefRoute,J4_SEND_C);
 assert.equal(view.currentSegment,segment);assert.equal(Number(view.evidenceRevision.split(':').at(-1)),revision);
 return view;
}
export function assertJ4ReadBudget(budget){
 assert(budget?.checksumValid,'valid-persisted-read-budget-required');
 assert(Number.isFinite(budget.startedAt)&&Number.isFinite(budget.lastAt)&&budget.lastAt>=budget.startedAt);
 assert(Number.isInteger(budget.requests)&&budget.requests>=1&&budget.requests<=12);
 assert(Array.isArray(budget.attemptCounts)&&budget.attemptCounts.length<=12&&budget.attemptCounts.every(n=>Number.isInteger(n)&&n>=1&&n<=3));
 return budget;
}

/** TEST_ONLY passive copy of real production responses. The original request,
 * promise and reply are returned untouched; no extra RPC or authority is made. */
export function observeJ4RecoveryViews(){
 if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage||globalThis.j4RecoveryViews)return;
 globalThis.j4RecoveryViews=[];
 const send=chrome.runtime.sendMessage.bind(chrome.runtime);
 chrome.runtime.sendMessage=function(...args){
  const result=send(...args);
  try{if(result?.then)result.then(reply=>{
   if(args[0]?.type!=='HOST_UI_VIEW'||reply?.ok!==true||reply.state!=='ready')return;
   const page=reply.page;
   if(!page)return;
   // Read every untrusted field once. Getter changes cannot pass validation and
   // then substitute a different value into the passive diagnostic buffer.
   const scope=page.scope,evidenceRevision=page.evidenceRevision,ref=page.currentRef,current=page.current;
   const currentRef=ref?.id,currentRefRoute=current?.refId,currentSegment=ref?.segment;
   if(typeof scope!=='string'||scope.length!==163||!/^\["chatgpt","principal_[0-9a-f]{64}","context_[0-9a-f]{64}"\]$/.test(scope)||typeof evidenceRevision!=='string'||evidenceRevision.length>128||!/^\d+:\d+$/.test(evidenceRevision)||typeof currentRef!=='string'||! /^[0-9a-f-]{36}$/i.test(currentRef)||typeof currentRefRoute!=='string'||! /^[0-9a-f-]{36}$/i.test(currentRefRoute)||!(currentSegment===null||Number.isSafeInteger(currentSegment)&&currentSegment>=0&&currentSegment<=1000000))return;
   globalThis.j4RecoveryViews.push({at:Date.now(),scope,evidenceRevision,currentRef,currentRefRoute,currentSegment});
   if(globalThis.j4RecoveryViews.length>24)globalThis.j4RecoveryViews.shift();
  },()=>{}).catch(()=>{});}catch{}
  return result;
 };
}

/** Explicit TEST_ONLY checksum fault, only against an existing valid root.
 * Recovery shadow, payload, sources, rows, receipts and grants are never seeded. */
export async function faultJ4EvidenceRoot({scope,expectedRevision}){
 const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
 const {freeEvidenceKey}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
 const {digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
 const base=new ScopeRepository({indexedDB});
 try{
  const scopeKey=base.scopeOrThrow(scope).key,key=freeEvidenceKey(scopeKey),db=await base.open();
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),request=store.get(key);let result;
   request.onsuccess=()=>{
    const root=request.result;
    if(!root||root.key!==key||root.payload?.scopeKey!==scopeKey||root.payload.revision!==expectedRevision||!Object.keys(root.payload.sources??{}).length||root.checksum!==digest(root.payload)){tx.abort();return;}
    const damaged={...root,checksum:'0'.repeat(64)};
    result={authority:'TEST_ONLY_EXISTING_EVIDENCE_ROOT_CHECKSUM_FAULT',beforeRootDigest:digest(root),afterRootDigest:digest(damaged),payloadUnchanged:digest(root.payload)===digest(damaged.payload),changedFields:['checksum'],revision:root.payload.revision};
    store.put(damaged);
   };
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??Error('missing-valid-production-evidence-root'));
  });
 }finally{base.close();}
}

/** Additive packaged-MV3 slice. Existing J4 steps run before and after this one.
 * No wider branch matrix, missing-source continuation edge, or full J4 pass. */
export async function runJ4EvidenceRecovery({a,id,server,inspector,assets,preserved,personal,team,scopeOf,mounted,record}){
 const recordEvidence=(name,details)=>record(name,{boundary:'EVIDENCE_ROOT_REPAIR_SLICE_NOT_FULL_J4',...details});
 const scopeKey=key(personal),frame=()=>a.frames().find(f=>!f.isDetached()&&f.url()===`chrome-extension://${id}/workspace.html`);
 const acceptsBefore=server.snapshot().interruption.accepts;assert.equal(acceptsBefore,2);
 const originalMessageIds=server.snapshot().interruption.rows.slice(1).map(row=>row.id);assert.equal(originalMessageIds.length,2);
 const teamAssets=await assets(team),budgetObservations=[];
 await a.addInitScript(observeJ4RecoveryViews);
 for(const f of a.frames().filter(f=>f.url().startsWith(`chrome-extension://${id}/`)))await f.evaluate(observeJ4RecoveryViews);
 async function inspect(scope=personal){
  const page=await inspector();await a.bringToFront();
  return page.evaluate(async scope=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs'));
   const {FreeEvidenceRepository}=await import(chrome.runtime.getURL('src/data/free-evidence-repository.mjs'));
   const {NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));
   const {digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
   const base=new ScopeRepository({indexedDB});
   try{
    const evidence=await new FreeEvidenceRepository({baseRepository:base}).read(scope),native=await new NativeRepository({baseRepository:base}).read(scope),db=await base.open();
    const continuations=await new Promise((resolve,reject)=>{const tx=db.transaction('native_operations','readonly'),q=tx.objectStore('native_operations').getAll();tx.oncomplete=()=>resolve(q.result.filter(row=>row.payload?.continuation?.scopeKey===base.scopeOrThrow(scope).key));tx.onabort=()=>reject(tx.error);});
    return {evidence,nativeDigest:digest(native),continuations,continuationDigest:digest(continuations)};
   }finally{base.close();}
  },scope);
 }
 async function readBudget(){
  const page=await inspector();await a.bringToFront();
  const budget=await page.evaluate(async({scope,origin})=>{
   const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{digest}=await import(chrome.runtime.getURL('src/data/hash.mjs'));
   const base=new ScopeRepository({indexedDB});try{const db=await base.open();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('b23_views','readonly'),q=tx.objectStore('b23_views').get('host-read-budget:'+digest([scope.accountId,scope.organizationId,origin]));
    tx.oncomplete=()=>{const row=q.result,p=row?.payload;resolve(row?{checksumValid:row.checksum===digest(p),startedAt:p.startedAt,lastAt:p.lastAt,requests:p.requests,attemptCounts:p.attempts?.map(a=>a.count)}:null);};tx.onabort=()=>reject(tx.error);
   });}finally{base.close();}
  },{scope:personal,origin:server.origin});
  assertJ4ReadBudget(budget);budgetObservations.push(budget);return budget;
 }
 async function budgetWindow(){
  const budget=await readBudget(),waited=Math.max(0,budget.startedAt+30001-Date.now());
  // This is the actual persistent budget expiry, never a fabricated readiness delay.
  if(waited)await new Promise(resolve=>setTimeout(resolve,waited));
  assert(Date.now()>budget.startedAt+30000);return {budget,waitedForFormalBudgetMs:waited};
 }
 async function native(){await a.bringToFront();await a.locator('#model-button').click();await a.locator('#native-dialog').getByRole('button',{name:'Close',exact:true}).click();}
 async function navigate(ref){
  assert([J4_REF,J4_SEND_C].includes(ref),'J4-evidence-native-search-target');
  const title=ref===J4_SEND_C?server.snapshot().interruption?.title:modernExpectedWorld.conversations.find(row=>row.id===ref)?.title;
  assert(typeof title==='string'&&title.trim().length>0&&title.length<=200,'J4-evidence-native-search-title');
  // MODERN windowing removes history anchors. Use native search and its exact
  // existing href, including the current native title after the joint rename.
  await native();await a.locator('#search-button').click();await a.locator('#search-dialog input').fill(title);
  await a.locator(`#search-dialog a[href="/c/${ref}"]`).click();await a.waitForURL(server.origin+'/c/'+ref);
 }
 async function body(){return a.evaluate(()=>({conversationId:document.querySelector('#reading')?.getAttribute('data-conversation-id'),messageIds:[...new Set([...document.querySelectorAll('#reading [data-message-id]')].map(n=>n.getAttribute('data-message-id')))]}));}
 async function readyView(revision,segment){
  await ensureJ4Workspace(a,mounted);
  const view=await poll(async()=>{
   const f=frame();if(!f)return null;
   const rows=await f.evaluate(()=>globalThis.j4RecoveryViews??[]);
   return rows.findLast(row=>row.scope===scopeKey&&row.currentRef===J4_SEND_C&&row.currentRefRoute===J4_SEND_C&&Number(row.evidenceRevision.split(':').at(-1))===revision&&row.currentSegment===segment);
  },'same-scope-current-ref-production-projection');
  return assertJ4RecoveryView(view,{scope:scopeKey,revision,segment});
 }
 const completedReads=()=>server.snapshot().interruption.reads.filter(row=>row.authenticatedWorker&&row.finishedAt!==null);
 const unchangedAssets=async()=>{assert.deepEqual(await assets(personal),preserved);assert.deepEqual(await assets(team),teamAssets);};
 const teamBefore=await inspect(team);

 // Existing joint journey supplies real old history and a real old ACK.
 await navigate(J4_SEND_C);await a.locator('[data-message-id="j4_original_old"]').first().waitFor();
 let before=await inspect();assert.equal(values(before.evidence.events).length,3);assert.equal(values(before.evidence.hints).length,1);assert.equal(values(before.evidence.sources).length,2);
 await native();await a.locator('textarea').fill('J4_EVIDENCE_REPAIR_NATIVE_DRAFT');
 await a.evaluate(()=>{globalThis.j4EvidenceDocument=document;globalThis.j4EvidenceEditor=document.querySelector('textarea');});
 await readyView(before.evidence.revision,0);before=await inspect();const preRepairContinuationStates=before.continuations.map(row=>row.payload.continuation.state);assert.deepEqual(preRepairContinuationStates,['complete']);const priorGrant=(await waitJ4Grant(a,id,scopeKey,{expectedCurrentRef:J4_SEND_C})).grant;
 const draft=async()=>{assert(await a.evaluate(()=>document===j4EvidenceDocument&&document.querySelector('textarea')===j4EvidenceEditor&&j4EvidenceEditor.value==='J4_EVIDENCE_REPAIR_NATIVE_DRAFT'));};
 const fault=await (await inspector()).evaluate(faultJ4EvidenceRoot,{scope:personal,expectedRevision:before.evidence.revision});
 assert(fault.payloadUnchanged);assert.notEqual(fault.beforeRootDigest,fault.afterRootDigest);await a.bringToFront();
 let f=frame();await f.getByRole('button',{name:'工作空间设置',exact:true}).click();await f.getByRole('button',{name:'本地数据恢复',exact:true}).click();
 await f.getByRole('button',{name:'修复活跃度记录',exact:true}).waitFor({timeout:15000});await draft();await unchangedAssets();
 await f.getByRole('button',{name:'修复活跃度记录',exact:true}).click();
 const repaired=await poll(async()=>{try{const value=await inspect();return values(value.evidence.sources).every(source=>source.revoked===true)?value:null;}catch(error){if(!/corrupt-free-evidence-record/.test(error.message))throw error;return null;}},'production-evidence-repair-committed');
 assert.equal(repaired.evidence.revision,before.evidence.revision+1);assertJ4EvidenceRevoked(before.evidence,repaired.evidence);
 for(const table of ['events','hints','coverage'])assert.deepEqual(repaired.evidence[table],before.evidence[table]);
 assert.deepEqual(Object.keys(repaired.evidence.sources),Object.keys(before.evidence.sources));assert.equal(repaired.nativeDigest,before.nativeDigest);assert.deepEqual(repaired.continuations,before.continuations);
 const revokedView=await readyView(repaired.evidence.revision,null);await draft();await unchangedAssets();assert.deepEqual(await inspect(team),teamBefore);
 recordEvidence('same-J4-existing-evidence-checksum-fault-real-UI-repair-revokes-activity-and-preserves-draft-assets',{fault,projection:revokedView,oldSources:values(repaired.evidence.sources).map(source=>({id:source.id,generation:source.generation,revoked:source.revoked})),oldEvents:values(repaired.evidence.events).length,oldACKs:values(repaired.evidence.hints).length,continuationDigest:repaired.continuationDigest,preRepairContinuationStates,continuationCoverage:'COMPLETED_RECEIPT_BYTES_ONLY; PENDING_REPAIR_TO_NEEDS_REVALIDATION_NOT_COVERED',assetDigest:preserved.hash,nativeSends:acceptsBefore});

 const historyBudget=await budgetWindow(),historyReadStart=completedReads().length;
 await navigate(J4_REF);await a.locator('[data-message-id="msg-self"]').first().waitFor();await navigate(J4_SEND_C);await a.locator('[data-message-id="j4_original_old"]').first().waitFor();
 const selected=await body();assert.equal(selected.conversationId,J4_SEND_C);
 await poll(()=>completedReads().length>historyReadStart,'fresh-authenticated-history-response');
 const historical=await poll(async()=>{const value=await inspect();return values(value.evidence.events).some(row=>!Object.hasOwn(before.evidence.events,row.id)&&value.evidence.sources[row.sourceId]?.revoked===false)?value:null;},'fresh-historical-incarnation');
 const witnesses=assertJ4CurrentHistory(before.evidence,historical.evidence,selected.messageIds,server.snapshot().interruption.rows);
 const historyView=await readyView(historical.evidence.revision,0),freshGrant=(await waitJ4Grant(a,id,scopeKey,{previousGrant:priorGrant,expectedCurrentRef:J4_SEND_C})).grant;
 await draft();await unchangedAssets();assert.deepEqual((await inspect(team)).evidence,teamBefore.evidence);assert.equal(server.snapshot().interruption.accepts,acceptsBefore);
 recordEvidence('same-J4-fresh-authenticated-current-body-history-restores-production-activity-only',{...historyBudget,currentBody:selected,projection:historyView,witnesses:witnesses.map(({id,messageId,sourceId,generation,sentAt,precision})=>({id,messageId,sourceId,generation,sentAt,precision})),oldACKsUnchanged:true,oldACKsStillRevoked:true,newGrant:true,nativeSends:acceptsBefore,subsetBoundary:'UNCHANGED_FIXTURE_RENDERS_ALL_CURRENT_CONVERSATION_MESSAGES; UNLOADED_BRANCH_NEGATIVE_NOT_RUN'});

 const sendBudget=await budgetWindow(),sendReadStart=completedReads().length;
 await native();await a.locator('#j4-rename-on-send').check();await a.locator('textarea').fill('J4 genuine new send after Evidence repair');
 const sendIntentAt=Date.now();await a.locator('button[type="submit"]').click();await a.locator('#composer output').getByText('J4 native send accepted',{exact:true}).waitFor();
 const accepted=server.snapshot().interruption;assert.equal(accepted.accepts,acceptsBefore+1);assert.equal(accepted.title,J4_MIXED_TITLE);assert.equal(accepted.held,false);
 const sent=accepted.rows.at(-1);assert(!originalMessageIds.includes(sent.id));assert(Date.parse(sent.at)>=sendIntentAt);
 await poll(()=>completedReads().length>sendReadStart,'fresh-authenticated-ACK-response');
 const acknowledged=await poll(async()=>{const value=await inspect(),hints=values(value.evidence.hints).filter(row=>row.messageId===sent.id);return hints.length?{...value,hint:hints[0],hints}:null;},'new-local-send-successor-ACK');
 assert.equal(acknowledged.hints.length,1);assertJ4EvidenceRevoked(before.evidence,acknowledged.evidence);
 const hint=acknowledged.hint,source=acknowledged.evidence.sources[hint.sourceId];assert(!Object.hasOwn(before.evidence.sources,source.id));assert.equal(source.revoked,false);assert.equal(source.codecVersion,1);assert.equal(source.channel,'host-evidence');assert.equal(hint.generation,source.generation);
 assert.equal(hint.conversationId,J4_SEND_C);assert.equal(hint.actorScopeKey,scopeKey);assert.equal(hint.actorVerified,true);assert.equal(hint.hintType,'observed-self-send');assert.equal(hint.ackWitness.kind,'authenticated-message-readback');assert.equal(hint.ackWitness.profileId,source.profileId);assert.equal(hint.ackWitness.profileVersion,source.profileVersion);
 assert(!Object.hasOwn(hint,'sentAt'));assert(Date.parse(hint.firstObservedAt)>=sendIntentAt);assert(Date.parse(hint.candidateInterval.from)>=sendIntentAt);assert(Date.parse(hint.candidateInterval.through)-Date.parse(hint.candidateInterval.from)<=30000);
 assert.equal(values(acknowledged.evidence.hints).length,values(before.evidence.hints).length+1);
 const sentHistory=values(acknowledged.evidence.events).filter(row=>row.messageId===sent.id&&acknowledged.evidence.sources[row.sourceId]?.revoked===false);assert.equal(sentHistory.length,1);assert.equal(sentHistory[0].sentAt,sent.at);
 const ackView=await readyView(acknowledged.evidence.revision,0);await unchangedAssets();assert.deepEqual((await inspect(team)).evidence,teamBefore.evidence);
 recordEvidence('same-J4-one-genuine-new-native-send-creates-successor-ACK-with-old-anchors-still-revoked',{...sendBudget,messageId:sent.id,originalSendAt:sent.at,anchor:{id:hint.id,messageId:hint.messageId,sourceId:hint.sourceId,generation:hint.generation,firstObservedAt:hint.firstObservedAt,candidateInterval:hint.candidateInterval,calibrationDueAt:hint.calibrationDueAt,ackWitness:hint.ackWitness},source:{id:source.id,generation:source.generation,revoked:source.revoked,codecVersion:source.codecVersion,profileId:source.profileId,profileVersion:source.profileVersion},projection:ackView,originalMessageIds,nativeSends:acceptsBefore+1,actualNewSends:1,activityProjection:'REAL_HOST_UI_VIEW_CURRENT_REF_SEGMENT; ACK_AND_AUTHENTICATED_ORIGINAL_COEXIST'});

 const repeatBudget=await budgetWindow(),repeatReadStart=completedReads().length;
 const preRebindGrant=(await waitJ4Grant(a,id,scopeKey,{expectedCurrentRef:J4_SEND_C})).grant;
 assert.equal(await a.locator('textarea').inputValue(),'');await a.reload();await a.locator('[data-message-id="'+sent.id+'"]').first().waitFor();
 await poll(()=>completedReads().length>repeatReadStart,'rebind-authenticated-response');
 const repeatedGrant=(await waitJ4Grant(a,id,scopeKey,{previousGrant:preRebindGrant,expectedCurrentRef:J4_SEND_C})).grant;assert.notEqual(repeatedGrant,preRebindGrant);assert.notEqual(repeatedGrant,freshGrant);
 const repeated=await inspect();assert.deepEqual(repeated.evidence,acknowledged.evidence);assertJ4EvidenceRevoked(before.evidence,repeated.evidence);assert.deepEqual(repeated.continuations,before.continuations);
 const repeatedView=await readyView(repeated.evidence.revision,0);await readBudget();assert.equal(budgetObservations.length,4);assert.equal(values(repeated.evidence.sources).length,4);await unchangedAssets();assert.deepEqual((await inspect(team)).evidence,teamBefore.evidence);
 assert.equal(server.snapshot().interruption.accepts,3);assert.equal(server.snapshot().actions['send-intent'],3);
 assert.deepEqual(server.snapshot().interruption.rows.slice(1).map(row=>row.id),[...originalMessageIds,sent.id]);
 recordEvidence('same-J4-real-rebind-authenticated-reread-preserves-witness-bytes-origin-budget-and-context-isolation',{...repeatBudget,projection:repeatedView,nativeSends:3,messageIds:[...originalMessageIds,sent.id],freshACKUnchanged:true,evidenceByteIdentity:true,oldSourcesStillRevoked:true,teamEvidenceUnchanged:true,budgetObservations,requestDeadlineMs:6000,sendCycleMs:30000,maxReadAttempts:3,maxGETsPerWindow:12,missingInitialACKSourceContinuation:'NOT_COVERED'});
 // Return to the exact route expected by the original native repair/lifecycle steps.
 await navigate(J4_REF);await ensureJ4Workspace(a,mounted);assert.equal(await scopeOf(a),scopeKey);
 assert(await currentJ4Grant(a,id,scopeKey,{expectedCurrentRef:J4_REF}));await unchangedAssets();
 return {boundary:'EVIDENCE_ROOT_REPAIR_SLICE_NOT_FULL_J4',additionalNativeSends:1,messageId:sent.id};
}
