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
async function fixture(t,{prepareNavigation=null,presentSurface=null,selectionBridge=null,documentURL=url,elapsedNow=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'host-read-binding'});t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let n=0,seq=0,principal='fixture-principal',time=Date.parse(NOW),providerReads=0;
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:documentURL};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const service=createHostBindingService({elapsedNow,schedule,cancel,extensionId:'extension',prepareNavigation,presentSurface,selectionBridge,uiURLs,getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),getFrame:async()=>({documentId:'document',documentLifecycle:'active',url:documentURL}),allowedURL:value=>value===documentURL,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>{providerReads++;return {principalId:principal,expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'};}},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`token_${++n}`});
 const request=(type,extra={})=>service.handle({v:1,type,clientId:'client',seq:++seq,...extra},sender);
 let binding,bound;
 async function bind(){const hello=await request('HOST_HELLO');assert.equal(hello.ok,true);binding=hello.binding;const {documentToken,producerToken,routeEpoch}=binding;assert.equal((await request('HOST_REFRESH',{documentToken,producerToken,routeEpoch})).state,'verified');bound=await request('BIND');assert.equal(bound.ok,true,JSON.stringify(bound));return bound;}
 let observationSeq=0;
 async function observe(projectIds=null){
  const locator={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
  const candidate=(entity,id,name)=>({renderKey:`${entity}:${id}`,entity,nativeTitle:name,titleState:'exact',target:{kind:'resolved',entity,nativeId:id,navigationURL:entity==='project'?`https://chatgpt.com/g/${id}/project`:`https://chatgpt.com/c/${id}`,liveHandle:null},evidence:locator});
  const result=await service.handle({protocol:'vaiwl-host-observation/1',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,localSeq:++observationSeq,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[...(projectIds?projectIds.map(id=>candidate('project',id,'Same native name')):[candidate('project','p1','Native Project')]),candidate('conversation','c1','Native conversation')],membershipClaims:[{conversationId:'c1',asserted:'UNKNOWN',projectId:null,reason:'not-observed',evidence:locator}],coverageClaims:[],detachedHandles:[]}},sender);assert.equal(result.state,'accepted',JSON.stringify(result));
 }
 const grants={};
 async function mount(){const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...auth,mountId:'mount',regionEpoch:1},sender)).ok,true);for(const role of ['workspace','sidebar']){const joined=service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce_'+role,role},children[role]);const confirmed=await service.handle({v:1,type:'HOST_UI_CONFIRM',...auth,mountId:'mount',regionEpoch:1,nonce:'nonce_'+role,role},sender);assert.equal(confirmed.ok,true,JSON.stringify(confirmed));const result=await joined;assert.equal(result.ok,true,JSON.stringify(result));grants[role]=result.grant;}}
 const view=(role='workspace',query={},patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:grants[role].id,mountId:'mount',query,...patch},as);
 const present=(role,intent,patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_PRESENT',grantId:grants[role].id,mountId:'mount',intent,...patch},as);
 const enterCurrent=(role,extra={},as=children[role])=>service.handle({v:1,type:'HOST_UI_CURRENT_ENTRY',grantId:grants[role].id,mountId:'mount',...extra},as);
 const horizon=(role,extra={},as=children[role])=>service.handle({v:1,type:'HOST_UI_SET_HORIZON',grantId:grants[role].id,mountId:'mount',operationId:'set_horizon',expectedRevision:0,H:14,segment:0,anchorRefId:null,...extra},as);
 async function renew(){const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};const doc=await request('HOST_DOCUMENT_RENEW',auth);assert.equal(doc.ok,true,JSON.stringify(doc));binding=doc.binding;const refresh=await request('HOST_REFRESH',auth);const status=await service.handle({v:1,type:'HOST_UI_STATUS',...auth,mountId:'mount'},sender);return {refresh,status};}
 const pass=(phase='start',passSeq=1,patch={})=>service.handle({v:1,type:'HOST_INGESTION_PASS',documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch,profileId:profile.id,profileVersion:profile.revision,passSeq,phase,...patch},sender);
 return{pass,enterCurrent,renew,get providerReads(){return providerReads;},horizon,present,base,workspaces,evidence,service,request,bind,observe,mount,view,grants,sender,children,setTime:value=>{time=value;},get bound(){return bound;},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function ready(h,role='workspace'){
 for(let i=0;i<100;i++){const result=await h.view(role);if(result.state!=='preparing')return result;await drain();}
 assert.fail('bounded view preparation did not complete');
}
test('MOCK_IDB actual host binding and two UI grants share one native read preparation',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();
 const native=h.service.nativeRepository,original=native.page.bind(native);let pages=0,release;
 const held=new Promise(resolve=>release=resolve);native.page=async(...args)=>{pages++;await held;return original(...args);};
 const first=await h.view('workspace');assert.equal(first.state,'preparing');
 for(let i=0;i<50&&!pages;i++)await drain();assert.equal(pages,1);
 assert.equal((await h.view('sidebar')).state,'preparing');assert.equal(pages,1,'second role joins the same pending owner');
 release();const workspace=await ready(h),sidebar=await ready(h,'sidebar');
 assert.equal(workspace.state,'ready',JSON.stringify(workspace));assert.equal(sidebar.state,'ready',JSON.stringify(sidebar));assert.equal(pages,1);
 assert.equal(workspace.page.role,'workspace');assert.equal(sidebar.page.role,'sidebar');
 assert.equal(workspace.page.groups.items[0].nativeName,'Native Project');assert.equal(workspace.page.entries.unknown.items[0].nativeTitle,'Native conversation');
 assert.equal(workspace.page.entries.unknown.items[0].membership,'UNKNOWN');
 assert.equal(workspace.page.completeSnapshot,false);assert.equal(workspace.page.refs,undefined);assert.equal(workspace.page.manifest,undefined);
 assert(new TextEncoder().encode(JSON.stringify(workspace)).length<65536);
});
test('MOCK_IDB UI view denies role/scope spoofing, parent sender and cross-frame grants',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();
 for(const reply of [await h.view('workspace',{role:'sidebar'}),await h.view('workspace',{}, {scope:'forged'}),await h.view('workspace',{}, {},h.sender),await h.view('workspace',{}, {},h.children.sidebar),await h.view('workspace',{}, {grantId:'unknown'}),await h.view('workspace',{}, {mountId:'other'})])assert.equal(reply.ok,false,JSON.stringify(reply));
 assert.equal((await ready(h)).state,'ready');
});
test('MOCK_IDB scope invalidation fences late shared page result and future UI publications',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();
 const native=h.service.nativeRepository,original=native.page.bind(native);let entered=false,release;
 const held=new Promise(resolve=>release=resolve);native.page=async(...args)=>{entered=true;await held;return original(...args);};
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 h.switchPrincipal('other-principal');release();await drain();
 assert.equal((await h.view()).ok,false);assert.equal((await h.view('sidebar')).ok,false);
});

test('MOCK_IDB cached UI view recalibrates at native source expiry under a still-current new scope grant',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();
 const start=Date.parse(NOW);h.setTime(start+55000);
 // A fresh authentication proof outlives the independently persisted old fact.
 // It must not renew that fact merely by providing a new document/UI grant.
 h.switchPrincipal('fixture-principal');await h.bind();await h.mount();
 const native=h.service.nativeRepository,original=native.page.bind(native);let pages=0;
 native.page=async(...args)=>{pages++;return original(...args);};
 const first=await ready(h);assert.equal(first.state,'ready',JSON.stringify(first));assert.equal(first.page.groups.items[0].nativeName,'Native Project');
 const initialPages=pages;h.setTime(start+59999);assert.equal((await h.view()).state,'ready');assert.equal(pages,initialPages,'time progression without a deadline must not reload');
 h.setTime(start+60000);const crossed=await h.view();assert.equal(crossed.state,'preparing','expired native witnesses cannot be returned as the old ready view');
 const second=await ready(h);assert.equal(second.state,'ready',JSON.stringify(second));assert.equal(second.page.groups.items[0].nativeName,'Native Project');assert.equal(second.page.groups.items[0].freshness,'last-known');assert.equal(second.page.entries.unknown.items[0].nativeTitle,'Native conversation');assert.equal(second.page.entries.unknown.items[0].freshness,'last-known');assert.equal(second.page.entries.unknown.items[0].membership,'UNKNOWN');
 assert.deepEqual(second.page.viewSession,first.page.viewSession,'freshness refresh preserves the shared history session');
 const refreshedPages=pages;assert(refreshedPages>initialPages);assert.equal((await h.view('sidebar')).state,'ready');assert.equal(pages,refreshedPages,'one deadline crossing refresh serves both frames');
});

