import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
const safeId=value=>tokenOK(value)&&!['__proto__','constructor','prototype'].includes(value);
const requireValue=(condition)=>{if(!condition)throw Error('invalid-current-body-proposal');};
function list(value,max){
 requireValue(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1);
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));requireValue(d&&Object.hasOwn(d,'value'));}
 return value;
}
/** Structural DOM claim validation only: this does not establish body authenticity,
 * scope, a readback receipt, message authorship or an accepted send. */
export function validateCurrentBodyProposal(proposal,{profile,actualURL}={}){
 const config=profile?.currentBody,messageIdentity=config?.conversationIdSource==='message-elements',configFields=['rootSelector','conversationIdAttribute','messageSelector','messageIdAttribute',...(messageIdentity?['conversationIdSource']:[])];
 requireValue(safeId(profile?.id)&&Number.isSafeInteger(profile.revision)&&profile.revision>0&&typeof profile.urlPolicy?.parse==='function'&&exactHostRecord(config,configFields)&&configFields.every(k=>typeof config[k]==='string'&&config[k].trim().length>0&&config[k].length<=256));
 requireValue(exactHostRecord(proposal,['protocol','documentToken','producerToken','localSeq','routeEpoch','profileId','profileVersion','bodyProofId','kind','payload']));
 requireValue(proposal.protocol==='vaiwl-host-observation/1'&&proposal.kind==='current-object'&&proposal.bodyProofId===null&&safeId(proposal.documentToken)&&safeId(proposal.producerToken)&&Number.isSafeInteger(proposal.localSeq)&&proposal.localSeq>0&&Number.isSafeInteger(proposal.routeEpoch)&&proposal.routeEpoch>=0&&proposal.profileId===profile.id&&proposal.profileVersion===profile.revision);
 const p=proposal.payload;requireValue(exactHostRecord(p,['conversationId','messageIds','association','regionEpoch','evidence'])&&Number.isSafeInteger(p.regionEpoch)&&p.regionEpoch>=0);
 const ids=list(p.messageIds,256);requireValue(ids.every(safeId)&&new Set(ids).size===ids.length);
 const e=p.evidence;requireValue(exactHostRecord(e,['profileId','profileVersion','sourceKind','regionEpoch','fieldPaths','receiptId'])&&e.profileId===profile.id&&e.profileVersion===profile.revision&&e.sourceKind==='native-dom'&&e.receiptId===null&&e.regionEpoch===p.regionEpoch);
 const paths=list(e.fieldPaths,8);requireValue(paths.every(v=>typeof v==='string'&&v.length>0&&v.length<=80));
 if(p.association==='explicit-body-id'){
  const route=profile.urlPolicy.parse(actualURL);requireValue(safeId(p.conversationId)&&route?.kind==='conversation'&&route.conversationId===p.conversationId&&paths.length===2&&paths[0]===(messageIdentity?'current-body-message-conversation-ids':'current-body-explicit-id')&&(!messageIdentity||ids.length>0)&&paths[1]==='current-body-message-ids');
 }else requireValue(p.association==='unproven'&&p.conversationId===null&&ids.length===0&&paths.length===1&&paths[0]==='current-body-unproven');
 requireValue(new TextEncoder().encode(JSON.stringify(proposal)).length<=65536);
 return Object.freeze({conversationId:p.conversationId,messageIds:Object.freeze([...ids]),association:p.association,regionEpoch:p.regionEpoch,evidence:Object.freeze({profileId:e.profileId,profileVersion:e.profileVersion,sourceKind:e.sourceKind,regionEpoch:e.regionEpoch,fieldPaths:Object.freeze([...paths]),receiptId:null})});
}
