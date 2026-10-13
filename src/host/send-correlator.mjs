import {digest} from '../data/hash.mjs';
import {tokenOK} from '../b1/identity.mjs';
const fields=['scopeKey','documentToken','producerToken','routeEpoch','bodyEpoch','conversationId'];
/** RAM-only candidate correlation. Caller binding and selfMatchCandidate are not
 * authorization, body association or self-send proofs. No ACK/time is issued. */
export function createSendCorrelator({now=Date.now,windowMs=30000,maxPending=32}={}){
 if(typeof now!=='function'||!Number.isInteger(windowMs)||windowMs<1||windowMs>30000||!Number.isInteger(maxPending)||maxPending<1||maxPending>32)throw Error('invalid-send-correlator');
 let binding=null,baseline=null,lastTime=null,stopped=false;const pending=new Map(),used=new Set();
 function invalidate(){binding=null;baseline=null;lastTime=null;pending.clear();used.clear();}
 function clock(){const t=now();if(!Number.isFinite(t)||lastTime!==null&&t<lastTime){invalidate();throw Error('send-clock-invalid');}lastTime=t;for(const [id,v]of pending)if(t-v.at>=windowMs)pending.delete(id);return t;}
 function bind(value){
  if(stopped)throw Error('send-correlator-stopped');
  if(!value||Object.keys(value).length!==fields.length||!fields.every(k=>Object.hasOwn(value,k))||typeof value.scopeKey!=='string'||!value.scopeKey||value.scopeKey.length>1024||!['documentToken','producerToken','conversationId'].every(k=>tokenOK(value[k]))||!['routeEpoch','bodyEpoch'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0))throw Error('invalid-send-binding');
  if(binding&&fields.every(k=>binding[k]===value[k]))return;
  invalidate();binding=Object.freeze({...value});
 }
 function candidate(intent,stage,messageId=null){return Object.freeze({protocol:'vaiwl-send-candidate/1',intentId:intent.id,conversationId:binding.conversationId,messageId,operationId:null,stage,observedAt:new Date(intent.at).toISOString()});}
 function intent(value){
  if(stopped||!binding||!baseline)return null;
  const t=clock();
  if(!value||Object.keys(value).length!==3||!tokenOK(value.intentId)||value.kind!=='send'||value.isComposing!==false)return null;
  if(used.has(value.intentId))return null;
  // Bounded replay ledger; reaching capacity requires an explicit new binding.
  if(used.size>=256||pending.size>=maxPending)return null;
  const row={id:value.intentId,at:t};pending.set(row.id,row);used.add(row.id);return candidate(row,'intent');
 }
 function observe(batch){
  if(stopped||!binding)return [];
  clock();
  if(!batch||batch.protocol!=='vaiwl-conversation-metadata-candidate/1'||batch.conversationId!==binding.conversationId||batch.coverage!=='observed-only'||!Array.isArray(batch.messages)||batch.messages.length>256||batch.state!=='candidate'||!Array.isArray(batch.gaps)||batch.gaps.length){baseline=null;pending.clear();return [];}
  const next=new Map();
  for(const message of batch.messages){
   const lineage=message?.lineage;
   if(!tokenOK(message?.messageId)||next.has(message.messageId)||!lineage||lineage.kind!=='derived'||!tokenOK(lineage.fingerprint)||!Array.isArray(lineage.nodeIds)||!lineage.nodeIds.length||lineage.nodeIds.length>32||!lineage.nodeIds.every(tokenOK)||new Set(lineage.nodeIds).size!==lineage.nodeIds.length||lineage.nodeIds.at(-1)!==message.mappingNodeId){baseline=null;pending.clear();return [];}
   next.set(message.messageId,{lineage:lineage.fingerprint,node:message.mappingNodeId,ancestors:lineage.nodeIds.slice(0,-1),semantic:digest([message.role,message.authorId,message.rawCreateTime,message.precisionCandidate]),eligible:message.role==='user'&&message.selfMatchCandidate===true&&typeof message.authorId==='string'&&message.authorId.length>0});
  }
  if(!baseline){baseline=next;return [];}
  // Window replacement, an edited identity or changed lineage loses causality.
  if([...baseline].some(([id,prior])=>!next.has(id)||next.get(id).lineage!==prior.lineage||next.get(id).node!==prior.node||next.get(id).semantic!==prior.semantic)){baseline=next;pending.clear();return [];}
  const ancestors=new Set([...baseline.values()].flatMap(m=>m.ancestors)),leaves=[...baseline.values()].filter(m=>!ancestors.has(m.node));
  const additions=[...next].filter(([id])=>!baseline.has(id));baseline=next;
  if(!additions.length)return [];
  const eligible=additions.filter(([,m])=>m.eligible);
  if(pending.size!==1||eligible.length!==1||leaves.length>1||leaves.length===1&&!eligible[0][1].ancestors.includes(leaves[0].node)){pending.clear();return [];}
  const intent=pending.values().next().value;pending.clear();return [candidate(intent,'correlated',eligible[0][0])];
 }
 function settle({intentId,stage}={}){if(stopped||!binding)return null;clock();if(!['failed','cancelled'].includes(stage))return null;const row=pending.get(intentId);if(!row)return null;pending.delete(intentId);return candidate(row,stage);}
 function stop(){invalidate();stopped=true;}
 return Object.freeze({bind,observe,intent,settle,invalidate,stop});
}