const hrefPlan=target=>{const project=Object.hasOwn(target,'projectId'),key=project?'projectId':'refId';return {[key]:target[key],targetKey:'native_target',plan:{mode:'href',planRevision:1,disposition:'same-tab',target:{kind:'resolved',entity:project?'project':'conversation',nativeId:target[key],navigationURL:target.navigationURL}}};};
test('MOCK_IDB trusted native plan callback receives only current bounded identities and document binding',async t=>{
 const calls=[],h=await fixture(t,{prepareNavigation:async args=>{calls.push(structuredClone(args));return args.targets.map(hrefPlan);}});
 await h.bind();await h.observe();await h.mount();const result=await ready(h);
 assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(calls.length,1);
 assert.deepEqual(calls[0].targets,[{refId:'c1',navigationURL:'https://chatgpt.com/c/c1'},{projectId:'p1',navigationURL:'https://chatgpt.com/g/p1/project'}]);
 assert.deepEqual(Object.keys(calls[0]).sort(),['binding','parentFrame','targets']);assert.equal(calls[0].parentFrame.documentId,'document');assert.deepEqual(Object.keys(calls[0].binding).sort(),['documentToken','producerToken','routeEpoch']);assert.equal(typeof calls[0].binding.documentToken,'string');
 assert.deepEqual(result.navigation,calls[0].targets.map(hrefPlan));
 assert.equal(result.binding,undefined);assert.equal(result.parentFrame,undefined);assert(!JSON.stringify(result).includes(calls[0].binding.documentToken),'internal document token never enters UI DTO');
});
for(const mode of ['different-url','different-id','duplicate','oversize','unsafe-mode'])test(`MOCK_IDB malformed native plans ${mode} cannot publish UI payload`,async t=>{
 const h=await fixture(t,{prepareNavigation:async({targets})=>{
  const item=hrefPlan(targets[0]);if(mode==='different-url')item.plan.target.navigationURL='https://chatgpt.com/c/other';
  if(mode==='different-id')item.plan.target.nativeId='other';
  if(mode==='oversize')item.targetKey='x'.repeat(65536);
  if(mode==='unsafe-mode')item.plan.mode='native-click';
  return mode==='duplicate'?[item,structuredClone(item)]:[item];
 }});await h.bind();await h.observe();await h.mount();const result=await ready(h);
 assert.equal(result.ok,false);assert.equal(result.reason,mode==='oversize'?'free-frame-page-too-large':'invalid-native-plans');assert.equal(result.page,undefined);assert.equal(result.navigation,undefined);
});
test('MOCK_IDB invalidation while trusted native plans await prevents late UI publication',async t=>{
 let entered=false,release;const barrier=new Promise(resolve=>release=resolve);
 const h=await fixture(t,{prepareNavigation:async({targets})=>{entered=true;await barrier;return targets.map(hrefPlan);}});
 await h.bind();await h.observe();await h.mount();const pending=ready(h);
 for(let i=0;i<100&&!entered;i++)await drain();assert.equal(entered,true);
 h.switchPrincipal('replacement-principal');release();const result=await pending;
 assert.equal(result.ok,false);assert.equal(result.page,undefined);assert.equal(result.navigation,undefined);
});


