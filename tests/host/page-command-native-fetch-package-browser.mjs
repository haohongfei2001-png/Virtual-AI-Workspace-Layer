/** Untouched packaged MV3. Synthetic page commands and finite native response continuity only.
 * No MAIN injection by product, fetch replacement, tap, real account or stream/backpressure claim.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir,platform} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';
import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';
import {assertPageCommandNativeFetch,commandKinds,transportKinds,createCommandCapture} from './page-command-native-fetch-oracle.mjs';
import {copyCspMessage,cspDomStrings,exactCspControlMessage} from './fault-csp-observer.mjs';
import {waitPageCommandPrivateView} from './page-command-private-readiness.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const paths=['tests/host/page-command-private-readiness.mjs','tests/host/observe-current-frame.mjs','tests/host/j2-runner-bounds.mjs','tests/host/fault-csp-observer.mjs','tests/host/disable-states-profile.mjs','tests/host/page-command-native-fetch-package-browser.mjs','tests/host/page-command-native-fetch-oracle.mjs','tests/host/fixtures/server.mjs','tests/host/fixtures/native.mjs','tests/host/fixtures/legacy.html','tests/host/fixtures/native.css','tests/host/native-visibility-browser.mjs','tests/host/historical-network-guard.mjs','tests/host/isolated-browser-cleanup.mjs'];
const evidenceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={status:'NOT_RUN',evidence:'S_RECONSTRUCTION_UNTOUCHED_MV3_NARROW',sourceCommit:process.env.GITHUB_SHA??null,evidenceHashes,fullSEC08:'NOT_ESTABLISHED',fullACT20:'NOT_ESTABLISHED',nativeTap:'NOT_IMPLEMENTED',realAccount:'NOT_RUN',G:'NOT_ESTABLISHED',U:'NOT_ESTABLISHED',deliveryModel:'FINITE_ROUTE_FULFILL_NOT_CHUNKED_STREAM',limits:['DOM privacy checks are endpoint snapshots before and after transports, not transient insert/remove history; message capture spans the finite window continuously.','Only enumerated page-origin postMessage commands, not every possible hostile input or authorized UI RPC.','Finite fulfilled bodies test MIME/body continuity, not chunk timing, backpressure, slow clone, opaque or passive-tap budgets.','No fetch wrapper is installed: Promise/result observations concern the same unmodified native call.','Private IDB equality is a bounded security observation, not full durability D acceptance.'],commands:[],transports:[]};
let server,guard,handle,dir,build;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function database(worker){return worker.evaluate(async()=>{const result={};for(const item of (await indexedDB.databases()).sort((a,b)=>a.name.localeCompare(b.name))){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(item.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{const stores={};for(const name of [...db.objectStoreNames].sort()){stores[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name),q=tx.objectStore(name).getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}result[item.name]=stores;}finally{db.close();}}return result;});}
try{
 server=await createHostFixtureServer();guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});dir=await mkdtemp(join(tmpdir(),'vaiwl-page-command-'));
 const built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});build=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=build.sourceHashes;report.fixture=server.manifest;
 handle=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??(platform()==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});
 const {context,browser}=handle;context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(15000);
 const requests=[];context.on('request',q=>requests.push({url:q.url(),method:q.method()}));
 const bodies={json:['application/json','{"ok":true}'],sse:['text/event-stream','data: {"n":1}\n\ndata: [DONE]\n\n'],ndjson:['application/vnd.openai.conversation-source+ndjson','{"n":1}\n{"n":2}\n'],'malformed-json':['application/json','{malformed']};
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===server.origin&&url.pathname.startsWith('/transport-probe/')){const kind=url.pathname.split('/').at(-1);if(kind==='network-error')return route.abort('failed');const value=bodies[kind];return value?route.fulfill({status:200,contentType:value[0],body:value[1]}):route.fulfill({status:404,body:'probe-not-found'});}return url.origin===server.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
 // Store, never replace, the native function before document_idle content execution.
 await context.addInitScript({content:`{const capture=(${createCommandCapture.toString()})(${copyCspMessage.toString()});globalThis.__commandProbe=capture.state;__commandProbe.fetch=globalThis.fetch;addEventListener('message',e=>capture.capture(e.data,e.origin,e.source===window&&e.origin===location.origin));}`});
 const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'))??await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://'+id+'/')});
 report.packagedMV3=await worker.evaluate(()=>typeof chrome.runtime.id==='string');
 report.workerNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.invalid/',{signal:AbortSignal.timeout(1500)});return false;}catch{return true;}});
 const page=await context.newPage();report.phase='native-navigation';await page.goto(server.url);
 const readiness=await waitPageCommandPrivateView(page,id,{timeout:15000,stage:value=>{report.phase=value;}});report.nativeReturnClicked=readiness.nativeReturnClicked;report.positivePrivateView=true;report.phase='private-database-baseline';
 // Wait for two equal read-only snapshots before the attack window, no fixture seeding.
 let before,last;for(let i=0;i<20;i++){const value=JSON.stringify(await database(worker));if(value===last){before=value;break;}last=value;await sleep(100);}assert(before,'private IDB did not settle');
 report.privateDatabasePresent=Object.values(JSON.parse(before)).some(db=>Object.values(db).some(rows=>rows.length>0));
 const sentinels=[...Object.values(server.privacySentinels()),...new Set(before.match(/(?:principal|context)_[a-f0-9]{64}/g)??[])];const marker='SEC08_SYNTHETIC_FORGED_MUTATION';
 const forbidden=text=>sentinels.some(s=>text.includes(s));report.positiveLeakScanner=sentinels.every(s=>forbidden('prefix '+s+' suffix'));
 report.fetchIdentityPreserved=await page.evaluate(()=>fetch===__commandProbe.fetch);report.pageHasRuntimeAccess=await page.evaluate(()=>typeof globalThis.chrome?.runtime?.sendMessage==='function');
 report.phase='page-command-window';const requestStart=requests.length,actionsBefore=JSON.stringify(server.snapshot().actions);
 for(const kind of commandKinds){const start=requests.length;await page.evaluate(({kind,marker})=>{const payload={fetch:{url:location.origin+'/transport-probe/forbidden',method:'POST'},headers:{url:'/api/auth/session',headers:{Authorization:'attacker-header'}},selector:{selector:'textarea',operation:'read'},javascript:{javascript:'globalThis.SEC08_EXECUTED=true'},'raw-repository-batch':{batch:[{op:'put',store:'native_states',value:{id:marker}}]}}[kind];const command={v:1,type:({fetch:'HOST_IDENTITY_CHALLENGE',headers:'HOST_IDENTITY_CHALLENGE',selector:'HOST_NATIVE_PLAN',javascript:'HOST_NATIVE_DISPATCH','raw-repository-batch':'HOST_UI_BATCH'})[kind],probe:'command-negative-control',kind,requestId:'sec08-'+kind,...payload};__commandProbe.pending[kind]=JSON.stringify(command);window.postMessage(command,location.origin);},{kind,marker});await page.waitForFunction(kind=>__commandProbe.delivered.includes(kind),kind);await sleep(50);const replies=await page.evaluate(kind=>__commandProbe.messages.filter(m=>m.data?.requestId==='sec08-'+kind).length,kind);report.commands.push({kind,delivered:true,requests:requests.length-start,replies});}
 await sleep(250);report.observationWindowComplete=true;report.unexpectedRequests=requests.length-requestStart;
 report.nativeWrites=JSON.stringify(server.snapshot().actions)===actionsBefore?0:1;
 const after=JSON.stringify(await database(worker));report.privateDatabaseUnchanged=before===after;report.privateDatabaseBeforeHash=hash(before);report.privateDatabaseAfterHash=hash(after);report.mutationMarkers=after.includes(marker)?1:0;
 async function scanPrivacyEndpoint(){
 const capture=await page.evaluate(()=>({messages:__commandProbe.messages,overflow:__commandProbe.captureOverflow,unsupported:__commandProbe.captureUnsupported}));
 const dom=await page.evaluate(cspDomStrings,false);
 report.captureOverflow=Math.max(report.captureOverflow??0,capture.overflow+dom.dropped);report.captureUnsupported=Math.max(report.captureUnsupported??0,capture.unsupported);
 report.pageMessageSchemaViolations=Math.max(report.pageMessageSchemaViolations??0,capture.messages.filter(({data})=>!exactCspControlMessage(data)).length);
 report.privateLeaks=Math.max(report.privateLeaks??0,[...dom.strings,...capture.messages.map(m=>JSON.stringify(m.data))].filter(forbidden).length);
 assert.equal(await page.evaluate(()=>globalThis.SEC08_EXECUTED===true),false);
 }
 await scanPrivacyEndpoint();
 report.phase='finite-native-transports';for(const kind of transportKinds){const result=await page.evaluate(async({kind,expected})=>{const p=__commandProbe,controller=new AbortController(),reason={syntheticHostCancel:true};if(kind==='host-cancel')controller.abort(reason);const promise=fetch('/transport-probe/'+kind,{signal:controller.signal}),samePromise=Promise.resolve(promise)===promise;const observations=await Promise.all([promise.then(value=>({ok:true,value}),value=>({ok:false,value})),promise.then(value=>({ok:true,value}),value=>({ok:false,value}))]);const a=observations[0],b=observations[1];let expectedOutcome;if(kind==='host-cancel')expectedOutcome=!a.ok&&a.value===reason;else if(kind==='network-error')expectedOutcome=!a.ok&&a.value instanceof TypeError;else expectedOutcome=a.ok&&!a.value.bodyUsed&&a.value.status===200&&a.value.headers.get('content-type').startsWith(expected[0])&&await a.value.text()===expected[1];return {kind,fetchIdentityPreserved:fetch===p.fetch,samePromise,sameResult:a.ok===b.ok&&a.value===b.value,expectedOutcome};},{kind,expected:bodies[kind]??null});report.transports.push(result);}
 await scanPrivacyEndpoint();report.finalPrivacyScanPerformed=true;
 report.packageVerified=verifyHost(built.unpacked).status==='OFFLINE_HOST_RECONSTRUCTION';report.status='OBSERVED';
}catch(error){report.status='FAIL';report.error=String(error?.message??error);process.exitCode=1;}
finally{
 const cleanup=await Promise.allSettled([handle?.close(),server?.close(),guard?.close()]);report.cleanupOK=cleanup.every(x=>x.status==='fulfilled');
 if(dir)try{await rm(dir,{recursive:true,force:true});}catch{report.cleanupOK=false;}
 report.sourceChanged=(await Promise.all(Object.entries({...evidenceHashes,...build?.sourceHashes}).map(async([p,d])=>hash(await readFile(p))!==d))).some(Boolean);
 if(report.status==='OBSERVED')try{report.status=assertPageCommandNativeFetch(report);}catch(error){report.status='FAIL';report.error=String(error.message);process.exitCode=1;}
 await writeFile(process.argv[2]??join(tmpdir(),'page-command-native-fetch.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,error:report.error,fullSEC08:report.fullSEC08,fullACT20:report.fullACT20}));
