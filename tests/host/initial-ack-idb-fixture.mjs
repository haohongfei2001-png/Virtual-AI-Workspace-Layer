/** Portable test-only composition of the existing evidence-revalidation fixture.
 * Caller supplies storage. Real binding/provider/owners/repositories; explicit
 * synthetic HTTP and document facts, never production Host/MV3 acceptance.
 */
import {digest} from '../../src/data/hash.mjs';
const assert=Object.assign((v,m='fixture assertion')=>{if(!v)throw Error(m);},{equal:(a,b,m='fixture equality')=>{if(!Object.is(a,b))throw Error(m);},notEqual:(a,b,m='fixture inequality')=>{if(Object.is(a,b))throw Error(m);},deepEqual:(a,b,m='fixture structural equality')=>{if(digest(a)!==digest(b))throw Error(m);}});
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository, freeEvidenceKey} from '../../src/data/free-evidence-repository.mjs';
import {freeRecoveryStatus} from '../../src/data/free-recovery-status.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createSessionProvider} from '../../src/runtime/session-provider.mjs';
import {OFFLINE_HISTORY_PROFILE} from '../../src/runtime/historical-send-profile.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {currentObservation} from '../../src/host/current-observation-batch.mjs';

const NOW=Date.parse('2026-10-15T00:00:00Z');
const C='11111111-1111-4111-8111-111111111111';
const ORIGIN='http://127.0.0.1:3210',URL=ORIGIN+'/c/'+C;
const iso=()=>new Date(NOW).toISOString();
async function fixture(t,{history=false,storage,databaseName='evidence_revalidation_'+crypto.randomUUID(),initialPrincipal='self'}={}) {
 if(!storage||typeof storage.open!=='function')throw Error('explicit-indexeddb-required');
 let service,n=0,seq=0,localSeq=0,binding,scope,proof=null,wall=NOW,applyHook=null,pageHook=null,principal=initialPrincipal,author=initialPrincipal;
 const nowISO=()=>new Date(wall).toISOString();
 const messages=['m1'],visible=['m1'],calls=[],applies=[],times=new Map();
 const ack={id:'offline_ack',revision:1,providerProfile:'chatgpt-session-v1',ack:{kind:'authenticated-message-readback',acceptedStates:['fixture-accepted']}};
 const historyProfile=history?OFFLINE_HISTORY_PROFILE:null;
 const base=new ScopeRepository({indexedDB:storage,databaseName});
 const workspace=new WorkspaceRepository({baseRepository:base});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:nowISO,hostObservationGate:(s,r)=>service?.ackAdmission(s,r)??service?.continuations.admission(s,r)});
 const apply=evidence.apply.bind(evidence);
 evidence.apply=async(...args)=>{if(applyHook){const hook=applyHook;applyHook=null;await hook(...args);}const result=await apply(...args);applies.push({source:args[1].batch.sources[0],request:structuredClone(args[1]),result});return result;};
 const page=evidence.page.bind(evidence);evidence.page=async(...args)=>{const result=await page(...args);if(pageHook){const hook=pageHook;pageHook=null;await hook(result,...args);}return result;};
 const provider=createSessionProvider({origin:ORIGIN,now:()=>wall,profile:{id:'chatgpt-session-v1',currentConversationReadEnabled:true,sendAckProfile:ack,...(historyProfile?{historicalSendProfile:historyProfile}:{})},fetch:async (url,options)=>{
  calls.push({url,method:options.method});
  const mapping=Object.fromEntries(messages.map((id,index)=>['node_'+id,{id:'node_'+id,parent:index?'node_'+messages[index-1]:null,message:{id,author:{id:author,role:'user'},status:'fixture-accepted',...(history?{original_send:{author_id:author,conversation_id:C,kind:'new-send',state:'committed',precision:'second',sent_at:times.get(id)??'2026-08-31T00:00:00Z'}}:{})}}]));
  const payload=url.endsWith('/api/auth/session')?{user:{id:principal},expires:'2026-10-15T01:00:00Z',accessToken:'OFFLINE_FIXTURE_ONLY'}:url.includes('/accounts/check/')?{accounts:{personal:{account:{account_id:'personal',structure:'personal'}}}}:{id:C,history_semantics:OFFLINE_HISTORY_PROFILE.semantics,mapping};
  const response=new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:url});return response;
 }});
 const surface={id:'surface',revision:1,sendIntent:{formSelector:'#composer',editorSelector:'#editor',sendButtonSelector:'#send',enterSends:false},currentBody:{rootSelector:'main',conversationIdAttribute:'data-id',messageSelector:'article',messageIdAttribute:'data-id'},urlPolicy:createURLPolicy({origin:ORIGIN})};
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:URL};
 const frame={tabId:1,frameId:0,documentId:'document',actualURL:URL,documentLifecycle:'active',incognito:false};
 function construct(){return createHostBindingService({extensionId:'extension',getFrame:async()=>({documentId:'document',documentLifecycle:'active',url:URL}),allowedURL:u=>u===URL,provider,profile:{id:'personal',singlePersonalDefault:true},repository:base,workspaceRepository:workspace,freeEvidenceRepository:evidence,surfaceProfiles:new Map([[surface.id,surface]]),currentMetadataReadEnabled:true,sendCandidatesEnabled:true,sendAckProfile:ack,historicalSendProfile:historyProfile,now:()=>wall,makeId:()=>`token_${++n}`});}
 service=construct();t.after(()=>{service.stop();base.close();});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 async function bind(){const h=await request('HOST_HELLO');assert.equal(h.ok,true);binding=h.binding;const r=await request('HOST_REFRESH',{documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch});assert.equal(r.state,'verified');scope=service.authority.scopeFor(frame);assert(scope);}
 const ev=fieldPaths=>({profileId:surface.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths,receiptId:null});
 const packet=(kind,payload,bodyProofId=null)=>({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:++localSeq,profileId:surface.id,profileVersion:1,bodyProofId,kind,payload});
 const body=()=>({conversationId:C,messageIds:[...visible],association:'explicit-body-id',regionEpoch:1,evidence:ev(['current-body-explicit-id','current-body-message-ids'])});
 const native=()=>({candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:'Same native title',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:URL,liveHandle:null},evidence:ev(['history','href'])}],membershipClaims:[],coverageClaims:[],detachedHandles:[]});
 async function observe(title=null){const surfacePayload=native();if(title!==null)surfacePayload.candidates[0].nativeTitle=title;const r=await service.handle(currentObservation(packet('current-object',body()),surfacePayload),sender);if(r.bodyProofId)proof=r.bodyProofId;return r;}
 async function intent(id){const r=await service.handle(packet('send-candidate',{intentId:id,conversationId:C,messageId:null,operationId:null,stage:'intent',observedAt:nowISO(),evidence:ev(['native-send-intent'])},proof),sender);assert.equal(r.state,'accepted');assert(await service.sendCandidates.pendingIntent(proof,id),'intent is genuinely correlated to the authenticated baseline');}
 async function recover(){const old=await evidence.read(scope),db=await base.open();assert(Object.keys(old.sources).length>0);
  await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),q=store.get(freeEvidenceKey(scope.key));q.onsuccess=()=>store.put({...q.result,checksum:'0'.repeat(64)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const status=await freeRecoveryStatus(evidence,scope,'evidence');assert.equal(status.recoverable,true);
  const result=await evidence.recover(scope,{operationId:'real_checksum_repair',damagedHash:status.damagedHash});assert.equal(result.ok,true);
  const restored=await evidence.read(scope);for(const source of Object.values(restored.sources))assert.equal(source.revoked,true);
  for(const table of ['events','hints','coverage'])assert.deepEqual(restored[table],old[table]);return restored;
 }
 await bind();assert.equal((await observe()).state,'accepted');
 return {base,workspace,evidence,calls,applies,ack,surface,frame,now:nowISO,setPrincipal:value=>principal=value,setAuthor:value=>author=value,tick:ms=>wall+=ms,setTime:(id,time)=>times.set(id,time),onApply:fn=>applyHook=fn,onPage:fn=>pageHook=fn,invalidate:()=>service.invalidate({tabId:1,documentId:'document'}),get scope(){return scope;},get service(){return service;},get proof(){return proof;},observe,intent,recover,
 add(id){messages.push(id);visible.push(id);},visible(ids){visible.splice(0,visible.length,...ids);},
 async restart(){const oldProof=proof,oldGrant=service.authority.peek(frame).grant?.id;service.stop();service=construct();seq=0;localSeq=0;proof=null;await bind();assert.notEqual(service.authority.peek(frame).grant.id,oldGrant);assert.equal(service.observations.isCurrentProof(oldProof),false);},
 async read(){return evidence.read(scope);}};
}
function liveRows(state,table){return Object.values(state[table]).filter(r=>!r.revoked&&state.sources[r.sourceId]?.revoked===false);}
async function firstAck(h){await h.intent('send_m2');h.add('m2');assert.equal((await h.observe()).state,'accepted');const state=await h.read();assert.equal(liveRows(state,'hints').length,1);assert.equal(liveRows(state,'hints')[0].messageId,'m2');return state;}


export {fixture,firstAck,liveRows,C,NOW};