test('MOCK_IDB current conversation comes from verified parent route and existing owner index',async t=>{
 const h=await fixture(t,{documentURL:'https://chatgpt.com/c/c1'});await h.bind();await h.observe();await h.mount();
 const result=await ready(h);assert.equal(result.state,'ready',JSON.stringify(result));assert.deepEqual(result.page.current,{nativeUrl:'https://chatgpt.com/c/c1',refId:'c1',projectId:null});
 assert.equal((await h.view('workspace',{current:{nativeUrl:'https://chatgpt.com/c/forged'}})).ok,false);
 const other=await fixture(t,{documentURL:'https://chatgpt.com/c/unseen'});await other.bind();await other.observe();await other.mount();
 assert.deepEqual((await ready(other)).page.current,{nativeUrl:'https://chatgpt.com/c/unseen',refId:null,projectId:null});
});
test('MOCK_IDB authorized roles share presentation revision and native callback contains no search or scope',async t=>{
 const calls=[],h=await fixture(t,{presentSurface:async x=>{calls.push(structuredClone(x));return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 const search=await h.present('sidebar',{kind:'search-known',themeId:'p1'});assert.equal(search.ok,true,JSON.stringify(search));assert.equal(search.presentation.revision,1);
 assert.deepEqual((await h.view()).page.presentation,search.presentation);assert.deepEqual((await h.view('sidebar')).page.presentation,search.presentation);
 const reading=await h.present('workspace',{kind:'enter-reading'});assert.equal(reading.presentation.revision,2);assert.deepEqual((await h.view('sidebar')).page.presentation,reading.presentation);
 const repeated=await h.present('sidebar',{kind:'enter-reading'});assert.equal(repeated.presentation.revision,2);
 assert.deepEqual(calls.map(c=>c.mode),['workspace','reading','reading']);for(const call of calls){assert.deepEqual(Object.keys(call).sort(),['binding','mode','parentFrame']);assert.deepEqual(Object.keys(call.binding).sort(),['documentToken','producerToken','routeEpoch']);assert.equal(call.parentFrame.documentId,'document');assert.equal(call.query,undefined);assert.equal(call.scope,undefined);assert.equal(call.title,undefined);}
});
test('MOCK_IDB presentation rejects forged role, grant, intent fields and unknown Project before native callback',async t=>{
 let calls=0;const h=await fixture(t,{presentSurface:async()=>{calls++;return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 for(const [intent,patch,sender]of [[{kind:'show-workspace'},{role:'sidebar'}],[{kind:'enter-reading'},{grantId:'unknown'}],[{kind:'show-workspace'},{},h.children.sidebar],[{kind:'show-workspace',scope:'forged'},{}],[{kind:'search-known',themeId:'not-known'},{}],[{kind:'show-workspace'},{mountId:'other'}]]){const reply=await h.present('workspace',intent,patch,sender);assert.equal(reply.ok,false,JSON.stringify(reply));}
 assert.equal(calls,0);assert.equal((await h.view()).page.presentation.revision,0);
});
test('MOCK_IDB scope invalidation while native presentation waits rejects late publication',async t=>{
 let entered=false,release;const wait=new Promise(r=>release=r),h=await fixture(t,{presentSurface:async()=>{entered=true;await wait;return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 const pending=h.present('sidebar',{kind:'search-known',themeId:null});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);h.switchPrincipal('replacement');release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.presentation,undefined);assert.equal((await h.view()).ok,false);assert.equal((await h.present('workspace',{kind:'show-workspace'})).ok,false);
});
test('MOCK_IDB failed native presentation leaves shared intent unchanged',async t=>{
 const h=await fixture(t,{presentSurface:async()=>({ok:false})});await h.bind();await h.observe();await h.mount();await ready(h);assert.equal((await h.present('sidebar',{kind:'enter-reading'})).ok,false);assert.deepEqual((await h.view()).page.presentation,{revision:0,intent:{kind:'show-workspace'}});
});
test('MOCK_IDB search result receives owner navigation plan and cannot forge current conversation',async t=>{
 const calls=[],h=await fixture(t,{documentURL:'https://chatgpt.com/c/c1',prepareNavigation:async x=>{calls.push(x);return x.targets.map(hrefPlan);}});await h.bind();await h.observe();await h.mount();await ready(h);calls.length=0;
 const result=await h.view('workspace',{segment:1,search:{query:'Native conversation',offset:0,limit:5}});assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(result.page.search.total,1);assert.deepEqual(result.page.search.items.map(r=>r.id),['c1']);assert(calls.at(-1).targets.some(r=>r.refId==='c1'));assert(result.navigation.some(r=>r.refId==='c1'));assert.equal(result.page.current.refId,'c1');
 assert.equal((await h.view('workspace',{search:{query:'Native',current:{refId:'forged'}}})).ok,false);assert.equal((await h.view('workspace',{search:{query:'Native',projectId:'unknown'}})).ok,false);
});

async function seedManualWorkingSet(h){
 // Explicit test-side manual asset seed: a saved anchor without native evidence
 // must remain reachable, without promoting its old manual title to native fact.
 const [provider,accountId,organizationId]=JSON.parse(h.bound.scope),scope={verified:true,provider,accountId,organizationId};
 const {state}=await h.workspaces.read(scope);
 const result=await h.workspaces.mutate(scope,{operationId:'manual-working-set',expectedRevision:state.revision,fingerprint:{test:'manual-assets'},type:'RESTORE_BACKUP',actor:'human',apply:current=>{
  const next=structuredClone(current);next.refs.missing_saved={id:'missing_saved',nativeTitle:'PRIVATE_OLD_MANUAL_LABEL',nativeUrl:'https://chatgpt.com/c/missing_saved',projectId:null,available:false};
  return reduceCommand(next,{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['missing_saved','c1'],current:'c1'}});
 }});assert.equal(result.ok,true,JSON.stringify(result));
}
test('MOCK_IDB working set preserves manual order and unavailable native title with reliable original links',async t=>{
 const calls=[],h=await fixture(t,{prepareNavigation:async args=>{calls.push(args);return args.targets.map(hrefPlan);}});await h.bind();await h.observe();await seedManualWorkingSet(h);await h.mount();await ready(h);calls.length=0;
 const result=await h.view('workspace',{workingSet:{offset:0,limit:24}});assert.equal(result.state,'ready',JSON.stringify(result));assert.deepEqual(result.page.workingSet.items.map(r=>r.id),['missing_saved','c1']);assert.equal(result.page.workingSet.currentRefId,'c1');assert.equal(result.page.workingSet.total,2);assert.equal(result.page.workingSet.items[0].nativeTitle,null);assert(!JSON.stringify(result.page.workingSet).includes('PRIVATE_OLD_MANUAL_LABEL'));assert(result.navigation.some(p=>p.refId==='c1'));assert.deepEqual(calls.at(-1).targets.find(p=>p.refId==='missing_saved'),{refId:'missing_saved',navigationURL:'https://chatgpt.com/c/missing_saved'});
 const tail=await h.view('sidebar',{workingSet:{offset:1,limit:1}});assert.deepEqual(tail.page.workingSet.items.map(r=>r.id),['c1']);assert.equal(tail.page.workingSet.hasMore,false);assert.equal(tail.page.workingSet.total,2);
});
test('MOCK_IDB working set rejects search combination and forged fields',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();await ready(h);
 for(const query of [{workingSet:{},search:{query:'Native'}},{workingSet:{scope:'forged'}},{workingSet:{refs:['forged']}},{workingSet:{limit:25}},{workingSet:{offset:-1}}])assert.equal((await h.view('workspace',query)).ok,false,JSON.stringify(query));
});
test('MOCK_IDB account replacement cannot reveal old saved working set',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await seedManualWorkingSet(h);await h.mount();await ready(h);assert.equal((await h.view('workspace',{workingSet:{}})).page.workingSet.total,2);
 h.switchPrincipal('other-working-set-principal');assert.equal((await h.view('workspace',{workingSet:{}})).ok,false);await h.bind();await h.mount();await ready(h);const next=await h.view('workspace',{workingSet:{}});assert.equal(next.state,'ready',JSON.stringify(next));assert.equal(next.page.workingSet.total,0);assert.deepEqual(next.page.workingSet.items,[]);assert(!JSON.stringify(next).includes('missing_saved'));
});

function workspaceScope(h){const [provider,accountId,organizationId]=JSON.parse(h.bound.scope);return {verified:true,provider,accountId,organizationId};}
test('MOCK_IDB human horizon change shares frozen T/Z and H across both frame views, preserving manual assets',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await seedManualWorkingSet(h);const scope=workspaceScope(h);
 for(const [i,command] of [{type:'CREATE_WORKSPACE',id:'manual_theme',name:'Manual Pro Theme'},{type:'SET_TITLE',refId:'c1',title:'Manual Pro Title'},{type:'PLACE',workspaceId:'manual_theme',refId:'c1'}].entries()){const {state}=await h.workspaces.read(scope);assert.equal((await h.workspaces.command(scope,{operationId:'manual_asset_'+i,expectedRevision:state.revision,command})).ok,true);}
 const before=(await h.workspaces.read(scope)).state;await h.mount();const initial=await ready(h);
 const result=await h.horizon('sidebar',{expectedRevision:initial.page.workspaceRevision,H:14,segment:2});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.viewSession.H,14);assert.equal(result.viewSession.T,initial.page.viewSession.T);assert.equal(result.viewSession.Z,initial.page.viewSession.Z);assert(Number.isSafeInteger(result.segment)&&result.segment>=0);
 const workspace=await ready(h),sidebar=await ready(h,'sidebar');assert.deepEqual(workspace.page.viewSession,result.viewSession);assert.deepEqual(sidebar.page.viewSession,result.viewSession);assert.equal(workspace.page.workspaceRevision,result.workspaceRevision);
 const after=(await h.workspaces.read(scope)).state;for(const key of ['refs','workspaces','placements','identities'])assert.deepEqual(after[key],before[key]);assert.deepEqual(after.preferences.workingSet,before.preferences.workingSet);assert.equal(after.preferences.freeTimePolicy.value.H,14);assert.equal(after.preferences.freeTimePolicy.value.mode,'fixed');
});
test('MOCK_IDB invalid H, forged scope/grant and parent sender cannot alter policy or session',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state;
 for(const [patch,sender]of [[{H:8}],[{H:'14'}],[{scope:'forged'}],[{grantId:'wrong'}],[{segment:-1}],[{},h.sender]]){const result=await h.horizon('workspace',{expectedRevision:initial.page.workspaceRevision,...patch},sender);assert.equal(result.ok,false,JSON.stringify(result));}
 assert.deepEqual((await h.workspaces.read(scope)).state,before);assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});
test('MOCK_IDB stale horizon CAS rejects without replacing the successfully published session',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h);
 const first=await h.horizon('workspace',{operationId:'first_horizon',expectedRevision:initial.page.workspaceRevision,H:7});assert.equal(first.ok,true,JSON.stringify(first));await ready(h);
 const second=await h.horizon('sidebar',{operationId:'stale_horizon',expectedRevision:initial.page.workspaceRevision,H:90});assert.equal(second.ok,false,JSON.stringify(second));assert.equal(second.reason,'revision-conflict');assert.deepEqual((await ready(h)).page.viewSession,first.viewSession);assert.equal((await h.workspaces.read(workspaceScope(h))).state.preferences.freeTimePolicy.value.H,7);
});
test('MOCK_IDB horizon scope revocation before delayed guarded command prevents persistence',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state;
 const original=h.workspaces.command.bind(h.workspaces);let entered=false,release;const held=new Promise(r=>release=r);
 h.workspaces.command=async(...args)=>{entered=true;await held;return original(...args);};
 const pending=h.horizon('workspace',{expectedRevision:initial.page.workspaceRevision,H:60});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);h.switchPrincipal('revoked-before-horizon');release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.viewSession,undefined);assert.deepEqual((await h.workspaces.read(scope)).state,before);assert.equal((await h.view()).ok,false);
});
test('MOCK_IDB concurrent human commit wins CAS over delayed horizon without changing shared session',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),original=h.workspaces.command.bind(h.workspaces);let entered=false,release;const held=new Promise(r=>release=r);
 const before=(await h.workspaces.read(scope)).state;
 h.workspaces.command=async(...args)=>{entered=true;await held;return original(...args);};
 const pending=h.horizon('sidebar',{expectedRevision:initial.page.workspaceRevision,H:90});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 assert.equal((await original(scope,{operationId:'concurrent_manual_title',expectedRevision:initial.page.workspaceRevision,command:{type:'SET_TITLE',refId:'c1',title:'Concurrent manual title'}})).ok,true);release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'revision-conflict');assert.equal(result.viewSession,undefined);
 const after=(await h.workspaces.read(scope)).state;assert.equal(after.identities.c1.title,'Concurrent manual title');assert.deepEqual(after.preferences.freeTimePolicy,before.preferences.freeTimePolicy);assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});
