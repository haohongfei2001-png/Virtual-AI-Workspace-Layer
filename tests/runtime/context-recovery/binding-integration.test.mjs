/** L-only integration of the exact proposed wiring, real binding/authority/UI/
 * VIEW owners and actual repositories. Chrome, native HTTP completion, identity,
 * body association and IndexedDB are explicit offline doubles. No browser,
 * credentials, private conversation, production profile or G claim is involved.
 */
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createContext, runInContext} from 'node:vm';
import {MockIDBFactory} from '../../b23/mock-idb.mjs';
import {currentJ4Grant, waitJ4PeerScope} from '../../host/j4-joint-interruption.mjs';
import {installJ4GrantObserver} from '../../host/j4-grant-observer.mjs';

const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
const sourcePath=join(repositoryRoot,'src/runtime/host-binding-service.mjs');
const originalSource=await readFile(sourcePath,'utf8');
const specification=await readFile(join(repositoryRoot,'docs/specs/chatgpt-host/CONTEXT_RECOVERY_NO_RECEIPT.md'),'utf8');
const marked=/<!-- BEGIN CONTEXT_RECOVERY_WIRING_DIFF -->\s*```diff\n([\s\S]*?)\n```\s*<!-- END CONTEXT_RECOVERY_WIRING_DIFF -->/g;
const matches=[...specification.matchAll(marked)];
assert.equal(matches.length,1,'exactly one reviewable wiring diff is required');
const wiring=matches[0][1]+'\n';
const touched=[...wiring.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
assert.equal(touched.length,1,'the integration proposal must remain the minimal service seam');
assert.deepEqual(touched.map(match=>[match[1],match[2]]),[['src/runtime/host-binding-service.mjs','src/runtime/host-binding-service.mjs']]);
const temporaryRoot=await mkdtemp(join(tmpdir(),'vaiwl-no-receipt-wiring-'));
let modules,wiringMode;
try{
 await cp(join(repositoryRoot,'src'),join(temporaryRoot,'src'),{recursive:true});
 const patchPath=join(temporaryRoot,'wiring.patch');await writeFile(patchPath,wiring);
 const apply=(...options)=>{
  const result=spawnSync('git',['apply',...options,'--whitespace=error-all',patchPath],{cwd:temporaryRoot,encoding:'utf8',timeout:10000});
  assert(Number.isInteger(result.status)&&result.status>=0,'git apply must finish normally: '+(result.error?.message??result.signal));
  return result;
 };
 const forward=apply('--check');
 if(forward.status===0){
  const applied=apply();assert.equal(applied.status,0,'checked diff must apply unchanged to the isolated source copy: '+applied.stderr);
  wiringMode='applied-to-copy';
 }else{
  // dot's eventual integrated tree is the second supported state. Every hunk
  // must reverse cleanly; a partial application or unrelated conflict is fatal.
  // Check only: do not undo the integrated service that the tests will exercise.
  const reverse=apply('--reverse','--check');
  assert.equal(reverse.status,0,'source is neither fully unintegrated nor fully integrated; forward: '+forward.stderr+'; reverse: '+reverse.stderr);
  wiringMode='already-integrated';
 }
 modules=await Promise.all([
  'runtime/host-binding-service.mjs','runtime/browser-request-context.mjs',
  'b1/scope-repository.mjs','data/repository.mjs','data/free-evidence-repository.mjs','host/url-policy.mjs'
 ].map(path=>import(pathToFileURL(join(temporaryRoot,'src',path)).href)));
}catch(error){await rm(temporaryRoot,{recursive:true,force:true});throw error;}
after(async()=>{
 try{assert.equal(await readFile(sourcePath,'utf8'),originalSource,'temporary wiring never edits the shared production file');}
 finally{await rm(temporaryRoot,{recursive:true,force:true});}
});
const [{createHostBindingService},{createBrowserRequestContext},{ScopeRepository},{WorkspaceRepository},{FreeEvidenceRepository},{createURLPolicy}]=modules;

const ORIGIN='https://chatgpt.com',EXTENSION='fixture_extension';
const C='33333333-3333-4333-8333-333333333333';
const PERSONAL='fixture-personal',TEAM='fixture-team';
const UI_URL=`chrome-extension://${EXTENSION}/workspace.html`;
const C2_PROFILE={id:'fixture-c2-context-recovery',singlePersonalDefault:false,browserRequestContext:true};
const sha256=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expectedScope=(context,principal='fixture-principal')=>JSON.stringify([
 'chatgpt','principal_'+sha256(['chatgpt-principal-v1',principal]),'context_'+sha256(['chatgpt-context-v1',principal,context])
]);
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function event(){
 const listeners=new Set();
 return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:details=>{for(const fn of [...listeners])fn(details);},get size(){return listeners.size;}};
}
function clockFor(t){
 t.mock.timers.enable({apis:['setTimeout']});
 let wall=Date.parse('2026-10-18T00:00:00Z'),elapsed=1000,serial=0;
 const timers=new Map();
 return {
  now:()=>wall,elapsedNow:()=>elapsed,instant:ms=>{wall+=ms;elapsed+=ms;},
  schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:elapsed+ms});return id;},
  cancel:id=>timers.delete(id),get timers(){return timers.size;},
  async advance(ms){
   wall+=ms;elapsed+=ms;
   for(const [id,timer] of [...timers])if(timers.has(id)&&timer.at<=elapsed){timers.delete(id);timer.fn();}
   t.mock.timers.tick(ms);await flush();
  }
 };
}

