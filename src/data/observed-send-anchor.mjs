import {isRecord,tokenOK} from '../b1/identity.mjs';
import {instant} from '../navigation/projection.mjs';
const witness=['id','sourceId','generation','sourceRevision','observedAt','revoked'];
const fields=[...witness,'conversationId','eventKey','hintType','anchorVersion','messageId','firstObservedAt','candidateInterval','clockBasis','calibrationDueAt','actorVerified','actorScopeKey','ackWitness'];
const fail=kind=>{throw Error('invalid-observed-send-anchor-'+kind);};
function shape(value,keys){
 if(!isRecord(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('schema');
 for(const key of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))fail('schema');
}
function id(value){if(!tokenOK(value)||['__proto__','constructor','prototype'].includes(value))fail('id');}
function version(value){if(!Number.isSafeInteger(value)||value<1)fail('version');}
function time(value){const parsed=instant(value);if(parsed===null)fail('time');return parsed;}
/** Schema validation only. The parent codec checks the shared source witness;
 * an owner ACK admission remains mandatory before any production write. */
export function validateObservedSendAnchor(row,state){
 shape(row,fields);
 for(const key of ['id','sourceId','generation','conversationId','eventKey','messageId'])id(row[key]);
 version(row.sourceRevision);
 if(typeof row.revoked!=='boolean'||row.hintType!=='observed-self-send'||row.anchorVersion!==1||row.clockBasis!=='local-bounded')fail('schema');
 if(row.actorVerified!==true||typeof state?.scopeKey!=='string'||!state.scopeKey||row.actorScopeKey!==state.scopeKey)fail('actor');
 const source=state?.sources&&Object.hasOwn(state.sources,row.sourceId)?state.sources[row.sourceId]:null;
 if(!source||source.channel!=='host-evidence'||source.codecVersion!==1)fail('source');
 shape(row.candidateInterval,['from','through']);
 const from=time(row.candidateInterval.from),through=time(row.candidateInterval.through),first=time(row.firstObservedAt),observed=time(row.observedAt),due=time(row.calibrationDueAt);
 if(from>through||through-from>30000||through>first||first>observed||due<=first)fail('interval');
 shape(row.ackWitness,['kind','profileId','profileVersion','semanticFingerprint']);
 const ack=row.ackWitness;
 if(ack.kind!=='authenticated-message-readback')fail('ack');
 id(ack.profileId);version(ack.profileVersion);
 if(ack.profileId!==source.profileId||ack.profileVersion!==source.profileVersion)fail('profile');
 if(typeof ack.semanticFingerprint!=='string'||! /^[0-9a-f]{64}$/.test(ack.semanticFingerprint))fail('digest');
 return row;
}
