import {createURLPolicy} from './url-policy.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
import {createNativeActions} from './native-actions.mjs';
import {publicAdapterStatus} from './contract.mjs';
const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
/** Isolated-world composition. DOM observations remain proposals, never scope proof. */
export function createChatGPTAdapter({document,urlPolicy=createURLPolicy(),profile=LEGACY_SURFACE_PROFILE,bodyProof=()=>null,inputRisk=()=>({state:'unknown',flags:[]}),authorize=()=>false,beforeDispatch=()=>{},onRebindNeeded=()=>{},onObservationIssue=()=>{},now=Date.now,elapsedNow=()=>performance.now(),scheduleRetry=(fn,ms)=>setTimeout(fn,ms),cancelRetry=id=>clearTimeout(id)}={}){
 if(!document?.defaultView)throw Error('invalid-host-document');
 let binding=null,emit=null,discovery=null,actions=null,observer=null,stopped=true,epoch=0,seq=0,url='',busy=false,dirty=false,queued=false,generation=0,last='',regionEpoch=0,priorNodes=[],failedKey='',retryTimer=null;
 const one=selector=>{const nodes=document.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;};
 const live=()=>!stopped&&now()<Date.parse(binding.expiresAt);
 function syncRoute(){if(document.location.href!==url){stop();onRebindNeeded({reason:'native-route-changed'});throw Error('host-rebind-required');}}
 function proposal(){if(!live())throw Error('stale-host-binding');syncRoute();const payload=discovery.scan();return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload};}
 function bounded(p){return p.payload.candidates.length<=256&&p.payload.membershipClaims.length<=256&&p.payload.detachedHandles.length<=512&&new TextEncoder().encode(JSON.stringify(p)).length<=65536;}
 function issue(reason){try{onObservationIssue({reason});}catch{/* Diagnostics cannot authorize a retry. */}}
 async function pump(){
  queued=false;if(!live()||busy)return;dirty=false;const run=generation;let p,key;
  try{p=proposal();if(!bounded(p)){issue('host-proposal-too-large');return;}key=JSON.stringify([p.routeEpoch,p.payload]);if(key===last||key===failedKey)return;}catch{return;}
  busy=true;const started=elapsedNow();let attempts=0;
  const finish=reason=>{if(run!==generation)return;if(reason){failedKey=key;issue(reason);}busy=false;if(dirty)schedule();};
  const send=async()=>{
   retryTimer=null;if(run!==generation||!live())return finish('stale-host-binding');
   try{syncRoute();}catch{return;}
   if(elapsedNow()-started>=6000||attempts>=120)return finish('host-observation-retry-budget');attempts++;
   let ack;try{ack=await emit(p);}catch{return finish('host-observation-ack-unknown');}
   if(run!==generation)return;if(!live())return finish('stale-host-binding');
   if(ack?.localSeq!==p.localSeq)return finish('host-observation-ack-unknown');
   if(ack.state==='accepted'||ack.state==='duplicate'){last=key;failedKey='';return finish();}
   if(ack.state==='retry-after'&&Number.isFinite(ack.delayMs)&&ack.delayMs>=0){
    const delay=Math.max(50,ack.delayMs),remaining=6000-(elapsedNow()-started);
    if(delay>=remaining||attempts>=120)return finish('host-observation-retry-budget');
    retryTimer=scheduleRetry(send,delay);return;
   }
   finish(ack.state==='rejected'?'host-observation-rejected':'host-observation-ack-unknown');
  };
  await send();
 }
 function schedule(){if(!live())return;dirty=true;if(busy||queued)return;queued=true;queueMicrotask(pump);}
 function stop(){generation++;if(retryTimer!==null){cancelRetry(retryTimer);retryTimer=null;}stopped=true;observer?.disconnect();observer=null;document.defaultView.removeEventListener('popstate',schedule);document.defaultView.removeEventListener('hashchange',schedule);discovery?.stop();actions=null;dirty=false;queued=false;busy=false;last='';failedKey='';}
 function inspect(){
  const fail=reason=>({ok:false,reason,profileId:profile.id});if(!live())return fail('stale-host-binding');try{syncRoute();}catch{return fail('host-rebind-required');}if(urlPolicy.parse(url).kind==='unsupported')return fail('unsupported-host-route');
  const history=one(profile.regions.history),header=one('main > header'),reading=one('main > section[aria-label="Conversation"]'),composer=one('main > form#composer'),navigationSlot=one('main > header > .navigation-slot');
  if(!history||!header||!reading||!composer||!navigationSlot)return fail('missing-or-ambiguous-native-boundary');
  const protectedRegions=[header,composer];if(protectedRegions.some(n=>reading.contains(n)||history.contains(n))||reading.contains(history)||history.contains(reading))return fail('overlapping-native-boundary');
  if(([...navigationSlot.children].length===0&&navigationSlot.textContent.trim())||[...navigationSlot.children].some(n=>!n.hasAttribute('data-va-owned')&&!n.hasAttribute('data-vaiwl-owned'))||[...(navigationSlot.childNodes??[])].some(n=>n.nodeType===3&&n.textContent.trim()))return fail('native-content-occupies-return-slot');
  const readingRect=rect(reading),sidebarRect=rect(history),returnSlot=rect(navigationSlot),protectedRects=protectedRegions.map(rect);
  if([...Object.values(readingRect),...Object.values(sidebarRect),...Object.values(returnSlot)].some(v=>!Number.isFinite(v))||readingRect.width<=0||readingRect.height<=0||sidebarRect.width<=0||sidebarRect.height<=0||returnSlot.width<34||returnSlot.height<34||protectedRects.some(r=>overlaps(r,readingRect)||overlaps(r,sidebarRect))||overlaps(readingRect,sidebarRect))return fail('unsafe-native-geometry');
  const nodes=[history,header,reading,composer,navigationSlot];if(nodes.some((n,i)=>n!==priorNodes[i])){regionEpoch++;priorNodes=nodes;}
  return {ok:true,reason:null,profileId:profile.id,history,header,reading,navigationSlot,composer,protectedRegions,historyMaskRoots:[history],returnSlot,readingRect,sidebarRect,viewMask:'declarative-css',regionEpoch};
 }
 const api={kind:'chatgpt',async start(options){
  stop();const b=options?.binding;if(!b||typeof options.emit!=='function'||typeof b.documentToken!=='string'||typeof b.producerToken!=='string'||typeof b.browserDocumentId!=='string'||!Number.isSafeInteger(b.routeEpoch)||b.routeEpoch<0||b.origin!==new URL(document.location.href).origin||!Number.isFinite(Date.parse(b.expiresAt))||now()>=Date.parse(b.expiresAt))throw Error('invalid-host-binding');
  binding=Object.freeze({...b});emit=options.emit;epoch=b.routeEpoch;seq=0;url=document.location.href;stopped=false;
  discovery=createSurfaceDiscovery({document,binding,urlPolicy,profile});const actionGeneration=generation;actions=createNativeActions({discovery,urlPolicy,currentURL:()=>document.location.href,bodyProof,inputRisk,authorize:async c=>{if(!live()||actionGeneration!==generation)return false;const allowed=await authorize(c);return live()&&actionGeneration===generation&&allowed===true;},beforeDispatch,now});
  observer=new document.defaultView.MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});document.defaultView.addEventListener('popstate',schedule);document.defaultView.addEventListener('hashchange',schedule);schedule();
  const route=urlPolicy.parse(url),proof=bodyProof();const body=route.kind==='conversation'&&proof?.conversationId===route.conversationId&&typeof proof.bodyProofId==='string'&&Number.isSafeInteger(proof.bodyEpoch)?{state:'bound',proofId:proof.bodyProofId,conversationId:proof.conversationId,bodyEpoch:proof.bodyEpoch}:{state:'unbound',reason:'body-proof-unavailable'};
  return {binding,route,body,capabilities:{'conversation-identity':{state:'partial',profileId:profile.id,reason:'loaded-surfaces-only',evidence:'implementation-only'},'native-navigation':{state:'partial',profileId:profile.id,reason:'owner-authorization-required',evidence:'implementation-only'}}};
 },stop,inspect,hasNativeLayer(){return !!document.querySelector('dialog[open], [aria-modal="true"]');},currentURL:()=>document.location.href,isCurrent:raw=>urlPolicy.sameTarget(document.location.href,raw),nativeHref:raw=>urlPolicy.nativeHref(raw),planNavigation(target,risk){if(!live())return {mode:'unavailable',reason:'stale-host-binding',planRevision:0};try{syncRoute();}catch{return {mode:'unavailable',reason:'host-rebind-required',planRevision:0};}return actions.planNavigation(target,risk);},planKey:plan=>live()?actions.planKey(plan):null,dispatchNative:command=>live()?actions.dispatchNative(command):Promise.resolve({state:'blocked',reason:'stale-host-binding'}),activateNative:async()=>({state:'blocked',reason:'unsupported-native-action'}),async readLoaded(target,signal){if(signal?.aborted)throw Error('aborted');const p=proposal();if(!bounded(p))throw Error('host-proposal-too-large');return [p];},selectedSnippet:()=>null,restoreSnippet:()=>({ok:false,reason:'unsupported-snippet-anchor'}),status(value){const status=publicAdapterStatus(value);document.documentElement.dataset.vaiwlState=status.state;document.documentElement.dataset.vaiwlReason=status.reason??'';}};
 return Object.freeze(api);
}
