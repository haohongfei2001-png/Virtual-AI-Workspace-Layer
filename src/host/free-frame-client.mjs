import {createUiFrameClient} from './ui-frame-client.mjs';
import {createNavigation} from '../navigation/navigation.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createReadRecoveryBudget} from '../data/read-recovery-budget.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';

/** Bounded runtime-only projection consumer. No full workspace replica is built
 * in either frame; parent messages remain the lifecycle's public join/suspend. */
export function createFreeFrameClient({document:doc,runtime,role,parentOrigin,onPresentationRequest=()=>{},onState=()=>{},privateRoot=doc?.body,now=Date.now,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeNonce,navigationFactory=createNavigation}={}){
 const policy=createURLPolicy({origin:parentOrigin});
 let navigation=null,root=null,plans=new Map(),grant=null,grantCurrent=()=>false,serial=0,activeRead=null,query={segment:0,offset:0,limit:8},closed=true,splits=0,dirty=false,currentNativeURL='';
 const budget=createReadRecoveryBudget({now:elapsedNow,schedule,cancel,onExpire:()=>fail('read-budget-exhausted')});
 function state(value){try{onState(value);}catch{}}
 function clear(){currentNativeURL='';closed=true;dirty=false;serial++;activeRead?.abort();activeRead=null;budget.reset();grant=null;query={segment:0,offset:0,limit:8};plans.clear();navigation?.stop();navigation=null;root?.remove();root=null;}
 function fail(reason){if(closed)return;state({state:'failed',reason});lifecycle.stop(reason);}
 function live(ticket){return !closed&&ticket===serial&&grantCurrent()&&Date.parse(grant?.expiresAt)>now();}
 function cancellable(work,signal){
  let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('frame-read-cancelled'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
  return Promise.race([Promise.resolve().then(work),aborted]).finally(()=>signal.removeEventListener('abort',onAbort));
 }
 function delay(ms,signal){let timer;return cancellable(()=>new Promise(resolve=>{timer=schedule(resolve,ms);}),signal).finally(()=>cancel(timer));}
 function boundedQuery(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['role','segment','offset','limit','groupId','list','rowOffset','rowLimit'].includes(k))||value.role!==undefined&&value.role!==role)throw Error('invalid-frame-query');
  const {role:ignored,...rest}=value;return structuredClone(rest);
 }
 async function read(value,publish){
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
    if(response?.reason==='free-frame-page-too-large'&&splits<8){
     const limit=effective.limit??8,rowLimit=effective.rowLimit??5;
     if(limit>1){effective={...effective,limit:Math.max(1,Math.floor(limit/2))};splits++;continue;}
     if(rowLimit>5){effective={...effective,rowLimit:5};splits++;continue;}
    }
    throw Error(response?.reason==='free-frame-page-too-large'?'free-frame-page-too-large':'frame-view-unavailable');
   }
   if(response.state==='preparing'){
    if(!Number.isFinite(response.retryAfterMs)||response.retryAfterMs<0)throw Error('invalid-preparation-response');
    state({state:'preparing'});const wait=Math.max(50,response.retryAfterMs);if(wait>=budget.remaining())throw Error('read-budget-exhausted');await delay(wait,controller.signal);continue;
   }
   if(response.state!=='ready'||response.page?.protocol!=='vaiwl-free-frame/1'||response.page.role!==role||response.page.completeSnapshot!==false||!Array.isArray(response.navigation)||response.navigation.length>200)throw Error('invalid-frame-view');
   const currentRoute=response.page.current;
   if(currentRoute!==undefined&&(!currentRoute||typeof currentRoute!=='object'||Array.isArray(currentRoute)||Object.keys(currentRoute).sort().join(',')!=='nativeUrl,projectId,refId'||typeof currentRoute.nativeUrl!=='string'||!policy.nativeHref(currentRoute.nativeUrl)||!['refId','projectId'].every(k=>currentRoute[k]===null||typeof currentRoute[k]==='string'&&currentRoute[k].length>0&&currentRoute[k].length<=128&&!/[\s\x00-\x1f]/.test(currentRoute[k]))))throw Error('invalid-frame-current');
   const nextPlans=new Map();for(const item of response.navigation){if(typeof item?.refId!=='string'||nextPlans.has(item.refId)||!['href','unavailable'].includes(item.plan?.mode)||item.plan.mode==='href'&&(item.plan.target?.kind!=='resolved'||item.plan.target.entity!=='conversation'||item.plan.target.nativeId!==item.refId||item.plan.disposition!=='new-tab-preserve-current'||!policy.nativeHref(item.plan.target.navigationURL)))throw Error('invalid-frame-navigation');nextPlans.set(item.refId,Object.freeze({plan:structuredClone(item.plan),targetKey:item.targetKey,uiGrantId:current.id,mountId:current.mountId}));}
   if(!live(ticket))return null;plans=nextPlans;currentNativeURL=currentRoute?.nativeUrl??'';query=effective;if(!dirty)budget.complete();if(publish)navigation.updateFrameProjection(response.page);state({state:'ready'});return response.page;
  }}catch(error){if(live(ticket))fail(error?.message==='frame-read-cancelled'?'frame-view-unavailable':error?.message??'frame-view-unavailable');return null;}
  finally{if(activeRead===controller){activeRead=null;if(dirty&&live(ticket)){dirty=false;void read(query,true);}}}
  return null;
 }
 function invalidate(){if(closed||!grantCurrent()||Date.parse(grant?.expiresAt)<=now())return;if(activeRead)dirty=true;else void read(query,true);}
 function onGrant(value,{isCurrent}){
  closed=false;grant=value;grantCurrent=isCurrent;
  if(!navigation){root=doc.createElement('div');root.setAttribute('data-vaiwl-frame-root','');privateRoot.append(root);
   navigation=navigationFactory({document:doc,surface:{role,root},adapter:{currentURL:()=>currentNativeURL,isCurrent:value=>!!currentNativeURL&&policy.sameTarget(value,currentNativeURL),nativeHref:input=>policy.nativeHref(input),navigationPlan:ref=>plans.get(ref.id),status(){}},onProjectionRequest:next=>read(next,false),onPresentationRequest});
  }
  invalidate();
 }
 const lifecycle=createUiFrameClient({document:doc,runtime,role,parentOrigin,onGrant,onClear:clear,onInvalidate:invalidate,privateRoot,now,elapsedNow,schedule,cancel,...(makeNonce?{makeNonce}:{})});
 return Object.freeze({start:()=>lifecycle.start(),stop:()=>lifecycle.stop('frame-view-stopped')});
}