test('MOCK_IDB delayed obsolete ordinary refresh cannot poison a newly configured horizon',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),native=h.service.nativeRepository;
 const version=native.version.bind(native),header=native.header.bind(native);let changed=true,entered=false,rejectOld;
 // Inject one independently changed version read to enter normal refresh; its
 // first header remains outstanding while the actual human CAS commits.
 native.version=async(...args)=>{const result=await version(...args);if(changed){changed=false;return result+1;}return result;};
 native.header=async(...args)=>{if(!entered){entered=true;await new Promise((_,reject)=>rejectOld=reject);}return header(...args);};
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 const result=await h.horizon('workspace',{expectedRevision:initial.page.workspaceRevision,H:60});assert.equal(result.ok,true,JSON.stringify(result));const fresh=await ready(h);assert.equal(fresh.state,'ready',JSON.stringify(fresh));assert.equal(fresh.page.viewSession.H,60);
 rejectOld(Error('obsolete-header-failure'));await drain();await drain();const after=await h.view('sidebar');assert.equal(after.state,'ready',JSON.stringify(after));assert.deepEqual(after.page.viewSession,result.viewSession);assert.equal(after.reason,undefined);
});
test('MOCK_IDB document and UI lease expire before delayed horizon CAS despite unexpired RPC deadline',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state;
 const original=h.workspaces.command.bind(h.workspaces);let entered=false,release;const held=new Promise(r=>release=r);
 h.workspaces.command=async(...args)=>{entered=true;await held;return original(...args);};
 h.setTime(Date.parse(NOW)+19000);const pending=h.horizon('workspace',{expectedRevision:initial.page.workspaceRevision,H:14});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 // Advance authority wall clock only, not the six-second performance deadline.
 h.setTime(Date.parse(NOW)+21000);release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.viewSession,undefined);assert.deepEqual((await h.workspaces.read(scope)).state,before);assert.equal((await h.view()).ok,false);
});

test('MOCK_IDB current ref remains separately navigable outside bounded visible history page',async t=>{
 const calls=[],h=await fixture(t,{documentURL:'https://chatgpt.com/c/c1',prepareNavigation:async x=>{calls.push(x);return x.targets.map(hrefPlan);}});await h.bind();await h.observe();await h.mount();await ready(h);
 const result=await h.view('workspace',{segment:100,offset:0,limit:1});assert.equal(result.state,'ready');assert.equal(result.page.entries.unknown.items.length,0);assert.equal(result.page.currentRef.id,'c1');assert.equal(result.page.currentRef.nativeTitle,'Native conversation');assert.equal(result.page.currentRef.membership,'UNKNOWN');assert.equal(result.page.current.refId,'c1');assert(result.navigation.some(p=>p.refId==='c1'));assert(calls.at(-1).targets.some(r=>r.refId==='c1'));assert.equal(result.page.entries.unknown.total,0);
 assert.equal((await h.view('workspace',{currentRef:{id:'forged'}})).ok,false);
});

for(const constant of [false,true])test('MOCK_IDB snapshot CAS movement has bounded preparation recovery '+constant,async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const native=h.service.nativeRepository,original=native.page.bind(native);let pages=0;
 native.page=async(...args)=>{const result=await original(...args);pages++;if(constant||pages===1){const scope=workspaceScope(h),state=(await h.workspaces.read(scope)).state;assert.equal((await h.workspaces.command(scope,{operationId:'prep_race_'+pages,expectedRevision:state.revision,command:{type:'SET_PREFERENCE',id:'compactRows',value:pages%2===0}})).ok,true);}return result;};
 let result;for(let i=0;i<100;i++){result=await h.view();if(result.state!=='preparing')break;await new Promise(r=>setTimeout(r,5));}
 if(constant){assert.equal(result.ok,false);assert(['snapshot-revision-changed','stale-free-page'].includes(result.reason));assert.equal(pages,3);}else{assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(pages,2);}
});

test('MOCK_IDB rolling scope revalidation preserves two frame owner session and manual assets beyond initial lease',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await seedManualWorkingSet(h);await h.mount();const first=await ready(h),scope=workspaceScope(h),initialNative=await h.service.nativeRepository.read(scope),initialEvidence=await h.evidence.read(scope),initialWorkspace=(await h.workspaces.read(scope)).state;
 const frame={tabId:1,frameId:0,documentId:'document',parentDocumentId:null,actualURL:url,documentLifecycle:'active',incognito:false},grant=h.service.authority.peek(frame).grant;
 for(const seconds of [10,20,30,40,49]){h.setTime(Date.parse(NOW)+seconds*1000);const result=await h.renew();assert.equal(result.refresh.state,'verified',JSON.stringify(result));assert.equal(result.status.ok,true);}
 assert.equal(h.providerReads,1,'remaining scope time over ten seconds requires no identity request');
 h.setTime(Date.parse(NOW)+55000);const near=await h.renew();assert.equal(near.refresh.state,'verified',JSON.stringify(near));assert.equal(near.status.ok,true);assert.equal(h.providerReads,2);const renewed=h.service.authority.peek(frame).grant;assert.equal(renewed.id,grant.id);assert.equal(renewed.scopeEpoch,grant.scopeEpoch);assert(Date.parse(renewed.expiresAt)>Date.parse(grant.expiresAt));
 h.setTime(Date.parse(NOW)+65000);const again=await h.renew();assert.equal(again.status.ok,true);assert.equal(h.providerReads,2);
 for(const role of ['workspace','sidebar']){const view=await ready(h,role);assert.equal(view.state,'ready',JSON.stringify(view));assert.deepEqual(view.page.viewSession,first.page.viewSession);assert.equal(view.page.groups.items[0].freshness,'last-known','revalidation must not freshen old facts');const work=await h.view(role,{segment:2,workingSet:{}});assert.deepEqual(work.page.workingSet.items.map(r=>r.id),['missing_saved','c1']);assert.equal(work.page.segment,2);}
 assert.deepEqual(await h.service.nativeRepository.read(scope),initialNative);assert.deepEqual(await h.evidence.read(scope),initialEvidence);assert.deepEqual((await h.workspaces.read(scope)).state,initialWorkspace);
});

