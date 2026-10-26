import {searchProjectMap} from '../navigation/search.mjs';
import {validateFrameRowWindows} from './frame-row-windows.mjs';
import {createFreeFrameReadError} from './free-frame-read-error.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {isCurrentNavigationPlan,isResolvedControlNavigationPlan} from './current-navigation-plan.mjs';
import {exactHostRecord} from './contract.mjs';
import {createFrameCandidateMigration} from './frame-candidate-migration.mjs';
import {createFreeFrameCandidates} from './free-frame-candidates.mjs';
import {validateFrameResumeView,validateResumeQuery} from './frame-resume-state.mjs';
import {createFreeFrameSnippets} from './free-frame-snippets.mjs';
import {createFreeFrameBackup} from './free-frame-backup.mjs';
import {createFreeFrameRecovery} from './free-frame-recovery.mjs';
import {isFreeRecoveryReason} from '../navigation/free-recovery.mjs';
import {FREE_HORIZONS,relocateFreeSegment} from '../data/free-time-policy.mjs';
import {createUiFrameClient} from './ui-frame-client.mjs';
import {createNavigation} from '../navigation/navigation.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createReadRecoveryBudget} from '../data/read-recovery-budget.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Bounded runtime-only projection consumer. No full workspace replica is built
 * in either frame; parent messages remain the lifecycle's public join/suspend. */
