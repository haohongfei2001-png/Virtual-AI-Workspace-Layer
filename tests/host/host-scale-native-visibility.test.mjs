import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cleanupHostScaleRun} from './fixtures/host-scale-cleanup.mjs';
test('scale uses existing native visibility transport with exact reject proxy and unchanged gates',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');
 assert(source.includes('launchNativeVisibilityBrowser({chromium'));
 assert(source.indexOf('browserLaunchAttempted=true;')<source.indexOf('browserHandle=await launchNativeVisibilityBrowser('));
 assert(source.includes('cleanupHostScaleRun({report,context,browserHandle,browserLaunchAttempted,networkGuard'));
 assert(source.includes('headed:false,historicalNetworkGuard:networkGuard.config'));
 assert(source.includes('createHistoricalNetworkGuard({fixtureOrigin:server.origin})'));
 assert(!source.includes('launchPersistentContext'));
 for(const forbidden of ['setFocusEmulationEnabled','dispatchEvent','Object.defineProperty'])assert(!source.includes(forbidden));
 for(const token of ['await page.setViewportSize({width:1440,height:900})','await page.bringToFront()',"visibility,'hidden'","visibility,'visible'",'event.trusted','memberReturnDeadline=performance.now()+30000','deadline:memberReturnDeadline','timeout:30000','context.setDefaultTimeout(15000)'])assert(source.includes(token),token);
 assert(source.indexOf('report.nativeVisibilityAtMember=')<source.indexOf('report.nativeMemberProgress=await'));
 assert(source.includes("'native-visibility-browser.mjs','historical-network-guard.mjs'"));
});
test('scale cleanup closes isolated child before proxy and removes profile only after confirmed close',async()=>{
 const calls=[],report={};
 assert.equal(await cleanupHostScaleRun({report,context:{close(){assert.fail('must close child owner');},once(){assert.fail('context close alone does not confirm child exit');}},browserHandle:{async close(){calls.push('browser');}},networkGuard:{async close(){calls.push('proxy');},snapshot:()=>({closed:true})},server:{snapshot:()=>({}),close(){calls.push('fixture');}},directory:'/tmp/owned',verify(){calls.push('verify');},remove(){calls.push('remove');}}),true);
 assert.deepEqual(calls,['browser','proxy','fixture','verify','remove']);assert.equal(report.networkGuard.closed,true);
});
test('child cleanup failure still closes proxy and fixture but retains possibly live profile',async()=>{
 const calls=[],report={};
 assert.equal(await cleanupHostScaleRun({report,context:{},browserHandle:{close(){throw Error('child-live');}},networkGuard:{close(){calls.push('proxy');},snapshot:()=>({closed:true})},server:{snapshot:()=>({}),close(){calls.push('fixture');}},directory:'/tmp/owned',verify(){},remove(){assert.fail('live profile');}}),false);
 assert.deepEqual(calls,['proxy','fixture']);assert.equal(report.retainedTemporaryDirectory,'/tmp/owned');
});
test('failure before browser launch still closes an allocated proxy',async()=>{
 const report={};let closed=false;
 assert.equal(await cleanupHostScaleRun({report,networkGuard:{close(){closed=true;},snapshot:()=>({closed})},verify(){}}),true);assert.equal(closed,true);
});

for(const withContext of [false,true])test(`attempted launch without returned owner retains directory even with context=${withContext}`,async()=>{
 const calls=[],report={},context=withContext?{close(){calls.push('context');},once(){assert.fail('context event cannot prove child exit');}}:undefined;
 assert.equal(await cleanupHostScaleRun({report,context,browserLaunchAttempted:true,networkGuard:{close(){calls.push('proxy');},snapshot:()=>({closed:true})},server:{snapshot:()=>({}),close(){calls.push('fixture');}},directory:'/tmp/owned-launch-failure',verify(){calls.push('verify');},remove(){assert.fail('unconfirmed child profile must remain');}}),false);
 assert.deepEqual(calls,[...(withContext?['context']:[]),'proxy','fixture','verify']);
 assert.equal(report.status,'FAIL_CLEANUP');assert.equal(report.retainedTemporaryDirectory,'/tmp/owned-launch-failure');assert.equal(report.temporaryDirectoryRemoved,undefined);
 assert.deepEqual(report.cleanupErrors.map(row=>row.name),['browser','owned-temporary-directory']);
});
test('attempted launch with returned owner removes only its directory after child close confirmation',async()=>{
 const report={},calls=[];
 assert.equal(await cleanupHostScaleRun({report,browserLaunchAttempted:true,browserHandle:{close(){calls.push('child-exit');}},directory:'/tmp/owned-confirmed',verify(){},remove(path){assert.equal(path,'/tmp/owned-confirmed');calls.push('remove');}}),true);
 assert.deepEqual(calls,['child-exit','remove']);assert.equal(report.temporaryDirectoryRemoved,true);
});
