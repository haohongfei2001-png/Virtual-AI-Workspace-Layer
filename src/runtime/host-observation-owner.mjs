import {withRequestDeadline} from '../data/request-deadline.mjs';
import {surfaceBatch} from '../host/surface-batch.mjs';
import {digest} from '../data/hash.mjs';
/** Privileged owner; the gate recognizes request object identity, never serialized labels. */
export function createHostObservationOwner({handshake,authority,getFrame,profiles,now=Date.now,maxProducers=128,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(!handshake?.verify||!handshake?.isBound||!handshake?.matchesFrame||!authority?.peek||!authority?.scopeFor||typeof getFrame!=='function'||!(profiles instanceof Map))throw Error('invalid-host-observation-owner');
 const admissions=new WeakMap(),producers=new Map();let busy=null;
 function gate(scope,request){const entry=admissions.get(request);return entry&&entry.scopeKey===scope.key&&entry.guard()?entry:null;}
 async function ingest(proposal,sender,repository){
  const rejected=reason=>({state:'rejected',localSeq:Number.isSafeInteger(proposal?.localSeq)?proposal.localSeq:0,reason});
  if(busy)return {state:'retry-after',localSeq:proposal?.localSeq??0,delayMs:50};
  const attempt={active:true,abort:new AbortController()};busy=attempt;
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
   const guard=()=>attempt.active&&handshake.isBound(proposal,sender)&&authority.peek(frame).grant?.id===grant.id&&authority.peek(frame).grant?.scopeEpoch===grant.scopeEpoch;
   const time=now();for(const [key,value]of producers)if(value.until<=time)producers.delete(key);
   if(!producers.has(proposal.producerToken)&&producers.size>=maxProducers)return rejected('host-producer-capacity');
   // Validate the complete shape before any storage read; revision and timestamps are owner values.
   const observedAt=new Date(time).toISOString(),validUntil=new Date(Math.min(time+60000,Date.parse(grant.expiresAt))).toISOString();
   let batch=surfaceBatch(proposal,{scope,binding:proposal,profile,urlPolicy:profile.urlPolicy,sourceRevision:1,observedAt,validUntil});
   const semanticFingerprint=digest({profileId:profile.id,profileVersion:profile.revision,payload:proposal.payload});
   const recorded=producers.get(proposal.producerToken);
   if(recorded&&(recorded.scopeKey!==scope.key||recorded.grantId!==grant.id||recorded.scopeEpoch!==grant.scopeEpoch))return rejected('host-producer-scope-changed');
   const previous=recorded;
   if(previous&&proposal.localSeq<=previous.seq)return previous.seq===proposal.localSeq&&previous.fingerprint===semanticFingerprint?{state:'duplicate',localSeq:proposal.localSeq,receiptId:previous.receiptId}:rejected('replayed-host-proposal');
   if(!guard())return rejected('stale-host-scope');
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
   producers.set(proposal.producerToken,{scopeKey:scope.key,grantId:grant.id,scopeEpoch:grant.scopeEpoch,seq:proposal.localSeq,fingerprint:semanticFingerprint,receiptId,until:Math.min(Date.parse(grant.expiresAt),time+20000)});
   return {state:'accepted',localSeq:proposal.localSeq,receiptId};
  }catch{return rejected('invalid-host-observation');}
  finally{if(request)admissions.delete(request);}
 }
 return Object.freeze({gate,ingest});
}