async function fixture(t,{profile=C2_PROFILE}={}){
 const clock=clockFor(t),tabs=new Map(),webRequest=Object.fromEntries(['onSendHeaders','onCompleted','onErrorOccurred','onBeforeRedirect'].map(name=>[name,event()]));
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'no-receipt-binding-'+crypto.randomUUID()});
 const workspace=new WorkspaceRepository({baseRepository:base,clock:()=>new Date(clock.now()).toISOString()});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>new Date(clock.now()).toISOString()});
 const surfaceProfile={id:'fixture-recovery-surface',revision:1,urlPolicy:createURLPolicy()};
 const notices=[],identity={principalId:'fixture-principal',contexts:[{id:PERSONAL,kind:'personal'},{id:TEAM,kind:'organization'}],reads:0,reader:null};
 let serial=0,worker=0,service=null,observer=null,frameReader=null,associationReader=null,associationCalls=0,frameCalls=0;
 const makeId=()=>`integration_${worker}_${++serial}`;
 function addTab(id,contextId=PERSONAL){
  const url=ORIGIN+'/c/'+C,sender={id:EXTENSION,tab:{id,incognito:false},frameId:0,documentId:'document_'+id,documentLifecycle:'active',url};
  const child={...sender,frameId:1,documentId:'ui_document_'+id,url:UI_URL};
  const tab={id,url,contextId,bodyId:C,sender,child,seq:0,localSeq:0,binding:null,mountId:null,grant:null};
  const realm=createContext({location:{protocol:'chrome-extension:'},Date:class extends Date{static now(){return clock.now();}},chrome:{runtime:{sendMessage:message=>service.handle(message,child)}}});
  runInContext('('+installJ4GrantObserver.toString()+')()',realm);
  const frame={url:()=>UI_URL,isDetached:()=>false,evaluate:fn=>Promise.resolve(runInContext('('+fn.toString()+')()',realm))};
  tab.realm=realm;tab.page={url:()=>tab.url,frames:()=>[frame]};tabs.set(id,tab);return tab;
 }
 const browserFrame=({tabId,frameId=0})=>{
  const tab=tabs.get(tabId);if(!tab)return null;
  return frameId===0?{documentId:tab.sender.documentId,documentLifecycle:'active',frameType:'outermost_frame',parentFrameId:-1,url:tab.url}:
   frameId===1?{documentId:tab.child.documentId,documentLifecycle:'active',frameType:'sub_frame',parentFrameId:0,url:tab.child.url}:null;
 };
 const getFrame=async query=>{frameCalls++;return frameReader?frameReader(query):browserFrame(query);};
 const frameFor=(tabId=1)=>{const tab=tabs.get(tabId);return {tabId,frameId:0,documentId:tab.sender.documentId,parentDocumentId:null,actualURL:tab.url,documentLifecycle:'active',incognito:false};};
 const makeIdentity=()=>({principalId:identity.principalId,contexts:identity.contexts.map(row=>({...row})),expiresAt:new Date(clock.now()+3600000).toISOString(),providerProfile:'fixture-fixed-provider',transport:'worker-fixed-fetch'});
 function construct(){
  worker++;
  observer=createBrowserRequestContext({origin:ORIGIN,webRequest,getFrame,getTab:async id=>({id,incognito:false}),
   associatePage:async query=>{associationCalls++;if(associationReader)return associationReader(query);const tab=tabs.get(query.tabId);return {challenge:query.challenge,actualURL:tab.url,conversationId:tab.bodyId,association:'explicit-body-id'};},
   now:clock.now,elapsedNow:clock.elapsedNow,makeId,
   onInvalidate:details=>{notices.push({type:'HOST_CONTEXT_PENDING',...details});service?.invalidate(details);},
   onReady:details=>notices.push({type:'HOST_CONTEXT_READY',...details})});
  service=createHostBindingService({extensionId:EXTENSION,getFrame,contextObserver:observer,profile,
   allowedURL:value=>{try{return new URL(value).origin===ORIGIN;}catch{return false;}},
   provider:{read:async options=>{identity.reads++;return identity.reader?identity.reader(options):makeIdentity();}},
   uiURLs:{workspace:UI_URL,sidebar:`chrome-extension://${EXTENSION}/sidebar.html`},
   repository:base,workspaceRepository:workspace,freeEvidenceRepository:evidence,surfaceProfiles:new Map([[surfaceProfile.id,surfaceProfile]]),
   now:clock.now,elapsedNow:clock.elapsedNow,schedule:clock.schedule,cancel:clock.cancel,makeId});
 }
 function restart(){const stoppedAt=clock.now(),previous=service;service.stop();observer.stop();service=null;construct();return {stoppedAt,previous};}
 function stop(){service?.stop();observer?.stop();}
 addTab(1);construct();t.after(()=>{stop();base.close();});
 const packet=(tabId=1)=>{const {documentToken,producerToken,routeEpoch}=tabs.get(tabId).binding;return {documentToken,producerToken,routeEpoch};};
 const request=(type,extra={},tabId=1)=>{const tab=tabs.get(tabId);return service.handle({v:1,type,clientId:'fixture-client',seq:++tab.seq,...extra},tab.sender);};
 async function hello(tabId=1){const tab=tabs.get(tabId),result=await request('HOST_HELLO',{},tabId);assert.equal(result.ok,true,JSON.stringify(result));tab.binding=result.binding;tab.localSeq=0;return result;}
 const refresh=(tabId=1)=>request('HOST_REFRESH',packet(tabId),tabId);
 const details=({tabId=1,contextId=tabs.get(tabId).contextId,...extra}={})=>({tabId,frameId:0,documentId:tabs.get(tabId).sender.documentId,documentLifecycle:'active',initiator:ORIGIN,type:'xmlhttprequest',method:'GET',requestId:makeId(),url:ORIGIN+'/backend-api/conversation/'+C,requestHeaders:[{name:'ChatGPT-Account-ID',value:contextId}],...extra});
 async function native(options={},completion={}){const d=details(options);webRequest.onSendHeaders.emit(d);await flush();webRequest.onCompleted.emit({...d,statusCode:200,fromCache:false,requestHeaders:undefined,...completion});await flush();return d;}
 const childSend=(message,tabId=1)=>tabs.get(tabId).realm.chrome.runtime.sendMessage(message);
 async function mount(tabId=1){
  const tab=tabs.get(tabId),mountId=makeId(),nonce=makeId();
  assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...packet(tabId),mountId,regionEpoch:1},tab.sender)).ok,true);
  tab.mountId=mountId;
  const joining=childSend({v:1,type:'HOST_UI_JOIN',nonce,role:'workspace'},tabId);
  const confirming=service.handle({v:1,type:'HOST_UI_CONFIRM',...packet(tabId),mountId,regionEpoch:1,nonce,role:'workspace'},tab.sender);
  const [joined,confirmed]=await Promise.all([joining,confirming]);
  assert.equal(joined.ok,true,JSON.stringify(joined));assert.equal(confirmed.ok,true,JSON.stringify(confirmed));
  assert.deepEqual(joined.grant,confirmed.grant);tab.grant=joined.grant;await flush();return joined.grant;
 }
 async function observe(title,tabId=1){
  const tab=tabs.get(tabId),locator={profileId:surfaceProfile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const result=await service.handle({protocol:'vaiwl-host-observation/1',...packet(tabId),localSeq:++tab.localSeq,profileId:surfaceProfile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{
   candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:title,titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:tab.url,liveHandle:null},evidence:locator}],
   membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]
  }},tab.sender);
  assert.equal(result.state,'accepted',JSON.stringify(result));return result;
 }
 const view=(tabId=1,overrides={},sender=null)=>{
  const tab=tabs.get(tabId),message={v:1,type:'HOST_UI_VIEW',grantId:tab.grant?.id??'unissued_grant',mountId:tab.mountId??'unissued_mount',query:{},...overrides};
  return sender?service.handle(message,sender):childSend(message,tabId);
 };
 async function ready(tabId=1){
  for(let tries=0;tries<80;tries++){const result=await view(tabId);if(result.state!=='preparing')return result;await flush();}
  assert.fail('bounded actual VIEW preparation did not finish');
 }
 async function authorize(tabId=1){await hello(tabId);const result=await refresh(tabId);assert.equal(result.state,'verified',JSON.stringify(result));assert.equal(result.scopeKey,expectedScope(tabs.get(tabId).contextId,identity.principalId));return result;}
 return {clock,tabs,webRequest,notices,identity,base,workspace,evidence,addTab,frameFor,browserFrame,packet,request,hello,refresh,details,native,mount,observe,view,ready,authorize,restart,stop,makeIdentity,
  get service(){return service;},get observer(){return observer;},get associationCalls(){return associationCalls;},get frameCalls(){return frameCalls;},
  set frameReader(value){frameReader=value;},set associationReader(value){associationReader=value;}
 };
}

