import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {finalizeSys02Report,runSys02Browser} from './sys02-pending-idb-browser.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const report=()=>({status:'PASS',errors:['prior diagnostic'],sourceHashes:{first:sha('one'),second:sha('two')},results:[{name:'prior result',status:'PASS'}]});
test('SYS02 context close failure still checks every source and saves failed report',async()=>{
 const value=report(),reads=[];let saved;
 await finalizeSys02Report(value,{close:async()=>{throw Error('close exploded');},readSource:async path=>{reads.push(path);return path==='first'?'one':'two';},writeReport:async data=>{saved=structuredClone(data);}});
 assert.deepEqual(reads,['first','second']);assert.equal(saved.status,'FAIL');assert.equal(saved.sourceIntegrity,'PASS');assert.equal(saved.sourceChanged,false);assert(saved.errors.includes('prior diagnostic'));assert(saved.errors.some(error=>error.includes('close exploded')));assert.deepEqual(saved.results,[{name:'prior result',status:'PASS'}]);assert.equal(value.reportWriteSucceeded,true);
});
test('SYS02 cleanup, unreadable source and changed source all survive in final report',async()=>{
 const value=report();let saved;
 await finalizeSys02Report(value,{close:async()=>{throw Error('close exploded');},readSource:async path=>{if(path==='first')throw Error('source missing');return 'changed';},writeReport:async data=>{saved=structuredClone(data);}});
 assert.equal(saved.status,'FAIL');assert.equal(saved.sourceIntegrity,'FAIL');assert.equal(saved.sourceChanged,true);for(const text of ['prior diagnostic','close exploded','source missing','source-changed: second'])assert(saved.errors.some(error=>error.includes(text)),text);
});
test('SYS02 failed report write remains failed and exposes write error to CLI caller',async()=>{
 const value={status:'FAIL',errors:['original'],sourceHashes:{}};let attempts=0;
 await finalizeSys02Report(value,{writeReport:async()=>{attempts++;throw Error('destination denied');}});
 assert.equal(attempts,1);assert.equal(value.status,'FAIL');assert.equal(value.reportWriteSucceeded,false);assert.equal(value.sourceIntegrity,'NOT_AVAILABLE');assert(value.errors.some(error=>error.includes('destination denied')));
});
test('SYS02 package setup failure persists report without claiming native D',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sys02-report-failure-')),output=join(directory,'report.json');
 const result=await runSys02Browser({output,prepareOnly:true,buildPackage:async()=>{throw Error('package failed');}}),saved=JSON.parse(await readFile(output,'utf8'));
 assert.equal(result.status,'FAIL');assert.equal(saved.status,'FAIL');assert.equal(saved.evidence,'NOT_RUN');assert.deepEqual(saved.results,[]);assert.equal(saved.sourceIntegrity,'NOT_AVAILABLE');assert(saved.errors.some(error=>error.includes('package failed')));
});
test('SYS02 prepare-only success remains NOT_RUN for native D',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sys02-report-prepare-')),output=join(directory,'report.json');
 await runSys02Browser({output,prepareOnly:true,buildPackage:async()=>({sourceHashes:{},moduleCount:0})});const saved=JSON.parse(await readFile(output,'utf8'));assert.equal(saved.status,'NOT_RUN');assert.equal(saved.evidence,'NOT_RUN');assert.deepEqual(saved.results,[]);
});
test('SYS02 unknown suite fails closed before package or browser access',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sys02-report-suite-')),output=join(directory,'report.json');let built=false;
 const result=await runSys02Browser({output,prepareOnly:true,suite:'unsupported',buildPackage:async()=>{built=true;return {};}});
 assert.equal(built,false);assert.equal(result.status,'FAIL');assert.equal(result.evidence,'NOT_RUN');assert.deepEqual(result.results,[]);assert(result.errors.some(error=>error.includes('unknown SYS02 suite')));
});
