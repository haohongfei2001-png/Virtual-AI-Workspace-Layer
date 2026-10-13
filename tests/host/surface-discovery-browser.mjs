import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {legacyExpectedWorld as expected} from './expected/legacy.mjs';
import {surfaceBatch} from '../../src/host/surface-batch.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {LEGACY_SURFACE_PROFILE} from '../../src/host/surface-discovery.mjs';
const source=await readFile('src/host/surface-discovery.mjs','utf8'),policy=await readFile('src/host/url-policy.mjs','utf8');
const server=await createHostFixtureServer(),report={evidence:'REAL_HEADLESS_DOM_RECONSTRUCTION',productionAuth:'NOT_RUN',realChatGPT:'NOT_RUN',fixture:server.manifest,sourceHash:createHash('sha256').update(source).digest('hex'),results:[],errors:[]};
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===server.origin?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.url);
 const discovery=await page.evaluateHandle(async({source,policy})=>{
  const module=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  const urls=await import(URL.createObjectURL(new Blob([policy],{type:'text/javascript'})));
  return module.createSurfaceDiscovery({document,binding:{documentToken:'doc-local',routeEpoch:1},urlPolicy:urls.createURLPolicy({origin:location.origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}})});
 },{source,policy});
 const initial=await discovery.evaluate(d=>d.scan());
 assert.equal(initial.candidates.length,4);assert.equal(initial.candidates.filter(c=>c.entity==='project'&&c.target.kind==='resolved').length,1);
 const idless=initial.candidates.find(c=>c.target.kind==='live-control');assert.ok(idless);assert.equal(idless.nativeTitle,expected.projects[1].name);
 assert.equal(initial.membershipClaims.length,2);assert.ok(initial.membershipClaims.every(c=>c.asserted==='UNKNOWN'));
 assert.ok(initial.candidates.every(c=>c.evidence.receiptId===null));assert.deepEqual(initial.coverageClaims,[]);
 assert.equal(await discovery.evaluate((d,handle)=>d.getNode(handle)?.textContent,idless.target.control),'Research');
 await page.locator('#reading').evaluate(node=>{const a=document.createElement('a');a.href='/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';a.textContent='Example in a message';node.append(a);});
 assert.equal((await discovery.evaluate(d=>d.scan())).candidates.length,4);
 report.results.push({name:'bounded-regions-same-name-idless-and-unknown',status:'PASS'});
 await page.getByRole('button',{name:'Research',exact:true}).click();await page.waitForURL(`**/g/${expected.projects[1].id}/project`);
 await page.getByRole('navigation',{name:'Project conversations'}).waitFor();
 assert.equal(await discovery.evaluate((d,h)=>d.getNode(h)===null,idless.target.control),true);
 const project=await discovery.evaluate(d=>d.scan());
 assert.equal(project.membershipClaims.find(c=>c.conversationId===expected.conversations[1].id).projectId,expected.projects[1].id);
 const currentProject=project.candidates.find(c=>c.target.nativeId===expected.projects[1].id);assert.ok(currentProject);assert.equal(currentProject.target.liveHandle,null);assert.equal(currentProject.nativeTitle,expected.projects[1].name);
 // A native rename can update the current surface before its sidebar label.
 await page.evaluate(id=>{const a=document.createElement('a');a.id='stale-project-link';a.href=`/g/${id}/project`;a.textContent='Previous project name';document.querySelector('aside section[aria-label="Projects"]').append(a);},expected.projects[1].id);
 const renamed=await discovery.evaluate(d=>d.scan());
 const renamedRows=renamed.candidates.filter(c=>c.target.nativeId===expected.projects[1].id);
 assert.equal(renamedRows.length,1);assert.equal(renamedRows[0].nativeTitle,'Research');assert.equal(renamedRows[0].target.liveHandle,null);
 assert.equal(renamed.candidates.find(c=>c.target.nativeId===expected.projects[0].id).nativeTitle,'Research','same name with a different Project ID remains distinct');
 assert.ok(renamed.candidates.some(c=>c.target.kind==='live-control'),'IDless original entry remains available');
 const binding={documentToken:'doc-local',producerToken:'producer-local',routeEpoch:renamed.candidates.find(c=>c.target.liveHandle)?.target.liveHandle.routeEpoch};
 const scope={verified:true,provider:'chatgpt',accountId:'fixture-account',organizationId:'fixture-context'};
 const reduced=surfaceBatch({protocol:'vaiwl-host-observation/1',...binding,localSeq:1,profileId:LEGACY_SURFACE_PROFILE.id,profileVersion:LEGACY_SURFACE_PROFILE.revision,bodyProofId:null,kind:'surface-delta',payload:renamed},{scope,binding,profile:LEGACY_SURFACE_PROFILE,urlPolicy:createURLPolicy({origin:server.origin,profile:{projectId:({container})=>/^g-p-[0-9a-f]{32}$/.test(container)?container:null}}),sourceRevision:1,observedAt:'2026-10-14T00:00:00.000Z',validUntil:'2026-10-14T00:01:00.000Z'});
 assert.equal(reduced.projects.length,2);assert.equal(reduced.membership.find(c=>c.id===expected.conversations[1].id).projectId,expected.projects[1].id);
 await page.locator('main > header > h1').evaluate(n=>n.textContent='Unconfirmed title');
 const fallback=(await discovery.evaluate(d=>d.scan())).candidates.filter(c=>c.target.nativeId===expected.projects[1].id);
 assert.equal(fallback.length,1);assert.equal(fallback[0].nativeTitle,'Previous project name');assert.ok(fallback[0].target.liveHandle,'unproven current Project must not suppress native sidebar entry');
 await page.locator('main > header > h1').evaluate(n=>n.textContent='Research');
 for(const selector of ['main > #reading > h2','main > header > h1','main > #reading > nav']){
  for(const mode of ['hidden','aria-hidden','display:none','visibility:hidden','visibility:collapse']){
   await page.locator(selector).evaluate((n,value)=>{if(value.includes(':'))n.setAttribute('style',value);else n.setAttribute(value,'true');},mode);
   const hiddenRows=(await discovery.evaluate(d=>d.scan())).candidates.filter(c=>c.target.nativeId===expected.projects[1].id);
   assert.equal(hiddenRows.length,1,`${selector} ${mode} retains only visible sidebar Project`);
   assert.equal(hiddenRows[0].nativeTitle,'Previous project name');assert.ok(hiddenRows[0].target.liveHandle);
   await page.locator(selector).evaluate((n,value)=>n.removeAttribute(value.includes(':')?'style':value),mode);
  }
 }
 assert.equal((await discovery.evaluate(d=>d.scan())).candidates.find(c=>c.target.nativeId===expected.projects[1].id).nativeTitle,'Research','restored visible current Project regains priority');
 await page.locator('#stale-project-link').evaluate(n=>n.remove());
 report.results.push({name:'current-project-title-priority-preserves-other-ids-members-and-unproven-fallback',status:'PASS'});
 await page.locator('main > header > h1').evaluate(n=>n.textContent='Conflict');assert.equal((await discovery.evaluate(d=>d.scan())).candidates.some(c=>c.target.nativeId===expected.projects[1].id),false);
 await page.locator('main > header > h1').evaluate(n=>n.textContent='Research');
 await page.locator('main > #reading > h2').evaluate(n=>n.remove());assert.equal((await discovery.evaluate(d=>d.scan())).candidates.some(c=>c.target.nativeId===expected.projects[1].id),false);
 await page.locator('#reading').evaluate(n=>{const h=document.createElement('h2');h.textContent='Research';n.prepend(h);});


 for(const selector of ['main > #reading','nav[aria-label="Project conversations"]','nav[aria-label="Project conversations"] a'])for(const mode of ['hidden','aria-hidden','display:none','visibility:hidden','visibility:collapse']){
  await page.locator(selector).evaluate((n,value)=>{if(value.includes(':'))n.setAttribute('style',value);else n.setAttribute(value,'true');},mode);
  const hidden=await discovery.evaluate(d=>d.scan());assert.equal(hidden.membershipClaims.find(c=>c.conversationId===expected.conversations[1].id)?.asserted,'UNKNOWN',selector+' '+mode);assert(hidden.candidates.some(c=>c.target.nativeId===expected.conversations[1].id),'hidden member reference remains reachable');
  await page.locator(selector).evaluate((n,value)=>n.removeAttribute(value.includes(':')?'style':value),mode);
  assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[1].id).asserted,'PROJECT');
 }
 report.results.push({name:'hidden-member-roots-and-items-never-certify-project-but-references-remain',status:'PASS'});
 assert.ok(project.membershipClaims.filter(c=>c.conversationId!==expected.conversations[1].id).every(c=>c.asserted==='UNKNOWN'));
 await page.getByRole('navigation',{name:'Project conversations'}).evaluate(node=>node.dataset.projectId='g-p-stale');
 assert.equal((await discovery.evaluate(d=>d.scan())).candidates.some(c=>c.target.nativeId===expected.projects[1].id),false);
 assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[1].id).asserted,'UNKNOWN');
 report.results.push({name:'route-fenced-handles-and-explicit-member-region',status:'PASS'});
 await page.getByRole('link',{name:expected.conversations[2].title,exact:true}).click();await page.waitForURL(`**/c/${expected.conversations[2].id}`);
 assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[2].id).asserted,'UNKNOWN');
 await page.getByRole('button',{name:'Move to project',exact:true}).click();await page.locator('#move-dialog[open]').waitFor();
 assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[2].id).asserted,'NONE');

 for(const selector of ['#move-dialog','#move-dialog label:has(input:checked)','#move-dialog input:checked'])for(const mode of ['hidden','aria-hidden','display:none','visibility:hidden','visibility:collapse']){
  await page.locator(selector).evaluate((n,value)=>{if(value.includes(':'))n.setAttribute('style',value);else n.setAttribute(value,'true');},mode);
  assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[2].id)?.asserted,'UNKNOWN',selector+' '+mode);
  await page.locator(selector).evaluate((n,value)=>n.removeAttribute(value.includes(':')?'style':value),mode);
  assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[2].id).asserted,'NONE');
 }
 report.results.push({name:'open-but-hidden-menu-label-and-option-never-certify-none',status:'PASS'});
 await page.locator('#move-dialog').evaluate(node=>node.dataset.conversationId='stale-conversation');
 assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===expected.conversations[2].id).asserted,'UNKNOWN');
 await page.locator('#move-dialog').getByRole('button',{name:'Close'}).click();
 report.results.push({name:'none-only-current-explicit-open-menu',status:'PASS'});
 const changed=await discovery.evaluate(d=>d.scan());const old=changed.candidates.find(c=>c.target.kind==='live-control').target.control;
 await page.locator('.project-entry').evaluate(node=>node.textContent='Changed');
 assert.equal(await discovery.evaluate((d,h)=>d.getNode(h)===null,old),true);
 await page.locator('.project-entry').evaluate(node=>node.textContent='Research');
 assert.equal(await discovery.evaluate((d,h)=>d.getNode(h)===null,old),true);
 const replacement=await discovery.evaluate(d=>d.scan());assert.notEqual(replacement.candidates.find(c=>c.target.kind==='live-control').target.control.id,old.id);
 const live=replacement.candidates.find(c=>c.target.kind==='live-control').target.control;
 await page.locator('.project-entry').evaluate(node=>node.replaceWith(node.cloneNode(true)));
 assert.equal(await discovery.evaluate((d,h)=>d.getNode(h)===null,live),true);
 await page.locator('aside section a').evaluate(node=>node.textContent='x'.repeat(201));
 const over=(await discovery.evaluate(d=>d.scan())).candidates.find(c=>c.target.nativeId==='g-p-11111111111111111111111111111111');
 assert.equal(over.titleState,'over-limit');assert.equal(over.nativeTitle,null);assert.equal(over.target.kind,'resolved');
 report.results.push({name:'changed-or-replaced-node-never-rebound-title-over-limit-retains-id',status:'PASS'});
 // Current object absent from sidebar: native route rendering supplies the
 // reconstruction-only ID association; no expected-world JSON enters discovery.
 const currentId=expected.conversations[0].id;
 await page.evaluate(id=>{const a=document.createElement('a');a.href='/c/'+id;a.textContent='Open native current';document.body.append(a);a.click();a.remove();},currentId);
 await page.waitForURL('**/c/'+currentId);await page.waitForFunction(id=>document.querySelector('#reading').dataset.conversationId===id,currentId);
 const currentRows=()=>discovery.evaluate((d,id)=>d.scan().candidates.filter(c=>c.entity==='conversation'&&c.target.nativeId===id),currentId);
 let rows=await currentRows();assert.equal(rows.length,1);assert.equal(rows[0].nativeTitle,expected.conversations[0].title);assert.equal(rows[0].target.liveHandle,null);
 assert.equal((await discovery.evaluate(d=>d.scan())).membershipClaims.find(c=>c.conversationId===currentId).asserted,'UNKNOWN');
 await page.locator('main > header > h1').evaluate(n=>n.textContent='Current renamed title');
 await page.evaluate(id=>{const a=document.createElement('a');a.href='/c/'+id;a.textContent='Stale history title';document.querySelector('aside nav[aria-label="Chat history"]').append(a);},currentId);
 rows=await currentRows();assert.equal(rows.length,1);assert.equal(rows[0].nativeTitle,'Current renamed title');
 await page.evaluate(()=>{const old=document.querySelector('main').cloneNode(true);old.hidden=true;old.querySelector('h1').textContent='Hidden stale title';document.body.append(old);});
 assert.equal((await currentRows())[0].nativeTitle,'Current renamed title');
 await page.evaluate(()=>document.querySelector('main[hidden]').remove());
 await page.locator('aside nav[aria-label="Chat history"]').evaluate((n,id)=>{for(const a of n.querySelectorAll('a'))if(a.getAttribute('href')==='/c/'+id)a.remove();},currentId);
 await page.locator('main > #reading').evaluate(n=>n.hidden=true);assert.deepEqual(await currentRows(),[]);await page.locator('main > #reading').evaluate(n=>n.hidden=false);
 await page.locator('main > #reading').evaluate(n=>n.dataset.conversationId='stale-id');assert.deepEqual(await currentRows(),[]);
 await page.locator('main > #reading').evaluate((n,id)=>n.dataset.conversationId=id,currentId);
 await page.evaluate(()=>history.pushState(null,'','/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
 assert.equal((await discovery.evaluate(d=>d.scan())).candidates.some(c=>c.evidence.fieldPaths.includes('current-conversation-reading-id')),false,'popstate-era old body cannot be rebound by new URL');
 await page.evaluate(id=>history.pushState(null,'','/c/'+id),currentId);
 for(const name of ['ChatGPT','New chat','新聊天','新建聊天']){await page.locator('main > header > h1').evaluate((n,value)=>n.textContent=value,name);rows=await currentRows();assert.equal(rows[0].nativeTitle,name);assert.equal(rows[0].titleState,'exact');}
 await page.locator('main > #reading').evaluate(n=>delete n.dataset.conversationId);assert.deepEqual(await currentRows(),[],'unbound generic header is not a current conversation');
 await page.locator('main > #reading').evaluate((n,id)=>n.dataset.conversationId=id,currentId);
 await page.locator('main > header > h1').evaluate(n=>n.textContent='中'.repeat(201));rows=await currentRows();assert.equal(rows[0].nativeTitle,null);assert.equal(rows[0].titleState,'over-limit');
 // Explicit injected callback double checks discovery's contract only. Actual
 // production RAM registration remains covered by mount-surrender/MV3 tests.
 const maskedDiscovery=await page.evaluateHandle(async({source,policy})=>{
  const module=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),urls=await import(URL.createObjectURL(new Blob([policy],{type:'text/javascript'})));
  const reading=document.querySelector('main > #reading');
  return module.createSurfaceDiscovery({document,binding:{documentToken:'mask-test',routeEpoch:1},urlPolicy:urls.createURLPolicy({origin:location.origin}),isOwnedMask:node=>node===reading});
 },{source,policy});
 const maskedCurrent=()=>maskedDiscovery.evaluate(d=>d.scan().candidates.filter(c=>c.evidence.fieldPaths.includes('current-conversation-reading-id')));
 await page.locator('main > #reading').evaluate(n=>n.style.visibility='hidden');assert.equal((await maskedCurrent()).length,1);
 assert.deepEqual(await currentRows(),[],'default discovery cannot trust a public style or mask marker');
 await page.locator('main > header > h1').evaluate(n=>n.style.visibility='hidden');assert.deepEqual(await maskedCurrent(),[],'reading-only exemption never unmasks the header');await page.locator('main > header > h1').evaluate(n=>n.style.visibility='');
 for(const attr of ['hidden','aria-hidden']){await page.locator('main > #reading').evaluate((n,key)=>n.setAttribute(key,'true'),attr);assert.deepEqual(await maskedCurrent(),[]);await page.locator('main > #reading').evaluate((n,key)=>n.removeAttribute(key),attr);}
 await page.locator('main > #reading').evaluate(n=>n.style.display='none');assert.deepEqual(await maskedCurrent(),[]);await page.locator('main > #reading').evaluate(n=>{n.style.display='';n.style.visibility='collapse';});assert.deepEqual(await maskedCurrent(),[]);
 await page.locator('main > #reading').evaluate(n=>n.style.visibility='');await maskedDiscovery.evaluate(d=>d.stop());
 await page.evaluate(()=>history.pushState(null,'','/unsupported'));assert.equal((await discovery.evaluate(d=>d.scan())).candidates.some(c=>c.evidence.fieldPaths.includes('current-conversation-reading-id')),false);
 report.results.push({name:'reconstruction-current-conversation-id-associated-title-priority-and-stale-body-fences',status:'PASS'});
 await discovery.evaluate(d=>d.stop());assert.deepEqual((await discovery.evaluate(d=>d.scan())).candidates,[]);
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await server.close();await writeFile(process.argv[2]??'/private/tmp/free-host-surface-discovery.json',JSON.stringify(report,null,2)+'\n');}
