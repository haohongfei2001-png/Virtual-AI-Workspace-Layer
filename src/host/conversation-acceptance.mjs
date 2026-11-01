import {parseConversationMetadata} from './conversation-metadata.mjs';
import {validateSendAckProfile} from '../runtime/send-ack-admission.mjs';
import {digest} from '../data/hash.mjs';

/** Pure extraction only. Callers must establish authenticated response provenance. */
export function extractConversationAcceptance(input){
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('invalid-acceptance-input');
 const keys=['conversationId','payload','principalId','profile'];
 if(Reflect.ownKeys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input,k),'value')))throw Error('invalid-acceptance-input');
 const {conversationId,payload,principalId,profile}=input;
 const validated=validateSendAckProfile(profile);
 const metadata=parseConversationMetadata({conversationId,payload,principalId});
 if(metadata.state!=='candidate'||metadata.gaps.length||principalId===null)return Object.freeze([]);
 // Metadata admission already bounded and structurally checked this exact JSON.
 const mapping=JSON.parse(payload).mapping,states=new Map();
 for(const node of Object.values(mapping)){
  const message=node.message;if(!message)continue;
  if(states.has(message.id)&&states.get(message.id)!==message.status)throw Error('acceptance-state-conflict');
  states.set(message.id,message.status);
 }
 const authorPrincipalKey='principal_'+digest(['chatgpt-principal-v1',principalId]);
 return Object.freeze(metadata.messages.flatMap(candidate=>{
  const message=mapping[candidate.mappingNodeId].message;
  if(candidate.role!=='user'||message.author?.role!=='user'||message.author?.id!==principalId||message.id!==candidate.messageId||!validated.ack.acceptedStates.includes(message.status))return [];
  const lineage=Object.freeze({...candidate.lineage,nodeIds:Object.freeze([...candidate.lineage.nodeIds])});
  return [Object.freeze({messageId:candidate.messageId,mappingNodeId:candidate.mappingNodeId,role:'user',authorPrincipalKey,lineage,acceptanceState:message.status})];
 }));
}
