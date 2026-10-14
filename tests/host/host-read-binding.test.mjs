import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {loadFreeHeader} from '../../src/data/free-header-loader.mjs';
const NOW='2026-10-14T00:00:00Z',url='https://chatgpt.com/';
// Mock IndexedDB and explicitly authored provider response; no browser auth claim.
async function fixture(t){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'host-read-binding'});t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let n=0,seq=0,principal='fixture-principal';
 const sender={id:'extension',tab:{id:1},frameId:0,documentId:'document',documentLifecycle:'active',url};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const service=createHostBindingService({extensionId:'extension',getFrame:async()=>({documentId:'document',documentLifecycle:'active',url}),allowedURL:value=>value===url,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>({principalId:principal,expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>Date.parse(NOW),makeId:()=>`token_${++n}`});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 let binding,bound;
 async function bind(){const hello=await request('HOST_HELLO');assert.equal(hello.ok,true);binding=hello.binding;const {documentToken,producerToken,routeEpoch}=binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'verified');bound=await request('BIND');assert.equal(bound.ok,true,JSON.stringify(bound));return bound;}
 const stages=[];
 async function read(){const result=await loadFreeHeader({scope:()=>bound.scope,load:async()=>{const reply=await request('B23_FREE_HEADER',{leaseId:bound.leaseId,now:NOW,timeZone:'UTC',size:8,staged:true});if(reply.header?.preparing)stages.push(reply.header.preparing.stage);return reply;}}),header=result.header;
  const reply=await request('B23_FREE_PAGE',{leaseId:bound.leaseId,revision:header.revision,offset:0,limit:5000,ids:{projects:Object.keys(header.manifest.projectVersions),refs:Object.keys(header.manifest.refVersions)},viewSession:header.viewSession,now:NOW});assert.equal(reply.ok,true,JSON.stringify(reply));
  const check=await request('CHECK',{leaseId:bound.leaseId});assert.equal(check.ok,true);assert.equal(check.nativeRevision,header.revision);assert.equal(check.revision,header.workspaceRevision);assert.equal(check.evidenceRevision,header.evidenceRevision);return{header,page:reply.page};
 }
 async function observe(){
  const locator={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const candidate=(entity,id,name)=>({renderKey:`${entity}:${id}`,entity,nativeTitle:name,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`,liveHandle:null},evidence:locator});
  const result=await service.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[candidate('project','p1','Native Project'),candidate('conversation','c1','Native conversation')],membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]}},sender);assert.equal(result.state,'accepted',JSON.stringify(result));
 }
 return{base,workspaces,evidence,service,request,bind,read,observe,stages,get bound(){return bound;},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
}
test('MOCK_IDB HELLO refresh BIND reads empty production HEADER/PAGE without seed',async t=>{
 const h=await fixture(t);assert.equal((await h.request('BIND')).ok,false);await h.bind();const {header,page}=await h.read();assert.equal(header.revision,0);assert.deepEqual(page.refs,[]);assert.deepEqual(page.projects,[]);assert.deepEqual(h.stages,['free-policy']);assert.equal(header.workspaceRevision,1);assert.deepEqual(Object.keys(header.preferences),['freeTimePolicy']);assert.equal(header.preferences.freeTimePolicy.owner,'bootstrap');assert.equal(header.preferences.freeTimePolicy.value.mode,'auto');assert.equal(header.preferences.freeTimePolicy.value.H,30);
 const db=await h.base.open();for(const storeName of db.objectStoreNames){const count=await new Promise(resolve=>{let n=0;const tx=db.transaction(storeName),q=tx.objectStore(storeName).openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){n++;cursor.continue();}};tx.oncomplete=()=>resolve(n);});assert.equal(count,({b23_states:1,b23_operations:1,b23_views:2})[storeName]??0,storeName+' contains only policy initialization, never native seeds');}
});
test('MOCK_IDB admitted observations are reachable through real staged broker read composition',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();const {header,page}=await h.read();assert.deepEqual(h.stages,['native-index-build','native-index','free-policy']);assert.equal(header.scope,h.bound.scope);assert.deepEqual(page.projects.map(p=>p.nativeName),['Native Project']);assert.equal(page.refs[0].nativeTitle,'Native conversation');assert.equal(page.refs[0].membership,'UNKNOWN');assert.equal(page.refs[0].activityDecision.basis,'undated');
 const snapshot=await h.request('B23_FREE_SNAPSHOT',{leaseId:h.bound.leaseId,now:NOW,timeZone:'UTC',size:8});assert.equal(snapshot.ok,true);assert.equal(snapshot.snapshot.refs[0].nativeTitle,'Native conversation');
});
test('MOCK_IDB revoked lease cannot read and a new principal receives an empty scope',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.read();const old={...h.bound};h.switchPrincipal('second-fixture-principal');
 assert.equal((await h.request('B23_FREE_HEADER',{leaseId:old.leaseId,now:NOW,timeZone:'UTC',size:8,staged:true})).ok,false);
 await h.bind();assert.notEqual(h.bound.scope,old.scope);const {header,page}=await h.read();assert.equal(header.revision,0);assert.deepEqual(page.refs,[]);
 h.switchPrincipal('fixture-principal');await h.bind();assert.equal(h.bound.scope,old.scope);assert.equal((await h.read()).page.refs[0].nativeTitle,'Native conversation');
});
