/** Owner API contracts with explicit frame/handshake/authority test doubles. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createHostUiOwner} from '../../src/runtime/host-ui-owner.mjs';
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture({onRevokeMount=()=>{}}={}){let time=0,id=0,delay=null,frameHook=null,bound=true,proof={state:'verified',grant:{id:'scope',scopeKey:'scope-key',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}};const timers=new Map();const parent={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'parent',documentLifecycle:'active',url:'https://chatgpt.com/'},ui={...parent,frameId:2,documentId:'ui',url:'chrome-extension://ext/ui.html'};
 const sidebar={...ui,frameId:3,documentId:'sidebar'},frames=new Map();
 const getFrame=async({frameId})=>{if(delay)await delay;if(frameHook)await frameHook(frameId);const s=frames.get(frameId)??(frameId===0?parent:frameId===3?sidebar:ui);return {documentId:s.documentId,url:s.url,documentLifecycle:'active',parentFrameId:frameId===0?-1:0};};
 const owner=createHostUiOwner({onRevokeMount,extensionId:'ext',uiURL:ui.url,getFrame,handshake:{isBound:()=>bound,verify:async(m,s)=>s.documentId===parent.documentId&&m.documentToken==='doc'&&m.producerToken==='producer'&&m.routeEpoch===1,matchesFrame:(m,s,f)=>f.documentId===s.documentId&&f.url===s.url},authority:{peek:()=>proof,scopeFor:()=>bound&&proof?.state==='verified'&&Date.parse(proof.grant.expiresAt)>time?{key:proof.grant.scopeKey}:null},now:()=>time,elapsedNow:()=>time,makeId:()=>`grant_${++id}`,maxPending:1,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},cancel:key=>timers.delete(key)});
 const binding={documentToken:'doc',producerToken:'producer',routeEpoch:1};const msg=(type,extra={})=>({v:1,type,...extra});
 return {owner,parent,ui,sidebar,frames,timers,setFrameHook:hook=>frameHook=hook,setBound:v=>bound=v,setProof:v=>proof=v,async mount(){assert.equal((await owner.handle(msg('HOST_UI_MOUNT',{...binding,mountId:'mount',regionEpoch:1}),parent)).ok,true);},confirm:(nonce='nonce',extra={})=>owner.handle(msg('HOST_UI_CONFIRM',{...binding,mountId:'mount',regionEpoch:1,nonce,role:'workspace',...extra}),parent),join:(nonce='nonce',extra={},sender=ui)=>owner.handle(msg('HOST_UI_JOIN',{nonce,role:'workspace',...extra}),sender),release:()=>owner.handle(msg('HOST_UI_RELEASE',{...binding,mountId:'mount'}),parent),renew:grant=>owner.handle(msg('HOST_UI_RENEW',{grantId:grant.id,mountId:'mount'}),ui),block(){let resolve;delay=new Promise(r=>resolve=r);return ()=>{delay=null;resolve();};},async advance(ms){time+=ms;for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await tick();}};
}
for(const order of ['parent','ui'])test(`MOCK dual channel ${order} first gets identical grant and renew/release`,async()=>{const f=fixture();await f.mount();const first=order==='parent'?f.confirm():f.join();await tick();const second=order==='parent'?f.join():f.confirm();const [a,b]=await Promise.all([first,second]);assert(a.ok&&b.ok,JSON.stringify([a,b]));assert.deepEqual(a.grant,b.grant);assert.equal((await f.renew(a.grant)).ok,true);assert.equal((await f.release()).ok,true);await assert.rejects(f.owner.validate({sender:f.ui,grantId:a.grant.id,mountId:'mount'}));assert.equal(f.timers.size,0);});
test('MOCK wrong WAR role binding and mount fail closed',async()=>{const f=fixture();await f.mount();assert.equal((await f.join('a',{}, {...f.ui,url:'chrome-extension://ext/other.html'})).ok,false);assert.equal((await f.join('b',{role:'invalid'})).ok,false);assert.equal((await f.confirm('c',{documentToken:'wrong'})).ok,false);assert.equal((await f.confirm('d',{mountId:'unknown'})).ok,false);assert.equal(f.timers.size,0);});
test('MOCK unpaired channel expires at six seconds and frees pending capacity',async()=>{const f=fixture();await f.mount();const pending=f.join();await tick();await f.advance(6000);assert.equal((await pending).ok,false);const a=f.confirm('new');await tick();const b=f.join('new');const results=await Promise.all([a,b]);assert.ok(results.every(r=>r.ok),JSON.stringify(results));});
test('MOCK late pairing after deadline must not publish or retain grant',async()=>{const f=fixture();await f.mount();const a=f.join();await tick();const unblock=f.block(),b=f.confirm();await tick();await f.advance(6000);assert.equal((await a).ok,false);assert.equal((await b).ok,false);unblock();await tick();const next=f.confirm('fresh');await tick();const joined=f.join('fresh');const replies=await Promise.all([next,joined]);assert.ok(replies.every(r=>r.ok),JSON.stringify(replies));});
test('MOCK release during in-flight pair cannot authorize late UI',async()=>{const f=fixture();await f.mount();const a=f.confirm();await tick();const unblock=f.block(),b=f.join();await tick();f.owner.revokeDocument('parent');unblock();const [x,y]=await Promise.all([a,b]);assert.equal(x.ok,false);assert.equal(y.ok,false);});
test('MOCK late pair completion after both timed out cannot leave usable grant',async()=>{const f=fixture();await f.mount();const a=f.confirm();await tick();const unblock=f.block(),b=f.join();await tick();await f.advance(6000);assert.equal((await a).ok,false);assert.equal((await b).ok,false);unblock();await tick();for(let i=1;i<12;i++)await assert.rejects(f.owner.validate({sender:f.ui,grantId:`grant_${i}`,mountId:'mount'}));});
function mockPort(sender,name='vaiwl-ui'){
 const listeners=new Set();return {name,sender,disconnects:0,messages:[],postMessage(message){this.messages.push(structuredClone(message));},onDisconnect:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},disconnect(){this.disconnects++;for(const fn of [...listeners])fn();},drop(){for(const fn of [...listeners])fn();}};
}
async function pair(f){await f.mount();const a=f.confirm();await tick();const [x,y]=await Promise.all([a,f.join()]);assert(x.ok&&y.ok);return y.grant;}
test('MOCK verified parent/mount/tab invalidation synchronously disconnects UI port',async()=>{
 for(const action of [f=>f.owner.revokeDocument('parent'),f=>f.owner.revokeMount('mount'),f=>f.owner.revokeTab(1),f=>f.owner.revokeAll()]){
  const f=fixture(),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);const grant=await pair(f);action(f);assert.equal(port.disconnects,1);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
 }
});
test('MOCK port opened after authorized pairing attaches to exact document ledger',async()=>{const f=fixture(),grant=await pair(f),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);f.owner.revokeDocument('parent');assert.equal(port.disconnects,1);assert.equal((await f.renew(grant)).ok,false);});
test('MOCK authorized port disconnect revokes that UI grant and sibling ports only',async()=>{
 const f=fixture(),a=mockPort(f.ui),b=mockPort(f.ui),other=mockPort({...f.ui,documentId:'unrelated',frameId:3});f.owner.connectPort(a);f.owner.connectPort(b);f.owner.connectPort(other);const grant=await pair(f);a.drop();assert.equal(b.disconnects,1);assert.equal(other.disconnects,0);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
});
test('MOCK unpaired WAR port disconnect cannot revoke a different authorized document',async()=>{const f=fixture(),port=mockPort({...f.ui,documentId:'other',frameId:3});assert.equal(f.owner.connectPort(port),true);const grant=await pair(f);port.drop();assert.equal((await f.renew(grant)).ok,true);});
test('MOCK forged or top-frame port cannot authorize or disconnect valid UI',async()=>{
 const f=fixture(),good=mockPort(f.ui);f.owner.connectPort(good);const grant=await pair(f);
 for(const [sender,name]of [[{...f.ui,id:'foreign'},'vaiwl-ui'],[f.parent,'vaiwl-ui'],[{...f.ui,tab:{id:1,incognito:true}},'vaiwl-ui'],[f.ui,'other'],[{...f.ui,url:'chrome-extension://ext/other.html'},'vaiwl-ui']]){const bad=mockPort(sender,name);assert.equal(f.owner.connectPort(bad),false);bad.drop();}
 assert.equal(good.disconnects,0);assert.equal((await f.renew(grant)).ok,true);
});
test('MOCK valid-looking unpaired port is not a grant and registry remains bounded',async()=>{
 const f=fixture();for(let i=0;i<128;i++)assert.equal(f.owner.connectPort(mockPort({...f.ui,documentId:`anonymous_${i}`,frameId:i+1})),true);
 assert.equal(f.owner.connectPort(mockPort({...f.ui,documentId:'overflow'})),false);await assert.rejects(f.owner.validate({sender:f.ui,grantId:'made-up',mountId:'mount'}));f.owner.revokeAll();assert.equal(f.owner.connectPort(mockPort(f.ui)),true);
});
test('MOCK release disconnects paired UI but tab invalidation does not touch other tabs',async()=>{const f=fixture(),port=mockPort(f.ui),other=mockPort({...f.ui,tab:{id:2,incognito:false},documentId:'other'});f.owner.connectPort(port);f.owner.connectPort(other);await pair(f);assert.equal((await f.release()).ok,true);assert.equal(port.disconnects,1);assert.equal(other.disconnects,0);f.owner.revokeTab(1);assert.equal(other.disconnects,0);});
test('MOCK port disconnect before parent half revokes pending UI join, preventing late grant',async()=>{
 const f=fixture(),port=mockPort(f.ui);assert.equal(f.owner.connectPort(port),true);await f.mount();
 const pending=f.join();await tick();port.drop();
 const confirmed=await f.confirm();assert.equal(confirmed.ok,false);
 assert.equal((await pending).ok,false);
 for(let i=1;i<12;i++)await assert.rejects(f.owner.validate({sender:f.ui,grantId:`grant_${i}`,mountId:'mount'}));
});
test('MOCK port disconnect during actual frame check rejects both late pairing replies',async()=>{
 const f=fixture(),port=mockPort(f.ui);f.owner.connectPort(port);await f.mount();
 const confirmed=f.confirm();await tick();const unblock=f.block(),joined=f.join();await tick();
 port.drop();unblock();const replies=await Promise.all([confirmed,joined]);assert(replies.every(r=>r.ok===false));
});

const statusMessage=(extra={})=>({v:1,type:'HOST_UI_STATUS',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'mount',...extra});
async function pairBoth(f){const workspace=await pair(f),parent=f.confirm('sidebar-nonce',{role:'sidebar'});await tick();const replies=await Promise.all([parent,f.join('sidebar-nonce',{role:'sidebar'},f.sidebar)]);assert.ok(replies.every(r=>r.ok),JSON.stringify(replies));return [workspace,replies[1].grant];}
test('MOCK parent STATUS returns both current renewed grants without changing identities',async()=>{const f=fixture(),prior=await pairBoth(f);await f.advance(1000);const result=await f.owner.handle(statusMessage(),f.parent);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.grants.length,2);for(const grant of result.grants){const old=prior.find(g=>g.role===grant.role);assert.equal(grant.id,old.id);assert.equal(grant.mountId,old.mountId);assert.ok(Date.parse(grant.expiresAt)>Date.parse(old.expiresAt));}assert.equal(f.timers.size,0);});
test('MOCK STATUS rejects missing role, wrong parent, mount and extra authority fields',async()=>{const f=fixture();await pair(f);assert.equal((await f.owner.handle(statusMessage(),f.parent)).ok,false);const g=fixture();await pairBoth(g);for(const [m,s]of [[statusMessage(),{...g.parent,documentId:'other'}],[statusMessage({mountId:'wrong'}),g.parent],[statusMessage({verified:true}),g.parent],[statusMessage(),g.ui]])assert.equal((await g.owner.handle(m,s)).ok,false);});
test('MOCK STATUS and frame heartbeat concurrently renew the same grant successfully',async()=>{const f=fixture(),grants=await pairBoth(f);await f.advance(1000);const resume=f.block(),status=f.owner.handle(statusMessage(),f.parent),renew=f.renew(grants.find(g=>g.role==='workspace'));await tick();resume();const [a,b]=await Promise.all([status,renew]);assert.equal(a.ok,true,JSON.stringify(a));assert.equal(b.ok,true,JSON.stringify(b));assert.deepEqual(a.grants.find(g=>g.role==='workspace'),b.grant);});
test('MOCK revoked document cannot obtain STATUS, including revocation during frame checks',async()=>{for(const during of [false,true]){const f=fixture();await pairBoth(f);let result;if(during){const resume=f.block(),pending=f.owner.handle(statusMessage(),f.parent);await tick();f.owner.revokeDocument('parent');resume();result=await pending;}else{f.owner.revokeDocument('parent');result=await f.owner.handle(statusMessage(),f.parent);}assert.equal(result.ok,false);}});
test('MOCK actual top frame changing during STATUS rejects old sender without grant publication',async()=>{const f=fixture();await pairBoth(f);const resume=f.block(),pending=f.owner.handle(statusMessage(),f.parent);await tick();f.frames.set(0,{...f.parent,documentId:'replacement'});resume();assert.equal((await pending).ok,false);});

test('MOCK scope dirty notification only reaches paired current ports and has exact empty-data shape',async()=>{const f=fixture(),workspace=mockPort(f.ui),sidebar=mockPort(f.sidebar),unpaired=mockPort({...f.ui,documentId:'unpaired',frameId:9});for(const p of [workspace,sidebar,unpaired])f.owner.connectPort(p);await pairBoth(f);assert.equal(f.owner.notifyScope('other-scope'),0);assert.equal(f.owner.notifyScope('scope-key'),2);assert.deepEqual(workspace.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);assert.deepEqual(sidebar.messages,workspace.messages);assert.deepEqual(unpaired.messages,[]);});
test('MOCK expired grant, stale document, revoked parent and changed scope proof get no dirty hints',async()=>{for(const invalidate of [async f=>f.advance(20000),async f=>f.setBound(false),async f=>f.owner.revokeDocument('parent'),async f=>f.setProof({state:'unverified'}),async f=>f.setProof({state:'verified',grant:{id:'new-grant',scopeKey:'scope-key',scopeEpoch:2,expiresAt:new Date(100000).toISOString()}}),async f=>f.setProof({state:'verified',grant:{id:'scope',scopeKey:'other-scope',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}})]){const f=fixture(),port=mockPort(f.ui);f.owner.connectPort(port);await pairBoth(f);await invalidate(f);assert.equal(f.owner.notifyScope('scope-key'),0);assert.deepEqual(port.messages,[]);}});
test('MOCK throwing postMessage revokes only its own UI document and other role still receives hint',async()=>{const f=fixture(),bad=mockPort(f.ui),sibling=mockPort(f.ui),good=mockPort(f.sidebar);bad.postMessage=()=>{throw Error('port closed');};for(const p of [bad,sibling,good])f.owner.connectPort(p);const grants=await pairBoth(f);assert.equal(f.owner.notifyScope('scope-key'),1);assert.equal(bad.disconnects,1);assert.equal(sibling.disconnects,1);assert.equal(good.disconnects,0);assert.deepEqual(good.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grants[0].id,mountId:'mount'}));assert.equal((await f.owner.validate({sender:f.sidebar,grantId:grants[1].id,mountId:'mount'})).role,'sidebar');});

async function mountNotificationFixture(){
 let time=0,sequence=0;const frames=new Map(),bound=new Set(),ports={};
 const proof={state:'verified',grant:{id:'shared_scope',scopeKey:'same-scope',scopeEpoch:1,expiresAt:new Date(100000).toISOString()}};
 const owner=createHostUiOwner({extensionId:'ext',uiURL:'chrome-extension://ext/ui.html',now:()=>time,makeId:()=>`notification_${++sequence}`,getFrame:async({tabId,frameId})=>frames.get(`${tabId}:${frameId}`),handshake:{isBound:(_binding,sender)=>bound.has(sender.documentId),verify:async(binding,sender)=>bound.has(sender.documentId)&&binding.documentToken==='doc'&&binding.producerToken==='producer'&&binding.routeEpoch===1,matchesFrame:(_binding,sender,actual)=>actual?.documentId===sender.documentId&&actual.url===sender.url},authority:{peek:()=>proof,scopeFor:()=>({key:'same-scope'})}});
 const binding={documentToken:'doc',producerToken:'producer',routeEpoch:1};
 for(const [mountId,tabId,base]of [['selected',1,2],['same_tab_other',1,4],['other_tab',2,2]]){
  const parent={id:'ext',tab:{id:tabId,incognito:false},frameId:0,documentId:`parent_${tabId}`,documentLifecycle:'active',url:'https://chatgpt.com/'};
  bound.add(parent.documentId);frames.set(`${tabId}:0`,{documentId:parent.documentId,url:parent.url,documentLifecycle:'active',parentFrameId:-1});
  assert.equal((await owner.handle({v:1,type:'HOST_UI_MOUNT',...binding,mountId,regionEpoch:1},parent)).ok,true);
  ports[mountId]={};
  for(const [i,role]of ['workspace','sidebar'].entries()){
   const sender={...parent,frameId:base+i,documentId:mountId+'_'+role,url:'chrome-extension://ext/ui.html'};
   frames.set(`${tabId}:${sender.frameId}`,{documentId:sender.documentId,url:sender.url,documentLifecycle:'active',parentFrameId:0});
   const port=mockPort(sender);assert.equal(owner.connectPort(port),true);ports[mountId][role]=port;
   const nonce=mountId+'_'+role,join=owner.handle({v:1,type:'HOST_UI_JOIN',nonce,role},sender),confirm=owner.handle({v:1,type:'HOST_UI_CONFIRM',...binding,mountId,regionEpoch:1,nonce,role},parent);
   const replies=await Promise.all([join,confirm]);assert(replies.every(reply=>reply.ok),JSON.stringify(replies));
  }
 }
 const unpaired=mockPort({...ports.selected.workspace.sender,frameId:9,documentId:'unpaired'});assert.equal(owner.connectPort(unpaired),true);
 return {owner,ports,unpaired,elapse:ms=>time+=ms,unbind:documentId=>bound.delete(documentId)};
}
test('MOCK notifyMount targets both current roles and excludes valid same-scope mounts in the same and another tab',async()=>{
 const f=await mountNotificationFixture();assert.equal(f.owner.notifyMount('selected'),2);
 for(const role of ['workspace','sidebar'])assert.deepEqual(f.ports.selected[role].messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);
 for(const id of ['same_tab_other','other_tab'])for(const port of Object.values(f.ports[id]))assert.deepEqual(port.messages,[]);
 assert.deepEqual(f.unpaired.messages,[]);
 assert.equal(f.owner.notifyMount('same_tab_other'),2,'second mount is valid, not merely an unknown-id control');
 for(const port of Object.values(f.ports.same_tab_other))assert.deepEqual(port.messages,[{type:'VAIWL_UI_DATA_CHANGED'}]);
 for(const port of Object.values(f.ports.other_tab))assert.deepEqual(port.messages,[]);
 f.owner.revokeAll();
});
test('MOCK mount notification excludes expired, revoked, unbound and unpaired ports',async()=>{
 for(const invalidate of [f=>f.elapse(20000),f=>f.owner.revokeMount('selected'),f=>f.unbind('parent_1')]){
  const f=await mountNotificationFixture();invalidate(f);assert.equal(f.owner.notifyMount('selected'),0);
  for(const mount of Object.values(f.ports))for(const port of Object.values(mount))assert.deepEqual(port.messages,[]);
  assert.deepEqual(f.unpaired.messages,[]);f.owner.revokeAll();
 }
});

test('MOCK verified parent workspace entry notifies only its exact mount through private ports',async()=>{
 const f=await mountNotificationFixture(),sender={id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'parent_1',documentLifecycle:'active',url:'https://chatgpt.com/'};
 const message={v:1,type:'HOST_UI_WORKSPACE_ENTERED',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'selected'};
 assert.equal((await f.owner.handle(message,sender)).ok,true);
 for(const port of Object.values(f.ports.selected))assert.deepEqual(port.messages,[{type:'VAIWL_UI_WORKSPACE_ENTERED'}]);
 for(const id of ['same_tab_other','other_tab'])for(const port of Object.values(f.ports[id]))assert.deepEqual(port.messages,[]);
 assert.deepEqual(f.unpaired.messages,[]);
 for(const patch of [{mountId:'other_tab'},{mountId:'missing'},{routeEpoch:2},{scope:'forged'},{documentToken:'wrong'}])assert.equal((await f.owner.handle({...message,...patch},sender)).ok,false);
 assert.equal((await f.owner.handle(message,f.ports.selected.workspace.sender)).ok,false);
 assert.equal(f.ports.selected.workspace.messages.length,1);
 f.owner.revokeMount('selected');assert.equal((await f.owner.handle(message,sender)).ok,false);f.owner.revokeAll();
});
test('MOCK expired or unbound parent cannot deliver a workspace-entry hint',async()=>{
 for(const invalidate of [f=>f.elapse(20000),f=>f.unbind('parent_1')]){
  const f=await mountNotificationFixture();invalidate(f);
  await f.owner.handle({v:1,type:'HOST_UI_WORKSPACE_ENTERED',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'selected'},{id:'ext',tab:{id:1,incognito:false},frameId:0,documentId:'parent_1',documentLifecycle:'active',url:'https://chatgpt.com/'});
  for(const port of Object.values(f.ports.selected))assert.deepEqual(port.messages,[]);f.owner.revokeAll();
 }
});

const surfaceMessage=(extra={})=>({v:1,type:'HOST_UI_SURFACE_STATE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'mount',revision:1,workspace:false,sidebar:true,...extra});
const surfaceGet=(grant,extra={})=>({v:1,type:'HOST_UI_SURFACE_STATE_GET',grantId:grant.id,mountId:'mount',...extra});
test('MOCK surface state private ports and GET use each validated role, including nullable unknown',async()=>{
 const f=fixture(),workspace=mockPort(f.ui),sidebar=mockPort(f.sidebar),unpaired=mockPort({...f.ui,frameId:9,documentId:'unpaired'});
 for(const port of [workspace,sidebar,unpaired])f.owner.connectPort(port);
 const grants=await pairBoth(f);
 assert.deepEqual(await f.owner.handle(surfaceGet(grants[0]),f.ui),{ok:true,surface:null});
 assert.deepEqual(await f.owner.handle(surfaceMessage(),f.parent),{ok:true});
 assert.deepEqual(workspace.messages,[{type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:false}]);
 assert.deepEqual(sidebar.messages,[{type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:true}]);
 assert.deepEqual(unpaired.messages,[]);
 for(const [i,sender,visible]of [[0,f.ui,false],[1,f.sidebar,true]])assert.deepEqual(await f.owner.handle(surfaceGet(grants[i]),sender),{ok:true,surface:{revision:1,visible}});
 assert.deepEqual(await f.owner.handle(surfaceMessage({revision:2,workspace:null,sidebar:null}),f.parent),{ok:true});
 for(const [i,sender,port]of [[0,f.ui,workspace],[1,f.sidebar,sidebar]]){
  assert.deepEqual(port.messages.at(-1),{type:'VAIWL_UI_SURFACE_STATE',revision:2,visible:null});
  assert.deepEqual(await f.owner.handle(surfaceGet(grants[i]),sender),{ok:true,surface:{revision:2,visible:null}});
 }
 f.owner.revokeAll();
});
test('MOCK surface revision is a strict high water mark across duplicates, old messages and grant renewal',async()=>{
 const f=fixture(),grant=await pair(f),port=mockPort(f.ui);f.owner.connectPort(port);
 await f.owner.handle(surfaceMessage({revision:7}),f.parent);
 for(const revision of [7,6,1])assert.equal((await f.owner.handle(surfaceMessage({revision,workspace:true}),f.parent)).ok,true);
 assert.equal(port.messages.length,1);
 await f.advance(1000);assert.equal((await f.renew(grant)).ok,true);
 assert.deepEqual(await f.owner.handle(surfaceGet(grant),f.ui),{ok:true,surface:{revision:7,visible:false}});
 await f.owner.handle(surfaceMessage({revision:8,workspace:true}),f.parent);
 assert.deepEqual(port.messages.at(-1),{type:'VAIWL_UI_SURFACE_STATE',revision:8,visible:true});
 assert.equal(port.messages.length,2);f.owner.revokeAll();
});
test('MOCK surface SET rejects malformed revision, booleans, extra fields and forged parent binding',async()=>{
 const f=fixture(),grant=await pair(f),port=mockPort(f.ui);f.owner.connectPort(port);
 const patches=[...[0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null].map(revision=>({revision})),{workspace:0},{sidebar:'false'},{workspace:undefined},{verified:true},{scopeKey:'forged'},{documentToken:'wrong'},{producerToken:'wrong'},{routeEpoch:2},{mountId:'missing'}];
 for(const patch of patches)assert.equal((await f.owner.handle(surfaceMessage(patch),f.parent)).ok,false,JSON.stringify(patch));
 for(const sender of [f.ui,{...f.parent,documentId:'other'},{...f.parent,tab:{id:2,incognito:false}}])assert.equal((await f.owner.handle(surfaceMessage(),sender)).ok,false);
 assert.deepEqual(port.messages,[]);assert.deepEqual(await f.owner.handle(surfaceGet(grant),f.ui),{ok:true,surface:null});f.owner.revokeAll();
});
test('MOCK surface GET rejects extra fields, wrong mount, wrong grant and the sibling role sender',async()=>{
 const f=fixture(),grants=await pairBoth(f);await f.owner.handle(surfaceMessage(),f.parent);
 for(const patch of [{mountId:'wrong'},{grantId:'wrong'},{visible:true},{role:'sidebar'},{documentToken:'doc'}])assert.equal((await f.owner.handle(surfaceGet(grants[0],patch),f.ui)).ok,false);
 assert.equal((await f.owner.handle(surfaceGet(grants[0]),f.sidebar)).ok,false);
 assert.equal((await f.owner.handle(surfaceGet(grants[0]),f.parent)).ok,false);f.owner.revokeAll();
});
for(const [name,invalidate]of [
 ['revoked',f=>f.owner.revokeMount('mount')],['expired',f=>f.advance(20000)],['unbound',f=>f.setBound(false)],
 ['unverified',f=>f.setProof({state:'unverified'})],
 ['wrong-scope',f=>f.setProof({state:'verified',grant:{id:'new-scope',scopeKey:'other-scope',scopeEpoch:2,expiresAt:new Date(100000).toISOString()}})]
])test(`MOCK surface GET and private notification reject ${name} authority`,async()=>{
 const f=fixture(),grant=await pair(f),port=mockPort(f.ui);f.owner.connectPort(port);
 await f.owner.handle(surfaceMessage(),f.parent);port.messages.length=0;await invalidate(f);
 assert.equal((await f.owner.handle(surfaceGet(grant),f.ui)).ok,false);
 await f.owner.handle(surfaceMessage({revision:2}),f.parent);assert.deepEqual(port.messages,[]);f.owner.revokeAll();
});
test('MOCK surface SET rejects unavailable scope and a replaced actual parent',async()=>{
 for(const invalidate of [f=>f.setProof({state:'unverified'}),f=>f.frames.set(0,{...f.parent,documentId:'replacement'}),f=>f.owner.revokeMount('mount')]){
  const f=fixture();await pair(f);invalidate(f);assert.equal((await f.owner.handle(surfaceMessage(),f.parent)).ok,false);f.owner.revokeAll();
 }
});
test('MOCK surface SET awaiting parent cannot mutate a replacement mount with the same id',async()=>{
 const f=fixture();await pair(f);const resume=f.block(),pending=f.owner.handle(surfaceMessage({revision:99}),f.parent);await tick();
 f.owner.revokeMount('mount');const replacement=f.mount();resume();await replacement;
 assert.equal((await pending).ok,false);
 const a=f.confirm('replacement');await tick();const [,reply]=await Promise.all([a,f.join('replacement')]);assert.equal(reply.ok,true);
 assert.deepEqual(await f.owner.handle(surfaceGet(reply.grant),f.ui),{ok:true,surface:null});f.owner.revokeAll();
});
test('MOCK surface GET checks current authority both before and after its snapshot work',async()=>{
 // Each validate checks the parent in grants.validate and again in checkDocument.
 // Checks 3 and 4 therefore occur after withScope has produced its snapshot.
 for(const invalidateAt of [1,3,4]){
  const f=fixture(),grant=await pair(f);await f.owner.handle(surfaceMessage(),f.parent);let parentChecks=0;
  f.setFrameHook(frameId=>{if(frameId===0&&++parentChecks===invalidateAt)f.owner.revokeMount('mount');});
  assert.equal((await f.owner.handle(surfaceGet(grant),f.ui)).ok,false);assert.equal(parentChecks,invalidateAt);f.owner.revokeAll();
 }
});

for(const patch of [{scopeKey:'other-key'},{id:'other-grant'},{scopeEpoch:2}])test(`MOCK surface SET rejects nonempty replacement ${Object.keys(patch)[0]} without advancing state`,async()=>{
 const original={id:'scope',scopeKey:'scope-key',scopeEpoch:1,expiresAt:new Date(100000).toISOString()};
  const f=fixture(),grant=await pair(f),port=mockPort(f.ui);f.owner.connectPort(port);
  assert.equal((await f.owner.handle(surfaceMessage({revision:3}),f.parent)).ok,true);
  f.setProof({state:'verified',grant:{...original,...patch}});
  const rejected=await f.owner.handle(surfaceMessage({revision:99,workspace:true,sidebar:false}),f.parent);
  assert.equal(rejected.ok,false,JSON.stringify(patch));
  assert.deepEqual(port.messages,[{type:'VAIWL_UI_SURFACE_STATE',revision:3,visible:false}]);
  // Restore the original authority to inspect RAM through the public validated GET.
  // A refused replacement-scope update must not poison the original high water mark.
  f.setProof({state:'verified',grant:{...original}});
  assert.deepEqual(await f.owner.handle(surfaceGet(grant),f.ui),{ok:true,surface:{revision:3,visible:false}});
  assert.equal((await f.owner.handle(surfaceMessage({revision:4,workspace:true}),f.parent)).ok,true);
  assert.deepEqual(port.messages.at(-1),{type:'VAIWL_UI_SURFACE_STATE',revision:4,visible:true});
  assert.equal(port.messages.length,2);f.owner.revokeAll();
});

test('MOCK idle tracks underlying renewal after deadline and revocation',async()=>{
 const f=fixture(),grant=await pair(f);assert.equal(f.owner.isIdle(),true);const unblock=f.block(),pending=f.renew(grant);await tick();assert.equal(f.owner.isIdle(),false);await f.advance(6000);assert.equal((await pending).ok,false);f.owner.revokeAll();assert.equal(f.owner.isIdle(),false);unblock();await tick();assert.equal(f.owner.isIdle(),true);
});
for(const fail of [false,true])test('MOCK idle retains scoped user work through revocation '+fail,async()=>{
 const f=fixture(),grant=await pair(f);let release,entered=false;const gate=new Promise(r=>release=r);
 const work=f.owner.withScope({sender:f.ui,grantId:grant.id,mountId:'mount'},async()=>{entered=true;await gate;if(fail)throw Error('late-work');return 1;});
 const checked=assert.rejects(work);await tick();assert.equal(entered,true);assert.equal(f.owner.isIdle(),false);f.owner.revokeAll();assert.equal(f.owner.isIdle(),false);release();await checked;assert.equal(f.owner.isIdle(),true);
});
test('MOCK idle includes direct validation before it settles',async()=>{
 const f=fixture(),grant=await pair(f),unblock=f.block(),work=f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'});assert.equal(f.owner.isIdle(),false);unblock();await work;assert.equal(f.owner.isIdle(),true);
});

test('mount cleanup failure still revokes grants and disconnects old ports without claiming success',async()=>{
 const f=fixture({onRevokeMount:()=>{throw Error('view-cleanup-failed');}}),port=mockPort(f.ui);assert(f.owner.connectPort(port));const grant=await pair(f);
 assert.equal((await f.release()).ok,false);assert.equal(port.disconnects,1);await assert.rejects(f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
});
test('mount cleanup runs once and cannot recursively re-enter itself',async()=>{
 let f,calls=0;f=fixture({onRevokeMount:id=>{calls++;f.owner.revokeMount(id);}});const port=mockPort(f.ui);assert(f.owner.connectPort(port));await pair(f);
 assert.equal((await f.release()).ok,true);assert.equal(calls,1);assert.equal(port.disconnects,1);f.owner.revokeMount('mount');assert.equal(calls,1);
});

function guardedRelease(f,releaseGuard){return f.owner.handle({v:1,type:'HOST_UI_RELEASE',documentToken:'doc',producerToken:'producer',routeEpoch:1,mountId:'mount'},f.parent,{releaseGuard});}
for(const mode of ['busy','throws'])test('private idle release guard '+mode+' preserves existing UI authority',async()=>{
 const f=fixture(),port=mockPort(f.ui);assert(f.owner.connectPort(port));const grant=await pair(f);
 const result=await guardedRelease(f,()=>{if(mode==='throws')throw Error('busy');return false;});assert.equal(result.ok,false);assert.equal(port.disconnects,0);assert(await f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'}));
 f.owner.revokeAll();
});
test('private idle release waits for browser checks and only then evaluates the guard',async()=>{
 const f=fixture(),port=mockPort(f.ui);assert(f.owner.connectPort(port));await pair(f);const unblock=f.block();let calls=0;
 const released=guardedRelease(f,()=>{calls++;return true;});await tick();assert.equal(calls,0);assert.equal(port.disconnects,0);unblock();assert.equal((await released).ok,true);assert.equal(calls,1);assert.equal(port.disconnects,1);
});
test('private idle release cannot bypass another pending UI join',async()=>{
 const f=fixture();await pair(f);const pending=f.join('other');await tick();let calls=0;
 assert.equal((await guardedRelease(f,()=>{calls++;return true;})).ok,false);assert.equal(calls,0);f.owner.revokeAll();await pending;
});
test('private release guard reentrant validation remains counted through revocation point',async()=>{
 const f=fixture(),port=mockPort(f.ui);assert(f.owner.connectPort(port));const grant=await pair(f);let pending;
 const result=await guardedRelease(f,()=>{pending=f.owner.validate({sender:f.ui,grantId:grant.id,mountId:'mount'});return true;});assert.equal(result.ok,false);await pending;assert.equal(port.disconnects,0);f.owner.revokeAll();
});