test('MOCK_IDB authorized recovery repairs native root and restarts failed shared view owner without losing manual assets',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();assert.equal((await ready(h)).state,'ready');
 const scope={...workspaceScope(h),key:h.bound.scope};
 assert(scope?.key);
 assert((await h.workspaces.command(scope,{operationId:'manual_before_repair',expectedRevision:(await h.workspaces.read(scope)).state.revision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:['c1'],current:'c1'}}})).ok);
 const rpc=(type,extra={},as=h.children.workspace)=>h.service.handle({v:1,type,grantId:h.grants.workspace.id,mountId:'mount',...extra},as);
 const healthy=await rpc('HOST_UI_RECOVERY_STATUS');assert.equal(healthy.ok,true);assert.equal(healthy.plans.workspace.corrupt,false);assert.equal(healthy.plans.native.corrupt,false);
 const db=await h.base.open();await new Promise((resolve,reject)=>{const tx=db.transaction('native_states','readwrite'),store=tx.objectStore('native_states'),r=store.get(scope.key);r.onsuccess=()=>store.put({...r.result,checksum:'0'.repeat(64)});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 h.service.views.refreshScope(scope.key);const broken=await ready(h);assert.equal(broken.ok,false);
 const status=await rpc('HOST_UI_RECOVERY_STATUS');assert.equal(status.ok,true,JSON.stringify(status));assert.equal(status.plans.native.recoverable,true);assert(!JSON.stringify(status).includes('damagedHash'));
 const repair={kind:'native',planId:status.plans.native.planId,operationId:'repair_native_ui'};
 assert.equal((await rpc('HOST_UI_RECOVER',repair,h.sender)).ok,false,'top host cannot use private UI repair');
 assert.deepEqual(await rpc('HOST_UI_RECOVER',repair),{ok:true,kind:'native'});
 const restored=await ready(h);assert.equal(restored.ok,true,JSON.stringify(restored));assert.equal(restored.state,'ready');assert.equal(restored.page.entries.unknown.items.length,1);assert.equal(restored.page.entries.unknown.items[0].id,'c1');assert.equal(restored.page.entries.unknown.items[0].nativeTitle,null);assert.equal(restored.page.entries.unknown.items[0].nativeUrl,'https://chatgpt.com/c/c1');
 const saved=await h.workspaces.read(scope);assert.deepEqual(saved.state.preferences.workingSet.value,{refs:['c1'],current:'c1'});
 assert.equal((await rpc('HOST_UI_RECOVER',repair)).ok,false,'RAM plan is consumed');
 h.service.stop();assert.equal((await rpc('HOST_UI_RECOVERY_STATUS')).ok,false);
});
test('MOCK_IDB enabling auto preserves chosen H and frozen T/Z while publishing policy mode to both frames',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const first=await ready(h);
 const fixed=await h.horizon('workspace',{operationId:'choose_fixed_60',expectedRevision:first.page.workspaceRevision,H:60,segment:3});assert.equal(fixed.ok,true,JSON.stringify(fixed));const before=await ready(h),scope=workspaceScope(h),assets=(await h.workspaces.read(scope)).state;
 const automatic=await h.horizon('sidebar',{operationId:'enable_auto',expectedRevision:before.page.workspaceRevision,H:'auto',segment:3});assert.equal(automatic.ok,true,JSON.stringify(automatic));assert.equal(automatic.viewSession.H,60);assert.equal(automatic.viewSession.T,before.page.viewSession.T);assert.equal(automatic.viewSession.Z,before.page.viewSession.Z);assert.equal(automatic.viewSession.policyRevision,before.page.viewSession.policyRevision+1);assert.equal(automatic.segment,3);
 for(const role of ['workspace','sidebar']){const page=(await ready(h,role)).page;assert.deepEqual(page.viewSession,automatic.viewSession);assert.deepEqual(page.timePolicy,{mode:'auto',H:60,revision:automatic.viewSession.policyRevision});}
 const after=(await h.workspaces.read(scope)).state,policy=after.preferences.freeTimePolicy;assert.equal(policy.owner,'human');assert.equal(policy.value.mode,'auto');assert.equal(policy.value.lastChangedDay,before.page.viewSession.T);assert.equal(policy.value.lastEvaluatedDay,null);assert.equal(policy.value.recommendation,null);assert.equal(policy.value.confirmations,0);for(const key of ['refs','workspaces','placements','identities','sources','events','coverage'])assert.deepEqual(after[key],assets[key]);
});
test('MOCK_IDB repeated auto enable requires fresh CAS and does not run density evaluation or change H',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h);const a=await h.horizon('workspace',{H:'auto',operationId:'auto_first',expectedRevision:initial.page.workspaceRevision});assert.equal(a.ok,true,JSON.stringify(a));await ready(h);
 const stale=await h.horizon('sidebar',{H:'auto',operationId:'auto_stale',expectedRevision:initial.page.workspaceRevision});assert.equal(stale.ok,false);assert.equal(stale.reason,'revision-conflict');const current=await ready(h);const b=await h.horizon('sidebar',{H:'auto',operationId:'auto_second',expectedRevision:current.page.workspaceRevision});assert.equal(b.ok,true,JSON.stringify(b));assert.equal(b.viewSession.H,a.viewSession.H);assert.equal(b.viewSession.T,a.viewSession.T);assert.equal(b.viewSession.Z,a.viewSession.Z);assert.equal(b.viewSession.policyRevision,a.viewSession.policyRevision+1);const policy=(await h.workspaces.read(workspaceScope(h))).state.preferences.freeTimePolicy.value;assert.equal(policy.lastEvaluatedDay,null);assert.equal(policy.confirmations,0);
 const latest=await ready(h);const fixed=await h.horizon('workspace',{H:14,operationId:'return_fixed',expectedRevision:latest.page.workspaceRevision});assert.equal(fixed.ok,true);assert.equal((await ready(h)).page.timePolicy.mode,'fixed');assert.equal(fixed.viewSession.H,14);
});
test('MOCK_IDB auto cannot accept page chosen policy fields or scope and rejects parent sender',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state;
 for(const [extra,sender]of [[{mode:'auto'}],[{policy:{H:7,revision:99}}],[{scope:'fake'}],[{H:'AUTO'}],[{},h.sender]])assert.equal((await h.horizon('workspace',{H:'auto',expectedRevision:initial.page.workspaceRevision,...extra},sender)).ok,false);
 assert.deepEqual((await h.workspaces.read(scope)).state,before);
});
test('MOCK_IDB auto enable loses authority before delayed CAS and cannot mutate saved policy',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();const initial=await ready(h),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state,original=h.workspaces.command.bind(h.workspaces);let entered=false,release;const held=new Promise(r=>release=r);h.workspaces.command=async(...args)=>{entered=true;await held;return original(...args);};
 const pending=h.horizon('workspace',{H:'auto',expectedRevision:initial.page.workspaceRevision});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);h.switchPrincipal('auto_revoked');release();assert.equal((await pending).ok,false);assert.deepEqual((await h.workspaces.read(scope)).state,before);
});
test('MOCK_IDB auto policy change records current local day across midnight while historical T/Z remain frozen',async t=>{
 const previousTZ=process.env.TZ;process.env.TZ='UTC';
 try{
 const h=await fixture(t);h.setTime(Date.parse(NOW)-10000);await h.bind();await h.observe();await h.mount();const initial=await ready(h);assert.equal(initial.state,'ready');h.setTime(Date.parse(NOW)+1000);
 const result=await h.horizon('workspace',{H:'auto',operationId:'auto_after_midnight',expectedRevision:initial.page.workspaceRevision,segment:2});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.viewSession.T,initial.page.viewSession.T);assert.equal(result.viewSession.Z,initial.page.viewSession.Z);assert.equal(result.viewSession.H,initial.page.viewSession.H);assert.equal(result.segment,2);
 const policy=(await h.workspaces.read(workspaceScope(h))).state.preferences.freeTimePolicy.value;assert.equal(policy.lastChangedDay,initial.page.viewSession.T+1);assert.equal(policy.lastEvaluatedDay,null);assert.deepEqual((await ready(h)).page.viewSession,result.viewSession);
 }finally{if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ;}
});

