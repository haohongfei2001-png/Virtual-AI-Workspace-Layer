/** Real extension-origin IndexedDB, explicitly TEST_ONLY MV3 composition.
 * No host UI/real account/production package certification. Run only in CI or an
 * authorized isolated Chrome environment. --prepare-only never imports Chrome.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,dirname,relative,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SUITES={pending:{entry:'tests/host/sys02-pending-idb-cases.mjs',factory:'createSys02PendingCases',count:13},'completion-repair':{entry:'tests/host/sys02-completion-repair-cases.mjs',factory:'createSys02CompletionRepairCases',count:2},'initial-ack-repair':{entry:'tests/host/initial-ack-idb-cases.mjs',factory:'createInitialAckRepairCases',count:3,injection:'TEST_ONLY_BLOCK_FIRST_CONTINUATION_APPLY_AND_CHECKSUM_FAULT',authority:'REAL_HELLO_REFRESH_WITH_SYNTHETIC_FRAME_AND_HTTP'}};
function suiteSpec(suite){assert(Object.hasOwn(SUITES,suite),'unknown SYS02 suite');return SUITES[suite];}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildSys02Package(directory,{suite='pending'}={}){
 const {entry}=suiteSpec(suite);
 const files=new Map();
 async function visit(path){
  if(files.has(path))return;
  assert(!path.startsWith('../')&&!path.includes('node_modules')&&!path.includes('mock-idb'),'SYS02 nonportable dependency '+path);
  const source=await readFile(join(ROOT,path),'utf8');files.set(path,source);
  const specs=[...source.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+)\s+from\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)];
  for(const [,spec] of specs){assert(spec.startsWith('.'),'SYS02 nonlocal module '+spec);await visit(relative(ROOT,resolve(ROOT,dirname(path),spec)).split(sep).join('/'));}
 }
 await visit(entry);
 for(const [path,source] of files){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),source);}
 const manifest={manifest_version:3,name:'VAIWL SYS02 TEST ONLY IndexedDB',version:'0.0.1',background:{service_worker:'sys02-worker.mjs',type:'module'},content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}};
 await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await writeFile(join(directory,'sys02-worker.mjs'),"// TEST ONLY lifecycle anchor. No host permissions, networking or product hooks.\nchrome.runtime.onInstalled.addListener(()=>{});\n");
 await writeFile(join(directory,'sys02.html'),'<!doctype html><meta charset="utf-8"><title>VAIWL SYS02 offline IDB</title>');
 const sourceHashes=Object.fromEntries([...files].map(([path,source])=>[path,hash(source)]));
 sourceHashes['tests/host/sys02-pending-idb-browser.mjs']=hash(await readFile(fileURLToPath(import.meta.url)));
 return {sourceHashes,moduleCount:files.size,manifest};
}
export async function finalizeSys02Report(report,{close=async()=>{},readSource=path=>readFile(join(ROOT,path)),writeReport}={}){
 const fail=(stage,error)=>{report.status='FAIL';report.errors.push(`${stage}: ${error?.message??error}`);};
 try{await close();}catch(error){fail('context-close',error);}
 const entries=Object.entries(report.sourceHashes??{});
 report.sourceChanged=entries.length?false:null;
 report.sourceIntegrity=entries.length?'PASS':'NOT_AVAILABLE';
 for(const [path,expected] of entries){
  try{if(hash(await readSource(path))!==expected){report.sourceChanged=true;report.sourceIntegrity='FAIL';fail('source-changed',path);}}
  catch(error){report.sourceIntegrity='FAIL';fail('source-check '+path,error);}
 }
 // Cleanup and every source check are independent of this final report attempt.
 try{await writeReport(report);report.reportWriteSucceeded=true;}
 catch(error){report.reportWriteSucceeded=false;fail('report-write',error);}
 return report;
}
export function sys02CaseResult(name,details,elapsedMs){
 if(details!==undefined)assert.equal(details?.status,'PASS','SYS02 case returned a nonpassing result');
 return {name,status:'PASS',elapsedMs,...(details===undefined?{}:{details})};
}
export async function runSys02Browser({output=resolve('sys02-pending-idb-report.json'),prepareOnly=false,buildPackage=buildSys02Package,suite='pending'}={}){
 const report={suite,status:'NOT_RUN',evidence:'NOT_RUN',requestedEvidence:'D_REAL_EXTENSION_ORIGIN_INDEXEDDB_TEST_ONLY_COMPOSITION',mv3Composition:'TEST_ONLY',productionHostS:'NOT_RUN',liveAccount:'NOT_RUN',physicalDiskExhaustion:'NOT_RUN',wholeProcessCrash:'NOT_RUN',injection:'TEST_ONLY_ABORT_AFTER_SUCCESSFUL_PUT_REQUEST',authority:'EXPLICIT_OFFLINE_V1_CAPACITY_AND_EXISTING_JOINT_V2_FAULT_FIXTURE',sourceHashes:{},results:[],errors:[]};
 let context;
 try{
  const spec=suiteSpec(suite);
  if(spec.injection)report.injection=spec.injection;if(spec.authority)report.authority=spec.authority;
  const scratch=await mkdtemp(join(tmpdir(),'vaiwl-sys02-idb-')),extension=join(scratch,'extension');report.temporaryPackage=extension;await mkdir(extension);
  Object.assign(report,await buildPackage(extension,{suite}));
  if(!prepareOnly){
   const {chromium}=await import(process.env.FREE_PLAYWRIGHT_MODULE??'../b1/tooling/node_modules/playwright/index.mjs');
   context=await chromium.launchPersistentContext(join(scratch,'profile'),{headless:process.env.FREE_HEADED!=='1',...(process.env.FREE_CHROME_EXECUTABLE?{executablePath:process.env.FREE_CHROME_EXECUTABLE}:{}),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging','--disable-background-networking']});
   await context.route('**/*',route=>route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
   const cdp=await context.browser().newBrowserCDPSession();
   const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});assert(typeof id==='string'&&id,'SYS02 extension installation not confirmed');report.extensionId=id;
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
   await page.goto(`chrome-extension://${id}/sys02.html`);
   const environment=await page.evaluate(()=>({origin:location.origin,extensionId:chrome.runtime.id,nativeIndexedDB:Object.prototype.toString.call(indexedDB),secureContext:isSecureContext}));
   assert.equal(environment.origin,`chrome-extension://${id}`);assert.equal(environment.extensionId,id);assert.equal(environment.nativeIndexedDB,'[object IDBFactory]');assert.equal(environment.secureContext,true);report.environment=environment;report.evidence=report.requestedEvidence;
   const names=await page.evaluate(async({entry,factory})=>{const module=await import('./'+entry);globalThis.sys02Cases=module[factory](indexedDB);return sys02Cases.map(item=>item.name);},spec);
   assert.equal(names.length,spec.count,'SYS02 case denominator changed');report.results=names.map(name=>({name,status:'NOT_RUN'}));
   for(let i=0;i<names.length;i++){
    // Run independently so a failed case never hides unexecuted subcases.
    const started=Date.now();
    try{const details=await page.evaluate(async index=>sys02Cases[index].run(),i);report.results[i]=sys02CaseResult(names[i],details,Date.now()-started);}
    catch(error){report.results[i]={name:names[i],status:'FAIL',elapsedMs:Date.now()-started,error:error.message};}
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
   }
   report.browserVersion=context.browser().version();
   report.status=report.errors.length||report.results.some(row=>row.status!=='PASS')?'FAIL':'PASS';
  }
 }catch(error){report.status='FAIL';report.errors.push(error.stack??error.message);}
 finally{
  await finalizeSys02Report(report,{close:()=>context?.close(),writeReport:value=>writeFile(output,JSON.stringify(value,null,2)+'\n')});
 }
 return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const prepareOnly=process.argv.includes('--prepare-only'),output=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
 const report=await runSys02Browser({prepareOnly,suite:process.env.SYS02_SUITE??'pending',...(output?{output:resolve(output)}:{})});console.log(JSON.stringify(report));if(report.status==='FAIL')process.exitCode=1;
}
