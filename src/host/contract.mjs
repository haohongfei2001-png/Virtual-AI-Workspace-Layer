import {isRecord,tokenOK} from '../b1/identity.mjs';
export const HOST_SPEC_REVISION='VA-HOST/1.1 FINAL';
export function exactHostRecord(value,keys){
 if(!isRecord(value)||Reflect.ownKeys(value).length!==keys.length)return false;
 return keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value');});
}
export function hostHelloOK(value){return exactHostRecord(value,['v','type','clientId','seq'])&&value.v===1&&value.type==='HOST_HELLO'&&tokenOK(value.clientId)&&Number.isSafeInteger(value.seq)&&value.seq>0;}
/** Public host DOM status is an allowlisted diagnostic, never an account channel. */
export function publicAdapterStatus(value){
 const states=['WAITING','ACTIVE','PARTIAL','NATIVE_LAYER','NATIVE_ONLY','STOPPED'];
 return Object.freeze({state:states.includes(value?.state)?value.state:'NATIVE_ONLY',reason:typeof value?.reason==='string'&&/^[a-z0-9-]{1,80}$/.test(value.reason)?value.reason:null,profileId:tokenOK(value?.profileId)?value.profileId:null});
}
