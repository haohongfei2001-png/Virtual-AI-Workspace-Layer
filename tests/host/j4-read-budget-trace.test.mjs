import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {buildHost} from '../../extension/build.mjs';import {verifyHost} from '../../extension/package.mjs';
import {J4_READ_TRACE_PATHS,J4_READ_TRACE_ANCHORS,J4_READ_TRACE_RECORDER,instrumentJ4ReadBudgetSource,createJ4ReadBudgetTracePackage,verifyJ4ReadBudgetTracePackage} from './j4-read-budget-trace.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('all J4 real anchors are unique, fail closed on drift and produce parseable modules',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'j4-read-anchors-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const path of J4_READ_TRACE_PATHS){const source=await readFile(join(root,path),'utf8'),out=instrumentJ4ReadBudgetSource(path,source);for(const [anchor]of J4_READ_TRACE_ANCHORS[path])for(const replacement of ['',anchor+anchor])assert.throws(()=>instrumentJ4ReadBudgetSource(path,source.replace(anchor,replacement)),/anchor-mismatch/);assert.throws(()=>instrumentJ4ReadBudgetSource(path,out),/already-instrumented/);const file=join(dir,path.split('/').at(-1));await writeFile(file,out);execFileSync(process.execPath,['--check',file]);}
});
test('recorder has one boot, private bounded RAM ordinals, shared signal links, fixed schema, ring drops and fresh generation',()=>{
 const c=vm.createContext({crypto:{randomUUID:()=> 'test-generation-one'},Date});vm.runInContext(J4_READ_TRACE_RECORDER,c);
 vm.runInContext(`globalThis.first=__j4ReadTrace.id('proof','PRIVATE_PROOF');globalThis.second=__j4ReadTrace.id('proof','PRIVATE_PROOF');const signal={};__j4ReadTrace.link(signal,{attempt:7,mode:'ordinary'});globalThis.linked=__j4ReadTrace.linked(signal);__j4ReadTrace.emit('reader-start',{attempt:7,proof:first,mode:'ordinary',url:'PRIVATE_URL',body:'PRIVATE_BODY',token:'PRIVATE_TOKEN',error:'PRIVATE_ERROR'});for(let i=0;i<300;i++)__j4ReadTrace.emit('request-start',{provider:i,endpoint:'detail'});for(let i=0;i<300;i++)__j4ReadTrace.id('proof','PRIVATE_'+i);globalThis.overflow=__j4ReadTrace.id('proof','PRIVATE_OVERFLOW');`,c);
 assert.equal(c.first,c.second);assert.equal(c.overflow,0);assert.equal(c.linked.attempt,7);const snapshot=JSON.parse(JSON.stringify(c.__j4ReadBudgetTrace));assert.equal(snapshot.events.length,256);assert.equal(snapshot.dropped,46);assert(!JSON.stringify(snapshot).includes('PRIVATE'));assert.deepEqual(Object.keys(snapshot),['kind','generation','events','dropped']);assert(snapshot.events.every(row=>Object.keys(row).every(key=>['stage','seq','provider','endpoint'].includes(key))));
 vm.runInContext('(function(){'+J4_READ_TRACE_RECORDER+'})();',c);assert.equal(c.__j4ReadBudgetTrace.dropped,46);
 const next=vm.createContext({crypto:{randomUUID:()=> 'test-generation-two'},Date});vm.runInContext(J4_READ_TRACE_RECORDER,next);assert.notEqual(next.__j4ReadBudgetTrace.generation,c.__j4ReadBudgetTrace.generation);assert.equal(next.__j4ReadBudgetTrace.events[0].stage,'boot');assert.equal(next.__j4ReadBudgetTrace.events.length,1);
});
test('diagnostic package recompiles actual classic bytes, preserves original manifest and rejects tamper',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'j4-read-package-'));t.after(()=>rm(dir,{recursive:true,force:true}));const original=join(dir,'original');buildHost(original,{offlineOrigin:'http://127.0.0.1:1234'});const before=await readFile(join(original,'build-manifest.json'),'utf8');const trace=await createJ4ReadBudgetTracePackage(original,join(dir,'copy'));assert.equal(trace.changes.length,5);assert.equal(trace.kind,'DIAGNOSTIC_ONLY_J4_READ_BUDGET');assert.equal(await verifyJ4ReadBudgetTracePackage(trace),true);assert.equal(verifyHost(original).status,'OFFLINE_HOST_RECONSTRUCTION');assert.equal(await readFile(join(trace.unpacked,'build-manifest.json'),'utf8'),before);assert.equal(await readFile(join(original,'build-manifest.json'),'utf8'),before);
 const runtime=await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8');assert(runtime.includes('DIAGNOSTIC_ONLY_J4_READ_BUDGET'));assert.notEqual(runtime,await readFile(join(original,'extension/classic-runtime.js'),'utf8'));
 for(const path of [...J4_READ_TRACE_PATHS,'extension/worker.mjs','extension/classic-runtime.js']){const file=join(trace.unpacked,path),saved=await readFile(file);await writeFile(file,'tampered');await assert.rejects(verifyJ4ReadBudgetTracePackage(trace),/package-changed/);await writeFile(file,saved);}
 await assert.rejects(verifyJ4ReadBudgetTracePackage({...trace,changes:trace.changes.slice(1)}),/missing-file/);
 // Exercise actual transformed modules, not a duplicate model.
 delete globalThis.__j4ReadBudgetTrace;t.after(()=>delete globalThis.__j4ReadBudgetTrace);
 const {createCurrentMetadataReader}=await import(pathToFileURL(join(trace.unpacked,J4_READ_TRACE_PATHS[0])));
 const {createSessionProvider}=await import(pathToFileURL(join(trace.unpacked,J4_READ_TRACE_PATHS[2])));
 const conversationId='11111111-1111-4111-8111-111111111111',scope={accountId:'principal_'+'a'.repeat(64),organizationId:'context_'+'b'.repeat(64)},abort=new AbortController();
 const context={scope,conversationId,documentToken:'PRIVATE_DOCUMENT',producerToken:'PRIVATE_PRODUCER',messageIds:['m1'],bodyEpoch:1,providerProfile:'chatgpt-session-v1',providerTransport:'worker-fixed-fetch',guard:()=>true,signal:abort.signal};
 let reserves=0,fetches=0;const provider=createSessionProvider({profile:{currentConversationReadEnabled:true},readBudget:{reserve:async()=>{reserves++;throw Error('read-budget-exhausted');}},fetch:async()=>{fetches++;throw Error('PRIVATE_FETCH');}});
 const reader=createCurrentMetadataReader({observations:{withCurrent:async(proof,work)=>work(context)},provider,enabled:true});
 const pending=reader.read('PRIVATE_PROOF');assert.equal(reader.read('PRIVATE_PROOF'),pending);await assert.rejects(reader.read('OTHER_PROOF'),/current-metadata-busy/);await assert.rejects(pending,/read-budget-exhausted/);assert.equal(reserves,1);assert.equal(fetches,0);
 const events=globalThis.__j4ReadBudgetTrace.events;assert(events.some(row=>row.stage==='reader-join'));assert(events.some(row=>row.stage==='reader-reject'));const readerContext=events.find(row=>row.stage==='reader-context'),providerStart=events.find(row=>row.stage==='provider-start');assert.equal(readerContext.attempt,providerStart.attempt);assert.equal(readerContext.scope,providerStart.scope);assert.equal(readerContext.conversation,providerStart.conversation);assert.equal(providerStart.mode,'ordinary');assert(events.some(row=>row.stage==='provider-terminal'&&row.error==='budget'&&row.ok===false));assert(!JSON.stringify(globalThis.__j4ReadBudgetTrace).includes('PRIVATE'));
 // Ordinary read preempts calibration while preserving reader rejection identity.
 const error=Error('PRIVATE_PROVIDER_ERROR');let release;const held=new Promise(resolve=>release=resolve),slow=createCurrentMetadataReader({enabled:true,observations:{withCurrent:async(proof,work)=>work(context)},provider:{readCurrentConversation:async()=>{await held;throw error;}}});
 const calibration=slow.readCalibration('CALIBRATION_PROOF',{isCurrent:()=>true,signal:new AbortController().signal}),rejected=assert.rejects(calibration);await Promise.resolve();const ordinary=slow.read('ORDINARY_PROOF'),ordinaryRejection=assert.rejects(ordinary,e=>e===error);release();await Promise.all([rejected,ordinaryRejection]);assert(events.some(row=>row.stage==='reader-preempt'));assert(events.some(row=>row.stage==='reader-start'&&row.mode==='calibration'));
});
test('read-budget diagnostic rejects prepared and recovery variants before launching a browser',async()=>{
 const {runJ4}=await import('./j4-package-journey.mjs');
 const names=['FREE_J4_READ_BUDGET_TRACE','FREE_J4_SCOPE_TRACE','FREE_J4_AFTER_EVIDENCE','FREE_J4_NATURAL_ENTRY_RECOVERY','FREE_J4_CONTINUE_AFTER_NATURAL_ENTRY','FREE_J4_CODEC_ROUNDTRIP'];
 const saved=Object.fromEntries(names.map(key=>[key,process.env[key]]));
 try{for(const key of names)delete process.env[key];process.env.FREE_J4_READ_BUDGET_TRACE='1';
  for(const key of names.slice(1)){process.env[key]='1';await assert.rejects(runJ4(),/read-budget-trace-requires-original-default-J4/);delete process.env[key];}
 }finally{for(const key of names)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
