import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createHostFixtureServer} from './fixtures/server.mjs';
import {packageHost,verifyHost} from '../../extension/package.mjs';
const server=await createHostFixtureServer(),dir=await mkdtemp('/private/tmp/vaiwl-host-package-'),built=packageHost(join(dir,'package'),{offlineOrigin:server.origin});
const info=JSON.parse(await readFile(join(built.unpacked,'build-manifest.json'),'utf8'));
const report={evidence:'REAL_HEADLESS_MV3_PACKAGED_HOST_OFFLINE',package:built,sourceHashes:info.sourceHashes,realChatGPT:'NOT_RUN',release:'NOT_RELEASE_READY',results:[],errors:[]};let context,traceCDP,traceContext;
try{
 context=await chromium.launchPersistentContext(join(dir,'profile'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 await context.route('**/*',route=>route.request().url().startsWith(server.origin)||route.request().url().startsWith('chrome-extension://')?route.continue():route.abort());
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:built.unpacked});const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.goto(server.url);
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});
 let workspace=page.frames().find(frame=>frame.url()===`chrome-extension://${id}/workspace.html`);assert(workspace);await workspace.getByText('Ordinary conversation',{exact:true}).waitFor({timeout:15000});
 report.results.push({name:'unchanged-packaged-worker-content-static-shells-render-native-facts',status:'PASS'});
 traceCDP=await context.newCDPSession(page);const worlds=[];traceCDP.on('Runtime.executionContextCreated',event=>worlds.push(event.context));await traceCDP.send('Runtime.enable');traceContext=worlds.find(world=>world.origin==='chrome-extension://'+id)?.id;if(traceContext)await traceCDP.send('Runtime.evaluate',{contextId:traceContext,expression:`globalThis.hostTrace=[];const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{const result=await original(message);hostTrace.push({type:message.type??message.kind,state:result?.state,ok:result?.ok,reason:result?.reason});return result;};`});
 await page.getByRole('button',{name:'返回原生阅读',exact:true}).click();const readingReturn=page.getByRole('button',{name:'返回工作空间',exact:true});await readingReturn.waitFor();assert.equal(await readingReturn.count(),1);await readingReturn.click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);report.results.push({name:'declarative-native-reading-close-keeps-one-working-return',status:'PASS'});
 const previous=page.frames().filter(frame=>frame.url().startsWith('chrome-extension://'+id));
 await page.locator('textarea').fill('DRAFT_SURVIVES_SPA');await page.evaluate(()=>{globalThis.testOriginalInput=document.querySelector('textarea');});
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===0);const back=page.getByRole('button',{name:'返回工作空间',exact:true});assert.equal(await back.count(),1);await back.click();await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2);assert.equal(await page.locator('textarea').inputValue(),'DRAFT_SURVIVES_SPA');report.results.push({name:'native-input-surrender-retains-unique-return-without-draft-loss',status:'PASS'});
 await page.locator('.project-entry').click();await page.waitForURL('**/g/g-p-22222222222222222222222222222222/project');
 await page.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});
 for(let attempt=0;attempt<100;attempt++){workspace=page.frames().find(frame=>frame.url()===`chrome-extension://${id}/workspace.html`&&!previous.includes(frame));if(workspace)break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert(workspace&&!previous.includes(workspace));await workspace.getByText('Second project conversation',{exact:true}).waitFor({timeout:15000});assert(previous.every(frame=>frame.isDetached()));
 assert.equal(await page.evaluate(()=>document.querySelector('textarea')===testOriginalInput&&testOriginalInput.value==='DRAFT_SURVIVES_SPA'),true);
 report.results.push({name:'native-SPA-project-revokes-old-frames-rebinds-and-keeps-editor-draft',status:'PASS'});
 const link=workspace.getByRole('link',{name:'Second project conversation',exact:true});const opened=context.waitForEvent('page');await link.click();const native=await opened;await native.waitForURL('**/c/22222222-2222-4222-8222-222222222222');assert.equal(await page.locator('textarea').inputValue(),'DRAFT_SURVIVES_SPA');await native.waitForFunction(()=>document.querySelectorAll('[data-va-owned]:popover-open').length===2,{},{timeout:15000});const current= native.frames().find(frame=>frame.url()===`chrome-extension://${id}/workspace.html`);await current.getByRole('link',{name:'Second project conversation',exact:true}).waitFor({timeout:15000});assert.equal(await current.getByRole('link',{name:'Second project conversation',exact:true}).getAttribute('aria-current'),'page');await native.close();
 report.results.push({name:'packaged-native-conversation-href-preserves-existing-project-draft',status:'PASS'});
 assert.deepEqual(report.errors,[]);assert.equal(verifyHost(built.unpacked).status,'OFFLINE_HOST_RECONSTRUCTION');report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;try{if(traceContext)report.trace=(await traceCDP.send('Runtime.evaluate',{contextId:traceContext,expression:'hostTrace',returnByValue:true})).result.value;report.pages=await Promise.all(context.pages().map(async page=>({url:page.url(),frames:page.frames().map(frame=>frame.url()),body:await page.locator('body').innerText()})));}catch{}process.exitCode=1;}
finally{await context?.close();await server.close();report.sourceChangedDuringRun=(await Promise.all(Object.entries(info.sourceHashes).map(async([path,hash])=>createHash('sha256').update(await readFile(path)).digest('hex')!==hash))).some(Boolean);await writeFile(process.argv[2]??'/private/tmp/free-host-package-mv3.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,error:report.error,results:report.results}));
