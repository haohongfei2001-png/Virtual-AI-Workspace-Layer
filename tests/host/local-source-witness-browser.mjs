import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {buildLocalWitness,verifyLocalWitness} from '../../tools/native-source-witness/build.mjs';
import {BATCH} from '../../tools/native-source-witness/runner.mjs';
import {PASSIVE_BATCH} from '../../tools/native-source-witness/worker.mjs';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-witness-headless-')),out=join(dir,'extension');
const report={kind:'ISOLATED_HEADLESS_MV3_ENTRY_ONLY',realChatGPT:'NOT_RUN',accountNavigationPerformed:false,offlineBeforeTestPages:true,checks:[],errors:[]};let context;
try{
 buildLocalWitness(out);verifyLocalWitness(out);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+out,'--load-extension='+out]});
 await context.setOffline(true);
 // Fixed local fulfillments only, with the browser offline before any pages.
 // The ChatGPT-shaped origin contains no live account, requests or response data.
 const fixtureRoute='https://chatgpt.com/c/12345678-1234-1234-1234-123456789012';
 await context.route('**/*',r=>r.request().url().startsWith('chrome-extension://')?r.continue():
  ['https://chatgpt.com/',fixtureRoute].includes(r.request().url())&&r.request().isNavigationRequest()?
   r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Offline synthetic target</title><button id="open">Open fixture chat</button><script>document.getElementById("open").onclick=()=>history.pushState({},"","/c/12345678-1234-1234-1234-123456789012")</script>'}):r.abort());
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`chrome-extension://${id}/status.html`);
 await page.getByRole('heading',{name:'临时只读导航',exact:true}).waitFor();
 const button=page.getByRole('button',{name:'本机一次性来源验证',exact:true});await button.waitFor();
 assert(await page.getByPlaceholder('搜索本次列表').isVisible());report.checks.push('existing-navigation-and-development-entry-visible');
 // Non-ChatGPT active tab cannot be silently replaced or diagnosed.
 await button.click();await page.getByRole('button',{name:'请在已授权 Profile 的 ChatGPT 标签中打开此入口',exact:true}).waitFor();report.checks.push('wrong-target-stops-before-preparation');
 const previous={state:'finished',result:{schema:BATCH,state:'BLOCKED',reason:'no-native-context-observed',requests:0,unspent:false}};
 await worker.evaluate(async({key,previous})=>chrome.storage.local.set({[key]:previous}),{key:BATCH,previous});
 const original=await context.newPage();await original.goto('https://chatgpt.com/');
 const other=await context.newPage();await other.goto(fixtureRoute);
 const ids=await worker.evaluate(async()=>{
  const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'});
  return {home:tabs.find(t=>t.url==='https://chatgpt.com/').id,other:tabs.find(t=>t.url!=='https://chatgpt.com/').id};
 });
 await page.goto(`chrome-extension://${id}/source-witness.html#${ids.other}`);
 await page.waitForFunction(()=>document.getElementById('confirm').disabled);
 assert(await page.locator('#run').isDisabled());assert.match(await page.locator('#next-step').innerText(),/空白首页/);
 report.checks.push('conversation-entry-cannot-arm');
 // Hash-only navigation must not retarget an already initialized observer page.
 // The real entry creates a new document; mirror that, not a hash substitution.
 await page.goto('about:blank');
 await page.goto(`chrome-extension://${id}/source-witness.html#${ids.home}`);
 await page.locator('#confirm').check();await page.locator('#run').click();
 await page.waitForFunction(()=>document.getElementById('result').textContent.includes('WAITING_NATIVE'));
 assert.match(await page.locator('#next-step').innerText(),/观察已就绪/);
 const reopenedDuringObservation=await context.newPage();
 await reopenedDuringObservation.goto(`chrome-extension://${id}/source-witness.html#${ids.other}`);
 await reopenedDuringObservation.locator('#return-target').click();
 const active=await worker.evaluate(async()=> (await chrome.tabs.query({active:true})).map(t=>t.id));
 assert(active.includes(ids.home));assert(!active.includes(ids.other));assert.equal(original.url(),'https://chatgpt.com/');
 report.checks.push('explicit-return-selects-owner-target-not-reopened-page-target-without-loading');
 // Verify actual Chrome navigation delivery, not a mocked webNavigation emitter.
 await original.locator('#open').click();
 await page.locator('#read').click();
 assert.equal(JSON.parse(await page.locator('#result').innerText()).state,'WAITING_NATIVE');
 await original.close();
 await page.waitForFunction(()=>document.getElementById('result').textContent.includes('target-closed'));
 const navigationReport=JSON.parse(await page.locator('#result').innerText());
 assert.equal(navigationReport.nativeObservation.navigations,1);assert.equal(navigationReport.requests,0);
 assert.equal(navigationReport.nativeObservation.events,0);assert.equal(navigationReport.stages.identity.state,'NOT_RUN');
 assert(await page.locator('#return-target').isHidden());assert(await page.locator('#run').isDisabled());
 report.checks.push('real-browser-synthetic-same-tab-history-event-counted-before-request-filter','terminal-return-hidden-with-spent-ledger');
 await reopenedDuringObservation.close();await other.close();
 // Remaining isolated fixture seeds a worker-loss record; no real ledger exists here.
 await worker.evaluate(async({key,oldKey,previous})=>{await chrome.storage.local.set({[key]:{state:'reserved',result:null},[oldKey]:previous});},{key:PASSIVE_BATCH,oldKey:BATCH,previous});
 await page.goto('about:blank');
 await page.goto(`chrome-extension://${id}/source-witness.html#999999`);
 await page.waitForFunction(()=>document.getElementById('result').textContent.includes('interrupted-no-retry'));
 const value=JSON.parse(await page.locator('#result').innerText());assert.equal(value.schema,PASSIVE_BATCH);assert.equal(value.requests,0);assert.equal(value.unspent,false);assert.equal(value.requestCountKnown,true);assert.equal(value.stages.identity.state,'NOT_RUN');assert(await page.locator('#run').isDisabled());
 await page.waitForFunction(()=>document.getElementById('previous-result').textContent.includes('no-native-context-observed'));
 await page.getByText('上一批已消费结果（只读保留）',{exact:true}).click();
 assert(await page.locator('#previous-result').isVisible());
 assert.deepEqual(JSON.parse(await page.locator('#previous-result').innerText()),previous.result);
 await page.close();const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/source-witness.html#999999`);await reopened.waitForFunction(()=>document.getElementById('result').textContent.includes('interrupted-no-retry'));
 assert.equal(JSON.parse(await reopened.locator('#result').innerText()).requests,0);assert(await reopened.getByRole('button',{name:'保存脱敏报告'}).isEnabled());
 assert.deepEqual(await worker.evaluate(async key=>(await chrome.storage.local.get(key))[key],BATCH),previous);
 report.checks.push('passive-spent-ledger-survives-page-reopen-with-no-active-requests','prior-consumed-result-preserved-and-readable');
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack);process.exitCode=1;}finally{await context?.close();await rm(dir,{recursive:true,force:true});await writeFile(process.argv[2]??'/private/tmp/vaiwl-local-witness-headless.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
