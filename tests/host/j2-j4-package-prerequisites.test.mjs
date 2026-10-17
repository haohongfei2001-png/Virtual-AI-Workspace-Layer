import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requiredGaps,resultStatus} from './j2-j4-package-prerequisites.mjs';
test('passing prerequisites never certify J2 or J4',()=>{
 assert.equal(resultStatus([{status:'PASS'}]),'PARTIAL_J2_J4_NOT_ACCEPTED');
 assert.equal(resultStatus([]),'PARTIAL_J2_J4_NOT_ACCEPTED');
});
test('failure or changed source cannot become partial success',()=>{
 assert.equal(resultStatus([{status:'PASS'},{status:'FAIL'}]),'FAIL');
 assert.equal(resultStatus([{status:'PASS'}],{sourceChanged:true}),'FAIL');
});
test('remaining continuous-journey requirements stay explicit',()=>{
 for(const journey of ['J2','J4'])assert.equal(requiredGaps.filter(([j])=>j===journey).length,5);
 assert(requiredGaps.some(([,name])=>name==='actual-disable-uninstall'));
 assert(requiredGaps.some(([,name])=>name==='successful-ACK-without-original-time'));
});
test('runner uses default packaged composition, never grants or seeded evidence',async()=>{
 const source=await readFile(new URL('./j2-j4-package-prerequisites.mjs',import.meta.url),'utf8');
 assert(source.includes("packageHost(join(dir,'package'),{offlineOrigin:server.origin})"));
 for(const forbidden of ['offlineContext:true','offlineSnippets:true',"'readwrite'",'TestScopeProvider','ServiceWorker.stopWorker'])assert(!source.includes(forbidden),forbidden);
});
test('browser startup blocker is never reported as executed failure or success',()=>{
 assert.equal(resultStatus([{status:'NOT_RUN'}]),'NOT_RUN_BROWSER_STARTUP');
 assert.equal(resultStatus([{status:'NOT_RUN'},{status:'FAIL'}]),'FAIL');
});
