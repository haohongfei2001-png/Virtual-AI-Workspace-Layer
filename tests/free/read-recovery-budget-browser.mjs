/** Real HF DOM/client with controlled transport hangs and virtual clock, synthetic only. */
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const files=['simulator/client.mjs','src/data/request-deadline.mjs','src/data/read-recovery-budget.mjs','src/data/free-header-loader.mjs','tests/free/read-recovery-budget-browser.mjs'],hash=bytes=>createHash('sha256').update(bytes).digest('hex'),before={};
for(const file of files)before[file]=hash(await readFile(file));
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
const report={classification:'REAL_HEADLESS_DOM_SYNTHETIC_TRANSPORT_VIRTUAL_CLOCK',realChatGPT:'NOT_RUN',scope:'HF account A, isolated browser context',sourceHashes:before};
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('总读取超时期间仍未提交的草稿');
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.evaluate(async()=>{
  const {startClient}=await import('/simulator/client.mjs'),{createFixtureService}=await import('/simulator/service.mjs');
  const id='read_budget',documentId='read_budget_doc',trace=[],late=[];
  const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:location.href})});
  const t=globalThis.budgetTest={service,trace,late,input:HF.getView().input,mode:'hang',invalidations:0,invalidationTimes:[],started:performance.now()};
  t.client=startClient({readControls:()=>HF.state,subscribe:listener=>service.subscribe(listener),invalidateRemote:()=>{t.invalidations++;t.invalidationTimes.push(performance.now());service.broker.invalidate({tabId:1});},send:message=>{trace.push({type:message.type,at:performance.now()});if(t.mode==='hang'&&message.type==='BIND')return new Promise(resolve=>late.push(resolve));return service.broker.handle(message,{id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href});}});
 });
 // runFor executes scheduled timers at their due times, unlike fastForward.
 // Short chunks let Promise continuations schedule each bounded retry.
 for(let i=0;i<31;i++){await page.clock.runFor(1000);await page.evaluate(async()=>{for(let n=0;n<12;n++)await Promise.resolve();});}
 report.timeout=await page.evaluate(()=>({elapsed:performance.now()-budgetTest.started,state:budgetTest.client.status(),trace:budgetTest.trace,invalidations:budgetTest.invalidations,invalidationTimes:budgetTest.invalidationTimes,started:budgetTest.started,text:document.querySelector('[data-vaiwl-owned="connection-status"]')?.textContent,sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value,connected:budgetTest.input.isConnected}));
 assert.match(report.timeout.text??'',/工作空间加载超时，原生聊天仍可使用。/);assert.notEqual(report.timeout.state.state,'ACTIVE');assert(report.timeout.invalidations>0);assert.equal(report.timeout.invalidationTimes[0]-report.timeout.started,30000,'total deadline fires exactly at thirty virtual seconds');assert(report.timeout.sameInput&&report.timeout.connected);assert.equal(report.timeout.draft,'总读取超时期间仍未提交的草稿');
 const binds=report.timeout.trace.filter(row=>row.type==='BIND');assert(binds.length>=2,'exercise shared budget across retries');for(let i=1;i<binds.length;i++)assert(binds[i].at-binds[i-1].at>=6000,'single RPC cannot retry before six-second timeout');
 const count=report.timeout.trace.length;
 await page.evaluate(()=>{for(const resolve of budgetTest.late)resolve({ok:true,type:'BOUND',leaseId:'late',scope:'late-scope',documentId:'read_budget_doc',expiresAt:Date.now()+20000});budgetTest.late=[];});
 await page.clock.runFor(12000);
 report.afterLate=await page.evaluate(()=>({state:budgetTest.client.status(),requests:budgetTest.trace.length,sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value}));
 assert.equal(report.afterLate.requests,count,'terminal total deadline must stop automatic retries');assert.notEqual(report.afterLate.state.state,'ACTIVE');assert(report.afterLate.sameInput);assert.equal(report.afterLate.draft,report.timeout.draft);
 await page.evaluate(()=>{budgetTest.mode='real';budgetTest.reconnectedAt=performance.now();document.querySelector('[data-vaiwl-owned="connection-status"] button').click();});
 // Real broker + IDB run under the same virtual clock. Yield Node turns for IDB.
 for(let i=0;i<200;i++){if(await page.evaluate(()=>budgetTest.client.status().state==='ACTIVE'))break;await page.clock.runFor(50);await new Promise(resolve=>setTimeout(resolve,10));}
 report.manual=await page.evaluate(()=>({state:budgetTest.client.status(),sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value,connected:budgetTest.input.isConnected,elapsed:performance.now()-budgetTest.reconnectedAt,current:budgetTest.client.navigation.currentRef()?.id,feedback:!!document.querySelector('[data-vaiwl-owned="connection-status"]')}));
 assert.equal(report.manual.state.state,'ACTIVE');assert(report.manual.sameInput&&report.manual.connected);assert.equal(report.manual.draft,report.timeout.draft);assert.equal(report.manual.current,'T0');assert.equal(report.manual.feedback,false);
 await page.evaluate(async()=>{const t=budgetTest;await t.client.manage();t.dialog=document.querySelector('[data-vaiwl-owned="free-settings"]');if(!t.dialog)throw Error('missing Free settings fixture');t.file=t.dialog.querySelector('input[type="file"]');const transfer=new DataTransfer();transfer.items.add(new File(['synthetic unsubmitted selection'],'pending.json',{type:'application/json'}));t.file.files=transfer.files;t.mode='hang';void t.client.refresh();});
 for(let i=0;i<31;i++){await page.clock.runFor(1000);await page.evaluate(async()=>{for(let n=0;n<12;n++)await Promise.resolve();});}
 report.settingsTimeout=await page.evaluate(()=>({state:budgetTest.client.status(),text:document.querySelector('[data-vaiwl-owned="connection-status"]')?.textContent,dialogHidden:!budgetTest.dialog.isConnected,fileName:budgetTest.file.files[0]?.name,sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value,requests:budgetTest.trace.length}));
 assert.match(report.settingsTimeout.text??'',/工作空间加载超时，原生聊天仍可使用。/);assert(report.settingsTimeout.dialogHidden);assert.equal(report.settingsTimeout.fileName,'pending.json');assert(report.settingsTimeout.sameInput);assert.equal(report.settingsTimeout.draft,report.timeout.draft);
 await page.evaluate(()=>{for(const resolve of budgetTest.late)resolve({ok:true,type:'BOUND',leaseId:'late_settings',scope:'late-scope',documentId:'read_budget_doc',expiresAt:Date.now()+20000});budgetTest.late=[];});await page.clock.runFor(12000);
 assert.equal(await page.evaluate(()=>budgetTest.trace.length),report.settingsTimeout.requests);assert.notEqual(await page.evaluate(()=>budgetTest.client.status().state),'ACTIVE');
 await page.evaluate(()=>{budgetTest.mode='real';document.querySelector('[data-vaiwl-owned="connection-status"] button').click();});
 for(let i=0;i<200;i++){if(await page.evaluate(()=>budgetTest.dialog.isConnected&&budgetTest.dialog.open&&budgetTest.client.status().state==='NATIVE_LAYER'))break;await page.clock.runFor(50);await new Promise(resolve=>setTimeout(resolve,10));}
 report.settingsResumed=await page.evaluate(()=>({state:budgetTest.client.status(),sameDialog:document.querySelector('[data-vaiwl-owned="free-settings"]')===budgetTest.dialog,open:budgetTest.dialog.open,connected:budgetTest.dialog.isConnected,sameFile:document.querySelector('[data-vaiwl-owned="free-settings"] input[type="file"]')===budgetTest.file,fileName:budgetTest.file.files[0]?.name,sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value}));
 assert.equal(report.settingsResumed.state.state,'NATIVE_LAYER');assert(report.settingsResumed.sameDialog&&report.settingsResumed.open&&report.settingsResumed.connected,'same-scope reconnect must resume original settings dialog');assert(report.settingsResumed.sameFile);assert.equal(report.settingsResumed.fileName,'pending.json');assert(report.settingsResumed.sameInput);assert.equal(report.settingsResumed.draft,report.timeout.draft);
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();
 for(let i=0;i<100;i++){if(await page.evaluate(()=>budgetTest.client.status().state==='ACTIVE'))break;await page.clock.runFor(50);await new Promise(resolve=>setTimeout(resolve,10));}
 report.afterSettingsClose=await page.evaluate(()=>({state:budgetTest.client.status(),dialogRemoved:!budgetTest.dialog.isConnected,sameInput:HF.getView().input===budgetTest.input,draft:budgetTest.input.value}));assert.equal(report.afterSettingsClose.state.state,'ACTIVE');assert(report.afterSettingsClose.dialogRemoved&&report.afterSettingsClose.sameInput);assert.equal(report.afterSettingsClose.draft,report.timeout.draft);
 report.sourceChangedDuringRun=false;for(const file of files)if(hash(await readFile(file))!==before[file])report.sourceChangedDuringRun=true;assert.equal(report.sourceChangedDuringRun,false);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=error.stack;report.debug=await page?.evaluate(()=>({status:globalThis.budgetTest?.client.status(),trace:globalThis.budgetTest?.trace,text:document.body.textContent})).catch(()=>null);throw error;}
finally{await page?.evaluate(()=>{globalThis.budgetTest?.client.stop();globalThis.budgetTest?.service.close();}).catch(()=>{});await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(process.argv[2]??'/private/tmp/free-read-recovery-budget.json',JSON.stringify(report,null,2));}
