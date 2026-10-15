import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeColdBoundary,coldConversationRequests} from './context-cold-boundary.mjs';
const timeout=()=>{throw Object.assign(new Error('20-second original deadline'),{name:'TimeoutError'});};
test('missing receipt observation preserves cold failure and checks native presence',async()=>{
 let calls=0;const r=await observeColdBoundary({waitMounted:()=>{calls++;return timeout();},snapshot:async()=>({owned:0,nativeReading:true,nativeComposer:true})});assert.equal(calls,1);assert.equal(r.immediateColdSupport,'FAIL');assert.equal(r.receiptCause,'NOT_ESTABLISHED_WITHOUT_OWNER_TRACE');
});
test('successful first mount cannot claim missing-receipt safety coverage',async()=>{const r=await observeColdBoundary({waitMounted:async()=>{},snapshot:()=>assert.fail('not needed')});assert.equal(r.missingReceiptSafety,'NOT_COVERED_THIS_RUN');});
test('private leftovers or missing native controls fail safety observation',async()=>{for(const actual of [{owned:1,nativeReading:true,nativeComposer:true},{owned:0,nativeReading:false,nativeComposer:true},{owned:0,nativeReading:true,nativeComposer:false}])await assert.rejects(observeColdBoundary({waitMounted:timeout,snapshot:async()=>actual}),{code:'ERR_ASSERTION'});});
test('non-timeout oracle errors are never converted to conditional recovery',async()=>{const e=new Error('oracle');await assert.rejects(observeColdBoundary({waitMounted:()=>{throw e;},snapshot:()=>assert.fail()}),x=>x===e);});
test('C2 cleanup isolates diagnostics and always attempts fixture closure before report writing',async()=>{const s=await readFile(new URL('./context-package-mv3-browser.mjs',import.meta.url),'utf8');assert.match(s,/stage:'page'/);assert.match(s,/stage:'native'/);assert.match(s,/stage:'worker'/);assert.match(s,/cleanupOwnedResources/);assert(s.indexOf("['fixture',()=>server.close()]")<s.indexOf('await writeFile'));assert.match(s,/if\(!clean\)process.exitCode=1/);});
test('separate mode keeps original cold wait and genuine native action with exact request count',async()=>{const s=await readFile(new URL('./context-package-mv3-browser.mjs',import.meta.url),'utf8');assert.match(s,/else await waitMounted\(\)/);assert.match(s,/await nativeLink\.click\(\)/);assert.match(s,/assert\.equal\(requests\.length,2\)/);assert.match(s,/timeout:20000/);assert.doesNotMatch(s,/force:true|dispatchEvent|waitForTimeout/);});

test('native list pagination cannot inflate exact conversation recovery GET count',()=>{
 const first={path:'/backend-api/conversation/33333333-3333-4333-8333-333333333333'},second={path:'/backend-api/conversation/44444444-4444-4444-8444-444444444444'},list={path:'/backend-api/conversations'};
 assert.deepEqual(coldConversationRequests([first,list,second]),[first,second]);
 assert.equal(coldConversationRequests([first,list,second,second]).length,3,'duplicate detail is not hidden');
 assert.equal(coldConversationRequests([first,list]).length,1,'missing detail is not manufactured');
});
