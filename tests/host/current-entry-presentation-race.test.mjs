import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('./host-view-service.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('MOCK_IDB actual host binding";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,ready};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,ready}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
for(const closes of [true,false])test('delayed current-entry confirmation '+(closes?'cannot reopen a user-closed workspace':'accepts an already-open workspace without presenting it'),async t=>{
 const reached=deferred(),release=deferred(),modes=[];let open=true,showCalls=0;
 // Transport boundary double faithfully separates the existing mutating mode
 // from the proposed read-only mode. Binding/repository/view owner are real.
 const h=await fixture(t,{presentSurface:async({mode})=>{modes.push(mode);reached.resolve();await release.promise;if(mode==='workspace'){showCalls++;open=true;return {ok:true};}if(mode==='workspace-current')return {ok:open};return {ok:false};}});
 await h.bind();await h.observe();await h.mount();const view=await ready(h);assert.equal(view.state,'ready');
 const pending=h.enterCurrent('workspace',{expectedRevision:view.page.workspaceRevision,viewSession:view.page.viewSession});await reached.promise;
 if(closes)open=false;release.resolve();const response=await pending;
 assert.equal(showCalls,0,'current-entry must never issue an asynchronous show');assert.deepEqual(modes,['workspace-current']);assert.equal(open,!closes);assert.equal(response.ok,!closes);
});
test('explicit user show-workspace presentation still sends the mutating workspace command',async t=>{
 const modes=[];const h=await fixture(t,{presentSurface:async({mode})=>{modes.push(mode);return {ok:true};}});await h.bind();await h.observe();await h.mount();await ready(h);
 assert.equal((await h.present('workspace',{kind:'show-workspace'})).ok,true);assert.deepEqual(modes,['workspace']);
});
