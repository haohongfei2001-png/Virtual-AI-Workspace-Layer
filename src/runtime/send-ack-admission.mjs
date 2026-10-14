import {tokenOK,normalizedScope} from '../b1/identity.mjs';
import {digest} from '../data/hash.mjs';
import {instant} from '../navigation/projection.mjs';
const requireValue=value=>{if(!value)throw Error('invalid-send-ack-admission');};
function record(value,keys){
 requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
 requireValue(Reflect.ownKeys(value).length===keys.length);
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);requireValue(descriptor&&Object.hasOwn(descriptor,'value'));}
 return value;
}
function list(value,max){requireValue(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype);const length=Object.getOwnPropertyDescriptor(value,'length')?.value;requireValue(Number.isInteger(length)&&length>0&&length<=max&&Reflect.ownKeys(value).length===length+1);for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));requireValue(d&&Object.hasOwn(d,'value'));}return value;}
const id=value=>tokenOK(value)&&!['__proto__','constructor','prototype'].includes(value);
const epoch=value=>Number.isSafeInteger(value)&&value>=0;
const principal=value=>typeof value==='string'&&/^principal_[0-9a-f]{64}$/.test(value);
const account=value=>typeof value==='string'&&/^context_[0-9a-f]{64}$/.test(value);
function time(value){requireValue(typeof value==='string'&&value.length<=40);const parsed=instant(value);requireValue(parsed!==null);return parsed;}
/** Pure validation of private caller-supplied readback data, NOT authority.
 * The caller must independently establish provider/ACK profile provenance and
 * fresh body/scope guards before and after this call. No grants or writes occur.
 * Message presence, role=user, selfMatchCandidate or HTTP success alone never ACK.
 */
export function prepareSendAckAdmission(input){
 record(input,['profile','context','candidate','readback','intentAt','observedAt']);
 const {profile,context,candidate,readback,intentAt,observedAt}=input;
 record(profile,['id','revision','providerProfile','ack']);record(profile.ack,['kind','acceptedStates']);
 requireValue(id(profile.id)&&Number.isSafeInteger(profile.revision)&&profile.revision>0&&id(profile.providerProfile)&&profile.ack.kind==='authenticated-message-readback');
 const accepted=list(profile.ack.acceptedStates,8);requireValue(accepted.every(id)&&new Set(accepted).size===accepted.length);
 record(context,['proofId','conversationId','bodyEpoch','scopeKey','principalKey','contextKey','providerProfile','providerTransport']);
 requireValue(id(context.proofId)&&id(context.conversationId)&&epoch(context.bodyEpoch)&&typeof context.scopeKey==='string'&&context.scopeKey.length>0&&context.scopeKey.length<=4096&&principal(context.principalKey)&&account(context.contextKey)&&context.providerProfile===profile.providerProfile&&context.providerTransport==='worker-fixed-fetch');
 requireValue(context.scopeKey===normalizedScope({verified:true,provider:'chatgpt',accountId:context.principalKey,organizationId:context.contextKey})?.key);
 record(candidate,['protocol','intentId','conversationId','messageId','operationId','stage','observedAt']);
 requireValue(candidate.protocol==='vaiwl-send-candidate/1'&&id(candidate.intentId)&&candidate.conversationId===context.conversationId&&id(candidate.messageId)&&candidate.operationId===null&&candidate.stage==='correlated'&&candidate.observedAt===intentAt);
 record(readback,['proofId','conversationId','bodyEpoch','principalKey','contextKey','providerProfile','transport','expiresAt','message']);
 for(const key of ['proofId','conversationId','bodyEpoch','principalKey','contextKey','providerProfile'])requireValue(readback[key]===context[key]);
 requireValue(readback.transport===context.providerTransport);
 const message=record(readback.message,['messageId','mappingNodeId','role','authorPrincipalKey','lineage','acceptanceState']);
 requireValue(message.messageId===candidate.messageId&&id(message.mappingNodeId)&&message.role==='user'&&message.authorPrincipalKey===context.principalKey&&accepted.includes(message.acceptanceState));
 const lineage=record(message.lineage,['kind','nodeIds','fingerprint']),nodes=list(lineage.nodeIds,32);
 requireValue(lineage.kind==='derived'&&nodes.every(id)&&new Set(nodes).size===nodes.length&&nodes.at(-1)===message.mappingNodeId&&lineage.fingerprint===digest([context.conversationId,nodes]));
 const start=time(intentAt),end=time(observedAt),expires=time(readback.expiresAt);
 requireValue(end>=start&&end-start<=30000&&expires>end);
 const ackWitness=Object.freeze({kind:'authenticated-message-readback',profileId:profile.id,profileVersion:profile.revision,semanticFingerprint:digest([profile.id,profile.revision,context.conversationId,message.messageId,message.authorPrincipalKey,message.mappingNodeId,lineage.fingerprint,message.acceptanceState])});
 return Object.freeze({conversationId:context.conversationId,messageId:message.messageId,firstObservedAt:observedAt,candidateInterval:Object.freeze({from:intentAt,through:observedAt}),clockBasis:'local-bounded',actorVerified:true,actorScopeKey:context.scopeKey,ackWitness});
}
