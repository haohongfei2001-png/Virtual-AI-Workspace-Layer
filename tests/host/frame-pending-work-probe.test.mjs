import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './free-frame-client.test.mjs';
import {instrumentFramePendingWork,framePendingWorkIsIdle,mountedFrameOwners,sameFrameOwners} from './frame-pending-work-probe.mjs';
const base=new URL('../../src/host/free-frame-client.mjs',import.meta.url),raw=await readFile(base,'utf8');
const source=instrumentFramePendingWork(raw).replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,base).href}'`);
const {createFreeFrameClient}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const layout={segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:312,sidebarScroll:22,sidebarVisible:true};
test('dormancy samples actual roles without requiring an unsupported sidebar',()=>{
 const origin='chrome-extension://fixture',make=(role,detached=false)=>({url:()=>`${origin}/${role}.html`,isDetached:()=>detached});
 const workspace=make('workspace'),sidebar=make('sidebar'),first=mountedFrameOwners([workspace],origin);
 assert.deepEqual(first,[{role:'workspace',frame:workspace}]);
 assert(sameFrameOwners(first,mountedFrameOwners([workspace],origin)));
 const both=mountedFrameOwners([sidebar,workspace],origin);assert.equal(both.length,2);
 assert.equal(sameFrameOwners(first,both),false,'new sidebar work must be sampled');
 assert.equal(sameFrameOwners(both,first),false,'role retirement invalidates the sample');
 assert.equal(sameFrameOwners(first,mountedFrameOwners([make('workspace')],origin)),false);
 for(const frames of [[],[sidebar],[workspace,make('workspace')],[workspace,sidebar,make('sidebar')],[make('workspace',true)],[workspace,make('sidebar',true)]])assert.equal(mountedFrameOwners(frames,origin),null);
});
test('actual frame timer, queue and in-flight save remain non-idle without mutating any work',async t=>{
 const f=fixture('workspace',createFreeFrameClient);t.after(()=>{f.client.stop();delete globalThis.__vaiwlFixtureFramePendingWork;});await f.client.start();await drain();
 const read=()=>globalThis.__vaiwlFixtureFramePendingWork();assert(framePendingWorkIsIdle(read(),'workspace'));
 let resolve,pending=new Promise(r=>resolve=r);const send=f.runtime.sendMessage;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(f.calls.push(m),pending):send(m);
 // First layout and explicit choices now write immediately. The read-only
 // probe must still report that actual in-flight work, then the pure-scroll
 // coalescing window after its acknowledged baseline.
 f.nav.onViewChange({...layout,scroll:0});const firstCalls=f.calls.length;
 for(let i=0;i<10;i++){const state=read();assert.equal(state.resumeTimer,false);assert.equal(state.resumeWriting,true);assert.equal(framePendingWorkIsIdle(state,'workspace'),false);}
 assert.equal(f.calls.length,firstCalls);resolve({ok:true});await drain();assert(framePendingWorkIsIdle(read(),'workspace'));
 pending=new Promise(r=>resolve=r);
 f.nav.onViewChange(layout);const calls=f.calls.length;
 for(let i=0;i<10;i++){const state=read();assert(state.resumeTimer&&state.resumeQueued);assert.equal(state.resumeWriting,false);assert.equal(framePendingWorkIsIdle(state,'workspace'),false);}
 assert.equal(f.calls.length,calls);await f.advance(99);assert.equal(f.calls.length,calls);
 await f.advance(1);assert.equal(f.calls.length,calls+1);assert.equal(read().resumeTimer,false);assert.equal(read().resumeWriting,true);assert.equal(framePendingWorkIsIdle(read(),'workspace'),false);
 resolve({ok:true});await drain();assert(framePendingWorkIsIdle(read(),'workspace'));
 f.client.stop();assert.equal(framePendingWorkIsIdle(read(),'workspace'),false,'cleared/stopped is not a ready frame');
});
test('missing, wrong-role, extra-field and any pending flag cannot prove readiness',()=>{
 const state={role:'workspace',closed:false,bootstrapping:false,read:false,dirty:false,refreshAllowed:true,resumeTimer:false,resumeQueued:false,resumeWriting:false,dispatch:false,calibration:false,horizon:false,snippetLocate:false,panel:false,readTerminal:false};
 assert(framePendingWorkIsIdle(state,'workspace'));
 assert(framePendingWorkIsIdle({...state,dirty:true,refreshAllowed:false},'workspace'));
 for(const refreshAllowed of [null,undefined,0,'false'])assert.equal(framePendingWorkIsIdle({...state,refreshAllowed},'workspace'),false);
 for(const value of [null,{},Object.create(state),{...state,role:'sidebar'},{...state,extra:false},...Object.keys(state).filter(k=>!['role','refreshAllowed'].includes(k)).map(k=>({...state,[k]:true}))])assert.equal(framePendingWorkIsIdle(value,'workspace'),false);
 assert.throws(()=>instrumentFramePendingWork(''),/anchor/);
});
for(const role of ['workspace','sidebar'])test(role+': hidden dirty hint is deferred, but reopening starts real non-idle work',async t=>{
 const f=fixture(role,createFreeFrameClient);t.after(()=>{f.client.stop();delete globalThis.__vaiwlFixtureFramePendingWork;});await f.client.start();await drain();
 f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:1,visible:false});
 const before=f.views;f.emit({type:'VAIWL_UI_DATA_CHANGED'});await drain();
 const state=globalThis.__vaiwlFixtureFramePendingWork();assert.equal(state.dirty,true);assert.equal(state.read,false);assert.equal(f.views,before);
 assert.equal(framePendingWorkIsIdle(state,role),true,'a deferred hidden hint must not block the existing worker CHECK');
 let resolve;f.setView(()=>new Promise(r=>resolve=r));f.emit({type:'VAIWL_UI_SURFACE_STATE',revision:2,visible:true});await drain();
 assert.equal(f.views,before+1);assert.equal(framePendingWorkIsIdle(globalThis.__vaiwlFixtureFramePendingWork(),role),false);
 resolve({ok:true,state:'ready',page:f.page(),navigation:[]});await drain();assert(framePendingWorkIsIdle(globalThis.__vaiwlFixtureFramePendingWork(),role));
});
