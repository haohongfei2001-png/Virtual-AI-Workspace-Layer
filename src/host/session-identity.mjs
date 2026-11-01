import {instant} from '../navigation/projection.mjs';
import {stable} from '../data/hash.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
// Diagnostics retain only a fixed branch code, never the rejected input. The
// existing public error contract stays generic; arbitrary errors cannot inject
// private strings into a diagnostic result.
const contextSchemaIssues=new WeakMap();
const invalidContexts=issue=>{const error=Error('invalid-accounts-schema');contextSchemaIssues.set(error,issue);return error;};
export const sessionContextSchemaIssue=error=>contextSchemaIssues.get(error)??null;
/** Shared fixed-provider decoding. No URLs, proofs or credentials come from DOM. */
export async function readSessionJSON(response,{target,limit,raw=false,check}={}){
 try{
 check();
 if(response.redirected||response.url!==target)throw Error('invalid-session-response');
 if(response.headers?.get?.('cf-mitigated')==='challenge')throw Error('session-challenged');
 if(response.status===401||response.status===403)throw Error('session-unauthorized');
 if(response.status!==200)throw Error('invalid-session-response');
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid-session-mime');
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))throw Error('session-response-too-large');
 if(!response.body?.getReader)throw Error('missing-session-body');
 }catch(error){
  // Rejected headers or a late response still own an unread transport body.
  // Do not decode it; retain actual work until disposal settles, even on error.
  try{await response?.body?.cancel();}catch{}
  throw error;
 }
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 const decode=(value,options)=>{try{return decoder.decode(value,options);}catch{throw Error('invalid-session-body');}};
 try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))throw Error('invalid-session-body');bytes+=chunk.value.byteLength;if(bytes>limit)throw Error('session-response-too-large');text+=decode(chunk.value,{stream:true});}text+=decode();if(raw)return text;try{return JSON.parse(text);}catch{throw Error('invalid-session-json');}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
export function sessionCredentials(session,time){
 if(!Number.isFinite(time)||!record(session)||!record(session.user)||!identifier(session.user.id)||typeof session.expires!=='string'||instant(session.expires)===null||instant(session.expires)<=time||typeof session.accessToken!=='string'||!session.accessToken||session.accessToken.length>16384||!/^[\x21-\x7e]+$/.test(session.accessToken))throw Error('invalid-session-schema');
 const credentials={principalId:session.user.id,expiresAt:session.expires,token:session.accessToken};delete session.accessToken;return credentials;
}
export function sessionContexts(accounts,structures){
 if(!record(accounts))throw invalidContexts('root-object');
 if(!record(accounts.accounts))throw invalidContexts('accounts-object');
 const entryCount=Object.keys(accounts.accounts).length;
 if(entryCount>1000)throw invalidContexts('accounts-limit');
 const contexts=[],seen=new Set();for(const [key,value]of Object.entries(accounts.accounts)){
  const account=value?.account;
  if(!identifier(key))throw invalidContexts('entry-key');
  if(!record(value))throw invalidContexts('entry-object');
  if(!record(account))throw invalidContexts('account-object');
  if(!identifier(account.account_id)){
   // Observed cookie-only response: a personal-looking default entry without
   // an identity. Recognize the shape for diagnostics, never as an empty roster,
   // signed-out proof, canonical context or substitute for a principal ID.
   const unresolvedDefault=entryCount===1&&key==='default'&&Object.hasOwn(account,'account_id')&&account.account_id===null&&!Object.hasOwn(account,'id')&&account.structure==='personal'&&account.is_deactivated===false&&value.can_access_with_session===true;
   throw invalidContexts(unresolvedDefault?'default-null-context-id':'account-id');
  }
  if(typeof account.structure!=='string'||account.structure.length>128)throw invalidContexts('account-structure');
  if(Object.hasOwn(account,'is_deactivated')&&typeof account.is_deactivated!=='boolean')throw invalidContexts('deactivated-flag');
  if(Object.hasOwn(value,'can_access_with_session')&&typeof value.can_access_with_session!=='boolean')throw invalidContexts('session-access-flag');
  if(key!==account.account_id){
   // The native default entry repeats a canonical account. It is never a
   // selected-context witness, and must not create another authorized ID.
   const canonical=Object.hasOwn(accounts.accounts,account.account_id)?accounts.accounts[account.account_id]:null;
   if(key!=='default')throw invalidContexts('nondefault-alias');
   if(!canonical)throw invalidContexts('default-canonical-missing');
   let equal;try{equal=stable(value)===stable(canonical);}catch{throw invalidContexts('default-entry-uncomparable');}
   if(!equal)throw invalidContexts('default-entry-mismatch');
   continue;
  }
  if(seen.has(account.account_id))throw invalidContexts('duplicate-account');
  seen.add(account.account_id);
  if(account.is_deactivated===true||value.can_access_with_session===false)continue;
  contexts.push({id:account.account_id,kind:structures.get(account.structure)??'unknown'});
 }
 return contexts;
}
