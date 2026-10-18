import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import vm from 'node:vm';
import {packageHost} from '../../extension/package.mjs';
import {J4_ORDER_PATHS,instrumentJ4LifecycleOrderSource,createJ4LifecycleOrderTracePackage,verifyJ4LifecycleOrderTracePackage} from './j4-lifecycle-order-trace.mjs';
for(const path of J4_ORDER_PATHS)test('lifecycle order trace exact anchors '+path,async()=>{const source=await readFile(path,'utf8'),modified=instrumentJ4LifecycleOrderSource(path,source);assert.notEqual(source,modified);assert.throws(()=>instrumentJ4LifecycleOrderSource(path,modified),/already-instrumented/);assert.throws(()=>instrumentJ4LifecycleOrderSource(path,''),/anchor-mismatch/);assert(!modified.slice(0,modified.indexOf(source.split('\n')[0])).includes('console.'));});
test('recorder bounds events and records only short hash rather than native request ID',async()=>{const source=await readFile(J4_ORDER_PATHS[0],'utf8'),out=instrumentJ4LifecycleOrderSource(J4_ORDER_PATHS[0],source),prefix=out.slice(0,out.indexOf('import '));const context={performance:{now:()=>5},Date};vm.createContext(context);vm.runInContext(prefix+'for(let i=0;i<250;i++)__j4Order("send",{request:__j4RequestHash("SECRET_REQUEST_ID"),valid:true});',context);assert.equal(context.__vaiwlJ4LifecycleOrder.length,192);assert.match(context.__vaiwlJ4LifecycleOrder[0].request,/^[0-9a-f]{8}$/);assert(!JSON.stringify(context.__vaiwlJ4LifecycleOrder).includes('SECRET'));});
test('diagnostic package verifies formal source first and recompiles both classic worker chunks',async t=>{const dir=await mkdtemp(join(tmpdir(),'j4-order-contract-'));t.after(()=>rm(dir,{recursive:true,force:true}));const built=packageHost(join(dir,'formal'),{offlineOrigin:'http://127.0.0.1:54321',offlineContext:true});const receipt=await createJ4LifecycleOrderTracePackage(built.unpacked,join(dir,'trace'));assert.equal(receipt.kind,'DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER');assert.equal(receipt.changes.length,6);assert(await verifyJ4LifecycleOrderTracePackage(receipt));assert.equal((await import('../../extension/package.mjs')).verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');for(const path of J4_ORDER_PATHS)assert(!(await readFile(new URL('../../'+path,import.meta.url),'utf8')).includes('__j4Order')); });
test('runner diagnostic retains full original journey and rereads current worker after failure/restart',async()=>{const source=await readFile(new URL('./j4-package-journey.mjs',import.meta.url),'utf8');for(const token of ["FREE_J4_LIFECYCLE_ORDER_TRACE==='1'",'DIAGNOSTIC_ONLY_J4_LIFECYCLE_ORDER','diagnosticOnly:!!trace','context?.serviceWorkers()','latest.evaluate(()=>globalThis.__vaiwlJ4LifecycleOrder??null)','lifecycleOrderPackageUnchanged','verifyJ4LifecycleOrderTracePackage(lifecycleOrderTrace)'])assert(source.includes(token),token);});
test('new commit diagnostics preserve exact API call and never refresh retained request clocks',async()=>{
 const owner=instrumentJ4LifecycleOrderSource(J4_ORDER_PATHS[0],await readFile(J4_ORDER_PATHS[0],'utf8'));
 const bootstrap=instrumentJ4LifecycleOrderSource(J4_ORDER_PATHS[1],await readFile(J4_ORDER_PATHS[1],'utf8'));
 assert(bootstrap.includes('contextObserver?.invalidateCommitted(details);'));assert(!bootstrap.includes('invalidateTab(details.tabId,details.documentId)'));
 assert(owner.includes('function invalidateTab(tabId){'));assert(owner.includes('__j4Order("invalidate-committed"'));assert(owner.includes('__j4Order("commit-document-preserved",{preserved:true,accepted:r.accepted===true})'));
 const preservation=owner.slice(owner.indexOf('r.commitRetained=true'),owner.indexOf('else requests.delete(id)',owner.indexOf('r.commitRetained=true')));
 assert(!preservation.includes('r.wall='));assert(!preservation.includes('r.elapsed='));assert(!preservation.includes('requestId'));assert(!preservation.includes('documentId'));
});

async function contentModule(path){const url=new URL('../../'+path,import.meta.url),source=instrumentJ4LifecycleOrderSource(path,await readFile(url,'utf8')).replace(/from '([^']+)'/g,(all,p)=>p.startsWith('.')?`from '${new URL(p,url).href}'`:all);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
test('content recorder is a bounded tail with dropped count and explicit field allowlist',async()=>{
 const source=await readFile(J4_ORDER_PATHS[2],'utf8'),out=instrumentJ4LifecycleOrderSource(J4_ORDER_PATHS[2],source),prefix=out.slice(0,out.indexOf('import ')),context={};vm.createContext(context);
 vm.runInContext(prefix+`for(let i=0;i<250;i++)__j4Order('context-ready',{run:i,epoch:i,document:__j4DocumentHash('PRIVATE_DOCUMENT'),token:'SECRET',body:'SECRET',enabled:true});`,context);
 const trace=context.__vaiwlJ4ContentLifecycle;assert.equal(trace.rows.length,192);assert.equal(trace.dropped,58);assert.equal(trace.sequence,250);assert.equal(trace.rows[0].sequence,59);assert.equal(trace.rows.at(-1).run,249);assert(!JSON.stringify(trace).includes('SECRET'));assert(!JSON.stringify(trace).includes('PRIVATE_DOCUMENT'));
});
test('actual bridge records accepted delivery order only and keeps callback behavior',async t=>{
 delete globalThis.__vaiwlJ4ContentLifecycle;t.after(()=>delete globalThis.__vaiwlJ4ContentLifecycle);
 const {createContextAssociationBridge}=await contentModule(J4_ORDER_PATHS[2]),listeners=new Set(),calls=[],origin='https://chatgpt.com';
 const document={location:{href:origin+'/c/33333333-3333-4333-8333-333333333333'},defaultView:{},querySelectorAll:()=>[]};
 const bridge=createContextAssociationBridge({document,runtime:{id:'extension',onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}},origin,profile:{id:'fixed',revision:1},onPending:()=>calls.push('pending'),onReady:()=>calls.push('ready')});t.after(()=>bridge.stop());const listener=[...listeners][0];
 for(const type of ['HOST_CONTEXT_PENDING','HOST_CONTEXT_READY'])for(const [message,sender]of [[{type},{id:'other'}],[{type},{id:'extension',tab:{id:1}}],[{type,extra:true},{id:'extension'}]])listener(message,sender,()=>{});
 assert.equal(globalThis.__vaiwlJ4ContentLifecycle,undefined);
 for(const type of ['HOST_CONTEXT_READY','HOST_CONTEXT_PENDING','HOST_CONTEXT_READY'])listener({type},{id:'extension'},()=>{});
 assert.deepEqual(calls,['ready','pending','ready']);assert.deepEqual(globalThis.__vaiwlJ4ContentLifecycle.rows.map(r=>r.stage),['delivery-ready','delivery-pending','delivery-ready']);bridge.stop();listener({type:'HOST_CONTEXT_READY'},{id:'extension'},()=>{});assert.equal(calls.length,3);
});
test('actual content session preserves rebind generations and pending-ready transitions',async t=>{
 delete globalThis.__vaiwlJ4ContentLifecycle;t.after(()=>delete globalThis.__vaiwlJ4ContentLifecycle);const {createHostContentSession}=await contentModule(J4_ORDER_PATHS[3]);
 const listeners=new Set(),events=new Map(),calls=[],document={location:{origin:'https://chatgpt.com',href:'https://chatgpt.com/c/33333333-3333-4333-8333-333333333333'},defaultView:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n,f)=>{if(events.get(n)===f)events.delete(n);}}};
 const binding={documentToken:'SECRET_DOCUMENT_TOKEN',producerToken:'SECRET_PRODUCER',browserDocumentId:'PRIVATE_DOCUMENT',routeEpoch:1,origin:document.location.origin,expiresAt:new Date(21000).toISOString()};
 const runtime={id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:async m=>{calls.push(m.type);return m.type==='HOST_HELLO'?{ok:true,binding}:m.type==='HOST_REFRESH'?{state:'verified',scopeKey:'PRIVATE_SCOPE'}:{ok:true};}};
 const client=createHostContentSession({document,runtime,contextRecovery:true,now:()=>1000,elapsedNow:()=>1000,makeId:()=> 'client',adapterFactory:()=>({inspect:()=>({ok:true}),stop(){}}),surfaceFactory:()=>({}),plansFactory:()=>({}),controllerFactory:()=>({start:async()=>({id:'mount'}),stop(){}})});t.after(()=>client.stop());await client.start();
 const first=globalThis.__vaiwlJ4ContentLifecycle.rows.find(r=>r.stage==='mount-ready');assert(first.ready&&first.scopePresent);assert.match(first.document,/^[0-9a-f]{8}$/);
 const listener=[...listeners][0];listener({type:'HOST_DOCUMENT_INVALIDATED',extra:true},{id:'extension'});listener({type:'HOST_DOCUMENT_INVALIDATED'},{id:'other'});assert(!globalThis.__vaiwlJ4ContentLifecycle.rows.some(r=>r.stage==='delivery-invalidated'));
 listener({type:'HOST_DOCUMENT_INVALIDATED'},{id:'extension'});for(let i=0;i<80;i++)await Promise.resolve();
 const mounts=globalThis.__vaiwlJ4ContentLifecycle.rows.filter(r=>r.stage==='mount-ready');assert.equal(mounts.length,2);assert(mounts[1].run>first.run);
 client.contextPending();await client.contextReady();assert.equal(calls.filter(x=>x==='HOST_HELLO').length,3);client.stop();const before=calls.length;await client.contextReady();assert.equal(calls.length,before);assert(!JSON.stringify(globalThis.__vaiwlJ4ContentLifecycle).includes('SECRET'));assert(!JSON.stringify(globalThis.__vaiwlJ4ContentLifecycle).includes('PRIVATE'));
});

test('stop diagnostic retains challenge hint clearing and rejects absent or duplicate exact anchor',async()=>{
 const path=J4_ORDER_PATHS[3],source=await readFile(path,'utf8'),anchor='function stop(){verificationWaitURL=null;contextResumeAllowed=false;';
 assert.equal(source.split(anchor).length,2);
 const modified=instrumentJ4LifecycleOrderSource(path,source);
 assert(modified.includes("function stop(){__j4State('stop');verificationWaitURL=null;contextResumeAllowed=false;"),'passive stop trace precedes original clearing operations');
 assert.throws(()=>instrumentJ4LifecycleOrderSource(path,source.replace(anchor,'function stop(){contextResumeAllowed=false;')),/j4-order-anchor-mismatch/);
 assert.throws(()=>instrumentJ4LifecycleOrderSource(path,source+'\n'+anchor),/j4-order-anchor-mismatch/);
});
