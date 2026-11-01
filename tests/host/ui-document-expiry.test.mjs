import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const NOW='2026-10-14T00:00:00Z',url='https://chatgpt.com/';
// Mock IndexedDB and explicitly authored provider response; no browser auth claim.
async function fixture(t,{prepareNavigation=null}={}){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'host-read-binding'});t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let n=0,seq=0,principal='fixture-principal',time=Date.parse(NOW);
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const service=createHostBindingService({extensionId:'extension',prepareNavigation,uiURLs,getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),getFrame:async()=>({documentId:'document',documentLifecycle:'active',url}),allowedURL:value=>value===url,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>({principalId:principal,expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`token_${++n}`});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 let binding,bound;
 async function bind(){const hello=await request('HOST_HELLO');assert.equal(hello.ok,true);binding=hello.binding;const {documentToken,producerToken,routeEpoch}=binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'verified');bound=await request('BIND');assert.equal(bound.ok,true,JSON.stringify(bound));return bound;}
 async function observe(){
  const locator={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const candidate=(entity,id,name)=>({renderKey:`${entity}:${id}`,entity,nativeTitle:name,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`,liveHandle:null},evidence:locator});
  const result=await service.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[candidate('project','p1','Native Project'),candidate('conversation','c1','Native conversation')],membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]}},sender);assert.equal(result.state,'accepted',JSON.stringify(result));
 }
 const grants={};
 async function mount(){const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...auth,mountId:'mount',regionEpoch:1},sender)).ok,true);for(const role of ['workspace','sidebar']){const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce_'+role,role},children[role]);const confirmed=await service.handle({v:1,type:'HOST_UI_CONFIRM',...auth,mountId:'mount',regionEpoch:1,nonce:'nonce_'+role,role},sender);assert.equal(confirmed.ok,true,JSON.stringify(confirmed));const result=await joined;assert.equal(result.ok,true,JSON.stringify(result));grants[role]=result.grant;}}
 const view=(role='workspace',query={},patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:grants[role].id,mountId:'mount',query,...patch},as);
 return{base,workspaces,evidence,service,request,bind,observe,mount,view,grants,sender,children,setTime:value=>{time=value;},get binding(){return binding;},get bound(){return bound;},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function ready(h,role='workspace'){
 for(let i=0;i<100;i++){const result=await h.view(role);if(result.state!=='preparing')return result;await drain();}
 assert.fail('bounded view preparation did not complete');
}

async function renewUI(h,role='workspace'){
 const result=await h.service.handle({v:1,type:'HOST_UI_RENEW',grantId:h.grants[role].id,mountId:'mount'},h.children[role]);
 if(result.ok)h.grants[role]=result.grant;return result;
}
const documentTokens=h=>Object.fromEntries(['documentToken','producerToken','routeEpoch'].map(key=>[key,h.binding[key]]));
test('MOCK_IDB valid 60-second scope cannot authorize frame renewal or view after parent document lease expires',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();assert.equal((await ready(h)).state,'ready');
 const start=Date.parse(NOW);h.setTime(start+10000);
 for(const role of ['workspace','sidebar']){const result=await renewUI(h,role);assert.equal(result.ok,true);assert.equal(Date.parse(result.grant.expiresAt),start+30000);}
 h.setTime(start+20000);
 const frame={tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
 assert.equal(h.service.authority.peek(frame).state,'verified','independent scope remains valid');
 for(const role of ['workspace','sidebar']){
  assert(Date.parse(h.grants[role].expiresAt)>start+20000,'UI grant itself is not expired');
  assert.equal((await renewUI(h,role)).ok,false,'UI heartbeat cannot renew expired parent authority');
  const view=await h.view(role);assert.equal(view.ok,false);assert.equal(view.page,undefined);
 }
});
test('MOCK_IDB same-identity document renewal permits both UI frames beyond original document expiry',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();assert.equal((await ready(h)).state,'ready');
 const old={...h.binding},start=Date.parse(NOW);h.setTime(start+10000);
 const renewed=await h.request('HOST_DOCUMENT_RENEW',documentTokens(h));assert.equal(renewed.ok,true,JSON.stringify(renewed));
 for(const key of ['documentToken','producerToken','routeEpoch','browserDocumentId','origin'])assert.equal(renewed.binding[key],old[key]);assert.equal(Date.parse(renewed.binding.expiresAt),start+30000);
 for(const role of ['workspace','sidebar'])assert.equal((await renewUI(h,role)).ok,true);
 h.setTime(start+20000);
 for(const role of ['workspace','sidebar']){assert.equal((await renewUI(h,role)).ok,true);const view=await ready(h,role);assert.equal(view.state,'ready',JSON.stringify(view));assert.equal(view.page.entries.unknown.items[0].nativeTitle,'Native conversation');}
 h.setTime(start+30000);assert.equal((await renewUI(h)).ok,false,'a prior successful document renewal is still bounded');assert.equal((await h.view()).ok,false);
});
test('MOCK_IDB parent document expiry rejects late action plans without blocking prior VIEW',async t=>{
 let entered=false,release;const wait=new Promise(resolve=>release=resolve);
 const h=await fixture(t,{prepareNavigation:async()=>{entered=true;await wait;return [];}});await h.bind();await h.observe();await h.mount();
 const start=Date.parse(NOW);h.setTime(start+10000);assert.equal((await renewUI(h)).ok,true);
 const visible=await ready(h);assert.equal(visible.state,'ready');assert.equal(entered,false,'data does not wait for actions');
 const pending=h.service.handle({v:1,type:'HOST_UI_NAVIGATION_PLANS',grantId:h.grants.workspace.id,mountId:'mount',deliveryId:visible.deliveryId},h.children.workspace);for(let i=0;i<100&&!entered;i++)await drain();assert.equal(entered,true);
 h.setTime(start+20000);release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.page,undefined);assert.equal(result.navigation,undefined);
});

test('MOCK browser frame checks permit only renewal replacement during in-flight grant validation',async()=>{
 const {createUiGrants}=await import('../../src/host/ui-grants.mjs');
 for(const revoke of [false,true]){
  let checks=0,held=false,release;const barrier=new Promise(resolve=>release=resolve);
  const parent={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'parent',documentLifecycle:'active',url};
  const child={...parent,frameId:1,documentId:'child',url:'chrome-extension://extension/ui.html'};
  const grants=createUiGrants({extensionId:'extension',uiURL:child.url,now:()=>1000,makeId:()=> 'grant',peekScope:()=>({state:'verified',grant:{id:'scope',scopeKey:'scope_key',scopeEpoch:1,expiresAt:new Date(60000).toISOString()}}),getFrame:async({frameId})=>{if(held&&checks++<2)await barrier;return {documentId:frameId?'child':'parent',url:frameId?child.url:url,parentFrameId:frameId?0:-1,documentLifecycle:'active'};}});
  grants.registerMount({handle:{id:'mount',documentToken:'token',regionEpoch:1},parent});await grants.joinUI({sender:child,nonce:'nonce',role:'workspace'});
  const grant=await grants.confirmParent({sender:parent,mountId:'mount',documentToken:'token',regionEpoch:1,nonce:'nonce',role:'workspace'}),args={sender:child,grantId:grant.id,mountId:'mount'};
  held=true;const checking=grants.validate(args),result=Promise.allSettled([checking]);
  const renewed=await grants.renew(args);assert.notEqual(renewed,grant);
  if(revoke)grants.revokeMount('mount');release();const [row]=await result;
  if(revoke){assert.equal(row.status,'rejected');assert.match(row.reason.message,/ui-grant-revoked/);}else{assert.equal(row.status,'fulfilled');assert.equal(row.value,renewed);}
 }
});
