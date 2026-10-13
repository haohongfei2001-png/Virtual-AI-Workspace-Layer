import {validateCurrentBodyProposal} from '../host/current-body-claim.mjs';
import {withRequestDeadline} from '../data/request-deadline.mjs';
import {surfaceBatch} from '../host/surface-batch.mjs';
import {digest} from '../data/hash.mjs';
/** Privileged owner; the gate recognizes request object identity, never serialized labels. */
export function createHostObservationOwner({handshake,authority,getFrame,profiles,onAccepted=null,now=Date.now,maxProducers=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,makeId=()=>crypto.randomUUID()}={}){
 if(!handshake?.verify||!handshake?.isBound||!handshake?.matchesFrame||!authority?.peek||!authority?.scopeFor||typeof getFrame!=='function'||!(profiles instanceof Map))throw Error('invalid-host-observation-owner');
 const admissions=new WeakMap(),producers=new Map(),bodies=new Map(),reads=new Set();let busy=null,stopped=false;
 function gate(scope,request){const entry=admissions.get(request);return entry&&entry.scopeKey===scope.key&&entry.guard()?entry:null;}
 async function ingest(proposal,sender,repository){
  const rejected=reason=>({state:'rejected',localSeq:Number.isSafeInteger(proposal?.localSeq)?proposal.localSeq:0,reason});
  if(stopped)return rejected('host-observation-stopped');
  if(busy)return {state:'retry-after',localSeq:proposal?.localSeq??0,delayMs:50};
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};busy=attempt;
  try{return await withRequestDeadline(()=>run(proposal,sender,repository,attempt),{now:elapsedNow,schedule,cancel});}
  catch{return rejected('host-observation-timeout');}
  finally{attempt.active=false;attempt.abort.abort();if(busy===attempt)busy=null;}
 }
 async function run(proposal,sender,repository,attempt){
  const rejected=reason=>({state:'rejected',localSeq:Number.isSafeInteger(proposal?.localSeq)?proposal.localSeq:0,reason});
  let request;
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
   const guard=()=>!stopped&&attempt.active&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch;
   const producerCurrent=()=>!stopped&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch;
   const time=now();for(const [key,value]of producers)if(value.until<=time&&value.isBound?.()!==true){producers.delete(key);bodies.delete(key);}
   if(!producers.has(proposal.producerToken)&&producers.size>=maxProducers)return rejected('host-producer-capacity');
   // Validate the complete shape before any storage read; revision and timestamps are owner values.
   const observedAt=new Date(time).toISOString(),validUntil=new Date(Math.min(time+60000,Date.parse(grant.expiresAt))).toISOString();
   const isBody=proposal.kind==='current-object';
   const body=isBody?validateCurrentBodyProposal(proposal,{profile,actualURL:actual.url}):null;
   let batch=isBody?null:surfaceBatch(proposal,{scope,binding:proposal,profile,urlPolicy:profile.urlPolicy,sourceRevision:1,observedAt,validUntil});
   const semanticFingerprint=digest({... (isBody?{kind:'current-object'}:{}),profileId:profile.id,profileVersion:profile.revision,payload:proposal.payload});
   const recorded=producers.get(proposal.producerToken);
   if(recorded&&(recorded.scopeKey!==scope.key||recorded.grantId!==grant.id||recorded.scopeEpoch!==grant.scopeEpoch))return rejected('host-producer-scope-changed');
   const previous=recorded;
   if(previous&&proposal.localSeq<=previous.seq)return previous.seq===proposal.localSeq&&previous.fingerprint===semanticFingerprint?{state:'duplicate',localSeq:proposal.localSeq,receiptId:previous.receiptId,...(previous.bodyProofId?{bodyProofId:previous.bodyProofId,bodyEpoch:previous.bodyEpoch}:{})}:rejected('replayed-host-proposal');
   if(!guard())return rejected('stale-host-scope');
   if(isBody){
    if(previous?.bodyRegionEpoch!==undefined&&body.regionEpoch<previous.bodyRegionEpoch)return rejected('stale-body-region');
    // A DOM claim is only a current-object association, never an ACK or author proof.
    if(!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
    const prior=bodies.get(proposal.producerToken),unchanged=body.association==='explicit-body-id'&&prior?.current()&&digest(prior.claim)===digest(body);
    const bodyEpoch=unchanged?prior.bodyEpoch:(previous?.bodyEpoch??0)+1;
    if(!unchanged)bodies.delete(proposal.producerToken);
    const proofId=unchanged?prior.proofId:body.association==='explicit-body-id'?makeId():null;
    if(proofId!==null&&!unchanged&&[...bodies.values()].some(entry=>entry.proofId===proofId))return rejected('body-proof-id-conflict');
    if(proofId!==null&&(typeof proofId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(proofId)))return rejected('invalid-body-proof-id');
    if(proofId!==null&&!unchanged){
     const entry={proofId,bodyEpoch,claim:body,frame,proposal,sender,scope,grantId:grant.id,scopeEpoch:grant.scopeEpoch,profile};
     entry.current=()=>!stopped&&bodies.get(proposal.producerToken)===entry&&profiles.get(profile.id)===profile&&profile.revision===proposal.profileVersion&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===entry.grantId&&authority.peek(frame).grant?.scopeEpoch===entry.scopeEpoch&&authority.scopeFor(frame)?.key===scope.key;
     bodies.set(proposal.producerToken,entry);
    }
    const receiptId='body_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
    producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,bodyProofId:proofId,bodyEpoch,bodyRegionEpoch:body.regionEpoch,until:Math.min(Date.parse(grant.expiresAt),time+20000)});
    return {state:'accepted',localSeq:proposal.localSeq,receiptId,bodyProofId:proofId,bodyEpoch};
   }
   const sourceId='host_dom_'+digest(profile.id).slice(0,32),generation='profile_'+profile.revision;
   const projectIds=[...new Set(proposal.payload.membershipClaims.filter(c=>c.asserted==='PROJECT').map(c=>c.projectId))];
   const page=await repository.page(scope,{ids:{projects:projectIds,refs:[]},limit:256},{guard,signal:attempt.abort.signal});
   batch=surfaceBatch(proposal,{scope,binding:proposal,profile,urlPolicy:profile.urlPolicy,sourceRevision:(page.facts.sources[sourceId]?.sourceRevision??0)+1,observedAt,validUntil,knownProjects:Object.keys(page.facts.projects)});
   if(!await handshake.verify(proposal,sender)||!guard())return rejected('stale-host-document');
   const receiptId='dom_'+digest([grant.id,proposal.producerToken,proposal.localSeq,semanticFingerprint]).slice(0,48);
   request={operationId:receiptId,expectedRevision:page.revision,batch};
   const admission={profileId:profile.id,profileVersion:profile.revision,evidenceClass:'surface',semanticFingerprint,acceptedAt:observedAt};
   admissions.set(request,Object.freeze({scopeKey:scope.key,channel:'host-dom',sourceId,generation,admission,guard}));
   const result=await repository.apply(scope,request,{guard,signal:attempt.abort.signal});
   if(!result.ok)return result.reason==='revision-conflict'?{state:'retry-after',localSeq:proposal.localSeq,delayMs:50}:rejected('host-native-apply-failed');
   if(!guard())return rejected('stale-host-scope');
   producers.set(proposal.producerToken,{isBound:producerCurrent,scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,bodyEpoch:previous?.bodyEpoch??0,...(previous?.bodyRegionEpoch!==undefined?{bodyRegionEpoch:previous.bodyRegionEpoch}:{}),until:Math.min(Date.parse(grant.expiresAt),time+20000)});
   // Notify with the already verified scope inside the guarded owner turn.
   // Transport notification failure must not turn a committed write into a retry.
   try{onAccepted?.(scope);}catch{}
   return {state:'accepted',localSeq:proposal.localSeq,receiptId};
  }catch{return rejected('invalid-host-observation');}
  finally{if(request)admissions.delete(request);}
 }
 async function withCurrent(proofId,work){
  if(typeof work!=='function')throw Error('invalid-body-reader');
  const entry=[...bodies.values()].find(item=>item.proofId===proofId);
  if(!entry||!entry.current())throw Error('stale-body-proof');
  const attempt={active:true,abort:new AbortController(),started:elapsedNow()};reads.add(attempt);
  const guard=()=>attempt.active&&!attempt.abort.signal.aborted&&elapsedNow()>=attempt.started&&elapsedNow()-attempt.started<6000&&entry.current();
  const check=()=>{if(!guard())throw Error('stale-body-proof');};
  try{return await withRequestDeadline(async()=>{
   if(!await handshake.verify(entry.proposal,entry.sender))throw Error('stale-body-proof');check();
   const actual=await getFrame({tabId:entry.frame.tabId,frameId:0});check();
   if(!handshake.matchesFrame(entry.proposal,entry.sender,actual)||actual.url!==entry.frame.actualURL)throw Error('stale-body-proof');
   const result=await work(Object.freeze({scope:Object.freeze({...entry.scope}),conversationId:entry.claim.conversationId,messageIds:Object.freeze([...entry.claim.messageIds]),bodyEpoch:entry.bodyEpoch,evidenceClass:'dom-observed',guard,signal:attempt.abort.signal}));
   if(!await handshake.verify(entry.proposal,entry.sender))throw Error('stale-body-proof');check();return result;
  },{now:elapsedNow,schedule,cancel});}finally{attempt.active=false;attempt.abort.abort();reads.delete(attempt);}
 }
 function invalidateDocument(documentId){for(const [key,entry]of bodies)if(entry.frame.documentId===documentId)bodies.delete(key);}
 function invalidateTab(tabId){for(const [key,entry]of bodies)if(entry.frame.tabId===tabId)bodies.delete(key);}
 function stop(){stopped=true;busy&&(busy.active=false,busy.abort.abort());bodies.clear();producers.clear();for(const attempt of reads){attempt.active=false;attempt.abort.abort();}reads.clear();}
 return Object.freeze({gate,ingest,withCurrent,invalidateDocument,invalidateTab,stop});
}
