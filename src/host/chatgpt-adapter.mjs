import {sha256} from '../data/hash.mjs';
import {splitSurfacePayload} from './surface-fragments.mjs';
import {createNativeInputRisk} from './native-input-risk.mjs';
import {createNativeSendIntentObserver} from './native-send-intent.mjs';
import {createNativeSnippets} from './native-snippets.mjs';
import {createCurrentBodyDiscovery} from './current-body-discovery.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
import {createNativeActions} from './native-actions.mjs';
import {publicAdapterStatus} from './contract.mjs';
const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
/** Isolated-world composition. DOM observations remain proposals, never scope proof. */
export function createChatGPTAdapter({document,urlPolicy=createURLPolicy(),profile=LEGACY_SURFACE_PROFILE,isOwnedMask=()=>false,snippetsFactory=createNativeSnippets,bodyProof=null,inputRisk=null,authorize=()=>false,beforeDispatch=()=>{},onNativeDispatch=()=>{},onNativeDispatchCancelled=()=>{},onRebindNeeded=()=>{},onSurfaceChange=()=>{},onObservationIssue=()=>{},onFirstSendIntent=null,onOldSendOperation=null,now=Date.now,elapsedNow=()=>performance.now(),scheduleRetry=(fn,ms)=>setTimeout(fn,ms),cancelRetry=id=>clearTimeout(id)}={}){
 if(!document?.defaultView)throw Error('invalid-host-document');
 inputRisk=inputRisk??createNativeInputRisk({document,profile});
 let binding=null,emit=null,discovery=null,bodyDiscovery=null,actions=null,observer=null,stopped=true,epoch=0,seq=0,url='',busy=false,dirty=false,queued=false,generation=0,last=new Map(),regionEpoch=0,priorNodes=[],failedKey=new Map(),retryTimer=null,sendObserver=null,acceptedBody=null,snippets=null,snippetReady=()=>false,intents=[],surfaceParts=[],surfaceKey=null,surfaceSequence=null,surfaceWanted=true,surfaceScanning=false,surfaceCursor=null,surfacePage=0,surfacePageKey=null,surfaceEpoch=0,surfaceSnapshotEpoch=0;const surfaceAccepted=new Map(),surfaceFailed=new Map();
 const one=selector=>{const nodes=document.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;};
 const live=()=>!stopped&&now()<Date.parse(binding.expiresAt);
 function acknowledgedBody(){
  if(!live()||!acceptedBody||now()>=Date.parse(acceptedBody.validUntil)||!bodyDiscovery)return null;
  try{syncRoute();if(bodyDiscovery.isPresentationMasked())return null;const body=bodyDiscovery.scan();return body.association==='explicit-body-id'&&JSON.stringify(body)===acceptedBody.fingerprint?body:null;}catch{return null;}
 }
 bodyProof=bodyProof??(()=>{const body=acknowledgedBody();return body&&Number.isSafeInteger(acceptedBody.bodyEpoch)&&acceptedBody.bodyEpoch>=0?{conversationId:body.conversationId,bodyProofId:acceptedBody.proofId,bodyEpoch:acceptedBody.bodyEpoch}:null;});
 function syncRoute(){if(document.location.href!==url){stop();onRebindNeeded({reason:'native-route-changed'});throw Error('host-rebind-required');}}
 function updateBinding(next){
  if(!live())throw Error('stale-host-binding');syncRoute();
  const keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
  if(!next||Object.keys(next).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(key=>next[key]!==binding[key]))throw Error('invalid-host-binding-renewal');
  const expiry=Date.parse(next.expiresAt),time=now();if(!Number.isFinite(expiry)||expiry<=time||expiry>time+20000)throw Error('invalid-host-binding-renewal');
  binding=Object.freeze({...next});last.delete('current-object');failedKey.delete('current-object');requestScan();return true;
 }
 function proposal(page=false){if(!live())throw Error('stale-host-binding');syncRoute();const found=page?discovery.scanPage(surfaceCursor):null,payload=found?found.payload:discovery.scan();if(found){surfaceCursor=found.cursor;surfaceScanning=found.cursor!==null;}return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload};}
 // Private content-side iterator yields bounded packets without aggregating them. This does not fetch unmounted history or authorize any native action.
 async function* loadedPageStream(signal,candidateOnly=false){
  const run=generation,revision=surfaceEpoch,started=elapsedNow();let cursor=null;
  const check=()=>{const elapsed=elapsedNow()-started;if(signal?.aborted||!live()||run!==generation||revision!==surfaceEpoch||!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('stale-host-loaded-read');syncRoute();};
  do{
   check();const found=candidateOnly?discovery.scanCandidatePage(cursor):discovery.scanPage(cursor);cursor=found.cursor;
   const source={protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload:found.payload};
   for(const [index,payload]of splitSurfacePayload(found.payload,source).entries()){
    check();
    yield {...source,localSeq:index?++seq:source.localSeq,payload};
   }
   if(cursor)await new Promise(resolve=>setTimeout(resolve,0));
  }while(cursor);
  check();
 }
 const loadedPages=signal=>loadedPageStream(signal,false);
 const loadedCandidatePages=signal=>loadedPageStream(signal,true);
 function bodyProposal(){if(!live())throw Error('stale-host-binding');syncRoute();if(bodyDiscovery.isPresentationMasked())return null;return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'current-object',payload:bodyDiscovery.scan()};}
 function intentProposal(item){return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:item.proofId,kind:'send-candidate',payload:item.payload};}
 function captureIntent(intent){
  try{if(!live()||!bodyDiscovery||!acceptedBody||now()>=Date.parse(acceptedBody.validUntil))return;syncRoute();if(bodyDiscovery.isPresentationMasked())return null;const body=bodyDiscovery.scan();
   if(JSON.stringify(body)!==acceptedBody.fingerprint)return schedule();
   if(intents.length>=32)return issue('send-intent-capacity');
   if(intent.operation)try{onOldSendOperation?.({bodyProofId:acceptedBody.proofId,intentId:intent.intentId,observedAt:intent.observedAt,...intent.operation});}catch{}
   intents.push({proofId:acceptedBody.proofId,validUntil:acceptedBody.validUntil,payload:{intentId:intent.intentId,conversationId:body.conversationId,messageId:null,operationId:null,stage:'intent',observedAt:intent.observedAt,evidence:{profileId:profile.id,profileVersion:profile.revision,sourceKind:'native-dom',regionEpoch:body.regionEpoch,fieldPaths:['native-send-intent'],receiptId:null}}});schedule();
  }catch{/* Never interfere with the native gesture. */}
 }
 function intentCurrent(item){if(bodyDiscovery?.isPresentationMasked())return false;if(now()>=Date.parse(item.validUntil)||!acceptedBody||acceptedBody.proofId!==item.proofId||!bodyDiscovery)return false;const body=bodyDiscovery.scan();return body.association==='explicit-body-id'&&body.conversationId===item.payload.conversationId&&body.regionEpoch===item.payload.evidence.regionEpoch;}
 function bounded(p){if(p.kind==='send-candidate')return new TextEncoder().encode(JSON.stringify(p)).length<=65536;if(p.kind==='current-object')return p.payload.messageIds.length<=256&&new TextEncoder().encode(JSON.stringify(p)).length<=65536;return p.payload.candidates.length<=256&&p.payload.membershipClaims.length<=256&&p.payload.detachedHandles.length<=512&&new TextEncoder().encode(JSON.stringify(p)).length<=65536;}
 function issue(reason){try{onObservationIssue({reason});}catch{/* Diagnostics cannot authorize a retry. */}}
 async function pump(){
  queued=false;if(!live()||busy)return;if(surfaceEpoch!==surfaceSnapshotEpoch){surfaceParts=[];surfaceScanning=false;surfaceCursor=null;surfaceSnapshotEpoch=surfaceEpoch;}dirty=false;const run=generation;let p,key,intentItem=null;
  try{while(intents.length&&!p){intentItem=intents.shift();if(!intentCurrent(intentItem))continue;p=intentProposal(intentItem);key=JSON.stringify([p.routeEpoch,p.payload]);}for(const candidate of p?[]:[...(bodyDiscovery?[bodyProposal()]:[])]){if(!candidate)continue;if(!bounded(candidate)){issue('host-proposal-too-large');continue;}const fingerprint=JSON.stringify([candidate.routeEpoch,candidate.payload]);if(fingerprint===last.get(candidate.kind)||fingerprint===failedKey.get(candidate.kind))continue;p=candidate;key=fingerprint;break;}
   if(!p){if(!surfaceParts.length&&(surfaceScanning||surfaceWanted)){
     if(!surfaceScanning){surfaceWanted=false;surfaceCursor=null;surfacePage=0;surfaceScanning=true;}
     const source=proposal(true);surfacePageKey=surfacePage++;surfaceSequence=source.localSeq;surfaceKey=sha256(JSON.stringify([source.routeEpoch,{...source.payload,detachedHandles:[]}]));
     if(source.payload.detachedHandles.length||surfaceKey!==surfaceAccepted.get(surfacePageKey)&&surfaceKey!==surfaceFailed.get(surfacePageKey))surfaceParts=splitSurfacePayload(source.payload,source);
     if(!surfaceScanning){for(const cache of [surfaceAccepted,surfaceFailed])for(const index of cache.keys())if(index>=surfacePage)cache.delete(index);}
     if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();
    }
    if(surfaceParts.length){const localSeq=surfaceSequence??++seq;surfaceSequence=null;p={protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload:surfaceParts[0]};key=surfaceKey;}}
if(!p)return;}catch{surfaceScanning=false;surfaceCursor=null;if(surfaceWanted)schedule();return;}
  busy=true;const started=elapsedNow(),proofExpiry=binding.expiresAt;let attempts=0;
  const finish=reason=>{if(run!==generation)return;if(reason){failedKey.set(p.kind,key);if(p.kind==='surface-delta'){surfaceParts=[];surfaceFailed.set(surfacePageKey,key);}dirty=true;issue(reason);}busy=false;if(dirty)schedule();};
  const send=async()=>{
   retryTimer=null;if(run!==generation||!live())return finish('stale-host-binding');
   try{syncRoute();if(p.kind==='send-candidate'&&!intentCurrent(intentItem))return finish('stale-send-intent');}catch{return;}
   if(elapsedNow()-started>=6000||attempts>=120)return finish('host-observation-retry-budget');attempts++;
   let ack;try{ack=await emit(p);}catch{return finish('host-observation-ack-unknown');}
   if(run!==generation)return;if(!live())return finish('stale-host-binding');
   if(ack?.localSeq!==p.localSeq)return finish('host-observation-ack-unknown');
   if(ack.state==='accepted'||ack.state==='duplicate'){if(p.kind==='current-object'){acceptedBody=p.payload.association==='explicit-body-id'&&typeof ack.bodyProofId==='string'?{proofId:ack.bodyProofId,bodyEpoch:ack.bodyEpoch,fingerprint:JSON.stringify(p.payload),validUntil:proofExpiry}:null;}if(p.kind==='surface-delta'){surfaceParts.shift();if(!surfaceParts.length){surfaceAccepted.set(surfacePageKey,key);surfaceFailed.delete(surfacePageKey);}}if(p.kind!=='surface-delta'||!surfaceParts.length)last.set(p.kind,key);failedKey.delete(p.kind);dirty=true;return finish();}
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
 function requestScan(){surfaceEpoch++;surfaceWanted=true;schedule();}
 function mutations(records){if(!live())return;if(bodyDiscovery?.affectsBody(records)||discovery?.affectsSurface(records)){try{onSurfaceChange(records);}catch{/* A failed surrender never authorizes hidden native evidence. */}requestScan();}else schedule();}
 function stop(){generation++;if(retryTimer!==null){cancelRetry(retryTimer);retryTimer=null;}stopped=true;snippets?.stop();snippets=null;snippetReady=()=>false;sendObserver?.stop();sendObserver=null;acceptedBody=null;intents=[];surfaceParts=[];surfaceKey=null;surfaceSequence=null;surfaceWanted=true;surfaceScanning=false;surfaceCursor=null;surfacePage=0;surfacePageKey=null;surfaceAccepted.clear();surfaceFailed.clear();observer?.disconnect();observer=null;document.removeEventListener('toggle',requestScan,true);document.defaultView.removeEventListener('popstate',requestScan);document.defaultView.removeEventListener('hashchange',requestScan);discovery?.stop();bodyDiscovery?.stop();bodyDiscovery=null;actions=null;dirty=false;queued=false;busy=false;last.clear();failedKey.clear();}
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
  discovery=createSurfaceDiscovery({document,binding,urlPolicy,profile,isOwnedMask,elapsedNow});bodyDiscovery=profile.currentBody?createCurrentBodyDiscovery({document,urlPolicy,profile,isOwnedMask}):null;const actionGeneration=generation;actions=createNativeActions({discovery,urlPolicy,currentURL:()=>document.location.href,bodyProof,inputRisk,authorize:async c=>{if(!live()||actionGeneration!==generation)return false;const allowed=await authorize(c);return live()&&actionGeneration===generation&&allowed===true;},beforeDispatch,onNativeDispatch:event=>{if(!live()||actionGeneration!==generation)throw Error('stale-host-binding');const result=onNativeDispatch(event);if(!live()||actionGeneration!==generation)throw Error('stale-host-binding');return result;},onNativeDispatchCancelled,now:elapsedNow});
  const snippetGuard=()=>{if(!live()||actionGeneration!==generation)return false;try{syncRoute();return true;}catch{return false;}};
  const snippetBody=()=>snippetGuard()?acknowledgedBody():null;
  snippetReady=ref=>{const body=snippetBody();return !!body&&body.conversationId===ref?.id;};
  snippets=snippetsFactory({document,urlPolicy,profile,isOwnedMask,guard:snippetGuard,
   current:()=>{const body=snippetBody();return body?{conversationId:body.conversationId,regionEpoch:body.regionEpoch}:null;},
   proof:()=>{const body=snippetBody();return body?{bodyProofId:acceptedBody.proofId,conversationId:body.conversationId,regionEpoch:body.regionEpoch,messageIds:[...body.messageIds]}:null;}});
  sendObserver=profile.sendIntent?createNativeSendIntentObserver({document,profile,onIntent:captureIntent,onFirstIntent:onFirstSendIntent,onPrepare:schedule,now}):null;
  observer=new document.defaultView.MutationObserver(mutations);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});document.addEventListener('toggle',requestScan,true);document.defaultView.addEventListener('popstate',requestScan);document.defaultView.addEventListener('hashchange',requestScan);requestScan();
  const route=urlPolicy.parse(url),proof=bodyProof();const body=route.kind==='conversation'&&proof?.conversationId===route.conversationId&&typeof proof.bodyProofId==='string'&&Number.isSafeInteger(proof.bodyEpoch)?{state:'bound',proofId:proof.bodyProofId,conversationId:proof.conversationId,bodyEpoch:proof.bodyEpoch}:{state:'unbound',reason:'body-proof-unavailable'};
  return {binding,route,body,capabilities:{'conversation-identity':{state:'partial',profileId:profile.id,reason:'loaded-surfaces-only',evidence:'implementation-only'},'native-navigation':{state:'partial',profileId:profile.id,reason:'owner-authorization-required',evidence:'implementation-only'}}};
 },stop,updateBinding,inspect,loadedPages,loadedCandidatePages,retainLoadedHandles(owner,handles,deadline){if(!live())return false;try{syncRoute();return discovery.retainHandles(owner,handles,deadline);}catch{return false;}},releaseLoadedHandles:owner=>discovery?.releaseHandles(owner),resolveLoadedTargets(targets){if(!live())return targets.map(()=>null);try{syncRoute();return discovery.resolveLoadedTargets(targets);}catch{return targets.map(()=>null);}},captureCandidateIdentity(handle){if(!live())return null;try{syncRoute();return discovery.captureCandidateIdentity(handle);}catch{return null;}},matchesCandidateIdentity(token,handle){if(!live())return false;try{syncRoute();return discovery.matchesCandidateIdentity(token,handle);}catch{return false;}},hasNativeLayer(){return !!document.querySelector('dialog[open], [aria-modal="true"]');},currentURL:()=>document.location.href,isCurrent:raw=>urlPolicy.sameTarget(document.location.href,raw),nativeHref:raw=>urlPolicy.nativeHref(raw),planNavigation(target,risk){if(!live())return {mode:'unavailable',reason:'stale-host-binding',planRevision:0};try{syncRoute();}catch{return {mode:'unavailable',reason:'host-rebind-required',planRevision:0};}return actions.planNavigation(target,risk);},planKey:plan=>live()?actions.planKey(plan):null,dispatchNative:command=>live()?actions.dispatchNative(command):Promise.resolve({state:'blocked',reason:'stale-host-binding'}),activateNative:async()=>({state:'blocked',reason:'unsupported-native-action'}),async readLoaded(target,signal){if(signal?.aborted)throw Error('aborted');const p=proposal();return splitSurfacePayload(p.payload,p).map((payload,index)=>({...p,localSeq:index?++seq:p.localSeq,payload}));},snippetReady:ref=>snippetReady(ref),selectionEpoch:ref=>snippets?.selectionEpoch?.(ref)??null,selectedSnippet:ref=>snippets?.selectedSnippet(ref)??null,restoreSnippet:(ref,anchor)=>snippets?.restoreSnippet(ref,anchor)??{ok:false,reason:'unsupported-snippet-anchor'},status(value){const status=publicAdapterStatus(value);document.documentElement.dataset.vaiwlState=status.state;document.documentElement.dataset.vaiwlReason=status.reason??'';}};
 return Object.freeze(api);
}
