import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const candidate=await readFile(new URL('./context-replacement-package-browser.mjs',import.meta.url),'utf8');
const between=(s,a,b)=>{assert(s.includes(a));assert(s.includes(b));return s.slice(s.indexOf(a)+a.length,s.indexOf(b,s.indexOf(a)+a.length));};
const functionSource=candidate.slice(candidate.indexOf('function installTransportExpiryObserver(){'),candidate.indexOf('\nif(idleProbe){'));
function observer(){let time=100;const pending=[];const realm={Date:class extends Date{static now(){return time;}},chrome:{runtime:{sendMessage:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}}};realm.globalThis=realm;runInNewContext('('+functionSource+')()',realm);return {realm,pending,setTime:v=>time=v,send:m=>realm.chrome.runtime.sendMessage(m),drain:async()=>{for(let i=0;i<5;i++)await Promise.resolve();}};}
test('passive trace preserves original Promise value and stores only allowed public metadata',async()=>{
 const f=observer(),promise=f.send({type:'HOST_HELLO',documentToken:'DO_NOT_RECORD'}),value={ok:true,binding:{expiresAt:new Date(20000).toISOString(),documentToken:'PRIVATE_TOKEN'},private:'DO_NOT_RECORD'};f.setTime(110);f.pending[0].resolve(value);assert.equal(await promise,value);await f.drain();assert.equal(f.realm.__vaiwlTransportExpiryTrace.length,1);const json=JSON.stringify(f.realm.__vaiwlTransportExpiryTrace);assert(!json.includes('PRIVATE'));assert(!json.includes('DO_NOT_RECORD'));assert.equal(f.realm.__vaiwlTransportExpiryTrace[0].bindingExpiresAt,20000);
});
test('trace does not observe unrelated packets, alter rejection or generate traffic',async()=>{
 const f=observer();f.send({type:'HOST_UI_VIEW'});f.pending[0].resolve({private:'excluded'});await f.drain();assert.equal(f.realm.__vaiwlTransportExpiryTrace.length,0);const p=f.send({type:'HOST_FOCUS'}),error=Error('rejected');f.pending[1].reject(error);await assert.rejects(p,error);await f.drain();assert.equal(f.pending.length,2);assert.equal(f.realm.__vaiwlTransportExpiryTrace.length,0);
});
test('trace ring remains bounded and snapshot order reflects real completed responses',async()=>{
 const f=observer();for(let i=0;i<132;i++){f.setTime(i+100);f.send({type:'HOST_FOCUS'});f.pending[i].resolve({ok:false,reason:'invalid-host-document'});await f.drain();}assert.equal(f.realm.__vaiwlTransportExpiryTrace.length,128);assert.equal(f.realm.__vaiwlTransportExpiryTrace[0].requestedAt,104);assert.equal(f.pending.length,132);
});
test('new mode has real expiry and same-owner controls, fresh grant/VIEW oracle and no timer/authority injection',()=>{
 const branch=between(candidate,' if(transportExpiry){\n  const initialProof=',' }else if(dormantRecovery){');
 for(const text of ['binding.bindingExpiresAt+1-Date.now()','receiptStartedAt+60000','workerClosed,false','beforeFocus,priorTrace','peer.bringToFront()','page.bringToFront()','waitJ4PeerScope(page,id,scopeKey','afterTime:focusedAt','initialProof.grant','oldFrame.isDetached(),true','focus.reason,\'invalid-host-document\''])assert(branch.includes(text),text);
 for(const forbidden of ['stopWorker','HOST_CONTEXT_READY','HOST_CONTEXT_PENDING','setVirtualTimePolicy','setWebLifecycleState','Date.now=','setTimeout='])assert(!branch.includes(forbidden),forbidden);
});

test('transport mutation removes only its exact branch and CI rejects any early or unrelated failure',async()=>{
 const workflow=await readFile(new URL('../../.github/workflows/free-offline-host.yml',import.meta.url),'utf8');
 assert(candidate.includes("assert.equal(original.split(anchor).length,2,'transport recovery mutation must remove exactly its production branch')"));
 for(const required of ["r.status!=='FAIL'","r.mutation!=='REMOVE_EXACT_FOREGROUND_INVALID_DOCUMENT_RECOVERY'","r.phase!=='await-fresh-foreground-grant-and-VIEW'","J4-peer-current-scope-timeout","r.results.at(-1)?.name!=='real-dormant-document-lease-expires-with-live-C2-no-renewal-or-native-GET'","t.reason==='invalid-host-document'","r.requests.length!==1","r.transportOwner?.workerClosed!==false","t.requestedAt>r.transportOwner.focusedAt","r.transport?.some(t=>t.type==='HOST_HELLO'","r.sourceChangedDuringRun!==false","['sourceHashes','fixtureHashes']"])assert(workflow.includes(required),required);
 assert(candidate.includes("if(transportExpiry)assert.equal(report.requests.length,1);else assert.equal(report.requests.length,2)"));
});

test('transport owner observation ends before owned browser cleanup rather than recording cleanup as a lost owner',()=>{
 assert(candidate.includes("worker.on('close',closed)"));assert(candidate.includes("worker.off('close',closed);report.transportOwner.observationEndedAt=Date.now()"));
 assert(candidate.includes('finally{endTransportOwnerObservation?.();const clean=await cleanupOwnedResources(report,'));
});

test('real foreground transport modes use noDefaults native visibility and own both browser and profile cleanup',async()=>{
 const helper=await readFile(new URL('./native-visibility-browser.mjs',import.meta.url),'utf8'),workflow=await readFile(new URL('../../.github/workflows/free-offline-host.yml',import.meta.url),'utf8');
 assert(candidate.includes('if(transportExpiry){browserHandle=await launchNativeVisibilityBrowser('));assert(candidate.includes('report.browserPrecondition=browserHandle.diagnostic'));
 assert(candidate.includes('else context=await chromium.launchPersistentContext('),'legacy modes keep their existing launch path');
 assert(helper.includes('chromium.connectOverCDP(endpoint,{noDefaults:true})'));assert(candidate.includes('browserHandle?browserHandle.close():context?.close()'));
 assert(candidate.includes("assert.equal(await page.evaluate(()=>document.hasFocus()),false,'genuine browser foreground edge required')"),'real foreground assertion is not relaxed');
 assert.equal(workflow.split("r.browserPrecondition?.focusEmulation!=='NOT_ENABLED_BY_PLAYWRIGHT'").length-1,2);
 assert.doesNotMatch(candidate,/setFocusEmulationEnabled|setWebLifecycleState|Object.defineProperty\(document.*(?:hasFocus|visibilityState)/);
});
