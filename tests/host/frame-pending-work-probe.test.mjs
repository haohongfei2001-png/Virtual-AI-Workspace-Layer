import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './free-frame-client.test.mjs';
import {instrumentFramePendingWork,framePendingWorkIsIdle} from './frame-pending-work-probe.mjs';
const base=new URL('../../src/host/free-frame-client.mjs',import.meta.url),raw=await readFile(base,'utf8');
const source=instrumentFramePendingWork(raw).replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${new URL(path,base).href}'`);
const {createFreeFrameClient}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const drain=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const layout={segment:0,oldOpen:[],sidebarOpen:[],capacities:[],scroll:312,sidebarScroll:22,sidebarVisible:true};
test('actual frame timer, queue and in-flight save remain non-idle without mutating any work',async t=>{
 const f=fixture('workspace',createFreeFrameClient);t.after(()=>{f.client.stop();delete globalThis.__vaiwlFixtureFramePendingWork;});await f.client.start();await drain();
 const read=()=>globalThis.__vaiwlFixtureFramePendingWork();assert(framePendingWorkIsIdle(read(),'workspace'));
 let resolve;const pending=new Promise(r=>resolve=r),send=f.runtime.sendMessage;
 f.runtime.sendMessage=m=>m.type==='HOST_UI_SAVE_VIEW'?(f.calls.push(m),pending):send(m);
 f.nav.onViewChange(layout);const calls=f.calls.length;
 for(let i=0;i<10;i++){const state=read();assert(state.resumeTimer&&state.resumeQueued);assert.equal(state.resumeWriting,false);assert.equal(framePendingWorkIsIdle(state,'workspace'),false);}
 assert.equal(f.calls.length,calls);await f.advance(99);assert.equal(f.calls.length,calls);
 await f.advance(1);assert.equal(f.calls.length,calls+1);assert.equal(read().resumeTimer,false);assert.equal(read().resumeWriting,true);assert.equal(framePendingWorkIsIdle(read(),'workspace'),false);
 resolve({ok:true});await drain();assert(framePendingWorkIsIdle(read(),'workspace'));
 f.client.stop();assert.equal(framePendingWorkIsIdle(read(),'workspace'),false,'cleared/stopped is not a ready frame');
});
test('missing, wrong-role, extra-field and any pending flag cannot prove readiness',()=>{
 const state={role:'workspace',closed:false,bootstrapping:false,read:false,dirty:false,resumeTimer:false,resumeQueued:false,resumeWriting:false,dispatch:false,calibration:false,horizon:false,snippetLocate:false,panel:false,readTerminal:false};
 assert(framePendingWorkIsIdle(state,'workspace'));
 for(const value of [null,{},Object.create(state),{...state,role:'sidebar'},{...state,extra:false},...Object.keys(state).filter(k=>k!=='role').map(k=>({...state,[k]:true}))])assert.equal(framePendingWorkIsIdle(value,'workspace'),false);
 assert.throws(()=>instrumentFramePendingWork(''),/anchor/);
});
