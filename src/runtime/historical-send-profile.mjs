import {parseConversationMetadata} from '../host/conversation-metadata.mjs';
import {digest} from '../data/hash.mjs';
import {instant} from '../navigation/projection.mjs';
import {tokenOK} from '../b1/identity.mjs';
/** Explicit package-owned reconstruction grammar. This is not a live ChatGPT certification. */
export const OFFLINE_HISTORY_PROFILE=Object.freeze({id:'offline-original-send-v1',revision:1,providerProfile:'chatgpt-session-v1',semantics:'fixture-original-self-send/1'});
export function validateHistoricalSendProfile(p){
 if(!p||Object.keys(p).sort().join(',')!=='id,providerProfile,revision,semantics'||!tokenOK(p.id)||!tokenOK(p.providerProfile)||!Number.isSafeInteger(p.revision)||p.revision<1||p.semantics!=='fixture-original-self-send/1')throw Error('invalid-historical-send-profile');
 return Object.freeze({...p});
}
/** JSON from a worker-authenticated current-object read only. No author/time
 * assertion from DOM or MAIN can enter this path. Original-send grammar is
 * separate from create_time, read time, editing and current branch selection. */
export function extractHistoricalSends({conversationId,payload,principalId,profile}){
 const p=validateHistoricalSendProfile(profile),metadata=parseConversationMetadata({conversationId,payload,principalId});
 if(metadata.state!=='candidate'||metadata.gaps.length||!principalId)return Object.freeze([]);
 const body=JSON.parse(payload);if(body.history_semantics!==p.semantics)return Object.freeze([]);
 const authorPrincipalKey='principal_'+digest(['chatgpt-principal-v1',principalId]);
 return Object.freeze(metadata.messages.flatMap(m=>{
  const raw=body.mapping[m.mappingNodeId].message,s=raw.original_send;
  if(m.role!=='user'||raw.author?.id!==principalId||!m.lineage||!s||Object.keys(s).sort().join(',')!=='author_id,conversation_id,kind,precision,sent_at,state'||s.author_id!==principalId||s.conversation_id!==conversationId||s.kind!=='new-send'||s.state!=='committed'||!['second','millisecond'].includes(s.precision)||typeof s.sent_at!=='string'||instant(s.sent_at)===null)return [];
  // Seconds remain seconds; no invented subsecond precision or numeric epoch units.
  if(s.precision==='second'&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s.sent_at)||s.precision==='millisecond'&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s.sent_at))return [];
  return [Object.freeze({conversationId,messageId:m.messageId,branchId:'lineage_'+m.lineage.fingerprint,authorPrincipalKey,role:'user',kind:'new-send',sendState:'committed',sentAt:s.sent_at,precision:s.precision})];
 }));
}
