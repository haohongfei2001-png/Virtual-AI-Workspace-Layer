import {createHostWorkerRuntime} from '../../src/runtime/host-worker-runtime.mjs';
import {createHostViewService} from '../../src/runtime/host-view-service.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {reduceCommand} from '../../src/data/state.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const NOW='2026-10-14T00:00:00Z',url='https://chatgpt.com/';
// Mock IndexedDB and explicitly authored provider response; no browser auth claim.
async function fixture(t,{prepareNavigation=null,presentSurface=null,selectionBridge=null,documentURL=url,elapsedNow=()=>performance.now()}={}){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'host-view-resume'});t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let n=0,seq=0,principal='fixture-principal',time=Date.parse(NOW),providerReads=0;
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:documentURL};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const service=createHostBindingService({elapsedNow,extensionId:'extension',prepareNavigation,presentSurface,selectionBridge,uiURLs,getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),getFrame:async()=>({documentId:sender.documentId,documentLifecycle:'active',url:documentURL}),allowedURL:value=>value===documentURL,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>{providerReads++;return {principalId:principal,expiresAt:new Date(time+3600000).toISOString(),contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'};}},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`token_${++n}`});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 let binding,bound;
 async function bind(){const hello=await request('HOST_HELLO');assert.equal(hello.ok,true);binding=hello.binding;const {documentToken,producerToken,routeEpoch}=binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'verified');bound=await request('BIND');assert.equal(bound.ok,true,JSON.stringify(bound));return bound;}
 async function observe(){
  const locator={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const candidate=(entity,id,name)=>({renderKey:`${entity}:${id}`,entity,nativeTitle:name,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`,liveHandle:null},evidence:locator});
  const result=await service.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[candidate('project','p1','Native Project'),candidate('conversation','c1','Native conversation')],membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]}},sender);assert.equal(result.state,'accepted',JSON.stringify(result));
 }
 let mountSerial=0,mountId='mount';const grants={};
 async function mount(){mountId='mount_'+(++mountSerial);const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...auth,mountId,regionEpoch:1},sender)).ok,true);for(const role of ['workspace','sidebar']){const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce_'+role,role},children[role]);const confirmed=await service.handle({v:1,type:'HOST_UI_CONFIRM',...auth,mountId,regionEpoch:1,nonce:'nonce_'+role,role},sender);assert.equal(confirmed.ok,true,JSON.stringify(confirmed));const result=await joined;assert.equal(result.ok,true,JSON.stringify(result));grants[role]=result.grant;}}
 const view=(role='workspace',query={},patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:grants[role].id,mountId,query,...patch},as);
 const present=(role,intent,patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_PRESENT',grantId:grants[role].id,mountId,intent,...patch},as);
 const enterCurrent=(role,extra={},as=children[role])=>service.handle({v:1,type:'HOST_UI_CURRENT_ENTRY',grantId:grants[role].id,mountId,...extra},as);
 const horizon=(role,extra={},as=children[role])=>service.handle({v:1,type:'HOST_UI_SET_HORIZON',grantId:grants[role].id,mountId,operationId:'set_horizon',expectedRevision:0,H:14,segment:0,anchorRefId:null,...extra},as);
 async function renew(){const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};const doc=await request('HOST_DOCUMENT_RENEW',auth);assert.equal(doc.ok,true,JSON.stringify(doc));binding=doc.binding;const refresh=await request('HOST_REFRESH',auth);const status=await service.handle({v:1,type:'HOST_UI_STATUS',...auth,mountId},sender);return {refresh,status};}
 return{get mountId(){return mountId;},enterCurrent,renew,get providerReads(){return providerReads;},horizon,present,base,workspaces,evidence,service,request,bind,observe,mount,view,grants,sender,children,setTime:value=>{time=value;},get bound(){return bound;},switchRoute(value){documentURL=value;sender.url=value;service.invalidate({tabId:1,documentId:'document'});},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function ready(h,role='workspace',query={}){
 for(let i=0;i<100;i++){const result=await h.view(role,query);if(result.state!=='preparing')return result;await drain();}
 assert.fail('bounded view preparation did not complete');
}

const layout={segment:3,oldOpen:[],sidebarOpen:[],capacities:[],scroll:123,sidebarScroll:0,sidebarVisible:true};
const resume=(h,role='workspace',extra={},sender=h.children[role])=>h.service.handle({v:1,type:'HOST_UI_RESUME',grantId:h.grants[role].id,mountId:h.mountId,...extra},sender);
const save=async(h,view=layout,role='workspace')=>{const prior=await resume(h,role);return h.service.handle({v:1,type:'HOST_UI_SAVE_VIEW',grantId:h.grants[role].id,mountId:h.mountId,view,expectedQuery:prior.resume?.query??{segment:3}},h.children[role]);};
async function boot(t,options){const h=await fixture(t,options);await h.bind();await h.observe();await h.mount();return h;}
test('same document and scope restores historical query/layout under new grants without public session authority',async t=>{
 const h=await fixture(t),boundary=new Date(NOW);boundary.setHours(23,59,59,0);h.setTime(boundary.getTime());await h.bind();await h.observe();await h.mount();const first=await ready(h,'workspace',{segment:3,offset:0,limit:8});assert.equal(first.state,'ready');
 assert.equal((await save(h)).ok,true);const oldGrant=h.grants.workspace.id;
 h.setTime(boundary.getTime()+2000);await h.bind();await h.mount();assert.notEqual(h.grants.workspace.id,oldGrant);
 const r=await resume(h);assert.equal(r.ok,true);assert(r.resume);assert.equal(r.resume.query.segment,3);assert.deepEqual(r.resume.view,layout);
 assert.deepEqual(Object.keys(r.resume).sort(),['query','view']);assert.equal(r.resume.session,undefined);
 const restored=await ready(h,'workspace',r.resume.query);assert.equal(restored.state,'ready',JSON.stringify(restored));assert.deepEqual(restored.page.viewSession,first.page.viewSession);
});
test('sidebar explicit disclosure choices survive new grants and are discarded on scope change',async t=>{
 const h=await boot(t);await ready(h,'sidebar',{segment:3});
 const view={...layout,sidebarOpen:['p1'],sidebarChoices:[['p1',true],['p2',false]]};
 assert.equal((await save(h,view,'sidebar')).ok,true);
 await h.bind();await h.mount();assert.deepEqual((await resume(h,'sidebar')).resume.view,view);
 assert.deepEqual(await resume(h,'workspace'),{ok:true,resume:null});
 h.switchPrincipal('other-account');await h.bind();await h.mount();
 assert.deepEqual(await resume(h,'sidebar'),{ok:true,resume:null});
});
test('new scope drops prior account resume and cannot retrieve it by switching back',async t=>{
 const h=await boot(t);await ready(h,'workspace',{segment:3});assert.equal((await save(h)).ok,true);
 h.switchPrincipal('other-account');await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
 h.switchPrincipal('fixture-principal');await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
});
test('workspace and sidebar resume records are separate and parent/spoofed scope requests reject',async t=>{
 const h=await boot(t);await ready(h,'workspace',{segment:3});assert.equal((await save(h)).ok,true);
 assert.deepEqual(await resume(h,'sidebar'),{ok:true,resume:null});
 assert.equal((await resume(h,'workspace',{scope:'forged'})).ok,false);
 assert.equal((await resume(h,'workspace',{},h.sender)).ok,false);
 assert.equal((await resume(h,'workspace',{},h.children.sidebar)).ok,false);
});
test('resume TTL expiry rejects retained historical state',async t=>{
 let elapsed=1000;const h=await boot(t,{elapsedNow:()=>elapsed});await ready(h,'workspace',{segment:3});assert.equal((await save(h)).ok,true);
 elapsed+=30*60*1000;await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
});
test('layout cannot inject session/scope and cannot write before a ready owner snapshot',async t=>{
 const h=await boot(t);assert.equal((await save(h)).ok,false);await ready(h,'workspace',{segment:3});
 for(const extra of [{scope:'forged'},{freeSession:{H:90,T:1,Z:'UTC',policyRevision:100}},{grantId:'forged'}])assert.equal((await save(h,{...layout,...extra})).ok,false);
});

test('clock rollback drops resume permanently and old UI grants cannot retrieve a replacement session',async t=>{
 let elapsed=1000;const h=await boot(t,{elapsedNow:()=>elapsed});await ready(h,'workspace',{segment:3});const old=h.grants.workspace.id,oldMount=h.mountId;
 elapsed=999;await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
 assert.equal((await h.service.handle({v:1,type:'HOST_UI_RESUME',grantId:old,mountId:oldMount},h.children.workspace)).ok,false);
 elapsed=1000;assert.deepEqual(await resume(h),{ok:true,resume:null});
});
test('late navigation response under revoked grant cannot replace or extend the saved query',async t=>{
 let hold=false,release,elapsed=1000;const h=await boot(t,{elapsedNow:()=>elapsed,prepareNavigation:async()=>{if(hold)await new Promise(r=>release=r);return [];}});
 await ready(h,'workspace',{segment:3});hold=true;const old=h.view('workspace',{segment:7});
 for(let i=0;i<100&&!release;i++)await drain();assert.equal(typeof release,'function');
 await h.bind();await h.mount();release();assert.equal((await old).ok,false);
 const r=await resume(h);assert.equal(r.resume.query.segment,3);
 elapsed+=1800000;assert.deepEqual(await resume(h),{ok:true,resume:null});
});
test('tab close and worker stop discard non-authority resume metadata',async t=>{
 for(const mode of ['tab','stop']){const h=await boot(t);await ready(h,'workspace',{segment:3});if(mode==='tab')h.service.tabClosed(1);else h.service.views.stop();
 if(mode==='tab'){await h.bind();await h.mount();}assert.deepEqual(await resume(h),{ok:true,resume:null});}
});

test('bounded resume cache isolates tabs/documents and evicts the oldest beyond 32 entries',async t=>{
 const h=await boot(t);await ready(h);const scope=h.service.authority.scopeFor({tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false});
 // Authorization double only for finite-cache cardinality; reads use the actual seeded repositories.
 let context,active=0;const contexts=[];
 const views=createHostViewService({ui:{withScope:async(args,work)=>work(context)},readService:h.service.readService,clock:()=>NOW});t.after(()=>views.stop());
 const get=()=>views.resume({v:1,type:'HOST_UI_RESUME',grantId:'grant',mountId:'mount'},{});
 for(let i=0;i<33;i++){
  active=i;context={scope,scopeGrantId:'scope',role:'workspace',parentFrame:{tabId:i+1,documentId:'doc_'+i,actualURL:url},isCurrent:()=>active===i};contexts.push(context);
  assert.deepEqual(await get(),{ok:true,resume:null},'different tab/document has no prior state');
  let r;for(let j=0;j<100;j++){r=await views.handle({v:1,type:'HOST_UI_VIEW',grantId:'grant',mountId:'mount_'+i,query:{segment:i+1}},{});if(r.state!=='preparing')break;await drain();}
  assert.equal(r.state,'ready',JSON.stringify(r));
 }
 active=0;context=contexts[0];assert.deepEqual(await get(),{ok:true,resume:null});
 active=1;context=contexts[1];assert.equal((await get()).resume.query.segment,2);
 active=32;context=contexts[32];assert.equal((await get()).resume.query.segment,33);
 context={...context,parentFrame:{...context.parentFrame,actualURL:'https://chatgpt.com/c/33333333-3333-4333-8333-333333333333'}};assert.equal((await get()).resume.query.segment,33,'same document retains presentation on SPA route');
 context={...context,parentFrame:{...context.parentFrame,documentId:'different-document'}};assert.deepEqual(await get(),{ok:true,resume:null});
});

test('ready query changing segment never reuses a different segment layout',async t=>{
 const h=await boot(t);await ready(h,'workspace',{segment:3});assert.equal((await save(h)).ok,true);
 assert.equal((await h.view('workspace',{segment:7})).state,'ready');
 const result=await resume(h);assert.equal(result.resume.query.segment,7);assert.equal(result.resume.view,null);
});
test('late authority callback after resume deadline cannot return metadata or save layout',async t=>{
 const h=await boot(t);await ready(h);const scope=h.service.authority.scopeFor({tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false});
 for(const type of ['HOST_UI_RESUME','HOST_UI_SAVE_VIEW']){
  let elapsed=0,hold=false,release,seq=0;const timers=new Map();
  const context={scope,scopeGrantId:'scope',role:'workspace',parentFrame:{tabId:1,documentId:'deadline_doc',actualURL:url},isCurrent:()=>true};
  const views=createHostViewService({ui:{async withScope(args,work){if(hold)await new Promise(resolve=>release=resolve);return work(context);}},readService:h.service.readService,clock:()=>NOW,elapsedNow:()=>elapsed,schedule:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:elapsed+ms});return id;},cancel:id=>timers.delete(id)});t.after(()=>views.stop());
  const base={v:1,grantId:'grant',mountId:'mount'};
  let page;for(let i=0;i<100;i++){page=await views.handle({...base,type:'HOST_UI_VIEW',query:{segment:3}},{});if(page.state!=='preparing')break;await drain();}assert.equal(page.state,'ready');
  assert.equal((await views.resume({...base,type:'HOST_UI_SAVE_VIEW',expectedQuery:{segment:3},view:layout},{})).ok,true);
  hold=true;const pending=views.resume({...base,type,...(type==='HOST_UI_SAVE_VIEW'?{expectedQuery:{segment:3},view:{...layout,scroll:999}}:{})},{});
  await drain();assert.equal(typeof release,'function');elapsed=6000;for(const [id,timer]of [...timers])if(timer.at<=elapsed){timers.delete(id);timer.fn();}
  assert.equal((await pending).ok,false);hold=false;release();await drain();
  const result=await views.resume({...base,type:'HOST_UI_RESUME'},{});assert.deepEqual(result.resume.view,layout,'late write must not replace the acknowledged layout');
 }
});

test('late SAVE cannot attach old layout to a newer same-segment query',async t=>{
 const h=await boot(t);await ready(h);const scope=h.service.authority.scopeFor({tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false});
 let holdNext=false,release;const context={scope,scopeGrantId:'scope',role:'workspace',parentFrame:{tabId:1,documentId:'late_layout',actualURL:url},isCurrent:()=>true};
 const views=createHostViewService({ui:{async withScope(args,work){if(holdNext){holdNext=false;await new Promise(resolve=>release=resolve);}return work(context);}},readService:h.service.readService,clock:()=>NOW});t.after(()=>views.stop());
 const base={v:1,grantId:'grant',mountId:'mount'},oldQuery={segment:3,offset:0,limit:8},newQuery={segment:3,offset:8,limit:8};
 let result;for(let i=0;i<100;i++){result=await views.handle({...base,type:'HOST_UI_VIEW',query:oldQuery},{});if(result.state!=='preparing')break;await drain();}assert.equal(result.state,'ready');
 holdNext=true;const pending=views.resume({...base,type:'HOST_UI_SAVE_VIEW',view:layout,expectedQuery:oldQuery},{});await drain();assert.equal(typeof release,'function');
 assert.equal((await views.handle({...base,type:'HOST_UI_VIEW',query:newQuery},{})).state,'ready');release();assert.equal((await pending).ok,false);
 const latest=await views.resume({...base,type:'HOST_UI_RESUME'},{});assert.deepEqual(latest.resume.query,newQuery);assert.equal(latest.resume.view,null);
});

test('authorized same-document P to C and Back restore nonzero query/scroll but never revive old grants',async t=>{
 const project='https://chatgpt.com/g/p1/project',conversation='https://chatgpt.com/c/c1',h=await boot(t,{documentURL:project}),query={segment:0,offset:32,limit:8},origin={...layout,segment:0,scroll:521};
 assert.equal((await ready(h,'workspace',query)).state,'ready');assert.equal((await save(h,origin)).ok,true);
 for(const next of [conversation,project]){
  const oldGrant=h.grants.workspace.id,oldMount=h.mountId;h.switchRoute(next);await h.bind();await h.mount();
  assert.notEqual(h.grants.workspace.id,oldGrant);assert.equal((await h.service.handle({v:1,type:'HOST_UI_RESUME',grantId:oldGrant,mountId:oldMount},h.children.workspace)).ok,false);
  assert.deepEqual(await resume(h),{ok:true,resume:{query,view:origin}});assert.deepEqual(await resume(h,'sidebar'),{ok:true,resume:null});
  assert.equal((await ready(h,'workspace',query)).state,'ready');assert.equal((await save(h,origin)).ok,true);
 }
 h.switchPrincipal('other-account');await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
 h.switchPrincipal('fixture-principal');await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
});

test('account round trip without intermediate view erases prior display state',async t=>{
 const h=await boot(t); await ready(h,'workspace',{segment:3});assert.equal((await save(h)).ok,true);
 h.switchPrincipal('other-account');await h.bind();await h.mount();
 h.switchPrincipal('fixture-principal');await h.bind();await h.mount();
 assert.deepEqual(await resume(h),{ok:true,resume:null});
});
test('other project route preserves layout only and recomputes current C',async t=>{
 const h=await boot(t,{documentURL:'https://chatgpt.com/c/c1'}),query={segment:0,offset:32,limit:8};
 const first=await ready(h,'workspace',query);assert.equal(first.page.current.refId,'c1');
 await save(h,{...layout,segment:0});
 const oldGrant=h.grants.workspace.id,oldMount=h.mountId;
 h.switchRoute('https://chatgpt.com/g/p2/project');await h.bind();await h.mount();
 assert.deepEqual((await resume(h)).resume.query,query);
 const fresh=await ready(h,'workspace',query);assert.equal(fresh.page.current.nativeUrl,'https://chatgpt.com/g/p2/project');assert.equal(fresh.page.current.refId,null);assert.equal(fresh.page.currentRef,null);
 assert.equal((await h.service.handle({v:1,type:'HOST_UI_VIEW',grantId:oldGrant,mountId:oldMount,query},h.children.workspace)).ok,false);
 assert.equal((await h.service.handle({v:1,type:'HOST_UI_SAVE_VIEW',grantId:oldGrant,mountId:oldMount,view:{...layout,segment:0},expectedQuery:query},h.children.workspace)).ok,false);
});
test('route resume read never extends TTL',async t=>{
 let elapsed=100;const h=await boot(t,{elapsedNow:()=>elapsed});await ready(h,'workspace',{segment:3});await save(h);
 elapsed+=1799999;h.switchRoute('https://chatgpt.com/c/c1');await h.bind();await h.mount();assert((await resume(h)).resume);
 elapsed++;assert.deepEqual(await resume(h),{ok:true,resume:null});
});

for(const kind of ['search','workingSet'])test(`${kind} query transitions preserve acknowledged layout before the delayed SAVE across native routes`,async t=>{
 const h=await boot(t),ordinary={segment:0,offset:0,limit:24},origin={...layout,segment:0,oldOpen:['p1'],capacities:[['p1:current',17]],scroll:521};
 await ready(h,'workspace',ordinary);assert.equal((await save(h,origin)).ok,true);
 const queries=kind==='search'?[{search:{query:'Native'}},{search:{query:'conversation',offset:1}},ordinary]:[{workingSet:{}},{workingSet:{offset:1}},ordinary];
 for(const [index,query]of queries.entries()){
  assert.equal((await ready(h,'workspace',query)).state,'ready');
  // Deliberately no SAVE or timer drain: routing wins the renderer's 100ms coalescing window.
  h.switchRoute(`https://chatgpt.com/c/route${index}`);await h.bind();await h.mount();
  assert.deepEqual(await resume(h),{ok:true,resume:{query,view:origin}});
  assert.equal((await ready(h,'workspace',query)).state,'ready');
 }
});
for(const change of [{offset:24},{limit:8},{segment:1}])test(`special query cannot inherit layout across workspace pagination ${JSON.stringify(change)}`,async t=>{
 const h=await boot(t);await ready(h,'workspace',{});assert.equal((await save(h,{...layout,segment:0})).ok,true);
 await ready(h,'workspace',{search:{query:'Native'},...change});assert.equal((await resume(h)).resume.view,null);
});
test('special query does not revive unacknowledged layout or accept delayed old-query SAVE',async t=>{
 const h=await boot(t),query={search:{query:'Native'}};await ready(h,'workspace',{});await ready(h,'workspace',query);
 assert.equal((await resume(h)).resume.view,null);
 assert.equal((await h.service.handle({v:1,type:'HOST_UI_SAVE_VIEW',grantId:h.grants.workspace.id,mountId:h.mountId,view:{...layout,segment:0},expectedQuery:{}},h.children.workspace)).ok,false);
 assert.equal((await resume(h)).resume.view,null);
});
for(const sameQuery of [false,true])test(`changed time-policy session drops acknowledged layout even with ${sameQuery?'identical':'special'} query`,async t=>{
 const h=await boot(t),first=await ready(h,'workspace',{});assert.equal((await save(h,{...layout,segment:0})).ok,true);
 const changed=await h.horizon('workspace',{expectedRevision:first.page.workspaceRevision,H:first.page.viewSession.H===14?7:14});assert.equal(changed.ok,true,JSON.stringify(changed));
 assert.equal((await ready(h,'workspace',sameQuery?{}:{search:{query:'Native'}})).state,'ready');assert.equal((await resume(h)).resume.view,null);
});

test('document replacement cannot resume old document display',async t=>{
 const h=await boot(t);await ready(h,'workspace',{segment:3});await save(h);
 h.service.invalidate({tabId:1,documentId:'document'});h.sender.documentId='replacement-document';await h.bind();await h.mount();
 assert.deepEqual(await resume(h),{ok:true,resume:null});
});

// Browser-event composition regression: direct service.invalidate(documentId) tests
// miss the worker's tab-wide invalidation on actual SPA history notifications.
test('real worker history event preserves display only while revoking old grants across P C Back',async t=>{
 const h=await boot(t),events=()=>({addListener(fn){this.listener=fn;},removeListener(){}});
 const chrome={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,getContexts:async()=>[],onMessage:events(),onConnect:events()},webNavigation:{getFrame:async()=>null,onCommitted:events(),onHistoryStateUpdated:events()},tabs:{sendMessage:async()=>({ok:true}),onRemoved:events()}};
 const worker=createHostWorkerRuntime({chrome,indexedDB:new MockIDBFactory(),serviceFactory:()=>h.service});t.after(()=>worker.stop());
 const query={segment:0,offset:32,limit:8},origin={...layout,segment:0,scroll:521};
 await ready(h,'workspace',query);assert.equal((await save(h,origin)).ok,true);
 for(const route of ['https://chatgpt.com/c/11111111-1111-4111-8111-111111111111','https://chatgpt.com/g/g-p-11111111111111111111111111111111/project']){
  h.switchRoute(route);chrome.webNavigation.onHistoryStateUpdated.listener({tabId:1,frameId:0,documentId:'document',url:route});
  assert.equal((await resume(h)).ok,false,'old grant revoked synchronously');
  await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:{query,view:origin}});
  await ready(h,'workspace',query);assert.equal((await save(h,origin)).ok,true);
 }
 // No renderer query can opt into this: only the internal browser event path.
 for(const details of [{documentId:undefined},{documentId:''},{documentId:'other-document'},{documentId:'document',url:'https://outside.example/'}]){
  chrome.webNavigation.onHistoryStateUpdated.listener({tabId:1,frameId:0,url:'https://chatgpt.com/',...details});
  assert.equal((await resume(h)).ok,false);await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
  await ready(h,'workspace',query);assert.equal((await save(h,origin)).ok,true);
 }
 chrome.webNavigation.onCommitted.listener({tabId:1,frameId:0,documentId:'document',url:'https://chatgpt.com/'});
 assert.equal((await resume(h)).ok,false);await h.bind();await h.mount();assert.deepEqual(await resume(h),{ok:true,resume:null});
});
