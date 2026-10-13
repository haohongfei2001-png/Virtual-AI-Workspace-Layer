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
export function createFreeFrameClient({document:doc,runtime,role,parentOrigin,onPresentationRequest=()=>{},onState=()=>{},privateRoot=doc?.body,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeNonce,navigationFactory=createNavigation,recoveryFactory=createFreeFrameRecovery,backupFactory=createFreeFrameBackup}={}){
 const policy=createURLPolicy({origin:parentOrigin});
 let navigation=null,root=null,plans=new Map(),projectPlans=new Map(),grant=null,grantCurrent=()=>false,serial=0,activeRead=null,query={segment:0,offset:0,limit:8},closed=true,splits=0,dirty=false,currentNativeURL='',presentationRevision=0,presentationIntent='',workspaceRevision=null,viewSession=null,horizonPending=false;
 let recovery=null,recoveryRoot=null,backup=null,backupRoot=null;
 const recoverable=reason=>isFreeRecoveryReason(reason)||['corrupt-record','invalid-partition-manifest','invalid-partition-piece'].includes(reason);
 const budget=createReadRecoveryBudget({now:elapsedNow,schedule,cancel,onExpire:()=>fail('read-budget-exhausted')});
 function state(value){try{onState(value);}catch{}}
 function clear(){backup?.stop();backup=null;backupRoot?.remove();backupRoot=null;recovery?.stop();recovery=null;recoveryRoot?.remove();recoveryRoot=null;workspaceRevision=null;viewSession=null;horizonPending=false;presentationRevision=0;presentationIntent='';currentNativeURL='';closed=true;dirty=false;serial++;activeRead?.abort();activeRead=null;budget.reset();grant=null;query={segment:0,offset:0,limit:8};plans.clear();projectPlans.clear();navigation?.stop();navigation=null;root?.remove();root=null;}
 function fail(reason){if(closed)return;if(recoverable(reason)&&grantCurrent()&&Date.parse(grant?.expiresAt)>now()){openRecovery(true);return;}state({state:'failed',reason});lifecycle.stop(reason);}
 function openRecovery(fromFailure=false){
  if(recovery||backup||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending&&!fromFailure)return;
  serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-recovery');
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
  if(backup||recovery||closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now()||horizonPending)return;
  serial++;activeRead?.abort();activeRead=null;dirty=false;budget.reset();plans.clear();projectPlans.clear();workspaceRevision=null;currentNativeURL='';navigation?.invalidate?.('local-backup');
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
 async function read(value,publish){
  if(recovery||backup)return null;
  const requested=boundedQuery(value);query=requested;const ticket=++serial;activeRead?.abort();const controller=new AbortController();activeRead=controller;
  if(budget.remaining()===Infinity)splits=0;
  if(!budget.begin()){fail('read-budget-exhausted');return null;}
  let effective={...requested},polls=0;
  try{while(live(ticket)){
   budget.check();if(++polls>600)throw Error('frame-preparation-limit');
   const current=grant;
   const response=await withRequestDeadline(()=>cancellable(()=>runtime.sendMessage({v:1,type:'HOST_UI_VIEW',grantId:current.id,mountId:current.mountId,query:effective}),controller.signal),{timeoutMs:Math.min(6000,budget.remaining()),now:elapsedNow,schedule,cancel});
   if(!live(ticket))return null;budget.check();
   if(response?.ok!==true){
    if(['free-frame-page-too-large','free-working-set-page-too-large'].includes(response?.reason)&&splits<8){
     const limit=effective.limit??8,rowLimit=effective.rowLimit??5;
     if(limit>1){effective={...effective,limit:Math.max(1,Math.floor(limit/2))};splits++;continue;}
     if(rowLimit>5){effective={...effective,rowLimit:5};splits++;continue;}
     if(effective.workingSet?.limit>1){effective={...effective,workingSet:{...effective.workingSet,limit:Math.max(1,Math.floor(effective.workingSet.limit/2))}};splits++;continue;}
     if(effective.search?.limit>1){effective={...effective,search:{...effective.search,limit:Math.max(1,Math.floor(effective.search.limit/2))}};splits++;continue;}
    }
    throw Error(recoverable(response?.reason)?response.reason:response?.reason==='free-frame-page-too-large'?'free-frame-page-too-large':'frame-view-unavailable');
   }
   if(response.state==='preparing'){
    if(!Number.isFinite(response.retryAfterMs)||response.retryAfterMs<0)throw Error('invalid-preparation-response');
    state({state:'preparing'});const wait=Math.max(50,response.retryAfterMs);if(wait>=budget.remaining())throw Error('read-budget-exhausted');await delay(wait,controller.signal);continue;
   }
   if(response.state!=='ready'||response.page?.protocol!=='vaiwl-free-frame/1'||response.page.role!==role||response.page.completeSnapshot!==false||!Array.isArray(response.navigation)||response.navigation.length>200)throw Error('invalid-frame-view');
   const nextSession=response.page.viewSession;
   if(nextSession&&viewSession&&(nextSession.H!==viewSession.H||nextSession.T!==viewSession.T||nextSession.Z!==viewSession.Z)){
    const segment=relocateFreeSegment({candidateDay:viewSession.T-viewSession.H*(effective.segment??0)},nextSession);viewSession=nextSession;effective={segment,offset:0,limit:effective.limit??8,...(effective.search?{search:effective.search}:{}),...(effective.workingSet?{workingSet:effective.workingSet}:{})};continue;
   }
   const currentRoute=response.page.current;
   if(currentRoute!==undefined&&(!currentRoute||typeof currentRoute!=='object'||Array.isArray(currentRoute)||Object.keys(currentRoute).sort().join(',')!=='nativeUrl,projectId,refId'||typeof currentRoute.nativeUrl!=='string'||!policy.nativeHref(currentRoute.nativeUrl)||!['refId','projectId'].every(k=>currentRoute[k]===null||typeof currentRoute[k]==='string'&&currentRoute[k].length>0&&currentRoute[k].length<=128&&!/[\s\x00-\x1f]/.test(currentRoute[k]))))throw Error('invalid-frame-current');
   if(response.page.currentRef!==undefined&&response.page.currentRef!==null&&(!currentRoute||response.page.currentRef.id!==currentRoute.refId))throw Error('invalid-frame-current-ref');
   const nextPlans=new Map(),nextProjectPlans=new Map(),groups=new Map((response.page.groups?.items??[]).map(group=>[group.id,group]));
   for(const item of response.navigation){
    const project=Object.hasOwn(item??{},'projectId'),key=project?'projectId':'refId',entity=project?'project':'conversation',id=item?.[key],destination=project?nextProjectPlans:nextPlans,target=item?.plan?.target;
    if(!item||Object.keys(item).sort().join(',')!==[key,'plan','targetKey'].sort().join(',')||typeof id!=='string'||destination.has(id)||project&&!groups.has(id)||!['href','unavailable'].includes(item.plan?.mode)||item.plan.mode==='href'&&(target?.kind!=='resolved'||target.entity!==entity||target.nativeId!==id||item.plan.disposition!=='new-tab-preserve-current'||!policy.nativeHref(target.navigationURL)||project&&target.navigationURL!==groups.get(id).nativeUrl))throw Error('invalid-frame-navigation');
    destination.set(id,Object.freeze({plan:structuredClone(item.plan),targetKey:item.targetKey,uiGrantId:current.id,mountId:current.mountId}));
   }
   if(!live(ticket))return null;plans=nextPlans;projectPlans=nextProjectPlans;workspaceRevision=response.page.workspaceRevision??null;viewSession=nextSession??null;currentNativeURL=currentRoute?.nativeUrl??'';query=effective;if(!dirty)budget.complete();if(publish)navigation.updateFrameProjection(response.page);applyPresentation(response.page.presentation);state({state:'ready'});return response.page;
  }}catch(error){if(live(ticket))fail(error?.message==='frame-read-cancelled'?'frame-view-unavailable':error?.message??'frame-view-unavailable');return null;}
  finally{if(activeRead===controller){activeRead=null;if(dirty&&live(ticket)){dirty=false;void read(query,true);}}}
  return null;
 }
 function invalidate(){if(backup){backup.invalidate?.();return;}if(recovery){recovery.invalidate?.();return;}if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;if(activeRead||horizonPending)dirty=true;else void read(query,true);}
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
 async function setHorizon(value){
  if(closed||horizonPending||!grantCurrent()||!Number.isSafeInteger(workspaceRevision)||(value?.H!=='auto'&&!FREE_HORIZONS.includes(value?.H)))return {ok:false,reason:'horizon-change-unavailable'};
  const expectedH=value.H==='auto'?viewSession?.H:value.H;if(!FREE_HORIZONS.includes(expectedH))return {ok:false,reason:'horizon-change-unavailable'};
  horizonPending=true;const current=grant,renderer=navigation;
  const operationId=globalThis.crypto.randomUUID();
  try{
   const result=await withRequestDeadline(()=>runtime.sendMessage({v:1,type:'HOST_UI_SET_HORIZON',grantId:current.id,mountId:current.mountId,operationId,expectedRevision:workspaceRevision,H:value.H,segment:value.segment,anchorRefId:value.anchorRefId}),{now:elapsedNow,schedule,cancel});
   if(closed||navigation!==renderer||grant?.id!==current.id||!grantCurrent())return {ok:false,reason:'horizon-change-unavailable'};
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
 function onGrant(value,{isCurrent}){
  closed=false;grant=value;grantCurrent=isCurrent;
  if(!navigation){root=doc.createElement('div');root.setAttribute('data-vaiwl-frame-root','');privateRoot.append(root);
   navigation=navigationFactory({document:doc,surface:{role,root},adapter:{currentURL:()=>currentNativeURL,isCurrent:value=>!!currentNativeURL&&policy.sameTarget(value,currentNativeURL),nativeHref:input=>policy.nativeHref(input),navigationPlan:ref=>plans.get(ref.id),projectNavigationPlan:group=>projectPlans.get(group.id),status(){}},onProjectionRequest:next=>read(next,false),onPresentationRequest:presentIntent,onHorizonRequest:setHorizon,onWorkingSetRequest:changeWorkingSet,onRecoveryRequest:openRecovery,onBackupRequest:openBackup});
  }
  if(!backup)invalidate();
 }
 const lifecycle=createUiFrameClient({document:doc,runtime,role,parentOrigin,onGrant,onClear:clear,onInvalidate:invalidate,privateRoot,now,elapsedNow,schedule,cancel,...(makeNonce?{makeNonce}:{})});
 return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});
}
