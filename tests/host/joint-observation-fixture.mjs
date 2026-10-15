/** Explicit offline identity/readback fixture around real production owners. Never live account authority. */
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {NativeRepository} from '../../src/data/native-repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostObservationOwner} from '../../src/runtime/host-observation-owner.mjs';
import {createHostSendAckOwner} from '../../src/runtime/host-send-ack-owner.mjs';
import {createHostContinuationOwner} from '../../src/runtime/host-continuation-owner.mjs';
import {prepareSendAckAdmission} from '../../src/runtime/send-ack-admission.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {digest} from '../../src/data/hash.mjs';
const NOW=Date.parse('2026-10-14T00:00:00Z');
export async function createJointObservationFixture({indexedDB,after=()=>{},databaseName='joint_'+crypto.randomUUID(),conversationId='C',onNativeDelta=null,initialMessages=['M'],dropContinuation=false}={}){
 const factory=indexedDB,base=new ScopeRepository({indexedDB:factory,databaseName}),workspace=new WorkspaceRepository({baseRepository:base});after(()=>base.close());
 const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'principal_'+digest(['chatgpt-principal-v1','self']),organizationId:'context_'+digest(['chatgpt-context-v1','self','personal'])}),url='https://host.test/c/'+conversationId,profile={id:'surface',revision:1,currentBody:{rootSelector:'main',conversationIdAttribute:'data-id',messageSelector:'article',messageIdAttribute:'data-id'},urlPolicy:{parse:()=>({kind:'conversation',conversationId,navigationURL:url})}},ackProfile={id:'ack',revision:1,providerProfile:'provider',ack:{kind:'authenticated-message-readback',acceptedStates:['accepted']}},profiles=new Map([[profile.id,profile],[ackProfile.id,ackProfile]]);
 let wall=NOW,valid=true,drainEnabled=true,ackEnabled=true,hook=null,n=0,proofCounter=0;
 const grant={id:'grant',scopeEpoch:1,expiresAt:new Date(NOW+60000).toISOString(),principal:{providerProfile:'provider',transport:'worker-fixed-fetch'}},handshake={verify:async()=>valid,isBound:()=>valid,matchesFrame:()=>valid},authority={peek:()=>valid?{state:'verified',grant}:{state:'unverified'},scopeFor:()=>valid?scope:null};
 const sender={tab:{id:1}},binding={protocol:'vaiwl-host-observation/1',documentToken:'doc',producerToken:'producer',routeEpoch:1,profileId:'surface',profileVersion:1,bodyProofId:null};
 const evidence=paths=>({profileId:'surface',profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:paths,receiptId:null});
 let observations,ack,drain;
 const native=new NativeRepository({baseRepository:base,workspaceRepository:workspace,hostObservationGate:(s,r)=>{const gate=observations.gate(s,r);if(!dropContinuation||!gate?.continuation)return gate;const changed={...gate};delete changed.continuation;delete changed.continuationAdmission;delete changed.continuationAuthority;return changed;},clock:()=>new Date(wall).toISOString()});
 const free=new FreeEvidenceRepository({baseRepository:base,hostObservationGate:(s,r)=>ack.gate(s,r)??drain.admission(s,r),clock:()=>new Date(wall).toISOString()});
 function admission(context){return prepareSendAckAdmission({profile:ackProfile,context:{proofId:'proof',conversationId,bodyEpoch:context.bodyEpoch,scopeKey:scope.key,principalKey:scope.accountId,contextKey:scope.organizationId,providerProfile:'provider',providerTransport:'worker-fixed-fetch'},candidate:{protocol:'vaiwl-send-candidate/1',intentId:'intent',conversationId,messageId:'M',operationId:null,stage:'correlated',observedAt:new Date(NOW-1000).toISOString()},readback:{proofId:'proof',conversationId,bodyEpoch:context.bodyEpoch,principalKey:scope.accountId,contextKey:scope.organizationId,providerProfile:'provider',transport:'worker-fixed-fetch',expiresAt:new Date(NOW+60000).toISOString(),message:{messageId:'M',mappingNodeId:'node',role:'user',authorPrincipalKey:scope.accountId,lineage:{kind:'derived',nodeIds:['node'],fingerprint:digest([conversationId,['node']])},acceptanceState:'accepted'}},intentAt:new Date(NOW-1000).toISOString(),observedAt:new Date(wall).toISOString()});}
 observations=createHostObservationOwner({handshake,authority,getFrame:async()=>({url,documentId:'doc'}),profiles:new Map([[profile.id,profile]]),now:()=>wall,makeId:()=> ++proofCounter===1?'proof':'proof_'+proofCounter,ackAdmission:(scope,request)=>ack?.gate(scope,request),onNativeDelta:proof=>onNativeDelta?onNativeDelta(proof):observations.withCurrent(proof,async context=>{if(hook)await hook();if(ackEnabled)await ack.consume({admission:admission(context),context,guard:()=>{if(!context.guard())throw Error('stale');}});})});
 const recreate=()=>drain=createHostContinuationOwner({nativeRepository:native,evidenceRepository:free,profileFor:id=>profiles.get(id)});recreate();
 ack=createHostSendAckOwner({evidenceRepository:()=>free,profileFor:id=>profiles.get(id),commitNative:input=>observations.commitAcknowledged(input),drain:input=>drainEnabled?drain.drain(input):{state:'pending'},now:()=>wall});
 const body={...binding,localSeq:++n,kind:'current-object',payload:{conversationId,messageIds:initialMessages,association:'explicit-body-id',regionEpoch:1,evidence:evidence(['current-body-explicit-id','current-body-message-ids'])}};
 if((await observations.ingest(body,sender,native)).state!=='accepted')throw Error('fixture-body-rejected');
 const surface=(title='Real native title')=>({...binding,localSeq:++n,kind:'surface-delta',payload:{candidates:[{renderKey:'conversation:'+conversationId,entity:'conversation',nativeTitle:title,titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:conversationId,navigationURL:url,liveHandle:null},evidence:evidence(['history','href'])}],membershipClaims:[],coverageClaims:[],detachedHandles:[]}});
 return {tick(ms){wall+=ms;},async updateBody(messageIds){return observations.ingest({...body,localSeq:++n,payload:{...body.payload,messageIds}},sender,native);},base,factory,scope,native,free,profile,ackProfile,profiles,observations,ack,surface,ingest:p=>observations.ingest(p,sender,native),async recover(){recreate();return drain.drain({scope,guard:()=>valid,profileId:'ack',profileVersion:ackProfile.revision});},disableDrain(){drainEnabled=false;},disableAck(){ackEnabled=false;},resumeAck(){ackEnabled=true;},close(){base.close();},revoke(){valid=false;},hook(fn){hook=fn;},async pure(){return observations.withCurrent('proof',context=>ack.consume({admission:admission(context),context,guard:()=>{if(!context.guard())throw Error('stale');}}));}};
}

