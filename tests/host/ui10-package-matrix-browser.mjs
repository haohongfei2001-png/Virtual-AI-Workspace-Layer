import {runUi10NativePreflight,runUi10WorkspacePreflight,observeUi10NativeControls,assertUi10NativeControls} from './ui10-native-preflight.mjs';
import {prepareUi10Capture} from './ui10-capture-preparation.mjs';
import {finalizeUi10ControlVisualEvidence,inspectSyntheticPng,ui10ControlCaptureId,ui10ControlCapturePlan} from './ui10-visual-png-log.mjs';
import {exerciseUi10Interactions} from './ui10-interaction-matrix.mjs';
import {waitForVisibleUi10Title} from './ui10-visible-title.mjs';
/** Opt-in isolated Chrome MV3 UI-10 layout subcontracts. NOT full v2.7 acceptance.
 * Usage: node tests/host/ui10-package-matrix-browser.mjs output.json [LEGACY|MODERN|PARTIAL]
 * Only local native fixture writes (one explicitly created project per profile).
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {createVariantHostFixtureServer} from './fixtures/variants-server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {UI10_PROFILES,UI10_LONG_CHINESE,configureUi10Environment,observeUi10Shell,ui10PreparationReport} from './ui10-matrix-contract.mjs';
import {ui10PackageOptions,ui10Entry,ui10Sequence} from './ui10-package-sequence.mjs';
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';

const output=process.argv[2];assert(output,'output-json-path-required');
const runInteractions=process.env.FREE_UI10_INTERACTIONS==='1';
const profiles=process.argv[3]?[process.argv[3]]:[...UI10_PROFILES];
assert(profiles.every(p=>UI10_PROFILES.includes(p)),'unsupported-ui10-profile');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const testFiles=['ui10-native-preflight.mjs','fixtures/legacy.html','fixtures/native.css','fixtures/native.mjs','ui10-capture-preparation.mjs','ui10-visual-png-log.mjs','ui10-horizon-commit.mjs','ui10-visible-title.mjs','ui10-interaction-matrix.mjs','ui10-dom-contract.mjs','ui10-interaction-readiness.mjs','ui10-package-matrix-browser.mjs','ui10-package-sequence.mjs','ui10-matrix-contract.mjs','fixtures/variants-server.mjs','fixtures/ui10-conversation-title.mjs','historical-network-guard.mjs'];
const testHashes=async()=>Object.fromEntries(await Promise.all(testFiles.map(async name=>[name,hash(await readFile(new URL(name,import.meta.url)))])));
const report={...ui10PreparationReport(),kind:'PACKAGED_MV3_UI10_LAYOUT_SUBCONTRACT_CANDIDATE',status:'NOT_RUN',profiles:[],testHashesBefore:await testHashes()};

const visualCaptures=[];
async function runProfile(profile,titleMode='all'){
 const result={profile,titleMode,status:'NOT_RUN',steps:[],errors:[],viewports:[],fullV27Acceptance:'NOT_ESTABLISHED',physicalKeyboard:'NOT_RUN',physicalIME:'NOT_RUN'};
 report.profiles.push(result);
 let server,context,page,built,info,manifestHash,guard,id;
 try{
  server=profile==='LEGACY'?await createHostFixtureServer({profile}):await createVariantHostFixtureServer({profile,ui10FullSidebar:true,ui10ConversationTitle:titleMode==='long-Chinese'?UI10_LONG_CHINESE:null});assert.equal(server.manifest.profile,profile);result.fixture=server.manifest;
  const dir=await mkdtemp(join(tmpdir(),'vaiwl-ui10-'));result.artifactDirectory=dir;
  built=packageHost(join(dir,'package'),ui10PackageOptions(profile,server.origin));result.package=built;
  const manifestBytes=await readFile(join(built.unpacked,'build-manifest.json'));manifestHash=hash(manifestBytes);info=JSON.parse(manifestBytes);result.sourceHashes=info.sourceHashes;
  assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});
  context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(guard.config)]});
  await context.route('**/*',route=>route.request().url().startsWith(server.origin+'/')||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
  result.browserVersion=context.browser().version();
  result.nativePreflight=await runUi10NativePreflight({context,url:server.origin+ui10Entry(profile)});
  const cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
  // A worker-ready precondition, not a cold-start test or fake context receipt.
  result.workerExternalNetworkBlocked=await worker.evaluate(async()=>{try{await fetch('https://example.com/');return false;}catch{return true;}});assert.equal(result.workerExternalNetworkBlocked,true);
  page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
  await page.goto(server.origin+ui10Entry(profile));
  async function workspace(allowReturn=false){
   const flowVisible=()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])');return !!n&&getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>=96;};
   await page.waitForFunction(()=>{const n=document.querySelector('[data-va-owned][id$="_workspace"]:not([popover])');return n&&getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>=96||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间');},null,{timeout:15000});
   const back=page.getByRole('button',{name:'返回工作空间',exact:true});if(allowReturn&&!await page.evaluate(flowVisible)&&await back.isVisible())await back.click();
   await page.waitForFunction(flowVisible,null,{timeout:15000});
   // A flow sidebar requires a proven NAV layout slot, not merely a large
   // history rectangle. Old fixtures lacking that contract retain native NAV.
   const sidebarFits=await page.evaluate(()=>{const n=document.querySelector('[data-va-sidebar-slot]');return !!n&&n.parentElement!==document.body&&getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>0;});
   if(!sidebarFits)assert.equal(await page.locator('nav[aria-label="Chat history"]').evaluate(n=>getComputedStyle(n).visibility==='visible'),true);
   const frames=Object.fromEntries(['workspace','sidebar'].map(role=>[role,role==='sidebar'&&!sidebarFits?null:page.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`)]));assert(frames.workspace);if(sidebarFits)assert(frames.sidebar);
   await frames.workspace.locator('.workspace').waitFor();if(frames.sidebar)await frames.sidebar.locator('.sidebar-footer').waitFor();
   // Hidden frames do not deliver animation frames; do not hang the matrix
   // indefinitely while pretending the parent rectangle proves visibility.
   await frames.workspace.waitForFunction(()=>document.visibilityState==='visible'&&innerWidth>0&&innerHeight>0,null,{timeout:6000});
   return frames;
  }
  await workspace(true);
  result.initialWorkspacePreflight=await runUi10WorkspacePreflight({page,workspace});
  // Use original controls, then retain original node/File identities throughout.
  const close=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await close.isVisible())await close.click();
  await page.locator('#prompt-textarea').fill('UI10_UNSENT_DRAFT');
  await page.locator('#composer input[type=file]').setInputFiles({name:'ui10-local.txt',mimeType:'text/plain',buffer:Buffer.from('UI10 fixture file')});
  await page.evaluate(()=>{globalThis.ui10Original={document,editor:document.querySelector('#prompt-textarea'),input:document.querySelector('#composer input[type=file]'),file:document.querySelector('#composer input[type=file]').files[0]};});
  async function continuity(){
   assert.deepEqual(await page.evaluate(()=>({document:ui10Original.document===document,editor:ui10Original.editor===document.querySelector('#prompt-textarea')&&ui10Original.editor.isConnected,input:ui10Original.input===document.querySelector('#composer input[type=file]'),file:ui10Original.file===ui10Original.input.files[0],draft:ui10Original.editor.value,name:ui10Original.file.name,size:ui10Original.file.size})),{document:true,editor:true,input:true,file:true,draft:'UI10_UNSENT_DRAFT',name:'ui10-local.txt',size:Buffer.byteLength('UI10 fixture file')});
   assert.equal(server.snapshot().actions['send-intent']??0,0);
  }
  await workspace(true);
  let longTitleCreated=profile!=='LEGACY'&&titleMode==='long-Chinese';
  if(longTitleCreated)await page.waitForFunction(title=>document.querySelector('main h1')?.textContent===title,UI10_LONG_CHINESE,{timeout:15000});
  for(const {phase,cell} of ui10Sequence(profile).filter(s=>titleMode==='all'||s.cell.title===titleMode)){
   if(cell.title==='long-Chinese'&&!longTitleCreated){
    // Existing native fixture API via its own user controls, never frame DOM injection.
    const native=page.getByRole('button',{name:'返回原生阅读',exact:true});if(await native.isVisible())await native.click();
    if(!await page.locator('#new-project').isVisible())await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
    await page.locator('#new-project').click();await page.locator('#project-dialog[open]').waitFor();
    await page.locator('#project-dialog input[name=project-name]').fill(UI10_LONG_CHINESE);
    await page.locator('#project-dialog').getByRole('button',{name:'Create',exact:true}).click();
    await page.waitForFunction(title=>document.querySelector('main h1')?.textContent===title,UI10_LONG_CHINESE,{timeout:15000});
    assert.equal(server.snapshot().actions['create-project'],1);await continuity();longTitleCreated=true;await workspace(true);
   }
   await configureUi10Environment(page,cell);
   const actualViewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));if(!result.viewports.some(v=>v.width===actualViewport.width&&v.height===actualViewport.height))result.viewports.push(actualViewport);
   const frames=await workspace();await continuity();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const nativeControls=await page.evaluate(observeUi10NativeControls,false);try{assertUi10NativeControls(nativeControls);}catch(error){error.ui10NativeControls=nativeControls;throw error;}
   const titleObservation=cell.title==='long-Chinese'?await waitForVisibleUi10Title(frames.workspace,UI10_LONG_CHINESE):null;
   // Workspace stays functional; an insufficient native region is separately recorded as native sidebar, never a sidebar visual PASS.
   const measurements={};if(!frames.sidebar)measurements.sidebar={evidence:'NATIVE_SIDEBAR_RETAINED_INSUFFICIENT_REGION',formalSidebarVisual:'NOT_RUN'};for(const role of ['workspace','sidebar'].filter(role=>frames[role])){
    measurements[role]=await observeUi10Shell(frames[role]);
    measurements[role].theme=await frames[role].locator(role==='workspace'?'.workspace':'.sidebar-footer').evaluate((root,expected)=>{const style=getComputedStyle(root);return {mediaMatches:matchMedia(`(prefers-color-scheme: ${expected})`).matches,color:style.color,backgroundColor:style.backgroundColor,colorScheme:style.colorScheme};},cell.colorScheme);
    assert.equal(measurements[role].theme.mediaMatches,true,role+' frame color media mismatch');
   }
   assert.equal(await page.evaluate(expected=>matchMedia(`(prefers-color-scheme: ${expected})`).matches,cell.colorScheme),true);
   const screenshot=join(dir,`${cell.id.replaceAll('/','-')}-${phase}.png`);await page.screenshot({path:screenshot});
   const interactions=runInteractions&&phase!=='restored'?await exerciseUi10Interactions({page,frames,workspace,continuity,nativeActions:()=>server.snapshot().actions,capture:async view=>{const imageId=ui10ControlCaptureId({...cell,phase,view}),capturePreparation=imageId&&profiles.length===1?await prepareUi10Capture(frames.workspace,view,page):null;const path=join(dir,`${cell.id.replaceAll('/','-')}-${phase}-${view}.png`);const bytes=await page.screenshot({path,animations:'disabled'});if(imageId&&profiles.length===1){const png=inspectSyntheticPng(bytes),metadata={lane:'ACTUAL_MV3_OFFLINE',synthetic:true,profile,scene:view,capturePreparation,viewport:cell.viewport,theme:cell.colorScheme,zoom:1,dpr:await page.evaluate(()=>devicePixelRatio),comparisonBasis:'Approved v2.7 visual tokens/layout; current INTERACTION_SPEC sections 3/6 behavior for controls absent from prototype.',browserVersion:context.browser().version(),buildManifestHash:manifestHash,sourceSetSha256:hash(JSON.stringify(info.sourceHashes)),fixtureSetSha256:hash(JSON.stringify(report.testHashesBefore)),limits:['Synthetic fixture only; no approved visual verdict.','Working set and snippets are empty; search is a no-result query.','Not populated asset experience, physical IME, or real ChatGPT.']};visualCaptures.push({capture:{id:imageId,bytes,metadata},owner:result});(result.visualCaptures??=[]).push({id:imageId,...png,metadata});}return path;}}):null;
   result.steps.push({id:cell.id,phase,status:'PASS_LAYOUT_SUBCONTRACT',measurements,nativeControls,viewport:actualViewport,titleObservation,screenshot,interactions});
   const entry=report.cells.find(c=>c.id===cell.id);entry.nativeEvidence='PASS_LAYOUT_SUBCONTRACT_ONLY';
  }
  await continuity();assert.deepEqual(result.errors,[]);assert.equal(server.snapshot().actions['create-project']??0,profile==='LEGACY'?1:0);
  assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');
  result.nativeActions=server.snapshot().actions;result.browserVersion=context.browser().version();result.status='PASS_LAYOUT_SUBCONTRACT_ONLY';
 }catch(error){result.status='FAIL';result.error=error.stack;if(error.ui10NativePreflight)result.nativePreflight=error.ui10NativePreflight;if(error.ui10NativeControls)result.nativeControlsFailure=error.ui10NativeControls;if(error.ui10CaptureDiagnostics)result.captureDiagnostics=error.ui10CaptureDiagnostics;if(error.ui10SnippetDiagnostics)result.snippetDiagnostics=error.ui10SnippetDiagnostics;if(error.ui10HorizonDiagnostics)result.horizonDiagnostics=error.ui10HorizonDiagnostics;if(error.ui10SearchDiagnostics)result.searchDiagnostics=error.ui10SearchDiagnostics;if(error.ui10Geometry)result.geometryDiagnostics=error.ui10Geometry;if(error.ui10TitleDiagnostics)result.titleDiagnostics=error.ui10TitleDiagnostics;if(error.ui10TitleDiagnosticError)result.titleDiagnosticError=error.ui10TitleDiagnosticError;process.exitCode=1;try{if(page&&result.artifactDirectory){result.failureNativeControls=await page.evaluate(observeUi10NativeControls,false);result.failureScreenshot=join(result.artifactDirectory,'failure.png');await page.screenshot({path:result.failureScreenshot});const failureURL=page.url(),probe=await context.newPage();try{await probe.goto(`chrome-extension://${id}/status.html`);result.failureStatus=await probe.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);return tab?{status:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_STATUS'}),layout:await chrome.tabs.sendMessage(tab.id,{v:1,type:'HOST_LOCAL_LAYOUT'})}:null;},failureURL);}finally{await probe.close();}}}catch(screenshotError){result.screenshotError=screenshotError.message;}}
 finally{
  try{if(info){result.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([path,h])=>hash(await readFile(path))!==h))).some(Boolean);result.buildManifestUnchanged=hash(await readFile(join(built.unpacked,'build-manifest.json')))===manifestHash;if(result.sourceChangedDuringRun||!result.buildManifestUnchanged){result.status='FAIL';result.error=(result.error??'')+' source-or-package-changed';process.exitCode=1;}}}catch(error){result.status='FAIL';result.error=(result.error??'')+' '+error.stack;process.exitCode=1;}
  try{await context?.close();}catch(error){result.status='FAIL';result.cleanupError=error.message;process.exitCode=1;}
  try{await guard?.close();}catch(error){result.status='FAIL';result.cleanupError=(result.cleanupError??'')+' '+error.message;process.exitCode=1;}
  try{await server?.close();}catch(error){result.status='FAIL';result.cleanupError=(result.cleanupError??'')+' '+error.message;process.exitCode=1;}
  if(result.status==='FAIL')for(const cell of report.cells)if(cell.profile===profile&&(titleMode==='all'||cell.title===titleMode)&&cell.nativeEvidence==='PASS_LAYOUT_SUBCONTRACT_ONLY')cell.nativeEvidence='OBSERVED_LAYOUT_NOT_ACCEPTED_PROFILE_FAILED';
 }
}
for(const profile of profiles){if(profile==='LEGACY')await runProfile(profile);else for(const title of ['ordinary','long-Chinese'])await runProfile(profile,title);}
try{report.testHashesAfter=await testHashes();report.testSourcesStable=JSON.stringify(report.testHashesBefore)===JSON.stringify(report.testHashesAfter);}catch(error){report.testSourcesStable=false;report.testHashError=error.stack;process.exitCode=1;}
report.status=report.profiles.every(p=>p.status==='PASS_LAYOUT_SUBCONTRACT_ONLY')&&report.testSourcesStable?'PASS_LAYOUT_SUBCONTRACT_ONLY':'FAIL';
if(report.status==='FAIL')process.exitCode=1;
if(!report.testSourcesStable)for(const cell of report.cells)if(cell.nativeEvidence==='PASS_LAYOUT_SUBCONTRACT_ONLY')cell.nativeEvidence='OBSERVED_LAYOUT_NOT_ACCEPTED_TEST_SOURCE_UNVERIFIED';
report.nativeMatrix=report.status==='FAIL'?'FAIL_LAYOUT_SUBCONTRACT_NOT_UI10_ACCEPTANCE':'PARTIAL_LAYOUT_SUBCONTRACT_NOT_UI10_ACCEPTANCE';
const interactionCells=report.profiles.flatMap(p=>p.steps).filter(s=>s.interactions).map(s=>({id:s.id,views:s.interactions.views}));
const expectedInteractionIds=report.cells.filter(c=>profiles.includes(c.profile)).map(c=>c.id).sort();
const interactionCoverageComplete=runInteractions&&JSON.stringify(interactionCells.map(c=>c.id).sort())===JSON.stringify(expectedInteractionIds);
report.interactionMatrix={status:runInteractions?(report.status==='FAIL'||!interactionCoverageComplete?'FAIL_OR_BLOCKED':'PASS_CONTROL_SUBMATRIX_ONLY'):'NOT_RUN',cells:interactionCells,expectedCells:expectedInteractionIds.length,coverageComplete:interactionCoverageComplete,fullV27Acceptance:'NOT_ESTABLISHED'};
if(runInteractions&&!interactionCoverageComplete){report.status='FAIL';process.exitCode=1;}
let expectedVisualCaptures=runInteractions?profiles.length*16:0,expectedVisualIds=null;
if(runInteractions)try{report.visualApplicability=ui10ControlCapturePlan(report.profiles);expectedVisualIds=report.visualApplicability.expectedIds;expectedVisualCaptures=expectedVisualIds.length;}catch(error){report.visualApplicability={status:'NOT_ESTABLISHED',error:String(error),fullV27Acceptance:'NOT_ESTABLISHED'};report.status='FAIL';process.exitCode=1;}
if(!finalizeUi10ControlVisualEvidence({report,ownedCaptures:visualCaptures,expected:expectedVisualCaptures,expectedIds:expectedVisualIds,singleProfile:profiles.length===1}))process.exitCode=1;
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,profiles:report.profiles.map(p=>({profile:p.profile,titleMode:p.titleMode,status:p.status,error:p.error})),fullV27Acceptance:report.fullV27Acceptance}));