export function createFreeFrameClient({document:doc,runtime,role,parentOrigin,onPresentationRequest=()=>{},onState=()=>{},privateRoot=doc?.body,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeNonce,navigationFactory=createNavigation,recoveryFactory=createFreeFrameRecovery,backupFactory=createFreeFrameBackup,snippetsFactory=createFreeFrameSnippets,readErrorFactory=createFreeFrameReadError}={}){
 const policy=createURLPolicy({origin:parentOrigin});
 const receipts=new WeakMap();
 function receipt(page,phase,counts={cards:null,rows:null}){
  const record=receipts.get(page);if(!record||closed||!grantCurrent()||grant?.id!==record.grant.id||Date.parse(grant.expiresAt)<=now())return;
  try{Promise.resolve(runtime.sendMessage({v:1,type:'HOST_UI_VIEW_RECEIPT',grantId:grant.id,mountId:grant.mountId,deliveryId:record.deliveryId,phase,...counts})).catch(()=>{});}catch{}
 }

 let dispatchEpoch=0,dispatchPending=null,queuedDispatchView=null,calibrationPending=null;
 let nativeInteraction=null;
 // Reserve only the gap between a ready control's pointerdown and its click.
 // Unsent background VIEWs wait; authorization and request deadlines do not.
 function clearNativeInteraction(){const held=nativeInteraction;nativeInteraction=null;if(held)cancel(held.timer);}
 function nativeInteractionActive(){
  const held=nativeInteraction;if(!held)return false;
  const elapsed=elapsedNow()-held.started;
  if(!closed&&grantCurrent()&&grant===held.grant&&navigation===held.renderer&&Date.parse(grant.expiresAt)>now()&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<1000)return true;
  clearNativeInteraction();return false;
 }
 function beginNativeInteraction(){
  if(nativeInteractionActive()||closed||readTerminal||bootstrapping||activeRead||dispatchPending||horizonPending||backup||recovery||snippets||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||doc.visibilityState==='hidden'||surfaceVisible===false)return null;
  const held={grant,renderer:navigation,started:elapsedNow(),timer:null};nativeInteraction=held;
  const release=()=>{if(nativeInteraction!==held)return;clearNativeInteraction();if(dirty)invalidate(true);};
  held.timer=schedule(release,1000);return release;
 }
 let currentDelivery=null,freshnessTimer=null;
 let navigation=null,root=null,plans=new Map(),projectPlans=new Map(),grant=null,grantCurrent=()=>false,serial=0,activeRead=null,activeLocation=null,query={segment:0,offset:0,limit:8},closed=true,splits=0,dirty=false,currentNativeURL='',presentationRevision=0,presentationIntent='',workspaceRevision=null,viewSession=null,projectionScope=null,projectionVersion=null,horizonPending=false;
 let readEpoch=0,readTerminal=null,readErrorPanel=null,readErrorRoot=null;
 let surfaceVisible=null,surfaceRevision=0;
 let wasHidden=false,visibilityAttached=false,candidates=null,candidateRoot=null,candidateRun=0,candidateOffset=0,candidatePageTotal=null;
 let candidateRestore=null,candidateMigrationId=null,candidateMigrationProject=null,migrationListening=false,workspaceEntered=false,workspaceModePending=false;
 const locatedMigrations=new Map();
 const migration=createFrameCandidateMigration({now,reveal:({projectId,focus})=>navigation?.revealNativeProject?.({projectId,focus:focus&&doc.hasFocus?.()===true})===true,restoreCandidates:p=>{const offset=candidatePageTotal===null?p.offset:Math.min(p.offset,candidatePageTotal?Math.floor((candidatePageTotal-1)/32)*32:0);const position={...p,offset};candidateRestore={...position,migrationId:candidateMigrationId};if(candidateOffset!==offset){void refreshCandidates(offset);return false;}const restored=candidates?.restorePosition?.(position)===true;if(restored)candidateRestore=null;return restored;}});
 const interruptMigration=event=>{if(event.isTrusted===true){candidateRestore=null;migration.interrupt();}};
 let bootstrapping=false,resumeTimer=null,resumeQueued=null,resumeWriting=false,resumeLast=null,resumeDesired=null,resumeQuery=null;
 let panelReturnCancel=null;
 let recovery=null,recoveryRoot=null,backup=null,backupRoot=null,autoChange=null,snippets=null,snippetsRoot=null,currentRef=null,searchSnippetIds=new Map(),snippetLocatePending=false;
 function clearAutoNotice(){autoChange=null;navigation?.clearTimePolicyNotice?.();}
 const recoverable=reason=>isFreeRecoveryReason(reason)||['corrupt-record','invalid-partition-manifest','invalid-partition-piece'].includes(reason);
 const budget=createReadRecoveryBudget({now:elapsedNow,schedule,cancel,onExpire:()=>fail('read-budget-exhausted')});
 function state(value){try{onState(value);}catch{}}
 function clear(){cancel(freshnessTimer);freshnessTimer=null;currentDelivery=null;clearNativeInteraction();panelReturnCancel?.();readEpoch++;readTerminal=null;readErrorPanel?.stop();readErrorPanel=null;readErrorRoot?.remove();readErrorRoot=null;surfaceVisible=null;surfaceRevision=0;calibrationPending=null;dispatchPending=null;queuedDispatchView=null;dispatchEpoch++;migration.clear();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;locatedMigrations.clear();workspaceEntered=false;workspaceModePending=false;for(const type of ['pointerdown','keydown','wheel'])doc.removeEventListener?.(type,interruptMigration,true);migrationListening=false;candidateOffset=0;candidatePageTotal=null;candidateRun++;candidates?.stop();candidates=null;candidateRoot?.remove();candidateRoot=null;if(visibilityAttached)doc.removeEventListener?.('visibilitychange',foreground);visibilityAttached=false;wasHidden=false;bootstrapping=false;cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeWriting=false;resumeLast=null;resumeDesired=null;resumeQuery=null;searchSnippetIds.clear();snippetLocatePending=false;snippets?.stop();snippets=null;snippetsRoot?.remove();snippetsRoot=null;currentRef=null;clearAutoNotice();backup?.stop();backup=null;backupRoot?.remove();backupRoot=null;recovery?.stop();recovery=null;recoveryRoot?.remove();recoveryRoot=null;workspaceRevision=null;viewSession=null;projectionScope=null;projectionVersion=null;horizonPending=false;presentationRevision=0;presentationIntent='';currentNativeURL='';closed=true;dirty=false;serial++;activeRead?.abort();activeRead=null;activeLocation=null;budget.reset();grant=null;query={segment:0,offset:0,limit:8};plans.clear();projectPlans.clear();navigation?.stop();navigation=null;root?.remove();root=null;}
 function ensureCandidates(){
  if(!candidates){candidateRoot=doc.createElement('details');candidateRoot.setAttribute('data-vaiwl-candidate-root','');const summary=doc.createElement('summary');summary.textContent='更多原生入口';const content=doc.createElement('div');candidateRoot.append(summary,content);privateRoot.append(candidateRoot);candidates=createFreeFrameCandidates({document:doc,container:content,onPageRequest:next=>refreshCandidates(next),onActivate:async(renderKey,presentation)=>{
    const active=grant;if(closed||!grantCurrent()||backup||recovery||snippets)return {ok:false};
    const actionId=doc.defaultView.crypto.randomUUID();if(!migration.beginActivation(actionId))migration.interrupt();
    candidateRun++;candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;
    if(activeLocation){activeLocation.cancelled=true;activeRead?.abort();}
    return withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_ACTIVATE_CANDIDATE',grantId:active.id,mountId:active.mountId,renderKey,presentation,actionId}),{now:elapsedNow,schedule,cancel});
   }});}
 }
 function candidateReadFailed(offset){
  candidatePageTotal=null;
  migration.revoke();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;
  ensureCandidates();candidates.showError(offset);return {ok:false};
 }
 async function refreshCandidates(offset=candidateOffset){
  if(readTerminal||closed||backup||recovery||snippets||!grantCurrent())return;
  const run=++candidateRun,current=grant;
  const valid=()=>run===candidateRun&&!closed&&grant?.id===current.id&&grantCurrent()&&Date.parse(grant.expiresAt)>now()&&!backup&&!recovery&&!snippets;
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:current.id,mountId:current.mountId,offset}),{now:elapsedNow,schedule,cancel});
   if(!valid())return {ok:false};if(result?.ok!==true)return candidateReadFailed(offset);
   ensureCandidates();candidates.update(result.items,result.page);candidateOffset=result.page?.offset??0;candidatePageTotal=result.page?.total??result.items.length;if(result.migration){if(migration.offer(result.migration)){candidateMigrationId=result.migration.id;candidateMigrationProject=result.migration.projectId;}if(candidateRestore?.migrationId!==candidateMigrationId)candidateRestore=null;}else{migration.revoke();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;}applyCandidateMigration();return {ok:true};
  }catch{if(valid())return candidateReadFailed(offset);return {ok:false};}
 }
 function applyCandidateMigration(){
  if(readTerminal||!workspaceEntered||closed||backup||recovery||snippets||activeRead||horizonPending)return;
  if(migration.apply()===true)return;
  const id=candidateMigrationId,projectId=candidateMigrationProject;
  if(!id||!projectId||!migration.isPending(id)||activeRead||horizonPending||query.search||query.workingSet||!viewSession||navigation?.needsNativeProject?.(projectId)!==true)return;
  const prior=locatedMigrations.get(id);if(prior?prior.count>=3||!prior.retry:locatedMigrations.size>=32)return;
  // A data hint can cancel a valid location without changing the projection.
  // Retry only that recorded cancellation, within the FIRST attempt's deadline;
  // neither an unchanged version nor a fresh hint may renew its budget.
  const started=prior?.started??elapsedNow(),elapsed=elapsedNow()-started;
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)return;
  locatedMigrations.set(id,{count:(prior?.count??0)+1,version:projectionVersion,retry:false,started});
  const attempt={id,projectId,started,cancelled:false,scope:projectionScope,query:JSON.stringify(query),session:JSON.stringify(viewSession),renderer:navigation,grantId:grant?.id,mountId:grant?.mountId,scopeGrantId:grant?.scopeGrantId};
  void read(query,true,attempt);
 }
 function locationCurrent(attempt){const elapsed=elapsedNow()-attempt.started;return !attempt.cancelled&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<6000&&workspaceEntered&&!closed&&!backup&&!recovery&&!snippets&&!horizonPending&&navigation===attempt.renderer&&grant?.id===attempt.grantId&&grant?.mountId===attempt.mountId&&grant?.scopeGrantId===attempt.scopeGrantId&&grantCurrent()&&Date.parse(grant.expiresAt)>now()&&candidateMigrationId===attempt.id&&candidateMigrationProject===attempt.projectId&&migration.isPending(attempt.id)&&JSON.stringify(query)===attempt.query&&JSON.stringify(viewSession)===attempt.session&&!query.search&&!query.workingSet;}
 function clearCandidates(){candidateRun++;candidatePageTotal=null;candidates?.clear();}
 function stopRead(reason,retryToken){
  if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  readEpoch++;serial++;dispatchEpoch++;activeRead?.abort();activeRead=null;activeLocation=null;dirty=false;queuedDispatchView=null;budget.complete();
  clearCandidates();migration.clear();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;locatedMigrations.clear();
  plans.clear();projectPlans.clear();searchSnippetIds.clear();currentDelivery=null;
  cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeDesired=null;resumeQuery=null;clearAutoNotice();navigation?.setNativeNavigationPending?.(true);
  readTerminal={retryToken,grantId:grant.id,mountId:grant.mountId,scopeGrantId:grant.scopeGrantId};
  if(!readErrorPanel){readErrorRoot=doc.createElement('div');readErrorRoot.setAttribute('data-vaiwl-read-error-container','');privateRoot.append(readErrorRoot);
   readErrorPanel=readErrorFactory({document:doc,container:readErrorRoot,onExit:()=>lifecycle.exit(),onRetry:({restoreFocus=false}={})=>{
    const stopped=readTerminal;
    if(!stopped||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||grant.id!==stopped.grantId||grant.mountId!==stopped.mountId||grant.scopeGrantId!==stopped.scopeGrantId)return;
    readTerminal=null;void resumePanelView(restoreFocus,stopped.retryToken);
   }});
  }
  readErrorPanel.show({retryable:true});state({state:'read-stopped',reason});
 }
 function fail(reason){if(closed)return;if(!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||['ui-authorization-unavailable','stale-binding','scope-revoked'].includes(reason)){state({state:'failed',reason});lifecycle.stop(reason);return;}if(recoverable(reason)){openRecovery(true);return;}if(reason.startsWith('invalid-')||['frame-render-unavailable','untrusted-source','source-revoked'].includes(reason)){navigation?.invalidate?.('invalid-frame-view');projectionVersion=null;projectionScope=null;}stopRead(reason,null);}
 async function resumePanelView(restoreFocus=false,retryToken=null){
  panelReturnCancel?.();const current=grant,renderer=navigation;let pending=restoreFocus===true;
  const interrupt=()=>{pending=false;},events=['pointerdown','keydown','focusin','visibilitychange'];
  const cleanup=()=>{for(const type of events)doc.removeEventListener?.(type,interrupt,true);doc.defaultView?.removeEventListener?.('blur',interrupt,true);if(panelReturnCancel===cancelReturn)panelReturnCancel=null;};
  const cancelReturn=()=>{pending=false;cleanup();};panelReturnCancel=cancelReturn;
  if(pending){for(const type of events)doc.addEventListener?.(type,interrupt,true);doc.defaultView?.addEventListener?.('blur',interrupt,true);}
  const currentAuthority=()=>panelReturnCancel===cancelReturn&&!closed&&navigation===renderer&&grant?.id===current?.id&&grant?.mountId===current?.mountId&&grant?.scopeGrantId===current?.scopeGrantId&&grantCurrent()&&Date.parse(grant.expiresAt)>now();
  try{await waitForPanelDispatch();if(!currentAuthority())return;const page=await read(query,true,null,retryToken);if(page&&pending&&currentAuthority())renderer?.focusSurface?.();}
  finally{cleanup();}
 }
 function openRecovery(fromFailure=false){if(readTerminal)return;dispatchEpoch++;cancelPendingNavigation();
  if(recovery||backup||snippets||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending&&!fromFailure)return;
  panelReturnCancel?.();clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-recovery');
  recoveryRoot=doc.createElement('div');recoveryRoot.setAttribute('data-vaiwl-frame-recovery','');privateRoot.append(recoveryRoot);
  const current=grant;
  const valid=()=>!closed&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  const panel=recoveryFactory({document:doc,container:recoveryRoot,request:async message=>{
   if(recovery!==panel||!valid())throw Error('recovery-unavailable');
   let abandoned=false,cleaned=false;
   const cleanup=response=>{if(cleaned||message.type!=='HOST_UI_RECOVERY_STATUS'||!valid()||response?.ok!==true)return;const planIds=[...new Set(['workspace','native','evidence'].map(kind=>response.plans?.[kind]?.planId).filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)))];if(!planIds.length)return;cleaned=true;Promise.resolve().then(()=>runtime.sendMessage({v:1,type:'HOST_UI_RECOVERY_RELEASE',planIds,grantId:current.id,mountId:current.mountId})).catch(()=>{});};
   const work=Promise.resolve().then(()=>runtime.sendMessage({...message,grantId:current.id,mountId:current.mountId}));
   work.then(response=>{if(abandoned||recovery!==panel||!valid())cleanup(response);},()=>{});
   let response;try{response=await withRequestDeadline(()=>work,{now:elapsedNow,schedule,cancel});}catch(error){abandoned=true;work.then(cleanup,()=>{});throw error;}
   if(recovery!==panel||!valid()){cleanup(response);throw Error('recovery-unavailable');}return response;
  },onResume:({restoreFocus=false}={})=>{if(recovery!==panel||!valid())return;panel.stop();recovery=null;recoveryRoot?.remove();recoveryRoot=null;budget.reset();void resumePanelView(restoreFocus);}});
  recovery=panel;state({state:'recovery'});void panel.open();
 }
 function openBackup(){if(readTerminal)return;dispatchEpoch++;cancelPendingNavigation();
  if(backup||recovery||snippets||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending)return;
  panelReturnCancel?.();clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-backup');
  backupRoot=doc.createElement('div');backupRoot.setAttribute('data-vaiwl-frame-backup','');privateRoot.append(backupRoot);
  const current=grant,valid=()=>!closed&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  const panel=backupFactory({document:doc,container:backupRoot,request:async message=>{
   if(backup!==panel||!valid())throw Error('backup-unavailable');
   let abandoned=false,cleaned=false;
   const cleanup=response=>{if(cleaned||!valid()||response?.ok!==true||typeof response.transferId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(response.transferId))return;cleaned=true;Promise.resolve().then(()=>runtime.sendMessage({v:1,type:'HOST_UI_BACKUP_CLOSE',transferId:response.transferId,grantId:current.id,mountId:current.mountId})).catch(()=>{});};
   const pending=Promise.resolve().then(()=>runtime.sendMessage({...message,grantId:current.id,mountId:current.mountId}));
   // Keep cleanup attached to the original RPC even if the local deadline wins.
   pending.then(response=>{if(abandoned||backup!==panel||!valid())cleanup(response);},()=>{});
   let response;try{response=await withRequestDeadline(()=>pending,{now:elapsedNow,schedule,cancel});}catch(error){abandoned=true;pending.then(cleanup,()=>{});throw error;}
   if(backup!==panel||!valid()){cleanup(response);throw Error('backup-unavailable');}
   return response;
  },onResume:({restoreFocus=false}={})=>{if(backup!==panel||!valid())return;panel.stop();backup=null;backupRoot?.remove();backupRoot=null;budget.reset();void resumePanelView(restoreFocus);}});
  backup=panel;state({state:'backup'});void panel.open();
 }
 function openSnippets(){if(readTerminal)return;dispatchEpoch++;cancelPendingNavigation();
  if(snippets||backup||recovery||closed||horizonPending||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  panelReturnCancel?.();clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();navigation?.invalidate?.('saved-snippets');
  snippetsRoot=doc.createElement('div');snippetsRoot.setAttribute('data-vaiwl-frame-snippets','');privateRoot.append(snippetsRoot);
  const current=grant,selectedRef=currentRef?{...currentRef}:null,valid=()=>!closed&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  const panel=snippetsFactory({document:doc,container:snippetsRoot,parentOrigin,currentRef:selectedRef,request:async message=>{
   if(snippets!==panel||!valid())throw Error('snippet-unavailable');
   // Reuse the view owner's bounded preparation before reading a list after a
   // human preference commit. No second replica or unbounded retry is created.
   if(message.type==='HOST_UI_SNIPPET_LIST'){await waitForPanelDispatch();if(snippets!==panel||!valid())throw Error('snippet-unavailable');budget.reset();const ready=await read(query,false);if(!ready||snippets!==panel||!valid())throw Error('snippet-unavailable');}
   const result=await withRequestDeadline(()=>runtime.sendMessage({...message,v:1,grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(snippets!==panel||!valid())throw Error('snippet-unavailable');return result;
  },onClose:({restoreFocus=false}={})=>{if(snippets!==panel||!valid())return;panel.stop();snippets=null;snippetsRoot?.remove();snippetsRoot=null;budget.reset();void resumePanelView(restoreFocus);}});
  snippets=panel;void panel.open();
 }
 function live(ticket){return !closed&&ticket===serial&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();}
 function cancellable(work,signal){
  let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('frame-read-cancelled'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
  return Promise.race([Promise.resolve().then(work),aborted]).finally(()=>signal.removeEventListener('abort',onAbort));
 }
 function delay(ms,signal){let timer;return cancellable(()=>new Promise(resolve=>{timer=schedule(resolve,ms);}),signal).finally(()=>cancel(timer));}
 function boundedQuery(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['role','segment','offset','limit','groupId','list','rowOffset','rowLimit','rowWindows','search','workingSet'].includes(k))||value.role!==undefined&&value.role!==role)throw Error('invalid-frame-query');
  if(value.search!==undefined&&value.workingSet!==undefined)throw Error('invalid-frame-query');
  const {role:ignored,...rest}=value;if(rest.rowWindows!==undefined)rest.rowWindows=validateFrameRowWindows(rest.rowWindows);return structuredClone(rest);
 }
 async function read(value,publish,location=null,retryToken=null){
  if(readTerminal||recovery||backup||location&&!locationCurrent(location))return null;
  clearNativeInteraction();
  // A ready VIEW replaces this role's issued native plans. Do not replace them
  // between the two native authorizations; keep only the latest requested read.
  const requested=boundedQuery(value);
  // New view intent permanently consumes any cancelled migration's retry,
  // including while transport is queued behind a native dispatch.
  if(!location&&JSON.stringify(query)!==JSON.stringify(requested)){
   for(const record of locatedMigrations.values())record.retry=false;
   if(activeLocation)activeLocation.cancelled=true;
  }
  if(dispatchPending){
   // Coalesce transport only. A different query is a new user intent now,
   // so its predecessor's late acknowledgement cannot restore the old view.
   if(JSON.stringify(query)!==JSON.stringify(requested)){dispatchEpoch++;cancelPendingNavigation();cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeDesired=null;}
   if(!location)query=requested;
   queuedDispatchView={value:requested,location};return null;
  }if(JSON.stringify(query)!==JSON.stringify(requested)){cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeDesired=null;}if(!location)query=requested;const ticket=++serial;activeRead?.abort();const controller=new AbortController();activeRead=controller;activeLocation=location;navigation?.setNativeNavigationPending?.(true);
  if(budget.remaining()===Infinity)splits=0;
  if(!location&&!budget.begin()){fail('read-budget-exhausted');return null;}
  let effective={...requested},polls=0;
  try{while(live(ticket)){
   if(location&&!locationCurrent(location))return null;if(!location)budget.check();if(++polls>600)throw Error('frame-preparation-limit');
   const current=grant;
   let response=await withRequestDeadline(()=>cancellable(()=>runtime.sendMessage({v:1,type:'HOST_UI_VIEW',grantId:current.id,mountId:current.mountId,query:effective,...(retryToken?{retryToken}:{}),...(location?{locateProjectId:location.projectId}:{})}),controller.signal),{timeoutMs:location?Math.max(1,6000-(elapsedNow()-location.started)):Math.min(6000,budget.remaining()),now:elapsedNow,schedule,cancel});
   retryToken=null;
   if(!live(ticket)||location&&!locationCurrent(location))return null;if(!location)budget.check();
   // Existing VIEW transport carries a current owner's withdrawal, including
   // while replacement data is preparing. Never retain revoked source rows
   // merely because the subsequent read times out; keep the granted shell.
   if(Object.hasOwn(response??{},'clearProjection')){
    if(response.clearProjection!==true||response.ok===true&&response.state!=='preparing')throw Error('invalid-frame-withdrawal');
    if(projectionScope!==null){navigation?.invalidate?.('source-revoked');projectionScope=null;projectionVersion=null;currentRef=null;currentDelivery=null;plans.clear();projectPlans.clear();searchSnippetIds.clear();cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeDesired=null;resumeQuery=null;clearCandidates();}
    const {clearProjection,...rest}=response;response=rest;
   }
   if(response?.ok!==true){
    if(location)return null;
    if(exactHostRecord(response,['ok','reason','retryToken'])&&response.ok===false&&['snapshot-revision-changed','stale-free-page'].includes(response.reason)&&tokenOK(response.retryToken)){stopRead(response.reason,response.retryToken);return null;}
    if(exactHostRecord(response,['ok','reason'])&&response.ok===false&&response.reason==='stale-view-retry'){stopRead(response.reason,null);return null;}
    if(['free-frame-page-too-large','free-working-set-page-too-large','free-search-page-too-large'].includes(response?.reason)&&splits<8){
     const limit=effective.limit??8,rowLimit=effective.rowLimit??5;
     const list=response.reason==='free-search-page-too-large'?'search':response.reason==='free-working-set-page-too-large'?'workingSet':null;
     if(list&&effective[list]&&(effective[list].limit??24)>1){effective={...effective,[list]:{...effective[list],limit:Math.max(1,Math.floor((effective[list].limit??24)/2))}};splits++;continue;}
     // Retain the active list first. Other windows become explicit bounded
     // pages in the same fresh response, never cached rows or old plans.
     if(effective.rowWindows?.some(w=>w.rowLimit>5)){effective={...effective,rowWindows:effective.rowWindows.map(w=>w.rowLimit>5?{...w,rowLimit:5,paged:true}:w)};splits++;continue;}
     if(limit>1){effective={...effective,limit:Math.max(1,Math.floor(limit/2))};splits++;continue;}
     if(rowLimit>5){effective={...effective,rowLimit:5};splits++;continue;}
     if(effective.workingSet&&(effective.workingSet.limit??24)>1){effective={...effective,workingSet:{...effective.workingSet,limit:Math.max(1,Math.floor((effective.workingSet.limit??24)/2))}};splits++;continue;}
     if(effective.search&&(effective.search.limit??24)>1){effective={...effective,search:{...effective.search,limit:Math.max(1,Math.floor((effective.search.limit??24)/2))}};splits++;continue;}
    }
    if(!exactHostRecord(response,['ok','reason'])||response.ok!==false||typeof response.reason!=='string')throw Error('invalid-frame-response');throw Error(response.reason);
   }
   if(response.state==='preparing'){
    if(location){if(!Number.isFinite(response.retryAfterMs)||response.retryAfterMs<0)return null;const wait=Math.max(50,response.retryAfterMs),remaining=6000-(elapsedNow()-location.started);if(wait>=remaining)return null;await delay(wait,controller.signal);if(!locationCurrent(location))return null;continue;}
    if(!Number.isFinite(response.retryAfterMs)||response.retryAfterMs<0)throw Error('invalid-preparation-response');
    state({state:'preparing'});const wait=Math.max(50,response.retryAfterMs);if(wait>=budget.remaining())throw Error('read-budget-exhausted');await delay(wait,controller.signal);continue;
   }
   if(response.state!=='ready'||response.page?.protocol!=='vaiwl-free-frame/1'||response.page.role!==role||response.page.completeSnapshot!==false||!Array.isArray(response.navigation)||response.navigation.length>200)throw Error('invalid-frame-view');
   const nextSession=response.page.viewSession;
   if(location){
    const found=response.location,groups=response.page.groups;
    if(!found||Object.getPrototypeOf(found)!==Object.prototype||Reflect.ownKeys(found).sort().join(',')!=='found,projectId'||found.projectId!==location.projectId||typeof found.found!=='boolean')return null;
    if(!found.found)return null;
    if(response.page.scope!==location.scope||JSON.stringify(nextSession)!==location.session||response.page.segment!==(requested.segment??0)||response.page.search!==undefined||response.page.workingSet!==undefined||!groups||!Number.isSafeInteger(groups.offset)||groups.offset<0||groups.offset>1000000||groups.limit!==(requested.limit??8)||groups.offset%groups.limit!==0||!Number.isSafeInteger(groups.total)||groups.total<=groups.offset||!Array.isArray(groups.items)||groups.items.length!==Math.min(groups.limit,groups.total-groups.offset)||groups.hasMore!==(groups.offset+groups.items.length<groups.total)||groups.items.filter(group=>group.id===location.projectId).length!==1)return null;
    effective={...requested,offset:groups.offset};
   }
   if(nextSession&&viewSession&&(nextSession.H!==viewSession.H||nextSession.T!==viewSession.T||nextSession.Z!==viewSession.Z)){
    const segment=relocateFreeSegment({candidateDay:viewSession.T-viewSession.H*(effective.segment??0)},nextSession);viewSession=nextSession;effective={segment,offset:0,limit:effective.limit??8,...(effective.search?{search:effective.search}:{}),...(effective.workingSet?{workingSet:effective.workingSet}:{})};continue;
   }
   const groups=searchProjectMap(response.page.search?.items,[...(response.page.groups?.items??[]),...(response.page.currentProject?[response.page.currentProject]:[])]);
   const nextSnippetIds=new Map();for(const ref of response.page.search?.items??[]){if(ref.snippetMatches===undefined)continue;if(!Array.isArray(ref.snippetMatches)||ref.snippetMatches.length<1||ref.snippetMatches.length>100)throw Error('invalid-search-snippets');for(const value of ref.snippetMatches){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).sort().join(',')!=='id,preview'||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.id)||['__proto__','constructor','prototype'].includes(value.id)||nextSnippetIds.has(value.id)||typeof value.preview!=='string'||value.preview.length>160||nextSnippetIds.size>=100)throw Error('invalid-search-snippets');nextSnippetIds.set(value.id,ref.id);}}
   const currentRoute=response.page.current;
   if(currentRoute!==undefined&&(!currentRoute||typeof currentRoute!=='object'||Array.isArray(currentRoute)||Object.keys(currentRoute).sort().join(',')!=='nativeUrl,projectId,refId'||typeof currentRoute.nativeUrl!=='string'||!policy.nativeHref(currentRoute.nativeUrl)||!['refId','projectId'].every(k=>currentRoute[k]===null||typeof currentRoute[k]==='string'&&currentRoute[k].length>0&&currentRoute[k].length<=128&&!/[\s\x00-\x1f]/.test(currentRoute[k]))))throw Error('invalid-frame-current');
   if(response.page.currentRef!==undefined&&response.page.currentRef!==null&&(!currentRoute||response.page.currentRef.id!==currentRoute.refId))throw Error('invalid-frame-current-ref');
   const {nextPlans,nextProjectPlans}=validateNavigation(response.navigation,response.page,current);
   // A validated current ready completes this read, even with a queued dirty hint.
   // The next read gets its own budget; hints, preparing and renewals never reset it.
   if(!live(ticket)||location&&!locationCurrent(location))return null;currentDelivery=response.deliveryId??null;cancel(freshnessTimer);freshnessTimer=null;if(response.refreshAt!==undefined&&response.refreshAt!==null){const at=Date.parse(response.refreshAt);if(!Number.isFinite(at)||at<=now())throw Error('invalid-frame-deadline');freshnessTimer=schedule(()=>{freshnessTimer=null;invalidate(true);},Math.min(2147483647,at-now()));}readErrorPanel?.stop();readErrorPanel=null;readErrorRoot?.remove();readErrorRoot=null;plans=nextPlans;projectPlans=nextProjectPlans;searchSnippetIds=nextSnippetIds;projectionScope=response.page.scope;projectionVersion=JSON.stringify([response.page.revision??null,response.page.workspaceRevision??null,response.page.evidenceRevision??null,response.page.viewRevision??null]);workspaceRevision=response.page.workspaceRevision??null;viewSession=nextSession??null;currentNativeURL=currentRoute?.nativeUrl??'';currentRef=currentRoute?.refId?{id:currentRoute.refId,nativeUrl:currentRoute.nativeUrl}:null;query=effective;resumeQuery=structuredClone(effective);if(!location)budget.complete();if(role==='workspace'&&Number.isSafeInteger(response.deliveryId)&&response.deliveryId>0){receipts.set(response.page,{deliveryId:response.deliveryId,grant:current});receipt(response.page,'received');}if(publish){try{navigation.updateFrameProjection(response.page);}catch{throw Error('frame-render-unavailable');}if(workspaceModePending&&navigation.workspaceEntered?.()===true)workspaceModePending=false;}if(!snippets&&!location)applyPresentation(response.page.presentation);state({state:'ready'});if(publish){if(response.nativeCandidates===true){if(!migrationListening){for(const type of ['pointerdown','keydown','wheel'])doc.addEventListener?.(type,interruptMigration,true);migrationListening=true;}void refreshCandidates();}else clearCandidates();}if(location&&live(ticket)&&migration.isPending(location.id)&&candidateMigrationId===location.id){dirty=true;}void preparePageNavigation(response,current,ticket);return response.page;
  }}catch(error){if(!location&&live(ticket))fail(error?.message==='frame-read-cancelled'?'frame-view-unavailable':error?.message??'frame-view-unavailable');return null;}
  // A read that began before a preference write can finish while that write
  // owns the view. Keep its dirty hint for finishMutation; starting a successor
  // here would retire the write's serial before its reply can be accepted.
  finally{if(activeRead===controller){activeRead=null;activeLocation=null;if(dirty&&live(ticket)&&backgroundRefreshAllowed()&&!horizonPending){dirty=false;void read(query,true);}else if(!dirty&&live(ticket))applyCandidateMigration();navigation?.setNativeNavigationPending?.(!!activeRead||!!dispatchPending);}}
  return null;
 }
 // Ordinary data hints need no new projection in a hidden UI document. Keep a
 // single dirty bit; foreground uses the same guarded fresh-read path. Initial
 // bootstrap, explicit actions and special-panel invalidation remain immediate.
 function backgroundRefreshAllowed(){return doc.visibilityState!=='hidden'&&surfaceVisible!==false&&!nativeInteractionActive();}
 function applySurfaceState(value){
  if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||!exactHostRecord(value,['revision','visible'])||!Number.isSafeInteger(value.revision)||value.revision<=surfaceRevision||!(value.visible===null||typeof value.visible==='boolean'))return;
  const wasClosed=surfaceVisible===false;surfaceRevision=value.revision;surfaceVisible=value.visible;if(value.visible===false)clearNativeInteraction();
  // Reappearance refreshes data, never presentation, focus or send calibration.
  if(wasClosed&&backgroundRefreshAllowed()&&!backup)invalidate();
 }
 async function refreshSurfaceState(){
  const current=grant;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SURFACE_STATE_GET',grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(!closed&&grant===current&&result?.ok===true&&result.surface)applySurfaceState(result.surface);
  }catch{/* Unknown remains active; a failed read cannot overwrite a newer hint. */}
 }
 function invalidate(background=false){if(readTerminal)return;if(activeLocation){const attempt=activeLocation,record=locatedMigrations.get(attempt.id);if(record&&locationCurrent(attempt))record.retry=true;attempt.cancelled=true;activeRead?.abort();}if(bootstrapping){dirty=true;return;}if(snippets){snippets.invalidate?.();return;}if(backup){backup.invalidate?.();return;}if(recovery){recovery.invalidate?.();return;}if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;if(background&&!backgroundRefreshAllowed()){dirty=true;return;}if(activeRead||horizonPending||dispatchPending)dirty=true;else{dirty=false;void read(query,true);}}
 function applyPresentation(value){
  if(value===undefined)return;
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||!value.intent||!['show-workspace','enter-reading','show-native-page','search-known','show-working-set'].includes(value.intent.kind))throw Error('invalid-frame-presentation');
  if(value.revision<=presentationRevision)return;presentationRevision=value.revision;dispatchEpoch++;
  if(value.intent.kind!=='show-working-set'&&query.workingSet!==undefined){const {workingSet,...rest}=query;query=rest;dirty=true;}
  if(value.intent.kind!=='search-known'&&query.search!==undefined){const {search,...rest}=query;query=rest;dirty=true;}
  const key=JSON.stringify(value.intent);if(key===presentationIntent)return;presentationIntent=key;navigation.present(value.intent);
 }
 async function presentIntent(intent){if(readTerminal)return;dispatchEpoch++;cancelPendingNavigation();
  if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  if(intent.kind!=='show-working-set'&&query.workingSet!==undefined){const {workingSet,...rest}=query;query=rest;}
  if(intent.kind!=='search-known'&&query.search!==undefined){const {search,...rest}=query;query=rest;}
  presentationIntent=JSON.stringify(intent);try{onPresentationRequest(intent);}catch{}
  const current=grant,renderer=navigation,epoch=readEpoch;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_PRESENT',grantId:current.id,mountId:current.mountId,intent}),{now:elapsedNow,schedule,cancel});
   if(readTerminal||readEpoch!==epoch||closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent())return;
   if(result?.ok!==true)throw Error('presentation-unavailable');applyPresentation(result.presentation);invalidate();
  }catch{if(!readTerminal&&readEpoch===epoch&&!closed&&navigation===renderer){
   state({state:'ready',reason:'presentation-unavailable'});
   // PRESENT retired the pointer reservation; retain the ordinary visibility,
   // mutation and active-read gates while draining its queued background hint.
   if(dirty)invalidate(true);
  }}
 }
 async function calibrateEntry({kind}={}){
  if(readTerminal||role!=='workspace'||!['foreground','history'].includes(kind)||closed||calibrationPending||backup||recovery||snippets||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  const current=grant,attempt={};calibrationPending=attempt;
  try{await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_CALIBRATION_ENTRY',grantId:current.id,mountId:current.mountId,kind}),{now:elapsedNow,schedule,cancel});}catch{}
  finally{if(calibrationPending===attempt)calibrationPending=null;}
 }
 async function enterCurrent(){if(readTerminal)return;
  if(role!=='workspace'||closed||horizonPending||recovery||backup||!grantCurrent()||!viewSession||!Number.isSafeInteger(workspaceRevision)||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'current-entry-unavailable'};
  const attempt={};horizonPending=attempt;const current=grant,renderer=navigation,expectedRevision=workspaceRevision,old=viewSession,ticket=serial,entryQuery=structuredClone(query);
  const valid=()=>!closed&&navigation===renderer&&grant?.id===current.id&&grantCurrent()&&serial===ticket&&JSON.stringify(query)===JSON.stringify(entryQuery)&&(query.segment??0)===0&&!query.search&&!query.workingSet;
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_CURRENT_ENTRY',grantId:current.id,mountId:current.mountId,expectedRevision,viewSession:old}),{now:elapsedNow,schedule,cancel});
   if(!valid())return {ok:false,reason:'current-entry-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'current-entry-unavailable'};
   const next=result.viewSession;
   const commit=result.policyCommit;
   if(commit&&(!commit||Object.keys(commit).sort().join(',')!=='policyRevision,workspaceRevision'||commit.workspaceRevision!==expectedRevision+1||commit.workspaceRevision!==result.workspaceRevision||commit.policyRevision!==next?.policyRevision))throw Error('invalid-current-entry-response');
   if(result.segment!==0||result.workspaceRevision!==(commit?expectedRevision+1:expectedRevision)||!next||Object.keys(next).sort().join(',')!=='H,T,Z,policyRevision'||!FREE_HORIZONS.includes(next.H)||!Number.isSafeInteger(next.T)||typeof next.Z!=='string'||!Number.isSafeInteger(next.policyRevision)||next.policyRevision<old.policyRevision)throw Error('invalid-current-entry-response');
   new Intl.DateTimeFormat('en',{timeZone:next.Z});
   const change=result.autoChange;
   if(change&&(!commit||Object.keys(change).sort().join(',')!=='H,expiresAt,id,policyRevision,previousH,workspaceRevision'||typeof change.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(change.id)||!FREE_HORIZONS.includes(change.previousH)||change.previousH===change.H||change.H!==next.H||change.policyRevision!==next.policyRevision||change.workspaceRevision!==result.workspaceRevision||!Number.isFinite(Date.parse(change.expiresAt))||Date.parse(change.expiresAt)>now()+15000))throw Error('invalid-current-entry-response');
   // A trusted return to the same current session preserves the selected page.
   // A changed time window or policy still starts a fresh current-page query.
   const sameSession=['H','T','Z','policyRevision'].every(key=>next[key]===old[key]);
   viewSession=next;workspaceRevision=result.workspaceRevision;query=sameSession?entryQuery:{segment:0,offset:0,limit:8};dirty=false;
   const page=await read(query,true);
   if(page&&change&&!closed&&navigation===renderer&&grant?.id===current.id&&grantCurrent()&&workspaceRevision===change.workspaceRevision&&(query.segment??0)===0&&!query.search&&!query.workingSet){clearAutoNotice();autoChange=change;renderer.showTimePolicyNotice?.({id:change.id,expiresAt:change.expiresAt});}
   return page?result:{ok:false,reason:'current-entry-refresh-unavailable'};
  }catch{return {ok:false,reason:'current-entry-unavailable'};}
  finally{finishMutation(attempt,true);}
 }
 async function undoAutoHorizon(value){if(readTerminal)return;
  const decision=autoChange;
  if(!decision||value?.id!==decision.id||role!=='workspace'||closed||horizonPending||recovery||backup||!grantCurrent()||Date.parse(decision.expiresAt)<=now()||workspaceRevision!==decision.workspaceRevision||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'auto-undo-unavailable'};
  const attempt={};horizonPending=attempt;const current=grant,renderer=navigation,ticket=serial;
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_UNDO_AUTO_HORIZON',grantId:current.id,mountId:current.mountId,operationId:globalThis.crypto.randomUUID(),expectedRevision:decision.workspaceRevision,id:decision.id}),{now:elapsedNow,schedule,cancel});
   if(closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent()||autoChange!==decision||serial!==ticket||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'auto-undo-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'auto-undo-unavailable'};
   if(result.segment!==0||result.workspaceRevision!==decision.workspaceRevision+1||result.viewSession?.H!==decision.previousH||result.viewSession.policyRevision!==decision.policyRevision+1||result.viewSession.T!==viewSession.T||result.viewSession.Z!==viewSession.Z)throw Error('invalid-auto-undo-response');
   clearAutoNotice();workspaceRevision=result.workspaceRevision;viewSession=result.viewSession;query={segment:0,offset:0,limit:8};dirty=false;await read(query,true);return result;
  }catch{return {ok:false,reason:'auto-undo-unavailable'};}
  finally{finishMutation(attempt);}
 }
 async function setHorizon(value){if(readTerminal)return;
  if(closed||horizonPending||!grantCurrent()||!Number.isSafeInteger(workspaceRevision)||(value?.H!=='auto'&&!FREE_HORIZONS.includes(value?.H)))return {ok:false,reason:'horizon-change-unavailable'};
  const expectedH=value.H==='auto'?viewSession?.H:value.H;if(!FREE_HORIZONS.includes(expectedH))return {ok:false,reason:'horizon-change-unavailable'};
  clearAutoNotice();const attempt={};horizonPending=attempt;const current=grant,renderer=navigation,ticket=serial;
  const operationId=globalThis.crypto.randomUUID();
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SET_HORIZON',grantId:current.id,mountId:current.mountId,operationId,expectedRevision:workspaceRevision,H:value.H,segment:value.segment,anchorRefId:value.anchorRefId}),{now:elapsedNow,schedule,cancel});
   if(closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent()||serial!==ticket)return {ok:false,reason:'horizon-change-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'horizon-change-unavailable'};
   if(!Number.isSafeInteger(result.segment)||result.segment<0||result.segment>1000000||result.viewSession?.H!==expectedH||!Number.isSafeInteger(result.workspaceRevision))return {ok:false,reason:'invalid-horizon-response'};
   workspaceRevision=result.workspaceRevision;viewSession=result.viewSession;
   query={segment:result.segment,offset:0,limit:8,...(query.search?{search:query.search}:{}),...(query.workingSet?{workingSet:query.workingSet}:{})};
   dirty=false;await read(query,true);return result;
  }catch{return {ok:false,reason:'horizon-change-unavailable'};}
  finally{finishMutation(attempt);}
 }
 async function setCompactRows(compactRows){
  if(readTerminal||typeof compactRows!=='boolean'||closed||horizonPending||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||!Number.isSafeInteger(workspaceRevision))return {ok:false,reason:'compact-rows-change-unavailable'};
  const attempt={};horizonPending=attempt;const current=grant,renderer=navigation,expectedRevision=workspaceRevision,epoch=readEpoch;
  const valid=()=>!readTerminal&&readEpoch===epoch&&!closed&&navigation===renderer&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SET_COMPACT_ROWS',grantId:current.id,mountId:current.mountId,operationId:globalThis.crypto.randomUUID(),expectedRevision,compactRows}),{now:elapsedNow,schedule,cancel});
   if(!valid())return {ok:false,reason:'compact-rows-change-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'compact-rows-change-unavailable'};
   if(!Number.isSafeInteger(result.workspaceRevision)||result.workspaceRevision<expectedRevision||result.compactRows!==compactRows)return {ok:false,reason:'invalid-compact-rows-response'};
   workspaceRevision=result.workspaceRevision;dirty=false;const page=await read(query,true);
   if(!valid()||!page||!Number.isSafeInteger(page.workspaceRevision)||page.workspaceRevision<result.workspaceRevision||page.compactRows!==compactRows)return {ok:false,reason:'compact-rows-refresh-unavailable'};
   return result;
  }catch{return {ok:false,reason:'compact-rows-change-unavailable'};}
  finally{finishMutation(attempt);}
 }
 async function changeWorkingSet(value){if(readTerminal)return;
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='action,refId'||!['add','remove','move-up'].includes(value.action)||typeof value.refId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.refId))return {ok:false,reason:'invalid-working-set-request'};
  if(closed||horizonPending||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||!Number.isSafeInteger(workspaceRevision))return {ok:false,reason:'working-set-change-unavailable'};
  const attempt={};horizonPending=attempt;const current=grant,renderer=navigation,expectedRevision=workspaceRevision,epoch=readEpoch;
  const valid=()=>!readTerminal&&readEpoch===epoch&&!closed&&navigation===renderer&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_WORKING_SET',grantId:current.id,mountId:current.mountId,operationId:globalThis.crypto.randomUUID(),expectedRevision,action:value.action,refId:value.refId}),{now:elapsedNow,schedule,cancel});
   if(!valid())return {ok:false,reason:'working-set-change-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'working-set-change-unavailable'};
   if(!Number.isSafeInteger(result.workspaceRevision)||result.workspaceRevision<expectedRevision||!Number.isSafeInteger(result.workingSet?.total)||result.workingSet.total<0||result.workingSet.total>1000||!(result.workingSet.currentRefId===null||typeof result.workingSet.currentRefId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(result.workingSet.currentRefId)))return {ok:false,reason:'invalid-working-set-response'};
   workspaceRevision=result.workspaceRevision;
   query={...query,...(query.workingSet?{workingSet:{...query.workingSet,offset:0}}:{})};
   dirty=false;const page=await read(query,true);
   if(!valid()||!page||!Number.isSafeInteger(page.workspaceRevision)||page.workspaceRevision<result.workspaceRevision)return {ok:false,reason:'working-set-refresh-unavailable'};
   return result;
  }catch{return {ok:false,reason:'working-set-change-unavailable'};}
  finally{finishMutation(attempt);}
 }
 function finishMutation(attempt,applyMigration=false){
  // stop/restart may already have admitted a new session's mutation. A retired
  // reply or timeout owns neither its lock nor its pending view invalidation.
  if(horizonPending!==attempt)return;
  horizonPending=false;
  if(dirty&&!closed){dirty=false;invalidate();}else if(applyMigration)applyCandidateMigration();
 }
 async function locateSearchSnippet(value){if(readTerminal)return;
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).join(',')!=='id'||closed||snippets||backup||recovery||snippetLocatePending||!query.search||!currentRef||searchSnippetIds.get(value?.id)!==currentRef.id||!Number.isSafeInteger(workspaceRevision)||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return {ok:false};
  const current=grant,ticket=serial,renderer=navigation,expectedRevision=workspaceRevision,attempt={};snippetLocatePending=attempt;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SNIPPET',grantId:current.id,mountId:current.mountId,operationId:crypto.randomUUID(),expectedRevision,action:'locate',id:value.id}),{now:elapsedNow,schedule,cancel});
   if(!live(ticket)||grant?.id!==current.id||navigation!==renderer||Object.keys(result??{}).join(',')!=='ok'||result.ok!==true)return {ok:false};return {ok:true};
  }catch{return {ok:false};}finally{if(snippetLocatePending===attempt)snippetLocatePending=false;}
 }
 function saveResumeView(value){if(readTerminal)return;
  if(closed||bootstrapping||!grantCurrent()||!resumeQuery||JSON.stringify(resumeQuery)!==JSON.stringify(query))return;
  try{const {freeSession,...layout}=value,view=validateFrameResumeView(layout),expectedQuery=validateResumeQuery(resumeQuery),key=JSON.stringify([expectedQuery,view]);if(key===resumeDesired?.key)return;resumeDesired={view,key,expectedQuery};if(key===resumeLast&&!resumeWriting){cancel(resumeTimer);resumeTimer=null;resumeQueued=null;return;}resumeQueued=resumeDesired;if(resumeTimer===null&&!resumeWriting)resumeTimer=schedule(flushResume,100);}catch{}
 }
 function flushResume(){
  resumeTimer=null;if(!resumeQueued||closed||!grantCurrent())return;
  const item=resumeQueued;resumeQueued=null;if(JSON.stringify(item.expectedQuery)!==JSON.stringify(query))return;const current=grant,renderer=navigation,attempt={};resumeWriting=attempt;resumeLast=null;
  attempt.done=(async()=>{try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SAVE_VIEW',grantId:current.id,mountId:current.mountId,expectedQuery:item.expectedQuery,view:item.view}),{now:elapsedNow,schedule,cancel});if(!closed&&grant?.id===current.id&&navigation===renderer&&JSON.stringify(query)===JSON.stringify(item.expectedQuery)&&result?.ok===true){resumeLast=item.key;return true;}return false;}catch{return false;}
  finally{if(resumeWriting===attempt){resumeWriting=false;if(!closed&&navigation===renderer&&resumeQueued&&resumeTimer===null)resumeTimer=schedule(flushResume,100);}}})();return attempt.done;
 }
 async function bootstrapResume(){
  const attempt={};bootstrapping=attempt;const current=grant,renderer=navigation,ticket=serial;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_RESUME',grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(!live(ticket)||grant!==current||navigation!==renderer)return;
   if(result?.ok===true&&result.resume){const restored=validateResumeQuery(result.resume.query),layout=result.resume.view===null?null:validateFrameResumeView(result.resume.view);query=restored;if(layout)navigation.restoreFrameView?.(layout);}
  }catch{}finally{if(bootstrapping===attempt){bootstrapping=false;if(!closed&&navigation===renderer)invalidate();}}
 }
 function foreground(){
  if(doc.visibilityState==='hidden'){clearNativeInteraction();wasHidden=true;return;}
  if(doc.visibilityState!=='visible'||!wasHidden)return;
  wasHidden=false;
  // Keep a chosen backup file/preview intact. Other reads reuse the existing
  // single-flight and deadline budget; returning does not enter a new segment.
  if(!closed&&!backup&&grantCurrent()&&Date.parse(grant?.expiresAt)>now()){invalidate();void calibrateEntry({kind:'foreground'});}
 }
 async function waitForPanelDispatch(){
  const pending=dispatchPending;if(!pending)return;
  // These callers need the actual fresh page, not the queue admission result.
  // The original dispatch deadline remains the only wait; no extra RPC/retry.
  pending.panelRead=true;await pending.done;
 }
 function cancelPendingNavigation(){
  clearNativeInteraction();
  const pending=dispatchPending;if(!pending||pending.cancelSent)return;
  pending.cancelSent=true;
  // Revocation only: no presentation, data read, retry or replacement dispatch.
  try{void withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_CANCEL_NAVIGATION',...pending.command}),{now:elapsedNow,schedule,cancel}).catch(()=>{});}catch{}
 }
 async function dispatchCurrent(command){
  if(!exactHostRecord(command,['actionId','uiGrantId','mountId','planRevision','targetKey'])||closed||!grantCurrent()||backup||recovery||snippets||command.uiGrantId!==grant?.id||command.mountId!==grant?.mountId)return {state:'blocked'};
  const attempt=dispatchEpoch,current=grant,renderer=navigation,issued=[...plans.values(),...projectPlans.values()].find(item=>item.targetKey===command.targetKey&&item.plan.planRevision===command.planRevision&&(isCurrentNavigationPlan(item.plan)||isResolvedControlNavigationPlan(item.plan)));
  // Old rendered controls cannot activate while their replacement VIEW is pending.
  if(!issued||activeRead||dispatchPending||horizonPending)return {state:'blocked'};
  const pending={command:{grantId:current.id,mountId:current.mountId,actionId:command.actionId,planRevision:command.planRevision,targetKey:command.targetKey},cancelSent:false,panelRead:false};pending.done=new Promise(resolve=>{pending.finish=resolve;});dispatchPending=pending;navigation?.setNativeNavigationPending?.(true);
  let active=true;const started=elapsedNow(),dispatchQuery=JSON.stringify(query);
  const valid=()=>active&&elapsedNow()-started>=0&&elapsedNow()-started<6000&&!closed&&grantCurrent()&&grant?.id===current.id&&navigation===renderer&&dispatchEpoch===attempt&&!backup&&!recovery&&!snippets&&JSON.stringify(query)===dispatchQuery;
  try{const result=await withRequestDeadline(async()=>{
   // Give layout a short head start, not a veto on otherwise valid native
   // navigation. An unresolved write keeps its own scope/document fences.
   let saving=true;
   try{await withRequestDeadline(async()=>{
   if(resumeWriting)await resumeWriting.done;
   if(!valid()||!saving)return;
   // A completed failed background save must not disappear from the navigation
   // barrier. Only this explicit action retries the latest bounded layout.
   if(!resumeQueued&&resumeDesired&&resumeDesired.key!==resumeLast&&JSON.stringify(resumeDesired.expectedQuery)===dispatchQuery)resumeQueued=resumeDesired;
   for(let pass=0;pass<2&&resumeQueued;pass++){if(!valid()||!saving)return;cancel(resumeTimer);resumeTimer=null;await flushResume();}
   },{timeoutMs:500,now:elapsedNow,schedule,cancel});}catch{}finally{saving=false;}
   if(!valid())return {ok:false};
   return runtime.sendMessage({v:1,type:issued.plan.mode==='native-control'?'HOST_UI_DISPATCH_NATIVE':'HOST_UI_DISPATCH_CURRENT',grantId:current.id,mountId:current.mountId,actionId:command.actionId,planRevision:command.planRevision,targetKey:command.targetKey});},{now:elapsedNow,schedule,cancel});
   if(closed||!grantCurrent()||grant?.id!==current.id||navigation!==renderer||dispatchEpoch!==attempt||backup||recovery||snippets||![...plans.values(),...projectPlans.values()].includes(issued)||result?.ok!==true)return {state:'blocked'};
   if(issued.plan.mode==='native-control'&&result.state==='unconfirmed')return {state:'unconfirmed'};
   return result.state===(issued.plan.mode==='native-control'?'dispatched':'already-current')?{state:result.state}:{state:'blocked'};
  }catch{return {state:'unconfirmed'};}finally{active=false;if(dispatchPending===pending){dispatchPending=null;const queued=queuedDispatchView;queuedDispatchView=null;if(!closed&&grantCurrent()&&grant?.id===current.id&&navigation===renderer){if(pending.panelRead){dirty=false;}else if(queued){dirty=false;void read(queued.value,true,queued.location);}else if(dirty){dirty=false;invalidate();}navigation?.setNativeNavigationPending?.(!!activeRead);}}pending.finish();}
 }
 function validateNavigation(items,page,current){
  const groups=searchProjectMap(page.search?.items,[...(page.groups?.items??[]),...(page.currentProject?[page.currentProject]:[])]),currentRoute=page.current;
  if(!Array.isArray(items)||items.length>200)throw Error('invalid-frame-navigation');
   const nextPlans=new Map(),nextProjectPlans=new Map();
   for(const item of items){
    const project=Object.hasOwn(item??{},'projectId'),key=project?'projectId':'refId',entity=project?'project':'conversation',id=item?.[key],destination=project?nextProjectPlans:nextPlans,target=item?.plan?.target;
    if(!item||Object.keys(item).sort().join(',')!==[key,'plan','targetKey'].sort().join(',')||typeof id!=='string'||destination.has(id)||project&&!groups.has(id)||!['href','unavailable','same-target','native-control'].includes(item.plan?.mode)||item.plan?.mode==='native-control'&&(!isResolvedControlNavigationPlan(item.plan)||target.entity!==entity||target.nativeId!==id||!policy.nativeHref(target.navigationURL)||!project&&(policy.parse(target.navigationURL).kind!=='conversation'||policy.parse(target.navigationURL).conversationId!==id)||project&&target.navigationURL!==groups.get(id).nativeUrl)||item.plan?.mode==='same-target'&&(!isCurrentNavigationPlan(item.plan)||project||id!==currentRoute?.refId||target.nativeId!==id||!policy.sameTarget(target.navigationURL,currentRoute?.nativeUrl))||item.plan.mode==='href'&&(target?.kind!=='resolved'||target.entity!==entity||target.nativeId!==id||item.plan.disposition!=='new-tab-preserve-current'||!policy.nativeHref(target.navigationURL)||!project&&(policy.parse(target.navigationURL).kind!=='conversation'||policy.parse(target.navigationURL).conversationId!==id)||project&&target.navigationURL!==groups.get(id).nativeUrl))throw Error('invalid-frame-navigation');
    destination.set(id,Object.freeze({plan:structuredClone(item.plan),targetKey:item.targetKey,uiGrantId:current.id,mountId:current.mountId}));
   }
  return {nextPlans,nextProjectPlans};
 }
 async function preparePageNavigation(response,current,ticket){
  if(!Number.isSafeInteger(response.deliveryId))return;
  const valid=()=>live(ticket)&&grant?.id===current.id&&currentDelivery===response.deliveryId;
  try{
   const answer=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_NAVIGATION_PLANS',grantId:current.id,mountId:current.mountId,deliveryId:response.deliveryId}),{timeoutMs:6000,now:elapsedNow,schedule,cancel});
   if(!valid()||answer?.ok!==true||answer.deliveryId!==response.deliveryId)return;
   const next=validateNavigation(answer.navigation,response.page,current);if(!valid())return;
   // Never replace a pressed control or resurrect a projection during dispatch.
   if(nativeInteractionActive()||dispatchPending||activeRead||backup||recovery||snippets){dirty=true;return;}
   plans=next.nextPlans;projectPlans=next.nextProjectPlans;
   navigation?.updateFrameProjection(response.page);
  }catch{/* A local action failure never invalidates the accepted projection. */}
 }
 function onGrant(value,{isCurrent}){
  closed=false;grant=value;grantCurrent=isCurrent;void refreshSurfaceState();
  if(!navigation){wasHidden=doc.visibilityState==='hidden';doc.addEventListener?.('visibilitychange',foreground);visibilityAttached=true;root=doc.createElement('div');root.setAttribute('data-vaiwl-frame-root','');privateRoot.append(root);
   navigation=navigationFactory({document:doc,surface:{role,root},adapter:{currentURL:()=>currentNativeURL,isCurrent:value=>!!currentNativeURL&&policy.sameTarget(value,currentNativeURL),nativeHref:input=>policy.nativeHref(input),navigationPlan:ref=>plans.get(ref.id),projectNavigationPlan:group=>projectPlans.get(group.id),status(){}},onExit:()=>lifecycle.exit(),onDispatch:dispatchCurrent,onNativeInteractionStart:beginNativeInteraction,onViewChange:saveResumeView,onFrameRendered:(page,counts)=>receipt(page,'rendered',counts),onProjectionRequest:next=>read(next,false),onPresentationRequest:presentIntent,onCurrentWorkspaceEntry:enterCurrent,onCalibrationEntry:calibrateEntry,onUndoTimePolicyRequest:undoAutoHorizon,onHorizonRequest:setHorizon,onCompactRowsRequest:setCompactRows,onWorkingSetRequest:changeWorkingSet,onRecoveryRequest:openRecovery,onBackupRequest:openBackup,onSnippetsRequest:openSnippets,onSnippetLocateRequest:locateSearchSnippet});
   void bootstrapResume();return;
  }
  // Renewal updates this same authority guard only. DATA_CHANGED, entry and
  // foreground already drive the existing dirty/read path.

 }
 const lifecycle=createUiFrameClient({document:doc,runtime,role,parentOrigin,onGrant,onAppearance:()=>navigation?.layout?.(),onClear:clear,onInvalidate:()=>invalidate(true),onSurfaceState:applySurfaceState,onWorkspaceEntry:()=>{dispatchEpoch++;cancelPendingNavigation();workspaceEntered=true;workspaceModePending=navigation?.workspaceEntered?.()!==true;void enterCurrent();void calibrateEntry({kind:'foreground'});applyCandidateMigration();if(migrationListening)void refreshCandidates();},privateRoot,now,elapsedNow,schedule,cancel,...(makeNonce?{makeNonce}:{})});
 return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});
}
