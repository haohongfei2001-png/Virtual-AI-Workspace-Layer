import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const mode of ['scope','revision','hidden','cancel','reuse','empty','renew']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Test-only scheduling seam, served from memory: pause after real assembly
  // resolves and before its result returns to the client publication branch.
  await page.route('**/src/data/free-replica.mjs',async route=>{const response=await route.fetch();let source=await response.text();source=source.replace('export function assembleFreeReplicaAsync(prior,header,pages,plan,guard){return finishAsync(assemble(prior,header,pages,plan),guard);}',"export async function assembleFreeReplicaAsync(prior,header,pages,plan,guard){globalThis.publicationProbe?.timeline.push('ASSEMBLY_START');const result=await finishAsync(assemble(prior,header,pages,plan),guard);await globalThis.publicationProbe?.afterAssembly?.();return result;}");await route.fulfill({response,body:source});});
  await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
  await page.evaluate(async mode=>{
   const {createFixtureService}=await import('/simulator/service.mjs'),{startClient}=await import('/simulator/client.mjs'),{scopeOf}=await import('/simulator/data.mjs');
   const scope=scopeOf('A'),id='publication_extension',documentId='publication_document',sender={id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href};let bound,armed=mode==='empty';
   const probe=globalThis.publicationProbe={timeline:[],hooked:false},service=createFixtureService({indexedDB,extensionId:id,getFrame:async()=>sender});
   async function rename(label){const facts=await service.native.read(scope),ref=facts.refs.T0,source=facts.sources[ref.sourceId];const result=await service.native.apply(scope,{operationId:label,expectedRevision:facts.revision,batch:{scopeKey:facts.scopeKey,sourceRevision:source.sourceRevision+1,observedAt:source.observedAt,validUntil:source.validUntil,projects:[],refs:[{id:'T0',nativeTitle:label,nativeUrl:ref.nativeUrl,availability:'available'}],membership:[],inventory:source.inventory}});if(!result.ok)throw Error(result.reason);}
   const client=startClient({send:async message=>{
    if(armed)probe.timeline.push(message.type);const result=await service.broker.handle(message,sender);if(message.type==='BIND')bound=result;
    if(armed&&message.type==='B23_FREE_HEADER'){
     if(mode==='empty')result.header.manifest={projectVersions:{},refVersions:{},activityVersions:{}};
    }
    if(armed&&mode==='renew'&&message.type==='B23_FREE_PAGE')bound.expiresAt=Date.now()+1000;
    if(armed&&mode==='scope'&&probe.hooked&&message.type==='CHECK'&&result.ok)result.scope='different-verified-scope';
    return result;
   },invalidateRemote:()=>service.broker.invalidate({tabId:1}),readControls:()=>HF.state});
   Object.assign(probe,{client,service,run:async()=>{
    if(mode==='empty'){const result={mode,hooked:probe.hooked,timeline:probe.timeline.slice(),status:client.status(),candidateVisible:false};client.stop();service.close();return result;}
    probe.timeline=[];if(!['reuse','empty'].includes(mode))await rename('candidate_title_'+mode);
    probe.afterAssembly=async()=>{if(!armed)return;probe.hooked=true;if(mode==='revision')await rename('later_committed_revision');if(mode==='hidden'){Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});}if(mode==='cancel')client.stop();};
    armed=true;await client.refresh();const result={mode,hooked:probe.hooked,timeline:probe.timeline.slice(),status:client.status(),candidateVisible:[...document.querySelectorAll('[data-vaiwl-owned]')].some(n=>(n.shadowRoot?.textContent??n.textContent).includes('candidate_title_'+mode))};client.stop();service.close();return result;
   }});
  },mode);
  await page.waitForFunction(()=>publicationProbe.client.status().state==='ACTIVE');const result=await page.evaluate(()=>publicationProbe.run());assert.deepEqual(errors,[]);const checks=result.timeline.filter(x=>x==='CHECK').length;
  if(['scope','revision'].includes(mode)){assert(result.hooked);assert.equal(checks,1);assert.notEqual(result.status.state,'ACTIVE');assert.equal(result.candidateVisible,false);assert.equal(result.status.reason,mode==='scope'?'stale-client-response':'snapshot-revision-changed');}
  else if(['hidden','cancel'].includes(mode)){assert(result.hooked);assert.notEqual(result.status.state,'ACTIVE');assert.equal(result.candidateVisible,false);}
  else {assert.equal(result.status.state,'ACTIVE');assert.equal(checks,1);if(mode==='reuse'){assert.equal(result.hooked,false);assert(!result.timeline.includes('B23_FREE_PAGE'));}if(mode==='empty'){assert(!result.timeline.includes('B23_FREE_PAGE'));assert(result.timeline.includes('ASSEMBLY_START'),'empty full inventory must assemble before its single fence');}if(mode==='renew'){assert(result.hooked);assert(result.timeline.indexOf('BIND',result.timeline.indexOf('B23_FREE_PAGE'))<result.timeline.indexOf('ASSEMBLY_START'));}}
  results.push(result);console.log(JSON.stringify(result));await context.close();
 }
 await writeFile('/private/tmp/free-round19-publication.json',JSON.stringify({evidence:'HEADLESS_SYNTHETIC_REAL_IDB_TEST_SCHEDULING_SEAM',results,fail:0},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
