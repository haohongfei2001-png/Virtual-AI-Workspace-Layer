import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
 await page.evaluate(async()=>{
  const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{emptyState}=await import('/src/data/state.mjs'),{createBackup}=await import('/src/data/backup.mjs');
  const scope=scopeOf('A'),id='removal_browser',sender={id,tab:{id:1},frameId:0,documentId:'removal_doc',documentLifecycle:'active',url:location.href},service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>sender});let header,pages=0,record=false;
  const client=startClient({send:async message=>{const result=await service.broker.handle(message,sender);if(result.header)header=result.header;if(record&&message.type==='B23_FREE_PAGE')pages++;return result;},invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>HF.state});
  globalThis.removal={client,service,restore:async()=>{
   const migrated=await service.workspaces.migratePartitioned(scope);if(!migrated.ok)throw Error(migrated.reason);
   const state=emptyState(scope);state.refs.backup_only={id:'backup_only',nativeUrl:location.origin+'/hf/A/c/backup_only',projectId:null,nativeTitle:'backup ref',available:true};const bundle=createBackup(state),preview=await service.workspaces.previewRestore(scope,bundle);
   const result=await service.workspaces.restoreBackup(scope,{operationId:'restore_reference',bundle,expectedRevision:preview.expectedRevision,planHash:preview.planHash});if(!result.ok)throw Error(result.reason);await client.refresh();return {revision:result.revision,version:header.manifest.refVersions.backup_only};
  },undo:async revision=>{
   const result=await service.workspaces.undo(scope,{operationId:'undo_reference',expectedRevision:revision,targetOperationId:'restore_reference'});if(!result.ok)throw Error(result.reason);
   record=true;await client.refresh();record=false;return {status:client.status(),pages,ownerContains:Object.hasOwn(header.manifest.refVersions,'backup_only')};
  }};
 });
 await page.waitForFunction(()=>removal.client.status().state==='ACTIVE');await page.getByRole('textbox',{name:'消息输入',exact:true}).fill('备份撤销不触碰草稿');await page.evaluate(()=>{globalThis.originalComposer=document.querySelector('textarea');});
 const restored=await page.evaluate(()=>removal.restore());assert.equal(restored.version,0);await page.evaluate(()=>removal.client.showWorkspace());assert(await page.locator('[data-free-list="unknown"] a[data-ref-id="backup_only"]').count()>0);
 await page.evaluate(()=>removal.client.navigation.enterReading());const result=await page.evaluate(revision=>removal.undo(revision),restored.revision);assert.equal(result.status.state,'ACTIVE');assert.equal(result.ownerContains,true);assert.equal(result.pages,0,'retained unchanged identity needs no ref pages');
 assert.equal(await page.locator('[data-vaiwl-mask]').count(),0);assert(await page.evaluate(()=>originalComposer===document.querySelector('textarea')));assert.equal(await page.getByRole('textbox',{name:'消息输入',exact:true}).inputValue(),'备份撤销不触碰草稿');
 await page.evaluate(()=>removal.client.showWorkspace());const remainingLinks=await page.locator('a[data-ref-id="backup_only"]').count();assert(remainingLinks>0,'undoing human assets must retain a reachable UNKNOWN identity');assert(await page.locator('[data-free-list="unknown"] a[data-ref-id="backup_only"]').count()>0);assert.equal(await page.locator('[data-free-list="unknown"] a[data-ref-id="backup_only"]').first().innerText(),'名称暂不可用');
 assert.deepEqual(errors,[]);await page.evaluate(()=>{removal.client.stop();removal.service.close();});
 await writeFile((process.argv[2]??'/private/tmp/free-known-anchor-ui.json'),JSON.stringify({evidence:'HEADLESS_SYNTHETIC_SERVICE_REAL_IDB',browser:browser.version(),result,remainingLinks,errors,draftRetained:true,fail:0},null,2));console.log(JSON.stringify({pass:1,fail:0,artifact:(process.argv[2]??'/private/tmp/free-known-anchor-ui.json')}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