import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {createCurrentMetadataReader} from '../../src/runtime/current-metadata-reader.mjs';
import {createHostSendCandidates} from '../../src/runtime/host-send-candidates.mjs';
/** Real fixed-provider/reader/correlator ownership, with explicitly fake local
 * session and response payloads. The fixture never persists an ACK directly. */
export async function createAuthenticatedJointFixture(options={}){
 const wall=NOW,conversationId='11111111-1111-4111-8111-111111111111';let sends,added=false,calls=0;
 const h=await createJointObservationFixture({...options,conversationId,initialMessages:['m1'],onNativeDelta:proof=>sends.observe(proof)});
 const provider=createSessionProvider({profile:{id:'provider',currentConversationReadEnabled:true,sendAckProfile:h.ackProfile},now:()=>wall,fetch:async(url,request)=>{
  if(request.method!=='GET')throw Error('fixture-unexpected-native-write');calls++;
  const payload=url.endsWith('/api/auth/session')?{user:{id:'self'},expires:'2026-10-14T01:00:00Z',accessToken:'OFFLINE_FIXTURE_TOKEN'}:url.includes('/accounts/check/')?{accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}}:{id:conversationId,mapping:{n1:{id:'n1',parent:null,message:{id:'m1',author:{id:'self',role:'user'}}},...(added?{n2:{id:'n2',parent:'n1',message:{id:'m2',author:{id:'self',role:'user'},status:'accepted'}}}:{})}};
  const response=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const reader=createCurrentMetadataReader({observations:h.observations,provider,enabled:true,now:()=>wall});sends=createHostSendCandidates({observations:h.observations,reader,enabled:true,now:()=>wall,onAcknowledged:input=>h.ack.consume(input)});
 await sends.observe('proof');await sends.intent('proof',{intentId:'send',kind:'send',isComposing:false});
 return {...h,conversationId,get calls(){return calls;},async send(){added=true;await h.updateBody(['m1','m2']);return h.ingest(h.surface('Authenticated native title'));},close(){sends.stop();reader.stop();h.close();}};
}
