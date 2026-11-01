import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('./navigation-frame-calibration-entry.test.mjs',import.meta.url);
const text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function dto(scope='scopeA'){
 const value=projection(),ref=row('current_chat');value.scope=scope;
 ref.snippetMatches=[{id:'snippet_first',preview:'First saved excerpt'},{id:'snippet_second',preview:'Second saved excerpt'}];
 value.current={refId:ref.id,projectId:null,nativeUrl:ref.nativeUrl};value.search={...page([ref],1,0,24),query:'saved',projectId:null};return value;
}
const locate=(f,id)=>f.pane().querySelectorAll('[data-snippet-id]').find(n=>n.getAttribute('data-snippet-id')===id)?.querySelector('button');
function setup(t){const calls=[],f=fixture('workspace',()=>null,null,null,{}, {onSnippetLocateRequest:async v=>{calls.push(v);return {ok:true};}});t.after(()=>f.nav.stop());f.nav.updateFrameProjection(dto());return {f,calls};}
test('search repaint preserves selected snippet and next activation requests that exact snippet',async t=>{
 const {f,calls}=setup(t),second=locate(f,'snippet_second');assert(second);second.focus();f.nav.updateFrameProjection(dto());
 // Activate the actual restored focus, not a freshly selected correct button.
 assert(f.pane().activeElement);f.pane().activeElement.click();await tick();assert.deepEqual(calls,[{id:'snippet_second'}]);assert.equal(f.pane().activeElement,locate(f,'snippet_second'));
});
test('same snippet IDs in another scope do not inherit old selection; new scope selection survives repaint',async t=>{
 const {f,calls}=setup(t),oldPane=f.pane(),oldTarget=locate(f,'snippet_second');oldTarget.focus();f.nav.updateFrameProjection(dto('scopeB'));
 assert.notEqual(f.pane(),oldPane);assert(!f.pane().querySelectorAll('button').includes(oldTarget));assert.notEqual(f.pane().activeElement,locate(f,'snippet_second'));assert.equal(calls.length,0);
 locate(f,'snippet_second').focus();f.nav.updateFrameProjection(dto('scopeB'));f.pane().activeElement.click();await tick();assert.deepEqual(calls,[{id:'snippet_second'}]);
});