for(const mode of ['entity','url','mixed-id','duplicate'])test('MOCK_IDB Project plan '+mode+' cannot replace owner-known native identity',async t=>{
 const h=await fixture(t,{prepareNavigation:async({targets})=>{
  const item=hrefPlan(targets.find(t=>Object.hasOwn(t,'projectId')));
  if(mode==='entity')item.plan.target.entity='conversation';
  if(mode==='url')item.plan.target.navigationURL='https://chatgpt.com/g/other/project';
  if(mode==='mixed-id')item.refId=item.projectId;
  return mode==='duplicate'?[item,structuredClone(item)]:[item];
 }});await h.bind();await h.observe();await h.mount();const result=await ready(h);assert.equal(result.ok,false);assert.equal(result.reason,'invalid-native-plans');assert.equal(result.page,undefined);
});

async function midnightFixture(t,options={}){
 const previousTZ=process.env.TZ;process.env.TZ='UTC';t.after(()=>{if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ;});
 const h=await fixture(t,{presentSurface:async()=>({ok:true}),...options});h.setTime(Date.parse(NOW)-1000);await h.bind();await h.observe();await h.mount();const initial=await ready(h);assert.equal(initial.state,'ready');h.setTime(Date.parse(NOW)+1000);return {h,initial,request:{expectedRevision:initial.page.workspaceRevision,viewSession:initial.page.viewSession}};
}
test('MOCK_IDB only explicit current workspace entry refreshes local day and does not write preferences',async t=>{
 const {h,initial,request}=await midnightFixture(t),scope=workspaceScope(h),before=(await h.workspaces.read(scope)).state;
 assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession,'ordinary reads preserve yesterday');
 const result=await h.enterCurrent('workspace',request);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.segment,0);assert.equal(result.viewSession.T,initial.page.viewSession.T+1);assert.equal(result.viewSession.H,initial.page.viewSession.H);assert.equal(result.viewSession.Z,'UTC');
 assert.deepEqual((await ready(h)).page.viewSession,result.viewSession);assert.deepEqual((await ready(h,'sidebar')).page.viewSession,result.viewSession,'two surfaces share this mount session');
 assert.deepEqual((await h.workspaces.read(scope)).state,before,'entry neither rewrites policy nor native activity');
 const repeated=await h.enterCurrent('workspace',{...request,viewSession:result.viewSession});assert.equal(repeated.ok,true);assert.deepEqual(repeated.viewSession,result.viewSession);
});
test('MOCK_IDB current entry rejects history, search and working set without changing the frozen session',async t=>{
 const {h,initial,request}=await midnightFixture(t);
 for(const query of [{segment:2},{search:{query:'Native'}},{workingSet:{offset:0,limit:24}}]){assert.equal((await h.view('workspace',query)).state,'ready');const response=await h.enterCurrent('workspace',request);assert.equal(response.ok,false);assert.equal(response.reason,'free-current-entry-unavailable');assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);}
});
test('MOCK_IDB current entry requires exact workspace grant, revision and session; cannot choose date or scope',async t=>{
 const {h,initial,request}=await midnightFixture(t);
 for(const [role,patch,sender]of [['sidebar',{}],['workspace',{},h.sender],['workspace',{},h.children.sidebar],['workspace',{scope:'other'}],['workspace',{viewSession:{...request.viewSession,T:request.viewSession.T+1}}],['workspace',{viewSession:{...request.viewSession,Z:'Asia/Shanghai'}}],['workspace',{viewSession:{...request.viewSession,other:true}}],['workspace',{expectedRevision:request.expectedRevision+1}]])assert.equal((await h.enterCurrent(role,{...request,...patch},sender)).ok,false);
 assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});
test('MOCK_IDB failed native presentation and late scope invalidation cannot advance date',async t=>{
 let allowed=false;const {h,initial,request}=await midnightFixture(t,{presentSurface:async()=>({ok:allowed})});
 assert.equal((await h.enterCurrent('workspace',request)).reason,'host-presentation-unavailable');assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
 allowed=true;h.switchPrincipal('other');assert.equal((await h.enterCurrent('workspace',request)).ok,false);
});
test('MOCK_IDB in-flight current entry fences manual writes and abandons date when user leaves current segment',async t=>{
 let release,entered=false;const held=new Promise(resolve=>release=resolve);const {h,initial,request}=await midnightFixture(t,{presentSurface:async()=>{entered=true;await held;return {ok:true};}});
 const pending=h.enterCurrent('workspace',request);for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 assert.equal((await h.horizon('workspace',{expectedRevision:request.expectedRevision})).reason,'preference-change-in-progress');
 assert.equal((await h.view('workspace',{segment:2})).state,'ready');release();assert.equal((await pending).ok,false);assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});
test('MOCK_IDB final version check prevents applying a stale current-entry policy',async t=>{
 const {h,initial,request}=await midnightFixture(t),scope=workspaceScope(h);
 const write=await h.workspaces.command(scope,{operationId:'concurrent_policy',expectedRevision:request.expectedRevision,command:{type:'SET_PREFERENCE',id:'workingSet',value:{refs:[],current:null}}},{actor:'human'});assert.equal(write.ok,true);
 assert.equal((await h.enterCurrent('workspace',request)).reason,'snapshot-revision-changed');assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});

test('MOCK_IDB elapsed deadline fences current entry even before the timer callback executes',async t=>{
 let elapsed=0;const {h,initial,request}=await midnightFixture(t,{elapsedNow:()=>elapsed,presentSurface:async()=>{elapsed=6000;return {ok:true};}});
 const response=await h.enterCurrent('workspace',request);assert.equal(response.ok,false);assert.match(response.reason,/expired|timeout/);
 assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
});

test('MOCK_IDB scoped host view saves native-ref snippet through private bridge and refreshes both frames',async t=>{
 const anchor={refId:'c1',messageId:'m1',branchId:'branch1',text:'explicit selected text',bodyHash:'a'.repeat(64)},phases=[];
 const h=await fixture(t,{selectionBridge:async({context,ref,phase})=>{phases.push(phase);assert.equal(ref.id,'c1');assert.equal(context.isCurrent(),true);return phase==='capture'?{selectionId:'selection',anchor}:phase==='validate'?{ok:true,anchor}:{ok:true};}});
 await h.bind();await h.observe();await h.mount();const first=await ready(h);
 const send=(action,id,expectedRevision,operationId)=>h.service.handle({v:1,type:'HOST_UI_SNIPPET',grantId:h.grants.sidebar.id,mountId:'mount',operationId,expectedRevision,action,id},h.children.sidebar);
 const saved=await send('save','c1',first.page.workspaceRevision,'save-snippet');assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.savedSnippets.total,1);assert.deepEqual(phases,['capture','validate','release']);
 const next=await ready(h),scope=h.service.authority.scopeFor({tabId:1,frameId:0,documentId:'document',actualURL:url,documentLifecycle:'active',incognito:false}),state=(await h.workspaces.read(scope)).state;const row=state.preferences.savedSnippets.value[0];assert.deepEqual({...row,id:undefined},{id:undefined,...anchor});
 assert.equal((await send('remove',row.id,first.page.workspaceRevision,'stale-remove')).ok,false);
 assert.equal((await send('remove',row.id,next.page.workspaceRevision,'remove-snippet')).ok,true);await ready(h);assert.deepEqual((await h.workspaces.read(scope)).state.preferences.savedSnippets.value,[]);
 h.switchPrincipal('new-principal');assert.equal((await send('save','c1',next.page.workspaceRevision,'wrong-scope')).ok,false);
});

