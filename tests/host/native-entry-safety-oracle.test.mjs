import test from 'node:test';import assert from 'node:assert/strict';
import {assertExamplesExcluded,assertCancelUnchanged,assertNativeScope,exampleTargets,restoreNativeEntrySurfaces,nativeEntryWorkspaceReady} from './native-entry-safety-oracle.mjs';
import {runInNewContext} from 'node:vm';
test('workspace readiness requires a painted flow owner; return is only a preparation signal',()=>{
 const node=({popover=false,width=600,height=500,display='block',visibility='visible',frame=true}={})=>({hasAttribute:()=>popover,getBoundingClientRect:()=>({width,height}),style:{display,visibility},querySelector:()=>frame?{}:null});
 const ready=(workspace,buttons=[],allowReturn=false)=>runInNewContext(`(${nativeEntryWorkspaceReady.toString()})(allowReturn)`,{allowReturn,document:{querySelector:()=>workspace,querySelectorAll:()=>buttons},getComputedStyle:n=>n.style});
 assert.equal(ready(node()),true);
 for(const patch of [{popover:true},{width:0},{height:0},{display:'none'},{visibility:'hidden'},{frame:false}])assert.equal(ready(node(patch)),false);
 assert.equal(ready(null,[node()],true),true);assert.equal(ready(null,[node()],false),false);
 assert.equal(ready(null,[node({height:0})],true),false);
});
const facts=()=>({revision:1,projects:{p:{}},refs:{c:{nativeTitle:'before'}}});
const valid=()=>({before:facts(),after:{...facts(),revision:2,refs:{c:{nativeTitle:'observed'}}},witnessId:'c',witnessTitle:'observed'});
test('negative inventory oracle requires real forward observation and all six excluded examples',()=>{assert.equal(exampleTargets.length,6);assertExamplesExcluded(valid());for(const row of exampleTargets){const v=valid();v.after[row.entity==='project'?'projects':'refs'][row.id]={};assert.throws(()=>assertExamplesExcluded(v));}for(const mode of ['no-progress','stale-native']){const v=valid();if(mode==='no-progress')v.after.revision=1;else v.after.refs.c.nativeTitle='before';assert.throws(()=>assertExamplesExcluded(v));}});
test('cancel oracle rejects either native creation or phantom local card',()=>{const v={before:{projectCount:2,actions:{}},after:{projectCount:2,actions:{'new-project':1}},beforeIds:['p'],afterIds:['p']};assertCancelUnchanged(v);for(const patch of [{projectCount:3},{actions:{'create-project':1}}])assert.throws(()=>assertCancelUnchanged({...v,after:{...v.after,...patch}}));assert.throws(()=>assertCancelUnchanged({...v,afterIds:['p','fake']}));});
test('native scope oracle distinguishes project creation from global composer navigation',()=>{const v={projectId:'p',projectRequest:{kind:'new-project-chat',projectId:'p'},globalRequest:{kind:'new-chat',path:'/'},projectPath:'/c/55555555-5555-4555-8555-000000000001',globalPath:'/',createdBefore:1,createdAfter:1};assertNativeScope(v);for(const patch of [{projectRequest:{kind:'new-project-chat',projectId:'other'}},{globalPath:'/g/p/project'},{createdAfter:2}])assert.throws(()=>assertNativeScope({...v,...patch}));});

test('runner native helper releases both independent masks before continuing',async()=>{
 for(const initiallyOpen of [['返回原生阅读','显示原生列表'],['显示原生列表'],[]]){
  const open=new Set(initiallyOpen),clicked=[];let checked=false;
  await restoreNativeEntrySurfaces({getByRole(role,{name,exact}){assert.equal(role,'button');assert.equal(exact,true);return {isVisible:async()=>open.has(name),click:async()=>{assert(open.delete(name));clicked.push(name);}};},waitForFunction:async()=>{assert.equal(open.size,0);checked=true;}});
  assert.deepEqual(clicked,initiallyOpen);assert(checked);
 }
 const {readFile}=await import('node:fs/promises'),runner=await readFile(new URL('./native-entry-safety-package-browser.mjs',import.meta.url),'utf8');
 assert(runner.includes('async function native(p=page){await restoreNativeEntrySurfaces(p);}'));
 assert(runner.includes("await nativeProjectLink.waitFor({state:'visible'});await nativeProjectLink.click()"));
 assert(runner.includes("'fixtures/native.css'"));
});
