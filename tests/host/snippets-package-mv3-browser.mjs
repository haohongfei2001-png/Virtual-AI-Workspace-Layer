/** Actual immutable package, offline-only snippet profile. Message/branch DOM
 * below is explicit reconstruction data, never live ChatGPT or a production ACK. */
import {createHistoricalNetworkGuard,historicalNetworkGuardArgs} from './historical-network-guard.mjs';import assert from 'node:assert/strict';import {mkdtemp,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {createHostFixtureServer} from './fixtures/server.mjs';import {packageHost,verifyHost} from '../../extension/package.mjs';import {snippetsRunnerPaths,runSnippetsLifecycle} from './snippets-runner-lifecycle.mjs';
const output=process.argv[2]??join(tmpdir(),'host-snippets-package-mv3.json'),hash=x=>createHash('sha256').update(x).digest('hex'),script='tests/host/snippets-package-mv3-browser.mjs';
const report={evidence:'REAL_HEADLESS_PACKAGED_MV3_OFFLINE_SNIPPETS',fixture:'Synthetic message/body/branch nodes appended only to existing offline conversation root',productionSnippetProfile:'DISABLED_NOT_CERTIFIED',realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',status:'NOT_RUN',results:[],errors:[],transport:[],sourceChangedDuringRun:null,buildManifestUnchanged:null};
let context,page,server,built;const integrityChecks=[];
const outcome=await runSnippetsLifecycle({report,output,integrityChecks,execute:async({own})=>{
 const paths=snippetsRunnerPaths({output});
 server=await createHostFixtureServer();own('fixture-server',()=>server.close());
 const networkGuard=await createHistoricalNetworkGuard({fixtureOrigin:server.origin});own('network-guard',async()=>{await networkGuard.close();report.networkGuard=networkGuard.snapshot();});
 report.networkGuard=networkGuard.snapshot();
 const dir=await mkdtemp(paths.tempPrefix);
 built=packageHost(join(dir,'package'),{offlineOrigin:server.origin,offlineSnippets:true});report.package=built;
 const manifestPath=join(built.unpacked,'build-manifest.json'),manifestBytes=await readFile(manifestPath),info=JSON.parse(manifestBytes);
 report.sourceHashes=info.sourceHashes;report.buildManifestHash=hash(manifestBytes);
 integrityChecks.push(['package-integrity',async()=>{report.buildManifestUnchanged=hash(await readFile(manifestPath))===report.buildManifestHash;if(!report.buildManifestUnchanged)throw Error('source-or-package-changed-during-run');}]);
 const runnerFiles=[script,'tests/host/snippets-runner-lifecycle.mjs','tests/host/isolated-browser-cleanup.mjs','tests/host/historical-network-guard.mjs'];
 report.runnerSourceHashes=Object.fromEntries(await Promise.all(runnerFiles.map(async p=>[p,hash(await readFile(p))])));report.scriptHash=report.runnerSourceHashes[script];
 integrityChecks.push(['source-integrity',async()=>{report.sourceChangedDuringRun=(await Promise.all(Object.entries({...info.sourceHashes,...report.runnerSourceHashes}).map(async([p,h])=>hash(await readFile(p))!==h))).some(Boolean);if(report.sourceChangedDuringRun)throw Error('source-or-package-changed-during-run');}]);
 const {chromium}=await import('../b1/tooling/node_modules/playwright/index.mjs');
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:paths.executablePath,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',...historicalNetworkGuardArgs(networkGuard.config)]});own('browser-context',()=>context.close());
 await context.route('**/*',r=>r.request().url().startsWith(server.origin)||r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('SNIPPET_PUBLIC_TRACE '))try{report.transport.push(JSON.parse(m.text().slice('SNIPPET_PUBLIC_TRACE '.length)));}catch{}});
 const C='33333333-3333-4333-8333-333333333333';await page.goto(server.origin+'/c/'+C);await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});const workspace=page.frames().find(f=>f.url()===`chrome-extension://${id}/workspace.html`),sidebar=page.frames().find(f=>f.url()===`chrome-extension://${id}/sidebar.html`);assert(workspace&&sidebar);
 for(const frame of [workspace,sidebar])await frame.evaluate(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{const result=await send(message);console.log('SNIPPET_PUBLIC_TRACE '+JSON.stringify({type:message.type,action:message.action,ok:result?.ok,state:result?.state,reason:result?.reason}));return result;};});
 await page.locator('textarea').fill('UNSENT_SNIPPET_NATIVE_DRAFT');await page.evaluate(()=>{globalThis.snippetOriginalInput=document.querySelector('textarea');const root=document.querySelector('main > #reading');if(!root)throw Error('missing-native-reading');const message=document.createElement('article');message.dataset.messageId='fixture-snippet-message';message.dataset.branchId='fixture-branch';const body=document.createElement('div');body.className='message-body';body.textContent='Offline prefix uniquely selected fixture words suffix.';message.append(body);root.append(message);});
 // Native composer focus legitimately surrendered both extension surfaces.
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();await page.getByRole('button',{name:'返回工作空间',exact:true}).waitFor();await page.locator('#reading .message-body').waitFor({state:'visible'});
 const draft=async()=>assert.equal(await page.evaluate(()=>document.querySelector('textarea')===snippetOriginalInput&&snippetOriginalInput.value==='UNSENT_SNIPPET_NATIVE_DRAFT'),true);
 const select=()=>page.evaluate(()=>{const body=document.querySelector('#reading .message-body'),text=body.firstChild,selected='uniquely selected fixture words',start=text.nodeValue.indexOf(selected),range=document.createRange();range.setStart(text,start);range.setEnd(text,start+selected.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);return selection.toString()===selected;});
 assert.equal(await select(),true);await sidebar.getByRole('button',{name:'已保存片段',exact:true}).click();const panel=sidebar.getByRole('region',{name:'片段管理',exact:true});await panel.getByText('暂无已保存片段。',{exact:true}).waitFor({timeout:10000});
 // Capture remains strict and instantaneous: iframe focus is not replaced with
 // a stored Range. Reselect native text before the explicit save click.
 assert.equal(await select(),true);await panel.getByRole('button',{name:'保存当前选区',exact:true}).click();await panel.getByText('共 1 个片段',{exact:true}).waitFor({timeout:10000});await panel.getByText('uniquely selected fixture words',{exact:true}).waitFor();await draft();report.results.push({name:'actual-native-selection-explicit-sidebar-save-and-legacy-list',status:'PASS'});
 report.savedScreenshot=output.replace(/\.json$/,'-saved.png');await page.screenshot({path:report.savedScreenshot,fullPage:true});
 // Search the saved text, which is absent from the native conversation title.
 // This must come from the authorized snippetMatches projection, not a local
 // scan of this frame's partial conversation page.
 await panel.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await sidebar.getByRole('button',{name:'查找已知项目与聊天',exact:true}).click();
 const search=workspace.getByRole('searchbox',{name:'已知聊天查找输入'});
 await search.waitFor({timeout:10000});await search.fill('uniquely selected fixture words');
 await workspace.getByRole('link',{name:'Ordinary conversation',exact:true}).waitFor({timeout:10000});
 const match=workspace.locator('.search-results .snippet-match');await match.getByText('uniquely selected fixture words',{exact:true}).waitFor({timeout:10000});assert.equal(await match.count(),1);
 await draft();report.results.push({name:'saved-snippet-text-search-preserves-native-title-and-exact-preview',status:'PASS'});
 const beforeSearchLocate=report.transport.length;
 await match.getByRole('button',{name:'定位片段',exact:true}).click();
 await page.locator('#reading .message-body').waitFor({state:'visible',timeout:10000});
 await workspace.getByText('已定位片段。',{exact:true}).waitFor({state:'attached',timeout:10000});
 assert.equal(report.transport.slice(beforeSearchLocate).some(r=>r.type==='HOST_UI_SNIPPET'&&r.action==='locate'&&r.ok===true),true);
 await draft();report.results.push({name:'current-conversation-search-snippet-locates-native-reading-with-draft-preserved',status:'PASS'});
 // Restore the original panel journey, including its independent stale-hash
 // rejection and targeted removal assertions.
 await page.getByRole('button',{name:'返回工作空间',exact:true}).click();
 await workspace.getByRole('button',{name:'关闭派生查找',exact:true}).click();
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();
 await sidebar.getByRole('button',{name:'已保存片段',exact:true}).click();
 await panel.getByText('共 1 个片段',{exact:true}).waitFor({timeout:10000});
 await panel.getByRole('button',{name:'定位片段',exact:true}).click();await panel.getByText('已定位片段。',{exact:true}).waitFor({timeout:10000});await page.locator('#reading .message-body').waitFor({state:'visible'});await draft();report.results.push({name:'locate-verified-anchor-in-native-reading-with-draft-preserved',status:'PASS'});
 await page.locator('#reading .message-body').evaluate(node=>node.append(' changed native body'));await panel.getByRole('button',{name:'定位片段',exact:true}).click();await panel.getByRole('alert').filter({hasText:'操作结果未确认'}).waitFor({timeout:10000});await draft();report.results.push({name:'edited-native-body-rejects-old-hash-and-offers-native-search',status:'PASS'});
 await panel.getByRole('button',{name:'删除片段',exact:true}).click();await panel.getByText('暂无已保存片段。',{exact:true}).waitFor({timeout:10000});await draft();report.results.push({name:'remove-only-manual-snippet-preserves-native-input',status:'PASS'});
 assert.equal(server.snapshot().actions['send-intent']??0,0);verifyHost(built.unpacked);assert.deepEqual(report.errors,[]);report.status='PASS';
},inspectFailure:async()=>{
 if(page){await page.screenshot({path:output.replace(/\.json$/,'.png'),fullPage:true});report.failureDOM=await page.evaluate(()=>({selection:{ranges:getSelection()?.rangeCount??0,collapsed:getSelection()?.isCollapsed??true,characters:getSelection()?.toString().length??0,insideMessage:!!getSelection()?.anchorNode?.parentElement?.closest('#reading .message-body')},state:document.documentElement.dataset.vaiwlState,reason:document.documentElement.dataset.vaiwlReason,readingVisible:!!document.querySelector('#reading')&&getComputedStyle(document.querySelector('#reading')).visibility==='visible',draftPreserved:document.querySelector('textarea')===globalThis.snippetOriginalInput&&snippetOriginalInput.value==='UNSENT_SNIPPET_NATIVE_DRAFT'}));report.frameText=await Promise.all(page.frames().filter(f=>f.url().startsWith('chrome-extension://')).map(async f=>({url:f.url(),text:await f.locator('body').innerText().catch(()=>'<detached>')})));}
}});
process.exitCode=outcome.exitCode;
console.log(JSON.stringify({status:report.status,results:report.results,error:report.error,cleanupErrors:report.cleanupErrors,lifecycleErrors:report.lifecycleErrors,sourceChangedDuringRun:report.sourceChangedDuringRun,reportWritten:outcome.reportWritten}));