test('L integration accepts only the complete documented wiring states and leaves production source unchanged',async t=>{
 assert.equal(await readFile(sourcePath,'utf8'),originalSource);
 const patched=await readFile(join(temporaryRoot,'src/runtime/host-binding-service.mjs'),'utf8');
 assert(['applied-to-copy','already-integrated'].includes(wiringMode));
 if(wiringMode==='applied-to-copy')assert.notEqual(patched,originalSource);
 else assert.equal(patched,originalSource,'already integrated source executes without applying or reversing any hunk');
 assert(patched.includes('contextRecovery.run(frame,'));t.diagnostic('wiring mode: '+wiringMode);
});

test('L no-receipt cold worker cannot read warm cached personal data; new native team evidence restores the correct scope',async t=>{
 const h=await fixture(t),tab=h.tabs.get(1);
 await h.native();await h.authorize();await h.observe('PERSONAL_CACHED_ONLY');await h.mount();
 const original=await h.ready();assert.equal(original.ok,true);assert.equal(original.page.scope,expectedScope(PERSONAL));assert(JSON.stringify(original.page).includes('PERSONAL_CACHED_ONLY'));
 const oldGrant=tab.grant,oldMount=tab.mountId,oldReceipt=await h.observer.verify(h.frameFor());assert(oldReceipt);
 const {stoppedAt}=h.restart();await h.clock.advance(1);
 const reads=h.identity.reads;await h.hello();
 for(let i=0;i<12;i++){
  const result=await h.refresh();assert.equal(result.state,'ambiguous');assert.equal(result.reason,'current-context-unproven');
 }
 assert.equal(h.identity.reads,reads,'cached scoped data and roster cannot initiate identity selection');
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
 assert.equal((await h.request('BIND')).ok,false);
 assert.equal((await h.service.handle({v:1,type:'HOST_UI_MOUNT',...h.packet(),mountId:'unproven_mount',regionEpoch:1},tab.sender)).ok,false);
 assert.equal((await h.view(1,{grantId:oldGrant.id,mountId:oldMount})).ok,false);
 assert.equal(h.observer.isCurrent(h.frameFor(),oldReceipt),false);
 assert.equal((await h.request('HOST_REFRESH',{...h.packet(),contextReceipt:structuredClone(oldReceipt)})).ok,false);
 assert.equal(h.identity.reads,reads);
 assert.equal(await currentJ4Grant(tab.page,EXTENSION,expectedScope(PERSONAL),{previousGrant:oldGrant.id,afterTime:stoppedAt,now:h.clock.now}),null);
 tab.contextId=TEAM;await h.native();await h.authorize();
 const newGrant=await h.mount();assert.notEqual(newGrant.id,oldGrant.id);
 assert.equal(await currentJ4Grant(tab.page,EXTENSION,expectedScope(TEAM),{previousGrant:oldGrant.id,afterTime:stoppedAt,now:h.clock.now}),null,'a new grant without its matching VIEW is not recovered UI');
 const empty=await h.ready();assert.equal(empty.ok,true);assert.equal(empty.page.scope,expectedScope(TEAM));assert(!JSON.stringify(empty.page).includes('PERSONAL_CACHED_ONLY'));
 await h.observe('TEAM_CURRENT_ONLY');const team=await h.ready();assert.equal(team.ok,true);assert.equal(team.page.currentRef.id,C);assert(JSON.stringify(team.page).includes('TEAM_CURRENT_ONLY'));assert(!JSON.stringify(team.page).includes('PERSONAL_CACHED_ONLY'));
 assert.equal(await waitJ4PeerScope(tab.page,EXTENSION,expectedScope(TEAM),{previousGrant:oldGrant.id,expectedCurrentRef:C,afterTime:stoppedAt,now:h.clock.now,sleep:ms=>h.clock.advance(ms)}),expectedScope(TEAM));
 assert.equal(h.identity.reads,reads+1,'fresh native evidence permits one actual identity chain');
 assert.equal((await h.view(1,{grantId:oldGrant.id,mountId:oldMount})).ok,false);
});

