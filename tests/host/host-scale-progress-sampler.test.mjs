import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHostScaleProgressSampler} from './fixtures/host-scale-progress-sampler.mjs';
const frame=()=>({isDetached:()=>false,url:()=> 'chrome-extension://id/workspace.html'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({read=async()=>({revision:1}),frames=[frame()]}={}){const records=[];let time=0,calls=0;const page={isClosed:()=>false,frames:()=>frames};const sampler=createHostScaleProgressSampler({page,extensionId:'id',records,now:()=>time,read:(...args)=>{calls++;return read(...args);}});return {sampler,records,calls:()=>calls,setTime:n=>time=n};}
test('only existing preparing enables exactly three predetermined slots',async()=>{
 const s=setup();s.sampler.observe({remainingMs:29000});assert.equal(s.records.length,0);
 for(const [time,remainingMs]of [[1000,29000],[5000,25000],[10000,20000],[12000,18000],[20000,10000],[25000,5000]]){s.setTime(time);assert.equal(s.sampler.observe({remainingMs,preparing:true}),undefined);await tick();}
 assert.equal(s.calls(),3);assert.deepEqual(s.records.map(r=>r.triggerAtMs),[1000,10000,20000]);assert(s.records.every(r=>r.status==='FINISHED'&&r.startedAtMs===r.triggerAtMs&&r.finishedAtMs===r.triggerAtMs));
});
test('jumped thresholds never cause parallel read burst or retry',async()=>{
 let resolve;const s=setup({read:()=>new Promise(r=>resolve=r)});s.sampler.observe({remainingMs:9000,preparing:true});await tick();assert.equal(s.calls(),1);assert.deepEqual(s.records.map(r=>r.status),['SCHEDULED','SKIPPED_IN_FLIGHT','SKIPPED_IN_FLIGHT']);resolve({});await tick();s.sampler.observe({remainingMs:8000,preparing:true});await tick();assert.equal(s.calls(),1);
});
test('missing or ambiguous current frame consumes slots without reads',async()=>{
 for(const frames of [[],[frame(),frame()],[{isDetached:()=>true,url:()=> 'chrome-extension://id/workspace.html'}]]){const s=setup({frames});s.sampler.observe({remainingMs:9000,preparing:true});await tick();assert.equal(s.calls(),0);assert(s.records.every(r=>r.status==='SKIPPED_NO_UNIQUE_FRAME'));}
});
test('stop before dispatch cancels read; stop in flight freezes report against late result',async()=>{
 const before=setup();before.sampler.observe({remainingMs:29000,preparing:true});before.sampler.stop();await tick();assert.equal(before.calls(),0);assert.equal(before.records[0].status,'STOPPED_PENDING');
 let resolve;const s=setup({read:()=>new Promise(r=>resolve=r)});s.sampler.observe({remainingMs:29000,preparing:true});await tick();s.sampler.stop();const frozen=JSON.stringify(s.records);resolve({revision:42});await tick();assert.equal(JSON.stringify(s.records),frozen);s.sampler.observe({remainingMs:10000,preparing:true});assert.equal(s.records.length,1);
});
test('read rejection is diagnostic only and never escapes observation',async()=>{
 const s=setup({read:()=>{throw Error('token-do-not-leak');}});s.sampler.observe({remainingMs:29000,preparing:true});await tick();assert.equal(s.records[0].status,'DIAGNOSTIC_UNAVAILABLE');assert(!JSON.stringify(s.records).includes('token-do-not-leak'));
});
test('runner is opt-in, only first startup, retains 30s and bars diagnostic performance samples',async()=>{
 const source=await readFile(new URL('./host-scale-package-browser.mjs',import.meta.url),'utf8');assert.match(source,/const sampled=\(traceEnabled\|\|process.env.FREE_HOST_SCALE_PROGRESS==='1'\)&&report.phase==='tab-0-initial-surfaces'/);assert.match(source,/timeout:30000/);assert.match(source,/preparing:report.rpc.some/);assert.match(source,/finally\(\(\)=>sampler\?\.stop\(\)\)/);
 const gate=source.indexOf("status:'NOT_RUN_DIAGNOSTIC_INGESTION_OBSERVATION',samples:null");assert(gate>0&&gate<source.indexOf('report.measurement=await measureAtAdmittedScale'));assert.match(source.slice(gate,source.indexOf('report.measurement=await measureAtAdmittedScale')),/throw Error\('diagnostic-progress-run-cannot-produce-scale-timing'\)/);
});
