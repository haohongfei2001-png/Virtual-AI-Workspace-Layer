import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {buildLocalWitness,verifyLocalWitness} from '../../tools/native-source-witness/build.mjs';
const dir=await mkdtemp(join(tmpdir(),'vaiwl-witness-headless-')),out=join(dir,'extension');
const report={kind:'ISOLATED_HEADLESS_MV3_ENTRY_ONLY',realChatGPT:'NOT_RUN',accountNavigationPerformed:false,offlineBeforeTestPages:true,checks:[],errors:[]};let context;
try{
 buildLocalWitness(out);verifyLocalWitness(out);
 context=await chromium.launchPersistentContext(join(dir,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+out,'--load-extension='+out]});
 await context.setOffline(true);
 await context.route('**/*',r=>r.request().url().startsWith('chrome-extension://')?r.continue():r.abort());
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`chrome-extension://${id}/status.html`);
 await page.getByRole('heading',{name:'临时只读导航',exact:true}).waitFor();
 const button=page.getByRole('button',{name:'本机一次性来源验证',exact:true});await button.waitFor();
 assert(await page.getByPlaceholder('搜索本次列表').isVisible());report.checks.push('existing-navigation-and-development-entry-visible');
 // Non-ChatGPT active tab cannot be silently replaced or diagnosed.
 await button.click();await page.getByRole('button',{name:'请在已授权 Profile 的 ChatGPT 标签中打开此入口',exact:true}).waitFor();report.checks.push('wrong-target-stops-before-preparation');
 const key='vaiwl-local-source-witness-20261022-v1';
 await worker.evaluate(async key=>{await chrome.storage.local.set({[key]:{state:'reserved',result:null}});},key);
 await page.goto(`chrome-extension://${id}/source-witness.html#999999`);
 await page.waitForFunction(()=>document.getElementById('result').textContent.includes('interrupted-no-retry'));
 const value=JSON.parse(await page.locator('#result').innerText());assert.equal(value.requests,null);assert.equal(value.unspent,false);assert.equal(value.requestCountKnown,false);assert(await page.locator('#run').isDisabled());
 await page.close();const reopened=await context.newPage();await reopened.goto(`chrome-extension://${id}/source-witness.html#999999`);await reopened.waitForFunction(()=>document.getElementById('result').textContent.includes('interrupted-no-retry'));
 assert.equal(JSON.parse(await reopened.locator('#result').innerText()).requests,null);assert(await reopened.getByRole('button',{name:'保存脱敏报告'}).isEnabled());
 report.checks.push('spent-ledger-survives-page-reopen-with-unknown-not-zero-count');
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=String(e.stack);process.exitCode=1;}finally{await context?.close();await rm(dir,{recursive:true,force:true});await writeFile(process.argv[2]??'/private/tmp/vaiwl-local-witness-headless.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
