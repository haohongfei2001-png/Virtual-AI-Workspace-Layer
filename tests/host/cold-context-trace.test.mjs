import {createHash} from 'node:crypto';
import {compileClassicWorker} from '../../extension/classic-worker-build.mjs';
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
 assert.equal(await verifyColdTracePackage(trace),true);assert.equal(trace.changes.length,5);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
 assert.throws(()=>verifyHost(trace.unpacked),/host-package-hash-mismatch/);
 for(const row of trace.changes){assert.notEqual(row.originalSha256,row.instrumentedSha256);if(row.path.startsWith('src/'))assert.throws(()=>instrumentColdSource(row.path,'drift'),/anchor-mismatch/);}
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
 for(const path of ['extension/worker.mjs','extension/classic-runtime.js']){const file=join(trace.unpacked,path),content=await readFile(file,'utf8');assert(content.includes('__c2Trace'));await writeFile(file,'altered');await assert.rejects(verifyColdTracePackage(trace),/package-changed/);await writeFile(file,content);}
 const missing={...trace,changes:trace.changes.filter(row=>row.path!=='extension/classic-runtime.js')};await assert.rejects(verifyColdTracePackage(missing),/manifest-missing-generated/);
});
test('runner preserves immediate cold navigation and collects existing worker only after failure',async()=>{
 const s=await readFile(new URL('./context-package-mv3-browser.mjs',import.meta.url),'utf8');
 assert(s.includes("if(!['cold','cold-trace','cold-recovery'].includes(process.argv[3]))"));assert(s.includes("const trace=process.argv[3]==='cold-trace'?"));assert(s.includes('{timeout:20000}'));assert(s.includes('worker??=context.serviceWorkers().find'));assert(!s.includes('reload('));assert(!s.includes('waitForTimeout'));
});

test('classic trace rebuild follows instrumented source and rejects stale or forged generated files',async()=>{
 const {buildHost}=await import(join(root,'extension/build.mjs')),dir=await mkdtemp(join(tmpdir(),'classic-trace-rebuild-'));
 try{
  const original=join(dir,'original');buildHost(original,{offlineOrigin:'http://127.0.0.1:3210'});
  const trace=await createColdTracePackage(original,join(dir,'copy')),compiled=compileClassicWorker(trace.unpacked);
  for(const [path,expected]of [['extension/worker.mjs',compiled.entry],['extension/classic-runtime.js',compiled.runtime]]){
   assert.equal(await readFile(join(trace.unpacked,path),'utf8'),expected);assert(trace.changes.some(row=>row.path===path));
   const file=join(trace.unpacked,path),row=trace.changes.find(row=>row.path===path),saved=row.instrumentedSha256;
   await writeFile(file,expected+'\n/* altered */');await assert.rejects(verifyColdTracePackage(trace),/package-changed/);
   row.instrumentedSha256=createHash('sha256').update(expected+'\n/* altered */').digest('hex');await assert.rejects(verifyColdTracePackage(trace),/worker-build-mismatch/);
   await writeFile(file,expected);row.instrumentedSha256=saved;
  }
  const sourcePath='src/runtime/host-worker-runtime.mjs',file=join(trace.unpacked,sourcePath),modified=await readFile(file,'utf8')+'\nglobalThis.__classicTraceSourceSentinel="CLASSIC_TRACE_SOURCE_SENTINEL";';
  assert.notEqual(await readFile(join(trace.unpacked,'extension/classic-runtime.js'),'utf8'),await readFile(join(original,'extension/classic-runtime.js'),'utf8'));
  await writeFile(file,modified);trace.changes.find(row=>row.path===sourcePath).instrumentedSha256=createHash('sha256').update(modified).digest('hex');
  const changed=compileClassicWorker(trace.unpacked);assert.notEqual(changed.runtime,compiled.runtime);assert(changed.runtime.includes('CLASSIC_TRACE_SOURCE_SENTINEL'));
  await assert.rejects(verifyColdTracePackage(trace),/worker-build-mismatch/);
  const missing={...trace,changes:trace.changes.filter(row=>row.path!=='extension/classic-runtime.js')};await assert.rejects(verifyColdTracePackage(missing),/manifest-missing-generated/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
