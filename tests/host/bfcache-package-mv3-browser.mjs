/** Actual packaged offline MV3. A BFCache miss is NOT a lifecycle pass. */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-bfcache-package-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),info=JSON.parse(manifestBytes),hash=b=>createHash('sha256').update(b).digest('hex'),script='tests/host/bfcache-package-mv3-browser.mjs',scriptHash=hash(await readFile(script)),output=process.argv[2]??'/private/tmp/free-bfcache-package-mv3.json';
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_BFCACHE_OFFLINE',fixture:'LEGACY reconstruction; actual browser navigation and owner grants',actualBFCacheResidency:'NOT_RUN',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',package:built,sourceHashes:info.sourceHashes,scriptHash,buildManifestHash:hash(manifestBytes),results:[],errors:[],notRestored:[]};let context,page;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions','--disable-back-forward-cache'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',r=>r.request().url().startsWith(server.origin)||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 // Test-process observation only: do not replace responses, authorize frames,
 // persist grants or log their IDs. Capture the real owner-issued identity.
 await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;globalThis.bfcacheGrant=null;const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async m=>{const r=await send(m);if(r?.ok===true&&r.grant?.id)globalThis.bfcacheGrant={id:r.grant.id,mountId:r.grant.mountId,uiDocumentId:r.grant.uiDocumentId};return r;};});
 const browserCDP=await context.browser().newBrowserCDPSession(),{id}=await browserCDP.send('Extensions.loadUnpacked',{path:built.unpacked});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');cdp.on('Page.backForwardCacheNotUsed',e=>report.notRestored.push({reasons:e.notRestoredExplanations?.map(x=>({type:x.type,reason:x.reason})),tree:e.notRestoredExplanationsTree}));
 const framePair=async()=>{await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});const frames=['workspace','sidebar'].map(role=>page.frames().find(f=>f.url()===`chrome-extension://${id}/${role}.html`));assert(frames.every(Boolean));await frames[0].getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});return frames;};
 const grant=async frame=>{await frame.waitForFunction(()=>!!globalThis.bfcacheGrant,{},{timeout:10000});return frame.evaluate(()=>bfcacheGrant);};
 await page.goto(server.url);const prior=await framePair(),priorGrants=await Promise.all(prior.map(grant));
 await page.locator('textarea').fill('BFCACHE_NATIVE_UNSENT_DRAFT');await page.getByRole('button',{name:'返回工作空间',exact:true}).click();await framePair();
 await page.evaluate(()=>{globalThis.bfcacheOriginalInput=document.querySelector('textarea');globalThis.bfcacheEvents=[];addEventListener('pagehide',e=>bfcacheEvents.push({kind:'hide',persisted:e.persisted}));addEventListener('pageshow',e=>bfcacheEvents.push({kind:'show',persisted:e.persisted}));});
 report.results.push({name:'actual-package-dual-role-grants-and-native-draft-established',status:'PASS'});
 // Full-document navigation; never history.pushState or a synthetic pageshow.
 await page.goto(server.origin+'/c/33333333-3333-4333-8333-333333333333');await framePair();await page.goBack({waitUntil:'commit',timeout:10000});
 try{await page.waitForFunction(()=>globalThis.bfcacheEvents?.some(e=>e.kind==='show'&&e.persisted),{},{timeout:5000});}catch{}
 const observation=await page.evaluate(()=>({events:globalThis.bfcacheEvents??[],hit:globalThis.bfcacheEvents?.some(e=>e.kind==='show'&&e.persisted)===true,draftIdentity:document.querySelector('textarea')===globalThis.bfcacheOriginalInput,draftValue:document.querySelector('textarea')?.value==='BFCACHE_NATIVE_UNSENT_DRAFT',notRestored:performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON?.()??null}));report.observation=observation;report.actualBFCacheResidency=observation.hit?'HIT':'NOT_HIT';
 if(!observation.hit){report.limitation='Actual BFCache residency was not observed; restored-frame/grant and draft lifecycle assertions NOT_RUN.';throw Error('bfcache-not-hit');}
 assert(observation.events.some(e=>e.kind==='hide'&&e.persisted));assert.equal(observation.draftIdentity,true);assert.equal(observation.draftValue,true);
 const fresh=await framePair(),freshGrants=await Promise.all(fresh.map(grant));
 for(let i=0;i<2;i++){assert.notEqual(fresh[i],prior[i]);assert.equal(prior[i].isDetached(),true);assert.notEqual(freshGrants[i].id,priorGrants[i].id);assert.notEqual(freshGrants[i].mountId,priorGrants[i].mountId);assert.notEqual(freshGrants[i].uiDocumentId,priorGrants[i].uiDocumentId);}
 report.grantComparison={roles:2,newGrantIds:true,newMountIds:true,newUiDocuments:true,identifiersRedacted:true};
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===bfcacheOriginalInput&&bfcacheOriginalInput.value==='BFCACHE_NATIVE_UNSENT_DRAFT'),true);
 report.results.push({name:'actual-persisted-back-restores-with-fresh-frames-and-owner-grants',status:'PASS'},{name:'same-native-textarea-and-unsent-draft-survive-bfcache',status:'PASS'});
 assert.deepEqual(server.snapshot().actions,{});assert.deepEqual(report.errors,[]);verifyHost(built.unpacked);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;try{if(page)await page.screenshot({path:output.replace(/\.json$/,'.png'),fullPage:true});}catch{}}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean)||hash(await readFile(script))!==scriptHash;report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;if(report.sourceChangedDuringRun||!report.buildManifestUnchanged){report.status='FAIL';report.originalError=report.error;report.error='source-or-package-changed-during-run';process.exitCode=1;}await writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,actualBFCacheResidency:report.actualBFCacheResidency,results:report.results,error:report.error}));
