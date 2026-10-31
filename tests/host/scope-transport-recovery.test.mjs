import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
const frame={tabId:1,frameId:0,documentId:'doc',actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
const identity=transport=>({principalId:'self',contexts:[{id:'personal',kind:'personal'}],expiresAt:new Date(1000000).toISOString(),providerProfile:'session_v1',transport});
function fixture({transport='isolated-fixed-fetch',c2=false}={}){
 let time=1000,serial=0,answer=identity(transport),calls=0,current=true;
 const originalReceipt=Object.freeze({id:'browser_receipt',contextId:'personal',selectionEpoch:1,wall:1000});let returnedReceipt=originalReceipt;
 const authority=createScopeAuthority({provider:{read:async()=>{calls++;return answer;}},profile:{id:'binding',singlePersonalDefault:!c2,browserRequestContext:c2},contextObserver:{verify:async()=>returnedReceipt,isCurrent:(_f,r)=>current&&r===originalReceipt},now:()=>time,elapsedNow:()=>time,makeId:()=>`receipt_${++serial}`});
 return {authority,set answer(v){answer=v;},set receipt(v){returnedReceipt=v;},get receipt(){return originalReceipt;},get calls(){return calls;},advance:()=>{time+=1000;},invalidateReceipt:()=>{current=false;}};
}
for(const from of ['worker-fixed-fetch','isolated-fixed-fetch'])for(const c2 of [false,true])test(`${c2?'C2':'C3'} same scope renews ${from} to alternate verified transport`,async()=>{
 const f=fixture({transport:from,c2}),old=(await f.authority.refresh(frame,'bind')).grant,bytes=JSON.stringify(old),to=from==='worker-fixed-fetch'?'isolated-fixed-fetch':'worker-fixed-fetch';f.advance();f.answer=identity(to);
 const result=await f.authority.revalidate(frame,undefined,{force:true});assert.equal(result.state,'verified');const next=result.grant;
 assert.equal(next.id,old.id);assert.equal(next.scopeKey,old.scopeKey);assert.equal(next.scopeEpoch,old.scopeEpoch);assert.equal(next.principal.sessionGeneration,old.principal.sessionGeneration);assert.equal(next.principal.transport,to);assert.notEqual(next.principal.id,old.principal.id);assert.equal(next.context[c2?'authorizedContextReceiptId':'rosterReceiptId'],next.principal.id);assert.equal(next.context.selectionEpoch,old.context.selectionEpoch);
 if(c2){assert.equal(next.context.requestReceiptId,old.context.requestReceiptId);assert.equal(next.context.pageAssociationReceiptId,old.context.pageAssociationReceiptId);}
 assert.equal(JSON.stringify(old),bytes);assert(Object.isFrozen(next)&&Object.isFrozen(next.principal)&&Object.isFrozen(next.context));assert.equal(f.calls,2);assert.equal(f.authority.peek(frame).grant,next);
});
for(const [name,change]of [['unknown transport',x=>({...x,transport:'page-reported'})],['principal',x=>({...x,principalId:'other'})],['context',x=>({...x,contexts:[{id:'other',kind:'personal'}]})],['provider profile',x=>({...x,providerProfile:'other'})]])test('transport recovery still revokes changed '+name,async()=>{
 const f=fixture();await f.authority.refresh(frame,'bind');f.answer=change(identity('worker-fixed-fetch'));assert.equal((await f.authority.revalidate(frame,undefined,{force:true})).state,'unverified');assert.equal(f.authority.scopeFor(frame),null);
});
for(const kind of ['missing','replacement','stale'])test('C2 '+kind+' receipt cannot authorize transport recovery',async()=>{
 const f=fixture({c2:true});await f.authority.refresh(frame,'bind');f.answer=identity('worker-fixed-fetch');if(kind==='missing')f.receipt=null;if(kind==='replacement')f.receipt={...f.receipt,id:'replacement'};if(kind==='stale')f.invalidateReceipt();assert.equal((await f.authority.revalidate(frame,undefined,{force:true})).state,'unverified');assert.equal(f.authority.scopeFor(frame),null);
});