test('L cache completion, extension GET and repeated worker restarts remain settled with no provider or UiGrant',async t=>{
 const h=await fixture(t);
 for(let generation=0;generation<3;generation++){
  if(generation)h.restart();
  await h.native({}, {fromCache:true});await h.hello();assert.equal((await h.refresh()).state,'ambiguous');
  await h.native({initiator:`chrome-extension://${EXTENSION}`});await h.hello();assert.equal((await h.refresh()).state,'ambiguous');
  assert.equal((await h.view()).ok,false);assert.equal(h.identity.reads,0);assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
  await flush();assert.equal(h.service.isIdle(),true,'waiting does not keep the worker active');
 }
 await h.clock.advance(120000);assert.equal(h.identity.reads,0);assert.equal(h.clock.timers,0);
});

test('L same URL space switch revokes the old UiGrant before completion and only the new context becomes readable',async t=>{
 const h=await fixture(t),tab=h.tabs.get(1);await h.native();await h.authorize();await h.observe('OLD_PERSONAL');await h.mount();await h.ready();
 const oldGrant=tab.grant,oldMount=tab.mountId,unchangedURL=tab.url,reads=h.identity.reads;
 tab.contextId=TEAM;const next=h.details();h.webRequest.onSendHeaders.emit(next);
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null,'original observer invalidates synchronously on the new native selection header');
 assert.equal(tab.url,unchangedURL);assert.equal((await h.view(1,{grantId:oldGrant.id,mountId:oldMount})).ok,false);
 await flush();await h.hello();assert.equal((await h.refresh()).state,'ambiguous');assert.equal(h.identity.reads,reads);
 h.webRequest.onCompleted.emit({...next,statusCode:200,fromCache:false,requestHeaders:undefined});await flush();
 await h.authorize();await h.observe('NEW_TEAM');await h.mount();const page=await h.ready();
 assert.equal(page.page.scope,expectedScope(TEAM));assert(!JSON.stringify(page.page).includes('OLD_PERSONAL'));assert(JSON.stringify(page.page).includes('NEW_TEAM'));
 assert.equal((await h.view(1,{grantId:oldGrant.id,mountId:oldMount})).ok,false);
});

