import {digest} from './hash.mjs';

export const FREE_INSTALLATION_KEY=JSON.stringify(['vaiwl-free-installation',1]);
export const freePolicyInitializationKey=scopeKey=>JSON.stringify(['vaiwl-free-policy-initialized',scopeKey,1]);
const scopeOK=value=>typeof value==='string'&&value.length>0;
const modes=new Set(['auto','fixed','existing']);
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
 const own=Reflect.ownKeys(value);return own.length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
const envelope=(key,payload)=>({key,payload,checksum:digest(payload)});
/** Called only inside the schema's oldVersion === 0 upgrade transaction. */
export function freshInstallationRecord(){return envelope(FREE_INSTALLATION_KEY,{version:1,kind:'fresh-database'});}
export function isFreshInstallationRecord(row){
 try{return exact(row,['key','payload','checksum'])&&row.key===FREE_INSTALLATION_KEY&&exact(row.payload,['version','kind'])&&row.payload.version===1&&row.payload.kind==='fresh-database'&&typeof row.checksum==='string'&&row.checksum===digest(row.payload);}catch{return false;}
}
/** Presence, even when invalid, prevents a second initialization. Validation is
 * diagnostic only: callers must never repair or overwrite an existing marker. */
export function freePolicyInitializationRecord(scopeKey,mode){
 if(!scopeOK(scopeKey)||!modes.has(mode))throw Error('invalid-free-policy-initialization');
 return envelope(freePolicyInitializationKey(scopeKey),{version:1,scopeKey,mode});
}
export function validFreePolicyInitializationRecord(row,scopeKey){
 try{return scopeOK(scopeKey)&&exact(row,['key','payload','checksum'])&&row.key===freePolicyInitializationKey(scopeKey)&&exact(row.payload,['version','scopeKey','mode'])&&row.payload.version===1&&row.payload.scopeKey===scopeKey&&modes.has(row.payload.mode)&&typeof row.checksum==='string'&&row.checksum===digest(row.payload);}catch{return false;}
}
