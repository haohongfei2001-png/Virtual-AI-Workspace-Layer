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
 let n=0,seq=0,principal='fixture-principal',time=Date.parse(NOW);
 const sender={id:'extension',tab:{id:1,incognito:false},frameId:0,documentId:'document',documentLifecycle:'active',url:documentURL};
 const profile={id:'read-binding-reconstruction',revision:1,urlPolicy:createURLPolicy({profile:{conversationId:value=>value,projectId:({container})=>container}})};
 const uiURLs={workspace:'chrome-extension://extension/workspace.html',sidebar:'chrome-extension://extension/sidebar.html'};
 const children=Object.fromEntries(Object.entries(uiURLs).map(([role,url],i)=>[role,{...sender,frameId:i+1,documentId:'ui_'+role,url}]));
 const service=createHostBindingService({extensionId:'extension',prepareNavigation,presentSurface,uiURLs,getContexts:async({documentIds})=>Object.values(children).filter(c=>documentIds.includes(c.documentId)).map(c=>({contextType:'TAB',documentId:c.documentId,frameId:c.frameId,tabId:1,incognito:false,documentUrl:c.url,documentOrigin:'chrome-extension://extension'})),getFrame:async()=>({documentId:'document',documentLifecycle:'active',url:documentURL}),allowedURL:value=>value===documentURL,repository:base,workspaceRepository:workspaces,freeEvidenceRepository:evidence,provider:{read:async()=>({principalId:principal,expiresAt:'2026-10-14T01:00:00Z',contexts:[{id:'personal',kind:'personal'}],providerProfile:'explicit-test-provider',transport:'worker-fixed-fetch'})},profile:{id:'personal',singlePersonalDefault:true},surfaceProfiles:new Map([[profile.id,profile]]),now:()=>time,makeId:()=>`token_${++n}`});
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
 return{present,base,workspaces,evidence,service,request,bind,observe,mount,view,grants,sender,children,setTime:value=>{time=value;},get bound(){return bound;},switchPrincipal(value){principal=value;service.invalidate({tabId:1,documentId:'document'});}};
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

const hrefPlan=target=>({refId:target.refId,targetKey:'native_target',plan:{mode:'href',planRevision:1,disposition:'same-tab',target:{kind:'resolved',entity:'conversation',nativeId:target.refId,navigationURL:target.navigationURL}}});
test('MOCK_IDB trusted native plan callback receives only current bounded identities and document binding',async t=>{
 const calls=[],h=await fixture(t,{prepareNavigation:async args=>{calls.push(structuredClone(args));return args.targets.map(hrefPlan);}});
 await h.bind();await h.observe();await h.mount();const result=await ready(h);
 assert.equal(result.state,'ready',JSON.stringify(result));assert.equal(calls.length,1);
 assert.deepEqual(calls[0].targets,[{refId:'c1',navigationURL:'https://chatgpt.com/c/c1'}]);
 assert.deepEqual(Object.keys(calls[0]).sort(),['binding','parentFrame','targets']);assert.equal(calls[0].parentFrame.documentId,'document');assert.deepEqual(Object.keys(calls[0].binding).sort(),['documentToken','producerToken','routeEpoch']);assert.equal(typeof calls[0].binding.documentToken,'string');
 assert.deepEqual(result.navigation,[hrefPlan(calls[0].targets[0])]);
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
