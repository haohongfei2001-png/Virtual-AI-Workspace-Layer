import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
const microtasks=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(read){
 let time=1000,elapsed=0,serial=0;const jobs=new Map();
 const authority=createScopeAuthority({provider:{read},profile:{id:'single_personal_fixture',singlePersonalDefault:true},now:()=>time,elapsedNow:()=>elapsed,makeId:()=>`id_${++serial}`,schedule:(fn,ms)=>{const id=++serial;jobs.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>jobs.delete(id)});
 const frame={tabId:1,frameId:0,documentId:'original_document',documentLifecycle:'active',incognito:false,actualURL:'https://chatgpt.com/c/fixture'};
 return {authority,frame,jobs,advance(ms){time+=ms;elapsed+=ms;for(const [id,job]of [...jobs])if(job.at<=elapsed){jobs.delete(id);job.fn();}}};
}
const identity=()=>({principalId:'fixture_person',contexts:[{id:'personal',kind:'personal'}],expiresAt:new Date(100000).toISOString(),providerProfile:'fixed_fixture',transport:'worker-fixed-fetch'});

test('permanently pending provider settles at the fixed six-second deadline',async()=>{
 let signal;const h=fixture(input=>{signal=input.signal;return new Promise(()=>{});});let settled=false;
 const pending=h.authority.refresh(h.frame,'bind').then(r=>{settled=true;return r;});await microtasks();
 h.advance(5999);await microtasks();assert.equal(settled,false);h.advance(1);await microtasks();assert.equal(settled,true,'deadline must settle even when provider ignores cancellation');
 assert.equal((await pending).state,'unverified');assert.equal(signal.aborted,true);assert.notEqual(h.authority.peek(h.frame).state,'pending');assert.equal(h.authority.scopeFor(h.frame),null);
});

test('caller abort settles a pending refresh promptly and a late provider cannot publish',async()=>{
 let finish;const h=fixture(()=>new Promise(r=>finish=r)),controller=new AbortController();let settled=false;
 const pending=h.authority.refresh(h.frame,'bind',controller.signal).then(r=>{settled=true;return r;});await microtasks();controller.abort();await microtasks();
 assert.equal(settled,true,'abort cannot wait for provider resolution');assert.equal((await pending).state,'unverified');assert.equal(h.authority.scopeFor(h.frame),null);assert.notEqual(h.authority.peek(h.frame).state,'verified');
 finish(identity());await microtasks();assert.equal(h.authority.scopeFor(h.frame),null);assert.notEqual(h.authority.peek(h.frame).state,'verified');
});

test('refresh binds returned context to its captured frame, not a later mutation of the input',async()=>{
 let finish;const h=fixture(()=>new Promise(r=>finish=r)),original={...h.frame};
 const pending=h.authority.refresh(h.frame,'bind');await microtasks();h.frame.documentId='mutated_document';h.frame.actualURL='https://chatgpt.com/c/other';finish(identity());
 const result=await pending;assert.equal(result.state,'verified');assert.equal(result.grant.context.documentId,original.documentId);assert.equal(h.authority.peek(original).state,'verified');assert.notEqual(h.authority.peek(h.frame).state,'verified');
});
