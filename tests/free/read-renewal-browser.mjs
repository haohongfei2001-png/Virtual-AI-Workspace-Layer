import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
try{browser=await chromium.launch({headless:true,executablePath:process.env.FREE_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});for(const mode of ['scope','version']){
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
 await page.evaluate(async mode=>{
  const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf}=await import('/simulator/data.mjs'),{nativeSeed}=await import('/simulator/native-seed.mjs'),{persistentSeed}=await import('/simulator/persistent-seed.mjs');
  const documentId='renew_document',id='renew_extension';let authorityURL=location.href,bound=null,armed=false,switched=false,pages=0,checks=0;
  const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:authorityURL})});
  const B=scopeOf('B');await service.workspaces.initialize(B,persistentSeed(B,location.origin));await service.native.apply(B,{operationId:'seed_B',expectedRevision:0,batch:nativeSeed(B,location.origin)});
  const sender={id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href};
  const client=startClient({send:async message=>{
   if(armed&&message.type==='BIND'&&bound?.expiresAt-Date.now()<6000){switched=true;armed=false;if(mode==='scope')authorityURL=authorityURL.replace('/hf/A/','/hf/B/');else{const batch=nativeSeed(scopeOf('A'),location.origin);batch.sourceRevision=2;const changed=await service.native.apply(scopeOf('A'),{operationId:'change_during_renewal',expectedRevision:1,batch});if(!changed.ok)throw Error(changed.reason);}}
   const result=await service.broker.handle(message,sender);if(message.type==='BIND')bound=result;
   if(armed&&message.type==='B23_FREE_HEADER')bound.expiresAt=Date.now()+1000;
   if(switched&&message.type==='B23_FREE_PAGE')pages++;if(switched&&message.type==='CHECK')checks++;
   return result;
  },invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>HF.state});
  globalThis.renewal={client,service,run:async()=>{armed=true;await client.refresh();return {mode,switched,pages,checks,status:client.status()};}};
 },mode);
 await page.waitForFunction(()=>renewal.client.status().state==='ACTIVE');const result=await page.evaluate(()=>renewal.run());results.push(result);console.log(JSON.stringify(result));await page.evaluate(()=>{renewal.client.stop();renewal.service.close();});await page.close();
 }
 await writeFile('/private/tmp/free-read-renewal.json',JSON.stringify({evidence:'REAL_BROWSER_SYNTHETIC_RENEWAL',results},null,2));
 for(const row of results){assert.equal(row.switched,true);assert.equal(row.pages,0,'no-delta path must exercise CHECK-only fencing');assert.equal(row.status.reason,row.mode==='scope'?'stale-client-response':'snapshot-revision-changed',JSON.stringify(row));assert.notEqual(row.status.state,'ACTIVE','mixed scope/revision cannot become active');}
}finally{await browser?.close();await new Promise(r=>server.close(r));}
