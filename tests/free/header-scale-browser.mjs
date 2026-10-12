/** Real MV3 transport; synthetic extension-origin IDB only. No production account. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {build} from '../../simulator/build.mjs';
import {createServer} from '../../simulator/server.mjs';
const directory=await mkdtemp(join(tmpdir(),'vaiwl-header-scale-')),extension=join(directory,'extension'),hashes=build(extension);
await writeFile(join(extension,'seed.html'),'<!doctype html><meta charset="utf-8"><title>Synthetic IDB fixture</title>');
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,report={evidence:'REAL_HEADLESS_CHROME_MV3_SYNTHETIC_HEADER_TRANSPORT',hashes,results:[],production:'NOT_RUN'};
let context;const save=()=>writeFile(process.argv[2]??'/private/tmp/free-header-scale.json',JSON.stringify(report,null,2)+'\n');
try{
 context=await chromium.launchPersistentContext(join(directory,'profile'),{executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',route=>(route.request().url().startsWith(origin+'/')||route.request().url().startsWith('chrome-extension://'))?route.continue():route.abort());
 const cdp=await context.browser().newBrowserCDPSession();report.browser=(await cdp.send('Browser.getVersion')).product;
 const extensionId=(await cdp.send('Extensions.loadUnpacked',{path:extension})).id;
 const page=await context.newPage(),session=await context.newCDPSession(page);let worlds=[];
 session.on('Runtime.executionContextCreated',({context})=>worlds.push(context));await session.send('Runtime.enable');
 const probe=async account=>{
  worlds=[];await page.goto(`${origin}/hf/${account}/c/T0?mode=native`);await page.waitForTimeout(200);
  const world=worlds.find(w=>w.name===extensionId||w.origin===`chrome-extension://${extensionId}`);if(!world)throw Error('missing-extension-world:'+JSON.stringify(worlds));
  const result=await session.send('Runtime.evaluate',{contextId:world.id,awaitPromise:true,returnByValue:true,expression:`(async()=>{const bind=await chrome.runtime.sendMessage({v:1,type:'BIND',clientId:'header_scale',seq:1});if(!bind.ok)return {bind};const start=performance.now();try{const result=await chrome.runtime.sendMessage({v:1,type:'B23_FREE_HEADER',clientId:'header_scale',seq:2,leaseId:bind.leaseId});const elapsedMs=performance.now()-start;if(!result.ok)return {ok:false,reason:result.reason,elapsedMs};const text=JSON.stringify(result);return {ok:true,elapsedMs,wireBytes:new TextEncoder().encode(text).length,wireUnits:text.length,projects:Object.keys(result.header.manifest.projectVersions).length,refs:Object.keys(result.header.manifest.refVersions).length,activity:Object.keys(result.header.manifest.activityVersions).length,lastRef:Object.keys(result.header.manifest.refVersions).at(-1),lastProject:Object.keys(result.header.manifest.projectVersions).at(-1)};}catch(error){return {ok:false,error:error.message,elapsedMs:performance.now()-start};}})()`});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
 };
 report.results.push({name:'small control',...await probe('A')});console.log(JSON.stringify(report.results.at(-1)));await save();assert(report.results[0].ok);
 const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${extensionId}/`));assert(worker);
 const seedPage=await context.newPage();await seedPage.goto(`chrome-extension://${extensionId}/seed.html`);
 report.seed=await seedPage.evaluate(async({origin,count})=>{
  const {createFixtureService}=await import('./simulator/service.mjs'),{scopeOf}=await import('./simulator/data.mjs'),{emptyState}=await import('./src/data/state.mjs');
  const {emptyNativeFacts,validateNativeFacts,applyNativeObservations}=await import('./src/data/native-facts.mjs');
  const {saveNativePieces,nativeRecord,validateNativeManifest}=await import('./src/data/native-partitions.mjs');
  const service=createFixtureService({indexedDB,extensionId:chrome.runtime.id,getFrame:x=>chrome.webNavigation.getFrame(x)}),scope=scopeOf('B'),start=performance.now();
  const state=emptyState(scope);state.revision=1;state.channel='synthetic';
  const longId=(prefix,i)=>prefix+String(i).padStart(6,'0')+'x'.repeat(121);
  for(let i=0;i<count;i++){const id=longId('R',i);state.refs[id]={id,nativeUrl:`${origin}/hf/B/c/${id}`,nativeTitle:'synthetic',projectId:null,available:true};}
  const initialized=await service.workspaces.partitioned.initialize(scope,state);if(!initialized.ok)throw Error('seed-shared:'+JSON.stringify(initialized));
  const now='2026-10-11T04:00:00Z',until='2026-10-12T04:00:00Z',current=emptyNativeFacts(scope);
  const facts=applyNativeObservations(current,{scopeKey:current.scopeKey,sourceRevision:1,observedAt:now,validUntil:until,projects:[],refs:[],membership:[],inventory:{projects:'complete',conversations:'complete',cursor:null}},{scope,now,channel:'synthetic',sourceId:'native_fixture_v1',generation:'fixture_generation_v1'});
  facts.format='vaiwl-native-facts-v2';
  for(let i=0;i<count;i++){const id=longId('P',i);facts.projects[id]={id,nativeName:'synthetic',nativeUrl:`${origin}/hf/B/project/${id}`,availability:'available',sourceId:'native_fixture_v1',generation:'fixture_generation_v1',sourceRevision:1,observedAt:now,validUntil:until};}
  validateNativeFacts(facts,scope);
  const db=await service.repository.open();await new Promise((resolve,reject)=>{const tx=db.transaction(['native_states','native_operations'],'readwrite');try{saveNativePieces(tx.objectStore('native_states'),scope,current,facts,null,{});tx.objectStore('native_operations').put(nativeRecord(current.scopeKey,{revision:1}));}catch(e){tx.abort();reject(e);}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??Error('seed-aborted'));});
  const n=await service.native.header(scope),s=await service.workspaces.partitioned.manifest(scope);validateNativeManifest(n.manifest,scope);
  const result={elapsedMs:performance.now()-start,refCount:count,projectCount:count,idLength:longId('R',0).length,sharedManifestUnits:JSON.stringify(s).length,nativeManifestUnits:JSON.stringify(n.manifest).length,sharedPieceUnits:s.units,nativePieceUnits:n.manifest.units,perManifestLimit:16*1024*1024,perInventoryUnitsLimit:128*1024*1024};service.close();return result;
 },{origin,count:100000});console.log(JSON.stringify(report.seed));await save();
 report.results.push({name:'100k max-length shared refs plus 100k max-length native projects',...await probe('B')});console.log(JSON.stringify(report.results.at(-1)));await save();
 assert(report.results.at(-1).ok);assert.equal(report.results.at(-1).refs,100000);assert.equal(report.results.at(-1).projects,100000);assert.equal(report.results.at(-1).activity,100000);
 assert(report.seed.sharedManifestUnits<=report.seed.perManifestLimit&&report.seed.nativeManifestUnits<=report.seed.perManifestLimit);assert(report.seed.sharedPieceUnits<=report.seed.perInventoryUnitsLimit&&report.seed.nativePieceUnits<=report.seed.perInventoryUnitsLimit);
}catch(error){report.error=error.stack;console.error(error);process.exitCode=1;}finally{await save();await context?.close();await new Promise(resolve=>server.close(resolve));}
