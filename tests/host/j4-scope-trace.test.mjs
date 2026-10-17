import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {j4ScopeTrace} from './j4-evidence-interruption.mjs';
function event(){const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit(...a){return [...listeners].map(f=>f(...a));}};}
test('passive trace preserves browser ordering, never replies, redacts payload and detaches',()=>{
 const prior=globalThis.chrome;globalThis.chrome={webNavigation:{onHistoryStateUpdated:event(),onCommitted:event()},webRequest:{onSendHeaders:event(),onCompleted:event(),onErrorOccurred:event()},runtime:{onMessage:event()}};try{
 j4ScopeTrace({mode:'start',origin:'http://127.0.0.1:43123'});
 const d={tabId:1,frameId:0,documentId:'doc',requestId:'req',timeStamp:23,url:'http://127.0.0.1:43123/backend-api/conversation/C',requestHeaders:[{value:'SECRET'}]};chrome.webRequest.onSendHeaders.emit(d);chrome.webNavigation.onHistoryStateUpdated.emit({...d,url:'http://127.0.0.1:43123/c/C'});chrome.webRequest.onCompleted.emit({...d,statusCode:200});
 assert.deepEqual(chrome.runtime.onMessage.emit({type:'HOST_REFRESH',documentToken:'SECRET',routeEpoch:2},{url:'http://127.0.0.1:43123/c/C',frameId:0,tab:{id:1},documentId:'doc'},()=>assert.fail('reply called')),[undefined]);
 const trace=j4ScopeTrace({mode:'read'});assert.deepEqual(trace.events.map(x=>x.event),['request','history','completed','content-message']);assert(trace.events.every(x=>x.documentId==='doc'));assert(!JSON.stringify(trace).includes('SECRET'));assert(!JSON.stringify(trace).includes('/c/C'));
 for(let i=0;i<130;i++)chrome.webRequest.onCompleted.emit(d);assert.equal(j4ScopeTrace({mode:'read'}).events.length,128);assert.equal(j4ScopeTrace({mode:'read'}).dropped,6);
 j4ScopeTrace({mode:'stop'});assert.equal(chrome.runtime.onMessage.listeners.size,0);assert.equal(chrome.webRequest.onSendHeaders.listeners.size,0);
 }finally{j4ScopeTrace({mode:'stop'});globalThis.chrome=prior;}
});
test('instrumented J4 copy is opt-in and verifies changed package separately',async()=>{const s=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');for(const t of ["FREE_J4_SCOPE_TRACE==='1'",'createColdTracePackage(built.unpacked','DIAGNOSTIC_ONLY_INSTRUMENTED_J4_BASELINE','trace?.unpacked??built.unpacked','verifyColdTracePackage(trace)','instrumentedPackageUnchanged'])assert(s.includes(t),t);});

test('diagnostic mode returns after actual baseline before any native send or mixed stage',async()=>{const s=await readFile(new URL('./j4-evidence-interruption.mjs',import.meta.url),'utf8'),main=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');assert(s.indexOf("if(diagnosticOnly)")>s.indexOf("e.messageId==='j4_original_old'"));assert(s.indexOf("if(diagnosticOnly)")<s.indexOf("fill('J4 explicit native interruption send')"));assert(main.indexOf("DIAGNOSTIC_ONLY_BASELINE_OBSERVED")<main.indexOf('await runJ4JointInterruption'));assert(main.includes('diagnosticOnly:!!trace'));});

test('default formal path does not start diagnostic listeners and v2 body is reduced',async()=>{
 const s=await readFile(new URL('./j4-evidence-interruption.mjs',import.meta.url),'utf8');assert(s.includes('const traceWorker=diagnosticOnly?'));assert(s.includes("'vaiwl-host-observation/2'"));assert(s.includes("m.kind==='current-observation'?m.payload?.body"));assert(s.includes('packageTraceLimitReached:'));
});

test('trace setup is inside cleanup boundary and debugger helper is source-hashed',async()=>{const s=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');const boundary=s.indexOf(' try{\n  if(lifecycleOrderEnabled)'),setup=s.indexOf('  trace=',boundary),cleanup=s.indexOf(' finally{',setup);assert(boundary>=0&&setup>boundary&&cleanup>setup);assert(runnerHashedFiles(s).includes('j4-debugger-transport.mjs'));});

function runnerHashedFiles(source){const match=/\bfiles\s*=\s*(\[[^\]]*\])/.exec(source);assert(match,'J4-hashed-files-list-required');const files=JSON.parse(match[1].replaceAll("'",'"'));assert(Array.isArray(files)&&files.every(p=>typeof p==='string'));return files;}
test('hash inventory assertion is order-independent but does not accept filenames outside the inventory',()=>{
 assert(runnerHashedFiles("const files=['expected/modern.mjs','j4-debugger-transport.mjs'];").includes('j4-debugger-transport.mjs'));
 assert(!runnerHashedFiles("const note='j4-debugger-transport.mjs',files=['other.mjs'];").includes('j4-debugger-transport.mjs'));
 assert.throws(()=>runnerHashedFiles("const note='j4-debugger-transport.mjs';"),/hashed-files-list-required/);
});
