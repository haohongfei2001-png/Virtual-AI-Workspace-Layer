import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostViewService} from '../../src/runtime/host-view-service.mjs';
import {normalizedScope} from '../../src/b1/identity.mjs';
const scope=normalizedScope({verified:true,provider:'chatgpt',accountId:'A',organizationId:'personal'}),NOW='2026-10-14T00:00:00Z';
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(t){
 let time=0,next=0,writing=false;const timers=new Map(),calls={header:0,page:0,version:0};
 const header={scope:scope.key,revision:1,workspaceRevision:0,evidenceRevision:'0:0',viewRevision:0,viewMode:'free',manifest:{projectVersions:{},refVersions:{c:1},activityVersions:{c:'0'}},viewSession:{H:30,T:20740,Z:'UTC',policyRevision:0},preferences:{},view:null};
 const read={async freeHeader(){calls.header++;return structuredClone(header);},async freePage(s){calls.page++;return {scope:s.key,revision:1,workspaceRevision:0,evidenceRevision:'0:0',projects:[],refs:[{id:'c',scope:s.key,nativeTitle:'Native conversation',nativeUrl:'https://chatgpt.com/c/c',membership:'NONE',projectId:null,activityDecision:{basis:'provisional',candidateDay:20740,segment:0}}]};},async version(){calls.version++;return {nativeRevision:1,revision:0,evidenceRevision:'0:0',viewRevision:0};}};
 const context={scope,scopeGrantId:'scope-grant',role:'workspace',parentFrame:{tabId:1,documentId:'doc',actualURL:'https://chatgpt.com/'},binding:{},isCurrent:()=>true};
 const ui={withScope:async(_,work)=>work(context)},repository={command:async()=>({ok:true,revision:1})};
 const service=createHostViewService({ui,readService:read,workspaceRepository:repository,presentSurface:async()=>({ok:true}),nativeWritePending:()=>writing,clock:()=>NOW,elapsedNow:()=>time,schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});t.after(()=>service.stop());
 return {service,read,ui,repository,context,calls,header,timers,write:value=>writing=value,request:()=>service.handle({v:1,type:'HOST_UI_VIEW',grantId:'grant',mountId:'mount',query:{}},{}),async advance(ms){time+=ms;for(const [id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await flush();}};
}
test('preparing response is not idle while background header is unresolved; pure cache is idle',async t=>{
 const f=fixture(t),gate=deferred();f.read.freeHeader=()=>gate.promise;
 assert.equal(f.service.isIdle(),true);assert.equal((await f.request()).state,'preparing');assert.equal(f.service.isIdle(),false);
 gate.resolve(f.header);await flush();assert.equal(f.service.isIdle(),true);assert.equal((await f.request()).state,'ready');assert.equal(f.service.isIdle(),true);
 f.service.stop();assert.equal(f.service.isIdle(),false);
});
for(const method of ['freeHeader','freePage','version'])for(const outcome of ['resolve','reject'])test('timed-out owner retains nonidle until underlying '+method+' '+outcome+'s',async t=>{
 const f=fixture(t),gate=deferred(),original=f.read[method];let args;f.read[method]=(...values)=>{args=values;return gate.promise;};
 assert.equal((await f.request()).state,'preparing');await flush();await f.advance(6000);
 assert.equal((await f.request()).ok,false);assert.equal(f.service.isIdle(),false);
 if(outcome==='resolve')gate.resolve(await original(...args));else gate.reject(Error('late-read-error'));await flush();assert.equal(f.service.isIdle(),true);
});
test('removing a mount cannot hide unresolved underlying read from local idle',async t=>{
 const f=fixture(t),gate=deferred();f.read.freeHeader=()=>gate.promise;
 await f.request();await flush();f.service.revokeMount('mount');await flush();assert.equal(f.service.isIdle(),false);
 gate.resolve(f.header);await flush();assert.equal(f.service.isIdle(),true);
});
test('scheduled retry stays nonidle between completed refresh attempts',async t=>{
 const f=fixture(t);let versions=0;f.read.version=async()=>({nativeRevision:++versions===1?2:1,revision:0,evidenceRevision:'0:0',viewRevision:0});
 await f.request();await flush();assert.equal(f.service.isIdle(),false);assert([...f.timers.values()].some(v=>v.at===50));
 await f.advance(50);assert.equal(f.service.isIdle(),true);assert.equal((await f.request()).state,'ready');
});
test('native write deferral is nonidle without starting a read or changing its original budget',async t=>{
 const f=fixture(t);f.write(true);assert.equal((await f.request()).state,'preparing');assert.equal(f.calls.header,0);assert.equal(f.service.isIdle(),false);
 for(let i=0;i<3;i++){assert.equal(f.service.isIdle(),false);assert.equal(f.calls.header,0);}
 await f.advance(29999);assert.equal(f.service.isIdle(),false);await f.advance(1);assert.equal(f.service.isIdle(),true);assert.equal(f.calls.header,0);assert.equal((await f.request()).reason,'read-budget-exhausted');
});
test('refreshScope starts tracked background work even without an outstanding view RPC',async t=>{
 const f=fixture(t);await f.request();await flush();assert.equal(f.service.isIdle(),true);
 const gate=deferred();f.read.freeHeader=()=>gate.promise;f.service.refreshScope(scope.key);assert.equal(f.service.isIdle(),false);
 gate.resolve(f.header);await flush();assert.equal(f.service.isIdle(),true);
});

const scopeEntries=[
 ['handle',{type:'HOST_UI_VIEW',query:{}}],
 ['resume',{type:'HOST_UI_RESUME'}],
 ['enterCurrent',{type:'HOST_UI_CURRENT_ENTRY',expectedRevision:0,viewSession:{H:30,T:20740,Z:'UTC',policyRevision:0}}],
 ['undoAutoHorizon',{type:'HOST_UI_UNDO_AUTO_HORIZON',operationId:'op',expectedRevision:0,id:'undo'}],
 ['setHorizon',{type:'HOST_UI_SET_HORIZON',operationId:'op',expectedRevision:0,H:7,segment:0,anchorRefId:null}],
 ['setWorkingSet',{type:'HOST_UI_WORKING_SET',operationId:'op',expectedRevision:0,action:'add',refId:'c'}],
 ['present',{type:'HOST_UI_PRESENT',intent:{kind:'show-workspace'}}],
];
for(const [method,message]of scopeEntries)for(const outcome of ['resolve','reject'])test(method+' tracks scope authorization beyond deadline until late '+outcome,async t=>{
 const f=fixture(t),gate=deferred();f.ui.withScope=async(_,work)=>{await gate.promise;return work(f.context);};
 const pending=f.service[method]({v:1,grantId:'grant',mountId:'mount',...message},{});await flush();const during=f.service.isIdle();
 await f.advance(6000);assert.equal((await pending).ok,false);const afterDeadline=f.service.isIdle();
 if(outcome==='resolve')gate.resolve();else gate.reject(Error('late-scope-rejection'));await flush();
 assert.equal(during,false);assert.equal(afterDeadline,false);assert.equal(f.service.isIdle(),true);
});
for(const [method,message]of scopeEntries.filter(([method])=>['handle','enterCurrent','setHorizon','setWorkingSet'].includes(method)))for(const outcome of ['resolve','reject'])test(method+' tracks direct dependency beyond deadline until late '+outcome,async t=>{
 const f=fixture(t);await f.request();await flush();assert.equal((await f.request()).state,'ready');
 const gate=deferred();let called=false;const hold=()=>{called=true;return gate.promise;};
 if(['handle','enterCurrent'].includes(method))f.read.version=hold;else f.repository.command=hold;
 const pending=f.service[method]({v:1,grantId:'grant',mountId:'mount',...message},{});await flush();assert.equal(called,true);
 await f.advance(6000);assert.equal((await pending).ok,false);const afterDeadline=f.service.isIdle();
 if(outcome==='resolve')gate.resolve(method==='handle'||method==='enterCurrent'?{nativeRevision:1,revision:0,evidenceRevision:'0:0',viewRevision:0}:{ok:true,revision:1});else gate.reject(Error('late-dependency-rejection'));await flush();
 assert.equal(afterDeadline,false);assert.equal(f.service.isIdle(),true);
});
