/** LEGACY-only S candidate: reuse native controls and unmodified packaged Host.
 * No G/U, deletion-result semantics, worker-cold race, or complete case claim.
 * node tests/host/native-entry-safety-package-browser.mjs output.json
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';import {legacyExpectedWorld as expected} from './expected/legacy.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
import {launchNativeVisibilityBrowser} from './native-visibility-browser.mjs';import {createHistoricalNetworkGuard} from './historical-network-guard.mjs';import {cleanupOwnedResources} from './isolated-browser-cleanup.mjs';
import {exampleTargets,assertExamplesExcluded,assertCancelUnchanged,assertNativeScope,restoreNativeEntrySurfaces} from './native-entry-safety-oracle.mjs';
import {openNativeProjectEntry} from './native-entry-project-navigation.mjs';
import {inspectColdNativeCache,readNativeEntryFacts} from './native-entry-facts-inspection.mjs';
const output=process.argv[2];assert(output,'output-json-path-required');
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['native-entry-safety-package-browser.mjs','native-entry-safety-oracle.mjs','native-entry-facts-inspection.mjs','native-entry-project-navigation.mjs','native-visibility-browser.mjs','historical-network-guard.mjs','isolated-browser-cleanup.mjs','fixtures/server.mjs','fixtures/native.mjs','fixtures/native.css','fixtures/legacy.html','expected/legacy.mjs'];
const testHashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
const report={sourceCommit:process.env.FREE_SOURCE_COMMIT??process.env.GITHUB_SHA??null,status:'NOT_RUN',evidence:'PACKAGED_MV3_OFFLINE_LEGACY_SUBSCENARIOS',profile:'LEGACY',realChatGPT:'NOT_RUN',physicalUser:'NOT_RUN',fullCaseAcceptance:'NOT_ESTABLISHED',startup:'Fresh isolated profile, empty native cache; worker-ready precondition, not worker-cold race',INV09:{status:'NOT_ESTABLISHED',reason:'Existing surface-delta reducer emits available rows only. A normative native deletion-result semantic and actual production consumer must be established before a synthetic delete fixture can certify this case.'},results:[],errors:[],testHashesBefore:await testHashes()};
let server,running,guard,info,built,page,worker,id;const nativeRequests=[];
const poll=async(fn)=>{const end=Date.now()+15000;do{const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,50));}while(Date.now()<end);throw Error('native-entry-observation-timeout');};
const nativePages=[];
async function facts(){return readNativeEntryFacts({pages:nativePages,extensionId:id,fixtureOrigin:server.origin});}
async function workspace(p=page){
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned][id$="_workspace"]:popover-open')].some(n=>getComputedStyle(n).visibility==='visible')||[...document.querySelectorAll('button')].some(n=>n.getAttribute('aria-label')==='返回工作空间'),null,{timeout:15000});
 const back=p.getByRole('button',{name:'返回工作空间',exact:true});if(await back.isVisible())await back.click();
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-va-owned][id$="_workspace"]:popover-open')].some(n=>getComputedStyle(n).visibility==='visible'),null,{timeout:15000});const frame=p.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`);assert(frame);await frame.locator('.workspace').waitFor();return frame;
}
async function native(p=page){await restoreNativeEntrySurfaces(p);}
try{
 server=await createHostFixtureServer();report.fixture=server.manifest;
 const dir=await mkdtemp(join(tmpdir(),'vaiwl-native-entry-'));report.artifactDirectory=dir;built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json')));report.sourceHashes=info.sourceHashes;report.packageVerification=verifyHost(built.unpacked);assert.equal(report.packageVerification.status,'OFFLINE_HOST_RECONSTRUCTION');
 guard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});running=await launchNativeVisibilityBrowser({chromium,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/usr/bin/chromium',profileDir:join(dir,'profile'),headed:false,historicalNetworkGuard:guard.config});const {context,browser}=running;report.browserVersion=browser.version();
 await context.route('**/*',r=>r.request().url().startsWith(server.origin+'/')||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 context.on('request',r=>{if(r.url()===server.origin+'/native/action'&&r.method()==='POST')nativeRequests.push(r.postDataJSON());});
 const cdp=await browser.newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}));worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${id}/`))??await context.waitForEvent('serviceworker');
 report.initialCache=await worker.evaluate(inspectColdNativeCache);assert.equal(report.initialCache.nativeRows,0,'fresh profile must have no native scope cache');
 report.factsInspection='Existing exact-origin owned workspace frame; no added inspector page or focus change';
 page=await context.newPage();nativePages.push(page);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.origin+'/c/'+expected.conversations[2].id);
 await workspace();const initial=await poll(facts);await native();
 const initialNative=server.snapshot();await page.locator('#new-project').click();await page.locator('#project-dialog[open]').waitFor();await page.locator('#project-dialog input').fill('CANCELLED_SYNTHETIC_PROJECT');
 assert.equal(server.snapshot().actions['create-project']??0,0);assert.deepEqual(Object.keys((await facts()).projects).sort(),Object.keys(initial.projects).sort());
 await page.locator('#project-dialog').getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('#project-dialog[open]').waitFor({state:'hidden'});
 // Fence the cancel readback behind a subsequently observed native update.
 const cancelWitness=expected.conversations[3].id,cancelTitle='Native cancel observation witness';
 await page.evaluate(({id,title})=>{document.querySelector(`aside nav[aria-label="Chat history"] a[href="/c/${id}"]`).textContent=title;},{id:cancelWitness,title:cancelTitle});
 await poll(async()=>{const f=await facts();return f?.revision>initial.revision&&f.refs[cancelWitness]?.nativeTitle===cancelTitle;});await workspace();
 assertCancelUnchanged({before:initialNative,after:server.snapshot(),beforeIds:Object.keys(initial.projects),afterIds:Object.keys((await facts()).projects)});
 report.results.push({id:'UI-05',subcase:'cold-native-cache-new-project-cancel',status:'PASS',createdProjects:0});
 // Six non-native examples; also change one legitimate native history label.
 // That positive witness fences the negative assertion after a real ingested scan.
 await native();const before=await facts(),witnessId=expected.conversations[3].id,witnessTitle='Observed native boundary witness';
 await page.evaluate(({targets,witnessId,witnessTitle})=>{
  const reading=document.querySelector('#reading'),assistant=document.createElement('article');assistant.dataset.messageAuthorRole='assistant';const code=document.createElement('pre');code.append(document.createElement('code'));const third=document.createElement('section');third.id='synthetic-third-party-ui';reading.append(assistant,code);document.body.append(third);
  for(const row of targets){const a=document.createElement('a');a.href=row.entity==='project'?`/g/${row.id}/project`:`/c/${row.id}`;a.textContent=`Non-native ${row.region} ${row.entity}`;(row.region==='assistant'?assistant:row.region==='code'?code.firstChild:third).append(a);}
  document.querySelector(`aside nav[aria-label="Chat history"] a[href="/c/${witnessId}"]`).textContent=witnessTitle;
 },{targets:exampleTargets,witnessId,witnessTitle});
 const after=await poll(async()=>{const f=await facts();return f?.revision>before.revision&&f.refs[witnessId]?.nativeTitle===witnessTitle?f:null;});assertExamplesExcluded({before,after,witnessId,witnessTitle});
 report.results.push({id:'MAP-09',subcase:'assistant-code-third-party-project-and-conversation-examples-excluded',status:'PASS',observedRevisionBefore:before.revision,observedRevisionAfter:after.revision,excludedExamples:exampleTargets.length});
 // Same untouched native create dialog: no fake Project before confirmation.
 await page.locator('#new-project').click();await page.locator('#project-dialog[open]').waitFor();const createdName='Confirmed synthetic native project';await page.locator('#project-dialog input').fill(createdName);assert.equal(server.snapshot().actions['create-project']??0,0);await page.locator('#project-dialog').getByRole('button',{name:'Create',exact:true}).click();
 await page.waitForURL('**/g/g-p-*/project');const createdId=new URL(page.url()).pathname.split('/')[2];await poll(async()=> (await facts())?.projects[createdId]?.nativeName===createdName);const createdFrame=await workspace();await createdFrame.getByText(createdName,{exact:true}).first().waitFor();assert.equal(server.snapshot().actions['create-project'],1);
 report.results.push({id:'UI-05',subcase:'confirmed-native-project-only-then-card',status:'PASS',createdId});
 // With clear composer and an existing native anchor, the real P entry dispatches
 // same-page native control. Static _blank is only its browser fallback.
 const projectId=expected.projects[0].id,projectURL=server.origin+`/g/${projectId}/project`,link=createdFrame.getByRole('link',{name:'打开项目以新建聊天 Research',exact:true}).and(createdFrame.locator(`a[href="${projectURL}"]`));await link.waitFor();assert.equal(await link.getAttribute('target'),'_blank');const beforeOpen=server.snapshot().actions['new-project-chat']??0;
 report.projectEntry=await openNativeProjectEntry({page,context,link,projectURL,readActions:()=>nativeRequests});const projectPage=page;await workspace(projectPage);assert.equal(server.snapshot().actions['new-project-chat']??0,beforeOpen);await native(projectPage);
 await projectPage.getByRole('button',{name:'New chat in project',exact:true}).click();await projectPage.waitForURL('**/c/*');const projectPath=new URL(projectPage.url()).pathname;await workspace(projectPage);const createdBefore=server.snapshot().conversationCount;
 await projectPage.locator('a[data-testid="create-new-chat-button"]').click();await projectPage.waitForURL(server.origin+'/');await poll(()=>nativeRequests.some(r=>r.kind==='new-chat'));const projectCalls=nativeRequests.filter(r=>r.kind==='new-project-chat'),globalCalls=nativeRequests.filter(r=>r.kind==='new-chat');assert.equal(projectCalls.length,1);assert.equal(globalCalls.length,1);
 assertNativeScope({projectId,projectRequest:projectCalls[0],globalRequest:globalCalls[0],projectPath,globalPath:new URL(projectPage.url()).pathname,createdBefore,createdAfter:server.snapshot().conversationCount});
 // Re-enter the genuine native P member list to verify the returned C belongs
 // to P, rather than treating an outgoing request as successful membership.
 await native(projectPage);const nativeProjectLink=projectPage.locator(`aside section[aria-label="Projects"] a[href="/g/${projectId}/project"]`);await nativeProjectLink.waitFor({state:'visible'});await nativeProjectLink.click();await projectPage.waitForURL(projectURL);
 const createdConversationId=projectPath.split('/')[2];await poll(async()=> (await facts())?.membership[createdConversationId]?.projectId===projectId);
 assert.equal(await projectPage.locator(`nav[aria-label="Project conversations"] a[href="${projectPath}"]`).count(),1);
 assert.equal(server.snapshot().actions['send-intent']??0,0);assert.equal(server.snapshot().actions['create-project'],1);assert.deepEqual(report.errors,[]);
 report.results.push({id:'UI-05',subcase:'outside-project-entry-native-project-chat-versus-global-new-chat',status:'PASS',automaticCreationOnProjectOpen:0,projectActions:1,globalActions:1,confirmedProjectMember:createdConversationId});report.nativeActions=server.snapshot().actions;report.status='PASS_LEGACY_SUBSCENARIOS_ONLY';
}catch(error){report.status='FAIL';report.error=error.stack;if(error.nativeProjectEntryDiagnostic)report.nativeProjectEntryDiagnostic=error.nativeProjectEntryDiagnostic;process.exitCode=1;}
finally{
 const clean=await cleanupOwnedResources(report,[['browser',async()=>running?.close()],['fixture',async()=>server?.close()],['guard',async()=>{report.networkGuard=guard?.snapshot();await guard?.close();}],['source-stability',async()=>{report.testHashesAfter=await testHashes();assert.deepEqual(report.testHashesAfter,report.testHashesBefore);if(info){report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);assert(!report.sourceChangedDuringRun);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');}}]]);if(!clean)process.exitCode=1;await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,results:report.results,error:report.error}));
