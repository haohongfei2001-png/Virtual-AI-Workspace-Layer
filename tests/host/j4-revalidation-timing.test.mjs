import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeAuthority} from '../../src/runtime/scope-authority.mjs';
import {scopeLossTiming,assertNaturalRevocation} from './j2-j4-package-prerequisites.mjs';
function fixture(){
 let now=1000,n=0,calls=0,authorized=true;
 const authority=createScopeAuthority({provider:{read:async()=>{calls++;if(!authorized)throw Error('fixture-401');return {principalId:'user',expiresAt:new Date(1000000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'session_v1',transport:'worker-fixed-fetch'};}},profile:{id:'personal_v1',singlePersonalDefault:true},now:()=>now,elapsedNow:()=>now,makeId:()=>`proof_${++n}`});
 const frame={tabId:1,frameId:0,documentId:'document',actualURL:'https://chatgpt.com/',documentLifecycle:'active',incognito:false};
 return {authority,frame,get calls(){return calls;},lose:()=>authorized=false,advance:ms=>now+=ms};
}
test('silent server loss before 50s is not a received auth-change signal',async()=>{
 const f=fixture();await f.authority.refresh(f.frame,'bind');f.lose();f.advance(35000);
 assert.equal((await f.authority.revalidate(f.frame)).state,'verified');assert.equal(f.calls,1);
 f.advance(15000);assert.equal((await f.authority.revalidate(f.frame)).state,'unverified');assert.equal(f.calls,2);
});
test('foreground force revalidates before natural proof boundary',async()=>{
 const f=fixture();await f.authority.refresh(f.frame,'bind');f.lose();f.advance(1000);
 assert.equal((await f.authority.revalidate(f.frame,undefined,{force:true})).state,'unverified');assert.equal(f.calls,2);
});
test('diagnostic outer timeout never relaxes 60s proof acceptance',()=>{
 assert.equal(scopeLossTiming.outerTimeout,scopeLossTiming.proofTTL+scopeLossTiming.requestDeadline+scopeLossTiming.schedulerAllowance);
 assertNaturalRevocation({removedAfterProofStartMs:60000});
 for(const ms of [60001,65000,70000,NaN,-1])assert.throws(()=>assertNaturalRevocation({removedAfterProofStartMs:ms}));
});
test('runner keeps independent natural and trusted-foreground observations',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('./j2-j4-package-prerequisites.mjs',import.meta.url),'utf8');
 assert(source.includes('assertNaturalRevocation(natural)'));
 assert(source.indexOf('assertNaturalRevocation(natural)')<source.indexOf('const c=await context.newPage()'));
 assert(source.includes("await chrome.tabs.update(target[0].id,{active:true})"));
 assert(source.includes("e.state==='visible'&&e.trusted"));assert(source.includes('polling:100'));
 assert(!source.includes('dispatchEvent('));assert(!source.includes('setDefaultTimeout('));
});

test('headed execution is explicit and keeps native trusted visibility assertions',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('./j2-j4-package-prerequisites.mjs',import.meta.url),'utf8');
 assert.match(source,/FREE_CHROME_HEADED==='1'/);assert.match(source,/headless:!headed/);
 assert.match(source,/state==='hidden'&&e.isTrusted|state==='hidden'&&e.trusted/);
 assert.match(source,/state==='visible'&&e.isTrusted|state==='visible'&&e.trusted/);
 assert(!source.includes('dispatchEvent'));assert(!source.includes('setWebLifecycleState'));
});
