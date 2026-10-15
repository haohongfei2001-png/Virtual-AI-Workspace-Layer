import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createColdTracePackage,verifyColdTracePackage,instrumentColdSource} from './cold-context-trace.mjs';
const root=process.env.COLD_AUDIT_ROOT??new URL('../../',import.meta.url).pathname;
const {packageHost,verifyHost}=await import(pathToFileURL(join(root,'extension/package.mjs')));
test('cold diagnostic copy keeps original verified; patches only named files and detects alteration',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cold-trace-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const built=packageHost(join(dir,'original'),{offlineOrigin:'http://127.0.0.1:1234',offlineContext:true});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 const trace=await createColdTracePackage(built.unpacked,join(dir,'instrumented'));
 assert.equal(await verifyColdTracePackage(trace),true);assert.equal(trace.changes.length,3);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 assert.throws(()=>verifyHost(trace.unpacked),/host-package-hash-mismatch/);
 for(const row of trace.changes){assert.notEqual(row.originalSha256,row.instrumentedSha256);assert.throws(()=>instrumentColdSource(row.path,'drift'),/anchor-mismatch/);}
 const module=await import(pathToFileURL(join(trace.unpacked,'src/runtime/browser-request-context.mjs')));
 const event=()=>({addListener(f){this.f=f},removeListener(){}}),webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,event()]));
 const c='33333333-3333-4333-8333-333333333333',origin='http://127.0.0.1:1234',url=origin+'/c/'+c,frame={tabId:1,frameId:0,documentId:'document',documentLifecycle:'active',incognito:false,actualURL:url};let n=0;
 const owner=module.createBrowserRequestContext({origin,webRequest,getTab:async()=>({id:1,incognito:false}),getFrame:async()=>({documentId:'document',documentLifecycle:'active',frameType:'outermost_frame',url}),associatePage:async q=>({...q,association:'explicit-body-id'}),makeId:()=>`id_${++n}`});
 t.after(()=>{owner.stop();delete globalThis.__vaiwlColdTrace;});
 const d={tabId:1,frameId:0,documentId:'document',documentLifecycle:'active',initiator:origin,type:'xmlhttprequest',method:'GET',requestId:'r1',url:origin+'/backend-api/conversation/'+c,requestHeaders:[{name:'chatgpt-account-id',value:'team'},{name:'Authorization',value:'SECRET_SENTINEL'}]};
 webRequest.onSendHeaders.f(d);await new Promise(r=>setImmediate(r));webRequest.onCompleted.f({...d,statusCode:200,fromCache:false});await new Promise(r=>setImmediate(r));assert.equal((await owner.verify(frame)).contextId,'team');
 const stages=globalThis.__vaiwlColdTrace.map(x=>x.stage);for(const stage of ['listeners-registered','send-enter','send-admitted','prepared','complete-enter','receipt-issued','verify-enter'])assert(stages.includes(stage),stage);
 assert(!JSON.stringify(globalThis.__vaiwlColdTrace).includes('SECRET_SENTINEL'));
 for(const stage of ['prepare-frame','complete-frame']){const row=globalThis.__vaiwlColdTrace.find(r=>r.stage===stage);assert.equal(row.frameMatches,true);assert.equal(row.requestCurrent,true);}
 {const drop=globalThis.__vaiwlColdTrace.find(r=>r.stage==='receipt-drop');assert.equal(drop.tabId,1);assert.equal(drop.documentId,'document');}
 const {createHostBrowserBootstrap}=await import(pathToFileURL(join(trace.unpacked,'src/runtime/host-browser-bootstrap.mjs')));
 const earlyEvents=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(k=>[k,event()]));
 const chrome={runtime:{id:'ext',getContexts:async()=>[]},webRequest:earlyEvents,webNavigation:{getFrame:async()=>({documentId:'document',documentLifecycle:'active',frameType:'outermost_frame',url}),onCommitted:event(),onHistoryStateUpdated:event()},tabs:{get:async()=>({id:1,incognito:false}),onRemoved:event(),sendMessage:async(tabId,message)=>({...message,association:'explicit-body-id'})}};
 const scopeProfile={browserRequestContext:true},bootstrap=createHostBrowserBootstrap({chrome,origin,scopeProfile});t.after(()=>bootstrap.stop());
 bootstrap.claim({chrome,origin,scopeProfile}).attach({onContextInvalidate:()=>{},onContextReady:()=>{},onNavigation:()=>{},onRemoved:()=>{}});
 earlyEvents.onSendHeaders.f(d);await new Promise(r=>setImmediate(r));earlyEvents.onCompleted.f({...d,statusCode:200,fromCache:false});await new Promise(r=>setImmediate(r));assert.equal((await bootstrap.contextObserver.verify(frame)).contextId,'team');
 assert(globalThis.__vaiwlColdTrace.some(x=>x.stage==='outgoing'&&x.type==='HOST_CONTEXT_ASSOCIATE'));
 assert(globalThis.__vaiwlColdTrace.some(x=>x.stage==='outgoing-result'&&x.type==='HOST_CONTEXT_ASSOCIATE'&&x.association==='explicit-body-id'));
 assert(!JSON.stringify(globalThis.__vaiwlColdTrace).includes('SECRET_SENTINEL'));
 for(const stage of ['prepare-frame','complete-frame']){const row=globalThis.__vaiwlColdTrace.find(r=>r.stage===stage);assert.equal(row.frameMatches,true);assert.equal(row.requestCurrent,true);}
 {const drop=globalThis.__vaiwlColdTrace.find(r=>r.stage==='receipt-drop');assert.equal(drop.tabId,1);assert.equal(drop.documentId,'document');}
 for(let i=0;i<300;i++)webRequest.onSendHeaders.f({...d,requestId:'bad',tabId:-1});assert.equal(globalThis.__vaiwlColdTrace.length,160);
 await writeFile(join(trace.unpacked,'extension/worker.mjs'),'altered');await assert.rejects(verifyColdTracePackage(trace),/package-changed/);
});
test('runner preserves immediate cold navigation and collects existing worker only after failure',async()=>{
 const s=await readFile(new URL('./context-package-mv3-browser.mjs',import.meta.url),'utf8');
 assert(s.includes("if(!['cold','cold-trace','cold-recovery'].includes(process.argv[3]))"));assert(s.includes("const trace=process.argv[3]==='cold-trace'?"));assert(s.includes('{timeout:20000}'));assert(s.includes('worker??=context.serviceWorkers().find'));assert(!s.includes('reload('));assert(!s.includes('waitForTimeout'));
});
