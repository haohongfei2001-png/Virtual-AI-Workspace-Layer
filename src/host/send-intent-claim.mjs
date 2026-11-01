import {exactHostRecord} from './contract.mjs';
import {tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
const safeId=value=>tokenOK(value)&&!['__proto__','constructor','prototype'].includes(value);
const requireValue=condition=>{if(!condition)throw Error('invalid-send-intent-proposal');};
/** A structurally valid intent is only a candidate: never an ACK, author proof or write authority. */
export function validateSendIntentProposal(proposal,{profile,actualURL,current}={}){
 const config=profile?.sendIntent,selectors=['formSelector','editorSelector','sendButtonSelector'];
 const configFields=config&&Object.hasOwn(config,'enterSends')?[...selectors,'enterSends']:selectors;
 requireValue(safeId(profile?.id)&&Number.isSafeInteger(profile.revision)&&profile.revision>0&&typeof profile.urlPolicy?.parse==='function'&&exactHostRecord(config,configFields)&&selectors.every(k=>typeof config[k]==='string'&&config[k].trim().length>0&&config[k].length<=256)&&(!Object.hasOwn(config,'enterSends')||typeof config.enterSends==='boolean'));
 requireValue(exactHostRecord(proposal,['protocol','documentToken','producerToken','localSeq','routeEpoch','profileId','profileVersion','bodyProofId','kind','payload']));
 requireValue(proposal.protocol==='vaiwl-host-observation/1'&&proposal.kind==='send-candidate'&&safeId(proposal.bodyProofId)&&safeId(proposal.documentToken)&&safeId(proposal.producerToken)&&Number.isSafeInteger(proposal.localSeq)&&proposal.localSeq>0&&Number.isSafeInteger(proposal.routeEpoch)&&proposal.routeEpoch>=0&&proposal.profileId===profile.id&&proposal.profileVersion===profile.revision);
 requireValue(current&&safeId(current.proofId)&&safeId(current.conversationId)&&Number.isSafeInteger(current.regionEpoch)&&current.regionEpoch>=0&&current.proofId===proposal.bodyProofId);
 const p=proposal.payload;requireValue(exactHostRecord(p,['intentId','conversationId','messageId','operationId','stage','observedAt','evidence']));
 requireValue(safeId(p.intentId)&&p.conversationId===current.conversationId&&p.messageId===null&&p.operationId===null&&p.stage==='intent'&&typeof p.observedAt==='string'&&p.observedAt.length<=40&&instant(p.observedAt)!==null);
 const route=profile.urlPolicy.parse(actualURL);requireValue(route?.kind==='conversation'&&route.conversationId===p.conversationId);
 const e=p.evidence;requireValue(exactHostRecord(e,['profileId','profileVersion','sourceKind','regionEpoch','fieldPaths','receiptId'])&&e.profileId===profile.id&&e.profileVersion===profile.revision&&e.sourceKind==='native-dom'&&e.regionEpoch===current.regionEpoch&&e.receiptId===null);
 const paths=e.fieldPaths;requireValue(Array.isArray(paths)&&Object.getPrototypeOf(paths)===Array.prototype&&paths.length===1&&Reflect.ownKeys(paths).length===2);
 const item=Object.getOwnPropertyDescriptor(paths,'0');requireValue(item&&Object.hasOwn(item,'value')&&item.value==='native-send-intent');
 requireValue(new TextEncoder().encode(JSON.stringify(proposal)).length<=65536);
 return Object.freeze({intentId:p.intentId,kind:'send',isComposing:false});
}

/** A loss marker only retires current send causality. It cannot admit facts. */
export function validateSendGapProposal(proposal,{profile}={}){
 requireValue(!!profile?.sendIntent&&typeof profile.urlPolicy?.parse==='function');
 requireValue(exactHostRecord(proposal,['protocol','documentToken','producerToken','localSeq','routeEpoch','profileId','profileVersion','bodyProofId','kind','payload']));
 requireValue(proposal.protocol==='vaiwl-host-observation/1'&&proposal.kind==='send-gap'&&safeId(proposal.bodyProofId)&&safeId(proposal.documentToken)&&safeId(proposal.producerToken)&&Number.isSafeInteger(proposal.localSeq)&&proposal.localSeq>0&&Number.isSafeInteger(proposal.routeEpoch)&&proposal.routeEpoch>=0&&proposal.profileId===profile.id&&proposal.profileVersion===profile.revision);
 requireValue(exactHostRecord(proposal.payload,['reason'])&&proposal.payload.reason==='send-intent-capacity');
}
