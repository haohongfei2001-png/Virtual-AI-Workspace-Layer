import {loadFreeHeader} from '../../src/data/free-header-loader.mjs';
import {freshInstallationRecord} from '../../src/data/free-policy-initialization.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockIDBFactory} from '../b23/mock-idb.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {WorkspaceRepository} from '../../src/data/repository.mjs';
import {FreeEvidenceRepository} from '../../src/data/free-evidence-repository.mjs';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createFreeReadService} from '../../src/runtime/free-read-service.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
import {emptyState} from '../../src/data/state.mjs';
const NOW='2026-10-14T00:00:00Z',url='https://chatgpt.com/';
// MOCK_IDB + explicit test identity provider. This exercises real owner admission,
// not real browser/session authentication or a live ChatGPT observation.
async function fixture(t){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'production-free-read'});
 t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW,evidenceGate:()=> 'synthetic'});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let sequence=0;
 const sender={id:'ext',tab:{id:1},frameId:0,documentId:'doc',documentLifecycle:'active',url};
 const frame={tabId:1,frameId:0,documentId:'doc',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false};
 const profile={id:'test-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:id=>id,projectId:({container})=>container}})};
 const owner=createHostBindingService({repository:base,workspaceRepository:workspaces,extensionId:'ext',getFrame:async()=>({documentId:'doc',url,documentLifecycle:'active'}),allowedURL:actual=>actual===url,provider:{read:async()=>({principalId:'fixture-user',expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'test-only',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>Date.parse(NOW),makeId:()=>`id_${++sequence}`});
 const hello=await owner.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),binding=hello.binding;
 assert.equal((await owner.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch},sender)).state,'verified');
 const scope=owner.authority.scopeFor(frame),native=owner.nativeRepository;
 const read=createFreeReadService({repository:base,workspaces,native,evidence,clock:()=>NOW,timeZone:'UTC'});
 const observe=async()=>{
  const locator={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const candidate=(entity,id,name)=>({renderKey:`${entity}:${id}`,entity,nativeTitle:name,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`,liveHandle:null},evidence:locator});
  const result=await owner.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[candidate('project','p1','Native project name'),candidate('conversation','c1','Native conversation title')],membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'missing-membership',evidence:locator}],coverageClaims:[],detachedHandles:[]}},sender);
  assert.equal(result.state,'accepted',JSON.stringify(result));
 };
 const page=async(now=NOW)=>{const header=await read.freeHeader(scope,{},now,'UTC');return{header,page:await read.freePage(scope,{revision:header.revision,ids:{projects:Object.keys(header.manifest.projectVersions),refs:Object.keys(header.manifest.refVersions)},viewSession:header.viewSession,now},{})};};
 return{base,workspaces,evidence,native,read,scope,observe,page};
}

test('MOCK_IDB default read adds no scoped data after atomic database creation',async t=>{
 const h=await fixture(t),db=await h.base.open();
 const header=await h.read.freeHeader(h.scope,{},NOW,'UTC',null,url,true);
 assert.equal(header.preparing,undefined);assert.equal(header.revision,0);assert.deepEqual(header.manifest.projectVersions,{});assert.deepEqual(header.manifest.refVersions,{});
 const page=await h.read.freePage(h.scope,{revision:0,ids:{projects:[],refs:[]},viewSession:header.viewSession,now:NOW},{});
 assert.deepEqual(page.projects,[]);assert.deepEqual(page.refs,[]);
 let nativeReads=0;const original=h.native.read.bind(h.native);h.native.read=async(...args)=>{nativeReads++;return original(...args);};
 assert.deepEqual((await h.read.freeSnapshot(h.scope,{},NOW)).refs,[]);assert.equal(nativeReads,1,'compatibility snapshot reads native facts once');
 for(const name of db.objectStoreNames){const rows=await new Promise(resolve=>{const tx=db.transaction(name),request=tx.objectStore(name).openCursor(),values=[];request.onsuccess=()=>{const cursor=request.result;if(cursor){values.push(cursor.value);cursor.continue();}};tx.oncomplete=()=>resolve(values);});assert.deepEqual(rows,name==='b23_views'?[freshInstallationRecord()]:[],name+' must retain only its creation metadata');}
});

test('MOCK_IDB owner-admitted native names and UNKNOWN flow through the existing page pipeline',async t=>{
 const h=await fixture(t);await h.observe();const {header,page}=await h.page();
 assert.equal(page.projects[0].nativeName,'Native project name');assert.equal(page.refs[0].nativeTitle,'Native conversation title');assert.equal(page.refs[0].membership,'UNKNOWN');assert.equal(page.refs[0].projectId,null);
 assert.equal(page.refs[0].activityDecision.basis,'undated');assert.equal(header.evaluatedAt,NOW);assert.equal(header.inventoryComplete,false);
 assert.equal(Object.values((await h.native.read(h.scope)).sources)[0].channel,'host-dom');
});

test('MOCK_IDB old synthetic shared events never acquire production authorship',async t=>{
 const h=await fixture(t),state=emptyState(h.scope);state.revision=1;state.channel='synthetic';
 state.refs.c1={id:'c1',nativeUrl:'https://chatgpt.com/c/c1',projectId:null,nativeTitle:'Old native title',available:true};
 state.sources.old={id:'old',trustLevel:'synthetic',revoked:false,channel:'synthetic',description:'Explicit fixture-authored historical row',observedAt:NOW};
 state.events.e1={id:'e1',conversationId:'c1',sourceId:'old',messageId:'message-old',branchId:'main',revoked:false,observedAt:NOW,sentAt:NOW,precision:'second',role:'user',kind:'new-send',sendState:'committed',actorVerified:true,actorScopeKey:h.scope.key};
 assert.equal((await h.workspaces.initialize(h.scope,state)).ok,true);await h.observe();
 const before=await h.workspaces.read(h.scope),stored=await h.evidence.read(h.scope);
 assert.equal(h.read.activityEvidence(h.scope,before.state,stored).events.e1.actorVerified,false);
 assert.equal((await h.page()).page.refs[0].activityDecision.basis,'undated');
 assert.deepEqual(await h.workspaces.read(h.scope),before,'projection must not rewrite the historical event');
});

test('MOCK_IDB header/page use the same explicit evaluation time for expired native witnesses',async t=>{
 const h=await fixture(t);await h.observe();const initialFacts=await h.native.read(h.scope),expiry=Object.values(initialFacts.sources)[0].validUntil;
 const current=await h.page(NOW),facts=await h.native.read(h.scope);assert.equal(current.page.projects.length,1);assert.equal(current.page.refs[0].nativeTitle,'Native conversation title');
 const expired=await h.page(expiry);assert.equal(expired.header.evaluatedAt,expiry);assert.deepEqual(expired.header.sourceAuthorities,current.header.sourceAuthorities,'TTL expiry is not source revocation');assert.equal(expired.header.inventoryComplete,false);assert.equal(expired.page.projects[0].nativeName,'Native project name');assert.equal(expired.page.projects[0].freshness,'last-known');assert.equal(expired.page.projects[0].membershipWitnessCurrent,false);assert.equal(expired.page.projects[0].membershipComplete,false);assert.equal(expired.page.refs[0].nativeTitle,'Native conversation title');assert.equal(expired.page.refs[0].freshness,'last-known');assert.equal(expired.page.refs[0].membership,'UNKNOWN');assert.deepEqual(await h.native.read(h.scope),facts);
});

test('MOCK_IDB Free header/page/snapshot do not modify Pro human assets or project them as native cards',async t=>{
 const h=await fixture(t);assert.equal((await h.workspaces.command(h.scope,{operationId:'human-create',expectedRevision:0,command:{type:'CREATE_WORKSPACE',id:'human',name:'Preserved Pro manual theme'}})).ok,true);
 await h.observe();const before=await h.workspaces.read(h.scope);
 const {page}=await h.page();const snapshot=await h.read.freeSnapshot(h.scope,{},NOW);
 assert.deepEqual(page.projects.map(p=>p.nativeName),['Native project name']);assert.deepEqual(snapshot.projects.map(p=>p.nativeName),['Native project name']);
 assert.deepEqual(await h.workspaces.read(h.scope),before);assert.equal(before.state.workspaces.human.name,'Preserved Pro manual theme');
});

// The legacy snapshot endpoint must not disagree with the same-now staged path.
test('MOCK_IDB compatibility snapshot honors the requested native freshness time',async t=>{
 const h=await fixture(t);await h.observe();const expiry=Object.values((await h.native.read(h.scope)).sources)[0].validUntil;
 const {page}=await h.page(expiry),snapshot=await h.read.freeSnapshot(h.scope,{},expiry,'UTC');
 assert.deepEqual(snapshot.projects.map(p=>p.id),page.projects.map(p=>p.id));
 assert.equal(snapshot.refs[0].nativeTitle,page.refs[0].nativeTitle);
});

async function storedBytes(base){
 const db=await base.open(),result={};
 for(const name of db.objectStoreNames)result[name]=await new Promise((resolve,reject)=>{
  const tx=db.transaction(name),rows=[],request=tx.objectStore(name).openCursor();
  request.onsuccess=()=>{const cursor=request.result;if(cursor){rows.push(cursor.value);cursor.continue();}};
  tx.oncomplete=()=>resolve(JSON.stringify(rows));tx.onabort=()=>reject(tx.error);
 });
 return result;
}
// Real repository transactions over MOCK_IDB, deliberately persisted synthetic
// source data. This does not claim browser IDB or authenticated send evidence.
async function persistSynthetic(h,sourceId,table,row){
 const writer=new FreeEvidenceRepository({baseRepository:h.base,clock:()=>NOW,observationGate:()=>({channel:'synthetic',sourceId,generation:'fixture'})});
 const prior=await writer.read(h.scope),batch={sources:[{id:sourceId,generation:'fixture',sourceRevision:1,observedAt:NOW,validUntil:'2026-10-15T00:00:00Z',channel:'synthetic'}],events:[],hints:[],coverage:[]};
 batch[table]=[{id:sourceId+'_row',sourceId,generation:'fixture',sourceRevision:1,observedAt:NOW,conversationId:'c1',...row}];
 const result=await writer.apply(h.scope,{operationId:sourceId+'_seed',expectedRevision:prior.revision,batch});
 assert.equal(result.ok,true,JSON.stringify(result));
}
const send=(scope,sentAt)=>({messageId:'fixture_message',branchId:'main',actorVerified:true,actorScopeKey:scope.key,role:'user',kind:'new-send',sendState:'committed',sentAt,precision:'second'});
for(const kind of ['event','hint'])test(`MOCK_IDB production rejects persisted synthetic ${kind} without altering historical bytes`,async t=>{
 const h=await fixture(t);await h.observe();
 await persistSynthetic(h,'legacy',kind==='event'?'events':'hints',kind==='event'?send(h.scope,NOW):{eventKey:'fixture_hint',hintType:'local-confirmed-send',actorVerified:true,actorScopeKey:h.scope.key,validUntil:'2026-10-15T00:00:00Z',candidateInterval:{from:NOW,through:NOW}});
 // Finish only the existing schema/index migrations before comparing bytes.
 await h.page();const before=await storedBytes(h.base),stored=await h.evidence.read(h.scope),state=(await h.workspaces.read(h.scope)).state;
 assert.deepEqual(h.read.activityEvidence(h.scope,state,stored).sources,{});
 assert.equal((await h.page()).page.refs[0].activityDecision.basis,'undated');
 assert.equal((await h.read.freeSnapshot(h.scope,{},NOW)).refs[0].activityDecision.basis,'undated');
 const fixtureRead=createFreeReadService({repository:h.base,workspaces:h.workspaces,native:h.native,evidence:h.evidence,clock:()=>NOW,admitActivitySource:(_scope,source)=>source.channel==='synthetic'});
 assert.equal((await fixtureRead.freeSnapshot(h.scope,{},NOW)).refs[0].activityDecision.basis,kind==='event'?'exact':'provisional','explicit fixture composition proves the stored evidence is usable');
 assert.deepEqual(await storedBytes(h.base),before,'all eight stores retain their historical serialized rows');
});

test('MOCK_IDB unadmitted synthetic coverage cannot certify an admitted historical anchor',async t=>{
 const h=await fixture(t);await h.observe();const historical='2026-08-01T00:00:00Z';
 await persistSynthetic(h,'anchor','events',send(h.scope,historical));
 await persistSynthetic(h,'legacy_coverage','coverage',{from:historical,through:NOW,completeness:'complete',branches:'all',gaps:[]});
 await h.page();const before=await storedBytes(h.base);
 assert.equal((await h.page()).page.refs[0].activityDecision.basis,'undated','default production admits neither synthetic source');
 const composition=admitActivitySource=>createFreeReadService({repository:h.base,workspaces:h.workspaces,native:h.native,evidence:h.evidence,clock:()=>NOW,admitActivitySource});
 // Explicit test-only admission of one anchor isolates coverage rejection from
 // send rejection; channel strings alone never enable production admission.
 const partial=await composition((_scope,source)=>source.id==='anchor').freeSnapshot(h.scope,{},NOW);
 assert.equal(partial.refs[0].activityDecision.basis,'provisional');
 assert.equal(partial.refs[0].activityDecision.reason,'historical-anchor-incomplete');
 const admitted=await composition((_scope,source)=>source.channel==='synthetic').freeSnapshot(h.scope,{},NOW);
 assert.equal(admitted.refs[0].activityDecision.basis,'exact');assert.equal(admitted.refs[0].activityDecision.reason,'covered-history');
 assert.deepEqual(await storedBytes(h.base),before);
});

test('MOCK_IDB initialization CAS loss is a retryable snapshot conflict, not fake preparation progress',async t=>{
 const h=await fixture(t),initialize=h.workspaces.initializeFreeTimePolicy.bind(h.workspaces);
 h.workspaces.initializeFreeTimePolicy=async(scope,request,options)=>{h.workspaces.initializeFreeTimePolicy=initialize;assert.equal((await h.workspaces.command(scope,{operationId:'human-before-init',expectedRevision:request.expectedRevision,command:{type:'CREATE_WORKSPACE',id:'manual',name:'Human intent'}})).ok,true);return initialize(scope,request,options);};
 const read=createFreeReadService({repository:h.base,workspaces:h.workspaces,native:h.native,evidence:h.evidence,clock:()=>NOW,timeZone:'UTC',initializeTimePolicy:true});
 await assert.rejects(read.freeHeader(h.scope,{},NOW,'UTC',null,url,true),/snapshot-revision-changed/);
 const stages=[];const final=await loadFreeHeader({scope:()=>h.scope.key,load:async()=>{const header=await read.freeHeader(h.scope,{},NOW,'UTC',null,url,true);if(header.preparing)stages.push(header.preparing.stage);return {ok:true,header};}});
 assert.deepEqual(stages,['free-policy']);assert.equal(final.header.preferences.freeTimePolicy.value.mode,'auto');assert.equal((await h.workspaces.read(h.scope)).state.workspaces.manual.name,'Human intent');
});
