import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../host/navigation-frame-calibration-entry.test.mjs',import.meta.url),text=await readFile(url,'utf8'),boundary="test('segment calibration waits";
assert.equal(text.split(boundary).length,2);
const source=(text.slice(0,text.indexOf(boundary))+'\nexport {fixture,projection,page,row,tick};').replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'");
const {fixture,projection,page,row,tick}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function setup(t,role='workspace',extra={}){const f=fixture(role,()=>null,null,null,{},extra);t.after(()=>f.nav.stop());f.nav.updateFrameProjection(projection(role));return f;}
const visibleText=node=>[node.textContent,...node.children.map(visibleText)].join('').trim();
for(const label of ['已保存片段','备份与导入','本地数据恢复','关闭设置'])test('workspace settings '+label+' has actual text, not only accessible name',t=>{
 const f=setup(t,'workspace',{onSnippetsRequest(){},onBackupRequest(){},onRecoveryRequest(){}});f.button('工作空间设置').click();const action=f.button(label);assert(action);assert.equal(visibleText(action),label);
});
test('sidebar saved snippets entry has actual text and one callback; stopped entry cannot dispatch',t=>{
 let calls=0;const f=setup(t,'sidebar',{onSnippetsRequest:()=>calls++}),action=f.button('已保存片段');assert(action);assert.equal(visibleText(action),'已保存片段');action.click();assert.equal(calls,1);f.nav.stop();action.click();assert.equal(calls,1);
});
for(const [label,callback] of [['已保存片段','onSnippetsRequest'],['备份与导入','onBackupRequest'],['本地数据恢复','onRecoveryRequest']])test('settings '+label+' dispatches once and stale scope/closed controls are inert',t=>{
 let calls=0;const f=setup(t,'workspace',{[callback]:()=>calls++});f.button('工作空间设置').click();const original=f.button(label);original.click();assert.equal(calls,1);f.button('关闭设置').click();original.click();assert.equal(calls,1);
 f.button('工作空间设置').click();const prior=f.button(label);const next=projection();next.scope='scopeB';f.nav.updateFrameProjection(next);prior.click();assert.equal(calls,1);assert.equal(f.button(label),undefined);
});
function searchDTO(){const value=projection(),ref=row('current_chat');ref.snippetMatches=[{id:'selected_snippet',preview:'Saved text'}];value.current={refId:ref.id,projectId:null,nativeUrl:ref.nativeUrl};value.search={...page([ref],1,0,24),query:'Saved',projectId:null};return value;}
test('search snippet locate displays text and dispatches exact selected ID with pending and stop guards',async t=>{
 let release;const calls=[],f=setup(t,'workspace',{onSnippetLocateRequest:v=>{calls.push(v);return new Promise(resolve=>{release=resolve;});}});f.nav.updateFrameProjection({...searchDTO(),scope:'searchScope'});const action=f.button('定位片段');assert(action);assert.equal(visibleText(action),'定位片段');action.click();action.click();assert.deepEqual(calls,[{id:'selected_snippet'}]);assert.equal(action.disabled,true);f.nav.stop();release({ok:true});await tick();action.click();assert.equal(calls.length,1);
});
