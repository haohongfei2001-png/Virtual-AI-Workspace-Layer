import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPageCommandNativeFetch,commandKinds,transportKinds,createCommandCapture} from './page-command-native-fetch-oracle.mjs';
function valid(){return {finalPrivacyScanPerformed:true,packagedMV3:true,packageVerified:true,workerNetworkBlocked:true,positivePrivateView:true,privateDatabasePresent:true,observationWindowComplete:true,fetchIdentityPreserved:true,pageHasRuntimeAccess:false,commands:commandKinds.map(kind=>({kind,delivered:true,requests:0,replies:0})),captureUnsupported:0,captureOverflow:0,pageMessageSchemaViolations:0,privateLeaks:0,mutationMarkers:0,nativeWrites:0,unexpectedRequests:0,privateDatabaseUnchanged:true,positiveLeakScanner:true,transports:transportKinds.map(kind=>({kind,fetchIdentityPreserved:true,samePromise:true,sameResult:true,expectedOutcome:true})),deliveryModel:'FINITE_ROUTE_FULFILL_NOT_CHUNKED_STREAM',fullSEC08:'NOT_ESTABLISHED',fullACT20:'NOT_ESTABLISHED',nativeTap:'NOT_IMPLEMENTED',cleanupOK:true,sourceChanged:false};}
test('synthetic oracle positive control is L only, not browser evidence',()=>assert.match(assertPageCommandNativeFetch(valid()),/^PASS_NARROW/));
for(const key of ['finalPrivacyScanPerformed','packagedMV3','packageVerified','workerNetworkBlocked','positivePrivateView','privateDatabasePresent','observationWindowComplete','fetchIdentityPreserved','privateDatabaseUnchanged','positiveLeakScanner','cleanupOK'])test('reject missing '+key,()=>{const r=valid();r[key]=false;assert.throws(()=>assertPageCommandNativeFetch(r));});
for(const key of ['privateLeaks','mutationMarkers','nativeWrites','unexpectedRequests','captureOverflow','captureUnsupported','pageMessageSchemaViolations'])test('reject observed '+key,()=>{const r=valid();r[key]=1;assert.throws(()=>assertPageCommandNativeFetch(r));});
for(const key of ['delivered','requests','replies'])test('reject command '+key,()=>{const r=valid();r.commands[0][key]=key==='delivered'?false:1;assert.throws(()=>assertPageCommandNativeFetch(r));});
for(const key of ['fetchIdentityPreserved','samePromise','sameResult','expectedOutcome'])test('reject transport '+key,()=>{const r=valid();r.transports[0][key]=false;assert.throws(()=>assertPageCommandNativeFetch(r));});
for(const key of ['commands','transports'])test('reject missing or duplicate '+key,()=>{const r=valid();r[key].pop();assert.throws(()=>assertPageCommandNativeFetch(r));const s=valid();s[key][1]=s[key][0];assert.throws(()=>assertPageCommandNativeFetch(s));});
for(const key of ['fullSEC08','fullACT20','nativeTap','deliveryModel'])test('reject inflated '+key,()=>{const r=valid();r[key]='PASS';assert.throws(()=>assertPageCommandNativeFetch(r));});
test('reject source drift/runtime exposure',()=>{for(const key of ['sourceChanged','pageHasRuntimeAccess']){const r=valid();r[key]=true;assert.throws(()=>assertPageCommandNativeFetch(r));}});

import {copyCspMessage,exactCspControlMessage,cspDomStrings} from './fault-csp-observer.mjs';
test('capture exempts exact original once, retains echo/private extra and exact replay',()=>{
 const c=createCommandCapture(copyCspMessage),original={probe:'command-negative-control',kind:'fetch',requestId:'sec08-fetch'};
 c.state.pending.fetch=JSON.stringify(original);c.capture(original,'fixture',true);assert.deepEqual(c.state.delivered,['fetch']);assert.equal(c.state.messages.length,0);
 c.capture({...original,secret:'PRIVATE'},'fixture',true);c.capture(original,'fixture',true);assert.equal(c.state.messages.length,2);assert.equal(c.state.messages[0].data.secret,'PRIVATE');
});
test('non-JSON Map/Set/blob and cyclic messages fail closed rather than disappear',()=>{
 const cycle={};cycle.self=cycle;for(const value of [new Map([['secret','PRIVATE']]),new Set(['PRIVATE']),new Blob(['PRIVATE']),cycle]){const c=createCommandCapture(copyCspMessage);c.capture(value,'fixture',true);assert.equal(c.state.captureUnsupported,1);}
});
test('message schema rejects missing fields, wrong roles and extra private fields',()=>{for(const value of [{type:'VAIWL_UI_JOIN',role:'workspace'},{type:'VAIWL_UI_EXIT',role:'attacker'},{type:'VAIWL_UI_JOIN',role:'workspace',nonce:'n',secret:'PRIVATE'}])assert.equal(exactCspControlMessage(value),false);});
test('reused DOM scanner includes open shadow and live values',()=>{
 const old=globalThis.document;try{globalThis.document={childNodes:[{nodeType:1,attributes:[],value:'LIVE_PRIVATE',shadowRoot:{childNodes:[{nodeType:3,nodeValue:'SHADOW_PRIVATE'}]},childNodes:[]}]};const r=cspDomStrings(false);assert(r.strings.includes('LIVE_PRIVATE'));assert(r.strings.includes('SHADOW_PRIVATE'));assert.equal(r.dropped,0);}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