test('L two tabs at the same URL keep different contexts; a new worker cannot borrow the other tab receipt or grant',async t=>{
 const h=await fixture(t);h.addTab(2,TEAM);
 for(const id of [1,2]){await h.native({tabId:id});await h.authorize(id);await h.observe('TAB_'+id,id);await h.mount(id);const page=await h.ready(id);assert.equal(page.page.scope,expectedScope(id===1?PERSONAL:TEAM));}
 const team=h.tabs.get(2),oldTeam=team.grant,oldTeamMount=team.mountId;
 assert.equal((await h.view(2,{},h.tabs.get(1).child)).ok,false,'a grant is bound to its real child frame');
 h.restart();await h.native({tabId:1});await h.authorize(1);await h.mount(1);assert.equal((await h.ready(1)).page.scope,expectedScope(PERSONAL));
 const reads=h.identity.reads;await h.hello(2);assert.equal((await h.refresh(2)).state,'ambiguous');assert.equal(h.identity.reads,reads);
 assert.equal(h.service.authority.scopeFor(h.frameFor(2)),null);assert.equal((await h.view(2,{grantId:oldTeam.id,mountId:oldTeamMount})).ok,false);
 await h.native({tabId:2});await h.authorize(2);await h.mount(2);const result=await h.ready(2);
 assert.equal(result.page.scope,expectedScope(TEAM));assert(!JSON.stringify(result.page).includes('TAB_1'));assert(JSON.stringify(result.page).includes('TAB_2'));
});

test('L valid evidence A keeps original new-producer fresh identity behavior and does not reuse a changed principal',async t=>{
 const h=await fixture(t),tab=h.tabs.get(1);await h.native();await h.authorize();await h.mount();await h.ready();
 const oldGrant=tab.grant,oldMount=tab.mountId,oldScope=expectedScope(PERSONAL),reads=h.identity.reads;
 h.identity.principalId='fixture-new-principal';await h.hello();const refreshed=await h.refresh();
 assert.equal(refreshed.state,'verified');assert.equal(h.identity.reads,reads+1,'new HELLO must still perform the existing auth-change identity read');
 assert.notEqual(refreshed.scopeKey,oldScope);assert.equal(refreshed.scopeKey,expectedScope(PERSONAL,'fixture-new-principal'));
 assert.equal((await h.view(1,{grantId:oldGrant.id,mountId:oldMount})).ok,false);
});

