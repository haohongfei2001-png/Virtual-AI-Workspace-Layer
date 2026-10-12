import {createDocumentBindingBroker} from '../../src/b1/document-binding-broker.mjs';
/** Read-only live experiment. A guest, route or display label NEVER grants scope. */
export function officialURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='chatgpt.com'&&!u.port&&!u.username&&!u.password;}catch{return false;}}
export function experimentBroker({extensionId,getFrame}={}){
 return createDocumentBindingBroker({extensionId,getFrame,allowedURL:officialURL,
  resolveScope:async()=>null,
  repository:{get:async()=>{throw Error('no-data-authority');},list:async()=>{throw Error('no-data-authority');},upsert:async()=>{throw Error('native-writes-disabled');}}});
}
export function healthEnvelope(boot,binding){
 if(typeof boot!=='string'||!binding||binding.ok===true)throw Error('experiment-authority-escalation');
 return {schema:'vaiwl-r0-probe-v1',boot,bindingReason:['unverified-scope','invalid-sender','not-current-document','invalidated-during-check','invalid-request'].includes(binding.reason)?binding.reason:'binding-denied',trustedAccountScope:false,derivedContentEnabled:false,dataStoreOpened:false,nativeWritesEnabled:false};
}
