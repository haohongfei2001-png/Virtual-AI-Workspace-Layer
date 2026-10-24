import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostBindingService} from '../../src/runtime/host-binding-service.mjs';
import {createBrowserLocalAuthority} from '../../src/runtime/browser-local-authority.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
import {ScopeRepository} from '../../src/b1/scope-repository.mjs';
import {createURLPolicy} from '../../src/host/url-policy.mjs';
const url='https://chatgpt.com/',C='33333333-3333-4333-8333-333333333333';
test('local namespace cannot alias a strict principal and session never reaches IDB',async()=>{
 const local=normalizedScope({kind:'browser-local',storage:'session',spaceId:'local'});
 const strict=normalizedScope({verified:true,provider:'browser-local',accountId:'session',organizationId:'local'});
 assert.notEqual(local.key,strict.key);assert.equal(local.verified,undefined);assert.equal(local.accountId,undefined);
 assert.equal(normalizedScope({...local,verified:true}),null);
 const repo=new ScopeRepository({indexedDB:{open(){assert.fail('must not open');}}});
 await assert.rejects(repo.get(local,C),/memory-only/);
});
test('document authority has no server receipts, expires grants but retains the selection; a new authority starts empty',async()=>{
 let time=1000,i=0;const discarded=[];
 const authority=createBrowserLocalAuthority({allowedURL:u=>u.startsWith(url),now:()=>time,makeId:()=>`local_${++i}`,onDiscard:k=>discarded.push(k)});
 const frame={tabId:1,frameId:0,documentId:'doc',incognito:false,documentLifecycle:'active',actualURL:url};
 const result=await authority.refresh(frame,'bind');assert.equal(result.state,'verified');assert.equal(result.grant.kind,'browser-local-session');assert.equal(result.grant.principal,undefined);assert.equal(authority.sourceFor(frame),null);
 const old=authority.scopeFor(frame);assert.equal(authority.scopeFor({...frame,tabId:2}),null);
 time+=60000;assert.equal(authority.peek(frame).state,'unverified');assert.deepEqual(discarded,[]);
 assert.equal(createBrowserLocalAuthority({allowedURL:()=>true}).scopeFor(frame),null);
 await authority.refresh(frame,'bind');assert.equal(authority.scopeFor(frame).key,old.key);
 authority.invalidateTab(1);assert.equal(authority.scopeFor(frame),null);assert.deepEqual(discarded,[old.key]);
 const aborted=new AbortController();aborted.abort();assert.equal((await authority.refresh(frame,'bind',aborted.signal)).state,'unverified');
});
test('actual Host pipeline accepts current surface into formal projection with zero identity/IDB reads',async t=>{
 let i=0;const frames=new Map(),profile={id:'local-test-surface',revision:1,urlPolicy:createURLPolicy()};
 const service=createHostBindingService({extensionId:'ext',getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),allowedURL:u=>u.startsWith(url),profile:{id:'browser-local-session',singlePersonalDefault:false},provider:{read(){assert.fail('identity must remain off');}},repository:{open(){assert.fail('old database must remain unopened');}},surfaceProfiles:new Map([[profile.id,profile]]),uiURL:'chrome-extension://ext/ui.html',makeId:()=>`local_${++i}`});t.after(()=>service.stop());
 const sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url};frames.set('1:0',{documentId:'doc',url,documentLifecycle:'active',parentFrameId:-1});
 const hello=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender);assert.equal(hello.ok,true);
 const {documentToken,producerToken,routeEpoch}=hello.binding,packet={documentToken,producerToken,routeEpoch};
 const refresh=await service.handle({v:1,type:'HOST_REFRESH',clientId:'client',seq:2,...packet},sender);assert.equal(refresh.state,'verified',JSON.stringify(refresh));
 const frame={tabId:1,frameId:0,documentId:'doc',incognito:false,documentLifecycle:'active',actualURL:url},scope=service.authority.scopeFor(frame);
 assert.equal(scope.kind,'browser-local');
 const evidence={profileId:profile.id,profileVersion:1,sourceKind:'native-dom',regionEpoch:1,fieldPaths:['history','href'],receiptId:null};
 const proposal={protocol:'vaiwl-host-observation/1',...packet,localSeq:1,profileId:profile.id,profileVersion:1,bodyProofId:null,kind:'surface-delta',payload:{candidates:[{renderKey:'conversation:'+C,entity:'conversation',nativeTitle:'Visible native title',titleState:'exact',target:{kind:'resolved',entity:'conversation',nativeId:C,navigationURL:url+'c/'+C,liveHandle:null},evidence}],membershipClaims:[{conversationId:C,asserted:'UNKNOWN',projectId:null,reason:'missing',evidence}],coverageClaims:[],detachedHandles:[]}};
 const observed=await service.handle(proposal,sender);assert.equal(observed.state,'accepted',JSON.stringify(observed));
 const snapshot=await service.readService.freeSnapshot(scope,{guard:()=>true});assert.equal(snapshot.refs.length,1);assert.equal(snapshot.refs[0].displayTitle,'Visible native title');assert.equal(snapshot.refs[0].membership,'UNKNOWN');
 // The actual UI owner/read service uses the same formal frame DTO pipeline.
 assert.equal((await service.handle({v:1,type:'HOST_UI_MOUNT',...packet,mountId:'mount',regionEpoch:1},sender)).ok,true);
 const ui={...sender,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};frames.set('1:2',{documentId:'ui',url:ui.url,documentLifecycle:'active',parentFrameId:0});
 const [joined,confirmed]=await Promise.all([service.handle({v:1,type:'HOST_UI_JOIN',nonce:'nonce',role:'workspace'},ui),service.handle({v:1,type:'HOST_UI_CONFIRM',...packet,mountId:'mount',regionEpoch:1,nonce:'nonce',role:'workspace'},sender)]);assert(joined.ok&&confirmed.ok);
 let view;for(let n=0;n<20;n++){view=await service.handle({v:1,type:'HOST_UI_VIEW',grantId:joined.grant.id,mountId:'mount',query:{}},ui);if(view.state!=='preparing')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(view.ok,true,JSON.stringify(view));assert.notEqual(view.state,'preparing');assert(JSON.stringify(view).includes('Visible native title'));
 service.invalidate({tabId:1});assert.equal(service.authority.scopeFor(frame),null);
 assert.equal((await service.handle({v:1,type:'HOST_UI_VIEW',grantId:joined.grant.id,mountId:'mount',query:{}},ui)).ok,false);
 assert.equal((await service.handle(proposal,sender)).state,'rejected');
});

