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
async function fixture(t,{prepareNavigation=null,presentSurface=null,documentURL=url}={}){
 const base=new ScopeRepository({indexedDB:new MockIDBFactory(),databaseName:'host-read-binding'});t.after(()=>base.close());
 const workspaces=new WorkspaceRepository({baseRepository:base,clock:()=>NOW});
 const evidence=new FreeEvidenceRepository({baseRepository:base,clock:()=>NOW});
 let n=0,seq=0,principal='fixture-principal',time=Date.parse(NOW),providerReads=0;
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:documentURL};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const service=createHostBindingService({extensionId:'extension',prepareNavigation,presentSurface,uiURLs,getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),getFrame:async()=>({documentId:'document',documentLifecycle:'active',url:documentURL}),allowedURL:value=>value===documentURL,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>{providerReads++;return {principalId:principal,expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'};}},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`token_${++n}`});
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
 const present=(role,intent,patch={},as=children[role])=>service.handle({v:1,type:'HOST_UI_PRESENT',grantId:grants[role].id,mountId:'mount',intent,...patch},as);
 const horizon=(role,extra={},as=children[role])=>service.handle({v:1,type:'HOST_UI_SET_HORIZON',grantId:grants[role].id,mountId:'mount',operationId:'set_horizon',expectedRevision:0,H:14,segment:0,anchorRefId:null,...extra},as);
 async function renew(){const auth={documentToken:binding.documentToken,producerToken:binding.producerToken,routeEpoch:binding.routeEpoch};const doc=await request('HOST_DOCUMENT_RENEW',auth);assert.equal(doc.ok,true,JSON.stringify(doc));binding=doc.binding;const refresh=await request('HOST_REFRESH',auth);const status=await service.handle({v:1,type:'HOST_UI_STATUS',...auth,mountId:'mount'},sender);return {refresh,status};}
 return{renew,get providerReads(){return providerReads;},horizon,present,base,workspaces,evidence,service,request,bind,observe,mount,view,grants,sender,children,setTime:value=>{time=value;},get bound(){return bound;},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
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
 h.workspaces.command=async(...args)=>{entered=true;await held;return original(...args);};
 const pending=h.horizon('sidebar',{expectedRevision:initial.page.workspaceRevision,H:90});for(let i=0;i<50&&!entered;i++)await drain();assert.equal(entered,true);
 assert.equal((await original(scope,{operationId:'concurrent_manual_title',expectedRevision:initial.page.workspaceRevision,command:{type:'SET_TITLE',refId:'c1',title:'Concurrent manual title'}})).ok,true);release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'revision-conflict');assert.equal(result.viewSession,undefined);
 const after=(await h.workspaces.read(scope)).state;assert.equal(after.identities.c1.title,'Concurrent manual title');assert.equal(after.preferences.freeTimePolicy,undefined);assert.deepEqual((await ready(h)).page.viewSession,initial.page.viewSession);
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
 const h=await fixture(t);h.setTime(Date.parse(NOW)-10000);await h.bind();await h.observe();await h.mount();const initial=await ready(h);assert.equal(initial.state,'ready');h.setTime(Date.parse(NOW)+1000);
 const result=await h.horizon('workspace',{H:'auto',operationId:'auto_after_midnight',expectedRevision:initial.page.workspaceRevision,segment:2});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.viewSession.T,initial.page.viewSession.T);assert.equal(result.viewSession.Z,initial.page.viewSession.Z);assert.equal(result.viewSession.H,initial.page.viewSession.H);assert.equal(result.segment,2);
 const policy=(await h.workspaces.read(workspaceScope(h))).state.preferences.freeTimePolicy.value;assert.equal(policy.lastChangedDay,initial.page.viewSession.T+1);assert.equal(policy.lastEvaluatedDay,null);assert.deepEqual((await ready(h)).page.viewSession,result.viewSession);
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
