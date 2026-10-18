import {nativeReturnGapRect} from './native-return-gap.mjs';
import {nativeHistoryListOK} from './native-history-list.mjs';
import {nativeReturnSlotRect} from './native-return-slot.mjs';
import {currentObservation,currentSurfaceSlice} from './current-observation-batch.mjs';
import {sha256} from '../data/hash.mjs';
import {splitSurfacePayload} from './surface-fragments.mjs';
import {createNativeInputRisk} from './native-input-risk.mjs';
import {createNativeSendIntentObserver} from './native-send-intent.mjs';
import {createNativeSnippets} from './native-snippets.mjs';
import {createCurrentBodyDiscovery} from './current-body-discovery.mjs';
import {createURLPolicy} from './url-policy.mjs';
import {createSurfaceDiscovery,LEGACY_SURFACE_PROFILE} from './surface-discovery.mjs';
import {createNativeActions} from './native-actions.mjs';
import {publicAdapterStatus,exactHostRecord} from './contract.mjs';
const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
// Resolved native identity is its exact URL/ID, not a bounded-cache handle.
// Keep real handles on the wire and in navigation; IDless candidates remain
// handle-identified. Detached handles still force publication below.
const publicationKey=source=>sha256(JSON.stringify([source.routeEpoch,{...source.payload,detachedHandles:[],candidates:source.payload.candidates.map(row=>row.target.kind==='resolved'?{...row,target:{...row.target,liveHandle:null}}:row)}]));
/** Isolated-world composition. DOM observations remain proposals, never scope proof. */
export function createChatGPTAdapter({document,urlPolicy=createURLPolicy(),profile=LEGACY_SURFACE_PROFILE,isOwnedMask=()=>false,withNativeReading=()=>null,priorityConversationId=()=>null,isOwnedSurface=()=>false,snippetsFactory=createNativeSnippets,bodyProof=null,inputRisk=null,authorize=()=>false,beforeDispatch=()=>{},onNativeDispatch=()=>{},onNativeDispatchCancelled=()=>{},onRebindNeeded=()=>{},onSurfaceChange=()=>{},onObservationIssue=()=>{},onIdleHint=()=>{},onFirstSendIntent=null,onOldSendOperation=null,onNativePrepare=null,now=Date.now,elapsedNow=()=>performance.now(),scheduleRetry=(fn,ms)=>setTimeout(fn,ms),cancelRetry=id=>clearTimeout(id)}={}){
 if(!document?.defaultView)throw Error('invalid-host-document');
 const layoutKeys=['header','reading','composer','navigationSlot'];
 const explicitLayout=Object.hasOwn(profile,'nativeLayout');
 const configuredLayout=explicitLayout?profile.nativeLayout:{header:'main > header',reading:'main > section[aria-label="Conversation"]',composer:'main > form#composer',navigationSlot:'main > header > .navigation-slot'};
 for(const key of ['readingViewport','historyList','returnPlacement','returnHitRoot','viewportFocus'])if(configuredLayout&&Object.hasOwn(configuredLayout,key))layoutKeys.push(key);
 if(!exactHostRecord(configuredLayout,layoutKeys)||!layoutKeys.every(k=>typeof configuredLayout[k]==='string'&&configuredLayout[k].trim().length>0&&configuredLayout[k].length<=256))throw Error('invalid-native-layout-profile');
 // Package-owned selectors choose boundaries, never grant authority or relax geometry.
 const nativeLayout=Object.freeze({...configuredLayout});
 if((nativeLayout.returnPlacement!==undefined||nativeLayout.returnHitRoot!==undefined)&&(nativeLayout.returnPlacement!=='header-gap'||!nativeLayout.returnHitRoot))throw Error('invalid-native-return-placement');
 if(nativeLayout.viewportFocus!==undefined&&(nativeLayout.viewportFocus!=='native-scroll-region'||!nativeLayout.readingViewport||nativeLayout.returnPlacement!=='header-gap'))throw Error('invalid-native-layout-profile');
 let returnControl=null;
 const gapMode=nativeLayout.returnPlacement==='header-gap';
 const returnGeometry=(history,header,readingRect,composer,slot)=>gapMode?nativeReturnGapRect({document,header,slot,hitRoot:one(nativeLayout.returnHitRoot),...(nativeLayout.readingViewport?{readingRoot:one(nativeLayout.reading),readingViewport:one(nativeLayout.readingViewport),viewportFocus:nativeLayout.viewportFocus??null,isOwnedMask}:{}),button:returnControl,excluded:[history,composer],excludedRects:[readingRect]}):nativeReturnSlotRect({document,header,slot,excluded:[history,composer],excludedRects:[readingRect]});

 inputRisk=inputRisk??createNativeInputRisk({document,profile});
 let binding=null,emit=null,discovery=null,bodyDiscovery=null,actions=null,observer=null,stopped=true,epoch=0,seq=0,url='',busy=false,dirty=false,queued=false,generation=0,last=new Map(),regionEpoch=0,priorNodes=[],failedKey=new Map(),retryTimer=null,sendObserver=null,acceptedBody=null,snippets=null,snippetReady=()=>false,intents=[],surfaceParts=[],surfaceKey=null,surfaceSequence=null,surfaceWanted=true,surfaceScanning=false,surfaceCursor=null,surfacePage=0,surfacePageKey=null,surfaceEpoch=0,surfaceSnapshotEpoch=0,surfaceRetryWanted=false;const surfaceAccepted=new Map(),surfaceFailed=new Map();
 const terminalWork=new Set();
 let observationOnly=false,observationRAM=null,observationExpiry=null,observationStarted=0,observationLifetime=0,observationRows=[],observationKeys=new Set(),observationCursor=null,observationScanStarted=0,observationScanning=false;
 let ingestionPass=null,pass=null,passSequence=0,cursorRestarts=0,activeWork=0,loadedReads=0,idleRevision=0,nativePrepareAt=null;
 async function track(work){activeWork++;try{return await work();}finally{activeWork--;notifyIdle();}}
 // A revocable observation-readiness snapshot, never a freeze or close permit.
 // Keep native listeners and queues intact so new input invalidates preparation.
 function prepareIdle(){return prepareQuiet(false);}
 function prepareRecovery(){return prepareQuiet(true);}
 function prepareAutomaticIdle(){
  const prepared=prepareIdle();if(!prepared)return null;let invalid=false;
  const deny=()=>{invalid=true;return false;};
  const safe=()=>{if(invalid)return false;try{
   if(!prepared.isCurrent()||inputRisk()?.state!=='clear')return deny();
   const active=document.activeElement;
   if(active?.closest?.('input,textarea,select,button,[contenteditable],[role="textbox"]')||document.querySelector('dialog[open], [aria-modal="true"]'))return deny();
   return prepared.isCurrent()||deny();
  }catch{return deny();}};
  return safe()?Object.freeze({isCurrent:safe}):null;
 }
 function notifyIdle(){if(prepareIdle())try{onIdleHint();}catch{/* A hint never changes producer authority. */}}

 function prepareQuiet(recovery){
  const quiet=()=> !observationOnly&&(recovery?!stopped:live())&&document.location.href===url&&!busy&&!dirty&&!queued&&retryTimer===null&&!intents.length&&!surfaceParts.length&&!surfaceWanted&&!surfaceScanning&&(!pass||pass.terminal)&&activeWork===0&&loadedReads===0;
  if(!quiet())return null;
  const revision=idleRevision,sequence=seq,run=generation,priorBinding=binding;
  return Object.freeze({isCurrent:()=>revision===idleRevision&&sequence===seq&&run===generation&&priorBinding===binding&&quiet()});
 }
 // A pass brackets the finite private traversal (including its initial body
 // packet), never an individual transaction gap or a completeness assertion.
 const passMessage=(entry,phase)=>({passSeq:entry.seq,phase,profileId:profile.id,profileVersion:profile.revision});
 function finishPass(phase,retain=false){
  const entry=pass;if(!entry)return;
  if(!retain)pass=null;
  if(entry.terminal)return;entry.terminal=true;
  // Keep terminal transport observable to stop(), including repeated stops.
  // Ordinary callers may ignore this fulfilled promise without rejection leaks.
  const pending=track(()=>entry.notify(passMessage(entry,phase))).then(reply=>reply?.ok===true,()=>false);
  terminalWork.add(pending);void pending.then(()=>terminalWork.delete(pending));
 }
 async function beginPass(){
  if(!ingestionPass||pass)return;
  const run=generation,entry={seq:++passSequence,notify:ingestionPass,terminal:false};pass=entry;
  try{const reply=await track(()=>entry.notify(passMessage(entry,'start')));if(run!==generation||!live()||pass!==entry||entry.terminal)return;if(reply?.ok!==true){finishPass('cancel',true);issue('host-ingestion-pass-unavailable');}}
  catch{if(pass===entry){finishPass('cancel',true);issue('host-ingestion-pass-unavailable');}}
 }
 const one=selector=>{try{const nodes=document.querySelectorAll(selector);return nodes.length===1?nodes[0]:null;}catch{return null;}};
 const live=()=>!stopped&&now()<Date.parse(binding.expiresAt);
 const active=()=>live()&&!observationOnly;
 function observationCurrent(){
  const elapsed=elapsedNow()-observationStarted;
  if(!observationOnly||!live()||document.location.href!==url||!Number.isFinite(elapsed)||elapsed<0||elapsed>=observationLifetime){if(observationOnly)stop();return false;}return true;
 }
 // One replaceable current-surface snapshot, never an ingestion queue. The
 // existing finite DOM cursor yields between bounded batches; container-heavy
 // first pages are not mistaken for an empty directory. No completeness/NONE.
 function observeCurrent(){
  if(!observationCurrent())return;
  const run=generation;
  try{
   if(surfaceWanted){observationRows=[];observationKeys.clear();observationCursor=null;observationScanStarted=elapsedNow();observationScanning=true;surfaceWanted=false;}
   const elapsed=elapsedNow()-observationScanStarted;
   if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)observationScanning=false;
   if(observationScanning){
    const page=discovery.scanPage(observationCursor);observationCursor=page.cursor;
    for(const row of page.payload.candidates){if(observationRows.length>=256)break;if(!observationKeys.has(row.renderKey)){observationKeys.add(row.renderKey);observationRows.push(row);}}
    observationScanning=!!observationCursor&&observationRows.length<256;
   }
   const body=bodyDiscovery?.scan()??null,candidates=observationRows,messageIds=(body?.messageIds??[]).slice(0,256-candidates.length);
   const snapshot={route:urlPolicy.parse(url),candidates,body:body?{conversationId:body.conversationId,association:body.association,messageIds}:null};
   let encoded=JSON.stringify(snapshot);
   while(new TextEncoder().encode(encoded).length>65536&&(candidates.length||messageIds.length)){if(candidates.length)candidates.pop();else messageIds.pop();observationScanning=false;encoded=JSON.stringify(snapshot);}
   if(run!==generation||!observationCurrent())return;
   observationRAM={encoded,bytes:new TextEncoder().encode(encoded).length,candidates:candidates.length,messageIds:messageIds.length};
   if(observationScanning&&retryTimer===null)retryTimer=scheduleRetry(()=>{if(run!==generation)return;retryTimer=null;schedule();},0);
  }catch{if(run===generation){observationRAM=null;observationRows=[];observationKeys.clear();observationCursor=null;observationScanning=false;}}
 }
 function observationStatus(){return observationCurrent()?{state:'observing',candidates:observationRAM?.candidates??0,messageIds:observationRAM?.messageIds??0,bytes:observationRAM?.bytes??0}:{state:'stopped',candidates:0,messageIds:0,bytes:0};}
 function listen(){observer=new document.defaultView.MutationObserver(mutations);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});document.addEventListener('toggle',surfaceToggle,true);document.addEventListener('visibilitychange',visibilityChanged);document.addEventListener('focusout',schedule,true);document.defaultView.addEventListener('popstate',requestScan);document.defaultView.addEventListener('hashchange',requestScan);requestScan(true);}

 function acknowledgedBody(allowReadingProbe=false){
  if(!live()||!acceptedBody||now()>=Date.parse(acceptedBody.validUntil)||!bodyDiscovery)return null;
  try{
   syncRoute();const accepted=acceptedBody,run=generation;
   const scan=()=>{const body=bodyDiscovery.scan();return body.association==='explicit-body-id'&&JSON.stringify(body)===accepted.fingerprint?body:null;};
   const body=bodyDiscovery.isPresentationMasked()?(allowReadingProbe?withNativeReading(scan):null):scan();
   return live()&&run===generation&&acceptedBody===accepted&&now()<Date.parse(accepted.validUntil)?body:null;
  }catch{return null;}
 }
 bodyProof=bodyProof??(()=>{const body=acknowledgedBody(true);return body&&Number.isSafeInteger(acceptedBody.bodyEpoch)&&acceptedBody.bodyEpoch>=0?{conversationId:body.conversationId,bodyProofId:acceptedBody.proofId,bodyEpoch:acceptedBody.bodyEpoch}:null;});
 function syncRoute(){if(document.location.href!==url){stop();onRebindNeeded({reason:'native-route-changed'});throw Error('host-rebind-required');}}
 function updateBinding(next){
  if(!active())throw Error('stale-host-binding');syncRoute();
  const keys=['documentToken','producerToken','browserDocumentId','routeEpoch','origin'];
  if(!next||Object.keys(next).sort().join(',')!==[...keys,'expiresAt'].sort().join(',')||keys.some(key=>next[key]!==binding[key]))throw Error('invalid-host-binding-renewal');
  const expiry=Date.parse(next.expiresAt),time=now();if(!Number.isFinite(expiry)||expiry<=time||expiry>time+20000)throw Error('invalid-host-binding-renewal');
  binding=Object.freeze({...next});last.delete('current-object');failedKey.delete('current-object');requestScan(true,true);return true;
 }
 function proposal(page=false){if(!live())throw Error('stale-host-binding');syncRoute();const found=page?discovery.scanPage(surfaceCursor):null,payload=found?found.payload:discovery.scan();if(found){surfaceCursor=found.cursor;surfaceScanning=found.cursor!==null;}return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload};}
 // Private content-side iterator yields bounded packets without aggregating them. This does not fetch unmounted history or authorize any native action.
 async function* loadedPageStream(signal,candidateOnly=false){
  loadedReads++;idleRevision++;try{
  const run=generation,revision=surfaceEpoch,started=elapsedNow();let cursor=null;
  const check=()=>{const elapsed=elapsedNow()-started;if(signal?.aborted||!active()||run!==generation||revision!==surfaceEpoch||!Number.isFinite(elapsed)||elapsed<0||elapsed>=6000)throw Error('stale-host-loaded-read');syncRoute();};
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
  }finally{loadedReads--;}
 }
 const loadedPages=signal=>loadedPageStream(signal,false);
 const loadedCandidatePages=signal=>loadedPageStream(signal,true);
 function bodyProposal(){if(!live())throw Error('stale-host-binding');syncRoute();if(bodyDiscovery.isPresentationMasked())return null;return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'current-object',payload:bodyDiscovery.scan()};}
 function intentProposal(item){return {protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq:++seq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:item.proofId,kind:'send-candidate',payload:item.payload};}
 // Trusted native preparation can retry a partial metadata baseline without
 // changing the body proof. The worker retains its per-proof/shared read budgets.
 function prepareNativeBody(run){
  if(!live()||run!==generation||busy||!last.has('current-object'))return;
  if(!acknowledgedBody())return;
  const at=elapsedNow();
  if(!Number.isFinite(at)||at<0||nativePrepareAt!==null&&at-nativePrepareAt<1000)return;
  // DOM/clock hooks may synchronously retire this adapter while checking readiness.
  if(!live()||run!==generation||busy)return;
  nativePrepareAt=at;last.delete('current-object');
 }
 function captureIntent(intent,producer=binding){
  if(producer.producerToken!==binding?.producerToken)return;
  idleRevision++;
  try{if(!live()||!bodyDiscovery||!acceptedBody||now()>=Date.parse(acceptedBody.validUntil))return;syncRoute();if(bodyDiscovery.isPresentationMasked())return null;const body=bodyDiscovery.scan();
   if(JSON.stringify(body)!==acceptedBody.fingerprint)return schedule();
   if(intents.length>=32)return issue('send-intent-capacity');
   if(intent.operation)try{onOldSendOperation?.({bodyProofId:acceptedBody.proofId,intentId:intent.intentId,observedAt:intent.observedAt,...intent.operation},producer);}catch{}
   intents.push({proofId:acceptedBody.proofId,validUntil:acceptedBody.validUntil,payload:{intentId:intent.intentId,conversationId:body.conversationId,messageId:null,operationId:null,stage:'intent',observedAt:intent.observedAt,evidence:{profileId:profile.id,profileVersion:profile.revision,sourceKind:'native-dom',regionEpoch:body.regionEpoch,fieldPaths:['native-send-intent'],receiptId:null}}});schedule();
  }catch{/* Never interfere with the native gesture. */}
 }
 function intentCurrent(item){if(bodyDiscovery?.isPresentationMasked())return false;if(now()>=Date.parse(item.validUntil)||!acceptedBody||acceptedBody.proofId!==item.proofId||!bodyDiscovery)return false;const body=bodyDiscovery.scan();return body.association==='explicit-body-id'&&body.conversationId===item.payload.conversationId&&body.regionEpoch===item.payload.evidence.regionEpoch;}
 function bounded(p){if(p.kind==='send-candidate')return new TextEncoder().encode(JSON.stringify(p)).length<=65536;if(p.kind==='current-object')return p.payload.messageIds.length<=256&&new TextEncoder().encode(JSON.stringify(p)).length<=65536;return p.payload.candidates.length<=256&&p.payload.membershipClaims.length<=256&&p.payload.detachedHandles.length<=512&&new TextEncoder().encode(JSON.stringify(p)).length<=65536;}
 function issue(reason){try{onObservationIssue({reason});}catch{/* Diagnostics cannot authorize a retry. */}}
 async function pump(){
  queued=false;if(observationOnly){dirty=false;observeCurrent();return;}if(!live()||busy)return;if(surfaceRetryWanted){surfaceFailed.clear();surfaceRetryWanted=false;}if(surfaceEpoch!==surfaceSnapshotEpoch){pass=null;surfaceParts=[];surfaceScanning=false;surfaceCursor=null;surfaceSnapshotEpoch=surfaceEpoch;}dirty=false;const run=generation;let p,key,intentItem=null;
  if(ingestionPass&&!pass&&(surfaceScanning||surfaceWanted)){busy=true;await beginPass();if(run!==generation)return;busy=false;if(!live())return;if(surfaceEpoch!==surfaceSnapshotEpoch){schedule();return;}}
  try{while(intents.length&&!p){intentItem=intents.shift();if(!intentCurrent(intentItem))continue;p=intentProposal(intentItem);key=JSON.stringify([p.routeEpoch,p.payload]);}for(const candidate of p?[]:[...(bodyDiscovery?[bodyProposal()]:[])]){if(!candidate)continue;if(!bounded(candidate)){issue('host-proposal-too-large');continue;}const fingerprint=JSON.stringify([candidate.routeEpoch,candidate.payload]);if(fingerprint===last.get(candidate.kind)||fingerprint===failedKey.get(candidate.kind))continue;try{p=currentObservation(candidate,currentSurfaceSlice(discovery.scan(),candidate.payload.conversationId));}catch{failedKey.set(candidate.kind,fingerprint);issue('host-proposal-too-large');continue;}key=fingerprint;break;}
   if(!p){
    // Yield directory work from background documents without discarding its
    // cursor or renewing the registered pass. Current-body/send remain eligible.
    if(document.visibilityState==='hidden')return;
    if(!surfaceParts.length&&(surfaceScanning||surfaceWanted)){
     if(!surfaceScanning){surfaceWanted=false;surfaceCursor=null;surfacePage=0;surfaceScanning=true;}
     const source=proposal(true);surfacePageKey=surfacePage++;surfaceSequence=source.localSeq;surfaceKey=publicationKey(source);
     // Retain the initial empty-surface handshake; only continuation pages
     // without facts or detached handles can drain locally.
     const hasObservation=surfacePageKey===0||source.payload.candidates.length||source.payload.membershipClaims.length||source.payload.detachedHandles.length;
     if(hasObservation&&(source.payload.detachedHandles.length||surfaceKey!==surfaceAccepted.get(surfacePageKey)&&surfaceKey!==surfaceFailed.get(surfacePageKey)))surfaceParts=splitSurfacePayload(source.payload,source);
     if(!surfaceScanning){for(const cache of [surfaceAccepted,surfaceFailed])for(const index of cache.keys())if(index>=surfacePage)cache.delete(index);}
     if(!surfaceParts.length&&!surfaceScanning)finishPass('end');if(!surfaceParts.length&&(surfaceScanning||surfaceWanted))schedule();
    }
    if(surfaceParts.length){const localSeq=surfaceSequence??++seq;surfaceSequence=null;p={protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,localSeq,routeEpoch:epoch,profileId:profile.id,profileVersion:profile.revision,bodyProofId:null,kind:'surface-delta',payload:surfaceParts[0]};key=surfaceKey;}}
if(!p){notifyIdle();return;}}catch(error){
   if(run!==generation)return;
   const restart=error?.message==='stale-surface-cursor'&&cursorRestarts<1&&live()&&document.location.href===url;
   surfaceParts=[];surfaceSequence=null;surfaceScanning=false;surfaceCursor=null;
   if(restart){
    // Replace the pending pass atomically; a cancel/start gap would falsely
    // advertise a drained directory. Never reuse the rejected cursor.
    cursorRestarts++;pass=null;surfaceWanted=true;schedule();
   }else{finishPass('cancel');if(surfaceWanted)schedule();}
   return;
  }
  busy=true;const started=elapsedNow(),proofExpiry=binding.expiresAt;let attempts=0;
  const finish=reason=>{if(run!==generation)return;if(reason){finishPass('cancel',true);failedKey.set(p.kind==='current-observation'?'current-object':p.kind,key);if(p.kind==='surface-delta'){surfaceParts=[];surfaceFailed.set(surfacePageKey,key);}dirty=true;issue(reason);}busy=false;if(dirty)schedule();};
  const send=async()=>{
   retryTimer=null;if(run!==generation||!live())return finish('stale-host-binding');
   try{syncRoute();if(p.kind==='send-candidate'&&!intentCurrent(intentItem))return finish('stale-send-intent');}catch{return;}
   if(elapsedNow()-started>=6000||attempts>=120)return finish('host-observation-retry-budget');attempts++;
   let ack;try{ack=await track(()=>emit(p));}catch{return finish('host-observation-ack-unknown');}
   if(run!==generation)return;if(!live())return finish('stale-host-binding');
   if(ack?.localSeq!==p.localSeq)return finish('host-observation-ack-unknown');
   if(ack.state==='accepted'||ack.state==='duplicate'){if(p.kind==='current-object'||p.kind==='current-observation'){const body=p.kind==='current-observation'?p.payload.body:p.payload;acceptedBody=body.association==='explicit-body-id'&&typeof ack.bodyProofId==='string'?{proofId:ack.bodyProofId,bodyEpoch:ack.bodyEpoch,fingerprint:JSON.stringify(body),validUntil:proofExpiry}:null;}if(p.kind==='surface-delta'){surfaceParts.shift();if(!surfaceParts.length&&!surfaceScanning&&surfaceEpoch===surfaceSnapshotEpoch)finishPass('end');if(!surfaceParts.length){surfaceAccepted.set(surfacePageKey,key);surfaceFailed.delete(surfacePageKey);}}if(p.kind!=='surface-delta'||!surfaceParts.length)last.set(p.kind==='current-observation'?'current-object':p.kind,key);failedKey.delete(p.kind==='current-observation'?'current-object':p.kind);dirty=true;return finish();}
   if(ack.state==='retry-after'&&Number.isFinite(ack.delayMs)&&ack.delayMs>=0){
    const delay=Math.max(50,ack.delayMs),remaining=6000-(elapsedNow()-started);
    if(delay>=remaining||attempts>=120)return finish('host-observation-retry-budget');
    retryTimer=scheduleRetry(send,delay);return;
   }
   finish(ack.state==='rejected'?'host-observation-rejected':'host-observation-ack-unknown');
  };
  await send();
 }
 function schedule(){idleRevision++;if(!live())return;dirty=true;if(busy||queued)return;queued=true;const run=generation;queueMicrotask(()=>{if(run===generation)void pump();});}
 function requestScan(preserveProducerCursor=false,retryFailures=false){
  if(observationOnly){observationRAM=null;observationRows=[];observationKeys.clear();observationCursor=null;observationScanning=false;surfaceWanted=true;if(retryTimer!==null){cancelRetry(retryTimer);retryTimer=null;}schedule();return;}
  if(preserveProducerCursor!==true)cursorRestarts=0;
  // Same-identity renewal invalidates independent loaded reads, but must not
  // starve the private finite directory pass. Never consume a pending real DOM
  // invalidation: that pass still resets before its next bounded packet.
  const preserve=preserveProducerCursor===true&&surfaceEpoch===surfaceSnapshotEpoch;
  const continuing=preserve&&(surfaceScanning||surfaceParts.length>0);
  // A real restart replaces the registered pass atomically with a higher
  // sequence at the next pump; cancelling here would expose a false drain gap.
  surfaceEpoch++;if(preserve)surfaceSnapshotEpoch=surfaceEpoch;
  // The active pass is already fresh observation; renewal alone must not queue
  // another full pass behind it. Preserve any separately requested real scan.
  // Suppress exhausted packets only for their current finite attempt. A later
  // independent full read must be able to recover unchanged missing fragments;
  // successful pages remain deduplicated and an active cursor keeps its budget.
  if(!continuing){surfaceWanted=true;if(retryFailures)surfaceRetryWanted=true;}schedule();
 }
 function visibilityChanged(){if(document.visibilityState!=='hidden')schedule();}
 function surfaceToggle(event){
  // Only an exact live mount node may preserve the finite directory cursor.
  // Recheck body visibility and invalidate external reads even for our masks.
  let owned=false;try{owned=!!event?.target&&isOwnedSurface(event.target)===true;}catch{}
  if(owned&&surfaceEpoch===surfaceSnapshotEpoch&&surfaceCursor)discovery?.preservePresentationCursor(surfaceCursor);
  requestScan(owned,true);
 }
 function mutations(records){
  if(!live())return;
  const bodyChanged=bodyDiscovery?.affectsBody(records),surfaceChanged=discovery?.affectsSurface(records);
  if(bodyChanged||surfaceChanged)try{onSurfaceChange(records);}catch{/* A failed surrender never authorizes hidden native evidence. */}
  // Body-only streaming still rechecks identity and visibility, but cannot discard
  // an unrelated directory cursor or its pending bounded fragments.
  if(surfaceChanged)requestScan();else schedule();
 }
 function stop(){if(observationExpiry!==null){cancelRetry(observationExpiry);observationExpiry=null;}observationRAM=null;observationRows=[];observationKeys.clear();observationCursor=null;observationScanning=false;observationOnly=false;surfaceRetryWanted=false;nativePrepareAt=null;idleRevision++;finishPass('cancel');ingestionPass=null;generation++;if(retryTimer!==null){cancelRetry(retryTimer);retryTimer=null;}stopped=true;snippets?.stop();snippets=null;snippetReady=()=>false;sendObserver?.stop();sendObserver=null;acceptedBody=null;intents=[];surfaceParts=[];surfaceKey=null;surfaceSequence=null;surfaceWanted=true;surfaceScanning=false;surfaceCursor=null;surfacePage=0;surfacePageKey=null;surfaceAccepted.clear();surfaceFailed.clear();observer?.disconnect();observer=null;document.removeEventListener('toggle',surfaceToggle,true);document.removeEventListener('visibilitychange',visibilityChanged);document.removeEventListener('focusout',schedule,true);document.defaultView.removeEventListener('popstate',requestScan);document.defaultView.removeEventListener('hashchange',requestScan);discovery?.stop();bodyDiscovery?.stop();bodyDiscovery=null;actions=null;dirty=false;queued=false;busy=false;last.clear();failedKey.clear();return Promise.all([...terminalWork]).then(results=>results.every(Boolean));}
 function historyListCurrent(history,inspection=null){
  if(!nativeLayout.historyList)return true;
  const source=one(profile.regions.history);
  return (!inspection||source===inspection.historySource)&&nativeHistoryListOK({document,source,root:history,urlPolicy,isOwnedMask});
 }
 function nativeTopologyOK(history,header,reading,composer,slot){return !explicitLayout||header!==slot&&header.contains(slot)&&![history,reading,composer].some(node=>node===slot||node.contains(slot));}
 // A scroll container is geometry only, never a mask root. This profile is
 // deliberately limited to two direct branches: reading and protected footer.
 function viewportTopologyOK(viewport,history,header,reading,composer){
  return !!viewport&&viewport.isConnected&&viewport.ownerDocument===document&&viewport!==reading&&viewport!==composer&&[reading,composer].every(n=>n.isConnected&&n.ownerDocument===document&&n.parentElement===viewport)&&viewport.children.length===2&&![...(viewport.childNodes??[])].some(n=>n.nodeType===3&&n.textContent.trim())&&[...viewport.children].every(n=>n===reading||n===composer)&&!viewport.contains(header)&&!viewport.contains(history);
 }
 function viewportRect(viewport,header,composer){
  const v=rect(viewport),h=rect(header),c=rect(composer),width=document.defaultView.innerWidth,height=document.defaultView.innerHeight;
  const visual=document.defaultView.visualViewport;
  if(visual&&(visual.scale!==1||visual.offsetLeft!==0||visual.offsetTop!==0))return null;
  if(![...Object.values(v),...Object.values(h),...Object.values(c),width,height].every(Number.isFinite)||width<=0||height<=0||v.width<=0||v.height<=0||h.height<=0||c.width<=0||c.height<=0||c.x>=v.x+v.width||c.x+c.width<=v.x||c.y<v.y||c.y>=v.y+v.height)return null;
  const x=Math.max(0,v.x),y=Math.max(0,v.y,h.y+h.height),right=Math.min(width,v.x+v.width),bottom=Math.min(height,v.y+v.height,c.y);
  return {x,y,width:right-x,height:bottom-y};
 }
 function isReturnSlotCurrent(inspection){
  // Dormant presentation may recheck native geometry, but cannot revive binding.
  if(!explicitLayout)return true;
  if(!inspection||document.location.href!==url||gapMode&&one(nativeLayout.returnHitRoot)!==inspection.returnHitRoot)return false;
  const history=one(nativeLayout.historyList??profile.regions.history),header=one(nativeLayout.header),reading=one(nativeLayout.reading),composer=one(nativeLayout.composer),slot=one(nativeLayout.navigationSlot);
  if(!historyListCurrent(history,inspection)||history!==inspection.history||header!==inspection.header||reading!==inspection.reading||composer!==inspection.composer||slot!==inspection.navigationSlot||!nativeTopologyOK(history,header,reading,composer,slot))return false;
  const viewport=nativeLayout.readingViewport?one(nativeLayout.readingViewport):null;
  if(nativeLayout.readingViewport&&(viewport!==inspection.readingViewport||!viewportTopologyOK(viewport,history,header,reading,composer)))return false;
  const readingRect=viewport?viewportRect(viewport,header,composer):rect(reading);
  return !!readingRect&&!!returnGeometry(history,header,readingRect,composer,slot);
 }
 function isSameNativeRegions(inspection){
  if(!live()||document.location.href!==url||inspection?.regionEpoch!==regionEpoch)return false;
  const nodes=[one(nativeLayout.historyList??profile.regions.history),one(nativeLayout.header),one(nativeLayout.reading),one(nativeLayout.composer),one(nativeLayout.navigationSlot)];
  const original=[inspection.history,inspection.header,inspection.reading,inspection.composer,inspection.navigationSlot];
  const viewport=nativeLayout.readingViewport?one(nativeLayout.readingViewport):null;
  return nodes.every((node,i)=>node&&node===original[i]&&node===priorNodes[i]&&node.isConnected&&node.ownerDocument===document)&&(!gapMode||one(nativeLayout.returnHitRoot)===inspection.returnHitRoot)&&historyListCurrent(nodes[0],inspection)&&nativeTopologyOK(...nodes)&&(!nativeLayout.readingViewport||viewport===inspection.readingViewport&&viewport===priorNodes[5]&&viewportTopologyOK(viewport,...nodes));
 }
 function inspect(){
  const fail=reason=>({ok:false,reason,profileId:profile.id});if(!active())return fail('stale-host-binding');try{syncRoute();}catch{return fail('host-rebind-required');}if(urlPolicy.parse(url).kind==='unsupported')return fail('unsupported-host-route');
  const history=one(nativeLayout.historyList??profile.regions.history),header=one(nativeLayout.header),reading=one(nativeLayout.reading),composer=one(nativeLayout.composer),navigationSlot=one(nativeLayout.navigationSlot);
  if(!history||!header||!reading||!composer||!navigationSlot)return fail('missing-or-ambiguous-native-boundary');
  if(!historyListCurrent(history))return fail('unsafe-native-history-list');
  const historySource=nativeLayout.historyList?one(profile.regions.history):null;
  if(!nativeTopologyOK(history,header,reading,composer,navigationSlot))return fail('return-slot-outside-native-header');
  const readingViewport=nativeLayout.readingViewport?one(nativeLayout.readingViewport):null;
  if(nativeLayout.readingViewport&&!viewportTopologyOK(readingViewport,history,header,reading,composer))return fail('unsafe-native-reading-viewport');
  const protectedRegions=[header,composer];if(protectedRegions.some(n=>reading.contains(n)||history.contains(n))||reading.contains(history)||history.contains(reading))return fail('overlapping-native-boundary');
  if(!gapMode&&(([...navigationSlot.children].length===0&&navigationSlot.textContent.trim())||[...navigationSlot.children].some(n=>!n.hasAttribute('data-va-owned')&&!n.hasAttribute('data-vaiwl-owned'))||[...(navigationSlot.childNodes??[])].some(n=>n.nodeType===3&&n.textContent.trim())))return fail('native-content-occupies-return-slot');
  const readingRect=readingViewport?viewportRect(readingViewport,header,composer):rect(reading),sidebarRect=rect(history),returnSlot=gapMode?returnGeometry(history,header,readingRect,composer,navigationSlot):rect(navigationSlot),protectedRects=protectedRegions.map(rect);
  if(!readingRect||!returnSlot||explicitLayout&&!returnGeometry(history,header,readingRect,composer,navigationSlot))return fail('unsafe-native-geometry');
  if([...Object.values(readingRect),...Object.values(sidebarRect),...Object.values(returnSlot),...protectedRects.flatMap(Object.values)].some(v=>!Number.isFinite(v))||readingRect.width<=0||readingRect.height<=0||sidebarRect.width<=0||sidebarRect.height<=0||returnSlot.width<34||returnSlot.height<34||protectedRects.some(r=>overlaps(r,readingRect)||overlaps(r,sidebarRect))||overlaps(readingRect,sidebarRect))return fail('unsafe-native-geometry');
  const nodes=[history,header,reading,composer,navigationSlot,readingViewport,historySource,gapMode?one(nativeLayout.returnHitRoot):null];if(nodes.some((n,i)=>n!==priorNodes[i])){regionEpoch++;priorNodes=nodes;}
  return {ok:true,reason:null,profileId:profile.id,history,...(historySource?{historySource}:{}),header,reading,navigationSlot,composer,protectedRegions,...(readingViewport?{readingViewport}:{}),historyMaskRoots:[history],...(gapMode?{returnPlacement:'header-gap',returnHitRoot:one(nativeLayout.returnHitRoot)}:{}),returnSlot,readingRect,sidebarRect,viewMask:'declarative-css',regionEpoch};
 }
 const api={setReturnControl(node){returnControl=node;},getReturnControlRect(inspection){
  if(!isReturnSlotCurrent(inspection))return null;
  const {history,header,reading,composer,navigationSlot:slot,readingViewport:viewport}=inspection;
  const readingRect=viewport?viewportRect(viewport,header,composer):rect(reading);
  return readingRect?returnGeometry(history,header,readingRect,composer,slot):null;
 },isReturnSlotCurrent,kind:'chatgpt',async start(options){
  stop();cursorRestarts=0;const b=options?.binding,observing=options?.phase==='observation';if(options?.phase!==undefined&&!observing)throw Error('invalid-adapter-phase');if(!b||!observing&&typeof options.emit!=='function'||typeof b.documentToken!=='string'||typeof b.producerToken!=='string'||typeof b.browserDocumentId!=='string'||!Number.isSafeInteger(b.routeEpoch)||b.routeEpoch<0||b.origin!==new URL(document.location.href).origin||!Number.isFinite(Date.parse(b.expiresAt))||now()>=Date.parse(b.expiresAt))throw Error('invalid-host-binding');
  binding=Object.freeze({...b});observationOnly=observing;emit=observing?null:options.emit;ingestionPass=!observing&&typeof options.ingestionPass==='function'?options.ingestionPass:null;epoch=b.routeEpoch;seq=0;surfaceSnapshotEpoch=surfaceEpoch;url=document.location.href;stopped=false;
  discovery=createSurfaceDiscovery({document,binding,urlPolicy,profile,isOwnedMask,priorityConversationId,retainControls:!observing,elapsedNow});bodyDiscovery=profile.currentBody?createCurrentBodyDiscovery({document,urlPolicy,profile,isOwnedMask}):null;
  if(observing){
   observationStarted=elapsedNow();observationLifetime=Date.parse(b.expiresAt)-now();
   if(!Number.isFinite(observationStarted)||observationLifetime<=0||observationLifetime>20000){stop();throw Error('invalid-host-binding');}
   const run=generation;observationExpiry=scheduleRetry(()=>{if(run===generation)stop();},observationLifetime);
   listen();return {binding,route:urlPolicy.parse(url),body:{state:'unbound',reason:'body-proof-unavailable'},capabilities:{}};
  }
  const actionGeneration=generation;actions=createNativeActions({discovery,urlPolicy,currentURL:()=>document.location.href,bodyProof,inputRisk,authorize:async c=>{if(!live()||actionGeneration!==generation)return false;const allowed=await authorize(c);return live()&&actionGeneration===generation&&allowed===true;},beforeDispatch,onNativeDispatch:event=>{if(!live()||actionGeneration!==generation)throw Error('stale-host-binding');const result=onNativeDispatch(event);if(!live()||actionGeneration!==generation)throw Error('stale-host-binding');return result;},onNativeDispatchCancelled,now:elapsedNow});
  const snippetGuard=()=>{if(!live()||actionGeneration!==generation)return false;try{syncRoute();return true;}catch{return false;}};
  const snippetBody=()=>snippetGuard()?acknowledgedBody():null;
  snippetReady=ref=>{const body=snippetBody();return !!body&&body.conversationId===ref?.id;};
  snippets=snippetsFactory({document,urlPolicy,profile,isOwnedMask,guard:snippetGuard,
   current:()=>{const body=snippetBody();return body?{conversationId:body.conversationId,regionEpoch:body.regionEpoch}:null;},
   proof:()=>{const body=snippetBody();return body?{bodyProofId:acceptedBody.proofId,conversationId:body.conversationId,regionEpoch:body.regionEpoch,messageIds:[...body.messageIds]}:null;}});
  sendObserver=profile.sendIntent?createNativeSendIntentObserver({document,profile,onIntent:intent=>captureIntent(intent,b),onFirstIntent:typeof onFirstSendIntent==='function'?intent=>{idleRevision++;return onFirstSendIntent(intent,b);}:onFirstSendIntent,onPrepare:()=>{if(stopped||actionGeneration!==generation||document.location.href!==url)return;let recovering=false;try{recovering=onNativePrepare?.(b)===true;}catch{/* Preparation never blocks the native gesture. */}if(!stopped&&actionGeneration===generation&&!recovering){prepareNativeBody(actionGeneration);if(!stopped&&actionGeneration===generation)schedule();}},now}):null;
  if(ingestionPass){await beginPass();if(actionGeneration!==generation||!live())throw Error('stale-host-binding');}
  listen();
  const route=urlPolicy.parse(url),proof=bodyProof();const body=route.kind==='conversation'&&proof?.conversationId===route.conversationId&&typeof proof.bodyProofId==='string'&&Number.isSafeInteger(proof.bodyEpoch)?{state:'bound',proofId:proof.bodyProofId,conversationId:proof.conversationId,bodyEpoch:proof.bodyEpoch}:{state:'unbound',reason:'body-proof-unavailable'};
  return {binding,route,body,capabilities:{'conversation-identity':{state:'partial',profileId:profile.id,reason:'loaded-surfaces-only',evidence:'implementation-only'},'native-navigation':{state:'partial',profileId:profile.id,reason:'owner-authorization-required',evidence:'implementation-only'}}};
 },observationStatus,prepareIdle,prepareAutomaticIdle,prepareRecovery,stop,updateBinding,inspect,isSameNativeRegions,loadedPages,loadedCandidatePages,retainLoadedHandles(owner,handles,deadline){if(!active())return false;try{syncRoute();return discovery.retainHandles(owner,handles,deadline);}catch{return false;}},releaseLoadedHandles:owner=>discovery?.releaseHandles(owner),resolveLoadedTargets(targets){if(!active())return targets.map(()=>null);try{syncRoute();return discovery.resolveLoadedTargets(targets);}catch{return targets.map(()=>null);}},captureCandidateIdentity(handle){if(!active())return null;try{syncRoute();return discovery.captureCandidateIdentity(handle);}catch{return null;}},matchesCandidateIdentity(token,handle){if(!active())return false;try{syncRoute();return discovery.matchesCandidateIdentity(token,handle);}catch{return false;}},hasNativeLayer(){return !!document.querySelector('dialog[open], [aria-modal="true"]');},currentURL:()=>document.location.href,isCurrent:raw=>urlPolicy.sameTarget(document.location.href,raw),nativeHref:raw=>urlPolicy.nativeHref(raw),planNavigation(target,risk){if(!active())return {mode:'unavailable',reason:'stale-host-binding',planRevision:0};try{syncRoute();}catch{return {mode:'unavailable',reason:'host-rebind-required',planRevision:0};}return actions.planNavigation(target,risk);},planKey:plan=>active()?actions.planKey(plan):null,dispatchNative:command=>{idleRevision++;return active()?track(()=>actions.dispatchNative(command)):Promise.resolve({state:'blocked',reason:'stale-host-binding'});},activateNative:async()=>({state:'blocked',reason:'unsupported-native-action'}),async readLoaded(target,signal){if(!active())throw Error('stale-host-binding');if(signal?.aborted)throw Error('aborted');const p=proposal();return splitSurfacePayload(p.payload,p).map((payload,index)=>({...p,localSeq:index?++seq:p.localSeq,payload}));},snippetReady:ref=>snippetReady(ref),selectionEpoch:ref=>snippets?.selectionEpoch?.(ref)??null,selectedSnippet:ref=>snippets?.selectedSnippet(ref)??null,restoreSnippet:(ref,anchor)=>snippets?.restoreSnippet(ref,anchor)??{ok:false,reason:'unsupported-snippet-anchor'},status(value){const status=publicAdapterStatus(value);document.documentElement.dataset.vaiwlState=status.state;document.documentElement.dataset.vaiwlReason=status.reason??'';}};
 return Object.freeze(api);
}