test('local foreground and periodic renewal share a live grant without revoking the same document',async t=>{
 let i=0,time=1000;const frame={tabId:1,frameId:0,documentId:'doc',incognito:false,documentLifecycle:'active',actualURL:url};
 const sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'doc',documentLifecycle:'active',url};
 const service=createHostBindingService({extensionId:'ext',getFrame:async()=>({documentId:'doc',url,documentLifecycle:'active',parentFrameId:-1}),allowedURL:u=>u===url,profile:{id:'browser-local-session'},surfaceProfiles:new Map(),provider:{read(){assert.fail('no identity request');}},repository:{open(){assert.fail('no database access');}},now:()=>time,makeId:()=>`local_${++i}`});t.after(()=>service.stop());
 const {binding}=await service.handle({v:1,type:'HOST_HELLO',clientId:'client',seq:1},sender),{documentToken,producerToken,routeEpoch}=binding;
 let seq=1;const request=type=>service.handle({v:1,type,clientId:'client',seq:++seq,documentToken,producerToken,routeEpoch},sender);
 assert.equal((await request('HOST_REFRESH')).state,'verified');const original=service.authority.peek(frame).grant;
 const pair=await Promise.all([request('HOST_FOCUS'),request('HOST_REFRESH')]);
 assert(pair.every(r=>r.ok===true&&r.state==='verified'),JSON.stringify(pair));
 assert.equal(service.authority.isCurrentGrant(frame,original),true,'original unexpired proof remains current');
 // Extend current leases while preserving the original document transport.
 for(let n=0;n<5;n++){time+=10000;assert.equal((await request('HOST_DOCUMENT_RENEW')).ok,true);assert.equal((await request('HOST_REFRESH')).state,'verified');}
 const near=service.authority.peek(frame).grant;
 const next=await Promise.all([request('HOST_REFRESH'),request('HOST_FOCUS')]);
 assert(next.every(r=>r.ok===true&&r.state==='verified'),JSON.stringify(next));
 assert.equal(service.authority.isCurrentGrant(frame,near),true);assert.notEqual(near,original);assert.equal(near.id,original.id);
 assert.equal(service.authority.isCurrentGrant(frame,{...near}),false,'a copied descriptor is not an issued proof');
 time+=10000;assert.equal(service.authority.isCurrentGrant(frame,original),false,'renewal must not extend the original proof expiry');
 assert.equal((await request('HOST_FOCUS')).state,'verified','no persistent producer denial');
 service.invalidate({tabId:1});assert.equal(service.authority.peek(frame).state,'unverified');
 assert.equal((await request('HOST_FOCUS')).ok,false,'real revocation still rejects the old document binding');
});

test('another tab cannot prune the verified producer of a renewed local document',async t=>{
 let time=1000,i=0;const frames=new Map();
 const service=createHostBindingService({extensionId:'ext',getFrame:async({tabId})=>frames.get(tabId),surfaceProfiles:new Map(),allowedURL:u=>u===url,profile:{id:'browser-local-session'},provider:{read(){assert.fail('no identity request');}},repository:{open(){assert.fail('no database access');}},now:()=>time,makeId:()=>`local_${++i}`});t.after(()=>service.stop());
 const sender=tabId=>({id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:'doc'+tabId,documentLifecycle:'active',url});
 const bind=async tabId=>{frames.set(tabId,{documentId:'doc'+tabId,url,documentLifecycle:'active',parentFrameId:-1});const {binding:{documentToken,producerToken,routeEpoch}}=await service.handle({v:1,type:'HOST_HELLO',clientId:'client'+tabId,seq:1},sender(tabId));let seq=1;return type=>service.handle({v:1,type,clientId:'client'+tabId,seq:++seq,documentToken,producerToken,routeEpoch},sender(tabId));};
 const first=await bind(1);assert.equal((await first('HOST_REFRESH')).state,'verified');
 const frame={tabId:1,frameId:0,documentId:'doc1',actualURL:url,documentLifecycle:'active',incognito:false};
 await service.authority.bindPersonal(frame,'personal-space');assert.equal((await first('HOST_REFRESH')).state,'verified');
 time+=15000;assert.equal((await first('HOST_DOCUMENT_RENEW')).ok,true);
 time+=6000;const second=await bind(2);assert.equal((await second('HOST_REFRESH')).state,'verified');
 const focused=await first('HOST_FOCUS');assert.equal(focused.state,'verified',JSON.stringify(focused));
 assert.equal(service.authority.scopeFor(frame).storage,'personal');
 service.invalidate({tabId:1});assert.equal((await first('HOST_FOCUS')).ok,false,'revocation still wins');
});
