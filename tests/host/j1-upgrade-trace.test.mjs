import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildHost} from '../../extension/build.mjs';
import {verifyHost} from '../../extension/package.mjs';
import {instrumentJ1UpgradeSource,J1_UPGRADE_ANCHORS,J1_UPGRADE_RECORDER,createJ1UpgradeTracePackage,verifyJ1UpgradeTracePackage} from './j1-upgrade-trace.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),sourcePath='src/host/content-session.mjs';

test('J1 actual source anchors match once and reject missing, duplicated or repeated instrumentation',async()=>{
 const source=await readFile(join(root,sourcePath),'utf8'),instrumented=instrumentJ1UpgradeSource(source);
 assert(instrumented.startsWith(J1_UPGRADE_RECORDER));assert.throws(()=>instrumentJ1UpgradeSource(instrumented),/already-instrumented/);
 for(const [anchor,replacement]of J1_UPGRADE_ANCHORS){
  assert.equal(source.split(anchor).length,2);assert(instrumented.includes(replacement));
  for(const change of ['',anchor+anchor])assert.throws(()=>instrumentJ1UpgradeSource(source.replace(anchor,change)),/anchor-mismatch/);
 }
});

test('J1 recorder maps actual stack frames to public reason labels, strips private fields and caps logs at 128',()=>{
 const logs=[],context=vm.createContext({console:{log:value=>logs.push(value)},rawStack:'Error: PRIVATE_MESSAGE\n at clearUpgrade (PRIVATE_URL:1:2)\n at rebind (PRIVATE_URL:3:4)\n at privateFunction (PRIVATE_URL:5:6)\n at stop (PRIVATE_URL:7:8)'});
 vm.runInContext(J1_UPGRADE_RECORDER+`;for(let i=0;i<200;i++)__j1UpgradeTrace('clear',{identity:true,display:false,preview:'PRIVATE',body:'PRIVATE_BODY',projectId:'PRIVATE_ID'},rawStack);`,context);
 assert.equal(logs.length,128);assert(logs.every(value=>value.startsWith('J1_UPGRADE_TRACE ')));assert(!JSON.stringify(logs).includes('PRIVATE'));assert(!JSON.stringify(logs).includes('privateFunction'));
 const row=JSON.parse(logs[0].slice('J1_UPGRADE_TRACE '.length));assert.deepEqual(row,{kind:'DIAGNOSTIC_ONLY',stage:'clear',identity:true,display:false,stack:['clearUpgrade','rebind','other'],reason:'rebind'});
});

test('J1 recorder logging failure does not escape into instrumented logic',()=>{
 const context=vm.createContext({console:{log(){throw Error('PRIVATE_CONSOLE_FAILURE');}}});
 assert.doesNotThrow(()=>vm.runInContext(J1_UPGRADE_RECORDER+`;__j1UpgradeTrace('scan',{identity:false,display:false,projectAcknowledged:false,preview:false});`,context));
});

test('J1 diagnostic copy preserves original manifest and worker bundles and rejects source or worker tampering',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'j1-upgrade-trace-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const original=join(dir,'original');buildHost(original,{offlineOrigin:'http://127.0.0.1:1234'});
 const sourceBefore=await readFile(join(original,sourcePath),'utf8'),manifestBefore=await readFile(join(original,'build-manifest.json'),'utf8');
 const trace=await createJ1UpgradeTracePackage(original,join(dir,'copy'));
 assert.equal(trace.kind,'DIAGNOSTIC_ONLY_J1_UPGRADE_TRACE');assert.equal(trace.limit,128);assert.equal(trace.changes.length,1);assert.equal(trace.changes[0].path,sourcePath);assert.notEqual(trace.changes[0].originalSha256,trace.changes[0].instrumentedSha256);
 assert.equal(await verifyJ1UpgradeTracePackage(trace),true);assert.equal(verifyHost(original).status,'OFFLINE_HOST_RECONSTRUCTION');
 assert.equal(await readFile(join(original,sourcePath),'utf8'),sourceBefore);assert.equal(await readFile(join(original,'build-manifest.json'),'utf8'),manifestBefore);assert.equal(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'),manifestBefore);
 for(const path of ['extension/worker.mjs','extension/classic-runtime.js'])assert.deepEqual(await readFile(join(trace.unpacked,path)),await readFile(join(original,path)));
 for(const path of [sourcePath,'extension/worker.mjs','extension/classic-runtime.js']){
  const target=join(trace.unpacked,path),before=await readFile(target);await writeFile(target,'tampered');await assert.rejects(verifyJ1UpgradeTracePackage(trace),/package-changed/);await writeFile(target,before);
 }
 const forged={...trace,changes:[{...trace.changes[0],originalSha256:'0'.repeat(64)}]};await assert.rejects(verifyJ1UpgradeTracePackage(forged),/original-hash-mismatch/);
 assert.equal(await verifyJ1UpgradeTracePackage(trace),true);
});
