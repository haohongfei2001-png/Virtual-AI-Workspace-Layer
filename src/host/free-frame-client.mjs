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
export function createFreeFrameClient({document:doc,runtime,role,parentOrigin,onPresentationRequest=()=>{},onState=()=>{},privateRoot=doc?.body,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeNonce,navigationFactory=createNavigation,recoveryFactory=createFreeFrameRecovery,backupFactory=createFreeFrameBackup,snippetsFactory=createFreeFrameSnippets}={}){
 const policy=createURLPolicy({origin:parentOrigin});
 let navigation=null,root=null,plans=new Map(),projectPlans=new Map(),grant=null,grantCurrent=()=>false,serial=0,activeRead=null,activeLocation=null,query={segment:0,offset:0,limit:8},closed=true,splits=0,dirty=false,currentNativeURL='',presentationRevision=0,presentationIntent='',workspaceRevision=null,viewSession=null,projectionScope=null,projectionVersion=null,horizonPending=false;
 let wasHidden=false,visibilityAttached=false,candidates=null,candidateRoot=null,candidateRun=0,candidateOffset=0;
 let candidateRestore=null,candidateMigrationId=null,candidateMigrationProject=null,migrationListening=false,workspaceEntered=false,workspaceModePending=false;
 const locatedMigrations=new Map();
 const migration=createFrameCandidateMigration({now,reveal:({projectId,focus})=>navigation?.revealNativeProject?.({projectId,focus:focus&&doc.hasFocus?.()===true})===true,restoreCandidates:p=>{candidateRestore={...p,migrationId:candidateMigrationId};if(candidateOffset!==p.offset)void refreshCandidates(p.offset);else{candidates?.restorePosition?.(p);candidateRestore=null;}}});
 const interruptMigration=event=>{if(event.isTrusted===true){candidateRestore=null;migration.interrupt();}};
 let bootstrapping=false,resumeTimer=null,resumeQueued=null,resumeWriting=false,resumeLast=null,resumeQuery=null;
 let recovery=null,recoveryRoot=null,backup=null,backupRoot=null,autoChange=null,snippets=null,snippetsRoot=null,currentRef=null,searchSnippetIds=new Map(),snippetLocatePending=false;
 function clearAutoNotice(){autoChange=null;navigation?.clearTimePolicyNotice?.();}
 const recoverable=reason=>isFreeRecoveryReason(reason)||['corrupt-record','invalid-partition-manifest','invalid-partition-piece'].includes(reason);
 const budget=createReadRecoveryBudget({now:elapsedNow,schedule,cancel,onExpire:()=>fail('read-budget-exhausted')});
 function state(value){try{onState(value);}catch{}}
 function clear(){migration.clear();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;locatedMigrations.clear();workspaceEntered=false;workspaceModePending=false;for(const type of ['pointerdown','keydown','wheel'])doc.removeEventListener?.(type,interruptMigration,true);migrationListening=false;candidateOffset=0;candidateRun++;candidates?.stop();candidates=null;candidateRoot?.remove();candidateRoot=null;if(visibilityAttached)doc.removeEventListener?.('visibilitychange',foreground);visibilityAttached=false;wasHidden=false;bootstrapping=false;cancel(resumeTimer);resumeTimer=null;resumeQueued=null;resumeWriting=false;resumeLast=null;resumeQuery=null;searchSnippetIds.clear();snippetLocatePending=false;snippets?.stop();snippets=null;snippetsRoot?.remove();snippetsRoot=null;currentRef=null;clearAutoNotice();backup?.stop();backup=null;backupRoot?.remove();backupRoot=null;recovery?.stop();recovery=null;recoveryRoot?.remove();recoveryRoot=null;workspaceRevision=null;viewSession=null;projectionScope=null;projectionVersion=null;horizonPending=false;presentationRevision=0;presentationIntent='';currentNativeURL='';closed=true;dirty=false;serial++;activeRead?.abort();activeRead=null;activeLocation=null;budget.reset();grant=null;query={segment:0,offset:0,limit:8};plans.clear();projectPlans.clear();navigation?.stop();navigation=null;root?.remove();root=null;}
 async function refreshCandidates(offset=candidateOffset){
  if(closed||backup||recovery||snippets||!grantCurrent())return;
  const run=++candidateRun,current=grant;
  const valid=()=>run===candidateRun&&!closed&&grant?.id===current.id&&grantCurrent()&&Date.parse(grant.expiresAt)>now()&&!backup&&!recovery&&!snippets;
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_CANDIDATES',grantId:current.id,mountId:current.mountId,offset}),{now:elapsedNow,schedule,cancel});
   if(!valid())return;if(result?.ok!==true){candidates?.clear();return;}
   if(!candidates){candidateRoot=doc.createElement('div');candidateRoot.setAttribute('data-vaiwl-candidate-root','');if(typeof root?.before==='function')root.before(candidateRoot);else privateRoot.append(candidateRoot);candidates=createFreeFrameCandidates({document:doc,container:candidateRoot,onPageRequest:next=>refreshCandidates(next),onActivate:async(renderKey,presentation)=>{
    const active=grant;if(closed||!grantCurrent()||backup||recovery||snippets)return {ok:false};
    return withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_ACTIVATE_CANDIDATE',grantId:active.id,mountId:active.mountId,renderKey,presentation,actionId:doc.defaultView.crypto.randomUUID()}),{now:elapsedNow,schedule,cancel});
   }});}candidates.update(result.items,result.page);candidateOffset=result.page?.offset??0;if(result.migration){if(migration.offer(result.migration)){candidateMigrationId=result.migration.id;candidateMigrationProject=result.migration.projectId;}if(candidateRestore?.migrationId!==candidateMigrationId)candidateRestore=null;}else{migration.revoke();candidateRestore=null;candidateMigrationId=null;candidateMigrationProject=null;}if(candidateRestore){candidates.restorePosition?.(candidateRestore);candidateRestore=null;}applyCandidateMigration();
  }catch{if(valid())candidates?.clear();}
 }
 function applyCandidateMigration(){
  if(!workspaceEntered||closed||backup||recovery||snippets||activeRead||horizonPending)return;
  if(migration.apply()===true)return;
  const id=candidateMigrationId,projectId=candidateMigrationProject;
  if(!id||!projectId||!migration.isPending(id)||activeRead||horizonPending||query.search||query.workingSet||!viewSession||navigation?.needsNativeProject?.(projectId)!==true)return;
  const prior=locatedMigrations.get(id);if(prior?prior.count>=3||!prior.retry||prior.version===projectionVersion:locatedMigrations.size>=32)return;
  locatedMigrations.set(id,{count:(prior?.count??0)+1,version:projectionVersion,retry:false});
  const attempt={id,projectId,started:elapsedNow(),cancelled:false,scope:projectionScope,query:JSON.stringify(query),session:JSON.stringify(viewSession),renderer:navigation,grantId:grant?.id,mountId:grant?.mountId,scopeGrantId:grant?.scopeGrantId};
  void read(query,true,attempt);
 }
 function locationCurrent(attempt){const elapsed=elapsedNow()-attempt.started;return !attempt.cancelled&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed<6000&&workspaceEntered&&!closed&&!backup&&!recovery&&!snippets&&!horizonPending&&navigation===attempt.renderer&&grant?.id===attempt.grantId&&grant?.mountId===attempt.mountId&&grant?.scopeGrantId===attempt.scopeGrantId&&grantCurrent()&&Date.parse(grant.expiresAt)>now()&&candidateMigrationId===attempt.id&&candidateMigrationProject===attempt.projectId&&migration.isPending(attempt.id)&&JSON.stringify(query)===attempt.query&&JSON.stringify(viewSession)===attempt.session&&!query.search&&!query.workingSet;}
 function clearCandidates(){candidateRun++;candidates?.clear();}
 function fail(reason){if(closed)return;if(recoverable(reason)&&grantCurrent()&&Date.parse(grant?.expiresAt)>now()){openRecovery(true);return;}state({state:'failed',reason});lifecycle.stop(reason);}
 function openRecovery(fromFailure=false){
  if(recovery||backup||snippets||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending&&!fromFailure)return;
  clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-recovery');
  recoveryRoot=doc.createElement('div');recoveryRoot.setAttribute('data-vaiwl-frame-recovery','');privateRoot.append(recoveryRoot);
  const current=grant;
  const valid=()=>!closed&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  const panel=recoveryFactory({document:doc,container:recoveryRoot,request:async message=>{
   if(recovery!==panel||!valid())throw Error('recovery-unavailable');
   const response=await withRequestDeadline(()=>runtime.sendMessage({...message,grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(recovery!==panel||!valid())throw Error('recovery-unavailable');return response;
  },onResume:()=>{if(recovery!==panel||!valid())return;panel.stop();recovery=null;recoveryRoot?.remove();recoveryRoot=null;budget.reset();void read(query,true);}});
  recovery=panel;state({state:'recovery'});void panel.open();
 }
 function openBackup(){
  if(backup||recovery||snippets||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending)return;
  clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-backup');
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
  },onResume:()=>{if(backup!==panel||!valid())return;panel.stop();backup=null;backupRoot?.remove();backupRoot=null;budget.reset();void read(query,true);}});
  backup=panel;state({state:'backup'});void panel.open();
 }
 function openSnippets(){
  if(snippets||backup||recovery||closed||horizonPending||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  clearCandidates();clearAutoNotice();serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();navigation?.invalidate?.('saved-snippets');
  snippetsRoot=doc.createElement('div');snippetsRoot.setAttribute('data-vaiwl-frame-snippets','');privateRoot.append(snippetsRoot);
  const current=grant,selectedRef=currentRef?{...currentRef}:null,valid=()=>!closed&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
  const panel=snippetsFactory({document:doc,container:snippetsRoot,parentOrigin,currentRef:selectedRef,request:async message=>{
   if(snippets!==panel||!valid())throw Error('snippet-unavailable');
   // Reuse the view owner's bounded preparation before reading a list after a
   // human preference commit. No second replica or unbounded retry is created.
   if(message.type==='HOST_UI_SNIPPET_LIST'){budget.reset();const ready=await read(query,false);if(!ready||snippets!==panel||!valid())throw Error('snippet-unavailable');}
   const result=await withRequestDeadline(()=>runtime.sendMessage({...message,v:1,grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(snippets!==panel||!valid())throw Error('snippet-unavailable');return result;
  },onClose:()=>{if(snippets!==panel||!valid())return;panel.stop();snippets=null;snippetsRoot?.remove();snippetsRoot=null;budget.reset();void read(query,true);}});
  snippets=panel;void panel.open();
 }
 function live(ticket){return !closed&&ticket===serial&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();}
 function cancellable(work,signal){
  let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('frame-read-cancelled'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
  return Promise.race([Promise.resolve().then(work),aborted]).finally(()=>signal.removeEventListener('abort',onAbort));
 }
 function delay(ms,signal){let timer;return cancellable(()=>new Promise(resolve=>{timer=schedule(resolve,ms);}),signal).finally(()=>cancel(timer));}
 function boundedQuery(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['role','segment','offset','limit','groupId','list','rowOffset','rowLimit','search','workingSet'].includes(k))||value.role!==undefined&&value.role!==role)throw Error('invalid-frame-query');
  if(value.search!==undefined&&value.workingSet!==undefined)throw Error('invalid-frame-query');
  const {role:ignored,...rest}=value;return structuredClone(rest);
 }
 async function read(value,publish,location=null){
  if(recovery||backup||location&&!locationCurrent(location))return null;
  const requested=boundedQuery(value);if(JSON.stringify(query)!==JSON.stringify(requested)){cancel(resumeTimer);resumeTimer=null;resumeQueued=null;}if(!location)query=requested;const ticket=++serial;activeRead?.abort();const controller=new AbortController();activeRead=controller;activeLocation=location;
  if(budget.remaining()===Infinity)splits=0;
  if(!location&&!budget.begin()){fail('read-budget-exhausted');return null;}
  let effective={...requested},polls=0;
  try{while(live(ticket)){
   if(location&&!locationCurrent(location))return null;if(!location)budget.check();if(++polls>600)throw Error('frame-preparation-limit');
   const current=grant;
   const response=await withRequestDeadline(()=>cancellable(()=>runtime.sendMessage({v:1,type:'HOST_UI_VIEW',grantId:current.id,mountId:current.mountId,query:effective,...(location?{locateProjectId:location.projectId}:{})}),controller.signal),{timeoutMs:location?Math.max(1,6000-(elapsedNow()-location.started)):Math.min(6000,budget.remaining()),now:elapsedNow,schedule,cancel});
   if(!live(ticket)||location&&!locationCurrent(location))return null;if(!location)budget.check();
   if(response?.ok!==true){
    if(location)return null;
    if(['free-frame-page-too-large','free-working-set-page-too-large','free-search-page-too-large'].includes(response?.reason)&&splits<8){
     const limit=effective.limit??8,rowLimit=effective.rowLimit??5;
     const list=response.reason==='free-search-page-too-large'?'search':response.reason==='free-working-set-page-too-large'?'workingSet':null;
     if(list&&effective[list]&&(effective[list].limit??24)>1){effective={...effective,[list]:{...effective[list],limit:Math.max(1,Math.floor((effective[list].limit??24)/2))}};splits++;continue;}
     if(limit>1){effective={...effective,limit:Math.max(1,Math.floor(limit/2))};splits++;continue;}
     if(rowLimit>5){effective={...effective,rowLimit:5};splits++;continue;}
     if(effective.workingSet&&(effective.workingSet.limit??24)>1){effective={...effective,workingSet:{...effective.workingSet,limit:Math.max(1,Math.floor((effective.workingSet.limit??24)/2))}};splits++;continue;}
     if(effective.search&&(effective.search.limit??24)>1){effective={...effective,search:{...effective.search,limit:Math.max(1,Math.floor((effective.search.limit??24)/2))}};splits++;continue;}
    }
    throw Error(recoverable(response?.reason)?response.reason:response?.reason==='free-frame-page-too-large'?'free-frame-page-too-large':'frame-view-unavailable');
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
   const nextSnippetIds=new Map();for(const ref of response.page.search?.items??[]){if(ref.snippetMatches===undefined)continue;if(!Array.isArray(ref.snippetMatches)||ref.snippetMatches.length<1||ref.snippetMatches.length>100)throw Error('invalid-search-snippets');for(const value of ref.snippetMatches){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).sort().join(',')!=='id,preview'||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.id)||['__proto__','constructor','prototype'].includes(value.id)||nextSnippetIds.has(value.id)||typeof value.preview!=='string'||value.preview.length>160||nextSnippetIds.size>=100)throw Error('invalid-search-snippets');nextSnippetIds.set(value.id,ref.id);}}
   const currentRoute=response.page.current;
   if(currentRoute!==undefined&&(!currentRoute||typeof currentRoute!=='object'||Array.isArray(currentRoute)||Object.keys(currentRoute).sort().join(',')!=='nativeUrl,projectId,refId'||typeof currentRoute.nativeUrl!=='string'||!policy.nativeHref(currentRoute.nativeUrl)||!['refId','projectId'].every(k=>currentRoute[k]===null||typeof currentRoute[k]==='string'&&currentRoute[k].length>0&&currentRoute[k].length<=128&&!/[\s\x00-\x1f]/.test(currentRoute[k]))))throw Error('invalid-frame-current');
   if(response.page.currentRef!==undefined&&response.page.currentRef!==null&&(!currentRoute||response.page.currentRef.id!==currentRoute.refId))throw Error('invalid-frame-current-ref');
   const nextPlans=new Map(),nextProjectPlans=new Map(),groups=new Map((response.page.groups?.items??[]).map(group=>[group.id,group]));
   for(const item of response.navigation){
    const project=Object.hasOwn(item??{},'projectId'),key=project?'projectId':'refId',entity=project?'project':'conversation',id=item?.[key],destination=project?nextProjectPlans:nextPlans,target=item?.plan?.target;
    if(!item||Object.keys(item).sort().join(',')!==[key,'plan','targetKey'].sort().join(',')||typeof id!=='string'||destination.has(id)||project&&!groups.has(id)||!['href','unavailable'].includes(item.plan?.mode)||item.plan.mode==='href'&&(target?.kind!=='resolved'||target.entity!==entity||target.nativeId!==id||item.plan.disposition!=='new-tab-preserve-current'||!policy.nativeHref(target.navigationURL)||project&&target.navigationURL!==groups.get(id).nativeUrl))throw Error('invalid-frame-navigation');
    destination.set(id,Object.freeze({plan:structuredClone(item.plan),targetKey:item.targetKey,uiGrantId:current.id,mountId:current.mountId}));
   }
   if(!live(ticket)||location&&!locationCurrent(location))return null;plans=nextPlans;projectPlans=nextProjectPlans;searchSnippetIds=nextSnippetIds;projectionScope=response.page.scope;projectionVersion=JSON.stringify([response.page.revision??null,response.page.workspaceRevision??null,response.page.evidenceRevision??null,response.page.viewRevision??null]);workspaceRevision=response.page.workspaceRevision??null;viewSession=nextSession??null;currentNativeURL=currentRoute?.nativeUrl??'';currentRef=currentRoute?.refId?{id:currentRoute.refId,nativeUrl:currentRoute.nativeUrl}:null;query=effective;resumeQuery=structuredClone(effective);if(!location&&!dirty)budget.complete();if(publish){navigation.updateFrameProjection(response.page);if(workspaceModePending&&navigation.workspaceEntered?.()===true)workspaceModePending=false;}if(!snippets&&!location)applyPresentation(response.page.presentation);state({state:'ready'});if(publish){if(response.nativeCandidates===true){if(!migrationListening){for(const type of ['pointerdown','keydown','wheel'])doc.addEventListener?.(type,interruptMigration,true);migrationListening=true;}void refreshCandidates();}else clearCandidates();}if(location&&live(ticket)&&migration.isPending(location.id)&&candidateMigrationId===location.id){dirty=true;}return response.page;
  }}catch(error){if(!location&&live(ticket))fail(error?.message==='frame-read-cancelled'?'frame-view-unavailable':error?.message??'frame-view-unavailable');return null;}
  finally{if(activeRead===controller){activeRead=null;activeLocation=null;if(dirty&&live(ticket)){dirty=false;void read(query,true);}else if(live(ticket))applyCandidateMigration();}}
  return null;
 }
 function invalidate(){if(activeLocation){const attempt=activeLocation,record=locatedMigrations.get(attempt.id);if(record&&locationCurrent(attempt))record.retry=true;attempt.cancelled=true;activeRead?.abort();}if(bootstrapping){dirty=true;return;}if(snippets){snippets.invalidate?.();return;}if(backup){backup.invalidate?.();return;}if(recovery){recovery.invalidate?.();return;}if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;if(activeRead||horizonPending)dirty=true;else void read(query,true);}
 function applyPresentation(value){
  if(value===undefined)return;
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||!value.intent||!['show-workspace','enter-reading','search-known','show-working-set'].includes(value.intent.kind))throw Error('invalid-frame-presentation');
  if(value.revision<=presentationRevision)return;presentationRevision=value.revision;
  if(value.intent.kind!=='show-working-set'&&query.workingSet!==undefined){const {workingSet,...rest}=query;query=rest;dirty=true;}
  if(value.intent.kind!=='search-known'&&query.search!==undefined){const {search,...rest}=query;query=rest;dirty=true;}
  const key=JSON.stringify(value.intent);if(key===presentationIntent)return;presentationIntent=key;navigation.present(value.intent);
 }
 async function presentIntent(intent){
  if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;
  if(intent.kind!=='show-working-set'&&query.workingSet!==undefined){const {workingSet,...rest}=query;query=rest;}
  if(intent.kind!=='search-known'&&query.search!==undefined){const {search,...rest}=query;query=rest;}
  presentationIntent=JSON.stringify(intent);try{onPresentationRequest(intent);}catch{}
  const current=grant,renderer=navigation;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_PRESENT',grantId:current.id,mountId:current.mountId,intent}),{now:elapsedNow,schedule,cancel});
   if(closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent())return;
   if(result?.ok!==true)throw Error('presentation-unavailable');applyPresentation(result.presentation);invalidate();
  }catch{if(!closed&&navigation===renderer)state({state:'ready',reason:'presentation-unavailable'});}
 }
 async function enterCurrent(){
  if(role!=='workspace'||closed||horizonPending||recovery||backup||!grantCurrent()||!viewSession||!Number.isSafeInteger(workspaceRevision)||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'current-entry-unavailable'};
  horizonPending=true;const current=grant,renderer=navigation,expectedRevision=workspaceRevision,old=viewSession,ticket=serial;
  const valid=()=>!closed&&navigation===renderer&&grant?.id===current.id&&grantCurrent()&&serial===ticket&&(query.segment??0)===0&&!query.search&&!query.workingSet;
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
   viewSession=next;workspaceRevision=result.workspaceRevision;query={segment:0,offset:0,limit:8};dirty=false;
   const page=await read(query,true);
   if(page&&change&&!closed&&navigation===renderer&&grant?.id===current.id&&grantCurrent()&&workspaceRevision===change.workspaceRevision&&(query.segment??0)===0&&!query.search&&!query.workingSet){clearAutoNotice();autoChange=change;renderer.showTimePolicyNotice?.({id:change.id,expiresAt:change.expiresAt});}
   return page?result:{ok:false,reason:'current-entry-refresh-unavailable'};
  }catch{return {ok:false,reason:'current-entry-unavailable'};}
  finally{horizonPending=false;if(dirty&&!closed){dirty=false;invalidate();}else applyCandidateMigration();}
 }
 async function undoAutoHorizon(value){
  const decision=autoChange;
  if(!decision||value?.id!==decision.id||role!=='workspace'||closed||horizonPending||recovery||backup||!grantCurrent()||Date.parse(decision.expiresAt)<=now()||workspaceRevision!==decision.workspaceRevision||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'auto-undo-unavailable'};
  horizonPending=true;const current=grant,renderer=navigation,ticket=serial;
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_UNDO_AUTO_HORIZON',grantId:current.id,mountId:current.mountId,operationId:globalThis.crypto.randomUUID(),expectedRevision:decision.workspaceRevision,id:decision.id}),{now:elapsedNow,schedule,cancel});
   if(closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent()||autoChange!==decision||serial!==ticket||(query.segment??0)!==0||query.search||query.workingSet)return {ok:false,reason:'auto-undo-unavailable'};
   if(result?.ok!==true)return {ok:false,reason:result?.reason??'auto-undo-unavailable'};
   if(result.segment!==0||result.workspaceRevision!==decision.workspaceRevision+1||result.viewSession?.H!==decision.previousH||result.viewSession.policyRevision!==decision.policyRevision+1||result.viewSession.T!==viewSession.T||result.viewSession.Z!==viewSession.Z)throw Error('invalid-auto-undo-response');
   clearAutoNotice();workspaceRevision=result.workspaceRevision;viewSession=result.viewSession;query={segment:0,offset:0,limit:8};dirty=false;await read(query,true);return result;
  }catch{return {ok:false,reason:'auto-undo-unavailable'};}
  finally{horizonPending=false;if(dirty&&!closed){dirty=false;invalidate();}}
 }
 async function setHorizon(value){
  if(closed||horizonPending||!grantCurrent()||!Number.isSafeInteger(workspaceRevision)||(value?.H!=='auto'&&!FREE_HORIZONS.includes(value?.H)))return {ok:false,reason:'horizon-change-unavailable'};
  const expectedH=value.H==='auto'?viewSession?.H:value.H;if(!FREE_HORIZONS.includes(expectedH))return {ok:false,reason:'horizon-change-unavailable'};
  clearAutoNotice();horizonPending=true;const current=grant,renderer=navigation,ticket=serial;
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
  finally{horizonPending=false;if(dirty&&!closed){dirty=false;invalidate();}}
 }
 async function changeWorkingSet(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='action,refId'||!['add','remove','move-up'].includes(value.action)||typeof value.refId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.refId))return {ok:false,reason:'invalid-working-set-request'};
  if(closed||horizonPending||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||!Number.isSafeInteger(workspaceRevision))return {ok:false,reason:'working-set-change-unavailable'};
  horizonPending=true;const current=grant,renderer=navigation,expectedRevision=workspaceRevision;
  const valid=()=>!closed&&navigation===renderer&&grant?.id===current.id&&grant?.mountId===current.mountId&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();
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
  finally{horizonPending=false;if(dirty&&!closed){dirty=false;invalidate();}}
 }
 async function locateSearchSnippet(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).join(',')!=='id'||closed||snippets||backup||recovery||snippetLocatePending||!query.search||!currentRef||searchSnippetIds.get(value?.id)!==currentRef.id||!Number.isSafeInteger(workspaceRevision)||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return {ok:false};
  const current=grant,ticket=serial,renderer=navigation,expectedRevision=workspaceRevision,attempt={};snippetLocatePending=attempt;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SNIPPET',grantId:current.id,mountId:current.mountId,operationId:crypto.randomUUID(),expectedRevision,action:'locate',id:value.id}),{now:elapsedNow,schedule,cancel});
   if(!live(ticket)||grant?.id!==current.id||navigation!==renderer||Object.keys(result??{}).join(',')!=='ok'||result.ok!==true)return {ok:false};return {ok:true};
  }catch{return {ok:false};}finally{if(snippetLocatePending===attempt)snippetLocatePending=false;}
 }
 function saveResumeView(value){
  if(closed||bootstrapping||!grantCurrent()||!resumeQuery||JSON.stringify(resumeQuery)!==JSON.stringify(query))return;
  try{const {freeSession,...layout}=value,view=validateFrameResumeView(layout),expectedQuery=validateResumeQuery(resumeQuery),key=JSON.stringify([expectedQuery,view]);if(key===resumeLast)return;resumeQueued={view,key,expectedQuery};if(resumeTimer===null&&!resumeWriting)resumeTimer=schedule(flushResume,100);}catch{}
 }
 async function flushResume(){
  resumeTimer=null;if(!resumeQueued||closed||!grantCurrent())return;
  const item=resumeQueued;resumeQueued=null;if(JSON.stringify(item.expectedQuery)!==JSON.stringify(query))return;const current=grant,renderer=navigation,attempt={};resumeWriting=attempt;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SAVE_VIEW',grantId:current.id,mountId:current.mountId,expectedQuery:item.expectedQuery,view:item.view}),{now:elapsedNow,schedule,cancel});if(!closed&&grant===current&&navigation===renderer&&JSON.stringify(query)===JSON.stringify(item.expectedQuery)&&result?.ok===true)resumeLast=item.key;}catch{}
  finally{if(resumeWriting===attempt){resumeWriting=false;if(!closed&&navigation===renderer&&resumeQueued&&resumeTimer===null)resumeTimer=schedule(flushResume,100);}}
 }
 async function bootstrapResume(){
  const attempt={};bootstrapping=attempt;const current=grant,renderer=navigation,ticket=serial;
  try{const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_RESUME',grantId:current.id,mountId:current.mountId}),{now:elapsedNow,schedule,cancel});
   if(!live(ticket)||grant!==current||navigation!==renderer)return;
   if(result?.ok===true&&result.resume){const restored=validateResumeQuery(result.resume.query),layout=result.resume.view===null?null:validateFrameResumeView(result.resume.view);query=restored;if(layout)navigation.restoreFrameView?.(layout);}
  }catch{}finally{if(bootstrapping===attempt){bootstrapping=false;if(!closed&&navigation===renderer)invalidate();}}
 }
 function foreground(){
  if(doc.visibilityState==='hidden'){wasHidden=true;return;}
  if(doc.visibilityState!=='visible'||!wasHidden)return;
  wasHidden=false;
  // Keep a chosen backup file/preview intact. Other reads reuse the existing
  // single-flight and deadline budget; returning does not enter a new segment.
  if(!closed&&!backup&&grantCurrent()&&Date.parse(grant?.expiresAt)>now())invalidate();
 }
 function onGrant(value,{isCurrent}){
  closed=false;grant=value;grantCurrent=isCurrent;
  if(!navigation){wasHidden=doc.visibilityState==='hidden';doc.addEventListener?.('visibilitychange',foreground);visibilityAttached=true;root=doc.createElement('div');root.setAttribute('data-vaiwl-frame-root','');privateRoot.append(root);
   navigation=navigationFactory({document:doc,surface:{role,root},adapter:{currentURL:()=>currentNativeURL,isCurrent:value=>!!currentNativeURL&&policy.sameTarget(value,currentNativeURL),nativeHref:input=>policy.nativeHref(input),navigationPlan:ref=>plans.get(ref.id),projectNavigationPlan:group=>projectPlans.get(group.id),status(){}},onViewChange:saveResumeView,onProjectionRequest:next=>read(next,false),onPresentationRequest:presentIntent,onCurrentWorkspaceEntry:enterCurrent,onUndoTimePolicyRequest:undoAutoHorizon,onHorizonRequest:setHorizon,onWorkingSetRequest:changeWorkingSet,onRecoveryRequest:openRecovery,onBackupRequest:openBackup,onSnippetsRequest:openSnippets,onSnippetLocateRequest:locateSearchSnippet});
   void bootstrapResume();return;
  }
  if(!backup)invalidate();
 }
 const lifecycle=createUiFrameClient({document:doc,runtime,role,parentOrigin,onGrant,onClear:clear,onInvalidate:invalidate,onWorkspaceEntry:()=>{workspaceEntered=true;workspaceModePending=navigation?.workspaceEntered?.()!==true;void enterCurrent();applyCandidateMigration();if(migrationListening)void refreshCandidates();},privateRoot,now,elapsedNow,schedule,cancel,...(makeNonce?{makeNonce}:{})});
 return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});
}
