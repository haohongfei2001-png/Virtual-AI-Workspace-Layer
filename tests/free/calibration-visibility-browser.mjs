import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
// Actual client + broker + IndexedDB, with an owner-injected synthetic source.
// This measures background calibration, without a user send or explicit refresh.
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);
 await page.waitForFunction(()=>globalThis.HF);
 await page.evaluate(async()=>{
  const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf,FIXTURE_NOW}=await import('/simulator/data.mjs'),{emptyFreeEvidence}=await import('/src/data/free-evidence.mjs');
  const id='calibration_visibility',documentId='visibility_document',scope=scopeOf('A'),scopeKey=emptyFreeEvidence(scope).scopeKey;
  let resolve,used=false,sourceCalls=0;const deferred=new Promise(r=>resolve=r),trace=[];
  const service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:location.href}),calibrationSourceFor:()=>({channel:'synthetic',read:()=>{sourceCalls++;if(used)return {status:'unsupported'};used=true;return deferred;}})});
  const client=startClient({subscribe:listener=>service.subscribe(listener),send:async message=>{const result=await service.broker.handle(message,{id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href});trace.push({type:message.type,at:performance.now()});return result;},invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>HF.state});
  globalThis.calibrationVisibility={service,client,trace,scope,sourceCalls:()=>sourceCalls,releasedAt:null,release(){this.releasedAt=performance.now();resolve({evidenceBatch:{sources:[{id:'free_fixture_sends',generation:'fixture_v1',channel:'synthetic',sourceRevision:1,observedAt:FIXTURE_NOW,validUntil:'2026-10-12T04:00:00Z'}],events:[{id:'calibration_visibility_send',sourceId:'free_fixture_sends',generation:'fixture_v1',sourceRevision:1,conversationId:'T300',messageId:'calibration_visibility_message',branchId:'root',actorVerified:true,actorScopeKey:scopeKey,role:'user',kind:'new-send',sendState:'committed',precision:'second',sentAt:FIXTURE_NOW,observedAt:FIXTURE_NOW}],hints:[],coverage:[]}});}};
 });
 await page.waitForFunction(()=>calibrationVisibility.client.status().state==='ACTIVE');
 await page.evaluate(()=>calibrationVisibility.client.showWorkspace());
 // Allow the view preference save, then release just after the next normal CHECK.
 await page.waitForTimeout(350);
 const checks=await page.evaluate(()=>calibrationVisibility.trace.filter(x=>x.type==='CHECK').length);
 await page.waitForFunction(n=>calibrationVisibility.trace.filter(x=>x.type==='CHECK').length>n,checks);
 assert.equal(await page.evaluate(()=>!!calibrationVisibility.client.navigation.roots().workspace.shadow.querySelector('[data-ref-id="T300"]')),false);
 await page.evaluate(()=>calibrationVisibility.release());
 await page.waitForFunction(()=>calibrationVisibility.client.navigation.roots().workspace.shadow.querySelector('[data-ref-id="T300"]'),null,{timeout:7000});
 const result=await page.evaluate(async()=>{const t=calibrationVisibility,visibleAt=performance.now(),stored=await t.service.evidence.read(t.scope);return {elapsedMs:visibleAt-t.releasedAt,evidenceRevision:stored.revision,requestsAfterRelease:t.trace.filter(x=>x.at>=t.releasedAt).map(x=>({type:x.type,elapsedMs:x.at-t.releasedAt})),eventPersisted:!!stored.events.calibration_visibility_send};});
 await page.waitForTimeout(2200);
 const sourceCalls=await page.evaluate(()=>calibrationVisibility.sourceCalls());
 const report={sourceCalls,evidence:'REAL_BROWSER_SYNTHETIC_PAGE_ONLY',browser:browser.version(),thresholdMs:1000,...result,pass:result.elapsedMs<=1000&&result.eventPersisted&&sourceCalls===1};
 await writeFile('/private/tmp/free-calibration-visibility.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(sourceCalls,1,'notification refresh must not retrigger calibration source');assert.equal(report.eventPersisted,true);assert.ok(report.elapsedMs<=1000,`Background calibration visible after ${report.elapsedMs.toFixed(1)}ms; requires <=1000ms`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