async function locatedReady(h,query,projectId){for(let i=0;i<100;i++){const result=await h.view('workspace',query,{locateProjectId:projectId});if(result.state!=='preparing')return result;await drain();}assert.fail('location preparation did not settle');}
test('atomic location is read-only for resume until accepted ordinary view confirms offset',async t=>{
 const h=await fixture(t);await h.bind();await h.observe(Array.from({length:33},(_,i)=>'p'+String(i).padStart(2,'0')));await h.mount();const initial=await ready(h),query={segment:0,offset:0,limit:8},found=await locatedReady(h,query,'p32');assert.equal(found.ok,true,JSON.stringify(found));assert.deepEqual(found.location,{projectId:'p32',found:true});assert.equal(found.page.groups.offset,32);assert.equal(found.page.groups.items[0].id,'p32');assert.equal(found.page.groups.items[0].nativeName,'Same native name');assert.deepEqual(found.page.viewSession,initial.page.viewSession);assert.deepEqual(query,{segment:0,offset:0,limit:8});
 const resumed=await h.service.handle({v:1,type:'HOST_UI_RESUME',grantId:h.grants.workspace.id,mountId:'mount'},h.children.workspace);assert.equal(resumed.ok,true);assert.deepEqual(resumed.resume.query,{});const confirmed=await h.view('workspace',{segment:0,offset:found.page.groups.offset,limit:8});assert.equal(confirmed.ok,true);const acceptedResume=await h.service.handle({v:1,type:'HOST_UI_RESUME',grantId:h.grants.workspace.id,mountId:'mount'},h.children.workspace);assert.deepEqual(acceptedResume.resume.query,{segment:0,offset:32,limit:8});
 const absent=await locatedReady(h,{segment:1,offset:0,limit:8},'p32');assert.equal(absent.ok,true,JSON.stringify(absent));assert.deepEqual(absent.location,{projectId:'p32',found:false});assert.equal(absent.page.segment,1);assert.equal(absent.page.groups.offset,0);assert.deepEqual(absent.page.viewSession,initial.page.viewSession);
});
test('location rejects malformed identity and query-level or search/workset authority widening',async t=>{
 const h=await fixture(t);await h.bind();await h.observe();await h.mount();await ready(h);for(const id of [null,'','with space','__proto__','x'.repeat(129),{},2])assert.equal((await locatedReady(h,{},id)).ok,false,JSON.stringify(id));
 for(const query of [{locateProjectId:'p1'},{search:{query:'Native',projectId:null,offset:0,limit:24}},{workingSet:{offset:0,limit:24}}])assert.equal((await h.view('workspace',query,{locateProjectId:'p1'})).ok,false);assert.equal((await ready(h)).ok,true);
});

test('new accepted native version re-locates formerly absent Project against fresh owner snapshot',async t=>{
 const h=await fixture(t);await h.bind();const ids=Array.from({length:32},(_,i)=>'p'+String(i).padStart(2,'0'));await h.observe(ids);await h.mount();const query={segment:0,offset:0,limit:8},before=await locatedReady(h,query,'p32');assert.deepEqual(before.location,{projectId:'p32',found:false});await h.observe([...ids,'p32']);const after=await locatedReady(h,query,'p32');assert.equal(after.ok,true,JSON.stringify(after));assert.deepEqual(after.location,{projectId:'p32',found:true});assert.equal(after.page.groups.offset,32);assert.equal(after.page.groups.items[0].id,'p32');assert.deepEqual(after.page.viewSession,before.page.viewSession);assert.notEqual(after.page.revision,before.page.revision);
});

