import {initializationFailureStates,foregroundFailureStates,helloFailureStates,layoutFailureStates,surfaceFailureStates,validLayoutShape} from './local-status.mjs';
import {createIsolatedSessionReader} from './isolated-session-reader.mjs';
import {createCandidateUpgrade} from './candidate-upgrade.mjs';
import {createContentCandidates} from './content-candidates.mjs';
import {waitForSnippetCapture} from './snippet-capture-wait.mjs';
import {createSnippetSelectionSession} from './snippet-selection-session.mjs';
import {createChatGPTAdapter} from './chatgpt-adapter.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createFlowMountSurface} from '../navigation/flow-mount-surface.mjs';
import {createSurfaceController} from './surface-controller.mjs';
import {createFrameNativePlans} from './frame-native-plans.mjs';
import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {createMainMountDiagnosticSlot} from './native-flow-diagnostic.mjs';

/** Isolated content composition. The entry must restrict supported hosts; this
 * module never exposes its runtime bridge or authority on the page window. */
export function createHostContentSession({document:doc,runtime,origin=doc?.location?.origin,adapterFactory=createChatGPTAdapter,prepareDocument=null,identityReader=null,contextRecovery=false,localReconnect=false,automaticDormancy=false,mainMountDiagnostic=false,surfaceFactory=createFlowMountSurface,controllerFactory=createSurfaceController,plansFactory=createFrameNativePlans,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(prepareDocument!==null&&typeof prepareDocument!=='function')throw Error('invalid-document-readiness');
 if(typeof localReconnect!=='boolean')throw Error('invalid-local-reconnect');
 if(typeof automaticDormancy!=='boolean')throw Error('invalid-automatic-dormancy');
 if(typeof mainMountDiagnostic!=='boolean')throw Error('invalid-mount-diagnostic');
 if(!doc?.defaultView||new URL(origin).origin!==origin||doc.location.origin!==origin||!['http:','https:'].includes(new URL(origin).protocol)||!tokenOK(runtime?.id)||typeof runtime.sendMessage!=='function'||typeof runtime.getURL!=='function'||!runtime.onMessage?.addListener)throw Error('invalid-content-session');
 const mountDiagnostic=createMainMountDiagnosticSlot({document:doc,enabled:mainMountDiagnostic});
 const isolatedReader=identityReader??createIsolatedSessionReader({origin,now,elapsedNow});if(typeof isolatedReader?.read!=='function')throw Error('invalid-identity-reader');
 const upgrade=createCandidateUpgrade({now});let upgradeIdentity=null,upgradeDisplay=null,upgradeTimer=null;
 // Learned identities are document-local facts, never reusable handles or grants.
 let learned=[],learnedScope=null,learnedDocument=null;
 const clearLearned=()=>{learned=[];learnedScope=null;learnedDocument=null;};
 // RAM-only inspection hint; neither a membership fact nor a reusable proof.
 let recentConversation=null;
 let nativeUseIntent=null;
 function captureNativeUse(s,intent,producer,proof=null){
  if(!live(s)||!s.ready||!s.scopeKey||!sameProducer(producer,s.binding)||!tokenOK(intent?.actionId)||!tokenOK(intent?.conversationId))return;
  nativeUseIntent={...intent,scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,started:elapsedNow()};
  if(proof?.conversationId===intent.conversationId&&tokenOK(proof.bodyProofId))confirmNativeUse(s,proof.conversationId,proof.bodyProofId);
 }
 function confirmNativeUse(s,conversationId,proofId){
  const intent=nativeUseIntent;if(!intent)return;
  const elapsed=elapsedNow()-intent.started;
  if(!live(s)||!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000||intent.scopeKey!==s.scopeKey||intent.documentId!==s.binding.browserDocumentId){nativeUseIntent=null;return;}
  if(intent.conversationId!==conversationId)return;
  // Consume before IPC; no automatic retry or persistence of an old gesture.
  nativeUseIntent=null;
  void rpc(s,{v:1,type:'HOST_NATIVE_LOCAL_USE',...bindingFields(s.binding),actionId:intent.actionId,proofId},6000-elapsed).catch(()=>{});
 }
 const clearRecent=()=>{recentConversation=null;nativeUseIntent=null;};
 function recentId(s,forRebind=false){
  const h=recentConversation;if(!h||!forRebind&&!live(s))return null;
  const wall=now(),elapsed=elapsedNow();
  if(h.scopeKey!==s.scopeKey||h.documentId!==s.binding.browserDocumentId){clearRecent();return null;}
  if(!Number.isFinite(wall)||!Number.isFinite(elapsed)||wall<h.lastWall||elapsed<h.lastElapsed||wall-h.wall>=30000||elapsed-h.elapsed>=30000)h.expired=true;
  h.lastWall=wall;h.lastElapsed=elapsed;return h.expired?null:h.id;
 }
 function rememberRecent(s,p,result){
  if(!live(s))return;
  if(!Number.isSafeInteger(p.localSeq)||result?.localSeq!==p.localSeq||!['accepted','duplicate'].includes(result?.state)||!tokenOK(result.bodyProofId)||!['current-object','current-observation'].includes(p.kind)||typeof s.scopeKey!=='string'||!s.scopeKey)return;
  const body=p.kind==='current-observation'?p.payload.body:p.payload;
  if(body?.association!=='explicit-body-id'||!tokenOK(body.conversationId))return;
  rememberRecentId(s,body.conversationId);
  confirmNativeUse(s,body.conversationId,result.bodyProofId);
 }
 function rememberRecentId(s,id){
  recentId(s,true);const h=recentConversation;
  // Re-observing or leaving the same conversation never renews this deadline.
  if(h&&h.id===id)return;
  const wall=now(),elapsed=elapsedNow();if(!Number.isFinite(wall)||!Number.isFinite(elapsed))return;
  recentConversation={id,scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,wall,elapsed,lastWall:wall,lastElapsed:elapsed,expired:false};
 }
 function rememberDepartingRoute(s){
  // A route identity is only a request to inspect fresh DOM sooner. It carries
  // no body, membership, activity, native handle or authority into the new bind.
  if(!enabled||current!==s||s.abort.signal.aborted||typeof s.scopeKey!=='string'||!s.scopeKey||!tokenOK(s.binding?.browserDocumentId)||!(Date.parse(s.binding.expiresAt)>now()))return;
  const route=createURLPolicy({origin}).parse(s.url);
  if(route.kind==='conversation')rememberRecentId(s,route.conversationId);
 }

 const clearUpgrade=()=>{if(upgradeTimer!==null)cancel(upgradeTimer);upgradeTimer=null;upgrade.clear();upgradeIdentity=null;upgradeDisplay=null;for(const type of ['pointerdown','keydown'])doc.removeEventListener?.(type,interruptUpgrade,true);for(const type of ['popstate','hashchange'])doc.defaultView.removeEventListener(type,upgradeRoute);};
 const interruptUpgrade=event=>{
  if(event.isTrusted!==true)return;
  // The sole authenticated grid return changes presentation, not the native
  // navigation that is still being correlated. Do not lose that pending
  // identity when the user returns before its first candidate scan commits.
  try{
   const target=event.composedPath?.()[0]??event.target;
   const activation=!event.defaultPrevented&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.type==='pointerdown'&&event.button===0||event.type==='keydown'&&['Enter',' '].includes(event.key)&&!event.repeat&&!event.isComposing&&event.keyCode!==229);
   if(activation&&current?.ready&&live(current)&&Date.parse(current.binding?.expiresAt)>now()&&current.controller?.isReturnTarget?.(target)===true)return;
  }catch{/* An unreadable return boundary is still an interruption. */}
  clearUpgrade();
 };
 const upgradeRoute=()=>{if(!upgrade.navigate({url:doc.location.href}))clearUpgrade();};
 const clientId=makeId();if(!tokenOK(clientId))throw Error('invalid-content-client');
 let seq=0,epoch=0,current=null,enabled=false,rebindQueued=false,rebindRun=0,restoreArmed=false,recoveryRemaining=0,contextResumeAllowed=false,contextWaitSuspended=false,contextResumeMode='workspace',contextResumeURL=null,verificationWaitURL=null;
 let activeWork=0,rawIPC=0,workRevision=0,observation=null;
 // Private, document-local presentation failure; never inferred from page data.
 let frameReplaced=false,startupFailure=null,transportWait=null;
 let establishedProducer=null,recoveryTimes=[],recoveryClock=null,recoveryBlocked=null,recoveryResume=null;
 const transportFrameFailures=new Set(['ui-port-disconnected','ui-grant-expired','ui-renew-failed']);
 // A successful JOIN establishes a new producer, not stable product use. Bound
 // repeated post-JOIN transport faults across producers in this document RAM.
 // This is a rate limit only: it neither extends a lease nor schedules a retry.
 function recoveryWindow(consume=false){
  if(recoveryBlocked==='surface-recovery-clock-invalid')return false;
  let at;try{at=elapsedNow();}catch{at=NaN;}
  if(!Number.isFinite(at)||at<0||recoveryClock!==null&&at<recoveryClock){recoveryBlocked='surface-recovery-clock-invalid';return false;}
  recoveryClock=at;recoveryTimes=recoveryTimes.filter(time=>at-time<60000);
  if(recoveryTimes.length>=3){recoveryBlocked='surface-recovery-rate-limited';return false;}
  if(consume)recoveryTimes.push(at);return true;
 }
 function pauseRecovery(s,mode=null){
  const code=recoveryBlocked,url=s.url;
  const resume={url,mode:mode==='workspace'?'workspace':mode==='reading'?'reading':presentationIntent(s),recovery:{scopeKey:s.scopeKey,documentId:s.binding?.browserDocumentId,freshInstant:instantScope(s.scopeKey)},preference:sidebarPreference(s)};
  // Reuse the existing wait: retire all old capabilities, then accept only a
  // later genuine context notification or explicit start. No timer owns wake.
  contextPending();recoveryBlocked=code;recoveryResume=contextResumeAllowed?resume:null;
  startupFailure={url,state:code,shape:null};
 }
 // One automatic attempt per established producer, not per page lifetime.
 // A failed replacement has no private workspace JOIN and cannot re-arm this.
 // Renderer/read failures retain the separate original one-shot ceiling.
 function takeRecovery(s,transport=false,mode=null){
  if(!(transport&&s.transportRecoveryAvailable===true)&&recoveryRemaining<1)return false;
  if(transport&&!recoveryWindow(true)){pauseRecovery(s,mode);return false;}
  if(transport&&s.transportRecoveryAvailable===true){s.transportRecoveryAvailable=false;recoveryRemaining=0;return true;}
  recoveryRemaining--;s.transportRecoveryAvailable=false;return true;
 }
 function stopObservation(){const prior=observation;observation=null;if(!prior)return;cancel(prior.timer);runtime.onMessage.removeListener(prior.invalidate);prior.adapter.stop();}
 async function startObservation(s){
  const adapter=s.adapter,entry={adapter,owner:s,timer:null,invalidate:null};observation=entry;
  entry.invalidate=(m,sender)=>{if(observation===entry&&sender?.id===runtime.id&&exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED')stopObservation();};
  runtime.onMessage.addListener(entry.invalidate);
  entry.timer=schedule(()=>{if(observation===entry)stopObservation();},Math.max(0,Date.parse(s.binding.expiresAt)-now()));
  await adapter.start({binding:s.binding,phase:'observation'});
  if(!live(s)||observation!==entry||Date.parse(s.binding.expiresAt)<=now())throw Error('stale-content-session');
 }

 function interfere(owner){if(current?.closing&&owner!==current.closing)current.closing.interfered=true;}
 function sync(work){interfere();workRevision++;activeWork++;try{return work();}finally{activeWork--;requestAutomaticIdle(current);}}
 async function track(work,owner=null){interfere(owner);workRevision++;activeWork++;try{return await work();}finally{activeWork--;requestAutomaticIdle(current);}}
 async function send(message,owner=null){interfere(owner);workRevision++;rawIPC++;try{return await runtime.sendMessage(message);}finally{rawIPC--;requestAutomaticIdle(current);}}
 // One opportunity per acknowledged open-to-closed presentation transition.
 // Drains may retry local preparation; an attempted worker close consumes it.
 function requestAutomaticIdle(s){
  if(!automaticDormancy||!s||current!==s||!enabled||!s.ready||!s.autoIdleOpportunity||s.autoIdleQueued||s.autoIdleAttempting||s.closing||s.wakePending)return;
  s.autoIdleQueued=true;queueMicrotask(()=>{
   s.autoIdleQueued=false;
   if(current!==s||!enabled||!live(s)||!s.ready||!s.autoIdleOpportunity||s.autoIdleAttempting||s.closing||s.wakePending||s.controller?.dormantReady?.()===true)return;
   let risk;try{const prepared=prepareIdle();risk=s.adapter?.prepareAutomaticIdle?.();
    if(!prepared?.isCurrent?.()||!risk?.isCurrent?.())return;
   }catch{return;}
   s.autoIdleOpportunity=false;s.autoIdleAttempting=true;
   void enterDormant(risk).catch(()=>false).finally(()=>{s.autoIdleAttempting=false;});
  });
 }
 // Revocable local preparation; the controller/worker still own final closure.
 function prepareIdle(){
  const s=current;
  const quiet=()=>enabled&&current===s&&!!s&&live(s)&&s.ready&&!s.closing&&Date.parse(s.binding?.expiresAt)>now()&&!rebindQueued&&!restoreArmed&&!activeWork&&!rawIPC&&!s.identityPending&&!s.capturePending&&!s.restorePending&&upgradeTimer===null&&upgradeIdentity===null;
  if(!quiet())return null;
  const revision=workRevision,binding=s.binding,run=epoch,rebind=rebindRun;
  const unchanged=()=>revision===workRevision&&binding===s.binding&&run===epoch&&rebind===rebindRun&&quiet();
  const adapter=s.adapter?.prepareIdle?.(),identity=isolatedReader.prepareIdle?.();
  if(!adapter?.isCurrent?.()||!identity?.isCurrent?.())return null;
  const token=Object.freeze({isCurrent:()=>unchanged()&&adapter.isCurrent()&&identity.isCurrent()&&unchanged()});
  return token.isCurrent()?token:null;
 }
 async function enterDormant(automaticPreparation=null){
  const s=current;if(!s||s.closing||s.wakePending)return false;
  const prepared=prepareIdle();if(!prepared?.isCurrent())return false;
  const adapter=s.adapter.prepareIdle?.(),reader=isolatedReader.prepareIdle?.();
  if(!adapter?.isCurrent?.()||!reader?.isCurrent?.()||!prepared.isCurrent())return false;
  const binding=s.binding,closing={interfered:false};s.closing=closing;
  const intact=()=>enabled&&live(s)&&(!automaticPreparation||automaticPreparation.isCurrent()===true)&&s.binding===binding&&s.closing===closing&&!closing.interfered&&s.ready&&Date.parse(binding.expiresAt)>now()&&adapter.isCurrent()&&reader.isCurrent();
  closing.isCurrent=intact;
  const started=elapsedNow(),remaining=()=>{const elapsed=elapsedNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('idle-close-deadline');return 6000-elapsed;};
  try{
   if(s.controller.dormantReady?.()!==true&&await s.controller.checkIdle?.({isCurrent:intact,timeoutMs:remaining()})!==true)return false;
   remaining();
   if(!intact()||s.controller.dormantReady?.()!==true&&s.controller.enterDormant?.()!==true)return false;
   closing.entered=true;
   let settled=false;try{settled=await s.controller.settleDormant?.({isCurrent:intact,timeoutMs:remaining()})===true;}catch{/* An incomplete clear cannot leave an unusable return entry. */}
   if(!settled&&intact()&&activeWork===0&&rawIPC===0&&s.controller.dormantReady?.()!==true){rebind(s,'reading',s.scopeKey);return false;}
   if(settled)s.busyClose=false;
   if(!settled&&intact()&&s.controller.idleReleaseBusy?.()===true){
    s.busyClose=true;
    if(await s.controller.renewDormantLease?.({timeoutMs:remaining()})===true&&enabled&&live(s)&&!s.recoveryDenied&&s.controller.cancelDormantClose?.()===true){closing.cancelled=true;}
   }
   return settled&&intact();
  }catch{return false;}finally{if(live(s)&&closing.entered)s.incompleteClose=!closing.cancelled&&s.controller.dormantReady?.()!==true;if(s.closing===closing)s.closing=null;}
 }
 // Each adapter generation owns its transport callbacks, including late cancel.
 function adapterOptions(s,binding){return {binding,ingestionPass:async pass=>{
  const message={v:1,type:'HOST_INGESTION_PASS',...bindingFields(binding),...pass};
  if(pass.phase==='cancel')return send(message);
  if(!live(s))throw Error('stale-content-session');
  if(!sameProducer(binding,s.binding))throw Error('stale-adapter-producer');
  return rpc(s,message);
 },emit:async (p,{deadlineAt=elapsedNow()+6000}={})=>{
  if(!live(s))throw Error('stale-content-session');
  if(!sameProducer(binding,s.binding))throw Error('stale-adapter-producer');
  // Local adapter budget only; never add elapsed deadlines to the wire proposal.
  const started=elapsedNow(),left=deadlineAt-started;
  const checkBudget=()=>{const at=elapsedNow();if(!Number.isFinite(at)||at<started||at>=deadlineAt)throw Error('request-timeout');};
  // Compare absolute clocks: subtracting a fractional start from start+6000
  // can round just above 6000 and reject an unsent, valid observation. Keep the
  // original deadline and cap the timer itself; no tolerance or renewed budget.
  if(!Number.isFinite(started)||!Number.isFinite(deadlineAt)||deadlineAt<=started||deadlineAt>started+6000)throw Error('request-timeout');
  const result=await rpc(s,p,Math.min(6000,left),null,deadlineAt);checkBudget();
  if(!live(s)||!sameProducer(binding,s.binding))return result;
  rememberRecent(s,p,result);if(['accepted','duplicate'].includes(result?.state)&&['surface-delta','current-observation'].includes(p.kind))for(const row of (p.kind==='current-observation'?p.payload.surface:p.payload).candidates)if(row.entity==='project'&&row.target?.kind==='resolved'&&row.evidence?.fieldPaths?.includes('current-project-route'))s.ackProjects.add(row.target.nativeId);return result;
 }};}
 function sameProducer(a,b){return !!a&&!!b&&['documentToken','producerToken','routeEpoch'].every(k=>a[k]===b[k]);}
 // A trusted native preparation offers recovery, never send/body authority.
 function nativePrepare(s,producer){
  if(!live(s))return false;
  // HELLO replaces the content binding before the old adapter is restarted.
  // Consume only that still-owned observer's repeat preparation in this gap.
  if(s.wakePending)return sameProducer(producer,s.wakePrior);
  if(!sameProducer(producer,s.binding)||!s.ready||!(s.controller?.dormantReady?.()||s.incompleteClose===true))return false;
  void wake(s,'reading').catch(()=>{});return s.wakePending===true;
 }
 async function wake(s,mode='workspace'){
  const quiet=()=>enabled&&live(s)&&s.ready&&!s.wakePending&&!s.closing&&(s.controller?.dormantReady?.()||s.incompleteClose===true)&&typeof s.scopeKey==='string'&&!!s.scopeKey&&!activeWork&&!rawIPC&&!rebindQueued&&!restoreArmed&&!s.identityPending&&!s.capturePending&&!s.restorePending&&upgradeTimer===null&&upgradeIdentity===null;
  if(!quiet()||s.busyClose===true)return null;
  const preparedRevision=workRevision;
  const adapter=s.adapter?.prepareRecovery?.(),reader=isolatedReader.prepareIdle?.();
  if(!adapter?.isCurrent?.()||!reader?.isCurrent?.()||preparedRevision!==workRevision||!quiet())return null;
  if(!s.controller.dormantReady()){
   // A previous close was interrupted while its frame clear was incomplete.
   // Only a later explicit return may replace those frames, after real work
   // drains. Never manufacture an ACK or replay the operation that interrupted.
   if(!s.incompleteClose||!adapter.isCurrent()||!reader.isCurrent()||preparedRevision!==workRevision||!quiet())return null;
   rebind(s,'reading',s.scopeKey);return null;
  }
  const prior=s.binding,scope=s.scopeKey,revision=s.wakeRevision??0,started=elapsedNow();
  const remaining=()=>{const elapsed=elapsedNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('request-timeout');return 6000-elapsed;};
  const check=()=>{remaining();if(!enabled||!live(s)||(s.wakeRevision??0)!==revision||!s.controller.dormantReady()||!adapter.isCurrent())throw Error('stale-dormant-recovery');};
  s.autoIdleOpportunity=false;s.autoSurfaceOpen=false;s.wakePending=true;s.wakePrior=prior;s.ready=false;
  try{return await track(async()=>{
   check();const hello=await handshake(s,{v:1,type:'HOST_HELLO',clientId,seq:++seq},remaining());check();
   if(!reader.isCurrent()||!bindingOK(hello?.binding)||hello.binding.producerToken===prior.producerToken||hello.binding.browserDocumentId!==prior.browserDocumentId||hello.binding.origin!==prior.origin)throw Error('invalid-host-binding');
   s.binding=Object.freeze({...hello.binding});s.identityChallenges.clear();s.identityAuthority=0;
   const auth=await handshake(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(s.binding)},remaining());noteScopeStatus(s,auth);
   if(s.identityTask)await withRequestDeadline(()=>s.identityTask,{timeoutMs:remaining(),now:elapsedNow,schedule,cancel});check();
   if(auth?.state!=='verified'||auth.scopeKey!==scope||s.identityPending||!isolatedReader.prepareIdle?.()?.isCurrent?.())throw Error('scope-not-verified');
   clearMigration(s);s.snippetRef=null;s.snippetScopeGrant=null;s.upgraded=null;
   const handle=await s.controller.resumeDormant(adapterOptions(s,s.binding),{mode});
   if(!handle||!live(s)||(s.wakeRevision??0)!==revision)throw Error('dormant-resume-failed');
   s.ready=true;return handle;
  });}catch(error){if(current===s){if(['scope-not-verified','context-handshake-transport-unavailable'].includes(error?.message))contextPending();else stop();}return null;}finally{s.wakePending=false;s.wakePrior=null;if(s.ready&&live(s))s.focus();}
 }
 const bindingFields=b=>({documentToken:b.documentToken,producerToken:b.producerToken,routeEpoch:b.routeEpoch});
 function live(s){return current===s&&!s.abort.signal.aborted&&doc.location.href===s.url;}
 // A document-local display hint, never an authority or retry signal.
 function noteScopeStatus(s,result){if(live(s))verificationWaitURL=exactHostRecord(result,['ok','v','type','state','reason'])&&result.ok===true&&result.v===1&&result.type==='HOST_SCOPE_STATUS'&&result.state==='unverified'&&result.reason==='host-verification-required'?s.url:null;}
 function bindingOK(b,prior){return exactHostRecord(b,['documentToken','producerToken','browserDocumentId','routeEpoch','origin','expiresAt'])&&['documentToken','producerToken','browserDocumentId'].every(k=>tokenOK(b[k]))&&Number.isSafeInteger(b.routeEpoch)&&b.routeEpoch>=0&&b.origin===origin&&Date.parse(b.expiresAt)>now()&&Date.parse(b.expiresAt)<=now()+20000&&(!prior||['documentToken','producerToken','browserDocumentId','routeEpoch','origin'].every(k=>b[k]===prior[k]));}
 // Classify only a freshly authorized worker scope, never a page-supplied
 // identity. An instant scope cannot authorize an old personal database.
 function instantScope(key){
  if(typeof key!=='string'||key.length>256)return false;
  try{const parts=JSON.parse(key);return Array.isArray(parts)&&parts.length===4&&parts[0]==='vaiwl-local-v1'&&parts[1]==='browser-local'&&parts[2]==='session'&&tokenOK(parts[3])&&JSON.stringify(parts)===key;}catch{return false;}
 }
 // Classify only transport rejection. Binding/scope validation remains outside
 // this wrapper, and a dormant handshake keeps its original elapsed budget.
 function handshake(s,message,timeoutMs=6000){return rpc(s,message,timeoutMs).catch(()=>{throw Error('context-handshake-transport-unavailable');});}
 function rpc(s,message,timeoutMs=6000,owner=null,proposalDeadline=null){return track(()=>rpcInner(s,message,timeoutMs,owner,proposalDeadline),owner);}
 async function rpcInner(s,message,timeoutMs,owner,proposalDeadline){
  const started=elapsedNow(),checkProposal=()=>{if(proposalDeadline===null)return;const at=elapsedNow();if(!Number.isFinite(at)||at<started||at>=proposalDeadline)throw Error('request-timeout');};
  if(proposalDeadline!==null){checkProposal();timeoutMs=Math.min(timeoutMs,proposalDeadline-started);}
  if(!live(s))throw Error('stale-content-session');let abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('stale-content-session'));s.abort.signal.addEventListener('abort',abort,{once:true});});
  try{const result=await withRequestDeadline(()=>Promise.race([Promise.resolve().then(()=>{checkProposal();if(!live(s))throw Error('stale-content-session');return send(message,owner);}),cancelled]),{timeoutMs,now:elapsedNow,schedule,cancel});checkProposal();if(!live(s))throw Error('stale-content-session');return result;}
  finally{s.abort.signal.removeEventListener('abort',abort);}
 }
 function clearMigration(s){const prior=s.migration;s.migration=null;if(prior?.leaseOwner)try{s.adapter?.releaseLoadedHandles?.(prior.leaseOwner);}catch{}for(const type of ['pointerdown','keydown','wheel','focusin'])doc.removeEventListener?.(type,s.migrationInterrupt,true);}
 function liveMigration(s){const m=s.migration;if(!m)return null;const time=now(),elapsed=elapsedNow();if(!Number.isFinite(time)||time<m.lastTime||time>=m.createdAt+30000||!Number.isFinite(elapsed)||elapsed<m.lastElapsed||elapsed>=m.elapsedDeadline){clearMigration(s);return null;}m.lastTime=time;m.lastElapsed=elapsed;return m;}
 function retainMigration(s,handle){const m=liveMigration(s);if(!m)return false;try{if(typeof s.adapter?.retainLoadedHandles==='function'&&s.adapter.retainLoadedHandles(m.leaseOwner,[handle],m.elapsedDeadline)!==true){clearMigration(s);return false;}}catch{clearMigration(s);return false;}m.handle=handle;return true;}
 function dispose(s,keepObservation=false){if(!s)return;clearMigration(s);doc.removeEventListener?.('visibilitychange',s.visibility);doc.defaultView.removeEventListener('focus',s.focus);doc.defaultView.removeEventListener('blur',s.blur);s.restorePending?.();s.capturePending?.cancel();s.snippets?.stop();s.candidates?.stop();try{s.controller?.stop();}catch{}s.abort.abort();try{runtime.onMessage.removeListener(s.listener);}catch{}doc.defaultView.removeEventListener('pagehide',s.pagehide);try{if(!keepObservation||observation?.adapter!==s.adapter)s.adapter?.stop();}catch{}}
 function reset(keepObservation=false){if(!keepObservation)stopObservation();epoch++;const s=current;current=null;dispose(s,keepObservation);}
 function stop(){transportWait=null;recoveryResume=null;recoveryBlocked=null;nativeUseIntent=null;contextWaitSuspended=false;verificationWaitURL=null;contextResumeAllowed=false;contextResumeMode='workspace';contextResumeURL=null;clearLearned();clearRecent();clearUpgrade();for(const type of ['pointerdown','keydown'])doc.removeEventListener?.(type,interruptUpgrade,true);enabled=false;restoreArmed=false;rebindQueued=false;rebindRun++;reset();doc.defaultView.removeEventListener('pagehide',pagehide);doc.defaultView.removeEventListener('pageshow',pageshow);}
 function presentationIntent(state){return (state.controller?.presentationIntent?.()??state.controller?.presentationMode?.()??state.initialMode)==='workspace'?'workspace':'reading';}
 function sidebarPreference(s){
  if(s.recoveryDenied)return null;
  const desired=s.controller?.sidebarPresentationIntent?.()??s.stoppedSidebarDesired;
  if(typeof desired==='boolean'&&typeof s.scopeKey==='string'&&s.scopeKey&&tokenOK(s.binding?.browserDocumentId))return {desired,scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId};
  // A second native route can arrive while the replacement handshake is still
  // pending. Carry the bit, not an old grant; the final fresh bind checks it.
  return s.sidebarPreference??null;
 }
 function pagehide(event){
  transportWait=null;
  stopObservation();
  if(event?.persisted!==true){stop();return;}
  if(!enabled&&contextResumeAllowed){
   // BFCache retains the bridge, but never its old observation or authority.
   // Returning only restores eligibility for a future external READY.
   clearLearned();clearRecent();clearUpgrade();contextWaitSuspended=true;
   restoreArmed=false;rebindQueued=false;rebindRun++;reset();return;
  }
  if(!enabled)return;
  // BFCache restores the same document, but every capability is replaced.
  // Retain only presentation intent so reading does not reopen the workspace.
  if(current){contextResumeMode=doc.location.href!==current.url?'reading':presentationIntent(current);contextResumeURL=doc.location.href;}
  clearLearned();clearRecent();clearUpgrade();restoreArmed=true;rebindQueued=false;rebindRun++;reset();
  doc.defaultView.addEventListener('pagehide',pagehide);
 }
 function pageshow(event){if(event?.persisted===true&&contextWaitSuspended){contextWaitSuspended=false;return;}if(event?.persisted!==true||!enabled||!restoreArmed)return;restoreArmed=false;void begin(false,contextResumeMode);}
 function rebind(s,initialMode=null,expectedScope=null,freshInstant=false){
  if(!enabled||current!==s||rebindQueued||s.busyClose===true&&doc.location.href===s.url)return;
  if(initialMode===null)initialMode=presentationIntent(s);
  if(doc.location.href!==s.url){rememberDepartingRoute(s);upgrade.navigate({url:doc.location.href});initialMode='reading';}else if(!upgrade.isTarget({url:doc.location.href}))clearUpgrade();
  const preference=sidebarPreference(s);
  const recovery=expectedScope===null?null:{scopeKey:expectedScope,documentId:s.binding?.browserDocumentId,freshInstant:freshInstant===true&&instantScope(expectedScope)};
  rebindQueued=true;const run=++rebindRun;reset();doc.defaultView.addEventListener('pagehide',pagehide);
  // Collapse a burst into one replacement. Only external events can request a
  // subsequent attempt; failures never schedule their own recovery loop.
  queueMicrotask(()=>{if(!enabled||run!==rebindRun)return;rebindQueued=false;void begin(true,initialMode,recovery,preference);});
 }
 async function start(){frameReplaced=false;startupFailure=null;establishedProducer=null;recoveryTimes=[];recoveryClock=null;recoveryBlocked=null;recoveryResume=null;contextWaitSuspended=false;verificationWaitURL=null;contextResumeMode='workspace';contextResumeURL=null;contextResumeAllowed=contextRecovery===true;clearLearned();clearRecent();clearUpgrade();recoveryRemaining=1;enabled=true;restoreArmed=false;rebindQueued=false;rebindRun++;doc.defaultView.addEventListener('pageshow',pageshow);return begin();}
 // Legacy entry points remain harmless: presentation recovery now belongs to
 // the live surface controller, never another document handshake.
 async function recoverLayout(){return null;}
 async function recoverRoute(){return null;}
 async function begin(rebinding=false,initialMode='workspace',recovery=null,preference=null){
  transportWait=null;reset();const s={run:epoch,initialMode,sidebarPreference:preference,url:doc.location.href,abort:new AbortController(),binding:null,controller:null,adapter:null,listener:()=>{},pagehide,plans:null,rebinding,ready:false,recoveryDenied:false,snippets:null,snippetRef:null,snippetScopeGrant:null,identityChallenges:new Map(),identityPending:false,identityAuthority:0};current=s;doc.defaultView.addEventListener('pagehide',s.pagehide);
  let foregroundArmed=doc.visibilityState==='hidden',foregroundPending=false;
  s.blur=()=>{foregroundArmed=true;};
  s.focus=()=>{
   if(doc.visibilityState!=='visible'||!foregroundArmed||!s.ready||!live(s))return;
   if(foregroundPending)return;foregroundArmed=false;foregroundPending=true;let foregroundFailure='foreground-failed';
   const recoverTransport=()=>{
    if(!enabled||!live(s)||typeof s.scopeKey!=='string'||!s.scopeKey||s.recoveryDenied||s.busyClose===true||!takeRecovery(s,true))return false;
    rebind(s,null,s.scopeKey,true);return true;
   };
   void track(()=>rpc(s,{v:1,type:'HOST_FOCUS',clientId,seq:++seq,...bindingFields(s.binding)}).then(result=>{
    noteScopeStatus(s,result);
    if(exactHostRecord(result,['ok','reason'])&&result.ok===false&&result.reason==='invalid-host-document'&&recoverTransport())return;
    if(result?.ok!==true||result.state!=='verified'||result.scopeKey!==s.scopeKey){
     const code=result?.ok!==true?'foreground-'+result?.reason:result.state!=='verified'?'foreground-scope-unverified':'foreground-scope-changed';
     if(foregroundFailureStates.includes(code))foregroundFailure=code;
     throw Error('foreground-scope-unverified');
    }
   },()=>{
    // A lost port is not an identity decision. Discard the old session and use
    // the existing one-shot HELLO + fresh worker authorization path. No
    // stored receipt, old grant or extra retry budget is made authoritative.
    if(!recoverTransport()){foregroundFailure='foreground-transport-unavailable';throw Error('foreground-transport-unavailable');}
   }).catch(()=>{if(live(s)){startupFailure={url:s.url,state:foregroundFailure,shape:null};s.recoveryDenied=true;contextPending();}}).finally(()=>{foregroundPending=false;s.focus();})).catch(()=>{});
  };
  s.visibility=()=>{if(doc.visibilityState==='hidden')foregroundArmed=true;else s.focus();};
  doc.addEventListener?.('visibilitychange',s.visibility);doc.defaultView.addEventListener('focus',s.focus);doc.defaultView.addEventListener('blur',s.blur);
  s.listener=(m,sender,reply)=>{
   if(current!==s||!enabled||sender?.id!==runtime.id)return;
   return sync(()=>{
   if(s.wakePending&&m?.type!=='HOST_IDENTITY_CHALLENGE')s.wakeRevision=(s.wakeRevision??0)+1;
   if(m?.type==='HOST_IDENTITY_CHALLENGE'){
    const wall=now(),started=elapsedNow(),until=Date.parse(m.expiresAt);
    const fields=['type','challenge','providerId','documentToken','producerToken','routeEpoch','authorityEpoch','actualURL','expiresAt','timeoutMs'];
    if(Number.isFinite(wall))for(const [challenge,expiry]of s.identityChallenges)if(expiry<=wall)s.identityChallenges.delete(challenge);
    if(sender.tab!==undefined||doc.defaultView.top!==doc.defaultView||!exactHostRecord(m,fields)||!tokenOK(m.challenge)||m.providerId!=='chatgpt-session-v1'||!s.binding||!live(s)||!Number.isFinite(wall)||!Number.isFinite(started)||typeof m.expiresAt!=='string'||!Number.isFinite(until)||until<=wall||until>wall+6000||until>Date.parse(s.binding.expiresAt)||typeof m.timeoutMs!=='number'||!Number.isFinite(m.timeoutMs)||m.timeoutMs<=0||m.timeoutMs>6000||!Number.isSafeInteger(m.authorityEpoch)||m.authorityEpoch<1||m.authorityEpoch<s.identityAuthority||m.actualURL!==s.url||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)||s.identityPending||s.identityChallenges.has(m.challenge)||s.identityChallenges.size>=128){reply({ok:false});return;}
    const command={...m},binding=s.binding,budget=Math.min(m.timeoutMs,until-wall);let lastWall=wall,lastElapsed=started;
    s.identityChallenges.set(command.challenge,until);s.identityPending=true;s.identityAuthority=command.authorityEpoch;
    const valid=()=>{const time=now(),elapsed=elapsedNow();if(!live(s)||s.binding!==binding||s.identityAuthority!==command.authorityEpoch||!Number.isFinite(time)||!Number.isFinite(elapsed)||time<lastWall||elapsed<lastElapsed||time>=until||elapsed-started>=budget||Date.parse(binding.expiresAt)<=time)return false;lastWall=time;lastElapsed=elapsed;return true;};
    // Dispatch acknowledgements deliberately contain no identity. Only the
    // separately verified runtime result can settle the worker challenge.
    reply({ok:true});
    s.identityTask=track(async()=>{
     let identity,ok=false;
     try{if(!valid())return;identity=await isolatedReader.read({signal:s.abort.signal,timeoutMs:budget});if(!valid())return;
      const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
      const ids=new Set();ok=exactHostRecord(identity,['principalId','expiresAt','contexts','providerProfile','transport'])&&identifier(identity.principalId)&&typeof identity.expiresAt==='string'&&Number.isFinite(Date.parse(identity.expiresAt))&&Date.parse(identity.expiresAt)>now()&&identity.providerProfile===command.providerId&&identity.transport==='isolated-fixed-fetch'&&Array.isArray(identity.contexts)&&identity.contexts.length<=256&&Reflect.ownKeys(identity.contexts).length===identity.contexts.length+1&&Reflect.ownKeys(identity.contexts).every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<identity.contexts.length)&&identity.contexts.every(row=>{if(!exactHostRecord(row,['id','kind'])||!identifier(row.id)||ids.has(row.id)||!['personal','organization','unknown'].includes(row.kind))return false;ids.add(row.id);return true;});
     }catch{/* Transport diagnostics and credentials never enter messages. */}
     if(!valid())return;
     const result={type:'HOST_IDENTITY_RESULT',challenge:command.challenge,...bindingFields(binding),authorityEpoch:command.authorityEpoch,ok,...(ok?{identity}:{})};
     try{await send(result);}catch{/* Worker interruption has no automatic replay. */}
    }).finally(()=>{s.identityPending=false;});return;
   }
   if(exactHostRecord(m,['type'])&&m.type==='HOST_DOCUMENT_INVALIDATED'){rebind(s);return;}
   if(m?.type==='HOST_CANDIDATES'){
    const fields=m.phase==='list'?['type','documentToken','producerToken','routeEpoch','phase',...(Object.hasOwn(m,'offset')?['offset']:[])]:['type','documentToken','producerToken','routeEpoch','phase','candidate','actionId','uiGrantId','mountId','expiresAt',...(Object.hasOwn(m,'display')?['display']:[])];if(Object.hasOwn(m,'role'))fields.push('role');
    if(!exactHostRecord(m,fields)||Object.hasOwn(m,'role')&&!['workspace','sidebar'].includes(m.role)||!['list','activate'].includes(m.phase)||!s.ready||!s.candidates||!live(s)||Date.parse(s.binding.expiresAt)<=now()||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)){reply({ok:false});return;}
    void track(async()=>{const task=m.phase==='list'?s.candidates.listPage(Object.hasOwn(m,'offset')?m.offset:0):s.candidates.activate({candidate:m.candidate,actionId:m.actionId,uiGrantId:m.uiGrantId,mountId:m.mountId,expiresAt:m.expiresAt,...(Object.hasOwn(m,'display')?{display:m.display}:{})});
    await Promise.resolve(task).then(value=>{const migration=liveMigration(s);if(m.phase==='list'&&migration&&m.role&&now()>=migration.createdAt&&now()<migration.createdAt+30000){const own=m.role===migration.display.role,presentation=own?migration.display.presentation:{offset:0,scrollTop:0,focused:false};value={...value,migration:{id:migration.id,projectId:migration.projectId,presentation,ready:migration.ready,focusAllowed:own&&migration.ready&&migration.focusAllowed&&presentation.focused}};}reply(live(s)?value:{ok:false});},()=>reply({ok:false}));}).catch(()=>{});return true;
   }
   if(['HOST_NATIVE_DISPATCH_CURRENT','HOST_NATIVE_DISPATCH_PLAN','HOST_NATIVE_CANCEL_PLAN'].includes(m?.type)){
    if(!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','command','expiresAt'])||!s.ready||!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v)){reply({state:'blocked'});return;}
    void track(()=>Promise.resolve(m.type==='HOST_NATIVE_CANCEL_PLAN'?s.plans.cancelAction({command:m.command,expiresAt:m.expiresAt}):s.plans.activate({command:m.command,expiresAt:m.expiresAt})).then(result=>reply(live(s)?result:{state:m.type==='HOST_NATIVE_DISPATCH_PLAN'?'unconfirmed':'blocked'}),()=>reply({state:'unconfirmed'}))).catch(()=>{});return true;
   }
   if(m?.type==='HOST_SNIPPET_RESTORE'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','scopeGrantId','ref','anchor','expiresAt'])&&typeof m.expiresAt==='string'&&Date.parse(m.expiresAt)>now()&&Date.parse(m.expiresAt)<=now()+6000&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v)&&tokenOK(m.scopeGrantId)&&exactHostRecord(m.ref,['id','nativeUrl'])&&tokenOK(m.ref.id)&&typeof m.ref.nativeUrl==='string'&&m.ref.nativeUrl.length<=2048&&exactHostRecord(m.anchor,['refId','messageId','branchId','text','bodyHash']);
    if(!allowed){reply({ok:false});return;}
    // Revealing a masked body can require a new owner-acknowledged body proof.
    // Wait for that proof within this one command; never retry scrolling.
    s.restorePending?.();let attempts=0,timer=null,done=false,readingCurrent=()=>true;
    const events=['pointerdown','focusin','keydown','wheel','beforetoggle'];
    const finish=ok=>{if(done)return;done=true;if(timer!==null)cancel(timer);for(const type of events)doc.removeEventListener?.(type,interrupted,true);if(s.restorePending===abort)s.restorePending=null;reply({ok});};
    const abort=()=>finish(false),interrupted=event=>{if(event.isTrusted===true&&(event.type!=='beforetoggle'||event.newState==='open'))abort();};
    const started=elapsedNow(),remaining=Date.parse(m.expiresAt)-now();
    const fresh=()=>!done&&current===s&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Date.parse(m.expiresAt)>now()&&elapsedNow()-started>=0&&elapsedNow()-started<remaining&&readingCurrent()&&s.adapter?.hasNativeLayer?.()!==true;
    const restore=()=>{try{if(!fresh()||++attempts>120){finish(false);return;}if(typeof s.adapter?.snippetReady==='function'&&!s.adapter.snippetReady(m.ref)){timer=schedule(restore,Math.min(50,Math.max(1,Date.parse(m.expiresAt)-now())));return;}const restored=s.adapter?.restoreSnippet?.(m.ref,m.anchor)?.ok===true;finish(restored&&fresh());}catch{finish(false);}};
    try{if(s.controller?.showReading()!==true){finish(false);return;}readingCurrent=s.controller.readingGuard?.()??(()=>true);s.restorePending=abort;for(const type of events)doc.addEventListener?.(type,interrupted,true);restore();}catch{finish(false);}return true;
   }
   if(m?.type==='HOST_SNIPPET_SELECTION'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','scopeGrantId','phase','ref','selectionId',...(m.phase==='capture'?['expiresAt']:[])])&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v)&&tokenOK(m.scopeGrantId)&&['capture','validate','release'].includes(m.phase)&&exactHostRecord(m.ref,['id','nativeUrl'])&&tokenOK(m.ref.id)&&typeof m.ref.nativeUrl==='string'&&m.ref.nativeUrl.length<=2048&&(m.phase==='capture'?m.selectionId===null&&typeof m.expiresAt==='string'&&Number.isFinite(Date.parse(m.expiresAt))&&Date.parse(m.expiresAt)>now()&&Date.parse(m.expiresAt)<=now()+6000:tokenOK(m.selectionId));
    if(!allowed||!s.snippets){reply({ok:false});return;}
    try{
     if(m.phase==='capture'){
      s.capturePending?.cancel();s.snippetScopeGrant=m.scopeGrantId;s.snippetRef=Object.freeze({...m.ref});const ref=s.snippetRef,pending={cancel:()=>{}};s.capturePending=pending;
      pending.cancel=waitForSnippetCapture({document:doc,timeoutMs:Date.parse(m.expiresAt)-now(),now:elapsedNow,schedule,cancel,
       isCurrent:()=>Date.parse(m.expiresAt)>now()&&current===s&&live(s)&&s.ready&&s.binding&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v)&&s.snippetScopeGrant===m.scopeGrantId&&s.snippetRef===ref&&s.adapter?.hasNativeLayer?.()!==true,
       ready:()=>typeof s.adapter?.snippetReady!=='function'||s.adapter.snippetReady(ref)===true,
       capture:()=>{const id=s.snippets.capture(ref),anchor=id&&s.snippets.read(id,ref);return anchor?{ok:true,selectionId:id,anchor}:{ok:false};},
       reply:value=>{if(s.capturePending===pending)s.capturePending=null;reply(value);}});return true;
     }
     if(m.scopeGrantId!==s.snippetScopeGrant||(m.ref.id!==s.snippetRef?.id||m.ref.nativeUrl!==s.snippetRef?.nativeUrl)){reply({ok:false});return;}
     if(m.phase==='release'){reply({ok:s.snippets.consume(m.selectionId)});return;}
     const anchor=s.snippets.read(m.selectionId,s.snippetRef);reply(anchor?{ok:true,anchor}:{ok:false});return;
    }catch{reply({ok:false});return;}
   }
   if(m?.type==='HOST_NATIVE_MANAGEMENT'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch'])&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v);
    reply(allowed?s.controller?.readNativeManagement?.()??[]:null);return;
   }
   if(m?.type==='HOST_PRESENT_SURFACE'){
    const allowed=exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','mode'])&&['workspace','workspace-current','reading','native-page'].includes(m.mode)&&s.ready&&s.binding&&live(s)&&Date.parse(s.binding.expiresAt)>now()&&Object.entries(bindingFields(s.binding)).every(([k,v])=>m[k]===v);
    if(!allowed){reply({ok:false});return;}
    let ok=false;try{ok=(m.mode==='workspace-current'?s.controller.isWorkspacePresented():m.mode==='workspace'?s.controller.showWorkspace():m.mode==='native-page'?s.controller.showNativeReading():s.controller.showReading())===true;}catch{}reply({ok});return;
   }
   if(!s.plans||!live(s)||Date.parse(s.binding.expiresAt)<=now()||!exactHostRecord(m,['type','documentToken','producerToken','routeEpoch','targets'])||m.type!=='HOST_NATIVE_PLAN'||Object.entries(bindingFields(s.binding)).some(([k,v])=>m[k]!==v))return;
   try{reply(s.plans.plan({targets:m.targets}));}catch{reply(null);}
   });
  };runtime.onMessage.addListener(s.listener);
  let startupPhase='hello';
  // Historical first-start phase only. Current presentation and boundary state
  // are read through the private controller status/layout, without ancestor writes.
  const reportStartup=phase=>{if(current!==s)return;startupFailure=[...initializationFailureStates,'layout-failed','hello-failed','adapter-failed','authorization-failed','surface-failed'].includes(phase)?{url:s.url,shape:s.layoutShape??null,state:phase==='hello-failed'&&helloFailureStates.includes(s.helloFailure)?s.helloFailure:phase==='layout-failed'&&layoutFailureStates.includes(s.layoutFailure)?s.layoutFailure:phase==='surface-failed'&&surfaceFailureStates.includes(s.surfaceFailure)?s.surfaceFailure:phase}:null;if(doc.documentElement?.dataset)doc.documentElement.dataset.vaiwlStartup=phase;};
  reportStartup(startupPhase);
  try{
   // A C2 transport failure withdraws capabilities but keeps the passive
   // context listener eligible for a later genuine native READY notification.
   // This helper neither retries nor handles explicit negative responses.
   const hello=await handshake(s,{v:1,type:'HOST_HELLO',clientId,seq:++seq});
   // Only known private transport refusal codes survive. No raw reply or error.
   if(exactHostRecord(hello,['ok','reason'])&&hello.ok===false&&helloFailureStates.includes('hello-'+hello.reason))s.helloFailure='hello-'+hello.reason;
   else if(!bindingOK(hello?.binding))s.helloFailure='hello-invalid-binding';
   if(contextRecovery===true&&exactHostRecord(hello,['ok','reason'])&&hello.ok===false&&hello.reason==='invalidated-during-check')throw Error('context-handshake-superseded');if(!bindingOK(hello?.binding))throw Error('invalid-host-binding');s.binding=Object.freeze({...hello.binding});
   startupPhase='adapter';reportStartup(startupPhase);
   let surface;const adapter=s.adapter=adapterFactory({document:doc,onNativeUse:(intent,producer,proof)=>captureNativeUse(s,intent,producer,proof),onIdleHint:()=>requestAutomaticIdle(s),onNativePrepare:producer=>nativePrepare(s,producer),priorityConversationId:()=>recentId(s),onOldSendOperation:(intent,producer)=>{if(!live(s)||!s.ready||!sameProducer(producer,s.binding))return;void send({type:'HOST_OLD_SEND_OPERATION',documentToken:s.binding.documentToken,producerToken:s.binding.producerToken,routeEpoch:s.binding.routeEpoch,...intent}).catch(()=>{});},onFirstSendIntent:(intent,producer)=>{if(!live(s)||!s.ready||!sameProducer(producer,s.binding)||s.url!==origin+'/')return;void send({type:'HOST_FIRST_SEND_INTENT',documentToken:s.binding.documentToken,producerToken:s.binding.producerToken,routeEpoch:s.binding.routeEpoch,...intent}).catch(()=>{});},onSurfaceChange:records=>{if(live(s))surface?.surrenderChanged?.(records);},isOwnedSurface:node=>live(s)&&surface?.isOwnedSurface?.(node)===true,isOwnedMask:node=>live(s)&&surface?.isMasked?.(node)===true,
    isReadingProbeSurface:node=>live(s)&&surface?.isReadingProbeSurface?.(node)===true,
    withNativeReading:read=>live(s)?s.controller?.withNativeReading?.(read)??null:null,urlPolicy:createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),now,elapsedNow,authorize:async command=>{if(s.candidates?.authorize(command)!==true&&s.plans?.authorize(command)!==true)return false;const result=await rpc(s,{v:1,type:'HOST_NATIVE_AUTHORIZE',...bindingFields(s.binding),command});return result?.ok===true&&(s.candidates?.authorize(command)===true||s.plans?.authorize(command)===true);},beforeDispatch:plan=>{
     if(plan?.mode==='same-target')return;
     const release=s.controller?.beginNativeDispatch?.();if(typeof release!=='function')throw Error('native-presentation-unavailable');
     try{if(s.plans?.beforeDispatch?.(plan)!==true)s.candidates?.beforeDispatch();return release;}catch(error){release();throw error;}
    },onNativeDispatch:event=>{if(event.plan.target.kind!=='live-control'||!s.scopeKey)return;const identity=s.adapter.captureCandidateIdentity?.(event.plan.control);if(!identity)return;clearUpgrade();upgradeIdentity=identity;upgradeDisplay=s.candidates?.displayFor(event.command)??null;for(const type of ['pointerdown','keydown'])doc.addEventListener?.(type,interruptUpgrade,true);for(const type of ['popstate','hashchange'])doc.defaultView.addEventListener(type,upgradeRoute);upgrade.propose({actionId:event.actionId,identity,scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,originalURL:s.url,expiresAt:now()+6000});upgradeTimer=schedule(clearUpgrade,6000);},onNativeDispatchCancelled:event=>{if(upgrade.cancel(event.actionId))clearUpgrade();},onRebindNeeded:()=>{if(observation?.adapter===s.adapter)stopObservation();rebind(s);}});
   await startObservation(s);
   startupPhase='authorization';reportStartup(startupPhase);
   const auth=await handshake(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(s.binding)});noteScopeStatus(s,auth);if(auth?.state!=='verified')throw Error('scope-not-verified');
   if(recovery!==null){
    if(!tokenOK(recovery.documentId)||s.binding.browserDocumentId!==recovery.documentId)throw Error('recovery-document-changed');
    if(auth.scopeKey!==recovery.scopeKey){
     // A lost worker has no former RAM namespace. Start a clean instant view
     // in this same browser document instead of treating the new random key
     // as an account switch. Neither personal nor strict scopes qualify.
     if(!recovery.freshInstant||!exactHostRecord(auth,['ok','v','type','state','scopeKey'])||auth.ok!==true||auth.v!==1||auth.type!=='HOST_SCOPE_STATUS'||!instantScope(auth.scopeKey))throw Error('recovery-scope-changed');
     clearLearned();clearRecent();clearUpgrade();s.sidebarPreference=null;
    }
   }
   s.contextReadyPending=false;s.scopeKey=auth.scopeKey;s.ackProjects=new Set();s.upgraded=null;
   if(s.sidebarPreference?.scopeKey!==s.scopeKey||s.sidebarPreference?.documentId!==s.binding.browserDocumentId)s.sidebarPreference=null;
   startupPhase='initialization-preparation';reportStartup(startupPhase);
   if(learnedScope!==s.scopeKey||learnedDocument!==s.binding.browserDocumentId)clearLearned();learnedScope=s.scopeKey;learnedDocument=s.binding.browserDocumentId;
   recentId(s);
   // Authentication never adopts provisional candidates: destroy the RAM
   // snapshot/handles, then the existing controller starts a fresh producer scan.
   if(Date.parse(s.binding.expiresAt)<=now()||s.adapter.observationStatus?.().state==='stopped')throw Error('stale-content-session');
   stopObservation();
   startupPhase='initialization-candidates';reportStartup(startupPhase);
   s.candidates=createContentCandidates({adapter,streaming:true,current:()=>live(s)&&s.ready&&Date.parse(s.binding.expiresAt)>now(),showReading:()=>s.controller?.showReading()===true,
    beginScan:()=>{
     // Only fixed-size document identities are staged. Visiting a row cannot
     // prune learned state, consume an upgrade, or install a return migration.
     const prior={learned,upgraded:s.upgraded,migration:s.migration,identity:upgradeIdentity,display:upgradeDisplay,projects:new Set(s.ackProjects)},seen=new Map();
     const route=createURLPolicy({origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}).parse(s.url);
     const resolution=route.kind==='project'&&prior.projects.has(route.projectId)?{scopeKey:s.scopeKey,documentId:s.binding.browserDocumentId,url:s.url,projectId:route.projectId,identityMatches:true}:null;
     const preview=resolution&&upgrade.preview(resolution);
     let upgradedHandle=null,pendingHandle=null,committed=false;
     const matches=(identity,handle)=>!!identity&&adapter.matchesCandidateIdentity?.(identity,handle)===true;
     const check=()=>{if(committed||!live(s)||!s.ready||Date.parse(s.binding.expiresAt)<=now()||learned!==prior.learned||s.upgraded!==prior.upgraded||s.migration!==prior.migration||upgradeIdentity!==prior.identity||upgradeDisplay!==prior.display||s.ackProjects.size!==prior.projects.size||[...prior.projects].some(id=>!s.ackProjects.has(id)))throw Error('stale-candidate-identity-scan');};
     return {visit:row=>{
      check();const handle=row.target.control;
      for(const item of prior.learned)if(matches(item.identity,handle))seen.set(item.identity,handle);
      if(matches(prior.upgraded?.identity,handle))upgradedHandle=handle;
      if(matches(prior.identity,handle))pendingHandle=handle;
      return !!(prior.upgraded&&prior.projects.has(prior.upgraded.projectId)&&matches(prior.upgraded.identity,handle)||prior.learned.some(item=>matches(item.identity,handle))||preview&&preview.identity===prior.identity&&matches(prior.identity,handle));
     },retainedHandles:()=>{check();return [...new Set([...seen.values(),upgradedHandle,pendingHandle].filter(Boolean))];},commit:()=>{
      check();const kept=prior.learned.filter(item=>seen.has(item.identity)&&matches(item.identity,seen.get(item.identity)));
      if(kept.length!==seen.size||upgradedHandle&&!matches(prior.upgraded?.identity,upgradedHandle)||pendingHandle&&!matches(prior.identity,pendingHandle))throw Error('stale-candidate-identity-scan');
      let next=upgradedHandle&&matches(prior.upgraded?.identity,upgradedHandle)?prior.upgraded:null,result=null;
      const pendingValid=pendingHandle&&matches(prior.identity,pendingHandle);
      const known=pendingValid&&(next&&prior.projects.has(next.projectId)&&matches(next.identity,pendingHandle)||kept.some(item=>matches(item.identity,pendingHandle)));
      if(pendingValid&&!known&&preview){
       result=upgrade.resolve(resolution);
       if(!result||result.identity!==preview.identity||result.projectId!==preview.projectId||result.actionId!==preview.actionId)throw Error('stale-candidate-identity-scan');
      }
      check();committed=true;learned=kept;s.upgraded=next;
      if(s.migration&&!next)clearMigration(s);
      if(next&&prior.projects.has(next.projectId)&&s.migration)retainMigration(s,upgradedHandle);
      if(!result)return;
      s.upgraded=result;if(learned.length<32&&!learned.some(item=>item.identity===result.identity))learned.push(Object.freeze({identity:result.identity,projectId:result.projectId}));
      if(prior.display){
       clearMigration(s);
       const createdAt=now(),createdElapsed=elapsedNow();
       s.migration={id:result.actionId,leaseOwner:'candidate-migration_'+result.actionId,projectId:result.projectId,display:prior.display,handle:pendingHandle,createdAt,lastTime:createdAt,lastElapsed:createdElapsed,elapsedDeadline:createdElapsed+30000,ready:s.returned===true,focusAllowed:true};
       if(!retainMigration(s,pendingHandle)){clearUpgrade();return;}
       // A trusted return can precede this first committed candidate scan.
       // Focus only while that return's surface intent is still current; the
       // normal controller gate rechecks live grants, mode and native layers.
       if(s.migration.ready&&prior.display.presentation.focused)s.migration.focusAllowed=s.returnFocusGuard?.()===true&&s.controller.focusFrame?.(prior.display.role)===true;
       const migration=s.migration;s.migrationInterrupt=event=>{const target=event.composedPath?.()[0]??event.target;if(s.migration===migration&&event.isTrusted===true&&!s.controller?.isReturnTarget?.(target)&&!(event.type==='focusin'&&migration.ready&&s.controller?.isFrameTarget?.(migration.display.role,target)))migration.focusAllowed=false;};
       for(const type of ['pointerdown','keydown','wheel','focusin'])doc.addEventListener?.(type,s.migrationInterrupt,true);
      }
      clearUpgrade();
     }};
    },
    isUpgraded:row=>{const matches=identity=>adapter.matchesCandidateIdentity?.(identity,row.target.control)===true;return !!(s.upgraded&&s.ackProjects.has(s.upgraded.projectId)&&matches(s.upgraded.identity)||learned.some(item=>matches(item.identity)));},now,elapsedNow});
   startupPhase='initialization-snippets';reportStartup(startupPhase);
   s.snippets=createSnippetSelectionSession({adapter:{selectedSnippet:ref=>adapter.selectedSnippet?.(ref)??null},now,elapsedNow,makeId,
    currentBinding:()=>live(s)&&s.ready&&s.binding&&Date.parse(s.binding.expiresAt)>now()&&s.snippetScopeGrant?JSON.stringify({...bindingFields(s.binding),scopeGrantId:s.snippetScopeGrant}):null,
    currentSelectionEpoch:()=>s.snippetRef?adapter.selectionEpoch?.(s.snippetRef)??null:null});
   startupPhase='initialization-navigation';reportStartup(startupPhase);
   s.plans=plansFactory({adapter,showNativeReading:()=>s.adapter?.hasNativeLayer?.()!==true&&s.controller?.showNativeReading?.()===true,captureIntent:()=>s.controller?.intentGuard?.()??(()=>false),showReading:()=>s.adapter?.hasNativeLayer?.()!==true&&s.controller?.showReading()===true,now,elapsedNow,schedule,cancel,bindingCurrent:()=>live(s)&&Date.parse(s.binding.expiresAt)>now()&&(s.controller?.isNativeStructureCurrent?.()??adapter.inspect().ok)?s.binding.documentToken+':'+s.binding.producerToken+':'+s.binding.routeEpoch:false});
   startupPhase='initialization-surface';reportStartup(startupPhase);
   surface=surfaceFactory({document:doc,createFrameURL:({role})=>runtime.getURL(role+'.html'),hasNativeLayer:()=>adapter.hasNativeLayer(),takeMountDiagnostic:()=>mountDiagnostic.take(()=>live(s))});
   const bridge={
    workspaceEstablished:({binding,mountId})=>{
     if(!enabled||!live(s)||!s.ready||s.recoveryDenied||!bindingOK(binding,s.binding)||!tokenOK(mountId)||typeof s.scopeKey!=='string'||!s.scopeKey)return false;
     const producer=JSON.stringify([binding.browserDocumentId,binding.documentToken,binding.producerToken,binding.routeEpoch]);
     if(producer===establishedProducer)return false;
     establishedProducer=producer;s.transportRecoveryAvailable=true;return true;
    },
    cancelledCloseReady:()=>{if(enabled&&live(s)&&s.ready&&!s.recoveryDenied)s.busyClose=false;},
    releaseCancelledClose:async({handle,binding,isCurrent,timeoutMs=6000})=>{
     const quiet=()=>enabled&&live(s)&&s.ready&&s.busyClose===true&&!s.recoveryDenied&&!s.cancelReleaseAttempted&&(recoveryRemaining>0||s.transportRecoveryAvailable===true)&&!s.closing&&!s.wakePending&&!activeWork&&!rawIPC&&!s.identityPending&&!s.capturePending&&!s.restorePending&&!rebindQueued&&!restoreArmed&&upgradeTimer===null&&upgradeIdentity===null;
     if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>6000||!quiet()||typeof isCurrent!=='function'||!isCurrent()||!bindingOK(binding,s.binding)||typeof s.scopeKey!=='string'||!s.scopeKey)return false;
     s.cancelReleaseAttempted=true;const prior=s.binding,scope=s.scopeKey,closing={interfered:false};s.closing=closing;
     const intact=()=>enabled&&live(s)&&s.ready&&s.busyClose===true&&!s.recoveryDenied&&s.binding===prior&&s.closing===closing&&!closing.interfered&&bindingOK(prior)&&isCurrent();
     try{
      // Only the worker's atomic guarded release permits replacing a producer
      // that previously reported busy. CHECK/transport failure never suffice.
      const result=await rpc(s,{v:1,type:'HOST_UI_IDLE_RELEASE',...bindingFields(prior),mountId:handle.id},timeoutMs,closing);
      if(!exactHostRecord(result,['ok'])||result.ok!==true||!intact()||activeWork||rawIPC||!takeRecovery(s,true))return false;
      s.busyClose=false;rebind(s,'reading',scope);return true;
     }catch{return false;}finally{if(s.closing===closing)s.closing=null;}
    },
    renewDormantBinding:({binding,timeoutMs})=>track(async()=>{
     if(!bindingOK(binding,s.binding)||s.controller?.dormantReady?.()!==true)throw Error('stale-dormant-binding');
     const prior=s.binding,scope=s.scopeKey,started=elapsedNow();
     const remaining=()=>{const elapsed=elapsedNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs)throw Error('request-timeout');return timeoutMs-elapsed;};
     const check=()=>{remaining();if(!live(s)||s.binding!==prior||!bindingOK(prior)||s.scopeKey!==scope||!s.ready||s.controller?.dormantReady?.()!==true)throw Error('stale-dormant-binding');};
     check();const result=await rpc(s,{v:1,type:'HOST_DOCUMENT_RENEW',clientId,seq:++seq,...bindingFields(prior)},remaining());check();
     if(result?.ok!==true||!bindingOK(result.binding,prior))throw Error('invalid-host-binding');
     const auth=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(prior)},remaining());check();noteScopeStatus(s,auth);
     if(auth?.state!=='verified'||auth.scopeKey!==scope){s.recoveryDenied=true;throw Error('scope-not-verified');}
     s.binding=Object.freeze({...result.binding});return {ok:true,binding:s.binding};
    }),
    checkIdleMount:({handle,timeoutMs})=>{const closing=s.closing;if(!closing?.isCurrent())return Promise.resolve({ok:false});return rpc(s,{v:1,type:'HOST_UI_IDLE_CHECK',...bindingFields(s.binding),mountId:handle.id},timeoutMs,closing);},
    releaseIdleMount:({handle,timeoutMs})=>{const closing=s.closing;if(!closing?.isCurrent())return Promise.resolve({ok:false});return rpc(s,{v:1,type:'HOST_UI_IDLE_RELEASE',...bindingFields(s.binding),mountId:handle.id},timeoutMs,closing);},
    registerMount:({handle})=>rpc(s,{v:1,type:'HOST_UI_MOUNT',...bindingFields(s.binding),mountId:handle.id,regionEpoch:handle.regionEpoch}),
    releaseRole:v=>rpc(s,{v:1,type:'HOST_UI_ROLE_RELEASE',...v,...bindingFields(s.binding)}),
    confirmParent:v=>rpc(s,{v:1,type:'HOST_UI_CONFIRM',...v,...bindingFields(s.binding)}),
    surfaceState:async value=>{
     const binding=s.binding,revision=s.autoSurfaceRevision=(s.autoSurfaceRevision??0)+1;
     s.autoIdleOpportunity=false;
     const result=await rpc(s,{v:1,type:'HOST_UI_SURFACE_STATE',...value,...bindingFields(binding)});
     if(live(s)&&s.binding===binding&&revision===s.autoSurfaceRevision&&result?.ok===true){
      if(value.workspace===true||value.sidebar===true)s.autoSurfaceOpen=true;
      else if(value.workspace===false&&value.sidebar===false&&s.autoSurfaceOpen){s.autoSurfaceOpen=false;s.autoIdleOpportunity=true;requestAutomaticIdle(s);}
     }
     return result;
    },
    workspaceEntered:({mountId})=>{s.returned=true;s.returnFocusGuard=s.controller.intentGuard?.()??(()=>false);liveMigration(s);if(s.migration&&adapter.matchesCandidateIdentity?.(s.upgraded.identity,s.migration.handle)!==true)clearMigration(s);if(s.migration){s.migration.ready=true;if(s.migration.display.presentation.focused&&s.migration.focusAllowed)s.migration.focusAllowed=s.controller.focusFrame?.(s.migration.display.role)===true;}return rpc(s,{v:1,type:'HOST_UI_WORKSPACE_ENTERED',...bindingFields(s.binding),mountId});},
    revokeMount:({mountId})=>{if(s.binding)void withRequestDeadline(()=>send({v:1,type:'HOST_UI_RELEASE',...bindingFields(s.binding),mountId}),{now:elapsedNow,schedule,cancel}).catch(()=>{});},
    renewSession:({handle,binding})=>track(async()=>{
     if(!bindingOK(binding,s.binding))throw Error('stale-content-binding');
     const started=elapsedNow();s.renewContextPending=true;let renewalStage='document';
     try{
      const renewed=await rpc(s,{v:1,type:'HOST_DOCUMENT_RENEW',clientId,seq:++seq,...bindingFields(binding)});
      if(renewed?.ok!==true||!bindingOK(renewed.binding,s.binding))throw Error('invalid-host-binding');
      s.binding=Object.freeze({...renewed.binding});renewalStage='scope';
      const remaining=()=>{const budget=6000-(elapsedNow()-started);if(budget<=0)throw Error('request-timeout');return budget;};
      const authority=await rpc(s,{v:1,type:'HOST_REFRESH',clientId,seq:++seq,...bindingFields(binding)},remaining());noteScopeStatus(s,authority);
      if(authority?.state!=='verified'||authority.scopeKey!==s.scopeKey){s.recoveryDenied=true;throw Error('scope-not-verified');}
      renewalStage='ui-pair';
      const status=handle?await rpc(s,{v:1,type:'HOST_UI_STATUS',...bindingFields(binding),mountId:handle.id},remaining()):{ok:true,grants:[]};
      if(status?.ok!==true)throw Error('ui-renewal-unavailable');
      return {...status,binding:renewed.binding};
     }catch(error){
      if(current===s){s.surfaceFailure='surface-session-renew-'+renewalStage;startupFailure={url:s.url,state:s.surfaceFailure,shape:null};}
      throw error;
     }finally{
      s.renewContextPending=false;
      // Only a rejected scope may consume the in-flight READY through the
      // existing safe wait. A successful renewal never banks a future retry.
      if(!s.recoveryDenied)s.contextReadyPending=false;
     }
    })
   };
   startupPhase='initialization-controller';reportStartup(startupPhase);
   s.controller=controllerFactory({document:doc,adapter,surface,extensionOrigin:'chrome-extension://'+runtime.id,bridge,initialMode,onWake:()=>wake(s),onFailure:code=>{if(current===s&&surfaceFailureStates.includes(code)){s.surfaceFailure=code;startupFailure={url:s.url,state:code,shape:null};}},onTerminated:(reason,presentation)=>{
    if(current===s){
     s.stoppedSidebarDesired=['native-document-changed','dormant-document-changed','ui-frame-suspended','session-renew-failed','ui-grant-expired','stale-session-renewal','mount-transport-unavailable'].includes(reason)&&typeof presentation?.sidebarDesired==='boolean'?presentation.sidebarDesired:null;
     if(s.stoppedSidebarDesired===null)s.sidebarPreference=null;
    }
    if(current===s&&!s.surfaceFailure&&surfaceFailureStates.includes('surface-'+reason)){s.surfaceFailure='surface-'+reason;startupFailure={url:s.url,state:s.surfaceFailure,shape:null};}
    const publicStops=['ui-frame-document-replaced','native-region-changed','native-geometry-changed','dormant-document-changed','mount-unavailable','mount-transport-unavailable','ui-frame-suspended','ui-grant-expired','session-renew-failed','surface-stopped','ui-authority-revoked','ui-user-exit'];
    if(current===s&&doc.documentElement?.dataset)doc.documentElement.dataset.vaiwlSurfaceStop=publicStops.includes(reason)?reason:'other';
    // A replaced frame cannot regain authority via READY, renewal or a late
    // mount reply. Keep only a fixed diagnostic after withdrawing the session.
    if(current===s&&reason==='ui-frame-document-replaced'){frameReplaced=true;stop();return;}
    // Intentional exit ends this document session, including late recovery callbacks.
    if(current===s&&reason==='ui-user-exit'){stop();return;}
    // A dormant controller can notice native navigation on resize before the
    // adapter's queued route scan. Its stop cancels that scan, so carry the
    // real URL change through the existing fresh handshake instead of losing
    // the document in a same-route context wait. No old capability is reused.
    if(current===s&&['dormant-document-changed','native-document-changed'].includes(reason)&&doc.location.href!==s.url){rebind(s,'reading');return;}
    // A released dormant mount cannot revive its old grants. Retire that
    // session and wait for fresh context instead of swallowing READY forever.
    if(current===s&&reason==='dormant-document-changed'){contextPending();return;}
    // Presentation proof is local to the surface, never producer authority.
    if(current===s&&['native-region-changed','native-geometry-changed','mount-unavailable'].includes(reason))return;
    // The controller has withdrawn the old mount. Do not leave ready=true
    // swallowing future C2 READY signals; wait without retrying denied scope.
    if(current===s&&reason==='session-renew-failed'&&s.recoveryDenied){contextPending();return;}
    // Transport lifecycles may repeat during one long-lived document. Only a
    // new private workspace JOIN establishes another recovery episode. Read
    // and renderer failures never earn repeated attempts merely by rejoining.
    const transport=['session-renew-failed','ui-grant-expired','stale-session-renewal','mount-transport-unavailable'].includes(reason)||reason==='ui-frame-suspended'&&transportFrameFailures.has(presentation?.frameFailureReason);
    if(!enabled||(!s.ready&&!s.mountStarting)||!live(s)||s.busyClose===true||s.recoveryDenied||!['ui-frame-suspended','session-renew-failed','ui-grant-expired','stale-session-renewal','mount-transport-unavailable'].includes(reason)||!takeRecovery(s,transport,presentation?.mode))return;
    rebind(s,presentation?.mode==='workspace'?'workspace':'reading',transport?s.scopeKey:null,transport);
   },now,elapsedNow,schedule,cancel});
   // Owned frames may suspend while mount registration is still awaiting its
   // reply. Permit the same one-shot fresh handshake in that narrow interval;
   // dormant wake and failed scope checks never acquire this startup flag.
   startupPhase='surface';reportStartup(startupPhase);
   s.surface=surface;s.mountStarting=true;let handle;
   try{
    const context=await s.adapter.start(adapterOptions(s,s.binding));if(!live(s))throw Error('stale-content-session');
    // The new controller owns the live choice from this point. A later user
    // action or stop must never fall back to the originally handed-off value.
    const sidebarDesired=s.sidebarPreference?.desired!==false;s.sidebarPreference=null;
    s.ready=true;handle=await s.controller.start({...adapterOptions(s,s.binding),context},sidebarDesired);
   }finally{s.mountStarting=false;}
   if(!live(s))throw Error('surface-start-failed');reportStartup(handle?'ready':'surface-failed');
   // A real foreground transition may arrive while mount is awaiting its reply.
   // Consume the armed transition through the existing live/single-flight gate.
   s.focus();requestAutomaticIdle(s);return handle;
  }catch(error){
   if(current===s){
    // Fixed stage only: never publish exception text, identities or RPC data.
    if(startupPhase==='hello'&&error?.message==='context-handshake-transport-unavailable')s.helloFailure='hello-transport-unavailable';
    reportStartup(startupPhase+'-failed');
    // A native route can change while HELLO, REFRESH or mount is pending,
    // before the adapter has installed its route listeners. The old reply
    // remains unusable; bind the new route instead of disabling the document.
    // Same-route failures still stop, and replaced/stopped sessions cannot retry.
    if(enabled&&doc.location.href!==s.url)rebind(s);else if(error?.message==='scope-not-verified'||contextRecovery===true&&contextResumeAllowed&&['context-handshake-superseded','context-handshake-transport-unavailable'].includes(error?.message)){
     const retry=localReconnect&&startupPhase==='hello'&&error?.message==='context-handshake-transport-unavailable'?{url:s.url,mode:initialMode,recovery,preference}:null;
     contextPending(true);
     if(retry&&contextResumeAllowed&&!contextWaitSuspended&&doc.location.href===retry.url)transportWait=retry;
    }else {
     stop();
    }
   }
   return null;
  }
 }
 function contextPending(preserveObservation=false){
  transportWait=null;
  // A real new invalidation/revocation discards any paused presentation hint.
  // The document-wide failure window remains until time advances or start().
  recoveryResume=null;
  // A late invalidation may arrive after an active document entered BFCache.
  // Preserve suspension when converting its scheduled restoration to a wait.
  if(restoreArmed)contextWaitSuspended=true;
  clearRecent();
  const keepObservation=preserveObservation===true&&!!observation&&observation.owner===current&&!current?.ready&&live(current)&&Date.parse(current.binding.expiresAt)>now();
  if(!keepObservation&&(contextRecovery!==true||!contextResumeAllowed)){stop();return;}
  const readyPending=current?.contextReadyPending===true;
  // Withdraw every live capability immediately. Only document-local UI intent
  // and the existing bounded candidate correlation survive a context wait.
  // They still require the new handshake's scope/document checks; no old grant,
  // handle, mount or controller is reused.
  if(current){
   contextResumeMode=doc.location.href!==current.url?'reading':presentationIntent(current);
   if(doc.location.href!==current.url&&!upgrade.navigate({url:doc.location.href}))clearUpgrade();
   contextResumeURL=doc.location.href;
  }
  if(contextResumeURL!==null&&doc.location.href!==contextResumeURL){contextResumeMode='reading';if(!upgrade.navigate({url:doc.location.href}))clearUpgrade();}
  contextResumeURL=doc.location.href;
  enabled=false;restoreArmed=false;rebindQueued=false;rebindRun++;reset(keepObservation);
  doc.defaultView.addEventListener('pagehide',pagehide);
  // A receipt notification can precede the stale REFRESH response. Consume
  // that one signal with a new handshake; never reuse the old authority.
  if(readyPending){const run=rebindRun;queueMicrotask(()=>{if(run===rebindRun)void contextReady();});}
 }
 function contextReady(){
  if(contextRecovery!==true||!contextResumeAllowed||contextWaitSuspended)return Promise.resolve(null);
  if(recoveryBlocked){if(!recoveryWindow(true))return Promise.resolve(null);recoveryBlocked=null;}
  if(enabled){if(current&&(current.renewContextPending===true||!current.ready&&(!current.scopeKey||current.wakePending)))current.contextReadyPending=true;return Promise.resolve(null);}
  const resume=recoveryResume?.url===doc.location.href?recoveryResume:null;recoveryResume=null;
  if(resume)contextResumeMode=resume.mode;
  if(contextResumeURL!==null&&doc.location.href!==contextResumeURL){contextResumeMode='reading';if(!upgrade.navigate({url:doc.location.href}))clearUpgrade();}
  contextResumeURL=doc.location.href;
  enabled=true;restoreArmed=false;rebindQueued=false;rebindRun++;
  doc.defaultView.addEventListener('pageshow',pageshow);
  return begin(true,contextResumeMode,resume?.recovery??null,resume?.preference??null);
 }
 // Explicit private-popup recovery is separate from automatic recovery. It
 // consumes the same document-wide rate window and never resets start/budgets.
 function reconnect(expectedURL=doc.location.href){
  const pending=transportWait;
  if(expectedURL!==doc.location.href||!localReconnect||!pending||enabled||current||frameReplaced||!contextResumeAllowed||contextWaitSuspended||doc.visibilityState!=='visible'||doc.location.href!==pending.url||!recoveryWindow(true))return false;
  transportWait=null;recoveryBlocked=null;recoveryResume=pending;
  void contextReady();return true;
 }
 function localStatus(){if(frameReplaced)return 'frame-blocked';if(!enabled&&transportWait&&doc.location.href===transportWait.url){if(recoveryWindow())return 'hello-transport-unavailable';return recoveryBlocked;}if(recoveryBlocked&&startupFailure?.url===doc.location.href)return recoveryBlocked;if(!enabled&&!contextResumeAllowed&&!observation&&startupFailure?.url===doc.location.href)return startupFailure.state;if(!enabled)return contextResumeAllowed||observation?(verificationWaitURL===doc.location.href?'verification-required':'waiting'):'unavailable';if(!current||!live(current))return 'unavailable';if(!current.ready)return 'connecting';const state=current.controller?.localStatus?.()??'unavailable';return ['unavailable','surface-controller-absent'].includes(state)&&startupFailure?.url===doc.location.href?startupFailure.state:state;}
 return Object.freeze({localStatus,reconnect,recoverLayout,recoverRoute,localLayoutStatus:()=>{const layout=startupFailure?.url===doc.location.href&&localStatus().startsWith('layout-')?startupFailure.shape:current&&live(current)&&current.adapter?.navigationSummary?{navigation:current.adapter.navigationSummary(),...(current.adapter.deliverySummary?{delivery:current.adapter.deliverySummary()}:{} ),presentation:current.controller?.presentationSnapshot?.()??null}:null;const mainMountCheck=mountDiagnostic.read();return mainMountCheck?{...(layout??{}),mainMountCheck}:layout;},start,stop,contextPending,contextReady,prepareIdle,enterDormant,isOwnedMask:node=>!!current&&live(current)&&current.surface?.isMasked?.(node)===true,showWorkspace:()=>sync(()=>current?.controller?.showWorkspace()??false),showReading:()=>sync(()=>current?.controller?.showReading()??false)});
}
