import test from 'node:test';
import assert from 'node:assert/strict';
import {createJ2SendFixture,J2_C} from './fixtures/j2-send.mjs';

function fixture({modern=true}={}){
 let principal='user-test',selected='team',accounts=modern?[{account_id:'personal'},{account_id:'team'}]:[{account_id:'personal'}];
 const app=createJ2SendFixture({principal:()=>principal,accounts:()=>accounts,...(modern?{selectedContext:()=>selected}:{}),now:()=>Date.UTC(2026,9,17)});
 const request=(method,path,headers={})=>{let result;assert.equal(app.handle({method,headers},{},new URL(path,'http://127.0.0.1'),(_res,status,body)=>{result={status,body};}),true);return result;};
 const send=(id='operation',context=modern?'team':undefined)=>request('POST','/native/j2/send',{'x-j2-operation-id':id,'x-j2-message-id':'msg_'+id,...(context===undefined?{}:{'chatgpt-account-id':context})});
 return {app,request,send,context:value=>selected=value,principal:value=>principal=value,roster:value=>accounts=value};
}
test('non-first selected Team binds declared failure receipt without appending a message',()=>{
 const f=fixture(),before=f.app.snapshot().rows;assert.equal(f.send().status,503);
 const read=f.request('GET','/native/j2/operations/operation');assert.equal(read.status,200);
 assert.equal(read.body.contextId,'team');assert.equal(read.body.conversationId,J2_C);assert.equal(read.body.acceptanceState,'failed');assert.deepEqual(f.app.snapshot().rows,before);
});
test('selected Team success keeps original accepted time and duplicate operation rejection',()=>{
 const f=fixture();f.request('POST','/native/j2/success');assert.equal(f.send().status,200);
 const before=f.app.snapshot();assert.equal(before.operations[0].contextId,'team');assert.equal(before.rows.at(-1).at,'2026-10-17T00:00:00.000Z');
 assert.equal(f.send().status,409);assert.deepEqual(f.app.snapshot(),before);
});
for(const context of [undefined,'personal','absent'])test('selected-context declared send rejects '+String(context)+' header without creating operation',()=>{
 const f=fixture(),headers={'x-j2-operation-id':'operation','x-j2-message-id':'message',...(context===undefined?{}:{'chatgpt-account-id':context})},before=f.app.snapshot();
 assert.equal(f.request('POST','/native/j2/send',headers).status,409);assert.deepEqual(f.app.snapshot(),before);
});
test('stored receipt is inaccessible after context switch, principal switch or roster removal',()=>{
 const f=fixture();f.send();const read=()=>f.request('GET','/native/j2/operations/operation');assert.equal(read().status,200);
 f.context('personal');assert.equal(read().status,404);f.context('team');f.principal('other-user');assert.equal(read().status,404);
 f.principal('user-test');f.roster([{account_id:'personal'}]);assert.equal(read().status,404);
});
test('readback rejects supplied mismatching context header but allows production headerless readback',()=>{
 const f=fixture();f.send();assert.equal(f.request('GET','/native/j2/operations/operation').status,200);
 assert.equal(f.request('GET','/native/j2/operations/operation',{'chatgpt-account-id':'personal'}).status,404);
 assert.equal(f.request('GET','/native/j2/operations/operation',{'chatgpt-account-id':'team'}).status,200);
});
test('explicit absent selection never falls back to first roster row',()=>{
 const f=fixture();f.context(null);const before=f.app.snapshot();assert.equal(f.send('operation','personal').status,409);assert.deepEqual(f.app.snapshot(),before);
});
test('legacy single-roster headerless failure and immutable operation readback remain supported',()=>{
 const f=fixture({modern:false});assert.equal(f.send().status,503);const row=f.request('GET','/native/j2/operations/operation');assert.equal(row.status,200);assert.equal(row.body.contextId,'personal');
 assert.equal(f.send().status,409);assert.deepEqual(f.request('GET','/native/j2/operations/operation'),row);
});
test('ambiguous legacy roster remains rejected without explicit selection',()=>{
 const f=fixture({modern:false});f.roster([{account_id:'personal'},{account_id:'team'}]);assert.equal(f.send().status,409);assert.equal(f.app.snapshot().operations.length,0);
});