for(const role of ['workspace','sidebar'])test('MOCK_IDB show-native-page '+role+' uses bound native-page callback and shared presentation only',async t=>{
 const calls=[],h=await fixture(t,{presentSurface:async value=>{calls.push(structuredClone(value));return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 const before=await h.view(),reply=await h.present(role,{kind:'show-native-page'});
 assert.equal(reply.ok,true);assert.deepEqual(reply.presentation,{revision:1,intent:{kind:'show-native-page'}});assert.equal(calls.length,1);
 assert.deepEqual(Object.keys(calls[0]).sort(),['binding','mode','parentFrame']);assert.equal(calls[0].mode,'native-page');assert.equal(calls[0].parentFrame.documentId,'document');assert.deepEqual(Object.keys(calls[0].binding).sort(),['documentToken','producerToken','routeEpoch']);
 const after=await h.view(role);assert.deepEqual(after.page.presentation,reply.presentation);assert.equal(after.page.workspaceRevision,before.page.workspaceRevision);
});
test('MOCK_IDB show-native-page rejects wrong grant mount sender role and intent extensions before callback',async t=>{
 let calls=0;const h=await fixture(t,{presentSurface:async()=>{calls++;return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 for(const [intent,patch,sender]of [
 [{kind:'show-native-page'},{grantId:'unknown'}],
 [{kind:'show-native-page'},{mountId:'other'}],
 [{kind:'show-native-page'},{},h.children.sidebar],
 [{kind:'show-native-page'},{role:'sidebar'}],
 [{kind:'show-native-page',url:'https://chatgpt.com/'},{}],
 [{kind:'show-native-page',themeId:null},{}],
 ])assert.equal((await h.present('workspace',intent,patch,sender)).ok,false);
 assert.equal(calls,0);assert.deepEqual((await h.view()).page.presentation,{revision:0,intent:{kind:'show-workspace'}});
});
test('MOCK_IDB show-native-page cannot use expired UI authority',async t=>{
 let calls=0;const h=await fixture(t,{presentSurface:async()=>{calls++;return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);h.setTime(Date.parse(NOW)+20001);
 assert.equal((await h.present('workspace',{kind:'show-native-page'})).ok,false);assert.equal(calls,0);
});
test('MOCK_IDB failed native-page callback never publishes successful return',async t=>{
 const h=await fixture(t,{presentSurface:async()=>({ok:false})});await h.bind();await h.observe();await h.mount();await ready(h);
 assert.equal((await h.present('sidebar',{kind:'show-native-page'})).ok,false);assert.deepEqual((await h.view()).page.presentation,{revision:0,intent:{kind:'show-workspace'}});
});
test('MOCK_IDB late native-page completion after scope revocation cannot publish',async t=>{
 let entered=false,release;const wait=new Promise(resolve=>release=resolve),h=await fixture(t,{presentSurface:async()=>{entered=true;await wait;return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 const pending=h.present('sidebar',{kind:'show-native-page'});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);h.switchPrincipal('replacement');release();const reply=await pending;assert.equal(reply.ok,false);assert.equal(reply.presentation,undefined);
});

function preparationClock(){let time=0,next=0;const timers=new Map();return {now:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),advance(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time&&timers.delete(id))timer.fn();},jump(ms){time+=ms;},get timers(){return [...timers.values()];}};}
async function pendingNativePreparation(t){
 const clock=preparationClock(),h=await fixture(t,{elapsedNow:clock.now,schedule:clock.schedule,cancel:clock.cancel});await h.bind();await h.observe();await h.mount();
 const native=h.service.nativeRepository,original=native.page.bind(native);let pages=0,writing=false;
 native.page=async(...args)=>{const result=await original(...args);if(!writing&&args[1]?.limit!==512){pages++;if(pages===1){writing=true;try{await h.observe(['p1','p2']);}finally{writing=false;}}}return result;};
 assert.equal((await h.view()).state,'preparing');for(let i=0;i<200&&!clock.timers.some(timer=>timer.at===50);i++)await drain();
 assert(clock.timers.some(timer=>timer.at===50),'real snapshot movement must queue its first bounded retry');
 for(let i=0;i<10;i++)await drain();return {h,clock,pages:()=>pages};
}
test('MOCK_IDB finite native publications coalesce one counted retry then both surfaces become ready',async t=>{
 const {h,clock,pages}=await pendingNativePreparation(t);
 for(let i=0;i<8;i++){clock.advance(40);await h.observe(['p1','p2','p'+(i+3)]);await h.view('sidebar');}
 clock.advance(50);let result;for(let i=0;i<200;i++){result=await h.view();if(result.state!=='preparing')break;await drain();}
 assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(pages(),2);assert.equal((await h.view('sidebar')).state,'ready');
});
test('MOCK_IDB endless native publications retain original preparation deadline and late notifications cannot restart it',async t=>{
 const {h,clock,pages}=await pendingNativePreparation(t);
 for(let i=0;i<750;i++){clock.advance(40);h.service.views.nativePublished(h.bound.scope);}
 const result=await h.view();assert.equal(result.ok,false);assert.equal(result.reason,'read-budget-exhausted');assert.equal(pages(),1);
 h.service.views.nativePublished(h.bound.scope);clock.advance(100);assert.equal((await h.view()).reason,'read-budget-exhausted');assert.equal(pages(),1);
});
test('MOCK_IDB revoked pending preparation cannot be rearmed by a late native publication',async t=>{
 const {h,clock,pages}=await pendingNativePreparation(t);const scope=workspaceScope(h);h.service.invalidate({tabId:1});h.service.views.nativePublished(h.bound.scope);clock.advance(100);
 assert.equal((await h.view()).ok,false);assert.equal(pages(),1);assert(!clock.timers.some(timer=>timer.at===50));
});

test('MOCK_IDB a verified native write still in flight cannot consume the queued preparation retry',async t=>{
 const {h,clock,pages}=await pendingNativePreparation(t),native=h.service.nativeRepository,apply=native.apply.bind(native);let entered=false,release;
 const held=new Promise(resolve=>release=resolve);native.apply=async(...args)=>{entered=true;await held;return apply(...args);};
 const write=h.observe(['p1','p2','slow-native-project']);for(let i=0;i<100&&!entered;i++)await drain();assert.equal(entered,true);
 try{clock.advance(50);for(let i=0;i<20;i++)await drain();assert.equal(pages(),1,'a live same-scope native transaction must not spend another preparation attempt');}
 finally{release();await write;}
 clock.advance(50);let result;for(let i=0;i<200;i++){result=await h.view();if(result.state!=='preparing')break;await drain();}
 assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(pages(),2);
});
for(const ending of ['revoke','stop','timeout','rollback'])test('MOCK_IDB native write scheduling hint is exact-scope and fails closed on '+ending,async t=>{
 const {h,clock}=await pendingNativePreparation(t),native=h.service.nativeRepository,apply=native.apply.bind(native);let entered=false,release;
 const held=new Promise(resolve=>release=resolve);native.apply=async(...args)=>{entered=true;await held;return apply(...args);};
 const write=h.observe(['p1','pending-project']).then(()=>({ok:true}),error=>({ok:false,error}));for(let i=0;i<100&&!entered;i++)await drain();assert.equal(entered,true);
 const pending=h.service.observations.isNativeWritePending;
 try{assert.equal(pending(h.bound.scope),true);for(const foreign of ['',undefined,null,'another-scope'])assert.equal(pending(foreign),false);
  if(ending==='revoke')h.service.invalidate({tabId:1});else if(ending==='stop')h.service.stop();else clock.advance(ending==='timeout'?6000:-1);
  assert.equal(pending(h.bound.scope),false);
 }finally{release();await write;}
 assert.equal(pending(h.bound.scope),false);
});

test('MOCK_IDB finite pass packet gaps cannot spend the initial attempt; both surfaces share its terminal read',async t=>{
 const clock=preparationClock(),h=await fixture(t,{elapsedNow:clock.now,schedule:clock.schedule,cancel:clock.cancel});await h.bind();assert.equal((await h.pass()).ok,true);await h.observe();await h.mount();
 let pages=0,ended=false;const native=h.service.nativeRepository,original=native.page.bind(native);
 native.page=async(...args)=>{const value=await original(...args);if(args[1]?.limit!==512){pages++;if(!ended)await h.observe(['p1','racing_'+pages]);}return value;};
 assert.equal((await h.view()).state,'preparing');
 for(let i=0;i<6;i++){clock.advance(50);await drain();await h.observe(['p1','finite_'+i]);assert.equal((await h.view('sidebar')).state,'preparing');assert.equal(h.service.observations.isNativeWritePending(h.bound.scope),false,'fixture is between actual packets');}
 assert.equal(pages,0,'finite pass must bridge idle transaction gaps before the first counted read');ended=true;assert.equal((await h.pass('end')).ok,true);clock.advance(50);assert.equal((await ready(h)).state,'ready');assert.equal((await h.view('sidebar')).state,'ready');assert.equal(pages,1);
});
test('MOCK_IDB a finite pass arriving during one counted retry prevents gap-driven retry exhaustion',async t=>{
 const {h,clock,pages}=await pendingNativePreparation(t);assert.equal((await h.pass()).ok,true);
 for(let i=0;i<5;i++){clock.advance(60);await drain();assert.equal(pages(),1);await h.observe(['p1','between_'+i]);assert.equal((await h.view('sidebar')).state,'preparing');}
 assert.equal((await h.pass('end')).ok,true);clock.advance(50);assert.equal((await ready(h)).state,'ready');assert.equal(pages(),2);
});
test('MOCK_IDB lost end and successive pass starts cannot extend the original thirty-second preparation',async t=>{
 const clock=preparationClock(),h=await fixture(t,{elapsedNow:clock.now,schedule:clock.schedule,cancel:clock.cancel});await h.bind();await h.observe();await h.mount();await h.pass();let headers=0;const original=h.service.nativeRepository.page.bind(h.service.nativeRepository);h.service.nativeRepository.page=(...args)=>{headers++;return original(...args);};
 assert.equal((await h.view()).state,'preparing');for(let i=1;i<=5;i++){clock.advance(5000);await h.pass('start',i+1);assert.equal((await h.view('sidebar')).state,'preparing');}
 clock.advance(5000);assert.equal((await h.view()).reason,'read-budget-exhausted');assert.equal(headers,0);await h.pass('end',6);await h.pass('start',7);clock.advance(50);assert.equal((await h.view('sidebar')).reason,'read-budget-exhausted');assert.equal(headers,0);
});
for(const delayedTimer of [false,true])test('MOCK_IDB pass ending at 29s cannot lend a fresh owner budget, delayed timer '+delayedTimer,async t=>{
 const clock=preparationClock(),h=await fixture(t,{elapsedNow:clock.now,schedule:clock.schedule,cancel:clock.cancel});await h.bind();await h.observe();await h.mount();await h.pass();assert.equal((await h.view()).state,'preparing');clock.advance(29000);await h.pass('end');
 let entered=false,release;const original=h.service.nativeRepository.page.bind(h.service.nativeRepository),held=new Promise(resolve=>release=resolve);h.service.nativeRepository.page=async(...args)=>{entered=true;await held;return original(...args);};clock.advance(50);for(let i=0;i<100&&!entered;i++)await drain();assert(entered);
 if(delayedTimer)clock.jump(950);else clock.advance(950);assert.equal((await h.view()).reason,'read-budget-exhausted');release();await drain();assert.equal((await h.view('sidebar')).reason,'read-budget-exhausted');
});
test('MOCK_IDB completed or replaced preparation clears its old absolute expiry callback',async t=>{
 const clock=preparationClock(),h=await fixture(t,{elapsedNow:clock.now,schedule:clock.schedule,cancel:clock.cancel});await h.bind();await h.observe();await h.mount();await h.pass();await h.view();const stale=clock.timers.find(timer=>timer.at===30000).fn;
 await h.pass('end');clock.advance(50);assert.equal((await ready(h)).state,'ready');clock.advance(29000);await h.observe(['p1','new_cycle']);assert.equal((await h.view()).state,'preparing');assert.equal((await ready(h)).state,'ready');clock.jump(1000);stale();assert.equal((await h.view()).state,'ready');
});
