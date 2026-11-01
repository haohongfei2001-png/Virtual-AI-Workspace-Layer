import {tokenOK} from '../b1/identity.mjs';
import {exactHostRecord} from './contract.mjs';
const urlOK=value=>typeof value==='string'&&value.length>0&&value.length<=2048;
const scopeOK=value=>typeof value==='string'&&value.length>0&&value.length<=4096;
const projectOK=value=>tokenOK(value)&&!['__proto__','prototype','constructor'].includes(value);
/** One ephemeral action correlation. Neither an authorization nor a native fact. */
export function createCandidateUpgrade({now=Date.now}={}){
 if(typeof now!=='function')throw Error('invalid-candidate-upgrade');
 let pending=null;
 function clear(){pending=null;}
 function current(){
  if(!pending)return null;const time=now();
  if(!Number.isFinite(time)||time<pending.lastTime||time>=pending.expiresAt){clear();return null;}
  pending.lastTime=time;return pending;
 }
 function propose(value){
  clear();const time=now();
  if(!exactHostRecord(value,['actionId','identity','scopeKey','documentId','originalURL','expiresAt'])||!tokenOK(value.actionId)||!value.identity||typeof value.identity!=='object'||Array.isArray(value.identity)||!scopeOK(value.scopeKey)||!tokenOK(value.documentId)||!urlOK(value.originalURL)||!Number.isFinite(time)||!Number.isFinite(value.expiresAt)||value.expiresAt<=time||value.expiresAt>time+6000)return false;
  pending={...value,lastTime:time,targetURL:null,projectId:null};return true;
 }
 function cancel(actionId){if(pending?.actionId!==actionId)return false;clear();return true;}
 function navigate(value){
  const state=current();if(!state)return false;
  if(!exactHostRecord(value,['url'])||!urlOK(value.url)){clear();return false;}
  if(state.targetURL===null){if(value.url===state.originalURL)return true;state.targetURL=value.url;return true;}
  if(value.url!==state.targetURL){clear();return false;}return true;
 }
 // A replacement binding may retain only an already-correlated target.
 // This is presentation correlation, never authority, and cannot renew expiry.
 function isTarget(value){const state=current();return !!state&&exactHostRecord(value,['url'])&&urlOK(value.url)&&state.targetURL!==null&&value.url===state.targetURL;}
 // Read-only prediction for a private scan. It is neither a grant nor a
 // committed upgrade; resolve must repeat every check at publication.
 function preview(value){
  const state=pending,time=now();
  if(!state||!Number.isFinite(time)||time<state.lastTime||time>=state.expiresAt)return null;
  if(!exactHostRecord(value,['scopeKey','documentId','url','projectId','identityMatches'])||value.scopeKey!==state.scopeKey||value.documentId!==state.documentId||!urlOK(value.url)||!projectOK(value.projectId)||value.identityMatches!==true||state.targetURL===null||value.url!==state.targetURL||state.projectId!==null&&state.projectId!==value.projectId)return null;
  return Object.freeze({projectId:value.projectId,identity:state.identity,actionId:state.actionId});
 }
 function resolve(value){
  const state=current();if(!state)return null;
  if(!exactHostRecord(value,['scopeKey','documentId','url','projectId','identityMatches'])||value.scopeKey!==state.scopeKey||value.documentId!==state.documentId||!urlOK(value.url)||!projectOK(value.projectId)||value.identityMatches!==true){clear();return null;}
  if(state.targetURL===null)return null;
  if(value.url!==state.targetURL||state.projectId!==null&&state.projectId!==value.projectId){clear();return null;}
  state.projectId=value.projectId;return Object.freeze({projectId:state.projectId,identity:state.identity,actionId:state.actionId});
 }
 return Object.freeze({propose,cancel,navigate,isTarget,preview,resolve,clear});
}
