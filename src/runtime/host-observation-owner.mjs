import {nativeWitnessActive,hostNativeChannel} from '../data/native-facts.mjs';
import {nativeSourceIncarnation} from './native-source-incarnation.mjs';
import {splitCurrentObservation,validateCurrentSurfaceRelation,CURRENT_OBSERVATION_PROTOCOL} from '../host/current-observation-batch.mjs';
import {continuationSemanticFingerprint} from '../data/native-observation-continuation.mjs';
import {validateSendIntentProposal,validateSendGapProposal} from '../host/send-intent-claim.mjs';
import {validateCurrentBodyProposal} from '../host/current-body-claim.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {surfaceBatch} from '../host/surface-batch.mjs';
import {directoryTarget,directoryRequest,directoryBatch} from '../host/directory-batch.mjs';
import {digest} from '../data/hash.mjs';
import {lifecycleKind,validateNativeLifecycleChange} from '../data/native-lifecycle.mjs';
/** Privileged owner; the gate recognizes request object identity, never serialized labels. */
export function createHostObservationOwner({handshake,authority,getFrame,profiles,onAccepted=null,foregroundReadPending=()=>false,onSendIntent=null,onSendGap=null,onNativeDelta=null,ackAdmission=null,now=Date.now,maxProducers=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(!handshake?.verify||!handshake?.isBound||!handshake?.matchesFrame||!authority?.peek||!authority?.scopeFor||typeof getFrame!=='function'||!(profiles instanceof Map))throw Error('invalid-host-observation-owner');
 const admissions=new WeakMap(),lifecycleAdmissions=new WeakMap(),producers=new Map(),failedBatches=new Map(),bodies=new Map(),reads=new Set();let busy=null,stopped=false,joint=null,runs=0;
 async function track(work){runs++;try{return await work();}finally{runs--;}}
 function discardBody(key){const entry=bodies.get(key);if(!entry)return;bodies.delete(key);for(const read of reads)if(read.entry===entry){read.active=false;read.abort.abort();}}
 function gate(scope,request){const entry=admissions.get(request);return entry&&entry.scopeKey===scope.key&&entry.guard()?entry:null;}
 function lifecycleGate(scope,request){const entry=lifecycleAdmissions.get(request);return entry&&entry.scopeKey===scope.key&&entry.guard()?entry:null;}
 // Worker-only, first-page intake. Production profiles register no directory
 // provider. The provider must privately attest an authenticated response for
 // this exact context/target; serialized data or a diagnostic report cannot.
 async function observeDirectory(binding,sender,repository,target){
  if(stopped)return {ok:false,reason:'host-observation-stopped'};
  if(busy)return {ok:false,reason:'host-observation-busy'};
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;let request,knownCommitted=false,directoryExpiry=null;
  try{return await withRequestDeadline(()=>track(async()=>{
   binding=structuredClone(binding);sender=structuredClone(sender);target=directoryTarget(structuredClone(target));
   if(!await handshake.verify(binding,sender))throw Error('invalid-host-document');
   const actual=await getFrame({tabId:sender.tab.id,frameId:0});
   if(!handshake.matchesFrame(binding,sender,actual))throw Error('host-frame-conflict');
   const frame={tabId:sender.tab.id,frameId:0,documentId:actual.documentId,parentDocumentId:null,actualURL:actual.url,documentLifecycle:actual.documentLifecycle,incognito:sender.tab.incognito===true};attempt.frame=frame;
   const resolution=authority.peek(frame),scope=authority.scopeFor(frame),profile=profiles.get(binding.profileId),provider=profile?.directoryProvider,read=provider?.read,proofFor=provider?.directoryFor;
   if(resolution.state!=='verified'||!scope)throw Error('unverified-host-scope');
   if(!profile||profile.id!==binding.profileId||profile.revision!==binding.profileVersion||typeof read!=='function'||typeof proofFor!=='function')throw Error('directory-source-unregistered');
   const grant=resolution.grant,source=authority.sourceFor?.(frame);
   const guard=()=>!stopped&&attempt.active&&!attempt.abort.signal.aborted&&(directoryExpiry===null||Number.isFinite(now())&&now()<directoryExpiry)&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&profiles.get(binding.profileId)===profile&&profile.id===binding.profileId&&profile.revision===binding.profileVersion&&profile.directoryProvider===provider&&provider.read===read&&provider.directoryFor===proofFor&&handshake.isBound(binding,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch&&authority.scopeFor(frame)?.key===scope.key&&authority.sourceFor?.(frame)===source;
   const check=()=>{if(!guard())throw Error('stale-host-scope');};check();
   if(foregroundReadPending(scope.key)===true)return {ok:false,reason:'foreground-read-pending'};
   if(target.kind==='members'){
    const known=await repository.page(scope,{ids:{projects:[target.projectId],refs:[]},limit:1},{guard,signal:attempt.abort.signal});check();
    const project=known.facts.projects[target.projectId],projectSource=known.facts.sources[project?.sourceId];
    if(!project||!hostNativeChannel(projectSource?.channel)||projectSource.admission?.profileId!==profile.id||projectSource.admission?.profileVersion!==profile.revision||project.availability!=='available'||known.facts.projectLifecycle?.[target.projectId]?.state==='deletion-confirmed'||!nativeWitnessActive(project,known.facts,new Date(now()).toISOString()))return {ok:false,reason:'directory-project-unverified'};
   }
   const context=Object.freeze({scopeKey:scope.key,scopeGrantId:grant.id,scopeEpoch:grant.scopeEpoch,principalSource:source,principalKey:scope.accountId,contextKey:scope.organizationId,providerProfile:grant.principal.providerProfile,browserDocumentId:frame.documentId,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,actualURL:frame.actualURL,profileId:binding.profileId,profileVersion:binding.profileVersion,target,request:directoryRequest(target)});
   const result=await read.call(provider,context,{guard,signal:attempt.abort.signal});check();
   const proof=proofFor.call(provider,result);check();
   if(!proof||proof.context!==context||typeof proof.payload!=='string'||typeof proof.expiresAt!=='string'||!Number.isFinite(Date.parse(proof.expiresAt)))throw Error('untrusted-directory-result');
   directoryExpiry=Date.parse(proof.expiresAt);check();
   const time=now(),observedAt=new Date(time).toISOString(),validUntil=new Date(Math.min(time+60000,Date.parse(grant.expiresAt),directoryExpiry)).toISOString();
   const reduced=directoryBatch(proof.payload,{target,scope,urlPolicy:profile.urlPolicy,sourceRevision:1,observedAt,validUntil});check();
   const page=await repository.page(scope,{ids:{projects:reduced.batch.projects.map(p=>p.id),refs:reduced.batch.refs.map(r=>r.id)},limit:512},{guard,signal:attempt.abort.signal});check();
   // Native recovery has priority. The following CAS also rejects a pending
   // batch committed after this page was read; directory work never drains or
   // downgrades an ACK's continuation to make room for metadata.
   const continuations=await repository.listContinuations(scope,{guard,signal:attempt.abort.signal});check();
   if(continuations.some(row=>row.state==='pending-evidence'))return {ok:false,reason:'pending-native-evidence'};
   // Missing/over-limit names are not renames. Do not overwrite or re-witness
   // a retained known name; a new ID without a title may still stay reachable.
   for(const table of ['projects','refs']){
    const field=table==='projects'?'nativeName':'nativeTitle';
    reduced.batch[table]=reduced.batch[table].filter(row=>{const previous=page.facts[table][row.id],priorSource=page.facts.sources[previous?.sourceId];return !(row[field]===null&&previous?.[field]!=null&&priorSource&&!priorSource.revoked);});
   }
   const {sourceId,generation,sourceRevision}=nativeSourceIncarnation(page.facts.sources,profile);reduced.batch.sourceRevision=sourceRevision;
   if(!await handshake.verify(binding,sender))throw Error('stale-host-document');check();
   // Do not refresh unrelated rows or change a source on an empty observation.
   if(!reduced.batch.projects.length&&!reduced.batch.refs.length)return {ok:true,replayed:true,revision:page.revision,coverage:reduced.coverage};
   const semanticFingerprint=digest({profileId:profile.id,profileVersion:profile.revision,target,projects:reduced.batch.projects,refs:reduced.batch.refs,coverage:reduced.coverage});
   const admission={profileId:profile.id,profileVersion:profile.revision,evidenceClass:'directory-candidates',semanticFingerprint,acceptedAt:observedAt,coverage:reduced.coverage};
   request={operationId:'directory_'+digest([grant.id,binding.producerToken,sourceId,generation,sourceRevision,semanticFingerprint]),expectedRevision:page.revision,batch:reduced.batch};
   admissions.set(request,Object.freeze({scopeKey:scope.key,channel:'host-metadata',sourceId,generation,admission,guard}));
   attempt.nativeWriteScope=scope.key;attempt.nativeWriteGuard=guard;
   const committed=await repository.apply(scope,request,{guard,signal:attempt.abort.signal});knownCommitted=committed.committed===true||(committed.ok===true&&!committed.replayed);
   if(!guard())return knownCommitted?{ok:false,reason:'stale-after-commit',committed:true}:{ok:false,reason:'stale-host-scope'};
   if(committed.ok&&!committed.replayed)try{onAccepted?.(scope,{background:true});}catch{}
   return {...committed,coverage:reduced.coverage};
  }),{now:elapsedNow,schedule,cancel});}
  catch(error){return {ok:false,...(knownCommitted?{committed:true}:{}),reason:['directory-source-unregistered','invalid-directory-target','untrusted-directory-result','stale-host-scope','stale-host-document','unverified-host-scope'].includes(error?.message)?error.message:'directory-observation-failed'};}
  finally{if(request)admissions.delete(request);attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}
 }
 // Worker-only entry. No transport handler dispatches this method. A profile
 // must first register a result provider with separately established semantics;
 // existing production profiles have no such provider. DOM absence, context
 // receipts and send ACKs never enter this admission map.
 async function observeLifecycle(binding,sender,repository,target){
  if(stopped)return {ok:false,reason:'host-observation-stopped'};
  if(busy)return {ok:false,reason:'host-observation-busy'};
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;let request,knownCommitted=false;
  try{return await withRequestDeadline(()=>track(async()=>{
   binding=structuredClone(binding);sender=structuredClone(sender);target=structuredClone(target);
   if(!target||Object.keys(target).sort().join(',')!=='id,kind,operationId,state'||!lifecycleKind(target.kind)||!['deletion-confirmed','existence-confirmed'].includes(target.state)||typeof target.operationId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(target.operationId))throw Error('invalid-native-lifecycle-target');
   if(!await handshake.verify(binding,sender))throw Error('invalid-host-document');
   const actual=await getFrame({tabId:sender.tab.id,frameId:0});
   if(!handshake.matchesFrame(binding,sender,actual))throw Error('host-frame-conflict');
   const frame={tabId:sender.tab.id,frameId:0,documentId:actual.documentId,parentDocumentId:null,actualURL:actual.url,documentLifecycle:actual.documentLifecycle,incognito:sender.tab.incognito===true};
   attempt.frame=frame;
   const resolution=authority.peek(frame),scope=authority.scopeFor(frame),profile=profiles.get(binding.profileId),provider=profile?.lifecycleProvider,providerRead=provider?.read,proofFor=provider?.lifecycleFor;
   if(resolution.state!=='verified'||!scope)throw Error('unverified-host-scope');
   if(!profile||profile.id!==binding.profileId||profile.revision!==binding.profileVersion||typeof providerRead!=='function'||typeof proofFor!=='function')throw Error('native-lifecycle-source-unregistered');
   const grant=resolution.grant,source=authority.sourceFor?.(frame);
   const guard=()=>!stopped&&attempt.active&&!attempt.abort.signal.aborted&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&profiles.get(binding.profileId)===profile&&profile.id===binding.profileId&&profile.revision===binding.profileVersion&&profile.lifecycleProvider===provider&&provider.read===providerRead&&provider.lifecycleFor===proofFor&&handshake.isBound(binding,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch&&authority.scopeFor(frame)?.key===scope.key&&authority.sourceFor?.(frame)===source;
   const check=()=>{if(!guard())throw Error('stale-host-scope');};check();
   const page=await repository.page(scope,{ids:{projects:target.kind==='projects'?[target.id]:[],refs:target.kind==='refs'?[target.id]:[]}}, {guard,signal:attempt.abort.signal});check();
   const previous=page.facts[lifecycleKind(target.kind)]?.[target.id];
   if(target.state==='existence-confirmed'&&previous?.state!=='deletion-confirmed')throw Error('native-lifecycle-fence-conflict');
   // Capture the exact fence BEFORE starting the existence read. A result may
   // not be retroactively attached to a later deletion after an await.
   const context=Object.freeze({scopeKey:scope.key,scopeGrantId:grant.id,scopeEpoch:grant.scopeEpoch,principalSource:source,
    browserDocumentId:frame.documentId,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,
    actualURL:frame.actualURL,profileId:binding.profileId,profileVersion:binding.profileVersion,target:Object.freeze({...target}),
    expectedVersion:previous?.version??0,fenceId:target.state==='existence-confirmed'?previous.fenceId:null,fenceVersion:target.state==='existence-confirmed'?previous.fenceVersion:null});
   const result=await providerRead.call(provider,context,{guard,signal:attempt.abort.signal});check();
   const proof=proofFor.call(provider,result);
   if(!proof||proof.context!==context)throw Error('untrusted-native-lifecycle-result');
   const change=validateNativeLifecycleChange(structuredClone(proof.change));
   if(change.kind!==target.kind||change.id!==target.id||change.state!==target.state||change.expectedVersion!==context.expectedVersion||change.fenceId!==context.fenceId||change.fenceVersion!==context.fenceVersion||change.profileId!==context.profileId||change.profileVersion!==context.profileVersion)throw Error('native-lifecycle-result-conflict');
   if(!await handshake.verify(binding,sender))throw Error('stale-host-document');check();
   request={operationId:'lifecycle_'+digest([scope.key,change.profileId,change.profileVersion,target.kind,target.id,target.operationId,change.resultFingerprint]),expectedRevision:page.revision,change};
   lifecycleAdmissions.set(request,Object.freeze({purpose:'native-lifecycle',scopeKey:scope.key,guard}));
   attempt.nativeWriteScope=scope.key;attempt.nativeWriteGuard=guard;
   const committed=await repository.applyLifecycle(scope,request,{guard,signal:attempt.abort.signal});
   knownCommitted=committed.committed===true||(committed.ok===true&&!committed.replayed);
   if(!guard())return committed.committed?committed:committed.ok?{ok:false,reason:'stale-after-commit',committed:true}:committed;
   if(committed.ok&&!committed.replayed)try{onAccepted?.(scope,{background:false});}catch{}
   return committed;
  }),{now:elapsedNow,schedule,cancel});}
  catch(error){return {ok:false,...(knownCommitted?{committed:true}:{}),reason:['native-lifecycle-source-unregistered','native-lifecycle-fence-conflict','native-lifecycle-result-conflict','untrusted-native-lifecycle-result','stale-host-scope','stale-host-document','unverified-host-scope','invalid-native-lifecycle-target'].includes(error?.message)?error.message:'native-lifecycle-observation-failed'};}
  finally{if(request)lifecycleAdmissions.delete(request);attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}
 }
 async function ingest(proposal,sender,repository){
  const rejected=reason=>({state:'rejected',localSeq:Number.isSafeInteger(proposal?.localSeq)?proposal.localSeq:0,reason});
  if(stopped)return rejected('host-observation-stopped');
  if(busy)return {state:'retry-after',localSeq:proposal?.localSeq??0,delayMs:50};
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;
  try{return await withRequestDeadline(()=>track(()=>run(proposal,sender,repository,attempt)),{now:elapsedNow,schedule,cancel});}
  catch{return rejected('host-observation-timeout');}
  finally{attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}
 }
 async function run(proposal,sender,repository,attempt){
  const rejected=reason=>({state:'rejected',localSeq:Number.isSafeInteger(proposal?.localSeq)?proposal.localSeq:0,reason});
  let request,newBatchProof=null,batchCommitted=false;
  try{
   proposal=structuredClone(proposal);sender=structuredClone(sender);
   if(new TextEncoder().encode(JSON.stringify(proposal)).length>65536)return rejected('host-proposal-too-large');
   if(!await handshake.verify(proposal,sender))return rejected('invalid-host-document');
   const actual=await getFrame({tabId:sender.tab.id,frameId:0});
   if(!handshake.matchesFrame(proposal,sender,actual))return rejected('host-frame-conflict');
   const frame={tabId:sender.tab.id,frameId:0,documentId:actual.documentId,parentDocumentId:null,actualURL:actual.url,documentLifecycle:actual.documentLifecycle,incognito:sender.tab.incognito===true};
   const resolution=authority.peek(frame),scope=authority.scopeFor(frame);
   if(resolution.state!=='verified'||!scope)return rejected('unverified-host-scope');
   const grant=resolution.grant,profile=profiles.get(proposal.profileId);
   if(!profile||profile.revision!==proposal.profileVersion)return rejected('unsupported-host-profile');
   const guard=()=>profiles.get(profile.id)===profile&&profile.revision===proposal.profileVersion&&!stopped&&attempt.active&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch;
   const producerCurrent=()=>!stopped&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch;
   const time=now();for(const [key,value]of producers)if(value.until<=time&&value.isBound?.()!==true){producers.delete(key);discardBody(key);}
   if(!producers.has(proposal.producerToken)&&producers.size>=maxProducers)return rejected('host-producer-capacity');
   // Validate the complete shape before any storage read; revision and timestamps are owner values.
   const observedAt=new Date(time).toISOString(),validUntil=new Date(Math.min(time+60000,Date.parse(grant.expiresAt))).toISOString();
   const combined=proposal.protocol===CURRENT_OBSERVATION_PROTOCOL?splitCurrentObservation(proposal):null;
   const isBody=proposal.kind==='current-object'||!!combined,isSend=proposal.kind==='send-candidate',isGap=proposal.kind==='send-gap';
   if(isGap)validateSendGapProposal(proposal,{profile});
   const current=bodies.get(proposal.producerToken);
   const intent=isSend?validateSendIntentProposal(proposal,{profile,actualURL:actual.url,current:current?.current()?{proofId:current.proofId,conversationId:current.claim.conversationId,regionEpoch:current.claim.regionEpoch}:null}):null;
   const body=isBody?validateCurrentBodyProposal(combined?.body??proposal,{profile,actualURL:actual.url}):null;
   let batch=(!combined&&isBody)||isSend||isGap?null:surfaceBatch(combined?.surface??proposal,{scope,binding:proposal,profile,urlPolicy:profile.urlPolicy,sourceRevision:1,observedAt,validUntil});
   if(combined)validateCurrentSurfaceRelation(combined);
   const semanticFingerprint=digest({... (isBody||isSend||isGap?{kind:proposal.kind}:{}),profileId:profile.id,profileVersion:profile.revision,...(isGap?{bodyProofId:proposal.bodyProofId}:{}),payload:proposal.payload});
   const recorded=producers.get(proposal.producerToken);
   if(recorded&&(recorded.scopeKey!==scope.key||recorded.grantId!==grant.id||recorded.scopeEpoch!==grant.scopeEpoch))return rejected('host-producer-scope-changed');
   const previous=recorded;
   for(const [key,value]of failedBatches)if(!value.isBound())failedBatches.delete(key);
   if(failedBatches.get(proposal.producerToken)?.localSeq>=proposal.localSeq)return rejected('failed-current-observation-batch');
   if(combined&&!failedBatches.has(proposal.producerToken)&&failedBatches.size>=maxProducers)return rejected('host-batch-capacity');
   if(previous&&proposal.localSeq<=previous.seq)return previous.seq===proposal.localSeq&&previous.fingerprint===semanticFingerprint?{state:'duplicate',localSeq:proposal.localSeq,receiptId:previous.receiptId,...(previous.bodyProofId?{bodyProofId:previous.bodyProofId,bodyEpoch:previous.bodyEpoch}:{})}:rejected('replayed-host-proposal');
   if(!guard())return rejected('stale-host-scope');
   if(isGap){
    if(!current?.current()||current.proofId!==proposal.bodyProofId||!await handshake.verify(proposal,sender)||!guard())return rejected('stale-send-gap');
    // Retire only causal candidates. Keep the body proof/epoch and read budget;
    // a loss marker must not manufacture a fresh authorization or read window.
    if(!onSendGap||await onSendGap(current.proofId)!==true||!current.current()||!guard())return rejected('stale-send-gap');
    const receiptId='gap_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
    producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,bodyEpoch:previous?.bodyEpoch??current.bodyEpoch,bodyRegionEpoch:current.claim.regionEpoch,until:Math.min(Date.parse(grant.expiresAt),time+20000)});
    return {state:'accepted',localSeq:proposal.localSeq,receiptId};
   }
   if(isSend){
    if(!current?.current()||!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
    // Acceptance consumes a candidate only. A page cannot request an ACK or activity write.
    await onSendIntent?.(current.proofId,intent);
    if(!current.current()||!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
    const receiptId='intent_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
    producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,bodyEpoch:previous?.bodyEpoch??current.bodyEpoch,bodyRegionEpoch:current.claim.regionEpoch,until:Math.min(Date.parse(grant.expiresAt),time+20000)});
    return {state:'accepted',localSeq:proposal.localSeq,receiptId};
   }
   let batchBodyEpoch=null;
   if(isBody){
    if(previous?.bodyRegionEpoch!==undefined&&body.regionEpoch<previous.bodyRegionEpoch)return rejected('stale-body-region');
    // A DOM claim is only a current-object association, never an ACK or author proof.
    if(!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
    const prior=bodies.get(proposal.producerToken),sameBody=body.association==='explicit-body-id'&&prior?.current()&&prior.claim.conversationId===body.conversationId&&prior.claim.regionEpoch===body.regionEpoch;
    const unchanged=sameBody&&digest(prior.claim)===digest(body);
    // Message observations replace read authority without pretending the body remounted.
    const bodyEpoch=sameBody?prior.bodyEpoch:(previous?.bodyEpoch??0)+1;batchBodyEpoch=bodyEpoch;
    if(!unchanged)discardBody(proposal.producerToken);
    const proofId=unchanged?prior.proofId:body.association==='explicit-body-id'?makeId():null;
    if(proofId!==null&&!unchanged&&[...bodies.values()].some(entry=>entry.proofId===proofId))return rejected('body-proof-id-conflict');
    if(proofId!==null&&(typeof proofId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(proofId)))return rejected('invalid-body-proof-id');
    if(combined)newBatchProof={producerToken:proposal.producerToken,proofId,localSeq:proposal.localSeq,isBound:producerCurrent};
    if(proofId!==null&&!unchanged){
     const entry={proofId,bodyEpoch,claim:body,frame,proposal,sender,scope,grantId:grant.id,scopeEpoch:grant.scopeEpoch,profile};
     entry.current=()=>!stopped&&bodies.get(proposal.producerToken)===entry&&profiles.get(profile.id)===profile&&profile.revision===proposal.profileVersion&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===entry.grantId&&authority.peek(frame).grant?.scopeEpoch===entry.scopeEpoch&&authority.scopeFor(frame)?.key===scope.key;
     bodies.set(proposal.producerToken,entry);
    }
    const receiptId='body_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
    if(!combined){producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,bodyProofId:proofId,bodyEpoch,bodyRegionEpoch:body.regionEpoch,until:Math.min(Date.parse(grant.expiresAt),time+20000)});
    return {state:'accepted',localSeq:proposal.localSeq,receiptId,bodyProofId:proofId,bodyEpoch};}
   }
   // Only background directory packets yield; current body/send causality keeps
   // priority. No sequence, receipt or persistent fact is accepted on this path.
   if(!combined&&!isBody&&!isSend&&foregroundReadPending(scope.key)===true)return {state:'retry-after',localSeq:proposal.localSeq,delayMs:50};
   attempt.nativeWriteScope=scope.key;attempt.nativeWriteGuard=guard;
   const surfaceProposal=combined?.surface??proposal;
   const projectIds=[...new Set([...batch.projects.map(p=>p.id),...surfaceProposal.payload.membershipClaims.filter(c=>c.asserted==='PROJECT').map(c=>c.projectId)])];
   const page=await repository.page(scope,{ids:{projects:projectIds,refs:batch.refs.map(r=>r.id)},limit:512},{guard,signal:attempt.abort.signal});
   const {sourceId,generation,sourceRevision}=nativeSourceIncarnation(page.facts.sources,profile);
   batch=surfaceBatch(surfaceProposal,{scope,binding:proposal,profile,urlPolicy:profile.urlPolicy,sourceRevision,observedAt,validUntil,knownProjects:Object.keys(page.facts.projects)});
   if(!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
   const receiptId='dom_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
   request={operationId:receiptId,expectedRevision:page.revision,batch};
   const admission={profileId:profile.id,profileVersion:profile.revision,evidenceClass:'surface',semanticFingerprint,acceptedAt:observedAt};
   admissions.set(request,Object.freeze({scopeKey:scope.key,channel:'host-dom',sourceId,generation,admission,guard}));
   // Only changed native semantics are eligible for a mixed commit. Source TTL,
   // revision refresh, missing NONE and repeated surfaces are never a delta.
   const changed=(rows,table,fields)=>rows.some(row=>!table[row.id]||fields.some(key=>row[key]!==table[row.id][key]));
   const nativeChanged=changed(batch.projects,page.facts.projects,['nativeName','nativeUrl','availability'])||changed(batch.refs,page.facts.refs,['nativeTitle','nativeUrl','availability'])||changed(batch.membership,page.facts.membership,['state','projectId']);
   const revalidating=['projects','refs','membership'].some(table=>batch[table].some(row=>page.facts[table][row.id]?.sourceId!==sourceId||page.facts[table][row.id]?.generation!==generation));
   let coalesced=false;
   let result;
   const bodyEntry=bodies.get(proposal.producerToken);
   if(nativeChanged&&onNativeDelta&&bodyEntry?.current()&&batch.refs.some(r=>r.id===bodyEntry.claim.conversationId)){
    const turn={scope,proposal,bodyEntry,request,admission,sourceId,generation,guard,repository,attempt,signal:attempt.abort.signal,result:null,claimed:false};joint=turn;
    try{await onNativeDelta(bodyEntry.proofId);}catch(error){if(turn.claimed||!guard())throw error;}finally{if(joint===turn)joint=null;}
    result=turn.result;
    // A failed joint commit must never fall back to a native-only write.
    if(turn.claimed&&!result?.ok)return rejected('host-joint-apply-failed');
   }
   if(combined&&!nativeChanged){
    // Optional metadata availability does not authorize the DOM body claim.
    // Budget exhaustion cannot revoke an otherwise current body ACK;
    // authority loss still rejects, and claimed joint writes above never fall back.
    if(onNativeDelta&&bodyEntry?.current())try{await onNativeDelta(bodyEntry.proofId);}catch(error){if(error?.message!=='read-budget-exhausted'||!guard()||!bodyEntry.current()||!await handshake.verify(proposal,sender)||!guard()||!bodyEntry.current())throw error;}
    if(!revalidating)result={ok:true};
   }
   if(!combined&&!nativeChanged&&!revalidating){
    // A second visible region or owned-mask rescan may repeat the same facts.
    // Reuse only currently active witnesses; acknowledging a repeat never
    // extends their timestamps or revives an expired/revoked row.
    const source=page.facts.sources[sourceId];
    const witnessed=()=>{const currentTime=new Date(now()).toISOString();return source&&nativeWitnessActive({...source,sourceId},page.facts,currentTime)&&JSON.stringify(source.inventory)===JSON.stringify(batch.inventory)&&['projects','refs','membership'].every(table=>batch[table].every(row=>nativeWitnessActive(page.facts[table][row.id],page.facts,currentTime)));};
    if(witnessed()){
     const revision=await repository.version(scope,{guard,signal:attempt.abort.signal});
     if(!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
     if(revision!==page.revision)return {state:'retry-after',localSeq:proposal.localSeq,delayMs:50};
     if(witnessed()){result={ok:true};coalesced=true;}
    }
   }
   if(!result){attempt.nativeWriteScope=scope.key;attempt.nativeWriteGuard=guard;try{result=await repository.apply(scope,request,{guard,signal:attempt.abort.signal});}finally{attempt.nativeWriteScope=null;attempt.nativeWriteGuard=null;}}
   if(!result.ok)return result.reason==='revision-conflict'?{state:'retry-after',localSeq:proposal.localSeq,delayMs:50}:rejected('host-native-apply-failed');
   if(!guard())return rejected('stale-host-scope');
   producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,...(combined?{bodyProofId:bodyEntry?.proofId??null,bodyRegionEpoch:body.regionEpoch}:{}),bodyEpoch:batchBodyEpoch??bodyEntry?.bodyEpoch??previous?.bodyEpoch??0,...(!combined&&previous?.bodyRegionEpoch!==undefined?{bodyRegionEpoch:previous.bodyRegionEpoch}:{}),until:Math.min(Date.parse(grant.expiresAt),time+20000)});
   // Notify with the already verified scope inside the guarded owner turn.
   // Transport notification failure must not turn a committed write into a retry.
   // IDless controls and detached handles also drive live candidate UI.
   const liveControlsChanged=surfaceProposal.payload.detachedHandles.length>0||surfaceProposal.payload.candidates.some(candidate=>candidate.target.kind==='live-control');
   try{if(!coalesced||liveControlsChanged)onAccepted?.(scope,{background:!combined&&!isBody&&!isSend});}catch{}
   batchCommitted=true;if(combined)failedBatches.delete(proposal.producerToken);return {state:'accepted',localSeq:proposal.localSeq,receiptId,...(combined?{bodyProofId:bodyEntry?.proofId??null,bodyEpoch:batchBodyEpoch??bodyEntry?.bodyEpoch??0}:{})};
  }catch{return rejected('invalid-host-observation');}
  finally{if(request)admissions.delete(request);if(newBatchProof&&!batchCommitted){failedBatches.set(newBatchProof.producerToken,newBatchProof);if(bodies.get(newBatchProof.producerToken)?.proofId===newBatchProof.proofId)discardBody(newBatchProof.producerToken);}}
 }
 const commitAcknowledged=input=>track(()=>commitAcknowledgedWork(input));
 async function commitAcknowledgedWork({context,evidenceRequest,guard:ackGuard}){
  const turn=joint;if(!turn)return null;
  if(context.scope?.key!==turn.scope.key||context.producerToken!==turn.proposal.producerToken||context.documentToken!==turn.proposal.documentToken||context.routeEpoch!==turn.proposal.routeEpoch||context.conversationId!==turn.bodyEntry.claim.conversationId||context.bodyEpoch!==turn.bodyEntry.bodyEpoch)return null;
  const witness=ackAdmission?.(turn.scope,evidenceRequest);
  if(!witness||witness.channel!=='host-evidence'||witness.scopeKey!==turn.scope.key||witness.guard?.()!==true){turn.claimed=true;throw Error('untrusted-joint-ack');}
  const semantic=continuationSemanticFingerprint(evidenceRequest.batch);
  if(turn.claimed){if(!turn.result?.ok)throw Error('joint-native-already-claimed');return semantic===turn.ackSemantic?{...turn.result,nativeOperationId:turn.request.operationId}:null;}
  turn.claimed=true;turn.ackSemantic=semantic;
  const guard=()=>turn.guard()&&turn.bodyEntry.current()&&ackAdmission?.(turn.scope,evidenceRequest)===witness&&witness.guard()===true&&ackGuard()===true;
  if(!guard())throw Error('stale-joint-native');
  const continuationAdmission={profileId:witness.profileId,profileVersion:witness.profileVersion,evidenceClass:'observed-self-send',semanticFingerprint:continuationSemanticFingerprint(evidenceRequest.batch),acceptedAt:evidenceRequest.batch.sources[0].observedAt};
  admissions.set(turn.request,Object.freeze({scopeKey:turn.scope.key,channel:'host-dom',sourceId:turn.sourceId,generation:turn.generation,admission:turn.admission,guard,continuationAuthority:witness,continuationAdmission,continuation:{evidenceOperationId:'joint_ack_'+digest([turn.request.operationId,evidenceRequest.operationId]).slice(0,48),expectedEvidenceRevision:evidenceRequest.expectedRevision,batch:evidenceRequest.batch}}));
  turn.attempt.nativeWriteScope=turn.scope.key;turn.attempt.nativeWriteGuard=guard;try{turn.result=await turn.repository.apply(turn.scope,turn.request,{guard,signal:turn.signal});}finally{turn.attempt.nativeWriteScope=null;turn.attempt.nativeWriteGuard=null;}
  if(!turn.result?.ok)throw Error(turn.result?.reason??'joint-native-apply-failed');
  return {...turn.result,nativeOperationId:turn.request.operationId};
 }
 // Worker-only lookup from a freshly validated UI parent; serialized IDs never select a body.
 function currentProofForParent(context){
  if(stopped||context?.isCurrent?.()!==true)return null;
  const {parentFrame:frame,binding,scope,scopeGrantId}=context;
  if(!frame||!binding||!scope||typeof scopeGrantId!=='string')return null;
  const matches=[...bodies.values()].filter(entry=>entry.current()&&entry.frame.tabId===frame.tabId&&entry.frame.documentId===frame.documentId&&entry.frame.actualURL===frame.actualURL&&entry.scope.key===scope.key&&entry.grantId===scopeGrantId&&entry.proposal.documentToken===binding.documentToken&&entry.proposal.producerToken===binding.producerToken&&entry.proposal.routeEpoch===binding.routeEpoch);
  return matches.length===1?matches[0].proofId:null;
 }
 async function withCurrent(proofId,work){
  if(typeof work!=='function')throw Error('invalid-body-reader');
  const entry=[...bodies.values()].find(item=>item.proofId===proofId);
  if(!entry||!entry.current())throw Error('stale-body-proof');
  const attempt={entry,active:true,abort:new AbortController(),started:elapsedNow()};reads.add(attempt);let principalSource=null;
  const guard=()=>{
   if(!attempt.active||attempt.abort.signal.aborted||elapsedNow()<attempt.started||elapsedNow()-attempt.started>=6000||!entry.current())return false;
   if(!principalSource)return true;
   const principal=authority.peek(entry.frame).grant?.principal;
   return principal?.transport===principalSource.transport&&principal?.providerProfile===principalSource.providerProfile&&authority.sourceFor?.(entry.frame)===principalSource.token;
  };
  const check=()=>{if(!guard())throw Error('stale-body-proof');};
  try{return await withRequestDeadline(()=>track(async()=>{
   if(!await handshake.verify(entry.proposal,entry.sender))throw Error('stale-body-proof');check();
   const actual=await getFrame({tabId:entry.frame.tabId,frameId:0});check();
   if(!handshake.matchesFrame(entry.proposal,entry.sender,actual)||actual.url!==entry.frame.actualURL)throw Error('stale-body-proof');
   const principal=authority.peek(entry.frame).grant.principal;
   principalSource=Object.freeze({transport:principal.transport,providerProfile:principal.providerProfile,token:authority.sourceFor?.(entry.frame)});check();
   const result=await work(Object.freeze({scope:Object.freeze({...entry.scope}),tabId:entry.frame.tabId,browserDocumentId:entry.frame.documentId,scopeGrantId:entry.grantId,scopeEpoch:entry.scopeEpoch,providerProfile:principal.providerProfile,providerTransport:principal.transport,principalSource:principalSource.token,documentToken:entry.proposal.documentToken,producerToken:entry.proposal.producerToken,routeEpoch:entry.proposal.routeEpoch,conversationId:entry.claim.conversationId,messageIds:Object.freeze([...entry.claim.messageIds]),bodyEpoch:entry.bodyEpoch,evidenceClass:'dom-observed',guard,signal:attempt.abort.signal}));
   if(!await handshake.verify(entry.proposal,entry.sender))throw Error('stale-body-proof');check();return result;
  }),{now:elapsedNow,schedule,cancel});}finally{attempt.active=false;attempt.abort.abort();reads.delete(attempt);}
 }
 function invalidateDocument(documentId){if(busy?.frame?.documentId===documentId){busy.active=false;busy.abort.abort();}for(const [key,entry]of bodies)if(entry.frame.documentId===documentId)discardBody(key);}
 function invalidateTab(tabId){if(busy?.frame?.tabId===tabId){busy.active=false;busy.abort.abort();}for(const [key,entry]of bodies)if(entry.frame.tabId===tabId)discardBody(key);}
 function stop(){stopped=true;busy&&(busy.active=false,busy.abort.abort());bodies.clear();producers.clear();failedBatches.clear();for(const attempt of reads){attempt.active=false;attempt.abort.abort();}reads.clear();}
 return Object.freeze({isIdle:()=>!stopped&&runs===0&&busy===null&&reads.size===0,isNativeWritePending(scopeKey){try{return typeof scopeKey==='string'&&scopeKey.length>0&&!stopped&&busy?.active===true&&busy.nativeWriteScope===scopeKey&&busy.nativeWriteGuard?.()===true;}catch{return false;}},commitAcknowledged,isCurrentProof:proofId=>[...bodies.values()].some(entry=>entry.proofId===proofId&&entry.current()),isCurrentProducer:producerToken=>bodies.get(producerToken)?.current()===true,gate,lifecycleGate,observeLifecycle,observeDirectory,ingest,withCurrent,currentProofForParent,invalidateDocument,invalidateTab,stop});
}