test('L outer six seconds includes preceding frame checks and C2 association; late association never starts identity',async t=>{
 const h=await fixture(t);await h.native();await h.hello();
 const frameGate=deferred(),bodyGate=deferred();let held=false,bodyQuery=null;
 h.frameReader=query=>{if(!held){held=true;return frameGate.promise;}return h.browserFrame(query);};
 h.associationReader=query=>{bodyQuery=query;return bodyGate.promise;};
 const started=h.clock.elapsedNow(),pending=h.refresh();await flush();assert.equal(held,true);
 await h.clock.advance(5500);frameGate.resolve(h.browserFrame({tabId:1,frameId:0}));await flush();assert(bodyQuery,'preflight only receives the original remaining 500ms');
 await h.clock.advance(500);assert.equal((await pending).ok,false);assert.equal(h.clock.elapsedNow()-started,6000);assert.equal(h.identity.reads,0);
 bodyGate.resolve({challenge:bodyQuery.challenge,actualURL:bodyQuery.actualURL,conversationId:C,association:'explicit-body-id'});await flush();
 assert.equal(h.identity.reads,0);assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
 await h.clock.advance(6000);assert.equal(h.identity.reads,0,'late completion never opens an extra six-second window');
});

test('L service stop cancels a real B identity chain and its late success cannot mint a readable grant',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const providerGate=deferred();let signal;h.identity.reader=options=>{signal=options.signal;return providerGate.promise;};
 const pending=h.refresh();await flush();assert.equal(h.identity.reads,1);assert(signal);h.stop();assert.equal(signal.aborted,true);
 assert.equal((await pending).ok,false);providerGate.resolve(h.makeIdentity());await flush();
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null);assert.equal((await h.view()).ok,false);
});

for(const interruption of ['same-URL context invalidation','original six-second deadline'])test('L overlapping B refreshes share one identity chain and reject stale results after '+interruption,async t=>{
 const h=await fixture(t),tab=h.tabs.get(1);
 await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const providerGate=deferred(),oldIdentity=h.makeIdentity();let oldSignal;
 h.identity.reader=options=>{oldSignal=options.signal;return providerGate.promise;};
 const pending=[h.refresh()];await flush();assert.equal(h.identity.reads,1);
 // These requests enter after ScopeAuthority is already pending. They must
 // join the policy's own producer flight rather than become independent A.
 pending.push(h.refresh(),h.refresh());await flush();assert.equal(h.identity.reads,1);
 if(interruption==='original six-second deadline')await h.clock.advance(6000);
 tab.contextId=TEAM;const next=h.details();h.webRequest.onSendHeaders.emit(next);await flush();
 assert.equal(oldSignal.aborted,true);
 const refused=await Promise.all(pending);assert(refused.every(result=>result.state!=='verified'),JSON.stringify(refused));
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null);assert.equal(h.identity.reads,1);
 h.identity.reader=null;h.webRequest.onCompleted.emit({...next,statusCode:200,fromCache:false,requestHeaders:undefined});await flush();
 await h.authorize();await h.observe('FRESH_TEAM_AFTER_INTERRUPTION');await h.mount();
 const current=h.service.authority.peek(h.frameFor()).grant;assert(current);assert.equal((await h.ready()).page.scope,expectedScope(TEAM));
 providerGate.resolve(oldIdentity);await flush();
 assert.equal(h.service.authority.peek(h.frameFor()).grant,current,'late old identity cannot replace or revoke the independent new grant');
 const page=await h.ready();assert.equal(page.page.scope,expectedScope(TEAM));assert(JSON.stringify(page.page).includes('FRESH_TEAM_AFTER_INTERRUPTION'));
 assert.equal(h.identity.reads,2,'the rejected shared flight never starts a hidden retry');
});

