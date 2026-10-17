import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
test('scale cleanup continues after browser failure and preserves live directory',async()=>{
 const calls=[],report={status:'PARTIAL_SYS04_NOT_ACCEPTED'};
 const ok=await cleanupHostScaleRun({report,context:{close(){calls.push('browser');throw Error('close failed');}},server:{snapshot(){calls.push('snapshot');return {nativeConversations:1000};},close(){calls.push('server');}},directory:'/tmp/owned-scale',verify(){calls.push('verify');},remove(){assert.fail('must not remove possibly live profile');}});
 assert.equal(ok,false);assert.deepEqual(calls,['browser','snapshot','server','verify']);assert.equal(report.status,'FAIL_CLEANUP');assert.equal(report.retainedTemporaryDirectory,'/tmp/owned-scale');assert.equal(report.cleanupErrors.length,2);assert.equal(report.fixture.nativeConversations,1000);
});
test('scale cleanup removes only owned output even when verification throws',async()=>{
 const calls=[],report={status:'PARTIAL_SYS04_NOT_ACCEPTED'};
 const ok=await cleanupHostScaleRun({report,context:{async close(){calls.push('browser');}},server:{snapshot(){return {};},async close(){calls.push('server');}},directory:'/tmp/owned-scale',verify(){calls.push('verify');throw Error('source disappeared');},remove(path,options){calls.push('remove');assert.equal(path,'/tmp/owned-scale');assert.deepEqual(options,{recursive:true,force:true,maxRetries:5,retryDelay:100});}});
 assert.equal(ok,false);assert.deepEqual(calls,['browser','server','verify','remove']);assert.equal(report.status,'FAIL_CLEANUP');assert.equal(report.temporaryDirectoryRemoved,true);
});
test('scale cleanup is safe before browser or directory creation',async()=>{
 const report={status:'NOT_RUN_BROWSER_OR_PACKAGE_STARTUP'};assert.equal(await cleanupHostScaleRun({report,verify(){},remove(){assert.fail('no owned directory');}}),true);assert.equal(report.status,'NOT_RUN_BROWSER_OR_PACKAGE_STARTUP');
});
