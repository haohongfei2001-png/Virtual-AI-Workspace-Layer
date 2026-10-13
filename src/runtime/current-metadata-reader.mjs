import {exactHostRecord} from '../host/contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {instant} from '../navigation/projection.mjs';
const id=v=>tokenOK(v)&&!['constructor','prototype','__proto__'].includes(v);
const requireValue=v=>{if(!v)throw Error('invalid-current-metadata');};
function denseList(value,max){requireValue(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1);for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));requireValue(d&&Object.hasOwn(d,'value'));}return value;}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const fields=['messageId','mappingNodeId','role','authorId','selfMatchCandidate','rawCreateTime','precisionCandidate','lineage'];
function reduceMetadata(metadata,conversationId,wanted){
 requireValue(exactHostRecord(metadata,['protocol','conversationId','state','messages','gaps','coverage'])&&metadata.protocol==='vaiwl-conversation-metadata-candidate/1'&&metadata.conversationId===conversationId&&['candidate','partial'].includes(metadata.state)&&metadata.coverage==='observed-only'&&Array.isArray(metadata.messages)&&metadata.messages.length<=256&&Array.isArray(metadata.gaps)&&metadata.gaps.length<=256);
 denseList(metadata.messages,256);denseList(metadata.gaps,256);
 const gaps=metadata.gaps.map(g=>{requireValue(exactHostRecord(g,Object.hasOwn(g??{},'nodeId')?['reason','nodeId']:['reason'])&&typeof g.reason==='string'&&/^[a-z0-9-]{1,80}$/.test(g.reason)&&(!Object.hasOwn(g,'nodeId')||id(g.nodeId)));return {...g};});
 requireValue(metadata.state==='partial'||gaps.length===0);
 const seen=new Set(),messages=[];
 for(const m of metadata.messages){
  requireValue(exactHostRecord(m,fields)&&id(m.messageId)&&id(m.mappingNodeId)&&!seen.has(m.messageId)&&['user','assistant','system','tool','unknown'].includes(m.role)&&typeof m.selfMatchCandidate==='boolean'&&(m.authorId===null||typeof m.authorId==='string'&&m.authorId.length>0&&m.authorId.length<=256)&&['unknown','second','millisecond'].includes(m.precisionCandidate));seen.add(m.messageId);
  requireValue(m.rawCreateTime===null||typeof m.rawCreateTime==='number'&&Number.isFinite(m.rawCreateTime)||typeof m.rawCreateTime==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(m.rawCreateTime)&&instant(m.rawCreateTime)!==null);
  const precision=typeof m.rawCreateTime==='string'?(m.rawCreateTime.includes('.')?'millisecond':'second'):'unknown';requireValue(m.precisionCandidate===precision&&(!m.selfMatchCandidate||m.role==='user'&&m.authorId!==null));
  let lineage=null;if(m.lineage!==null){const l=m.lineage;requireValue(exactHostRecord(l,['kind','nodeIds','fingerprint'])&&l.kind==='derived'&&denseList(l.nodeIds,32)&&l.nodeIds.length>0&&l.nodeIds.every(id)&&new Set(l.nodeIds).size===l.nodeIds.length&&l.nodeIds.at(-1)===m.mappingNodeId&&typeof l.fingerprint==='string'&&/^[0-9a-f]{64}$/.test(l.fingerprint));denseList(l.nodeIds,32);requireValue(l.fingerprint===digest([conversationId,l.nodeIds]));lineage={kind:l.kind,nodeIds:[...l.nodeIds],fingerprint:l.fingerprint};}
  // This bounded result stays private to the worker; author equality is only a candidate.
  if(wanted.has(m.messageId))messages.push({messageId:m.messageId,mappingNodeId:m.mappingNodeId,role:m.role,authorId:m.authorId,selfMatchCandidate:m.selfMatchCandidate,rawCreateTime:m.rawCreateTime,precisionCandidate:m.precisionCandidate,lineage});
 }
 const missing=[...wanted].some(messageId=>!seen.has(messageId));if(missing){requireValue(gaps.length<256);gaps.push({reason:'current-message-missing'});}
 return {protocol:metadata.protocol,conversationId,state:missing?'partial':metadata.state,messages,gaps,coverage:'observed-only'};
}
/** Current-object private readback only. No repository writes, send ACKs or events. */
export function createCurrentMetadataReader({observations,provider,enabled=false,now=Date.now}={}){
 if(typeof observations?.withCurrent!=='function'||enabled&&typeof provider?.readCurrentConversation!=='function'||typeof enabled!=='boolean'||typeof now!=='function')throw Error('invalid-current-metadata-reader');
 const readCurrent=enabled?provider.readCurrentConversation.bind(provider):null;
 let stopped=false,busy=null;
 function read(proofId){
  if(stopped)return Promise.reject(Error('current-metadata-stopped'));
  if(!enabled)return Promise.reject(Error('current-metadata-disabled'));
  if(!id(proofId))return Promise.reject(Error('invalid-body-proof'));
  if(busy)return busy.proofId===proofId?busy.promise:Promise.reject(Error('current-metadata-busy'));
  const attempt={proofId,abort:new AbortController(),promise:null};busy=attempt;
  const check=()=>{if(stopped||busy!==attempt||attempt.abort.signal.aborted)throw Error('current-metadata-stopped');};
  attempt.promise=Promise.resolve().then(()=>observations.withCurrent(proofId,async context=>{
   check();requireValue(context&&typeof context.guard==='function'&&context.signal&&id(context.conversationId)&&Number.isSafeInteger(context.bodyEpoch)&&context.bodyEpoch>=0&&denseList(context.messageIds,256)&&context.messageIds.every(id)&&new Set(context.messageIds).size===context.messageIds.length);
   const currentGuard=context.guard,currentSignal=context.signal;
   const guard=()=>{check();if(currentSignal.aborted||currentGuard()!==true)throw Error('stale-body-proof');};guard();
   const conversationId=context.conversationId,bodyEpoch=context.bodyEpoch,wanted=new Set(context.messageIds);
   let metadata={protocol:'vaiwl-conversation-metadata-candidate/1',conversationId,state:'candidate',messages:[],gaps:[],coverage:'observed-only'};
   if(wanted.size){
    const principal=context.scope?.accountId,account=context.scope?.organizationId,profile=context.providerProfile,transport=context.providerTransport;
    requireValue(typeof principal==='string'&&/^principal_[0-9a-f]{64}$/.test(principal)&&typeof account==='string'&&/^context_[0-9a-f]{64}$/.test(account)&&id(profile)&&transport==='worker-fixed-fetch');
    const signal=AbortSignal.any([currentSignal,attempt.abort.signal]);
    let onAbort;const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(Error('current-metadata-aborted'));signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
    let result;try{result=await Promise.race([readCurrent({conversationId,expectedPrincipalKey:principal,expectedContextKey:account,signal}),cancelled]);}finally{signal.removeEventListener('abort',onAbort);}
    guard();const checkedAt=now();requireValue(exactHostRecord(result,['principalKey','contextKey','expiresAt','providerProfile','transport','metadata'])&&result.principalKey===principal&&result.contextKey===account&&result.providerProfile===profile&&result.transport===transport&&instant(result.expiresAt)!==null&&Number.isFinite(checkedAt)&&instant(result.expiresAt)>checkedAt);
    metadata=reduceMetadata(result.metadata,conversationId,wanted);
   }
   guard();const value={state:metadata.state,conversationId,bodyEpoch,metadata};requireValue(new TextEncoder().encode(JSON.stringify(value)).length<=65536);return freeze(value);
  })).then(result=>{check();return result;}).finally(()=>{attempt.abort.abort();if(busy===attempt)busy=null;});
  return attempt.promise;
 }
 function stop(){if(stopped)return;stopped=true;busy?.abort.abort();}
 return Object.freeze({read,stop});
}