test('L original fifteen-second fresh-grant plus VIEW oracle expires without a native signal and is never restarted',async t=>{
 const h=await fixture(t),tab=h.tabs.get(1);await h.native();await h.authorize();await h.observe('BEFORE_RESTART');await h.mount();await h.ready();
 const previousGrant=tab.grant.id,{stoppedAt}=h.restart();await h.clock.advance(1);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');
 const started=h.clock.now(),reads=h.identity.reads;
 await assert.rejects(waitJ4PeerScope(tab.page,EXTENSION,expectedScope(PERSONAL),{previousGrant,afterTime:stoppedAt,now:h.clock.now,sleep:ms=>h.clock.advance(ms)}),/J4-peer-current-scope-timeout/);
 assert.equal(h.clock.now()-started,15000);assert.equal(h.identity.reads,reads);
 // A later real signal may permit a later recovery, but cannot retroactively
 // turn the completed original oracle into a PASS or reset its start time.
 await h.native();await h.authorize();await h.mount();await h.ready();
 assert(await currentJ4Grant(tab.page,EXTENSION,expectedScope(PERSONAL),{previousGrant,afterTime:stoppedAt,now:h.clock.now}));
 assert.equal(h.clock.now()-started,15000);
});

// Independent delivery-ownership regressions retained from integration review.
for(const failure of ['deadline','failed final frame check'])test('independent: '+failure+' of one subscriber must preserve another completed shared subscriber', async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const read=deferred();h.identity.reader=()=>read.promise;
 const first=h.refresh();await flush();await h.clock.advance(100);
 const second=h.refresh();await flush();assert.equal(h.identity.reads,1);
 const lateFrame=deferred();let held=false;
 h.frameReader=query=>{
  if(!held&&h.service.authority.peek(h.frameFor()).state==='verified'){held=true;return lateFrame.promise;}
  return h.browserFrame(query);
 };
 read.resolve(h.makeIdentity());await flush();assert.equal(held,true);
 const successful=await second;assert.equal(successful.state,'verified');
 const grant=h.service.authority.peek(h.frameFor()).grant;assert(grant);
 await h.mount();assert.equal((await h.ready()).ok,true);
 if(failure==='deadline')await h.clock.advance(5900);
 else{lateFrame.resolve(null);await flush();}
 const failed=await first;assert.equal(failed.ok,false);
 t.diagnostic('other subscriber: verified plus matching VIEW; failed subscriber: '+JSON.stringify(failed)+'; current authority: '+JSON.stringify(h.service.authority.peek(h.frameFor())));
 assert.equal(h.service.authority.peek(h.frameFor()).grant,grant,'one failed subscriber must not revoke the grant delivered to the other subscriber');
 lateFrame.resolve(h.browserFrame({tabId:1,frameId:0}));await flush();
});

test('independent control: when every shared subscriber times out after scope delivery, the abandoned grant is revoked',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const read=deferred();h.identity.reader=()=>read.promise;
 const first=h.refresh();await flush();await h.clock.advance(100);const second=h.refresh();await flush();
 const frames=[];h.frameReader=query=>{
  if(h.service.authority.peek(h.frameFor()).state==='verified'){const gate=deferred();frames.push({gate,query});return gate.promise;}
  return h.browserFrame(query);
 };
 read.resolve(h.makeIdentity());await flush();assert.equal(frames.length,2);assert.equal(h.identity.reads,1);
 await h.clock.advance(6000);assert.equal((await first).ok,false);assert.equal((await second).ok,false);
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
 for(const {gate,query} of frames)gate.resolve(h.browserFrame(query));await flush();assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
});

test('independent: an entirely rejected B delivery must not refund the same receipt for another identity chain',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const receipt=await h.observer.verify(h.frameFor());assert(receipt);
 let failed=false;h.frameReader=query=>{
  if(!failed&&h.service.authority.peek(h.frameFor()).state==='verified'){failed=true;return null;}
  return h.browserFrame(query);
 };
 const first=await h.refresh();assert.equal(first.ok,false);assert.equal(first.reason,'stale-host-document');
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null);assert.equal(h.identity.reads,1);assert.equal(await h.observer.verify(h.frameFor()),receipt);
 h.frameReader=null;const retried=await h.refresh();
 t.diagnostic('first B final delivery rejected; same current receipt retry='+JSON.stringify(retried)+'; identity reads='+h.identity.reads);
 assert.equal(h.identity.reads,1,'a B receipt rejected at the service boundary must not be refunded');
 assert.notEqual(retried.state,'verified');
});

