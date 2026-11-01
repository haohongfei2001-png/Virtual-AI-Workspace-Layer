import {digest} from '../data/hash.mjs';
import {tokenOK} from '../b1/identity.mjs';
export {parseConversationDirectoryMetadata,parseArchivedConversationDirectoryMetadata} from './conversation-directory-metadata.mjs';
const LIMITS=Object.freeze({bytes:8*1024*1024,depth:32,messages:256,nodes:10000});
const encoder=new TextEncoder(),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const own=(v,k)=>{if(!plain(v))return undefined;const d=Object.getOwnPropertyDescriptor(v,k);if(!d)return undefined;if(!Object.hasOwn(d,'value'))throw Error('metadata-accessor');return d.value;};
const identifier=v=>tokenOK(v)&&!['__proto__','constructor','prototype'].includes(v);
// Structural depth check only; message bodies/attachments are opaque and skipped.
// Raw JSON admission means accessors, prototypes and object cycles cannot arrive.
function inspectDepth(root){
 const stack=[{value:root,depth:0}];let visited=0;
 while(stack.length){const {value,depth}=stack.pop();if(++visited>LIMITS.nodes)throw Error('node-limit');if(depth>LIMITS.depth)throw Error('depth-limit');if(value===null||typeof value!=='object')continue;
  const keys=Object.keys(value);
  for(const key of keys){if(['content','parts','attachments'].includes(key))continue;
   // Every queued value reserves one visit; never materialize a huge pending
   // array just to discover the budget on its eventual consumption.
   if(visited+stack.length>=LIMITS.nodes)throw Error('node-limit');
   const d=Object.getOwnPropertyDescriptor(value,key);if(!Object.hasOwn(d,'value'))throw Error('metadata-accessor');stack.push({value:d.value,depth:depth+1});
  }
 }
}
function validTimeString(value){
 if(typeof value!=='string'||value.length>40)return false;
 const match=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
 if(!match||Number(match[2])>23||Number(match[3])>59||Number(match[4])>59||!Number.isFinite(Date.parse(value)))return false;
 return new Date(match[1]+'T00:00:00Z').toISOString().slice(0,10)===match[1];
}
/** Untrusted candidates only. Principal equality is not a self-send witness. */
export function parseConversationMetadata(input){return parseMetadata(input,false);}
export function parseConversationMessageListMetadata(input){return parseMetadata(input,true);}
function parseMetadata(input,messageList){
 if(!plain(input)||Reflect.ownKeys(input).length!==3||!['conversationId','payload','principalId'].every(k=>Object.hasOwn(input,k)))throw Error('invalid-conversation-metadata-input');
 const conversationId=own(input,'conversationId'),principalId=own(input,'principalId');let payload=own(input,'payload');
 if(!identifier(conversationId)||principalId!==null&&(typeof principalId!=='string'||!principalId.length||principalId.length>256))throw Error('invalid-conversation-metadata-input');
 const messages=[],gaps=[];const result=()=>({protocol:'vaiwl-conversation-metadata-candidate/1',conversationId,state:gaps.length?'partial':'candidate',messages,gaps,coverage:'observed-only'});
 if(typeof payload!=='string')throw Error('invalid-conversation-json');
 if(payload.length>LIMITS.bytes||encoder.encode(payload).length>LIMITS.bytes){gaps.push({reason:'byte-limit'});return result();}try{payload=JSON.parse(payload);}catch{throw Error('invalid-conversation-json');}
 if(!plain(payload))throw Error('invalid-conversation-json');
 const ids=[own(payload,'conversation_id'),own(payload,'id')].filter(v=>v!==undefined);if(!ids.length||ids.some(id=>id!==conversationId))throw Error('conversation-identity-conflict');
 try{inspectDepth(payload);}catch(e){if(['byte-limit','depth-limit','node-limit'].includes(e.message)){gaps.push({reason:e.message});return result();}throw e;}
 if(messageList){
  const entries=own(payload,'messages');
  if(!Array.isArray(entries)||Object.hasOwn(payload,'mapping'))throw Error('invalid-conversation-message-list');
  // The native flat list proves observed IDs, not ancestry or branch coverage.
  // Never synthesize mapping nodes from list order or current_node.
  gaps.push({reason:'lineage-unavailable'});
  const seen=new Set(),duplicates=new Set();
  const gap=reason=>{if(gaps.length<256)gaps.push({reason});};
  if(entries.length>LIMITS.messages)gap('message-limit');
  for(const message of entries.slice(0,LIMITS.messages)){
   if(!plain(message)){gap('invalid-message');continue;}
   const messageId=own(message,'id');if(!identifier(messageId)){gap('invalid-message-id');continue;}
   if(seen.has(messageId)){duplicates.add(messageId);gap('duplicate-message-id');continue;}seen.add(messageId);
   const c=own(message,'conversation_id');if(c!==undefined&&c!==conversationId){gap('message-conversation-conflict');continue;}
   const author=own(message,'author'),claimedRole=own(author,'role'),role=['user','assistant','system','tool'].includes(claimedRole)?claimedRole:'unknown',rawAuthor=own(author,'id'),authorId=typeof rawAuthor==='string'&&rawAuthor.length>0&&rawAuthor.length<=256?rawAuthor:null;
   const raw=own(message,'create_time'),rawCreateTime=typeof raw==='number'&&Number.isFinite(raw)||validTimeString(raw)?raw:null;
   if(raw!==undefined&&raw!==null&&rawCreateTime===null)gap('invalid-create-time');
   messages.push({messageId,mappingNodeId:null,role,authorId,selfMatchCandidate:role==='user'&&authorId!==null&&principalId!==null&&authorId===principalId,rawCreateTime,precisionCandidate:typeof rawCreateTime==='string'?(rawCreateTime.includes('.')?'millisecond':'second'):'unknown',lineage:null});
  }
  for(let i=messages.length-1;i>=0;i--)if(duplicates.has(messages[i].messageId))messages.splice(i,1);
  return result();
 }
 const mapping=own(payload,'mapping');if(!plain(mapping))throw Error('invalid-conversation-mapping');
 const allKeys=Object.keys(mapping),keys=allKeys.slice(0,LIMITS.nodes),nodes=new Map(),seen=new Map(),conflicts=new Set();
 const gap=(reason,nodeId)=>{if(gaps.length<256)gaps.push({reason,...(nodeId?{nodeId}:{})});};
 if(allKeys.length>LIMITS.nodes)gap('node-limit');
 for(const key of keys){const value=own(mapping,key);if(!identifier(key)||!plain(value)){gap('invalid-mapping-node');continue;}const id=own(value,'id');if(id!==undefined&&id!==key){gap('mapping-identity-conflict',key);continue;}nodes.set(key,value);}
 function lineage(key){const chain=[],visited=new Set();let cursor=key;while(cursor!==null){if(visited.has(cursor)){gap('lineage-cycle',key);return null;}if(chain.length>=32){gap('lineage-depth-limit',key);return null;}visited.add(cursor);const node=nodes.get(cursor);if(!node){gap('missing-parent',key);return null;}chain.push(cursor);const parent=own(node,'parent');if(parent!==null&&!identifier(parent)){gap('missing-parent',key);return null;}cursor=parent;}chain.reverse();return {kind:'derived',nodeIds:chain,fingerprint:digest([conversationId,chain])};}
 for(const [key,node]of nodes){const message=own(node,'message');if(message===null||message===undefined)continue;if(!plain(message)){gap('invalid-message',key);continue;}
  if(messages.length>=LIMITS.messages){gap('message-limit');break;}
  const messageId=own(message,'id');if(!identifier(messageId)){gap('invalid-message-id',key);continue;}
  const explicitConversation=own(message,'conversation_id');if(explicitConversation!==undefined&&explicitConversation!==conversationId){gap('message-conversation-conflict',key);continue;}
  const author=own(message,'author'),claimedRole=own(author,'role'),role=['user','assistant','system','tool'].includes(claimedRole)?claimedRole:'unknown',rawAuthor=own(author,'id'),authorId=typeof rawAuthor==='string'&&rawAuthor.length>0&&rawAuthor.length<=256?rawAuthor:null;
  const raw=own(message,'create_time'),rawCreateTime=typeof raw==='number'&&Number.isFinite(raw)||validTimeString(raw)?raw:null;
  if(raw!==undefined&&raw!==null&&rawCreateTime===null)gap('invalid-create-time',key);
  const precisionCandidate=typeof rawCreateTime==='string'?(rawCreateTime.includes('.')?'millisecond':'second'):'unknown';
  const candidate={messageId,mappingNodeId:key,role,authorId,selfMatchCandidate:role==='user'&&authorId!==null&&principalId!==null&&authorId===principalId,rawCreateTime,precisionCandidate,lineage:lineage(key)};
  const fingerprint=digest({role,authorId,rawCreateTime,precisionCandidate,lineage:candidate.lineage?.fingerprint??null});
  if(seen.has(messageId)){if(seen.get(messageId)!==fingerprint){conflicts.add(messageId);gap('message-semantic-conflict',key);}continue;}seen.set(messageId,fingerprint);messages.push(candidate);
 }
 for(let i=messages.length-1;i>=0;i--)if(conflicts.has(messages[i].messageId))messages.splice(i,1);
 return result();
}
