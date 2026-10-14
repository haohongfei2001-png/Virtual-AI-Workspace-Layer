import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {legacyExpectedWorld as expected} from './expected/legacy.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-candidate-package-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin}),manifest=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',realChatGPT:'NOT_RUN',sourceHashes:manifest.sourceHashes,package:built,results:[]};let context,page;
async function candidateFrame(page,url){const deadline=Date.now()+15000;while(Date.now()<deadline){const frame=page.frames().find(f=>f.url()===url&&!f.isDetached());if(frame){try{if(await frame.locator('[data-vaiwl-candidates] button').filter({hasText:'Research'}).isVisible())return frame;}catch{if(!frame.isDetached())throw Error('candidate-frame-inspection-failed');}}await new Promise(r=>setTimeout(r,50));}throw Error('candidate-not-visible-in-current-frame');}

try{context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});await context.route('**/*',r=>r.request().url().startsWith(server.origin)||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());await context.addInitScript(()=>{if(location.protocol!=='chrome-extension:'||!globalThis.chrome?.runtime?.sendMessage)return;globalThis.candidateListTrace=[];const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=function(...args){const result=send(...args);if(args[0]?.type==='HOST_UI_CANDIDATES'&&result?.then)result.then(reply=>{candidateListTrace.push({at:performance.now(),hasFocus:document.hasFocus(),migration:reply?.migration??null,ok:reply?.ok,reason:reply?.reason??null});if(candidateListTrace.length>128)candidateListTrace.shift();},()=>{});return result;};});const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked}),workspaceURL=`chrome-extension://${id}/workspace.html`;page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});let frame=await candidateFrame(page,workspaceURL);assert(frame);const candidate=frame.locator('[data-vaiwl-candidates] button').filter({hasText:'Research'});await candidate.waitFor({timeout:15000});assert.equal(await candidate.count(),1);assert.equal(await candidate.isEnabled(),true);
 report.candidateGeometry=await candidate.evaluate(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:innerWidth,height:innerHeight};});assert(report.candidateGeometry.top>=0&&report.candidateGeometry.bottom<=report.candidateGeometry.height,'candidate must be visible inside frame viewport without scrolling inaccessible root');
 // Pagination probe adds DOM-only native-looking controls to this isolated fixture.
 // These are not real account Projects, and none is activated or assigned a fake grant/ID.
 const paginationActionsBefore=server.snapshot().actions['open-project-button']??0;
 report.paginationFixtureGeometry=await page.evaluate(()=>{const section=document.querySelector('aside section[aria-label="Projects"]'),r=section.getBoundingClientRect();globalThis.paginationOriginalStyle=section.getAttribute('style');section.style.height=`${r.height}px`;section.style.flex=`0 0 ${r.height}px`;section.style.overflow='auto';section.style.minHeight='0';return {originalHeight:r.height,originalStyle:paginationOriginalStyle,setup:'Native fixture list retains original height and scrolls internally; mount geometry safety unchanged'};});
 await page.evaluate(()=>{const section=document.querySelector('aside section[aria-label="Projects"]');for(let i=1;i<=64;i++){const b=document.createElement('button');b.type='button';b.textContent=`Candidate ${i}`;b.setAttribute('data-pagination-probe',String(i));section.append(b);}});
 const panel=frame.locator('[data-vaiwl-candidates]');
 await panel.getByText('已观察的待识别项目 1–32 / 65',{exact:true}).waitFor({timeout:15000});
 assert.equal(await panel.locator('button[data-candidate-key]').count(),32);
 assert.equal(await panel.getByRole('button',{name:'上一页',exact:true}).isDisabled(),true);
 await panel.getByRole('button',{name:'下一页',exact:true}).click();
 await panel.getByText('已观察的待识别项目 33–64 / 65',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'下一页',exact:true}).click();
 await panel.getByText('已观察的待识别项目 65–65 / 65',{exact:true}).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Candidate 64',exact:true}).isVisible(),true);
 assert.equal(await panel.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
 await panel.getByRole('button',{name:'上一页',exact:true}).click();
 await panel.getByText('已观察的待识别项目 33–64 / 65',{exact:true}).waitFor();
 // Preserve an exact candidate's focus and local list scroll through natural observation.
 const focusedCandidate=panel.getByRole('button',{name:'Candidate 40',exact:true});
 await focusedCandidate.focus();
 const focusedKey=await focusedCandidate.getAttribute('data-candidate-key');
 const candidateScroll=await focusedCandidate.evaluate(n=>{const list=n.closest('ul');if(list.scrollHeight<=list.clientHeight)throw Error('candidate-list-must-actually-scroll');list.scrollTop=Math.min(137,list.scrollHeight-list.clientHeight);return list.scrollTop;});
 assert(candidateScroll>0);
 await page.evaluate(()=>{document.querySelector('[data-pagination-probe="41"]').textContent='Candidate 41 updated';});
 await panel.getByRole('button',{name:'Candidate 41 updated',exact:true}).waitFor({timeout:15000});
 const preserved=await panel.locator(`button[data-candidate-key="${focusedKey}"]`).evaluate(n=>({focused:n.getRootNode().activeElement===n,scroll:n.closest('ul').scrollTop}));
 assert.equal(preserved.focused,true);assert(Math.abs(preserved.scroll-candidateScroll)<=1);
 assert.equal(await panel.getByText('已观察的待识别项目 33–64 / 65',{exact:true}).count(),1);
 // Focus the still-visible sibling frame, leaving the workspace's stale activeElement.
 const sidebarFrame=page.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(sidebarFrame);
 const siblingTarget=sidebarFrame.locator('[data-vaiwl-candidates] button[data-candidate-key]').first();await siblingTarget.focus();
 assert.equal(await frame.evaluate(()=>document.hasFocus()),false);
 await page.evaluate(()=>{document.querySelector('[data-pagination-probe="42"]').textContent='Candidate 42 updated';});
 await panel.getByRole('button',{name:'Candidate 42 updated',exact:true}).waitFor({timeout:15000});
 assert.equal(await sidebarFrame.evaluate(()=>document.hasFocus()),true);
 assert.equal(await frame.evaluate(()=>document.hasFocus()),false);
 assert.equal(await panel.locator(`button[data-candidate-key="${focusedKey}"]`).evaluate(n=>n.getRootNode().activeElement===n),false);
 // Native focus surrenders both surfaces; hidden frames need not refresh.
 await page.locator('#model-button').focus();
 await page.evaluate(()=>{globalThis.paginationNativeFocus=document.activeElement;});
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0,{},{timeout:5000});
 await page.waitForTimeout(500);
 assert.equal(await page.locator('[data-va-owned]:popover-open').count(),0);
 assert(await page.evaluate(()=>document.activeElement===paginationNativeFocus&&document.activeElement===document.querySelector('#model-button')));
 assert.equal(await page.getByRole('button',{name:'返回工作空间',exact:true}).count(),1);
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 report.candidatePresentation={samePageOffset:32,focusedKeyPreserved:true,scrollBefore:candidateScroll,scrollAfter:preserved.scroll,siblingFocusNotReclaimed:true,nativeFocusNotReclaimed:true};
 assert.equal(server.snapshot().actions['open-project-button']??0,paginationActionsBefore);
 await page.evaluate(()=>{document.querySelectorAll('[data-pagination-probe]').forEach(n=>n.remove());const section=document.querySelector('aside section[aria-label="Projects"]');if(paginationOriginalStyle===null)section.removeAttribute('style');else section.setAttribute('style',paginationOriginalStyle);});
 await panel.getByText('已观察的待识别项目 1–1 / 1',{exact:true}).waitFor({timeout:15000});
 assert.equal(await panel.locator('button[data-candidate-key]').count(),1);
 assert.equal(await panel.getByRole('button',{name:'下一页',exact:true}).count(),0);
 assert.equal(server.snapshot().actions['open-project-button']??0,paginationActionsBefore);
 report.results.push({name:'fixture-dom-only-65-candidates-pages-0-32-64-back-refresh-preserves-offset-shrink-clamps-without-activation',status:'PASS',fixtureOnlyAdditionalButtons:64,realAccountProjectCount:'NOT_ASSERTED'});
 // A second same-name idless DOM control is intentionally inert; only the
 // original native fixture control is activated. Identity assertions use keys/nodes.
 const originalKey=await candidate.getAttribute('data-candidate-key');
 await page.evaluate(()=>{const section=document.querySelector('aside section[aria-label="Projects"]');globalThis.originalCandidateNode=document.querySelector('.project-entry');globalThis.originalCandidateRoot=section;globalThis.candidateEditor=document.querySelector('textarea');const duplicate=document.createElement('button');duplicate.type='button';duplicate.textContent='Research';duplicate.setAttribute('data-same-name-probe','');section.append(duplicate);globalThis.otherCandidateNode=duplicate;});
 await panel.getByText('已观察的待识别项目 1–2 / 2',{exact:true}).waitFor({timeout:15000});
 const candidateKeys=await panel.locator('button[data-candidate-key]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-candidate-key')));
 assert(candidateKeys.includes(originalKey));assert.equal(new Set(candidateKeys).size,2);assert(candidateKeys.some(k=>k!==originalKey));
 await frame.getByRole('link',{name:'打开项目以新建聊天 Research',exact:true}).first().waitFor();const clicksBefore=server.snapshot().actions['open-project-button']??0;
 const originalCandidateButton=panel.locator(`button[data-candidate-key="${originalKey}"]`);
 await originalCandidateButton.focus();
 assert(await originalCandidateButton.evaluate(n=>document.hasFocus()&&n.getRootNode().activeElement===n));
 await originalCandidateButton.click();
 await page.waitForURL(`**/g/${expected.projects[1].id}/project`,{timeout:15000});
 const returnButton=page.getByRole('button',{name:'返回工作空间',exact:true});await returnButton.waitFor({timeout:15000});
 // Wait through a short settled reading interval, never force focus or reopen.
 await page.waitForTimeout(500);
 assert.equal(await page.locator(`iframe[src="${workspaceURL}"]`).evaluate(n=>n.closest('[data-va-owned]')?.matches(':popover-open')??false),false);
 assert(await page.locator('#reading').isVisible());
 assert(await page.evaluate(()=>document.activeElement?.tagName!=='IFRAME'),'candidate upgrade must not steal native reading focus');
 assert.equal(await returnButton.count(),1);
 assert(await page.evaluate(()=>originalCandidateNode===document.querySelector('.project-entry')&&originalCandidateRoot===document.querySelector('aside section[aria-label="Projects"]')&&otherCandidateNode.isConnected&&candidateEditor===document.querySelector('textarea')));
 await returnButton.click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});
 const until=Date.now()+15000;let current;do{current=page.frames().find(f=>f.url()===workspaceURL&&f!==frame);if(current)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<until);assert(current);frame=current;
 await frame.getByRole('link',{name:'Second project conversation',exact:true}).waitFor({timeout:15000});
 const canonicalCard=frame.locator(`[data-theme-id="${expected.projects[1].id}"]`);await canonicalCard.waitFor({timeout:15000});
 await frame.waitForFunction(projectId=>{const visit=root=>{const card=root.querySelector?.(`[data-theme-id="${projectId}"]`);if(card)return card;for(const n of root.querySelectorAll?.('*')??[]){if(n.shadowRoot){const found=visit(n.shadowRoot);if(found)return found;}}return null;};const card=visit(document);return !!card&&document.hasFocus()&&card.getRootNode().activeElement===card;},expected.projects[1].id,{timeout:15000});
 assert(await canonicalCard.evaluate(n=>document.hasFocus()&&n.getRootNode().activeElement===n));
 report.canonicalMigrationFocus={projectId:expected.projects[1].id,focusedAfterTrustedReturn:true};
 const upgradedPanel=frame.locator('[data-vaiwl-candidates]');
 await upgradedPanel.getByText('已观察的待识别项目 1–1 / 1',{exact:true}).waitFor({timeout:15000});
 assert.equal(await upgradedPanel.locator('button[data-candidate-key]').count(),1);
 assert(await page.evaluate(()=>originalCandidateNode===document.querySelector('.project-entry')&&originalCandidateRoot===document.querySelector('aside section[aria-label="Projects"]')&&otherCandidateNode.isConnected));
 // New producer legitimately issues new handles. Remove the exact other node
 // to prove the survivor was not the upgraded original with an identical title.
 await page.evaluate(()=>otherCandidateNode.remove());
 await frame.waitForFunction(()=>!document.querySelector('[data-vaiwl-candidates]'),{},{timeout:15000});
 assert(await page.evaluate(()=>originalCandidateNode===document.querySelector('.project-entry')&&originalCandidateNode.isConnected));
 assert.equal(server.snapshot().actions['open-project-button']-clicksBefore,1);assert(await page.evaluate(()=>candidateEditor===document.querySelector('textarea')));
 report.results.push({name:'candidate-upgrade-keeps-reading-until-user-return-removes-only-original-same-node-candidate',status:'PASS',sameNameProbe:'one extra inert fixture DOM control'});

 const facts=await frame.evaluate(async()=>{const {ScopeRepository}=await import(chrome.runtime.getURL('src/b1/scope-repository.mjs')),{NativeRepository}=await import(chrome.runtime.getURL('src/data/native-repository.mjs'));const base=new ScopeRepository({indexedDB});try{const db=await base.open(),roots=await new Promise((resolve,reject)=>{const tx=db.transaction('native_states'),q=tx.objectStore('native_states').getAll();tx.oncomplete=()=>resolve(q.result.filter(r=>r.key===r.payload?.scopeKey).map(r=>r.key));tx.onabort=()=>reject(tx.error);});const keys=[];for(const key of roots){const [provider,accountId,organizationId]=JSON.parse(key),s=await new NativeRepository({baseRepository:base}).read({verified:true,provider,accountId,organizationId});keys.push(...Object.keys(s.projects));}return keys;}finally{base.close();}});assert(facts.includes(expected.projects[1].id));assert(!facts.some(k=>k.startsWith('candidate:')));report.results.push({name:'idless-same-name-project-one-native-click-upgrades-exact-project-and-members-without-fake-id',status:'PASS'});
 // Separate native home navigation resets the fixture UI, not the persistent native facts.
 await page.goto(server.url);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});await page.locator('textarea').fill('CANDIDATE_UNSENT_DRAFT');await page.evaluate(()=>globalThis.draftEditor=document.querySelector('textarea'));const back=page.getByRole('button',{name:'返回工作空间',exact:true});await back.click();frame=page.frames().find(f=>f.url()===workspaceURL);assert(frame);const blocked=frame.locator('[data-vaiwl-candidates] button').filter({hasText:'Research'});await blocked.waitFor({timeout:15000});await page.waitForTimeout(250);assert.equal(await blocked.isDisabled(),true);assert(await frame.getByText('暂时无法打开；请先处理未发送内容，或使用原生入口继续。',{exact:true}).count()>0);assert.equal(server.snapshot().actions['open-project-button']-clicksBefore,1);assert(await page.evaluate(()=>draftEditor===document.querySelector('textarea')&&draftEditor.value==='CANDIDATE_UNSENT_DRAFT'));assert(await page.locator('.project-entry').count()>0);report.results.push({name:'draft-disables-candidate-with-native-entry-and-original-editor-preserved',status:'PASS'});
 assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.browserVersion=context.browser().version();report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;report.frameDiagnostics=await Promise.all((page?.frames()??[]).map(async f=>{try{return {url:f.url(),state:await f.evaluate(()=>({candidateListTrace:globalThis.candidateListTrace??null,hasFocus:document.hasFocus(),activeChain:(()=>{const chain=[];let n=document.activeElement;while(n){chain.push({tag:n.tagName,id:n.id,theme:n.getAttribute?.('data-theme-id'),focusKey:n.getAttribute?.('data-focus-key'),src:n.tagName==='IFRAME'?n.getAttribute('src'):null});n=n.shadowRoot?.activeElement;}return chain;})(),ready:document.readyState,text:document.body?.innerText?.slice(0,3000),owned:document.querySelectorAll('[data-va-owned]').length,open:document.querySelectorAll('[data-va-owned]:popover-open').length,candidates:document.querySelectorAll('[data-vaiwl-candidates]').length}))};}catch(error){return {url:f.url(),error:String(error)};}}));}finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(manifest.sourceHashes).map(async([p,h])=>createHash('sha256').update(await readFile(p)).digest('hex')!==h))).some(Boolean);await writeFile(process.argv[2]??'/private/tmp/free-candidates-package-mv3.json',JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
