import {ScopeRepository} from '../../../src/b1/scope-repository.mjs';
import {createHostBindingService} from '../../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../../src/host/url-policy.mjs';
export const C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444',P='g-p-11111111111111111111111111111111';
const url='https://chatgpt.com/',sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',documentLifecycle:'active',url};
const frame={tabId:1,frameId:0,documentId:'doc',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
export const ordinary=(ids=[C])=>JSON.stringify({items:ids.map(id=>({id,title:'原始标题 '+id,gizmo_id:null,update_time:123,preview:'must-not-persist'})),offset:0,limit:100,total:ids.length});
export async function directoryHarness(indexedDB,{registered=true,mode='private',delay=null,manualDeadline=false}={}){
 let seq=0,n=0,calls=0,principal='A',elapsed=0,time=Date.parse('2026-10-14T00:00:00Z'),payload=ordinary(),timers=new Map(),timerId=0;
 const base=new ScopeRepository({indexedDB,databaseName:'directory-owner-'+crypto.randomUUID()}),proofs=new WeakMap(),seen=[];
 const provider={async read(context,options){calls++;seen.push({context,options});if(delay)await delay(context,options);const result=Object.freeze({state:'candidate'});proofs.set(result,{context:mode==='context-clone'?structuredClone(context):context,payload,expiresAt:new Date(time+60000).toISOString()});return mode==='result-clone'?structuredClone(result):result;},directoryFor:result=>proofs.get(result)??null};
 const profile={id:'directory-fixture',revision:1,urlPolicy:createURLPolicy({profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),...(registered?{directoryProvider:provider}:{})},profiles=new Map([[profile.id,profile]]);
 const service=createHostBindingService({extensionId:'ext',getFrame:async()=>({documentId:'doc',url,documentLifecycle:'active'}),allowedURL:u=>u===url,repository:base,provider:{read:async()=>({principalId:principal,expiresAt:new Date(time+60000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'session',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:profiles,now:()=>time,makeId:()=>`id_${++n}`,...(manualDeadline?{elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id)}:{})});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:++seq},sender),binding={...hello.binding,profileId:profile.id,profileVersion:profile.revision};
 if((await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:++seq,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch},sender)).state!=='verified')throw Error('fixture-bind-failed');
 const scope=service.authority.scopeFor(frame),native=service.nativeRepository;
 const evidence=fieldPaths=>({profileId:profile.id,profileVersion:profile.revision,sourceKind:'native-dom',regionEpoch:1,fieldPaths,receiptId:null});
 const dom=async()=>{
  const candidates=[['project',P],['conversation',C]].map(([entity,id])=>({renderKey:entity+':'+id,entity,nativeTitle:'DOM '+id,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?'https://chatgpt.com/g/'+id+'/project':'https://chatgpt.com/c/'+id,liveHandle:null},evidence:evidence(['history','href'])}));
  return service.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,profileId:profile.id,profileVersion:profile.revision,localSeq:++seq,bodyProofId:null,kind:'surface-delta',payload:{candidates,membershipClaims:[{conversationId:C,asserted:'PROJECT',projectId:P,upstreamRevision:null,evidence:evidence(['members','current-project-route'])}],coverageClaims:[],detachedHandles:[]}},sender);
 };
 return {service,base,native,scope,binding,sender,profile,profiles,provider,seen,dom,observe:(kind='ordinary',projectId=null)=>service.observations.observeDirectory(binding,sender,native,{kind,projectId}),setPayload:value=>{payload=value;},get calls(){return calls;},advance(ms){time+=ms;},expire(){elapsed=6000;for(const timer of [...timers.values()])if(timer.ms<=6000)timer.fn();},switchScope(){principal='B';service.invalidate({tabId:1});},close(){service.stop();base.close();}};
}
