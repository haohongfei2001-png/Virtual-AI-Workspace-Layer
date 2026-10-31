import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[],results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T1?mode=native`);await page.waitForFunction(()=>globalThis.HF);
 await page.evaluate(async()=>{
  const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf}=await import('/simulator/data.mjs');
  const id='dependency_browser',documentId='dependency_doc',scope=scopeOf('A'),sender={id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href};
  const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({...sender,url:location.href})});let header;
  const client=startClient({send:async message=>{const result=await service.broker.handle(message,sender);if(result.header)header=result.header;return result;},invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>HF.state,subscribe:service.subscribe});
  globalThis.dependency={client,service,change:async availability=>{
   const before=header,facts=await service.native.read(scope),project=facts.projects.P1,source=facts.sources[project.sourceId];
   const result=await service.native.apply(scope,{operationId:'browser_'+availability,expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:source.sourceRevision+1,observedAt:source.observedAt,validUntil:source.validUntil,projects:[{id:project.id,nativeName:project.nativeName,nativeUrl:project.nativeUrl,availability,...(project.memberCount===undefined?{}:{memberCount:project.memberCount})}],refs:[],membership:[],inventory:source.inventory}});
   if(!result.ok)throw Error(result.reason);await client.refresh();return {availability,status:client.status(),sameRefs:JSON.stringify(before.manifest.refVersions)===JSON.stringify(header.manifest.refVersions),sameTTL:before.visibilityRevision===header.visibilityRevision,sameTime:before.evaluatedAt===header.evaluatedAt};
  }};
 });
 await page.waitForFunction(()=>dependency.client.status().state==='ACTIVE');
 const composer=page.getByRole('textbox',{name:'消息输入',exact:true});await composer.fill('Project可用性变化保留草稿');
 await page.evaluate(()=>{globalThis.originalComposer=document.querySelector('textarea');dependency.client.navigation.enterReading();});
 for(const availability of ['unavailable','available']){
  const result=await page.evaluate(value=>dependency.change(value),availability);assert.equal(result.status.state,'ACTIVE');assert(result.sameRefs&&result.sameTTL&&result.sameTime);
  assert.equal(await composer.inputValue(),'Project可用性变化保留草稿');assert(await page.evaluate(()=>originalComposer===document.querySelector('textarea')));assert.equal(await page.locator('[data-vaiwl-mask]').count(),0,'refresh retains native reading');
  await page.evaluate(()=>dependency.client.showWorkspace());
  const unknown=await page.locator('[data-free-list="unknown"] a[data-ref-id="T1"]').count();
  if(availability==='unavailable')assert(unknown>0,'unavailable project member remains reachable in UNKNOWN');else assert.equal(unknown,0,'restored member leaves UNKNOWN');
  const row=page.locator('a[data-ref-id="T1"]').first();assert(await row.count()>0,'member remains reachable after both transitions');
  results.push({...result,unknownLinks:unknown,draftRetained:true,readingRetained:true});await page.evaluate(()=>dependency.client.navigation.enterReading());
 }
 assert.deepEqual(errors,[]);await page.evaluate(()=>{dependency.client.stop();dependency.service.close();});
 await writeFile('/private/tmp/free-round17-project-ui.json',JSON.stringify({evidence:'HEADLESS_CHROME_SYNTHETIC_SERVICE_REAL_IDB',browser:browser.version(),results,errors,fail:0},null,2));console.log(JSON.stringify({pass:results.length,fail:0,artifact:'/private/tmp/free-round17-project-ui.json'}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
