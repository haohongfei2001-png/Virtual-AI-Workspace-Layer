import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pauseJointDrain} from './j4-joint-interruption.mjs';
import {pendingDiagnosticError,PENDING_REPAIR_ASSERTIONS} from './existing-source-pending-repair-oracle.mjs';
const source=await readFile(new URL('./existing-source-pending-repair-journey.mjs',import.meta.url),'utf8');
const start=source.indexOf("stage('DEBUGGER_INSTALL');"),end=source.indexOf('\n',start),block=source.slice(start,end);
async function run(text){const events=[],built={unpacked:'/synthetic/offline-package'},running={targetId:'actual-worker'},transport={};
 const context={built,running,id:'fixture-extension',handle:{debugEndpoint:'fixture-endpoint'},stage:label=>events.push(label),connectJ4Debugger:async()=>transport,pauseJointDrain:async(cdp,id,options)=>{assert.equal(cdp,transport);assert.equal(id,'fixture-extension');assert.equal(options.packageRoot,built.unpacked,'J4-classic-package-root-required');assert.equal(options.expectedTargetId,running.targetId);return {verifyControl:async()=>events.push('verified-real-control')};}};
 await vm.runInNewContext('(async()=>{let debuggerCDP,pause;'+text+'})()',context);return events;
}
test('actual debugger installation block passes exact built package and observed worker target',async()=>{assert.deepEqual(await run(block),['DEBUGGER_INSTALL','DEBUGGER_CONTROL','verified-real-control']);});
test('prior omitted-package call fails before control and native send',async()=>{const prior=block.replace('packageRoot:built.unpacked,','');await assert.rejects(run(prior),/J4-classic-package-root-required/);});
test('real debugger installer independently rejects omitted package before any CDP command',async()=>{let commands=0;await assert.rejects(pauseJointDrain({send:async()=>{commands++;}},'fixture-extension',{expectedTargetId:'worker'}),error=>{const report=pendingDiagnosticError(error);assert.equal(report.assertionLabel,'J4-classic-package-root-required');assert.equal(report.stack,null);assert.equal(report.omitted,'assertion-diff');return true;});assert.equal(commands,0);});
test('fixed debugger assertion labels survive redaction, private suffix and diffs never do',()=>{for(const label of PENDING_REPAIR_ASSERTIONS.filter(x=>x.startsWith('J4-'))){const error={name:'AssertionError',message:label,actual:'PRIVATE_SOURCE',expected:'PRIVATE_GRANT',stack:'PRIVATE_PATH'};const result=pendingDiagnosticError(error);assert.equal(result.assertionLabel,label);assert(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(pendingDiagnosticError({...error,message:label+' PRIVATE_GRANT'}).assertionLabel,undefined);}});