test('independent: another same-owner refresh during pending B service delivery does not reopen authentication',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const finalFrame=deferred();let held=false;
 h.frameReader=query=>{if(!held&&h.service.authority.peek(h.frameFor()).state==='verified'){held=true;return finalFrame.promise;}return h.browserFrame(query);};
 const first=h.refresh();await flush();assert.equal(held,true);assert.equal(h.identity.reads,1);
 const firstGrant=h.service.authority.peek(h.frameFor()).grant;
 const second=await h.refresh();assert.equal(second.state,'verified');
 const secondGrant=h.service.authority.peek(h.frameFor()).grant;
 finalFrame.resolve(h.browserFrame({tabId:1,frameId:0}));const firstResult=await first;
 t.diagnostic('first unfinished service grant was replaced='+String(firstGrant!==secondGrant)+'; second='+JSON.stringify(second)+'; first late='+JSON.stringify(firstResult)+'; identity reads='+h.identity.reads);
 assert.equal(h.identity.reads,1,'same owner must join the still-unconfirmed B delivery rather than bypass its receipt consumption');
 assert.equal(firstResult.scopeKey,second.scopeKey,'a verified reply must name its actual current scope');
});

test('independent: failed sibling releases only itself while another subscriber still awaits final delivery',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const read=deferred();h.identity.reader=()=>read.promise;const first=h.refresh();await flush();const second=h.refresh();await flush();
 const held=[];h.frameReader=query=>{
  if(h.service.authority.peek(h.frameFor()).state==='verified'&&held.length<2){const gate=deferred();held.push({gate,query});return gate.promise;}
  return h.browserFrame(query);
 };
 read.resolve(h.makeIdentity());await flush();assert.equal(held.length,2);const grant=h.service.authority.peek(h.frameFor()).grant;
 held[0].gate.resolve(null);assert.equal((await first).ok,false);assert.equal(h.service.authority.peek(h.frameFor()).grant,grant);
 held[1].gate.resolve(h.browserFrame(held[1].query));assert.equal((await second).state,'verified');assert.equal(h.service.authority.peek(h.frameFor()).grant,grant);assert.equal(h.identity.reads,1);
 await h.mount();assert.equal((await h.ready()).ok,true);
});

test('independent: an old completed delivery is not a permanent cleanup exemption for a later failed refresh',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.authorize();await h.mount();assert.equal((await h.ready()).ok,true);
 const grant=h.service.authority.peek(h.frameFor()).grant,reads=h.identity.reads;let checks=0;
 h.frameReader=query=>{if(++checks===4)return null;return h.browserFrame(query);};
 const result=await h.refresh();assert.equal(result.ok,false);assert.equal(h.identity.reads,reads,'ordinary renewal reuses the still-current grant locally');
 assert.equal(h.service.authority.scopeFor(h.frameFor()),null,'failed later group cannot retain a historical success exemption');assert.equal((await h.view()).ok,false);
});

test('independent: explicit invalidation during shared final delivery overrides all delivery claims',async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const read=deferred();h.identity.reader=()=>read.promise;const first=h.refresh();await flush();const second=h.refresh();await flush();
 const held=[];h.frameReader=query=>{
  if(h.service.authority.peek(h.frameFor()).state==='verified'){const gate=deferred();held.push({gate,query});return gate.promise;}
  return h.browserFrame(query);
 };
 read.resolve(h.makeIdentity());await flush();assert.equal(held.length,2);
 h.service.invalidate({tabId:1,documentId:h.frameFor().documentId});assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
 for(const {gate,query}of held)gate.resolve(h.browserFrame(query));
 assert.equal((await first).ok,false);assert.equal((await second).ok,false);assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
});

for(let hops=0;hops<16;hops++)test('outer service delivery deadline microtask '+hops,async t=>{
 const h=await fixture(t);await h.hello();assert.equal((await h.refresh()).state,'ambiguous');await h.native();await h.hello();
 const read=deferred();h.identity.reader=()=>read.promise;const first=h.refresh();await flush();await h.clock.advance(5000);
 let armed=false;h.frameReader=query=>{
  if(!armed&&h.service.authority.peek(h.frameFor()).state==='verified'){
   armed=true;let left=hops;
   const jump=()=>{if(left-->0)queueMicrotask(jump);else h.clock.instant(1000);};queueMicrotask(jump);
  }
  return h.browserFrame(query);
 };
 read.resolve(h.makeIdentity());const failed=await first;await flush();
 assert.equal(armed,true);h.frameReader=null;h.identity.reader=null;
 if(failed.ok===false){
  assert.equal(h.service.authority.scopeFor(h.frameFor()),null);
  const result=await h.refresh();t.diagnostic('first='+JSON.stringify(failed)+'; retry='+JSON.stringify(result)+'; identity reads='+h.identity.reads);
  assert.equal(h.identity.reads,1,'failed final outer delivery must not mark producer as verified and bypass B');
 }else t.diagnostic('deadline occurred after completed service delivery');
});
