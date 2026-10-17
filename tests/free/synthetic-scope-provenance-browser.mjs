import {chromium} from '../b1/tooling/node_modules/playwright/index.mjs';
import {createServer} from '../../simulator/server.mjs';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Real headless DOM + actual client/broker; tiny owner-controlled repository fixture.
// No production account, native write, or claim of persistence certification.
const sourceHashes=Object.fromEntries(await Promise.all(['simulator/client.mjs','src/b1/document-binding-broker.mjs'].map(async p=>[p,createHash('sha256').update(await readFile(new URL('../../'+p,import.meta.url))).digest('hex')])));
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
async function setup(mode){
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hf/A/c/T0?mode=native`);await page.waitForFunction(()=>globalThis.HF);
 await page.evaluate(async mode=>{
  const {startClient}=await import('/simulator/client.mjs'),{createDocumentBindingBroker}=await import('/src/b1/document-binding-broker.mjs');
  let account='A',release,held=false,corrupt=false,repairCount=0;const gate=new Promise(r=>release=r),writes=[],trace=[];
  const id='scope_provenance';let documentId='same_document';
  const repository={version:async()=>({revision:1,nativeRevision:1,evidenceRevision:0}),
   freeHeader:async scope=>{if(corrupt)throw Error(mode==='free-recovery'?'corrupt-native-record':'corrupt-record');return ({scope:scope.key,revision:1,workspaceRevision:1,evidenceRevision:0,viewRevision:0,preferences:{},manifest:{projectVersions:{},refVersions:{},activityVersions:{}},viewSession:{H:30,T:20738,Z:'UTC',policyRevision:0}});},
   freePage:async scope=>({scope:scope.key,revision:1,projects:[],refs:[]}),
   freeRecoveryStatus:async()=>({native:{corrupt:true,recoverable:true,damagedHash:'a'.repeat(64)},evidence:{corrupt:false}}),freeRecover:async()=>{repairCount++;corrupt=false;return {ok:true};},recoveryStatus:async()=>({corrupt:true,recoverable:true,damagedHash:'a'.repeat(64)}),recover:async()=>{repairCount++;corrupt=false;return {ok:true};},
   saveView:async()=>({ok:true,revision:1}),fixtureObserve:async(scope,message)=>{writes.push({account:scope.accountId,messageId:message.messageId,projectId:message.projectId});return {ok:true};}};
  const broker=createDocumentBindingBroker({extensionId:id,getFrame:async()=>({documentId,documentLifecycle:'active',url:location.href}),resolveScope:async()=>({verified:true,provider:'synthetic_fixture',accountId:account,organizationId:'test_org'}),repository:{},workspaceRepository:repository,allowedURL:url=>new URL(url).origin===location.origin});
  const client=startClient({readControls:()=>HF.state,invalidateRemote:()=>broker.invalidate({tabId:1}),send:async message=>{
   trace.push({type:message.type,account});
   if(!held&&(mode==='cold'&&message.type==='BIND'||['retry','document'].includes(mode)&&message.type==='B23_SYNTHETIC_SEND')){held=true;await gate;}
   return broker.handle(message,{id,tab:{id:1},frameId:0,documentId,documentLifecycle:'active',url:location.href});
  }});
  globalThis.provenance={client,trace,writes,damage(){corrupt=true;},repairCount:()=>repairCount,held:()=>held,emit(messageId,conversationId='T0',projectId=null){document.dispatchEvent(new CustomEvent('hf:synthetic-send',{detail:{conversationId,messageId,projectId,nativeTitle:'Synthetic title'}}));},switchAccount(){account='B';broker.invalidate({tabId:1});},switchDocument(){documentId='replacement_document';broker.invalidate({tabId:1});},release};
 },mode);return page;
}
try{
 browser=await chromium.launch({headless:true});
 for(const mode of ['retry','cold','document','hidden','expired','same-scope-spa','project-spa','two-pending']){
  const page=await setup(mode);
  if(mode==='cold'){
   await page.waitForFunction(()=>provenance.held());await page.evaluate(()=>{provenance.emit('cold_unknown');provenance.switchAccount();provenance.release();});
  }else{
   await page.waitForFunction(()=>provenance.client.status().state==='ACTIVE');
   if(mode==='retry'||mode==='document'){
    await page.evaluate(()=>provenance.emit('from_A'));await page.waitForFunction(()=>provenance.held());
    await page.evaluate(mode=>{if(mode==='retry')provenance.switchAccount();else provenance.switchDocument();provenance.release();},mode);
   }else if(mode==='hidden'){
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));provenance.emit('hidden_origin');delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
   }else if(mode==='expired'){
    await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+21000;try{provenance.emit('expired_origin');}finally{Date.now=original;}void provenance.client.refresh();});
   }else{
    await page.evaluate(mode=>{provenance.trace.length=0;history.pushState({},'', '/hf/A/c/T1?mode=native');document.dispatchEvent(new Event('hf:change'));provenance.emit('same_scope_new_chat','T1',mode==='project-spa'?'P1':null);if(mode==='two-pending')provenance.emit('second_pending','T1');},mode);
   }
  }
  await page.waitForFunction(account=>provenance.client.status().state==='ACTIVE'&&JSON.parse(provenance.client.status().scope)[1]===account,['retry','cold'].includes(mode)?'B':'A');await page.waitForTimeout(450);
  const result=await page.evaluate(()=>({writes:provenance.writes,trace:provenance.trace,status:provenance.client.status()}));
  const pass=mode==='two-pending'?result.writes.length===2&&result.writes.every(row=>row.account==='A'):['same-scope-spa','project-spa'].includes(mode)?result.writes.length===1&&result.writes[0].account==='A'&&result.writes[0].projectId===(mode==='project-spa'?'P1':null):result.writes.length===0;
  if(['same-scope-spa','project-spa','two-pending'].includes(mode)){const trace=result.trace.map(row=>row.type),first=trace.indexOf('B23_SYNTHETIC_SEND'),header=trace.indexOf('B23_FREE_HEADER');assert(first>=0&&first<header,'verified same-scope send precedes rebound snapshot');assert(trace.indexOf('CHECK',header)>header,'snapshot retains final authority check');if(mode==='two-pending')assert(trace.indexOf('B23_SYNTHETIC_SEND',first+1)>trace.indexOf('CHECK',header),'at most one observation before first validated paint');}results.push({mode,pass,...result});await page.evaluate(()=>provenance.client.stop());await page.close();
 }

 for(const mode of ['free-recovery','asset-recovery']){
  const page=await setup(mode);await page.waitForFunction(()=>provenance.client.status().state==='ACTIVE');
  // Queue while still verified, then move away before its queued flush runs.
  await page.evaluate(()=>{provenance.emit('pending_before_damage');provenance.damage();history.pushState({},'', '/hf/A/c/T1?mode=native');document.dispatchEvent(new Event('hf:change'));});
  const panel=page.locator(mode==='free-recovery'?'[data-vaiwl-owned="free-recovery"]':'[data-vaiwl-owned="asset-recovery"]');await panel.waitFor();
  await page.evaluate(()=>provenance.emit('during_recovery','T1'));
  await panel.getByRole('button').click();await page.waitForFunction(()=>provenance.client.status().state==='ACTIVE');
  // Return to the original pathname: a stale queued event must not revive.
  await page.evaluate(()=>{history.pushState({},'', '/hf/A/c/T0?mode=native');document.dispatchEvent(new Event('hf:change'));});await page.waitForFunction(()=>provenance.client.status().state==='ACTIVE');
  await page.evaluate(()=>provenance.emit('fresh_after_repair'));await page.waitForFunction(()=>provenance.writes.some(x=>x.messageId==='fresh_after_repair'));
  const result=await page.evaluate(()=>({writes:provenance.writes,trace:provenance.trace,status:provenance.client.status(),repairCount:provenance.repairCount()}));
  assert.deepEqual(result.writes.map(x=>x.messageId),['fresh_after_repair'],'repair cannot replay pending observations or capture during recovery');assert.equal(result.repairCount,1);
  results.push({mode,pass:true,...result});await page.evaluate(()=>provenance.client.stop());await page.close();
 }
 const report={sourceHashes,evidence:'REAL_HEADLESS_DOM_REAL_BROKER_SYNTHETIC_OWNER_SMALL_REPOSITORY',browser:browser.version(),results};await writeFile('/private/tmp/free-synthetic-scope-provenance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.ok(results.every(r=>r.pass),'synthetic send provenance must remain with its verified origin; cold unscoped sends must be ignored');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
