import {instant} from '../navigation/projection.mjs';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
/** Shared fixed-provider decoding. No URLs, proofs or credentials come from DOM. */
export async function readSessionJSON(response,{target,limit,raw=false,check}={}){
 check();
 if(response.status===401||response.status===403)throw Error('session-unauthorized');
 if(response.status!==200||response.redirected||response.url!==target)throw Error('invalid-session-response');
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid-session-mime');
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))throw Error('session-response-too-large');
 if(!response.body?.getReader)throw Error('missing-session-body');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 const decode=(value,options)=>{try{return decoder.decode(value,options);}catch{throw Error('invalid-session-body');}};
 try{while(true){check();const chunk=await reader.read();check();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))throw Error('invalid-session-body');bytes+=chunk.value.byteLength;if(bytes>limit)throw Error('session-response-too-large');text+=decode(chunk.value,{stream:true});}text+=decode();if(raw)return text;try{return JSON.parse(text);}catch{throw Error('invalid-session-json');}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
export function sessionCredentials(session,time){
 if(!Number.isFinite(time)||!record(session)||!record(session.user)||!identifier(session.user.id)||typeof session.expires!=='string'||instant(session.expires)===null||instant(session.expires)<=time||typeof session.accessToken!=='string'||!session.accessToken||session.accessToken.length>16384||!/^[\x21-\x7e]+$/.test(session.accessToken))throw Error('invalid-session-schema');
 const credentials={principalId:session.user.id,expiresAt:session.expires,token:session.accessToken};delete session.accessToken;return credentials;
}
export function sessionContexts(accounts,structures){
 if(!record(accounts)||!record(accounts.accounts)||Object.keys(accounts.accounts).length>1000)throw Error('invalid-accounts-schema');
 const contexts=[],seen=new Set();for(const [key,value]of Object.entries(accounts.accounts)){
  const account=value?.account;if(!identifier(key)||!record(account)||!identifier(account.account_id)||key!==account.account_id||typeof account.structure!=='string'||account.structure.length>128||seen.has(account.account_id))throw Error('invalid-accounts-schema');
  seen.add(account.account_id);contexts.push({id:account.account_id,kind:structures.get(account.structure)??'unknown'});
 }
 return contexts;
}
