import test from 'node:test';
import assert from 'node:assert/strict';
import {currentJ4Grant} from './j4-joint-interruption.mjs';
function pageFor(patch={}){
 const value={grant:'fresh',scope:'team',currentRef:'conversation',freshness:{grantId:'fresh',grantRequestedAt:110,grantReceivedAt:120,expiresAt:1000,viewRequestedAt:130,viewReceivedAt:140,viewGrantId:'fresh'},...patch};
 const frame={isDetached:()=>false,url:()=> 'chrome-extension://test/workspace.html',evaluate:async()=>value};
 return {page:{frames:()=>[frame]},value};
}
const options={previousGrant:'old',afterTime:100,now:()=>200};
for(const [name,patch] of [
 ['old frame cache without a post-stop response',{freshness:null}],
 ['expired grant',{freshness:{grantId:'fresh',grantRequestedAt:110,grantReceivedAt:120,expiresAt:199,viewRequestedAt:130,viewReceivedAt:140,viewGrantId:'fresh'}}],
 ['late pre-stop VIEW response',{freshness:{grantId:'fresh',grantRequestedAt:110,grantReceivedAt:120,expiresAt:1000,viewRequestedAt:99,viewReceivedAt:140,viewGrantId:'fresh'}}],
 ['VIEW reply for previous grant',{freshness:{grantId:'fresh',grantRequestedAt:110,grantReceivedAt:120,expiresAt:1000,viewRequestedAt:130,viewReceivedAt:140,viewGrantId:'old'}}]
])test(`peer recovery rejects ${name}`,async()=>{const {page}=pageFor(patch);assert.equal(await currentJ4Grant(page,'test','team',options),null);});
test('peer accepts new live grant and its actual post-stop VIEW',async()=>{const {page}=pageFor();assert.equal((await currentJ4Grant(page,'test','team',options)).grant,'fresh');});

import {runInNewContext} from 'node:vm';
import {installJ4GrantObserver} from './j4-grant-observer.mjs';
function observer(){
 let time=100;const pending=[];
 const realm={Date:class extends Date{static now(){return time;}},location:{protocol:'chrome-extension:'},chrome:{runtime:{sendMessage:message=>new Promise(resolve=>pending.push({message,resolve}))}}};realm.globalThis=realm;
 runInNewContext('('+installJ4GrantObserver.toString()+')()',realm);
 return {realm,pending,setTime:value=>time=value,send:message=>realm.chrome.runtime.sendMessage(message),finish:async(index,response)=>{pending[index].resolve(response);await Promise.resolve();await Promise.resolve();}};
}
const grant=(id,expiry=1000)=>({ok:true,grant:{id,expiresAt:new Date(expiry).toISOString()}});
test('passive observer rejects late old VIEW after new grant and retains original Promise',async()=>{
 const f=observer();f.send({type:'HOST_UI_JOIN'});await f.finish(0,grant('old'));
 const oldView=f.send({type:'HOST_UI_VIEW',grantId:'old'});f.setTime(120);f.send({type:'HOST_UI_JOIN'});await f.finish(2,grant('fresh'));
 const response={ok:true,page:{scope:'old-scope'}};await f.finish(1,response);assert.equal(await oldView,response);assert.equal(f.realm.j4LastScope,null);
 f.setTime(130);f.send({type:'HOST_UI_VIEW',grantId:'fresh'});await f.finish(3,{ok:true,page:{scope:'team'}});assert.equal(f.realm.j4LastScope,'team');assert.equal(f.realm.j4Freshness.viewGrantId,'fresh');
});
test('late old renewal cannot replace a newer JOIN grant',async()=>{
 const f=observer();f.send({type:'HOST_UI_JOIN'});await f.finish(0,grant('old'));f.send({type:'HOST_UI_RENEW',grantId:'old'});f.send({type:'HOST_UI_JOIN'});await f.finish(2,grant('fresh'));await f.finish(1,grant('old',2000));assert.equal(f.realm.j4Grant,'fresh');
});
test('expired grant and expired VIEW never establish readiness',async()=>{
 const f=observer();f.send({type:'HOST_UI_JOIN'});await f.finish(0,grant('expired',99));assert.equal(f.realm.j4Grant,undefined);
 f.send({type:'HOST_UI_JOIN'});await f.finish(1,grant('fresh',150));f.send({type:'HOST_UI_VIEW',grantId:'fresh'});f.setTime(151);await f.finish(2,{ok:true,page:{scope:'team'}});assert.equal(f.realm.j4LastScope,null);
});
